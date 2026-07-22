import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_DOORS, DOOR_ARCHETYPES, DOOR_ARCHETYPE } from '../src/data/conservatory-doors.js';
import { F } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import {
  DOOR_STATE, advanceDoor, beginDoorClose, beginDoorOpen, doorBlocksPassage,
  freshDoorRuntime, normalizeDoorSave, pointInDoorSweep, stableDoorEndpoint,
} from '../src/game/door-runtime.js';

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,doors:conservatory.doors,
});
const doors=FP.doorState();
assert.equal(doors.length,CONSERVATORY_DOORS.length,'the compiled door set exactly matches the authored schedule');
assert.equal(new Set(doors.map((door)=>door.id)).size,doors.length,'all door IDs are stable and unique');
assert.ok(doors.every((door)=>door.archetype!=='legacy'),'every portal has exactly one explicit definition');
assert.equal(doors.filter((door)=>door.leafCount===2).length,3,'only entrance, hall vestibule and chapel are pairs');
assert.deepEqual(doors.filter((door)=>door.leafCount===2).map((door)=>door.id).sort(),['chapel-c17','front-main','hall-vestibule']);
assert.ok(doors.filter((door)=>door.leafCount===1).every((door)=>door.aperture.width>=.9&&door.aperture.width<=1.05),'single apertures do not infer leaves from portal cell count');
assert.deepEqual(doors.find((door)=>door.id==='chapel-c17').activeLeaves,[1],'C-17 releases only the right leaf');
for(const id of ['tower-hatch','bell-chamber-entry','organ-loft-service','organ-loft-nave'])assert.equal(doors.find((door)=>door.id===id).archetype,DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE);
for(const door of doors.filter((entry)=>entry.id.startsWith('academic-')))assert.equal(door.archetype,DOOR_ARCHETYPE.ACADEMIC_WIRED_GLASS);
assert.equal(FP.sealedDoorways().length,1,'the x glyph is masonry with a surviving frame scar');
assert.ok(CONSERVATORY_DOORS.every((door)=>DOOR_ARCHETYPES[door.archetype].head),'all leaf-height gaps have an authored transom, panel, tympanum or infill');
assert.ok(CONSERVATORY_DOORS.every((door)=>DOOR_ARCHETYPES[door.archetype].aperture.height>=3.4));
for(const door of doors){
  const xs=door.cells.map((cell)=>cell.x),ys=door.cells.map((cell)=>cell.y);
  assert.equal(door.cx,(Math.min(...xs)+Math.max(...xs))/2,`${door.id} frame is centred across the complete threshold width`);
  assert.equal(door.cy,(Math.min(...ys)+Math.max(...ys))/2,`${door.id} frame is centred across the complete threshold depth`);
  assert.ok(door.cells.every(({x,y})=>FP.cellAt(x,y)&&!FP.isSolid(x,y)&&!(FP.flagsAt(x,y)&F.BRICKED)),`${door.id} owns one fully clear masonry-free throat`);
}

// Legacy coordinate IDs migrate into stable names without losing endpoint.
FP.resetDoors();
FP.loadDoorState({open:['186,116','129,113','51,25']});
let migrated=Object.fromEntries(FP.doorState().map((door)=>[door.id,door]));
assert.equal(migrated['chapel-c17'].state,DOOR_STATE.OPEN);
assert.equal(migrated['practice-west-1'].state,DOOR_STATE.OPEN);
assert.equal(migrated['practice-west-1'].wedge,true);
assert.equal(migrated['b3-plant-service'].state,DOOR_STATE.OPEN);
const stable=FP.saveDoorState();assert.equal(stable.schema,2);assert.equal(stable.states['chapel-c17'].state,'open');
assert.deepEqual(normalizeDoorSave(stable).states['practice-west-1'],stable.states['practice-west-1']);

// Passage remains blocked until 85%, then ordinary movement can cross it.
FP.resetDoors();const c17=FP.doorState().find((door)=>door.id==='chapel-c17');
const runtime=freshDoorRuntime({...DOOR_ARCHETYPES[DOOR_ARCHETYPE.CHAPEL_OAK_PAIR],initialState:'closed'});
beginDoorOpen(runtime);advanceDoor(runtime,DOOR_ARCHETYPES[DOOR_ARCHETYPE.CHAPEL_OAK_PAIR],.84);
assert.equal(doorBlocksPassage(runtime),true);advanceDoor(runtime,DOOR_ARCHETYPES[DOOR_ARCHETYPE.CHAPEL_OAK_PAIR],.10);assert.equal(doorBlocksPassage(runtime),false);
FP.setDoorOpen('chapel-c17',true);assert.equal(FP.canStep(c17.cx,c17.cy-1,c17.cx,c17.cy,{keys:new Set(['chapel'])}).ok,true);

// Swept leaf occupancy pauses a closer and never crushes or shoves a player.
const practiceDef={...DOOR_ARCHETYPES[DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE],initialState:'open'};
const closer=freshDoorRuntime(practiceDef);closer.wedge=false;beginDoorClose(closer);
advanceDoor(closer,practiceDef,.5,{sweepOccupied:true});assert.equal(closer.openFraction,1);
advanceDoor(closer,practiceDef,.5,{sweepOccupied:false});assert.ok(closer.openFraction<1);
assert.equal(pointInDoorSweep({cx:10,cy:10,widthAxis:'x',leaf:{width:1}},10.2,10.1),true);
assert.equal(pointInDoorSweep({cx:10,cy:10,widthAxis:'x',leaf:{width:1}},20,20),false);
assert.deepEqual(stableDoorEndpoint(closer).state,DOOR_STATE.CLOSED);

// Closed material losses participate in line traces; opening removes them.
FP.resetDoors();const practice=FP.doorState().find((door)=>door.id==='practice-west-2');
const across=practice.widthAxis==='x'?{a:{x:practice.cx,y:practice.cy-2},b:{x:practice.cx,y:practice.cy+2}}:{a:{x:practice.cx-2,y:practice.cy},b:{x:practice.cx+2,y:practice.cy}};
FP.setDoorOpen(practice.id,false);assert.equal(FP.doorAcousticLossBetween(across.a,across.b),16);
FP.setDoorOpen(practice.id,true);assert.equal(FP.doorAcousticLossBetween(across.a,across.b),0);

// Asset contract: modular, textured, small and fully static at import.
const bytes=readFileSync('public/assets/conservatory-doors.glb');assert.equal(bytes.slice(0,4).toString(),'glTF');assert.ok(statSync('public/assets/conservatory-doors.glb').size<2.5*1024*1024);
const jsonLen=bytes.readUInt32LE(12),json=JSON.parse(bytes.slice(20,20+jsonLen).toString());
assert.equal(json.animations,undefined);assert.equal(json.skins,undefined);
const names=new Set(json.meshes.map((mesh)=>mesh.name));for(const name of ['door_frame_pair','door_head_transom','door_leaf_service','door_leaf_chapel','door_sealed_scar'])assert.ok(names.has(name));
const leafMeshes=json.meshes.filter((mesh)=>mesh.name.startsWith('door_leaf_'));assert.ok(leafMeshes.every((mesh)=>mesh.extras.triangles<600));
assert.ok(json.meshes.reduce((sum,mesh)=>sum+mesh.extras.triangles,0)<8000);
for(const name of ['warm oak veneer','dark mahogany oak','grey green fire steel']){
  const mat=json.materials.find((entry)=>entry.name===name);assert.ok(mat.pbrMetallicRoughness.baseColorTexture);assert.ok(mat.normalTexture);assert.ok(mat.pbrMetallicRoughness.metallicRoughnessTexture);
}
assert.ok(json.materials.find((entry)=>entry.name==='opaque rough wired glass').pbrMetallicRoughness.roughnessFactor>.8);

console.log('door system contracts passed');
