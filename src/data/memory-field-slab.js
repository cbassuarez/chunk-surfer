import { MEMORY_FIELD_ANT as ANT } from './memory-field.js';

const { slab } = ANT;
const cos = Math.cos(slab.yaw), sin = Math.sin(slab.yaw);
const mix = (a, b, t) => a + (b - a) * t;
const sat = t => Math.max(0, Math.min(t, 1));
const smooth = (a, b, value) => {
  const t = sat((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const local = (x, z) => {
  const dx = x - slab.x, dz = z - slab.z;
  return [dx * cos - dz * sin, dx * sin + dz * cos];
};
const antPath = ANT.path.map(([x, z]) => local(x, z));
const split = [
  [-.31, .095], [-.276, .065], [-.235, .070], [-.209, .041], [-.172, .047],
  [-.147, .026], [-.112, .030], [-.081, .005], [-.063, .012], [-.041, -.014],
  [-.003, -.026], [.028, -.023], [.049, -.039], [.091, -.040], [.113, -.061],
  [.140, -.044], [.174, -.055], [.195, -.052], [.215, -.065], [.247, -.063],
  [.268, -.046], [.31, -.057],
];
const pathDistance = (x, z) => {
  let nearest = Infinity;
  for (let i = 1; i < antPath.length; i++) {
    const [ax, az] = antPath[i - 1], [bx, bz] = antPath[i];
    const dx = bx - ax, dz = bz - az;
    const t = sat(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    nearest = Math.min(nearest, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return nearest;
};
export const memoryFieldSlabPathDistance = (x, z) => pathDistance(...local(x, z));

function splitSection(x) {
  const index = split.findIndex(([at]) => at > x);
  const upper = index < 0 ? split.length - 1 : Math.max(1, index);
  const [a, b] = [split[upper - 1], split[upper]];
  const z = mix(a[1], b[1], sat((x - a[0]) / (b[0] - a[0])));
  // There are narrow top bridges at the ant's existing crossings.
  const bridge = smooth(.002, .018, pathDistance(x, z));
  const wobble = .55 + .22 * Math.cos(x * 62 + .8) + .20 * Math.sin(x * 112);
  return { z, width: mix(.00115, .0036 + .0075 * wobble, bridge),
    floor: mix(.0305, .014 - .009 * wobble, bridge) };
}
function pouredSurface(x, z) {
  const edge = 1 - smooth(.005, .027, Math.min(slab.halfX - Math.abs(x), slab.halfZ - Math.abs(z)));
  return slab.height - .0037 * edge
    + .00085 * Math.sin(x * 45 + z * 21) * Math.cos(z * 94 - x * 23)
    + .00048 * Math.sin(x * 139 + z * 81);
}
function contour(x, side) {
  const corner = smooth(.205, .31, Math.abs(x));
  const chipped = side < 0 ? (x < 0 ? .022 : .008) : (x > 0 ? .061 : .017);
  return side * (slab.halfZ - chipped * corner * corner
    - .0025 * (1 + Math.sin(x * 49 + side * 2.7)));
}
function endChip(x, z) {
  const entry = x < 0;
  // The existing path crosses two local spalls at the short ends.
  return 1 - smooth(.016, entry ? .061 : .045, Math.abs(z - (entry ? .0348 : -.098)));
}

const cellSize = .035;
const bucket = (x, z) => Math.floor(x / cellSize) + ':' + Math.floor(z / cellSize);
const buckets = new Map();
let surface;

export function memoryFieldSlabSurface() {
  if (surface) return surface;
  const pieces = { top: [], side: [], crack: [], wear: [] };

  function triangle(part, a, b, c, support = false) {
    const reversed = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) < 0;
    const vertices = support && reversed ? [a, c, b] : [a, b, c];
    pieces[part].push(vertices);
    if (!support) return;
    const left = Math.floor(Math.min(a[0], b[0], c[0]) / cellSize), right = Math.floor(Math.max(a[0], b[0], c[0]) / cellSize);
    const near = Math.floor(Math.min(a[2], b[2], c[2]) / cellSize), far = Math.floor(Math.max(a[2], b[2], c[2]) / cellSize);
    for (let ix = left; ix <= right; ix++) for (let iz = near; iz <= far; iz++) {
      const key = ix + ':' + iz;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(vertices);
    }
  }
  function quad(part, a, b, c, d, support = false) {
    triangle(part, a, b, c, support);
    triangle(part, a, c, d, support);
  }

  const xKeys = Array.from(new Set([
    ...Array.from({ length: 35 }, (_, i) => Number(mix(-slab.halfX, slab.halfX, i / 34).toFixed(5))),
    ...split.map(([x]) => x),
    -.301, -.293, -.283, -.272, .282, .295, .304,
  ])).sort((a, b) => a - b);
  const row = (x, side) => {
    const cut = splitSection(x);
    const outer = contour(x, side), inner = cut.z + side * cut.width;
    return Array.from({ length: 19 }, (_, index) => {
      const u = index / 18;
      const z = mix(outer, inner, u);
      const edgeLength = slab.halfX - Math.abs(x);
      const spall = endChip(x, z) * (1 - smooth(.002, .033, edgeLength));
      const bevel = smooth(.89, 1, u) * (.001 + cut.width * .16);
      return [x, pouredSurface(x, z) - spall * .025 - bevel, z];
    });
  };
  const grid = [-1, 1].map(side => xKeys.map(x => row(x, side)));
  for (const side of grid) {
    for (let ix = 1; ix < side.length; ix++) {
      const a = side[ix - 1], b = side[ix];
      for (let j = 1; j < a.length; j++) {
        const [x, , z] = b[j];
        // Damp concrete follows encroaching soil and the low fracture lip.
        const tide = .042 + .025 * Math.sin(x * 22 + 3) + .013 * Math.cos(x * 51);
        const downhill = (j < 7 && slab.halfZ - Math.abs(z) < tide && x > -.18)
          || (j > 15 && x < -.138 && x > -.244);
        quad(downhill ? 'wear' : 'top', a[j - 1], b[j - 1], b[j], a[j], true);
      }
      const out = a[0][2] < 0 ? -1 : 1;
      const edge = point => [point[0], -.005, point[2] + out * .002];
      const shoulder = ([x, y, z]) => [x, y * .72, z + out * .0045];
      quad('side', shoulder(a[0]), shoulder(b[0]), b[0], a[0], true);
      const wall = [edge(a[0]), edge(b[0]), shoulder(b[0]), shoulder(a[0])];
      if (out < 0) wall.reverse();
      quad('side', ...wall);
    }
  }

  for (let ix = 0; ix < grid[0].length - 1; ix++) {
    const x = xKeys[ix], next = xKeys[ix + 1], a = splitSection(x), b = splitSection(next);
    const lip = [grid[0][ix].at(-1), grid[0][ix + 1].at(-1),
      grid[1][ix].at(-1), grid[1][ix + 1].at(-1)];
    const bottom = (at, section, side) => [at, section.floor + side * .0012, section.z + side * section.width * .58];
    const floor = [bottom(x, a, -1), bottom(next, b, -1), bottom(x, a, 1), bottom(next, b, 1)];
    quad('side', lip[0], lip[1], floor[1], floor[0], true);
    quad('side', floor[2], floor[3], lip[3], lip[2], true);
    quad('crack', floor[0], floor[1], floor[3], floor[2], true);
    if (ix === 0 || ix === grid[0].length - 2) {
      const which = ix === 0 ? 0 : 1, near = floor[which], far = floor[which + 2];
      const lowNear = [near[0], -.005, near[2]], lowFar = [far[0], -.005, far[2]];
      quad('crack', ...(which === 0 ? [far, near, lowNear, lowFar] : [near, far, lowFar, lowNear]));
    }
  }

  for (const side of grid) for (const end of [0, xKeys.length - 1]) {
    const points = side[end], dir = end === 0 ? -1 : 1;
    const chipShoulder = ([x, y, z]) => [x + dir * (.005 + endChip(x, z) * .009), y * .53, z];
    const foot = ([x, , z]) => [x + dir * (.005 + endChip(x, z) * .022), -.001, z];
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j];
      quad('side', a, b, chipShoulder(b), chipShoulder(a), true);
      quad('side', chipShoulder(a), chipShoulder(b), foot(b), foot(a), true);
    }
    const corner = points[0], out = Math.sign(corner[2]);
    const sideShoulder = [corner[0], corner[1] * .72, corner[2] + out * .0045];
    const sideFoot = [corner[0], -.005, corner[2] + out * .002];
    triangle('side', corner, sideShoulder, chipShoulder(corner), true);
    quad('side', sideShoulder, sideFoot, foot(corner), chipShoulder(corner), true);
  }
  surface = pieces;
  return surface;
}

/** Sample the exact upward-facing triangles under a foot, in field metres. */
export function memoryFieldSlabSupport(x, z) {
  memoryFieldSlabSurface();
  const [u, v] = local(x, z);
  let y = 0;
  for (const [a, b, c] of buckets.get(bucket(u, v)) ?? []) {
    const x1 = b[0] - a[0], z1 = b[2] - a[2], x2 = c[0] - a[0], z2 = c[2] - a[2];
    const area = x1 * z2 - z1 * x2;
    if (Math.abs(area) < 1e-10) continue;
    const x = u - a[0], z = v - a[2];
    const q = (x * z2 - z * x2) / area, r = (z * x1 - x * z1) / area;
    if (q < -1e-6 || r < -1e-6 || q + r > 1.000001) continue;
    y = Math.max(y, a[1] + (b[1] - a[1]) * q + (c[1] - a[1]) * r);
  }
  return y;
}
