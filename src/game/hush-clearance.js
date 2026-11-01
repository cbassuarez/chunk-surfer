import { CELL } from '../data/floorplan/legend.js';

// A read-only width estimate for the rendered density. This does not authorize
// a move, alter contact, or guarantee that the animated surface cannot overlap.
export const HUSH_CLEARANCE_LIMITS = Object.freeze({
  nativeWidthM: .90, nativeHeightM: 2.05, marginM: .04,
  coarseSamplesPerSide: 6, refinementSamplesPerSide: 7,
  maximumNavigationProbes: 27,
});

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
