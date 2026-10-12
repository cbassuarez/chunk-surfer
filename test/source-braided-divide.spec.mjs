import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SOURCE_HANGING_SHORE, sourceShoreContains } from '../src/data/source-hanging-shore.js';
import {
  SOURCE_BRAIDED_DIVIDE as S, SOURCE_BRAIDED_CONTACT_ASSETS, SOURCE_BRAIDED_REVIEW_WALK,
  sourceDivideDepth, sourceDivideZ, sourceDivideContains, sourceDivideFloorAt,
  sourceDivideSupportAt, sourceDivideCollisionAt, sourceDivideCanStep,
  sourceDivideGeometry, sourceDividePropPlacements,
} from '../src/data/source-braided-divide.js';

const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-5, `${label}: ${actual} != ${expected}`);
const at = (x, depth, floor = S.lower) => ({ x, z: sourceDivideZ(depth), floor });
function walkRoute(route) {
  let floor = route[0].floor;
  for (let i = 1; i < route.length; i++) {
    const result = sourceDivideCanStep({ ...route[i - 1], floor }, route[i]);
    assert.equal(result.ok, true, `${route[i - 1].id || i - 1} → ${route[i].id || i}: ${JSON.stringify(result)}`);
    floor = result.floor;
    if (Number.isFinite(route[i].floor)) close(floor, route[i].floor, route[i].id || `step ${i}`);
  }
  return floor;
}

test('exact model contacts stay tied to the rendered GLB assets', () => {
  for (const asset of SOURCE_BRAIDED_CONTACT_ASSETS) {
    const bytes = readFileSync(new URL(`../${asset.path}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `${asset.path} changed: regenerate its contact triangles`);
  }
  const placements = sourceDividePropPlacements();
  assert.equal(new Set(placements.map(p => p.id)).size, placements.length);
  for (const p of placements) {
    assert.ok([p.x, p.y, p.z, p.scale, p.yaw, p.pitch, p.roll].every(Number.isFinite), p.id);
    // This also builds/checks contact data for every authored mesh, rather than
    // allowing an unused missing model to survive until a player approaches it.
    assert.doesNotThrow(() => sourceDivideSupportAt(p.x, p.z, { feet: p.y }));
  }
});

test('the whole 180×150m field has finite ground and an open first forecourt', () => {
  assert.equal(S.maxX - S.minX, 180);
  assert.equal(sourceDivideDepth(S.backZ), 150);
  assert.equal(sourceDivideContains(0, S.frontZ + .1), false);
  assert.equal(sourceDivideFloorAt(90.1, sourceDivideZ(80)), null);
  for (const x of [-89, -70, -40, 0, 40, 70, 89]) for (const depth of [0, 5, 10, 15, 20]) {
    const z = sourceDivideZ(depth);
    close(sourceDivideFloorAt(x, z), 4.2, 'forecourt ground');
    close(sourceDivideSupportAt(x, z, { feet: 4.2 }).floor, 4.2, 'forecourt support');
    // At the external northern edge the body radius must stay within the field.
    if (depth > 0) assert.equal(sourceDivideCollisionAt(x, z, { feet: 4.2 }), null);
  }
});

test('continuous lower street, both outer margins and reverse travel reach the grey doors', () => {
  for (const x of [-89, 0, 89]) {
    const route = [at(x, 3), at(x, 118), at(x, 146, 15.2), at(x, 149, 15.2)];
    close(walkRoute(route), 15.2, 'grey-door height');
    close(walkRoute([...route].reverse()), 4.2, 'reverse lower route');
  }
  // Entering a final-rise side while still low cannot suppress its real height.
  const blocked = sourceDivideSupportAt(0, sourceDivideZ(145), { feet: 4.2 });
  assert.equal(blocked.blockedRise, true);
});

test('the real receiving ledge supports a capsule across the cleft seam without opening other field edges', () => {
  const frontSupport=(x,z)=>sourceShoreContains(SOURCE_HANGING_SHORE.ledge,x,z);
  assert.equal(sourceDivideCollisionAt(7,-390.08,{feet:4.2})?.id,'divide-edge');
  assert.equal(sourceDivideCollisionAt(7,-390.08,{feet:4.2,frontSupport}),null);
  assert.equal(sourceDivideCollisionAt(20,-390.08,{feet:4.2,frontSupport})?.id,'divide-edge','no ledge supports the body beyond its real ends');
  assert.equal(sourceDivideCollisionAt(S.maxX-.1,-400,{feet:4.2,frontSupport})?.id,'divide-edge','the lateral perimeter stays finite');
  assert.equal(sourceDivideCollisionAt(0,S.backZ+.1,{feet:15.2,frontSupport})?.id,'divide-edge','the far perimeter stays finite');
  assert.equal(sourceDivideCollisionAt(-15.4,-490.8,{feet:4.2,frontSupport})?.id,'piano-leg-pier-0','real model and masonry contacts still obstruct');
});

test('both actual model crossings preserve separate over and under body layers', () => {
  for (const [depth, upper, model] of [[50, 9, 'divide-case-crossing'], [108, 15.2, 'divide-piano-crossing']]) {
    const z = sourceDivideZ(depth);
    const lower = sourceDivideSupportAt(0, z, { feet: 4.2 });
    assert.equal(lower.id, 'divide-ground');
    close(lower.floor, 4.2, 'underpass');
    assert.equal(sourceDivideCollisionAt(0, z, { feet: 4.2 }), null, model);
    const top = sourceDivideSupportAt(0, z, { feet: upper });
    assert.equal(top.id, model, 'crossing must use a real GLB top face');
    close(top.floor, upper, model);
    assert.equal(sourceDivideCollisionAt(0, z, { feet: upper }), null, 'standing on the mesh is clear');
  }
  assert.equal(sourceDivideCollisionAt(0, sourceDivideZ(50), { feet: 4.9 })?.id, 'divide-case-crossing', 'case body must obstruct when it really overlaps the torso');
  assert.equal(sourceDivideCollisionAt(0, sourceDivideZ(108), { feet: 11.8 })?.id, 'divide-piano-crossing', 'piano body must obstruct at its actual height');
  assert.equal(sourceDivideCollisionAt(-15.4, -490.8, { feet: 4.2 })?.id, 'piano-leg-pier-0');
  const drop = sourceDivideSupportAt(0, sourceDivideZ(54), { feet: 9 });
  assert.equal(drop.id, 'divide-ground');
  assert.equal(drop.drop, true, 'stepping off loses support rather than extending an invisible bridge floor');
});

test('complete authored review loop climbs and descends both levels with backtracking', () => {
  walkRoute(SOURCE_BRAIDED_REVIEW_WALK);
  for (const stem of ['case', 'piano']) {
    const over = SOURCE_BRAIDED_REVIEW_WALK.find(p => p.id === `${stem}-over`);
    const under = SOURCE_BRAIDED_REVIEW_WALK.find(p => p.id === `${stem}-under`);
    assert.deepEqual([over.x, over.z], [under.x, under.z]);
    assert.ok(over.floor - under.floor > 4);
  }
});

test('Listening Court stays open at its service anchor and has shallow physical courses', () => {
  assert.equal(sourceDivideCollisionAt(-12, -465, { feet: 4.2 }), null);
  close(sourceDivideSupportAt(-12, -465, { feet: 4.2 }).floor, 4.2, 'court service anchor');
  walkRoute([at(-12, 75), at(-16, 75, 4.5), at(-20, 75, 4.8), at(-24, 75, 5.1)]);
  for (const [x, depth] of [[0, 67], [11, 75], [0, 84]]) assert.equal(sourceDivideCollisionAt(x, sourceDivideZ(depth), { feet: 4.2 }), null);
  assert.equal(sourceDivideCollisionAt(-27, sourceDivideZ(75), { feet: 4.2 })?.id, 'west-middle-bank', 'a real bank return remains solid');
});

test('rendered terrain, banks, ramps and crossing wings are finite closed hulls', () => {
  const pieces = sourceDivideGeometry();
  assert.ok(pieces.some(p => p.kind === 'ground'), 'Source compositor requires a visible physical ground mesh');
  for (const piece of pieces) {
    assert.ok(Array.isArray(piece.p) && Array.isArray(piece.i));
    assert.equal(piece.p.length % 3, 0, piece.id);
    assert.equal(piece.i.length % 3, 0, piece.id);
    assert.ok(piece.p.every(Number.isFinite), piece.id);
    assert.ok(piece.color.length === 3 && piece.color.every(Number.isFinite), piece.id);
    const edges = new Map(); let upward = 0, downward = 0;
    for (let i = 0; i < piece.i.length; i += 3) {
      const triangle = piece.i.slice(i, i + 3);
      assert.ok(triangle.every(n => Number.isInteger(n) && n >= 0 && n < piece.p.length / 3), piece.id);
      const [a, b, c] = triangle.map(n => piece.p.slice(n * 3, n * 3 + 3));
      const u = b.map((n, axis) => n - a[axis]), v = c.map((n, axis) => n - a[axis]);
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      assert.ok(Math.hypot(...normal) > 1e-6, `degenerate face: ${piece.id}`);
      if (normal[1] > 1e-6) upward++;
      if (normal[1] < -1e-6) downward++;
      for (let edge = 0; edge < 3; edge++) {
        const key = [triangle[edge], triangle[(edge + 1) % 3]].sort((a, b) => a - b).join(',');
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    assert.ok(upward && downward, `missing correctly wound cap: ${piece.id}`);
    assert.ok([...edges.values()].every(count => count === 2), `open hull: ${piece.id}`);
  }
  // The actual ground vertices, including the final ramp, must match support.
  for (const piece of pieces.filter(p => p.kind === 'ground')) for (let i = 0; i < piece.p.length; i += 3) {
    const [x, y, z] = piece.p.slice(i, i + 3);
    if (y > S.underside + .01) close(y, sourceDivideFloorAt(x, z), 'visible ground height');
  }
});
