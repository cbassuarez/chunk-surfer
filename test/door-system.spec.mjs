import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_DOORS, DOOR_ARCHETYPES, DOOR_ARCHETYPE } from '../src/data/conservatory-doors.js';
import { F, ZONE } from '../src/data/floorplan/legend.js';
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
assert.equal(doors.filter((door)=>door.leafCount===2).length,4,'only the entrance, hall vestibule, chapel and the bay goods doors are pairs');
assert.deepEqual(doors.filter((door)=>door.leafCount===2).map((door)=>door.id).sort(),['bay-goods-pair','chapel-c17','front-main','hall-vestibule']);
// The goods doors are the widest opening in the building and the only one whose
// key is never issued: barred from the inside, in a bay with no lorry.
{
  const goods=doors.find((door)=>door.id==='bay-goods-pair');
  assert.equal(goods.aperture.width,3,'three metres of opening');
  assert.equal(goods.cells.length,12,'three authored metres of portal, not one widened cell');
  assert.equal(goods.keyId,'services-core','the keyring nobody is issued');
  assert.ok(!doors.find((door)=>door.id==='dock-grey-exterior').cells
    .some((cell)=>goods.cells.some((other)=>other.x===cell.x&&other.y===cell.y)),
  'and they are a separate portal from the personnel door beside them');
}
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
// '51,25' is the studio-to-studio door in the dance wing; it was called
// b3-plant-service back when the plant room was on the other side of it.
assert.equal(migrated['b3-b2-service'].state,DOOR_STATE.OPEN);
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

// ── the grey door, and a door that stops being one ──────────────────────────
// The door he comes in through stands in the get-in's west wall, dead ahead of
// where he starts out on the loading bay apron, locked to his own key. He walks
// through it once. It is the only door in the building that does not survive the
// night: reaching for it from the inside retires it into masonry (see retireDoor
// / the post-door beat in main.js), which has to leave the building honest
// everywhere at once — and takes the bay, the yard and the weather with it.
FP.resetDoors();
const grey=FP.doorState().find((door)=>door.id==='dock-grey-exterior');
assert.ok(grey,'the grey door he came in through exists');
assert.equal(grey.keyId,'master','it is locked, and he is the man with the key');
assert.equal(grey.widthAxis,'y','it sits in a north-south wall');
FP.setSpawn(conservatory.spawn.x,conservatory.spawn.y);
const spawnCell=FP.spawn();
const approach=FP.toRuntimePoint(conservatory.greyDoorApproach);
// HE DOES NOT START IN FRONT OF IT ANY MORE. The spawn used to be the apron,
// dead ahead of this door, because the cold open had already narrated the walk
// across the yard. The walk is played now, so he starts out on the road and the
// door is the END of it — see the spine in conservatory.js. What has to stay
// true is that the door is dead ahead of the APRON, which is where he arrives.
const apronMark=FP.toRuntimePoint({x:53,y:7});
assert.equal(FP.zoneAt(apronMark.x,apronMark.y),ZONE.dock,'the apron mark is on the loading bay');
assert.ok(grey.cells.some((cell)=>cell.y===apronMark.y),'it is dead ahead of the apron');
assert.ok(grey.cx>apronMark.x,'...and due east of it, in the wall he walks up to');
// Unlike every earlier version of this door, there IS something on both sides:
// the bay he crosses, and the get-in he is walking into.
assert.equal(FP.zoneAt(spawnCell.x,spawnCell.y),ZONE.dock,'he starts outside, and the yard is the bay too');
assert.ok(spawnCell.y>apronMark.y,'he starts out in the yard, not on the apron');
assert.equal(FP.zoneAt(approach.x,approach.y),ZONE.getIn,'and the far side of it is the get-in');
assert.equal(FP.canStep(Math.round(grey.cx)+1,Math.round(grey.cy),Math.round(grey.cx),Math.round(grey.cy),
  {keys:new Set(['master'])}).why,'closed','it is shut, and his own key is what opens it');
assert.ok(FP.doorNear(Math.round(grey.cx)+4,Math.round(grey.cy),[-1,0])?.portal?.id==='dock-grey-exterior',
  'he can reach for it from inside, which is the only side the beat happens on');

const portalsBefore=FP.doorState().length;
const scarsBefore=FP.sealedDoorways().length;
assert.equal(FP.retireDoor('dock-grey-exterior'),true,'the wall closes over it');
assert.equal(FP.doorState().length,portalsBefore-1,'it stops being a portal');
assert.equal(FP.sealedDoorways().length,scarsBefore+1,'and starts being a scar, which is a mesh the pack already has');
const scar=FP.sealedDoorways().find((entry)=>entry.cx===grey.cx&&entry.cy===grey.cy);
assert.ok(scar,'the scar stands exactly where the door stood');
// Indistinguishable from a doorway that was bricked up before he was born: the
// authored 'x' glyph on the concert hall's staff door is the reference.
const authoredScar=FP.sealedDoorways().find((entry)=>entry.id==='sealed:195,27');
const authoredCell={x:Math.round(authoredScar.cx),y:Math.round(authoredScar.cy)};
for(const {x,y} of grey.cells){
  assert.ok(FP.isSolid(x,y),'the throat is masonry now');
  assert.equal(FP.flagsAt(x,y),FP.flagsAt(authoredCell.x,authoredCell.y),'...and reads exactly as an authored bricked doorway does');
  assert.equal(FP.cellAt(x,y),null,'nothing stands in it');
}
// Probed AT THE DOOR rather than at an offset from the spawn: these used to
// count cells north of the apron, which stopped meaning anything the moment he
// started the night out on the road instead.
const westOfScar={x:Math.round(grey.cx)-2,y:Math.round(grey.cy)};
assert.equal(FP.doorNear(westOfScar.x,westOfScar.y,[1,0]),null,'nothing offers to open a wall');
assert.equal(FP.canStep(westOfScar.x,westOfScar.y,westOfScar.x+1,westOfScar.y,{keys:new Set(['master'])}).ok,false,'and the key does not help');
assert.ok(!('dock-grey-exterior' in (FP.saveDoorState().states||{})),'a retired door is not written to the door save');
assert.equal(FP.retireDoor('dock-grey-exterior'),false,'retiring it twice is a no-op');
FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,doors:conservatory.doors,
});
assert.equal(FP.doorState().length,CONSERVATORY_DOORS.length,'a fresh compile brings it back (the save flag is what keeps it gone)');

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
