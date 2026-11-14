import { HUSH_POSTURE_LEGS } from '../data/generated/hush-last-posture-support.js';
export { HUSH_POSTURE_LEGS };

// Simulation-owned performance for HUSH's terminal adult posture. This module has no
// camera, clock, sound acquisition, navigation or contact authority. A phase is
// a bounded representation of accepted displacement, never a second mover.
export const HUSH_DENSITY_VERSION = 1;
export const HUSH_DENSITY_LIMITS = Object.freeze({
  cycleMetres: 1.10, maxCyclesPerSecond: 3, maxPhase: 1000000,
  noticeSeconds: 4.8, settleSeconds: 6.4, attentionRadians: .65,
  noticeDelaySeconds: 1.1, regroundSeconds: .8,
  releasedClearanceM: .055, releasedTrailM: .12,
});
// Anatomical bind contract, metres, from the editable Last Posture rig. The
// conservative reach test releases a support before IK would shorten its
// target and silently drag a supposedly planted sole across the floor.
const events = ['still', 'travel', 'notice', 'load', 'blocked', 'settle'];
const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v, lo = 0, hi = 1, fallback = lo) => Math.max(lo, Math.min(hi, finite(v, fallback)));
const angle = v => { const n = finite(v); return n === 0 ? 0 : n >= -Math.PI && n <= Math.PI ? n : Math.atan2(Math.sin(n), Math.cos(n)); };
const smooth = v => { const u = clamp(v); return u * u * (3 - 2 * u); };
const follow = (from, to, dt, seconds) => {
  const value = from + (to - from) * (1 - Math.exp(-dt / seconds));
  return Math.abs(value - to) < .000001 ? to : value;
};
const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const sides = ['L', 'R'];
const landingPhase = side => side === 'R' ? .34 : .84;
const gatherPhase = side => side === 'R' ? .08 : .58;
const landingLeadM = .30;
const crouchAmount = drop => smooth((drop - .08) / .16);
const strideAllowance = drop => 1 - .64 * crouchAmount(drop);
const rotate = (point, yaw) => [Math.cos(yaw) * point[0] - Math.sin(yaw) * point[1],
  Math.sin(yaw) * point[0] + Math.cos(yaw) * point[1]];
const initialFoot = (side, phase = 0, active = true) => ({ offset: [0, 0], height: 0, yaw: 0,
  landing: Math.floor(phase - landingPhase(side)), active });

// Windows match the anatomical clips. Upper weight begins before .08; the
// right foot then gathers, with the left half a cycle late. A zero weight is
// an explicitly free foot, never a claim that an authored clip plants it.
export function hushDensityContactWeight(phase, side) {
  const u = ((finite(phase) - (side === 'R' ? .08 : .58)) % 1 + 1) % 1;
  return u < .06 ? 1 - smooth(u / .06) : u < .26 ? 0 : u < .35 ? smooth((u - .26) / .09) : 1;
}

function normalizedFoot(value, side, phase) {
  if (!value || !Array.isArray(value.offset) || value.offset.length !== 2
    || value.offset.some(v => !Number.isFinite(v) || Math.abs(v) > 2)) return initialFoot(side, phase, false);
  return { offset: [...value.offset], height: clamp(value.height, -2, 2, 0), yaw: angle(value.yaw),
    landing: Math.floor(clamp(value.landing, -1, HUSH_DENSITY_LIMITS.maxPhase)), active: value.active === true };
}

export function hushDensityUsesRole(role) { return typeof role === 'string' && role !== 'tenant'; }

export function normalizeHushDensityPose(value) {
  if (!value || value.version !== HUSH_DENSITY_VERSION) return null;
  // Revision one used .50m fold cycles. Migrate distance once, not on every
  // read, without pretending that an old save contains anatomical foot facts.
  const current = value.postureVersion === 2;
  const phase = clamp(finite(value.phase) * (current ? 1 : .5 / HUSH_DENSITY_LIMITS.cycleMetres), 0, HUSH_DENSITY_LIMITS.maxPhase);
  return { version: HUSH_DENSITY_VERSION, postureVersion: 2, phase,
    rate: clamp(finite(value.rate) * (current ? 1 : .5 / HUSH_DENSITY_LIMITS.cycleMetres), 0, HUSH_DENSITY_LIMITS.maxCyclesPerSecond),
    traction: clamp(value.traction), drive: clamp(value.drive), compression: clamp(value.compression), retained: clamp(value.retained),
    attention: clamp(value.attention, -HUSH_DENSITY_LIMITS.attentionRadians, HUSH_DENSITY_LIMITS.attentionRadians, 0),
    event: events.includes(value.event) ? value.event : 'still', eventTime: clamp(value.eventTime, 0, 30),
    listening: value.listening === true, blocked: value.blocked === true, unsupported: value.unsupported === true,
    pivot: value.pivot === true, pivotProgress: clamp(value.pivotProgress), settlingFeet: value.settlingFeet === true,
    pivotStart: value.pivot === true ? Object.fromEntries(sides.map(side => [side,
      normalizedFoot(value.pivotStart?.[side], side, phase)])) : null,
    clearanceTurn: angle(value.clearanceTurn), release: clamp(value.release),
    doorEngaged: value.doorEngaged === true, doorDrop: clamp(value.doorDrop, 0, .26),
    doorX: clamp(value.doorX, -.44, .44, 0), doorZ: clamp(value.doorZ, -.44, .44, 0),
    feet: Object.fromEntries(sides.map(side => [side, normalizedFoot(current ? value.feet?.[side] : null, side, phase)])),
    seed: Math.floor(clamp(value.seed, 0, 4294967295)), residualDragMps: clamp(value.residualDragMps, 0, 1000) };
}

export function freshHushDensityPose(seed = 0) {
  return normalizeHushDensityPose({ version: HUSH_DENSITY_VERSION, postureVersion: 2, seed, compression: .22, retained: .22,
    feet: Object.fromEntries(sides.map(side => [side, initialFoot(side)])) });
}

export function stepHushDensityPose(previous, {
  dt = 0, acceptedMetres = 0, headingDelta = 0, listenTurn = 0,
  listening = false, blocked = false, loading = false, loadProgress = 0,
  seed = 0, reducedMotion = false, acceptedDelta = null, acceptedFloorDelta = 0, resetSupport = false, unsupported = false,
  clearanceM = null, upcomingClearanceM = null, normalWidthM = .90, doorPosture = null, heading = 0,
  pivot = null,
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
    // Both inputs are already accepted game information, never a look-at
    // operation or a newly acquired target.
    const attentionTarget = clamp(listenTurn - angle(headingDelta) * .7, -.65, .65);
    next.attention = follow(old.attention, attentionTarget, elapsed, .32);
  }
  const narrow = [clearanceM, upcomingClearanceM].some(v => v != null && Number.isFinite(v) && v < clamp(normalWidthM, .3, 2, .90) - .01);
  next.doorEngaged = doorPosture != null;
  next.clearanceTurn = next.doorEngaged ? angle(doorPosture.turn)
    : old.doorEngaged ? 0 : follow(old.clearanceTurn, narrow ? Math.PI / 2 : 0, elapsed, .17);
  next.doorDrop = clamp(doorPosture?.drop, 0, .26);
  next.doorX = clamp(doorPosture?.x, -.44, .44, 0);
  next.doorZ = clamp(doorPosture?.z, -.44, .44, 0);
  next.unsupported = unsupported === true;
  if (!reducedMotion) {
    const capacity = HUSH_DENSITY_LIMITS.cycleMetres * HUSH_DENSITY_LIMITS.maxCyclesPerSecond;
    // Source can carry the upper mass faster than adult feet can gather. It
    // releases both supports shallowly instead of selling a false floor plant
    // or playing an ever faster ordinary run. The navigation root never lifts.
    next.release = follow(old.release, moving && speed > capacity + .001 ? 1 : 0, elapsed, moving ? .10 : .24);
    const supplied = acceptedDelta && Number.isFinite(acceptedDelta.x) && Number.isFinite(acceptedDelta.z);
    let delta = supplied ? [acceptedDelta.x, acceptedDelta.z] : [0, -travel];
    // A caller must not smuggle a spatial transfer into the contact offsets.
    const length = Math.hypot(...delta);
    if (length > travel + .000001 && length) delta = delta.map(v => v * travel / length);
    const presentationDelta = rotate([next.doorX - old.doorX, next.doorZ - old.doorZ], -angle(heading));
    delta = delta.map((v, k) => v + presentationDelta[k]);
    const turn = angle(headingDelta), amount = next.phase - old.phase, floorDelta = clamp(acceptedFloorDelta, -1000, 1000, 0);
    for (const side of sides) {
      let foot = copy(old.feet[side]);
      const transformed = rotate(foot.offset, -turn);
      foot.offset = transformed.map((v, i) => v - delta[i]); foot.yaw = angle(foot.yaw - turn);
      foot.height -= floorDelta;
      const landing = Math.floor(next.phase - landingPhase(side));
      if (landing > foot.landing && amount > 0) {
        const at = landing + landingPhase(side), remaining = clamp((next.phase - at) / amount);
        // Touchdown starts before full weight. By the end of the landing
        // window the target is ~.20m ahead, then passes beneath the body.
        const ahead = rotate([0, -landingLeadM * strideAllowance(next.doorDrop)], -turn * remaining);
        const landingTurn = old.clearanceTurn + (next.clearanceTurn - old.clearanceTurn) * (1 - remaining);
        foot = { offset: ahead.map((v, i) => v - delta[i] * remaining),
          height: -floorDelta * remaining, yaw: angle(landingTurn - turn * remaining), landing, active: true };
      }
      if (resetSupport || unsupported || next.release > .5 || Math.hypot(...foot.offset) > .85 || Math.abs(foot.height) > .6) foot = initialFoot(side, next.phase, false);
      // Following a release, a stopped free foot lowers once. No accepted
      // distance, phase advance or new root position is invented to do this.
      if (!moving && !foot.active && !resetSupport && !unsupported) {
        if (!old.pivot) {
          foot.offset = foot.offset.map(v => follow(v, 0, elapsed, .12));
          foot.height = follow(foot.height, 0, elapsed, .12);
          const difference = angle(next.clearanceTurn - foot.yaw);
          foot.yaw = angle(foot.yaw + difference - follow(difference, 0, elapsed, .12));
          foot.active = old.eventTime >= HUSH_DENSITY_LIMITS.regroundSeconds && next.release === 0
            && foot.height === 0 && foot.offset.every(v => v === 0) && Math.abs(difference) < .000001;
        }
      }
      next.feet[side] = foot;
    }
    // The ordinary navigator sometimes commits a stationary, bounded pivot.
    // Its already accepted progress is the only clock here: two finite foot
    // arcs complete that real turn, with no translational phase or observer.
    const pivoting = pivot && Number.isFinite(pivot.progress) && Number.isFinite(pivot.turn)
      && Number.isFinite(pivot.startHeadingDelta) && !unsupported && !resetSupport;
    if (pivoting) {
      const progress = clamp(pivot.progress), restarting = !old.pivot || progress < old.pivotProgress;
      next.pivot = true; next.pivotProgress = progress; next.pivotStart = {};
      for (const side of sides) {
        const start = copy(restarting ? old.feet[side] : old.pivotStart[side]);
        start.offset = rotate(start.offset, -turn).map((v, k) => v - delta[k]);
        start.height -= floorDelta; start.yaw = angle(start.yaw - turn);
        next.pivotStart[side] = start;
        const leadingFoot = pivot.turn >= 0 ? 'R' : 'L';
        const u = clamp(side === leadingFoot ? progress / .38 : (progress - .45) / .45), arc = smooth(u);
        const targetYaw = angle(pivot.startHeadingDelta + clamp(pivot.turn, -Math.PI / 4, Math.PI / 4, 0) + next.clearanceTurn);
        next.feet[side] = { ...start, offset: start.offset.map(v => v * (1 - arc)),
          yaw: angle(start.yaw + angle(targetYaw - start.yaw) * arc),
          height: start.height * (1 - arc) + 4 * u * (1 - u) * HUSH_DENSITY_LIMITS.releasedClearanceM,
          active: u === 1 || u === 0 && start.active };
      }
    } else {
      next.pivot = false; next.pivotProgress = 0; next.pivotStart = null;
      next.settlingFeet = (old.settlingFeet || old.pivot) && !Object.values(next.feet).every(f => f.active);
    }
  } else if (moving || Math.abs(angle(headingDelta)) > .000001 || Math.abs(finite(acceptedFloorDelta)) > .000001
    || Math.hypot(next.doorX - old.doorX, next.doorZ - old.doorZ) > .000001 || resetSupport) {
    // Comfort can keep the body still while its real root travels. Those
    // unseen old world contacts must not reappear as planted feet on resume.
    next.feet = Object.fromEntries(sides.map(side => [side, initialFoot(side, next.phase, false)]));
    next.pivot = false; next.pivotProgress = 0; next.pivotStart = null; next.settlingFeet = false;
  }
  let event = old.event, eventTime = Math.min(30, old.eventTime + elapsed);
  if (blocked && !old.blocked) { event = 'blocked'; eventTime = 0; }
  else if (listening && !old.listening) { event = 'notice'; eventTime = 0; }
  else if (moving && old.event !== 'notice' && old.event !== 'blocked') { event = 'travel'; eventTime = 0; }
  else if (loading && !['notice', 'blocked'].includes(old.event)) { event = 'load'; eventTime = 0; }
  else if (!moving && !loading && ['travel', 'load'].includes(old.event)) { event = 'settle'; eventTime = 0; }
  if (!moving && !['notice', 'blocked'].includes(event) && (resetSupport || old.pivot && !next.pivot)) {
    event = 'settle'; eventTime = 0;
  }
  if (!moving && !unsupported && old.event === 'still' && Object.values(next.feet).some(f => !f.active)) { event = 'settle'; eventTime = 0; }
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
  if (!a || !b || a.seed !== b.seed || a.event !== b.event || a.listening !== b.listening || a.blocked !== b.blocked || a.unsupported !== b.unsupported || a.pivot !== b.pivot || a.settlingFeet !== b.settlingFeet
    || b.phase < a.phase || b.eventTime < a.eventTime) return copy(t < .5 ? a : b);
  const out = copy(a);
  for (const key of ['phase', 'rate', 'traction', 'drive', 'compression', 'retained', 'attention', 'eventTime', 'residualDragMps', 'release', 'pivotProgress', 'doorDrop', 'doorX', 'doorZ']) {
    out[key] = a[key] + (b[key] - a[key]) * t;
  }
  out.clearanceTurn = angle(a.clearanceTurn + angle(b.clearanceTurn - a.clearanceTurn) * t);
  for (const side of sides) {
    // Phase remains continuous. An individual changed contact is discrete;
    // interpolating its old and new world anchors would slide a planted sole.
    if (a.feet[side].landing !== b.feet[side].landing || a.feet[side].active !== b.feet[side].active) out.feet[side] = copy(t < .5 ? a.feet[side] : b.feet[side]);
    else {
      out.feet[side].offset = a.feet[side].offset.map((v, k) => v + (b.feet[side].offset[k] - v) * t);
      out.feet[side].height = a.feet[side].height + (b.feet[side].height - a.feet[side].height) * t;
      out.feet[side].yaw = angle(a.feet[side].yaw + angle(b.feet[side].yaw - a.feet[side].yaw) * t);
    }
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

export function hushDensityCharacter(performance = {}, { reducedMotion = performance.reducedMotion === true,
  presentationHeadingDelta = 0, scale = 1 } = {}) {
  const d = hushDensityFromCaptured(performance);
  const moving = !reducedMotion && !d.pivot && d.rate > .000001;
  // A stationary stage (including the desktop) has no right to march a saved
  // distance phase. The hold is the same already collapsed anatomical bind.
  const character = moving ? { clip: 'pressure_approach', time: d.phase * 2.4, loop: true }
    : { clip: 'pressure_hold', time: 0, loop: false };
  if (moving && d.drive > .000001) character.blend = {
    clip: 'density_chase', time: d.phase * 2.4, loop: true, weight: d.drive * .78 };
  else if (!reducedMotion && !moving && !d.pivot && d.traction > .000001) character.blend = {
    clip: d.drive > .5 ? 'density_chase' : 'pressure_approach', time: d.phase * 2.4, loop: true, weight: d.traction };

  const age = d.eventTime;
  // Notice is late and singular, rather than an instant head track or an
  // idle loop. Blocking spends one short recoil and retains the burden.
  const notice = !reducedMotion && d.event === 'notice'
    ? smooth((age - HUSH_DENSITY_LIMITS.noticeDelaySeconds) / .42) * smooth((4.8 - age) / .8) : 0;
  const recoil = !reducedMotion && d.event === 'blocked'
    ? smooth(age / .10) * (1 - smooth((age - .28) / 1.12)) : 0;
  const lead = reducedMotion ? 0 : hushDensityTravelPacket(d.phase, 0, .43) * d.traction;
  const lag = reducedMotion ? 0 : hushDensityTravelPacket(d.phase, .10, .43) * d.traction;
  const burden = d.compression * .035;
  const bow = clamp(d.doorDrop / .17), deepBow = crouchAmount(d.doorDrop);
  character.joints = {
    ...(deepBow ? { pelvis: { translation: [0, -.16 * deepBow, 0] } } : {}),
    spine_low: { rotation: rotation(burden + lead * .018, 0, lead * -.010 - bow * .23) },
    spine_mid: { rotation: rotation(lead * .018 - recoil * .020, notice * -.025, notice * .020 - bow * .19) },
    chest: { rotation: rotation(lead * .025 - recoil * .025, notice * -.045, lead * -.018 + notice * .030 - bow * .13) },
    neck: { rotation: rotation(lag * -.012, notice * d.attention * -.10, notice * .020 - bow * .12) },
    head: { rotation: rotation(0, notice * d.attention * -.14, notice * .025) },
    clavicle_L: { rotation: rotation(lag * -.018 - recoil * .018, 0, notice * -.022) },
    clavicle_R: { rotation: rotation(lag * -.012 - recoil * .013, 0, notice * .014) },
    upper_arm_L: { rotation: rotation(lag * -.022, 0, recoil * .012) },
    upper_arm_R: { rotation: rotation(lag * -.015, 0, recoil * -.009) },
  };
  if (!reducedMotion && performance.grab > 0) {
    const reach = clamp(performance.grab);
    // A single, deliberate reach into the booth. The feet remain planted
    // and the shoulder and fingers close on the recordist's side of the set.
    character.joints.chest = { rotation: rotation(-.10 * reach, -.15 * reach, 0) };
    character.joints.upper_arm_R = { rotation: rotation(1.70 * reach, .66 * reach, -.52 * reach) };
    character.joints.forearm_R = { rotation: rotation(.34 * reach, 0, -.18 * reach) };
    character.joints.hand_R = { rotation: rotation(-.22 * reach, -.38 * reach, 0) };
    for (const finger of ['index', 'middle', 'ring']) {
      character.joints[`${finger}_R_01`] = { rotation: rotation(.30 * reach, 0, 0) };
    }
  }
  if (!reducedMotion || deepBow) {
    const turn = angle(presentationHeadingDelta), size = clamp(scale, .1, 4, 1);
    const reground = !moving ? d.event === 'still' ? 1 : smooth(age / HUSH_DENSITY_LIMITS.regroundSeconds) : 0;
    const released = d.release;
    character.support = { clip: 'pressure_hold', time: 0,
      mode: d.unsupported ? 'unsupported' : d.pivot ? 'pivot' : d.settlingFeet ? 'regrounding' : released > .000001 ? 'released' : moving ? 'gathering' : 'held',
      contacts: sides.map(side => {
        const foot = reducedMotion ? initialFoot(side, d.phase) : d.feet[side];
        // Gather from the old support to the next landing in an actual lifted
        // arc. The in-place clip still gives the knee its bend direction, but
        // its free sole cannot sweep down through the ground.
        const canGather = moving && !d.unsupported;
        const swing = canGather ? smooth((d.phase - foot.landing - landingPhase(side) - .74) / .26) : 0;
        const destination = [0, -landingLeadM * strideAllowance(d.doorDrop)];
        const offset = foot.offset.map((v, k) => v + (destination[k] - v) * swing);
        const window = ((d.phase - gatherPhase(side)) % 1 + 1) % 1;
        const lift = canGather ? smooth(window / .06) * (1 - smooth((window - .20) / .06)) : 0;
        const height = foot.height * (1 - swing) + lift * HUSH_DENSITY_LIMITS.releasedClearanceM;
        const anchored = rotate(offset, -turn).map(v => v / size);
        const contactYaw = angle(foot.yaw - turn + angle(turn - foot.yaw) * swing), leg = HUSH_POSTURE_LEGS[side];
        const ankle = rotate([leg.ankle[0], leg.ankle[2]], contactYaw);
        const reach = Math.hypot(ankle[0] + anchored[0] - leg.hip[0], leg.ankle[1] + height / size - leg.hip[1] + .16 * deepBow,
          ankle[1] + anchored[1] - leg.hip[2]);
        const available = 1 - smooth((reach - (leg.reach - .012)) / .010);
        const planted = (d.pivot ? foot.active ? 1 : 0
          : foot.active ? Math.max(hushDensityContactWeight(d.phase, side), reground) : reground) * available;
        const controlled = canGather || deepBow ? 1 : planted;
        const normal = [anchored[0], height / size, anchored[1]], airborne = [0,
          HUSH_DENSITY_LIMITS.releasedClearanceM / size, HUSH_DENSITY_LIMITS.releasedTrailM / size];
        return { side, offset: normal.map((v, k) => v + (airborne[k] - v) * released),
          yaw: contactYaw * (1 - released), weight: d.unsupported ? 0 : (d.pivot || d.settlingFeet) && !foot.active ? 1 : controlled * (1 - released) + released,
          planted: !d.unsupported && foot.active && released < .000001 && planted === 1 };
      }) };
  }
  return character;
}
