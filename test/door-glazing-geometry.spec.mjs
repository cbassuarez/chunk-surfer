import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { doorLeafCore } from '../tools/chunk_surfer/door-glazing-geometry.mjs';
import { enhanceDoorOccupation } from '../tools/chunk_surfer/door-occupation-geometry.mjs';
import { DOOR_ARCHETYPES } from '../src/data/conservatory-doors.js';

const MAT = Object.fromEntries(['oak', 'dark', 'green', 'glass', 'rubber', 'brass', 'iron', 'kick', 'stone', 'debug'].map((s, i) => [s, i]));
const box = (x, y, z, w, h, d, mat) => ({ mat,
  p: [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].flatMap((c) => [x + a * w / 2, y + b * h / 2, z + c * d / 2]))),
  n: [], uv: [], idx: Array(36).fill(0) });
const source = readFileSync(new URL('../scripts/build-door-pack.mjs', import.meta.url), 'utf8');
const calls = source.slice(source.indexOf("leaf('door_leaf_service'"), source.indexOf("frame('door_frame_goods'"));
const leaves = [];
new Function('leaf', 'box', 'MAT', calls)((name, width, height, depth, mat, parts) => leaves.push({ name, width, height, depth, mat, parts }), box, MAT);
const bounds = (part) => {
  const by = [0, 1, 2].map((axis) => part.p.filter((_, i) => i % 3 === axis));
  return { min: by.map((a) => Math.min(...a)), max: by.map((a) => Math.max(...a)) };
};
const triangles = (parts) => parts.reduce((sum, p) => sum + p.idx.length / 3, 0);

test('existing authored glass rectangles become actual clear sight apertures with retained edge/wire construction', () => {
  for (const leaf of leaves.filter((l) => l.parts.some((p) => p.mat === MAT.glass))) {
    const original = structuredClone(leaf.parts), out = doorLeafCore({ ...leaf, MAT, box });
    assert.deepEqual(leaf.parts, original, 'authored fixture data is not mutated');
    const hole = out.aperture; assert.ok(hole); assert.ok(hole.opaqueCoverage < .10);
    assert.equal(out.coreParts.length, 4);
    for (const core of out.coreParts) {
      const b = bounds(core);
      const overlapX = Math.min(b.max[0], hole.x1) - Math.max(b.min[0], hole.x0);
      const overlapY = Math.min(b.max[1], hole.y1) - Math.max(b.min[1], hole.y0);
      assert.ok(overlapX <= 1e-9 || overlapY <= 1e-9, `${leaf.name}: no core slab still fills the pane`);
    }
    const glass = out.parts.filter((p) => p.mat === MAT.glass);
    assert.equal(glass.length, 4, 'the old solid pane is replaced only by thin edge strips');
    assert.ok(glass.every((p) => p.glazingFeature === 'glass-edge' && bounds(p).min[2] === bounds(p).max[2]));
    assert.ok(out.parts.some((p) => p.glazingFeature === 'wire'));
    const all = out.coreParts.flatMap((p) => p.p);
    assert.equal(Math.min(...all.filter((_, i) => i % 3 === 0)), 0);
    assert.ok(Math.abs(Math.max(...all.filter((_, i) => i % 3 === 0)) - leaf.width) < 1e-9);
    assert.ok(Math.abs(Math.max(...all.filter((_, i) => i % 3 === 1)) - leaf.height) < 1e-9);
    const finished = [...out.coreParts, ...enhanceDoorOccupation({ ...leaf, parts: out.parts, MAT, box })];
    assert.ok(triangles(finished) < 600, `${leaf.name}: ${triangles(finished)} triangles with complete hardware`);
  }
});

test('solid privacy, acoustic and freight doors retain their opaque full core and existing pieces', () => {
  for (const name of ['door_leaf_service', 'door_leaf_hall', 'door_leaf_chapel', 'door_leaf_tower', 'door_leaf_bay_goods']) {
    const leaf = leaves.find((l) => l.name === name), out = doorLeafCore({ ...leaf, MAT, box });
    assert.equal(out.aperture, null, name); assert.equal(out.coreParts.length, 1);
    assert.deepEqual(out.parts, leaf.parts);
    assert.deepEqual(bounds(out.coreParts[0]), { min: [0, 0, -leaf.depth / 2], max: [leaf.width, leaf.height, leaf.depth / 2] });
  }
});

test('construction refinement does not invent door access, move hinges or change semantic archetypes', () => {
  const academic = DOOR_ARCHETYPES['academic-wired-glass'];
  assert.equal(academic.mesh, 'door_leaf_staff');
  const staff = leaves.find((l) => l.name === academic.mesh), out = doorLeafCore({ ...staff, MAT, box });
  assert.ok(out.aperture.height >= .8, 'existing academic pane provides a useful eye-level sight opening');
  assert.ok(out.aperture.y0 < 1.58 && out.aperture.y1 > 1.58);
  assert.equal(Math.min(...out.coreParts.flatMap((p) => p.p.filter((_, i) => i % 3 === 0))), 0, 'hinge-local origin is unchanged');
  assert.ok(!('key' in out) && !('open' in out) && !('state' in out), 'geometry has no access-state side effect');
});

test('a missing or out-of-leaf pane fails the build instead of silently reverting to opaque glazing', () => {
  assert.throws(() => doorLeafCore({ name: 'door_leaf_staff', width: .95, height: 2.15, depth: .05, mat: MAT.oak, parts: [], MAT, box }), /expected one/);
  assert.throws(() => doorLeafCore({ name: 'door_leaf_staff', width: .95, height: 2.15, depth: .05, mat: MAT.oak,
    parts: [box(0, 1, 0, 1, 1, .01, MAT.glass)], MAT, box }), /inside the existing leaf/);
});
