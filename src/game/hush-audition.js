// What the HUSH believes it heard. Interest, certainty, agitation and
// playfulness deliberately remain independent so it can know where the player
// is and still choose to toy with them rather than immediately attack.

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function freshHushAudition(policy = {}) {
  return {
    schema: 1,
    interest: 0,
    certainty: 0,
    agitation: 0,
    playfulness: clamp01(policy.baselinePlayfulness ?? .48),
    lastHeard: null,
    hypotheses: [],
    noiseMemory: [],
    pressure: { recentEnergy: 0, repeatedNoise: 0, impulsiveNoise: 0 },
  };
}

export function noiseSalience({ event, propagation, policy }) {
  const threshold = finite(policy?.hearingThresholdDb, -38);
  const above = Math.max(0, propagation.effectiveLevelDb - threshold);
  const loudness = clamp01(above / 24);
  const duration = clamp01(Math.log2(1 + event.acoustic.durationMs / 120) / 4);
  const spectral = clamp01((event.acoustic.spectrum.mid * .55) + (event.acoustic.spectrum.low * .25) + (event.acoustic.spectrum.high * .20));
  return clamp01(.16 + loudness * .58 + duration * .14 + spectral * .12);
}

function updateHypotheses(existing, heard, now) {
  const out = (existing || [])
    .map((entry) => ({ ...entry, confidence: clamp01(entry.confidence * .94) }))
    .filter((entry) => entry.confidence > .05 && now - entry.updatedAt < 22000);
  const match = out.find((entry) => entry.roomId && entry.roomId === heard.roomId);
  if (match) {
    const weight = Math.max(.1, heard.confidence);
    match.position = {
      x: match.position.x * (1 - weight) + heard.position.x * weight,
      y: match.position.y * (1 - weight) + heard.position.y * weight,
    };
    match.confidence = clamp01(match.confidence + heard.confidence * .45);
    match.updatedAt = now;
  } else {
    out.push({ roomId: heard.roomId, floorId: heard.floorId, position: { ...heard.position }, confidence: heard.confidence, updatedAt: now });
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

function appendNoiseMemory(memory, event, propagation, now) {
  const next = [...(memory || [])];
  next.push({
    eventId: event.id,
    kind: event.kind,
    sampleId: event.provenance?.sampleId || null,
    family: event.semantics.family,
    heardAt: now,
    roomId: event.spatial.roomId,
    floorId: event.spatial.floorId,
    position: { ...event.spatial.position },
    effectiveLevelDb: propagation.effectiveLevelDb,
    mimic: {
      allowed: !!event.semantics.canBeMimicked,
      transformations: event.semantics.canBeMimicked ? ['delay', 'pitch-down', 'band-limit'] : [],
    },
  });
  return next.filter((entry) => now - entry.heardAt < 45000).slice(-18);
}

export function ingestHeardNoise(state, { event, propagation, now, policy }) {
  const salience = noiseSalience({ event, propagation, policy });
  const confidence = clamp01(1 - propagation.uncertainty);
  const impulsive = clamp01(event.acoustic.impulsiveness);
  const repeated = state.lastHeard?.roomId === event.spatial.roomId && now - state.lastHeard.at < 5000;
  const next = structuredClone(state);

  next.interest = clamp01(next.interest + salience * finite(policy.interestGain, 1) * (repeated ? 1.10 : 1));
  next.certainty = clamp01(next.certainty + confidence * salience * finite(policy.certaintyGain, 1));
  next.agitation = clamp01(next.agitation + impulsive * salience * finite(policy.agitationGain, 1) * .72);
  // Repeated quiet actions invite play; violent impulses suppress it.
  next.playfulness = clamp01(next.playfulness + (repeated ? .07 : .02) - impulsive * salience * .10);
  next.pressure.recentEnergy = clamp01(next.pressure.recentEnergy + salience * .8);
  next.pressure.repeatedNoise = clamp01(next.pressure.repeatedNoise + (repeated ? .18 : .03));
  next.pressure.impulsiveNoise = clamp01(next.pressure.impulsiveNoise + impulsive * .25);
  next.lastHeard = {
    eventId: event.id,
    at: now,
    roomId: event.spatial.roomId,
    floorId: event.spatial.floorId,
    position: { ...event.spatial.position },
    confidence,
    effectiveLevelDb: propagation.effectiveLevelDb,
    bearing: propagation.bearing,
  };
  next.noiseMemory = appendNoiseMemory(next.noiseMemory, event, propagation, now);
  next.hypotheses = updateHypotheses(next.hypotheses, next.lastHeard, now);
  return next;
}

function halfLifeDecay(value, halfLife, dt) {
  if (value <= 0) return 0;
  return value * Math.pow(.5, Math.max(0, dt) / Math.max(.001, halfLife));
}

export function tickHushAudition(state, dt, policy) {
  const baseline = clamp01(policy?.baselinePlayfulness ?? .48);
  const recovery = Math.max(0, finite(policy?.playfulnessRecovery, .08));
  return {
    ...state,
    interest: halfLifeDecay(state.interest, policy?.interestHalfLife ?? 18, dt),
    certainty: halfLifeDecay(state.certainty, policy?.certaintyHalfLife ?? 12, dt),
    agitation: halfLifeDecay(state.agitation, policy?.agitationHalfLife ?? 16, dt),
    playfulness: clamp01(state.playfulness + (baseline - state.playfulness) * Math.min(1, dt * recovery)),
    pressure: {
      recentEnergy: halfLifeDecay(state.pressure.recentEnergy, 4.5, dt),
      repeatedNoise: halfLifeDecay(state.pressure.repeatedNoise, 7, dt),
      impulsiveNoise: halfLifeDecay(state.pressure.impulsiveNoise, 5, dt),
    },
    hypotheses: (state.hypotheses || [])
      .map((entry) => ({ ...entry, confidence: halfLifeDecay(entry.confidence, 12, dt) }))
      .filter((entry) => entry.confidence > .04),
  };
}

export function bestLocationHypothesis(state) {
  return (state?.hypotheses || []).slice().sort((a, b) => b.confidence - a.confidence)[0] || null;
}

export function normalizeHushAudition(value, policy = {}) {
  const base = freshHushAudition(policy);
  if (!value || typeof value !== 'object') return base;
  return {
    ...base,
    interest: clamp01(value.interest),
    certainty: clamp01(value.certainty),
    agitation: clamp01(value.agitation),
    playfulness: clamp01(value.playfulness ?? base.playfulness),
    lastHeard: value.lastHeard && typeof value.lastHeard === 'object' ? { ...value.lastHeard } : null,
    hypotheses: Array.isArray(value.hypotheses) ? value.hypotheses.filter(Boolean).slice(0, 4) : [],
    noiseMemory: Array.isArray(value.noiseMemory) ? value.noiseMemory.filter(Boolean).slice(-18) : [],
    pressure: { ...base.pressure, ...(value.pressure || {}) },
  };
}
