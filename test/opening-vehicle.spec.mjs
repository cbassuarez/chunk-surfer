import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { NodeIO } from '@gltf-transform/core';
import * as scenes from '../src/game/scenes.js';
import { makeOpeningVehicleScene } from '../src/game/opening-vehicle-scene.js';
import { OPENING_VEHICLE, openingVehiclePoint, openingVehicleInstances, openingVehicleExitFrame, openingVehiclePending } from '../src/data/opening-vehicle.js';

const anchor = { x: 30, y: 0, z: 50, yaw: Math.PI/2, group: 'ground', zone: 1 };
test('new runs and an interrupted vehicle arrival resume inside; exited and legacy runs do not replay it', () => {
  const save = { flags: { 'opening.vehicle.pending': true } };
  assert.equal(openingVehiclePending(save), true);
  assert.equal(openingVehiclePending(structuredClone(save)), true);
  assert.equal(openingVehiclePending({ flags: {} }), false);
  for (const name of ['opening.vehicle.exited', 'prologueDone'])
    assert.equal(openingVehiclePending({ flags: { ...save.flags, [name]: true } }), false);
  assert.equal(openingVehiclePending(save, { debugSpawn: true }), false);
  assert.equal(openingVehiclePending(save, { skipTutorial: true }), false);
});
test('vehicle begins at Source driver eye and physically opens the right door before the player steps out', () => {
  const seated = openingVehicleExitFrame(anchor, 0), opening = openingVehicleExitFrame(anchor, .4), done = openingVehicleExitFrame(anchor, 5);
  assert.deepEqual(seated.eye, openingVehiclePoint(anchor, [.48, 1.65, .20]));
  assert.deepEqual(opening.eye, seated.eye, 'door opens before the body moves');
  assert.ok(opening.doorOpen > .5);
  assert.deepEqual(done.eye, openingVehiclePoint(anchor, OPENING_VEHICLE.exitEye));
  assert.equal(done.done, true); assert.equal(done.fade, 1);
  const fixed = openingVehicleInstances(anchor), moving = openingVehicleInstances(anchor, { doorOpen: 1 });
  const body = list => list.find(p => p.mesh === 'opening_drive_cabin');
  assert.deepEqual(body(fixed).matrix, body(moving).matrix, 'door motion does not turn the dashboard or seats');
  const door = list => list.find(p => p.mesh === 'opening_drive_cabin_door_r').matrix;
  const transform = (m, p) => [m[0]*p[0]+m[8]*p[2]+m[12], p[1]+m[13], m[2]*p[0]+m[10]*p[2]+m[14]];
  const a = transform(door(fixed), OPENING_VEHICLE.doorHinge), b = transform(door(moving), OPENING_VEHICLE.doorHinge);
  a.forEach((v, i) => assert.ok(Math.abs(v-b[i]) < 1e-10, 'door hinge stays anchored'));
  assert.notDeepEqual(door(fixed), door(moving));
});
test('waiting, pause, repeat keys and teardown cannot complete or retain the opening movement hold', () => {
  scenes.clear(); let ready = false, landed = 0, doors = 0, released = 0;
  const scene = makeOpeningVehicleScene({ getAnchor: () => anchor, getAssetStatus: () => ({ loaded: ready }),
    getLook: () => ({ yaw: anchor.yaw }), onDoor: () => doors++, onDone: () => landed++, onExit: () => released++ });
  scenes.push(scene); scene.update(90); assert.equal(scene.view().phase, 'loading');
  scene.key({ key: 'e' }); assert.equal(doors, 0);
  ready = true; scenes.update(.1); assert.equal(scene.view().phase, 'seated'); assert.equal(scenes.allowsLook(), true);
  scenes.update(90); assert.equal(landed, 0, 'the player chooses when to get out');
  scene.key({ key: 'e', repeat: true }); assert.equal(doors, 0);
  scene.key({ key: 'e' }); assert.equal(doors, 1); assert.equal(scene.allowsLook, false);
  scenes.push({ id: 'pause' }); scenes.update(20); assert.equal(landed, 0, 'pause freezes the exit clock');
  scenes.pop(); scenes.update(OPENING_VEHICLE.exitSeconds); assert.equal(landed, 1);
  scenes.update(10); scene.key({ key: 'e' }); assert.equal(landed, 1); assert.equal(doors, 1);
  scenes.remove(scene); scene.exit(); assert.equal(released, 1); assert.equal(scenes.blocksInput(), false);
  scenes.clear();
});
test('asset load failure leaves an explicit exit path instead of an indefinite movement lock', () => {
  let landed = 0;
  const scene = makeOpeningVehicleScene({ getAnchor: () => anchor,
    getAssetStatus: () => ({ loaded: false, error: 'load failed' }), onDone: () => landed++ });
  scene.update(.1); assert.equal(scene.view().phase, 'seated'); assert.equal(scene.view().error, 'load failed');
  scene.key({ controllerAction: 'interact' }); scene.update(3); assert.equal(landed, 1);
});
test('production vehicle is a self-contained promoted Source asset with real openings and detached door', async () => {
  const bytes = await readFile(new URL('../public/assets/source-vehicle-interior.glb', import.meta.url));
  const receipt = JSON.parse(await readFile(new URL('../public/assets/source-vehicle-interior.credits.json', import.meta.url), 'utf8'));
  assert.equal(receipt.sourceSha256, OPENING_VEHICLE.sourceSha256);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256);
  const doc = await new NodeIO().readBinary(bytes), root = doc.getRoot();
  const used = new Set(openingVehicleInstances(anchor).map(p => p.mesh));
  assert.deepEqual(new Set(root.listMeshes().map(m => m.getName())), used);
  assert.ok(receipt.doorTriangles >= 500);
  assert.ok(root.listTextures().length >= 3, 'Source materials keep their embedded texture maps');
  for (const texture of root.listTextures()) assert.ok(texture.getImage()?.length > 0);
  assert.ok(root.listMeshes().find(m => m.getName() === 'opening_drive_cabin_door_r').listPrimitives().length >= 4);
});
test('real main opening persists the exit once, restores world props and is replayable after canceled entry', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('let openingVehicleScene=null;'), end = main.indexOf('// The first interaction in the game', start);
  assert.ok(start > 0 && end > start);
  const saved = { flags: { 'opening.vehicle.pending': true }, steps: 0 };
  let active = null, refreshed = 0, revealed = 0;
  const context = {
    FP: { isLoaded: () => true, logicalToPhysical: () => ({ x: 60, z: 100, y: 0, renderGroup: 'ground' }),
      logicalAtPhysical: (x, y) => ({ x, y }), zoneAt: () => 1 },
    PROPS: { propById: () => ({ rx: 60, ry: 100, yaw: Math.PI/2 }) },
    R3: { r3dVehicleInteriorStatus: () => ({ loaded: true }), r3dLookAngles: () => ({ yaw: Math.PI/2 }),
      r3dSetLookAngles() {}, r3dFacing: () => 1 },
    RENDERER: '3d', planName: 'conservatory', CELL: .5, px: 5, py: 6, stepCount: 0,
    getSave: () => saved, params: () => new URLSearchParams(), openingVehiclePending, makeOpeningVehicleScene,
    resetMotionInput() {}, STORY: {}, shakeMode: () => 'full', CUES: { CUE: { door: 1 }, playCue() {} },
    refreshWorldProps: () => refreshed++, revealAround: () => revealed++, saveCommit: patch => Object.assign(saved, patch),
    flagApply: flags => { for (const flag of flags) { const [key, value] = flag.split('='); saved.flags[key] = value === 'false' ? false : true; } },
    scenes: { push: scene => active = scene, remove: scene => { scene.exit(); if (active === scene) active = null; } },
    makeArrivalScene: () => ({ id: 'arrival' }),
  };
  vm.createContext(context); vm.runInContext(main.slice(start, end), context);
  assert.equal(context.beginOpeningVehicleArrival(), true); const canceled = active;
  canceled.update(.1); canceled.exit(); assert.equal(saved.flags['opening.vehicle.pending'], true);
  assert.equal(context.beginOpeningVehicleArrival(), true); const next = active;
  next.update(.1); next.key({ key: 'e' }); next.update(3);
  assert.equal(saved.flags['opening.vehicle.pending'], false); assert.equal(saved.flags['opening.vehicle.exited'], true);
  assert.equal(saved.steps, 1, 'the new position can be restored even without a later walking step');
  assert.equal(saved.area, 'conservatory'); assert.equal(active.id, 'arrival'); assert.equal(revealed, 1);
  assert.ok(refreshed >= 4, 'both cancellation and completed exit release the replacement vehicle');
  assert.equal(context.beginOpeningVehicleArrival(), false);
  assert.match(main, /scenes\.worldView\(\)\|\|openingVehicleScene\?\.worldView\(\)/, 'pause retains the seated or exiting view');
  const restart=main.slice(main.indexOf('function beginNewGameFlow('),main.indexOf('function enterSelectedRun('));
  assert.ok(restart.indexOf('scenes.remove(openingVehicleScene)')<restart.indexOf('newGame('), 'restart retires the old cabin clock before replacing the run');
});
