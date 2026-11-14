import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChapelOutskirtsGodPreset, buildBellsGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { normalizeSourceStation } from '../src/game/chunk-surf-state.js';
import { stationDoorDestination, normalizeStationFieldSession, STATION_TOWER_CONNECTIONS } from '../src/data/station-field-destinations.js';
import { stationFieldVisit } from '../src/data/station-field-visits.js';

function create(route = 'chapel', seed = 4417, onState = () => {}) {
  const built = route === 'tower' ? buildBellsGodPreset(440, { seed }) : buildChapelOutskirtsGodPreset(4, { seed });
  const runtime = createSourceSpaceRuntime({ initialState: built.state, onState });
  runtime.setPlayerPosition(built.position);
  return runtime;
}
const sideOf = (door, distance = 1.5) => ({
  x: (door.threshold[0].x + door.threshold[1].x) / 2 + door.normal[0] * distance,
  y: (door.threshold[0].y + door.threshold[1].y) / 2 + door.normal[2] * distance,
  facing: 0, yaw: .23, pitch: -.12,
});
function cross(runtime, door) {
  assert.equal(runtime.openDoorFieldDoor(door.id).opened, true);
  const from = sideOf(door), to = sideOf(door, -1.5);
  runtime.setPlayerPosition(from);
  assert.equal(runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok, true);
  runtime.onStep(from, to);
  return from;
}
function returnResult(runtime, { meaningful = true, fieldId = null, connectionId = null } = {}) {
  const frame = runtime.stationFieldFrame(), visit = stationFieldVisit(frame.fieldId, { connectionId: frame.connectionId });
  const checkpoint = { version: 1, fieldId: fieldId || frame.fieldId, connectionId: connectionId || frame.connectionId,
    elapsed: 12, x: visit.returnDoor.x, z: visit.returnDoor.z, yaw: 0, pitch: 0,
    stage: 'returning', returnReason: 'crossed-return', returnElapsed: .45,
    witness: { landmarkId: visit.landmark.id, inspected: meaningful, at: 4 } };
  return { fieldId: frame.fieldId, connectionId: frame.connectionId, meaningful, checkpoint,
    receipt: meaningful ? { fieldId: frame.fieldId, connectionId: frame.connectionId, landmarkWitnessed: true, returned: true } : null };
}
const restore = (runtime) => createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(runtime.state())) });

test('both station roads guarantee first–fourth and coast; only chapel has home, no fifth or random failure', () => {
  for (const route of ['chapel', 'tower']) for (const seed of [5, 40, 4417, 29999]) {
    const runtime = create(route, seed), doors = runtime.doorFieldDoors().filter((door) => !door.route);
    assert.deepEqual([...new Set(doors.filter((door) => !door.shut).map((door) => door.fieldId).filter(Boolean))].sort(), ['first', 'fourth', 'second', 'third']);
    assert.equal(doors.filter((door) => door.destination.kind === 'coastal' && !door.shut).length, 1);
    assert.equal(doors.some((door) => door.destination.kind === 'home'), route === 'chapel');
    assert.ok(doors.every((door) => !door.key && !door.wrong && !door.fails && !door.lockIn && door.fieldId !== 'fifth'));
    const marked = doors.filter((door) => door.destination.connectionNumber);
    assert.deepEqual(marked.map((door) => door.connectionId), route === 'tower' ? [...STATION_TOWER_CONNECTIONS] : []);
    assert.ok(marked.every((door) => !door.shut));
  }
  assert.equal(stationDoorDestination('chapel', -1), null);
});

test('field entry, exact Source approach pose and scene checkpoint are saved atomically and survive reload', () => {
  const saves = [];
  let runtime = create('chapel', 4417, (state) => saves.push(structuredClone(state)));
  const door = runtime.doorFieldDoors().find((entry) => entry.fieldId === 'third' && !entry.shut);
  const from = cross(runtime, door), frame = runtime.stationFieldFrame();
  assert.equal(frame.fieldId, 'third'); assert.equal(frame.visit.memoryVisit.id, 'third');
  assert.deepEqual(frame.returnPose, from);
  assert.equal(runtime.stationRealmFrame(), null);
  const save = saves.at(-1);
  assert.ok(save.routeDoorsErased.includes(door.id));
  assert.equal(save.station.crossing.id, door.id);
  assert.equal(save.station.field.entryDoorId, door.id);
  assert.equal(save.station.entries.at(-1).returnedAt, null);
  const checkpoint = { version: 1, fieldId: frame.fieldId, connectionId: frame.connectionId, x: 2, z: -10,
    witness: { inspected: true, landmarkId: frame.visit.landmark.id }, stage: 'active', elapsed: 11 };
  runtime.setStationFieldState(checkpoint);
  checkpoint.witness.inspected = false;
  assert.equal(runtime.stationFieldFrame().checkpoint.witness.inspected, true);
  runtime = restore(runtime);
  assert.equal(runtime.stationFieldFrame().checkpoint.x, 2);
  const copy = runtime.stationFieldFrame(); copy.returnPose.x = 900; copy.checkpoint.x = 900;
  assert.equal(runtime.stationFieldFrame().returnPose.x, from.x);
  assert.equal(runtime.stationFieldFrame().checkpoint.x, 2);
  assert.equal(runtime.setStationFieldState({ ...checkpoint, fieldId: 'fourth' }), null);
  runtime.advanceStationTime(300);
  assert.equal(runtime.doorCrossingFrame().phase, 'field', 'a field occurrence has no timed blackout');
  assert.equal(runtime.state().station.entries.at(-1).returnedAt, null);
  assert.equal(runtime.state().station.homeResolved, false);
});

test('an early retreat is safe, grants no gate, and leaves a retry after the existing takeback interval', () => {
  let runtime = create();
  const door = runtime.doorFieldDoors().find((entry) => entry.fieldId && !entry.shut);
  const from = cross(runtime, door);
  const result = runtime.finishStationFieldReturn(returnResult(runtime, { meaningful: false }));
  assert.deepEqual(result.position, from); assert.equal(result.meaningful, false);
  assert.equal(runtime.stationFieldFrame(), null); assert.equal(runtime.finishStationFieldReturn({}), null);
  assert.ok(runtime.doorFieldDoors().find((entry) => entry.id === door.id).erased);
  assert.equal(runtime.doorFieldDoors().find((entry) => entry.destination?.kind === 'home').home, false);
  runtime = restore(runtime); runtime.advanceStationTime(16);
  const retry = runtime.doorFieldDoors().find((entry) => entry.id === door.id);
  assert.ok(retry.reawakened && !retry.erased && retry.opened);
});

test('one meaningful return opens chapel home; entering or forged witness does not; legacy home remains earned', () => {
  let runtime = create();
  const home = runtime.doorFieldDoors().find((door) => door.destination.kind === 'home');
  assert.equal(runtime.openDoorFieldDoor(home.id).opened, false);
  assert.ok(!runtime.state().routeDoorsErased.includes(home.id));
  const door = runtime.doorFieldDoors().find((entry) => entry.fieldId && !entry.shut);
  cross(runtime, door);
  assert.equal(runtime.doorFieldDoors().find((entry) => entry.id === home.id).home, false);
  const bad = returnResult(runtime, { fieldId: 'fourth' });
  assert.equal(runtime.finishStationFieldReturn(bad).meaningful, false);
  runtime.advanceStationTime(16);
  cross(runtime, runtime.doorFieldDoors().find((entry) => entry.id === door.id));
  assert.equal(runtime.finishStationFieldReturn(returnResult(runtime)).meaningful, true);
  runtime.setStationHomeOpen(false); // An old main flag synchronization cannot revoke it.
  assert.equal(runtime.doorFieldDoors().find((entry) => entry.id === home.id).home, true);
  assert.deepEqual(runtime.stationRelicWorlds(), [], 'local visits do not fabricate cosmic relics');
  runtime = restore(runtime);
  cross(runtime, runtime.doorFieldDoors().find((entry) => entry.id === home.id));
  assert.equal(runtime.stationRealmFrame().home.eligible, true);
  assert.equal(runtime.stationFieldFrame(), null);
  const legacy = create().state();
  legacy.station.entries = ['burning', 'flood', 'inverted', 'two-moons', 'glass-storm'].map((world, i) => ({ doorId: `legacy-${i}`, world, variant: i, returnedAt: 5 }));
  const earned = createSourceSpaceRuntime({ initialState: legacy });
  assert.equal(earned.doorFieldDoors().find((entry) => entry.destination.kind === 'home').home, true);
});

test('tower bolts require both named meaningful return connections, persist, and never release on entry', () => {
  let runtime = create('tower');
  const routeDoor = () => runtime.doorFieldDoors().find((door) => door.route === 'tower');
  assert.equal(routeDoor().unlocked, false);
  for (const [i, connectionId] of STATION_TOWER_CONNECTIONS.entries()) {
    const door = runtime.doorFieldDoors().find((entry) => entry.connectionId === connectionId);
    cross(runtime, door);
    assert.equal(routeDoor().unlocked, false);
    assert.equal(runtime.stationConnectionReturned(connectionId), false);
    const result = runtime.finishStationFieldReturn(returnResult(runtime));
    assert.equal(result.meaningful, true);
    assert.equal(runtime.stationConnectionReturned(connectionId), true);
    runtime = restore(runtime);
    assert.equal(routeDoor().unlocked, i === 1);
  }
  assert.equal(runtime.openDoorFieldDoor(routeDoor().id).opened, true);
});

test('previews name the exact shared field state and coastal destination; station normalization rejects fifth', () => {
  const runtime = create();
  for (const door of runtime.doorFieldDoors().filter((entry) => !entry.shut && entry.fieldId)) {
    runtime.openDoorFieldDoor(door.id);
    const at = sideOf(door, 2), portal = runtime.outskirtPortals(at.x, at.y).find((entry) => entry.id === door.id);
    assert.equal(portal.fieldId, door.fieldId);
    assert.equal(portal.variant, 10 + door.variant);
    assert.equal(portal.deformation, stationFieldVisit(door.fieldId).snapshotDecay);
    assert.ok(portal.day > 0 && portal.day < 1);
  }
  const coastal = runtime.doorFieldDoors().find((entry) => entry.personal);
  runtime.openDoorFieldDoor(coastal.id);
  const at = sideOf(coastal, 2);
  assert.equal(runtime.outskirtPortals(at.x, at.y).find((entry) => entry.id === coastal.id).variant, 14);
  cross(runtime, coastal);
  assert.equal(runtime.coastalMemoryState().active, true, 'chapel has an actual coastal scene owner');
  assert.equal(runtime.stationFieldFrame(), null);
  assert.equal(normalizeStationFieldSession({ active: true, fieldId: 'fifth', entryDoorId: 'x', connectionId: 'field-return', returnPose: { x: 0, y: 0 } }), null);
  const malformed = normalizeSourceStation({ field: { active: true, fieldId: 'first' }, entries: [{ doorId: 'x', world: 'field:first', fieldId: 'first', meaningful: true, returnedAt: null }] });
  assert.equal(malformed.field, null); assert.equal(malformed.entries[0].returnedAt, null);
});

test('more than 64 safe retreats cannot evict earned bolts, home eligibility or a completed doorway', () => {
  let runtime = create('tower');
  const completed = [];
  for (const connectionId of STATION_TOWER_CONNECTIONS) {
    const door = runtime.doorFieldDoors().find((entry) => entry.connectionId === connectionId);
    completed.push(door.id); cross(runtime, door);
    assert.equal(runtime.finishStationFieldReturn(returnResult(runtime)).meaningful, true);
  }
  const repeatId = runtime.doorFieldDoors().find((entry) => entry.fieldId === 'third' && !entry.shut).id;
  for (let n = 0; n < 70; n++) {
    runtime.advanceStationTime(16);
    cross(runtime, runtime.doorFieldDoors().find((entry) => entry.id === repeatId));
    runtime.finishStationFieldReturn(returnResult(runtime, { meaningful: false }));
    runtime = restore(runtime);
  }
  assert.equal(runtime.state().station.entries.length, 64);
  assert.ok(!runtime.state().station.entries.some((entry) => completed.includes(entry.doorId)), 'fixture really evicted the earned journal rows');
  assert.equal(runtime.doorFieldDoors().find((entry) => entry.route === 'tower').unlocked, true);
  for (const id of completed) {
    const door = runtime.doorFieldDoors().find((entry) => entry.id === id);
    assert.equal(door.erased, true); assert.equal(door.reawakened, false);
  }
  assert.deepEqual(runtime.state().station.fieldReturns.connectionIds, [...STATION_TOWER_CONNECTIONS]);
  // A branch/migrated save keeps the same earned optional-home authority too.
  const chapel = create().state(); chapel.station = runtime.state().station;
  const homeRuntime = createSourceSpaceRuntime({ initialState: chapel });
  assert.equal(homeRuntime.doorFieldDoors().find((entry) => entry.destination?.kind === 'home').home, true);
});

test('renderer-unavailable cancellation returns safely, is not meaningful and allows a retry', () => {
  let runtime = create();
  const door = runtime.doorFieldDoors().find((entry) => entry.fieldId && !entry.shut);
  const from = cross(runtime, door);
  const result = runtime.finishStationFieldReturn({ meaningful: false, reason: 'unavailable', error: 'renderer unavailable', checkpoint: null });
  assert.deepEqual(result.position, from); assert.equal(result.meaningful, false);
  assert.equal(runtime.stationFieldFrame(), null);
  assert.equal(runtime.state().station.entries.at(-1).failed, true);
  runtime = restore(runtime); runtime.advanceStationTime(16);
  assert.ok(!runtime.doorFieldDoors().find((entry) => entry.id === door.id).erased);
});
