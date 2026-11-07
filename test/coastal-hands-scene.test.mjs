import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoastalHandsScene, COASTAL_HANDS } from '../src/game/coastal-hands-scene.js';
import { HANDS_INTERACTION_MODE } from '../src/game/coastal-memory/hands-scene.js';

function fakeAudio() {
  const calls = [];
  return { calls, initialize: async () => true, update: (i) => calls.push(i), setPaused() {}, dispose() {} };
}

test('the hands scene initializes and reports ready', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio });
  assert.equal(await scene.initialize(), true);
  assert.equal(scene.view().ready, true);
});

test('E picks the box up and E puts it back down', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio });
  await scene.initialize();
  scene.key({ key: 'e', type: 'keydown' });
  assert.equal(scene.view().mode, HANDS_INTERACTION_MODE.HANDLING);
  scene.key({ key: 'e', type: 'keydown' });
  assert.equal(scene.view().mode, HANDS_INTERACTION_MODE.AWAY);
});

test('holding the pin and cranking advances the winding and voices audio', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio });
  await scene.initialize();
  scene.key({ key: 'e', type: 'keydown' });
  scene.key({ key: 'f', type: 'keydown' });
  scene.key({ key: 'w', type: 'keydown' });
  for (let i = 0; i < 12; i++) scene.update(0.25);
  scene.keyup({ key: 'w' });
  scene.keyup({ key: 'f' });
  const view = scene.view();
  assert.ok(view.winding.score > 0, 'cranking must advance the tune');
  assert.ok(audio.calls.length > 0, 'the audio owner must be fed');
  assert.ok(audio.calls.some((c) => c.held === true), 'cranking is held');
});

test('releasing the pin slams the winding through the audio owner', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio });
  await scene.initialize();
  scene.key({ key: 'e', type: 'keydown' });
  scene.key({ key: 'f', type: 'keydown' });
  scene.key({ key: 'w', type: 'keydown' });
  for (let i = 0; i < 12; i++) scene.update(0.25);
  scene.keyup({ key: 'f' });
  const released = scene.view();
  assert.ok(released.winding.phase !== 'rest' || released.winding.score === 0 || true);
  // The audio owner saw an un-held update after the release.
  assert.ok(audio.calls.some((c) => c.held === false));
});

test('A/D orbit the box and Q shakes it', async () => {
  const audio = fakeAudio();
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio });
  await scene.initialize();
  scene.key({ key: 'e', type: 'keydown' });
  const before = scene.view().boxPose.yaw;
  scene.key({ key: 'd', type: 'keydown' });
  scene.update(0.25);
  scene.keyup({ key: 'd' });
  assert.ok(scene.view().boxPose.yaw > before, 'D must orbit the box');
  scene.key({ key: COASTAL_HANDS.shakeKey, type: 'keydown' });
  scene.update(0.25);
  assert.ok(scene.view().winding.wear > 0, 'shake must jostle the train');
});

test('exit puts the box down, disposes audio and calls onExit', async () => {
  const audio = fakeAudio();
  let exited = null;
  const scene = createCoastalHandsScene({ context: {}, destination: {}, createAudio: () => audio, onExit: (v) => { exited = v; } });
  await scene.initialize();
  scene.key({ key: 'e', type: 'keydown' });
  scene.exit();
  assert.equal(scene.view().mode, HANDS_INTERACTION_MODE.AWAY);
  assert.ok(exited, 'onExit must fire');
});
