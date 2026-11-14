import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRecordingListenBeat } from '../src/game/recording-listen.js';

test('the footfall follows a settled turn and only happens once on the same take', () => {
  const beat = createRecordingListenBeat();
  const tick = (elapsed, yaw, overrides) => beat.update({ lowered: true, eligible: true, elapsed, yaw, duration: 60, ...overrides });
  assert.equal(tick(8, 6.1), null);
  assert.deepEqual(tick(8.5, .5), { listening: true });
  assert.deepEqual(tick(9, .8), { listening: true });
  assert.deepEqual(tick(9.55, .8), { listening: true });
  assert.deepEqual(tick(9.57, .8), { listening: true, step: true, bearing: -1.24 });
  assert.deepEqual(tick(10, .8), { listening: true });
  assert.equal(tick(11, .8), null);
  assert.equal(tick(13, .8, { lowered: false }), null);
  assert.equal(tick(14, 1.5), null);
  assert.equal(tick(16, .5), null);
});

test('raising early, interruption and nearing the tape end discard a pending footfall', () => {
  const beat = createRecordingListenBeat();
  const tick = (elapsed, yaw, overrides) => beat.update({ lowered: true, eligible: true, elapsed, yaw, duration: 60, ...overrides });
  tick(6, 1);
  tick(7, 0);
  assert.equal(tick(7.3, 0, { lowered: false }), null);
  assert.equal(tick(8, 0), null);
  tick(9, -1);
  assert.equal(tick(9.3, -1, { eligible: false }), null);
  assert.equal(tick(10, -1), null);
  assert.equal(tick(59, -2), null);
  beat.reset();
  tick(3, 0);
  tick(3.4, -1);
  assert.deepEqual(tick(4.2, -1), { listening: true, step: true, bearing: 1.24 });
});
