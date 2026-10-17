// One apparition in one downstairs room, selected once per run. The watcher
// is not an adversary: it is a persisted, one-shot trigger for the existing
// Presence. Rendering and HUSH ownership remain in main.js.
//
// IT BORROWS THE ONE BODY AND GIVES IT BACK. A hunt it starts lives in its own
// room and ends when the player has left that room, or once it has touched
// him. Before this the confinement had no end at all: the building's only HUSH
// stayed walled into B1 or B5 for the rest of the session, which made the night
// quieter everywhere else — the opposite of what seeing a watcher should cost.
// And it never takes a body that is already hunting somewhere else; that one
// only hears that something moved down here.

export const BASEMENT_WATCHER_SCHEMA = 1;

export const BASEMENT_WATCHER_ROOM = Object.freeze({
  B1: 'b1',
  B5: 'b5',
  STORE: 'store',
  LIFT: 'lift',
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
  // The dead end opposite the stair. Its door is shut, so the figure is a thing
  // you find by opening it, between the costume rails, facing the door.
  [BASEMENT_WATCHER_ROOM.STORE]: Object.freeze({
    id: BASEMENT_WATCHER_ROOM.STORE,
    label: 'the prop store',
    stand: Object.freeze({ x: 2.5, y: 17.0 }),
    yaw: Math.PI,
    bounds: Object.freeze({ minX: 1, minY: 8, maxX: 5, maxY: 22 }),
    spawnCandidates: Object.freeze([
      Object.freeze({ x: 2.5, y: 17.0 }),
      Object.freeze({ x: 3.0, y: 17.0 }),
      Object.freeze({ x: 2.5, y: 13.0 }),
    ]),
  }),
  // Behind the B1 hatch the master key still turns: a pit, no car. The hatch
  // itself stays outside the bounds, so the body can come to it and no further.
  [BASEMENT_WATCHER_ROOM.LIFT]: Object.freeze({
    id: BASEMENT_WATCHER_ROOM.LIFT,
    label: 'the lift pit',
    stand: Object.freeze({ x: 43.5, y: 9.0 }),
    yaw: Math.PI,
    bounds: Object.freeze({ minX: 42, minY: 8, maxX: 45, maxY: 10.5 }),
    spawnCandidates: Object.freeze([
      Object.freeze({ x: 43.5, y: 9.0 }),
      Object.freeze({ x: 43.0, y: 9.0 }),
      Object.freeze({ x: 44.0, y: 9.0 }),
    ]),
  }),
});

export const BASEMENT_WATCHER_ROOM_IDS = Object.freeze(Object.keys(BASEMENT_WATCHER_ROOMS));
// The prop store now owns the Costume Exchange performance. Fresh watcher
// assignments use the three other valid rooms, while saved STORE assignments
// remain loadable and resolve exactly as before.
export const BASEMENT_WATCHER_DEAL_ROOMS = Object.freeze(BASEMENT_WATCHER_ROOM_IDS.filter(id=>id!==BASEMENT_WATCHER_ROOM.STORE));

// Half-open authored bounds name the air inside each studio, not its doorway.
// Keeping the threshold out is deliberate: neither the body nor any evidence
// of it is allowed to occupy the shared corridor or the B1 lift pocket.
export function basementWatcherRoomContains(roomId, point) {
  const bounds = BASEMENT_WATCHER_ROOMS[roomId]?.bounds;
  if (!bounds || !point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return false;
  const x = Number(point.x), y = Number(point.y);
  return x >= bounds.minX && x < bounds.maxX && y >= bounds.minY && y < bounds.maxY;
}

// The nearest point inside the room to somebody standing outside it, pulled in
// from the walls by `inset`. A hunt started from the doorway goes there: it
// comes as far as the doorway it cannot cross, and no further.
export function basementWatcherClampToRoom(roomId, point, inset = .5) {
  const bounds = BASEMENT_WATCHER_ROOMS[roomId]?.bounds;
  if (!bounds || !point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return {
    x: clamp(Number(point.x), bounds.minX + inset, bounds.maxX - inset),
    y: clamp(Number(point.y), bounds.minY + inset, bounds.maxY - inset),
  };
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
  const index = Math.floor(runSample(runId, 'room') * BASEMENT_WATCHER_DEAL_ROOMS.length)
    % BASEMENT_WATCHER_DEAL_ROOMS.length;
  return BASEMENT_WATCHER_DEAL_ROOMS[index];
}

export function watcherRollForRun(runId) {
  return runSample(runId, 'hunt');
}

export function watcherChanceForPreset(currentPreset = 'contract', startedPreset = currentPreset) {
  const hard = new Set(['night', 'dead-air']);
  return hard.has(String(currentPreset)) || hard.has(String(startedPreset)) ? .45 : .30;
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
// prove that a fresh HUSH spawns inside the room and is pointed at the player.
//
// A HUSH that is already live elsewhere is NOT moved here. It is the building's
// hunt, and teleporting it into a sealed studio is what used to switch the rest
// of the night off. It is told that something moved in this room (`alert`),
// and it comes or does not by its own rules.
export function applyBasementWatcherHuntResult(result, {
  isActive = () => false,
  spawn = () => false,
  retarget = () => false,
  alert = () => false,
} = {}) {
  if (!result?.huntTriggered) return { spawned: false, confined: false, retargeted: false, alerted: false };
  if (isActive()) return { spawned: false, confined: false, retargeted: false, alerted: !!alert() };
  const spawned = !!spawn();
  const retargeted = spawned && isActive() ? !!retarget() : false;
  return { spawned, confined: spawned, retargeted, alerted: false };
}

// ── LETTING IT GO ───────────────────────────────────────────────────────────
//
// Pure, so the two ways out are pinned without a building. `outsideSec` is how
// long the player has to be out of the room before the body is released — long
// enough for it to come to the doorway and stand there. A contact releases it
// `afterContactSec` later, once the contact itself has played. Neither clock
// runs while a scene owns the screen.
export const BASEMENT_WATCHER_RELEASE = Object.freeze({
  outsideSec: 6,
  afterContactSec: 2.5,
});

export function freshBasementWatcherRelease(contacts = 0) {
  return { outsideSec: 0, contactsAtSpawn: Math.max(0, Number(contacts) || 0), sinceContactSec: null };
}

export function stepBasementWatcherRelease(release, {
  dt = 0, playerInside = false, contacts = 0, busy = false,
} = {}) {
  const current = release || freshBasementWatcherRelease(contacts);
  const step = busy ? 0 : Math.max(0, Number(dt) || 0);
  const touched = (Number(contacts) || 0) > current.contactsAtSpawn;
  const next = {
    ...current,
    outsideSec: playerInside ? 0 : current.outsideSec + step,
    sinceContactSec: touched ? (current.sinceContactSec ?? 0) + step : null,
  };
  const done = next.outsideSec >= BASEMENT_WATCHER_RELEASE.outsideSec
    || (next.sinceContactSec != null && next.sinceContactSec >= BASEMENT_WATCHER_RELEASE.afterContactSec);
  return { release: next, done, reason: !done ? null : next.sinceContactSec != null && next.sinceContactSec >= BASEMENT_WATCHER_RELEASE.afterContactSec ? 'contact' : 'left' };
}
