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

const MOVE = Object.freeze({ up: 'move_up', down: 'move_down', left: 'move_left', right: 'move_right' });
const REPEATABLE = new Set([...Object.values(MOVE), 'tabPrev', 'tabNext']);
const WORLD_ACTIONS = ['quiet', 'light', 'bag', 'recorder', 'interact', 'playback', 'menu'];
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
  17: 'touchpad',
});

let previous = new Set();
let previousButtons = new Set();
let repeatedAt = new Map();
let suppressedButtons = new Set();
let padName = '';
let activePadId = '';
let activePadIndex = -1;
let capture = null;
let settings = normalizeControllerSettings(controllerSettings());
let navigatorOverride = null;
let lastState = emptyState();

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

function buttonPressed(button, threshold) {
  return !!button?.pressed || Number(button?.value || 0) >= threshold;
}

function normalizePadName(pad) {
  return String(pad?.id || 'GAMEPAD').replace(/\s*\([^)]*\)\s*/g, ' ').trim().slice(0, 36);
}

function rawButtons(pad, threshold = settings.triggerThreshold) {
  const out = new Set();
  pad?.buttons?.forEach((button, index) => {
    const id = BUTTON_BY_INDEX[index];
    if (id && buttonPressed(button, threshold)) out.add(id);
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
  const lookSign = settings.invertLookY ? -1 : 1;
  const lookY = -(Number(pad.axes?.[3]) || 0) * lookSign;
  const sensitivity = settings.lookSensitivity;
  return {
    moveX: clampAxis(deadzone(Number(pad.axes?.[0]) || 0, settings.moveDeadzone)),
    moveY: clampAxis(deadzone(-(Number(pad.axes?.[1]) || 0), settings.moveDeadzone)),
    turnX: clampAxis(deadzone(Number(pad.axes?.[2]) || 0, settings.lookDeadzone) * sensitivity),
    lookY: clampAxis(deadzone(lookY, settings.lookDeadzone) * sensitivity),
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

function actionPressed(action, buttons) {
  const binding = controllerActionBinding(action);
  return binding?.kind === 'button' && buttons.has(binding.id);
}

function actionsFor(pad, menuContext, buttons = rawButtons(pad), extraActions = []) {
  const axes = axesFor(pad);
  const actions = movementFromAxes(axes, buttons);
  const buttonActions = menuContext
    ? [...new Set([...MENU_ACTIONS, ...extraActions])]
    : WORLD_ACTIONS;
  for (const action of buttonActions) {
    if (actionPressed(action, buttons)) actions.add(action);
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
  setActiveInputDevice('keyboard', { viable: false });
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
export function controllerSnapshot() { return { ...lastState, buttons: new Set(lastState.buttons), pressed: new Set(lastState.pressed), released: new Set(lastState.released), actions: new Set(lastState.actions) }; }
export function controllerMotionAxes() { return lastState.connected && settings.enabled ? { ...lastState.axes } : { moveX: 0, moveY: 0, turnX: 0, lookY: 0 }; }

export function beginControllerRemap(action, done) {
  if (!action) return false;
  capture = { action, done };
  return true;
}

export function cancelControllerRemap() { capture = null; }

export function gamepadTick({ menuContext = false, modalActions = [], onPress = () => {}, onRelease = () => {} } = {}) {
  settings = normalizeControllerSettings(controllerSettings());
  const list = pads();
  const pad = selectPad(list);
  if (!pad) {
    releaseAll(onRelease);
    return;
  }
  padName = normalizePadName(pad);
  const raw = rawButtons(pad);
  if (raw.size || rawActivity(pad)) {
    setActiveInputDevice('controller', {
      viable: true,
      controllerFamily: settings.family === 'auto' ? controllerFamilyFromName(padName) : settings.family,
    });
  }
  for (const token of [...suppressedButtons]) if (!raw.has(token)) suppressedButtons.delete(token);
  const buttons = new Set([...raw].filter((token) => !suppressedButtons.has(token)));
  const { axes, actions } = actionsFor(pad, menuContext, buttons, modalActions);
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
