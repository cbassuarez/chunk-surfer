// COVER, AND HOW FAR YOU MAY LEAN OUT OF IT.
//
// The building already hid you and never said so. Standing still costs
// NOISE.still, which is zero (config.js), and the presence has never known where
// you are — it holds a belief about where a SOUND was and searches that
// (presence.js). So a man who stops moving and kills his torch is already
// concealed. What he has never had is a position: somewhere to be behind, and a
// way to look out of it without stepping into the room.
//
// This module answers exactly two questions and owns no state:
//
//   · Am I against something I could be behind, and which way does it open?
//   · If I lean my head that way, where does my eye stop?
//
// Neither answer may be an opinion about the HUSH. Concealment never tells it
// anything (that law is written at presence.js:5-9); it only withholds. So there
// is nothing in here that knows a monster exists.
//
// Pure, and takes the same small plan-reader as world/wall-contact.js rather
// than importing the floorplan singleton, so the rules are checkable against a
// grid you can read. Needs: size(), isSolid(x,y), floorAt(x,y), and whatever
// wallContactAt wants.

import { wallContactAt, WALL_CONTACT } from '../world/wall-contact.js';

export const COVER = Object.freeze({
  CELL_METRES: WALL_CONTACT.CELL_METRES,

  // How close the face has to be before you are "against" it. Two thirds of a
  // cell: close enough that the prompt means this wall and not the room.
  REACH_M: 0.34,

  // A RISER IS NOT COVER. `facesWall` in wall-contact counts any neighbour whose
  // floor is 2cm higher, because a base course has to run up to a step. Two
  // centimetres is not something to get behind. Anything short of chest height
  // is scenery you are standing next to, so this is the one place the two
  // modules deliberately disagree.
  MIN_HEIGHT_M: 0.95,

  // A shoulder lean, not a sidestep. The body does not leave the cell — this is
  // the head going past the corner and nothing else. Beyond about half a metre
  // it stops reading as leaning and starts reading as a bug in the collision.
  MAX_LEAN_M: 0.45,

  // The camera is a point and a wall is not. Without this the eye grazes the
  // plaster and the raymarch shows you the inside of it.
  EYE_MARGIN_M: 0.11,

  // Step for the lean march. 4cm: finer than the margin, so nothing tunnels.
  MARCH_M: 0.04,
});

// The four outward normals, in the order wall-contact yields its steps.
const NORMALS = Object.freeze([
  { nx: 1, ny: 0 }, { nx: -1, ny: 0 }, { nx: 0, ny: 1 }, { nx: 0, ny: -1 },
]);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The two ways along a wall face. A face whose normal runs in x is a wall you
// slide along in y, and the other way round.
export function coverAxis(nx, ny) {
  return nx ? { x: 0, y: 1 } : { x: 1, y: 0 };
}

// The cell the wall itself is in: back through the outward normal.
function wallCellOf(cover) {
  return { x: cover.cell.x - cover.nx, y: cover.cell.y - cover.ny };
}

// Is the thing on the other side of this face tall enough to be behind?
function isRealCover(plan, cell, nx, ny, minHeight) {
  const wx = cell.x - nx, wy = cell.y - ny;
  const size = plan.size?.() ?? plan.planSize?.() ?? { w: 0, h: 0 };
  // Off the edge of the world is rock, and rock goes all the way up.
  if (wx < 0 || wy < 0 || wx >= size.w || wy >= size.h) return true;
  if (plan.isSolid(wx, wy)) return true;
  const rise = (Number(plan.floorAt?.(wx, wy)) || 0) - (Number(plan.floorAt?.(cell.x, cell.y)) || 0);
  return rise >= minHeight;
}

/**
 * The cover at a position, or null.
 *
 * `x,y` are logical cells and may be fractional. Returns the face you are
 * against, the axis you may lean along, and the wall cell behind you — which is
 * the cell a peek's noise is filed against, because you are only ever where you
 * were (recordist.js).
 *
 * `searchCells` is deliberately 1 by default: this runs every frame, and
 * wall-contact's own default of 8 is a 17x17x4 scan.
 */
export function resolveCover(plan, x, y, {
  searchCells = 1,
  cellMetres = COVER.CELL_METRES,
  reachM = COVER.REACH_M,
  minHeightM = COVER.MIN_HEIGHT_M,
  prefer = null,
} = {}) {
  // Ask each normal separately rather than taking wall-contact's single nearest.
  // The nearest face can be a 3cm riser you cannot get behind, and letting that
  // answer stand would report "no cover" while you are stood against a wall.
  const normals = prefer ? [prefer] : NORMALS;
  let best = null;
  for (const n of normals) {
    const contact = wallContactAt(plan, x, y, { searchCells, cellMetres, prefer: n });
    if (!contact || contact.gap > reachM) continue;
    if (!isRealCover(plan, contact.cell, contact.nx, contact.ny, minHeightM)) continue;
    if (best && contact.cells >= best.cells) continue;
    best = contact;
  }
  if (!best) return null;
  return {
    ...best,
    axis: coverAxis(best.nx, best.ny),
    wallCell: wallCellOf(best),
  };
}

/**
 * How far the wall you are behind keeps going, in cells, each way along its own
 * axis — and therefore where the corner is.
 *
 * `Infinity` means it runs to the edge of the search: nothing to look around
 * that way. `0` means the wall stops right here and you are already at the
 * corner. `null` means you could not slide that way at all (the cell beside you
 * is itself solid), which is an inside corner — a dead end for a peek.
 *
 * This is information for the player, not a gate. Leaning the boring way is
 * allowed; it just shows you more wall.
 */
export function coverOpenings(plan, cover, { limitCells = 8 } = {}) {
  const out = { positive: null, negative: null };
  if (!cover) return out;
  const { x: ax, y: ay } = cover.axis;
  const { nx, ny } = cover;
  const size = plan.size?.() ?? plan.planSize?.() ?? { w: 0, h: 0 };
  const solid = (cx, cy) => (
    cx < 0 || cy < 0 || cx >= size.w || cy >= size.h ? true : !!plan.isSolid(cx, cy)
  );

  for (const sign of [1, -1]) {
    const key = sign > 0 ? 'positive' : 'negative';
    let reach = Infinity;
    for (let k = 1; k <= limitCells; k++) {
      const sx = cover.cell.x + ax * sign * k, sy = cover.cell.y + ay * sign * k;
      // You cannot slide into rock: that is an inside corner, not an opening.
      if (solid(sx, sy)) { reach = k === 1 ? null : k - 1; break; }
      // The wall beside you gave out. That is the corner, and it is k cells away.
      if (!solid(sx - nx, sy - ny)) { reach = k - 1; break; }
    }
    out[key] = reach;
  }
  return out;
}

/**
 * How far the eye may travel along a direction before it is inside something.
 *
 * `dirX,dirY` is the camera's right vector in logical cells (it need not be
 * normalised). Returns cells, never more than `maxLeanCells`, never negative.
 *
 * `solidAt` is overridable so the caller can fold in the things the plan does
 * not know about — a closed door leaf, a blocking prop. It is asked in logical
 * cells and answers for the cell containing the point.
 */
export function leanLimit(plan, x, y, dirX, dirY, {
  maxLeanCells = COVER.MAX_LEAN_M / COVER.CELL_METRES,
  marginCells = COVER.EYE_MARGIN_M / COVER.CELL_METRES,
  stepCells = COVER.MARCH_M / COVER.CELL_METRES,
  solidAt = null,
} = {}) {
  const len = Math.hypot(dirX, dirY);
  if (!(len > 1e-6) || !(maxLeanCells > 0)) return 0;
  const ux = dirX / len, uy = dirY / len;
  const size = plan.size?.() ?? plan.planSize?.() ?? { w: 0, h: 0 };
  const blocked = solidAt || ((cx, cy) => (
    cx < 0 || cy < 0 || cx >= size.w || cy >= size.h ? true : !!plan.isSolid(cx, cy)
  ));
  const hits = (px, py) => blocked(Math.floor(px), Math.floor(py));

  let safe = 0;
  for (let t = stepCells; t <= maxLeanCells + 1e-9; t += stepCells) {
    // Probe the margin ahead of the eye, so the camera stops short of the face
    // rather than on it.
    const probe = t + marginCells;
    if (hits(x + ux * probe, y + uy * probe)) break;
    safe = t;
  }
  // The last step rarely lands exactly on maxLean; if the full extent is clear,
  // give it, so the cap is the cap and not the cap minus a rounding error.
  if (safe > 0 && safe < maxLeanCells
      && !hits(x + ux * (maxLeanCells + marginCells), y + uy * (maxLeanCells + marginCells))) {
    safe = maxLeanCells;
  }
  return clamp(safe, 0, maxLeanCells);
}

/**
 * The whole peek, resolved: where the eye actually sits for a requested lean.
 *
 * `request` is -1..1 — how hard the player is pushing, signed along the camera's
 * right vector. The return carries the clamped scalar in cells so the renderer
 * can offset the camera and nothing else; the body never moves.
 */
export function resolvePeek(plan, cover, x, y, rightX, rightY, request, opts = {}) {
  const want = clamp(Number(request) || 0, -1, 1);
  if (!cover || want === 0) return { lean: 0, limit: 0, clamped: false };
  const sign = want < 0 ? -1 : 1;
  const limit = leanLimit(plan, x, y, rightX * sign, rightY * sign, opts);
  const maxLean = opts.maxLeanCells ?? (COVER.MAX_LEAN_M / COVER.CELL_METRES);
  const lean = sign * Math.min(Math.abs(want) * maxLean, limit);
  return { lean, limit, clamped: Math.abs(want) * maxLean > limit + 1e-9 };
}
