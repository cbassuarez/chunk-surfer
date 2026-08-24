import assert from 'node:assert/strict';

import { FACILITY_SPACES } from '../src/data/building-map.js';
import { CONSERVATORY_DOORS, DOOR_ARCHETYPE } from '../src/data/conservatory-doors.js';
import { CONSERVATORY_PROPS, PROP_MESH } from '../src/data/conservatory-props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { F, ZONE } from '../src/data/floorplan/legend.js';
import { SCENE_DOCK_LABEL, SCENE_DOCK_NAME } from '../src/data/space-labels.js';
import {
  DOCK_HAUNTING_ACTION_LABEL,
  DOCK_HAUNTING_GUIDANCE_ID,
  DOCK_HAUNTING_VARIANT,
  dockHauntingGuidance,
  dockHauntingStaging,
} from '../src/game/get-in.js';
import { shouldHideCrossEnvelopeProp } from '../src/game/prop-visibility.js';
import { minimapTargetReadout } from '../src/render/minimap.js';
import { buildMinimapCommands } from '../src/render/map-commands.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(conservatory.levels,{
  width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[],
});

assert.equal(SCENE_DOCK_LABEL,'SCENE DOCK');
assert.equal(SCENE_DOCK_NAME,'Scene Dock');
const mapSpace=FACILITY_SPACES.find((space)=>space.id==='space:get-in');
assert.equal(mapSpace.label,SCENE_DOCK_LABEL);
assert.equal(mapSpace.shortLabel,'DOCK');
assert.deepEqual(mapSpace.doorIds,['dock-grey-exterior','dock-foyer-service','dock-inner-service']);

const doorById=(id)=>FP.doorState().find((door)=>door.id===id);
const foyer=doorById('dock-foyer-service');
const service=doorById('dock-inner-service');
assert.equal(foyer.cells.length,4,'FOH has one authored metre of threshold, widened only to runtime resolution');
assert.equal(foyer.leafCount,1);
assert.equal(foyer.archetype,DOOR_ARCHETYPE.STAFF_HALF_GLAZED);
assert.equal(service.cells.length,8,'south freight pair is two metres wide and one authored metre deep');
assert.equal(service.leafCount,2);
assert.equal(service.archetype,DOOR_ARCHETYPE.SERVICE_WIRED_PAIR);

const cardinal=[[1,0],[-1,0],[0,1],[0,-1]];
const adjacentZones=(door)=>new Set(door.cells.flatMap(({x,y})=>cardinal.map(([dx,dy])=>FP.zoneAt(x+dx,y+dy))));
assert.ok(adjacentZones(foyer).has(ZONE.getIn));
assert.ok(adjacentZones(foyer).has(ZONE.foyer),'FOH leaf touches both named rooms directly');
assert.ok(adjacentZones(service).has(ZONE.getIn),'freight pair lives in the Scene Dock south wall');

for(let y=16;y<=22;y+=.5){
  for(let x=64;x<=66.5;x+=.5){
    const point=FP.toRuntimePoint({x,y},{center:false});
    assert.ok(FP.cellAt(point.x,point.y),`freight lane exists at ${x},${y}`);
    assert.equal(FP.isSolid(point.x,point.y),false,`freight lane is unobstructed at ${x},${y}`);
    assert.equal(Boolean(FP.flagsAt(point.x,point.y)&F.BRICKED),false);
  }
}
assert.equal(FP.zoneAt(...Object.values(FP.toRuntimePoint({x:70,y:4},{center:false}))),ZONE.getIn);
assert.equal(FP.isSolid(...Object.values(FP.toRuntimePoint({x:71,y:4},{center:false}))),true,'northeast wall steps inward');
assert.equal(FP.isSolid(...Object.values(FP.toRuntimePoint({x:72,y:5},{center:false}))),true,'services pocket has a second shallower step');
assert.equal(FP.zoneAt(...Object.values(FP.toRuntimePoint({x:72,y:6},{center:false}))),ZONE.getIn,'the step releases back into the room');

for(const name of ['scene_dock_roof_structure','scene_dock_sign_services'])assert.ok(PROP_MESH[name]);
for(const id of ['dock-scene-roof','dock-sign-studios-plant'])assert.ok(CONSERVATORY_PROPS.some((prop)=>prop.id===id));
assert.equal(CONSERVATORY_PROPS.some((prop)=>prop.id==='dock-sign-front-of-house'),false,'the unnecessary FOH sign is not staged');
const roof={id:'dock-scene-roof',mesh:'scene_dock_roof_structure',x:53,z:7.5};
assert.equal(shouldHideCrossEnvelopeProp(roof,{observerZone:ZONE.dock}),false,'shared roof is visible through the Loading Bay');
assert.equal(shouldHideCrossEnvelopeProp(roof,{observerZone:ZONE.getIn}),false,'the same roof survives entry into the Scene Dock');

const staging=dockHauntingStaging({variant:DOCK_HAUNTING_VARIANT.NORTH_CAGE});
assert.equal(dockHauntingGuidance({active:false,staging}),null);
const lure=dockHauntingGuidance({active:true,staging,pressure:.45,nowMs:1200,runId:'run-a',effects:'full'});
assert.equal(lure.id,DOCK_HAUNTING_GUIDANCE_ID);
assert.equal(lure.kind,'hush-lure');
assert.equal(lure.corrupted,true);
assert.equal(lure.suppressExactDistance,true);
assert.deepEqual(lure,dockHauntingGuidance({active:true,staging,pressure:.45,nowMs:1200,runId:'run-a',effects:'full'}),'lure frame is deterministic');
assert.notDeepEqual(lure.authored,dockHauntingGuidance({active:true,staging,pressure:.45,nowMs:2500,runId:'run-a',effects:'full'}).authored,'full-effects lure jumps among nearby authored cells');
const stillA=dockHauntingGuidance({active:true,staging,nowMs:0,runId:'run-a',effects:'off'});
const stillB=dockHauntingGuidance({active:true,staging,nowMs:9000,runId:'run-b',effects:'off'});
assert.deepEqual(stillA.authored,stillB.authored,'effects-off presentation never moves the target');
assert.equal(stillA.label,`[ ${DOCK_HAUNTING_ACTION_LABEL} ]`);
assert.equal(DOCK_HAUNTING_ACTION_LABEL,'COME CLOSER','movement action has no false interact key or extra copy');

const lureWaypoint={
  id:lure.id,label:lure.label,kind:lure.kind,floorId:'g',position:{x:lure.authored.x,y:lure.authored.y},
  corrupted:lure.corrupted,glitchPhase:lure.glitchPhase,suppressExactDistance:lure.suppressExactDistance,
};
assert.equal(minimapTargetReadout({player:{floorId:'g',position:{x:65,y:10}},waypoint:lureWaypoint,route:{floorDelta:0},spaces:[]}).distanceSuppressed,true);
const lureCommands=buildMinimapCommands({
  model:{
    player:{resolved:true,floorId:'g',position:{x:65,y:10},heading:0},
    waypoint:lureWaypoint,floors:[{id:'g',open:new Set(['65,10'])}],spaces:[],doors:[],connectors:[],contacts:[],
    policy:{minimapMode:'compass',showWaypoint:true},route:{floorDelta:0},hush:{active:false},
  },
  viewport:{x:0,y:0,w:24,h:12},now:1200,
});
assert.ok(lureCommands.some((command)=>command.kind.startsWith('waypoint')&&command.corrupted&&command.suppressExactDistance),'corrupted lure survives map command reduction');

assert.equal(CONSERVATORY_DOORS.find((door)=>door.id==='dock-grey-exterior').archetype,DOOR_ARCHETYPE.BAY_GOODS_PAIR,'Loading Bay entrance remains untouched');

console.log('Scene Dock rebuild contracts passed');
