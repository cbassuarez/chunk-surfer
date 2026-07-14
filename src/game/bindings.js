//
//  bindings.js
//
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Binding labels and the persistent controller map. Keyboard bindings remain
// authored (the game uses code + key for layout/remote-input tolerance); pad
// controls are normalized to the browser Standard Gamepad layout before they
// are persisted or remapped.

const DEFAULT_BINDINGS = Object.freeze({
  move: 'WASD / ARROWS',
  select: 'UP / DOWN',
  set: 'LEFT / RIGHT',
  quiet: 'SHIFT',
  light: 'F',
  bag: 'B',
  recorder: 'R',
  interact: 'E',
  mark: 'SPACE',
  playback: 'P',
  menu: 'ESC',
  confirm: 'ENTER / SPACE',
  continue: 'SPACE',
  allow: 'Y',
  deny: 'N',
  start: 'ENTER',
  read: 'ENTER',
  back: 'ESC',
  tabPrev: 'Q',
  tabNext: 'E',
});

export const CONTROLLER_BUTTON_IDS = Object.freeze([
  'south', 'east', 'west', 'north',
  'leftShoulder', 'rightShoulder', 'leftTrigger', 'rightTrigger',
  'view', 'menu', 'leftStick', 'rightStick',
  'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight',
  'touchpad',
]);

export const LEGACY_BUTTON_TO_ID = Object.freeze({
  button0: 'south',
  button1: 'east',
  button2: 'west',
  button3: 'north',
  button4: 'leftShoulder',
  button5: 'rightShoulder',
  button6: 'leftTrigger',
  button7: 'rightTrigger',
  button8: 'view',
  button9: 'menu',
  button10: 'leftStick',
  button11: 'rightStick',
  button12: 'dpadUp',
  button13: 'dpadDown',
  button14: 'dpadLeft',
  button15: 'dpadRight',
  button17: 'touchpad',
});

const ID_TO_LEGACY_BUTTON = Object.freeze(
  Object.fromEntries(Object.entries(LEGACY_BUTTON_TO_ID).map(([token, id]) => [id, token])),
);

export const CONTROLLER_FAMILIES = Object.freeze(['auto', 'xbox', 'playstation', 'nintendo', 'generic']);

export const CONTROLLER_BINDING_ACTIONS = Object.freeze([
  'quiet', 'light', 'bag', 'recorder', 'interact', 'playback', 'menu',
  'confirm', 'back', 'tabPrev', 'tabNext',
]);

const WORLD_GROUP = Object.freeze(['quiet', 'light', 'bag', 'recorder', 'interact', 'playback', 'menu']);
const UI_GROUP = Object.freeze(['confirm', 'back', 'menu', 'tabPrev', 'tabNext']);
const PAD_GROUPS = Object.freeze([WORLD_GROUP, UI_GROUP]);

export const DEFAULT_CONTROLLER_BINDINGS = Object.freeze({
  quiet: { kind: 'button', id: 'leftShoulder' },
  light: { kind: 'button', id: 'north' },
  bag: { kind: 'button', id: 'west' },
  recorder: { kind: 'button', id: 'rightTrigger' },
  interact: { kind: 'button', id: 'south' },
  playback: { kind: 'button', id: 'east' },
  menu: { kind: 'button', id: 'menu' },
  confirm: { kind: 'button', id: 'south' },
  back: { kind: 'button', id: 'east' },
  tabPrev: { kind: 'button', id: 'leftShoulder' },
  tabNext: { kind: 'button', id: 'rightShoulder' },
});

export const DEFAULT_CONTROLLER_SETTINGS = Object.freeze({
  enabled: true,
  activePadId: null,
  lookSensitivity: 1,
  moveDeadzone: 0.12,
  lookDeadzone: 0.16,
  triggerThreshold: 0.55,
  invertLookY: false,
  family: 'auto',
  bindings: DEFAULT_CONTROLLER_BINDINGS,
});

const ACTION_LABELS = Object.freeze({
  quiet: 'QUIET',
  light: 'LIGHT',
  bag: 'BAG',
  recorder: 'RECORDER',
  interact: 'INTERACT',
  playback: 'PLAYBACK',
  menu: 'MENU / PAUSE',
  confirm: 'CONFIRM',
  back: 'BACK',
  tabPrev: 'PREV SECTION',
  tabNext: 'NEXT SECTION',
});

const FAMILY_BUTTON_LABELS = Object.freeze({
  xbox: {
    south: 'A', east: 'B', west: 'X', north: 'Y',
    leftShoulder: 'LB', rightShoulder: 'RB', leftTrigger: 'LT', rightTrigger: 'RT',
    view: 'VIEW', menu: 'MENU', leftStick: 'L3', rightStick: 'R3',
    dpadUp: 'D-PAD UP', dpadDown: 'D-PAD DOWN', dpadLeft: 'D-PAD LEFT', dpadRight: 'D-PAD RIGHT',
    touchpad: 'TOUCHPAD',
  },
  playstation: {
    south: 'CROSS', east: 'CIRCLE', west: 'SQUARE', north: 'TRIANGLE',
    leftShoulder: 'L1', rightShoulder: 'R1', leftTrigger: 'L2', rightTrigger: 'R2',
    view: 'SHARE', menu: 'OPTIONS', leftStick: 'L3', rightStick: 'R3',
    dpadUp: 'D-PAD UP', dpadDown: 'D-PAD DOWN', dpadLeft: 'D-PAD LEFT', dpadRight: 'D-PAD RIGHT',
    touchpad: 'TOUCHPAD',
  },
  nintendo: {
    south: 'B', east: 'A', west: 'Y', north: 'X',
    leftShoulder: 'L', rightShoulder: 'R', leftTrigger: 'ZL', rightTrigger: 'ZR',
    view: 'MINUS', menu: 'PLUS', leftStick: 'L3', rightStick: 'R3',
    dpadUp: 'D-PAD UP', dpadDown: 'D-PAD DOWN', dpadLeft: 'D-PAD LEFT', dpadRight: 'D-PAD RIGHT',
    touchpad: 'CAPTURE',
  },
  generic: {
    south: 'SOUTH', east: 'EAST', west: 'WEST', north: 'NORTH',
    leftShoulder: 'L1', rightShoulder: 'R1', leftTrigger: 'L2', rightTrigger: 'R2',
    view: 'VIEW', menu: 'MENU', leftStick: 'L3', rightStick: 'R3',
    dpadUp: 'D-PAD UP', dpadDown: 'D-PAD DOWN', dpadLeft: 'D-PAD LEFT', dpadRight: 'D-PAD RIGHT',
    touchpad: 'TOUCHPAD',
  },
});

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
}

function normalizeButtonId(value) {
  const raw = String(value || '');
  const id = LEGACY_BUTTON_TO_ID[raw] || raw;
  return CONTROLLER_BUTTON_IDS.includes(id) ? id : null;
}

export function controllerFamilyFromName(name = '') {
  const id = String(name || '').toLowerCase();
  if (/xbox|xinput|microsoft/.test(id)) return 'xbox';
  if (/playstation|dualshock|dualsense|wireless controller|sony/.test(id)) return 'playstation';
  if (/switch|joy-con|joycon|nintendo|pro controller/.test(id)) return 'nintendo';
  return 'generic';
}

export function resolveControllerFamily(settings = {}, padName = '') {
  const family = CONTROLLER_FAMILIES.includes(settings?.family) ? settings.family : 'auto';
  return family === 'auto' ? controllerFamilyFromName(padName) : family;
}

function normalizeBinding(value, fallback) {
  const source = objectOr(value, null);
  const id = normalizeButtonId(source?.id ?? value);
  const fb = objectOr(fallback);
  return { kind: 'button', id: id || fb.id || 'south' };
}

export function legacyControllerBindings(value = {}) {
  const source = objectOr(value);
  const out = {};
  for (const action of CONTROLLER_BINDING_ACTIONS) {
    const id = normalizeButtonId(source[action]);
    if (id) out[action] = { kind: 'button', id };
  }
  return out;
}

export function normalizeControllerSettings(value = {}, legacyBindings = null) {
  const source = objectOr(value);
  const legacy = legacyBindings || (source.bindings ? null : source);
  const bindingSource = {
    ...legacyControllerBindings(legacy),
    ...objectOr(source.bindings),
  };
  const bindings = {};
  for (const action of CONTROLLER_BINDING_ACTIONS) {
    bindings[action] = normalizeBinding(bindingSource[action], DEFAULT_CONTROLLER_BINDINGS[action]);
  }
  return {
    enabled: source.enabled !== false,
    activePadId: typeof source.activePadId === 'string' && source.activePadId ? source.activePadId : null,
    lookSensitivity: clampNumber(source.lookSensitivity, DEFAULT_CONTROLLER_SETTINGS.lookSensitivity, 0.25, 2.5),
    moveDeadzone: clampNumber(source.moveDeadzone, DEFAULT_CONTROLLER_SETTINGS.moveDeadzone, 0, 0.6),
    lookDeadzone: clampNumber(source.lookDeadzone, DEFAULT_CONTROLLER_SETTINGS.lookDeadzone, 0, 0.7),
    triggerThreshold: clampNumber(source.triggerThreshold, DEFAULT_CONTROLLER_SETTINGS.triggerThreshold, 0.1, 0.95),
    invertLookY: !!source.invertLookY,
    family: CONTROLLER_FAMILIES.includes(source.family) ? source.family : 'auto',
    bindings,
  };
}

let controller = normalizeControllerSettings(DEFAULT_CONTROLLER_SETTINGS);
let activeInputDevice = 'keyboard';
let controllerViable = false;
let activeControllerFamily = 'generic';

const UI_CONTROLLER_LABELS = Object.freeze({
  move: 'LEFT STICK / D-PAD',
  look: 'RIGHT STICK',
  select: 'LEFT STICK / D-PAD',
  set: 'LEFT STICK / D-PAD',
  continue: 'SOUTH',
  allow: 'SOUTH',
  deny: 'EAST',
  start: 'SOUTH',
});

export function setControllerSettings(next = {}, legacy = null) {
  controller = normalizeControllerSettings(next, legacy);
  return controllerSettings();
}

export function patchControllerSettings(patch = {}) {
  controller = normalizeControllerSettings({ ...controller, ...objectOr(patch) });
  return controllerSettings();
}

export function resetControllerBindings() {
  controller = normalizeControllerSettings({
    ...controller,
    bindings: DEFAULT_CONTROLLER_BINDINGS,
  });
  return controllerBindings();
}

export function resetControllerSettings() {
  controller = normalizeControllerSettings(DEFAULT_CONTROLLER_SETTINGS);
  return controllerSettings();
}

export function setControllerBindings(next = {}) {
  controller = normalizeControllerSettings({ ...controller, bindings: legacyControllerBindings(next) || next }, next);
  return controllerBindings();
}

export function setControllerBinding(action, token) {
  if (!CONTROLLER_BINDING_ACTIONS.includes(action)) return false;
  const id = normalizeButtonId(token?.id ?? token);
  if (!id) return false;
  const bindings = { ...controller.bindings };
  const old = bindings[action] || DEFAULT_CONTROLLER_BINDINGS[action];
  for (const group of PAD_GROUPS) {
    if (!group.includes(action)) continue;
    const conflict = group.find((peer) => peer !== action && bindings[peer]?.id === id);
    if (conflict) bindings[conflict] = old;
  }
  bindings[action] = { kind: 'button', id };
  controller = normalizeControllerSettings({ ...controller, bindings });
  return true;
}

export function controllerSettings() {
  return {
    ...controller,
    bindings: Object.fromEntries(Object.entries(controller.bindings).map(([key, value]) => [key, { ...value }])),
  };
}

export function controllerBindings() {
  return Object.fromEntries(Object.entries(controller.bindings).map(([key, value]) => [key, { ...value }]));
}

export function controllerActionBinding(action) {
  return controller.bindings[action] || null;
}

export function controllerToken(action) {
  const binding = controllerActionBinding(action);
  return binding?.kind === 'button' ? binding.id : null;
}

export function controllerLegacyToken(action) {
  return ID_TO_LEGACY_BUTTON[controllerToken(action)] || null;
}

export function controllerButtonLabel(id, family = 'generic') {
  const resolved = CONTROLLER_FAMILIES.includes(family) && family !== 'auto' ? family : 'generic';
  return FAMILY_BUTTON_LABELS[resolved]?.[id] || FAMILY_BUTTON_LABELS.generic[id] || String(id || 'UNBOUND').toUpperCase();
}

export function controllerBindingLabel(action, family = 'generic') {
  if (action === 'move') return 'LEFT STICK / D-PAD';
  if (action === 'look') return 'RIGHT STICK';
  return controllerButtonLabel(controllerToken(action), family);
}

export function controllerActionLabel(action) {
  return ACTION_LABELS[action] || String(action || '').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

export function bindingLabel(action) {
  return DEFAULT_BINDINGS[action] || String(action || '').toUpperCase();
}

function controllerPromptLabel(action, family = activeControllerFamily) {
  if (action === 'move') return 'LEFT STICK / D-PAD';
  if (action === 'look') return 'RIGHT STICK';
  if (action === 'select') return 'LEFT STICK / D-PAD';
  if (action === 'set') return 'LEFT STICK / D-PAD';
  if (action === 'continue' || action === 'allow' || action === 'start') return controllerButtonLabel(controllerToken('confirm') || 'south', family);
  if (action === 'deny') return controllerButtonLabel(controllerToken('back') || 'east', family);
  return controllerBindingLabel(action, family);
}

export function setActiveInputDevice(device, { controllerFamily = null, viable = null } = {}) {
  if (viable != null) controllerViable = !!viable;
  if (controllerFamily) activeControllerFamily = controllerFamily;
  if (device === 'controller') {
    if (controllerViable) activeInputDevice = 'controller';
  } else if (device === 'keyboard') {
    activeInputDevice = 'keyboard';
  }
  return activeInputDevice;
}

export function activeInputPromptDevice() {
  return activeInputDevice === 'controller' && controllerViable ? 'controller' : 'keyboard';
}

export function inputPromptLabel(action, { device = activeInputPromptDevice(), family = activeControllerFamily } = {}) {
  return device === 'controller' ? controllerPromptLabel(action, family) : bindingLabel(action);
}

export function inputPrompt(action, options = {}) {
  return `[${inputPromptLabel(action, options)}]`;
}

export function promptLine(parts = [], options = {}) {
  return parts.map((part) => {
    if (!part) return '';
    if (typeof part === 'string') return part;
    return `${inputPrompt(part.action, options)}${part.label ? ` ${part.label}` : ''}`;
  }).filter(Boolean).join(options.separator || ' · ');
}

export function formatBindingTip(text) {
  return String(text || '').replace(/\{([a-zA-Z0-9_-]+)\}/g, (_, action) => inputPromptLabel(action));
}
