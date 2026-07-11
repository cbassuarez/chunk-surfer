// The interface palette, modelled on three real machines.
//
//   AMBER  — the Akai AM-M5 amp / HX-M5 deck. Warm gold-amber phosphor on flat
//            black glass. Menus, the bag, dialogue, document chrome.
//   GREEN  — the Hitachi DA-1000 CD player. FL green bargraphs, a pale-cyan time
//            counter, a red position marker, a blue POWER accent. Record and
//            playback.
//
// Two machines, two jobs. A surface sets the active theme; every `ui-*` class
// then resolves its colour from that theme and from the player's settings.

export const THEMES = Object.freeze({
  amber: {
    name: 'amber',
    phosphor: '#F2A81E',                 // the lit segment
    dim: 'rgba(242,168,30,0.055)',       // dormant phosphor — the VFD tell
    counter: '#FFD070',                  // numeric 7-seg
    marker: '#FF5A3C',
    accent: '#FFC247',
    glass: '#050505',
    silkscreen: '#8C7C54',               // printed legend, unlit
    wordmark: '#C7B27E',
    strip: '#B9A06A',
    danger: '#FF6A5A',
  },
  green: {
    name: 'green',
    phosphor: '#5BF08A',
    dim: 'rgba(91,240,138,0.06)',
    counter: '#CFF6FF',                  // pale-cyan TIME COUNTER
    marker: '#FF3B30',                   // the red location marker
    accent: '#3B7BFF',                   // POWER, blue
    glass: '#040606',
    silkscreen: '#4E6E5F',
    wordmark: '#9FD4FF',
    strip: '#8A8F94',
    danger: '#FF6A5A',
  },
});

// Player settings, live. `phosphor: 'faithful'` keeps amber-and-green; any other
// value forces every surface to one hue. Brightness scales lit intensity and
// the dormant grid; flicker is an off-by-default period shimmer.
export const vfdSettings = {
  phosphor: 'faithful',                  // 'faithful' | 'amber' | 'green' | 'cyan' | custom hex
  brightness: 1.0,                       // 0.55 .. 1.25
  flicker: false,
};
let version = 1;
export function vfdVersion() { return version; }

export function applyVfdSettings(patch = {}) {
  let changed = false;
  for (const k of ['phosphor', 'brightness', 'flicker']) {
    if (patch[k] !== undefined && patch[k] !== vfdSettings[k]) { vfdSettings[k] = patch[k]; changed = true; }
  }
  if (changed) version++;
  return changed;
}

function monoTheme(base) {
  return {
    name: 'mono', phosphor: base, dim: withAlpha(base, 0.06), counter: lighten(base, 0.4),
    marker: '#FF3B30', accent: base, glass: '#050505', silkscreen: withAlpha(base, 0.22),
    wordmark: lighten(base, 0.3), strip: '#8A8F94', danger: '#FF6A5A',
  };
}
const FORCED = { amber: THEMES.amber, green: THEMES.green, cyan: monoTheme('#59E7E7') };

// The active surface. Presenters call setActiveSurface('amber'|'green') before
// drawing; `ui-*` glyph classes resolve against whatever is active.
let active = 'amber';
export function setActiveSurface(name) { active = THEMES[name] ? name : 'amber'; }
export function activeSurface() { return active; }

export function activeTheme() {
  const p = vfdSettings.phosphor;
  if (p !== 'faithful') return FORCED[p] || monoTheme(p);
  return THEMES[active] || THEMES.amber;
}

// The colour a `ui-*` role should draw at, given the active theme.
const ROLE = {
  'ui-primary': 'phosphor', 'ui-secondary': 'silkscreen', 'ui-label': 'silkscreen',
  'ui-amber': 'accent', 'ui-blue': 'accent', 'ui-green': 'phosphor',
  'ui-counter': 'counter', 'ui-danger': 'danger', 'ui-marker': 'marker',
  'ui-strip': 'glass', 'ui-wordmark': 'wordmark',
};
export function uiRoleColor(cls) {
  const t = activeTheme();
  return t[ROLE[cls] || 'phosphor'] || t.phosphor;
}
export function uiRoleDim(cls) {
  if (cls === 'ui-primary' || cls === 'ui-green' || cls === 'ui-counter') return activeTheme().dim;
  return null;
}
export function uiBrightness() { return Math.max(0.4, Math.min(1.4, vfdSettings.brightness)); }

// The active-state cache key: theme + settings version. The atlas mixes this
// into its keys so a phosphor/brightness change re-renders the glyph tiles.
export function paletteKey() { return `${active}:${version}`; }

// Back-compat flat surface list. `primary/amber/blue/green/...` now point at the
// active theme so any lingering direct reads still track it; paper is fixed.
export const UI_COLOR = Object.freeze({
  get glass() { return activeTheme().glass; },
  glassSoft: '#0D1113',
  get primary() { return activeTheme().phosphor; },
  get amber() { return activeTheme().accent; },
  get blue() { return activeTheme().accent; },
  get green() { return activeTheme().phosphor; },
  get danger() { return activeTheme().danger; },
  get secondary() { return activeTheme().silkscreen; },
  get frame() { return activeTheme().silkscreen; },
  get counter() { return activeTheme().counter; },
  get marker() { return activeTheme().marker; },
  paper: '#D8CFB8',
  paperInk: '#20180F',
  paperSecondary: '#5A5142',
});

// ── tiny colour helpers ──────────────────────────────────────────────────────
function hexToRgb(h) {
  const s = String(h).replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function withAlpha(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function lighten(h, t) {
  const [r, g, b] = hexToRgb(h);
  const m = (c) => Math.round(c + (255 - c) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
