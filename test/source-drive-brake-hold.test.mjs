import test from 'node:test';
import assert from 'node:assert/strict';
import * as production from '../src/game/source-drive/drive-state.js';
import * as study from '../artifacts/source-drive-study/drive-state.js';
import { roadAt, worldAt } from '../src/game/source-drive/road.js';

const H = 1 / 120;
function at(api, distance = 260, { speed = 0, facing = 0 } = {}) {
  const road = roadAt(distance), p=worldAt(distance,road.treatment.pinch>.05?0:-1.35);
  return Object.assign(api.createDrive(), {
    paused: false, x: p.x, z: p.z,
    heading: road.heading + facing, furthest: distance, speed,
  });
}
function run(api, state, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 120); i++) api.stepDrive(state, H, input);
}
const pose = s => ({ x: s.x, z: s.z, heading: s.heading });
const travelled = (s, p) => Math.hypot(s.x - p.x, s.z - p.z);
function stopped(api, distance = 260, facing = 0) {
  const s = at(api, distance, { speed: 5, facing });
  run(api, s, 3, { brake: true });
  assert.equal(s.brakeHold, true, 'a deliberate complete stop retains service-brake pressure');
  assert.equal(s.speed, 0);
  return s;
}

for (const [name, api] of [['production', production], ['study', study]]) {
  test(`${name}: Space decelerates a moving van before engaging stationary support`, () => {
    const s = at(api, 260, { speed: 8 });
    const start = pose(s);
    api.stepDrive(s, H, { brake: true });
    assert.equal(s.brakeHold, false);
    assert.ok(s.speed > 7.8 && s.speed < 8, 'one brake frame cannot snap away the initial velocity');
    run(api, s, 4, { brake: true });
    assert.equal(s.brakeHold, true);
    assert.equal(s.speed, 0);
    assert.ok(travelled(s, start) > 3, 'stopping takes physical distance');
  });

  test(`${name}: a released Space stop holds for 30 seconds on both slopes and either heading`, () => {
    assert.ok(roadAt(260).grade > .03 && roadAt(410).grade < -.027, 'exercise the steep authored grades');
    for (const distance of [260, 410]) for (const facing of [0, Math.PI]) {
      const s = stopped(api, distance, facing), start = pose(s);
      run(api, s, 30);
      assert.deepEqual(pose(s), start, `no slope creep at ${distance}m, heading ${facing}`);
      assert.equal(s.brakeHold, true);
      assert.equal(s.brakeAmount, 1);
      assert.equal(s.throttle, 0);
      assert.equal(s.longitudinalAcceleration, 0, 'stationary tyre reaction is not a fictitious moving load');
      run(api, s, 1, { right: true });
      assert.ok(s.wheelAngle > .4, 'stationary steering remains available');
      assert.deepEqual(pose(s), start, 'steering a held van does not move its body');
      assert.equal(s.lateralAcceleration, 0, 'steering a stationary tyre does not generate cornering load');
      assert.ok(Math.abs(s.bodyRoll) < .001, 'the held van does not lean like a moving turn');
      assert.equal(s.arrived, false, 'an ordinary roadside stop never grants final dismount');
    }
  });

  test(`${name}: ordinary coasting never silently applies stationary brake hold`, () => {
    for (const distance of [260, 410]) {
      const s = at(api, distance), start = pose(s);
      run(api, s, 5);
      assert.equal(s.brakeHold, false);
      assert.equal(s.brakeAmount, 0);
      assert.ok(travelled(s, start) > .5, 'the sloping control still rolls without a deliberate brake stop');
    }
  });

  test(`${name}: forward releases pressure deliberately without a reverse kick`, () => {
    const s = stopped(api), start = pose(s);
    for (let i = 0; i < 20; i++) {
      api.stepDrive(s, H, { forward: true });
      assert.equal(s.brakeHold, false);
      assert.ok(s.speed >= 0, 'residual service-brake pressure cannot propel the van backwards');
    }
    run(api, s, 3, { forward: true });
    assert.ok(travelled(s, start) > 2);
    assert.ok(s.speed > 1);
    run(api, s, 3, { brake: true });
    assert.equal(s.brakeHold, true, 'a subsequent deliberate stop can hold again');
  });

  test(`${name}: reverse keeps the brake supported through its .3-second gear change`, () => {
    const s = stopped(api), start = pose(s);
    run(api, s, 35 * H, { reverse: true });
    assert.equal(s.gear, 1);
    assert.equal(s.brakeHold, true);
    assert.deepEqual(pose(s), start);
    api.stepDrive(s, H, { reverse: true });
    assert.equal(s.gear, -1);
    assert.equal(s.brakeHold, false);
    for (let i = 0; i < 20; i++) {
      api.stepDrive(s, H, { reverse: true });
      assert.ok(s.speed <= 0, 'residual service-brake pressure cannot kick the van forward');
    }
    run(api, s, 3, { reverse: true });
    assert.ok(travelled(s, start) > 2);
    assert.ok(s.speed < -1);
  });

  test(`${name}: held Space and conflicting pedals cannot release the stopped brake`, () => {
    for (const pedal of ['forward', 'reverse']) {
      const s = stopped(api), start = pose(s);
      run(api, s, 2, { brake: true, [pedal]: true });
      assert.equal(s.brakeHold, true);
      assert.equal(s.gear, 1, 'a held service brake does not silently start a reverse shift');
      assert.deepEqual(pose(s), start);
      run(api, s, 1, { forward: true, reverse: true });
      assert.equal(s.brakeHold, true);
      assert.deepEqual(pose(s), start);
      run(api, s, 3, { [pedal]: true });
      assert.equal(s.brakeHold, false);
      assert.ok(travelled(s, start) > 2, 'an exclusive effective pedal restores ordinary control');
    }
  });

  test(`${name}: pause and saved reload retain an honest stationary brake state`, () => {
    const s = stopped(api, 510, Math.PI), start = pose(s);
    s.paused = true;
    const time = s.programTime;
    run(api, s, 2, { forward: true });
    assert.equal(s.programTime, time);
    assert.equal(s.brakeHold, true);
    assert.deepEqual(pose(s), start);
    // An interrupted gear-selection dwell is not a held input after reload.
    s.directionHold = .25;
    const restored = api.restoreDrive(api.saveDrive(s));
    assert.deepEqual(pose(restored), start);
    assert.equal(restored.paused, true);
    assert.equal(restored.brakeHold, true);
    assert.equal(restored.brakeAmount, 1);
    assert.equal(restored.directionHold, 0);
    restored.paused = false;
    run(api, restored, 5);
    assert.deepEqual(pose(restored), start);
    run(api, restored, 3, { forward: true });
    assert.equal(restored.brakeHold, false);
    assert.ok(travelled(restored, start) > 2);
    const legacy = JSON.parse(api.saveDrive(at(api)));
    delete legacy.brakeHold;
    assert.equal(api.restoreDrive(JSON.stringify(legacy)).brakeHold, false);
    legacy.brakeHold = 'true';
    const invalid = api.restoreDrive(JSON.stringify(legacy));
    assert.equal(invalid.brakeHold, false, 'only a real saved boolean may claim maintained pressure');
    assert.equal(invalid.brakeAmount, 0);
  });

  test(`${name}: a deliberate apron stop holds without reviving the arrival drive-away latch`, () => {
    const s = at(api, 1200, { speed: .25 });
    api.stepDrive(s, H, { brake: true });
    assert.equal(s.arrived, true);
    assert.equal(s.brakeHold, true);
    const start = pose(s);
    run(api, s, 3);
    assert.deepEqual(pose(s), start);
    assert.equal(s.events.filter(e => e.type === 'arrival').length, 1);
    run(api, s, 3, { forward: true });
    assert.equal(s.arrived, false);
    assert.equal(s.brakeHold, false);
    assert.ok(travelled(s, start) > 2);
    assert.equal(s.events.filter(e => e.type === 'arrival').length, 1);
  });
}
