import assert from 'node:assert/strict';
import { CELL, ZONE } from '../src/data/floorplan/legend.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { resolveLightingContext, resolveLocalLights, LIGHT_KIND } from '../src/data/conservatory-lights.js';
import { sourceRoomMemoryForProp, SOURCE_ROOM_FIXTURE_BINDINGS } from '../src/data/source-room-memories.js';
import { sourceDividePropPlacements } from '../src/data/source-braided-divide.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { CHUNK_SURF_GOD_PRESET as P, buildChunkSurfGodPreset } from '../src/game/chunk-surf-god.js';

function runtimeFor(preset = P.ALL_INSIGHTS) {
  const built = buildChunkSurfGodPreset(preset, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition(built.position);
  return runtime;
}
const runtime = runtimeFor();
const initial = runtime.sourceRoomMemoryFrame({ flashMode: 'off' });
const fixture = (anchorId) => initial.fixtures.find((entry) => entry.anchorId === anchorId);
const near = (entry, distance = 12) => runtime.setPlayerPosition({ x: (entry.x - distance) / CELL, y: entry.z / CELL, facing: 1 });
const roomLights = (options = {}) => runtime.localLights({ time: .03, flashMode: 'off', ...options }).filter((light) => light.sourceRoomMemory);

// Provenance refers to real authored objects, and never guesses from colour or
// location. Asset reuse is honest about not being a relocated original instance.
assert.equal(initial.active, true);
assert.equal(initial.medium, 'overworld');
const curatedIds=sourceDividePropPlacements().map((prop)=>`${prop.id}-0`).sort();
assert.equal(curatedIds.length,19,'the Divide keeps a curated set of inhabitable models');
assert.deepEqual(initial.survivors.filter((entry)=>entry.id.startsWith('divide-')).map((entry)=>entry.id).sort(),curatedIds,
  'every current Divide model retains its actual room provenance');
const originalIds = new Set(CONSERVATORY_PROPS.map((prop) => prop.id));
for (const entry of [...initial.survivors, ...initial.fixtures]) {
  assert.ok(originalIds.has(entry.sourcePropId), `invented origin ${entry.sourcePropId}`);
  assert.ok([entry.x, entry.y, entry.z, entry.cellX, entry.cellY].every(Number.isFinite));
  assert.equal(entry.cellX * CELL, entry.x);
  assert.equal(entry.cellY * CELL, entry.z);
}
const cello = initial.survivors.find((entry) => entry.id === 'divide-west-cello-0');
assert.equal(cello.sourcePropId, 'practice-ensemble-cello');
assert.equal(cello.relation, 'asset-reuse');
assert.equal(cello.zone, ZONE.practice);
assert.equal(initial.survivors.find((entry) => entry.id === 'divide-east-piano-0').sourcePropId, 'hall-grand-1');
assert.equal(initial.survivors.find((entry) => entry.id === 'divide-percussion-0').originId, 'concert-hall');
assert.equal(initial.survivors.find((entry) => entry.id === 'divide-bust-head-0').relation, 'derived-fragment');
assert.equal(initial.survivors.find((entry) => entry.id === 'divide-final-organ-0').originId, 'chapel');
assert.equal(initial.survivors.find((entry) => entry.id === 'divide-final-vault-0').sourcePropId, 'chapel-vault');
assert.equal(initial.survivors.find((entry) => entry.id === 'divide-case-crossing-0').sourcePropId, 'practice-case-1');
assert.equal(initial.survivors.find((entry) => entry.id === 'divide-east-files-0').sourcePropId, 'academic-store-files-1');
assert.equal(initial.survivors.find((entry) => entry.id === 'source-landing:dock-desk-1').relation, 'relocated-instance');
assert.deepEqual(sourceRoomMemoryForProp({ id: 'source-hero-test', mesh: 'cello', color: [1, 0, 0] }), sourceRoomMemoryForProp({ id: 'source-hero-test', mesh: 'cello', color: [0, 0, 1] }));
assert.deepEqual(sourceRoomMemoryForProp({ id: 'divide-test', mesh: 'cello', color: [1, 0, 0] }), sourceRoomMemoryForProp({ id: 'divide-test', mesh: 'cello', color: [0, 0, 1] }));
assert.equal(sourceRoomMemoryForProp({ id: 'divide-unknown', mesh: 'unrecorded_mesh' }),null,'a Divide ID cannot invent provenance');
assert.equal(sourceRoomMemoryForProp({ id: 'unrelated', mesh: 'cello' }), null);

// Fixtures stand on particular survivors in that survivor's own pose. The
// camera never changes their position or chooses their origin.
assert.equal(initial.fixtures.length, SOURCE_ROOM_FIXTURE_BINDINGS.length);
const physicalProps=runtime.propInstances(undefined,undefined,{time:.03,flashMode:'off'});
for (const entry of initial.fixtures) {
  const anchor = initial.survivors.find((survivor) => survivor.id === entry.anchorId);
  assert.ok(anchor, `missing physical fixture anchor ${entry.anchorId}`);
  assert.ok(Math.hypot(entry.x - anchor.x, entry.y - anchor.y, entry.z - anchor.z) < 10,
    'fittings remain physically attached to their scaled survivor, including the grand piano rim');
  const binding=SOURCE_ROOM_FIXTURE_BINDINGS.find((binding)=>binding.anchorId===entry.anchorId);
  const anchorInstance=physicalProps.find((prop)=>prop.id===entry.anchorId);
  const fixtureInstance=physicalProps.find((prop)=>prop.id===entry.id);
  const original=CONSERVATORY_PROPS.find((prop)=>prop.id===binding.fixtureId);
  const matrix=anchorInstance.matrix;
  for(let axis=0;axis<3;axis++){
    const expected=matrix[12+axis]+matrix[axis]*binding.offset[0]+matrix[4+axis]*binding.offset[1]+matrix[8+axis]*binding.offset[2];
    assert.ok(Math.abs(fixtureInstance.matrix[12+axis]-expected)<1e-4,'the fixture follows its actual local attachment offset');
    assert.ok(Math.abs(Math.hypot(...fixtureInstance.matrix.slice(axis*4,axis*4+3))-(original.scale||1))<1e-6,
      'the original fitting keeps its own scale when its architectural anchor grows');
  }
}
const strings = fixture('divide-west-stand-0');
const piano = fixture('divide-east-piano-0');
const bust = fixture('divide-bust-torso-0');
const chapel = fixture('divide-final-vault-0');
assert.equal(chapel.powerMode, 'unpowered');
assert.equal(chapel.accession.assetTag, 'EC/C-03');
near(strings);
assert.deepEqual(runtime.sourceRoomMemoryFrame().fixtures, initial.fixtures);

// Original circuit/maintained semantics and cadence are reused by the real
// conservatory resolver. Dead fittings consume no local-light slots.
assert.equal(roomLights({ liveCircuits: [] }).some((light) => light.anchorPropId === strings.id), false);
const practice = roomLights({ liveCircuits: ['sp04'] }).find((light) => light.anchorPropId === strings.id);
assert.ok(practice);
const originalPractice = resolveLocalLights({ group: 'upper', zone: ZONE.practice }, { timeSec: .03, effectsMode: 'off', liveCircuits: ['sp04'], slots: Infinity }).find((light) => light.id === strings.originalLightId);
for (const key of ['intensity', 'radius', 'penetration', 'powerMode', 'circuit', 'emissiveScale']) assert.equal(practice[key], originalPractice[key]);
assert.deepEqual(practice.color, originalPractice.color);
assert.equal(practice.kind, LIGHT_KIND.EMERGENCY);
assert.ok(Math.abs(practice.y - strings.y - .18) < 1e-6);
assert.equal(practice.anchorPropId, strings.id);

near(piano, 8);
const hall = roomLights({ liveCircuits: [] }).find((light) => light.anchorPropId === piano.id);
assert.ok(hall, 'maintained concert practical follows an unrelated breaker');
assert.equal(hall.powerMode, 'maintained');
assert.equal(hall.radius, 10);
near(piano, hall.radius + 6);
assert.equal(roomLights({ liveCircuits: [] }).some((light) => light.anchorPropId === piano.id), false, 'room light became a global atmosphere');

near(bust);
assert.equal(roomLights({ liveCircuits: ['sp04'] }).some((light) => light.anchorPropId === bust.id), false);
assert.ok(roomLights({ liveCircuits: ['sp05'] }).some((light) => light.anchorPropId === bust.id));
assert.ok(roomLights({ liveCircuits: ['sp04', 'sp05'] }).length <= 3);
assert.equal(roomLights({ liveCircuits: ['sp04', 'sp05'] }).some((light) => light.anchorPropId === chapel.id), false);

// A dead fixture's surface cannot retain a glow just because the GPU light was
// filtered out. Presentation is independent of localLights call ordering.
near(strings);
const props = (circuits) => runtime.propInstances(undefined, undefined, { time: .03, flashMode: 'off', liveCircuits: circuits });
assert.equal(props([]).find((prop) => prop.id === strings.id).practicalEmissiveScale, 0);
assert.equal(props(['sp04']).find((prop) => prop.id === strings.id).practicalEmissiveScale, originalPractice.emissiveScale);
near(chapel);
assert.equal(props(['sp04', 'sp05']).find((prop) => prop.id === chapel.id).practicalEmissiveScale, 0);

// One image medium and the ordinary beam continue through proper, including
// the end doors. The first shore and later telephone/outskirts keep their own
// existing phase contracts.
const ambient = resolveLightingContext({ zone: ZONE.none });
assert.deepEqual(runtime.sourceAmbient().color, ambient.ambientColor);
assert.equal(runtime.sourceAmbient().intensity, Math.max(.05,ambient.ambientIntensity),
  'proper keeps the ordinary recording colour with a restrained visibility floor');
assert.equal(runtime.sourceAmbient().whitePointScale, ambient.whitePointScale);
assert.equal(runtime.sourceFlashlightFrame().mode, 'normal');
assert.equal(runtime.sourceFlashlightFrame().profile, 'proper');
runtime.setPlayerPosition(runtime.edgeDoorApproach());
const scene = runtime.sourceScene({ reducedMotion: true });
assert.equal(scene.look.roomMemoryActive, true);
assert.equal(scene.look.sunrise, 0);
assert.equal(scene.look.paper, 0);
assert.ok(scene.roomMemories.some((entry) => entry.originId === 'chapel'));
const shore = runtimeFor(P.FIRST_LIFT);
assert.equal(shore.sourceRoomMemoryFrame().active, false);
assert.equal(shore.sourceScene({ reducedMotion: true }).look.roomMemoryActive, false);
assert.equal(shore.sourceFlashlightFrame().profile, 'shore');
const hallRuntime = runtimeFor(P.HALL_ENTRY);
assert.equal(hallRuntime.sourceRoomMemoryFrame().active, false);
assert.equal(hallRuntime.sourceFlashlightFrame().profile, 'hall');
console.log('Source room memories: actual provenance, anchored fixtures, bounded original power/cadence, continuous proper recording OK');
