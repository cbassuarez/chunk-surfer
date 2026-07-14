import {
  CONTROLLER_BINDING_ACTIONS,
  controllerActionLabel,
  controllerBindingLabel,
  controllerButtonLabel,
  resolveControllerFamily,
} from './bindings.js';

export const CONTROLLER_REMAP_ACTIONS = Object.freeze([
  { id: 'interact', group: 'WORLD' },
  { id: 'recorder', group: 'WORLD' },
  { id: 'light', group: 'WORLD' },
  { id: 'quiet', group: 'WORLD' },
  { id: 'bag', group: 'WORLD' },
  { id: 'playback', group: 'WORLD' },
  { id: 'menu', group: 'WORLD / UI' },
  { id: 'confirm', group: 'UI' },
  { id: 'back', group: 'UI' },
  { id: 'tabPrev', group: 'UI' },
  { id: 'tabNext', group: 'UI' },
]);

export const BUTTON_POSITIONS = Object.freeze({
  south: { x: 72, y: 62, r: 4.6 },
  east: { x: 79, y: 55, r: 4.6 },
  west: { x: 65, y: 55, r: 4.6 },
  north: { x: 72, y: 48, r: 4.6 },
  leftShoulder: { x: 27, y: 22, w: 22, h: 7 },
  rightShoulder: { x: 61, y: 22, w: 22, h: 7 },
  leftTrigger: { x: 27, y: 12, w: 22, h: 7 },
  rightTrigger: { x: 61, y: 12, w: 22, h: 7 },
  view: { x: 43, y: 48, r: 3.2 },
  menu: { x: 57, y: 48, r: 3.2 },
  leftStick: { x: 33, y: 61, r: 7 },
  rightStick: { x: 57, y: 69, r: 7 },
  dpadUp: { x: 25, y: 45, w: 5, h: 6 },
  dpadDown: { x: 25, y: 56, w: 5, h: 6 },
  dpadLeft: { x: 19, y: 51, w: 6, h: 5 },
  dpadRight: { x: 30, y: 51, w: 6, h: 5 },
  touchpad: { x: 50, y: 37, w: 16, h: 7 },
});

export function controllerLayoutMode({ width = 960, height = 540 } = {}) {
  return Number(width) < 760 || Number(height) < 460 ? 'stacked' : 'split';
}

export function controllerDiagramModel({
  width = 960,
  height = 540,
  settings = {},
  selectedAction = 'interact',
  captureAction = null,
  padName = '',
} = {}) {
  const family = resolveControllerFamily(settings, padName);
  const bindings = settings?.bindings || {};
  const activeButton = bindings[selectedAction]?.id || null;
  const captureButton = bindings[captureAction]?.id || null;
  const mode = controllerLayoutMode({ width, height });
  const actions = CONTROLLER_REMAP_ACTIONS.filter((entry) => CONTROLLER_BINDING_ACTIONS.includes(entry.id))
    .map((entry) => ({
      ...entry,
      label: controllerActionLabel(entry.id),
      binding: bindings[entry.id] || null,
      bindingLabel: controllerBindingLabel(entry.id, family),
      selected: entry.id === selectedAction,
      capturing: entry.id === captureAction,
    }));
  const buttons = Object.entries(BUTTON_POSITIONS).map(([id, pos]) => ({
    id,
    label: controllerButtonLabel(id, family),
    pos,
    active: id === activeButton,
    captureTarget: id === captureButton,
  }));
  return {
    mode,
    family,
    selectedAction,
    captureAction,
    activeButton,
    actions,
    buttons,
  };
}
