import {
  CONTROLLER_BINDING_ACTIONS,
  CONTROLLER_FAMILIES,
  controllerActionLabel,
  controllerBindingLabel,
  controllerButtonLabel,
  resolveControllerFamily,
} from './bindings.js';
import { padGlyphText } from '../render/pad-glyphs.js';

export const CONTROLLER_REMAP_ACTIONS = Object.freeze([
  { id: 'interact', group: 'WORLD' },
  { id: 'recorder', group: 'WORLD' },
  { id: 'radio', group: 'WORLD' },
  { id: 'light', group: 'WORLD' },
  { id: 'run', group: 'WORLD' },
  { id: 'bag', group: 'WORLD' },
  { id: 'playback', group: 'WORLD' },
  { id: 'menu', group: 'WORLD / UI' },
  { id: 'confirm', group: 'UI' },
  { id: 'back', group: 'UI' },
  { id: 'tabPrev', group: 'UI' },
  { id: 'tabNext', group: 'UI' },
]);

// One silhouette and one layout per family, so the diagram draws the pad the
// player is holding instead of one Xbox shape relabelled for everyone.
//
// Each outline is the right-hand half from top-centre round to bottom-centre;
// mirroring is what guarantees the two halves match, which hand-authoring
// never did. The shapes come from the hardware's own proportions: Xbox's
// domed top with deep asymmetric grips, PlayStation's slimmer symmetric slab
// with the touchpad shelf, and the Switch Pro's wide flat wing.
const PROFILE_XBOX = Object.freeze([
  [50, 32.0], [66, 30.5], [78, 31.5], [85, 35.0], [88.5, 42.0],
  [89.0, 50.5], [87.5, 60.0], [84.0, 69.0], [78.5, 76.5], [72.0, 79.0],
  [66.5, 76.0], [63.0, 71.0], [59.5, 67.5], [55.0, 66.2], [50, 66],
].map(Object.freeze));
const PROFILE_PLAYSTATION = Object.freeze([
  [50, 26.0], [64, 24.0], [75, 25.5], [82, 30.5], [85.5, 39.0],
  [86.5, 51.0], [85.0, 62.5], [81.5, 71.5], [75.5, 77.0], [68.5, 78.5],
  [64.5, 75.0], [62.0, 70.0], [58.5, 67.0], [54.0, 66.2], [50, 66],
].map(Object.freeze));
const PROFILE_NINTENDO = Object.freeze([
  [50, 24.0], [65, 22.0], [77, 23.5], [84, 28.5], [86.5, 36.5],
  [86.5, 46.5], [85.0, 55.5], [82.0, 63.0], [77.0, 69.0], [71.0, 72.5],
  [67.0, 70.5], [64.0, 66.5], [59.5, 64.5], [54.5, 63.5], [50, 63],
].map(Object.freeze));
const PROFILE_GENERIC = PROFILE_XBOX;

function mirroredOutline(profile) {
  return Object.freeze([
    ...profile,
    ...profile.slice(1, -1).reverse().map(([x, y]) => Object.freeze([100 - x, y])),
  ]);
}

export const PAD_OUTLINES = Object.freeze({
  xbox: mirroredOutline(PROFILE_XBOX),
  playstation: mirroredOutline(PROFILE_PLAYSTATION),
  nintendo: mirroredOutline(PROFILE_NINTENDO),
  generic: mirroredOutline(PROFILE_GENERIC),
});

// Real arrangements, per family. Xbox: left stick high-left, d-pad below it,
// face cluster high-right, right stick below that. PlayStation: both sticks
// low and level, d-pad and face cluster high, the touchpad across the shelf
// between them. Switch Pro: left stick high-centre, d-pad below it, face
// cluster mirrored on the right, the two menu buttons on the lower shelf.
const LAYOUT_XBOX = Object.freeze({
  north: { x: 72, y: 37.6, r: 4.3 },
  west: { x: 64.6, y: 45, r: 4.3 },
  east: { x: 79.4, y: 45, r: 4.3 },
  south: { x: 72, y: 52.4, r: 4.3 },
  leftShoulder: { x: 30, y: 21, w: 20, h: 6.4 },
  rightShoulder: { x: 70, y: 21, w: 20, h: 6.4 },
  leftTrigger: { x: 30, y: 11.5, w: 20, h: 6.4 },
  rightTrigger: { x: 70, y: 11.5, w: 20, h: 6.4 },
  touchpad: { x: 50, y: 34.5, w: 12, h: 4.2 },
  view: { x: 44, y: 41, r: 2.8 },
  menu: { x: 56, y: 41, r: 2.8 },
  leftStick: { x: 29, y: 43, r: 6 },
  rightStick: { x: 58, y: 57, r: 6 },
  dpadUp: { x: 38, y: 54, w: 4.6, h: 5.2 },
  dpadDown: { x: 38, y: 62, w: 4.6, h: 5.2 },
  dpadLeft: { x: 33, y: 58, w: 5.2, h: 4.6 },
  dpadRight: { x: 43, y: 58, w: 5.2, h: 4.6 },
});
const LAYOUT_PLAYSTATION = Object.freeze({
  north: { x: 69.6, y: 36.4, r: 4.1 },
  west: { x: 62.4, y: 42.8, r: 4.1 },
  east: { x: 76.8, y: 42.8, r: 4.1 },
  south: { x: 69.6, y: 49.2, r: 4.1 },
  leftShoulder: { x: 30, y: 17, w: 19, h: 6 },
  rightShoulder: { x: 70, y: 17, w: 19, h: 6 },
  leftTrigger: { x: 30, y: 8, w: 19, h: 6 },
  rightTrigger: { x: 70, y: 8, w: 19, h: 6 },
  touchpad: { x: 50, y: 32.2, w: 14.5, h: 5 },
  view: { x: 42.2, y: 27.6, r: 2.2 },
  menu: { x: 57.8, y: 27.6, r: 2.2 },
  leftStick: { x: 31.5, y: 52.5, r: 5.7 },
  rightStick: { x: 68.5, y: 52.5, r: 5.7 },
  dpadUp: { x: 30, y: 40.4, w: 4.4, h: 5 },
  dpadDown: { x: 30, y: 48, w: 4.4, h: 5 },
  dpadLeft: { x: 25.4, y: 44.2, w: 5, h: 4.4 },
  dpadRight: { x: 34.6, y: 44.2, w: 5, h: 4.4 },
});
const LAYOUT_NINTENDO = Object.freeze({
  north: { x: 65.6, y: 37.4, r: 3.9 },
  west: { x: 58.8, y: 43.4, r: 3.9 },
  east: { x: 72.4, y: 43.4, r: 3.9 },
  south: { x: 65.6, y: 49.4, r: 3.9 },
  leftShoulder: { x: 29, y: 19.5, w: 21, h: 6 },
  rightShoulder: { x: 71, y: 19.5, w: 21, h: 6 },
  leftTrigger: { x: 29, y: 10.5, w: 21, h: 6 },
  rightTrigger: { x: 71, y: 10.5, w: 21, h: 6 },
  touchpad: { x: 50, y: 31, w: 11, h: 4 },
  view: { x: 46.2, y: 46.6, r: 2.4 },
  menu: { x: 53.8, y: 46.6, r: 2.4 },
  leftStick: { x: 34.5, y: 40, r: 5.8 },
  rightStick: { x: 65.5, y: 55.5, r: 5.8 },
  dpadUp: { x: 34.5, y: 57, w: 4.4, h: 4.9 },
  dpadDown: { x: 34.5, y: 64.4, w: 4.4, h: 4.9 },
  dpadLeft: { x: 30, y: 60.7, w: 4.9, h: 4.4 },
  dpadRight: { x: 39, y: 60.7, w: 4.9, h: 4.4 },
});
const LAYOUT_GENERIC = LAYOUT_XBOX;

// The original exports, kept under their old names: the Xbox layout is the
// baseline the older callers and tests still read.
export const PAD_PROFILE = PROFILE_XBOX;
export const PAD_OUTLINE = PAD_OUTLINES.xbox;
export const BUTTON_POSITIONS = Object.freeze(LAYOUT_XBOX);

export const PAD_LAYOUTS = Object.freeze({
  xbox: Object.freeze({ outline: PAD_OUTLINES.xbox, buttons: LAYOUT_XBOX }),
  playstation: Object.freeze({ outline: PAD_OUTLINES.playstation, buttons: LAYOUT_PLAYSTATION }),
  nintendo: Object.freeze({ outline: PAD_OUTLINES.nintendo, buttons: LAYOUT_NINTENDO }),
  generic: Object.freeze({ outline: PAD_OUTLINES.generic, buttons: LAYOUT_GENERIC }),
});

export function padLayoutFor(family) {
  return PAD_LAYOUTS[family] || PAD_LAYOUTS.generic;
}

// How far a fully deflected stick travels, in SVG units. Small enough to stay
// inside its own collar so the mark reads as a stick and not a stray dot.
const STICK_THROW = 2.6;

// D-pad arms and the share/capture bar have no silkscreen legend of their own,
// so the diagram supplies one that fits the shape.
const DPAD_ARROWS = Object.freeze({
  dpadUp: '▲', dpadDown: '▼', dpadLeft: '◀', dpadRight: '▶',
});
const EXTRA_SHORT = Object.freeze({
  xbox: 'SHR', playstation: 'PAD', nintendo: 'CAP', generic: 'EXT',
});

// Short names for the layout readout. "PLAYSTATION" does not fit a value
// column next to a pair of adjust arrows, and a clipped "PLAYSTAT" is worse
// than a short name chosen on purpose.
const FAMILY_SHORT = Object.freeze({
  auto: 'AUTO', xbox: 'XBOX', playstation: 'PS', nintendo: 'SWITCH', generic: 'GENERIC',
});

// Callout leaders run out into margins either side of the pad, so the drawing
// box is wider than the pad box. The pad itself stays inside 0..100 x 0..86.
export const PAD_VIEWBOX = '-30 0 162 86';

// The band callout labels are distributed down, and the x each column's text
// anchors to. `knee` is where the leader turns to run flat into the label.
const CALLOUT_BAND = Object.freeze({ top: 12, bottom: 78 });
const CALLOUT_TEXT_X = Object.freeze({ left: -6, right: 106 });
const CALLOUT_KNEE = 5;

function clampUnit(value) {
  return Math.max(-1, Math.min(1, Number(value) || 0));
}

export function diagramGlyph(id, family = 'generic') {
  if (DPAD_ARROWS[id]) return DPAD_ARROWS[id];
  if (id === 'touchpad') return EXTRA_SHORT[family] || EXTRA_SHORT.generic;
  return padGlyphText(id, family);
}

// Leader lines from each button out to what it does, the way a console's own
// pad screen labels its hardware.
//
// Only WORLD actions get a leader. CONFIRM, BACK and the section keys are
// conventions rather than discoveries — they share buttons with world actions,
// so drawing them too would stack two leaders on one anchor and turn every
// label into "INTERACT / CONFIRM". The action list on the right still lists
// every binding; this is the map, not the index.
export function controllerCalloutModel({ actions = [], selectedAction = null, buttons = BUTTON_POSITIONS } = {}) {
  const byButton = new Map();
  for (const action of actions) {
    if (!String(action.group || '').startsWith('WORLD')) continue;
    const id = action.binding?.id;
    const pos = id ? buttons[id] : null;
    if (!pos) continue;
    if (!byButton.has(id)) byButton.set(id, { id, pos, labels: [], selected: false });
    const entry = byButton.get(id);
    entry.labels.push(action.label);
    if (action.id === selectedAction) entry.selected = true;
  }

  const sides = { left: [], right: [] };
  for (const entry of byButton.values()) sides[entry.pos.x < 50 ? 'left' : 'right'].push(entry);

  const out = [];
  for (const side of ['left', 'right']) {
    const list = sides[side].sort((a, b) => a.pos.y - b.pos.y);
    const span = CALLOUT_BAND.bottom - CALLOUT_BAND.top;
    list.forEach((entry, i) => {
      // One label per side sits level with its own button, so the leader is a
      // straight rule rather than a pointless dog-leg.
      const labelY = list.length === 1
        ? entry.pos.y
        : CALLOUT_BAND.top + (span * i) / (list.length - 1);
      const half = 'r' in entry.pos ? entry.pos.r : entry.pos.w / 2;
      const textX = CALLOUT_TEXT_X[side];
      out.push({
        id: entry.id,
        side,
        selected: entry.selected,
        label: entry.labels.join(' / '),
        anchor: { x: side === 'left' ? entry.pos.x - half : entry.pos.x + half, y: entry.pos.y },
        knee: { x: side === 'left' ? textX + CALLOUT_KNEE : textX - CALLOUT_KNEE, y: labelY },
        text: { x: textX, y: labelY },
      });
    });
  }
  return out;
}

// The stacked layout used to trigger below 760x460 — smaller than the 960x600
// safe minimum the viewport guard enforces, so the branch could never actually
// run. These thresholds sit just above that floor: at the smallest supported
// window the split columns leave the diagram about 200px tall, which is not a
// diagram. Stack instead.
export function controllerLayoutMode({ width = 960, height = 540 } = {}) {
  return Number(width) < 900 || Number(height) < 640 ? 'stacked' : 'split';
}

export function controllerDiagramModel({
  width = 960,
  height = 540,
  settings = {},
  selectedAction = 'interact',
  captureAction = null,
  padName = '',
  // Live hardware state. With it the screen doubles as a hardware test: the
  // fastest way for a player to see a mis-detected or half-broken pad is to
  // press a button and watch whether the right element lights.
  heldButtons = null,
  axes = null,
  raw = null,
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
      // A9: read the binding from the SAME source the diagram highlight uses.
      // This used to call the module-global label lookup while `activeButton`
      // above read the passed-in settings, so the two could disagree.
      bindingLabel: bindings[entry.id]?.id
        ? controllerButtonLabel(bindings[entry.id].id, family)
        : controllerBindingLabel(entry.id, family),
      selected: entry.id === selectedAction,
      capturing: entry.id === captureAction,
    }));
  // Rows that adjust the pad itself rather than remap an action. They sit above
  // the bindings because a wrong family makes every binding label below them
  // lie, so it is the first thing a player with a clone pad needs to reach.
  const storedFamily = CONTROLLER_FAMILIES.includes(settings?.family) ? settings.family : 'auto';
  const options = [{
    id: 'family',
    kind: 'option',
    group: 'PAD',
    label: 'LAYOUT',
    value: storedFamily === 'auto'
      ? `AUTO · ${FAMILY_SHORT[family] || family.toUpperCase()}`
      : (FAMILY_SHORT[storedFamily] || storedFamily.toUpperCase()),
    stored: storedFamily,
    selected: selectedAction === 'family',
  }];
  const sticks = {
    left: { x: Number(axes?.moveX) || 0, y: -(Number(axes?.moveY) || 0) },
    right: { x: Number(axes?.turnX) || 0, y: -(Number(axes?.lookY) || 0) },
  };
  const layout = padLayoutFor(family);
  const buttons = Object.entries(layout.buttons).map(([id, pos]) => {
    // A stick physically moves, so its element moves — the deflection lands on
    // the same circle the player is looking at rather than on a second phantom
    // stick drawn somewhere else.
    const stick = id === 'leftStick' ? sticks.left : id === 'rightStick' ? sticks.right : null;
    return {
      id,
      // The action list carries the full part name ("D-PAD UP"); the faceplate
      // carries what is silkscreened on the plastic. Printing the long name in
      // a 5-unit circle is what made the old diagram unreadable.
      label: diagramGlyph(id, family),
      fullLabel: controllerButtonLabel(id, family),
      pos,
      offset: stick
        ? { x: clampUnit(stick.x) * STICK_THROW, y: clampUnit(stick.y) * STICK_THROW }
        : null,
      collar: stick ? pos.r * 1.42 : 0,
      active: id === activeButton,
      captureTarget: id === captureButton,
      held: !!heldButtons?.has?.(id),
    };
  });
  return {
    mode,
    family,
    outline: layout.outline,
    selectedAction,
    captureAction,
    activeButton,
    actions,
    options,
    buttons,
    sticks,
    // Stacked has no room either side of the pad, and the action list sits
    // directly beneath it there anyway.
    callouts: mode === 'split' ? controllerCalloutModel({ actions, selectedAction, buttons: layout.buttons }) : [],
    live: !!heldButtons,
    raw,
  };
}
