import { stationRealmCanOccupy, stationRealmFloor } from './station-realms.js';

// All poses use the station realm's metres and +Z local forward. The maul
// focus shares its stump coordinates. The snow clearing accepts a body only
// when its entire imprint can lie on the same clear, nearly level ground.
export const HOME_VALLEY_ACTIVITY_POINTS = Object.freeze({
  maul: Object.freeze({ x: -66.32, z: 107.48 }),
  angel: Object.freeze({ x: -10, z: 14 }),
});

const timings = Object.freeze({ lift: .26, impact: .31, swing: .64, lower: .68, sweep: 1.88, rise: .70 });
const phases = Object.freeze({
  maul: Object.freeze(['lifting', 'held', 'swinging']),
  angel: Object.freeze(['lowering', 'sweeping', 'rising']),
});
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hasPoint = point => Number.isFinite(point?.x) && Number.isFinite(point?.z);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const unit = value => clamp(value, 0, 1);
const ease = value => unit(value) ** 2 * (3 - 2 * unit(value));
const angle = value => Number.isFinite(value) ? Math.atan2(Math.sin(value), Math.cos(value)) : 0;
const valleyIsOpen = realm => (realm?.home === true || realm?.home?.eligible === true)
  && realm.stage === 'inside' && !realm.atWindow;

export function createHomeValleyActivities(saved) {
  const stamp = saved?.imprint;
  const imprint = hasPoint(stamp) && near(stamp, HOME_VALLEY_ACTIVITY_POINTS.angel) <= 1.35
    ? { x: stamp.x, z: stamp.z, yaw: angle(stamp.yaw) } : null;
  const row = saved?.active;
  const active = hasPoint(row) && Object.hasOwn(phases, row.kind) && phases[row.kind].includes(row.phase)
    && Number.isFinite(row.startedAt) && row.startedAt >= 0
    && near(row, HOME_VALLEY_ACTIVITY_POINTS[row.kind]) <= (row.kind === 'maul' ? 1.95 : 1.35)
    ? { kind: row.kind, phase: row.phase, startedAt: row.startedAt,
      x: row.x, z: row.z, yaw: angle(row.yaw),
      pitch: Number.isFinite(row.pitch) ? clamp(row.pitch, -1.4, 1.4) : 0,
      from: Number.isFinite(row.from) ? unit(row.from) : 0,
      completed: row.kind === 'angel' && row.phase === 'rising' && row.completed === true } : null;
  return { split: saved?.split === true, imprint, active };
}

export function homeValleyAngelCanLieAt(pose) {
  if (!hasPoint(pose) || near(pose, HOME_VALLEY_ACTIVITY_POINTS.angel) > 1.35) return false;
  const floor = stationRealmFloor(5, pose.x, pose.z);
  if (!Number.isFinite(floor)) return false;
  const yaw = angle(pose.yaw), cos = Math.cos(yaw), sin = Math.sin(yaw);
  for (const side of [-.95, 0, .95]) {
    for (const along of [-1.17, 0, 1.05]) {
      const x = pose.x + side * cos + along * sin, z = pose.z - side * sin + along * cos;
      const height = stationRealmFloor(5, x, z);
      if (!Number.isFinite(height) || Math.abs(height - floor) > .11
        || !stationRealmCanOccupy(5, x, z, floor)) return false;
    }
  }
  return true;
}

function focusFor(state, realm) {
  if (!valleyIsOpen(realm)) return null;
  const pose = realm.pose;
  if (!hasPoint(pose)) return null;
  if (state.active?.kind === 'maul') {
    const { phase } = state.active;
    const label = phase === 'held' ? (state.split ? 'SET DOWN MAUL' : 'SPLIT WOOD') : null;
    return label ? { id: 'maul', kind: 'maul', label } : null;
  }
  if (state.active?.kind === 'angel') {
    return state.active.phase === 'rising' ? null : { id: 'angel', kind: 'angel', label: 'GET UP' };
  }
  const maul = HOME_VALLEY_ACTIVITY_POINTS.maul;
  const distance = near(pose, maul);
  const looking = distance < .30 || Math.abs(angle(Math.atan2(maul.x - pose.x, maul.z - pose.z) - angle(pose.yaw))) < .78;
  if (distance <= 1.30 && looking && Math.abs(angle(pose.pitch)) < 1.23) {
    return { id: 'maul', kind: 'maul', label: 'PICK UP MAUL' };
  }
  return homeValleyAngelCanLieAt(pose) ? { id: 'angel', kind: 'angel', label: 'MAKE SNOW ANGEL' } : null;
}

export function homeValleyActivityFocus(saved, realm) {
  return focusFor(createHomeValleyActivities(saved), realm);
}

function poseFor(active, elapsed) {
  if (active.phase === 'lowering') return { recline: ease(elapsed / timings.lower), sweep: 0 };
  if (active.phase === 'rising') return { recline: active.from * (1 - ease(elapsed / timings.rise)), sweep: 0 };
  const progress = unit(elapsed / timings.sweep);
  return { recline: 1, sweep: Math.sin(progress * Math.PI * 2) ** 2 };
}

function presentationFor(state, realm, now, reducedMotion) {
  const active = valleyIsOpen(realm) ? state.active : null;
  const maul = active?.kind === 'maul' ? active : null;
  const angel = active?.kind === 'angel' ? active : null;
  const elapsed = active ? Math.max(0, now - active.startedAt) : 0;
  const maulDuration = maul?.phase === 'lifting' ? timings.lift : timings.swing;
  const maulProgress = maul?.phase === 'held' ? 1 : maul ? unit(elapsed / maulDuration) : 0;
  const angelDuration = angel?.phase === 'lowering' ? timings.lower : angel?.phase === 'rising' ? timings.rise : timings.sweep;
  const recline = angel ? poseFor(angel, elapsed) : null;
  const standingEye = Number.isFinite(realm?.eyeHeight) ? realm.eyeHeight : 1.62;
  const camera = angel ? {
    eyeHeight: standingEye + (.20 - standingEye) * recline.recline,
    pitch: reducedMotion ? angel.pitch : angel.pitch + (1.34 - angel.pitch) * recline.recline,
    yaw: angel.yaw,
    roll: 0,
  } : null;
  return {
    maul: { held: !!maul, phase: maul?.phase || null, progress: maulProgress, split: state.split },
    angel: {
      phase: angel?.phase || null,
      progress: angel ? unit(elapsed / angelDuration) : 0,
      imprint: state.imprint,
      body: angel ? { x: angel.x, z: angel.z, yaw: angel.yaw, sweep: recline.sweep } : null,
    },
    camera,
    blocksMovement: !!angel,
  };
}

export function homeValleyActivityPresentation(saved, realm, { now = realm?.time, reducedMotion = false } = {}) {
  return presentationFor(createHomeValleyActivities(saved), realm, Number.isFinite(now) ? now : 0, reducedMotion);
}

function begin(kind, phase, pose, now) {
  return { kind, phase, startedAt: now, x: pose.x, z: pose.z,
    yaw: angle(pose.yaw), pitch: Number.isFinite(pose.pitch) ? clamp(pose.pitch, -1.4, 1.4) : 0, from: 0 };
}

export function updateHomeValleyActivities(saved, {
  realm, now = realm?.time, command = null, paused = false, reducedMotion = false,
} = {}) {
  const state = createHomeValleyActivities(saved), events = [];
  const time = Number.isFinite(now) ? Math.max(0, now) : 0;
  const result = () => ({ state, focus: focusFor(state, realm),
    presentation: presentationFor(state, realm, time, reducedMotion), events });
  if (!valleyIsOpen(realm)) {
    state.active = null;
    return result();
  }
  if (paused) return result();

  const active = state.active, pose = realm.pose;
  if (!active) {
    if (command !== 'interact') return result();
    const focus = focusFor(state, realm);
    if (focus?.kind === 'maul') {
      state.active = begin('maul', 'lifting', pose, time);
      events.push('maul-picked-up');
    } else if (focus?.kind === 'angel') {
      state.active = begin('angel', 'lowering', pose, time);
      events.push('angel-lowering');
    }
    return result();
  }

  const elapsed = Math.max(0, time - active.startedAt);
  const abandon = command === 'cancel' || command === 'set-down';
  if (active.kind === 'maul') {
    if (abandon || !hasPoint(pose) || near(pose, HOME_VALLEY_ACTIVITY_POINTS.maul) > 1.70
      || (active.phase === 'held' && command === 'interact' && state.split)) {
      state.active = null;
      events.push('maul-set-down');
      return result();
    }
    if (active.phase === 'lifting' && elapsed >= timings.lift) {
      state.active = { ...active, phase: 'held', startedAt: time };
    } else if (active.phase === 'held' && command === 'interact') {
      state.active = { ...active, phase: 'swinging', startedAt: time };
      events.push('maul-swing');
    } else if (active.phase === 'swinging') {
      if (!state.split && elapsed >= timings.impact) {
        state.split = true;
        events.push('maul-impact');
      }
      if (elapsed >= timings.swing) state.active = { ...active, phase: 'held', startedAt: time };
    }
    return result();
  }

  if (!hasPoint(pose) || near(active, pose) > .20) {
    state.active = null;
    return result();
  }
  if (active.phase === 'rising') {
    if (elapsed >= timings.rise) {
      state.active = null;
      events.push('angel-stood');
    }
  } else if (abandon || command === 'move' || command === 'interact') {
    state.active = { ...active, phase: 'rising', startedAt: time, from: poseFor(active, elapsed).recline };
    events.push('angel-rising');
  } else if (active.phase === 'lowering' && elapsed >= timings.lower) {
    state.active = { ...active, phase: 'sweeping', startedAt: time };
    events.push('angel-snow-contact');
  } else if (active.phase === 'sweeping') {
    if (elapsed >= timings.sweep) {
      state.imprint = { x: active.x, z: active.z, yaw: active.yaw };
      state.active = { ...active, phase: 'rising', startedAt: time, from: 1, completed: true };
      events.push('angel-imprint', 'angel-rising');
    }
  }
  return result();
}
