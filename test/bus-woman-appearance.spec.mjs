import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { outskirtsArrivalLayout } from '../src/data/source-outskirts-arrival.js';

// Inspect the shipped static pack, not the builder's source or its declarations.
// This is the shared interim body; the three hero studies remain unselected.
const bytes = readFileSync(new URL('../public/assets/conservatory-props.glb', import.meta.url));
assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
let gltf, binary;
for (let at = 12; at < bytes.length;) {
  const length = bytes.readUInt32LE(at), type = bytes.readUInt32LE(at + 4);
  const chunk = bytes.subarray(at + 8, at + 8 + length);
  if (type === 0x4e4f534a) gltf = JSON.parse(chunk.toString('utf8').trim());
  if (type === 0x004e4942) binary = chunk;
  at += 8 + length;
}
assert.ok(gltf && binary);
const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const types = { 5121: ['getUint8', 1], 5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4] };
function accessor(index) {
  const a = gltf.accessors[index], buffer = gltf.bufferViews[a.bufferView];
  const [read, size] = types[a.componentType], width = widths[a.type];
  const start = (buffer.byteOffset || 0) + (a.byteOffset || 0), stride = buffer.byteStride || size * width;
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, k) => view[read](start + i * stride + k * size, true))).flat();
}
function mesh(name) {
  const found = gltf.meshes.filter((entry) => entry.name === name);
  assert.equal(found.length, 1, `expected one shipped mesh named ${name}`);
  return found[0].primitives.map((primitive) => ({
    material: gltf.materials[primitive.material],
    attributes: Object.fromEntries(Object.entries(primitive.attributes).map(([key, index]) => [key, accessor(index)])),
    indices: accessor(primitive.indices), mode: primitive.mode ?? 4,
  }));
}
const yard = mesh('exterior_bus_woman'), outskirts = mesh('outskirts_bus_woman');
const points = (primitives) => primitives.flatMap((primitive) => {
  const p = primitive.attributes.POSITION;
  return Array.from({ length: p.length / 3 }, (_, i) => p.slice(i * 3, i * 3 + 3));
});
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));

test('the built yard and Outskirts assets have exactly the same geometry, normals and materials', () => {
  assert.deepEqual(yard, outskirts, 'the two aliases no longer describe the same visible woman');
  assert.ok(points(yard).length > 500, 'the shared baseline lost its close geometry');
  assert.ok(points(yard).flat().every(Number.isFinite));
});

test('the existing skin, navy coat, mustard scarf and bag remain in both appearances', () => {
  const names = new Set(yard.map((primitive) => primitive.material.name));
  for (const name of ['deep skin', 'navy raincloth', 'mustard wool']) assert.ok(names.has(name), `missing identity material: ${name}`);
  const scarf = points(yard.filter((primitive) => primitive.material.name === 'mustard wool'));
  assert.ok(scarf.some((p) => p[1] > 1.30), 'the mustard material no longer forms a scarf around her neck');
  assert.ok(scarf.some((p) => p[1] < 1.05), 'the scarf tail disappeared');
  assert.ok(points(yard).some((p) => p[0] > .46 && p[1] > .50 && p[1] < .90), 'the asymmetric carried bag disappeared');
});

test('the shared baseline retains a protruding human face instead of inheriting the boy cavity', () => {
  const skin = points(yard.filter((primitive) => primitive.material.name === 'deep skin'));
  const nose = skin.filter((p) => Math.abs(p[0]) < .04 && p[1] > 1.48 && p[1] < 1.62 && p[2] < -.13);
  assert.ok(nose.length >= 8, 'the actual skin-coloured nose bridge and lower face are missing');
  for (const sign of [-1, 1]) {
    assert.ok(skin.some((p) => Math.sign(p[0]) === sign && Math.abs(p[0]) > .045 && p[1] > 1.48 && p[1] < 1.65 && p[2] < -.045), 'one side of the modelled cheek is missing');
  }
  assert.ok(yard.every((primitive) => !/void|cavity|faceless/i.test(primitive.material.name)), 'the boy facial absence entered the woman asset');
});

test('the runtime ticket attachment touches the exported right glove at the model scale', () => {
  // This is the production contact in streetDetailInstances. The companion
  // runtime suite checks that every recurrence transforms it with its body.
  const contact = [.28, .98, -.12], yaw = .4;
  const glove = points(yard).filter((p) => p[0] > .23 && p[0] < .335 && p[1] > .83 && p[1] < 1.0 && p[2] > -.15 && p[2] < -.045);
  assert.ok(glove.length > 20, 'the actual right glove is absent at the attachment');
  const paper = points(mesh('outskirts_ticket')).map(([x, y, z]) => [contact[0] + x * Math.cos(yaw) + z * Math.sin(yaw), contact[1] + y, contact[2] - x * Math.sin(yaw) + z * Math.cos(yaw)]);
  const gap = Math.min(...paper.flatMap((p) => glove.map((q) => distance(p, q))));
  assert.ok(gap < .018, `exported paper misses the glove by ${(gap * 1000).toFixed(1)} mm`);
});

test('the ordinary placement and every repeated appearance still select the shared visible aliases', () => {
  const ordinary = CONSERVATORY_PROPS.find((piece) => piece.id === 'yard-bus-waiter');
  assert.ok(ordinary, 'the optional ordinary woman disappeared');
  assert.equal(ordinary.mesh, 'exterior_bus_woman');
  assert.equal(ordinary.loreId, 'yard-bus-waiter');
  const repeated = outskirtsArrivalLayout().filter((piece) => /^bus-woman/.test(piece.key));
  assert.ok(repeated.some((piece) => piece.key === 'bus-woman-aboard'));
  assert.ok(repeated.some((piece) => /crowd/.test(piece.key)));
  assert.ok(repeated.every((piece) => piece.mesh === 'outskirts_bus_woman'));
  const heights = points(yard).map((p) => p[1]);
  assert.ok(Math.max(...heights) > 1.65 && Math.max(...heights) < 1.80, 'shared body changed scale');
  assert.ok(Math.min(...heights) >= -.001 && Math.min(...heights) < .01, 'the common model root no longer meets its floor');
});
