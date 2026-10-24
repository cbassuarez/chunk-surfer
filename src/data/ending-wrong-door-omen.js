import { SOURCE_EARTHFALL as EARTH } from './source-earthfall.js';

// Presentation of the wrong-door ending reuses the two established omens. It
// never owns the fall, support, save checkpoint, punishment or destination.
export const ENDING_WRONG_DOOR_OMEN = Object.freeze({
  sequenceId: 'ending-wrong-door:omens-v1',
  releaseAt: 3.15,
  occupationFrom: 4.55,
  occupationTo: 5.25,
  origin: Object.freeze({ x: -19.1, z: 15.7 }),
  min: Object.freeze([EARTH.catch.minX - 1, -.6, EARTH.catch.minZ - 1]),
  max: Object.freeze([EARTH.catch.maxX + 1, EARTH.upperFloor + 42, EARTH.catch.maxZ + 1]),
});

const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = n => Math.max(0, Math.min(1, finite(n)));
const smooth = n => { const p = clamp(n); return p * p * (3 - 2 * p); };
const mix = (a, b, p) => a + (b - a) * p;
const PLAN = ENDING_WRONG_DOOR_OMEN;

// The released presence follows a fixed free-fall plane through the shaft,
// not the eye. Turning, walking and changing camera height cannot move it.
export function endingWrongDoorFlowHeight(elapsed) {
  const age = Math.max(0, finite(elapsed) - EARTH.footingLossAt);
  const accelerationSeconds = Math.min(age, EARTH.terminalSpeed / EARTH.gravity);
  const distance = EARTH.gravity * accelerationSeconds ** 2 / 2
    + EARTH.terminalSpeed * Math.max(0, age - accelerationSeconds);
  return Math.max(EARTH.lowerFloor, EARTH.upperFloor - distance);
}

export function endingWrongDoorOmenFrame(value = {}, presentation = {}) {
  const player = value.player || value;
  const elapsed = Math.max(0, finite(value.elapsed));
  const protectedPresentation = !!presentation.protected || !!presentation.suspended
    || !!presentation.hidden || presentation.focused === false;
  const effectsOff = presentation.effectsMode === 'off' || presentation.flashMode === 'off';
  const landed = value.phase === 'landed' || value.status === 'completed';
  const released = !!value.committed && !landed && !protectedPresentation && !effectsOff;
  const progress = released && ['falling', 'catching'].includes(value.phase)
    ? smooth((elapsed - PLAN.occupationFrom) / (PLAN.occupationTo - PLAN.occupationFrom)) : 0;
  // A finite volume advances from the released opening across the same shaft.
  // Its limits depend on lived event time, never on the observer's pose.
  const min = [mix(PLAN.origin.x - 1, PLAN.min[0], progress), PLAN.min[1],
    mix(PLAN.origin.z - 1, PLAN.min[2], progress)];
  const max = [mix(PLAN.origin.x + 1, PLAN.max[0], progress), PLAN.max[1],
    mix(PLAN.origin.z + 1, PLAN.max[2], progress)];
  const eye = [finite(player.x), finite(player.feet ?? player.y) + EARTH.eyeHeight, finite(player.z)];
  const occupied = progress > 0 && eye.every((n, i) => n > min[i] && n < max[i]);
  return {
    sequenceId: PLAN.sequenceId, elapsed, released, landed, effectsOff,
    reduced: !!presentation.reducedMotion || !!presentation.reduceMotion
      || presentation.shakeMode === 'off' || !!presentation.reducedDread || presentation.effectsMode === 'reduced',
    flowHeight: endingWrongDoorFlowHeight(elapsed), progress, occupied,
    bounds: progress > 0 ? { min, max } : null,
  };
}
