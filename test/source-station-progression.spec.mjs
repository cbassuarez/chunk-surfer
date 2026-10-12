import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChapelOutskirtsGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { normalizeSourceStation } from '../src/game/chunk-surf-state.js';

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

for (const seed of [5, 40, 4417]) {
  test(`seed ${seed}: doors crossed in corridor order preserve the early whiteout and earn home`, () => {
    const saves = [];
    const onState = (state) => saves.push(JSON.parse(JSON.stringify(state)));
    let runtime = create(seed, onState);
    const openDoors = runtime.doorFieldDoors().filter((door) => !door.route && !door.shut);
    const whiteout = openDoors.find((door) => door.variant === 5);
    assert.ok(whiteout, 'seed must have an ordinary whiteout visit');
    let ordinaryWhiteout = false;
    for (const door of openDoors) {
      cross(runtime, door);
      const crossing = runtime.doorCrossingFrame();
      if (door.id === whiteout.id) {
        assert.equal(crossing.home, false, 'home must not be injected ahead of the natural route');
        ordinaryWhiteout = true;
        assert.ok(runtime.stationRelicWorlds().length < 5);
      }
      assert.ok(saves.at(-1).routeDoorsErased.includes(door.id));
      assert.equal(saves.at(-1).station.crossing.id, door.id, 'erasure saved without its crossing');
      assert.ok(saves.at(-1).station.entries.some((entry) => entry.doorId === door.id), 'erasure saved without its relic receipt');
      const returned = runtime.stationRealmFrame().returnPose;
      assert.ok(runtime.geometry.cellAt(returned.x, returned.y), 'saved entry slab has no Source floor');
      for (let i = 0; i < 3; i += 1) runtime.moveStationRealm({ dz: .085 });
      runtime.advanceStationTime(.8);
      const elapsed = runtime.doorCrossingFrame().elapsed;
      const pose = runtime.stationRealmFrame().pose;
      const stride = runtime.stationRealmFrame().strideM;
      assert.ok(stride > 0, 'fixture must reload between footsteps');
      runtime = restore(runtime, onState);
      assert.equal(runtime.doorCrossingFrame().elapsed, elapsed, 'reload changed active visit time');
      assert.deepEqual(runtime.stationRealmFrame().pose, pose, 'reload changed real realm position');
      assert.equal(runtime.stationRealmFrame().strideM, stride, 'reload discarded the partial footstep');
      spendVisit(runtime);
      assert.equal(runtime.doorCrossingFrame(), null);
    }
    assert.ok(ordinaryWhiteout);
    assert.deepEqual(runtime.stationRelicWorlds(), relics);
    const awakened = runtime.doorFieldDoors().find((door) => door.id === whiteout.id);
    assert.ok(awakened.reawakened && awakened.home && awakened.opened && !awakened.erased);
    assert.ok(runtime.state().routeDoorsErased.includes(whiteout.id), 'the ordinary visit receipt was discarded');
    const nearby = sideOf(awakened, 2);
    assert.ok(runtime.outskirtPortals(nearby.x, nearby.y).some((portal) => portal.id === whiteout.id));
    cross(runtime, awakened);
    assert.equal(runtime.doorCrossingFrame().home, true);
    for (let step = 0; step < 400; step += 1) runtime.moveStationRealm({ dz: .085 });
    const homePose = runtime.stationRealmFrame().pose;
    runtime.advanceStationTime(25);
    runtime = restore(runtime);
    assert.equal(runtime.doorCrossingFrame().home, true);
    assert.deepEqual(runtime.stationRealmFrame().pose, homePose);
    const copy = runtime.stationRealmFrame();
    copy.pose.x = 99;
    assert.equal(runtime.stationRealmFrame().pose.x, 0, 'getter exposed live realm state');
    for (let step = 0; !runtime.stationRealmFrame().atWindow && step < 1000; step += 1) runtime.moveStationRealm({ dz: .085 });
    assert.ok(runtime.stationRealmFrame().atWindow);
    assert.equal(runtime.markHomeWindowReached(), true);
    runtime.releaseHomeCrossing();
    runtime.advanceStationTime(.7);
    assert.equal(runtime.doorCrossingFrame(), null);
    assert.equal(runtime.stationWalkState(), null);
    assert.equal(runtime.state().station.homeResolved, true);
    assert.equal(runtime.stationLastRealmReturn().reason, 'home');
    assert.equal(runtime.doorFieldDoors().find((door) => door.id === whiteout.id).reawakened, false);
  });
}

test('active station clock freezes visits and preserves disappearance timing through reload', () => {
  let runtime = create(4417);
  const door = runtime.doorFieldDoors().find((entry) => !entry.route && !entry.shut);
  cross(runtime, door);
  runtime.advanceStationTime(1);
  const paused = runtime.doorCrossingFrame();
  runtime.tick(100); // World simulation is not the station's explicitly advanced clock.
  runtime.advanceStationTime(0);
  assert.deepEqual(runtime.doorCrossingFrame(), paused);
  runtime = restore(runtime);
  assert.deepEqual(runtime.doorCrossingFrame(), paused);
  runtime.advanceStationTime(5);
  assert.ok(runtime.doorCrossingFrame(), 'standing still must not consume walking allowance');
  spendVisit(runtime);
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
  const doors = runtime.doorFieldDoors().filter((door) => !door.route && !door.shut);
  const whiteout = doors.find((door) => door.variant === 5);
  for (const door of doors) { cross(runtime, door); spendVisit(runtime); }
  const awakened = runtime.doorFieldDoors().find((door) => door.id === whiteout.id);
  cross(runtime, awakened);
  let retreated = false;
  for (let i = 0; !retreated && i < 30; i += 1) retreated = runtime.moveStationRealm({ dz: -.085 }).retreated;
  assert.ok(retreated);
  runtime.advanceStationTime(.5);
  assert.equal(runtime.stationLastRealmReturn().reason, 'retreat');
  assert.equal(runtime.state().station.homeResolved, false);
  runtime.advanceStationTime(15.1);
  const retry = runtime.doorFieldDoors().find((door) => door.id === whiteout.id);
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

test('decoherence resumes its saved remainder and completes while the player stands still', () => {
  let runtime = create(4417);
  const door = runtime.doorFieldDoors().find((entry) => !entry.route && !entry.shut && entry.variant === 1);
  cross(runtime, door);
  for (let i = 0; runtime.stationRealmFrame().stage === 'inside' && i < 1000; i += 1) {
    runtime.moveStationRealm({ dx: Math.floor(i / 8) % 2 ? -.085 : .085 });
    runtime.advanceStationTime(.045);
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
  assert.equal(runtime.stationRealmFrame(), null, 'return waited for another footstep');
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

test('duplicate station doors preview and visit the same canonical realm and leave one residue', () => {
  const runtime = create(4417);
  const doors = runtime.doorFieldDoors().filter((door) => !door.route && !door.shut && door.variant === 4);
  assert.ok(doors.length > 1);
  for (const door of doors) runtime.openDoorFieldDoor(door.id);
  const previewSeeds = doors.map((door) => {
    const nearby = sideOf(door, 2);
    return runtime.outskirtPortals(nearby.x, nearby.y).find((portal) => portal.id === door.id).seed;
  });
  assert.equal(previewSeeds[0], previewSeeds[1]);
  for (const door of doors) {
    cross(runtime, door);
    assert.equal(runtime.stationRealmFrame().seed, previewSeeds[0]);
    assert.equal(runtime.stationRealmFrame().pose.z, 1);
    assert.equal(runtime.state().station.entries.at(-1).returnedAt, null);
    spendVisit(runtime);
  }
  assert.deepEqual(runtime.stationRelicWorlds(), ['glass-storm']);
});

test('legacy erased-only saves recover receipts and the chapel checkpoint has actual floor', () => {
  const runtime = create(4417);
  const state = runtime.state();
  state.routeDoorsErased = runtime.doorFieldDoors().filter((door) => !door.route && !door.shut).map((door) => door.id);
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
