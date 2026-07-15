import { CHUNK_SURF_FLAGS, chunkSurfRouteProfile } from '../data/chunk-surf-script.js';

export const CHUNK_SURF_PHASE = Object.freeze({
  HALL: 'hall',
  HAYSTACK: 'haystack',
  TRANSFORMING: 'transforming',
  LANDSCAPE: 'landscape',
  FINAL: 'final',
  COMPLETED: 'completed',
});

export const CHUNK_SURF_HUSH_STAGE = Object.freeze({
  ABSENT: 'absent',
  STALK: 'stalk',
  HUNT: 'hunt',
  FINAL: 'final',
});

const PHASES = new Set(Object.values(CHUNK_SURF_PHASE));
const HUSH_STAGES = new Set(Object.values(CHUNK_SURF_HUSH_STAGE));
const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value))];
const finitePoint = (value) => value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
  ? { x: Number(value.x), y: Number(value.y), ...(Number.isFinite(Number(value.facing)) ? { facing: Number(value.facing) } : {}) }
  : null;

export function canOfferChunkSurf({ completedTakes = 0, roomId = '', alreadyCompleted = false } = {}) {
  if (alreadyCompleted || Number(completedTakes) < 4) return false;
  if (roomId && roomId !== 'lux_nova' && roomId !== 'chapel' && roomId !== 'chapel_approach') return false;
  return true;
}

export function pageStageForDistance(distance = 0) {
  const metres = Math.max(0, Number(distance) || 0);
  if (metres >= 112) return 4;
  if (metres >= 84) return 3;
  if (metres >= 56) return 2;
  if (metres >= 28) return 1;
  return 0;
}

export function freshChunkSurfState({
  drankCoffee = false,
  hasRig = false,
  endingsSeen = [],
  seed = 4417,
  returnPoint = null,
} = {}) {
  return {
    schema: 2,
    active: false,
    completed: false,
    phase: CHUNK_SURF_PHASE.HALL,
    seed: Number(seed) || 4417,
    profile: chunkSurfRouteProfile({ drankCoffee, hasRig, endingsSeen }),
    returnPoint: finitePoint(returnPoint),
    hallMaxDistance: 0,
    pageStage: 0,
    haystackOrigin: null,
    landscapeOrigin: null,
    interactivePageSlot: null,
    hasFork: false,
    visited: [],
    tuned: [],
    recorded: [],
    checkpointId: 'hall-entry',
    attempts: 0,
    hushStage: CHUNK_SURF_HUSH_STAGE.ABSENT,
    armedRedaction: null,
    redaction: null,
    bestEligible: false,
  };
}

// Compatibility name retained for callers and legacy tests while the state is
// now spatial rather than a room graph.
export const createChunkSurfState = freshChunkSurfState;

export function normalizeChunkSurfState(value = null, fallback = {}) {
  if (!value || typeof value !== 'object') return freshChunkSurfState(fallback);
  const base = freshChunkSurfState({
    ...fallback,
    drankCoffee: value.profile?.mandatory,
    hasRig: value.profile?.bestEligible,
    seed: value.seed,
    returnPoint: value.returnPoint,
  });
  const phase = PHASES.has(value.phase) ? value.phase : (value.completed ? CHUNK_SURF_PHASE.COMPLETED : CHUNK_SURF_PHASE.HALL);
  const hallMaxDistance = Math.max(0, Number(value.hallMaxDistance) || 0);
  return {
    ...base,
    ...value,
    schema: 2,
    active: !!value.active && phase !== CHUNK_SURF_PHASE.COMPLETED,
    completed: !!value.completed || phase === CHUNK_SURF_PHASE.COMPLETED,
    phase,
    seed: Number(value.seed) || base.seed,
    profile: value.profile && typeof value.profile === 'object' ? { ...base.profile, ...value.profile } : base.profile,
    returnPoint: finitePoint(value.returnPoint),
    hallMaxDistance,
    pageStage: Math.max(pageStageForDistance(hallMaxDistance), Math.min(4, Math.floor(Number(value.pageStage) || 0))),
    haystackOrigin: finitePoint(value.haystackOrigin),
    landscapeOrigin: finitePoint(value.landscapeOrigin),
    interactivePageSlot: value.interactivePageSlot == null ? null : Math.max(0, Math.floor(Number(value.interactivePageSlot) || 0)),
    hasFork: !!value.hasFork,
    visited: unique(value.visited),
    tuned: unique(value.tuned),
    recorded: unique(value.recorded),
    checkpointId: typeof value.checkpointId === 'string' && value.checkpointId ? value.checkpointId : 'hall-entry',
    attempts: Math.max(0, Math.floor(Number(value.attempts) || 0)),
    hushStage: HUSH_STAGES.has(value.hushStage) ? value.hushStage : CHUNK_SURF_HUSH_STAGE.ABSENT,
    armedRedaction: typeof value.armedRedaction === 'string' ? value.armedRedaction : null,
    redaction: typeof value.redaction === 'string' ? value.redaction : null,
    bestEligible: !!value.bestEligible,
  };
}

function add(list, id) { return unique([...(list || []), id]); }

function eligibleForBest(state, redaction) {
  const requiredDone = ['fork-room', 'recordist-loop', 'body-room'].every((id) => state.tuned.includes(id));
  const optionalDone = ['recordist-loop', 'surfer-origin', 'work-order-loop']
    .filter((id) => state.tuned.includes(id) || state.recorded.includes(id));
  return !!(
    redaction === 'body'
    && state.profile?.bestEligible
    && state.hasFork
    && requiredDone
    && optionalDone.length >= 2
    && state.recorded.includes('body-room')
  );
}

export function reduceChunkSurf(value, event = {}) {
  const state = normalizeChunkSurfState(value);
  switch (event.type) {
    case 'SOURCE_ENTERED':
      return {
        ...state,
        active: true,
        completed: false,
        phase: CHUNK_SURF_PHASE.HALL,
        returnPoint: finitePoint(event.returnPoint) || state.returnPoint,
      };

    case 'HALL_ADVANCED': { // metres, monotonically increasing
      if (state.phase !== CHUNK_SURF_PHASE.HALL) return state;
      const hallMaxDistance = Math.max(state.hallMaxDistance, Number(event.distance) || 0);
      const pageStage = pageStageForDistance(hallMaxDistance);
      return { ...state, hallMaxDistance, pageStage };
    }

    case 'HAYSTACK_REACHED':
      if (state.phase !== CHUNK_SURF_PHASE.HALL || state.hallMaxDistance < 112) return state;
      return {
        ...state,
        phase: CHUNK_SURF_PHASE.HAYSTACK,
        pageStage: 4,
        haystackOrigin: finitePoint(event.origin) || state.haystackOrigin,
        interactivePageSlot: event.slot == null ? (state.seed >>> 0) % 12 : Math.max(0, Math.floor(Number(event.slot) || 0)),
      };

    case 'HAYSTACK_PAGE_FOUND':
      if (state.phase !== CHUNK_SURF_PHASE.HAYSTACK) return state;
      return {
        ...state,
        phase: CHUNK_SURF_PHASE.TRANSFORMING,
        landscapeOrigin: finitePoint(event.landscapeOrigin) || state.landscapeOrigin,
        checkpointId: 'landscape-entry',
      };

    case 'TRANSFORMATION_COMPLETED':
      if (state.phase !== CHUNK_SURF_PHASE.TRANSFORMING) return state;
      return { ...state, phase: CHUNK_SURF_PHASE.LANDSCAPE, visited: add(state.visited, 'approach') };

    case 'LANDMARK_VISITED':
      if (!event.id) return state;
      return { ...state, visited: add(state.visited, event.id) };

    case 'LANDMARK_TUNED': {
      if (!event.id) return state;
      const hasFork = state.hasFork || event.id === 'fork-room';
      const hushStage = event.id === 'fork-room' && state.hushStage === CHUNK_SURF_HUSH_STAGE.ABSENT
        ? CHUNK_SURF_HUSH_STAGE.STALK : state.hushStage;
      return { ...state, hasFork, tuned: add(state.tuned, event.id), visited: add(state.visited, event.id), hushStage };
    }

    case 'LANDMARK_RECORDED':
      if (!event.id) return state;
      return { ...state, recorded: add(state.recorded, event.id), visited: add(state.visited, event.id) };

    case 'CHECKPOINT_SET':
      return event.id ? { ...state, checkpointId: event.id } : state;

    case 'HUSH_STALK_STARTED':
      return { ...state, hushStage: CHUNK_SURF_HUSH_STAGE.STALK };

    case 'HUSH_HUNT_STARTED':
      return { ...state, hushStage: CHUNK_SURF_HUSH_STAGE.HUNT };

    case 'HUSH_CONTACT':
      return { ...state, attempts: state.attempts + 1, armedRedaction: null };

    case 'FINAL_REACHED':
      if (!state.tuned.includes('body-room')) return state;
      return { ...state, phase: CHUNK_SURF_PHASE.FINAL, hushStage: CHUNK_SURF_HUSH_STAGE.FINAL, visited: add(state.visited, 'final-page') };

    case 'REDACTION_ARMED':
      if (state.phase !== CHUNK_SURF_PHASE.FINAL || !['comfort', 'body', 'source'].includes(event.id)) return state;
      return { ...state, armedRedaction: event.id };

    case 'REDACTION_CANCELLED':
      return { ...state, armedRedaction: null };

    case 'REDACTION_CONFIRMED': {
      if (state.phase !== CHUNK_SURF_PHASE.FINAL || state.armedRedaction !== event.id) return state;
      return {
        ...state,
        redaction: event.id,
        armedRedaction: null,
        bestEligible: eligibleForBest(state, event.id),
      };
    }

    case 'SOURCE_COMPLETED':
      if (!state.redaction) return state;
      return { ...state, active: false, completed: true, phase: CHUNK_SURF_PHASE.COMPLETED };

    default:
      return state;
  }
}

export function chunkSurfFlagsForState(value) {
  const state = normalizeChunkSurfState(value);
  return [
    CHUNK_SURF_FLAGS.entered,
    ...(state.completed ? [CHUNK_SURF_FLAGS.completed] : []),
    ...(state.hasFork ? [CHUNK_SURF_FLAGS.fork] : []),
    ...(state.tuned.includes('body-room') ? [CHUNK_SURF_FLAGS.trueLine] : []),
    ...(state.tuned.includes('recordist-loop') || state.recorded.includes('recordist-loop') ? [CHUNK_SURF_FLAGS.optionalRecordist] : []),
    ...(state.tuned.includes('surfer-origin') || state.recorded.includes('surfer-origin') ? [CHUNK_SURF_FLAGS.optionalSurfer] : []),
    ...(state.tuned.includes('work-order-loop') || state.recorded.includes('work-order-loop') ? [CHUNK_SURF_FLAGS.optionalWorkOrder] : []),
    ...(state.redaction === 'body' ? [CHUNK_SURF_FLAGS.correctRedaction] : []),
    ...(state.bestEligible ? [CHUNK_SURF_FLAGS.bestEligible] : []),
  ];
}

export function chunkSurfCompletion(value) {
  const state = normalizeChunkSurfState(value);
  if (!state.completed) return { completed: false, bestEligible: false, savedRecordist: false, flags: [] };
  return {
    completed: true,
    bestEligible: !!state.bestEligible,
    savedRecordist: !!state.bestEligible,
    redaction: state.redaction,
    flags: chunkSurfFlagsForState(state),
  };
}

export function inferLegacyChunkSurf(save = {}) {
  const flags = save.flags && typeof save.flags === 'object' ? save.flags : {};
  const completed = !!flags[CHUNK_SURF_FLAGS.completed];
  const entered = !!flags[CHUNK_SURF_FLAGS.entered];
  const state = freshChunkSurfState({ seed: save.run?.startedAt || 4417 });
  if (completed) return { ...state, completed: true, active: false, phase: CHUNK_SURF_PHASE.COMPLETED };
  if (entered) return { ...state, active: true, phase: CHUNK_SURF_PHASE.HALL };
  return state;
}

export function chunkSurfProbe(value) {
  const state = normalizeChunkSurfState(value);
  return {
    active: state.active,
    completed: state.completed,
    phase: state.phase,
    hallDistance: state.hallMaxDistance,
    pageStage: state.pageStage,
    landscapeOrigin: state.landscapeOrigin,
    checkpointId: state.checkpointId,
    attempts: state.attempts,
    hasFork: state.hasFork,
    visited: [...state.visited],
    tuned: [...state.tuned],
    recorded: [...state.recorded],
    hushStage: state.hushStage,
    armedRedaction: state.armedRedaction,
    redaction: state.redaction,
    bestEligible: state.bestEligible,
  };
}
