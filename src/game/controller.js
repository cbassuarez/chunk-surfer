// Native Gamepad API input. This module owns the single browser gamepad poll,
// normalizes the Standard Gamepad layout, and emits the same action edge/hold
// model used by keyboard-driven scenes.

import {
  CONTROLLER_BUTTON_IDS,
  controllerActionBinding,
  controllerFamilyFromName,
  controllerSettings,
  normalizeControllerSettings,
  setActiveInputDevice,
  setControllerSettings as setBindingControllerSettings,
} from './bindings.js';
import { deviceLayoutFor } from './controller-device.js';

const MOVE = Object.freeze({ up: 'move_up', down: 'move_down', left: 'move_left', right: 'move_right' });
const REPEATABLE = new Set([...Object.values(MOVE), 'tabPrev', 'tabNext']);
// LB has no world verb of its own since quiet became run (L3); it steps a
// world chooser back, the way Q does on the keyboard.
const WORLD_ACTIONS = ['run', 'hide', 'light', 'bag', 'recorder', 'radio', 'interact', 'playback', 'menu', 'tabPrev'];
const MENU_ACTIONS = ['confirm', 'back', 'menu', 'tabPrev', 'tabNext'];
const BUTTON_BY_INDEX = Object.freeze({
  0: 'south',
  1: 'east',
  2: 'west',
  3: 'north',
  4: 'leftShoulder',
  5: 'rightShoulder',
  6: 'leftTrigger',
  7: 'rightTrigger',
  8: 'view',
  9: 'menu',
  10: 'leftStick',
  11: 'rightStick',
  12: 'dpadUp',
  13: 'dpadDown',
  14: 'dpadLeft',
  15: 'dpadRight',
  16: 'guide',
  17: 'touchpad',
});

let previous = new Set();
let previousButtons = new Set();
let repeatedAt = new Map();
let suppressedButtons = new Set();
let padName = '';
let rawPadId = '';
let activePadId = '';
let activePadIndex = -1;
let capture = null;
let settings = normalizeControllerSettings(controllerSettings());
let navigatorOverride = null;
let lastState = emptyState();
let lastRawPadId = '';
let deviceLayout = null; // the physical layout of the pad currently in hand
let calibration = null; // sampled rest state, subtracted from the live axes
let calibrationFrames = 0;
let triggerLatched = new Set(); // triggers hold their on/off state: no flicker
let rawValues = {}; // raw axis/button values for the settings screen's tester
const CALIBRATION_FRAMES = 30;
const connectionListeners = new Set();

export function onControllerConnection(callback) {
  connectionListeners.add(callback);
  return () => connectionListeners.delete(callback);
}

function emptyState() {
  return {
    connected: false,
    padName: '',
    padId: '',
    family: 'generic',
    axes: { moveX: 0, moveY: 0, turnX: 0, lookY: 0 },
    buttons: new Set(),
    pressed: new Set(),
    released: new Set(),
    actions: new Set(),
  };
}

function clampAxis(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

function deadzone(value, dz = 0.12) {
  const n = Number(value) || 0;
  const a = Math.abs(n);
  if (a <= dz) return 0;
  return Math.sign(n) * ((a - dz) / Math.max(0.0001, 1 - dz));
}

function pads() {
  const nav = navigatorOverride || globalThis.navigator;
  try { return [...(nav?.getGamepads?.() || [])].filter(Boolean); }
  catch (_) { return []; }
}

const ANALOG_BUTTONS = new Set(['leftTrigger', 'rightTrigger']);

function buttonPressed(button, threshold, id = null) {
  // Digital buttons report `pressed` and nothing useful in `value`. Analog
  // triggers report both — and short-circuiting on `pressed` meant the user's
  // triggerThreshold only ever applied to pads that left `pressed` false.
  // `recorder` is bound to a trigger by default, so this is the setting that
  // matters most.
  if (id && ANALOG_BUTTONS.has(id)) return Number(button?.value || 0) >= threshold;
  return !!button?.pressed || Number(button?.value || 0) >= threshold;
}

function normalizePadName(pad) {
  return String(pad?.id || 'GAMEPAD').replace(/\s*\([^)]*\)\s*/g, ' ').trim().slice(0, 36);
}

function physicalButtonId(layout, index) {
  if (layout?.buttons?.has(index)) return layout.buttons.get(index);
  return BUTTON_BY_INDEX[index] || null;
}

// A trigger flickers if it is read at the threshold each frame: it turns on
// and off a dozen times a second on a half-pulled pull. Latched edges fix it:
// once on, it stays on until the value falls clearly back. The physical value
// comes from the device's own row (trigger-as-axis) or the bound button.
function triggerHeld(layout, pad, id, threshold) {
  const axisIndex = layout?.triggerAxes?.get(id);
  let value;
  if (axisIndex != null) {
    value = Number(pad?.axes?.[axisIndex] || 0) * (layout.invert.has(`a${axisIndex}`) ? -1 : 1);
  } else {
    let index = null;
    for (const [i, semantic] of layout?.buttons || []) if (semantic === id) { index = i; break; }
    if (index == null) index = id === 'leftTrigger' ? 6 : 7;
    const entry = pad?.buttons?.[index];
    value = Number(entry?.value || (entry?.pressed ? 1 : 0) || 0);
  }
  const on = value >= threshold;
  const off = value < threshold * 0.82;
  if (on) triggerLatched.add(id);
  else if (off) triggerLatched.delete(id);
  return triggerLatched.has(id);
}

// Rest-state drift: worn sticks and triggers report a few percent at rest.
// The first half-second of a pad's session is sampled and subtracted, so a
// drifting left stick stops walking the player sideways.
function calibratedAxis(value, index, role) {
  const raw = Number(value) || 0;
  if (role === 'leftx' || role === 'lefty') {
    if (calibration && calibrationFrames >= CALIBRATION_FRAMES) return raw - calibration[index];
    // Still sampling: report zero rather than the drifting rest.
    if (Math.abs(raw) < 0.5) return 0;
  }
  return raw;
}

function sampleCalibration(pad) {
  if (calibrationFrames >= CALIBRATION_FRAMES || !pad?.axes?.length) return;
  if ((pad.axes || []).some((axis) => Math.abs(Number(axis) || 0) > 0.6)) return; // in use: do not learn
  calibration = calibration || new Array(pad.axes.length).fill(0);
  for (let i = 0; i < pad.axes.length; i++) {
    const value = Number(pad.axes[i]) || 0;
    calibration[i] = (calibration[i] * calibrationFrames + value) / (calibrationFrames + 1);
  }
  calibrationFrames++;
}

// The look curve: sensitivity is the peak; the curve shapes the middle so a
// small nudge tracks slowly and a full push reaches the full rate.
function curveAxis(value, curve) {
  const n = Number(value) || 0;
  if (!n) return 0;
  return Math.sign(n) * Math.pow(Math.abs(n), curve);
}

function rawButtons(pad, threshold = settings.triggerThreshold) {
  const out = new Set();
  pad?.buttons?.forEach((button, index) => {
    const id = physicalButtonId(deviceLayout, index);
    if (id && buttonPressed(button, threshold, id)) out.add(id);
  });
  return out;
}

function rawActivity(pad) {
  if (!pad) return false;
  if (rawButtons(pad, Math.min(settings.triggerThreshold, 0.55)).size) return true;
  return (pad.axes || []).some((axis) => Math.abs(Number(axis) || 0) > 0.28);
}

function selectPad(list) {
  if (!settings.enabled || !list.length) return null;
  const activeIndex = list.findIndex((pad, index) => (
    (activePadId && pad.id === activePadId) || (activePadIndex >= 0 && index === activePadIndex)
  ));
  const configuredIndex = settings.activePadId
    ? list.findIndex((pad) => pad.id === settings.activePadId)
    : -1;
  const fallbackIndex = activeIndex >= 0 ? activeIndex : configuredIndex >= 0 ? configuredIndex : 0;
  const activityIndex = list.findIndex((pad) => rawActivity(pad));
  const index = activityIndex >= 0 ? activityIndex : fallbackIndex;
  const pad = list[index] || list[0];
  activePadIndex = index;
  activePadId = pad?.id || '';
  return pad;
}

function axesFor(pad) {
  if (!pad) return { moveX: 0, moveY: 0, turnX: 0, lookY: 0 };
  // The physical axis indices, from the device's own database row when there
  // is one, the standard mapping when there is not.
  const roles = { leftx: 0, lefty: 1, rightx: 2, righty: 3 };
  for (const [index, role] of deviceLayout?.axes || []) roles[role] = index;
  const signFor = (role, fallback) => deviceLayout?.invert.has(`a${roles[role]}`) ? -1 : fallback;
  const leftX = signFor('leftx', 1) * calibratedAxis(pad.axes?.[roles.leftx], roles.leftx, 'leftx');
  const leftY = signFor('lefty', -1) * calibratedAxis(pad.axes?.[roles.lefty], roles.lefty, 'lefty');
  const rightX = signFor('rightx', 1) * calibratedAxis(pad.axes?.[roles.rightx], roles.rightx, 'rightx');
  const rightY = signFor('righty', -1) * calibratedAxis(pad.axes?.[roles.righty], roles.righty, 'righty');
  const lookSign = settings.invertLookY ? -1 : 1;
  const curve = settings.lookCurve ?? 1.35;
  const sensitivity = settings.lookSensitivity;
  return {
    moveX: clampAxis(deadzone(leftX, settings.moveDeadzone)),
    moveY: clampAxis(deadzone(leftY, settings.moveDeadzone)),
    turnX: clampAxis(curveAxis(deadzone(rightX, settings.lookDeadzone), curve) * sensitivity),
    lookY: clampAxis(curveAxis(deadzone(rightY * lookSign, settings.lookDeadzone), curve) * sensitivity),
  };
}

function movementFromAxes(axes, buttons) {
  const out = new Set();
  if (axes.moveY > 0.55 || buttons.has('dpadUp')) out.add(MOVE.up);
  if (axes.moveY < -0.55 || buttons.has('dpadDown')) out.add(MOVE.down);
  if (axes.moveX < -0.55 || buttons.has('dpadLeft')) out.add(MOVE.left);
  if (axes.moveX > 0.55 || buttons.has('dpadRight')) out.add(MOVE.right);
  return out;
}

function axesWithDpad(axes, buttons) {
  return {
    ...axes,
    moveX: clampAxis(axes.moveX + (buttons.has('dpadRight') ? 1 : 0) - (buttons.has('dpadLeft') ? 1 : 0)),
    moveY: clampAxis(axes.moveY + (buttons.has('dpadUp') ? 1 : 0) - (buttons.has('dpadDown') ? 1 : 0)),
  };
}

function actionPressed(action, buttons, pad, rawButtonsSet) {
  const binding = controllerActionBinding(action);
  if (binding?.kind !== 'button') return false;
  const id = binding.id;
  if (id === 'leftTrigger' || id === 'rightTrigger') return triggerHeld(deviceLayout, pad, id, settings.triggerThreshold);
  return buttons.has(id);
}

function actionsFor(pad, menuContext, buttons = rawButtons(pad), extraActions = [], independentMotion = false) {
  const axes = axesWithDpad(axesFor(pad), buttons);
  const actions = independentMotion && !menuContext ? new Set() : movementFromAxes(axes, buttons);
  const buttonActions = menuContext
    ? [...new Set([...MENU_ACTIONS, ...extraActions])]
    : [...new Set([...WORLD_ACTIONS, ...extraActions])];
  for (const action of buttonActions) {
    if (actionPressed(action, buttons, pad, buttons)) actions.add(action);
  }
  return { axes, buttons, actions };
}

function updateLastState(pad, buttons, axes, actions) {
  const name = normalizePadName(pad);
  const family = settings.family === 'auto' ? controllerFamilyFromName(name) : settings.family;
  lastState = {
    connected: !!pad,
    padName: pad ? name : '',
    padId: pad?.id || '',
    family,
    axes,
    buttons: new Set(buttons),
    pressed: new Set([...buttons].filter((token) => !previousButtons.has(token))),
    released: new Set([...previousButtons].filter((token) => !buttons.has(token))),
    actions: new Set(actions),
  };
  setActiveInputDevice(null, { controllerFamily: family, viable: true });
}

function releaseAll(onRelease) {
  for (const action of previous) onRelease(action);
  previous.clear();
  previousButtons.clear();
  repeatedAt.clear();
  suppressedButtons.clear();
  padName = '';
  activePadId = '';
  activePadIndex = -1;
  capture = null;
  if (lastRawPadId) {
    lastRawPadId = '';
    for (const listener of connectionListeners) listener({ connected: false, name: '' });
  }
  deviceLayout = null;
  calibration = null;
  calibrationFrames = 0;
  triggerLatched = new Set();
  setActiveInputDevice('keyboard', { viable: false, controllerFamily: 'generic' });
  lastState = emptyState();
}

export function setControllerSettings(next = {}) {
  settings = normalizeControllerSettings(next);
  setBindingControllerSettings(settings);
  return { ...settings, bindings: { ...settings.bindings } };
}

export function controllerName() { return padName || 'NO CONTROLLER'; }
export function controllerConnected() { return !!padName; }
export function controllerRemapAction() { return capture?.action || null; }
export function controllerSnapshot() { return { ...lastState, rawValues, buttons: new Set(lastState.buttons), pressed: new Set(lastState.pressed), released: new Set(lastState.released), actions: new Set(lastState.actions) }; }
export function controllerMotionAxes() { return lastState.connected && settings.enabled ? { ...lastState.axes } : { moveX: 0, moveY: 0, turnX: 0, lookY: 0 }; }

// A single conservative haptics surface for authored gameplay. Browsers expose
// either the modern dual-rumble actuator, a generic haptic actuator, or only
// device vibration. Every branch is optional and a rejected actuator promise
// is an ordinary unsupported-device result, never an input failure.
export async function pulseControllerHaptics({
  duration=90,
  strongMagnitude=.7,
  weakMagnitude=.35,
  mode='full',
}={}){
  const resolvedMode=['off','reduced','full'].includes(mode)?mode:'full';
  if(resolvedMode==='off')return{ok:false,reason:'disabled'};
  const scale=resolvedMode==='reduced'?.42:1;
  const milliseconds=Math.max(12,Math.min(800,Number(duration)||90));
  const nav=navigatorOverride||globalThis.navigator;
  const list=pads();
  const pad=list.find((entry,index)=>(activePadId&&entry.id===activePadId)||(activePadIndex>=0&&index===activePadIndex))||list[0]||null;
  const actuator=pad?.vibrationActuator||pad?.hapticActuators?.[0]||null;
  if(typeof actuator?.playEffect==='function'){
    try{
      await actuator.playEffect(actuator.type||'dual-rumble',{
        duration:milliseconds,startDelay:0,
        strongMagnitude:Math.max(0,Math.min(1,(Number(strongMagnitude)||0)*scale)),
        weakMagnitude:Math.max(0,Math.min(1,(Number(weakMagnitude)||0)*scale)),
      });
      return{ok:true,kind:'gamepad'};
    }catch(_){/* fall through to device vibration */}
  }
  if(typeof nav?.vibrate==='function'){
    try{if(nav.vibrate(Math.round(milliseconds*scale)))return{ok:true,kind:'device'};}catch(_){/* unavailable */}
  }
  return{ok:false,reason:'unavailable'};
}

export function beginControllerRemap(action, done) {
  if (!action) return false;
  capture = { action, done };
  return true;
}

export function cancelControllerRemap() { capture = null; }

export function gamepadTick({ menuContext = false, independentMotion = false, modalActions = [], onPress = () => {}, onRelease = () => {} } = {}) {
  settings = normalizeControllerSettings(controllerSettings());
  const list = pads();
  const pad = selectPad(list);
  if (!pad) {
    releaseAll(onRelease);
    return;
  }
  padName = normalizePadName(pad);
  rawPadId = String(pad?.id || '');
  if (rawPadId !== lastRawPadId) {
    lastRawPadId = rawPadId;
    deviceLayout = deviceLayoutFor(rawPadId);
    calibration = null;
    calibrationFrames = 0;
    triggerLatched = new Set();
    for (const listener of connectionListeners) listener({ connected: !!pad, name: pad ? normalizePadName(pad) : '' });
  }
  sampleCalibration(pad);
  const raw = rawButtons(pad);
  rawValues = { axes: [...(pad?.axes || [])], buttons: {} };
  pad?.buttons?.forEach((button, index) => {
    const id = physicalButtonId(deviceLayout, index);
    if (id) rawValues.buttons[id] = Number(button?.value || 0);
  });
  if (raw.size || rawActivity(pad)) {
    setActiveInputDevice('controller', {
      viable: true,
      controllerFamily: settings.family === 'auto' ? controllerFamilyFromName(rawPadId || padName) : settings.family,
    });
  }
  for (const token of [...suppressedButtons]) if (!raw.has(token)) suppressedButtons.delete(token);
  const buttons = new Set([...raw].filter((token) => !suppressedButtons.has(token)));
  const { axes, actions } = actionsFor(pad, menuContext, buttons, modalActions, independentMotion);
  updateLastState(pad, buttons, axes, actions);

  if (capture) {
    const fresh = [...raw].find((token) => !previousButtons.has(token) && CONTROLLER_BUTTON_IDS.includes(token));
    previousButtons = raw;
    previous = new Set();
    if (fresh) {
      const pending = capture;
      capture = null;
      suppressedButtons.add(fresh);
      pending.done?.({ kind: 'button', id: fresh });
    }
    return;
  }

  const now = performance.now();
  for (const action of actions) {
    if (!previous.has(action)) {
      onPress(action, false);
      repeatedAt.set(action, now + 360);
    } else if (menuContext && REPEATABLE.has(action) && now >= (repeatedAt.get(action) || Infinity)) {
      onPress(action, true);
      repeatedAt.set(action, now + 115);
    }
  }
  for (const action of previous) {
    if (!actions.has(action)) {
      onRelease(action);
      repeatedAt.delete(action);
    }
  }
  previous = actions;
  previousButtons = buttons;
}

export function setControllerNavigatorForTest(nav) {
  navigatorOverride = nav || null;
}

export function controllerResetForTest() {
  previous.clear();
  previousButtons.clear();
  repeatedAt.clear();
  suppressedButtons.clear();
  padName = '';
  activePadId = '';
  activePadIndex = -1;
  capture = null;
  navigatorOverride = null;
  settings = normalizeControllerSettings();
  setBindingControllerSettings(settings);
  lastState = emptyState();
}
