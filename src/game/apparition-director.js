// Runtime-only stage direction for the emergency-light apparitions.
//
// IMPORTANT BOUNDARY: this module never receives player/world coordinates. It
// can change continuity (orientation, stillness, presence) and presentation,
// but it cannot pursue, approach, or otherwise reason about the player.

const FIGURE_COUNT = 3;
const FULL_FIRST_EVENT_MIN = 8;
const FULL_FIRST_EVENT_MAX = 13;
const FULL_QUIET_MIN = 8;
const FULL_QUIET_MAX = 15;
const HARD_FIRST_MIN = 14;
const HARD_FIRST_MAX = 22;
const HARD_QUIET_MIN = 20;
const HARD_QUIET_MAX = 34;
const REDUCED_FIRST_MIN = 18;
const REDUCED_FIRST_MAX = 30;
const REDUCED_QUIET_MIN = 16;
const REDUCED_QUIET_MAX = 30;
const REDUCED_REBASE_GAP_SEC = 4;
const REDUCED_REORIENT_SEC = 2.4;
const REDUCED_STILL_RAMP_SEC = 1.8;
const REDUCED_STILL_HOLD_MIN = 5;
const REDUCED_STILL_HOLD_MAX = 8;

export const APPARITION_POSE_IDS = Object.freeze([
  'neutral',
  'side',
  'stoop',
  'head_turn',
  'arm_out',
  'weight_shift',
  'symmetric',
]);

const QUIET_POSE_IDS = Object.freeze(['neutral', 'side', 'stoop', 'weight_shift']);
const ACCENT_POSE_IDS = Object.freeze(['head_turn', 'arm_out', 'symmetric']);

const FULL_CARD_WEIGHTS = Object.freeze([
  ['reorientation', .30],
  ['stillness', .25],
  ['absence', .15],
  ['substitution', .18],
  ['peripheral', .07],
  ['delayed_reveal', .05],
]);

const REDUCED_CARD_WEIGHTS = Object.freeze([
  ['reorientation', .60],
  ['stillness', .40],
]);

const YAW_TARGETS = Object.freeze(
  [-80, -55, -35, -20, 0, 20, 35, 55, 80].map((degrees) => degrees * Math.PI / 180),
);

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function hash32(text) {
  let hash = 2166136261;
  for (const char of String(text ?? 'apparitions')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(seed, ...parts) {
  return hash32([seed, ...parts].join(':')) / 4294967296;
}

function integer(seed, parts, low, high) {
  const lo = Math.ceil(Number(low) || 0);
  const hi = Math.max(lo, Math.floor(Number(high) || lo));
  return lo + Math.floor(unit(seed, ...parts) * (hi - lo + 1));
}

function range(seed, parts, low, high) {
  const lo = Number(low) || 0;
  const hi = Math.max(lo, Number(high) || lo);
  return lo + unit(seed, ...parts) * (hi - lo);
}

function weightedPick(entries, roll, excluded = null) {
  const allowed = entries.filter(([name]) => name !== excluded);
  const pool = allowed.length ? allowed : entries;
  const total = pool.reduce((sum, [, weight]) => sum + Math.max(0, Number(weight) || 0), 0) || 1;
  let cursor = clamp01(roll) * total;
  for (const [name, weight] of pool) {
    cursor -= Math.max(0, Number(weight) || 0);
    if (cursor <= 0) return name;
  }
  return pool[pool.length - 1][0];
}

function normalizeIndex(value, fallback) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < FIGURE_COUNT ? index : fallback;
}

function serialKey(state, family, serial, suffix) {
  return [state.key, family, serial, suffix];
}

function initialPoseIds(seed, key) {
  const chosen = [];
  for (let index = 0; index < FIGURE_COUNT; index++) {
    // One conspicuous initial pose is possible, never likely. Most first
    // sightings should be ordinary people before continuity makes them wrong.
    const accented = index === FIGURE_COUNT - 1
      && unit(seed, key, 'initial-pose', 'accent') < .16;
    const preferred = accented ? ACCENT_POSE_IDS : QUIET_POSE_IDS;
    const candidates = preferred.filter((poseId) => !chosen.includes(poseId));
    const pool = candidates.length
      ? candidates
      : APPARITION_POSE_IDS.filter((poseId) => !chosen.includes(poseId));
    const at = Math.floor(unit(seed, key, 'initial-pose', index) * pool.length);
    chosen.push(pool[Math.min(pool.length - 1, at)] || 'neutral');
  }
  return chosen;
}

function stateView(state) {
  return {
    key: state.key,
    mode: state.mode,
    exposure: state.exposure,
    lastPulse: state.lastPulse,
    needsRebase: state.needsRebase,
    poseIds: [...state.poseIds],
    yawOffsets: [...state.yawOffsets],
    clockOffsets: [...state.clockOffsets],
    active: state.active ? { ...state.active } : null,
    lastCard: state.lastCard,
    eventSerial: state.eventSerial,
    nextEventExposure: state.nextEventExposure,
    hardSerial: state.hardSerial,
    nextHardExposure: state.nextHardExposure,
    hardPulse: state.hardPulse,
    hardRevealIndex: state.hardRevealIndex,
    reducedNextEventAt: state.reducedNextEventAt,
  };
}

function makeState(key, poseIds) {
  return {
    key,
    mode: null,
    exposure: 0,
    lastPulse: null,
    lastTimeSec: null,
    needsRebase: true,
    poseIds: [...poseIds],
    yawOffsets: [0, 0, 0],
    clockOffsets: [0, 0, 0],
    active: null,
    lastCard: null,
    eventSerial: 0,
    nextEventExposure: null,
    hardSerial: 0,
    nextHardExposure: null,
    hardPulse: null,
    hardRevealIndex: null,
    reducedSerial: 0,
    reducedNextEventAt: null,
    lastRebased: false,
    lastForced: false,
  };
}

function reducedStillClock(event, timeSec) {
  const ramp = event.rampSec;
  const hold = event.holdSec;
  const dt = Math.max(0, timeSec - event.startedAtSec);

  if (dt <= ramp) {
    return event.startClock
      + dt
      - (dt ** 3) / (ramp ** 2)
      + (dt ** 4) / (2 * ramp ** 3);
  }

  const frozen = event.startClock + ramp / 2;
  if (dt <= ramp + hold) return frozen;

  const up = Math.min(ramp, dt - ramp - hold);
  return frozen
    + (up ** 3) / (ramp ** 2)
    - (up ** 4) / (2 * ramp ** 3);
}

export function createApparitionDirector({ seed = 'apparitions:v1' } = {}) {
  let currentSeed = String(seed || 'apparitions:v1');
  const stages = new Map();
  let pendingForced = null;

  const randomInt = (state, family, serial, suffix, low, high) =>
    integer(currentSeed, serialKey(state, family, serial, suffix), low, high);

  const randomRange = (state, family, serial, suffix, low, high) =>
    range(currentSeed, serialKey(state, family, serial, suffix), low, high);

  const randomUnit = (state, family, serial, suffix) =>
    unit(currentSeed, ...serialKey(state, family, serial, suffix));

  function getState(stageKey) {
    const key = String(stageKey || 'unknown');
    let state = stages.get(key);
    if (!state) {
      state = makeState(key, initialPoseIds(currentSeed, key));
      stages.set(key, state);
    }
    return state;
  }

  function clearTransients(state, { reschedule = true } = {}) {
    state.active = null;
    state.hardPulse = null;
    state.hardRevealIndex = null;
    state.lastForced = false;
    if (reschedule) {
      state.nextEventExposure = null;
      state.nextHardExposure = null;
      state.reducedNextEventAt = null;
    }
  }

  function ensureFullSchedules(state) {
    if (state.nextEventExposure == null) {
      const first = state.eventSerial === 0;
      state.nextEventExposure = state.exposure + randomInt(
        state,
        'event',
        state.eventSerial,
        first ? 'first-gap' : 'quiet-gap',
        first ? FULL_FIRST_EVENT_MIN : FULL_QUIET_MIN,
        first ? FULL_FIRST_EVENT_MAX : FULL_QUIET_MAX,
      );
    }
    if (state.nextHardExposure == null) {
      const first = state.hardSerial === 0;
      state.nextHardExposure = state.exposure + randomInt(
        state,
        'hard',
        state.hardSerial,
        first ? 'first-gap' : 'quiet-gap',
        first ? HARD_FIRST_MIN : HARD_QUIET_MIN,
        first ? HARD_FIRST_MAX : HARD_QUIET_MAX,
      );
    }
  }

  function scheduleNextFullEvent(state) {
    state.nextEventExposure = state.exposure + randomInt(
      state,
      'event',
      state.eventSerial,
      'quiet-gap',
      FULL_QUIET_MIN,
      FULL_QUIET_MAX,
    );
  }

  function scheduleReduced(state, timeSec, { first = false } = {}) {
    state.reducedNextEventAt = timeSec + randomRange(
      state,
      'reduced',
      state.reducedSerial,
      first ? 'first-gap' : 'quiet-gap',
      first ? REDUCED_FIRST_MIN : REDUCED_QUIET_MIN,
      first ? REDUCED_FIRST_MAX : REDUCED_QUIET_MAX,
    );
  }

  function chooseIndex(state, family, serial, suffix, forcedIndex = null) {
    return normalizeIndex(
      forcedIndex,
      randomInt(state, family, serial, `${suffix}-index`, 0, FIGURE_COUNT - 1),
    );
  }

  function chooseEdgeIndex(state, serial, forcedIndex = null) {
    if (forcedIndex === 0 || forcedIndex === FIGURE_COUNT - 1) return forcedIndex;
    return randomUnit(state, 'event', serial, 'edge-index') < .5 ? 0 : FIGURE_COUNT - 1;
  }

  function chooseYawTarget(state, serial, index) {
    const current = state.yawOffsets[index] || 0;
    const minimumDelta = 18 * Math.PI / 180;
    const candidates = YAW_TARGETS.filter((target) => Math.abs(target - current) >= minimumDelta);
    const list = candidates.length ? candidates : YAW_TARGETS;
    const at = randomInt(state, 'event', serial, `yaw-${index}`, 0, list.length - 1);
    return list[at];
  }

  function chooseSubstitutionPose(state, serial, index) {
    const current = state.poseIds[index] || 'neutral';
    const candidates = APPARITION_POSE_IDS.filter((poseId) => poseId !== current);
    const at = randomInt(state, 'event', serial, `substitution-pose-${index}`, 0, candidates.length - 1);
    return candidates[at] || 'neutral';
  }

  function consumeForcedCard(mode) {
    const forced = pendingForced;
    if (!forced?.card) return null;
    if (mode === 'reduced' && !REDUCED_CARD_WEIGHTS.some(([kind]) => kind === forced.card)) return null;
    pendingForced = null;
    return forced;
  }

  function consumeForcedHard(mode) {
    if (mode !== 'full' || pendingForced?.presentation !== 'hard') return null;
    const forced = pendingForced;
    pendingForced = null;
    return forced;
  }

  function startFullCard(state, input, forced = null) {
    const serial = state.eventSerial;
    const card = forced?.card || weightedPick(
      FULL_CARD_WEIGHTS,
      randomUnit(state, 'event', serial, 'card'),
      state.lastCard,
    );
    const index = card === 'peripheral'
      ? chooseEdgeIndex(state, serial, forced?.index)
      : chooseIndex(state, 'event', serial, card, forced?.index);
    const forcedFlag = !!forced;

    if (card === 'reorientation') {
      state.yawOffsets[index] = chooseYawTarget(state, serial, index);
      state.active = {
        kind: card,
        index,
        startedExposure: state.exposure,
        untilExposure: state.exposure,
      };
    } else if (card === 'stillness') {
      const duration = randomInt(state, 'event', serial, 'still-duration', 3, 5);
      state.active = {
        kind: card,
        index,
        freezeClock: input.wanderClock + state.clockOffsets[index],
        startedExposure: state.exposure,
        untilExposure: state.exposure + duration - 1,
      };
    } else if (card === 'absence') {
      const duration = randomInt(state, 'event', serial, 'absence-duration', 1, 2);
      state.active = {
        kind: 'absence',
        index,
        startedExposure: state.exposure,
        untilExposure: state.exposure + duration - 1,
      };
    } else if (card === 'substitution') {
      const fromPose = state.poseIds[index] || 'neutral';
      const toPose = chooseSubstitutionPose(state, serial, index);
      state.poseIds[index] = toPose;
      state.active = {
        kind: 'substitution',
        index,
        fromPose,
        toPose,
        startedExposure: state.exposure,
        untilExposure: state.exposure,
      };
    } else if (card === 'peripheral') {
      state.active = {
        kind: 'peripheral',
        index,
        startedExposure: state.exposure,
        untilExposure: state.exposure,
      };
    } else {
      const delayBeats = randomInt(state, 'event', serial, 'delayed-reveal-beats', 1, 2);
      state.active = {
        kind: 'delayed_reveal',
        index,
        poseId: state.poseIds[index] || 'neutral',
        freezeClock: input.wanderClock + state.clockOffsets[index],
        startedExposure: state.exposure,
        shadowUntilExposure: state.exposure + delayBeats - 1,
        revealExposure: state.exposure + delayBeats,
        untilExposure: state.exposure + delayBeats,
      };
    }

    state.lastCard = card;
    state.eventSerial += 1;
    state.nextEventExposure = null;
    state.lastForced = forcedFlag;
  }

  function expireFullCard(state) {
    if (!state.active) return;
    if (state.exposure <= state.active.untilExposure) return;
    state.active = null;
    scheduleNextFullEvent(state);
  }

  function startHardReveal(state, forced = null) {
    const serial = state.hardSerial;
    const index = chooseIndex(state, 'hard', serial, 'reveal', forced?.index);
    state.hardPulse = state.lastPulse;
    state.hardRevealIndex = index;
    state.hardSerial += 1;
    state.nextHardExposure = state.exposure + randomInt(
      state,
      'hard',
      state.hardSerial,
      'quiet-gap',
      HARD_QUIET_MIN,
      HARD_QUIET_MAX,
    );
    state.lastForced = !!forced;
  }

  function deferHardReveal(state) {
    state.nextHardExposure = state.exposure + randomInt(
      state,
      'hard',
      state.hardSerial,
      'defer-gap',
      2,
      4,
    );
  }

  function advanceFullBeat(state, input) {
    if (state.hardPulse !== state.lastPulse) {
      state.hardPulse = null;
      state.hardRevealIndex = null;
    }

    expireFullCard(state);
    ensureFullSchedules(state);

    const forcedCard = !state.active ? consumeForcedCard('full') : null;
    if (!state.active && (forcedCard || state.exposure >= state.nextEventExposure)) {
      startFullCard(state, input, forcedCard);
    }

    const forcedHard = consumeForcedHard('full');
    const hardDue = !!forcedHard || state.exposure >= state.nextHardExposure;
    if (hardDue) {
      if (state.active) {
        // Preserve a forced hard reveal until a later legal beat; scheduled hard
        // reveals can simply be deferred deterministically.
        if (forcedHard) pendingForced = forcedHard;
        deferHardReveal(state);
      } else {
        startHardReveal(state, forcedHard);
      }
    }
  }

  function startReducedCard(state, input, forced = null) {
    const serial = state.reducedSerial;
    const card = forced?.card || weightedPick(
      REDUCED_CARD_WEIGHTS,
      randomUnit(state, 'reduced', serial, 'card'),
      state.lastCard,
    );
    const index = chooseIndex(state, 'reduced', serial, card, forced?.index);
    const currentYaw = state.yawOffsets[index] || 0;

    if (card === 'reorientation') {
      state.active = {
        kind: card,
        index,
        fromYaw: currentYaw,
        targetYaw: chooseYawTarget(state, serial, index),
        startedAtSec: input.timeSec,
        durationSec: REDUCED_REORIENT_SEC,
      };
    } else {
      state.active = {
        kind: 'stillness',
        index,
        startedAtSec: input.timeSec,
        startBaseClock: input.wanderClock,
        startClock: input.wanderClock + state.clockOffsets[index],
        rampSec: REDUCED_STILL_RAMP_SEC,
        holdSec: randomRange(
          state,
          'reduced',
          serial,
          'still-hold',
          REDUCED_STILL_HOLD_MIN,
          REDUCED_STILL_HOLD_MAX,
        ),
      };
    }

    state.lastCard = card;
    state.reducedSerial += 1;
    state.reducedNextEventAt = null;
    state.lastForced = !!forced;
  }

  function advanceReducedActive(state, input) {
    const event = state.active;
    if (!event) return;

    if (event.kind === 'reorientation') {
      const u = clamp01((input.timeSec - event.startedAtSec) / event.durationSec);
      if (u >= 1) {
        state.yawOffsets[event.index] = event.targetYaw;
        state.active = null;
        scheduleReduced(state, input.timeSec);
      }
      return;
    }

    if (event.kind === 'stillness') {
      const totalDuration = event.rampSec * 2 + event.holdSec;
      if (input.timeSec - event.startedAtSec >= totalDuration) {
        const effectiveAtEnd = event.startClock + event.rampSec;
        const baseAtEnd = event.startBaseClock + totalDuration;
        state.clockOffsets[event.index] = effectiveAtEnd - baseAtEnd;
        state.active = null;
        scheduleReduced(state, input.timeSec);
      }
    }
  }

  function snapshot(state, input, { rebased = false } = {}) {
    const yawOffsets = [...state.yawOffsets];
    const motionClocks = [0, 1, 2].map((index) => input.wanderClock + state.clockOffsets[index]);
    const active = state.active;

    if (input.effectsMode === 'reduced' && active?.kind === 'reorientation') {
      const u = clamp01((input.timeSec - active.startedAtSec) / active.durationSec);
      const eased = u * u * (3 - 2 * u);
      yawOffsets[active.index] = active.fromYaw + (active.targetYaw - active.fromYaw) * eased;
    }

    if (active?.kind === 'stillness' || active?.kind === 'delayed_reveal') {
      motionClocks[active.index] = input.effectsMode === 'reduced'
        ? reducedStillClock(active, input.timeSec)
        : active.freezeClock;
    }

    const delayedPhase = active?.kind === 'delayed_reveal'
      ? state.exposure <= active.shadowUntilExposure ? 'shadow' : 'reveal'
      : null;
    const shadowOnlyIndices = active?.kind === 'peripheral'
      || (active?.kind === 'delayed_reveal' && delayedPhase === 'shadow')
      ? [active.index]
      : [];
    const hardRevealIndex = input.effectsMode === 'full' && state.hardPulse === input.pulseIndex
      && !shadowOnlyIndices.includes(state.hardRevealIndex)
      && active?.kind !== 'delayed_reveal'
      ? state.hardRevealIndex
      : null;

    return {
      stageKey: state.key,
      mode: input.effectsMode,
      exposure: state.exposure,
      pulseIndex: input.pulseIndex,
      card: active ? {
        kind: active.kind,
        index: active.index,
        ...(delayedPhase ? { phase: delayedPhase } : {}),
      } : null,
      hiddenIndex: active?.kind === 'absence' ? active.index : null,
      shadowOnlyIndices,
      poseIds: [...state.poseIds],
      yawOffsets,
      motionClocks,
      hardRevealIndex,
      debug: {
        lastCard: state.lastCard,
        nextEventExposure: state.nextEventExposure,
        nextHardExposure: state.nextHardExposure,
        reducedNextEventAt: state.reducedNextEventAt,
        rebased: !!rebased,
        forced: !!state.lastForced,
      },
    };
  }

  function resolveFull(state, input) {
    const pulse = Number.isFinite(input.pulseIndex) ? input.pulseIndex : 0;

    if (state.lastPulse == null) {
      state.lastPulse = pulse;
      state.exposure = Math.max(1, state.exposure || 0);
      state.needsRebase = false;
      state.lastRebased = false;
      ensureFullSchedules(state);
      return snapshot(state, input);
    }

    if (pulse === state.lastPulse) {
      state.lastRebased = false;
      return snapshot(state, input);
    }

    const delta = pulse - state.lastPulse;
    state.lastPulse = pulse;
    state.exposure += 1;

    if (state.needsRebase || delta !== 1) {
      clearTransients(state);
      state.needsRebase = false;
      state.lastRebased = true;
      ensureFullSchedules(state);
      return snapshot(state, input, { rebased: true });
    }

    state.lastRebased = false;
    state.lastForced = false;
    advanceFullBeat(state, input);
    return snapshot(state, input);
  }

  function resolveReduced(state, input) {
    const timeSec = Math.max(0, Number(input.timeSec) || 0);
    const last = state.lastTimeSec;
    const gap = last == null ? 0 : timeSec - last;
    state.lastTimeSec = timeSec;

    if (state.needsRebase || gap < 0 || gap > REDUCED_REBASE_GAP_SEC) {
      clearTransients(state);
      state.needsRebase = false;
      state.lastRebased = true;
      scheduleReduced(state, timeSec, { first: state.reducedSerial === 0 });
      return snapshot(state, input, { rebased: true });
    }

    state.lastRebased = false;
    state.lastForced = false;
    advanceReducedActive(state, input);

    if (!state.active) {
      if (state.reducedNextEventAt == null) {
        scheduleReduced(state, timeSec, { first: state.reducedSerial === 0 });
      }
      const forcedCard = consumeForcedCard('reduced');
      if (forcedCard || timeSec >= state.reducedNextEventAt) {
        startReducedCard(state, input, forcedCard);
      }
    }

    return snapshot(state, input);
  }

  function resolve(input = {}) {
    const effectsMode = ['full', 'reduced'].includes(input.effectsMode) ? input.effectsMode : 'full';
    const stageKey = String(input.stageKey || 'unknown');
    const state = getState(stageKey);
    const resolved = {
      stageKey,
      pulseIndex: Number.isFinite(Number(input.pulseIndex)) ? Number(input.pulseIndex) : 0,
      timeSec: Math.max(0, Number(input.timeSec) || 0),
      effectsMode,
      wanderClock: Math.max(0, Number(input.wanderClock) || 0),
    };

    if (state.mode !== effectsMode) {
      clearTransients(state);
      state.mode = effectsMode;
      state.lastPulse = null;
      state.lastTimeSec = null;
      state.needsRebase = effectsMode === 'reduced';
    }

    return effectsMode === 'reduced'
      ? resolveReduced(state, resolved)
      : resolveFull(state, resolved);
  }

  function suspend() {
    for (const state of stages.values()) {
      clearTransients(state);
      state.needsRebase = true;
      state.lastTimeSec = null;
    }
  }

  function reset({ seed: nextSeed = currentSeed } = {}) {
    currentSeed = String(nextSeed || 'apparitions:v1');
    stages.clear();
    pendingForced = null;
    return inspect();
  }

  function inspect(stageKey = null) {
    if (stageKey != null) {
      const state = stages.get(String(stageKey));
      return state ? stateView(state) : null;
    }
    return {
      seed: currentSeed,
      pendingForced: pendingForced ? { ...pendingForced } : null,
      stages: [...stages.values()].map(stateView),
    };
  }

  function forceNext(cue = {}) {
    const card = [
      'reorientation',
      'stillness',
      'absence',
      'substitution',
      'peripheral',
      'delayed_reveal',
    ].includes(cue?.card) ? cue.card : null;
    const presentation = cue?.presentation === 'hard' ? 'hard' : null;
    if (!card && !presentation) return false;
    pendingForced = {
      ...(card ? { card } : {}),
      ...(presentation ? { presentation } : {}),
      index: normalizeIndex(cue?.index, null),
    };
    return true;
  }

  // Capture/debug surface only: semantic and coordinate-blind. Runtime game
  // behavior never calls this; it lets the art-review harness exercise every
  // generated pose without teaching the director about meshes or world space.
  function setPoses(stageKey, poseIds) {
    if (!Array.isArray(poseIds) || poseIds.length !== FIGURE_COUNT
      || poseIds.some((poseId) => !APPARITION_POSE_IDS.includes(poseId))) return false;
    const state = getState(stageKey);
    state.poseIds = [...poseIds];
    return true;
  }

  return Object.freeze({
    resolve,
    suspend,
    reset,
    inspect,
    forceNext,
    setPoses,
  });
}
