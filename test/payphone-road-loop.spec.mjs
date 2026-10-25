import test from 'node:test';
import assert from 'node:assert/strict';
import { PAYPHONE_LOOP_ROUTE as route, planPayphoneRoadLoop } from '../src/game/payphone-road-loop.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { PAYPHONE_PASS, payphoneLoopHolds } from '../src/game/payphone.js';

const near = (actual, expected, label = '') => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${label}: ${actual} differs from ${expected}`);

test('the planner uses the existing pickup-only phone pass and exact physical period', () => {
  assert.equal(route.pass, PAYPHONE_PASS.loop);
  near(route.start, 453.2);
  near(route.end, 487.6);
  near(route.period, 34.4);
  const plan = planPayphoneRoadLoop({ along: route.end, holding: true });
  near(plan.toAlong, route.start);
  near(plan.deltaWorldZ, 34.4);
  near(plan.deltaRuntimeY, 68.8);
  assert.notEqual(plan.deltaRuntimeY, Math.round(plan.deltaRuntimeY), 'the period is not an integer number of navigation cells');
});

test('a crossing retains its fractional overshoot instead of resetting to an authored start', () => {
  for (const overshoot of [1e-7, .001, .12, .499999, 1.35]) {
    const plan = planPayphoneRoadLoop({ along: route.end + overshoot, holding: true });
    near(plan.toAlong, route.start + overshoot, `overshoot ${overshoot}`);
    near(plan.fromAlong + plan.deltaAlong, plan.toAlong);
    near(plan.deltaRuntimeY * CELL, plan.deltaWorldZ);
    assert.equal(plan.periods, 1);
  }
});

test('an unopened phone holds, while pickup releases without a speech or dialogue prerequisite', () => {
  const holding = flags => payphoneLoopHolds({ pass: route.pass, flags });
  assert.ok(planPayphoneRoadLoop({ along: route.end + .2, holding: holding({}) }));
  assert.equal(planPayphoneRoadLoop({ along: route.end + .2,
    holding: holding({ 'phone.loop.broken': true }) }), null);
  assert.equal(planPayphoneRoadLoop({ along: route.end + .2, holding: true, occupied: true }), null);
});

test('ordinary approach, retreat and invalid observations do not rebase', () => {
  for (const along of [route.start - 10, route.start, route.end - .001, -1, NaN, Infinity, undefined, null]) {
    assert.equal(planPayphoneRoadLoop({ along, holding: true }), null);
  }
  for (const cellMetres of [0, -1, NaN, Infinity]) {
    assert.equal(planPayphoneRoadLoop({ along: route.end, holding: true, cellMetres }), null);
  }
  assert.equal(planPayphoneRoadLoop(), null);
});

test('multiple crossed periods preserve position rather than losing distance on a slow update', () => {
  const plan = planPayphoneRoadLoop({ along: route.start + route.period * 4 + .217, holding: true });
  assert.equal(plan.periods, 4);
  near(plan.toAlong, route.start + .217);
  near(plan.deltaWorldZ, route.period * 4);
});

test('successive laps neither accumulate a starting offset nor erase movement overshoot', () => {
  let along = route.start + .137, totalDistance = 0, rebasedDistance = 0, rebases = 0;
  for (let i = 0; i < 9000; i++) {
    const step = .123;
    along += step;
    totalDistance += step;
    const plan = planPayphoneRoadLoop({ along, holding: true });
    if (plan) {
      along = plan.toAlong;
      rebasedDistance += plan.deltaWorldZ;
      rebases += plan.periods;
    }
    assert.ok(along >= route.start && along < route.end);
  }
  assert.ok(rebases > 30);
  assert.ok(Math.abs((along - route.start - .137) + rebasedDistance - totalDistance) < 1e-7);
});

test('the exact frame translation preserves relative scene positions and camera velocity', () => {
  const plan = planPayphoneRoadLoop({ along: route.end + .173, holding: true });
  const camera = { x: 12.37, z: -487.41, vx: .43, vz: -2.05,
    targetX: 12.5, targetZ: -487.773, lastMs: 9971.25 };
  const sources = [{ x: 21.1, z: -476.2 }, { x: 3.1, z: -495.3 }, { x: 6, z: -500.1 }];
  const shiftedCamera = { ...camera, z: camera.z + plan.deltaWorldZ,
    targetZ: camera.targetZ + plan.deltaWorldZ };
  for (const source of sources) {
    const shifted = { ...source, z: source.z + plan.deltaWorldZ };
    near(shifted.z - shiftedCamera.z, source.z - camera.z);
    near(shifted.x - shiftedCamera.x, source.x - camera.x);
    near(Math.hypot(shifted.x - shiftedCamera.x, shifted.z - shiftedCamera.z),
      Math.hypot(source.x - camera.x, source.z - camera.z));
  }
  for (const key of ['x', 'vx', 'vz', 'targetX', 'lastMs']) assert.equal(shiftedCamera[key], camera[key]);
  near(shiftedCamera.targetZ - shiftedCamera.z, camera.targetZ - camera.z);
  // A bare player teleport cannot satisfy this invariant: the host must move
  // the camera and active scenery/audio anchors in the same atomic update.
  assert.ok(Math.abs(sources[0].z - shiftedCamera.z - (sources[0].z - camera.z)) > 30);
});
