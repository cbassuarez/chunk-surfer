import { SOURCE_CONTINUATION } from '../data/source-continuation.js';

// This controller borrows a detached Ellery layout. It has no ordinary-world,
// inventory, Contact, recorder or normal-exit authority.
const KIND = 'source-false-return';
const VERSION = 1;
const BODY_RADIUS = .22;
const BODY_HEIGHT = 1.8;
const WALK_SPEED = 3;
const STEP_UP = .45;
const PASSABLE = .85;
const SWING_SECONDS = .45;
const DEFAULT_SPAWN = { x: 75, z: 58.75, feet: 4.8, yaw: -Math.PI / 2, pitch: 0 };
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, finite(v, lo)));
const angle = v => Math.atan2(Math.sin(finite(v)), Math.cos(finite(v)));
const idOK = id => typeof id === 'string' && /^[a-zA-Z0-9_:-]{1,96}$/.test(id);
const ids = value => [...new Set((Array.isArray(value) ? value : []).filter(idOK))].slice(0, 96);
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const mapIds = (value, fn) => Object.fromEntries(Object.entries(record(value)).filter(([id]) => idOK(id)).slice(0, 96).map(([id, v]) => [id, fn(v)]));
const localPose = (value, fallback = DEFAULT_SPAWN) => ({
  x: clamp(finite(value?.x, fallback.x), -10000, 10000),
  z: clamp(finite(value?.z, fallback.z), -10000, 10000),
  feet: clamp(finite(value?.feet, fallback.feet), -10000, 10000),
  yaw: angle(value?.yaw ?? fallback.yaw), pitch: clamp(value?.pitch ?? fallback.pitch, -1.3, 1.3),
});
function hostPose(value) {
  if (!value || typeof value !== 'object' || !Number.isFinite(value.x)
    || !Number.isFinite(value.y) && !Number.isFinite(value.z)) return null;
  try {
    if (Object.values(value).some(v => typeof v === 'number' && !Number.isFinite(v))) return null;
    return JSON.parse(JSON.stringify(value));
  } catch { return null; }
}

export function freshSourceFalseReturn({ runId = '', returnPose = null, spawn = DEFAULT_SPAWN } = {}) {
  const at = localPose(spawn);
  return { version: VERSION, kind: KIND, runId: String(runId), status: 'active', ...at,
    elapsed: 0, opened: [], sourceDoors: [], doorOpen: {}, doorMotion: {}, doorSides: {},
    loopLatch: null, lastSafe: { ...at }, returnPose: hostPose(returnPose), exitReceipt: null };
}

export function normalizeSourceFalseReturn(value, { runId, spawn = DEFAULT_SPAWN } = {}) {
  const validOrigin = value?.version === VERSION && value?.kind === KIND
    && (runId == null || String(runId) === String(value.runId));
  const fresh = freshSourceFalseReturn({ runId: runId ?? value?.runId ?? '', spawn, returnPose: validOrigin ? value?.returnPose : null });
  if (!value || value.version !== VERSION || value.kind !== KIND
    || runId != null && String(runId) !== String(value.runId)) return fresh;
  const state = { ...fresh, ...localPose(value, localPose(spawn)),
    status: value.status === 'completed' ? 'completed' : 'active',
    elapsed: clamp(value.elapsed, 0, 1e9), opened: ids(value.opened), sourceDoors: ids(value.sourceDoors),
    doorOpen: mapIds(value.doorOpen, Boolean), doorMotion: {},
    doorSides: mapIds(value.doorSides, v => v < 0 ? -1 : 1),
    loopLatch: idOK(value.loopLatch) ? value.loopLatch : null,
    lastSafe: localPose(value.lastSafe, localPose(spawn)), returnPose: hostPose(value.returnPose) };
  for (const [id, m] of Object.entries(record(value.doorMotion))) {
    if (!idOK(id) || !m || !['from', 'startedAt', 'duration'].every(k => Number.isFinite(m[k]))) continue;
    state.doorMotion[id] = { from: clamp(m.from, 0, 1), to: state.doorOpen[id] ? 1 : 0,
      startedAt: clamp(m.startedAt, 0, state.elapsed), duration: clamp(m.duration, 0, SWING_SECONDS) };
  }
  if (state.status === 'completed' && state.opened.length >= 5 && idOK(value.exitReceipt?.doorId)) {
    state.exitReceipt = { id: `${state.runId}:${KIND}:source-II`, doorId: value.exitReceipt.doorId, delivered: !!value.exitReceipt.delivered };
  } else state.status = 'active';
  return state;
}

export function sourceFalseReturnNeeded(value, continuation, direction = 'forward', { earthfall = null } = {}) {
  if (direction !== 'forward' || !continuation || continuation.completed || continuation.direction === 'reverse') return false;
  const sameRun = value?.kind === KIND && value.version === VERSION && String(value.runId) === String(continuation.runId);
  if (sameRun) return value.status === 'active';
  // Journeys begun before this insertion keep their existing omen and body.
  if (earthfall) return false;
  const s = SOURCE_CONTINUATION.spawn;
  return continuation.phase === 'wrong-return' && (continuation.elapsed || 0) < .001
    && !(continuation.knowledge || []).length && !(continuation.wrongLap || 0)
    && Math.hypot(continuation.x - s.x, continuation.z - s.z) < .05
    && Math.abs(continuation.feet - s.feet) < .05;
}

export function sourceFalseReturnDoorFraction(state, id) {
  const m = state?.doorMotion?.[id];
  if (!m) return state?.doorOpen?.[id] ? 1 : 0;
  const p = m.duration > 0 ? clamp((finite(state.elapsed) - m.startedAt) / m.duration, 0, 1) : 1;
  return clamp(m.from + ((m.to ? 1 : 0) - m.from) * p, 0, 1);
}

const sourceBound = (state, id) => state.opened.length >= 5 || state.sourceDoors.includes(id);
const doorFeet = d => finite(d.feet, finite(d.y));
function normal(d) {
  const x = finite(d.normal?.x, Math.sin(finite(d.yaw))), z = finite(d.normal?.z, -Math.cos(finite(d.yaw)));
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}
const signedDistance = (p, d, n = normal(d)) => (p.x - d.x) * n.x + (p.z - d.z) * n.z;
const halfWidth = d => finite(d.halfWidth, finite(d.width, finite(d.aperture?.width, 1.2)) / 2);
// Leaf indices follow the retained assembly's local width axis: leaf 0 is
// the negative half, leaf 1 the positive half, regardless of room-side normal.
export function sourceFalseReturnDoorAllowsWidth(door, widthCoord, radius = BODY_RADIUS) {
  if (!door || typeof door !== 'object' || !Number.isFinite(widthCoord) || !Number.isFinite(radius) || radius < 0) return false;
  const half = halfWidth(door), count = Math.max(1, Math.min(8, Math.round(finite(door?.leafCount, 1))));
  if (!(half > 0)) return false;
  const active = new Set(Array.isArray(door.activeLeaves) ? door.activeLeaves
    : Array.from({ length: count }, (_, i) => i));
  const low = widthCoord - radius, high = widthCoord + radius, width = half * 2 / count;
  let start = null;
  for (let i = 0; i < count; i++) {
    if (active.has(i)) {
      start ??= -half + i * width;
      const end = -half + (i + 1) * width;
      if (low >= start - 1e-9 && high <= end + 1e-9) return true;
    } else start = null;
  }
  return false;
}
const inBounds = (p, b) => !!b && p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
function support(p, state, layout) {
  const s = layout?.supportAt?.(p.x, p.z, { ...state, feet: p.feet });
  return s && Number.isFinite(s.floor) && Math.abs(s.floor - p.feet) <= STEP_UP + 1e-8
    && (!Number.isFinite(s.ceil) || s.ceil - s.floor >= BODY_HEIGHT) ? s : null;
}
function occupiable(p, state, layout) {
  return (!layout.bounds || inBounds(p, layout.bounds)) && !!support(p, state, layout)
    && (typeof layout.canOccupy !== 'function' || layout.canOccupy(p.x, p.z, { ...state, feet: p.feet }));
}
function seedLayout(state, layout) {
  const doors = layout.doors || [], known = new Set(doors.map(d => d.id));
  state.opened = state.opened.filter(id => doors.some(d => d.id === id && d.counted));
  state.sourceDoors = state.sourceDoors.filter(id => known.has(id));
  for (const key of ['doorOpen', 'doorMotion', 'doorSides']) for (const id of Object.keys(state[key])) if (!known.has(id)) delete state[key][id];
  for (const d of doors) if (!(d.id in state.doorOpen)) state.doorOpen[d.id] = !!d.openInitial;
}

export function sourceFalseReturnFocus(value, layout = {}) {
  const state = normalizeSourceFalseReturn(value, { spawn: layout.spawn });
  if (state.status !== 'active') return null;
  seedLayout(state, layout);
  const forward = { x: Math.sin(state.yaw), z: -Math.cos(state.yaw) };
  const candidates = (layout.doors || []).filter(d => Math.abs(state.feet - doorFeet(d)) < .45)
    .map(d => ({ d, distance: Math.hypot(state.x - d.x, state.z - d.z) }))
    .filter(({ d, distance }) => distance < 1.65 && (distance < .35
      || ((d.x - state.x) * forward.x + (d.z - state.z) * forward.z) / distance > -.15))
    .sort((a, b) => a.distance - b.distance);
  const d = candidates[0]?.d;
  if (!d) return null;
  const locked = !d.counted && !d.entry && !sourceBound(state, d.id);
  return { type: 'door', id: d.id, locked, sourceBound: sourceBound(state, d.id),
    open: !!state.doorOpen[d.id], openFraction: sourceFalseReturnDoorFraction(state, d.id),
    title: locked ? 'LOCKED' : state.doorOpen[d.id] ? 'CLOSE THE DOOR' : 'OPEN THE DOOR',
    position: { x: d.x, y: doorFeet(d) + 1.1, z: d.z } };
}

function toggleDoor(state, layout, events) {
  const focus = sourceFalseReturnFocus(state, layout);
  if (!focus || focus.locked) return;
  const d = layout.doors.find(d => d.id === focus.id), from = sourceFalseReturnDoorFraction(state, d.id);
  const open = !state.doorOpen[d.id];
  if (!open) {
    const n = normal(d), dx = state.x - d.x, dz = state.z - d.z;
    if (Math.abs(dx * n.x + dz * n.z) <= BODY_RADIUS + finite(d.leaf?.depth, .08) / 2
      && Math.abs(-dx * n.z + dz * n.x) <= halfWidth(d) + BODY_RADIUS) {
      events.push({ type: 'door-obstructed', id: d.id }); return;
    }
  }
  state.doorOpen[d.id] = open;
  state.doorMotion[d.id] = { from, to: open ? 1 : 0, startedAt: state.elapsed,
    duration: clamp(finite(d.openSeconds, SWING_SECONDS), .05, SWING_SECONDS) * Math.abs((open ? 1 : 0) - from) };
  if (open && d.counted && !state.opened.includes(d.id) && state.opened.length === 4 && !state.sourceDoors.includes(d.id)) state.sourceDoors.push(d.id);
  events.push({ type: 'door', id: d.id, open, sourceBound: sourceBound(state, d.id) });
}
function countDoors(state, layout, events) {
  for (const d of layout.doors || []) {
    if (!d.counted || state.opened.includes(d.id) || sourceFalseReturnDoorFraction(state, d.id) + 1e-9 < PASSABLE) continue;
    state.opened.push(d.id);
    if (state.opened.length >= 5 && !state.sourceDoors.includes(d.id)) state.sourceDoors.push(d.id);
    events.push({ type: 'door-passable', id: d.id, count: state.opened.length, sourceBound: sourceBound(state, d.id) });
  }
}
function loop(state, target, events) {
  Object.assign(state, localPose(target.arrival));
  state.lastSafe = localPose(state); state.loopLatch = target.id; state.doorSides = {};
  events.push({ type: 'loop', id: target.id, arrival: localPose(state) });
}
function complete(state, doorId, events) {
  state.status = 'completed';
  state.exitReceipt = { id: `${state.runId}:${KIND}:source-II`, doorId, delivered: false };
  events.push({ type: 'complete', doorId, receipt: { ...state.exitReceipt } });
}
function crossedDoor(state, from, to, d) {
  if (Math.abs(state.feet - doorFeet(d)) > .45) return null;
  const n = normal(d), a = signedDistance(from, d, n), b = signedDistance(to, d, n);
  const oldSide = Math.abs(a) > 1e-9 ? Math.sign(a) : state.doorSides[d.id];
  if (Math.abs(b) > 1e-9) state.doorSides[d.id] = Math.sign(b);
  if (!oldSide || !Math.sign(b) || oldSide === Math.sign(b)) return null;
  const t = Math.abs(a - b) > 1e-10 ? clamp(a / (a - b), 0, 1) : 0;
  const x = from.x + (to.x - from.x) * t - d.x, z = from.z + (to.z - from.z) * t - d.z;
  return { tangent: Math.abs(x * -n.z + z * n.x), widthCoord: x * Math.cos(finite(d.yaw)) + z * Math.sin(finite(d.yaw)) };
}
function advanceMove(state, dx, dz, layout, events) {
  const distance = Math.hypot(dx, dz), steps = Math.max(1, Math.ceil(distance / .06));
  for (let i = 0; i < steps; i++) {
    const from = { x: state.x, z: state.z }, to = { x: state.x + dx / steps, z: state.z + dz / steps, feet: state.feet };
    const oldSides = { ...state.doorSides }, crossings = [];
    let blocked = false;
    for (const d of layout.doors || []) {
      const crossing = crossedDoor(state, from, to, d);
      if (!crossing || crossing.tangent > halfWidth(d) + BODY_RADIUS) continue;
      if (!sourceFalseReturnDoorAllowsWidth(d, crossing.widthCoord) || sourceFalseReturnDoorFraction(state, d.id) < PASSABLE) { blocked = true; break; }
      crossings.push(d);
    }
    // The far side of a Source-bound doorway is no longer Ellery. Validate
    // the real approach and aperture, then consume its crossing before asking
    // the old building for a floor beyond the threshold.
    const onward = !blocked && state.opened.length >= 5
      ? crossings.find(d => sourceBound(state, d.id)) : null;
    if (onward && occupiable({ ...from, feet: state.feet }, state, layout)) {
      state.x = to.x; state.z = to.z;
      complete(state, onward.id, events); return true;
    }
    const s = support(to, state, layout);
    if (s) to.feet = s.floor;
    if (blocked || !s || !occupiable(to, state, layout)) { state.doorSides = oldSides; return false; }
    state.x = to.x; state.z = to.z; state.feet = s.floor;
    for (const d of crossings) {
      if (d.entry) { loop(state, { id: `entry:${d.id}`, arrival: layout.spawn }, events); return true; }
    }
    for (const target of layout.loops || []) {
      if (state.loopLatch !== target.id && inBounds(state, target.bounds)
        && (!Number.isFinite(target.beforeCount) || state.opened.length < target.beforeCount)
        && !(target.sourceAfterFifth && state.opened.length >= 5)
        && (!Number.isFinite(target.feet) || Math.abs(state.feet - target.feet) < .45)) {
        loop(state, target, events);
        return true;
      }
    }
    if (state.loopLatch && !(layout.loops || []).some(l => l.id === state.loopLatch && inBounds(state, l.bounds))) state.loopLatch = null;
    state.lastSafe = localPose(state);
  }
  return false;
}

export function stepSourceFalseReturn(value, input = {}, layout = {}) {
  const state = normalizeSourceFalseReturn(value, { spawn: layout.spawn }), events = [];
  if (state.status !== 'active' || input.paused || input.protected || input.renderReady === false || input.assetsReady === false) return { state, events };
  seedLayout(state, layout);
  if (!occupiable(state, state, layout)) {
    const safe = occupiable(state.lastSafe, state, layout) ? state.lastSafe : localPose(layout.spawn);
    Object.assign(state, safe); state.lastSafe = localPose(state); state.doorSides = {};
  }
  const footing = support(state, state, layout);
  if (footing) state.feet = footing.floor;
  const look = input.look || {};
  state.yaw = angle(Number.isFinite(look.yaw) ? look.yaw : state.yaw + finite(look.dx ?? input.yawDelta));
  state.pitch = clamp(Number.isFinite(look.pitch) ? look.pitch : state.pitch + finite(look.dy ?? input.pitchDelta), -1.3, 1.3);
  countDoors(state, layout, events);
  if (input.interact) toggleDoor(state, layout, events);
  const dt = clamp(input.dt, 0, 1), steps = Math.max(1, Math.ceil(dt / (1 / 60)));
  const forward = clamp(input.forward ?? 0, -1, 1), side = clamp(input.side ?? 0, -1, 1), length = Math.max(1, Math.hypot(forward, side));
  for (let i = 0; i < steps && state.status === 'active'; i++) {
    const h = dt / steps; state.elapsed += h; countDoors(state, layout, events);
    const dx = (Math.sin(state.yaw) * forward + Math.cos(state.yaw) * side) * WALK_SPEED * h / length;
    const dz = (-Math.cos(state.yaw) * forward + Math.sin(state.yaw) * side) * WALK_SPEED * h / length;
    if (advanceMove(state, dx, dz, layout, events)) break;
  }
  return { state, events };
}
