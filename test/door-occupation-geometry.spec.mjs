import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOOR_ARCHETYPES } from '../src/data/conservatory-doors.js';
import { enhanceDoorOccupation, DOOR_OCCUPATION_PROFILES } from '../tools/chunk_surfer/door-occupation-geometry.mjs';

const MAT = Object.fromEntries(['oak', 'dark', 'green', 'glass', 'rubber', 'brass', 'iron', 'kick', 'stone', 'debug'].map((s, i) => [s, i]));
const box = (x, y, z, w, h, d, mat) => ({ mat, p: [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].flatMap((c) => [x + a * w / 2, y + b * h / 2, z + c * d / 2]))), n: [], uv: [], idx: Array(36).fill(0) });
// Read the actual authored leaf calls, so these checks notice a dimension or
// family change in the production pack rather than retesting copied fixtures.
const source = readFileSync(new URL('../scripts/build-door-pack.mjs', import.meta.url), 'utf8');
const calls = source.slice(source.indexOf("leaf('door_leaf_service'"), source.indexOf("frame('door_frame_goods'"));
const leaves = [];
new Function('leaf', 'box', 'MAT', calls)((name, width, height, depth, mat, parts) => leaves.push({ name, width, height, depth, mat, parts }), box, MAT);
const added = (leaf) => enhanceDoorOccupation({ ...leaf, MAT, box }).slice(leaf.parts.length);
const triangles = (parts) => parts.reduce((sum, p) => sum + p.idx.length / 3, 0);

test('every actual leaf family receives bounded finishing within the existing pack budget', () => {
  assert.deepEqual(new Set(leaves.map((l) => l.name)), new Set(Object.keys(DOOR_OCCUPATION_PROFILES)));
  for (const leaf of leaves) {
    const before = structuredClone(leaf.parts), parts = enhanceDoorOccupation({ ...leaf, MAT, box });
    assert.deepEqual(leaf.parts, before, `${leaf.name}: caller geometry is not mutated`);
    assert.deepEqual(parts.slice(0, before.length), before, `${leaf.name}: original front fittings retained`);
    assert.ok(triangles(parts) + 12 < 600, `${leaf.name}: ${triangles(parts) + 12} triangles`);
    for (const p of parts.slice(before.length)) {
      assert.ok(p.p.every(Number.isFinite), leaf.name);
      for (let i = 0; i < p.p.length; i += 3) {
        assert.ok(p.p[i] >= -.0116 && p.p[i] <= leaf.width + 1e-8, `${leaf.name}: width/pivot envelope`);
        assert.ok(p.p[i + 1] >= 0 && p.p[i + 1] <= leaf.height, `${leaf.name}: height envelope`);
        assert.ok(Math.abs(p.p[i + 2]) <= .096, `${leaf.name}: low-profile face fittings`);
      }
    }
  }
});

test('hinge barrels share the actual articulation axis for left and mirrored right leaves', () => {
  for (const leaf of leaves) {
    const hinges = added(leaf).filter((p) => p.occupationFeature === 'hinge-knuckle');
    assert.equal(hinges.length, leaf.name === 'door_leaf_bay_goods' ? 12 : 9);
    for (const hinge of hinges) {
      const center = [0, 2].map((axis) => {
        const values = hinge.p.filter((_, i) => i % 3 === axis);
        return (Math.min(...values) + Math.max(...values)) / 2;
      });
      assert.ok(Math.abs(center[0]) < 1e-9 && Math.abs(center[1]) < 1e-9);
      for (const mirror of [-1, 1]) for (const angle of [0, .7, Math.PI * .49]) {
        const x = center[0] * mirror, z = center[1];
        assert.ok(Math.hypot(x * Math.cos(angle) - z * Math.sin(angle), x * Math.sin(angle) + z * Math.cos(angle)) < 1e-9);
      }
    }
  }
});

test('hinge triangle winding agrees with outward side and cap normals', () => {
  for (const p of added(leaves[0]).filter((part) => part.occupationFeature === 'hinge-knuckle')) {
    for (let i = 0; i < p.idx.length; i += 3) {
      const a = p.idx[i] * 3, b = p.idx[i + 1] * 3, c = p.idx[i + 2] * 3;
      const u = [0, 1, 2].map((k) => p.p[b + k] - p.p[a + k]);
      const v = [0, 1, 2].map((k) => p.p[c + k] - p.p[a + k]);
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const normal = [0, 1, 2].map((k) => p.n[a + k] + p.n[b + k] + p.n[c + k]);
      assert.ok(cross.reduce((sum, value, k) => sum + value * normal[k], 0) > 0);
    }
  }
});

test('families keep their material and use hierarchy without duplicate front kickplates or seals', () => {
  const features = (name) => added(leaves.find((l) => l.name === name)).map((p) => p.occupationFeature);
  for (const name of ['door_leaf_chapel', 'door_leaf_tower', 'door_leaf_bay_goods']) {
    assert.ok(!features(name).includes('reverse-kickplate'), `${name}: preserve heritage wood or freight construction`);
  }
  for (const name of ['door_leaf_practice', 'door_leaf_hall']) {
    assert.ok(features(name).includes('head-seal'));
    assert.ok(features(name).includes('latch-seal'));
    assert.ok(features(name).includes('acoustic-sweep'));
    assert.ok(!features(name).includes('hinge-seal'), 'the existing hinge-side strip is not duplicated');
  }
  assert.ok(!features('door_leaf_bay_goods').includes('keyhole'), 'shot-bolt freight leaves gain no invented external lock');
  assert.equal(features('door_leaf_pool').filter((s) => s === 'front-grip').length, 1, 'single pool leaf gains its previously absent grip');
  assert.ok(Object.values(DOOR_ARCHETYPES).every((d) => leaves.some((l) => l.name === d.mesh)));
});

test('unknown meshes are unchanged and invalid dimensions are rejected before producing geometry', () => {
  const parts = [{ mat: 0, p: [0, 0, 0], idx: [] }];
  assert.deepEqual(enhanceDoorOccupation({ name: 'door_frame_pair', parts }), parts);
  assert.throws(() => enhanceDoorOccupation({ name: 'door_leaf_hall', width: 0, height: 2, depth: .08, MAT, box }), TypeError);
});
