import { CELL } from '../data/floorplan/legend.js';
import { normalizePressurePresentation } from '../game/pressure-performance.js';
import { hushPoseAt } from './hush-pose.js';
import { PRESSURE_GAIT } from '../game/pressure-gait.js';

const HEIGHT = 2.18;
const MODES = ['live', 'core', 'glow', 'off'];
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const angle = value => Math.atan2(Math.sin(value), Math.cos(value));
const smooth = value => { const u = clamp(value, 0, 1); return u * u * (3 - 2 * u); };
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function rotation(x = 0, y = 0, z = 0) {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}
function actor(value, index, reducedMotion) {
  if (!value || typeof value !== 'object' || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  // Legacy callers get a static volume. No elapsed time, camera bearing or
  // active Presence state is synthesized in this renderer adapter.
  const input = value.performance ? value : { ...value, id: value.id || `legacy-pressure:${index}`,
    performance: { version: 1, role: 'legacy-pressure', heading: finite(value.heading), clip: 'pressure_hold', time: 0,
      loop: false, seed: 0, manifestation: 1, motion: 'idle', cue: null, reducedMotion: reducedMotion === true } };
  return normalizePressurePresentation({ primary: input })?.primary || null;
}

// Convert a frozen simulation performance into physical mesh submissions.
// All cue motion is evaluated from its captured elapsed time. There is no
// render clock, billboard orientation or cue-driven body scaling here.
export function pressureInstances(primary, secondary, { mode = 'live', reducedMotion = false, reduceFlash = false } = {}) {
  if (mode === 'off') return freeze([]);
  const result = [];
  for (const [index, raw] of [primary, secondary].entries()) {
    const a = actor(raw, index, reducedMotion);
    if (!a) continue;
    const p = a.performance, resolvedMode = MODES.includes(a.mode) ? a.mode : MODES.includes(mode) ? mode : 'live';
    if (resolvedMode === 'off') continue;
    const capturedPose = hushPoseAt(p.cue?.name, 0, p.cue?.elapsed ?? -1, { reducedMotion: p.reducedMotion });
    // Current comfort settings may soften a recorded cue, but cannot rewrite
    // its world path, bearing, authored clip or sampled animation clock.
    const pose = hushPoseAt(p.cue?.name, 0, p.cue?.elapsed ?? -1, { reducedMotion: reducedMotion === true || p.reducedMotion });
    const flicker = !reduceFlash && pose.flicker > 0 && Math.floor((p.cue?.elapsed || 0) * 9) % 2 ? 1 - pose.flicker * .72 : 1;
    const strength = a.strength * p.manifestation * (1 - pose.dim) * flicker;
    if (strength <= .001) continue;
    const yaw = angle(p.heading + capturedPose.turn * 1.35);
    const forward = [Math.sin(p.heading), -Math.cos(p.heading)], right = [Math.cos(p.heading), Math.sin(p.heading)];
    const advance = (capturedPose.scale - 1) * 1.8, lateral = capturedPose.shift * a.widthM;
    const x = (a.x + .5) * CELL + forward[0] * advance + right[0] * lateral;
    const z = (a.y + .5) * CELL + forward[1] * advance + right[1] * lateral;
    const effort = clamp(Math.abs(pose.tilt) * 4 + Math.abs(pose.scale - 1) * 2, 0, 1);
    // A planted hunter can attend only to its captured sound/nav bearing.
    // The chest anticipates the next foot turn; the sealed head follows less.
    // Comfort softens this articulation without changing the saved root path.
    const listenTurn = p.gait && !reducedMotion && !p.reducedMotion ? p.gait.listenTurn : 0;
    const scale = a.heightM / HEIGHT;
    let support;
    if (p.gait && !p.gait.redirect && (p.gait.phase === 'advance' || p.gait.phase === 'recover' && !p.gait.recoveryReset)) {
      const g = p.gait, u = clamp(g.progress ?? g.travelMetres / PRESSURE_GAIT.strideMetres, 0, 1);
      // Contact anchors live in the recorded navigation frame. Inverse yaw
      // puts them into this actual mesh frame; only the leg chain is solved.
      // The right support keeps its original bearing until it lifts, while
      // the left lands in the final bearing after the release turn completes.
      const local = (dx, dz) => [
        (Math.cos(p.heading) * dx + Math.sin(p.heading) * dz) / scale, 0,
        (-Math.sin(p.heading) * dx + Math.cos(p.heading) * dz) / scale,
      ];
      const dx = (g.stepStartX - a.x) * CELL, dz = (g.stepStartY - a.y) * CELL;
      const distance = g.pivot ? 0 : g.stepDistanceMetres ?? PRESSURE_GAIT.strideMetres;
      support = { clip: 'pressure_arrest', time: 1, contacts: [
        { side: 'R', yaw: angle(g.startHeading - p.heading), offset: local(dx, dz),
          weight: 1 - smooth((u - .58) / .42) },
        { side: 'L', yaw: angle(g.targetHeading - p.heading),
          offset: local(dx + Math.sin(g.targetHeading) * distance,
            dz - Math.cos(g.targetHeading) * distance),
          weight: smooth((u - .30) / .08) },
      ] };
    }
    function instance(id, echo = false) {
      const sign = echo && p.cue?.name === 'mirror' ? -.7 : 1;
      const tilt = clamp(pose.tilt * sign, -.12, .12);
      const turn = clamp(pose.turn * .12 * sign, -.12, .12);
      return {
        id, mesh: 'pressure_body', x, y: a.floorH, z, yaw, scale,
        character: { clip: p.clip, time: Math.max(0, p.time - (echo ? .18 : 0)), loop: p.loop,
          ...(support ? { support } : {}),
          morphs: { sternum_sink: effort * .42, collar_draw: effort * .26, scapula_lock: effort * .35,
            longitudinal_tension: clamp(pose.turn * .24 + effort * .16, 0, 1) },
          // The authored clips own limbs and floor contact. Restrained local
          // joint offsets articulate the sealed head and shoulder envelope.
          joints: { chest: { rotation: rotation(tilt, turn * .3 + listenTurn * .55, 0) },
            neck: { rotation: rotation(-tilt * .36, turn * .45 + listenTurn * .10, 0) },
            head: { rotation: rotation(tilt * .18, turn * .55 + listenTurn * .06, 0) },
            clavicle_L: { rotation: rotation(0, 0, effort * .035 * sign) },
            clavicle_R: { rotation: rotation(0, 0, -effort * .025 * sign) } } },
        pressure: { strength: strength * (echo ? pose.ghost * .72 : 1),
          glow: a.glow ?? (.88 + a.strength * .22), mode: resolvedMode, seed: p.seed },
      };
    }
    result.push(instance(`pressure:${a.id}:${index}`));
    if (pose.ghost > .001) {
      const extra = instance(`pressure:${a.id}:${index}:overprint`, true);
      const separation = Math.max(.06, Math.abs(capturedPose.lag) * a.widthM);
      extra.x += right[0] * separation - forward[0] * .12;
      extra.z += right[1] * separation - forward[1] * .12;
      extra.yaw = angle(yaw + (p.cue?.name === 'mirror' ? -.08 : .04) * pose.ghost);
      result.push(extra);
    }
  }
  return freeze(result.slice(0, 4));
}
