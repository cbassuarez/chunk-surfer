// THE CLIFF CRASH, AS TYRES ON WATER (src/game/source-drive/hydroplane.js).
// Seb, 2026-11-14: the approach crawled, and the crash took the controls away.
// Now the input stays live and fights the van, and only decides how bad it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDoorDriveTeaser } from '../src/game/source-drive/door-teaser.js';
import { openingRoadSurfaceAt, openingWorldAt } from '../src/game/source-drive/opening-road.js';
import { DRIVE_TEASER_BREAK } from '../src/game/source-drive/teaser-scene.js';
import { DRIVE_HYDROPLANE, hydroplaneLift, hydroplaneSampler, hydroplaneSurface } from '../src/game/source-drive/hydroplane.js';
import { ensureVehicle, stepVehicle } from '../src/game/source-drive/vehicle-dynamics.js';
import { createCliffFall, CLIFF_FALL } from '../src/game/source-drive/cliff-fall.js';

// The cliff road is single-track here (±1.67 m): keep to its middle.
const keep = (d, target = 0, look = 14) => {
  const here = openingRoadSurfaceAt(d.x, d.z), p = openingWorldAt(here.distance + look, target);
  const fx = Math.sin(d.heading), fz = -Math.cos(d.heading), score = (fz * (p.x - d.x) - fx * (p.z - d.z)) / look;
  return { left: score > .012, right: score < -.012 };
};
const cruise = (d, want) => (d.speed < want ? { forward: true } : d.speed > want + 1.5 ? { brake: true } : {});
const POLICIES = {
  'lane, throttle': (d) => ({ ...keep(d), forward: true }),
  'let go at the water': (d, at) => (at < 268 ? { ...keep(d), forward: true } : {}),
  'brake at the water': (d, at) => (at < 268 ? { ...keep(d), forward: true } : { brake: true }),
  'steer away, throttle': (d, at) => (at < 268 ? { ...keep(d), forward: true } : { left: true, forward: true }),
  'steer away, brake': (d, at) => (at < 268 ? { ...keep(d), forward: true } : { left: true, brake: true }),
  'steer into it': (d, at) => (at < 268 ? { ...keep(d), forward: true } : { right: true, forward: true }),
  'countersteer late': (d, at) => (at < 268 ? { ...keep(d), forward: true } : at < 290 ? { left: true } : { right: true }),
  'saw at the wheel': (d, at, t) => (at < 268 ? { ...keep(d), forward: true } : Math.floor(t / .4) % 2 ? { left: true } : { right: true }),
  'floor it straight': (d, at) => (at < 268 ? { ...keep(d), forward: true } : { forward: true }),
  'crawl the inside': (d) => ({ ...keep(d, -.85), ...cruise(d, 3) }),
  'crawl, stop on the wash': (d, at) => (at < 293 ? { ...keep(d, -.85), ...cruise(d, 2.5) } : { brake: true }),
  'back off at the bend': (d, at) => (at < 284 ? { ...keep(d), forward: true } : { reverse: true }),
};

function drive(policy, { from = 232, speed = 14, seconds = 90 } = {}) {
  const start = openingWorldAt(from, 0);
  const c = createDoorDriveTeaser({ timeSkips: null, initialDrive: { x: start.x, z: start.z, heading: start.heading, roadHeight: start.height, speed, furthest: from } });
  c.start();
  // A player stopped or rolling back short of the edge has to drive on: the
  // journey only moves forward. After a stalled second and a half, they creep.
  let t = 0, stalled = 0, carryOn = false, slowest = Infinity;
  for (; t < seconds; t += 1 / 60) {
    const s = c.snapshot();
    if (s.vehiclePose?.cliffCommitted) break;
    const d = s.driveState, at = openingRoadSurfaceAt(d.x, d.z).distance;
    if (at > 180 && at < 288) slowest = Math.min(slowest, d.speed);
    stalled = d.speed < .3 && Math.abs(d.lateralSpeed) < .3 ? stalled + 1 / 60 : 0;
    if (stalled > 1.5) carryOn = true;
    const wants = carryOn ? { ...keep(d), ...cruise(d, 1.5) } : policy(d, at, t);
    c.update(1 / 60, { input: { forward: false, reverse: false, left: false, right: false, brake: false, ...wants } });
  }
  const s = c.snapshot(), m = s.commitment;
  return { t, slowest, commitment: m, at: m ? openingRoadSurfaceAt(m.capture.position.x, m.capture.position.z).distance : null };
}

test('the climb to the cliff no longer crawls: a chained barrier is one wall, not a row of ends', () => {
  // Before: the van met the next barrier piece's end (or its own nose met it)
  // and took its whole forward speed as impact, stopping dead every 3 m on
  // the bends with the van still in its lane. 175 m to 288 m took ~44 s.
  const run = drive((d) => ({ ...keep(d), forward: true }), { from: 175, speed: 15 });
  assert.ok(run.commitment, 'the drive never reached the edge');
  assert.ok(run.t < 20, `the climb still crawls: ${run.t.toFixed(1)} s from 175 m to the edge`);
  assert.ok(run.slowest > 6, `the van still stops against the barrier on the climb (${run.slowest.toFixed(2)} m/s)`);
});

test('whatever the player does, the van goes over the break, physically, and it matters how', () => {
  const results = Object.entries(POLICIES).map(([name, policy]) => ({ name, ...drive(policy) }));
  for (const r of results) {
    assert.ok(r.commitment, `${r.name}: no crash`);
    assert.equal(r.commitment.reason, 'actual-cliff-support-loss', `${r.name}: the van went over by ${r.commitment.reason}, not by leaving the edge`);
    assert.ok(r.at >= DRIVE_TEASER_BREAK.from && r.at <= DRIVE_TEASER_BREAK.to, `${r.name}: left at ${r.at.toFixed(1)} m, outside the break`);
  }
  const severities = results.map((r) => r.commitment.severity);
  const worst = Math.max(...severities), best = Math.min(...severities);
  assert.ok(worst >= 5 * best, `the input barely changes how bad it is (${best.toFixed(3)} to ${worst.toFixed(3)})`);
  const fast = results.filter((r) => r.commitment.departure.speed > 5);
  assert.ok(fast.length >= 3 && fast.some((r) => Math.abs(r.commitment.departure.lateralSpeed) > 1), 'nothing goes over fast and sideways');
});

test('on water the tyres lift with speed and depth, fronts first, and the wash cannot be gripped', () => {
  assert.equal(hydroplaneLift(3, 8), 0, 'walking pace lifts a tyre');
  assert.ok(hydroplaneLift(14, 10) > hydroplaneLift(14, 4), 'deeper water lifts less');
  assert.ok(hydroplaneLift(16, 6) > hydroplaneLift(10, 6), 'speed lifts less');
  const road = { distance: 288, offset: 1, halfWidth: 1.67, grip: .68, kind: 'asphalt' };
  assert.ok(hydroplaneSurface(road, { speed: 15, axle: 'front' }).grip < hydroplaneSurface(road, { speed: 15, axle: 'rear' }).grip, 'the fronts do not lift first');
  const wash = hydroplaneSurface({ ...road, distance: 302 }, { speed: 0 });
  assert.ok(wash.grip < wash.crossfall, 'the wash can be gripped at a standstill');
  assert.ok(DRIVE_HYDROPLANE.wash.from >= 294, 'the wash starts where a berm still stands between the road and the drop');
});

test('a van stood on the wash with the brake on slides seaward anyway', () => {
  const p = openingWorldAt(302, -.6);
  const s = ensureVehicle({ x: p.x, z: p.z, heading: p.heading, speed: 0, odometer: 0 });
  for (let i = 0; i < 120 * 2; i++) stepVehicle(s, 1 / 120, { brake: true }, hydroplaneSampler(openingRoadSurfaceAt, s));
  assert.ok(openingRoadSurfaceAt(s.x, s.z).offset > .6, 'the brake held the van on the wash');
  assert.equal(s.brakeHold, false);
});

test('the slide\'s spin carries into the fall', () => {
  const release = { position: [0, 30, 0], velocity: [0, 0, -8], heading: 0, pitch: 0, roll: 0 };
  const base = { release, seaY: 0, settledMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -2, -40, 1]), settledAtLocal: 14, pivotSeconds: 0 };
  const calm = createCliffFall(base).state(1), spun = createCliffFall({ ...base, yawRate: 1, rollRate: 1.2 }).state(1);
  assert.ok(Math.abs(calm.heading - CLIFF_FALL.yawRate) < 1e-9);
  assert.ok(Math.abs(spun.heading - 1) < 1e-9 && Math.abs(spun.roll - 1.2) < 1e-9);
  const teaser = readFileSync(new URL('../src/game/source-drive/door-teaser.js', import.meta.url), 'utf8');
  assert.match(teaser, /yawRate:edge\?clamp\(drive\.yawRate/);
  assert.doesNotMatch(teaser, /r\.distance>=C\.commitDistance&&forwardRoadVelocity>0\)commit\(\)/, 'a line on the road takes the controls again');
});

test('the cab hears the water: revs flare on wheelspin, and the tyres lose their roar to spray', () => {
  const acoustics = readFileSync(new URL('../src/game/source-drive/acoustics.js', import.meta.url), 'utf8');
  assert.match(acoustics, /\+ spin \* 1500, 650, 4800\)/);
  assert.match(acoustics, /\*\(1-\.5\*lifted\)\);/);
});
