// The radio in the dash. It replaces `drive_radio` and `opening_drive_radio` by name, so
// anywhere that places the old box gets this one, and anywhere that never loaded this pack
// still has a radio. The body is built in cab space like the mesh it replaces; the keys and
// the knob are built about their own middle because they move.
//   node tools/chunk_surfer/source-drive-study/build-cab-radio.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { CAB_RADIO } from '../../../src/data/cab-radio.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = path.join(ROOT, 'public/assets/source-drive/cab-radio');
const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('cab radio');
doc.getRoot().setDefaultScene(scene);

const finish = m => m.setDoubleSided(true).setExtras({ materialFactors: 'gltf', studyLocalFinish: true });
const material = (name, rgb, roughness, metallic = 0) => finish(doc.createMaterial(name).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(roughness).setMetallicFactor(metallic));
const M = {
  dash: material('grey dash surround', [.2, .2, .195], .82),
  frame: material('pressed steel radio frame', [.33, .33, .32], .46, .72),
  screw: material('dark radio frame screw', [.05, .05, .052], .45, .8),
  body: material('black radio plastic', [.016, .017, .018], .55),
  side: material('radio key side', [.022, .023, .024], .6),
  door: material('smoked tape door', [.05, .052, .055], .3),
  chrome: material('chrome eject bar', [.42, .42, .41], .3, .9),
  plate: material('unmarked badge plate', [.28, .28, .27], .36, .85),
  knob: material('knurled black knob', [.02, .02, .021], .5),
  cap: material('brushed knob cap', [.3, .3, .29], .34, .85),
  tick: material('knob pointer', [.72, .72, .68], .5),
  tube: material('unlit tube glass', [.006, .012, .01], .2),
};

const { center, faceZ, face, surround } = CAB_RADIO;
const OFFSET = [center[0], center[1], faceZ];
const layoutFile = path.join(os.tmpdir(), `cab-radio-${process.pid}.json`), printFile = path.join(os.tmpdir(), `cab-radio-${process.pid}.png`);
fs.writeFileSync(layoutFile, JSON.stringify(CAB_RADIO));
execFileSync('python', [path.join(ROOT, 'tools/chunk_surfer/source-drive-study/render-cab-radio-face.py'), layoutFile, printFile], { stdio: 'inherit' });
const printBytes = fs.readFileSync(printFile);
fs.rmSync(layoutFile, { force: true }); fs.rmSync(printFile, { force: true });
M.print = finish(doc.createMaterial('radio face print').setBaseColorTexture(doc.createTexture('radio face').setImage(new Uint8Array(printBytes)).setMimeType('image/png')).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(.58).setMetallicFactor(0));

// Maps a face offset onto the printed image, wherever the surface it belongs to ends up.
const printUv = (x, y) => [x / face.w + .5, .5 - y / face.h];

class Part {
  constructor(origin = OFFSET) { this.origin = origin; this.buckets = new Map(); }
  bucket(m) { if (!this.buckets.has(m)) this.buckets.set(m, { p: [], n: [], t: [], i: [] }); return this.buckets.get(m); }
  push(m, verts, normal, uv) {
    const q = this.bucket(m), base = q.p.length / 3;
    verts.forEach((v, k) => { q.p.push(v[0] + this.origin[0], v[1] + this.origin[1], v[2] + this.origin[2]); q.n.push(...normal); q.t.push(...uv[k]); });
    q.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // A flat rectangle facing the driver, at height z off the face.
  rect(m, x, y, w, h, z, uv = null) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2;
    const v = [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
    this.push(m, v, [0, 0, 1], uv || (m === M.print ? v.map(p => printUv(p[0], p[1])) : [[0, 1], [1, 1], [1, 0], [0, 0]]));
  }
  // A proud block. `top` is what's on its face; the sides are plain.
  block(top, side, x, y, w, h, z0, z1, uvAt = null, chamfer = 0) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2, ti = chamfer;
    const flat = [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.push(side, [[x0, y1, z0], [x1, y1, z0], [x1 - ti, y1 - ti, z1], [x0 + ti, y1 - ti, z1]], [0, .9, .43], flat);
    this.push(side, [[x1, y0, z0], [x0, y0, z0], [x0 + ti, y0 + ti, z1], [x1 - ti, y0 + ti, z1]], [0, -.9, .43], flat);
    this.push(side, [[x1, y1, z0], [x1, y0, z0], [x1 - ti, y0 + ti, z1], [x1 - ti, y1 - ti, z1]], [.9, 0, .43], flat);
    this.push(side, [[x0, y0, z0], [x0, y1, z0], [x0 + ti, y1 - ti, z1], [x0 + ti, y0 + ti, z1]], [-.9, 0, .43], flat);
    const front = [[x0 + ti, y0 + ti, z1], [x1 - ti, y0 + ti, z1], [x1 - ti, y1 - ti, z1], [x0 + ti, y1 - ti, z1]];
    this.push(top, front, [0, 0, 1], uvAt ? front.map(p => uvAt(p[0], p[1])) : (top === M.print ? front.map(p => printUv(p[0], p[1])) : flat));
  }
  // A thin raised frame around a rectangle, so an edge catches the light in the dark.
  rim(m, x, y, w, h, z0, z1, t) {
    this.block(m, m, x, y + h / 2 - t / 2, w, t, z0, z1);
    this.block(m, m, x, y - h / 2 + t / 2, w, t, z0, z1);
    this.block(m, m, x - w / 2 + t / 2, y, t, h - t * 2, z0, z1);
    this.block(m, m, x + w / 2 - t / 2, y, t, h - t * 2, z0, z1);
  }
  // A knob, axis along Z. The sides are knurled; the cap is a flat disc with a pointer.
  knob(sideM, capM, x, y, r, z0, z1, flutes = 26, capR = .72) {
    const q = this.bucket(sideM), ring = i => {
      const a = i / (flutes * 2) * Math.PI * 2, rr = r * (i % 2 ? .955 : 1);
      return [Math.cos(a) * rr + x, Math.sin(a) * rr + y, Math.cos(a), Math.sin(a)];
    };
    for (let i = 0; i < flutes * 2; i++) {
      const a = ring(i), b = ring(i + 1), base = q.p.length / 3, o = this.origin;
      for (const [vx, vy, vz, nx, ny] of [[a[0], a[1], z0, a[2], a[3]], [b[0], b[1], z0, b[2], b[3]], [b[0], b[1], z1, b[2], b[3]], [a[0], a[1], z1, a[2], a[3]]]) { q.p.push(vx + o[0], vy + o[1], vz + o[2]); q.n.push(nx, ny, 0); q.t.push(0, 0); }
      q.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const disc = (m, radius, z) => {
      const d = this.bucket(m), segments = 32, c = d.p.length / 3, o = this.origin;
      d.p.push(x + o[0], y + o[1], z + o[2]); d.n.push(0, 0, 1); d.t.push(.5, .5);
      for (let i = 0; i <= segments; i++) { const a = i / segments * Math.PI * 2; d.p.push(x + Math.cos(a) * radius + o[0], y + Math.sin(a) * radius + o[1], z + o[2]); d.n.push(0, 0, 1); d.t.push(.5, .5); }
      for (let i = 1; i <= segments; i++) d.i.push(c, c + i, c + i + 1);
    };
    disc(sideM, r, z1);
    disc(capM, r * capR, z1 + .0002);
  }
  commit(...names) {
    const mesh = doc.createMesh(names[0]);
    for (const [m, q] of this.buckets) {
      mesh.addPrimitive(doc.createPrimitive().setMaterial(m)
        .setAttribute('POSITION', doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array(q.p)))
        .setAttribute('NORMAL', doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array(q.n)))
        .setAttribute('TEXCOORD_0', doc.createAccessor().setBuffer(buffer).setType('VEC2').setArray(new Float32Array(q.t)))
        .setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint32Array(q.i))));
    }
    // The parked cab reaches the same meshes through its own names.
    for (const name of names) {
      const named = name === names[0] ? mesh : mesh.clone().setName(name);
      scene.addChild(doc.createNode(name).setMesh(named));
    }
    return this;
  }
}
const both = name => [name, `opening_${name}`];

// ── The body: what doesn't move ──────────────────────────────────────────────────────
{
  const u = new Part();
  // The hole in the dash, filled, and a box going back into it.
  const sw = surround.w, sh = surround.h;
  u.block(M.dash, M.dash, 0, 0, sw, sh, -.008, .0, null, .0015);
  u.block(M.body, M.body, 0, 0, face.w - .004, face.h - .004, -.17, -.001);
  // Pressed steel frame around the face, with a screw in each corner.
  const edge = .0034, fw = face.w + edge * 2, fh = face.h + edge * 2;
  u.block(M.frame, M.frame, 0, face.h / 2 + edge / 2, fw, edge, -.0004, .0016);
  u.block(M.frame, M.frame, 0, -face.h / 2 - edge / 2, fw, edge, -.0004, .0016);
  u.block(M.frame, M.frame, -face.w / 2 - edge / 2, 0, edge, face.h, -.0004, .0016);
  u.block(M.frame, M.frame, face.w / 2 + edge / 2, 0, edge, face.h, -.0004, .0016);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) u.knob(M.screw, M.frame, sx * (face.w / 2 + edge / 2), sy * (face.h / 2 + edge / 2), .0015, .0014, .0021, 6, .4);
  // The printed face.
  u.rect(M.print, 0, 0, face.w, face.h, .0004);
  // Tube window: a recess with a bright lip. The tube itself is its own mesh.
  const r = CAB_RADIO.readout;
  u.block(M.body, M.side, r.x, r.y, r.w + .0034, r.h + .0034, .0004, .0024, null, .0009);
  u.rim(M.frame, r.x, r.y, r.w + .0026, r.h + .0026, .0023, .0031, .0006);
  // Tape door, standing slightly proud, with its eject bar and the slot's shadow.
  const d = CAB_RADIO.door, e = CAB_RADIO.eject;
  u.block(M.door, M.side, d.x, d.y, d.w, d.h, .0004, .0028, null, .0006);
  u.rim(M.frame, d.x, d.y, d.w - .0006, d.h - .0006, .0026, .0033, .0006);
  u.rect(M.body, d.x, d.y + d.h / 2 - .0032, d.w - .012, .0012, .00285);
  // Icon strip on the door is in the print; put it above the door's gloss.
  u.rect(M.print, d.x - d.w / 2 + .0085, d.y + d.h / 2 - .0052, .011, .0066, .00288);
  u.rect(M.print, e.x - e.w / 2 - .009, e.y, .014, .004, .00288);
  u.block(M.chrome, M.side, e.x, e.y, e.w, e.h, .0028, .0058, null, .0006);
  // A plate where the maker's oval went. Nothing's on it.
  u.block(M.plate, M.side, d.x + d.w / 2 - .0085, d.y + d.h / 2 - .0052, .0115, .0058, .0028, .0034, null, .0003);
  // Seek rockers, tune rocker, band keys, tone, small key: fixed, but they stand off the face.
  for (const s of CAB_RADIO.seek) u.block(M.print, M.side, s.x, s.y, s.w, s.h, .0004, .0038, null, .0006);
  const t = CAB_RADIO.tune;
  u.block(M.print, M.side, t.x, t.y, t.w, t.h, .0004, .0042, null, .0008);
  for (const b of CAB_RADIO.band) u.block(M.print, M.side, b.x, b.y, b.w, b.h, .0004, .0036, null, .0005);
  const n = CAB_RADIO.noise;
  u.block(M.print, M.side, n.x, n.y, n.w, n.h, .0004, .0032, null, .0005);
  // Wells the moving keys sit in.
  const kr = CAB_RADIO.keyRow, keySpan = CAB_RADIO.keys[3].x - CAB_RADIO.keys[0].x + kr.w + .0022;
  u.rect(M.side, (CAB_RADIO.keys[0].x + CAB_RADIO.keys[3].x) / 2, kr.y, keySpan, kr.h + .0022, .00044);
  const tn = CAB_RADIO.tone;
  u.knob(M.knob, M.cap, tn.x, tn.y, tn.r, .0004, tn.proud, 18);
  u.rect(M.tick, tn.x, tn.y + tn.r * .46, .0007, tn.r * .5, tn.proud + .0004);
  // Collar behind the volume knob.
  u.knob(M.side, M.side, CAB_RADIO.volume.x, CAB_RADIO.volume.y, CAB_RADIO.volume.r * 1.14, .0004, .0024, 24, .9);
  u.commit(...both('drive_radio'));
}

// ── The keys, about their own middle ─────────────────────────────────────────────────
for (const key of CAB_RADIO.keys) {
  const part = new Part([0, 0, 0]), kr = CAB_RADIO.keyRow;
  // The top samples the print at the key's place on the face, so it carries its numeral.
  part.block(M.print, M.side, 0, 0, kr.w, kr.h, 0, kr.proud, (x, y) => printUv(x + key.x, y + kr.y), .0007);
  part.commit(...both(`drive_radio_key_${key.id}`));
}

// ── The volume knob, about its own axis ──────────────────────────────────────────────
{
  const v = CAB_RADIO.volume, part = new Part([0, 0, 0]);
  part.knob(M.knob, M.cap, 0, 0, v.r, 0, v.proud, 30);
  part.rect(M.tick, 0, v.r * .5, .0011, v.r * .54, v.proud + .0004);
  part.commit(...both('drive_radio_knob'));
}

// ── The tube: one flat quad the running canvas is put on ─────────────────────────────
{
  const r = CAB_RADIO.readout, part = new Part();
  // v runs up the canvas here, because a live canvas comes in flipped.
  part.rect(M.tube, r.x, r.y, r.w, r.h, .0026, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  part.commit(...both('drive_radio_readout'));
}

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'cab-radio.glb');
await new NodeIO().write(file, doc);
const bytes = fs.readFileSync(file);
const count = doc.getRoot().listMeshes().reduce((n, mesh) => n + mesh.listPrimitives().reduce((m, p) => m + (p.getIndices()?.getCount() || 0) / 3, 0), 0);
fs.writeFileSync(path.join(OUT, 'cab-radio.stats.json'), `${JSON.stringify({
  bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  meshes: doc.getRoot().listMeshes().map(mesh => mesh.getName()).sort(), triangles: count,
}, null, 2)}\n`);
fs.writeFileSync(path.join(OUT, 'cab-radio.credits.json'), `${JSON.stringify({
  note: 'Built for this game by tools/chunk_surfer/source-drive-study/build-cab-radio.mjs. An homage to the layout of late-1980s European Ford radio-cassette units with a green VFD in the manner of period car stereos. No maker\'s name, mark or artwork is reproduced.',
  fonts: 'assets/fonts/NimbusSans (URW base35)',
}, null, 2)}\n`);
console.log('wrote', path.relative(ROOT, file), bytes.length, 'bytes', count, 'triangles');
