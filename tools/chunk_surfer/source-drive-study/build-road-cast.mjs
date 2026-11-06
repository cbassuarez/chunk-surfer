// What stands at the side of the opening road. The bus, the shelter, the bust's
// plinth and the cup are the building's own meshes; only what the building has no
// use for is made here.
//   node tools/chunk_surfer/source-drive-study/build-road-cast.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import sharp from 'sharp';
import { ROAD_CAST_BILLS, ROAD_CAST_BOARD_COPY, ROAD_SERVICES, ROAD_SERVICES_GROUND, roadServicesWiden } from '../../../src/data/road-cast.js';
import { openingWorldAt } from '../../../src/game/source-drive/opening-road.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = path.join(ROOT, 'public/assets/source-drive/road-cast');
const POSTERS = path.join(ROOT, 'public/assets/institution-posters');
const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('road cast');
doc.getRoot().setDefaultScene(scene);

const material = (name, rgb, roughness, metallic = 0, emissive = null) => {
  const m = doc.createMaterial(name).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(roughness).setMetallicFactor(metallic)
    .setDoubleSided(true).setExtras({ materialFactors: 'gltf', studyLocalFinish: true });
  if (emissive) m.setEmissiveFactor(emissive);
  return m;
};
const M = {
  paint: material('chalked cream cab paint', [.46, .43, .35], .62, .05),
  steel: material('road-black chassis', [.022, .024, .025], .55, .4),
  rubber: material('worn tyre rubber', [.012, .012, .013], .92),
  timber: material('wet deck timber', [.11, .085, .06], .84),
  glass: material('dark cab glass', [.018, .024, .026], .12, .2),
  lens: material('rear lamp lens', [.16, .012, .01], .3, 0, [.5, .03, .02]),
  canvas: material('sun-faded canvas sheet', [.3, .33, .27], .88),
  strap: material('ratchet strap', [.045, .05, .1], .7),
  post: material('creosoted hoarding post', [.045, .036, .028], .9),
  board: material('hoarding backing board', [.05, .055, .055], .82),
  lampArm: material('hoarding lamp arm', [.07, .075, .075], .4, .6),
  studBody: material('cat eye rubber shoe', [.016, .016, .017], .9),
  studLens: material('cat eye lens', [.9, .88, .7], .2, 0, [3.2, 3, 2.3]),
};

class Part {
  constructor() { this.buckets = new Map(); }
  bucket(m) { if (!this.buckets.has(m)) this.buckets.set(m, { p: [], n: [], t: [], i: [] }); return this.buckets.get(m); }
  quad(m, a, b, c, d, n, uv = [[0, 1], [1, 1], [1, 0], [0, 0]]) {
    const q = this.bucket(m), base = q.p.length / 3;
    for (const [k, v] of [a, b, c, d].entries()) { q.p.push(...v); q.n.push(...n); q.t.push(...uv[k]); }
    q.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  box(m, [cx, cy, cz], [sx, sy, sz]) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    this.quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    this.quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    this.quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    this.quad(m, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    this.quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  }
  // Axle along X.
  wheel(m, [cx, cy, cz], radius, width, segments = 16) {
    const x0 = cx - width / 2, x1 = cx + width / 2, ring = i => { const a = i / segments * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; };
    for (let i = 0; i < segments; i++) {
      const [c0, s0] = ring(i), [c1, s1] = ring(i + 1), q = this.bucket(m), base = q.p.length / 3;
      for (const [x, c, s] of [[x0, c0, s0], [x1, c0, s0], [x1, c1, s1], [x0, c1, s1]]) { q.p.push(x, cy + s * radius, cz + c * radius); q.n.push(0, s, c); q.t.push(0, 0); }
      q.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      for (const [x, sign] of [[x0, -1], [x1, 1]]) {
        const b = q.p.length / 3;
        for (const [yy, zz] of [[cy, cz], [cy + s0 * radius, cz + c0 * radius], [cy + s1 * radius, cz + c1 * radius]]) { q.p.push(x, yy, zz); q.n.push(sign, 0, 0); q.t.push(0, 0); }
        q.i.push(b, b + 1, b + 2);
      }
    }
  }
  sheet(m, nx, nz, at) {
    const q = this.bucket(m), base = q.p.length / 3, P = (i, j) => at(i / nx, j / nz);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const p = P(i, j), a = P(Math.max(0, i - 1), j), b = P(Math.min(nx, i + 1), j), c = P(i, Math.max(0, j - 1)), d = P(i, Math.min(nz, j + 1));
      const u = b.map((v, k) => v - a[k]), v = d.map((w, k) => w - c[k]);
      let n = [v[1] * u[2] - v[2] * u[1], v[2] * u[0] - v[0] * u[2], v[0] * u[1] - v[1] * u[0]];
      const l = Math.hypot(...n) || 1; n = n.map(x => x / l); if (n[1] < 0) n = n.map(x => -x);
      q.p.push(...p); q.n.push(...n); q.t.push(i / nx, j / nz);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = base + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      q.i.push(a, c, b, b, c, d);
    }
  }
  commit(name) {
    const mesh = doc.createMesh(name);
    for (const [m, q] of this.buckets) {
      mesh.addPrimitive(doc.createPrimitive().setMaterial(m)
        .setAttribute('POSITION', doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array(q.p)))
        .setAttribute('NORMAL', doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array(q.n)))
        .setAttribute('TEXCOORD_0', doc.createAccessor().setBuffer(buffer).setType('VEC2').setArray(new Float32Array(q.t)))
        .setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint32Array(q.i))));
    }
    scene.addChild(doc.createNode(name).setMesh(mesh));
    return this;
  }
}

// ── The flatbed, nose toward -Z, stopped with its load behind the cab ──────────
const DECK_Y = 1.1;
{
  const v = new Part();
  v.box(M.steel, [0, .66, .1], [1.1, .16, 7.3]);
  v.box(M.timber, [0, DECK_Y - .04, 1.35], [2.36, .08, 5.1]);
  for (const side of [-1, 1]) v.box(M.steel, [side * 1.18, DECK_Y - .1, 1.35], [.05, .14, 5.1]);
  v.box(M.steel, [0, DECK_Y - .1, 3.9], [2.36, .16, .06]);
  // Cab.
  v.box(M.paint, [0, 1.02, -2.72], [2.3, 1.14, 2.14]);
  v.box(M.paint, [0, 2.12, -2.66], [2.24, 1.06, 1.96]);
  v.box(M.paint, [0, 2.68, -2.66], [2.3, .06, 2.04]);
  v.box(M.glass, [0, 2.12, -3.645], [1.96, .78, .02]);
  for (const side of [-1, 1]) v.box(M.glass, [side * 1.126, 2.14, -2.98], [.02, .68, 1.1]);
  v.box(M.steel, [0, .54, -3.82], [2.34, .24, .1]);
  // Headboard behind the cab: the only thing holding the load off it.
  v.box(M.steel, [0, 1.76, -1.48], [2.3, 1.3, .05]);
  for (const x of [-.9, -.3, .3, .9]) v.box(M.steel, [x, 1.76, -1.44], [.05, 1.3, .05]);
  // Wheels: single front, twin rear.
  for (const side of [-1, 1]) {
    v.wheel(M.rubber, [side * 1.03, .47, -2.84], .47, .3);
    v.wheel(M.rubber, [side * .98, .47, 2.1], .47, .3);
    v.wheel(M.rubber, [side * .66, .47, 2.1], .47, .3);
    v.box(M.steel, [side * 1.03, .96, 2.1], [.42, .05, 1.2]);
  }
  v.commit('rc_flatbed');
  const lens = new Part();
  for (const side of [-1, 1]) lens.box(M.lens, [side * .92, DECK_Y - .12, 3.94], [.26, .1, .02]);
  lens.commit('rc_flatbed_lamps');

  // The sheet is a height field over the load: fittings forward, and at the back
  // something on a plinth, with shoulders, and above them a head.
  const smooth = (a, b, k = .16) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * .25; };
  const dome = (x, z, cx, cz, rx, rz, cy, ry) => { const q = 1 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2; return q <= 0 ? -9 : cy + ry * Math.sqrt(q); };
  const lump = (x, z, cx, cz, hx, hz, top, soft = .12) => {
    const dx = Math.max(Math.abs(x - cx) - hx, 0), dz = Math.max(Math.abs(z - cz) - hz, 0), d = Math.hypot(dx, dz);
    return d >= soft ? -9 : top - (d / soft) ** 2 * .36;
  };
  const load = (x, z) => {
    let h = DECK_Y + .03;
    h = smooth(h, lump(x, z, -.42, -.48, .56, .54, DECK_Y + .96));
    h = smooth(h, lump(x, z, .54, -.32, .42, .68, DECK_Y + .68));
    h = smooth(h, lump(x, z, 0, .92, .8, .34, DECK_Y + .42));
    h = smooth(h, lump(x, z, 0, 2.3, .4, .4, DECK_Y + .66, .28), .26);
    h = smooth(h, dome(x, z, 0, 2.3, .62, .4, DECK_Y + .66, .34), .12);
    h = smooth(h, dome(x, z, 0, 2.28, .19, .22, DECK_Y + 1.02, .1), .05);
    h = smooth(h, dome(x, z, 0, 2.28, .3, .34, DECK_Y + 1.26, .42), .09);
    return h;
  };
  const tarp = new Part();
  const FROM = -1.12, TO = 3.5, HALF = 1.42;
  const wrinkle = (x, z) => .012 * Math.sin(x * 11 + z * 3.1) + .009 * Math.sin(z * 17 - x * 5) + .006 * Math.sin((x + z) * 29);
  const surface = (u, v) => {
    const x0 = (u * 2 - 1) * HALF, z = FROM + (TO - FROM) * v, over = Math.max(0, Math.abs(x0) - 1.2);
    const side = Math.sign(x0) || 1;
    if (over > 0) return [side * (1.2 + over * .16), DECK_Y + .03 - over * 1.72 + wrinkle(x0, z) * 1.6, z + .02 * Math.sin(z * 9)];
    return [x0, load(x0, z) + wrinkle(x0, z), z];
  };
  tarp.sheet(M.canvas, 76, 150, surface);
  for (const z of [-.12, 1.42]) {
    tarp.sheet(M.strap, 56, 1, (u, v) => {
      const p = surface(u, (z + (v - .5) * .05 - FROM) / (TO - FROM));
      return [p[0], p[1] + .018, p[2]];
    });
  }
  tarp.commit('rc_tarp');
}

// ── A six-metre hoarding, facing +Z, so it faces oncoming traffic when placed ──
const BOARD = { width: 6.3, height: 3.05, centreY: 2.72 };
{
  const h = new Part();
  h.box(M.board, [0, BOARD.centreY, -.04], [BOARD.width, BOARD.height, .06]);
  for (const x of [-2.5, 2.5]) { h.box(M.post, [x, 2.2, -.14], [.16, 4.4, .14]); h.box(M.post, [x, 1.45, -.92], [.1, .1, 1.6]); }
  h.box(M.post, [0, BOARD.centreY + BOARD.height / 2 + .05, -.04], [BOARD.width + .1, .08, .1]);
  for (const x of [-2.1, 0, 2.1]) { h.box(M.lampArm, [x, BOARD.centreY + BOARD.height / 2 + .06, .34], [.04, .04, .74]); h.box(M.lampArm, [x, BOARD.centreY + BOARD.height / 2 + .02, .7], [.42, .07, .14]); }
  h.commit('rc_hoarding');
}

// ── One bill, its origin at bottom centre, pasted on +Z ────────────────────────
const billBytes = {};
for (const art of ROAD_CAST_BILLS) {
  const jpeg = await sharp(path.join(POSTERS, `${art}-albedo.png`)).resize(384, 544, { fit: 'fill' }).jpeg({ quality: 82 }).toBuffer();
  billBytes[art] = jpeg.length;
  const texture = doc.createTexture(`bill ${art}`).setImage(new Uint8Array(jpeg)).setMimeType('image/jpeg');
  const m = doc.createMaterial(`pasted bill / ${art}`).setBaseColorTexture(texture).setRoughnessFactor(.78).setMetallicFactor(0).setDoubleSided(true)
    .setExtras({ materialFactors: 'gltf', studyLocalFinish: true });
  const b = new Part(), w = 1, hgt = 1.416;
  b.quad(m, [-w, 0, 0], [w, 0, 0], [w, hgt * 2, 0], [-w, hgt * 2, 0], [0, 0, 1]);
  b.commit(`rc_bill_${art}`);
}

// ── A cat's eye. Lenses on +Z only, so they answer the lamps coming toward them ─
{
  const s = new Part();
  s.box(M.studBody, [0, .012, 0], [.42, .024, .18]);
  for (const x of [-.11, .11]) s.box(M.studLens, [x, .04, .05], [.15, .06, .04]);
  s.commit('rc_cat_eye');
}

// ── The services: painted boards, and a sign lit from inside ──────────────────
{
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'road-cast-boards-'));
  const copyFile = path.join(work, 'copy.json');
  fs.writeFileSync(copyFile, JSON.stringify(ROAD_CAST_BOARD_COPY));
  execFileSync('python', [path.join(ROOT, 'tools/chunk_surfer/source-drive-study/render-road-cast-boards.py'), copyFile, work], { stdio: 'inherit' });
  const frame = new Part();
  for (const x of [-1.25, 1.25]) { frame.box(M.post, [x, 1.32, -.08], [.11, 2.64, .11]); frame.box(M.post, [x, .5, -.55], [.07, .07, .95]); }
  frame.box(M.board, [0, 1.92, -.03], [3.06, 1.56, .05]);
  frame.commit('rc_signboard');
  for (const row of ROAD_CAST_BOARD_COPY.boards) {
    const jpeg = await sharp(path.join(work, `board-${row.id}.png`)).resize(640, 320).jpeg({ quality: 84 }).toBuffer();
    billBytes[`board-${row.id}`] = jpeg.length;
    const texture = doc.createTexture(`board ${row.id}`).setImage(new Uint8Array(jpeg)).setMimeType('image/jpeg');
    // Sign paint throws the headlamps back, so these read at night without a lamp of their own.
    const m = doc.createMaterial(`signwritten board / ${row.id}`).setBaseColorTexture(texture).setRoughnessFactor(.78).setMetallicFactor(0).setDoubleSided(true)
      .setExtras({ materialFactors: 'gltf', studyLocalFinish: true });
    const b = new Part();
    b.quad(m, [-1.5, 1.17, 0], [1.5, 1.17, 0], [1.5, 2.67, 0], [-1.5, 2.67, 0], [0, 0, 1]);
    b.commit(`rc_board_${row.id}`);
  }
  // A pole sign, tall enough to be the first thing you see of the place.
  const SIGN = { y: 6.1, w: 3.7, h: 1.85 };
  const pole = new Part();
  pole.box(M.steel, [0, 2.6, 0], [.2, 5.2, .2]);
  pole.box(M.steel, [0, SIGN.y, -.13], [SIGN.w + .16, SIGN.h + .16, .2]);
  pole.commit('rc_pole_sign');
  const glowMaterial = material('lit sign panel', [.95, .9, .72], .5, 0, [1.9, 1.72, 1.2]);
  const glow = new Part();
  glow.box(glowMaterial, [0, SIGN.y, 0], [SIGN.w, SIGN.h, .03]);
  glow.commit('rc_pole_glow');
  // The ground of the pull-in, in world orientation, made from the same road the tyres use.
  const ground = new Part(), anchor = openingWorldAt(ROAD_SERVICES_GROUND.d, ROAD_SERVICES_GROUND.lateral);
  const at = (d, lateral, y) => { const a = openingWorldAt(d, lateral); return [a.x - anchor.x, y, a.z - anchor.z]; };
  const tarmac = material('forecourt tarmac', [.085, .085, .08], .88), verge = material('pull-in verge', [.2, .22, .1], .92), paint = material('forecourt paint', [.74, .72, .62], .7);
  const UP = [0, 1, 0], ROAD = 3.25;
  for (let d = ROAD_SERVICES.from; d < ROAD_SERVICES.to; d += 1) {
    const w0 = ROAD + roadServicesWiden(d), w1 = ROAD + roadServicesWiden(d + 1);
    ground.quad(tarmac, at(d, -ROAD + .08, -.014), at(d, -w0, -.014), at(d + 1, -w1, -.014), at(d + 1, -ROAD + .08, -.014), UP);
    ground.quad(verge, at(d, -w0, -.02), at(d, -w0 - 1.25, -.02), at(d + 1, -w1 - 1.25, -.02), at(d + 1, -w1, -.02), UP);
  }
  // Broken line across the mouth, and bays: the marks that say a van may stop here.
  for (let d = ROAD_SERVICES.from + 10; d < ROAD_SERVICES.to - 8; d += 3) ground.quad(paint, at(d, -ROAD - .12, -.008), at(d, -ROAD - .28, -.008), at(d + 1.3, -ROAD - .28, -.008), at(d + 1.3, -ROAD - .12, -.008), UP);
  for (const d of [-158.5, -155.2, -151.9, -143.6, -140.3]) ground.quad(paint, at(d, -7.6, -.008), at(d, -12.1, -.008), at(d + .11, -12.1, -.008), at(d + .11, -7.6, -.008), UP);
  ground.commit('rc_services_ground');

  // The stand. Nose to the forecourt on +Z: a long lit window, a counter you could lean on.
  const W = 3.3, D = 1.7;
  const wall = material('stand wall paint', [.34, .33, .27], .78), trim = material('stand trim', [.42, .1, .03], .6);
  const formica = material('counter laminate', [.46, .42, .34], .36, .05), inside = material('lit interior wall', [.92, .98, .88], .5, 0, [1.8, 2, 1.7]);
  const tube = material('strip light', [1, 1, .96], .4, 0, [4.2, 4.6, 4]), orange = material('awning orange', [.5, .13, .02], .82), cream = material('awning cream', [.46, .42, .3], .82);
  const apron = material('stand apron', [.28, .28, .26], .9), signLit = material('roof sign panel', [.95, .9, .72], .5, 0, [1.9, 1.72, 1.2]);
  const st = new Part();
  st.box(apron, [0, .04, .85], [9.4, .08, 5.4]);
  st.box(wall, [0, .54, D], [W * 2, .92, .14]);
  st.box(wall, [0, 2.46, D], [W * 2, .62, .14]);
  for (const side of [-1, 1]) { st.box(wall, [side * (W - .32), 1.57, D], [.64, 1.16, .14]); st.box(wall, [side * W, 1.42, 0], [.12, 2.76, D * 2]); }
  st.box(wall, [0, 1.42, -D], [W * 2, 2.76, .12]);
  st.box(trim, [0, .16, D + .03], [W * 2 + .08, .16, .18]);
  st.box(trim, [0, 2.7, D + .04], [W * 2 + .1, .15, .2]);
  st.box(M.steel, [0, 2.84, 0], [W * 2 + .34, .1, D * 2 + .34]);
  for (const x of [-.95, .95]) st.box(M.steel, [x, 1.57, D], [.06, 1.16, .05]);
  // Everything inside is lit, so what is in there reads as shapes against it.
  st.box(inside, [0, 1.56, -.8], [W * 2 - .3, 1.3, .04]);
  st.box(inside, [0, 2.14, .45], [W * 2 - .3, .03, 2.5]);
  for (const x of [-2.1, 0, 2.1]) st.box(tube, [x, 2.09, 1.05], [1.45, .05, .09]);
  st.box(formica, [0, 1.04, D + .2], [W * 2 - .7, .06, .56]);
  st.box(M.steel, [0, 1.36, -.66], [W * 2 - .4, .05, .3]);
  for (const [x, w, h] of [[-2.4, .34, .5], [-1.75, .16, .24], [-1.45, .16, .24], [.1, .42, .62], [.82, .2, .3], [1.3, .3, .2], [2.2, .26, .42]]) st.box(M.steel, [x, 1.385 + h / 2, -.66], [w, h, .24]);
  st.box(M.steel, [1.9, 1.24, 1.25], [.34, .36, .3]);
  // The awning, in stripes, and its valance.
  const STRIPES = 14, stripeW = (W * 2 + .3) / STRIPES;
  for (let n = 0; n < STRIPES; n++) {
    const x0 = -W - .15 + n * stripeW, x1 = x0 + stripeW, m = n % 2 ? cream : orange;
    st.quad(m, [x0, 2.68, D + .12], [x1, 2.68, D + .12], [x1, 2.3, D + 1.3], [x0, 2.3, D + 1.3], [0, .95, .3]);
    st.quad(m, [x0, 2.3, D + 1.3], [x1, 2.3, D + 1.3], [x1, 2.12, D + 1.32], [x0, 2.12, D + 1.32], [0, 0, 1]);
  }
  for (const side of [-1, 1]) st.box(M.steel, [side * (W + .1), 2.46, D + .7], [.04, .04, 1.3]);
  // The sign on the roof, and a lit menu on the end of the front wall.
  for (const x of [-2.1, 2.1]) st.box(M.steel, [x, 3.1, .3], [.09, .4, .09]);
  st.box(M.steel, [0, 3.72, .24], [5.5, 1.14, .16]);
  st.box(signLit, [0, 3.72, .34], [5.3, .96, .04]);
  st.box(signLit, [W + .02 - 3.3 - W + .32, 1.57, D + .08], [.58, 1.04, .02]);
  st.commit('rc_stand');
  for (const row of ROAD_CAST_BOARD_COPY.lit) {
    const png = await sharp(path.join(work, `letters-${row.id}.png`)).png({ compressionLevel: 9 }).toBuffer();
    billBytes[`letters-${row.id}`] = png.length;
    const texture = doc.createTexture(`letters ${row.id}`).setImage(new Uint8Array(png)).setMimeType('image/png');
    const m = doc.createMaterial(`cut letters / ${row.id}`).setBaseColorTexture(texture).setAlphaMode('MASK').setAlphaCutoff(.5)
      .setRoughnessFactor(.7).setMetallicFactor(0).setDoubleSided(true).setExtras({ materialFactors: 'gltf', studyLocalFinish: true });
    const q = new Part();
    const face = { pole: [-SIGN.w / 2 + .1, SIGN.w / 2 - .1, SIGN.y - SIGN.h / 2 + .06, SIGN.y + SIGN.h / 2 - .06, .024], roof: [-2.55, 2.55, 3.28, 4.16, .364], menu: [-W + .06, -W + .58, 1.09, 2.05, D + .094] }[row.id];
    q.quad(m, [face[0], face[2], face[4]], [face[1], face[2], face[4]], [face[1], face[3], face[4]], [face[0], face[3], face[4]], [0, 0, 1]);
    q.commit(`rc_letters_${row.id}`);
  }
  fs.rmSync(work, { recursive: true, force: true });
}

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'road-cast.glb');
const io = new NodeIO();
await io.write(file, doc);
const bytes = fs.readFileSync(file);
fs.writeFileSync(path.join(OUT, 'road-cast.stats.json'), JSON.stringify({
  generator: 'tools/chunk_surfer/source-drive-study/build-road-cast.mjs',
  bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  meshes: doc.getRoot().listMeshes().map(mesh => mesh.getName()), billBytes,
}, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'road-cast.credits.json'), JSON.stringify({
  authored: 'Procedural in this repository. Bills are downscaled from the authored fictional Ellery publicity in public/assets/institution-posters.',
  thirdParty: [],
}, null, 1) + '\n');
console.log(`road-cast.glb ${(bytes.length / 1024).toFixed(0)} KB, ${doc.getRoot().listMeshes().length} meshes`);
