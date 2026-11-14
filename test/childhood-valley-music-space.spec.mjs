import test from 'node:test';
import assert from 'node:assert/strict';
import { stationRealmCanOccupy, stationRealmFloor } from '../src/game/station-realms.js';
import { HOME_VALLEY_MUSIC_CELLS, homeValleyMusicCell, homeValleyMusicSpace } from '../src/game/childhood-valley-music-space.js';

const at = (x, z) => ({ x, z, floorY: stationRealmFloor(5, x, z), yaw: 0 });

test('spatial cells follow the direct lane and the existing mountain routes in either direction', () => {
  const direct = [[0, 1], [0, 12], [5.05, 40.2], [0, 62], [0, 67]];
  const westAndMountain = [[-27.12, 21.48], [-20, 53], [-32, 79], [-43, 90], [-65.41, 107.33],
    [-78.1, 131.63], [-56, 128], [-49.9, 114.6], [-43, 98], [-43, 90]];
  const east = [[21, 46], [23, 76], [0, 92]];
  const cellsAt = route => route.map(([x, z]) => {
    const pose = at(x, z);
    assert.ok(stationRealmCanOccupy(5, x, z, pose.floorY), `walkable landmark at ${x}, ${z}`);
    return homeValleyMusicCell(pose);
  });
  assert.deepEqual(cellsAt(direct), ['threshold', 'lane', 'approach', 'home', 'home']);
  assert.deepEqual(cellsAt(westAndMountain), ['stop', 'commons', 'fork', 'fork', 'timber', 'lookout', 'spring', 'spring', 'fork', 'fork']);
  assert.deepEqual(cellsAt(east), ['east', 'hamlet', 'hamlet']);
  assert.deepEqual(cellsAt([...westAndMountain].reverse()), cellsAt(westAndMountain).reverse());
  assert.equal(homeValleyMusicCell({ x: 200, z: 200 }), null);
  assert.equal(homeValleyMusicCell(null), null);
});

test('either side of a boundary keeps its incumbent briefly and ignores activity or gaze', () => {
  assert.equal(homeValleyMusicCell(at(0, 8.4), 'threshold'), 'threshold');
  assert.equal(homeValleyMusicCell(at(0, 9.7), 'threshold'), 'lane');
  assert.equal(homeValleyMusicCell(at(0, 7.6), 'lane'), 'lane');
  assert.equal(homeValleyMusicCell(at(0, 6.3), 'lane'), 'threshold');
  const maul = at(-65.41, 107.33);
  assert.equal(homeValleyMusicCell({ ...maul, yaw: Math.PI, activities: { split: true }, restLocus: 'angel' }), 'timber');
});

test('the actual shelter wall attenuates the same source and the closed pane is clearer than its masonry', () => {
  const inside = homeValleyMusicSpace('stop', at(-27.12, 21.48));
  const behind = homeValleyMusicSpace('stop', at(-30.4, 21.5));
  assert.deepEqual(inside.position, behind.position);
  assert.equal(inside.occlusionDb, 0);
  assert.ok(behind.occlusionDb > 8);
  assert.ok(behind.gain < inside.gain * .44 && behind.lowpassHz < inside.lowpassHz * .5);
  assert.ok(behind.wet > inside.wet);
  const pane = homeValleyMusicSpace('home', at(0, 67.5));
  const wall = homeValleyMusicSpace('home', at(-3.9, 68));
  assert.ok(pane.occlusionDb > 0 && pane.occlusionDb < wall.occlusionDb);
  assert.ok(pane.gain > wall.gain * 3 && pane.lowpassHz > wall.lowpassHz * 3);
});

test('terrain elevation affects the ray while turning changes the local bearing without moving its origin', () => {
  const saddle = at(-66, 134);
  const behindHill = homeValleyMusicSpace('lookout', saddle);
  const aboveHill = homeValleyMusicSpace('lookout', { ...saddle, eyeHeight: 12 });
  assert.ok(behindHill.occlusionDb > 20 && aboveHill.occlusionDb < 5);
  const near = at(-27.12, 21.48);
  const front = homeValleyMusicSpace('stop', near);
  const reversed = homeValleyMusicSpace('stop', { ...near, yaw: Math.PI });
  const farther = homeValleyMusicSpace('stop', at(-23, 21.5));
  assert.deepEqual(front.position, reversed.position);
  assert.ok(Math.abs(front.pan + reversed.pan) < 1e-6);
  assert.ok(farther.gain < front.gain && farther.distance > front.distance);
});

test('all authored origins and output parameters are finite and local on supported floor', () => {
  const spots = [[0, 1], [-10, 14], [-27.12, 21.48], [5.05, 40.2], [-20, 53], [21, 46],
    [0, 67], [23, 76], [-43, 90], [-65.41, 107.33], [-78.1, 131.63], [-49.9, 114.6]];
  assert.equal(spots.length, HOME_VALLEY_MUSIC_CELLS.length);
  for (const [x, z] of spots) {
    const cell = homeValleyMusicCell(at(x, z));
    const frame = homeValleyMusicSpace(cell, { x, z });
    assert.ok(frame.position.every(Number.isFinite) && Number.isFinite(frame.wet), cell);
    assert.ok(frame.distance < 25 && frame.gain > .13, cell);
  }
  assert.equal(homeValleyMusicSpace('unknown', at(0, 1)), null);
});
