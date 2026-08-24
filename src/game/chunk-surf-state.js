import { CHUNK_SURF_FLAGS, chunkSurfRouteProfile } from '../data/chunk-surf-script.js';
import {
  normalizeSourceContactState,
  sourceBossExposed,
} from './source-contact.js';

export const CHUNK_SURF_PHASE = Object.freeze({
  HALL: 'hall',
  HAYSTACK: 'haystack',
  TRANSFORMING: 'transforming',
  LANDSCAPE: 'landscape',
  FINAL: 'final',
  // THE HORIZON. Past the last page, when the surfer was never settled — you
  // lost to it, or you walked to the normal exit and never fought it at all.
  // The source code runs out and what is under it is the tape the whole thing
  // was compressed from. It is still source space: same runtime, same area, a
  // fifth tier on the same landscape. It is not a reward and not a punishment,
  // it is the part of the chapter that happens when the chapter did not close.
  HORIZON: 'horizon',
  // THE BELL PASSAGE. The tower road, walked.
  //
  // Taking the bust's detour used to end the chapter on the spot and hand main.js
  // eight seconds of datamosh to play over a warp. It is a place now: four
  // hundred metres of the same ground, the tower's own bells standing in it at
  // every size they are not, and St Brendan's belfry resolving out of the far
  // end with one wall missing. Walking in through that wall is what completes.
  //
  // It is still Source space — same runtime, same area, the tier past the tape
  // (SOURCE_BELLS in data/source-level.js).
  BELLS: 'bells',
  COMPLETED: 'completed',
});

// How you ended up out there. Both are ordinary; neither is a failure state.
export const HORIZON_REASON = Object.freeze({
  // You reached the normal exit without ever settling the thing at the fault.
  WALKED_AWAY: 'walked-away',
  // You settled it and it settled you.
  LOST: 'lost',
});

// Where the tape lets you off. The chapel is straight on and costs nothing.
// The tower is the bust's ten-minute detour, and it is worth taking.
export const HORIZON_EXIT = Object.freeze({
  CHAPEL: 'chapel',
  TOWER: 'tower',
});

// The three mutually-exclusive roads after the final Source fault.  This is
// durable state rather than a presentation flag: once one of these is committed
// neither a reload nor an already-earned Chapel qualification may substitute a
// different ending family.
export const SOURCE_FINALE_ROUTE = Object.freeze({
  CONTACT: 'contact',
  TOWER: 'tower',
  CHAPEL: 'chapel',
});

export const SOURCE_FINALE_STAGE = Object.freeze({
  UNCOMMITTED: 'uncommitted',
  CONTACT_COMMITTED: 'contact-committed',
  HORIZON: 'horizon',
  TOWER_COMMITTED: 'tower-committed',
  CATHEDRAL: 'cathedral',
  CATHEDRAL_FIGHT: 'cathedral-fight',
  TOWER_ESCAPE: 'tower-escape',
  CHAPEL_COMMITTED: 'chapel-committed',
  RESOLVED: 'resolved',
});

export const SOURCE_FINALE_RESULT = Object.freeze({
  WON: 'won',
  LOST: 'lost',
});

export const CHUNK_SURF_HUSH_STAGE = Object.freeze({
  ABSENT: 'absent',
  STALK: 'stalk',
  HUNT: 'hunt',
  FINAL: 'final',
});

export const SOURCE_PURSUIT_BEAT = Object.freeze({
  BODY_RUN: 'body-run',
  FINAL_RUN: 'final-run',
});

export const SOURCE_FINAL_STATUS = Object.freeze({
  LOCKED: 'locked',
  READY: 'ready',
  RESOLVED: 'resolved',
});

export const SOURCE_FINAL_OUTCOME = Object.freeze({
  RESCUE: 'rescue',
  CONTAIN: 'contain',
  SUBMIT: 'submit',
});

export const SOURCE_OPTIONAL_TRACES = Object.freeze(['surfer-origin', 'work-order-loop']);

const PHASES = new Set(Object.values(CHUNK_SURF_PHASE));
const HORIZON_REASONS = new Set(Object.values(HORIZON_REASON));
const HORIZON_EXITS = new Set(Object.values(HORIZON_EXIT));
const FINALE_ROUTES = new Set(Object.values(SOURCE_FINALE_ROUTE));
const FINALE_STAGES = new Set(Object.values(SOURCE_FINALE_STAGE));
const FINALE_RESULTS = new Set(Object.values(SOURCE_FINALE_RESULT));
const HUSH_STAGES = new Set(Object.values(CHUNK_SURF_HUSH_STAGE));
const PURSUIT_BEATS = new Set(Object.values(SOURCE_PURSUIT_BEAT));
const FINAL_STATUSES = new Set(Object.values(SOURCE_FINAL_STATUS));
const FINAL_OUTCOMES = new Set(Object.values(SOURCE_FINAL_OUTCOME));
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
  sourceGuidance = false,
  evidenceTags = [],
  sourceMemoryFacts = {},
  marbleEyes = null,
  seed = 4417,
  returnPoint = null,
} = {}) {
  return {
    schema: 5,
    active: false,
    completed: false,
    phase: CHUNK_SURF_PHASE.HALL,
    seed: Number(seed) || 4417,
    profile: {
      ...chunkSurfRouteProfile({ drankCoffee, hasRig, endingsSeen }),
      sourceGuidance: !!sourceGuidance,
      evidenceTags: unique(evidenceTags),
      sourceMemoryFacts: sourceMemoryFacts && typeof sourceMemoryFacts === 'object' && !Array.isArray(sourceMemoryFacts) ? { ...sourceMemoryFacts } : {},
      marbleEyes: ['carried', 'returned', 'declined', 'in-the-water'].includes(marbleEyes) ? marbleEyes : null,
    },
    returnPoint: finitePoint(returnPoint),
    hallMaxDistance: 0,
    pageStage: 0,
    haystackOrigin: null,
    landscapeOrigin: null,
    interactivePageSlot: null,
    haystackDialogue: null,
    sourceContacts: normalizeSourceContactState(),
    // The Scene Dock survives the transformation as a real room. Its FOH leaf
    // is the one deliberate interaction between that room and Source: closed
    // on arrival, opened by the player, and durable across a reload.
    landingDoorOpen: false,
    firstLiftCompleted: false,
    landingWeatherSpent: false,
    hasFork: false,
    visited: [],
    tuned: [],
    recorded: [],
    optionalTraces: [],
    checkpointId: 'hall-entry',
    checkpoint: { id: 'hall-entry', facing: 0 },
    attempts: 0,
    hushStage: CHUNK_SURF_HUSH_STAGE.ABSENT,
    pursuitBeat: null,
    pursuitsCleared: [],
    finalEncounter: {
      status: SOURCE_FINAL_STATUS.LOCKED,
      outcome: null,
      won: null,
      rescuedRecordist: false,
      legacyRedaction: null,
      compatibility: {},
      channels: { rescue: 0, contain: 0, submit: 0 },
      turns: 0,
    },
    armedRedaction: null,
    redaction: null,
    bestEligible: false,
    // What the night had already cost him when he walked in. The presence takes
    // you before source or it does not, and if it never did he has no reason to
    // believe there is anything in here to talk to. Snapshot at the threshold so
    // it cannot be earned late — see sourceBossAvailable().
    injuriesAtEntry: 0,
    horizon: freshHorizon(),
    finale: freshFinale(),
  };
}

function freshHorizon() {
  return { entered: false, reason: null, exit: null, maxDepth: 0 };
}

function freshFinale() {
  return {
    route: null,
    stage: SOURCE_FINALE_STAGE.UNCOMMITTED,
    result: null,
    bust: { recognized: false, decision: null },
    compatibility: {},
  };
}

function normalizeHorizon(value = null) {
  const source = value && typeof value === 'object' ? value : {};
  const reason = HORIZON_REASONS.has(source.reason) ? source.reason : null;
  return {
    entered: !!source.entered || !!reason,
    reason,
    exit: HORIZON_EXITS.has(source.exit) ? source.exit : null,
    maxDepth: Math.max(0, Number(source.maxDepth) || 0),
  };
}

// The two gates on the fault, and neither of them is the rig.
//
// (a) The night has to have hurt him already. Injuries come from the presence
// TAKING you — so the gate is not an abstract difficulty check, it is prior
// contact with the hush, in the only currency the game has for it.
// (b) All three insights, which is the three contacts inside source.
//
// The rig used to sit here too and it was the wrong shape: it made the fight
// unreachable for anyone who had not kitted up, when what the rig actually buys
// is the ability to invert the contract. It buys the rescue, not the argument.
// See applyRigAdvantage() in source-rig-bridge.js.
export function sourceBossAvailable(value) {
  const state = normalizeChunkSurfState(value);
  return state.injuriesAtEntry >= 1 && sourceBossExposed(state.sourceContacts);
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
    marbleEyes: value.profile?.marbleEyes,
    seed: value.seed,
    returnPoint: value.returnPoint,
  });
  const phase = PHASES.has(value.phase) ? value.phase : (value.completed ? CHUNK_SURF_PHASE.COMPLETED : CHUNK_SURF_PHASE.HALL);
  const hallMaxDistance = Math.max(0, Number(value.hallMaxDistance) || 0);
  const tuned = unique(value.tuned);
  const recorded = unique(value.recorded);
  const derivedOptionalTraces = SOURCE_OPTIONAL_TRACES.filter((id) => tuned.includes(id) || recorded.includes(id));
  const optionalTraces = unique([...(Array.isArray(value.optionalTraces) ? value.optionalTraces : []), ...derivedOptionalTraces]).filter((id) => SOURCE_OPTIONAL_TRACES.includes(id));
  const legacyOutcome = value.redaction === 'body' ? SOURCE_FINAL_OUTCOME.RESCUE
    : value.redaction === 'comfort' ? SOURCE_FINAL_OUTCOME.CONTAIN
      : value.redaction === 'source' ? SOURCE_FINAL_OUTCOME.SUBMIT : null;
  const rawFinal = value.finalEncounter && typeof value.finalEncounter === 'object' ? value.finalEncounter : {};
  const finalStatus = FINAL_STATUSES.has(rawFinal.status) ? rawFinal.status
    : (legacyOutcome || value.completed || phase === CHUNK_SURF_PHASE.HORIZON ? SOURCE_FINAL_STATUS.RESOLVED
      : phase === CHUNK_SURF_PHASE.FINAL ? SOURCE_FINAL_STATUS.READY : SOURCE_FINAL_STATUS.LOCKED);
  const finalOutcome = FINAL_OUTCOMES.has(rawFinal.outcome) ? rawFinal.outcome : legacyOutcome;
  const pursuitsCleared = unique(value.pursuitsCleared).filter((id) => PURSUIT_BEATS.has(id));
  const rawFinale = value.finale && typeof value.finale === 'object' && !Array.isArray(value.finale)
    ? value.finale : {};
  let finaleRoute = FINALE_ROUTES.has(rawFinale.route) ? rawFinale.route : null;
  let finaleStage = FINALE_STAGES.has(rawFinale.stage) ? rawFinale.stage : SOURCE_FINALE_STAGE.UNCOMMITTED;
  let finaleResult = FINALE_RESULTS.has(rawFinale.result) ? rawFinale.result : null;
  const legacyFinale = Number(value.schema) < 5;
  if (legacyFinale) {
    if (phase === CHUNK_SURF_PHASE.HORIZON) finaleStage = SOURCE_FINALE_STAGE.HORIZON;
    if (value.horizon?.exit === HORIZON_EXIT.TOWER) {
      finaleRoute = SOURCE_FINALE_ROUTE.TOWER;
      finaleStage = SOURCE_FINALE_STAGE.TOWER_COMMITTED;
    } else if (value.horizon?.exit === HORIZON_EXIT.CHAPEL) {
      finaleRoute = SOURCE_FINALE_ROUTE.CHAPEL;
      finaleStage = SOURCE_FINALE_STAGE.CHAPEL_COMMITTED;
    } else if ((value.completed || phase === CHUNK_SURF_PHASE.COMPLETED) && rawFinal.won !== false) {
      // Before schema 5 a resolved fault with no Horizon exit silently became
      // the Ellery tower.  It is the old shape of a Contact victory and now
      // lands on that terminal result instead of changing routes after reload.
      finaleRoute = SOURCE_FINALE_ROUTE.CONTACT;
      finaleStage = SOURCE_FINALE_STAGE.RESOLVED;
      finaleResult = SOURCE_FINALE_RESULT.WON;
    }
  }
  const legacyLandscape = value.firstLiftCompleted == null
    && [CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.COMPLETED].includes(phase);
  let checkpointId = typeof value.checkpoint?.id === 'string' && value.checkpoint.id
    ? value.checkpoint.id
    : typeof value.checkpointId === 'string' && value.checkpointId ? value.checkpointId : 'hall-entry';
  // Pre-haystack-checkpoint saves used hall-entry even after the 112 m walk.
  // Migrate them in-place when the authored haystack origin is available.
  if (phase === CHUNK_SURF_PHASE.HAYSTACK && checkpointId === 'hall-entry' && finitePoint(value.haystackOrigin)) {
    checkpointId = 'haystack-entry';
  }
  return {
    ...base,
    ...value,
    schema: 5,
    active: !!value.active && phase !== CHUNK_SURF_PHASE.COMPLETED,
    completed: !!value.completed || phase === CHUNK_SURF_PHASE.COMPLETED,
    phase,
    seed: Number(value.seed) || base.seed,
    profile: value.profile && typeof value.profile === 'object'
      ? {
          ...base.profile,
          ...value.profile,
          marbleEyes: ['carried', 'returned', 'declined', 'in-the-water'].includes(value.profile.marbleEyes)
            ? value.profile.marbleEyes : null,
        }
      : base.profile,
    returnPoint: finitePoint(value.returnPoint),
    hallMaxDistance,
    pageStage: Math.max(pageStageForDistance(hallMaxDistance), Math.min(4, Math.floor(Number(value.pageStage) || 0))),
    haystackOrigin: finitePoint(value.haystackOrigin),
    landscapeOrigin: finitePoint(value.landscapeOrigin),
    interactivePageSlot: value.interactivePageSlot == null ? null : Math.max(0, Math.floor(Number(value.interactivePageSlot) || 0)),
    sourceContacts: normalizeSourceContactState(value.sourceContacts),
    landingDoorOpen: !!value.landingDoorOpen,
    firstLiftCompleted: value.firstLiftCompleted == null ? legacyLandscape : !!value.firstLiftCompleted,
    landingWeatherSpent: value.landingWeatherSpent == null ? legacyLandscape : !!value.landingWeatherSpent,
    hasFork: !!value.hasFork,
    visited: unique(value.visited),
    tuned,
    recorded,
    optionalTraces,
    checkpointId,
    checkpoint: {
      id: checkpointId,
      facing: Number.isFinite(Number(value.checkpoint?.facing)) ? ((Math.round(Number(value.checkpoint.facing)) % 4) + 4) % 4 : 0,
    },
    attempts: Math.max(0, Math.floor(Number(value.attempts) || 0)),
    hushStage: HUSH_STAGES.has(value.hushStage) ? value.hushStage : CHUNK_SURF_HUSH_STAGE.ABSENT,
    pursuitBeat: PURSUIT_BEATS.has(value.pursuitBeat) && !pursuitsCleared.includes(value.pursuitBeat) ? value.pursuitBeat : null,
    pursuitsCleared,
    finalEncounter: {
      status: finalStatus,
      outcome: finalOutcome,
      won: typeof rawFinal.won === 'boolean' ? rawFinal.won : (finalStatus === SOURCE_FINAL_STATUS.RESOLVED ? true : null),
      rescuedRecordist: !!rawFinal.rescuedRecordist || (!!value.bestEligible && finalOutcome === SOURCE_FINAL_OUTCOME.RESCUE),
      legacyRedaction: typeof rawFinal.legacyRedaction === 'string' ? rawFinal.legacyRedaction : (typeof value.redaction === 'string' ? value.redaction : null),
      compatibility: rawFinal.compatibility && typeof rawFinal.compatibility === 'object' && !Array.isArray(rawFinal.compatibility) ? { ...rawFinal.compatibility } : {},
      channels: {
        rescue: Math.max(0, Math.floor(Number(rawFinal.channels?.rescue) || 0)),
        contain: Math.max(0, Math.floor(Number(rawFinal.channels?.contain) || 0)),
        submit: Math.max(0, Math.floor(Number(rawFinal.channels?.submit) || 0)),
      },
      turns: Math.max(0, Math.floor(Number(rawFinal.turns) || 0)),
    },
    armedRedaction: typeof value.armedRedaction === 'string' ? value.armedRedaction : null,
    redaction: typeof value.redaction === 'string' ? value.redaction : null,
    bestEligible: !!value.bestEligible,
    // Schema 3 saves predate the horizon and predate the gate. They keep zero,
    // which reads as "the night never touched him" — correct for a save that was
    // written before injuries mattered here, and it only ever closes the fault,
    // never opens one.
    injuriesAtEntry: Math.max(0, Math.floor(Number(value.injuriesAtEntry) || 0)),
    horizon: normalizeHorizon(value.horizon),
    finale: {
      route: finaleRoute,
      stage: finaleStage,
      result: finaleResult,
      bust: {
        recognized: !!rawFinale.bust?.recognized,
        decision: ['accepted', 'declined'].includes(rawFinale.bust?.decision) ? rawFinale.bust.decision : null,
      },
      compatibility: {
        ...(rawFinale.compatibility && typeof rawFinale.compatibility === 'object' && !Array.isArray(rawFinale.compatibility)
          ? rawFinale.compatibility : {}),
        ...(legacyFinale ? { migratedFrom: `source-schema-${Number(value.schema) || 0}` } : {}),
      },
    },
  };
}

function add(list, id) { return unique([...(list || []), id]); }

function optionalTraceFor(id) { return SOURCE_OPTIONAL_TRACES.includes(id) ? id : null; }

function eligibleForBest(state, outcome) {
  return !!(
    outcome === SOURCE_FINAL_OUTCOME.RESCUE
    && state.profile?.bestEligible
    && sourceBossExposed(state.sourceContacts)
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
        injuriesAtEntry: Math.max(0, Math.floor(Number(event.injuries) || 0)),
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
        checkpointId: 'haystack-entry',
        checkpoint: { id: 'haystack-entry', facing: 0 },
      };

    case 'HAYSTACK_PAGE_FOUND':
      if (state.phase !== CHUNK_SURF_PHASE.HAYSTACK) return state;
      return {
        ...state,
        phase: CHUNK_SURF_PHASE.TRANSFORMING,
        landscapeOrigin: finitePoint(event.landscapeOrigin) || state.landscapeOrigin,
        checkpointId: 'landing-arrival',
        checkpoint: { id: 'landing-arrival', facing: 0 },
      };

    case 'TRANSFORMATION_COMPLETED': {
      if (state.phase !== CHUNK_SURF_PHASE.TRANSFORMING) return state;
      // The moment the field opens, the hush is already out there — stalking at a
      // distance, a body in motion you can see long before it hunts. It was never
      // meant to wait, invisible, for the fork gate.
      const hushStage = state.hushStage === CHUNK_SURF_HUSH_STAGE.ABSENT
        ? CHUNK_SURF_HUSH_STAGE.STALK : state.hushStage;
      return { ...state, phase: CHUNK_SURF_PHASE.LANDSCAPE, hushStage, visited: add(state.visited, 'approach') };
    }

    case 'SOURCE_LIFT_COMPLETED': {
      if (!event.id) return state;
      const firstLiftCompleted = state.firstLiftCompleted || event.id === 'lift-fork' || event.id === 'ladder-fork';
      return {
        ...state,
        firstLiftCompleted,
        checkpointId: event.checkpointId || state.checkpointId,
        checkpoint: event.checkpointId ? { id: event.checkpointId, facing: 0 } : state.checkpoint,
        hushStage: firstLiftCompleted ? CHUNK_SURF_HUSH_STAGE.HUNT : state.hushStage,
        pursuitBeat: firstLiftCompleted && !state.pursuitsCleared.includes(SOURCE_PURSUIT_BEAT.BODY_RUN)
          ? SOURCE_PURSUIT_BEAT.BODY_RUN : state.pursuitBeat,
      };
    }

    case 'SOURCE_LANDING_DOOR_OPENED':
      return state.landingDoorOpen ? state : { ...state, landingDoorOpen: true };

    case 'SOURCE_LANDING_WEATHER_SPENT':
      return { ...state, landingWeatherSpent: true };

    case 'SOURCE_CONTACT_RESOLVED':
      return {
        ...state,
        attempts: state.attempts + 1,
        sourceContacts: normalizeSourceContactState(event.contact),
        armedRedaction: null,
        checkpointId: event.checkpointId || state.checkpointId,
        checkpoint: event.checkpointId ? { id: event.checkpointId, facing: 0 } : state.checkpoint,
      };

    case 'LANDMARK_VISITED':
      if (!event.id) return state;
      return {
        ...state,
        visited: add(state.visited, event.id),
        // Optional evidence is spatial now. Legacy Tune/Record events remain
        // readable below, but a new run earns these traces by actually finding
        // their authored places.
        optionalTraces: optionalTraceFor(event.id)
          ? add(state.optionalTraces, event.id)
          : state.optionalTraces,
      };

    case 'LANDMARK_TUNED': {
      if (!event.id) return state;
      const hasFork = state.hasFork || event.id === 'fork-room';
      const hushStage = event.id === 'fork-room' && state.hushStage === CHUNK_SURF_HUSH_STAGE.ABSENT
        ? CHUNK_SURF_HUSH_STAGE.STALK : state.hushStage;
      const optionalTrace = optionalTraceFor(event.id);
      return { ...state, hasFork, tuned: add(state.tuned, event.id), visited: add(state.visited, event.id), optionalTraces: optionalTrace ? add(state.optionalTraces, optionalTrace) : state.optionalTraces, hushStage };
    }

    case 'LANDMARK_RECORDED':
      if (!event.id) return state;
      return { ...state, recorded: add(state.recorded, event.id), visited: add(state.visited, event.id), optionalTraces: optionalTraceFor(event.id) ? add(state.optionalTraces, event.id) : state.optionalTraces };

    case 'CHECKPOINT_SET':
      return event.id ? {
        ...state,
        checkpointId: event.id,
        checkpoint: { id: event.id, facing: Number.isFinite(Number(event.facing)) ? ((Math.round(Number(event.facing)) % 4) + 4) % 4 : 0 },
      } : state;

    case 'HUSH_STALK_STARTED':
      return { ...state, hushStage: CHUNK_SURF_HUSH_STAGE.STALK };

    case 'HUSH_HUNT_STARTED':
      return { ...state, hushStage: CHUNK_SURF_HUSH_STAGE.HUNT };

    case 'PURSUIT_STARTED':
      if (!PURSUIT_BEATS.has(event.id) || state.pursuitsCleared.includes(event.id)) return state;
      return { ...state, pursuitBeat: event.id, hushStage: event.id === SOURCE_PURSUIT_BEAT.FINAL_RUN ? CHUNK_SURF_HUSH_STAGE.FINAL : CHUNK_SURF_HUSH_STAGE.HUNT };

    case 'PURSUIT_CLEARED':
      if (!PURSUIT_BEATS.has(event.id)) return state;
      return {
        ...state,
        pursuitBeat: state.pursuitBeat === event.id ? null : state.pursuitBeat,
        pursuitsCleared: add(state.pursuitsCleared, event.id),
        hushStage: CHUNK_SURF_HUSH_STAGE.STALK,
      };

    case 'HUSH_CONTACT':
      return { ...state, attempts: state.attempts + 1, armedRedaction: null };

    case 'FINAL_REACHED':
      if (state.phase !== CHUNK_SURF_PHASE.LANDSCAPE) return state;
      return {
        ...state,
        phase: CHUNK_SURF_PHASE.FINAL,
        hushStage: CHUNK_SURF_HUSH_STAGE.STALK,
        pursuitBeat: null,
        pursuitsCleared: add(state.pursuitsCleared, SOURCE_PURSUIT_BEAT.FINAL_RUN),
        visited: add(state.visited, 'final-page'),
        checkpointId: 'final-page',
        checkpoint: { id: 'final-page', facing: 0 },
        finalEncounter: { ...state.finalEncounter, status: SOURCE_FINAL_STATUS.READY },
      };

    case 'CONTACT_COMMITTED':
      if (state.phase !== CHUNK_SURF_PHASE.FINAL
        || state.finalEncounter.status !== SOURCE_FINAL_STATUS.READY
        || (state.finale.route && state.finale.route !== SOURCE_FINALE_ROUTE.CONTACT)) return state;
      return {
        ...state,
        finale: {
          ...state.finale,
          route: SOURCE_FINALE_ROUTE.CONTACT,
          stage: SOURCE_FINALE_STAGE.CONTACT_COMMITTED,
          result: null,
        },
      };

    case 'FINAL_ENCOUNTER_RESOLVED': {
      if (state.phase !== CHUNK_SURF_PHASE.FINAL || state.finalEncounter.status === SOURCE_FINAL_STATUS.LOCKED) return state;
      if (!FINAL_OUTCOMES.has(event.result?.outcome) || event.result?.won === false) return state;
      const outcome = event.result.outcome;
      const won = event.result?.won !== false;
      const legacyRedaction = typeof event.result?.legacyRedaction === 'string' ? event.result.legacyRedaction
        : outcome === SOURCE_FINAL_OUTCOME.RESCUE ? 'body'
          : outcome === SOURCE_FINAL_OUTCOME.SUBMIT ? 'source' : 'comfort';
      const candidate = { ...state, redaction: legacyRedaction || state.redaction };
      const rescuedRecordist = won && eligibleForBest(candidate, outcome);
      return {
        ...candidate,
        armedRedaction: null,
        bestEligible: rescuedRecordist,
        finalEncounter: {
          status: SOURCE_FINAL_STATUS.RESOLVED,
          outcome,
          won,
          rescuedRecordist,
          legacyRedaction: legacyRedaction || null,
          compatibility: event.result?.compatibility && typeof event.result.compatibility === 'object' && !Array.isArray(event.result.compatibility)
            ? { ...event.result.compatibility } : {},
          channels: {
            rescue: Math.max(0, Math.floor(Number(event.result?.channels?.rescue) || 0)),
            contain: Math.max(0, Math.floor(Number(event.result?.channels?.contain) || 0)),
            submit: Math.max(0, Math.floor(Number(event.result?.channels?.submit) || 0)),
          },
          turns: Math.max(0, Math.floor(Number(event.result?.turns) || 0)),
        },
        finale: state.finale.route === SOURCE_FINALE_ROUTE.CONTACT
          ? {
              ...state.finale,
              stage: SOURCE_FINALE_STAGE.RESOLVED,
              result: SOURCE_FINALE_RESULT.WON,
            }
          : state.finale,
      };
    }

    // Walking to the normal exit still contains the thing — that reading is
    // unchanged and the dossier still gets it. What changed is where it puts
    // you: the chapter does not close on a page you declined to turn.
    case 'SOURCE_NORMAL_EXIT': {
      if (state.phase !== CHUNK_SURF_PHASE.FINAL || state.finale.route === SOURCE_FINALE_ROUTE.CONTACT) return state;
      const resolved = reduceChunkSurf(state, {
        type: 'FINAL_ENCOUNTER_RESOLVED',
        result: {
          outcome: SOURCE_FINAL_OUTCOME.CONTAIN,
          won: true,
          legacyRedaction: 'comfort',
          compatibility: { adapter: 'source-pass-v2', route: 'normal-exit' },
          channels: { rescue: 0, contain: 1, submit: 0 },
          turns: 0,
        },
      });
      return {
        ...resolved,
        active: true,
        completed: false,
        phase: CHUNK_SURF_PHASE.HORIZON,
        horizon: { ...freshHorizon(), entered: true, reason: HORIZON_REASON.WALKED_AWAY },
        checkpointId: 'landing-horizon',
        checkpoint: { id: 'landing-horizon', facing: 0 },
        finale: { ...resolved.finale, route: null, stage: SOURCE_FINALE_STAGE.HORIZON, result: null },
      };
    }

    // Contact is a declared point of no return.  Losing here is a terminal
    // result, not a hidden route into the safer Horizon branch.
    case 'FINAL_ENCOUNTER_LOST':
      if (state.phase !== CHUNK_SURF_PHASE.FINAL
        || state.finalEncounter.status !== SOURCE_FINAL_STATUS.READY
        || state.finale.route !== SOURCE_FINALE_ROUTE.CONTACT) return state;
      return {
        ...state,
        active: false,
        completed: true,
        attempts: state.attempts + 1,
        armedRedaction: null,
        phase: CHUNK_SURF_PHASE.COMPLETED,
        redaction: 'source',
        bestEligible: false,
        finalEncounter: {
          ...state.finalEncounter,
          status: SOURCE_FINAL_STATUS.RESOLVED,
          outcome: SOURCE_FINAL_OUTCOME.SUBMIT,
          won: false,
          rescuedRecordist: false,
          legacyRedaction: 'source',
          compatibility: { ...state.finalEncounter.compatibility, adapter: 'combat-v1', route: 'contact-terminal' },
        },
        finale: {
          ...state.finale,
          stage: SOURCE_FINALE_STAGE.RESOLVED,
          result: SOURCE_FINALE_RESULT.LOST,
        },
      };

    case 'HORIZON_ADVANCED': { // metres into the tape, monotonically increasing
      if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return state;
      const maxDepth = Math.max(state.horizon.maxDepth, Number(event.depth) || 0);
      return { ...state, horizon: { ...state.horizon, maxDepth } };
    }

    case 'HORIZON_BUST_RECOGNIZED':
      if (state.phase !== CHUNK_SURF_PHASE.HORIZON || !event.eligible || state.finale.bust.decision) return state;
      return { ...state, finale: { ...state.finale, bust: { ...state.finale.bust, recognized: true } } };

    case 'HORIZON_BUST_DECIDED': {
      if (state.phase !== CHUNK_SURF_PHASE.HORIZON || state.finale.bust.decision) return state;
      const accepted = event.decision === 'accepted' && state.finale.bust.recognized;
      return {
        ...state,
        finale: {
          ...state.finale,
          route: accepted ? SOURCE_FINALE_ROUTE.TOWER : SOURCE_FINALE_ROUTE.CHAPEL,
          stage: accepted ? SOURCE_FINALE_STAGE.TOWER_COMMITTED : SOURCE_FINALE_STAGE.CHAPEL_COMMITTED,
          bust: { ...state.finale.bust, decision: accepted ? 'accepted' : 'declined' },
        },
      };
    }

    case 'HORIZON_EXIT_CHOSEN': {
      if (state.phase !== CHUNK_SURF_PHASE.HORIZON || !HORIZON_EXITS.has(event.exit)) return state;
      const requestedRoute = event.exit === HORIZON_EXIT.TOWER ? SOURCE_FINALE_ROUTE.TOWER : SOURCE_FINALE_ROUTE.CHAPEL;
      if (state.finale.route && state.finale.route !== requestedRoute) return state;
      if (requestedRoute === SOURCE_FINALE_ROUTE.TOWER && state.finale.bust.decision !== 'accepted') return state;
      // THE CHAPEL CLOSES THE CHAPTER. THE TOWER OPENS A PLACE.
      //
      // Straight on is still straight on: the chapel exit ends Source space where
      // it always did. The detour does not — it is the bell passage now, and the
      // chapter stays open and stays ACTIVE until the body walks into the room at
      // the end of it. The route and the stage commit here, though, because the
      // decision was made at the bust and reloading in the passage must not offer
      // it again.
      const tower = requestedRoute === SOURCE_FINALE_ROUTE.TOWER;
      return {
        ...state,
        active: tower,
        completed: !tower,
        phase: tower ? CHUNK_SURF_PHASE.BELLS : CHUNK_SURF_PHASE.COMPLETED,
        horizon: { ...state.horizon, exit: event.exit },
        checkpointId: tower ? 'bells-entry' : state.checkpointId,
        checkpoint: tower ? { id: 'bells-entry', facing: 0 } : state.checkpoint,
        finale: {
          ...state.finale,
          route: requestedRoute,
          stage: tower ? SOURCE_FINALE_STAGE.TOWER_COMMITTED : SOURCE_FINALE_STAGE.CHAPEL_COMMITTED,
        },
      };
    }

    // The last metre of Source space. Walking through the missing wall of the
    // belfry is what ends the chapter on the tower road; main.js then puts the
    // body in the real chamber, which is the same room, built from the same
    // meshes, one step further on.
    case 'BELLS_ROOM_ENTERED': {
      if (state.phase !== CHUNK_SURF_PHASE.BELLS) return state;
      return {
        ...state,
        active: false,
        completed: true,
        phase: CHUNK_SURF_PHASE.COMPLETED,
        finale: { ...state.finale, stage: SOURCE_FINALE_STAGE.TOWER_COMMITTED },
      };
    }

    case 'CATHEDRAL_ENTERED':
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER
        || ![SOURCE_FINALE_STAGE.TOWER_COMMITTED, SOURCE_FINALE_STAGE.CATHEDRAL].includes(state.finale.stage)) return state;
      return { ...state, finale: { ...state.finale, stage: SOURCE_FINALE_STAGE.CATHEDRAL } };

    case 'CATHEDRAL_FIGHT_STARTED':
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.CATHEDRAL) return state;
      return { ...state, finale: { ...state.finale, stage: SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT } };

    case 'CATHEDRAL_FIGHT_WON':
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT) return state;
      return { ...state, finale: { ...state.finale, stage: SOURCE_FINALE_STAGE.TOWER_ESCAPE, result: SOURCE_FINALE_RESULT.WON } };

    case 'CATHEDRAL_FIGHT_LOST':
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT) return state;
      return { ...state, finale: { ...state.finale, stage: SOURCE_FINALE_STAGE.RESOLVED, result: SOURCE_FINALE_RESULT.LOST } };

    case 'TOWER_ESCAPE_COMPLETED':
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.TOWER_ESCAPE) return state;
      return { ...state, finale: { ...state.finale, stage: SOURCE_FINALE_STAGE.RESOLVED, result: SOURCE_FINALE_RESULT.WON } };

    case 'REDACTION_ARMED':
      if (state.phase !== CHUNK_SURF_PHASE.FINAL || !['comfort', 'body', 'source'].includes(event.id)) return state;
      return { ...state, armedRedaction: event.id };

    case 'REDACTION_CANCELLED':
      return { ...state, armedRedaction: null };

    case 'REDACTION_CONFIRMED': {
      if (state.phase !== CHUNK_SURF_PHASE.FINAL || state.armedRedaction !== event.id) return state;
      const outcome = event.id === 'body' ? SOURCE_FINAL_OUTCOME.RESCUE
        : event.id === 'source' ? SOURCE_FINAL_OUTCOME.SUBMIT : SOURCE_FINAL_OUTCOME.CONTAIN;
      return reduceChunkSurf({ ...state, redaction: event.id }, {
        type: 'FINAL_ENCOUNTER_RESOLVED',
        result: { outcome, won: true, legacyRedaction: event.id, compatibility: { adapter: 'redaction-v1' } },
      });
    }

    case 'SOURCE_COMPLETED':
      if (state.finalEncounter.status !== SOURCE_FINAL_STATUS.RESOLVED && !state.redaction) return state;
      // Out on the tape the chapter closes at an exit, not at a resolution.
      // HORIZON_EXIT_CHOSEN is the only way off it.
      if (state.phase === CHUNK_SURF_PHASE.HORIZON) return state;
      return {
        ...state,
        active: false,
        completed: true,
        phase: CHUNK_SURF_PHASE.COMPLETED,
        finale: state.finale.route === SOURCE_FINALE_ROUTE.CONTACT
          ? { ...state.finale, stage: SOURCE_FINALE_STAGE.RESOLVED, result: state.finale.result || SOURCE_FINALE_RESULT.WON }
          : state.finale,
      };

    default:
      return state;
  }
}

export function chunkSurfFlagsForState(value) {
  const state = normalizeChunkSurfState(value);
  return [
    CHUNK_SURF_FLAGS.entered,
    ...(state.completed ? [CHUNK_SURF_FLAGS.completed] : []),
    // These tool-derived checks are retained as legacy alternatives, while new
    // Source runs project the same downstream evidence from spatial discovery.
    ...(state.hasFork ? [CHUNK_SURF_FLAGS.fork] : []),
    ...(state.visited.includes('body-room') || state.tuned.includes('body-room') ? [CHUNK_SURF_FLAGS.trueLine] : []),
    ...(state.visited.includes('recordist-loop') || state.tuned.includes('recordist-loop') || state.recorded.includes('recordist-loop') ? [CHUNK_SURF_FLAGS.optionalRecordist] : []),
    ...(state.visited.includes('surfer-origin') || state.tuned.includes('surfer-origin') || state.recorded.includes('surfer-origin') ? [CHUNK_SURF_FLAGS.optionalSurfer] : []),
    ...(state.visited.includes('work-order-loop') || state.tuned.includes('work-order-loop') || state.recorded.includes('work-order-loop') ? [CHUNK_SURF_FLAGS.optionalWorkOrder] : []),
    ...(state.finalEncounter.outcome === SOURCE_FINAL_OUTCOME.RESCUE || state.redaction === 'body' ? [CHUNK_SURF_FLAGS.correctRedaction] : []),
    ...(state.bestEligible ? [CHUNK_SURF_FLAGS.bestEligible] : []),
    ...(state.horizon.entered ? [CHUNK_SURF_FLAGS.horizon] : []),
    ...(state.horizon.reason === HORIZON_REASON.LOST ? [CHUNK_SURF_FLAGS.horizonLost] : []),
    ...(state.horizon.exit === HORIZON_EXIT.CHAPEL ? [CHUNK_SURF_FLAGS.horizonExitChapel] : []),
    ...(state.horizon.exit === HORIZON_EXIT.TOWER ? [CHUNK_SURF_FLAGS.horizonExitTower] : []),
  ];
}

export function chunkSurfCompletion(value) {
  const state = normalizeChunkSurfState(value);
  if (!state.completed) return { completed: false, bestEligible: false, savedRecordist: false, flags: [] };
  const route = state.finale.route
    || (state.horizon.exit === HORIZON_EXIT.TOWER ? SOURCE_FINALE_ROUTE.TOWER
      : state.horizon.exit === HORIZON_EXIT.CHAPEL ? SOURCE_FINALE_ROUTE.CHAPEL : null);
  const result = state.finale.result;
  const endingId = route === SOURCE_FINALE_ROUTE.CONTACT && result
    ? `contact-${result}`
    : route === SOURCE_FINALE_ROUTE.TOWER && result
      ? `tower-${result}` : null;
  return {
    completed: true,
    bestEligible: !!state.bestEligible,
    savedRecordist: !!state.bestEligible,
    redaction: state.redaction,
    finalEncounter: { ...state.finalEncounter },
    // null when the chapter closed at the fault. main.js reads this to choose
    // between the tower crossing and the chapel.
    horizonExit: state.horizon.exit,
    route,
    result,
    endingId,
    transitionTarget: route === SOURCE_FINALE_ROUTE.CONTACT ? 'ending'
      : route === SOURCE_FINALE_ROUTE.TOWER ? 'cathedral' : 'chapel',
    flags: chunkSurfFlagsForState(state),
  };
}

export function inferLegacyChunkSurf(save = {}) {
  const flags = save.flags && typeof save.flags === 'object' ? save.flags : {};
  const completed = !!flags[CHUNK_SURF_FLAGS.completed];
  const entered = !!flags[CHUNK_SURF_FLAGS.entered];
  const state = freshChunkSurfState({ seed: save.run?.startedAt || 4417 });
  if (completed) return normalizeChunkSurfState({
    ...state,
    completed: true,
    active: false,
    phase: CHUNK_SURF_PHASE.COMPLETED,
    finalEncounter: {
      status: SOURCE_FINAL_STATUS.RESOLVED,
      outcome: SOURCE_FINAL_OUTCOME.CONTAIN,
      won: true,
      rescuedRecordist: false,
      legacyRedaction: null,
      compatibility: { migratedFrom: 'legacy-flags' },
      channels: { rescue: 0, contain: 1, submit: 0 },
      turns: 0,
    },
    finale: {
      ...state.finale,
      route: SOURCE_FINALE_ROUTE.CONTACT,
      stage: SOURCE_FINALE_STAGE.RESOLVED,
      result: SOURCE_FINALE_RESULT.WON,
      compatibility: { migratedFrom: 'legacy-flags' },
    },
  });
  if (entered) return { ...state, active: true, phase: CHUNK_SURF_PHASE.HALL };
  return state;
}

export function chunkSurfProbe(value) {
  const state = normalizeChunkSurfState(value);
  const sourceContacts=normalizeSourceContactState(state.sourceContacts);
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
    optionalTraces: [...state.optionalTraces],
    sourceContacts: {captures:sourceContacts.captures,insightIds:[...sourceContacts.insights]},
    bossExposed: sourceBossExposed(state.sourceContacts),
    firstLiftCompleted: state.firstLiftCompleted,
    landingWeatherSpent: state.landingWeatherSpent,
    hushStage: state.hushStage,
    pursuitBeat: state.pursuitBeat,
    pursuitsCleared: [...state.pursuitsCleared],
    finalEncounter: { ...state.finalEncounter },
    armedRedaction: state.armedRedaction,
    redaction: state.redaction,
    bestEligible: state.bestEligible,
    injuriesAtEntry: state.injuriesAtEntry,
    bossAvailable: sourceBossAvailable(state),
    horizon: { ...state.horizon },
    finale: {
      ...state.finale,
      bust: { ...state.finale.bust },
      compatibility: { ...state.finale.compatibility },
    },
  };
}
