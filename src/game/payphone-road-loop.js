// The unanswered phone repeats a place, not the player's movement. This pure
// plan says only how far its coordinate frame must translate. The host keeps
// ownership of the camera spring, input, props, acoustics and narrative flags.
import { CELL } from '../data/floorplan/legend.js';
import { OUTSKIRT_STRETCH_METRES, OUTSKIRT_STRETCH_START } from '../data/source-outskirts-arrival.js';
import { PAYPHONE_PASS } from './payphone.js';

export const PAYPHONE_LOOP_ROUTE = Object.freeze({
  pass: PAYPHONE_PASS.loop,
  start: OUTSKIRT_STRETCH_START + PAYPHONE_PASS.loop * OUTSKIRT_STRETCH_METRES,
  period: OUTSKIRT_STRETCH_METRES,
  end: OUTSKIRT_STRETCH_START + (PAYPHONE_PASS.loop + 1) * OUTSKIRT_STRETCH_METRES,
});

// Positive along is forward down the road, hence negative world Z. Rebasing a
// forward crossing moves the coordinate frame towards positive world Z / cell
// Y. Every visible/audible anchor and camera sample must receive that same
// translation. Keeping their relative positions is a host integration contract,
// not something this planner can establish by moving the player alone.
export function planPayphoneRoadLoop({
  along,
  holding = false,
  occupied = false,
  cellMetres = CELL,
} = {}) {
  if (!holding || occupied || !Number.isFinite(along)
    || !Number.isFinite(cellMetres) || cellMetres <= 0
    || along < PAYPHONE_LOOP_ROUTE.end) return null;
  const periods = Math.max(1, Math.floor((along - PAYPHONE_LOOP_ROUTE.start) / PAYPHONE_LOOP_ROUTE.period));
  const distance = periods * PAYPHONE_LOOP_ROUTE.period;
  return {
    fromAlong: along,
    toAlong: along - distance,
    periods,
    deltaAlong: -distance,
    deltaWorldZ: distance,
    deltaRuntimeY: distance / cellMetres,
  };
}
