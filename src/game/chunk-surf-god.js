import { CELL } from '../data/floorplan/legend.js';
import {
  CHUNK_SURF_PHASE,
  freshChunkSurfState,
  reduceChunkSurf,
} from './chunk-surf-state.js';

export const CHUNK_SURF_GOD_PRESET = Object.freeze({
  HALL_ENTRY: 'hall-entry',
  HALL_STORM: 'hall-storm',
  HAYSTACK: 'haystack',
  LANDSCAPE: 'landscape',
  HUNT: 'hunt',
  FINAL: 'final',
});

const HAYSTACK_ORIGIN = Object.freeze({ x: 0, y: -224 });
const LANDSCAPE_ORIGIN = Object.freeze({ x: 0, y: -252 });

const dispatch = (state, ...events) => events.reduce((next, event) => reduceChunkSurf(next, event), state);

export function buildChunkSurfGodPreset(id, options = {}) {
  let state = reduceChunkSurf(freshChunkSurfState(options), {
    type: 'SOURCE_ENTERED',
    returnPoint: options.returnPoint || null,
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
  if (id === CHUNK_SURF_GOD_PRESET.LANDSCAPE) {
    position = { x: LANDSCAPE_ORIGIN.x, y: LANDSCAPE_ORIGIN.y, facing: 0 };
    return { state, position };
  }

  state = dispatch(state,
    { type: 'LANDMARK_TUNED', id: 'fork-room' },
    { type: 'CHECKPOINT_SET', id: 'fork-room' },
    { type: 'LANDMARK_TUNED', id: 'recordist-loop' },
    { type: 'CHECKPOINT_SET', id: 'recordist-loop' },
    { type: 'HUSH_HUNT_STARTED' },
  );
  if (id === CHUNK_SURF_GOD_PRESET.HUNT) {
    position = { x: LANDSCAPE_ORIGIN.x, y: LANDSCAPE_ORIGIN.y - 50, facing: 0 };
    return { state, position };
  }

  state = dispatch(state,
    { type: 'LANDMARK_TUNED', id: 'body-room' },
    { type: 'LANDMARK_RECORDED', id: 'body-room' },
    { type: 'CHECKPOINT_SET', id: 'body-room' },
    { type: 'FINAL_REACHED' },
  );
  if (id !== CHUNK_SURF_GOD_PRESET.FINAL || state.phase !== CHUNK_SURF_PHASE.FINAL) {
    throw new Error(`unknown source-space God preset ${id}`);
  }
  position = { x: LANDSCAPE_ORIGIN.x + 40, y: LANDSCAPE_ORIGIN.y - 98, facing: 0 };
  return { state, position };
}
