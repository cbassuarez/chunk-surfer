import { normalizePressureGait, pressureGaitVisibility, PRESSURE_GAIT } from './pressure-gait.js';

// Presentation only. Presence, Source bracketing and contact keep all gameplay
// authority. Positions use the renderer's physical half-metre cells; floorH is
// metres. No camera, wall clock, renderer or persistence is read here.
export const PRESSURE_ROLES = Object.freeze(['live-pressure', 'source-rear', 'source-front', 'court-trace', 'tenant',
  'plant-hallucination', 'recording-hallucination', 'legacy-pressure', 'dock-tableau', 'plant-tableau']);
export const PRESSURE_CLIPS = Object.freeze(['pressure_idle', 'pressure_approach', 'pressure_hold', 'pressure_limp', 'pressure_listen',
  'pressure_load', 'pressure_advance', 'pressure_pivot', 'pressure_arrest']);
export const PRESSURE_MOTIONS = Object.freeze(['idle', 'hunt', 'listen', 'limp', 'investigate']);
export const PRESSURE_CUES = Object.freeze(['still', 'lean', 'lean-in', 'recoil', 'step-in', 'step-back', 'step-side', 'turn', 'double', 'mirror', 'flicker', 'dim']);
const MAX_TIME = 3600000;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const bounded = (value, lo, hi, fallback = lo) => Math.max(lo, Math.min(hi, finite(value, fallback)));
const angle = value => Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));
const clone = value => value == null ? null : JSON.parse(JSON.stringify(value));
const enumValue = (value, values, fallback) => values.includes(value) ? value : fallback;
const staticRoles = new Set(['tenant', 'plant-hallucination', 'recording-hallucination']);
const authoredRoles = new Set(['source-rear', 'source-front', 'court-trace', 'dock-tableau', 'plant-tableau']);

function normalizeActor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value.performance;
  if (!p || !PRESSURE_ROLES.includes(p.role) || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.y))) return null;
  const cue = p.cue && PRESSURE_CUES.includes(p.cue.name)
    ? { name: p.cue.name, elapsed: bounded(p.cue.elapsed, 0, 30) } : null;
  const gait = normalizePressureGait(p.gait);
  return {
    id: typeof value.id === 'string' && value.id ? value.id.slice(0, 96) : p.role,
    x: bounded(value.x, -1000000, 1000000), y: bounded(value.y, -1000000, 1000000), floorH: bounded(value.floorH, -10000, 10000, 0),
    strength: bounded(value.strength, 0, 1, .96), radiusM: bounded(value.radiusM, 0, 100, 5.2),
    heightM: bounded(value.heightM, .4, 4, 2.18), widthM: bounded(value.widthM, .1, 2, .68),
    glow: value.glow == null ? null : bounded(value.glow, 0, 3.2), mode: enumValue(value.mode, ['live', 'core', 'glow', 'off'], null),
    performance: { version: 1, role: p.role, heading: angle(p.heading), clip: enumValue(p.clip, PRESSURE_CLIPS, 'pressure_hold'),
      time: bounded(p.time, 0, MAX_TIME), loop: p.loop !== false, seed: Math.floor(bounded(p.seed, 0, 4294967295)),
      manifestation: bounded(p.manifestation, 0, 1), motion: enumValue(p.motion, PRESSURE_MOTIONS, 'idle'), cue,
      reducedMotion: p.reducedMotion === true, ...(gait ? { gait } : {}) },
  };
}

export function normalizePressurePresentation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return { version: 1, clock: bounded(value.clock, 0, MAX_TIME), primary: normalizeActor(value.primary), secondary: normalizeActor(value.secondary) };
}

// Only compatible performances interpolate. A role, clip or cue boundary is a
// discrete sampled change, never a blend between unrelated actors or clocks.
export function interpolatePressurePresentation(a, b, amount) {
  const first = normalizePressurePresentation(a), second = normalizePressurePresentation(b), t = bounded(amount, 0, 1);
  if (!first || !second) return clone(t < .5 ? first : second);
  const lerp = (x, y) => x + (y - x) * t;
  function actor(x, y) {
    if (!x || !y || x.id !== y.id || x.performance.role !== y.performance.role || x.performance.clip !== y.performance.clip
      || x.performance.cue?.name !== y.performance.cue?.name || x.performance.reducedMotion !== y.performance.reducedMotion
      || x.performance.gait?.phase !== y.performance.gait?.phase || x.performance.gait?.cycle !== y.performance.gait?.cycle
      || x.performance.gait?.pivot !== y.performance.gait?.pivot || x.performance.gait?.redirect !== y.performance.gait?.redirect
      || x.performance.gait?.recoveryReset !== y.performance.gait?.recoveryReset
      || y.performance.time < x.performance.time || (x.performance.cue && y.performance.cue.elapsed < x.performance.cue.elapsed)) return clone(t < .5 ? x : y);
    const result = clone(t < .5 ? x : y);
    for (const key of ['x', 'y', 'floorH', 'strength', 'radiusM', 'heightM', 'widthM']) result[key] = lerp(x[key], y[key]);
    result.performance.heading = angle(x.performance.heading + angle(y.performance.heading - x.performance.heading) * t);
    result.performance.time = lerp(x.performance.time, y.performance.time);
    result.performance.manifestation = lerp(x.performance.manifestation, y.performance.manifestation);
    if (result.performance.cue) result.performance.cue.elapsed = lerp(x.performance.cue.elapsed, y.performance.cue.elapsed);
    if (result.performance.gait) {
      for (const key of ['elapsed', 'duration', 'travelMetres', 'progress', 'listenTurn', 'blockedElapsed']) {
        result.performance.gait[key] = lerp(x.performance.gait[key], y.performance.gait[key]);
      }
      result.performance.gait.heading = result.performance.heading;
    }
    return result;
  }
  return { version: 1, clock: lerp(first.clock, second.clock), primary: actor(first.primary, second.primary), secondary: actor(first.secondary, second.secondary) };
}

export function createPressurePerformance(initial = null) {
  let state = normalizePressurePresentation(initial) || { version: 1, clock: 0, primary: null, secondary: null };
  let replay = false, seed = 0, liveBeforeReplay = null;
  const pendingCues = new Map();

  function tickActor(previous, incoming, dt, reducedMotion) {
    if (!incoming) {
      if (!previous) return null;
      const fading = clone(previous);
      fading.performance.manifestation *= Math.exp(-dt * 4);
      return fading.performance.manifestation < .002 ? null : fading;
    }
    const role = enumValue(incoming.role, PRESSURE_ROLES, 'live-pressure');
    const id = String(incoming.id || role).slice(0, 96), same = previous?.id === id && previous.performance.role === role;
    const old = same ? previous.performance : null;
    // Only the real ordinary hunter lends us a scheduler. Source roots and
    // borrowed tableaux keep their authored position/continuous gait contract.
    const gait = role === 'live-pressure' ? normalizePressureGait(incoming.gait) : null;
    const motion = enumValue(incoming.motion, PRESSURE_MOTIONS, 'idle');
    const dx = same ? incoming.x - previous.x : 0, dz = same ? incoming.y - previous.y : 0;
    const vx = finite(incoming.velocityX), vz = finite(incoming.velocityY);
    const travelling = Math.hypot(dx, dz) > .001, moving = Math.hypot(vx, vz) > .02 || travelling;
    const heading = gait ? gait.heading : Number.isFinite(incoming.heading) ? incoming.heading
      : Math.hypot(vx, vz) > .02 ? Math.atan2(vx, -vz) : travelling ? Math.atan2(dx, -dz) : old?.heading ?? 0;
    const clip = reducedMotion || staticRoles.has(role) || (authoredRoles.has(role) && !moving) ? 'pressure_hold'
      : gait?.phase === 'recover' ? gait.recoveryReset ? 'pressure_arrest' : gait.recoveryClip
      : gait ? gait.phase === 'load' || gait.redirect && gait.phase === 'advance' ? 'pressure_load'
        : gait.phase === 'advance' ? gait.pivot ? 'pressure_pivot' : 'pressure_advance' : 'pressure_arrest'
      : motion === 'limp' ? 'pressure_limp'
      : motion === 'listen' ? 'pressure_listen' : moving || motion === 'hunt' || motion === 'investigate' ? 'pressure_approach' : 'pressure_idle';
    let time = old?.clip === clip ? old.time : 0;
    if (gait) {
      time = reducedMotion ? 0 : gait.phase === 'load'
        ? gait.elapsed / gait.duration * PRESSURE_GAIT.loadClipSeconds
        : gait.phase === 'recover' ? gait.recoveryReset ? 1 : gait.recoveryTime
        : gait.phase === 'advance' ? gait.redirect ? PRESSURE_GAIT.loadClipSeconds : gait.progress * PRESSURE_GAIT.advanceClipSeconds : 1;
    } else if (clip === 'pressure_approach' || clip === 'pressure_limp') {
      // Authored in-place cycles advance by actual travel, not by a chase flag.
      // A blocked actor must not continue walking while its root is stationary.
      const travel = Math.hypot(dx, dz) * .5;
      time += travel * (clip === 'pressure_limp' ? 3.4 / .375 : 2.4 / .50);
    } else if (clip !== 'pressure_hold') time += dt;
    let cue = same ? clone(old.cue) : null;
    if (cue) { cue.elapsed += dt; if (cue.elapsed > 8) cue = null; }
    const queued = pendingCues.get(role);
    if (queued) { cue = { name: queued, elapsed: 0 }; pendingCues.delete(role); }
    return normalizeActor({ ...incoming, id, performance: { version: 1, role, heading, clip, time, loop: !gait, seed: incoming.seed ?? seed,
      manifestation: gait?.phase === 'recover' ? pressureGaitVisibility(gait)
        : 1 - (1 - (old?.manifestation || 0)) * Math.exp(-dt * 7.2), motion, cue, reducedMotion, ...(gait ? { gait } : {}) } });
  }

  return {
    tick(dt, { primary = null, secondary = null, suspended = false, reducedMotion = false } = {}) {
      if (suspended) return clone(state);
      if (replay && liveBeforeReplay) state = liveBeforeReplay;
      liveBeforeReplay = null;
      replay = false;
      const elapsed = bounded(dt, 0, .25);
      state = { version: 1, clock: Math.min(MAX_TIME, state.clock + elapsed),
        primary: tickActor(state.primary, primary, elapsed, reducedMotion), secondary: tickActor(state.secondary, secondary, elapsed, reducedMotion) };
      return clone(state);
    },
    cue(name, role = 'court-trace') {
      if (replay || !PRESSURE_CUES.includes(name) || !PRESSURE_ROLES.includes(role)) return false;
      pendingCues.set(role, name); return true;
    },
    snapshot: () => clone(state),
    applyFrame(value) {
      if (!replay) liveBeforeReplay = clone(state);
      replay = true; pendingCues.clear();
      state = normalizePressurePresentation(value) || { version: 1, clock: 0, primary: null, secondary: null };
      return clone(state);
    },
    clearReplay() {
      if (replay && liveBeforeReplay) state = liveBeforeReplay;
      liveBeforeReplay = null; replay = false; pendingCues.clear();
    },
    reset(options = {}) {
      seed = Math.floor(bounded(options.seed, 0, 4294967295)); replay = false; liveBeforeReplay = null; pendingCues.clear();
      state = { version: 1, clock: 0, primary: null, secondary: null }; return clone(state);
    },
    isReplay: () => replay,
  };
}
