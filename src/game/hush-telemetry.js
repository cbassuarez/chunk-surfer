// Acoustic-contact telemetry for the HUSH.
//
// The map never receives AI intent. It receives sampled acoustic evidence and
// an exact position only after that evidence produces a lock. A weak return is
// a region/bearing; an old return is visibly stale.

const DEFAULTS = Object.freeze({
  sampleMinMs: 350,
  sampleMaxMs: 700,
  acquireMinMs: 120,
  acquireMaxMs: 300,
  liveHoldMs: 760,
  decayMs: 2400,
  historyMs: 5000,
  detectThreshold: 0.20,
  lockThreshold: 0.48,
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const clonePoint = (point) => point ? { x: Number(point.x), y: Number(point.y) } : null;

function blankContact(label = 'SOURCE / NO RECORD') {
  return {
    id: 'contact:hush',
    kind: 'acoustic-anomaly',
    identity: 'unregistered',
    label,
    state: 'none',
    observation: null,
    previousObservation: null,
    presentation: { revealedIdentity: false, disturbance: 0 },
  };
}

function cloneContact(contact) {
  return {
    ...contact,
    observation: contact.observation ? {
      ...contact.observation,
      position: clonePoint(contact.observation.position),
      bearing: contact.observation.bearing ? { ...contact.observation.bearing } : null,
      region: Array.isArray(contact.observation.region)
        ? contact.observation.region.map(clonePoint)
        : null,
    } : null,
    previousObservation: contact.previousObservation ? { ...contact.previousObservation } : null,
    presentation: { ...(contact.presentation || {}) },
  };
}

function observation({ now, hush, precision, confidence, holdMs, region = null, bearing = null }) {
  return {
    observedAt: now,
    expiresAt: now + holdMs,
    floorId: hush.floorId || null,
    roomId: hush.roomId || null,
    position: precision === 'point' ? clonePoint(hush.position) : null,
    precision,
    confidence: clamp01(confidence),
    region: Array.isArray(region) ? region.map(clonePoint) : null,
    bearing: bearing ? { ...bearing } : null,
  };
}

export function measureAcousticEvidence({ hush, player, recorder, policy = {}, thresholds = {} } = {}) {
  if (!hush?.active || !hush.position || !player?.position) {
    return { detectable: false, lockable: false, confidence: 0 };
  }

  const distance = Math.hypot(hush.position.x - player.position.x, hush.position.y - player.position.y);
  const radius = Math.max(1, Number(hush.detectionRadius) || 84);
  const transmission = typeof hush.transmission === 'number'
    ? clamp01(hush.transmission)
    : clamp01(1 - distance / radius);
  const monitorGain = recorder?.monitorOpen ? 1 : recorder?.available === false ? 0.42 : 0.62;
  const energy = clamp01(Number(hush.emittedEnergy) || 0.22);
  const confidence = clamp01((energy * 0.62 + transmission * 0.58) * monitorGain + Number(policy.contactResolveBias || 0));

  const detectThreshold = Number.isFinite(Number(thresholds.detectThreshold))
    ? Number(thresholds.detectThreshold)
    : DEFAULTS.detectThreshold;
  const lockThreshold = Number.isFinite(Number(thresholds.lockThreshold))
    ? Number(thresholds.lockThreshold)
    : DEFAULTS.lockThreshold;

  if (hush.forceLock || confidence >= lockThreshold) {
    return { detectable: true, lockable: true, confidence, distance };
  }

  if (confidence >= detectThreshold) {
    const dx = hush.position.x - player.position.x;
    const dy = hush.position.y - player.position.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const spread = Math.max(2, (1 - confidence) * 10);
    return {
      detectable: true,
      lockable: false,
      confidence,
      distance,
      bearing: { x: dx / magnitude, y: dy / magnitude },
      region: [
        { x: hush.position.x - spread, y: hush.position.y - spread * 0.45 },
        { x: hush.position.x + spread * 0.7, y: hush.position.y - spread },
        { x: hush.position.x + spread, y: hush.position.y + spread * 0.55 },
        { x: hush.position.x - spread * 0.6, y: hush.position.y + spread },
      ],
    };
  }

  return { detectable: false, lockable: false, confidence, distance };
}

export function createHushTelemetry({
  clock = () => performance.now(),
  random = Math.random,
  config = {},
  label = 'SOURCE / NO RECORD',
} = {}) {
  const cfg = { ...DEFAULTS, ...config };
  let state = blankContact(label);
  let nextSampleAt = 0;
  let candidate = null;
  let forced = null;
  const consumedBeats = new Set();

  const randomBetween = (lo, hi) => lo + (hi - lo) * clamp01(random());

  function schedule(now) {
    nextSampleAt = now + randomBetween(cfg.sampleMinMs, cfg.sampleMaxMs);
  }

  function advanceLifecycle(now, holdScale = 1) {
    if (!state.observation) return;
    const liveUntil = state.observation.expiresAt;
    if ((state.state === 'locked' || state.state === 'unresolved' || state.state === 'acquiring') && now > liveUntil) {
      state = {
        ...state,
        state: 'decaying',
        previousObservation: state.observation,
        observation: {
          ...state.observation,
          expiresAt: liveUntil + cfg.decayMs * holdScale,
        },
        presentation: { ...state.presentation, disturbance: Math.max(0.18, state.presentation.disturbance * 0.7) },
      };
    }
    if (state.state === 'decaying' && now > state.observation.expiresAt) {
      const age = now - state.observation.observedAt;
      if (age > cfg.historyMs * holdScale) state = blankContact(label);
    }
  }

  function lock(now, hush, confidence, policy) {
    const hold = cfg.liveHoldMs * Math.max(0.45, Number(policy.contactHoldScale) || 1);
    const previousObservation = state.observation;
    state = {
      ...blankContact(label),
      state: 'locked',
      observation: observation({ now, hush, precision: 'point', confidence, holdMs: hold }),
      previousObservation,
      presentation: {
        revealedIdentity: !!policy.revealedIdentity,
        disturbance: 0.42 + confidence * 0.42,
      },
    };
    candidate = null;
  }

  function unresolved(now, hush, evidence, policy) {
    const hold = cfg.liveHoldMs * 0.72 * Math.max(0.45, Number(policy.contactHoldScale) || 1);
    state = {
      ...blankContact(label),
      state: 'unresolved',
      observation: observation({
        now, hush, precision: evidence.region ? 'region' : 'bearing',
        confidence: evidence.confidence, holdMs: hold,
        region: evidence.region, bearing: evidence.bearing,
      }),
      previousObservation: state.observation,
      presentation: { revealedIdentity: !!policy.revealedIdentity, disturbance: 0.24 + evidence.confidence * 0.32 },
    };
    candidate = null;
  }

  function acquiring(now, hush, evidence, policy) {
    const acquireMs = randomBetween(cfg.acquireMinMs, cfg.acquireMaxMs);
    const sameCandidate = candidate
      && candidate.floorId === hush.floorId
      && Math.hypot(candidate.position.x - hush.position.x, candidate.position.y - hush.position.y) < 3;

    if (sameCandidate && now - candidate.startedAt >= candidate.acquireMs) {
      lock(now, hush, evidence.confidence, policy);
      return;
    }

    candidate = {
      floorId: hush.floorId,
      roomId: hush.roomId,
      position: clonePoint(hush.position),
      startedAt: sameCandidate ? candidate.startedAt : now,
      acquireMs: sameCandidate ? candidate.acquireMs : acquireMs,
    };

    state = {
      ...blankContact(label),
      state: 'acquiring',
      observation: observation({
        now, hush, precision: 'region', confidence: evidence.confidence,
        holdMs: Math.max(acquireMs, cfg.sampleMaxMs + 50),
        region: evidence.region || [
          { x: hush.position.x - 2, y: hush.position.y - 1 },
          { x: hush.position.x + 2, y: hush.position.y + 1 },
        ],
      }),
      previousObservation: state.observation,
      presentation: { revealedIdentity: !!policy.revealedIdentity, disturbance: 0.30 },
    };
  }

  function sample({ hush, player, recorder, story = {}, policy = {} } = {}) {
    const now = clock();
    const holdScale = Math.max(0.45, Number(policy.contactHoldScale) || 1);
    advanceLifecycle(now, holdScale);

    if (forced && now <= forced.until) {
      if (forced.kind === 'saturated') {
        state = {
          ...blankContact(label),
          state: 'saturated',
          observation: {
            observedAt: now, expiresAt: forced.until, floorId: forced.floorId || null,
            roomId: forced.roomId || null, position: null, precision: 'region', confidence: 1,
            region: forced.contacts.map((entry) => clonePoint(entry.position || entry)), bearing: null,
          },
          presentation: { revealedIdentity: !!policy.revealedIdentity, disturbance: 1 },
        };
      } else {
        lock(now, { ...hush, ...forced, position: forced.position }, 1, policy);
        state.observation.expiresAt = forced.until;
      }
      return cloneContact(state);
    }
    if (forced && now > forced.until) forced = null;

    if (!story.contactDisplayEnabled || !hush?.active) {
      candidate = null;
      advanceLifecycle(now, holdScale);
      return cloneContact(state);
    }

    if (now < nextSampleAt) return cloneContact(state);
    schedule(now);

    const evidence = measureAcousticEvidence({ hush, player, recorder, policy, thresholds: cfg });
    if (evidence.lockable) {
      const previous = state.observation?.position;
      const maintainsLock = state.state === 'locked' && previous
        && state.observation.floorId === hush.floorId
        && Math.hypot(previous.x - hush.position.x, previous.y - hush.position.y) < 3;
      if (maintainsLock) lock(now, hush, evidence.confidence, policy);
      else acquiring(now, hush, evidence, policy);
    }
    else if (evidence.detectable) unresolved(now, hush, evidence, policy);
    else {
      candidate = null;
      if (state.observation && state.state !== 'decaying') {
        state = {
          ...state,
          state: 'decaying',
          previousObservation: state.observation,
          observation: { ...state.observation, expiresAt: now + cfg.decayMs * holdScale },
          presentation: { ...state.presentation, disturbance: state.presentation.disturbance * 0.65 },
        };
      }
    }

    return cloneContact(state);
  }

  function forceLock({ beatId, floorId, roomId = null, position, duration = 1600 } = {}) {
    if (!beatId || consumedBeats.has(beatId) || !position) return false;
    consumedBeats.add(beatId);
    const now = clock();
    forced = { kind: 'locked', floorId, roomId, position: clonePoint(position), until: now + Math.max(100, duration) };
    nextSampleAt = now;
    return true;
  }

  function saturate({ beatId, floorId = null, roomId = null, contacts = [], duration = 2400 } = {}) {
    if (!beatId || consumedBeats.has(beatId) || !contacts.length) return false;
    consumedBeats.add(beatId);
    const now = clock();
    forced = { kind: 'saturated', floorId, roomId, contacts, until: now + Math.max(100, duration) };
    nextSampleAt = now;
    return true;
  }

  return {
    sample,
    snapshot: () => cloneContact(state),
    forceLock,
    saturate,
    clear() { state = blankContact(label); candidate = null; forced = null; },
    reset() { state = blankContact(label); candidate = null; forced = null; nextSampleAt = 0; consumedBeats.clear(); },
    debugState() { return { state: cloneContact(state), nextSampleAt, candidate: candidate ? { ...candidate } : null, forced }; },
  };
}
