import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { STOP_LISTENING_MESH } from '../src/data/stop-listening.js';

const bytes = fs.readFileSync(process.env.CS_EAR_TEST_ASSET || new URL('../public/assets/stop-listening.glb', import.meta.url));
const length = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.subarray(20, 20 + length)), base = 28 + length;
function read(index) {
  const a = gltf.accessors[index], v = gltf.bufferViews[a.bufferView];
  const count = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const width = a.componentType === 5126 || a.componentType === 5125 ? 4 : 2;
  const method = a.componentType === 5126 ? 'readFloatLE' : a.componentType === 5125 ? 'readUInt32LE' : 'readUInt16LE';
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: count }, (_, k) =>
    bytes[method](base + (v.byteOffset || 0) + (a.byteOffset || 0) + i * (v.byteStride || count * width) + k * width)));
}
const mesh = (name) => gltf.meshes.find((m) => m.name === name);
const material = (p) => gltf.materials[p.material].name;
const triangles = (m) => m.primitives.filter((p) => material(p) !== 'stop listening floor wet').flatMap((p) => {
  const positions = read(p.attributes.POSITION), ids = read(p.indices).flat();
  return Array.from({ length: ids.length / 3 }, (_, i) => ids.slice(i * 3, i * 3 + 3).map((id) => positions[id]));
});

test('the shipped ear separates cold cartilage, inflamed recesses and wet severed attachment', () => {
  const skin = gltf.materials.find((m) => m.name === 'stop listening ear skin').pbrMetallicRoughness;
  const deep = gltf.materials.find((m) => m.name === 'stop listening ear deep').pbrMetallicRoughness;
  const wound = gltf.materials.find((m) => m.name === 'stop listening ear wound').pbrMetallicRoughness;
  const rgb = skin.baseColorFactor.slice(0, 3);
  assert.ok(Math.max(...rgb) - Math.min(...rgb) < .09, 'uniform pink skin returned');
  assert.ok(skin.roughnessFactor >= .40 && wound.roughnessFactor <= .17, 'wet root and cartilage need distinct light response');
  assert.ok(rgb[0] / deep.baseColorFactor[0] > 3, 'the canal cannot disappear into the bright helix');
  for (const name of STOP_LISTENING_MESH.ears) {
    const primitives = mesh(name).primitives.filter((p) => material(p) !== 'stop listening floor wet');
    const total = primitives.reduce((n, p) => n + gltf.accessors[p.indices].count, 0);
    const fraction = (label) => primitives.filter((p) => material(p) === label).reduce((n, p) => n + gltf.accessors[p.indices].count, 0) / total;
    assert.ok(fraction('stop listening ear wound') > .14, `${name}: no substantial torn root`);
    assert.ok(fraction('stop listening ear deep') > .14, `${name}: the concha/folds have become an unbroken bright bowl`);
  }
});

function heightAt(tri, x, z) {
  const [a, b, c] = tri, den = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(den) < 1e-10) return null;
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / den;
  const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / den;
  if (u < -.00001 || v < -.00001 || u + v > 1.00001) return null;
  return u * a[1] + v * b[1] + (1 - u - v) * c[1];
}

test('the actual concha has a deep recess bounded by raised folded cartilage', () => {
  const tris = triangles(mesh('stop_listening_ear_a'));
  const top = (x, z) => Math.max(0, ...tris.map((t) => heightAt(t, x, z)).filter((v) => v !== null));
  let recessed = 0;
  for (let x = -.075; x <= .055; x += .01) for (let z = -.08; z <= .10; z += .01) {
    const h = top(x, z), rim = [[.05, 0], [-.05, 0], [0, .05], [0, -.05]].map(([dx, dz]) => top(x + dx, z + dz));
    if (h < .05 && rim.filter((v) => v > h + .04).length >= 3) recessed++;
  }
  assert.ok(recessed >= 6, `only ${recessed} cm-grid samples have a 4cm-deep concha under a raised tragus/antihelix`);
});

test('wall lettering is pressed pigment film with an outward-facing surface, not rounded tube letters', () => {
  for (const name of Object.values(STOP_LISTENING_MESH.writing)) {
    const m = mesh(name), normals = m.primitives.flatMap((p) => read(p.attributes.NORMAL));
    assert.ok(normals.filter((n) => n[2] > .95).length / normals.length > .98, `${name}: pipe sides/back dominate the brush surface`);
    const points = m.primitives.flatMap((p) => read(p.attributes.POSITION));
    assert.ok(Math.max(...points.map((p) => p[2])) - Math.min(...points.map((p) => p[2])) < .002, `${name}: pigment floats off the wall`);
  }
});

test('loaded wall pigment stays matte and dark enough to read under the actual torch', () => {
  for (const tone of ['dark', 'pale']) {
    const p = gltf.materials.find((m) => m.name === `stop listening paint ${tone}`).pbrMetallicRoughness;
    assert.ok(p.roughnessFactor >= .90, `${tone}: a full-stroke white specular sheet erases the words`);
    assert.ok(Math.max(...p.baseColorFactor.slice(0, 3)) < .15, `${tone}: pale paint merges with the torch-lit wall`);
  }
});

test('the horror pass keeps the exact take sheet and lowers the original pack budget', () => {
  const h = crypto.createHash('sha256');
  for (const p of mesh(STOP_LISTENING_MESH.sheet).primitives) for (const [name, id] of Object.entries({ ...p.attributes, indices: p.indices }).sort()) {
    const a = gltf.accessors[id], v = gltf.bufferViews[a.bufferView];
    h.update(`${name}:${a.componentType}:${a.type}:${a.count}`);
    h.update(bytes.subarray(base + (v.byteOffset || 0), base + (v.byteOffset || 0) + v.byteLength));
  }
  assert.equal(h.digest('hex'), 'ed47b29c518786ed632b3d71e158923d39c370a6626d30572a8ac08c0392ace4', 'the take sheet changed with the ear/writing treatment');
  const count = gltf.meshes.reduce((sum, m) => sum + m.primitives.reduce((n, p) => n + gltf.accessors[p.indices].count / 3, 0), 0);
  assert.equal(gltf.meshes.length, 16, 'this pass cannot add locations or model dispatches');
  assert.ok(count < 118912 && bytes.length < 3454564, 'spend saved writing geometry on anatomy without increasing the full pack');
});
