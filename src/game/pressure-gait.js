// Ordinary Presence locomotion. These phases move the real navigation root;
// rendering only samples the resulting bounded descriptor. Source and authored
// tableaux retain their own coordinate authority and do not use this scheduler.
import { CELL } from '../data/floorplan/legend.js';

export const PRESSURE_GAIT = Object.freeze({
  strideMetres: .42, loadClipSeconds: .50, advanceClipSeconds: .72,
  loadMinSeconds: .4, loadMaxSeconds: .6,
  advanceMinSeconds: .64, holdMinSeconds: .95, holdMaxSeconds: 2.25,
  nearHoldSeconds: 1.35, nearMetres: 4.5,
  maxTurnRadians: Math.PI / 4,
  blockedSeconds: .65, recoverySeconds: .8,
});
const phases = ['arrest', 'load', 'advance', 'listen', 'recover'];
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, lo, hi, fallback = lo) => Math.max(lo, Math.min(hi, finite(n, fallback)));
const angle = n => Math.atan2(Math.sin(finite(n)), Math.cos(finite(n)));
const smooth = n => { const u = clamp(n, 0, 1); return u * u * (3 - 2 * u); };
function random(seed, cycle, salt) {
  let h = (seed >>> 0) ^ Math.imul(cycle + 1, 0x9e3779b1) ^ salt;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function holdDuration(gait, proximity) {
  return PRESSURE_GAIT.holdMinSeconds + random(gait.seed, gait.cycle, 17)
    * (PRESSURE_GAIT.holdMaxSeconds - PRESSURE_GAIT.holdMinSeconds)
    + clamp(proximity, 0, 1) * PRESSURE_GAIT.nearHoldSeconds;
}

export function normalizePressureGait(value) {
  if (!value || typeof value !== 'object' || !phases.includes(value.phase)) return null;
  return { version: 1, seed: Math.floor(clamp(value.seed, 0, 4294967295)),
    cycle: Math.floor(clamp(value.cycle, 0, 1000000)), phase: value.phase,
    elapsed: clamp(value.elapsed, 0, 120), duration: clamp(value.duration, .001, 120, 1),
    travelMetres: clamp(value.travelMetres, 0, PRESSURE_GAIT.strideMetres),
    progress: clamp(value.progress, 0, 1, finite(value.travelMetres) / PRESSURE_GAIT.strideMetres), pivot: value.pivot === true,
    redirect: value.redirect === true,
    heading: angle(value.heading), listenTurn: clamp(value.listenTurn, -.55, .55),
    stepStartX: clamp(value.stepStartX, -1000000, 1000000), stepStartY: clamp(value.stepStartY, -1000000, 1000000),
    startHeading: angle(value.startHeading), targetHeading: angle(value.targetHeading),
    stepTargetX: clamp(value.stepTargetX, -1000000, 1000000), stepTargetY: clamp(value.stepTargetY, -1000000, 1000000),
    stepSpeed: clamp(value.stepSpeed, 0, 1000),
    stepDistanceMetres: clamp(value.stepDistanceMetres, .000001, PRESSURE_GAIT.strideMetres, PRESSURE_GAIT.strideMetres),
    blockedElapsed: clamp(value.blockedElapsed, 0, 120),
    recoveryClip: ['pressure_load', 'pressure_advance', 'pressure_pivot'].includes(value.recoveryClip) ? value.recoveryClip : 'pressure_advance',
    recoveryTime: clamp(value.recoveryTime, 0, PRESSURE_GAIT.advanceClipSeconds), recoveryReset: value.recoveryReset === true,
    blocked: value.blocked === true };
}

export function pressureGaitVisibility(gait) {
  if (gait?.phase !== 'recover') return 1;
  const u = clamp(gait.elapsed / gait.duration, 0, 1);
  return u < .5 ? 1 - smooth(u * 2) : smooth((u - .5) * 2);
}

function recoverBlocked(gait) {
  gait.recoveryClip = gait.redirect ? 'pressure_load' : gait.pivot ? 'pressure_pivot' : 'pressure_advance';
  gait.recoveryTime = gait.redirect ? PRESSURE_GAIT.loadClipSeconds : gait.progress * PRESSURE_GAIT.advanceClipSeconds;
  gait.phase = 'recover'; gait.elapsed = 0; gait.duration = PRESSURE_GAIT.recoverySeconds; gait.recoveryReset = false;
}

export function freshPressureGait({ seed = 0, heading = 0 } = {}) {
  const gait = normalizePressureGait({ phase: 'arrest', seed, heading, duration: 1 });
  gait.duration = holdDuration(gait, 0);
  return gait;
}

// Preserve a physical bearing when a navigator redirects between distant
// logical atlas spans. This is the same topology transition as player movement.
export function rebasePressureHeading(physicalAt, heading, from, to) {
  const a = physicalAt(from.x, from.y), b = physicalAt(to.x, to.y);
  const ahead = physicalAt(from.x + Math.sin(heading) * .1, from.y - Math.cos(heading) * .1);
  const right = physicalAt(to.x + .1, to.y), down = physicalAt(to.x, to.y + .1);
  const xx = right.x - b.x, xy = down.x - b.x, yx = right.z - b.z, yy = down.z - b.z;
  const det = xx * yy - xy * yx, dx = ahead.x - a.x, dy = ahead.z - a.z;
  return Math.abs(det) < .0000001 ? heading : Math.atan2((dx * yy - xy * dy) / det, -(xx * dy - dx * yx) / det);
}

// The returned position is the collider position. An advance clip samples real
// distance, so a blocked body cannot animate a step while its root is held.
// Only a remembered/nav target supplies direction. Proximity can lengthen the
// pause, but never supplies a bearing or destination.
export function stepPressureGait(previous, {
  dt = 0, x = 0, y = 0, targetX = x, targetY = y, speed = 0,
  proximity = 0, listening = false, resolveMove = null, rebaseHeading = null,
} = {}) {
  const gait = normalizePressureGait(previous) || freshPressureGait();
  let remaining = clamp(dt, 0, 1), px = finite(x), py = finite(y);
  const tx = finite(targetX, px), ty = finite(targetY, py);
  const allowedSpeed = Math.max(0, finite(speed));
  const intent = allowedSpeed > .001 && Math.hypot(tx - px, ty - py) > .001;
  const desiredHeading = () => Math.hypot(tx - px, ty - py) > .001 ? Math.atan2(tx - px, -(ty - py)) : gait.heading;
  const soundTurn = () => clamp(angle(desiredHeading() - gait.heading), -.55, .55);
  if (!intent && gait.phase !== 'load' && gait.phase !== 'advance' && gait.phase !== 'recover') {
    // A director listen or stand holds locomotion. A wall-blocked advance
    // instead retains its exact contact pose through bounded recovery.
    if (gait.phase !== 'advance') {
      const phase = listening ? 'listen' : 'arrest';
      if (gait.phase !== phase) { gait.phase = phase; gait.elapsed = 0; }
      gait.elapsed = Math.min(120, gait.elapsed + remaining);
      gait.listenTurn = listening ? soundTurn() * smooth(gait.elapsed / .8) : 0;
      gait.blocked = false;
    }
    return { x: px, y: py, gait };
  }
  if (gait.phase === 'listen') {
    gait.phase = 'arrest'; gait.elapsed = 0; gait.duration = holdDuration(gait, proximity);
  }
  // Consume phase boundaries explicitly; one large tick must not turn the
  // readable loading interval into an instantaneous cosmetic pose.
  for (let boundary = 0; remaining > .000001 && boundary < 8; boundary++) {
    if (gait.phase === 'recover') {
      // Hold the exact supported pose while the negative volume withdraws.
      // Change stance only at zero visibility; the collider never relocates.
      const seam = gait.recoveryReset ? gait.duration : gait.duration * .5;
      const used = Math.min(remaining, Math.max(0, seam - gait.elapsed));
      remaining -= used; gait.elapsed += used;
      if (gait.elapsed < seam - .000001) break;
      if (!gait.recoveryReset) {
        gait.recoveryReset = true; gait.cycle++; gait.progress = 0; gait.travelMetres = 0; gait.pivot = false; gait.redirect = false;
        gait.blocked = false; gait.blockedElapsed = 0; gait.listenTurn = 0;
        gait.startHeading = gait.heading; gait.targetHeading = gait.heading;
        gait.stepStartX = px; gait.stepStartY = py; gait.stepTargetX = px; gait.stepTargetY = py;
      } else {
        gait.phase = 'arrest'; gait.elapsed = 0; gait.duration = holdDuration(gait, proximity);
      }
    } else if (gait.phase === 'arrest') {
      gait.duration = Math.max(gait.duration, holdDuration(gait, proximity));
      const used = Math.min(remaining, Math.max(0, gait.duration - gait.elapsed));
      gait.elapsed += used; remaining -= used; gait.listenTurn = 0;
      if (gait.elapsed + .000001 < gait.duration) break;
      gait.phase = 'load'; gait.elapsed = 0; gait.travelMetres = 0; gait.progress = 0; gait.pivot = false; gait.redirect = false; gait.blocked = false;
      gait.blockedElapsed = 0; gait.recoveryReset = false;
      gait.duration = PRESSURE_GAIT.loadMinSeconds + random(gait.seed, gait.cycle, 39)
        * (PRESSURE_GAIT.loadMaxSeconds - PRESSURE_GAIT.loadMinSeconds);
    } else if (gait.phase === 'load') {
      const used = Math.min(remaining, Math.max(0, gait.duration - gait.elapsed));
      gait.elapsed += used; remaining -= used;
      gait.listenTurn = soundTurn() * smooth(gait.elapsed / gait.duration);
      if (gait.elapsed + .000001 < gait.duration) break;
      gait.phase = 'advance'; gait.elapsed = 0; gait.travelMetres = 0;
      gait.duration = PRESSURE_GAIT.advanceMinSeconds;
      gait.stepStartX = px; gait.stepStartY = py;
      gait.startHeading = gait.heading;
      const distance = Math.hypot(tx - px, ty - py), budget = Math.min(distance, PRESSURE_GAIT.strideMetres / CELL);
      const next = distance <= .001 ? { x: px, y: py }
        : resolveMove ? resolveMove({ x: px, y: py }, { x: tx, y: ty }, budget)
        : { x: px + (tx - px) / distance * budget, y: py + (ty - py) / distance * budget };
      const nextDistance = next && Number.isFinite(next.x) && Number.isFinite(next.y) ? Math.hypot(next.x - px, next.y - py) : 0;
      const wanted = nextDistance > .000001 ? Math.atan2(next.x - px, -(next.y - py)) : desiredHeading();
      const turn = angle(wanted - gait.startHeading);
      gait.redirect = next?.redirect === true;
      gait.pivot = !gait.redirect && (distance <= .001 || Math.abs(turn) > PRESSURE_GAIT.maxTurnRadians + .000001);
      gait.targetHeading = angle(gait.startHeading + clamp(turn, -PRESSURE_GAIT.maxTurnRadians, PRESSURE_GAIT.maxTurnRadians));
      if (gait.redirect) gait.targetHeading = gait.startHeading;
      gait.stepTargetX = nextDistance > .000001 ? next.x : tx; gait.stepTargetY = nextDistance > .000001 ? next.y : ty;
      gait.stepDistanceMetres = !gait.redirect && nextDistance > .000001 ? Math.min(PRESSURE_GAIT.strideMetres, nextDistance * CELL) : PRESSURE_GAIT.strideMetres;
      gait.stepSpeed = Math.min(allowedSpeed, gait.stepDistanceMetres / CELL / PRESSURE_GAIT.advanceMinSeconds);
      if (gait.pivot) gait.duration = PRESSURE_GAIT.advanceClipSeconds;
    } else if (gait.phase === 'advance') {
      if (gait.redirect) {
        // A nonlocal logical connector is an explicit authored redirect. Never
        // clamp/interpolate through its atlas gap or count it as a foot stride.
        const used = Math.min(remaining, gait.duration - gait.elapsed);
        remaining -= used; gait.elapsed += used;
        if (gait.elapsed < gait.duration - .000001) break;
        const from = { x: px, y: py }, to = { x: gait.stepTargetX, y: gait.stepTargetY };
        const resolved = resolveMove?.(from, to, PRESSURE_GAIT.strideMetres / CELL);
        if (resolved?.redirect !== true || !Number.isFinite(resolved.x) || !Number.isFinite(resolved.y)) {
          gait.blocked = true; gait.blockedElapsed += remaining;
          if (gait.blockedElapsed >= PRESSURE_GAIT.blockedSeconds) recoverBlocked(gait);
          break;
        }
        px = resolved.x; py = resolved.y;
        gait.heading = angle(rebaseHeading?.(gait.heading, from, { x: px, y: py }) ?? gait.heading);
        gait.startHeading = gait.heading; gait.targetHeading = gait.heading;
        gait.stepStartX = px; gait.stepStartY = py; gait.stepTargetX = px; gait.stepTargetY = py;
        gait.phase = 'arrest'; gait.cycle++; gait.elapsed = 0; gait.blocked = false; gait.listenTurn = 0;
        gait.duration = holdDuration(gait, proximity);
        continue;
      }
      if (gait.pivot) {
        const used = Math.min(remaining, gait.duration - gait.elapsed);
        remaining -= used; gait.elapsed += used; gait.progress = Math.min(1, gait.elapsed / gait.duration);
        const turn = smooth(gait.progress / .38);
        gait.heading = angle(gait.startHeading + angle(gait.targetHeading - gait.startHeading) * turn);
        gait.listenTurn = clamp(angle(gait.targetHeading - gait.heading), -.55, .55) * (1 - turn);
        if (gait.progress < 1 - .000001) break;
        gait.phase = 'arrest'; gait.cycle++; gait.elapsed = 0; gait.blocked = false; gait.listenTurn = 0;
        gait.duration = holdDuration(gait, proximity);
        continue;
      }
      const dx = gait.stepTargetX - px, dy = gait.stepTargetY - py, distance = Math.hypot(dx, dy);
      const cellsLeft = (gait.stepDistanceMetres - gait.travelMetres) / CELL;
      const stepSpeed = gait.stepSpeed;
      const budget = Math.min(distance, cellsLeft, stepSpeed * remaining);
      if (budget <= .000001) {
        // A navigator can close a committed segment without consuming its
        // remaining gesture. Recover at this root rather than locking forever
        // or jumping from a partly loaded pose to the arrested stance.
        recoverBlocked(gait);
        break;
      }
      const from = { x: px, y: py }, target = { x: gait.stepTargetX, y: gait.stepTargetY };
      const resolved = resolveMove ? resolveMove(from, target, budget)
        : { x: px + dx / distance * budget, y: py + dy / distance * budget };
      const valid = resolved && Number.isFinite(resolved.x) && Number.isFinite(resolved.y);
      const travelled = valid ? Math.hypot(resolved.x - px, resolved.y - py) : 0;
      gait.blocked = travelled < .000001;
      if (gait.blocked) {
        gait.blockedElapsed += remaining;
        if (gait.blockedElapsed >= PRESSURE_GAIT.blockedSeconds) recoverBlocked(gait);
        break;
      }
      gait.blockedElapsed = 0;
      // Navigation may choose a corner waypoint, but may not exceed the same
      // speed/contact budget as the unobstructed collider.
      const ratio = Math.min(1, budget / travelled);
      const nx = px + (resolved.x - px) * ratio, ny = py + (resolved.y - py) * ratio;
      const actual = Math.hypot(nx - px, ny - py);
      px = nx; py = ny; gait.travelMetres = Math.min(PRESSURE_GAIT.strideMetres, gait.travelMetres + actual * CELL);
      gait.progress = gait.travelMetres / gait.stepDistanceMetres;
      const turn = smooth(gait.progress / .38);
      gait.heading = angle(gait.startHeading + angle(gait.targetHeading - gait.startHeading) * turn);
      gait.listenTurn = clamp(angle(gait.targetHeading - gait.heading), -.55, .55) * (1 - turn);
      const used = actual / stepSpeed; remaining = Math.max(0, remaining - used); gait.elapsed += used;
      if (gait.travelMetres + .000001 < gait.stepDistanceMetres && distance - actual > .000001) break;
      if (gait.travelMetres + .000001 < gait.stepDistanceMetres) { recoverBlocked(gait); break; }
      gait.phase = 'arrest'; gait.cycle++; gait.elapsed = 0; gait.blocked = false; gait.listenTurn = 0;
      gait.duration = holdDuration(gait, proximity);
    } else break;
  }
  return { x: px, y: py, gait: normalizePressureGait(gait) };
}
