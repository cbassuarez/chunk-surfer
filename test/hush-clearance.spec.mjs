import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateHushClearance, HUSH_CLEARANCE_LIMITS } from '../src/game/hush-clearance.js';
import { createPresenceNavigation } from '../src/game/presence-navigation.js';

const identity = (x, y) => ({ x, z: y });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .0013, `${actual} != ${expected}`);
const run = (isWalkable, extra = {}) => estimateHushClearance({ actor: { x: 0, y: 0 }, navigation: { isWalkable },
  logicalToPhysical: identity, cellMetres: 1, ...extra });

test('open space preserves native width and proportionally scaled height', () => {
  assert.equal(run(() => true), .90);
  assert.equal(run(() => true, { actor: { x: 0, y: 0, heightM: HUSH_CLEARANCE_LIMITS.nativeHeightM * 2 } }), 1.80);
});

test('one wall constrains both sides symmetrically around the unchanged root', () => {
  near(run(p => p.x < .30), .56);
});

test('narrow passage subtracts one total safety margin from twice the closest clearance', () => {
  near(run(p => Math.abs(p.x) < .25), .46);
});

test('off-center roots use the nearer wall instead of the total corridor width', () => {
  near(run(p => Math.abs(p.x) < .30, { actor: { x: .20, y: 0 } }), .16);
});

test('physical rotation and anisotropic scaling preserve metre-based lateral clearance', () => {
  const logicalToPhysical = (x, y) => ({ x: 20 - y * 3, z: -40 + x * 2, renderGroup: 'same' });
  near(run(p => Math.abs(p.x) < .125, { logicalToPhysical }), .46);
  // A heading along logical +X has physical right along logical +Y.
  near(run(p => Math.abs(p.y) < .10, { logicalToPhysical, heading: Math.PI / 2 }), .56);
});

test('ordinary floorplan-cell navigation uses its existing walkability without mutation', () => {
  const navigation = createPresenceNavigation({ isSolid: x => x !== 2, planSize: () => ({ w: 8, h: 8 }), canOccupy: () => true });
  const actor = Object.freeze({ x: 2.5, y: 3.5, gait: Object.freeze({ heading: 0 }) });
  near(estimateHushClearance({ actor, navigation, logicalToPhysical: identity, cellMetres: .5 }), .46);
  assert.deepEqual(actor, { x: 2.5, y: 3.5, gait: { heading: 0 } });
});

test('probe budget is bounded and the estimator never requests movement, routes or cache changes', () => {
  let calls = 0, maps = 0;
  const navigation = Object.freeze({ isWalkable(p) { calls++; assert(Object.keys(p).length === 2); return Math.abs(p.x) < .46; },
    resolveMove() { assert.fail('movement is not presentational'); }, findPath() { assert.fail('path mutation'); }, clearCache() { assert.fail('cache mutation'); } });
  near(run(null, { navigation, logicalToPhysical(x, y) { maps++; return identity(x, y); } }), .88);
  assert(calls <= HUSH_CLEARANCE_LIMITS.maximumNavigationProbes); assert.equal(maps, 3);
});

test('missing, malformed, discontinuous or throwing queries retain the full default width', () => {
  for (const navigation of [null, {}, { isWalkable: () => undefined }, { isWalkable: () => { throw new Error('not loaded'); } }]) {
    assert.equal(run(null, { navigation }), .90);
  }
  assert.equal(run(() => false), .90, 'invalid root is not evidence of zero clearance');
  assert.equal(run(() => true, { logicalToPhysical: () => ({ x: 0, z: 0 }) }), .90);
  assert.equal(run(() => true, { logicalToPhysical: () => ({ x: NaN, z: 0 }) }), .90);
  assert.equal(run(() => true, { logicalToPhysical: x => ({ x, z: 0, layer: x > 0 ? 'other' : 'here' }) }), .90);
  let calls = 0;
  assert.equal(run(p => { calls++; if (p.x > 0) throw new Error('late failure'); return p.x > -.2; }), .90,
    'a late query failure must discard an earlier apparent squeeze');
  assert(calls > 1);
});
