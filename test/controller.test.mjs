import test from 'node:test';
import assert from 'node:assert/strict';

import * as controller from '../src/game/controller.js';
import {
  controllerBindings,
  controllerSettings,
  normalizeControllerSettings,
  setControllerBinding,
  setControllerSettings,
} from '../src/game/bindings.js';

function button(pressed = false, value = pressed ? 1 : 0) {
  return { pressed, value };
}

function pad(id, { axes = [0, 0, 0, 0], buttons = {} } = {}) {
  const list = Array.from({ length: 18 }, (_, index) => button(!!buttons[index]));
  return { id, axes, buttons: list, mapping: 'standard' };
}

function nav(pads) {
  return { getGamepads: () => pads };
}

test('normalizes standard gamepad axes, buttons, and family', () => {
  controller.controllerResetForTest();
  controller.setControllerNavigatorForTest(nav([
    pad('Xbox Wireless Controller', { axes: [0.5, -0.6, 0.4, -0.5], buttons: { 0: true } }),
  ]));
  controller.gamepadTick();
  const snap = controller.controllerSnapshot();
  assert.equal(snap.connected, true);
  assert.equal(snap.family, 'xbox');
  assert.ok(snap.axes.moveX > 0);
  assert.ok(snap.axes.moveY > 0);
  assert.ok(snap.axes.turnX > 0);
  assert.ok(snap.axes.lookY > 0);
  assert.ok(snap.buttons.has('south'));
});

test('active controller follows latest pad activity', () => {
  controller.controllerResetForTest();
  const pads = [
    pad('Idle Pad'),
    pad('Active Pad', { buttons: { 1: true } }),
  ];
  controller.setControllerNavigatorForTest(nav(pads));
  controller.gamepadTick();
  assert.equal(controller.controllerName(), 'Active Pad');

  pads[0] = pad('Idle Pad', { buttons: { 0: true } });
  pads[1] = pad('Active Pad');
  controller.gamepadTick();
  assert.equal(controller.controllerName(), 'Idle Pad');
});

test('deadzones and inverted look settings apply to controller axes', () => {
  controller.controllerResetForTest();
  setControllerSettings({ moveDeadzone: 0.4, lookDeadzone: 0.2, invertLookY: true, lookSensitivity: 2 });
  controller.setControllerSettings(controllerSettings());
  controller.setControllerNavigatorForTest(nav([
    pad('Generic Pad', { axes: [0.2, -0.8, 0.1, 0.6] }),
  ]));
  controller.gamepadTick();
  const axes = controller.controllerMotionAxes();
  assert.equal(axes.moveX, 0);
  assert.ok(axes.moveY > 0);
  assert.equal(axes.turnX, 0);
  assert.ok(axes.lookY > 0);
});

test('menu repeat emits stable repeated movement edges', () => {
  controller.controllerResetForTest();
  let now = 1000;
  const originalPerformance = globalThis.performance;
  globalThis.performance = { now: () => now };
  try {
    controller.setControllerNavigatorForTest(nav([pad('Pad', { buttons: { 13: true } })]));
    const pressed = [];
    controller.gamepadTick({ menuContext: true, onPress: (action, repeat) => pressed.push([action, repeat]) });
    now += 300;
    controller.gamepadTick({ menuContext: true, onPress: (action, repeat) => pressed.push([action, repeat]) });
    now += 70;
    controller.gamepadTick({ menuContext: true, onPress: (action, repeat) => pressed.push([action, repeat]) });
    assert.deepEqual(pressed, [['move_down', false], ['move_down', true]]);
  } finally {
    globalThis.performance = originalPerformance;
  }
});

test('independent mode exposes left-stick and d-pad motion without synthetic turn presses', () => {
  controller.controllerResetForTest();
  controller.setControllerNavigatorForTest(nav([
    pad('Pad', { axes: [0.7, -0.8, -0.6, 0.5], buttons: { 14: true } }),
  ]));
  const pressed = [];
  controller.gamepadTick({ independentMotion: true, onPress: (action) => pressed.push(action) });
  const axes = controller.controllerMotionAxes();
  assert.equal(pressed.some((action) => action.startsWith('move_')), false);
  assert.ok(axes.moveX < 0, 'd-pad left is blended with the left stick');
  assert.ok(axes.moveY > 0);
  assert.ok(axes.turnX < 0);
  assert.ok(axes.lookY < 0);
});

test('blocking scenes can opt into modal controller actions', () => {
  controller.controllerResetForTest();
  controller.setControllerNavigatorForTest(nav([pad('Pad', { buttons: { 7: true } })]));
  const pressed = [];
  controller.gamepadTick({
    menuContext: true,
    modalActions: ['recorder'],
    onPress: (action) => pressed.push(action),
  });
  assert.deepEqual(pressed, ['recorder']);
});

test('capture binds only fresh physical buttons and suppresses the bound press', () => {
  controller.controllerResetForTest();
  const pads = [pad('Pad')];
  controller.setControllerNavigatorForTest(nav(pads));
  let captured = null;
  controller.beginControllerRemap('interact', (token) => { captured = token; });
  controller.gamepadTick({ onPress: () => assert.fail('capture should not emit action') });
  pads[0] = pad('Pad', { buttons: { 3: true } });
  controller.gamepadTick({ onPress: () => assert.fail('capture should suppress action') });
  assert.deepEqual(captured, { kind: 'button', id: 'north' });
  assert.equal(controller.controllerRemapAction(), null);

  assert.equal(setControllerBinding('interact', captured), true);
  assert.equal(controllerBindings().interact.id, 'north');
  const presses = [];
  controller.gamepadTick({ onPress: (action) => presses.push(action) });
  assert.deepEqual(presses, []);
  pads[0] = pad('Pad');
  controller.gamepadTick();
  pads[0] = pad('Pad', { buttons: { 3: true } });
  controller.gamepadTick({ onPress: (action) => presses.push(action) });
  assert.deepEqual(presses, ['interact']);
});

test('disconnect releases held actions and cancels capture', () => {
  controller.controllerResetForTest();
  const pads = [pad('Pad', { buttons: { 0: true } })];
  controller.setControllerNavigatorForTest(nav(pads));
  controller.gamepadTick();
  controller.beginControllerRemap('light', () => {});
  pads.length = 0;
  const released = [];
  controller.gamepadTick({ onRelease: (action) => released.push(action) });
  assert.equal(controller.controllerName(), 'NO CONTROLLER');
  assert.equal(controller.controllerRemapAction(), null);
  assert.equal(controller.controllerSnapshot().connected, false);
});

test('legacy button tokens normalize into semantic bindings', () => {
  const normalized = normalizeControllerSettings({}, { interact: 'button2', menu: 'button9' });
  assert.equal(normalized.bindings.interact.id, 'west');
  assert.equal(normalized.bindings.menu.id, 'menu');
});
