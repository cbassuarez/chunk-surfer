import test from 'node:test';
import assert from 'node:assert/strict';
import * as production from '../src/game/source-drive/drive-state.js';
import * as study from '../artifacts/source-drive-study/drive-state.js';
import { roadAt } from '../src/game/source-drive/road.js';

function at(api, distance = 1200, extra = {}) {
  const s = api.createDrive(), r = roadAt(distance);
  return Object.assign(s, { paused: false, x: r.x - 1.35 * Math.cos(r.heading), z: -distance, heading: r.heading,
    roadHeight: r.height, roadOffset: -1.35, furthest: distance, ...extra });
}
function run(api, s, seconds, input = {}) { for (let i = 0; i < Math.round(seconds * 120); i++) api.stepDrive(s, 1 / 120, input); }
const arrivals = s => s.events.filter(event => event.type === 'arrival');

for (const [name, api] of [['production', production], ['study', study]]) {
  test(`${name}: coasting requires a settled half-second, while deliberate braking may park immediately`, () => {
    const coasting = at(api);
    run(api, coasting, 59 / 120);
    assert.equal(coasting.arrived, false);
    run(api, coasting, 1 / 120);
    assert.equal(coasting.arrived, true);
    assert.equal(arrivals(coasting).length, 1);
    const braking = at(api, 1200, { speed: .25 });
    run(api, braking, 1 / 120, { brake: true });
    assert.equal(braking.arrived, true);
    assert.equal(braking.speed, 0);
    assert.ok(braking.arrivalStopSeconds < .5);
  });

  for (const [pedal, sign] of [['forward', 1], ['reverse', -1]]) {
    test(`${name}: ${pedal} clears the parked dwell and drives metres without re-parking or event spam`, () => {
      const s = at(api);
      run(api, s, .75);
      const initial = -s.z;
      run(api, s, 3, { [pedal]: true });
      assert.ok((-s.z - initial) * sign > 2, 'the actual vehicle leaves its former parked position');
      assert.equal(s.arrived, false);
      assert.equal(s.arrivalStopSeconds, 0);
      assert.equal(arrivals(s).length, 1, 'holding a pedal must not emit an arrival on every physics step');
      run(api, s, 2, { brake: true });
      assert.equal(s.arrived, true, 'a deliberate second stop may park again inside the apron');
      assert.equal(arrivals(s).length, 2);
      run(api, s, 3);
      assert.equal(arrivals(s).length, 2, 'remaining parked produces no extra arrivals');
    });
  }

  test(`${name}: active propulsion never snaps to arrival even below the settled-speed threshold`, () => {
    const s = at(api);
    run(api, s, .75, { forward: true, brake: true });
    assert.equal(s.speed, 0, 'the physical brake still acts');
    assert.equal(s.arrived, false, 'a held drive command is not a parking commitment');
    assert.equal(s.arrivalStopSeconds, 0);
    assert.equal(arrivals(s).length, 0);
    run(api, s, 1 / 120, { brake: true });
    assert.equal(s.arrived, true, 'releasing propulsion restores deliberate braking eligibility');
  });

  test(`${name}: optional Cut stopping is unrestricted by time and never grants final dismount`, () => {
    const s = at(api, 850);
    run(api, s, 12, { brake: true });
    assert.equal(s.arrived, false);
    assert.equal(api.canDismountDrive(s), false);
    assert.ok(s.programTime > 11.9);
    assert.equal(arrivals(s).length, 0);
  });

  test(`${name}: stale arrival flags cannot grant dismount outside the real current apron`, () => {
    const before = at(api, 1180, { arrived: true, inArrivalZone: true });
    assert.equal(api.canDismountDrive(before), false);
    const lateral = at(api, 1200, { arrived: true, inArrivalZone: true, roadOffset: 0 });
    lateral.x = roadAt(1200).x + 6;
    assert.equal(api.canDismountDrive(lateral), false, 'current position wins over stale roadOffset');
    const moving = at(api, 1200, { arrived: true, speed: .5 });
    assert.equal(api.canDismountDrive(moving), false);
    const valid = at(api, 1200, { arrived: true });
    assert.equal(api.canDismountDrive(valid), true);
  });
}
