// Admission owns one directed boundary, not an entire render group. The main
// helix already uses the academic render group on lower treads, and the two
// sides of this seam have different logical addresses in the same physical air.
export const ACADEMIC_BOUNCER_ENTRANCE = Object.freeze({
  portalId: 'academic-floor-landing-to-loggia',
  stairX: 300,
  stairY: Object.freeze([130, 131, 132, 133]),
  loggiaX: 27,
  loggiaY: Object.freeze([555, 556, 557, 558]),
});

const cell = value => Number.isFinite(value) ? Math.floor(value) : null;

// Call after geometry.canStep has resolved its redirect, before committing the
// body. This helper adds admission policy; it never makes an illegal step legal.
// Saved or developer-placed bodies already inside are not moved or confined.
export function academicBouncerAccessForMove({ admitted = false, from, move } = {}) {
  const result = { allowed: true, entrance: null, direction: null };
  const gate = ACADEMIC_BOUNCER_ENTRANCE;
  if (move?.ok !== true || move.edgePortal !== gate.portalId || !move.redirect) return result;
  const x = cell(from?.x), y = cell(from?.y);
  const tx = cell(move.redirect.x), ty = cell(move.redirect.y);
  const incomingLane = gate.stairY.indexOf(y);
  if (x === gate.stairX && incomingLane >= 0
      && tx === gate.loggiaX && ty === gate.loggiaY[incomingLane]) {
    return { allowed: admitted === true, entrance: 'main-stair', direction: 'in' };
  }
  const outgoingLane = gate.loggiaY.indexOf(y);
  if (x === gate.loggiaX && outgoingLane >= 0
      && tx === gate.stairX && ty === gate.stairY[outgoingLane]) {
    return { allowed: true, entrance: 'main-stair', direction: 'out' };
  }
  return result;
}

const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const bounded = (value, fallback, lo, hi) => Number.isFinite(value)
  ? Math.max(lo, Math.min(hi, value)) : fallback;

// All positions are physical world metres, with Y at the body's feet. Ordinary
// PROPS picking uses logical distance and cannot see across this stair seam.
// This explicit local focus neither grabs input nor changes look/focus state.
export function academicBouncerPhysicalFocus({
  listener, yaw, guards = [], maxDistance = 3.2, floorTolerance = .55, minAimDot = .82,
} = {}) {
  const empty = { actor: null, actorId: null, near: false, distance: null, aimAngle: null, nearActor: null };
  if (!finitePoint(listener) || !Array.isArray(guards)) return empty;
  const reach = bounded(maxDistance, 3.2, 0, 5);
  const floorReach = bounded(floorTolerance, .55, 0, 1);
  const aim = bounded(minAimDot, .82, .5, 1);
  let nearest = null, best = null;
  for (const actor of guards) {
    if (!actor?.id || actor.visible === false || !finitePoint(actor)
        || Math.abs(actor.y - listener.y) > floorReach) continue;
    const dx = actor.x - listener.x, dz = actor.z - listener.z;
    const distance = Math.hypot(dx, dz);
    if (distance > reach) continue;
    if (!nearest || distance < nearest.distance) nearest = { actor, distance };
    if (!Number.isFinite(yaw)) continue;
    const dot = distance < .03 ? 1 : (dx * Math.sin(yaw) - dz * Math.cos(yaw)) / distance;
    if (dot < aim) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    const score = angle + distance * .015;
    if (!best || score < best.score) best = { actor, distance, angle, score };
  }
  return {
    actor: best?.actor ?? null,
    actorId: best?.actor.id ?? null,
    near: !!nearest,
    distance: best?.distance ?? nearest?.distance ?? null,
    aimAngle: best?.angle ?? null,
    nearActor: nearest?.actor ?? null,
  };
}
