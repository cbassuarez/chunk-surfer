import test from 'node:test';
import assert from 'node:assert/strict';
import {DOOR_WEDGE_ID,DOOR_WEDGE_SOURCE,DOOR_WEDGE_RECOVERED_FLAG,doorWedgeTargetAvailability,planPlaceDoorWedge,planRecoverDoorWedge,reconcileCarriedDoorWedge,bagWedgeItems} from '../src/game/carried-door-wedge.js';
import {normalizeDoorSave,normalizeDoorEndpoint,stableDoorEndpoint,beginDoorClose} from '../src/game/door-runtime.js';
import {DOOR_WEDGE_MESH,DOOR_WEDGE_SHAPE,DOOR_WEDGE_GEOMETRY,installDoorWedgeMesh,doorWedgeInstance} from '../src/data/door-wedge.js';
import {isCarryItem} from '../src/game/carry-items.js';
const open=(id='b1-corridor',extra={})=>({id,archetype:'practice-acoustic-single',access:'both',keyId:null,leafCount:1,state:'open',open:true,openFraction:1,wedge:false,...extra});
const endpoint=(extra={})=>({state:'open',wedge:false,closerArmed:true,...extra});
const snapshot=(id='b1-corridor',extra={})=>({schema:2,states:{[id]:endpoint(extra)}});
const apply=(save,result)=>result.changed?{...save,...structuredClone(result.patch)}:save;

test('only the original B2 removal or this marked physical wedge can enter the bag',()=>{
  let save={items:['lyle-music-box'],flags:{},doors:snapshot(DOOR_WEDGE_SOURCE)};
  assert.equal(planRecoverDoorWedge(save,{ok:true,id:'b1-corridor',removedWedge:true}).changed,false);
  assert.equal(planRecoverDoorWedge(save,{ok:true,id:DOOR_WEDGE_SOURCE,removedWedge:false}).changed,false);
  const recovered=planRecoverDoorWedge(save,{ok:true,id:DOOR_WEDGE_SOURCE,removedWedge:true});save=apply(save,recovered);
  assert.equal(recovered.changed,true);assert.deepEqual(save.items,['lyle-music-box',DOOR_WEDGE_ID]);
  assert.equal(save.flags[DOOR_WEDGE_RECOVERED_FLAG],true);
  assert.equal(planRecoverDoorWedge(save,{ok:true,id:DOOR_WEDGE_SOURCE,removedWedge:true}).changed,false,'the original source granted another wedge');
  assert.equal(isCarryItem(DOOR_WEDGE_ID),true,'the shared physical wedge can be held without a combat move');
  assert.equal(bagWedgeItems(save,{door:open()})[0].primaryAction.enabled,true);
});

test('a wedge neither unlocks a door nor interrupts motion or an authored exit',()=>{
  const save={items:[DOOR_WEDGE_ID],flags:{},doors:snapshot()};
  for(const door of [open('dock-grey-exterior'),open('brendan-west-door'),open('roof-gate'),open('source-door'),
    open('b1-corridor',{keyId:'master'}),open('b1-corridor',{access:'exit-only'}),open('b1-corridor',{leafCount:2}),
    open('b1-corridor',{archetype:'service-fire-single'}),open('b1-corridor',{state:'opening',openFraction:.99}),
    open('b1-corridor',{state:'closed',open:false,openFraction:0}),open('b1-corridor',{state:'closing'}),open('b1-corridor',{wedge:true})]){
    assert.equal(doorWedgeTargetAvailability(door).enabled,false,door.id);assert.equal(planPlaceDoorWedge(save,door).changed,false);
  }
  assert.equal(planPlaceDoorWedge({items:[],doors:snapshot()},open()).changed,false);
  assert.equal(planPlaceDoorWedge(save,open(),{doors:snapshot('b1-corridor',{state:'closed'})}).changed,false,'stale bag focus bypassed a changed runtime endpoint');
});

test('placing and removing transfer custody atomically with an optional door marker',()=>{
  const save={items:['lyle-music-box',DOOR_WEDGE_ID],flags:{[DOOR_WEDGE_RECOVERED_FLAG]:true},doors:snapshot()};
  const before=structuredClone(save),placed=planPlaceDoorWedge(save,open());
  assert.equal(placed.changed,true);assert.deepEqual(placed.patch.items,['lyle-music-box']);assert.deepEqual(placed.mutation,{type:'insert-wedge',doorId:'b1-corridor'});
  const reloaded=normalizeDoorSave(JSON.parse(JSON.stringify(placed.patch.doors)));
  assert.equal(reloaded.states['b1-corridor'].wedgeItemId,DOOR_WEDGE_ID);
  const runtime=normalizeDoorEndpoint(reloaded.states['b1-corridor'],{});
  assert.equal(stableDoorEndpoint(runtime).wedgeItemId,DOOR_WEDGE_ID);
  assert.equal(beginDoorClose(runtime,{removeWedge:false}),false);assert.equal(beginDoorClose(runtime,{removeWedge:true}),true);
  assert.equal(runtime.wedgeItemId,undefined);assert.equal(stableDoorEndpoint(runtime).wedgeItemId,undefined);
  assert.deepEqual(save,before);
});

test('load reconciliation retains one owner and repairs duplicate or forbidden placement without multiplying wedges',()=>{
  const duplicate={items:[DOOR_WEDGE_ID,DOOR_WEDGE_ID,'ren-home-cassette'],flags:{},doors:{schema:2,states:{
    [DOOR_WEDGE_SOURCE]:endpoint({wedge:true}),
    'b1-corridor':endpoint({wedge:true,wedgeItemId:DOOR_WEDGE_ID}),
    'practice-west-1':endpoint({wedge:true,wedgeItemId:DOOR_WEDGE_ID}),
    'practice-east-1':endpoint({wedge:true}),
  }}};
  const fixed=reconcileCarriedDoorWedge(duplicate);assert.equal(fixed.location,'placed');assert.equal(fixed.doorId,'b1-corridor');
  assert.deepEqual(fixed.patch.items,['ren-home-cassette']);assert.equal(fixed.patch.doors.states[DOOR_WEDGE_SOURCE].wedge,false);
  assert.equal(fixed.patch.doors.states['practice-west-1'].wedge,false);assert.equal(fixed.patch.doors.states['practice-east-1'].wedge,true,'another authored wedge was stolen');
  assert.equal(reconcileCarriedDoorWedge(apply(duplicate,fixed)).changed,false);
  const invalid={items:[],flags:{},doors:snapshot('brendan-west-door',{wedge:true,wedgeItemId:DOOR_WEDGE_ID})};
  const safe=reconcileCarriedDoorWedge(invalid);assert.equal(safe.location,'carried');assert.deepEqual(safe.patch.items,[DOOR_WEDGE_ID]);
  assert.equal(safe.patch.doors.states['brendan-west-door'].wedge,false);
  const legacy={items:[],flags:{},doors:snapshot(DOOR_WEDGE_SOURCE,{state:'closed',wedge:false})};
  assert.equal(reconcileCarriedDoorWedge(legacy).changed,false,'a previously removed legacy wedge was fabricated');
});

test('the real floorplan authority can recover B2, insert at B1, resist a closer and recover the same wedge after reload',async()=>{
  const FP=await import('../src/world/floorplan.js'),{conservatory}=await import('../src/data/floorplan/conservatory.js');
  FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
    connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});FP.resetDoors();
  const door=id=>FP.doorState().find(door=>door.id===id),source=door(DOOR_WEDGE_SOURCE);
  const hit=FP.interactDoor(source.cx,source.cy,[0,-1],new Set());assert.equal(hit.id,DOOR_WEDGE_SOURCE);assert.equal(hit.removedWedge,true);
  let save=apply({items:[],flags:{}},planRecoverDoorWedge({items:[],flags:{}},hit,{doors:FP.saveDoorState()}));
  const target=door('b1-corridor'),other=FP.interactDoor(target.cx,target.cy,[0,-1],new Set());
  assert.equal(other.removedWedge,true);assert.equal(planRecoverDoorWedge(save,other,{doors:FP.saveDoorState()}).changed,false);
  FP.tickDoors(2);FP.swingDoorOpen(target.id,{x:target.cx,y:target.cy+4});
  assert.equal(FP.insertDoorWedge(target.id).ok,false,'insertion jumped an opening animation');FP.tickDoors(2);
  const plan=planPlaceDoorWedge(save,door(target.id),{doors:FP.saveDoorState()});assert.equal(plan.changed,true);
  assert.equal(FP.insertDoorWedge(target.id).ok,true);save={...save,...plan.patch,doors:FP.saveDoorState()};
  assert.deepEqual(save.items,[]);assert.equal(door(target.id).wedgeItemId,DOOR_WEDGE_ID);
  FP.tickDoors(10,{playerX:target.cx,playerY:target.cy-10});assert.equal(door(target.id).state,'open','closer ignored the placed wedge');
  FP.loadDoorState(JSON.parse(JSON.stringify(save.doors)));assert.equal(door(target.id).wedgeItemId,DOOR_WEDGE_ID);
  const removed=FP.interactDoor(target.cx,target.cy,[0,-1],new Set());assert.equal(removed.removedWedgeItemId,DOOR_WEDGE_ID);
  save=apply(save,planRecoverDoorWedge(save,removed,{doors:FP.saveDoorState()}));
  assert.deepEqual(save.items,[DOOR_WEDGE_ID]);assert.equal(FP.saveDoorState().states[target.id].wedgeItemId,undefined);
  assert.equal(FP.insertDoorWedge('dock-grey-exterior').ok,false);assert.equal(FP.insertDoorWedge('brendan-west-door').ok,false);
});

test('the shared code-native wedge is a closed 90 by 45 by 22 millimetre rubber prism',()=>{
  const geometry=DOOR_WEDGE_GEOMETRY[0];assert.equal(geometry.name,DOOR_WEDGE_MESH);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<geometry.p.length;i++){min[i%3]=Math.min(min[i%3],geometry.p[i]);max[i%3]=Math.max(max[i%3],geometry.p[i]);}
  assert.deepEqual(max.map((value,i)=>value-min[i]),[DOOR_WEDGE_SHAPE.width,DOOR_WEDGE_SHAPE.height,DOOR_WEDGE_SHAPE.length]);
  const edges=new Map();let volume=0;
  for(let at=0;at<geometry.i.length;at+=3){
    const indices=geometry.i.slice(at,at+3),[a,b,c]=indices.map(index=>geometry.p.slice(index*3,index*3+3));
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    for(let k=0;k<3;k++){const key=[indices[k],indices[(k+1)%3]].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}
  }
  assert.ok(volume>0);assert.ok([...edges.values()].every(count=>count===2));assert.equal(geometry.metallic,0);assert.deepEqual(geometry.emissive,[0,0,0]);
});

test('the placed wedge follows the actual reflected leaf transform and installs idempotently',()=>{
  const matrix=new Float32Array([0,0,-1,0,0,1,0,0,-1,0,0,0,2,5,7,1]);
  const door=open('b1-corridor',{wedge:true,leaf:{width:.95,depth:.065}}),before=Array.from(matrix);
  const instance=doorWedgeInstance(door,matrix);assert.equal(instance.mesh,DOOR_WEDGE_MESH);assert.ok(instance.matrix[14]<matrix[14]);assert.ok(instance.matrix[13]>5);
  assert.deepEqual(Array.from(matrix),before);assert.equal(doorWedgeInstance({...door,wedge:false},matrix),null);
  const gl=new Proxy({UNSIGNED_INT:5125,ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,STATIC_DRAW:35044,FLOAT:5126},{get:(target,key)=>key in target?target[key]:()=>({})});
  const pack={catalog:new Map()};assert.equal(installDoorWedgeMesh(gl,pack),true);const mesh=pack.catalog.get(DOOR_WEDGE_MESH);
  assert.ok(mesh);assert.equal(installDoorWedgeMesh(gl,pack),true);assert.equal(pack.catalog.get(DOOR_WEDGE_MESH),mesh);
});
