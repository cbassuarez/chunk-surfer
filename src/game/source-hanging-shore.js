import {
  SOURCE_HANGING_SHORE as SHORE,
  sourceShoreContains,
  sourceShoreDistance,
} from '../data/source-hanging-shore.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const PHASES = new Set(['upper', 'lowering', 'waiting', 'boarding', 'rising', 'obstructed']);
const BODY_MARGIN = .27;
const HEAD_CLEARANCE = 2.15;

export function normalizeSourceShore(value = null) {
  const state = value && typeof value === 'object' ? value : {};
  return {
    version: 1,
    phase: PHASES.has(state.phase) ? state.phase : 'upper',
    floor: clamp(state.floor ?? SHORE.lift.top, 0, SHORE.lift.top),
    boardElapsed: clamp(state.boardElapsed, 0, SHORE.lift.boardingSeconds),
    bodyFloor: clamp(state.bodyFloor, 0, SHORE.lift.top),
    falling: !!state.falling,
    fallVelocity: clamp(state.fallVelocity, 0, 30),
    boarded: !!state.boarded && !state.falling,
    // The body has ridden the deck to the ledge. Saves from before this field
    // carry the retired `adapted` instead, which only a walked shore ever set.
    ridden: !!state.ridden || !!state.adapted,
    // How far the Scene Dock has been taken back, 0 to 1. It only goes one way.
    roomTaken: clamp(state.roomTaken, 0, 1),
    // The pieces of the building already gone behind you.
    gone: [...new Set((Array.isArray(state.gone) ? state.gone : []).filter((id) => typeof id === 'string'))],
  };
}

// Own only vertical support and the patient receiving deck. Horizontal movement
// and the camera remain with the normal player controller throughout the ride.
export function createSourceHangingShore(initial = null) {
  let state = normalizeSourceShore(initial);
  const onDeck = (x, z) => sourceShoreContains(SHORE.lift, x, z, BODY_MARGIN);
  const underneath = (x, z) => sourceShoreContains(SHORE.lift, x, z, -BODY_MARGIN);

  function updatePosition({ x, z, surfaceFloor = 0 }) {
    const attached = onDeck(x, z) && (state.boarded || Math.abs(state.bodyFloor - state.floor) < .28);
    if (attached && !state.falling) {
      state.boarded = true;
      state.bodyFloor = state.floor;
    } else {
      state.boarded = false;
      if (state.bodyFloor > surfaceFloor + .05) state.falling = true;
      else if (!state.falling) state.bodyFloor = surfaceFloor;
    }
  }

  function tick(dt, { x, z, surfaceFloor = 0 } = {}) {
    const elapsed = Number.isFinite(Number(dt)) ? Math.max(0, Number(dt)) : 0;
    let remaining = Math.min(elapsed, 10);
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      remaining -= step;
      const contained = onDeck(x, z);
      const near = sourceShoreDistance(SHORE.lift, x, z) <= SHORE.lift.callRadius;
      if (state.boarded && !contained) {
        state.boarded = false;
        state.falling = state.bodyFloor > surfaceFloor + .05;
      }
      if (state.falling) {
        state.fallVelocity += 12 * step;
        state.bodyFloor = Math.max(surfaceFloor, state.bodyFloor - state.fallVelocity * step);
        if (state.bodyFloor <= surfaceFloor + .001) {
          state.falling = false;
          state.fallVelocity = 0;
        }
      }
      if (state.boarded) {
        if (['waiting', 'lowering', 'obstructed'].includes(state.phase)) state.phase = 'boarding';
        if (state.phase === 'boarding') {
          state.boardElapsed += step;
          if (state.boardElapsed >= SHORE.lift.boardingSeconds) state.phase = 'rising';
        }
      } else {
        state.boardElapsed = 0;
        const upperCaller = surfaceFloor >= SHORE.lift.top - .3 && !state.falling;
        if (near && !upperCaller && state.floor > 0) state.phase = 'lowering';
        else if (near && upperCaller && state.floor < SHORE.lift.top) state.phase = 'rising';
      }
      if (state.phase === 'lowering') {
        // Boarding needs full containment; obstruction uses the complete deck
        // plus capsule radius, so its edge cannot descend through a bystander.
        if (underneath(x, z) && !state.boarded && state.bodyFloor < .3) {
          if (state.floor > HEAD_CLEARANCE) state.floor = Math.max(HEAD_CLEARANCE, state.floor - SHORE.lift.speed * step);
          if (state.floor <= HEAD_CLEARANCE) state.phase = 'obstructed';
        } else state.floor = Math.max(0, state.floor - SHORE.lift.speed * step);
        if (state.floor <= .001) {
          state.floor = 0;
          state.phase = 'waiting';
        }
      } else if (state.phase === 'rising') {
        state.floor = Math.min(SHORE.lift.top, state.floor + SHORE.lift.speed * step);
        if (state.floor >= SHORE.lift.top - .001) {
          state.floor = SHORE.lift.top;
          state.phase = 'upper';
        }
      }
      // The rear bar lets him step onto the ledge 0.3m short of the top.
      if (state.boarded && state.floor >= SHORE.lift.top - .3) state.ridden = true;
      if (state.boarded) state.bodyFloor = state.floor;
      else if (!state.falling) state.bodyFloor = surfaceFloor;
    }
    return frame();
  }

  function frame() {
    return { ...state, moving: state.phase === 'rising' || state.phase === 'lowering', progress: state.floor / SHORE.lift.top };
  }
  function takeRoom(amount) {
    state.roomTaken = clamp(state.roomTaken + Math.max(0, Number(amount) || 0), 0, 1);
    return state.roomTaken;
  }
  function takePiece(id) {
    if (!state.gone.includes(id)) state.gone = [...state.gone, id];
    return state.gone;
  }
  return { frame, snapshot: () => ({ ...state, gone: [...state.gone] }), updatePosition, tick, takeRoom, takePiece };
}
