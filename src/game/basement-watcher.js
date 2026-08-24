// One apparition in one downstairs studio, selected once per run. The watcher
// is not an adversary: it is a persisted, one-shot trigger for the existing
// Presence. Rendering and HUSH ownership remain in main.js.

export const BASEMENT_WATCHER_SCHEMA = 1;

export const BASEMENT_WATCHER_ROOM = Object.freeze({
  B1: 'b1',
  B5: 'b5',
});

export const BASEMENT_WATCHER_ROOMS = Object.freeze({
  [BASEMENT_WATCHER_ROOM.B1]: Object.freeze({
    id: BASEMENT_WATCHER_ROOM.B1,
    label: 'Studio B1',
    // The room proper is south of the bricked lift pocket. The old 10.5 mark
    // stood in that pocket, outside the studio whose name the encounter uses.
    stand: Object.freeze({ x: 44.5, y: 13.5 }),
    yaw: Math.PI,
    bounds: Object.freeze({ minX: 40, minY: 12, maxX: 49, maxY: 21 }),
    spawnCandidates: Object.freeze([
      Object.freeze({ x: 44.5, y: 13.5 }),
      Object.freeze({ x: 45.0, y: 14.0 }),
      Object.freeze({ x: 44.0, y: 14.0 }),
    ]),
  }),
  [BASEMENT_WATCHER_ROOM.B5]: Object.freeze({
    id: BASEMENT_WATCHER_ROOM.B5,
    label: 'Studio B5',
    stand: Object.freeze({ x: 17.0, y: 29.5 }),
    yaw: 0,
    bounds: Object.freeze({ minX: 8, minY: 26, maxX: 24, maxY: 33 }),
    spawnCandidates: Object.freeze([
      Object.freeze({ x: 17.0, y: 29.5 }),
      Object.freeze({ x: 18.0, y: 29.5 }),
      Object.freeze({ x: 17.0, y: 28.0 }),
    ]),
  }),
});

export const BASEMENT_WATCHER_ROOM_IDS = Object.freeze(Object.keys(BASEMENT_WATCHER_ROOMS));

// Half-open authored bounds name the air inside each studio, not its doorway.
// Keeping the threshold out is deliberate: neither the body nor any evidence
// of it is allowed to occupy the shared corridor or the B1 lift pocket.
export function basementWatcherRoomContains(roomId, point) {
  const bounds = BASEMENT_WATCHER_ROOMS[roomId]?.bounds;
  if (!bounds || !point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return false;
  const x = Number(point.x), y = Number(point.y);
  return x >= bounds.minX && x < bounds.maxX && y >= bounds.minY && y < bounds.maxY;
}

export function basementWatcherSignalContained(roomId, actor, observer) {
  return basementWatcherRoomContains(roomId, actor)
    && basementWatcherRoomContains(roomId, observer);
}

export const BASEMENT_WATCHER_ISOLATION_DB = 120;

export function basementWatcherAcousticIsolationDb(roomId, source, listener) {
  return basementWatcherSignalContained(roomId, source, listener)
    ? 0
    : BASEMENT_WATCHER_ISOLATION_DB;
}

function hash32(text) {
  let hash = 2166136261;
  for (const char of String(text || 'run')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function runSample(runId, channel) {
  return hash32(`chunk-surfer:basement-watcher:${channel}:${String(runId || 'legacy-run')}`) / 4294967296;
}

export function watcherRoomForRun(runId) {
  const index = Math.floor(runSample(runId, 'room') * BASEMENT_WATCHER_ROOM_IDS.length)
    % BASEMENT_WATCHER_ROOM_IDS.length;
  return BASEMENT_WATCHER_ROOM_IDS[index];
}

export function watcherRollForRun(runId) {
  return runSample(runId, 'hunt');
}

export function watcherChanceForPreset(currentPreset = 'contract', startedPreset = currentPreset) {
  const hard = new Set(['night', 'dead-air']);
  return hard.has(String(currentPreset)) || hard.has(String(startedPreset)) ? .50 : .35;
}

export function freshBasementWatcherState() {
  return {
    schema: BASEMENT_WATCHER_SCHEMA,
    roomId: null,
    seen: false,
    armed: false,
    resolved: false,
    roll: null,
    huntTriggered: false,
  };
}

export function normalizeBasementWatcherState(value = null) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const roomId = BASEMENT_WATCHER_ROOM_IDS.includes(source.roomId) ? source.roomId : null;
  const resolved = !!source.resolved;
  const roll = resolved && Number.isFinite(Number(source.roll))
    ? Math.max(0, Math.min(.999999999999, Number(source.roll)))
    : null;
  const seen = resolved || !!source.seen;
  return {
    schema: BASEMENT_WATCHER_SCHEMA,
    roomId,
    seen,
    armed: !resolved && seen && source.armed !== false,
    resolved,
    roll,
    huntTriggered: resolved && !!source.huntTriggered,
  };
}

export function ensureBasementWatcherState(value, runId) {
  const state = normalizeBasementWatcherState(value);
  return state.roomId ? state : { ...state, roomId: watcherRoomForRun(runId) };
}

export function markBasementWatcherSeen(value) {
  const state = normalizeBasementWatcherState(value);
  if (state.resolved || !state.roomId) return state;
  return { ...state, seen: true, armed: true };
}

export function resolveBasementWatcherMovement(value, {
  runId = 'legacy-run',
  currentPreset = 'contract',
  startedPreset = currentPreset,
  roll = null,
} = {}) {
  const state = normalizeBasementWatcherState(value);
  if (!state.roomId || !state.armed || state.resolved) {
    return { changed: false, rolled: false, huntTriggered: state.huntTriggered, chance: null, state };
  }
  const chance = watcherChanceForPreset(currentPreset, startedPreset);
  const sample = Number.isFinite(Number(roll))
    ? Math.max(0, Math.min(.999999999999, Number(roll)))
    : watcherRollForRun(runId);
  const huntTriggered = sample < chance;
  return {
    changed: true,
    rolled: true,
    huntTriggered,
    chance,
    state: {
      ...state,
      seen: true,
      armed: false,
      resolved: true,
      roll: sample,
      huntTriggered,
    },
  };
}

// Keep the encounter's only side effect injectable: the main runtime supplies
// the existing Presence spawn/target operations, while deterministic tests can
// prove that a fresh HUSH spawns inside the room and an already-active single
// Presence body is placed there before it is retargeted.
export function applyBasementWatcherHuntResult(result, {
  isActive = () => false,
  spawn = () => false,
  confine = () => false,
  retarget = () => false,
} = {}) {
  if (!result?.huntTriggered) return { spawned: false, confined: false, retargeted: false };
  const wasActive = !!isActive();
  let spawned = false;
  let confined = false;
  if (!wasActive) {
    spawned = !!spawn();
    confined = spawned;
  } else {
    // There is one Presence actor. If another beat already has it live, move
    // that same body onto the watcher cell so this encounter cannot inherit a
    // body standing somewhere beyond the room it is about to be locked into.
    confined = !!confine();
  }
  const retargeted = isActive() ? !!retarget() : false;
  return { spawned, confined, retargeted };
}
