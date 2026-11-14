import { MEMORY_FIELD_ANT as ANT } from '../data/memory-field.js';
import { memoryFieldSlabSurface, memoryFieldSlabSupport, memoryFieldSlabPathDistance } from '../data/memory-field-slab.js';

const TAU = Math.PI * 2;
const mesh = () => ({ p: [], i: [] });
const c = Math.cos(ANT.slab.yaw), s = Math.sin(ANT.slab.yaw);
const toField = (x, z) => [ANT.slab.x + x * c + z * s, ANT.slab.z - x * s + z * c];
const toSlab = (x, z) => [x * c - z * s, x * s + z * c];
const mix = (a, b, t) => a + (b - a) * t;
const tri = (g, a, b, c) => {
  const index = g.p.length / 3;
  g.p.push(...a, ...b, ...c);
  g.i.push(index, index + 1, index + 2);
};
const quad = (g, a, b, c, d) => {
  tri(g, a, b, c);
  tri(g, a, c, d);
};
const piece = (name, shape, RGB, { emissive = [0, 0, 0], roughness = .92, ...vegetation } = {}) =>
  Object.freeze({ name, ...shape, base: [...RGB, 1], emissive, roughness, ...vegetation });

export const MEMORY_FIELD_SLAB_MESHES = Object.freeze([
  'mf_ant_slab_top', 'mf_ant_slab_side', 'mf_ant_slab_crack', 'mf_slab_wear', 'mf_slab_margin',
]);
export const MEMORY_FIELD_SLAB_GRASS = Object.freeze(['mf_slab_grass_dark', 'mf_slab_grass_light']);

function seeded(seed) {
  return () => {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function surfacePoint(x, z) {
  return [x, memoryFieldSlabSupport(...toField(x, z)), z];
}

// Irregular stones show planar fractures and a softer crest. The base
// remains buried so none of these read as objects floating above the slab.
function chip(g, base, rx, rz, height, random) {
  const [x, y, z] = base;
  const count = 5 + Math.floor(random() * 3), start = random() * TAU;
  const foot = [], shoulder = [], crest = [];
  for (let j = 0; j < count; j++) {
    const a = start + (j + (random() - .5) * .38) * TAU / count;
    const radius = .68 + random() * .40;
    const u = Math.cos(a) * radius * rx, v = Math.sin(a) * radius * rz;
    foot.push([x + u * .84, y - height * .25, z + v * .84]);
    shoulder.push([x + u, y + height * (.22 + random() * .34), z + v]);
    crest.push([x + u * (.38 + random() * .28) + rx * .12,
      y + height * (.72 + random() * .30), z + v * .56]);
  }
  const top = [x + rx * .14, y + height, z - rz * .16];
  for (let j = 0; j < count; j++) {
    const n = (j + 1) % count;
    quad(g, foot[j], shoulder[j], shoulder[n], foot[n]);
    quad(g, shoulder[j], crest[j], crest[n], shoulder[n]);
    tri(g, crest[n], crest[j], top);
  }
}

function slabObjects() {
  const random = seeded(9251);
  const { top: clean, side: walls, crack: fracture, wear: damp } = memoryFieldSlabSurface();
  const top = mesh(), side = mesh(), crack = mesh(), wear = mesh(), margin = mesh();
  for (const [triangles, geometry] of [[clean, top], [walls, side], [fracture, crack], [damp, wear]]) {
    for (const points of triangles) tri(geometry, ...points);
  }
  // A receding deposit at the perimeter and near the broken lip. Larger
  // inclusions are physical, while the concrete band's fine incisions are
  // resolved by its small height variations.
  for (let i = 0; i < 99; i++) {
    const z = (random() - .50) * .532, x = (random() - .50) * .59;
    const point = surfacePoint(x, z);
    if (point[1] < .033 || memoryFieldSlabPathDistance(...toField(x, z)) < .012) continue;
    const size = .0014 + random() ** 3 * .0038;
    const outside = Math.abs(z) > .21 && x > -.23;
    chip(outside || i % 5 === 0 ? wear : side, point, size, size * (.7 + .4 * random()), size * .20, random);
  }
  // Broken crumbs and leaf litter sit in a low compacted margin. Scatter is
  // bounded locally and avoids the cracked slab face and both ant crossings.
  for (let i = 0; i < 103; i++) {
    const sideSign = random() < .5 ? -1 : 1;
    const x = (random() - .5) * .90, z = sideSign * (.259 + random() ** 1.75 * .112);
    if ((Math.abs(x) < ANT.slab.halfX + .012 && Math.abs(z) < ANT.slab.halfZ + .008)
      || memoryFieldSlabPathDistance(...toField(x, z)) < .022) continue;
    const size = .0025 + random() ** 2 * .011;
    chip(i % 6 === 0 ? side : margin, [x, 0, z], size, size * (1 + random() * .68), size * .34, random);
  }
  const pebble = mesh(), radius = ANT.pebble.r;
  chip(pebble, [0, -.002, 0], radius, radius * .76, .0105, seeded(691));
  return [
    piece('mf_ant_slab_top', top, [.434, .401, .337], { emissive: [.035, .032, .027] }),
    piece('mf_ant_slab_side', side, [.332, .300, .243], { emissive: [.024, .022, .018], roughness: .99 }),
    piece('mf_ant_slab_crack', crack, [.147, .123, .093], { emissive: [.012, .01, .007], roughness: 1 }),
    piece('mf_slab_wear', wear, [.344, .335, .256], { emissive: [.028, .027, .019] }),
    piece('mf_slab_margin', margin, [.29, .244, .152], { emissive: [.023, .018, .011], roughness: 1 }),
    piece('mf_ant_pebble', pebble, [.48, .434, .363], { emissive: [.025, .024, .021] }),
  ];
}

// A raised midrib and hinged folded faces hold broad specular/light cues
// even when the tips collapse into the dither. Each blade has its own root.
function macroBlade(g, x, z, height, width, yaw, bow, curl) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const rows = [0, .27, .58, .82].map(t => {
    const lift = height * (t - curl * t ** 6);
    const bend = bow * t ** 1.9;
    const half = width * (t === 0 ? .44 : (1 - t) ** .68);
    const plait = width * .26 * (1 - t);
    const u = x - s * bend, v = z + c * bend;
    return [[u - c * half, lift, v - s * half], [u - s * plait, lift + plait, v + c * plait],
      [u + c * half, lift, v + s * half]];
  });
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    quad(g, a[0], a[1], b[1], b[0]);
    quad(g, a[1], a[2], b[2], b[1]);
  }
  const tip = [x - s * bow, height * (1 - curl), z + c * bow], last = rows.at(-1);
  tri(g, last[0], last[1], tip);
  tri(g, last[1], last[2], tip);
}

function slabGrass() {
  const greens = [mesh(), mesh()], random = seeded(79513);
  const localLength = Math.hypot(ANT.slab.halfX, ANT.slab.halfZ);
  for (let i = 0; i < 293; i++) {
    const angle = random() * TAU;
    const radius = i < 57 ? .299 + random() * .215 : Math.sqrt(random()) * ANT.patch;
    if (radius > 1.32 && random() < .75 * ((radius - 1.32) / (ANT.patch - 1.32))) continue;
    const cx = Math.cos(angle) * radius, cz = Math.sin(angle) * radius;
    const [u, v] = toSlab(cx, cz);
    const alongExit = Math.abs(v - (u < 0 ? .036 : -.10)) < .037 && Math.abs(u) > .27 && Math.abs(u) < .53;
    if (alongExit || (Math.abs(u) < ANT.slab.halfX + .014 && Math.abs(v) < ANT.slab.halfZ + .014)) continue;
    const moisture = Math.sin(cx * 14 + .9) * Math.sin(cz * 8 - 1.8);
    const localHeight = radius < localLength + .21 ? .81 : 1;
    const crowded = .77 + .36 * random() + .13 * moisture;
    const leafCount = 3 + Math.floor(5 * random());
    for (let j = 0; j < leafCount; j++) {
      const bladeAngle = angle + .57 * j + (random() - .50) * 2.5;
      const width = .0025 + .0079 * random() ** 1.4;
      const height = (.058 + random() ** 1.3 * .33) * crowded * localHeight;
      const skirting = radius < localLength + .17;
      const bow = height * (.13 + .51 * random() ** 1.7) * (skirting ? .8 : 1);
      const x = cx + (random() - .50) * .043, z = cz + (random() - .50) * .043;
      const [u, v] = toSlab(x, z);
      if (Math.abs(u) < ANT.slab.halfX + .018 && Math.abs(v) < ANT.slab.halfZ + .018) continue;
      if (Math.hypot(x, z) > ANT.patch - .025) continue;
      macroBlade(greens[j % 4 === 0 ? 1 : 0], x, z, height, width, bladeAngle, bow, .03 + random() ** 3 * .40);
    }
  }
  const grass = {
    roughness: .78, vegetationClass: 'leaf', vegetationTransmission: .33, vegetationWetness: .37,
  };
  return [
    piece(MEMORY_FIELD_SLAB_GRASS[0], greens[0], [.164, .302, .088], { ...grass, emissive: [.012, .022, .007] }),
    piece(MEMORY_FIELD_SLAB_GRASS[1], greens[1], [.327, .448, .157], { ...grass, emissive: [.024, .031, .01] }),
  ];
}

let library;
export function memoryFieldSlabGeometry() {
  return library ??= Object.freeze([...slabObjects(), ...slabGrass()]);
}
