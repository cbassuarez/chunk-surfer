import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChapelOutskirtsGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { normalizeSourceStation } from '../src/game/chunk-surf-state.js';
import { createStationRealm, stationRealmSeed } from '../src/game/station-realms.js';

const relics = ['burning', 'flood', 'inverted', 'two-moons', 'glass-storm'];
const create = (seed, onState) => {
  const built = buildChapelOutskirtsGodPreset(4, { seed, marbleEyes: 'returned' });
  const runtime = createSourceSpaceRuntime({ initialState: built.state, onState });
  runtime.setPlayerPosition(built.position);
  return runtime;
};
const sideOf = (door, cells) => ({
  x: (door.threshold[0].x + door.threshold[1].x) / 2 + door.normal[0] * cells,
  y: (door.threshold[0].y + door.threshold[1].y) / 2 + door.normal[2] * cells,
});
function cross(runtime, door) {
  runtime.openDoorFieldDoor(door.id);
  const from = sideOf(door, 1.5), to = sideOf(door, -1.5);
  runtime.setPlayerPosition({ ...from, facing: 0 });
  assert.equal(runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok, true);
  runtime.onStep(from, { ...to, facing: 0 });
  runtime.setPlayerPosition({ ...to, facing: 0 });
  assert.equal(runtime.doorCrossingFrame()?.id, door.id);
}
function restore(runtime, onState) {
  return createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(runtime.state())), onState });
}
function spendVisit(runtime) {
  for (let step = 0; runtime.stationRealmFrame()?.stage === 'inside' && step < 1000; step += 1) {
    runtime.moveStationRealm({ dx: Math.floor(step / 8) % 2 ? -.085 : .085, dz: 0 });
    runtime.advanceStationTime(.045);
  }
  assert.equal(runtime.stationRealmFrame()?.stage, 'decohering');
  runtime.advanceStationTime(1.2);
  assert.equal(runtime.stationRealmFrame(), null);
}

function finishField(runtime, meaningful = true) {
  const field = runtime.stationFieldFrame();
  const result = { fieldId: field.fieldId, connectionId: field.connectionId, meaningful,
    receipt: meaningful ? { fieldId: field.fieldId, connectionId: field.connectionId, landmarkWitnessed: true, returned: true } : null,
    checkpoint: { version: 1, fieldId: field.fieldId, connectionId: field.connectionId, stage: 'returning', returnReason: 'crossed-return',
      witness: { landmarkId: field.visit.landmark.id, inspected: meaningful }, elapsed: 12 } };
  return runtime.finishStationFieldReturn(result);
}
function earnHome(runtime) {
  const field = runtime.doorFieldDoors().find((door) => door.fieldId && !door.shut);
  cross(runtime, field); finishField(runtime);
  return runtime.doorFieldDoors().find((door) => door.destination?.kind === 'home');
}

for (const seed of [5, 40, 4417]) {
  test(`seed ${seed}: one voluntary field return earns an optional, physically explored home`, () => {
    const saves = [], onState = (state) => saves.push(JSON.parse(JSON.stringify(state)));
    let runtime = create(seed, onState);
    const home = runtime.doorFieldDoors().find((door) => door.destination?.kind === 'home');
    assert.equal(home.home, false);
    assert.equal(runtime.openDoorFieldDoor(home.id).opened, false);
    const field = runtime.doorFieldDoors().find((door) => door.fieldId && !door.shut);
    cross(runtime, field);
    assert.ok(saves.at(-1).routeDoorsErased.includes(field.id));
    assert.equal(saves.at(-1).station.crossing.id, field.id, 'erasure saved without its scene marker');
    assert.equal(saves.at(-1).station.field.entryDoorId, field.id, 'erasure saved without its field owner');
    const returnPose = runtime.stationFieldFrame().returnPose;
    assert.ok(runtime.geometry.cellAt(returnPose.x, returnPose.y));
    runtime = restore(runtime, onState);
    assert.deepEqual(runtime.stationFieldFrame().returnPose, returnPose);
    finishField(runtime);
    assert.equal(runtime.state().station.entries.at(-1).meaningful, true);
    assert.deepEqual(runtime.stationRelicWorlds(), [], 'new field occurrence is separate from legacy relics');
    const openedHome = runtime.doorFieldDoors().find((door) => door.id === home.id);
    assert.ok(openedHome.home && !openedHome.erased);
    cross(runtime, openedHome);
    assert.equal(runtime.doorCrossingFrame().home, true);
    for (let step = 0; step < 400; step += 1) runtime.moveStationRealm({ dz: .085 });
    const homePose = runtime.stationRealmFrame().pose;
    runtime.advanceStationTime(25);
    runtime = restore(runtime);
    assert.deepEqual(runtime.stationRealmFrame().pose, homePose);
    const copy = runtime.stationRealmFrame(); copy.pose.x = 99;
    assert.equal(runtime.stationRealmFrame().pose.x, 0, 'getter exposed live body');
    for (let step = 0; !runtime.stationRealmFrame().atWindow && step < 1000; step += 1) runtime.moveStationRealm({ dz: .085 });
    assert.ok(runtime.stationRealmFrame().atWindow);
    assert.equal(runtime.markHomeWindowReached(), true);
    runtime.releaseHomeCrossing(); runtime.advanceStationTime(.7);
    assert.equal(runtime.doorCrossingFrame(), null);
    assert.equal(runtime.stationWalkState(), null);
    assert.equal(runtime.state().station.homeResolved, true);
    assert.equal(runtime.stationLastRealmReturn().reason, 'home');
  });
}

test('active clock and reload retain an untimed field and its finite post-return disappearance', () => {
  let runtime = create(4417);
  const door = runtime.doorFieldDoors().find((entry) => entry.fieldId && !entry.shut);
  cross(runtime, door); runtime.advanceStationTime(1);
  const paused = runtime.doorCrossingFrame();
  runtime.tick(100); runtime.advanceStationTime(0);
  assert.deepEqual(runtime.doorCrossingFrame(), paused);
  runtime = restore(runtime);
  assert.deepEqual(runtime.doorCrossingFrame(), paused);
  runtime.advanceStationTime(100);
  assert.ok(runtime.stationFieldFrame(), 'standing still must never automatically erase a field visit');
  finishField(runtime);
  assert.equal(runtime.doorCrossingFrame(), null);
  const taking = runtime.doorTakeBackFrame(door.id);
  assert.equal(taking.phase, 'taking');
  runtime = restore(runtime);
  assert.deepEqual(runtime.doorTakeBackFrame(door.id), taking);
  runtime.advanceStationTime(20);
  assert.equal(runtime.doorTakeBackFrame(door.id).phase, 'gone');
});

test('early home retreat preserves a retry and home helper decisions survive reload', () => {
  let runtime = create(4417);
  const home = earnHome(runtime);
  cross(runtime, home);
  let retreated = false;
  for (let i = 0; !retreated && i < 30; i += 1) retreated = runtime.moveStationRealm({ dz: -.085 }).retreated;
  assert.ok(retreated); runtime.advanceStationTime(.5);
  assert.equal(runtime.stationLastRealmReturn().reason, 'retreat');
  assert.equal(runtime.state().station.homeResolved, false);
  runtime.advanceStationTime(15.1);
  const retry = runtime.doorFieldDoors().find((door) => door.id === home.id);
  assert.ok(retry.home && retry.reawakened && !retry.erased);
  cross(runtime, retry);
  for (let i = 0; !runtime.stationRealmFrame().atWindow && i < 1000; i += 1) runtime.moveStationRealm({ dz: .085 });
  runtime.setStationRealmHomeState({ recognized: true, settled: true, attention: .72, nested: { value: 1 } });
  const copy = runtime.stationRealmHomeState(); copy.nested.value = 9;
  assert.equal(runtime.stationRealmHomeState().nested.value, 1);
  runtime = restore(runtime);
  assert.equal(runtime.stationRealmHomeState().recognized, true);
  assert.equal(runtime.stationRealmHomeState().attention, .72);
  assert.ok(runtime.stationRealmFrame().atWindow);
  assert.equal(runtime.state().station.homeDiscovered, true);
});

test('an already occupied legacy realm completes its saved decoherence without a reset or a fresh footfall', () => {
  const state = create(4417).state();
  const oldRealm = createStationRealm({ variant: 1, seed: stationRealmSeed(4417, 1), entryDoorId: 'source-chapel-door-0', returnPose: { x: 0, y: -4000 }, now: 0 });
  state.station.realm = oldRealm;
  state.station.crossing = { id: oldRealm.entryDoorId, variant: 1, world: 'flood', startedAt: 0 };
  state.station.entries = [{ doorId: oldRealm.entryDoorId, world: 'flood', variant: 1, home: false, enteredAt: 0, returnedAt: null }];
  state.routeDoorsErased = [oldRealm.entryDoorId];
  let runtime = createSourceSpaceRuntime({ initialState: state });
  for (let i = 0; runtime.stationRealmFrame().stage === 'inside' && i < 1000; i += 1) {
    runtime.moveStationRealm({ dx: Math.floor(i / 8) % 2 ? -.085 : .085 }); runtime.advanceStationTime(.045);
  }
  runtime.advanceStationTime(.35);
  const halfway = runtime.stationRealmFrame();
  assert.ok(halfway.decoherence > 0 && halfway.decoherence < 1);
  runtime = restore(runtime);
  assert.deepEqual(runtime.stationRealmFrame(), halfway);
  runtime.tick(100); runtime.advanceStationTime(0);
  assert.deepEqual(runtime.stationRealmFrame(), halfway, 'pause consumed the remaining reassembly');
  assert.equal(runtime.moveStationRealm({ yaw: .7 }).footsteps, 0);
  runtime.advanceStationTime(.8);
  assert.equal(runtime.stationRealmFrame(), null);
  assert.equal(runtime.stationLastRealmReturn().reason, 'budget');
  assert.deepEqual(runtime.stationRelicWorlds(), ['flood']);
});

test('legacy timed visits and virtual home walks migrate into actual supported pockets', () => {
  const runtime = create(4417), state = runtime.state();
  const door = runtime.doorFieldDoors().find((entry) => !entry.route && !entry.shut && entry.variant === 5);
  state.routeDoorsOpened = [door.id]; state.routeDoorsErased = [door.id];
  state.station.crossing = { id: door.id, variant: 5, world: 'whiteout', seed: door.seed, home: true,
    forward: [-door.normal[0], -door.normal[2]], startedAt: 0 };
  state.station.walk = { kind: 'home', progress: .8, windowAt: null, thought: false, done: false, forward: [0, -1] };
  state.station.entries = [{ doorId: door.id, world: 'whiteout', variant: 5, home: true, enteredAt: 0 }];
  delete state.station.realm;
  const restored = createSourceSpaceRuntime({ initialState: state });
  const frame = restored.stationRealmFrame();
  assert.ok(frame.home.eligible && frame.pose.z > 50);
  assert.equal(frame.pose.floorY, 0);
  assert.equal(restored.stationWalkState(), null);
  assert.ok(restored.doorCrossingFrame().realm);
});

test('duplicate doors preview and inhabit the same shared field template without duplicating canonical visits', () => {
  const runtime = create(4417);
  const doors = runtime.doorFieldDoors().filter((door) => !door.shut && door.fieldId === 'fourth');
  assert.ok(doors.length > 1);
  for (const door of doors) runtime.openDoorFieldDoor(door.id);
  const previews = doors.map((door) => { const at = sideOf(door, 2); return runtime.outskirtPortals(at.x, at.y).find((portal) => portal.id === door.id); });
  assert.equal(previews[0].seed, previews[1].seed);
  assert.equal(previews[0].fieldId, previews[1].fieldId);
  for (const door of doors) {
    cross(runtime, door);
    assert.equal(runtime.stationFieldFrame().fieldId, 'fourth');
    assert.equal(runtime.state().station.entries.at(-1).returnedAt, null);
    finishField(runtime);
  }
  assert.deepEqual(runtime.stationRelicWorlds(), []);
  assert.equal(runtime.state().station.entries.filter((entry) => entry.meaningful).length, doors.length);
});

test('legacy erased-only saves recover receipts and the chapel checkpoint has actual floor', () => {
  const runtime = create(4417);
  const state = runtime.state();
  state.routeDoorsErased = runtime.doorFieldDoors().filter((door) => !door.route).map((door) => door.id);
  state.routeDoorsOpened = [...state.routeDoorsErased];
  delete state.station;
  const restored = createSourceSpaceRuntime({ initialState: state });
  assert.deepEqual(restored.stationRelicWorlds(), relics);
  assert.ok(restored.state().station.entries.length > 0);
  assert.ok(restored.doorFieldDoors().some((door) => door.reawakened));
  const point = restored.checkpointPosition();
  assert.ok(restored.geometry.cellAt(point.x, point.y), 'chapel checkpoint falls back into the empty hall');
});

test('saved walk values and their nested direction are independent of the caller', () => {
  const runtime = create(4417);
  const walk = { kind: 'home', progress: .2, windowAt: 0, thought: false, done: false, forward: [1, 0] };
  const result = runtime.setStationWalkState(walk);
  walk.forward[0] = 50; result.forward[0] = 75;
  assert.deepEqual(runtime.stationWalkState().forward, [1, 0]);
  assert.equal(runtime.stationWalkState().windowAt, 0);
  assert.equal(normalizeSourceStation({ crossing: { id: 'door', startedAt: -2 } }).crossing.startedAt, -2);
  const malformed = normalizeSourceStation({ time: Infinity, walk: { kind: 'home', progress: Infinity,
    windowAt: Infinity, forward: [Infinity, -Infinity] }, takeBacks: [{ id: 'door', at: Infinity }] });
  assert.equal(malformed.time, 0);
  assert.equal(malformed.walk.windowAt, 0);
  assert.deepEqual(malformed.walk.forward, [0, -1]);
  assert.equal(malformed.takeBacks[0].at, 0);
});
