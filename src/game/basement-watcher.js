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
    stand: Object.freeze({ x: 44.5, y: 10.5 }),
    yaw: Math.PI,
    spawnCandidates: Object.freeze([
      Object.freeze({ x: 44.5, y: 10.5 }),
      Object.freeze({ x: 45.0, y: 10.0 }),
      Object.freeze({ x: 44.0, y: 10.0 }),
    ]),
  }),
  [BASEMENT_WATCHER_ROOM.B5]: Object.freeze({
    id: BASEMENT_WATCHER_ROOM.B5,
    label: 'Studio B5',
    stand: Object.freeze({ x: 17.0, y: 29.5 }),
    yaw: 0,
    spawnCandidates: Object.freeze([
      Object.freeze({ x: 17.0, y: 29.5 }),
      Object.freeze({ x: 18.0, y: 29.5 }),
      Object.freeze({ x: 17.0, y: 28.0 }),
    ]),
  }),
});

export const BASEMENT_WATCHER_ROOM_IDS = Object.freeze(Object.keys(BASEMENT_WATCHER_ROOMS));

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
// prove that an inactive HUSH is spawned and an active HUSH is only retargeted.
export function applyBasementWatcherHuntResult(result, {
  isActive = () => false,
  spawn = () => false,
  retarget = () => false,
} = {}) {
  if (!result?.huntTriggered) return { spawned: false, retargeted: false };
  let spawned = false;
  if (!isActive()) spawned = !!spawn();
  const retargeted = isActive() ? !!retarget() : false;
  return { spawned, retargeted };
}
