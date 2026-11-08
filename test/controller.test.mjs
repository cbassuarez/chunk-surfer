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
  const list = Array.from({ length: 18 }, (_, index) => {
    const entry = buttons[index];
    if (entry && typeof entry === 'object') return { pressed: !!entry.pressed || (entry.value ?? 0) >= 0.5, value: Number(entry.value ?? 0) };
    return button(!!entry);
  });
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

test('scene-declared modal actions fire in the world, not only in menus', () => {
  controller.controllerResetForTest();
  controller.setControllerNavigatorForTest(nav([
    pad('Xbox Wireless Controller', { buttons: { 12: true } }), // d-pad up = mark
  ]));
  const pressed = [];
  controller.gamepadTick({
    menuContext: false,
    modalActions: ['mark'],
    onPress: (action) => pressed.push(action),
  });
  assert.ok(pressed.includes('mark'), 'mark reaches the world when its scene declares it');
  controller.gamepadTick({
    menuContext: false,
    modalActions: ['mark'],
    onPress: () => {},
    onRelease: () => {},
  });
  controller.controllerResetForTest();
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

  const bound = setControllerBinding('interact', captured);
  assert.equal(bound.ok, true);
  assert.equal(bound.swapped, 'light', 'the world action that held north swaps to interact\u2019s old south');
  assert.equal(controllerBindings().interact.id, 'north');
  assert.equal(controllerBindings().light.id, 'south');
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

test('the radio right shoulder is a world action and remains section-next in menus',()=>{
  controller.controllerResetForTest();
  controller.setControllerSettings({});
  const pads=[pad('Xbox Wireless Controller',{buttons:{5:true}})];
  controller.setControllerNavigatorForTest(nav(pads));
  const world=[];
  controller.gamepadTick({onPress:(action,repeat)=>world.push([action,repeat])});
  controller.gamepadTick({onPress:(action,repeat)=>world.push([action,repeat])});
  assert.deepEqual(world,[['radio',false]],'holding RB never repeats a route call');
  pads[0]=pad('Xbox Wireless Controller');controller.gamepadTick();
  pads[0]=pad('Xbox Wireless Controller',{buttons:{5:true}});
  const menu=[];controller.gamepadTick({menuContext:true,onPress:action=>menu.push(action)});
  assert.deepEqual(menu,['tabNext'],'ordinary modal UI does not dispatch radio');
});

test('radio remaps swap only world conflicts and migrate without stealing an existing shoulder binding',()=>{
  const migrated=normalizeControllerSettings({bindings:{interact:{kind:'button',id:'rightShoulder'}}});
  assert.equal(migrated.bindings.interact.id,'rightShoulder');
  assert.notEqual(migrated.bindings.radio.id,'rightShoulder');
  assert.equal(migrated.bindings.tabNext.id,'rightShoulder');
  setControllerSettings({});
  const remap=setControllerBinding('radio',{kind:'button',id:'rightTrigger'});
  assert.equal(remap.ok,true);
  assert.equal(remap.swapped,'recorder','recorder held the right trigger and takes radio\u2019s old shoulder');
  assert.equal(controllerBindings().radio.id,'rightTrigger');
  assert.equal(controllerBindings().recorder.id,'rightShoulder');
  assert.equal(controllerBindings().tabNext.id,'rightShoulder');
  setControllerSettings({});
});

test('tower haptics support dual rumble, reduction, and explicit off', async () => {
  controller.controllerResetForTest();
  const calls=[];
  const active=pad('DualSense Wireless Controller');
  active.vibrationActuator={
    type:'dual-rumble',
    async playEffect(type,options){calls.push({type,options});return 'complete';},
  };
  controller.setControllerNavigatorForTest(nav([active]));
  controller.gamepadTick();
  assert.equal((await controller.pulseControllerHaptics({mode:'full',strongMagnitude:.8,weakMagnitude:.5,duration:90})).ok,true);
  assert.equal(calls[0].type,'dual-rumble');
  assert.equal(calls[0].options.strongMagnitude,.8);
  await controller.pulseControllerHaptics({mode:'reduced',strongMagnitude:.8,weakMagnitude:.5,duration:90});
  assert.ok(calls[1].options.strongMagnitude<calls[0].options.strongMagnitude);
  const beforeOff=calls.length;
  assert.equal((await controller.pulseControllerHaptics({mode:'off'})).reason,'disabled');
  assert.equal(calls.length,beforeOff);
});

test('a half-pulled trigger turns on once and stays on: no flicker at the threshold', () => {
  controller.controllerResetForTest();
  const trigPad = (lt) => pad('Xbox Wireless Controller', { buttons: { 6: { value: lt } } });
  controller.setControllerNavigatorForTest(nav([trigPad(0.56)]));
  const pressed = [];
  controller.gamepadTick({ onPress: (a) => pressed.push(a) });
  assert.ok(pressed.includes('hide'), 'trigger turns on at the threshold');
  // Now the pull drifts 0.56 -> 0.47 -> 0.46: still held until it clearly
  // falls back through 0.45, instead of toggling every frame.
  controller.setControllerNavigatorForTest(nav([trigPad(0.47)]));
  controller.gamepadTick({ onPress: () => {}, onRelease: () => {} });
  assert.ok(controller.controllerSnapshot().actions.has('hide'), 'held through threshold chatter');
  controller.setControllerNavigatorForTest(nav([trigPad(0.44)]));
  controller.gamepadTick({ onPress: () => {}, onRelease: () => {} });
  assert.ok(!controller.controllerSnapshot().actions.has('hide'), 'released below the drop-out');
  controller.controllerResetForTest();
});

test('a worn stick is calibrated at rest so drift stops walking the player', () => {
  controller.controllerResetForTest();
  // Left stick reports +0.18 at rest: a real worn-pad value.
  const drifting = () => pad('Xbox Wireless Controller', { axes: [0.18, 0, 0, 0] });
  controller.setControllerNavigatorForTest(nav([drifting()]));
  for (let i = 0; i < 35; i++) controller.gamepadTick();
  const atRest = controller.controllerSnapshot();
  assert.ok(Math.abs(atRest.axes.moveX) < 0.02, 'rest drift is calibrated away');
  // A real push still moves: 0.8 - 0.18 rest = 0.62 past the deadzone.
  controller.setControllerNavigatorForTest(nav([pad('Xbox Wireless Controller', { axes: [0.8, 0, 0, 0] })]));
  controller.gamepadTick();
  assert.ok(controller.controllerSnapshot().axes.moveX > 0.5, 'real input survives calibration');
  controller.controllerResetForTest();
});

test('the look curve flattens the middle: half deflection is not half speed', () => {
  controller.controllerResetForTest();
  controller.setControllerNavigatorForTest(nav([
    pad('Xbox Wireless Controller', { axes: [0, 0, 0.5, 0] }),
  ]));
  controller.gamepadTick();
  const curved = controller.controllerSnapshot().axes.turnX;
  // At the default curve of 1.35, half deflection reads as ~0.44 of full.
  // Linear would be (0.5-0.16)/0.84 = 0.405; the 1.35 curve reads lower.
  assert.ok(curved > 0.2 && curved < 0.4, `curve shapes the middle (${curved})`);
  controller.controllerResetForTest();
});

test('a swapped-layout pad reads its real buttons through the database', () => {
  controller.controllerResetForTest();
  // The 3 In 1 Conversion Box: physical button 2 IS the south face button.
  controller.setControllerNavigatorForTest(nav([
    pad('Vendor: 0f30 Product: 010a 3 In 1 Conversion Box', { buttons: { 2: true } }),
  ]));
  controller.gamepadTick();
  const snap = controller.controllerSnapshot();
  assert.ok(snap.buttons.has('south'), 'physical 2 reads as south on this device');
  assert.ok(!snap.buttons.has('west'), 'the standard-mapping guess would have said west');
  controller.controllerResetForTest();
});

test('connection listeners hear the pad arrive and leave', () => {
  controller.controllerResetForTest();
  const events = [];
  const off = controller.onControllerConnection((event) => events.push(event));
  controller.setControllerNavigatorForTest(nav([pad('Xbox Wireless Controller', { buttons: { 0: true } })]));
  controller.gamepadTick();
  controller.setControllerNavigatorForTest(nav([]));
  controller.gamepadTick();
  off();
  assert.equal(events.length, 2);
  assert.equal(events[0].connected, true);
  assert.equal(events[1].connected, false);
  controller.controllerResetForTest();
});

test('the snapshot carries raw values for the settings-screen tester', () => {
  controller.controllerResetForTest();
  controller.setControllerNavigatorForTest(nav([
    pad('Xbox Wireless Controller', { axes: [0.4, -0.2, 0, 0], buttons: { 0: true } }),
  ]));
  controller.gamepadTick();
  const snap = controller.controllerSnapshot();
  assert.deepEqual(snap.rawValues.axes.slice(0, 4), [0.4, -0.2, 0, 0]);
  assert.equal(snap.rawValues.buttons.south, 1);
  controller.controllerResetForTest();
});

test('a tap pressed and released inside one long frame is never lost', () => {
  controller.controllerResetForTest();
  controller.setControllerNavigatorForTest(nav([pad('Pad')]));
  const presses = [];
  controller.gamepadTick({ onPress: (a) => presses.push(a) });
  // A hitch: the tap happens entirely between two rendered ticks. The
  // fixed-rate sampler sees both edges; the next tick must surface the press.
  controller.controllerPollSample(); // still nothing
  controller.setControllerNavigatorForTest(nav([pad('Pad', { buttons: { 0: true } })]));
  controller.controllerPollSample(); // down
  controller.setControllerNavigatorForTest(nav([pad('Pad')]));
  controller.controllerPollSample(); // up, all inside the frame
  controller.gamepadTick({ onPress: (a) => presses.push(a) });
  assert.ok(presses.includes('interact'), 'the in-frame tap fired');
  assert.equal(presses.length, 1);
  controller.controllerResetForTest();
});

test('tremor suppression folds rapid re-presses into one press', () => {
  controller.controllerResetForTest();
  const settings = normalizeControllerSettings({ inputDebounceMs: 120 });
  controller.setControllerSettings(settings);
  const presses = [];
  const press = (v) => {
    controller.setControllerNavigatorForTest(nav([pad('Pad', { buttons: { 0: { value: v } } })]));
    controller.gamepadTick({ onPress: (a) => presses.push(a) });
  };
  press(1); press(0); press(1); press(0); press(1); press(0);
  assert.equal(presses.length, 1, 'one press across the stutter');
  controller.controllerResetForTest();
});

test('run is a latch by default and an ordinary hold when asked', () => {
  controller.controllerResetForTest();
  assert.equal(controllerSettings().runMode, 'latch');
  const held = normalizeControllerSettings({ runMode: 'hold' });
  assert.equal(held.runMode, 'hold');
  assert.equal(normalizeControllerSettings({ runMode: 'nonsense' }).runMode, 'latch', 'unknown modes fall back to the latch');
  controller.controllerResetForTest();
});
