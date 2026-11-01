import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { NodeIO } from '@gltf-transform/core';
import {openingCinematicGate} from '../src/render/opening-cinematic-staging.js';
import {OPENING_OVERTURE,openingOvertureFrame} from '../src/data/opening-overture.js';
import * as scenes from '../src/game/scenes.js';
import { makeOpeningVehicleScene } from '../src/game/opening-vehicle-scene.js';
import { OPENING_VEHICLE, openingVehiclePoint, openingVehicleInstances, openingVehicleExitFrame, openingVehiclePending } from '../src/data/opening-vehicle.js';
import { OPENING_CAB_ASSET, OPENING_CAB_REQUIRED_MESHES } from '../src/game/opening-cab-inspection.js';

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
  const scene = makeOpeningVehicleScene({ driveEnabled:false,getAnchor: () => anchor, getAssetStatus: () => ({ loaded: ready }),
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
  const scene = makeOpeningVehicleScene({ driveEnabled:false,getAnchor: () => anchor,
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
test('cold cab objects wait for actual residency, recover after catalog loss, and cannot disable the van exit on failure', async () => {
  const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
  const start=main.indexOf('let openingCabAssetLoad='),end=main.indexOf('function beginOpeningOverture(',start);
  let releaseBase,requests=0,fail=false;const catalog=[],base=new Promise(resolve=>releaseBase=resolve);
  const context={OPENING_CAB_ASSET,OPENING_CAB_REQUIRED_MESHES,assetUrl:path=>path,console:{warn(){}},
    P3:{propMeshCatalog:()=>[...catalog],addPropPack:async path=>{assert.equal(path,OPENING_CAB_ASSET);requests++;if(fail)throw Error('cab decode failed');catalog.push(...OPENING_CAB_REQUIRED_MESHES);}},
    R3:{r3dBasePropsReady:()=>base,r3dVehicleInteriorStatus:()=>({loaded:true}),r3dOpeningOvertureStatus:()=>({ready:true}),r3dOpeningStreetReady:()=>true,r3dElleryPublicFrontReady:()=>true}};
  vm.createContext(context);vm.runInContext(main.slice(start,end),context);
  const first=context.prepareOpeningCabObjects();assert.equal(context.prepareOpeningCabObjects(),first);
  assert.equal(requests,0);assert.equal(context.openingArrivalAssets().loaded,false,'no invisible objects are exposed while the base pack is cold');
  releaseBase();assert.equal(await first,true);assert.equal(requests,1);assert.equal(context.openingCabAssetStatus().loaded,true);
  catalog.length=0;assert.equal(context.openingCabAssetStatus().loaded,false,'a lost catalog invalidates residency even after a prior successful load');
  fail=true;assert.equal(await context.prepareOpeningCabObjects(),false);assert.match(context.openingCabAssetStatus().error,/cab decode failed/);
  assert.equal(context.openingArrivalAssets().loaded,true,'decorative-object failure must not trap the player in a loading van');
  assert.equal(context.openingArrivalAssets().error,undefined,'the functioning vehicle retains physical driving and exit authority');
});
test('real main opening persists the exit once, starts the overture and is replayable after canceled entry', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = main.indexOf('let openingVehicleScene='), end = main.indexOf('// The first interaction in the game', start);
  assert.ok(start > 0 && end > start);
  const saved = { flags: { 'opening.vehicle.pending': true }, steps: 0 };
  let active = null, refreshed = 0, revealed = 0, stagingPrepared = 0, overtureOptions = null;
  let resolveBase,resolveStaging;const baseReady=new Promise(resolve=>resolveBase=resolve),stagingReady=new Promise(resolve=>resolveStaging=resolve);
  const context = {
    FP: { isLoaded: () => true, logicalToPhysical: () => ({ x: 60, z: 100, y: 0, renderGroup: 'ground' }),
      logicalAtPhysical: (x, y) => ({ x, y }), zoneAt: () => 1 },
    PROPS: { propById: () => ({ rx: 60, ry: 100, yaw: Math.PI/2 }),setPlacedProp(){} },
    R3: { r3dBasePropsReady:()=>baseReady,r3dOpeningOvertureStatus:()=>({ready:true,error:null}),r3dOpeningStreetReady:()=>true,r3dElleryPublicFrontReady:()=>true,r3dPrepareOpeningOverture:()=>Promise.resolve(),r3dVehicleInteriorStatus: () => ({ loaded: true }), r3dLookAngles: () => ({ yaw: Math.PI/2 }),
      r3dSetLookAngles() {}, r3dFacing: () => 1,r3dViewCamera:()=>({width:1280,height:720}),r3dPresentationReady:()=>true },
    RENDERER: '3d', planName: 'conservatory', CELL: .5, px: 5, py: 6, stepCount: 0,actx:null,
    P3:{setAuthoredPropRange:()=>()=>{},propMeshCatalog:()=>[...OPENING_CAB_REQUIRED_MESHES]},
    OPENING_CAB_ASSET,OPENING_CAB_REQUIRED_MESHES,assetUrl:path=>path,
    getSave: () => saved, params: () => new URLSearchParams(), openingVehiclePending,
    // Isolate the exit transaction here; the arrival-drive suite proves the real approach.
    makeOpeningVehicleScene: options=>makeOpeningVehicleScene({...options,driveEnabled:false}),
    OPENING_AUTHORED_PROPS:[{id:'yard-van',x:66,y:208,yaw:Math.PI/2}],
    flagTest:key=>saved.flags[key]===true,paused:false,gameplayInputLifecycleActive:()=>true,
    openingDriveColliders:()=>[],openingArrivalWorldView:frame=>({x:Array.isArray(frame.eye)?frame.eye[0]:frame.eye.x,y:Array.isArray(frame.eye)?frame.eye[2]:frame.eye.z,authoredCamera:{eye:frame.eye,lens:frame.lens}}),
    openingParkedPlacement:()=>({rx:60,ry:100}),
    createOpeningArrivalAudio:()=>({prepare:()=>Promise.resolve(),update(){},event(){},dispose(){}}),
    prepareOpeningCinematicAssets:()=>{stagingPrepared++;return stagingReady;},openingCinematicGate,
    makeOpeningOvertureScene:options=>{overtureOptions=options;return{id:'opening-overture',update(){},worldView:()=>null,resume(){}};},
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
  assert.equal(saved.area, 'conservatory'); assert.equal(active.id, 'opening-overture');assert.equal(saved.flags['opening.overture.pending'],true); assert.equal(revealed, 1);
  assert.equal(stagingPrepared,0,'a cold opening must not inspect the cinematic catalog before the ordinary base pack is resident');assert.equal(overtureOptions.getReady().ready,false);
  resolveBase(true);await Promise.resolve();assert.equal(stagingPrepared,1,'one chosen exit prepares cinematic assets once after base residency');assert.equal(overtureOptions.getReady().ready,false,'the base pack alone cannot admit an incomplete cinematic');
  resolveStaging({ready:true});await new Promise(resolve=>setImmediate(resolve));assert.equal(overtureOptions.getReady().ready,true);assert.equal(overtureOptions.getPresentationReady(),true);
  const authored=overtureOptions.toWorldView(openingOvertureFrame(1,{returnView:saved.openingArrival.returnView}));assert.equal(authored.cinematicGate.active,true);assert.equal(authored.cinematicGate.activeRect.width/authored.cinematicGate.activeRect.height,2);assert.ok(authored.authoredCamera.lens.sensorHeightMm>12.445,'the actual16:9 viewport retains the selected2:1 active gate');
  const returned=overtureOptions.toWorldView(openingOvertureFrame(OPENING_OVERTURE.duration,{returnView:saved.openingArrival.returnView}));assert.equal(returned.cinematicGate.active,false);assert.equal(returned.authoredCamera.lens,null,'ordinary projection does not inherit the cinematic lens');
  assert.ok(refreshed >= 4, 'both cancellation and completed exit release the replacement vehicle');
  assert.equal(context.beginOpeningVehicleArrival(), false);
  assert.match(main, /scenes\.worldView\(\)\|\|openingPresentationView\(\)/, 'pause retains the seated or exiting view');
  const restart=main.slice(main.indexOf('function beginNewGameFlow('),main.indexOf('function enterSelectedRun('));
  assert.ok(restart.indexOf('scenes.remove(openingVehicleScene)')<restart.indexOf('newGame('), 'restart retires the old cabin clock before replacing the run');
});
