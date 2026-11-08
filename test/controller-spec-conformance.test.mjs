import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROLLER_BUTTON_IDS, DEFAULT_CONTROLLER_SETTINGS, CONTROLLER_BINDING_ACTIONS } from '../src/game/bindings.js';
import * as controller from '../src/game/controller.js';

// The W3C Gamepad spec's "standard" mapping, indices 0-16, as published at
// https://w3c.github.io/gamepad/#remapping — the contract every browser pad
// presents and every other module here reads through.
const W3C_STANDARD_BUTTONS = Object.freeze([
  'south', 'east', 'west', 'north',
  'leftShoulder', 'rightShoulder', 'leftTrigger', 'rightTrigger',
  'view', 'menu', 'leftStick', 'rightStick',
  'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
  'guide',
]);

function button(pressed = false, value = pressed ? 1 : 0) { return { pressed, value }; }
function pad(id, { axes = [0, 0, 0, 0], buttons = {} } = {}) {
  const list = Array.from({ length: 18 }, (_, index) => button(!!buttons[index]));
  return { id, axes, buttons: list, mapping: 'standard' };
}
function nav(pads) { return { getGamepads: () => pads }; }

test('the standard index table matches the W3C spec exactly', () => {
  // The spec table is the contract: press every physical index on a generic
  // pad and the semantic set must be exactly the spec's names.
  controller.controllerResetForTest();
  for (let index = 0; index < W3C_STANDARD_BUTTONS.length; index++) {
    const buttons = { [index]: true };
    controller.setControllerNavigatorForTest(nav([pad('Generic Pad', { buttons })]));
    controller.gamepadTick();
    const snap = controller.controllerSnapshot();
    assert.ok(snap.buttons.has(W3C_STANDARD_BUTTONS[index]), `index ${index} is ${W3C_STANDARD_BUTTONS[index]}`);
    assert.equal(snap.buttons.size, 1, `index ${index} maps to exactly one semantic button`);
  }
  controller.controllerResetForTest();
});

test('the standard axes follow the spec order: left stick then right stick', () => {
  controller.controllerResetForTest();
  controller.setControllerNavigatorForTest(nav([pad('Generic Pad', { axes: [1, -1, 1, -1] })]));
  controller.gamepadTick();
  const axes = controller.controllerSnapshot().axes;
  assert.ok(axes.moveX > 0.9 && axes.moveY > 0.9, 'axes 0/1 are the left stick, -Y is up');
  assert.ok(axes.turnX > 0.9 && axes.lookY > 0.9, 'axes 2/3 are the right stick, -Y is up');
  controller.controllerResetForTest();
});

test('triggers are the analog pair, per spec, and every binding action has a bindable id', () => {
  controller.controllerResetForTest();
  controller.setControllerNavigatorForTest(nav([pad('Generic Pad', { buttons: { 6: { value: 0.9 }, 7: { value: 0.9 } } })]));
  controller.gamepadTick();
  const snap = controller.controllerSnapshot();
  assert.ok(snap.buttons.has('leftTrigger') && snap.buttons.has('rightTrigger'), 'triggers report at indices 6/7');
  assert.ok(snap.rawValues.buttons.leftTrigger > 0.8, 'trigger values are analog');
  for (const action of CONTROLLER_BINDING_ACTIONS) {
    assert.ok(CONTROLLER_BUTTON_IDS.includes(DEFAULT_CONTROLLER_SETTINGS.bindings[action].id), `${action} binds a real button`);
  }
  controller.controllerResetForTest();
});
