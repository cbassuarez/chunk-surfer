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

// The shell, as a half-profile that gets mirrored.
//
// It was a hand-written blob before, and it read as a blob. A gamepad has four
// features that make the silhouette legible and it had none of them: a wide
// domed top, sides that bulge past the top corners, grips that sweep down AND
// outward before turning back in, and a concave waist between them. These are
// the right-hand points from top-centre round to bottom-centre; mirroring is
// what guarantees the two halves match, which hand-authoring never did.
export const PAD_PROFILE = Object.freeze([
  [50, 32.0], [66, 30.5], [78, 31.5], [85, 35.0], [88.5, 42.0],
  [89.0, 50.5], [87.5, 60.0], [84.0, 69.0], [78.5, 76.5], [72.0, 79.0],
  [66.5, 76.0], [63.0, 71.0], [59.5, 67.5], [55.0, 66.2], [50, 66],
].map(Object.freeze));

// The closed outline in the 100x86 drawing box, left half derived from the
// right so the pad cannot go lopsided.
export const PAD_OUTLINE = Object.freeze([
  ...PAD_PROFILE,
  ...PAD_PROFILE.slice(1, -1).reverse().map(([x, y]) => Object.freeze([100 - x, y])),
]);

// Real Xbox arrangement: left stick high-left, d-pad below it, face cluster
// high-right, right stick below that. Every element is laid out so nothing
// overlaps at any scale — the first table stacked the left stick on top of the
// d-pad and drew the stick a second time somewhere else entirely.
export const BUTTON_POSITIONS = Object.freeze({
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
export function controllerCalloutModel({ actions = [], selectedAction = null } = {}) {
  const byButton = new Map();
  for (const action of actions) {
    if (!String(action.group || '').startsWith('WORLD')) continue;
    const id = action.binding?.id;
    const pos = id ? BUTTON_POSITIONS[id] : null;
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
  const buttons = Object.entries(BUTTON_POSITIONS).map(([id, pos]) => {
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
    selectedAction,
    captureAction,
    activeButton,
    actions,
    options,
    buttons,
    sticks,
    // Stacked has no room either side of the pad, and the action list sits
    // directly beneath it there anyway.
    callouts: mode === 'split' ? controllerCalloutModel({ actions, selectedAction }) : [],
    live: !!heldButtons,
  };
}
