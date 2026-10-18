// Actual sight apertures for EXISTING glazed door families. Door-state/collision
// still own access; seeing through a locked leaf never opens its portal.
const GLAZED_LEAVES = new Set([
  'door_leaf_staff', 'door_leaf_practice', 'door_leaf_pool',
  'door_leaf_pool_pair', 'door_leaf_public',
]);
export const DOOR_WIRE_PITCH = .045;
export const DOOR_WIRE_WIDTH = .0012;
export const DOOR_GLASS_EDGE_WIDTH = .0015;

function bounds(part) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < part.p.length; i += 3) for (let k = 0; k < 3; k += 1) {
    min[k] = Math.min(min[k], part.p[i + k]); max[k] = Math.max(max[k], part.p[i + k]);
  }
  return { min, max };
}
function faceRect(x, y, width, height, mat, feature) {
  return { mat,
    p: [x - width / 2, y - height / 2, 0, x + width / 2, y - height / 2, 0,
      x + width / 2, y + height / 2, 0, x - width / 2, y + height / 2, 0],
    n: [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], uv: [0, 0, 1, 0, 1, 1, 0, 1],
    idx: [0, 2, 1, 0, 3, 2], glazingFeature: feature };
}

/**
 * Input is the existing door-pack primitive format {mat,p,n,uv,idx}.
 * leaf() integration:
 *   const glazing=doorLeafCore({name,width:w,height:h,depth:d,mat,parts,MAT,box});
 *   mesh(name,[...glazing.coreParts,...enhanceDoorOccupation({...parts:glazing.parts})]);
 * The old authored MAT.glass box supplies the window rectangle; no second
 * hand-copied family schedule can drift from the original door builder.
 */
export function doorLeafCore({ name, width, height, depth, mat, parts = [], MAT, box }) {
  if (![width, height, depth].every((v) => Number.isFinite(v) && v > 0) || typeof box !== 'function') {
    throw new TypeError(`doorLeafCore requires positive dimensions and box(): ${name}`);
  }
  if (!GLAZED_LEAVES.has(name)) return {
    coreParts: [box(width / 2, height / 2, 0, width, height, depth, mat)], parts: [...parts], aperture: null,
  };
  const panes = parts.filter((p) => p.mat === MAT.glass);
  if (panes.length !== 1) throw new Error(`${name}: expected one authored glass rectangle; found ${panes.length}`);
  const pane = bounds(panes[0]), [x0, y0] = pane.min, [x1, y1] = pane.max;
  if (![x0, y0, x1, y1].every(Number.isFinite) || !(x0 > .01 && y0 > .01 && x1 < width - .01 && y1 < height - .01)) {
    throw new Error(`${name}: glass rectangle must remain inside the existing leaf`);
  }
  const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const coreParts = [
    box(width / 2, y0 / 2, 0, width, y0, depth, mat),
    box(width / 2, (y1 + height) / 2, 0, width, height - y1, depth, mat),
    box(x0 / 2, cy, 0, x0, h, depth, mat),
    box((x1 + width) / 2, cy, 0, width - x1, h, depth, mat),
  ];
  const remaining = parts.filter((p) => p !== panes[0]);
  const bead = .008, beadMat = name.includes('pool') ? MAT.kick : MAT.brass;
  // Beading sits OUTSIDE the existing sight opening, on its original front
  // face. It cannot make a small practice peephole narrower or alter core bounds.
  for (const x of [x0 - bead / 2, x1 + bead / 2]) {
    remaining.push({ ...box(x, cy, -depth / 2 - .003, bead, h, .006, beadMat), glazingFeature: 'outer-bead' });
  }
  for (const y of [y0 - bead / 2, y1 + bead / 2]) {
    remaining.push({ ...box(cx, y, -depth / 2 - .003, w + bead * 2, bead, .006, beadMat), glazingFeature: 'outer-bead' });
  }
  // The prop renderer is opaque. A full MAT.glass rectangle would seal the
  // view again, so only the thin retained edge and wire web are drawn. Both
  // are on the pane plane; their conservative area remains below10%.
  let opaqueArea = 0;
  const addFace = (x, y, rw, rh, material, feature) => {
    remaining.push(faceRect(x, y, rw, rh, material, feature)); opaqueArea += rw * rh;
  };
  const edge = DOOR_GLASS_EDGE_WIDTH;
  for (const x of [x0 + edge / 2, x1 - edge / 2]) addFace(x, cy, edge, h, MAT.glass, 'glass-edge');
  for (const y of [y0 + edge / 2, y1 - edge / 2]) addFace(cx, y, w - edge * 2, edge, MAT.glass, 'glass-edge');
  const nx = Math.max(1, Math.floor(w / DOOR_WIRE_PITCH)), ny = Math.max(1, Math.floor(h / DOOR_WIRE_PITCH));
  for (let i = 1; i < nx; i += 1) addFace(x0 + w * i / nx, cy, DOOR_WIRE_WIDTH, h - edge * 2, MAT.iron, 'wire');
  for (let i = 1; i < ny; i += 1) addFace(cx, y0 + h * i / ny, w - edge * 2, DOOR_WIRE_WIDTH, MAT.iron, 'wire');
  const opaqueCoverage = opaqueArea / (w * h);
  if (opaqueCoverage >= .10) throw new Error(`${name}: wire and edge cover too much of the existing sight opening`);
  return { coreParts, parts: remaining,
    aperture: Object.freeze({ x0, y0, x1, y1, width: w, height: h, opaqueCoverage }) };
}
