// The interface palette, modelled on three real machines.
//
//   AMBER  — the A k a i AM M5 amp / HX M5 deck. Warm gold-amber phosphor on flat
//            black glass. Menus, the bag, dialogue, document chrome.
//   GREEN  — the hi ta chi DA-1000 CD player. FL green bargraphs, a pale-cyan time
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
    warning: '#FFE38A',
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
    warning: '#F2A81E',
    danger: '#FF6A5A',
  },
});

// Player settings, live. `phosphor: 'faithful'` keeps amber-and-green; any other
// value forces every surface to one hue. Brightness scales lit intensity and
// the dormant grid; flicker is an off-by-default period shimmer.
export const vfdSettings = {
  phosphor: 'faithful',                  // 'faithful' | 'amber' | 'green' | 'cyan' | custom hex
  brightness: 1.0,                       // 0.55 .. 1.25
  flicker: 'off',
  // High-contrast menus: lifts the unselected menu rows off the dormant floor so
  // they stay legible without a pointer on them. Off keeps the faithful VFD look
  // where only the selection is fully lit.
  menuContrast: false,
};
let version = 1;
export function vfdVersion() { return version; }
export const FLICKER_LEVELS = Object.freeze(['off', 'low', 'full']);
export const FLICKER_LABEL = Object.freeze({ off: 'OFF', low: 'LOW', full: 'FULL' });

export function normalizeFlicker(value) {
  if (value === true) return 'low';       // migrate old boolean saves tastefully
  if (value === false || value == null) return 'off';
  const v = String(value).toLowerCase();
  return FLICKER_LEVELS.includes(v) ? v : 'off';
}

export function vfdFlickerLevel() {
  return normalizeFlicker(vfdSettings.flicker);
}

export function applyVfdSettings(patch = {}) {
  let changed = false;
    for (const k of ['phosphor', 'brightness', 'flicker', 'menuContrast']) {
      if (patch[k] === undefined) continue;
      const next = k === 'flicker' ? normalizeFlicker(patch[k]) : k === 'menuContrast' ? !!patch[k] : patch[k];
      if (next !== vfdSettings[k]) { vfdSettings[k] = next; changed = true; }
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
const FILTER_BANDS = Object.freeze([
  { at: 0.00, color: '#ECA51E' }, // warm amber glass
  { at: 0.30, color: '#7AF0A0' }, // green phosphor/filter overlap
  { at: 0.62, color: '#6BE8D4' }, // aqua VFD region
  { at: 0.84, color: '#8FD8FF' }, // blue edge filter
]);

const FORCED = Object.freeze({
  amber: THEMES.amber,
  green: THEMES.green,

  aqua: {
    name: 'aqua',
    phosphor: '#66FFD4',
    dim: 'rgba(102,255,212,0.055)',
    counter: '#D8FFFF',
    marker: '#FF4A38',
    accent: '#8FEAFF',
    glass: '#030707',
    silkscreen: 'rgba(102,255,212,0.24)',
    wordmark: '#B7FFF0',
    strip: '#78918D',
    danger: '#FF6A5A',
  },

  filterBlue: {
    name: 'filterBlue',
    phosphor: '#7FD7FF',
    dim: 'rgba(127,215,255,0.045)',
    counter: '#DDF7FF',
    marker: '#FF513C',
    accent: '#B2E9FF',
    glass: '#020608',
    silkscreen: 'rgba(127,215,255,0.20)',
    wordmark: '#B9E8FF',
    strip: '#607B86',
    danger: '#FF6A5A',
  },

  gold: {
    name: 'gold',
    phosphor: '#FFE06A',
    dim: 'rgba(255,224,106,0.050)',
    counter: '#FFF1A8',
    marker: '#FF5A3C',
    accent: '#FFD36A',
    glass: '#060502',
    silkscreen: 'rgba(255,224,106,0.22)',
    wordmark: '#D8C17A',
    strip: '#9B8754',
    danger: '#FF6A5A',
  },

  warmWhite: {
    name: 'warmWhite',
    phosphor: '#EAF8F2',
    dim: 'rgba(234,248,242,0.040)',
    counter: '#FFFFFF',
    marker: '#FF473A',
    accent: '#BFDFFF',
    glass: '#050606',
    silkscreen: 'rgba(234,248,242,0.18)',
    wordmark: '#E6EEE8',
    strip: '#8A928C',
    danger: '#FF6A5A',
  },

  ember: {
    name: 'ember',
    phosphor: '#FF6A38',
    dim: 'rgba(255,106,56,0.045)',
    counter: '#FFB08A',
    marker: '#FFFFFF',
    accent: '#FF8C4A',
    glass: '#070302',
    silkscreen: 'rgba(255,106,56,0.20)',
    wordmark: '#E79A76',
    strip: '#8A5A4A',
    danger: '#FFEEE6',
  },

  cyan: monoTheme('#59E7E7'),

  filterBands: {
    name: 'filterBands',
    phosphor: '#70F7B0',
    dim: 'rgba(112,247,176,0.040)',
    counter: '#CFF6FF',
    marker: '#FF3B30',
    accent: '#FFC247',
    glass: '#030505',
    silkscreen: 'rgba(170,210,190,0.20)',
    wordmark: '#D8EAD8',
    strip: '#8A8F94',
    danger: '#FF6A5A',
    bands: FILTER_BANDS,
  },
});

export const PHOSPHOR_THEMES = Object.freeze([
  'faithful',
  'green',
  'amber',
  'aqua',
  'filterBlue',
  'gold',
  'warmWhite',
  'ember',
  'cyan',
  'filterBands',
]);

export const PHOSPHOR_LABEL = Object.freeze({
  faithful: 'FAITHFUL',
  green: 'GREEN',
  amber: 'AMBER',
  aqua: 'AQUA',
  filterBlue: 'FILTER BLUE',
  gold: 'GOLD',
  warmWhite: 'WHITE',
  ember: 'EMBER',
  cyan: 'CYAN',
  filterBands: 'FILTER BANDS',
});
// The active surface. Presenters call setActiveSurface('amber'|'green') before
// drawing; `ui-*` glyph classes resolve against whatever is active.
let active = 'amber';
export function setActiveSurface(name) { active = THEMES[name] ? name : 'amber'; }
export function activeSurface() { return active; }

export function themeForSurface(name = 'amber') {
  const p = vfdSettings.phosphor;
  if (p !== 'faithful') return FORCED[p] || monoTheme(p);
  return THEMES[name] || THEMES.amber;
}

export function activeTheme() { return themeForSurface(active); }

// The colour a `ui-*` role should draw at, given the active theme.
const ROLE = {
  'ui-primary': 'phosphor', 'ui-secondary': 'silkscreen', 'ui-label': 'silkscreen',
  'ui-amber': 'accent', 'ui-blue': 'accent', 'ui-green': 'phosphor',
  'ui-counter': 'counter', 'ui-warning': 'warning', 'ui-danger': 'danger', 'ui-marker': 'marker',
  'ui-strip': 'glass', 'ui-wordmark': 'wordmark',
};
const BANDED_ROLES = new Set(['phosphor', 'counter', 'accent']);
const DIM_ROLES = new Set(['phosphor', 'counter']);

function bandIndexFor(t, x, cols) {
  if (!t?.bands || !Number.isFinite(x) || !Number.isFinite(cols) || cols <= 1) return -1;

  const p = Math.max(0, Math.min(1, x / Math.max(1, cols - 1)));
  let index = 0;

  for (let i = 0; i < t.bands.length; i++) {
    if (p >= t.bands[i].at) index = i;
  }

  return index;
}

function bandColorFor(t, x, cols, fallback) {
  const index = bandIndexFor(t, x, cols);
  return index >= 0 ? t.bands[index].color : fallback;
}

function parseColor(value) {
  const src=String(value||'').trim();
  const hex=/^#([0-9a-f]{6})$/i.exec(src);
  if(hex){const n=parseInt(hex[1],16);return[(n>>16)&255,(n>>8)&255,n&255,1];}
  const rgba=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(src);
  if(rgba)return[+rgba[1],+rgba[2],+rgba[3],rgba[4]==null?1:+rgba[4]];
  return null;
}
function relLum(rgb){return[0,1,2].map((i)=>{const v=Math.max(0,Math.min(255,rgb[i]))/255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
function contrastRatio(a,b){const la=relLum(a),lb=relLum(b),hi=Math.max(la,lb),lo=Math.min(la,lb);return(hi+.05)/(lo+.05);}
function composite(fg,bg){const a=Math.max(0,Math.min(1,fg[3]??1));return[fg[0]*a+bg[0]*(1-a),fg[1]*a+bg[1]*(1-a),fg[2]*a+bg[2]*(1-a),1];}
function rgbHex(rgb){return`#${rgb.slice(0,3).map((v)=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('')}`;}
function accessibleSilkscreen(theme){
  const bg=parseColor(theme.glass)||[5,5,5,1];
  const authored=parseColor(theme.silkscreen);
  if(authored&&contrastRatio(composite(authored,bg),bg)>=4.5)return theme.silkscreen;
  const lit=parseColor(theme.phosphor)||[242,168,30,1];
  for(let t=.35;t<=1.001;t+=.025){const candidate=[bg[0]+(lit[0]-bg[0])*t,bg[1]+(lit[1]-bg[1])*t,bg[2]+(lit[2]-bg[2])*t,1];if(contrastRatio(candidate,bg)>=4.6)return rgbHex(candidate);}
  return theme.phosphor;
}

export function themeRoleColor(role = 'phosphor', x = null, cols = null) {
  const t = activeTheme();
  const base = role === 'warning' ? (t.warning || '#F2A81E') : role === 'silkscreen' ? accessibleSilkscreen(t) : (t[role] || t.phosphor);

  return t.bands && BANDED_ROLES.has(role)
    ? bandColorFor(t, x, cols, base)
    : base;
}

export function themeRoleDim(role = 'phosphor', x = null, cols = null) {
  const t = activeTheme();

  if (!DIM_ROLES.has(role)) return null;

  if (t.bands && BANDED_ROLES.has(role)) {
    return withAlpha(themeRoleColor(role, x, cols), 0.040);
  }

  return t.dim;
}

export function uiRoleColor(cls, x = null, cols = null) {
  return themeRoleColor(ROLE[cls] || 'phosphor', x, cols);
}

export function uiRoleDim(cls, x = null, cols = null) {
  return themeRoleDim(ROLE[cls] || 'phosphor', x, cols);
}

export function uiBandKey(x = null, cols = null) {
  const index = bandIndexFor(activeTheme(), x, cols);
  return index >= 0 ? `band:${index}` : '';
}
export function uiBrightness() { return Math.max(0.4, Math.min(1.4, vfdSettings.brightness)); }


const FLICKER_ROLES = new Set(['phosphor', 'counter', 'accent', 'danger', 'marker']);
const TAU = Math.PI * 2;

function hashCell(x = 0, y = 0) {
  let h = ((Math.floor(x) * 374761393) ^ (Math.floor(y) * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function clamp01ish(v, lo = 0.88, hi = 1.04) {
  return Math.max(lo, Math.min(hi, v));
}

export function uiFlickerAlpha(x = 0, y = 0, clsOrRole = 'phosphor') {
  const level = vfdFlickerLevel();
  if (level === 'off') return 1;

  const role = ROLE[clsOrRole] || clsOrRole || 'phosphor';
  if (!FLICKER_ROLES.has(role)) return 1;

  const now = (typeof performance !== 'undefined' && performance.now)
    ? performance.now() * 0.001
    : Date.now() * 0.001;
  const h = hashCell(x, y);
  const strength = level === 'full' ? 1 : 0.45;

  // Real-ish display instability: mostly a settled mains/driver shimmer, with
  // a little panel drift and rare cell fatigue. LOW is a tasteful living panel;
  // FULL is the haunted-service-bench version.
  const mains = 1 - 0.012 * strength + 0.012 * strength * Math.sin(TAU * 59.94 * now + y * 0.71);
  const driver = 1 - 0.018 * strength + 0.018 * strength * Math.sin(TAU * 7.35 * now + h * TAU);
  const scan = 1 - 0.006 * strength + 0.006 * strength * Math.sin(TAU * 16.8 * now + y * 0.29 + x * 0.047);
  const fatigueGate = level === 'full' ? 0.988 : 0.997;
  const fatigueDrop = level === 'full' ? 0.94 : 0.975;
  const fatigue = Math.sin(TAU * 0.19 * now + h * TAU) > fatigueGate ? fatigueDrop : 1;

  return clamp01ish(mains * driver * scan * fatigue, level === 'full' ? 0.86 : 0.94, 1.04);
}

// The active-state cache key: theme + settings version. The atlas mixes this
// into its keys so a phosphor/brightness change re-renders the glyph tiles.
export function paletteKey() {
  return `${active}:${vfdSettings.phosphor}:${version}`;
}
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
