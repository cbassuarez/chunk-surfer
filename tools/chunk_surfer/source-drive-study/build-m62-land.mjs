// What of the M62 country is close enough to be solid: a gritstone farm in a yard
// between two carriageways, the carriageways themselves, the lorries on them, the
// drystone walls along the small road, and the rock it was cut through.
//   node tools/chunk_surfer/source-drive-study/build-m62-land.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = path.join(ROOT, 'public/assets/source-drive/m62-land');
const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('m62 land');
doc.getRoot().setDefaultScene(scene);
let seed = 0x4d3621;
const rnd = (a = 0, b = 1) => { seed = seed + 0x6d2b79f5 >>> 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return a + (b - a) * (((t ^ t >>> 14) >>> 0) / 4294967296); };

const material = (name, rgb, roughness, metallic = 0, emissive = null) => {
  const m = doc.createMaterial(name).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(roughness).setMetallicFactor(metallic)
    .setDoubleSided(true).setExtras({ materialFactors: 'gltf', studyLocalFinish: true });
  if (emissive) m.setEmissiveFactor(emissive);
  return m;
};
const M = {
  grit: material('sooted millstone grit', [.2, .19, .16], .95),
  gritPale: material('weathered grit course', [.3, .28, .23], .93),
  gritDark: material('wet grit bed', [.11, .105, .095], .96),
  slate: material('stone slate roof', [.085, .085, .08], .88),
  shale: material('crumbling shale band', [.06, .058, .055], .98),
  peat: material('peat and turf cap', [.03, .028, .022], 1),
  window: material('lit farmhouse window', [.5, .36, .18], .5, 0, [2.6, 1.75, .9]),
  frame: material('painted window frame', [.03, .03, .03], .7),
  yard: material('wet farmyard', [.1, .1, .09], .8),
  tarmac: material('motorway surface', [.045, .045, .05], .85),
  paint: material('motorway line', [.5, .5, .46], .6),
  barrier: material('steel central barrier', [.2, .21, .22], .45, .7),
  post: material('fence post', [.05, .04, .03], .9),
  wool: material('wet fleece', [.42, .4, .34], 1),
  lorryBox: material('curtain side trailer', [.14, .15, .16], .7),
  lorryCab: material('lorry cab', [.07, .07, .08], .45, .3),
  rubber: material('lorry tyre', [.012, .012, .013], .92),
};
class Part {
  constructor() { this.buckets = new Map(); }
  bucket(m) { if (!this.buckets.has(m)) this.buckets.set(m, { p: [], n: [], t: [], i: [] }); return this.buckets.get(m); }
  quad(m, a, b, c, d) {
    const q = this.bucket(m), base = q.p.length / 3;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0], len = Math.hypot(nx, ny, nz) || 1;
    for (const [k, w] of [a, b, c, d].entries()) { q.p.push(...w); q.n.push(nx / len, ny / len, nz / len); q.t.push(k === 1 || k === 2 ? 1 : 0, k > 1 ? 0 : 1); }
    q.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Six faces, or fewer: `faces` leaves out what will never be seen.
  box(m, [cx, cy, cz], [sx, sy, sz], faces = 'xXyYzZ') {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    if (faces.includes('Z')) this.quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    if (faces.includes('z')) this.quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    if (faces.includes('X')) this.quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    if (faces.includes('x')) this.quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (faces.includes('Y')) this.quad(m, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    if (faces.includes('y')) this.quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  }
  // A pitched roof over X, ridge along Z, gables open for the walls to fill.
  roof(m, cx, cz, width, length, eave, ridge, overhang = .18) {
    const x0 = cx - width / 2 - overhang, x1 = cx + width / 2 + overhang, z0 = cz - length / 2 - overhang, z1 = cz + length / 2 + overhang;
    this.quad(m, [x0, eave, z1], [cx, ridge, z1], [cx, ridge, z0], [x0, eave, z0]);
    this.quad(m, [x1, eave, z0], [cx, ridge, z0], [cx, ridge, z1], [x1, eave, z1]);
  }
  gable(m, cx, cz, width, length, eave, ridge) {
    for (const [z, flip] of [[cz + length / 2, 1], [cz - length / 2, -1]]) {
      const q = this.bucket(m), base = q.p.length / 3;
      for (const w of [[cx - width / 2, eave, z], [cx + width / 2, eave, z], [cx, ridge, z]]) { q.p.push(...w); q.n.push(0, 0, flip); q.t.push(0, 0); }
      if (flip > 0) q.i.push(base, base + 1, base + 2); else q.i.push(base, base + 2, base + 1);
    }
  }
}
function mesh(name, part) {
  const out = doc.createMesh(name);
  for (const [m, q] of part.buckets) {
    const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    out.addPrimitive(doc.createPrimitive().setMaterial(m)
      .setAttribute('POSITION', acc('VEC3', new Float32Array(q.p))).setAttribute('NORMAL', acc('VEC3', new Float32Array(q.n)))
      .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(q.t))).setIndices(acc('SCALAR', new Uint32Array(q.i))));
  }
  scene.addChild(doc.createNode(name).setMesh(out));
  return out;
}

// ── a run of drystone: the same footprint as the guard rail it replaces on the
// road side (+X), thicker only on the far side. Coursed, with through stones and a
// row of upright copes along the top, so the headlamps have an edge per stone.
function drystone(variant, length = 3.08) {
  const p = new Part(), courses = 6, wallH = .72;
  p.box(M.gritDark, [-.13, wallH / 2, 0], [.44, wallH, length], 'xY');
  let y = 0;
  for (let c = 0; c < courses; c++) {
    const h = wallH / courses * rnd(.84, 1.16);
    let z = -length / 2;
    while (z < length / 2) {
      const w = Math.min(rnd(.2, .52), length / 2 - z);
      if (w < .05) break;
      const proud = rnd(.0, .026), m = rnd() < .24 ? M.gritPale : rnd() < .2 ? M.gritDark : M.grit;
      p.box(m, [.122 + proud / 2, y + h / 2, z + w / 2], [.028 + proud, h - .012, w - .012], 'XYy');
      z += w;
    }
    y += h;
  }
  let z = -length / 2;
  while (z < length / 2 - .06) {
    const w = rnd(.15, .26), h = rnd(.2, .29), lean = rnd(-.025, .025);
    p.box(rnd() < .3 ? M.gritPale : M.grit, [-.13, wallH + h / 2, z + w / 2 + lean], [.46, h, w - .018], 'xXYzZ');
    z += w;
  }
  return mesh(`m62_drystone_${variant}`, p);
}
for (let i = 0; i < 3; i++) drystone(i);

// ── the rock a road was cut through: beds of grit stepped out over soft shale,
// long horizontal lines first, with a cap of peat and turf at the top. Local +X
// faces the road; the origin is the foot of the face.
function gritFace(variant, length = 6.2, height = 6.2) {
  const p = new Part(), stations = 7;
  // Sampled so that neighbouring lengths of the face meet wherever they are placed.
  const wave = (z, phase, amount) => amount * (Math.sin(z / length * Math.PI * 2 + phase) * .6 + Math.sin(z / length * Math.PI * 4 + phase * 2.3) * .4);
  let y = 0, recess = 0;
  while (y < height) {
    const soft = rnd() < .34, h = soft ? rnd(.14, .3) : rnd(.5, 1.25), phase = rnd(0, 6.28), out = soft ? -.18 : rnd(.05, .2), m = soft ? M.shale : rnd() < .3 ? M.gritDark : M.grit;
    const front = z => -recess + out + wave(z, phase, soft ? .03 : .11);
    for (let i = 0; i < stations; i++) {
      const z0 = -length / 2 + length * i / stations, z1 = -length / 2 + length * (i + 1) / stations;
      // The face of the bed, undercut a little, and the ledge on top of it.
      p.quad(m, [front(z0) - .05, y, z0], [front(z1) - .05, y, z1], [front(z1), y + h, z1], [front(z0), y + h, z0]);
      p.quad(m, [front(z0), y + h, z0], [front(z1), y + h, z1], [-recess - 1.1, y + h, z1], [-recess - 1.1, y + h, z0]);
    }
    y += h; if (!soft) recess += rnd(.18, .62);
  }
  const top = y;
  for (let i = 0; i < stations; i++) {
    const z0 = -length / 2 + length * i / stations, z1 = -length / 2 + length * (i + 1) / stations, o = z => -recess - .1 + wave(z, 1.7, .18);
    p.quad(M.peat, [o(z0), top, z0], [o(z1), top, z1], [o(z1) - .9, top + .55, z1], [o(z0) - .9, top + .55, z0]);
    p.quad(M.peat, [o(z0) - .9, top + .55, z0], [o(z1) - .9, top + .55, z1], [o(z1) - 4, top + .8, z1], [o(z0) - 4, top + .8, z0]);
  }
  return mesh(`m62_grit_face_${variant}`, p);
}
for (let i = 0; i < 2; i++) gritFace(i);

// ── the farm: a low laithe house and its barn under one long stone roof, back to
// the weather, in a walled yard. Origin at the yard; the long axis runs along Z.
{
  const p = new Part(), w = 7.2, lengthHouse = 11, lengthBarn = 15, eave = 4.6, ridge = 7.2, houseZ = -7, barnZ = 6;
  for (const [cz, l] of [[houseZ, lengthHouse], [barnZ, lengthBarn]]) {
    p.box(M.grit, [0, eave / 2, cz], [w, eave, l], 'xXzZ');
    p.gable(M.grit, 0, cz, w, l, eave, ridge);
    p.roof(M.slate, 0, cz, w, l, eave, ridge);
  }
  // Long grit courses standing proud on the yard side, so a lamp picks the stone out.
  for (let y = .35; y < eave; y += .5) p.box(rnd() < .4 ? M.gritPale : M.grit, [w / 2 + .012, y, 0], [.03, .05, lengthHouse + lengthBarn - 2], 'X');
  // Quoins, and the chimney at the house end.
  for (let y = .2; y < eave; y += .55) for (const z of [houseZ - lengthHouse / 2, houseZ + lengthHouse / 2]) p.box(M.gritPale, [w / 2 - .05, y, z], [.36, .24, .42]);
  p.box(M.grit, [0, ridge + .55, houseZ - lengthHouse / 2 + .5], [.9, 1.6, .8]);
  p.box(M.gritDark, [0, ridge + 1.42, houseZ - lengthHouse / 2 + .5], [.48, .35, .4]);
  // Dark panes, and the barn's cart door.
  for (const [y, z] of [[1.5, houseZ - 3.2], [3.3, houseZ - 3.2], [3.3, houseZ + .1], [3.3, houseZ + 3.3]]) p.box(M.frame, [w / 2 + .02, y, z], [.05, 1.1, .9], 'X');
  p.box(M.frame, [w / 2 + .03, 1.05, houseZ + .1], [.05, 2.1, 1], 'X');
  p.box(M.frame, [w / 2 + .03, 1.8, barnZ], [.06, 3.6, 3.4], 'X');
  // Yard, and the walls that hold it against two carriageways.
  p.box(M.yard, [8, -.02, 0], [24, .04, 40], 'Y');
  for (const [cx, cz, sx, sz] of [[20, 0, .5, 40], [8, 20, 24, .5], [8, -20, 24, .5], [-4, 16, .5, 8], [-4, -16, .5, 8]]) {
    p.box(M.grit, [cx, .62, cz], [sx, 1.24, sz], 'xXzZY');
    const along = sx > sz, count = Math.floor((along ? sx : sz) / .36);
    for (let i = 0; i < count; i++) { const o = (i + .5) * .36 - (along ? sx : sz) / 2, h = rnd(.2, .3); p.box(rnd() < .3 ? M.gritPale : M.grit, along ? [cx + o, 1.24 + h / 2, cz] : [cx, 1.24 + h / 2, cz + o], along ? [.3, h, sz + .04] : [sx + .04, h, .3], 'xXzZY'); }
  }
  // Field walls run off the yard and stop where the motorway took the rest.
  for (const [ax, az, bx, bz] of [[20, 20, 34, 92], [20, -20, 30, -104], [-4, 20, -24, 88], [-4, -20, -26, -96]]) {
    const len = Math.hypot(bx - ax, bz - az), steps = Math.floor(len / 2.2);
    for (let i = 0; i < steps; i++) { const t = (i + .5) / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t; p.box(M.gritDark, [x, .6, z], [.55, rnd(1.05, 1.3), 2.3], 'xXzZY'); }
  }
  mesh('m62_farm', p);
  const glass = new Part();
  glass.box(M.window, [w / 2 + .05, 1.5, houseZ - 3.2], [.03, .95, .76], 'X');
  mesh('m62_farm_window', glass);
  // A few sheep that have been here longer than the road.
  const sheep = new Part();
  for (const [x, z, yaw] of [[5, 11, 1], [8, 8.6, .2], [10.4, 12.8, 2.2], [3.4, 15, 1.4]]) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    sheep.box(M.wool, [x, .56, z], [.6, .52, .92]);
    sheep.box(M.gritDark, [x + s * .58, .72, z + c * .58], [.2, .24, .3]);
    for (const [a, b] of [[-.2, -.3], [.2, -.3], [-.2, .3], [.2, .3]]) sheep.box(M.gritDark, [x + a, .15, z + b], [.07, .3, .07]);
  }
  mesh('m62_sheep', sheep);
}

// ── a length of carriageway. Local X across, Z along; the origin is the middle of
// the running lanes, with the hard shoulder on +X and the barrier on -X.
{
  const p = new Part(), length = 41, half = length / 2;
  p.box(M.tarmac, [1.2, -.02, 0], [14.6, .04, length], 'Y');
  for (const x of [-5.45, 4.95]) p.box(M.paint, [x, .002, 0], [.2, .01, length], 'Y');
  for (const x of [-1.9, 1.6]) for (let z = -half; z < half; z += 9) p.box(M.paint, [x, .002, z + 1], [.12, .01, 2], 'Y');
  p.box(M.barrier, [-6.35, .62, 0], [.06, .34, length], 'xXY');
  for (let z = -half; z < half; z += 3.2) p.box(M.post, [-6.42, .34, z], [.1, .68, .1], 'xXzZ');
  for (let z = -half; z < half; z += 2.5) p.box(M.post, [8.7, .55, z], [.09, 1.1, .09], 'xXzZ');
  p.box(M.post, [8.7, 1, 0], [.02, .03, length], 'xX');
  mesh('m62_carriageway', p);
  const l = new Part(), L = 13.6;
  l.box(M.lorryBox, [0, 2.45, -1.3], [2.5, 2.7, L - 2.6]);
  l.box(M.lorryCab, [0, 2, L / 2 - 1.1], [2.45, 2.7, 2.2]);
  for (const z of [-L / 2 + 1.4, -L / 2 + 2.8, L / 2 - 1.5, 1.4]) l.box(M.rubber, [0, .52, z], [2.4, 1.04, 1.04]);
  mesh('m62_lorry', l);
}

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'm62-land.glb');
await new NodeIO().write(file, doc);
const bytes = fs.readFileSync(file), meshes = doc.getRoot().listMeshes();
const triangles = Object.fromEntries(meshes.map(m => [m.getName(), m.listPrimitives().reduce((sum, q) => sum + q.getIndices().getCount() / 3, 0)]));
fs.writeFileSync(path.join(OUT, 'm62-land.stats.json'), JSON.stringify({
  generator: 'tools/chunk_surfer/source-drive-study/build-m62-land.mjs',
  bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), meshes: meshes.map(m => m.getName()), triangles,
}, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'm62-land.credits.json'), JSON.stringify({ authored: 'Procedural in this repository.', thirdParty: [] }, null, 1) + '\n');
console.log(`m62-land.glb ${(bytes.length / 1024).toFixed(0)} KB`, JSON.stringify(triangles));
