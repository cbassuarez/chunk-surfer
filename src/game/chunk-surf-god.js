import { CELL } from '../data/floorplan/legend.js';
import { SOURCE_APPROACH_CELLS, SOURCE_BELLS, SOURCE_CHUTES, SOURCE_HORIZON, SOURCE_PRE_TAPE, SOURCE_TIER_BY_ID } from '../data/source-level.js';
import {
  CHUNK_SURF_PHASE,
  SOURCE_PURSUIT_BEAT,
  freshChunkSurfState,
  reduceChunkSurf,
} from './chunk-surf-state.js';

export const CHUNK_SURF_GOD_PRESET = Object.freeze({
  HALL_ENTRY: 'hall-entry',
  HALL_STORM: 'hall-storm',
  HAYSTACK: 'haystack',
  LANDING: 'landing',
  FIRST_LIFT: 'first-lift',
  FIRST_CONTACT: 'first-contact',
  ALL_INSIGHTS: 'all-insights',
  EXPOSED_BATTLE: 'exposed-battle',
  NORMAL_EXIT: 'normal-exit',
  LANDSCAPE: 'landscape',
  HUNT: 'hunt',
  FINAL_RUN: 'final-run',
  FINAL: 'final',
});

const HAYSTACK_ORIGIN = Object.freeze({ x: 0, y: -224 });
// The god presets stand the body at authored depths in the field. Every one of
// these below the arrival tier moved out by SOURCE_APPROACH_CELLS when the red
// approach was inserted between the Scene Dock and the first staircase.
const LANDSCAPE_ORIGIN = Object.freeze({ x: 0, y: -252 });
const FIRST_STAIR = SOURCE_CHUTES.find((chute) => chute.id === 'chute-fork');
const localPosition = (x, y, facing = 0) => ({
  x: LANDSCAPE_ORIGIN.x + x,
  y: LANDSCAPE_ORIGIN.y + y,
  facing,
});

const dispatch = (state, ...events) => events.reduce((next, event) => reduceChunkSurf(next, event), state);

export function buildChunkSurfGodPreset(id, options = {}) {
  const forceRig = [CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE, CHUNK_SURF_GOD_PRESET.FINAL].includes(id);
  // Every preset walks in already hurt. Warping past the building means warping
  // past the night that hurt him, and without this the fault at the final page
  // is closed for reasons a god warp can never satisfy. See sourceBossAvailable().
  const injuries = Number.isFinite(Number(options.injuries)) ? Number(options.injuries) : 1;
  // These presets default to a kitted recordist because that is the interesting
  // shape of the fight — but the rig is an advantage now, not a key, so an
  // explicit hasRig:false has to survive. See applyRigAdvantage().
  let state = reduceChunkSurf(freshChunkSurfState({ ...options, hasRig: options.hasRig ?? forceRig }), {
    type: 'SOURCE_ENTERED',
    returnPoint: options.returnPoint || null,
    injuries,
  });
  let position = { x: 0, y: 0, facing: 0 };

  if (id === CHUNK_SURF_GOD_PRESET.HALL_ENTRY) return { state, position };

  if (id === CHUNK_SURF_GOD_PRESET.HALL_STORM) {
    state = reduceChunkSurf(state, { type: 'HALL_ADVANCED', distance: 96 });
    position = { x: 0, y: -96 / CELL, facing: 0 };
    return { state, position };
  }

  state = dispatch(state,
    { type: 'HALL_ADVANCED', distance: 112 },
    { type: 'HAYSTACK_REACHED', origin: HAYSTACK_ORIGIN },
  );
  if (id === CHUNK_SURF_GOD_PRESET.HAYSTACK) {
    position = { x: 0, y: HAYSTACK_ORIGIN.y + 6, facing: 0 };
    return { state, position };
  }

  state = dispatch(state,
    { type: 'HAYSTACK_PAGE_FOUND', landscapeOrigin: LANDSCAPE_ORIGIN },
    { type: 'TRANSFORMATION_COMPLETED' },
  );
  if (id === CHUNK_SURF_GOD_PRESET.LANDSCAPE || id === CHUNK_SURF_GOD_PRESET.LANDING) {
    position = { x: LANDSCAPE_ORIGIN.x + 1, y: LANDSCAPE_ORIGIN.y + 1, facing: 0 };
    return { state, position };
  }

  // This hook means the approach to the first lift. It previously dispatched
  // its completion and dropped the player forty-eight cells into the field,
  // turning on the entire Text Space compositor in the same frame as the warp.
  // Apart from being the wrong review location, that was the heaviest possible
  // Source initialization path and could take the renderer down with it.
  if (id === CHUNK_SURF_GOD_PRESET.FIRST_LIFT) {
    state = dispatch(state,
      { type: 'SOURCE_LANDING_DOOR_OPENED' },
      { type: 'SOURCE_LANDING_DOOR_SEALED' },
      { type: 'SOURCE_APPROACH_COMPLETED', distance: SOURCE_APPROACH_CELLS },
    );
    position = localPosition(FIRST_STAIR?.x || 0, (FIRST_STAIR?.y || SOURCE_TIER_BY_ID.fork.from)
      + (FIRST_STAIR?.run || 16) + 2);
    return { state, position };
  }

  state = dispatch(state,
    { type: 'SOURCE_LIFT_COMPLETED', id: 'lift-fork', checkpointId: 'landing-fork' },
  );
  if (id === CHUNK_SURF_GOD_PRESET.FIRST_CONTACT) {
    position = localPosition(0, SOURCE_TIER_BY_ID.fork.from - 8);
    return { state, position };
  }

  if ([CHUNK_SURF_GOD_PRESET.ALL_INSIGHTS, CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE,
    CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, CHUNK_SURF_GOD_PRESET.FINAL].includes(id)) {
    state = dispatch(state, {
      type: 'SOURCE_CONTACT_RESOLVED',
      checkpointId: 'landing-fork',
      contact: {
        schema: 1,
        captures: 3,
        insights: ['music-human-name', 'surfer-vessel', 'borrowed-body-return'],
        seenBeats: ['music-1', 'vessel-1', 'body-1'],
        lastChoiceId: 'body-return',
      },
    });
    if (id === CHUNK_SURF_GOD_PRESET.ALL_INSIGHTS) {
      position = localPosition(0, SOURCE_TIER_BY_ID.trace.from - 8);
      return { state, position };
    }
  }

  state = dispatch(state,
    { type: 'LANDMARK_VISITED', id: 'fork-room' },
    { type: 'CHECKPOINT_SET', id: 'fork-room' },
    { type: 'LANDMARK_VISITED', id: 'recordist-loop' },
    { type: 'CHECKPOINT_SET', id: 'recordist-loop' },
    { type: 'PURSUIT_STARTED', id: SOURCE_PURSUIT_BEAT.BODY_RUN },
  );
  if (id === CHUNK_SURF_GOD_PRESET.HUNT) {
    position = localPosition(0, (SOURCE_TIER_BY_ID.trace.from + SOURCE_TIER_BY_ID.trace.to) / 2);
    return { state, position };
  }

  state = dispatch(state,
    { type: 'PURSUIT_CLEARED', id: SOURCE_PURSUIT_BEAT.BODY_RUN },
    { type: 'LANDMARK_VISITED', id: 'surfer-origin' },
    { type: 'LANDMARK_VISITED', id: 'work-order-loop' },
    { type: 'LANDMARK_VISITED', id: 'body-room' },
    { type: 'CHECKPOINT_SET', id: 'body-room' },
    { type: 'PURSUIT_STARTED', id: SOURCE_PURSUIT_BEAT.FINAL_RUN },
  );
  if (id === CHUNK_SURF_GOD_PRESET.FINAL_RUN) {
    position = localPosition(44, SOURCE_TIER_BY_ID.return.from - 58);
    return { state, position };
  }
  state = dispatch(state,{ type: 'FINAL_REACHED' });
  if (![CHUNK_SURF_GOD_PRESET.FINAL, CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE,
    CHUNK_SURF_GOD_PRESET.NORMAL_EXIT].includes(id) || state.phase !== CHUNK_SURF_PHASE.FINAL) {
    throw new Error(`unknown source-space God preset ${id}`);
  }
  const exitOffset = id === CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE ? 5 : -5;
  position = localPosition(80 + exitOffset, SOURCE_TIER_BY_ID.return.to + 26);
  return { state, position };
}

// OUT ON THE TAPE, AT A GIVEN DEPTH.
//
// Separate from the preset table because the horizon is not a checkpoint on the
// spine — it is a continuum, and the useful thing to warp to is a DISTANCE
// along it: the head where the sun is still coming up, the middle where the
// bust is, the tail where the picture collapses.
export function buildHorizonGodPreset(depth = 0, options = {}) {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, options);
  const state = reduceChunkSurf(built.state, { type: 'SOURCE_NORMAL_EXIT' });
  const along = Math.max(0, Math.min(SOURCE_HORIZON.length, Number(depth) || 0));
  return {
    state: reduceChunkSurf(state, { type: 'HORIZON_ADVANCED', depth: along }),
    position: {
      x: LANDSCAPE_ORIGIN.x,
      y: LANDSCAPE_ORIGIN.y + SOURCE_HORIZON.from - Math.max(SOURCE_HORIZON.entryStandoff, along),
      facing: 0,
    },
  };
}

// THE WALK OUT OF THE FIELD, by depth from the perimeter. Same phase as the
// tape and short of it, which is a position buildHorizonGodPreset cannot express
// because sourceHorizonDepth clamps at zero.
export function buildPreTapeGodPreset(depth = 0, options = {}) {
  const built = buildHorizonGodPreset(0, options);
  const along = Math.max(0, Math.min(SOURCE_PRE_TAPE.length, Number(depth) || 0));
  return {
    state: built.state,
    position: {
      x: LANDSCAPE_ORIGIN.x,
      y: LANDSCAPE_ORIGIN.y + SOURCE_PRE_TAPE.from - Math.max(SOURCE_PRE_TAPE.entryStandoff, along),
      facing: 0,
    },
  };
}

export const PRE_TAPE_GOD_STOPS = Object.freeze([
  { id: 'pre-tape-edge', label: 'OUT — THE FIELD ENDS', depth: SOURCE_PRE_TAPE.entryStandoff },
  { id: 'pre-tape-thinning', label: 'OUT — THE OUTSKIRTS', depth: 90 },
  { id: 'pre-tape-nothing', label: 'OUT — NOTHING', depth: 260 },
  { id: 'pre-tape-seam', label: 'OUT — THE HEAD OF THE TAPE', depth: 352 },
]);

// THE BELL PASSAGE, addressed by depth like the tape it hangs off.
//
// Getting here in play is horizon -> recognise the bust -> accept it -> take the
// tower. Three reducer steps, and without them there is no way to review four
// hundred metres of walk without playing an hour to reach it.
export function buildBellsGodPreset(depth = 0, options = {}) {
  const horizon = buildHorizonGodPreset(168, options);
  let state = reduceChunkSurf(horizon.state, { type: 'HORIZON_BUST_RECOGNIZED', eligible: true });
  state = reduceChunkSurf(state, { type: 'HORIZON_BUST_DECIDED', decision: 'accepted' });
  state = reduceChunkSurf(state, { type: 'HORIZON_EXIT_CHOSEN', exit: 'tower' });
  const along = Math.max(0, Math.min(SOURCE_BELLS.length, Number(depth) || 0));
  return {
    state,
    position: {
      x: LANDSCAPE_ORIGIN.x,
      y: LANDSCAPE_ORIGIN.y + SOURCE_BELLS.from - Math.max(SOURCE_BELLS.entryStandoff, along),
      facing: 0,
    },
  };
}

// The three acts, by the depths they actually occupy.
export const BELLS_GOD_STOPS = Object.freeze([
  { id: 'bells-head', label: 'BELLS — HEAD OF THE PASSAGE', depth: SOURCE_BELLS.entryStandoff },
  { id: 'bells-architecture', label: 'BELLS — ARCHITECTURE', depth: 90 },
  { id: 'bells-null', label: 'BELLS — WHERE TIME IS NULL', depth: 200 },
  { id: 'bells-ring', label: 'BELLS — THE RING', depth: 330 },
  { id: 'bells-door', label: 'BELLS — THE MISSING WALL', depth: 410 },
]);

export const HORIZON_GOD_STOPS = Object.freeze([
  { id: 'horizon-head', label: 'HORIZON — HEAD OF TAPE', depth: SOURCE_HORIZON.entryStandoff },
  { id: 'horizon-bust', label: 'HORIZON — THE BUST', depth: 168 },
  { id: 'horizon-tail', label: 'HORIZON — COLLAPSE', depth: SOURCE_HORIZON.length * 0.94 },
]);
