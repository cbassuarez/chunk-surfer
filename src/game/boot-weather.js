// THE WEATHER THE CREDITS HAPPEN IN.
//
// The opening credits used to run over a still frame: black, a slow optical
// bloom, a vignette, frame-stable grain, and nothing moving but the text
// alphas. It read as a card rather than as a place. One weather per boot —
// rain, blowing leaves, or blowing sheets — gives the twenty-three seconds
// somewhere to be, and gives the quote something to be read through.
//
// TWO RULES DO ALL THE WORK.
//
// 1. IT IS WEATHER PASSING A LENS, NOT DECORATION. The credits are framed as an
//    exposure, so every particle's brightness is multiplied by a radial term
//    centred on the SAME bloom centre the atmosphere already uses
//    (credit-visual.js). Something crossing mid-frame catches the light;
//    something in a corner does not, and nothing survives where the vignette
//    is. It costs one multiply and it is the whole difference between weather
//    and confetti.
//
// 2. THE EXIT IS A PUSH, NOT A FADE. A fade reads as the effect being switched
//    off. A push reads as the weather passing. So when the quote begins to go,
//    the emitter stops and everything still in frame is shoved toward the
//    nearest edge — and the last few are deliberately left alone, so they are
//    still settling behind the title menu when it comes up.
//
// The simulation is pure and coordinate-free (everything is 0..1 of the frame),
// so it can be stepped and asserted in node without a canvas. Only
// `renderBootWeather` touches the drawing surface. Same split as
// creditAtmosphereFrame / renderCreditAtmosphere next door.

import { uiDraw } from '../render/ui.js';
import { leafColour, leafOutline, leafShape } from '../world/leaf-species.js';
import { windAt } from '../world/wind.js';
import { freshStorm, stepStorm, stormFlash } from './storm.js';

export const BOOT_WEATHER = Object.freeze(['rain', 'leaves', 'sheets']);

// How many are allowed to outlive the credits. They are not a fade tail — they
// are the last of the weather, still moving when the menu arrives, and they
// stop there.
const SURVIVORS = 4;

// Where the credits' bloom is (credit-visual.js draws its radial gradient at
// 0.5 / 0.45–0.48). Particles are lit by the same lamp as everything else.
const BLOOM = Object.freeze({ x: 0.5, y: 0.465, inner: 0.16, outer: 0.64 });

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function smooth(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

// Deterministic per-state stream, so a stepped simulation can be asserted and a
// capture can be repeated. The cursor lives on the state, not in the module.
function nextRandom(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const between = (state, lo, hi) => lo + nextRandom(state) * (hi - lo);

// Each weather differs in AXIS and CADENCE, not only in sprite. Rain falls and
// thins; leaves are carried sideways in gusts and tumble; sheets are the
// fewest, largest and slowest, and read broadside then nearly vanish edge-on.
const KINDS = Object.freeze({
  rain: Object.freeze({
    count: 180,
    fall: [0.85, 1.35],       // frames per second, downward
    shear: [0.05, 0.13],      // lateral, wind-driven
    size: [0.030, 0.062],     // streak length, fraction of frame height
    spin: [0, 0],
    flutter: 0,
    gust: 0.35,
    exit: 'down',
  }),
  leaves: Object.freeze({
    count: 68,
    fall: [0.045, 0.115],
    shear: [0.20, 0.40],
    // THEY WERE TOO SMALL TO BE LEAVES. At 0.011–0.024 of frame height, dark
    // brown, on a vignetted near-black frame, sixty-eight of these read as
    // grain — the weather was being drawn and not seen. Rain gets away with
    // small because it is bright and there are a hundred and eighty of it;
    // sheets get away with dark because they are enormous. A leaf has neither
    // excuse and has to be big enough to have a shape.
    size: [0.021, 0.042],
    spin: [-3.4, 3.4],
    flutter: 1.9,
    gust: 1.0,
    exit: 'wind',
  }),
  sheets: Object.freeze({
    count: 26,
    fall: [0.02, 0.075],
    shear: [0.12, 0.26],
    size: [0.038, 0.072],
    spin: [-1.5, 1.5],
    flutter: 1.1,
    gust: 0.75,
    exit: 'wind',
  }),
});

export function isBootWeatherKind(value) {
  return BOOT_WEATHER.includes(String(value || ''));
}

// Even thirds, never the same weather two boots running. Repeating is the one
// thing that would make three weathers read as one effect with a variable.
export function pickBootWeather(previous = '', random = Math.random) {
  const pool = BOOT_WEATHER.filter((kind) => kind !== previous);
  const choices = pool.length ? pool : BOOT_WEATHER;
  const index = Math.min(choices.length - 1, Math.floor(clamp01(random()) * choices.length));
  return choices[index];
}

export function freshBootWeatherState(kind = 'rain', { seed = 1, reducedMotion = false, enabled = true } = {}) {
  const safeKind = isBootWeatherKind(kind) ? kind : 'rain';
  return {
    kind: safeKind,
    enabled: !!enabled,
    // Reduced motion thins and slows the field rather than deleting it. An
    // empty credits frame does not read as an accessibility setting, it reads
    // as a broken one.
    density: reducedMotion ? 0.35 : 1,
    pace: reducedMotion ? 0.5 : 1,
    rng: (Math.floor(Number(seed) || 1) >>> 0) || 1,
    time: 0,
    settleTime: 0,
    wind: 0,
    fade: 1,
    settling: false,
    calm: false,
    reserved: false,
    // RAIN CARRIES ITS STORM. The credits' rain is the same weather as the
    // yard's, so it gets the same strikes — and a flash on the boot screen is
    // the one place in this game where lightning can light the QUOTE.
    storm: safeKind === 'rain' && enabled
      ? freshStorm({ seed: (Math.floor(Number(seed) || 1) >>> 0) + 11, intensity: 0.85 })
      : null,
    thunder: [],
    particles: [],
  };
}

function spawn(state, config, { seeded = false } = {}) {
  const size = between(state, config.size[0], config.size[1]);
  const depth = nextRandom(state);                  // 0 far, 1 near
  const particle = {
    x: nextRandom(state),
    // A seeded field starts already scattered through the frame; anything
    // spawned later enters from off-screen, so nothing ever pops into being
    // where the player is looking.
    y: seeded ? nextRandom(state) : -0.12 - nextRandom(state) * 0.2,
    vx: between(state, config.shear[0], config.shear[1]) * (0.4 + depth * 0.8),
    vy: between(state, config.fall[0], config.fall[1]) * (0.5 + depth * 0.9),
    spin: between(state, -Math.PI, Math.PI),
    spinRate: between(state, config.spin[0], config.spin[1]),
    phase: between(state, 0, Math.PI * 2),
    size: size * (0.6 + depth * 0.7),
    depth,
    // Species, drawn once and kept. A leaf does not change kind mid-flight, and
    // re-rolling it per frame is the classic way to make a field shimmer.
    tint: nextRandom(state),
    form: nextRandom(state),
  };
  if (config.exit === 'wind' && !seeded) {
    // Carried in from upwind, at any height, rather than dropped from the top.
    particle.x = -0.10 - nextRandom(state) * 0.18;
    particle.y = nextRandom(state) * 1.1 - 0.05;
  }
  return particle;
}

function offFrame(particle) {
  return particle.y > 1.18 || particle.y < -0.42 || particle.x > 1.22 || particle.x < -0.30;
}

export function stepBootWeather(state, dt, { presence = 0, settling = false, calm = false } = {}) {
  if (!state?.enabled) return state;
  const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
  const config = KINDS[state.kind] || KINDS.rain;
  state.time += step;
  state.settling = !!settling || !!calm;
  state.calm = !!calm;

  // THE SAME GUST THE YARD AND SOURCE ARE READING. A gust arrives across the
  // whole night or it is not a gust — see world/wind.js.
  state.wind = windAt(state.time, { depth: config.gust });
  if (state.storm) {
    // Stops striking once the weather is clearing, so the menu never arrives on
    // a thunderclap.
    const { thunder } = stepStorm(state.storm, step, { active: !state.settling });
    for (const event of thunder) state.thunder.push(event);
  }

  const wanted = state.settling
    ? 0
    : Math.round(config.count * state.density * clamp01(presence));
  // The first population is scattered through frame; everything after enters.
  const seeded = state.particles.length === 0 && wanted > 0 && state.time < 2.4;
  while (state.particles.length < wanted) state.particles.push(spawn(state, config, { seeded }));

  // WHICH ONES ARE THE LAST OF IT IS DECIDED WHEN THE WIND TURNS, not left to
  // whichever happen to survive. Rain falls fast: by the time attrition gets the
  // field down to four, those four are all a hand's width from the bottom edge
  // and gone inside a frame, so nothing reaches the menu at all. Reserve the few
  // with the furthest still to travel at the moment settling starts, exempt them
  // from the push and brake them, and every weather hands the same few over.
  if (state.settling && !state.calm && !state.reserved) {
    state.reserved = true;
    const toExit = (particle) => (config.exit === 'down' ? 1.18 - particle.y : 1.22 - particle.x);
    [...state.particles]
      .sort((a, b) => toExit(b) - toExit(a))
      .slice(0, SURVIVORS)
      .forEach((particle) => { particle.keep = true; });
  }

  // Settling stops the emitter and shoves what is left at the nearest way out.
  //
  // The ramp is measured from when settling BEGAN, not from the scene clock:
  // the credits advance on wall time and can hand this a delta that was clipped
  // to 0.1s, so `state.time` legitimately drifts behind the authored second the
  // clear-out is keyed to. Timing the push off its own trigger makes it agree
  // with the picture whatever the frame rate did.
  if (state.settling && !state.calm) state.settleTime += step;
  const pushing = state.settling && !state.calm;
  // The clear-out window is fixed by the quote (20.40 to 23.30), so a field
  // twice the size has to leave twice as fast or the menu comes up on a crowd.
  const push = pushing ? 1 + smooth(state.settleTime / 2.10) * 3.4 : 1;
  // Calm is the title screen: the last of it comes to rest rather than being
  // switched off mid-air. A reserved particle is already slowing before then —
  // a shower peters out, it does not stop at full speed.
  const calmDrag = Math.exp(-step * 1.5);
  const keepDrag = Math.exp(-step * 1.15);
  if (state.calm) state.fade = Math.max(0, state.fade - step / 1.8);

  const next = [];
  for (const particle of state.particles) {
    const drag = state.calm ? calmDrag : (particle.keep && state.settling ? keepDrag : 1);
    const shove = particle.keep ? 1 : push;
    particle.vx *= drag;
    particle.vy *= drag;
    particle.x += particle.vx * state.wind * state.pace * shove * step;
    particle.y += particle.vy * state.pace * shove * step;
    particle.spin += particle.spinRate * state.pace * step;
    particle.phase += step * config.flutter;
    if (config.flutter) {
      // A leaf stalls and darts; it does not travel at a constant rate. This is
      // the difference between blowing and sliding.
      particle.x += Math.sin(particle.phase) * 0.030 * config.flutter * state.pace * step;
      particle.y += Math.cos(particle.phase * 0.73) * 0.022 * config.flutter * state.pace * step;
    }
    if (!offFrame(particle)) next.push(particle);
  }
  state.particles = next;
  return state;
}

// The strikes that fell due this step, for the caller to play. Drained, like
// the field itself, so a queue cannot carry one into the next screen.
export function drainBootThunder(state) {
  if (!state?.thunder?.length) return [];
  const events = state.thunder;
  state.thunder = [];
  return events;
}

export function bootWeatherFlash(state) {
  return state?.storm ? stormFlash(state.storm) : 0;
}

export function bootWeatherSettled(state) {
  if (!state?.enabled) return true;
  return state.particles.length === 0 || state.fade <= 0;
}

// The lamp every particle is lit by. Mid-frame catches it; the corners do not.
function bloomAt(x, y) {
  const dx = x - BLOOM.x;
  const dy = (y - BLOOM.y) * 0.86;
  const distance = Math.hypot(dx, dy);
  const lit = 1 - smooth((distance - BLOOM.inner) / (BLOOM.outer - BLOOM.inner));
  return 0.10 + 0.90 * lit;
}

function renderRain(ctx, state, width, height, alpha) {
  // Banded rather than per-drop: one stroke per brightness band keeps ninety
  // streaks at three path submissions instead of ninety save/restore pairs.
  const bands = [[], [], []];
  for (const particle of state.particles) {
    const lit = bloomAt(particle.x, particle.y) * (0.35 + particle.depth * 0.65);
    bands[Math.min(2, Math.floor(lit * 3))].push({ particle, lit });
  }
  const dpr = ctx.canvas.width / Math.max(1, width);
  bands.forEach((band, index) => {
    if (!band.length) return;
    ctx.globalAlpha = alpha * (0.10 + index * 0.17);
    ctx.lineWidth = Math.max(1, dpr * (0.7 + index * 0.25));
    ctx.beginPath();
    for (const { particle } of band) {
      const x = particle.x * width;
      const y = particle.y * height;
      // The streak lies along its own travel, so wind shear leans the whole
      // fall instead of tilting each drop independently.
      const length = particle.size * height;
      const lean = (particle.vx * state.wind) / Math.max(0.001, particle.vy);
      ctx.moveTo(x - lean * length, y - length);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

// A path cache keyed by shape id. The outline is pure geometry in unit space,
// so it is built four times per session rather than sixty-eight times a frame.
const OUTLINE_CACHE = new Map();
function outlineFor(shape) {
  let points = OUTLINE_CACHE.get(shape.id);
  if (!points) { points = leafOutline(shape); OUTLINE_CACHE.set(shape.id, points); }
  return points;
}

function traceLeaf(ctx, points, w, h) {
  ctx.beginPath();
  ctx.moveTo(points[0].along * w, points[0].upper * h);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].along * w, points[i].upper * h);
  for (let i = points.length - 1; i >= 0; i -= 1) ctx.lineTo(points[i].along * w, points[i].lower * h);
  ctx.closePath();
}

function renderLeaves(ctx, state, width, height, alpha) {
  for (const particle of state.particles) {
    const lit = bloomAt(particle.x, particle.y) * (0.4 + particle.depth * 0.6);
    const shape = leafShape(particle.form);
    const colour = leafColour(particle.tint);
    // Broadside it catches the light; edge-on it thins. The curl is what stops
    // that being a symmetric fade — a curled leaf hooks through the turn rather
    // than narrowing evenly, which is the difference between a leaf and a coin.
    const turn = particle.spin;
    const face = Math.abs(Math.cos(turn));
    const hook = 1 - shape.curl * 0.55 * (1 - face);
    const a = alpha * lit * (0.46 + 0.54 * face);
    if (a <= 0.004) continue;
    const w = particle.size * height * 1.25;
    const h = w * shape.slim;
    const points = outlineFor(shape);
    ctx.save();
    ctx.translate(particle.x * width, particle.y * height);
    ctx.rotate(turn * 0.42 + particle.phase * 0.12);
    ctx.scale(Math.max(0.10, face * hook), 1);
    ctx.globalAlpha = a;
    if (shape.id === 'skeleton') {
      // Nothing left but the veins. Drawn as an outline so the frame behind it
      // shows through, which is the one leaf you actually look at.
      ctx.strokeStyle = colour.vein;
      ctx.lineWidth = Math.max(0.7, w * 0.035);
      traceLeaf(ctx, points, w, h);
      ctx.stroke();
    } else {
      ctx.fillStyle = colour.fill;
      traceLeaf(ctx, points, w, h);
      ctx.fill();
    }
    // The midrib. One line, and without it every one of these is a petal.
    ctx.globalAlpha = a * (shape.id === 'skeleton' ? 0.9 : 0.5);
    ctx.strokeStyle = colour.vein;
    ctx.lineWidth = Math.max(0.6, w * 0.028);
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, 0);
    ctx.lineTo(w * 0.46, h * shape.curl * 0.10);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function renderSheets(ctx, state, width, height, alpha) {
  for (const particle of state.particles) {
    const lit = bloomAt(particle.x, particle.y) * (0.4 + particle.depth * 0.6);
    const face = Math.abs(Math.cos(particle.spin));
    const a = alpha * lit * (0.20 + 0.80 * face);
    if (a <= 0.004) continue;
    const w = particle.size * height * 1.35;
    const h = particle.size * height;
    ctx.save();
    ctx.translate(particle.x * width, particle.y * height);
    ctx.rotate(particle.spin * 0.35);
    ctx.scale(Math.max(0.08, face), 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#D8D2BE';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // The fold. A sheet with no crease in it is a card.
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = '#0A0B0C';
    ctx.fillRect(-w / 2, -h * 0.06, w, Math.max(1, h * 0.05));
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function renderBootWeather(state, { alpha = 1 } = {}) {
  if (!state?.enabled || !state.particles.length) return;
  const visible = clamp01(alpha) * clamp01(state.fade);
  if (visible <= 0.004) return;
  uiDraw(({ ctx }) => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    ctx.save();
    if (state.kind === 'rain') {
      ctx.strokeStyle = '#CBD8E2';
      ctx.lineCap = 'round';
      renderRain(ctx, state, width, height, visible);
    } else {
      if (state.kind === 'leaves') renderLeaves(ctx, state, width, height, visible);
      else renderSheets(ctx, state, width, height, visible);
    }
    ctx.restore();
  });
}

// ── the one field this boot gets ────────────────────────────────────────────
// It has to outlive the credits scene: the last few particles are still
// travelling when the title replaces it. A module singleton is the honest shape
// for something that exists exactly once per launch, and keeps main.js from
// threading a simulation through two scene factories. Tests use the pure
// factory above and never touch this.
let live = null;
let bed = null;

export function beginBootWeather(kind, options = {}) {
  live = freshBootWeatherState(kind, options);
  return live;
}

export function bootWeather() { return live; }

// THE BED DOVETAILS, IT DOES NOT STOP AND RESTART. It belongs to the launch, not
// to the credits scene: the menu hiss comes up on the title's enter while the
// weather is still going out under it, which is the same handoff the picture
// makes with its last few particles. Parking it here is what lets the sound
// cross the scene swap at all.
export function attachBootWeatherAudio(runtime) { bed = runtime || null; }

export function bootWeatherAudio() { return bed; }

export function endBootWeather() {
  bed?.stop?.({ fade: 0.5 });
  bed = null;
  live = null;
}

export function bootWeatherDebug() {
  if (!live) return null;
  return {
    audible: !!bed?.active?.(),
    kind: live.kind,
    enabled: live.enabled,
    particles: live.particles.length,
    time: +live.time.toFixed(2),
    fade: +live.fade.toFixed(3),
    phase: live.calm ? 'calm' : live.settling ? 'clearing' : 'weather',
    density: live.density,
  };
}
