const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, finite(value, min)));

export function rmsForDb(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) return 0;
  return clamp(Math.pow(10, n / 20));
}

export function dbForRms(rms) {
  const n = clamp(rms);
  return n > 0 ? Math.max(-96, 20 * Math.log10(n)) : -96;
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function eventEnvelope(event, t, releaseMs) {
  if (!event) return 0;
  if (t < event.startMs) return 0;
  const length = Math.max(1, event.endMs - event.startMs);
  if (t <= event.endMs) {
    const attack = Math.min(45, Math.max(8, length * 0.15));
    return clamp((t - event.startMs) / Math.max(1, attack));
  }
  if (t <= event.endMs + releaseMs) {
    return clamp(1 - ((t - event.endMs) / Math.max(1, releaseMs)));
  }
  return 0;
}

function normalizedSpectrum(values) {
  if (!Array.isArray(values) && !(values instanceof Float32Array)) return null;
  const spectrum = Array.from(values, (value) => Math.max(0, finite(value, 0)));
  const total = spectrum.reduce((sum, value) => sum + value, 0);
  if (spectrum.length < 3 || total <= 1e-8) return null;
  return spectrum.map((value) => value / total);
}

// Coarse spectral shape is stable across the short acoustic delay between a
// laptop speaker and its built-in microphone. Comparing shape instead of raw
// amplitude lets us recognise residual game echo after browser AEC without
// assuming that speaker volume and microphone gain share a scale.
export function spectrumSimilarity(a, b) {
  const left = normalizedSpectrum(a);
  const right = normalizedSpectrum(b);
  if (!left || !right || left.length !== right.length) return 0;
  let distance = 0;
  for (let index = 0; index < left.length; index++) distance += Math.abs(left[index] - right[index]);
  return clamp(1 - distance * .5);
}

export function normalizeSelfAudioEvent(input = {}, atMs = nowMs()) {
  const event = input && typeof input === 'object' ? input : {};
  const sourceKind = String(event.source?.kind || 'environment');
  const sourceId = String(event.source?.id || 'unknown');
  const provenanceSystem = String(event.provenance?.system || '');

  // The real microphone cannot be its own cancellation reference.
  if (sourceId === 'room-mic' || provenanceSystem === 'room-mic') return null;
  if (event.semantics?.audibleInWorld === false) return null;

  const emittedAt = Number.isFinite(Number(event.emittedAt)) ? Number(event.emittedAt) : atMs;
  const durationMs = Math.max(40, finite(event.acoustic?.durationMs, 300));
  const levelDb = finite(event.acoustic?.levelDb, -38);
  const rms = Math.max(0.004, rmsForDb(levelDb));

  return {
    id: String(event.id || `self-audio:${Math.round(emittedAt)}`),
    kind: String(event.kind || 'game-output'),
    source: { kind: sourceKind, id: sourceId },
    startMs: emittedAt,
    endMs: emittedAt + durationMs,
    rms,
    canSpoilTake: !!event.semantics?.canSpoilTake,
    playerGenerated: !!event.semantics?.playerGenerated,
  };
}

export function effectiveMicMeasurement(raw = {}, mask = {}) {
  const rawRms = clamp(raw.rms);
  const rawPeak = Math.max(rawRms, clamp(raw.peak));
  const eventRms = clamp(mask.eventRms ?? mask.rms);
  const programMaskRms = clamp(mask.programMaskRms);
  const similarity = spectrumSimilarity(raw.spectrum, mask.programSpectrum);
  const programCorrelated = !!mask.programActive
    && similarity >= Math.max(.5, finite(mask.similarityThreshold, .72));
  const maskRms = clamp(Math.hypot(eventRms, programCorrelated ? programMaskRms : 0));
  const maskGain = Math.max(0, finite(mask.maskGain, 1.35));

  let effectiveRms = Math.max(0, rawRms - maskRms * maskGain);
  const overMask = maskRms > 0 && rawRms > maskRms * 2.1;
  if (overMask) effectiveRms = Math.max(effectiveRms, rawRms - maskRms * 0.45);

  // A strongly matching spectrum is the actual final game mix returning
  // through the room mic. Suppress that residual independent of speaker or mic
  // gain; simultaneous speech changes the coarse spectrum and falls back to
  // the conservative event-envelope subtraction above.
  if (programCorrelated) {
    const confidence = clamp((similarity - .72) / .24);
    effectiveRms = Math.min(effectiveRms, rawRms * (1 - (.90 + confidence * .075)));
  }

  const effectivePeak = programCorrelated
    ? Math.max(effectiveRms, rawPeak * (1 - (.78 + clamp((similarity - .72) / .28) * .16)))
    : Math.max(effectiveRms, rawPeak - maskRms * maskGain * 0.8);

  return {
    raw: {
      rms: rawRms,
      peak: rawPeak,
      clipped: !!raw.clipped || rawPeak >= 0.985,
      spectrum: Array.isArray(raw.spectrum) || ArrayBuffer.isView(raw.spectrum) ? [...raw.spectrum] : null,
    },
    mask: {
      active: !!mask.active,
      rms: maskRms,
      peak: Math.max(maskRms, clamp(mask.peak)),
      db: Number.isFinite(Number(mask.db)) ? Number(mask.db) : dbForRms(maskRms),
      count: Math.max(0, Math.floor(finite(mask.count, 0))),
      latencyMs: Math.max(0, finite(mask.latencyMs, 0)),
      eventRms,
      programRms: clamp(mask.programRms),
      programMaskRms,
      programActive: !!mask.programActive,
      programCorrelation: similarity,
      programCorrelated,
    },
    effective: {
      rms: clamp(effectiveRms),
      peak: clamp(effectivePeak),
      clipped: !!raw.clipped && !mask.active,
    },
    gameEchoLikely: programCorrelated || (!!mask.active && rawRms <= Math.max(0.012, maskRms * 2.1)),
    playerNoiseLikely: !programCorrelated && effectiveRms > Math.max(0.012, eventRms * 2.1),
  };
}

export function createSelfAudioMask({
  latencyMs = 65,
  maskGain = 1.35,
  releaseMs = 160,
  maxEvents = 48,
  programLeakGain = .55,
  similarityThreshold = .72,
} = {}) {
  let events = [];
  let lastProgram = null;
  let lastProgramAtMs = -Infinity;
  const config = {
    latencyMs: Math.max(0, finite(latencyMs, 65)),
    maskGain: Math.max(0, finite(maskGain, 1.35)),
    releaseMs: Math.max(0, finite(releaseMs, 160)),
    maxEvents: Math.max(1, Math.floor(finite(maxEvents, 48))),
    programLeakGain: Math.max(0, finite(programLeakGain, .55)),
    similarityThreshold: clamp(similarityThreshold, .5, .95),
  };

  function observe(event, atMs = nowMs()) {
    const normalized = normalizeSelfAudioEvent(event, atMs);
    if (!normalized) return false;
    events.push(normalized);
    if (events.length > config.maxEvents) events = events.slice(-config.maxEvents);
    return true;
  }

  function sample(atMs = nowMs(), { program = null } = {}) {
    const sampleAt = finite(atMs, nowMs());
    if (program && typeof program === 'object') {
      lastProgram = program;
      lastProgramAtMs = sampleAt;
    }
    const programFrame = sampleAt - lastProgramAtMs <= 180 ? lastProgram : null;
    const t = finite(atMs, nowMs()) - config.latencyMs;
    events = events.filter((event) => event.endMs + config.releaseMs > t);

    let sum = 0;
    let peak = 0;
    let count = 0;
    for (const event of events) {
      const amp = eventEnvelope(event, t, config.releaseMs);
      if (amp <= 0) continue;
      const rms = event.rms * amp;
      sum += rms * rms;
      peak = Math.max(peak, rms);
      count++;
    }

    const eventRms = clamp(Math.sqrt(sum));
    const programRms = clamp(programFrame?.rms);
    const programActive = !!programFrame?.active && programRms > .0005;
    const programMaskRms = programActive ? clamp(programRms * config.programLeakGain) : 0;
    const rms = clamp(Math.hypot(eventRms, programMaskRms));
    return {
      active: count > 0 || programActive,
      count,
      rms,
      peak: Math.max(peak, programActive ? clamp(programFrame.peak) * config.programLeakGain : 0),
      db: dbForRms(rms),
      latencyMs: config.latencyMs,
      maskGain: config.maskGain,
      eventRms,
      programRms,
      programMaskRms,
      programActive,
      programSpectrum: programActive ? programFrame.spectrum || null : null,
      similarityThreshold: config.similarityThreshold,
    };
  }

  function effective(raw, atMs = nowMs()) {
    return effectiveMicMeasurement(raw, sample(atMs));
  }

  function clear() { events = []; lastProgram = null; lastProgramAtMs = -Infinity; }

  function inspect(atMs = nowMs()) {
    return { events: events.length, sample: sample(atMs), config: { ...config } };
  }

  return { observe, sample, effective, clear, inspect };
}
