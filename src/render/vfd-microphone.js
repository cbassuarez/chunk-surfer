// The microphone on the consent card, as a graphic VFD would draw it: a
// capsule with its grille, the cradle, stem and foot, and three arcs of sound
// either side. Every stroke is plotted onto the dot grid one dot wide and
// mirrored about a centre column, so the two sides always match and no line
// doubles up where it happens to fall between two dots.
//
// Levels are per-dot duty, 0..1; 0 is a dormant dot. Nothing here reads the
// microphone. `live` controls the illustrative sound arcs; it is not a level
// meter. The consent card keeps it false: focusing ALLOW is not permission,
// and before access is granted there is no input to show.

// The drawing in its own units, +y down.
const CX = 17.5;
const CAPSULE = Object.freeze({ half: 4, top: 5, bottom: 10 }); // pill: two caps of radius `half`
const CRADLE = Object.freeze({ r: 7, armTop: 7 });               // concentric with the lower cap
const STEM_BOTTOM = 20.6;
const FOOT = Object.freeze({ y: 21.2, half: 5 });
const WAVES = Object.freeze({ cy: 7.5, radii: [10.4, 12.9, 15.4], spread: 0.56 });
const BOUNDS = Object.freeze({ x0: 0, x1: 35, y0: -1.4, y1: 22.2 });

export const VFD_MIC_SCALE = 1.6; // dots per unit
export const VFD_MIC_DOTS = Object.freeze({
  // Odd, so the stem and the axis of symmetry land on one column.
  cols: (Math.round((BOUNDS.x1 - BOUNDS.x0) * VFD_MIC_SCALE) | 1),
  rows: Math.ceil((BOUNDS.y1 - BOUNDS.y0) * VFD_MIC_SCALE) + 1,
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const frames = new Map();
const MAX_FRAMES = 64;

// How bright each sound arc is at time t: a crest that leaves the capsule and
// fades as it goes. Reduced motion is a still picture of the same thing.
export function vfdMicWaveLevels(t = 0, { live = true, reduced = false } = {}) {
  if (!live) return [0, 0, 0];
  if (reduced) return [0.95, 0.66, 0.4];
  const crest = ((t * 0.82) % 1) * 4.2 - 0.6;
  return WAVES.radii.map((_, i) => clamp01(1 - Math.abs(crest - i) * 1.15) * (1 - i * 0.16));
}

function grid(cols, rows) {
  const levels = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const centre = (cols - 1) / 2, s = VFD_MIC_SCALE;
  const row = (y) => Math.round((y - BOUNDS.y0) * s);
  // The right half is placed and the left is its mirror, column for column.
  const plot = (x, y, level) => {
    const offset = Math.round(Math.abs(x - CX) * s), j = row(y);
    if (j < 0 || j >= rows) return;
    for (const i of offset ? [centre + offset, centre - offset] : [centre]) {
      if (i >= 0 && i < cols) levels[j][i] = Math.max(levels[j][i], level);
    }
  };
  const step = 0.12 / s;
  const arc = (cx, cy, r, from, to, level) => {
    const n = Math.max(2, Math.ceil(Math.abs(to - from) * r / step));
    for (let k = 0; k <= n; k++) {
      const a = from + (to - from) * k / n;
      plot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, typeof level === 'function' ? level(a) : level);
    }
  };
  const line = (x0, y0, x1, y1, level) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k <= n; k++) plot(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, level);
  };
  return { levels, row, arc, line, centre };
}

/**
 * One frame of the microphone. `live` enables the sound illustration; `t` is
 * seconds. Returns VFD_MIC_DOTS.rows rows of VFD_MIC_DOTS.cols levels.
 */
export function vfdMicrophoneFrame({ t = 0, live = true, reduced = false, mode = 'neutral' } = {}) {
  live = !!live && !['standby', 'requesting', 'blocked'].includes(mode);
  const seconds = Number.isFinite(Number(t)) ? Math.max(0, Number(t)) : 0,
    requesting = mode === 'requesting', blocked = mode === 'blocked',
    animated = !reduced && (live || requesting),
    tick = animated ? Math.floor((seconds % (requesting ? 2.8 : 20)) * 16) : 0,
    key = `${mode}:${!!live}:${!!reduced}:${tick}`;
  if (frames.has(key)) return frames.get(key);
  t = tick / 16;
  const { cols, rows } = VFD_MIC_DOTS;
  const { levels, row, arc, line, centre } = grid(cols, rows);
  const body = live ? 1 : requesting ? 0.875 : blocked ? 0.56 : 0.72;
  const { half, top, bottom } = CAPSULE;

  // The capsule's rim: top cap, the right side, bottom cap (mirrored for the left).
  arc(CX, top, half, -Math.PI / 2, 0, body);
  line(CX + half, top, CX + half, bottom, body);
  arc(CX, bottom, half, 0, Math.PI / 2, body);

  // The grille: every other dot row inside the rim, clear of it by one dot. A
  // brighter slat walks down it while live is true — the module being
  // addressed, not a reading.
  // A permission request addresses the grille from base to crown; it never
  // emits sound arcs or pretends that a pre-consent signal has been measured.
  // Static reduced-motion has the same complete grille and cradle.
  const sweep = requesting && !reduced ? bottom + half + 3 - (t / 2.8) * (bottom + half - (top - half) + 6)
    : live && !reduced ? ((t * 0.55) % 1) * (bottom + half - (top - half) + 6) + (top - half) - 3 : -99;
  const firstRow = row(top - half) + 2;
  for (let j = firstRow; j <= row(bottom + half) - 2; j += 2) {
    const lit = levels[j].map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    const right = lit.filter((i) => i > centre);
    if (!right.length) continue;
    const edge = Math.min(...right) - centre;
    const y = j / VFD_MIC_SCALE + BOUNDS.y0;
    const level = (live ? 0.46 : requesting ? 0.32 : 0.3) + 0.5 * clamp01(1 - Math.abs(y - sweep) / 1.35);
    for (let i = centre - edge + 2; i <= centre + edge - 2; i++) levels[j][i] = Math.max(levels[j][i], level);
  }

  // The cradle round the lower cap, its arms, the stem and the foot.
  arc(CX, bottom, CRADLE.r, 0, Math.PI / 2, body);
  line(CX + CRADLE.r, CRADLE.armTop, CX + CRADLE.r, bottom, body);
  line(CX, bottom + CRADLE.r, CX, STEM_BOTTOM, body);
  line(CX, FOOT.y, CX + FOOT.half, FOOT.y, body);
  if (blocked) {
    // One unambiguous crossed capsule; failure never keeps a busy animation.
    line(CX - 2.8, top + .5, CX + 2.8, bottom + 1.5, .875);
  }

  // Sound, both sides, fading toward the ends of each arc.
  vfdMicWaveLevels(t, { live, reduced }).forEach((amount, k) => {
    if (amount > 0) arc(CX, WAVES.cy, WAVES.radii[k], -WAVES.spread, WAVES.spread,
      (a) => amount * (1 - 0.55 * (a / WAVES.spread) ** 2));
  });

  // A 16-step duty, like everything else on the glass.
  const result = Object.freeze(levels.map((r) => Object.freeze(r.map((v) => Math.round(v * 16) / 16))));
  if (frames.size >= MAX_FRAMES) frames.delete(frames.keys().next().value);
  frames.set(key, result);
  return result;
}
