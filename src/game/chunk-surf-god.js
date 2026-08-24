import { CELL } from '../data/floorplan/legend.js';
import { SOURCE_HORIZON } from '../data/source-level.js';
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
const LANDSCAPE_ORIGIN = Object.freeze({ x: 0, y: -252 });

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

  state = dispatch(state,
    { type: 'SOURCE_LIFT_COMPLETED', id: 'lift-fork', checkpointId: 'landing-fork' },
  );
  if (id === CHUNK_SURF_GOD_PRESET.FIRST_LIFT || id === CHUNK_SURF_GOD_PRESET.FIRST_CONTACT) {
    position = { x: LANDSCAPE_ORIGIN.x, y: LANDSCAPE_ORIGIN.y - 48, facing: 0 };
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
      position = { x: LANDSCAPE_ORIGIN.x, y: LANDSCAPE_ORIGIN.y - 128, facing: 0 };
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
    position = { x: LANDSCAPE_ORIGIN.x, y: LANDSCAPE_ORIGIN.y - 182, facing: 0 };
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
    position = { x: LANDSCAPE_ORIGIN.x + 44, y: LANDSCAPE_ORIGIN.y - 278, facing: 0 };
    return { state, position };
  }
  state = dispatch(state,{ type: 'FINAL_REACHED' });
  if (![CHUNK_SURF_GOD_PRESET.FINAL, CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE,
    CHUNK_SURF_GOD_PRESET.NORMAL_EXIT].includes(id) || state.phase !== CHUNK_SURF_PHASE.FINAL) {
    throw new Error(`unknown source-space God preset ${id}`);
  }
  const exitOffset = id === CHUNK_SURF_GOD_PRESET.EXPOSED_BATTLE ? 5 : -5;
  position = { x: LANDSCAPE_ORIGIN.x + 80 + exitOffset, y: LANDSCAPE_ORIGIN.y - 314, facing: 0 };
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

export const HORIZON_GOD_STOPS = Object.freeze([
  { id: 'horizon-head', label: 'HORIZON — HEAD OF TAPE', depth: SOURCE_HORIZON.entryStandoff },
  { id: 'horizon-bust', label: 'HORIZON — THE BUST', depth: 168 },
  { id: 'horizon-tail', label: 'HORIZON — COLLAPSE', depth: SOURCE_HORIZON.length * 0.94 },
]);
