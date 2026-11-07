// The dash, printed and standing off the cabin it was measured from. One mesh under two names,
// `drive_cabin_dash` and `opening_drive_cabin_dash`, in cab space, like the radio.
//   node tools/chunk_surfer/source-drive-study/build-cab-dash.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { CAB_DASH, CAB_DASH_MESHES } from '../../../src/data/cab-dash.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = path.join(ROOT, 'public/assets/source-drive/cab-dash');
const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene('cab dash');
doc.getRoot().setDefaultScene(scene);

const finish = m => m.setDoubleSided(true).setExtras({ materialFactors: 'gltf', studyLocalFinish: true });
const material = (name, rgb, roughness, metallic = 0) => finish(doc.createMaterial(name).setBaseColorFactor([...rgb, 1]).setRoughnessFactor(roughness).setMetallicFactor(metallic));

const faces = fs.mkdtempSync(path.join(os.tmpdir(), 'cab-dash-'));
const layout = path.join(faces, 'layout.json');
fs.writeFileSync(layout, JSON.stringify(CAB_DASH));
execFileSync('python', [path.join(ROOT, 'tools/chunk_surfer/source-drive-study/render-cab-dash-faces.py'), layout, faces], { stdio: 'inherit' });
const printed = (name, roughness) => finish(doc.createMaterial(`${name} print`)
  .setBaseColorTexture(doc.createTexture(name).setImage(new Uint8Array(fs.readFileSync(path.join(faces, `${name}.png`)))).setMimeType('image/png'))
  .setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(roughness).setMetallicFactor(0));
const M = {
  cluster: printed('cluster', .5), fascia: printed('fascia', .78), top: printed('top', .84),
  ring: material('instrument bezel', [.2, .2, .19], .42, .6),
  side: material('switch side', [.03, .03, .032], .6),
  rocker: material('black rocker face', [.05, .05, .052], .5),
  red: material('hazard rocker', [.5, .08, .06], .46),
  knob: material('black knob', [.03, .03, .032], .5),
  cap: material('knob cap', [.42, .42, .4], .36, .8),
  tick: material('white paint', [.82, .81, .74], .55),
  slot: material('demister slot', [.012, .012, .014], .8),
  lip: material('demister lip', [.34, .33, .31], .5),
  tray: material('ashtray front', [.2, .2, .19], .5, .4),
};
fs.rmSync(faces, { recursive: true, force: true });

const buckets = new Map();
const bucket = m => { if (!buckets.has(m)) buckets.set(m, { p: [], n: [], t: [], i: [] }); return buckets.get(m); };
function quad(m, verts, normal, uv = [[0, 1], [1, 1], [1, 0], [0, 0]]) {
  const q = bucket(m), base = q.p.length / 3;
  verts.forEach((v, k) => { q.p.push(...v); q.n.push(...normal); q.t.push(...uv[k]); });
  q.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
// A printed rectangle facing the driver, its whole image across it.
function plate(m, box) {
  const { x0, x1, y0, y1, z } = box;
  quad(m, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, 1], [[0, 1], [1, 1], [1, 0], [0, 0]]);
}
// A block standing off the face toward the driver, with a chamfer that catches light.
function block(top, side, x, y, w, h, z0, z1, ch = .001) {
  const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2, flat = [[0, 0], [1, 0], [1, 1], [0, 1]];
  quad(side, [[x0, y1, z0], [x1, y1, z0], [x1 - ch, y1 - ch, z1], [x0 + ch, y1 - ch, z1]], [0, .9, .43], flat);
  quad(side, [[x1, y0, z0], [x0, y0, z0], [x0 + ch, y0 + ch, z1], [x1 - ch, y0 + ch, z1]], [0, -.9, .43], flat);
  quad(side, [[x1, y1, z0], [x1, y0, z0], [x1 - ch, y0 + ch, z1], [x1 - ch, y1 - ch, z1]], [.9, 0, .43], flat);
  quad(side, [[x0, y0, z0], [x0, y1, z0], [x0 + ch, y1 - ch, z1], [x0 + ch, y0 + ch, z1]], [-.9, 0, .43], flat);
  quad(top, [[x0 + ch, y0 + ch, z1], [x1 - ch, y0 + ch, z1], [x1 - ch, y1 - ch, z1], [x0 + ch, y1 - ch, z1]], [0, 0, 1], flat);
}
// A ring around a dial: its face and the outer wall.
function ring(m, x, y, r0, r1, z0, z1, segments = 48) {
  for (let k = 0; k < segments; k++) {
    const a = k / segments * Math.PI * 2, b = (k + 1) / segments * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    quad(m, [[x + ca * r0, y + sa * r0, z1], [x + ca * r1, y + sa * r1, z1], [x + cb * r1, y + sb * r1, z1], [x + cb * r0, y + sb * r0, z1]], [0, 0, 1]);
    quad(m, [[x + ca * r1, y + sa * r1, z1], [x + ca * r1, y + sa * r1, z0], [x + cb * r1, y + sb * r1, z0], [x + cb * r1, y + sb * r1, z1]], [ca, sa, 0]);
  }
}
// A knurled knob, axis toward the driver, with a pale cap and a pointer.
function knob(side, cap, x, y, r, z0, z1, flutes = 22) {
  for (let k = 0; k < flutes * 2; k++) {
    const a = k / (flutes * 2) * Math.PI * 2, b = (k + 1) / (flutes * 2) * Math.PI * 2, ra = r * (k % 2 ? .95 : 1), rb = r * ((k + 1) % 2 ? .95 : 1), ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    quad(side, [[x + ca * ra, y + sa * ra, z0], [x + cb * rb, y + sb * rb, z0], [x + cb * rb, y + sb * rb, z1], [x + ca * ra, y + sa * ra, z1]], [ca, sa, 0]);
  }
  const q = bucket(side), c = q.p.length / 3; q.p.push(x, y, z1); q.n.push(0, 0, 1); q.t.push(.5, .5);
  for (let k = 0; k <= 32; k++) { const a = k / 32 * Math.PI * 2; q.p.push(x + Math.cos(a) * r, y + Math.sin(a) * r, z1); q.n.push(0, 0, 1); q.t.push(.5, .5); }
  for (let k = 1; k <= 32; k++) q.i.push(c, c + k, c + k + 1);
  ring(cap, x, y, 0, r * .62, z1, z1 + .0004, 24);
}

// ── The instruments ──────────────────────────────────────────────────────────────────────
const cz = CAB_DASH.cluster.z;
plate(M.cluster, CAB_DASH.cluster);
for (const dial of [CAB_DASH.speed, CAB_DASH.fuel]) ring(M.ring, dial.x, dial.y, dial.r, dial.r + .0038, cz, cz + .0035);

// ── The fascia and what stands off it ────────────────────────────────────────────────────
plate(M.fascia, CAB_DASH.fascia);
const fz = CAB_DASH.fascia.z;
for (const rocker of CAB_DASH.rockers) {
  block(M.side, M.side, rocker.x, rocker.y, rocker.w + .006, rocker.h + .006, fz, fz + .003);
  block(rocker.tint === 'red' ? M.red : M.rocker, M.side, rocker.x, rocker.y, rocker.w, rocker.h, fz + .002, fz + .011, .002);
  // Its legend, in the same white paint: a bar is what survives at this size.
  block(M.tick, M.tick, rocker.x, rocker.y + rocker.h * .24, rocker.w * .5, rocker.h * .1, fz + .011, fz + .0115, 0);
}
const { lampSwitch: lamp, dimmer, lighter, ashtray } = CAB_DASH;
ring(M.ring, lamp.x, lamp.y, 0, lamp.r * 1.22, fz, fz + .003, 40);
knob(M.knob, M.cap, lamp.x, lamp.y, lamp.r, fz + .003, fz + lamp.proud);
block(M.tick, M.tick, lamp.x, lamp.y + lamp.r * .46, .003, lamp.r * .5, fz + lamp.proud + .0004, fz + lamp.proud + .0009, 0);
block(M.side, M.side, dimmer.x, dimmer.y, dimmer.w, dimmer.h, fz, fz + .002);
block(M.knob, M.side, dimmer.x, dimmer.y, dimmer.w * .55, dimmer.h * .8, fz + .002, fz + dimmer.proud, .002);
ring(M.ring, lighter.x, lighter.y, 0, lighter.r * 1.25, fz, fz + .002, 28);
knob(M.knob, M.cap, lighter.x, lighter.y, lighter.r, fz + .002, fz + lighter.proud, 14);
block(M.tray, M.side, ashtray.x, ashtray.y, ashtray.w, ashtray.h, fz, fz + ashtray.proud, .002);
block(M.lip, M.side, ashtray.x, ashtray.y + ashtray.h * .28, ashtray.w * .5, ashtray.h * .16, fz + ashtray.proud, fz + ashtray.proud + .004, .001);

// ── The top of the moulding ──────────────────────────────────────────────────────────────
const lift = .0022, { profile, spans } = CAB_DASH.top;
const spanAll = [spans[0][0], spans[spans.length - 1][1]], width = spanAll[1] - spanAll[0];
const depth = profile.at(-1)[1] - profile[0][1];
for (const [x0, x1] of spans) {
  for (let k = 0; k < profile.length - 1; k++) {
    const [ya, za] = profile[k], [yb, zb] = profile[k + 1], dy = yb - ya, dz = zb - za, l = Math.hypot(dy, dz), n = [0, dz / l, -dy / l];
    const ua = (x0 - spanAll[0]) / width, ub = (x1 - spanAll[0]) / width, va = (za - profile[0][1]) / depth, vb = (zb - profile[0][1]) / depth;
    quad(M.top, [[x0, ya + lift, za], [x1, ya + lift, za], [x1, yb + lift, zb], [x0, yb + lift, zb]], n, [[ua, va], [ub, va], [ub, vb], [ua, vb]]);
  }
}
const heightAt = z => { for (let k = 0; k < profile.length - 1; k++) { const [ya, za] = profile[k], [yb, zb] = profile[k + 1]; if (z <= zb) return ya + (yb - ya) * (z - za) / (zb - za); } return profile.at(-1)[0]; };
for (const { x0, x1, z0, z1 } of CAB_DASH.demisters) {
  const a = heightAt(z0) + lift + .0012, b = heightAt(z1) + lift + .0012;
  quad(M.lip, [[x0 - .006, a + .0004, z0 - .006], [x1 + .006, a + .0004, z0 - .006], [x1 + .006, b + .0004, z1 + .006], [x0 - .006, b + .0004, z1 + .006]], [0, .99, .1]);
  const vanes = Math.round((x1 - x0) / .014);
  for (let k = 0; k < vanes; k++) {
    const u0 = x0 + (k + .18) * (x1 - x0) / vanes, u1 = x0 + (k + .82) * (x1 - x0) / vanes;
    quad(M.slot, [[u0, a + .0009, z0], [u1, a + .0009, z0], [u1, b + .0009, z1], [u0, b + .0009, z1]], [0, .99, .1]);
  }
}

// ── Out ──────────────────────────────────────────────────────────────────────────────────
const mesh = doc.createMesh(CAB_DASH_MESHES[0]);
for (const [m, q] of buckets) {
  mesh.addPrimitive(doc.createPrimitive().setMaterial(m)
    .setAttribute('POSITION', doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array(q.p)))
    .setAttribute('NORMAL', doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array(q.n)))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setBuffer(buffer).setType('VEC2').setArray(new Float32Array(q.t)))
    .setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint32Array(q.i))));
}
for (const name of CAB_DASH_MESHES) scene.addChild(doc.createNode(name).setMesh(name === CAB_DASH_MESHES[0] ? mesh : mesh.clone().setName(name)));

fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'cab-dash.glb');
await new NodeIO().write(file, doc);
const bytes = fs.readFileSync(file);
const triangles = mesh.listPrimitives().reduce((n, p) => n + p.getIndices().getCount() / 3, 0);
fs.writeFileSync(path.join(OUT, 'cab-dash.stats.json'), `${JSON.stringify({ bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), meshes: CAB_DASH_MESHES, triangles }, null, 2)}\n`);
fs.writeFileSync(path.join(OUT, 'cab-dash.credits.json'), `${JSON.stringify({ note: 'Built for this game by tools/chunk_surfer/source-drive-study/build-cab-dash.mjs. Laid out after late-1980s van instruments and switchgear. No maker\'s name, mark or artwork is reproduced.', fonts: 'assets/fonts/NimbusSans (URW base35)' }, null, 2)}\n`);
console.log(`cab dash: ${triangles} triangles, ${bytes.length} bytes`);
