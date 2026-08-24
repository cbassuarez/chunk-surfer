import { APPARITION_POSE_IDS } from './apparition-director.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const HALLUCINATION_KINDS = Object.freeze(['peripheral', 'doorway', 'apparition-return', 'hard']);

function hashString(value) {
  let h = 2166136261 >>> 0;
  const s = String(value || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function unit(seed, serial, salt) {
  let x = hashString(`${seed}:${serial}:${salt}`) || 1;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17; x >>>= 0;
  x ^= x << 5; x >>>= 0;
  return (x >>> 0) / 0xffffffff;
}

function randomRange(seed, serial, salt, min, max) {
  return min + (max - min) * unit(seed, serial, salt);
}

function pickKind(seed, serial, eligibility) {
  const roll = unit(seed, serial, 'kind');
  if (eligibility.pressure > 0.62 && roll < 0.42) return 'hard';
  if (roll < 0.28) return 'peripheral';
  if (roll < 0.58) return 'doorway';
  if (roll < 0.80) return 'apparition-return';
  return 'hard';
}

function figureCountFor(kind) {
  if (kind === 'peripheral') return 1;
  if (kind === 'doorway') return 2;
  return 3;
}

function visualFor(seed, serial, kind) {
  const figureCount = figureCountFor(kind);
  const poseIds = [...APPARITION_POSE_IDS]
    .sort((a, b) => unit(seed, serial, `pose:${a}`) - unit(seed, serial, `pose:${b}`))
    .slice(0, figureCount);
  return {
    figureCount,
    poseIds,
    yawOffsets: poseIds.map((_, index) => randomRange(seed, serial, `yaw:${index}`, -.72, .72)),
    scaleX: poseIds.map((_, index) => randomRange(seed, serial, `scale-x:${index}`, .72, 1.04)),
    scaleY: poseIds.map((_, index) => randomRange(seed, serial, `scale-y:${index}`, .96, 1.18)),
    // The cluster is wrong because each ordinary pose belongs to a different
    // arrangement, not because any body becomes a monster or giant.
    depthOffsets: poseIds.map((_, index) => randomRange(seed, serial, `depth:${index}`, -.18, .22)),
  };
}

function copyActive(active) {
  return active ? {
    ...active,
    visual: active.visual ? {
      ...active.visual,
      poseIds: [...active.visual.poseIds],
      yawOffsets: [...active.visual.yawOffsets],
      scaleX: [...active.visual.scaleX],
      scaleY: [...active.visual.scaleY],
      depthOffsets: [...active.visual.depthOffsets],
    } : null,
  } : null;
}

function startActive(state, kind, now, intensity) {
  const serial = state.serial++;
  const selectedKind = HALLUCINATION_KINDS.includes(kind) ? kind : 'hard';
  const durationMs = randomRange(state.seed, serial, 'duration', 1900, 3400);
  const cooldownMs = randomRange(state.seed, serial, 'cooldown', 4800, 9000);
  state.active = {
    id: `recording-false-hush:${serial}`,
    kind: selectedKind,
    startedAtMs: now,
    expiresAtMs: now + durationMs,
    intensity: Math.max(0.25, Math.min(1, Number(intensity) || .75)),
    hard: selectedKind === 'hard' || Number(intensity) > 0.68,
    mapReturn: selectedKind === 'apparition-return',
    visual: visualFor(state.seed, serial, selectedKind),
    serial,
  };
  state.cooldownUntilMs = now + cooldownMs;
  return copyActive(state.active);
}

function makeState(seed) {
  return {
    seed: String(seed || 'recording-hallucinations:v1'),
    serial: 0,
    active: null,
    cooldownUntilMs: 0,
  };
}

export function recordingHallucinationEligibility({
  recording = false,
  stalled = false,
  tutorial = false,
  reduceDread = false,
  effectsMode = 'full',
  lightOn = false,
  darkness = 1,
  takeProgress = 0,
  hushPressure = 0,
  effectiveMicRms = 0,
  spoilThreshold = 0.06,
} = {}) {
  if (!recording || stalled || tutorial) return { eligible: false, reason: 'inactive' };
  if (reduceDread || effectsMode === 'off') return { eligible: false, reason: 'reduced' };

  const dark = !lightOn || Number(darkness) >= 0.45;
  if (!dark) return { eligible: false, reason: 'lit' };

  // QUIET MEANS "THE TAKE IS CLEAN", NOT "THE ROOM IS SILENT".
  //
  // This was `max(0.012, spoil * 0.75)`, and 0.012 sits UNDER the noise floor of
  // an ordinary room — mic.js measures a quiet room at about 0.005 but anything
  // with a fridge or a road outside runs well past that. So on a machine with a
  // real microphone the gate read `noisy` forever and no hallucination ever
  // fired; with the mic off, main.js passes 0 and they fired fine. Working only
  // for players who declined the microphone is exactly backwards.
  //
  // The condition the beat actually wants is the one the game already teaches:
  // he is holding a take and not spoiling it. That is the spoil threshold, and
  // nothing stricter — a take can be clean and still not be silence.
  const quiet = Number(effectiveMicRms) < Number(spoilThreshold);
  if (!quiet) return { eligible: false, reason: 'noisy' };

  const progress = clamp01(takeProgress);
  const pressure = clamp01(hushPressure);
  if (progress < 0.08) return { eligible: false, reason: 'too-early' };

  const intensity = Math.max(progress * 0.55, pressure * 0.90, progress > 0.33 ? 0.35 : 0);
  if (intensity < 0.25) return { eligible: false, reason: 'low-intensity' };

  return { eligible: true, intensity, progress, pressure };
}

export function tickRecordingHallucination(state, input = {}) {
  const now = Math.max(0, Number(input.nowMs) || 0);

  if (state.active && now >= state.active.expiresAtMs) state.active = null;

  const eligibility = recordingHallucinationEligibility(input);
  if (!eligibility.eligible) {
    state.active = null;
    return { active: null, started: false, eligibility };
  }
  if (state.active) return { active: state.active, started: false, eligibility };
  if (now < state.cooldownUntilMs) return { active: null, started: false, eligibility };

  const serial = state.serial;
  const kind = pickKind(state.seed, serial, eligibility);
  return { active: startActive(state, kind, now, eligibility.intensity), started: true, eligibility };
}

export function createRecordingHallucinationDirector({ seed = 'recording-hallucinations:v1' } = {}) {
  let state = makeState(seed);
  return {
    reset(nextSeed = seed) { state = makeState(nextSeed); },
    clear() { state.active = null; state.cooldownUntilMs = 0; },
    force(kind = 'hard', { nowMs = 0, intensity = .8 } = {}) {
      return startActive(state, kind, Math.max(0, Number(nowMs) || 0), intensity);
    },
    tick(input = {}) {
      const result = tickRecordingHallucination(state, input);
      return { ...result, active: copyActive(result.active) };
    },
    inspect() {
      return {
        active: copyActive(state.active),
        serial: state.serial,
        cooldownUntilMs: state.cooldownUntilMs,
      };
    },
  };
}
