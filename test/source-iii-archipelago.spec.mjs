import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_III_ARCHIPELAGO as A, ARCHIPELAGO_MAIN_ROUTE as main,
  ARCHIPELAGO_OPTIONAL_ROUTES as branches, ARCHIPELAGO_ISLANDS as islands,
  ARCHIPELAGO_SURFACES as surfaces, ARCHIPELAGO_SOLIDS as solids,
  ARCHIPELAGO_REFUGES as refuges,
} from '../src/data/source-continuation-archipelago.js';

const contains = (s, x, z, margin = 0) => x >= s.minX + margin - 1e-6
  && x <= s.maxX - margin + 1e-6 && z >= s.minZ + margin - 1e-6 && z <= s.maxZ - margin + 1e-6;
const circleBox = (s, x, z, radius = .22) => Math.hypot(
  Math.max(s.minX - x, 0, x - s.maxX), Math.max(s.minZ - z, 0, z - s.maxZ)) < radius - 1e-6;

// Follow the authored route using supported, <=45cm physical steps. This checks
// the union of all new supports/solids: an island deck cannot conceal an
// oversized stair discontinuity or a hanging root intersecting a lower route.
function walkSupportedRoute(points, label) {
  let feet = points[0].feet;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(distance / .14));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const eligible = surfaces.filter(s => contains(s, x, z)
        && s.y <= feet + .450001 && s.y >= feet - .450001).sort((p, q) => q.y - p.y);
      const support = eligible[0];
      assert.ok(support, `${label}: no physical step at ${x},${z}, feet ${feet}`);
      feet = support.y;
      assert.equal(solids.some(s => feet + 1.9 > s.minY + 1e-6 && feet < s.maxY - 1e-6
        && circleBox(s, x, z)), false, `${label}: body intersects a physical root/pier at ${x},${z},${feet}`);
      assert.equal(surfaces.some(s => s.y > feet + .450001 && feet + 1.9 > s.y - s.thickness + 1e-6
        && feet < s.y - 1e-6 && circleBox(s, x, z)), false,
      `${label}: body intersects another deck at ${x},${z},${feet}`);
    }
    assert.ok(Math.abs(feet - b.feet) <= .300001,
      `${label}: arrival elevation ${feet} differs from waypoint ${b.feet}`);
  }
}

test('III has sixteen physical destinations in three clusters and a substantial main expedition', () => {
  assert.equal(islands.length, 16);
  assert.equal(A.mainIslandIds.length, 10);
  assert.equal(A.optionalIslandIds.length, 4);
  assert.equal(A.clusters.length, 3);
  assert.equal(new Set(islands.map(i => i.id)).size, islands.length);
  assert.ok(A.mainMetres >= 1300 && A.mainMetres <= 1600);
  assert.deepEqual(main.filter(p => A.mainIslandIds.includes(p.islandId)).map(p => p.islandId), A.mainIslandIds);
  for (const island of islands) {
    assert.ok(island.radius >= 4);
    assert.ok(surfaces.some(s => contains(s, island.x, island.z) && Math.abs(s.y - island.feet) < 1e-6), island.id);
  }
  assert.ok(A.idealTransitSeconds.walk > 500 && A.idealTransitSeconds.walk < 620);
  assert.equal('minimumDuration' in A, false, 'duration comes from traversal, not a minimum elapsed-time gate');
});

test('the complete main route has real broad support, climbable stairs and body clearance', () => {
  walkSupportedRoute(main, 'main expedition');
  const treads = surfaces.filter(s => s.role === 'stair');
  assert.ok(treads.length > 100);
  assert.ok(treads.every(s => s.riser <= .300001 && s.width >= 5));
  assert.ok(surfaces.filter(s => s.role === 'archipelago-route').every(s => s.width >= (s.optional ? 3 : 5)));
});

test('four optional branches are supported loops that rejoin a later principal destination', () => {
  assert.equal(branches.length, 4);
  for (const route of branches) {
    assert.ok(A.mainIslandIds.indexOf(route.fromIslandId) < A.mainIslandIds.indexOf(route.toIslandId));
    assert.ok(route.points.some(p => p.islandId === route.islandId));
    assert.equal(route.width, 3);
    walkSupportedRoute(route.points, route.id);
  }
});

test('both chases have supported sheltered intervals within 150 metres of route travel', () => {
  assert.equal(A.chaseSections.length, 2);
  for (const section of A.chaseSections) {
    const from = main.findIndex(p => p.islandId === section.fromIslandId);
    const to = main.findIndex(p => p.islandId === section.toIslandId);
    assert.ok(from >= 0 && to > from);
    const shelters = section.refugeIds.map(id => refuges.find(r => r.id === id));
    assert.ok(shelters.every(Boolean));
    const shelteredIslands = new Set(shelters.map(r => r.islandId));
    let sinceShelter = 0, longest = 0;
    for (let i = from + 1; i <= to; i++) {
      sinceShelter += Math.hypot(main[i].x - main[i - 1].x, main[i].z - main[i - 1].z);
      if (shelteredIslands.has(main[i].islandId)) { longest = Math.max(longest, sinceShelter); sinceShelter = 0; }
    }
    assert.ok(Math.max(longest, sinceShelter) <= 150, `${section.id}: long unbroken chase stretch`);
    for (const refuge of shelters) {
      assert.ok(refuge.radius >= 2.6 && refuge.standOff > refuge.radius);
      for (let k = 0; k < 32; k++) {
        const angle = k * Math.PI / 16;
        const x = refuge.x + Math.cos(angle) * (refuge.radius + .22);
        const z = refuge.z + Math.sin(angle) * (refuge.radius + .22);
        assert.ok(surfaces.some(s => contains(s, x, z) && Math.abs(s.y - refuge.feet) < 1e-6), refuge.id);
      }
    }
  }
});

test('seat and exit compositions stay fixed and the entrance has no direct exit causeway', () => {
  const seat = islands.find(i => i.id === 'iii-listening-island');
  const exit = islands.find(i => i.id === 'iii-door-island');
  assert.deepEqual([seat.x, seat.z, seat.feet], [-193, -106, -4.8]);
  assert.deepEqual([exit.x, exit.z, exit.feet], [-139, -92, 8.4]);
  assert.deepEqual([main[0].x, main[0].z, main[0].feet], [-160, -92, 8.4]);
  assert.deepEqual([main.at(-1).x, main.at(-1).z, main.at(-1).feet], [-140.3, -92, 8.4]);
  for (const x of [-151, -148, -145]) {
    assert.equal(surfaces.some(s => contains(s, x, -92) && Math.abs(s.y - 8.4) < 1e-6), false,
      `new route must retain open void at entrance-to-exit ${x}`);
  }
  assert.ok(surfaces.every(s => s.archipelago && s.phase === 'catch' && s.chartId === 0));
  const ids = [...surfaces, ...solids].map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
});
