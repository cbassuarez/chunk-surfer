// An authored gain-control signal, not a voice generator or a pitch effect.
// The caller supplies the real vocal audio and decides whether this controls
// one explicitly labelled ensemble projection or independent recorded parts.
// Nothing here asserts a recording's provenance or turns a mix into stems.

export const CHAPEL_CHOIR_CONTROL_HZ = 12000;
export const CHAPEL_CHOIR_EDGE_SECONDS = .001;

const freezeRamp = values => Object.freeze(values);
export const CHAPEL_CHOIR_DEFAULT_STAGES = Object.freeze([
  Object.freeze({ label: 'natural', weight: 1, rateHz: freezeRamp([2, 2]), width: freezeRamp([.65, .65]), depth: freezeRamp([0, 0]) }),
  Object.freeze({ label: 'pulse', weight: 2, rateHz: freezeRamp([2, 12]), width: freezeRamp([.65, .4]), depth: freezeRamp([0, .85]) }),
  Object.freeze({ label: 'amplification', weight: 2, rateHz: freezeRamp([12, 140]), width: freezeRamp([.4, .18]), depth: freezeRamp([.85, 1]) }),
  Object.freeze({ label: 'recovery', weight: 1, rateHz: freezeRamp([140, 140]), width: freezeRamp([.18, .18]), depth: freezeRamp([1, 0]) }),
]);

const finite = (value, name) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
};
const inRange = (value, name, lo, hi) => {
  finite(value, name);
  if (value < lo || value > hi) throw new RangeError(`${name} must be between ${lo} and ${hi}`);
  return value;
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = n => Math.max(0, Math.min(1, n));
const raisedCosine = t => t <= 0 ? 0 : t >= 1 ? 1 : .5 - .5 * Math.cos(Math.PI * t);
const fraction = n => n - Math.floor(n);
function ramp(value, name, fallback, lo, hi) {
  const pair = value === undefined ? fallback : Array.isArray(value) ? value : [value, value];
  if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError(`${name} needs a number or two endpoints`);
  return Object.freeze(pair.map(n => inRange(n, name, lo, hi)));
}
function assertScore(score) {
  if (score?.kind !== 'chapel-choir-gain-score' || !Array.isArray(score.stages) || !score.stages.length)
    throw new TypeError('A normalized chapel choir gain score is required');
  return score;
}
function assertVoice(voiceIndex, score) {
  if (!Number.isInteger(voiceIndex) || voiceIndex < 0 || voiceIndex >= score.phaseOffsets.length)
    throw new RangeError('Voice index is outside the configured control channels');
}

// Stage weights divide the caller's complete passage duration. Endpoints make
// rate/width/depth explicit and keep the score independent of any title/take.
// Rest stages are unity gain but keep integrating their authored pulse rate.
export function createChapelChoirScore({ duration, stages = CHAPEL_CHOIR_DEFAULT_STAGES,
  phaseOffsets = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6],
  edgeSeconds = CHAPEL_CHOIR_EDGE_SECONDS } = {}) {
  finite(duration, 'Passage duration');
  if (!(duration > 0)) throw new RangeError('Passage duration must be positive');
  finite(edgeSeconds, 'Gate edge');
  if (!(edgeSeconds > 0 && edgeSeconds <= .1)) throw new RangeError('Gate edge must be positive and at most .1 seconds');
  if (!Array.isArray(stages) || !stages.length || stages.length > 64) throw new RangeError('Provide one to 64 score stages');
  if (!Array.isArray(phaseOffsets) || phaseOffsets.length < 1 || phaseOffsets.length > 6)
    throw new RangeError('Provide one to six control-channel phase offsets');
  const offsets = Object.freeze(phaseOffsets.map(value => fraction(finite(value, 'Phase offset'))));
  const authored = stages.map((stage, index) => {
    if (!stage || typeof stage.label !== 'string' || !stage.label.trim()) throw new TypeError('Every stage needs a label');
    const weight = finite(stage.weight ?? 1, 'Stage weight');
    if (!(weight > 0)) throw new RangeError('Stage weights must be positive');
    return { label: stage.label, weight, rest: stage.rest === true,
      rateHz: ramp(stage.rateHz, 'Pulse rate', [2, 2], 0, 2000),
      width: ramp(stage.width, 'Pulse width', [.5, .5], 0, 1),
      depth: ramp(stage.depth, 'Pulse depth', stage.rest ? [0, 0] : [1, 1], 0, 1) };
  });
  const totalWeight = authored.reduce((n, stage) => n + stage.weight, 0);
  if (!Number.isFinite(totalWeight)) throw new RangeError('Stage weights overflow');
  let weight = 0, at = 0, cycles = 0;
  const compiled = authored.map((stage, index) => {
    weight += stage.weight;
    const end = index === authored.length - 1 ? duration : duration * (weight / totalWeight);
    const seconds = end - at;
    if (!(seconds > 0)) throw new RangeError('Stage duration must be representable');
    const depth = stage.rest ? Object.freeze([0, 0]) : stage.depth;
    const previous = authored[index - 1];
    if (previous) {
      const previousDepth = previous.rest ? 0 : previous.depth[1];
      if (Math.abs(previous.width[1] - stage.width[0]) > 1e-12 || Math.abs(previousDepth - depth[0]) > 1e-12)
        throw new RangeError('Adjacent width/depth endpoints must meet; fade into and out of rests');
    }
    const result = Object.freeze({ ...stage, depth, index, start: at, end, seconds, startCycles: cycles });
    cycles += seconds * (stage.rateHz[0] + stage.rateHz[1]) * .5;
    if (!Number.isFinite(cycles)) throw new RangeError('Integrated pulse phase overflow');
    at = end;
    return result;
  });
  return Object.freeze({ kind: 'chapel-choir-gain-score', duration, edgeSeconds,
    phaseOffsets: offsets, stages: Object.freeze(compiled), totalCycles: cycles });
}

// The right-hand stage owns an exact internal boundary; the final endpoint
// belongs to the last stage. No phase reset occurs at those boundaries.
export function segmentAt(time, score) {
  assertScore(score);
  finite(time, 'Score time');
  if (time < 0 || time > score.duration) return null;
  const stage = score.stages.find(stage => time < stage.end) || score.stages.at(-1);
  const localTime = Math.max(0, Math.min(stage.seconds, time - stage.start));
  return { index: stage.index, label: stage.label, start: stage.start, end: stage.end,
    localTime, progress: localTime / stage.seconds, rest: stage.rest };
}
export function segmentLabel(time, score) { return segmentAt(time, score)?.label ?? null; }

// Exact integral of the linearly varying rate, with an optional per-channel
// phase offset. It is never an oscillator driving vocal playbackRate/detune.
export function pulsePhaseAt(time, voiceIndex, score) {
  assertScore(score); assertVoice(voiceIndex, score); finite(time, 'Score time');
  const t = Math.max(0, Math.min(score.duration, time));
  const segment = segmentAt(t, score), stage = score.stages[segment.index], dt = segment.localTime;
  return score.phaseOffsets[voiceIndex] + stage.startCycles + stage.rateHz[0] * dt
    + (stage.rateHz[1] - stage.rateHz[0]) * dt * dt / (2 * stage.seconds);
}

// Unity outside the passage and on its boundaries makes the authored control
// safe to join/leave and loop at the exact vocal passage boundary. The 1ms
// raised-cosine edges shorten only when a pulse's on/off interval is narrower.
export function controlAt(time, voiceIndex, score) {
  assertScore(score); assertVoice(voiceIndex, score); finite(time, 'Score time');
  if (time <= 0 || time >= score.duration) return 1;
  const segment = segmentAt(time, score), stage = score.stages[segment.index], u = segment.progress;
  const width = lerp(stage.width[0], stage.width[1], u);
  const entry = raisedCosine(time / score.edgeSeconds), exit = raisedCosine((score.duration - time) / score.edgeSeconds);
  const depth = lerp(stage.depth[0], stage.depth[1], u) * entry * exit;
  if (!(depth > 0)) return 1;
  let gate;
  if (width <= 0) gate = 0;
  else if (width >= 1) gate = 1;
  else {
    const phase = fraction(pulsePhaseAt(time, voiceIndex, score));
    const rate = lerp(stage.rateHz[0], stage.rateHz[1], u);
    const edge = Math.min(Math.max(rate * score.edgeSeconds, 1e-12), width * .5, (1 - width) * .5);
    gate = phase >= width ? 0 : raisedCosine(phase / edge) * raisedCosine((width - phase) / edge);
  }
  return clamp01(1 - depth * (1 - gate));
}

// The extra endpoint sample allows interpolation all the way to unity. A full
// buffer has bufferDuration slightly above duration: set both audio/control
// sources' loopEnd to returned loopEnd, not to the padded buffer duration.
// startFrame/frameCount support deterministic blocks using absolute indices.
export function renderGainChannels(score, { voices = score?.phaseOffsets?.length,
  controlHz = CHAPEL_CHOIR_CONTROL_HZ, startFrame = 0, frameCount = null } = {}) {
  assertScore(score);
  if (!Number.isInteger(voices) || voices < 1 || voices > 6 || voices > score.phaseOffsets.length)
    throw new RangeError('Render one to six configured control channels');
  if (!Number.isInteger(controlHz) || controlHz < 1) throw new RangeError('Control sample rate must be a positive integer');
  if (!Number.isSafeInteger(startFrame) || startFrame < 0) throw new RangeError('Start frame must be a nonnegative safe integer');
  const completeLength = Math.ceil(score.duration * controlHz) + 1;
  const length = frameCount ?? Math.max(0, completeLength - startFrame);
  if (!Number.isSafeInteger(length) || length < 0 || !Number.isSafeInteger(startFrame + length))
    throw new RangeError('Frame count must be a nonnegative safe integer');
  const channels = Array.from({ length: voices }, () => new Float32Array(length).fill(1));
  // Render each absolute sample once for all channels. The scalar reference
  // API validates each query and returns stage descriptors; a long control
  // buffer must not allocate millions of those objects on the audio startup.
  let stageIndex = 0;
  for (let frame = 0; frame < length; frame++) {
    const time = (startFrame + frame) / controlHz;
    if (time <= 0 || time >= score.duration) continue;
    while (stageIndex < score.stages.length - 1 && time >= score.stages[stageIndex].end) stageIndex++;
    const stage = score.stages[stageIndex], dt = Math.max(0, Math.min(stage.seconds, time - stage.start));
    const u = dt / stage.seconds;
    const depth = lerp(stage.depth[0], stage.depth[1], u) * raisedCosine(time / score.edgeSeconds)
      * raisedCosine((score.duration - time) / score.edgeSeconds);
    if (!(depth > 0)) continue;
    const width = lerp(stage.width[0], stage.width[1], u);
    if (width >= 1) continue;
    if (width <= 0) {
      const gain = clamp01(1 - depth);
      for (let voice = 0; voice < voices; voice++) channels[voice][frame] = gain;
      continue;
    }
    const rate = lerp(stage.rateHz[0], stage.rateHz[1], u);
    const phaseBase = stage.startCycles + stage.rateHz[0] * dt
      + (stage.rateHz[1] - stage.rateHz[0]) * dt * dt / (2 * stage.seconds);
    const edge = Math.min(Math.max(rate * score.edgeSeconds, 1e-12), width * .5, (1 - width) * .5);
    for (let voice = 0; voice < voices; voice++) {
      const phase = fraction(score.phaseOffsets[voice] + phaseBase);
      const gate = phase >= width ? 0 : raisedCosine(phase / edge) * raisedCosine((width - phase) / edge);
      channels[voice][frame] = clamp01(1 - depth * (1 - gate));
    }
  }
  return { sampleRate: controlHz, length, duration: score.duration, bufferDuration: length / controlHz,
    startFrame, loopEnd: score.duration, channels };
}
