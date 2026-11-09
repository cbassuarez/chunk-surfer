// Simulation-owned performance for HUSH's nonhuman density. This module has no
// camera, clock, sound acquisition, navigation or contact authority. A phase is
// a bounded representation of accepted displacement, never a second mover.
export const HUSH_DENSITY_VERSION = 1;
export const HUSH_DENSITY_LIMITS = Object.freeze({
  cycleMetres: .50, maxCyclesPerSecond: 2, maxPhase: 1000000,
  noticeSeconds: 4.8, settleSeconds: 6.4, attentionRadians: .65,
});
const events = ['still', 'travel', 'notice', 'load', 'blocked', 'settle'];
const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v, lo = 0, hi = 1, fallback = lo) => Math.max(lo, Math.min(hi, finite(v, fallback)));
const angle = v => Math.atan2(Math.sin(finite(v)), Math.cos(finite(v)));
const smooth = v => { const u = clamp(v); return u * u * (3 - 2 * u); };
const follow = (from, to, dt, seconds) => {
  const value = from + (to - from) * (1 - Math.exp(-dt / seconds));
  return Math.abs(value - to) < .000001 ? to : value;
};
const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));

export function hushDensityUsesRole(role) { return typeof role === 'string' && role !== 'tenant'; }

export function normalizeHushDensityPose(value) {
  if (!value || value.version !== HUSH_DENSITY_VERSION) return null;
  return { version: HUSH_DENSITY_VERSION, phase: clamp(value.phase, 0, HUSH_DENSITY_LIMITS.maxPhase),
    rate: clamp(value.rate, 0, HUSH_DENSITY_LIMITS.maxCyclesPerSecond),
    traction: clamp(value.traction), drive: clamp(value.drive), compression: clamp(value.compression), retained: clamp(value.retained),
    attention: clamp(value.attention, -HUSH_DENSITY_LIMITS.attentionRadians, HUSH_DENSITY_LIMITS.attentionRadians, 0),
    event: events.includes(value.event) ? value.event : 'still', eventTime: clamp(value.eventTime, 0, 30),
    listening: value.listening === true, blocked: value.blocked === true,
    seed: Math.floor(clamp(value.seed, 0, 4294967295)), residualDragMps: clamp(value.residualDragMps, 0, 1000) };
}

export function freshHushDensityPose(seed = 0) {
  return normalizeHushDensityPose({ version: HUSH_DENSITY_VERSION, seed, compression: .22, retained: .22 });
}

export function stepHushDensityPose(previous, {
  dt = 0, acceptedMetres = 0, headingDelta = 0, listenTurn = 0,
  listening = false, blocked = false, loading = false, loadProgress = 0,
  seed = 0, reducedMotion = false,
} = {}) {
  const old = normalizeHushDensityPose(previous) || freshHushDensityPose(seed);
  const elapsed = clamp(dt, 0, .25);
  if (!elapsed) return copy(old);
  const travel = clamp(acceptedMetres, 0, 1000), moving = travel > .000001;
  const speed = travel / elapsed, represented = Math.min(travel / HUSH_DENSITY_LIMITS.cycleMetres,
    HUSH_DENSITY_LIMITS.maxCyclesPerSecond * elapsed);
  const next = copy(old);
  // Comfort holds the captured material configuration rather than making it
  // absent or spending hidden travel that will burst out on resume.
  if (!reducedMotion) next.phase = Math.min(HUSH_DENSITY_LIMITS.maxPhase, old.phase + represented);
  next.rate = reducedMotion ? 0 : represented / elapsed;
  next.residualDragMps = Math.max(0, speed - next.rate * HUSH_DENSITY_LIMITS.cycleMetres);
  next.traction = reducedMotion ? old.traction : follow(old.traction, moving ? 1 : 0, elapsed, moving ? .12 : .28);
  // Chase posture follows accepted speed with finite loading/release. It does
  // not spend a new travel phase or snap back when the collider stops.
  next.drive = reducedMotion ? old.drive : follow(old.drive, moving ? smooth((speed - .65) / 1.65) : 0,
    elapsed, moving ? .16 : .24);
  next.retained = blocked ? Math.max(.86, old.retained) : moving
    ? Math.max(.22, old.retained * Math.exp(-travel / .55)) : old.retained;
  const compressionTarget = blocked ? .98 : loading ? .45 + clamp(loadProgress) * .43
    : moving ? .30 + .22 * next.traction : next.retained;
  if (!reducedMotion) {
    next.compression = follow(old.compression, compressionTarget, elapsed, blocked ? .14 : .24);
    // Both inputs are already accepted game information. This is an inertial
    // fold response, not a look-at operation or a newly acquired target.
    const attentionTarget = clamp(listenTurn - angle(headingDelta) * .7, -.65, .65);
    next.attention = follow(old.attention, attentionTarget, elapsed, .32);
  }
  let event = old.event, eventTime = Math.min(30, old.eventTime + elapsed);
  if (blocked && !old.blocked) { event = 'blocked'; eventTime = 0; }
  else if (listening && !old.listening) { event = 'notice'; eventTime = 0; }
  else if (moving && old.event !== 'notice' && old.event !== 'blocked') { event = 'travel'; eventTime = 0; }
  else if (loading && !['notice', 'blocked'].includes(old.event)) { event = 'load'; eventTime = 0; }
  else if (!moving && !loading && ['travel', 'load'].includes(old.event)) { event = 'settle'; eventTime = 0; }
  if (event === 'notice' && eventTime >= HUSH_DENSITY_LIMITS.noticeSeconds
    || ['blocked', 'settle'].includes(event) && eventTime >= HUSH_DENSITY_LIMITS.settleSeconds) {
    event = moving ? 'travel' : 'still'; eventTime = 0;
  }
  next.event = reducedMotion ? old.event : event;
  next.eventTime = reducedMotion ? old.eventTime : ['still', 'travel', 'load'].includes(event) ? 0 : eventTime;
  next.listening = listening === true; next.blocked = blocked === true;
  return normalizeHushDensityPose(next);
}

export function interpolateHushDensityPose(first, second, amount) {
  const a = normalizeHushDensityPose(first), b = normalizeHushDensityPose(second), t = clamp(amount);
  if (!a || !b || a.seed !== b.seed || a.event !== b.event || a.listening !== b.listening || a.blocked !== b.blocked
    || b.phase < a.phase || b.eventTime < a.eventTime) return copy(t < .5 ? a : b);
  const out = copy(a);
  for (const key of ['phase', 'rate', 'traction', 'drive', 'compression', 'retained', 'attention', 'eventTime', 'residualDragMps']) {
    out[key] = a[key] + (b[key] - a[key]) * t;
  }
  return normalizeHushDensityPose(out);
}

// Raw authored tableaux and old recordings can lack a density state. Their
// existing captured animation time supplies one finite slow packet. It does not
// invent a render clock, repeated locomotion, or a stored sound belief.
export function hushDensityFromCaptured(performance = {}) {
  const captured = normalizeHushDensityPose(performance.density);
  if (captured) return captured;
  const pose = freshHushDensityPose(performance.seed);
  const time = clamp(performance.time, 0, 3600000);
  pose.event = time > 0 ? 'settle' : 'still';
  pose.eventTime = Math.min(HUSH_DENSITY_LIMITS.settleSeconds, time / 16);
  return pose;
}

function rotation(x, y, z) {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}

// A travelling capture, finite hold and unpeeling release. A wrapped phase
// supplies continuity across a cycle; this is not perpetual time-based sway.
export function hushDensityTravelPacket(phase, offset = 0, duration = .56) {
  const u = ((finite(phase) - finite(offset)) % 1 + 1) % 1;
  const length = clamp(duration, .01, .99);
  if (u >= length) return 0;
  const t = u / length;
  return t < .24 ? smooth(t / .24) : t < .54 ? 1 : 1 - smooth((t - .54) / .46);
}

export function hushDensityCharacter(performance = {}, { reducedMotion = performance.reducedMotion === true } = {}) {
  const d = hushDensityFromCaptured(performance);
  const character = { clip: 'pressure_approach', time: d.phase * 2.4, loop: true };
  if (!reducedMotion && d.drive > .000001) character.blend = {
    clip: 'density_chase', time: d.phase * 2.4, loop: true, weight: d.drive * .78,
  };
  // The renderer supports two clip layers. Release the captured chase load
  // before admitting the finite response, rather than replacing a large chase
  // weight with an unrelated settling pose on the first stopped frame.
  if (!reducedMotion && d.drive < .05 && ['notice', 'blocked', 'settle'].includes(d.event)) {
    const length = d.event === 'notice' ? 4.8 : 6.4, age = clamp(d.eventTime, 0, length);
    const weight = smooth(age / .24) * smooth((length - age) / .36)
      * smooth((.05 - d.drive) / .05) * (d.event === 'notice' ? .72 : .48);
    if (weight > .000001) character.blend = { clip: d.event === 'notice' ? 'density_listen' : 'density_idle',
      time: age, loop: false, weight };
  }
  const joints = {};
  for (const [fold, offset, side] of [['A', .22, -1], ['B', 0, 0], ['C', .48, 1]]) for (let station = 1; station <= 5; station++) {
    const distal = (station / 5) ** 2;
    // Travelling articulation rides the accepted-displacement wave. Distal
    // folds curl before their heavier attachment catches up; the unequal
    // residue is material motion, never another root or a footstep cycle.
    const arrival = offset + (1 - station / 5) * .27;
    const curl = reducedMotion ? 0 : (hushDensityTravelPacket(d.phase, arrival)
      - .25 * hushDensityTravelPacket(d.phase, arrival + .30, .40)) * d.traction * .42;
    joints[`fold_${fold}_${station}`] = {
      rotation: rotation(curl * .20 * distal, d.attention * .12 * distal,
        (side * d.compression * .10 + curl * .08) * distal),
      translation: [(-side * d.compression * .028 + d.attention * .025 + curl * .012) * distal,
        (-d.compression * .018 + curl * .018) * distal,
        ((fold === 'B' ? -.025 : .018) * d.compression + curl * .035) * distal],
    };
  }
  character.joints = joints;
  return character;
}
