import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {YARD_CARETAKER as CARE,YARD_PUBLIC_ROOMS,YARD_PUBLIC_RANGE_IDS} from '../src/data/yard-public-rooms.js';
import {EXTERIOR_PUB as PUB} from '../src/data/exterior-pub.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {exteriorFacadeCanStep} from '../src/world/exterior-facade-collision.js';
import {packedPropMeshes,placedMesh,segmentHitsTriangle} from './helpers/packed-prop-mesh.mjs';
import {courtyardWalk} from './helpers/exterior-pub-route.mjs';
import {yardTurnPoint} from '../src/data/yard-turn.js';

FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const instances=PROPS.renderInstances({inscriptions:false}),pack=packedPropMeshes();
const geometry=id=>{const p=instances.find(p=>p.id===id);assert.ok(p,`${id} is a live placed range`);return placedMesh(p,pack.mesh(p.mesh));};
const clear=(meshes,a,b)=>assert.equal(meshes.some(m=>m.triangles.some(t=>segmentHitsTriangle(a,b,t))),false,
  `submitted static triangles must leave the actual doorway clear: ${JSON.stringify({a,b})}`);

test('the existing stable and rehearsal range each retain a real placed shell and furnished lower room',()=>{
  assert.deepEqual(YARD_PUBLIC_RANGE_IDS,['yard-rehearsal-annex','yard-former-stables','yard-baths-plant','yard-covered-stores']);
  for(const id of[...YARD_PUBLIC_RANGE_IDS,'pub-complete-interior',...YARD_PUBLIC_ROOMS.map(r=>r.id+'-room')])geometry(id);
  assert.ok(instances.some(p=>p.id==='yard-caretaker-log'),'the public room contains an inspectable maintenance book');
  const pubFront=geometry('pub-complete-frontage');
  assert.ok(pubFront.bounds.max[1]<4.5,'the pub ground-floor frontage cannot create a second tall building above the retained annex roof');
});

test('the exact converted range triangles leave both public doors and the caretaker doorway open',()=>{
  const pubMeshes=[geometry('yard-rehearsal-annex'),geometry('pub-complete-frontage')];
  const turned=(id,[x,y,z])=>{const p=yardTurnPoint(id,{x,y,z});return[p.x,y,p.z];};
  for(const d of PUB.doors)for(const dx of[-.35,0,.35])for(const y of[.45,1.15,1.75])
    clear(pubMeshes,turned('lyric',[d.x+dx,y,27.7]),turned('lyric',[d.x+dx,y,30.3]));
  for(const room of YARD_PUBLIC_ROOMS){
    const shell=geometry(room.buildingId),x=room.bounds.x0;
    for(const dz of[-.30,0,.30])for(const y of[.45,1.15,1.75])
      clear([shell],turned(room.buildingId,[x-.9,y,room.entrance.z+dz]),turned(room.buildingId,[x+1.1,y,room.entrance.z+dz]));
    if(room.window)for(const dz of[-.36,.36])clear([shell],turned(room.buildingId,[x-1,1.85,room.window.z+dz]),turned(room.buildingId,[x+1,1.85,room.window.z+dz]));
  }
});

test('actual source-derived rear walls still prevent walking into the retained occupied parts',()=>{
  for(const[id,from,to]of[['lyric',{x:39,z:40},{x:39,z:38.3}],['yard-former-stables',{x:43,z:18},{x:40.5,z:18}],['yard-baths-plant',{x:46.5,z:55},{x:44,z:55}],['yard-covered-stores',{x:47,z:77},{x:44,z:77}]])
    assert.equal(exteriorFacadeCanStep({from:{...yardTurnPoint(id,from),feet:0},to:{...yardTurnPoint(id,to),feet:0},height:1.7,radius:.20},instances).ok,false);
});

for(const room of YARD_PUBLIC_ROOMS)test(`ordinary movement reaches and enters ${room.name} from the actual spawn without leaving the block`,()=>{
  const source=yardTurnPoint(room.buildingId,{x:room.bounds.x0-.75,z:room.entrance.z+.25});
  const at=FP.logicalAtPhysical(source.x*2-.5,source.z*2-.5,{group:'ground',floor:0});assert.ok(at);
  const start=[conservatory.spawn.x*2,conservatory.spawn.y*2],stand=[at.x,at.y];
  FP.setDoorOpen(room.entrance.id,false);
  const route=courtyardWalk(FP,PROPS,start,stand);assert.ok(route,'the stable public entrance must be on the real arrival-side route');
  const opened=FP.interactDoor(...stand,[0,-1],new Set());assert.equal(opened?.id,room.entrance.id);assert.equal(opened.opened,true);
  FP.tickDoors(1.8,{playerX:stand[0],playerY:stand[1]});
  let p=stand;
  for(let i=0;i<7;i++){
    const body=FP.logicalToPhysical(...p),a=FP.arcYawOffset(...p,body.x+.5,body.z+.5);
    const request=[p[0]+Math.round(-Math.sin(a)),p[1]-Math.round(Math.cos(a))],step=FP.canStep(...p,...request,{keys:new Set()});assert.equal(step.ok,true,`caretaker entry step ${i}`);
    const q=step.redirect?[step.redirect.x,step.redirect.y]:request;
    assert.equal(PROPS.propCanOccupy(...q,{from:{x:p[0],y:p[1]}}),true,`caretaker furniture must leave entry step ${i} clear`);p=q;
  }
  assert.equal(FP.zoneAt(...p),room.zone,'the public room has its own indoor weather/ceiling profile');
  assert.ok(Math.abs(FP.floorAt(...p)-room.floor)<1e-6);
  assert.ok(courtyardWalk(FP,PROPS,p,start),'the same ordinary doorway permits a return to arrival');
});
