// Story state for the optional coast. Geometry and walking remain with the host;
// this module never writes the Source body, owns a camera, or captures audio.
export const COASTAL_MEMORY_KIND = 'coastal-memory';
export const COASTAL_MEMORY_VERSION = 1;
export const COASTAL_MEMORY_TAKE = 'coastal-memory-musicbox';
export const COASTAL_MEMORY_CUE = 'coastal.memory.musicbox';
export const COASTAL_MEMORY_SECONDS = 14;
export const COASTAL_MEMORY_LISTEN_SECONDS = 9;
export const COASTAL_WRECK_LIGHT_SECONDS = 1.4;

const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, finite(v, lo)));
const copy = value => value == null ? value : structuredClone(value);
const poseKeys = ['x', 'z', 'feet', 'yaw', 'pitch'];
const sameKind = value => value?.kind === COASTAL_MEMORY_KIND && value.version === COASTAL_MEMORY_VERSION;
const text = value => typeof value === 'string' ? value.slice(0, 160) : '';
const receiptPrefix = state => `${state.runId || 'unbound'}:${COASTAL_MEMORY_KIND}`;
const held = input => input.paused || input.hidden || input.interrupted || input.renderReady === false;
// Accumulated AudioContext deltas may miss the threshold by a few ulps.
const listenSeconds = value => {
  const seconds = clamp(value, 0, COASTAL_MEMORY_LISTEN_SECONDS);
  return seconds >= COASTAL_MEMORY_LISTEN_SECONDS - 1e-9 ? COASTAL_MEMORY_LISTEN_SECONDS : seconds;
};

function layoutOf(layout) {
  if (!layout?.spawn || !layout.musicBox || !layout.pierReturnPlane?.point || !layout.pierReturnPlane?.normal)
    throw new TypeError('Coastal memory needs its authored spawn, music box and pier return plane.');
  const plane = layout.pierReturnPlane;
  if (![layout.spawn.x, layout.spawn.z, layout.spawn.feet, layout.musicBox.x, layout.musicBox.y,
    layout.musicBox.z, plane.point.x, plane.point.z, plane.normal.x, plane.normal.z].every(Number.isFinite)
    || Math.hypot(plane.normal.x, plane.normal.z) < 1e-6)
    throw new TypeError('Coastal memory layout contains invalid geometry.');
  return layout;
}

function sourcePose(value) {
  if (!value || ![value.x, value.y].every(Number.isFinite)) return null;
  for (const key of ['facing', 'yaw', 'pitch', 'floorH', 'eyeHeight'])
    if (value[key] != null && !Number.isFinite(value[key])) return null;
  // A return is the actual captured pose, not a rounded/reoriented checkpoint.
  return copy(value);
}

function localPose(value, layout, fallback = layout.spawn) {
  const result = Object.fromEntries(poseKeys.map(key => [key, finite(value?.[key], finite(fallback[key]))]));
  return result;
}

function supportPose(value, layout, previous = null) {
  if (!value || !poseKeys.every(key => value[key] == null || Number.isFinite(value[key]))) return null;
  const pose = localPose(value, layout, previous || layout.spawn);
  if (layout.canOccupy && !layout.canOccupy(pose.x, pose.z, pose.feet)) return null;
  if (layout.supportAt) {
    const support = layout.supportAt(pose.x, pose.z, pose.feet);
    if (support == null || support === false) return null;
    const y = typeof support === 'number' ? support : support.y ?? support.feet ?? support.height ?? support.floor;
    if (!Number.isFinite(y)) return null;
    pose.feet = y;
  }
  return pose;
}

export function freshCoastalMemory({ layout, runId = '', entryDoorId = '', returnPose = null } = {}) {
  layout = layoutOf(layout);
  const pose = localPose(layout.spawn, layout);
  return { kind: COASTAL_MEMORY_KIND, version: COASTAL_MEMORY_VERSION, runId: text(runId), entryDoorId: text(entryDoorId),
    status: 'not-started', active: false, visit: 0, pose, sampledPose: { ...pose },
    returnPose: sourcePose(returnPose), elapsed: 0, noteRead: false,
    wreckNoticed: false, wreckLightsElapsed: 0,
    listenedSeconds: 0, recordingOffset: 0, recordingHeard: false, recordingReceipt: null,
    returnElapsed: 0, returnReceipt: null, completed: false, rewardEarned: false, rewardConsumed: false };
}

export function normalizeCoastalMemory(value, { layout, runId, entryDoorId, returnPose } = {}) {
  layout = layoutOf(layout);
  const state = freshCoastalMemory({ layout, runId: runId ?? value?.runId, entryDoorId: entryDoorId ?? value?.entryDoorId, returnPose });
  if (!sameKind(value) || runId != null && text(runId) !== text(value.runId)) return state;
  state.returnPose = sourcePose(value.returnPose) || state.returnPose;
  state.entryDoorId = text(value.entryDoorId) || state.entryDoorId;
  state.pose = supportPose(value.pose, layout) || { ...state.pose };
  state.sampledPose = supportPose(value.sampledPose, layout) || { ...state.pose };
  state.visit = Math.max(0, Math.floor(finite(value.visit)));
  state.elapsed = Math.max(0, finite(value.elapsed));
  state.noteRead = value.noteRead === true;
  state.wreckNoticed = value.wreckNoticed === true;
  state.wreckLightsElapsed = state.wreckNoticed ? clamp(value.wreckLightsElapsed, 0, COASTAL_WRECK_LIGHT_SECONDS) : 0;
  state.listenedSeconds = listenSeconds(value.listenedSeconds);
  state.recordingOffset = ((finite(value.recordingOffset) % COASTAL_MEMORY_SECONDS) + COASTAL_MEMORY_SECONDS) % COASTAL_MEMORY_SECONDS;
  state.recordingHeard = state.listenedSeconds >= COASTAL_MEMORY_LISTEN_SECONDS;
  if (state.recordingHeard) state.recordingReceipt = { id: `${receiptPrefix(state)}:musicbox`,
    takeId: COASTAL_MEMORY_TAKE, cueId: COASTAL_MEMORY_CUE, durationSeconds: COASTAL_MEMORY_SECONDS,
    delivered: value.recordingReceipt?.id === `${receiptPrefix(state)}:musicbox` && value.recordingReceipt.delivered === true };
  const receipt = value.returnReceipt, id = `${receiptPrefix(state)}:return:${state.visit}`;
  if (receipt?.id === id && ['pier', 'retreat'].includes(receipt.reason) && state.returnPose) {
    state.returnReceipt = { id, reason: receipt.reason, delivered: receipt.delivered === true };
    state.returnElapsed = clamp(value.returnElapsed, 0, returnSeconds(layout));
    state.status = state.returnReceipt.delivered ? 'returned' : 'return-pending';
    state.completed = state.returnReceipt.delivered && receipt.reason === 'pier';
    state.rewardEarned = state.completed && state.recordingHeard;
    state.rewardConsumed = state.rewardEarned && value.rewardConsumed === true;
  } else if (value.status === 'active' && state.returnPose) state.status = 'active';
  state.active = state.status === 'active' || state.status === 'return-pending';
  return state;
}

const returnSeconds = layout => clamp(layout.returnFadeSeconds ?? .9, .1, 5);
const normal = plane => { const length = Math.hypot(plane.normal.x, plane.normal.z); return { x: plane.normal.x / length, z: plane.normal.z / length }; };
function crossedPier(from, to, layout) {
  const plane = layout.pierReturnPlane, n = normal(plane), p = plane.point;
  const penetration = Math.max(0, finite(plane.minimumAlong));
  const a = (from.x - p.x) * n.x + (from.z - p.z) * n.z - penetration;
  const b = (to.x - p.x) * n.x + (to.z - p.z) * n.z - penetration;
  if (!(a <= 0 && b > 0 && b > a)) return false;
  const t = -a / (b - a), x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
  const lateral = Math.abs((x - p.x) * n.z - (z - p.z) * n.x);
  return lateral <= Math.max(0, finite(plane.halfWidth, Infinity));
}

function barrierSightBlocked(eye, delta, barrier) {
  const low = barrier.groundY, high = low + (barrier.visibilityHeight ?? barrier.height);
  if (![low, high].every(Number.isFinite)) return false;
  const points = [0, 1], polygon = barrier.footprint;
  let inside;
  if (polygon?.length >= 3) {
    inside = t => {
      const x = eye[0] + delta[0] * t, z = eye[2] + delta[2] * t; let hit = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j], b = polygon[i];
        if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
      }
      return hit;
    };
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length], sx = b[0] - a[0], sz = b[1] - a[1];
      const determinant = delta[0] * sz - delta[2] * sx;
      if (Math.abs(determinant) < 1e-10) continue;
      const qx = a[0] - eye[0], qz = a[1] - eye[2], t = (qx * sz - qz * sx) / determinant, u = (qx * delta[2] - qz * delta[0]) / determinant;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) points.push(t);
    }
  } else {
    const x = eye[0] - barrier.x, z = eye[2] - barrier.z, radius = (barrier.visibilityRadius ?? barrier.radius * 1.16);
    const a = delta[0] ** 2 + delta[2] ** 2, b = 2 * (x * delta[0] + z * delta[2]), c = x * x + z * z - radius * radius, discriminant = b * b - 4 * a * c;
    if (!(a > 0 && discriminant >= 0)) return false;
    for (const t of [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)]) if (t > 0 && t < 1) points.push(t);
    inside = t => (x + delta[0] * t) ** 2 + (z + delta[2] * t) ** 2 <= radius * radius;
  }
  points.sort((a, b) => a - b);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (!inside((a + b) * .5)) continue;
    const ya = eye[1] + delta[1] * a, yb = eye[1] + delta[1] * b;
    if (Math.max(ya, yb) >= low && Math.min(ya, yb) <= high) return true;
  }
  return false;
}

// Recognition is a body/eye event, independent of evidence or progression.
// The bank ray and exact authored barrier footprints reject covered glances.
export function coastalWreckSight(pose, layout) {
  const m = layout?.settledBodyLocal;
  const target = layout?.wreckTarget || (m?.length === 16 ? [m[12] + m[4] * 1.2, m[13] + m[5] * 1.2, m[14] + m[6] * 1.2] : null);
  if (!target || !pose || ![...target, pose.x, pose.z, pose.feet, pose.yaw, pose.pitch].every(Number.isFinite)) return false;
  const eye = [pose.x, pose.feet + finite(layout.eyeHeight, 1.62), pose.z];
  const delta = target.map((v, i) => v - eye[i]), distance = Math.hypot(...delta);
  if (distance < 1 || distance > finite(layout.wreckSightRange, 120)) return false;
  const cp = Math.cos(pose.pitch), forward = [Math.sin(pose.yaw) * cp, Math.sin(pose.pitch), -Math.cos(pose.yaw) * cp];
  if (delta.reduce((v, d, i) => v + d / distance * forward[i], 0) < finite(layout.wreckSightDot, .94)) return false;
  if (layout.supportAt) {
    const steps = Math.ceil(distance / .2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps, p = eye.map((v, axis) => v + delta[axis] * t), support = layout.supportAt(p[0], p[2]);
      const y = typeof support === 'number' ? support : support?.y ?? support?.feet ?? support?.height ?? support?.floor;
      if (Number.isFinite(y) && y > p[1] + .005) return false;
    }
  }
  if (layout.barriers?.some(barrier => barrierSightBlocked(eye, delta, barrier))) return false;
  return true;
}

export function beginCoastalMemory(value, options = {}) {
  const state = normalizeCoastalMemory(value, options);
  if (!state.returnPose || state.completed) return null;
  if (state.active) return state;
  // A receipt protects one borrowed visit. After an acknowledged retreat, a
  // genuinely new entry captures the body as it stands now, while retaining
  // what was read/heard and the physical musicbox's saved phase.
  if (options.returnPose != null) {
    const captured = sourcePose(options.returnPose);
    if (!captured) return null;
    state.returnPose = captured;
  }
  if (options.entryDoorId != null) state.entryDoorId = text(options.entryDoorId);
  state.status = 'active'; state.active = true; state.visit += 1;
  state.pose = localPose(options.layout.spawn, options.layout); state.sampledPose = { ...state.pose };
  state.returnReceipt = null; state.returnElapsed = 0;
  return state;
}

// The host supplies the result of real, swept walking. Only supported poses are
// accepted; sampledPose remains the previous tick for the directed pier crossing.
export function setCoastalMemoryPose(value, pose, { layout, ...options } = {}) {
  const state = normalizeCoastalMemory(value, { layout, ...options });
  if (state.status !== 'active') return state;
  const next = supportPose(pose, layoutOf(layout), state.pose);
  if (next) state.pose = next;
  return state;
}

export function requestCoastalReturn(value, { layout, reason = 'retreat', ...options } = {}) {
  const state = normalizeCoastalMemory(value, { layout, ...options });
  if (state.status !== 'active' || !state.returnPose) return state;
  return beginReturn(state, reason);
}

function beginReturn(state, reason) {
  state.status = 'return-pending'; state.returnElapsed = 0;
  state.returnReceipt = { id: `${receiptPrefix(state)}:return:${state.visit}`, reason: reason === 'pier' ? 'pier' : 'retreat', delivered: false };
  return state;
}

export function coastalMemoryFrame(value, { layout, ...options } = {}) {
  const state = normalizeCoastalMemory(value, { layout, ...options });
  return frameFor(state, layout);
}

function frameFor(state, layout) {
  const eyeHeight = finite(layout.eyeHeight, 1.62), box = layout.musicBox;
  const distance = Math.hypot(state.pose.x - box.x, state.pose.z - box.z, state.pose.feet + eyeHeight - box.y);
  const canListen = state.status === 'active' && distance <= finite(layout.listenRadius, 5.4);
  const note = { x: finite(layout.note?.x, box.x), z: finite(layout.note?.z, box.z) };
  const noteDistance = Math.hypot(state.pose.x - note.x, state.pose.z - note.z);
  const returnCover = state.returnReceipt ? clamp(state.returnElapsed / returnSeconds(layout), 0, 1) : 0;
  const light = clamp(state.wreckLightsElapsed / COASTAL_WRECK_LIGHT_SECONDS, 0, 1);
  return { ...state, localPose: { ...state.pose }, canListen, sourceDistance: distance,
    canInspectNote: state.status === 'active' && noteDistance <= finite(layout.noteRadius, finite(box.interactionRadius, 3.2)),
    returnCover, returnReady: state.status === 'return-pending' && returnCover >= 1,
    wreckLightLevel: light * light * (3 - 2 * light),
    recording: state.recordingReceipt ? { ...state.recordingReceipt } : null,
    source: { ...box }, controlOwner: state.status === 'active' ? 'player' : 'covered-return' };
}

export function stepCoastalMemory(value, input = {}, { layout, ...options } = {}) {
  let state = normalizeCoastalMemory(value, { layout, ...options });
  const events = [], finish = () => ({ state, events, frame: frameFor(state, layout) });
  if (!state.active || held(input)) return finish();
  const dt = clamp(input.dt, 0, .25);
  if (state.wreckNoticed) state.wreckLightsElapsed = Math.min(COASTAL_WRECK_LIGHT_SECONDS, state.wreckLightsElapsed + dt);
  if (state.status === 'return-pending') {
    const before = state.returnElapsed; state.returnElapsed = Math.min(returnSeconds(layout), before + dt);
    if (before < returnSeconds(layout) && state.returnElapsed >= returnSeconds(layout)) events.push({ type: 'coastal-return-ready', receipt: state.returnReceipt.id });
    return finish();
  }
  if (input.pose) {
    const next = supportPose(input.pose, layout, state.pose);
    if (next) state.pose = next;
  }
  if (!state.wreckNoticed && coastalWreckSight(state.pose, layout)) {
    state.wreckNoticed = true;
    events.push({ type: 'coastal-wreck-noticed' });
  }
  const frame = frameFor(state, layout);
  state.elapsed += dt;
  if (input.inspectNote && frame.canInspectNote && !state.noteRead) { state.noteRead = true; events.push({ type: 'coastal-note-read' }); }
  // Preserve the physical object's phase even when the recorder is lowered.
  // This is transport persistence, independent of a listening receipt.
  if (input.audioRunning === true && input.sourceReady === true && Number.isFinite(input.recordingOffset))
    state.recordingOffset = ((input.recordingOffset % COASTAL_MEMORY_SECONDS) + COASTAL_MEMORY_SECONDS) % COASTAL_MEMORY_SECONDS;
  // A host must supply actual running monitor evidence. Merely approaching,
  // reading, simulation dt, or ambient music never earns the archival receipt.
  if (frame.canListen && input.recorderHeld && input.audioRunning === true && input.sourceReady === true) {
    state.listenedSeconds = listenSeconds(state.listenedSeconds + clamp(input.audibleSeconds, 0, COASTAL_MEMORY_SECONDS));
    if (!state.recordingHeard && state.listenedSeconds >= COASTAL_MEMORY_LISTEN_SECONDS) {
      state.recordingHeard = true;
      state.recordingReceipt = { id: `${receiptPrefix(state)}:musicbox`, takeId: COASTAL_MEMORY_TAKE,
        cueId: COASTAL_MEMORY_CUE, durationSeconds: COASTAL_MEMORY_SECONDS, delivered: false };
      events.push({ type: 'coastal-recording-heard', receipt: { ...state.recordingReceipt } });
    }
  }
  const departed = crossedPier(state.sampledPose, state.pose, layout);
  state.sampledPose = { ...state.pose };
  if (departed) { state = beginReturn(state, 'pier'); events.push({ type: 'coastal-return-requested', receipt: state.returnReceipt.id }); }
  return finish();
}

// Host commits physical tape first, then acknowledges its one-shot receipt.
export function acknowledgeCoastalRecording(value, receiptId, { layout, ...options } = {}) {
  const state = normalizeCoastalMemory(value, { layout, ...options });
  if (!state.recordingReceipt || state.recordingReceipt.id !== receiptId || state.recordingReceipt.delivered) return null;
  state.recordingReceipt.delivered = true; return state;
}

// Host must restore the exact Source body under complete cover before this ack.
export function acknowledgeCoastalReturn(value, receiptId, { layout, ...options } = {}) {
  const state = normalizeCoastalMemory(value, { layout, ...options });
  if (!frameFor(state, layout).returnReady || state.returnReceipt.id !== receiptId || state.returnReceipt.delivered) return null;
  state.returnReceipt.delivered = true; state.status = 'returned'; state.active = false;
  state.completed = state.returnReceipt.reason === 'pier';
  state.rewardEarned = state.completed && state.recordingHeard;
  return state;
}

export function consumeCoastalReward(value, { layout, ...options } = {}) {
  const state = normalizeCoastalMemory(value, { layout, ...options });
  if (!state.rewardEarned || state.rewardConsumed) return null;
  state.rewardConsumed = true; return state;
}
