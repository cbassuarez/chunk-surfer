// Canvas-side transcription of the glyph classes in styles.css.
// Order matters: entries appear in stylesheet order, and resolveStyle()
// resolves each property (color / shadows / bold) independently from the
// LAST class in that order that defines it — matching CSS cascade rules for
// equal-specificity selectors, e.g. `t-drone t-world-main_b3` takes the
// world tint's color but keeps t-drone's (absent) shadows.
// Shadow layers: {dx, dy, blur, color} in CSS px.

import { UI_COLOR } from './palette.js';

const S = (color, shadows = null, bold = false, pulse = false) =>
  ({ color, shadows, bold, pulse });
const g = (blur, color, dx = 0, dy = 0) => ({ dx, dy, blur, color });

export const GLYPH_STYLES = new Map(Object.entries({
  't-drone':     S('#557766'),
  't-shimmer':   S('#aaaabb'),
  't-noise':     S('#887766'),
  't-pulse':     S('#778877'),
  't-resonance': S('#668888'),
  't-water':     S('#55aa88'),
  't-feature':   S('#ccccee', null, true),
  't-landmark':  S('#ffcc88', null, true),
  't-player':    S('#ffffff', [g(3,'#fff'), g(8,'#fff'), g(18,'rgba(255,255,255,0.9)'), g(28,'rgba(220,232,255,0.65)')], true),
  't-chunk':     S('#dddddd', null, true),
  't-chunk-on':  S('#ffffff', null, true),
  't-trail':     S('#444444'),
  't-key':       S('#ffffff', [g(2,'#fff'), g(6,'#fff'), g(14,'rgba(255,255,255,0.95)'), g(28,'rgba(238,244,255,0.78)')], true, true),
  't-key-aura':  S('rgba(255,255,255,0.55)', [g(6,'rgba(255,255,255,0.6)')]),
  't-alert-key': S('#ffffff', [g(3,'#fff'), g(9,'#fff'), g(18,'rgba(238,244,255,0.85)'), g(28,'rgba(200,220,255,0.6)')], true),
  't-alert-door':S('#e6ecff', [g(3,'rgba(255,255,255,0.95)'), g(9,'rgba(220,235,255,0.65)'), g(18,'rgba(180,210,255,0.45)')], true),
  't-door-core': S('#ffffff', [g(2,'rgba(255,255,255,0.95)'), g(9,'rgba(228,242,255,0.55)'), g(22,'rgba(180,200,255,0.45)'), g(28,'rgba(140,180,255,0.35)')], true),
  't-door-aura': S('rgba(255,255,255,0.88)', [g(0,'rgba(255,90,168,0.55)',-1,0), g(0,'rgba(120,236,255,0.55)',1,0), g(8,'rgba(238,244,255,0.45)')]),
  't-eye':       S('rgba(230,236,245,0.84)', [g(5,'rgba(255,255,255,0.42)'), g(12,'rgba(222,238,255,0.28)')]),
  't-eye-near':  S('#ffffff', [g(4,'rgba(255,255,255,0.95)'), g(12,'rgba(255,255,255,0.86)'), g(26,'rgba(205,220,255,0.72)')], true),
  't-eye-ping':  S('#ffffff', [g(3,'rgba(255,255,255,0.95)'), g(9,'rgba(255,255,255,0.85)'), g(20,'rgba(200,220,255,0.62)')], true),
  't-hush':      S('rgba(255,255,255,0.98)', [g(3,'rgba(255,255,255,0.95)'), g(11,'rgba(255,255,255,0.82)'), g(28,'rgba(210,226,255,0.66)')], true),
  't-hush-core': S('#f4f6fb', [g(0,'rgba(255,120,120,0.4)',-1,0), g(0,'rgba(165,210,255,0.4)',1,0), g(4,'rgba(255,255,255,0.82)'), g(16,'rgba(214,228,255,0.58)'), g(28,'rgba(130,156,205,0.42)')], true),
  't-hush-edge': S('rgba(210,218,232,0.82)', [g(3,'rgba(214,224,244,0.38)'), g(11,'rgba(138,164,204,0.34)')]),
  't-hush-aura': S('rgba(156,170,192,0.3)', [g(7,'rgba(156,182,222,0.28)')]),
  't-statue':    S('rgba(226,232,242,0.78)', [g(4,'rgba(205,215,235,0.35)'), g(11,'rgba(170,190,222,0.24)')]),
  't-statue-lurch': S('#ffffff', [g(4,'rgba(255,255,255,0.88)'), g(12,'rgba(220,234,255,0.78)'), g(24,'rgba(175,206,255,0.62)')], true),
  't-sw2-rite':  S('rgba(196,206,224,0.36)', [g(4,'rgba(178,196,228,0.2)')]),
  't-sw2-hub':   S('rgba(224,232,246,0.84)', [g(4,'rgba(220,230,248,0.42)')]),
  't-sw2-anchor':S('rgba(204,214,230,0.74)', [g(5,'rgba(196,210,232,0.32)')]),
  't-sw2-adversary':      S('rgba(238,242,250,0.88)', [g(6,'rgba(222,234,252,0.44)'), g(14,'rgba(178,196,228,0.26)')]),
  't-sw2-adversary-dim':  S('rgba(182,192,208,0.52)', [g(3,'rgba(168,182,205,0.22)')]),
  't-sw2-adversary-dark': S('rgba(245,248,255,0.96)', [g(4,'rgba(255,255,255,0.92)'), g(15,'rgba(218,232,255,0.6)'), g(28,'rgba(168,196,242,0.34)')], true),
  't-sw2-adversary-aura': S('rgba(220,230,246,0.36)', [g(7,'rgba(192,210,242,0.28)')]),
  't-sw2-mass':  S('rgba(160,172,194,0.3)', [g(9,'rgba(150,176,218,0.18)')]),
  't-sw2-gate':  S('#f5f9ff', [g(3,'rgba(255,255,255,0.95)'), g(12,'rgba(220,236,255,0.8)'), g(26,'rgba(162,194,242,0.58)')], true),
  't-sw2-gate-aura': S('rgba(225,236,252,0.58)', [g(8,'rgba(188,214,248,0.36)')]),
  't-trail-1':   S('rgba(220,234,255,0.62)', [g(6,'rgba(200,224,255,0.55)'), g(14,'rgba(160,200,255,0.35)')]),
  't-trail-2':   S('rgba(180,206,240,0.42)', [g(4,'rgba(170,200,240,0.30)')]),
  't-trail-3':   S('rgba(140,168,210,0.26)'),
  't-trail-4':   S('rgba(100,128,170,0.13)'),
  't-fog':       S('rgba(170,185,200,0.12)'),
  't-intro-trail': S('rgba(238,244,252,0.96)', null, true),
  't-intro-halo':  S('rgba(185,195,210,0.32)'),
  't-intro-bloom': S('rgba(214,228,210,0.72)'),
  't-gate-frame':  S('rgba(214,224,240,0.26)', null, true),
  't-gate-mark':   S('#ffffff', [g(2,'rgba(255,255,255,0.95)'), g(7,'rgba(228,242,255,0.36)')], true),
  't-gate-spectral': S('rgba(255,255,255,0.88)', [g(0,'rgba(255,90,168,0.4)',-1,0), g(0,'rgba(120,236,255,0.4)',1,0), g(6,'rgba(238,244,255,0.35)')]),
  't-void-drone':   S('rgba(120,145,130,0.12)'),
  't-void-shimmer': S('rgba(145,155,165,0.12)'),
  't-void-noise':   S('rgba(150,135,120,0.12)'),
  't-void-pulse':   S('rgba(132,132,132,0.12)'),
  't-void-water':   S('rgba(110,145,150,0.12)'),
  't-world-main_b3':         S('rgba(170,188,160,0.9)'),
  't-world-the_tub':         S('rgba(145,175,205,0.9)'),
  't-world-amplifications':  S('rgba(202,168,230,0.9)'),
  't-world-soundnoisemusic': S('rgba(224,186,132,0.9)'),
  't-world-lux_nova':        S('rgba(224,234,255,0.9)'),
  't-world-border-main_b3':         S('rgba(145,170,135,0.28)'),
  't-world-border-the_tub':         S('rgba(130,160,190,0.28)'),
  't-world-border-amplifications':  S('rgba(172,138,206,0.32)'),
  't-world-border-soundnoisemusic': S('rgba(210,162,108,0.3)'),
  't-world-border-lux_nova':        S('rgba(196,212,246,0.34)'),
  // Authored UI. These are opaque by design: draw-time alpha is reserved for
  // non-semantic frames and expired transcript history, never essential text.
  'ui-primary':   S(UI_COLOR.primary, [g(3,'rgba(234,242,240,0.34)'),g(8,'rgba(234,242,240,0.12)')], true),
  'ui-secondary': S(UI_COLOR.secondary),
  'ui-label':     S(UI_COLOR.secondary, null, true),
  'ui-amber':     S(UI_COLOR.amber, [g(3,'rgba(255,194,71,0.72)'),g(9,'rgba(255,194,71,0.28)')], true),
  'ui-blue':      S(UI_COLOR.blue, [g(3,'rgba(159,212,255,0.58)'),g(9,'rgba(159,212,255,0.20)')], true),
  'ui-green':     S(UI_COLOR.green, [g(3,'rgba(120,227,154,0.58)'),g(9,'rgba(120,227,154,0.20)')], true),
  'ui-danger':    S(UI_COLOR.danger, [g(3,'rgba(255,106,100,0.62)'),g(10,'rgba(255,106,100,0.24)')], true),
  'ui-frame':     S(UI_COLOR.frame),
  'paper-ink':    S(UI_COLOR.paperInk),
  'paper-muted':  S(UI_COLOR.paperSecondary),
}));

const CLASS_ORDER = new Map([...GLYPH_STYLES.keys()].map((k, i) => [k, i]));
const FALLBACK = S('#668888');
const resolveCache = new Map();

// Resolve a (possibly multi-)class string to one merged style, per-property,
// last-in-stylesheet-order wins — mirrors the CSS cascade.
export function resolveStyle(clsString) {
  if (!clsString) return FALLBACK;
  const hit = resolveCache.get(clsString);
  if (hit) return hit;
  const names = clsString.split(/\s+/).filter((n) => GLYPH_STYLES.has(n));
  let style;
  if (names.length === 0) style = FALLBACK;
  else if (names.length === 1) style = GLYPH_STYLES.get(names[0]);
  else {
    names.sort((a, b) => CLASS_ORDER.get(a) - CLASS_ORDER.get(b));
    style = { color: FALLBACK.color, shadows: null, bold: false, pulse: false };
    for (const n of names) {
      const s = GLYPH_STYLES.get(n);
      if (s.color) style.color = s.color;
      if (s.shadows) style.shadows = s.shadows;
      if (s.bold) style.bold = true;
      if (s.pulse) style.pulse = true;
    }
  }
  resolveCache.set(clsString, style);
  return style;
}
