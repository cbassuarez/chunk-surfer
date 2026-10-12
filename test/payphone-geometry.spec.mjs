// Geometric acceptance for the selected Red Box, read from the actual pack.
// Run after: node tools/chunk_surfer/build-props.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { payphoneLayout, rotaryRestAngle } from '../src/render/payphone-view.js';

const bytes = readFileSync(new URL('../public/assets/conservatory-props.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const pack = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
const binary = 20 + jsonLength + 8;
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readAccessor(index) {
  const accessor = pack.accessors[index], view = pack.bufferViews[accessor.bufferView];
  const count = accessor.count * widths[accessor.type];
  const size = accessor.componentType === 5123 ? 2 : 4;
  const start = binary + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const result = [];
  for (let i = 0; i < count; i++) {
    const at = start + i * size;
    result.push(accessor.componentType === 5126 ? bytes.readFloatLE(at)
      : accessor.componentType === 5123 ? bytes.readUInt16LE(at) : bytes.readUInt32LE(at));
  }
  return result;
}
function geometry(name) {
  const source = pack.meshes.find(mesh => mesh.name === name);
  assert.ok(source, `missing ${name}; rebuild the prop pack`);
  return source.primitives.map(primitive => ({
    positions: readAccessor(primitive.attributes.POSITION),
    normals: readAccessor(primitive.attributes.NORMAL),
    indices: readAccessor(primitive.indices),
    material: pack.materials[primitive.material],
  }));
}
function bounds(primitives) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of primitives) for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }
  return { min, max };
}
const near = (actual, expected, message, epsilon = .0001) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${message}: ${actual} != ${expected}`);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
function segmentHits(primitives, from, to) {
  const direction = sub(to, from);
  for (const { positions: p, indices } of primitives) for (let i = 0; i < indices.length; i += 3) {
    const vertex = j => p.slice(indices[i + j] * 3, indices[i + j] * 3 + 3);
    const a = vertex(0), edge1 = sub(vertex(1), a), edge2 = sub(vertex(2), a);
    const h = cross(direction, edge2), determinant = dot(edge1, h);
    if (Math.abs(determinant) < 1e-12) continue;
    const inverse = 1 / determinant, s = sub(from, a), u = inverse * dot(s, h);
    if (u < -1e-7 || u > 1 + 1e-7) continue;
    const q = cross(s, edge1), v = inverse * dot(direction, q);
    if (v < -1e-7 || u + v > 1 + 1e-7) continue;
    const t = inverse * dot(edge2, q);
    if (t >= 0 && t <= 1) return true;
  }
  return false;
}

const names = ['city_phone_box', 'city_phone_box_apparatus', 'city_phone_box_door',
  'city_phone_box_handset', 'city_phone_box_cord', 'city_phone_box_cord_drape', 'city_phone_box_glow'];
const meshes = new Map(names.map(name => [name, geometry(name)]));
for (const [name, primitives] of meshes) {
  let triangles = 0;
  for (const { positions, normals, indices, material } of primitives) {
    assert.equal(positions.length, normals.length, `${name}: missing normals`);
    assert.ok(positions.every(Number.isFinite) && normals.every(Number.isFinite), `${name}: nonfinite vertex`);
    assert.ok(indices.every(i => Number.isInteger(i) && i >= 0 && i < positions.length / 3), `${name}: bad index`);
    assert.notEqual(material.alphaMode, 'BLEND', `${name}: unsupported transparency would reject the prop pack`);
    triangles += indices.length / 3;
  }
  assert.ok(triangles > 0 && triangles < 5000, `${name}: ${triangles} triangles exceeds the repeating-mesh budget`);
}

const shell = meshes.get('city_phone_box'), shellBounds = bounds(shell);
for (const axis of [0, 2]) {
  near(shellBounds.min[axis], -.51, 'existing footprint minimum');
  near(shellBounds.max[axis], .51, 'existing footprint maximum');
}
near(shellBounds.min[1], 0, 'grounded plinth');
near(shellBounds.max[1], 2.71, 'existing roof height');
const cast = shell.filter(p => p.material.name === 'payphone cast iron');
assert.ok(cast.length && cast.every(p => p.material.extras?.payphoneRole === 'cast-iron'), 'cast material lacks its narrow renderer identity');
assert.ok(cast.some(({ positions: p, normals: n }) => p.some((y, i) => i % 3 === 1 && y > 2.54
  && n[i] > .2 && n[i] < .995)), 'roof has no sloping curved surface');

// Centre rays cross only the pane plane, not the cabinet or the far wall.
for (const x of [-.455, .455]) {
  assert.equal(segmentHits(shell, [x - .06, 1.4355, 0], [x + .06, 1.4355, 0]), false,
    'an opaque glass sheet hides the booth interior');
}
const door = meshes.get('city_phone_box_door'), doorBounds = bounds(door);
assert.ok(doorBounds.min[0] > -.02 && doorBounds.max[0] > .79 && doorBounds.max[0] < .82,
  'door no longer runs from its existing left hinge toward +x');
assert.equal(segmentHits(door, [.4, 1.4355, -.10], [.4, 1.4355, .10]), false, 'door pane is opaque');
assert.equal(segmentHits(door, [.18, 1.4355, -.10], [.18, 1.4355, .10]), true, 'cellular door mullion is missing');

// Measure the main cabinet's rear plane separately from its hood and fittings.
// The close instrument and the world instrument must be the same shape.
const apparatus = meshes.get('city_phone_box_apparatus');
const bodyPoints = apparatus.filter(p => p.material.name === 'payphone grey enamel').flatMap(({ positions: p }) => {
  const vertices = [];
  for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 2] + .4225) < .00001) vertices.push(...p.slice(i, i + 3));
  return vertices;
});
assert.ok(bodyPoints.length, 'cabinet rear plane is missing');
const body = bounds([{ positions: bodyPoints }]);
const bodyW = body.max[0] - body.min[0], bodyH = body.max[1] - body.min[1];
const close = payphoneLayout({ cols: 128, rows: 36 }, { cellW: 8, cellH: 16 });
const face = close.px.housing;
near(bodyW, .60, 'cabinet fits the existing K6');
near(bodyW / bodyH, face.w / face.h, 'world and close cabinet aspect');
assert.ok(body.min[0] > -.455 && body.max[0] < .455, 'cabinet intersects the side glazing');
const worldPoint = (x, y) => [body.min[0] + (x - face.x) / face.w * bodyW,
  body.max[1] - (y - face.y) / face.h * bodyH];
const dial = close.dialPx;
const [dialX, dialY] = worldPoint(dial.cx, dial.cy);
// Each finger hole must be a genuine hole through the black plate, aligned to
// the close dial's actual resting angles. Screen-down becomes world-up.
// The stationary number ring sits behind the ray segment and remains visible.
const blackPlate = apparatus.filter(p => p.material.name === 'payphone black bakelite');
for (let p = 1; p <= 10; p++) {
  const angle = rotaryRestAngle(String(p % 10));
  const [x, y] = worldPoint(dial.cx + Math.cos(angle) * dial.hole, dial.cy + Math.sin(angle) * dial.hole);
  assert.equal(segmentHits(blackPlate, [x, y, -.285], [x, y, -.265]), false, `finger hole ${p % 10} is painted over`);
}
const between = (rotaryRestAngle('1') + rotaryRestAngle('2')) / 2;
const [solidX, solidY] = worldPoint(dial.cx + Math.cos(between) * dial.hole, dial.cy + Math.sin(between) * dial.hole);
assert.equal(segmentHits(blackPlate, [solidX, solidY, -.285], [solidX, solidY, -.265]), true, 'finger plate is missing between the holes');
assert.ok(worldPoint(dial.cx, dial.cy + 1)[1] < dialY && dialX > 0,
  'world rotary does not share the close instrument coordinate system');
// The tiny payment lens stays beside the slot when approaching or entering.
const lamp = bounds(apparatus.filter(p => p.material.name === 'brass'));
const slot = close.px.slot;
const [lampX, lampY] = worldPoint(slot.x + slot.w * .84, slot.y + slot.h * .5);
near((lamp.min[0] + lamp.max[0]) / 2, lampX, 'payment lamp remains right of slot');
near((lamp.min[1] + lamp.max[1]) / 2, lampY, 'payment lamp remains level with slot');

const handset = bounds(meshes.get('city_phone_box_handset'));
assert.ok(handset.min[1] < -.15 && handset.max[1] > .15 && handset.min[2] < -.045,
  'receiver no longer has its centered long Y axis and cups facing -z');
const cord = bounds(meshes.get('city_phone_box_cord'));
near(cord.max[1], 0, 'hanging cord origin');
assert.ok(cord.min[1] < -.30 && cord.min[1] > -.33, 'hanging cord no longer reaches the existing handset placement');
assert.ok(meshes.get('city_phone_box_glow').every(p => p.material.name === 'occupied warm glass'),
  'the dynamic lamp mesh includes red iron or black sign ink');
console.log('payphone geometry: bounds, budgets, curved roof, clear panes, matching cabinet/rotary/payment layout and movable anchors passed');
