// The Hush's catch, as a timeline. Pure: the host reads one frame per tick.
//
// The body is a black cutout in a world its own pressure has already put out, so
// at catching distance it was black on black and nothing happened on screen. The
// catch is a flash photograph instead: the room blown white behind the real body,
// then the same frame negative, then a stutter while it comes back. The body is
// never moved or replaced. When it arrives from behind, the camera is what moves.
export const HUSH_CATCH = Object.freeze({
  whipDeadRadians: .2, whipMinSeconds: .09, whipMaxSeconds: .18, lookHoldSeconds: .1,
  flashSeconds: .07, negativeSeconds: .083,
  stutterSeconds: .25, stutterFps: 12,
  zoom: 1.24, zoomInSeconds: .12, zoomOutSeconds: .33,
  // No white field for reduced flash: a dark lift just high enough to read the body.
  reducedLift: .16, reducedLiftSeconds: .5,
  eyeMetres: 1.62, headShare: .82, pitchMin: -.25, pitchMax: .5, nearestMetres: .35,
  afterimageSeconds: 1.5, afterimageAlpha: .55,
  // The room falls away as it closes, so the hit has silence to land in. The body's
  // own sounds (the heartbeat) don't go through this, so they are what's left.
  vacuumFarMetres: 4.5, vacuumNearMetres: 1.4, vacuumFloor: .16,
});

const finite = value => Number.isFinite(value);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const smooth = value => { const u = clamp(value, 0, 1); return u * u * (3 - 2 * u); };
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

// `eye` and `target` share a floor frame; `metresPerUnit` converts it. An absent
// target (nothing to look at) still flashes, but the camera stays where it is.
export function hushCatchPlan({
  eye = null, target = null, viewYaw = null, lookYaw = 0, lookPitch = 0,
  heightM = 2.18, metresPerUnit = 1, reducedFlash = false, reducedMotion = false,
} = {}) {
  const base = { reducedFlash: !!reducedFlash, reducedMotion: !!reducedMotion, lookYaw, lookPitch,
    yawDelta: 0, pitchTo: lookPitch, whipSeconds: 0, flashAt: 0, moves: false };
  if (reducedMotion || !eye || !target || !finite(viewYaw) || !finite(eye.x) || !finite(eye.z) || !finite(target.x) || !finite(target.z)) return Object.freeze(base);
  const dx = target.x - eye.x, dz = target.z - eye.z, distance = Math.hypot(dx, dz) * metresPerUnit;
  if (distance <= 0) return Object.freeze(base);
  const yawDelta = wrap(Math.atan2(dx, -dz) - viewYaw);
  const rise = (finite(heightM) ? heightM : 2.18) * HUSH_CATCH.headShare - HUSH_CATCH.eyeMetres;
  const pitchTo = clamp(Math.atan2(rise, Math.max(HUSH_CATCH.nearestMetres, distance)), HUSH_CATCH.pitchMin, HUSH_CATCH.pitchMax);
  const turn = Math.abs(yawDelta), whips = turn > HUSH_CATCH.whipDeadRadians;
  const whipSeconds = whips ? HUSH_CATCH.whipMinSeconds + (HUSH_CATCH.whipMaxSeconds - HUSH_CATCH.whipMinSeconds) * clamp(turn / Math.PI, 0, 1) : 0;
  return Object.freeze({ ...base, yawDelta: whips ? yawDelta : 0, pitchTo, whipSeconds, flashAt: whipSeconds, moves: true });
}

// `memory` is any object kept for the length of one catch. It guarantees one white
// frame and one negative however slow the machine: a long frame can't skip the hit.
export function hushCatchFrame(plan, elapsed = 0, memory = null) {
  const t = Math.max(0, finite(elapsed) ? elapsed : 0), since = t - plan.flashAt;
  const frame = { look: null, flash: 0, negative: 0, zoom: 1, stutterStep: null };
  // The camera gets there fast and settles: it is being turned, not turning.
  const lift = Math.max(plan.whipSeconds, HUSH_CATCH.flashSeconds);
  if (plan.moves && t <= lift + HUSH_CATCH.lookHoldSeconds) {
    const p = clamp(t / lift, 0, 1), eased = 1 - (1 - p) ** 3;
    frame.look = { yaw: plan.lookYaw + plan.yawDelta * eased, pitch: plan.lookPitch + (plan.pitchTo - plan.lookPitch) * eased };
  }
  if (plan.reducedFlash) {
    const u = t / HUSH_CATCH.reducedLiftSeconds;
    frame.flash = u < 1 ? HUSH_CATCH.reducedLift * Math.sin(Math.PI * clamp(u, 0, 1)) : 0;
  } else if (since >= 0) {
    if (since < HUSH_CATCH.flashSeconds) frame.flash = 1;
    else if (since < HUSH_CATCH.flashSeconds + HUSH_CATCH.negativeSeconds) frame.negative = 1;
    if (memory) {
      if (!memory.hushCatchFlashShown) { memory.hushCatchFlashShown = true; frame.flash = 1; frame.negative = 0; }
      else if (!memory.hushCatchNegativeShown && frame.flash < 1) { memory.hushCatchNegativeShown = true; frame.negative = 1; }
    }
  }
  if (!plan.reducedMotion && since >= 0) {
    const zoomIn = smooth(since / HUSH_CATCH.zoomInSeconds), zoomOut = 1 - smooth((since - HUSH_CATCH.zoomInSeconds) / HUSH_CATCH.zoomOutSeconds);
    frame.zoom = 1 + (HUSH_CATCH.zoom - 1) * zoomIn * zoomOut;
    const start = HUSH_CATCH.flashSeconds + HUSH_CATCH.negativeSeconds;
    if (since >= start && since < start + HUSH_CATCH.stutterSeconds) frame.stutterStep = Math.floor((since - start) * HUSH_CATCH.stutterFps);
  }
  return Object.freeze(frame);
}

// The flash burned in: a pale figure on whatever comes back, gone in a breath.
export function hushCatchAfterimageAlpha(age = 0) {
  const u = (finite(age) ? age : 0) / HUSH_CATCH.afterimageSeconds;
  if (u < 0 || u >= 1) return 0;
  return HUSH_CATCH.afterimageAlpha * (1 - u) * (1 - u);
}

export const HUSH_CATCH_AFTERIMAGE_DELAY = HUSH_CATCH.flashSeconds + HUSH_CATCH.negativeSeconds;

export function hushCatchVacuumLevel(metres = Infinity) {
  if (!finite(metres)) return 1;
  const close = clamp((HUSH_CATCH.vacuumFarMetres - metres) / (HUSH_CATCH.vacuumFarMetres - HUSH_CATCH.vacuumNearMetres), 0, 1);
  return 1 - (1 - HUSH_CATCH.vacuumFloor) * smooth(close);
}
