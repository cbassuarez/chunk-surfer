// Authored pressure envelope for the Source long hall / paper search / haystack.
//
// This module is deliberately pure. It owns no renderer, scenes, save state, or
// clocks; callers provide elapsed time and receive bounded presentation values.
// The SEARCH SPAN begins before the tunnel gives way to the haystack and carries
// straight across that phase boundary. Effects may fluctuate, but the underlying
// pressure never receives a phase-entry reset.

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
const clamp01 = (value) => clamp(value, 0, 1);
const lerp = (a, b, t) => a + (b - a) * clamp01(t);
const smoothstep = (lo, hi, value) => {
  const t = clamp01((Number(value) - lo) / Math.max(0.0001, hi - lo));
  return t * t * (3 - 2 * t);
};

function hash32(value) {
  let x = Number(value) | 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function hash01(seed, index, salt = 0) {
  const value = (Number(seed) | 0) ^ Math.imul((Number(index) | 0) + 1, 1597334677) ^ (Number(salt) | 0);
  return hash32(value) / 4294967295;
}

export const SOURCE_SEARCH_START_METRES = 84;
export const SOURCE_HALL_END_METRES = 112;

export const SOURCE_BRACKET = Object.freeze({
  rearStartsMetres: 84,
  frontStartsMetres: 90,
  rearGapStartMetres: 11.5,
  rearGapEndMetres: 8.0,
  frontGapStartMetres: 26,
  frontGapEndMetres: 4.5,
  searchDepthMetres: 14,
});

export const SOURCE_HAYSTACK = Object.freeze({
  // The terminal hall tops out around .62. HAYSTACK must begin ABOVE it.
  entryPressure: 0.64,
  maxPressure: 0.985,
  riseSeconds: 48,
  movement: Object.freeze({ entry: 2.20, max: 2.48 }),
  fear: Object.freeze({
    // Hall stage 4 was ~.27 every ~560ms. Crossing into the search may never
    // lower either the hit or its cadence.
    entryAmount: 0.30,
    maxAmount: 0.46,
    entryStinger: 0.24,
    maxStinger: 0.50,
    entryIntervalMs: 560,
    minIntervalMs: 360,
  }),
  mosh: Object.freeze({
    startsAt: 6,
    period: 5.8,
    maxDuration: 0.46,
  }),
});

// One floor for the entire walk. Phase names do not participate: reaching the
// physical end is a navigation event, not permission for the nervous system to
// relax. The hall contributes by distance; SEARCH contributes by time spent in
// the final stretch and then continues through the haystack.
export function sourceStandingPressure({
  hallMaxDistance = 0,
  searchElapsed = 0,
} = {}) {
  const distance = Math.max(0, Number(hallMaxDistance) || 0);
  const depth = clamp01(distance / SOURCE_HALL_END_METRES);
  const hallFloor = 0.62 * smoothstep(0, 1, depth);
  const searchFloor = distance >= SOURCE_SEARCH_START_METRES
    ? lerp(0.56, SOURCE_HAYSTACK.maxPressure, smoothstep(0, 58, Math.max(0, Number(searchElapsed) || 0)))
    : 0;
  return clamp(Math.max(hallFloor, searchFloor), 0, SOURCE_HAYSTACK.maxPressure);
}

export function applySourceFearFloor(ordinaryFear = 0, sourceFloor = 0) {
  return clamp01(Math.max(Number(ordinaryFear) || 0, Number(sourceFloor) || 0));
}

// Pure bracketing geometry. The rear manifestation is tied to the player's
// current position so it keeps pace in either direction. The front manifestation
// is tied to maximum hall progress, so retreat never makes it recede again. Both
// are presentation positions; collision/contact authority lives elsewhere.
export function sourceBracketFrame({
  hallMaxDistance = 0,
  player = { x: 0, y: 0 },
  cellMetres = 0.5,
  enabled = true,
} = {}) {
  const metres = Math.max(0, Number(hallMaxDistance) || 0);
  const cell = Math.max(0.001, Number(cellMetres) || 0.5);
  const boundaryY = -(SOURCE_HALL_END_METRES / cell);
  const active = !!enabled && metres >= SOURCE_BRACKET.rearStartsMetres;
  const rearProgress = smoothstep(
    SOURCE_BRACKET.rearStartsMetres,
    SOURCE_HALL_END_METRES,
    metres,
  );
  const frontProgress = smoothstep(
    SOURCE_BRACKET.frontStartsMetres,
    SOURCE_HALL_END_METRES,
    metres,
  );
  const rearGapMetres = lerp(
    SOURCE_BRACKET.rearGapStartMetres,
    SOURCE_BRACKET.rearGapEndMetres,
    rearProgress,
  );
  const frontGapMetres = lerp(
    SOURCE_BRACKET.frontGapStartMetres,
    SOURCE_BRACKET.frontGapEndMetres,
    frontProgress,
  );
  const px = Number(player?.x) || 0;
  const py = Number(player?.y) || 0;
  return Object.freeze({
    active,
    progress: rearProgress,
    boundary: Object.freeze({ x: 0, y: boundaryY, metres: SOURCE_HALL_END_METRES }),
    rear: Object.freeze({
      visible: active,
      x: clamp(px, -2, 2),
      y: py + rearGapMetres / cell,
      gapMetres: rearGapMetres,
      strength: lerp(0.72, 0.96, rearProgress),
    }),
    front: Object.freeze({
      visible: active && metres >= SOURCE_BRACKET.frontStartsMetres,
      x: 0,
      y: boundaryY - frontGapMetres / cell,
      gapBeyondBoundaryMetres: frontGapMetres,
      strength: lerp(0.58, 0.96, frontProgress),
    }),
  });
}

export function haystackPressureFloor({ elapsed = 0, noProgressSeconds = 0 } = {}) {
  const timeRise = smoothstep(0, SOURCE_HAYSTACK.riseSeconds, Math.max(0, elapsed));
  const stalled = smoothstep(7, 28, Math.max(0, noProgressSeconds));
  return clamp(
    SOURCE_HAYSTACK.entryPressure + timeRise * 0.27 + stalled * 0.05,
    SOURCE_HAYSTACK.entryPressure,
    SOURCE_HAYSTACK.maxPressure,
  );
}

export function haystackPressure({ elapsed = 0, noProgressSeconds = 0, wrongReadImpulse = 0 } = {}) {
  const floor = haystackPressureFloor({ elapsed, noProgressSeconds });
  return clamp(
    floor + clamp01(wrongReadImpulse) * 0.08,
    SOURCE_HAYSTACK.entryPressure,
    SOURCE_HAYSTACK.maxPressure,
  );
}

export function haystackMovementMultiplier(pressure = SOURCE_HAYSTACK.entryPressure) {
  const t = clamp01(
    (Number(pressure) - SOURCE_HAYSTACK.entryPressure)
      / (SOURCE_HAYSTACK.maxPressure - SOURCE_HAYSTACK.entryPressure),
  );
  return lerp(SOURCE_HAYSTACK.movement.entry, SOURCE_HAYSTACK.movement.max, t);
}

export function haystackFearFrame(pressure = SOURCE_HAYSTACK.entryPressure) {
  const t = clamp01((Number(pressure) - SOURCE_HAYSTACK.entryPressure)
    / (SOURCE_HAYSTACK.maxPressure - SOURCE_HAYSTACK.entryPressure));
  return Object.freeze({
    amount: lerp(SOURCE_HAYSTACK.fear.entryAmount, SOURCE_HAYSTACK.fear.maxAmount, t),
    stinger: lerp(SOURCE_HAYSTACK.fear.entryStinger, SOURCE_HAYSTACK.fear.maxStinger, t),
    intervalMs: Math.round(lerp(SOURCE_HAYSTACK.fear.entryIntervalMs, SOURCE_HAYSTACK.fear.minIntervalMs, t)),
  });
}

function pulseInCycle(time, {
  seed,
  channel,
  period,
  minStart,
  maxStart,
  minDuration,
  maxDuration,
} = {}) {
  const t = Math.max(0, Number(time) || 0);
  const p = Math.max(0.1, Number(period) || 1);
  const cycle = Math.floor(t / p);
  const local = t - cycle * p;
  const start = lerp(minStart, maxStart, hash01(seed, cycle, channel));
  const duration = lerp(minDuration, maxDuration, hash01(seed, cycle, channel + 1));
  if (local < start || local > start + duration) return 0;
  const u = (local - start) / Math.max(0.001, duration);
  const attack = smoothstep(0, 0.22, u);
  const release = 1 - smoothstep(0.55, 1, u);
  return clamp01(attack * release);
}

export function hallRainFrame({ elapsed = 0, distanceMetres = 0, seed = 4417 } = {}) {
  const depth = clamp01((Number(distanceMetres) || 0) / 112);
  const eligible = smoothstep(0.22, 0.48, depth);
  const front = pulseInCycle(elapsed, {
    seed, channel: 100, period: 17,
    minStart: 1, maxStart: 5,
    minDuration: 4.2, maxDuration: 8,
  });
  const squall = pulseInCycle(elapsed, {
    seed, channel: 200, period: 11.5,
    minStart: 2, maxStart: 6,
    minDuration: 1.5, maxDuration: 3.6,
  });
  return clamp01(eligible * (
    front * lerp(0.20, 0.58, depth)
      + squall * lerp(0.12, 0.36, depth)
  ));
}

export function haystackRainFrame({ elapsed = 0, pressure = SOURCE_HAYSTACK.entryPressure, seed = 4417 } = {}) {
  const front = pulseInCycle(elapsed, {
    seed, channel: 300, period: 13,
    minStart: 0.4, maxStart: 3.2,
    minDuration: 3, maxDuration: 6,
  });
  const squall = pulseInCycle(elapsed, {
    seed, channel: 400, period: 8.7,
    minStart: 1, maxStart: 4.2,
    minDuration: 1, maxDuration: 2.5,
  });
  const gain = lerp(0.62, 1, smoothstep(SOURCE_HAYSTACK.entryPressure, SOURCE_HAYSTACK.maxPressure, pressure));
  return clamp01((front * 0.72 + squall * 0.60) * gain);
}

export function haystackMoshFrame({
  elapsed = 0,
  seed = 4417,
  pressure = SOURCE_HAYSTACK.entryPressure,
  wrongReadImpulse = 0,
  reducedMotion = false,
} = {}) {
  const time = Math.max(0, Number(elapsed) || 0);
  if (reducedMotion || time < SOURCE_HAYSTACK.mosh.startsAt) {
    return Object.freeze({ active: false, amount: 0, cycle: -1 });
  }

  const t = time - SOURCE_HAYSTACK.mosh.startsAt;
  const cycle = Math.floor(t / SOURCE_HAYSTACK.mosh.period);
  const local = t - cycle * SOURCE_HAYSTACK.mosh.period;
  const jitter = hash01(seed, cycle, 0x41) * 1.55;
  const duration = Math.min(
    SOURCE_HAYSTACK.mosh.maxDuration,
    0.14 + hash01(seed, cycle, 0x71) * 0.30,
  );
  const start = 0.35 + jitter;
  let attack = 0;

  if (local >= start && local <= start + duration) {
    const u = (local - start) / Math.max(0.001, duration);
    attack = u < 0.22
      ? smoothstep(0, 0.22, u)
      : 1 - smoothstep(0.22, 1, u);
  }

  const pressureGain = smoothstep(SOURCE_HAYSTACK.entryPressure, SOURCE_HAYSTACK.maxPressure, pressure);
  const readAttack = clamp01(wrongReadImpulse) * 0.35;
  const amount = clamp01(attack * lerp(0.10, 0.46, pressureGain) + readAttack);
  return Object.freeze({ active: amount > 0.015, amount, cycle });
}

export function haystackPageGuidance({
  noProgressSeconds = 0,
  hints = 'full',
  flash = 'full',
  time = 0,
} = {}) {
  const mode = ['off', 'reduced', 'full'].includes(String(hints)) ? String(hints) : 'full';
  const stalled = clamp01((Math.max(0, Number(noProgressSeconds) || 0) - 5) / 14);

  // Same authored orange used by the van's waypoint material in main.js.
  // Even with objective hints off the real sheet keeps a low, steady material
  // identity; hint modes add the actual waypoint pulse rather than deciding
  // whether the solution is visually distinguishable at all.
  const intrinsic = 0.24;
  const base = mode === 'off' ? intrinsic : mode === 'reduced' ? 0.38 : 0.42;
  const gain = base + stalled * (mode === 'off' ? 0.05 : mode === 'reduced' ? 0.18 : 0.26);
  const pulse = mode === 'full' && flash !== 'off'
    ? 0.82 + 0.18 * (0.5 + 0.5 * Math.sin((Number(time) || 0) * 2.05))
    : 1;

  return Object.freeze({
    visible: true,
    strength: clamp(gain * pulse, intrinsic, 0.74),
    stalled,
    color: Object.freeze([1.0, 0.52, 0.12]),
  });
}

export function sourceFocusActionLabel(focus) {
  if (!focus) return null;
  if (focus.kind === 'haystack-page') return 'TAKE THE STILL PAGE';
  if (focus.kind === 'normal-exit') return 'LEAVE SOURCE SPACE';
  if (focus.kind === 'boss-fault') return focus.available === false ? 'RETURN PATH EXPOSED / NO INTERFACE' : 'CONNECT THE RIG';
  // Without this the prompt fell through to main.js's raw fallback and printed
  // the internal id: INSPECT HORIZON-BUST.
  if (focus.kind === 'horizon-bust') return 'LISTEN TO THE BUST';
  return null;
}
