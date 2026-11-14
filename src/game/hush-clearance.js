import { CELL } from '../data/floorplan/legend.js';
import { DOOR_FRAME_OPENINGS } from '../data/source-door-fields.js';
import { HUSH_POSTURE_NATIVE_HEIGHT_M } from '../data/generated/hush-last-posture-support.js';

// A read-only width estimate for the rendered density. This does not authorize
// a move, alter contact, or guarantee that the animated surface cannot overlap.
export const HUSH_CLEARANCE_LIMITS = Object.freeze({
  nativeWidthM: .90, nativeHeightM: HUSH_POSTURE_NATIVE_HEIGHT_M, marginM: .04,
  coarseSamplesPerSide: 6, refinementSamplesPerSide: 7,
  maximumNavigationProbes: 27,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = v => { const u = clamp(v, 0, 1); return u * u * (3 - 2 * u); };
const approachCells = Math.ceil(1.9 / CELL);

// Read the same portal, frame and leaf definitions as the visible Ellery door.
// The offset centres the *presentation* in the open span, independent of the
// cell lane used by the movement authority. Width alone cannot encode lintels.
export function hushDoorPosture({ point, physical, heading, doorAt, physicalPoint, arcYawOffset } = {}) {
  if (!point || !physical || !Number.isFinite(heading) || !doorAt || !physicalPoint) return null;
  const forward = [Math.sin(heading), -Math.cos(heading)];
  const root = [(physical.x + .5) * CELL, (physical.z + .5) * CELL];
  const seen = new Set();
  let best = null;
  for (let dy = -approachCells; dy <= approachCells; dy++) for (let dx = -approachCells; dx <= approachCells; dx++) {
    const portal = doorAt(point.x + dx, point.y + dy);
    if (!portal?.definition || !portal.open || seen.has(portal)) continue;
    seen.add(portal);
    const door = portal.definition, opening = DOOR_FRAME_OPENINGS[door.frameMesh];
    if (!opening) continue;
    const centre = physicalPoint(portal.cx, portal.cy);
    if (physical.layer !== centre.layer || Math.abs(physical.y - centre.y) > .23) continue;
    const yaw = (portal.widthAxis === 'x' ? 0 : Math.PI / 2)
      + (arcYawOffset?.(portal.cx, portal.cy, centre.x, centre.z) || 0);
    const across = [Math.cos(yaw), Math.sin(yaw)];
    const relative = [root[0] - centre.x * CELL, root[1] - centre.z * CELL];
    const along = relative[0] * across[0] + relative[1] * across[1];
    const depth = relative[0] * -across[1] + relative[1] * across[0];
    const normalAlignment = forward[0] * -across[1] + forward[1] * across[0];
    if (Math.abs(depth) > 1.9 || Math.abs(normalAlignment) < .45 && Math.abs(depth) > .75) continue;

    // Bound the open span using the post, inactive leaf and the corner of a
    // swung leaf, including the period when the collider is already passable.
    const fraction = portal.runtime.openFraction;
    const active = portal.activeLeaves || door.activeLeaves;
    let lo = -opening.width / 2, hi = opening.width / 2;
    for (let i = 0; i < door.leafCount; i++) {
      const left = door.leafCount === 2 ? i === 0 : door.hinge !== 'right';
      const angle = Math.PI * .49 * (active.includes(i) ? fraction : 0);
      const blocked = door.leaf.width * Math.cos(angle) + .5 * door.leaf.depth * Math.sin(angle) + .025;
      if (left) lo = Math.max(lo, -door.aperture.width / 2 + blocked);
      else hi = Math.min(hi, door.aperture.width / 2 - blocked);
    }
    const width = hi - lo, height = door.head === 'low-stone-lintel' ? 1.955 : opening.height;
    const nominalHeight = point.heightM || 2.18, scale = nominalHeight / HUSH_CLEARANCE_LIMITS.nativeHeightM;
    const amount = 1 - smooth((Math.abs(depth) - 1.18) / .72);
    if (amount <= 0 || best?.amount >= amount) continue;
    // Game yaw uses -Z at zero. Across-facing posture follows the horizontal
    // jamb axis, choosing a stable side even at an exactly perpendicular lane.
    const turn = yaw - Math.sign(normalAlignment || -depth || 1) * Math.PI / 2 - heading;
    const acrossHeading = Math.atan2(Math.sin(turn), Math.cos(turn));
    const drop = clamp(nominalHeight + .090 - height, 0, .26);
    // The turned knees still lead the deep bow. Balance that asymmetric
    // silhouette within the clear span before choosing a parallel body lane.
    const bendCentre = Math.sign(normalAlignment || 1) * scale * .105 * smooth((drop - .08) / .16);
    const centreOffset = (lo + hi) / 2 + bendCentre - along;
    if (width <= 0 || (width > 1.32 * scale && height > nominalHeight + .02)
      || Math.abs(centreOffset) > width / 2 + .13) continue;
    const shift = clamp(centreOffset, -.44, .44) * amount;
    best = { amount, turn: acrossHeading * amount, drop: drop * amount,
      x: across[0] * shift, z: across[1] * shift, lo, hi, height };
  }
  return best;
}

// Turn the carried posture before its shoulders enter a narrow throat. These
// two look-ahead samples are read-only; a solid wall ahead is not a passage and
// does not request a turn. The actual navigation root and AI bearing stay put.
// Each width estimate retains the <=27-probe bound above (81 total including
// the caller's current-width sample), plus two centre occupancy queries.
export function estimateHushApproachClearance(options = {}) {
  const { actor, navigation, logicalToPhysical, cellMetres = CELL } = options;
  const normal = Number.isFinite(options.currentClearanceM) && options.currentClearanceM >= 0
    ? options.currentClearanceM : estimateHushClearance(options);
  const heading = options.heading ?? actor?.gait?.heading ?? actor?.heading ?? 0;
  if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.y) || !Number.isFinite(heading)
    || typeof navigation?.isWalkable !== 'function' || typeof logicalToPhysical !== 'function') return normal;
  try {
    const dx = Math.sin(heading), dy = -Math.cos(heading), origin = logicalToPhysical(actor.x, actor.y);
    const probe = logicalToPhysical(actor.x + dx * .01, actor.y + dy * .01);
    const metresPerUnit = Math.hypot(probe.x - origin.x, probe.z - origin.z) * cellMetres / .01;
    if (!Number.isFinite(metresPerUnit) || metresPerUnit < 1e-8) return normal;
    let width = normal;
    for (const distance of [.4, .8]) {
      const ahead = { ...actor, x: actor.x + dx * distance / metresPerUnit, y: actor.y + dy * distance / metresPerUnit };
      if (navigation.isWalkable({ x: ahead.x, y: ahead.y }) !== true) break;
      width = Math.min(width, estimateHushClearance({ ...options, actor: ahead }));
    }
    return width;
  } catch { return normal; }
}

/**
 * Estimate a symmetric width around the accepted logical root, in metres.
 * `heading` is logical yaw: zero points toward -logicalY. `logicalToPhysical`
 * returns floorplan physical cells {x,z}; `cellMetres` converts those to metres.
 * The local mapping may rotate, reflect or scale the logical axes. It must be
 * locally continuous; a missing/singular mapping or failed query retains the
 * full default width. The three map reads and <=27 navigation reads are bounded.
 * Only `navigation.isWalkable` is read; no routes, cache or movement are touched.
 */
export function estimateHushClearance({
  actor, navigation, logicalToPhysical,
  heading = actor?.gait?.heading ?? actor?.heading ?? 0,
  heightM = actor?.heightM ?? HUSH_CLEARANCE_LIMITS.nativeHeightM,
  cellMetres = CELL,
} = {}) {
  const height = Number.isFinite(heightM) && heightM > 0 ? heightM : HUSH_CLEARANCE_LIMITS.nativeHeightM;
  const normalWidth = HUSH_CLEARANCE_LIMITS.nativeWidthM * height / HUSH_CLEARANCE_LIMITS.nativeHeightM;
  if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.y) || !Number.isFinite(heading)
    || typeof navigation?.isWalkable !== 'function' || typeof logicalToPhysical !== 'function'
    || !Number.isFinite(cellMetres) || cellMetres <= 0) return normalWidth;
  try {
    const x = actor.x, y = actor.y, delta = .01;
    const map = (lx, ly) => {
      const p = logicalToPhysical(lx, ly);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) throw new Error('unavailable physical mapping');
      return p;
    };
    const root = map(x, y), across = map(x + delta, y), down = map(x, y + delta);
    // An adjacent atlas layer is not a useful local derivative.
    for (const p of [across, down]) for (const key of ['renderGroup', 'layer']) {
      if (root[key] != null && p[key] != null && root[key] !== p[key]) throw new Error('mapping discontinuity');
    }
    const xx = (across.x - root.x) * cellMetres / delta, xy = (down.x - root.x) * cellMetres / delta;
    const zx = (across.z - root.z) * cellMetres / delta, zy = (down.z - root.z) * cellMetres / delta;
    const det = xx * zy - xy * zx;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-8) return normalWidth;
    const fx = xx * Math.sin(heading) - xy * Math.cos(heading);
    const fz = zx * Math.sin(heading) - zy * Math.cos(heading), length = Math.hypot(fx, fz);
    if (!(length > 1e-8)) return normalWidth;
    // Physical right is perpendicular to the mapped heading, including when
    // the map stretches the two logical axes by different amounts.
    const rx = -fz / length, rz = fx / length;
    const lx = (zy * rx - xy * rz) / det, ly = (-zx * rx + xx * rz) / det;
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) return normalWidth;
    const walkable = (distance, side) => {
      const result = navigation.isWalkable({ x: x + lx * distance * side, y: y + ly * distance * side });
      if (result !== true && result !== false) throw new Error('unavailable walkability');
      return result;
    };
    if (!walkable(0, 1)) return normalWidth;
    const radius = (normalWidth + HUSH_CLEARANCE_LIMITS.marginM) / 2;
    function sideClearance(side) {
      let low = 0, high = radius;
      for (let n = 1; n <= HUSH_CLEARANCE_LIMITS.coarseSamplesPerSide; n++) {
        const distance = radius * n / HUSH_CLEARANCE_LIMITS.coarseSamplesPerSide;
        if (walkable(distance, side)) { low = distance; continue; }
        high = distance;
        for (let k = 0; k < HUSH_CLEARANCE_LIMITS.refinementSamplesPerSide; k++) {
          const middle = (low + high) / 2;
          if (walkable(middle, side)) low = middle; else high = middle;
        }
        return low;
      }
      return radius;
    }
    const left = sideClearance(-1), right = sideClearance(1);
    return Math.max(0, Math.min(normalWidth, Math.min(left, right) * 2 - HUSH_CLEARANCE_LIMITS.marginM));
  } catch {
    // Unavailable geometry is not evidence that the creature must collapse.
    return normalWidth;
  }
}
