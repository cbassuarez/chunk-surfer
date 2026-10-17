import { normalizeBustPerformanceState } from './bust-performance.js';
import { normalizeSourceShore } from './source-hanging-shore.js';
import { createLastReceptionState } from './source-last-reception.js';
import { CHUNK_SURF_FLAGS, chunkSurfRouteProfile } from '../data/chunk-surf-script.js';
import { normalizeOutskirtsExperience } from './outskirts-experience.js';
import { normalizeSourceUnravelling } from './source-unravelling.js';
import { normalizeStationRealm } from './station-realms.js';
import { normalizeTowerPersonalJourney } from './tower-personal-journey.js';
import { normalizeCathedralExtractionCheckpoint } from './cathedral-extraction.js';
import { normalizeCombatCheckpoint } from './combat-checkpoint.js';
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
  // THE CHAPEL'S OUTSKIRTS. Straight on, past the end of the tape: nothing, a
  // field of doors, and the chapel's own door, which is the way out.
  CHAPEL_OUTSKIRTS: 'chapel-outskirts',
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

// HOW MANY TIMES THE BUST WILL SEE YOU AGAIN.
//
// "It's easier as long as you don't lose." / "And if I lose?" / "Then I'll see
// you here again, but you'll have no choice but to continue." The bust is
// telling the truth: losing the cathedral fight sends you back to it, with the
// chapel no longer on offer. Three is where that stops being a bargain and
// becomes a treadmill — the same number the causal gate uses for injuries — and
// the third defeat plays `tower-lost` as it always did.
export const TOWER_DEFEAT_CEILING = 3;

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

// Feet and falling belong to the body, not the surface beneath a crossing.
// Old saves have no body-height record until the divided field initializes it.
export function normalizeSourceDivide(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const bounded = (n, maximum) => Number.isFinite(Number(n))
    ? Math.max(0, Math.min(maximum, Number(n))) : 0;
  return { version: 1, feet: bounded(value.feet, 45),
    fallVelocity: bounded(value.fallVelocity, 40), falling: !!value.falling };
}

// The station clock advances only while its world is active. Door entry, the
// visit it starts, and the door's later disappearance share one saved clock.
export function normalizeSourceStation(value = null) {
  const source = value && typeof value === 'object' ? value : {};
  const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const seconds = (n) => Math.max(0, finite(n));
  const forward = (v) => Array.isArray(v) && v.length >= 2
    ? [finite(v[0]), finite(v[1], -1)] : [0, -1];
  const crossing = source.crossing && typeof source.crossing.id === 'string' ? {
    id: source.crossing.id, variant: Math.max(0, Math.floor(finite(source.crossing.variant))),
    seed: finite(source.crossing.seed), world: String(source.crossing.world || ''),
    key: !!source.crossing.key, home: !!source.crossing.home, released: !!source.crossing.released,
    wrong: !!source.crossing.wrong, fails: !!source.crossing.fails, lockIn: !!source.crossing.lockIn,
    forward: forward(source.crossing.forward), startedAt: finite(source.crossing.startedAt),
  } : null;
  const walk = source.walk && ['home', 'lock-in'].includes(source.walk.kind) ? {
    kind: source.walk.kind, progress: Math.max(0, Math.min(1, finite(source.walk.progress))),
    windowAt: source.walk.windowAt == null ? null : seconds(source.walk.windowAt),
    thought: !!source.walk.thought, done: !!source.walk.done, forward: forward(source.walk.forward),
  } : null;
  return {
    time: seconds(source.time), crossing, walk, realm: normalizeStationRealm(source.realm),
    personal: normalizeTowerPersonalJourney(source.personal),
    homeDiscovered: !!source.homeDiscovered, homeResolved: !!source.homeResolved,
    lastReturn: source.lastReturn && typeof source.lastReturn.id === 'string' ? {
      id: source.lastReturn.id, world: String(source.lastReturn.world || ''), home: !!source.lastReturn.home,
      reason: ['budget', 'retreat', 'home'].includes(source.lastReturn.reason) ? source.lastReturn.reason : 'budget',
      windowReached: !!source.lastReturn.windowReached, at: seconds(source.lastReturn.at),
      returnPose: source.lastReturn.returnPose ? { ...finitePoint(source.lastReturn.returnPose),
        yaw: finite(source.lastReturn.returnPose.yaw), pitch: finite(source.lastReturn.returnPose.pitch) } : null,
    } : null,
    entries: (Array.isArray(source.entries) ? source.entries : [])
      .filter((entry) => entry && typeof entry.doorId === 'string' && entry.doorId && typeof entry.world === 'string')
      .slice(-64).map((entry) => ({ doorId: entry.doorId, world: entry.world,
        variant: Math.max(0, Math.floor(finite(entry.variant))), home: !!entry.home, enteredAt: seconds(entry.enteredAt),
        // Earlier journals granted their residue on entry. Preserve that earned
        // state; new visits explicitly wait until reassembly to expose it.
        returnedAt: entry.returnedAt === null ? null : seconds(entry.returnedAt ?? entry.enteredAt) })),
    takeBacks: (Array.isArray(source.takeBacks) ? source.takeBacks : [])
      .filter((entry) => entry && typeof entry.id === 'string' && entry.id)
      .slice(-64).map((entry) => ({ id: entry.id, at: seconds(entry.at) })),
  };
}

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
    hallExperience: { searchElapsed: 0, pressure: 0, rainLatched: false },
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
    // AND IT SHUTS BEHIND YOU. The leaf used to be a one-way latch: opened once
    // and open forever, so the room the player came from stayed advertised as a
    // way back that Source never intended to offer. Crossing the threshold seals
    // it — the same contract the Scene Dock HUSH beat runs on, where the door
    // remains a door and stops being an exit.
    landingDoorSealed: false,
    // THE GREY DOORS AT THE FAR EDGE OF THE FIELD, the one way out to the
    // outskirts and back. Opened by the player, shut behind him on the crossing.
    edgeDoorOpen: false,
    // False copies of that pair disappear when touched. Every touched index
    // stays gone even after a long walk away and a reload.
    edgeDoorEchoesErased: [],
    outskirtsExperience: normalizeOutskirtsExperience(),
    // The white interval is measured in successful body steps, not an axis.
    // That makes thirty seconds mean thirty seconds even when the player walks
    // sideways into the apparent infinity. It is persisted on ordinary saves so
    // a reload cannot restart the cinematic or skip its red onset.
    sourceApproachDistance: 0,
    sourceShore: normalizeSourceShore(),
    sourceDivide: null,
    lastReception: createLastReceptionState(),
    sourceApproachComplete: false,
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
    bellField: null,
    // Door-field doors walked through (and so erased), by id. Two in the tower's
    // field are the key to the tower door.
    routeDoorsErased: [],
    // Door-field doors opened (they stay open), by id.
    routeDoorsOpened: [],
    station: normalizeSourceStation(),
    finale: freshFinale(),
  };
}

function freshHorizon() {
  return { entered: false, reason: null, exit: null, maxDepth: 0, unravelling: normalizeSourceUnravelling() };
}

// WHAT ST BRENDAN'S REMEMBERS. alarm is how many bells the body brushed on the
// belfry deck on the way down; damage is what the fight has broken, in the order
// it broke. Both survive a loss: every retry the bust grants is fought in the
// church the last one left.
export const CATHEDRAL_DAMAGE_MARKS = Object.freeze(['bells-swinging', 'frame-shaken', 'bell-fallen', 'pulpitum-split', 'lantern-out']);
export const CATHEDRAL_ALARM_CEILING = 9;
function freshCathedral() {
  return { alarm: 0, damage: [], lessons: [], fight: null, extraction: null };
}
function normalizeCathedral(value = null) {
  const source = value && typeof value === 'object' ? value : {};
  const checkpoint = normalizeCombatCheckpoint(source.fight?.checkpoint);
  const fight = source.fight && typeof source.fight === 'object' ? {
    phase: checkpoint?.cathedralPhase === 2 || source.fight.phase === 2 ? 2 : 1,
    checkpoint,
    continuation: source.fight.continuation && typeof source.fight.continuation === 'object'
      ? JSON.parse(JSON.stringify(source.fight.continuation)) : null,
    retry: !!source.fight.retry,
  } : null;
  return {
    alarm: Math.max(0, Math.min(CATHEDRAL_ALARM_CEILING, Math.floor(Number(source.alarm) || 0))),
    damage: CATHEDRAL_DAMAGE_MARKS.filter((mark) => Array.isArray(source.damage) && source.damage.includes(mark)),
    lessons: ['clapper', 'louvre', 'wheel'].filter((id) => source.lessons?.includes(id)),
    fight,
    extraction: normalizeCathedralExtractionCheckpoint(source.extraction),
    ...(source.personalOpening ? { personalOpening: true } : {}),
  };
}

function freshFinale() {
  return {
    route: null,
    stage: SOURCE_FINALE_STAGE.UNCOMMITTED,
    result: null,
    bust: { recognized: false, decision: null, defeats: 0, sealReady:false, performance:normalizeBustPerformanceState() },
    cathedral: freshCathedral(),
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
    unravelling: normalizeSourceUnravelling(source.unravelling, { legacyDepthCells: source.maxDepth }),
  };
}

// The service-court meeting is optional until the bust commits another route.
// Equipment changes the fight's possibilities, never permission to enter it.
export function sourceBossAvailable(value) {
  const state = normalizeChunkSurfState(value);
  // Combat still requires the separate warned commitment event.
  return state.firstLiftCompleted && !state.finale?.bust?.decision
    && (!state.finale?.route || state.finale.route === SOURCE_FINALE_ROUTE.CONTACT)
    && !state.completed;
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
  const firstLiftCompleted = value.firstLiftCompleted == null ? legacyLandscape : !!value.firstLiftCompleted;
  const sourceApproachComplete = value.sourceApproachComplete == null
    ? firstLiftCompleted
    : !!value.sourceApproachComplete;
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
    hallExperience: {
      searchElapsed: Number.isFinite(Number(value.hallExperience?.searchElapsed))
        ? Math.max(phase === CHUNK_SURF_PHASE.HAYSTACK ? 12 : 0, Number(value.hallExperience.searchElapsed))
        : (phase === CHUNK_SURF_PHASE.HAYSTACK ? 12 : 0),
      pressure: Math.max(0, Math.min(.985, Number(value.hallExperience?.pressure) || 0)),
      rainLatched: !!value.hallExperience?.rainLatched || phase === CHUNK_SURF_PHASE.HAYSTACK,
    },
    pageStage: Math.max(pageStageForDistance(hallMaxDistance), Math.min(4, Math.floor(Number(value.pageStage) || 0))),
    haystackOrigin: finitePoint(value.haystackOrigin),
    landscapeOrigin: finitePoint(value.landscapeOrigin),
    interactivePageSlot: value.interactivePageSlot == null ? null : Math.max(0, Math.floor(Number(value.interactivePageSlot) || 0)),
    sourceContacts: normalizeSourceContactState(value.sourceContacts),
    bellField: value.bellField && typeof value.bellField === 'object' ? value.bellField : null,
    routeDoorsErased: unique(value.routeDoorsErased).slice(-64),
    routeDoorsOpened: unique(value.routeDoorsOpened).slice(-64),
    station: normalizeSourceStation(value.station),
    landingDoorOpen: !!value.landingDoorOpen,
    landingDoorSealed: !!value.landingDoorSealed,
    edgeDoorOpen: !!value.edgeDoorOpen,
    edgeDoorEchoesErased: [...new Set((Array.isArray(value.edgeDoorEchoesErased) ? value.edgeDoorEchoesErased : [])
      .filter((index) => Number.isSafeInteger(index) && index !== 0))],
    outskirtsExperience: normalizeOutskirtsExperience(value.outskirtsExperience),
    sourceApproachDistance: Math.max(0, Number(value.sourceApproachDistance) || 0),
    sourceShore: normalizeSourceShore(firstLiftCompleted && !value.sourceShore?.adapted ? {...value.sourceShore,adapted:true,exposureElapsed:14,bodyFloor:4.2} : value.sourceShore),
    sourceDivide: normalizeSourceDivide(value.sourceDivide),
    lastReception: createLastReceptionState(value.lastReception),
    sourceApproachComplete,
    firstLiftCompleted,
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
        sealReady:!!rawFinale.bust?.sealReady,
        performance:normalizeBustPerformanceState(rawFinale.bust?.performance,rawFinale.bust?.performance?{}:{recognized:!!rawFinale.bust?.recognized,committed:rawFinale.bust?.decision==='accepted',evidence:value.profile?.marbleEyes}),
        decision: ['accepted', 'declined'].includes(rawFinale.bust?.decision) ? rawFinale.bust.decision : null,
        // Absent on every save written before the bust kept its word.
        defeats: Math.max(0, Math.floor(Number(rawFinale.bust?.defeats) || 0)),
      },
      cathedral: normalizeCathedral(rawFinale.cathedral),
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
      // Recognition can happen on approach. The page has always been here;
      // reaching the end of the corridor is no longer a prerequisite.
      if (state.phase !== CHUNK_SURF_PHASE.HAYSTACK && state.phase !== CHUNK_SURF_PHASE.HALL) return state;
      return {
        ...state,
        phase: CHUNK_SURF_PHASE.TRANSFORMING,
        landscapeOrigin: finitePoint(event.landscapeOrigin) || state.landscapeOrigin,
        sourceApproachDistance: 0,
        sourceShore: normalizeSourceShore(),
        sourceDivide: null,
        sourceApproachComplete: false,
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
        sourceApproachComplete: firstLiftCompleted ? true : state.sourceApproachComplete,
        firstLiftCompleted,
        checkpointId: event.checkpointId || state.checkpointId,
        checkpoint: event.checkpointId ? { id: event.checkpointId, facing: 0 } : state.checkpoint,
        hushStage: firstLiftCompleted ? CHUNK_SURF_HUSH_STAGE.HUNT : state.hushStage,
        pursuitBeat: firstLiftCompleted && !state.pursuitsCleared.includes(SOURCE_PURSUIT_BEAT.BODY_RUN)
          ? SOURCE_PURSUIT_BEAT.BODY_RUN : state.pursuitBeat,
      };
    }

    case 'SOURCE_LANDING_DOOR_OPENED':
      // A sealed leaf does not reopen. Refusing here rather than at the prompt
      // keeps the rule in one place, so a reload or a god warp cannot walk
      // around it.
      if (state.landingDoorSealed) return state;
      return state.landingDoorOpen ? state : { ...state, landingDoorOpen: true };

    case 'SOURCE_EDGE_DOOR_OPENED':
      return state.edgeDoorOpen ? state : { ...state, edgeDoorOpen: true };

    case 'SOURCE_EDGE_DOOR_CLOSED':
      return state.edgeDoorOpen ? { ...state, edgeDoorOpen: false } : state;

    case 'SOURCE_EDGE_DOOR_ECHO_ERASED': {
      if (![CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL, CHUNK_SURF_PHASE.HORIZON].includes(state.phase)
        || !Number.isSafeInteger(event.index) || event.index === 0) return state;
      const erased = state.edgeDoorEchoesErased || [];
      return erased.includes(event.index) ? state : { ...state, edgeDoorEchoesErased: [...erased, event.index] };
    }

    case 'SOURCE_LANDING_DOOR_SEALED':
      return state.landingDoorSealed
        ? state
        : { ...state, landingDoorOpen: false, landingDoorSealed: true };

    case 'SOURCE_APPROACH_COMPLETED':
      return state.sourceApproachComplete
        ? state
        : {
            ...state,
            sourceApproachDistance: Math.max(
              state.sourceApproachDistance,
              Math.max(0, Number(event.distance) || 0),
            ),
            sourceApproachComplete: true,
            checkpointId: 'landing-approach',
            checkpoint: { id: 'landing-approach', facing: 0 },
          };

    case 'SOURCE_LANDING_WEATHER_SPENT':
      return { ...state, landingWeatherSpent: true };

    case 'SOURCE_CONTACT_RESOLVED':
      return {
        ...state,
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
      if (![CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)
        || !sourceBossAvailable(state)
        || !state.sourceContacts.warningSeen || !state.sourceContacts.combatCommitted
        || state.sourceContacts.lastChoiceId !== 'contact.confirm'
        || (state.finale.route && state.finale.route !== SOURCE_FINALE_ROUTE.CONTACT)) return state;
      return {
        ...state,
        phase: CHUNK_SURF_PHASE.FINAL,
        finalEncounter: { ...state.finalEncounter, status: SOURCE_FINAL_STATUS.READY },
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

    // Walking onward leaves HUSH unresolved. The player can return until the
    // bust decision; merely reaching the outskirts is not a combat outcome.
    case 'SOURCE_NORMAL_EXIT': {
      if (![CHUNK_SURF_PHASE.LANDSCAPE, CHUNK_SURF_PHASE.FINAL].includes(state.phase)
        || state.finale.route === SOURCE_FINALE_ROUTE.CONTACT) return state;
      return {
        ...state,
        active: true,
        completed: false,
        phase: CHUNK_SURF_PHASE.HORIZON,
        horizon: { ...state.horizon, entered: true, reason: HORIZON_REASON.WALKED_AWAY },
        checkpointId: 'landing-horizon',
        checkpoint: { id: 'landing-horizon', facing: 0 },
        finale: { ...state.finale, route: null, stage: SOURCE_FINALE_STAGE.HORIZON, result: null },
      };
    }

    case 'SOURCE_FIELD_RETURNED':
      if (state.phase !== CHUNK_SURF_PHASE.HORIZON || state.finale.bust.decision) return state;
      return { ...state, phase: CHUNK_SURF_PHASE.LANDSCAPE,
        finalEncounter: { ...state.finalEncounter, status: SOURCE_FINAL_STATUS.LOCKED },
        finale: { ...state.finale, route: null, stage: SOURCE_FINALE_STAGE.UNCOMMITTED } };

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

    case 'HORIZON_ADVANCED': { // runtime cells into the tape, monotonically increasing
      if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return state;
      const maxDepth = Math.max(state.horizon.maxDepth, Number(event.depth) || 0);
      return { ...state, horizon: { ...state.horizon, maxDepth } };
    }

    case 'HORIZON_UNRAVELLING_ADVANCED': {
      if (state.phase !== CHUNK_SURF_PHASE.HORIZON) return state;
      const before = state.horizon.unravelling;
      const next = normalizeSourceUnravelling(event.unravelling);
      const unravelling = normalizeSourceUnravelling({
        active: before.active || next.active,
        furthestMetres: Math.max(before.furthestMetres, next.furthestMetres),
        elapsedSeconds: Math.max(before.elapsedSeconds, next.elapsedSeconds),
        amount: Math.max(before.amount, next.amount),
        markers: [...before.markers, ...next.markers],
      });
      return { ...state, horizon: { ...state.horizon, unravelling } };
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
        // Neither road closes the chapter here any more. The tower opens the bell
        // passage; straight on opens the chapel's outskirts. Each ends at a door.
        active: true,
        completed: false,
        phase: tower ? CHUNK_SURF_PHASE.BELLS : CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS,
        horizon: { ...state.horizon, exit: event.exit },
        checkpointId: tower ? 'bells-entry' : 'chapel-outskirts',
        checkpoint: { id: tower ? 'bells-entry' : 'chapel-outskirts', facing: 0 },
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

    // The chapel road's last metre: through the chapel's own door.
    case 'CHAPEL_DOOR_ENTERED': {
      if (state.phase !== CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS) return state;
      return {
        ...state,
        active: false,
        completed: true,
        phase: CHUNK_SURF_PHASE.COMPLETED,
        finale: { ...state.finale, stage: SOURCE_FINALE_STAGE.CHAPEL_COMMITTED },
      };
    }

    case 'STATION_DOOR_CROSSED': {
      if (![CHUNK_SURF_PHASE.BELLS, CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS].includes(state.phase)
        || typeof event.id !== 'string' || !event.id) return state;
      const station = normalizeSourceStation(event.station);
      if (!station.crossing || station.crossing.id !== event.id
        || !station.entries.some((entry) => entry.doorId === event.id)) return state;
      return { ...state, station, routeDoorsErased: unique([...state.routeDoorsErased, event.id]).slice(-64) };
    }

    case 'STATION_SAVED':
      return { ...state, station: normalizeSourceStation(event.station) };

    case 'ROUTE_DOOR_ERASED': {
      if (![CHUNK_SURF_PHASE.BELLS, CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS].includes(state.phase)
        || typeof event.id !== 'string' || !event.id) return state;
      const erased = state.routeDoorsErased || [];
      if (erased.includes(event.id)) return state;
      return { ...state, routeDoorsErased: [...erased, event.id].slice(-64) };
    }

    case 'ROUTE_DOOR_OPENED': {
      if (![CHUNK_SURF_PHASE.BELLS, CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS].includes(state.phase)
        || typeof event.id !== 'string' || !event.id) return state;
      const opened = state.routeDoorsOpened || [];
      if (opened.includes(event.id)) return state;
      return { ...state, routeDoorsOpened: [...opened, event.id].slice(-64) };
    }

    case 'CATHEDRAL_ENTERED':
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER
        || ![SOURCE_FINALE_STAGE.TOWER_COMMITTED, SOURCE_FINALE_STAGE.CATHEDRAL].includes(state.finale.stage)) return state;
      return { ...state, finale: { ...state.finale, stage: SOURCE_FINALE_STAGE.CATHEDRAL } };

    case 'CATHEDRAL_FIGHT_STARTED': {
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.CATHEDRAL) return state;
      const personal = state.station.personal;
      const earned = personal.completed && personal.rewardEarned && !personal.rewardConsumed;
      return { ...state,
        station: earned ? { ...state.station, personal: { ...personal, rewardConsumed: true } } : state.station,
        finale: { ...state.finale, stage: SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT,
          cathedral: earned ? { ...state.finale.cathedral, alarm: 0, personalOpening: true } : state.finale.cathedral } };
    }

    case 'CATHEDRAL_FIGHT_WON':
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT) return state;
      return { ...state, finale: { ...state.finale, cathedral: normalizeCathedral({ ...state.finale.cathedral, personalOpening: false, fight: null }), stage: SOURCE_FINALE_STAGE.TOWER_ESCAPE, result: SOURCE_FINALE_RESULT.WON } };

    case 'CATHEDRAL_FIGHT_CHECKPOINT': {
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT) return state;
      const cathedral = normalizeCathedral({ ...state.finale.cathedral, fight: event.fight });
      return { ...state, finale: { ...state.finale, cathedral } };
    }

    case 'CATHEDRAL_EXTRACTION_CHECKPOINT': {
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.TOWER_ESCAPE) return state;
      const extraction = normalizeCathedralExtractionCheckpoint(event.checkpoint);
      if (!extraction) return state;
      return { ...state, finale: { ...state.finale, cathedral: { ...state.finale.cathedral, extraction } } };
    }

    case 'CATHEDRAL_LESSON_COMPLETED': {
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || !['clapper', 'louvre', 'wheel'].includes(event.id)) return state;
      const cathedral = normalizeCathedral(state.finale.cathedral);
      if (cathedral.lessons.includes(event.id)) return state;
      return { ...state, finale: { ...state.finale, cathedral: { ...cathedral, lessons: [...cathedral.lessons, event.id] } } };
    }

    // LOSING THE CATHEDRAL IS NOT THE END UNTIL THE THIRD TIME.
    //
    // This went straight to RESOLVED/LOST, which made the bust a liar: it
    // promised to see you again and the run was over. It counts now. Below the
    // ceiling the stage falls back to CATHEDRAL — the fight can be re-entered,
    // the route stays TOWER so the chapel is gone for good, and the bust gets
    // its second conversation. At the ceiling it resolves exactly as before, so
    // `tower-lost` and everything downstream of it is untouched.
    //
    // Note this is the opposite of the CHAPEL, and deliberately: losing there
    // is still terminal (endSacrifice). That asymmetry is what the bust is
    // selling — its way is easier and survivable, and taking it costs you the
    // other way out.
    case 'CATHEDRAL_FIGHT_LOST': {
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT) return state;
      const defeats = Math.max(0, Math.floor(Number(state.finale.bust?.defeats) || 0)) + 1;
      const bust = { ...state.finale.bust, defeats };
      const cathedral = normalizeCathedral({ ...state.finale.cathedral, personalOpening: false,
        fight: state.finale.cathedral.fight ? { ...state.finale.cathedral.fight, retry: true } : null });
      if (defeats >= TOWER_DEFEAT_CEILING) {
        return { ...state, finale: { ...state.finale, bust, cathedral, stage: SOURCE_FINALE_STAGE.RESOLVED, result: SOURCE_FINALE_RESULT.LOST } };
      }
      return { ...state, finale: { ...state.finale, bust, cathedral, stage: SOURCE_FINALE_STAGE.CATHEDRAL, result: null } };
    }

    case 'CATHEDRAL_BELL_RUNG': {
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.CATHEDRAL) return state;
      const cathedral = normalizeCathedral(state.finale.cathedral);
      return { ...state, finale: { ...state.finale, cathedral: { ...cathedral, alarm: Math.min(CATHEDRAL_ALARM_CEILING, cathedral.alarm + 1) } } };
    }

    case 'CATHEDRAL_STAGED': {
      if (state.finale.route !== SOURCE_FINALE_ROUTE.TOWER || state.finale.stage !== SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT
        || !CATHEDRAL_DAMAGE_MARKS.includes(event.mark)) return state;
      const cathedral = normalizeCathedral(state.finale.cathedral);
      if (cathedral.damage.includes(event.mark)) return state;
      return { ...state, finale: { ...state.finale, cathedral: normalizeCathedral({ ...cathedral, damage: [...cathedral.damage, event.mark] }) } };
    }

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
    sourceApproachDistance: state.sourceApproachDistance,
    sourceApproachComplete: state.sourceApproachComplete,
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
