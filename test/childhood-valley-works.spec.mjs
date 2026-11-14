import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HOME_COMMONS_DRAINAGE, HOME_COMMONS_STEP_SUPPORTS, HOME_COMMONS_WORKS,
} from '../src/data/childhood-valley-works.js';
import { HOME_VALLEY_LIFE_SITES } from '../src/data/childhood-valley-life.js';
import { createStationRealm, moveStationRealm, stationRealmFloor } from '../src/game/station-realms.js';

const pieces = Object.fromEntries(HOME_COMMONS_WORKS.map(part => [part.id, part]));

test('the commons roof water has a continuous fall from the shoe to a protected roadside inlet', () => {
  const { pipeMouth, channel, catchpit } = HOME_COMMONS_DRAINAGE;
  const rill = pieces['common-roof-water-rill'];
  assert.equal(rill.z0, channel.endZ);
  assert.equal(rill.z1, channel.startZ);
  assert.equal(rill.y1, channel.startInvert + channel.cheekHeight);
  assert.equal(pipeMouth[0], channel.x);
  assert.equal(pipeMouth[2], channel.startZ);
  assert.ok(pipeMouth[1] > rill.y1 && pipeMouth[1] - rill.y1 < .03);
  assert.equal(catchpit.inletZ, channel.endZ);
  assert.ok(catchpit.grateY < channel.endInvert);
  const fall = (channel.startInvert - channel.endInvert) / (channel.startZ - channel.endZ);
  assert.ok(fall > .04 && fall < .08);
  const invertAt = z => channel.endInvert + (z - channel.endZ) * fall;
  for (let distance = .05; distance <= channel.startZ - channel.endZ; distance += .05) {
    const at = channel.startZ - distance;
    assert.ok(invertAt(at) < invertAt(at + .05));
  }
  const bars = HOME_COMMONS_WORKS.filter(part => part.id.startsWith('common-catchpit-grate-bar-'));
  assert.equal(bars.length, 5);
  assert.ok(bars.every(part => part.y1 === catchpit.grateY));
  assert.ok(bars.every((part, index) => !index || part.x0 - bars[index - 1].x1 < .060));
});

test('the store steps stay at the existing frontage and leave through travel open', () => {
  const [bottom, top] = HOME_COMMONS_STEP_SUPPORTS;
  assert.equal(bottom.x0, -18.10);
  assert.equal(bottom.x1, -16.0);
  assert.equal(bottom.z0, 55.68);
  assert.equal(top.z1, 56.82);
  assert.ok(top.z0 - bottom.z0 > .44, 'one full foot fits before the second rise');
  assert.equal(bottom.y1, top.y1 - bottom.y1);
  assert.ok(HOME_COMMONS_STEP_SUPPORTS.every(part => part.blocking === false));
  assert.ok(HOME_COMMONS_WORKS.filter(part => part.blocking).every(part =>
    part.x1 < -22 || part.z0 > 54.22));
});

test('the replacement pump spout stands over the existing trough and reaches its cast body', () => {
  const body = pieces['common-pump-barrel'];
  const spout = pieces['common-pump-spout'];
  const outlet = pieces['common-pump-outlet'];
  assert.ok(spout.z0 < body.z0 && spout.z1 > pieces['common-pump-spout-collar'].z0);
  assert.ok(spout.y0 > body.y0 && spout.y1 < body.y1);
  assert.ok(outlet.x0 > -24.02 && outlet.x1 < -22.18);
  assert.ok(outlet.z0 > 53.46 && outlet.z1 < 54.09);
  assert.ok(outlet.y0 > .80);
});

test('physical movement climbs both built treads, stops at the store and can back away', () => {
  const realm = createStationRealm({ variant: 5, home: true, seed: 0, entryDoorId: 'home',
    returnPose: { x: 0, y: 0 }, now: 0 });
  realm.pose.x = -17.05;
  realm.pose.z = 55.10;
  const floors = new Set([stationRealmFloor(5, realm.pose.x, realm.pose.z)]);
  for (let step = 0; step < 50; step += 1) {
    moveStationRealm(realm, { dz: .04 }, 1);
    floors.add(stationRealmFloor(5, realm.pose.x, realm.pose.z));
  }
  assert.deepEqual([...floors], [0, .2, .4]);
  assert.ok(realm.pose.z > 56.42 && realm.pose.z < 56.53);
  for (let step = 0; step < 42; step += 1) moveStationRealm(realm, { dz: -.04 }, 2);
  assert.ok(realm.pose.z < 55);
  assert.equal(stationRealmFloor(5, realm.pose.x, realm.pose.z), 0);
});

test('the parked sled keeps the rill and grating clear', () => {
  const sled = HOME_VALLEY_LIFE_SITES.find(site => site.id === 'commons-wood-sled');
  const runoff = HOME_COMMONS_WORKS.filter(piece =>
    piece.id === 'common-roof-water-rill' || piece.id.startsWith('common-catchpit-'));
  for (const part of sled.pieces) {
    assert.ok(runoff.every(drain => part.x0 >= drain.x1 || part.x1 <= drain.x0
      || part.z0 >= drain.z1 || part.z1 <= drain.z0), part.id);
  }
});
