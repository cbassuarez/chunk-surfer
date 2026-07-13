// Native Gamepad API input. The module emits the same action edge/hold model as
// the keyboard, so scenes, walking, recording and pause retain one authority.

import { controllerToken } from './bindings.js';

const MOVE = Object.freeze({ up: 'move_up', down: 'move_down', left: 'move_left', right: 'move_right' });
const REPEATABLE = new Set(Object.values(MOVE));
const WORLD_ACTIONS = ['quiet', 'light', 'bag', 'recorder', 'interact', 'playback', 'menu'];
const MENU_ACTIONS = ['confirm', 'back', 'menu'];
const DEADZONE = 0.55;

let previous = new Set();
let previousButtons = new Set();
let repeatedAt = new Map();
let suppressedButtons = new Set();
let padName = '';
let capture = null;

function pads() {
  try { return [...(navigator.getGamepads?.() || [])].filter(Boolean); }
  catch (_) { return []; }
}

function rawButtons(pad) {
  const out = new Set();
  pad.buttons?.forEach((b, i) => { if (b?.pressed || Number(b?.value) > 0.55) out.add(`button${i}`); });
  return out;
}

function movement(pad, buttons) {
  const x = Number(pad.axes?.[0]) || 0, y = Number(pad.axes?.[1]) || 0;
  const out = new Set();
  if (y < -DEADZONE || buttons.has('button12')) out.add(MOVE.up);
  if (y > DEADZONE || buttons.has('button13')) out.add(MOVE.down);
  if (x < -DEADZONE || buttons.has('button14')) out.add(MOVE.left);
  if (x > DEADZONE || buttons.has('button15')) out.add(MOVE.right);
  return out;
}

function actionsFor(pad, menuContext, buttons = rawButtons(pad)) {
  const actions = movement(pad, buttons);
  for (const action of (menuContext ? MENU_ACTIONS : WORLD_ACTIONS)) {
    const token = controllerToken(action);
    if (token && buttons.has(token)) actions.add(action);
  }
  return { buttons, actions };
}

export function controllerName() { return padName || 'NO CONTROLLER'; }
export function controllerConnected() { return !!padName; }
export function controllerRemapAction() { return capture?.action || null; }

export function beginControllerRemap(action, done) {
  capture = { action, done };
  return true;
}

export function cancelControllerRemap() { capture = null; }

export function gamepadTick({ menuContext = false, onPress = () => {}, onRelease = () => {} } = {}) {
  const pad = pads()[0];
  if (!pad) {
    for (const action of previous) onRelease(action);
    previous.clear(); previousButtons.clear(); repeatedAt.clear(); suppressedButtons.clear(); padName = '';
    return;
  }
  padName = String(pad.id || 'GAMEPAD').replace(/\s*\([^)]*\)\s*/g, ' ').trim().slice(0, 28);
  const raw = rawButtons(pad);
  for(const token of [...suppressedButtons])if(!raw.has(token))suppressedButtons.delete(token);
  const buttons=new Set([...raw].filter((token)=>!suppressedButtons.has(token)));
  const { actions } = actionsFor(pad, menuContext, buttons);

  if (capture) {
    const fresh = [...raw].find((token) => !previousButtons.has(token));
    previousButtons = raw;
    if (fresh) {
      const pending = capture; capture = null;
      suppressedButtons.add(fresh);
      pending.done?.(fresh);
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
    if (!action.startsWith('raw:') && !actions.has(action)) {
      onRelease(action);
      repeatedAt.delete(action);
    }
  }
  previous = actions;
  previousButtons = buttons;
}

export function controllerResetForTest() {
  previous.clear(); previousButtons.clear(); repeatedAt.clear(); suppressedButtons.clear(); padName = ''; capture = null;
}
