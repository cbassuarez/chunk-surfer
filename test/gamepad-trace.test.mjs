import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import * as controller from '../src/game/controller.js';
import { gamepadTraceNavigator, traceFrameFromSnapshot, createGamepadTraceRecorder } from '../src/game/gamepad-trace.js';

const FIXTURES = new URL('./fixtures/gamepad-traces/', import.meta.url);

// A DualShock 4-shaped session, recorded the way the dev capture records it:
// raw axes and per-button values per polled frame. The pad id carries the
// real vendor/product pair, so the device database is exercised too.
const frame = (axes, buttons = {}) => ({ axes, buttons });
const DS4_SESSION = Object.freeze([
  frame([0, 0, 0, 0], {}),
  frame([0, 0, 0, 0], { leftShoulder: 1 }), // a plain press
  frame([0, 0, 0, 0], { leftShoulder: 0 }),
  frame([0.05, 0, 0, 0], {}), // a worn stick reporting drift at rest
  frame([0.06, 0, 0, 0], {}),
  frame([0.06, 0, 0, 0], { south: 1 }), // DS4's south lives on a physical 1
  frame([0.06, 0, 0, 0], { south: 0 }),
]);

test('a recorded session replays through the poller into the same actions', () => {
  controller.controllerResetForTest();
  const pressed = [], released = [];
  controller.setControllerNavigatorForTest(gamepadTraceNavigator({ frames: DS4_SESSION }));
  for (const frame of DS4_SESSION) {
    void frame;
    controller.gamepadTick({ onPress: (a) => pressed.push(a), onRelease: (a) => released.push(a) });
  }
  assert.ok(pressed.includes('tabPrev'), 'left shoulder is the section stepper');
  assert.ok(pressed.includes('interact'), 'south is interact');
  assert.ok(released.includes('tabPrev') && released.includes('interact'));
  // The worn stick's rest drift was being sampled; nothing walked.
  assert.ok(Math.abs(controller.controllerSnapshot().axes.moveX) < 0.05, 'drift does not become movement');
  controller.controllerResetForTest();
});

test('a chattering trigger trace produces exactly one press, per the latch', () => {
  controller.controllerResetForTest();
  const frames = [
    frame([0, 0, 0, 0], { leftTrigger: 0.56 }),
    frame([0, 0, 0, 0], { leftTrigger: 0.54 }), // chatter around the threshold
    frame([0, 0, 0, 0], { leftTrigger: 0.57 }),
    frame([0, 0, 0, 0], { leftTrigger: 0.48 }), // still inside the drop-out band
    frame([0, 0, 0, 0], { leftTrigger: 0.40 }),
  ];
  controller.setControllerNavigatorForTest(gamepadTraceNavigator({ frames, padId: 'Xbox Wireless Controller' }));
  let hides = 0;
  for (const frame of frames) {
    void frame;
    controller.gamepadTick({ onPress: (a) => { if (a === 'hide') hides += 1; }, onRelease: () => {} });
  }
  assert.equal(hides, 1, 'one press across the chatter');
  assert.ok(!controller.controllerSnapshot().actions.has('hide'), 'released after the drop-out');
  controller.controllerResetForTest();
});

test('the capture side produces frames the replay side accepts', () => {
  controller.controllerResetForTest();
  controller.setControllerNavigatorForTest(gamepadTraceNavigator({ frames: DS4_SESSION, padId: 'Xbox Wireless Controller' }));
  const recorder = createGamepadTraceRecorder();
  controller.gamepadTick({ onPress: () => {}, onRelease: () => {} });
  controller.gamepadTick({ onPress: () => {}, onRelease: () => {} });
  recorder.record(controller.controllerSnapshot());
  controller.gamepadTick({ onPress: () => {}, onRelease: () => {} });
  recorder.record(controller.controllerSnapshot());
  assert.equal(recorder.frames(), 2);
  const roundTrip = traceFrameFromSnapshot(controller.controllerSnapshot());
  assert.ok(Array.isArray(roundTrip.axes) && typeof roundTrip.buttons === 'object');
  controller.controllerResetForTest();
});


test('every committed real-device fixture replays, well-formed, into real actions', () => {
  const files = readdirSync(FIXTURES).filter((name) => name.endsWith('.json'));
  assert.ok(files.length >= 1, 'fixtures are committed');
  for (const file of files) {
    const raw = JSON.parse(readFileSync(new URL(file, FIXTURES), 'utf8'));
    assert.equal(raw.schema, 1, file);
    assert.ok(Array.isArray(raw.frames) && raw.frames.length > 0, file);
    controller.controllerResetForTest();
    const pressed = [];
    controller.setControllerNavigatorForTest(gamepadTraceNavigator({ frames: raw.frames, padId: raw.padId }));
    for (const frame of raw.frames) {
      void frame;
      controller.gamepadTick({ onPress: (action) => pressed.push(action), onRelease: () => {} });
    }
    assert.ok(pressed.length > 0, `${file} produces at least one action`);
    controller.controllerResetForTest();
  }
});
