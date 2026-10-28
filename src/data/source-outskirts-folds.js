// The remembered arrival has several incompatible gravities. Each return is a
// rigid copy of one real street strip: doors, glass, lamps and van stay attached
// to their own road. Only the player's ground datum remains trustworthy.
import { PROP_BOUNDS } from './generated/prop-geometry.js';
import { outskirtsTownPlacement, SOURCE_OUTSKIRTS_TOWN } from './source-outskirts-town.js';

export const OUTSKIRTS_FOLDING = Object.freeze({
  firstPass: 3, lastPass: 19, sideAcross: 21, ceilingHeight: 12.4,
  // No upper street is submitted during the two ordinary learning passes.
  revealFrom: 6 + 2 * SOURCE_OUTSKIRTS_TOWN.periodMetres + 10,
  revealTo: 6 + 3 * SOURCE_OUTSKIRTS_TOWN.periodMetres - 4,
  extinctionFrom: 38, extinctionTo: 82,
});

const keep = new Set(['road', 'gate', 'lamp-0', 'lamp-1', 'lamp-2', 'lamp-3',
  'booth', 'booth-interior', 'booth-practicals', 'booth-glazing', 'shelter', 'van', 'van-lamp']);
const clamp = n => Math.max(0, Math.min(1, n));
export function outskirtsFoldVisibility(along) {
  const t = clamp((along - OUTSKIRTS_FOLDING.revealFrom) / (OUTSKIRTS_FOLDING.revealTo - OUTSKIRTS_FOLDING.revealFrom));
  return t * t * (3 - 2 * t);
}

// Full model point after local yaw/scale and THEN the shared road's world-Z
// rotation. Euler roll after yaw would fold each object round a different axis.
export function outskirtsFoldPoint(piece, [x, y, z]) {
  x *= (piece.scaleX ?? 1) * (piece.scale ?? 1);
  y *= (piece.scaleY ?? 1) * (piece.scale ?? 1);
  z *= (piece.scaleZ ?? 1) * (piece.scale ?? 1);
  const c = Math.cos(piece.yaw), s = Math.sin(piece.yaw), a = x * c + z * s;
  const cr = Math.cos(piece.foldRoll || 0), sr = Math.sin(piece.foldRoll || 0);
  return { across: piece.across + a * cr - y * sr,
    y: piece.y + a * sr + y * cr, along: piece.along + x * s - z * c };
}

function bounds(piece) {
  const b = PROP_BOUNDS[piece.mesh];
  if (!b) throw Error(`Missing folded arrival bounds: ${piece.mesh}`);
  const points = [b.min[0], b.max[0]]
    .flatMap(x => [b.min[1], b.max[1]].flatMap(y => [b.min[2], b.max[2]].map(z => outskirtsFoldPoint(piece, [x, y, z]))));
  return Object.freeze({ across0: Math.min(...points.map(p => p.across)), across1: Math.max(...points.map(p => p.across)),
    along0: Math.min(...points.map(p => p.along)), along1: Math.max(...points.map(p => p.along)),
    y0: Math.min(...points.map(p => p.y)), y1: Math.max(...points.map(p => p.y)) });
}

const cache = new WeakMap();
export function outskirtsFoldLayout(k, originals) {
  if (!Number.isInteger(k) || k < OUTSKIRTS_FOLDING.firstPass || k > OUTSKIRTS_FOLDING.lastPass) return [];
  let byPass = cache.get(originals);
  if (!byPass) { byPass = new Map(); cache.set(originals, byPass); }
  if (byPass.has(k)) return byPass.get(k);
  const stable = outskirtsTownPlacement('yard-former-stables');
  const strip = [...originals.filter(p => keep.has(p.id)), { ...stable, id: 'stables' }];
  const van = strip.find(p => p.id === 'van');
  // The normal runtime adds these real leaves as details. The rigid return
  // needs the same hinges before the entire strip is turned onto its new road.
  for (const [id, mesh, x, yaw] of [['van-door-l', 'yard_van_door_l', -1.1, -1.72],
    ['van-door-r', 'yard_van_door_r', 1.1, Math.PI + 1.72]]) {
    const c = Math.cos(van.yaw), s = Math.sin(van.yaw), z = 2.34;
    strip.push({ id, mesh, across: van.across + x * c + z * s,
      along: van.along + x * s - z * c, y: van.y + .64, yaw: van.yaw + yaw });
  }
  const frames = [];
  if (k === 3 || k === 4 || (k >= 6 && k % 2 === 0)) {
    const left = k === 3 || (k >= 6 && k % 4 === 2);
    frames.push({ id: left ? 'west-return' : 'east-return', roll: left ? -Math.PI / 2 : Math.PI / 2,
      across: (left ? -1 : 1) * OUTSKIRTS_FOLDING.sideAcross });
  }
  if (k >= 5) frames.push({ id: 'overhead', roll: Math.PI, across: 0, y: OUTSKIRTS_FOLDING.ceilingHeight });
  const result = frames.flatMap(frame => {
    const cr = Math.cos(frame.roll), sr = Math.sin(frame.roll);
    let set = strip.map(p => {
      // Copy geometry and finish only. There are no fake working phones,
      // duplicated people, inspection targets, sound emitters or lamp pools.
      const { mesh, canonicalId, scale, scaleX, scaleY, scaleZ } = p;
      const piece = { id: `fold-${frame.id}-${p.id}`, mesh, canonicalId,
        across: frame.across + p.across * cr - p.y * sr, y: p.across * sr + p.y * cr,
        along: p.along, yaw: p.yaw, foldRoll: frame.roll, folded: true, foldFrame: frame.id,
        foldSource: p.id, collision: 'none', structural: true,
        ...(scale !== undefined ? { scale } : {}), ...(scaleX !== undefined ? { scaleX } : {}),
        ...(scaleY !== undefined ? { scaleY } : {}), ...(scaleZ !== undefined ? { scaleZ } : {}),
        ...(p.glow ? { glow: [p.glow[0], p.glow[1], p.glow[2], p.glow[3] * .18] } : {}) };
      return { ...piece, bounds: bounds(piece) };
    });
    // Side streets meet the ground beyond the traversable verge. The inverted
    // street has a 3.2m minimum headroom even below the actual stable's roof.
    const lift = frame.y ?? (.12 - Math.min(...set.map(p => p.bounds.y0)));
    set = set.map(p => Object.freeze({ ...p, y: p.y + lift,
      bounds: Object.freeze({ ...p.bounds, y0: p.bounds.y0 + lift, y1: p.bounds.y1 + lift }) }));
    return set;
  });
  const frozen = Object.freeze(result); byPass.set(k, frozen); return frozen;
}
