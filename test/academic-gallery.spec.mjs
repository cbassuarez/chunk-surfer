import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  conservatory, ACADEMIC_ENTRY, ACADEMIC_BREACH, ACADEMIC_CLASSROOM_DOORS,
} from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_DOORS, DOOR_ARCHETYPE } from '../src/data/conservatory-doors.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { BUILDING_MAP } from '../src/data/building-map.js';
import { TARGETS } from '../src/data/conservatory-script.js';
import { MATERIAL, ZONE, ZONE_WORLD } from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { buildMapModel, captureFloorplanMapSource } from '../src/game/map-model.js';

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors||[],doors:conservatory.doors||[],
});
FP.setSpawn(conservatory.spawn.x,conservatory.spawn.y);
PROPS.propsInit(FP);

const academicDoors=FP.doorState().filter((door)=>door.id.startsWith('academic-'));
const classroomDoors=academicDoors.filter((door)=>door.id.startsWith('academic-classroom-'));
assert.equal(classroomDoors.length,8);
assert.equal(ACADEMIC_CLASSROOM_DOORS.length,8);
assert.equal(academicDoors.length,10);
assert.ok(academicDoors.every((door)=>door.keyId==='academic-core'&&door.archetype===DOOR_ARCHETYPE.ACADEMIC_WIRED_GLASS));
assert.ok(CONSERVATORY_DOORS.filter((door)=>door.key==='academic-core').every((door)=>door.id.startsWith('academic-')));

const ordinaryKeys=new Set(['master','chapel']);
for(const door of academicDoors){
  FP.setDoorOpen(door.id,false);
  const from=door.widthAxis==='x'?{x:door.cx,y:door.cy-3}:{x:door.cx-3,y:door.cy};
  const facing=door.widthAxis==='x'?[0,1]:[1,0];
  const denied=FP.interactDoor(from.x,from.y,facing,ordinaryKeys);
  assert.equal(denied?.why,'locked',`${door.id} rejects the standard and chapel rings`);
  const artificial=FP.interactDoor(from.x,from.y,facing,new Set([...ordinaryKeys,'academic-core']));
  assert.equal(artificial?.ok,true,`${door.id} accepts the artificial core in isolation`);
  FP.setDoorOpen(door.id,false);
}
const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
assert.doesNotMatch(mainSource,/playerKeys\.add\(['"]academic-core['"]\)/);

for(const door of FP.doorState())if(!door.keyId||ordinaryKeys.has(door.keyId))FP.setDoorOpen(door.id,true);
const reachable=new Set(),queue=[FP.spawn()];reachable.add(`${queue[0].x},${queue[0].y}`);
for(let i=0;i<queue.length;i++){
  const here=queue[i];
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
    const result=FP.canStep(here.x,here.y,here.x+dx,here.y+dy,{keys:ordinaryKeys});
    if(!result.ok)continue;
    const next=result.redirect||{x:here.x+dx,y:here.y+dy},key=`${next.x},${next.y}`;
    if(reachable.has(key)||!PROPS.propCanOccupy(next.x,next.y))continue;
    reachable.add(key);queue.push(next);
  }
}
const runtime=(point)=>FP.toRuntimePoint(point);
for(const point of [ACADEMIC_ENTRY,ACADEMIC_BREACH,{x:17,y:265}]){
  const p=runtime(point);assert.ok(reachable.has(`${p.x},${p.y}`),`ordinary traversal reaches ${point.x},${point.y}`);
}

const academicCell=runtime({x:27,y:254});
assert.equal(FP.floorAt(academicCell.x,academicCell.y),10);
assert.equal(FP.zoneAt(academicCell.x,academicCell.y),ZONE.academic);
assert.equal(FP.materialAt(academicCell.x,academicCell.y),MATERIAL.academicPlaster);
assert.equal(ZONE_WORLD[ZONE.academic],'amplifications');
assert.equal(TARGETS.length,5);
assert.equal(BUILDING_MAP.targets.length,5);
assert.ok(!BUILDING_MAP.targets.some((target)=>target.logical.y>=240));

const academicStairMid=runtime({x:53,y:189});
assert.equal(FP.materialAt(academicStairMid.x,academicStairMid.y),MATERIAL.serviceConcrete,'the 3F stair keeps the service-stair concrete treatment');
const stairClutterMeshes=new Set(['upper_stair_dressing','basement_stair_dressing','academic_stair_dressing','stair_smoke_door_open','stair_smoke_door_closed','stair_sconce_pair_opal','stair_bulkhead_pair','stair_pendant_opal','tower_stair_rail_low_up','tower_stair_rail_high_up','tower_stair_rail_high_down','tower_stair_rail_low_down']);
assert.equal(CONSERVATORY_PROPS.some((prop)=>stairClutterMeshes.has(prop.mesh)),false,'every ordinary stair stays free of rails, frames, and decorative fixtures');

const academicProps=CONSERVATORY_PROPS.filter((prop)=>prop.id.startsWith('academic-'));
assert.ok(academicProps.length>=100);
assert.ok(academicProps.every((prop)=>prop.interactive===false));
assert.ok(academicProps.every((prop)=>!prop.sampleFamily&&!prop.action&&!prop.provenance));
for(const id of ['academic-atrium-structure','academic-skylight','academic-garden-basin']){
  const prop=academicProps.find((entry)=>entry.id===id);
  assert.deepEqual(prop?.renderGroups,['ground','academic']);
}

const project=(point)=>{
  const p=FP.logicalToPhysical(...Object.values(runtime(point)));
  return{x:p.x,z:p.z,height:p.y,renderGroup:p.renderGroup};
};
const source=captureFloorplanMapSource({
  definition:BUILDING_MAP,physical:FP.physicalSpanData(),stairPortals:FP.floorplan().stairPortals,
  projectLogical:project,labelForRoom:(id)=>id,
});
const job={done:0,total:5,rooms:TARGETS.map((roomId)=>({roomId,label:roomId,notes:[],recorded:false}))};
const before=buildMapModel({source,job,player:{...project(conservatory.spawn),x:project(conservatory.spawn).x,y:project(conservatory.spawn).z}});
assert.equal(before.floors.some((floor)=>floor.id==='academic'),false);
assert.equal(before.connectors.some((connector)=>connector.a.floorId==='academic'||connector.b.floorId==='academic'),false);
const atAcademic=project(ACADEMIC_ENTRY);
const after=buildMapModel({source,job,discoveredFloorIds:new Set(['academic']),player:{x:atAcademic.x,y:atAcademic.z,height:atAcademic.height,renderGroup:atAcademic.renderGroup}});
assert.equal(after.floors.find((floor)=>floor.id==='academic')?.shortLabel,'3F');
assert.equal(after.spaces.some((space)=>space.floorId==='academic'),false);
assert.ok(after.connectors.some((connector)=>connector.a.floorId==='academic'||connector.b.floorId==='academic'));

const physical=FP.physicalSpanData();
assert.equal(physical.overlaps.length,0);
const academicPortal=FP.floorplan().stairPortals.find((portal)=>portal.group1==='academic');
assert.ok(academicPortal&&academicPortal.rises>0&&academicPortal.riseHeight<=FP.STEP_UP);

console.log('academic gallery contracts passed');
