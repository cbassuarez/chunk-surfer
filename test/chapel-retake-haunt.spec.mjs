import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';
import {CHAPEL_RETAKE_HAUNT,createChapelRetakeHaunt,chapelRetakeHauntInstances} from '../src/game/chapel-retake-haunt.js';
import {freshTakeHunter,armTakeHunter,stepTakeHunter} from '../src/game/take-hunter.js';

const input={damageId:'chapel-spill:test:front-main:2',takeId:'take:8',roomId:'main_b3',requiredRoomId:'main_b3',recording:true,
  slating:false,stalled:false,atSec:0,minimumSeconds:45,paused:false,focused:true,effectsMode:'full'};

test('only the damaged ordinary room’s real recording attempt activates the retake director',()=>{
  for(const change of [{recording:false},{damageId:null},{takeId:null},{roomId:'the_tub'},{requiredRoomId:null},
    {roomId:'lux_nova',requiredRoomId:'lux_nova'},{minimumSeconds:NaN},{minimumSeconds:0},{atSec:NaN}]){
    const f=createChapelRetakeHaunt().update({...input,...change});assert.equal(f.active,false);assert.deepEqual(f.events,[]);
  }
  const f=createChapelRetakeHaunt().update(input);assert.equal(f.active,true);assert.equal(f.stage,'watching');assert.equal(f.events.length,0);
});

test('three distinct warnings occur once per actual attempt at fractions of its usable duration',()=>{
  for(const minimumSeconds of[40.5,45,49.5]){
    const director=createChapelRetakeHaunt(),events=[];
    for(let n=0;n<=Math.ceil(minimumSeconds*20);n++)events.push(...director.update({...input,minimumSeconds,atSec:n/20}).events);
    assert.equal(events.length,3);assert.deepEqual(events.map(e=>e.pulseIndex),[1,2,3]);
    events.forEach((event,i)=>{assert.equal(event.cause,'chapel-retake');assert.equal(event.takeId,input.takeId);assert.ok(Math.abs(event.atSec-minimumSeconds*CHAPEL_RETAKE_HAUNT.pulses[i])<.051);});
    assert.equal(new Set(events.map(e=>e.id)).size,3);
    for(let n=0;n<20;n++)assert.equal(director.update({...input,minimumSeconds,atSec:minimumSeconds+10}).events.length,0);
    assert.equal(director.snapshot().events.length,0,'readback does not repeat event delivery');
  }
});

test('slating, pause, native blur and transport stalls consume missed windows without a catch-up burst',()=>{
  for(const reason of['slating','paused','stalled','blur']){
    const director=createChapelRetakeHaunt();director.update(input);
    const blocked={...input,atSec:23,...(reason==='blur'?{focused:false}:{[reason]:true})};
    assert.deepEqual(director.update(blocked).events,[]);
    assert.deepEqual(director.update({...input,atSec:23}).events,[]);
    assert.deepEqual(director.update({...input,atSec:23.1}).events,[]);
    const later=director.update({...input,atSec:35.2});assert.equal(later.events.length,1);assert.equal(later.events[0].pulseIndex,3);
  }
});

test('late attachment, dropped frames and a clock rewind cannot queue a pulse storm',()=>{
  const late=createChapelRetakeHaunt();assert.equal(late.update({...input,atSec:40}).events.length,0);
  assert.equal(late.update({...input,atSec:40.1}).events.length,0);
  const stalled=createChapelRetakeHaunt();stalled.update(input);
  const f=stalled.update({...input,atSec:40});assert.equal(f.events.length,1);assert.equal(f.events[0].pulseIndex,3);
  assert.equal(stalled.update({...input,atSec:40.1}).events.length,0);
  assert.equal(stalled.update({...input,atSec:1}).events.length,0);
  assert.equal(stalled.update({...input,atSec:41}).events.length,0);
});

test('stopping a failed retake removes its scene, while a new take receives its own warnings',()=>{
  const director=createChapelRetakeHaunt();director.update(input);assert.equal(director.update({...input,atSec:8.2}).events.length,1);
  assert.equal(director.update({...input,recording:false,atSec:8.2}).active,false);
  assert.equal(director.update({...input,atSec:8.2}).events.length,0,'reentering the same take cannot replay its issued pulse');
  director.update({...input,takeId:'take:9'});
  const f=director.update({...input,takeId:'take:9',atSec:8.2});assert.equal(f.events.length,1);assert.notEqual(f.events[0].id,`${input.damageId}:${input.takeId}:haunt:1`);
  director.reset();assert.equal(director.snapshot().active,false);
});

test('the existing hunter makes retake pulses dangerous while silence remains a complete counterplay',()=>{
  function run(heard){
    const director=createChapelRetakeHaunt();let hunter=freshTakeHunter(),contact=false,pulses=0;
    for(let n=0;n<=450;n++){
      const f=director.update({...input,atSec:n/10});
      for(const event of f.events){pulses++;hunter=armTakeHunter(hunter,{cause:event.cause,roll:0});}
      const next=stepTakeHunter(hunter,.1,{recording:true,heard});hunter=next.state;contact||=!!next.contact;
    }
    return{contact,pulses};
  }
  assert.deepEqual(run(0),{contact:false,pulses:3},'a quiet player can finish the full usable interval');
  assert.equal(run(.35).contact,true,'the warnings feed real pursuit/contact rather than a decorative pressure counter');
});

function fakePlan({zone=ZONE.studio,group='ground',floor=0,ceiling=3,wall=()=>false}={}){
  const plan={isLoaded:()=>true,isSolid:(x,y)=>Math.abs(x)>12||Math.abs(y)>12||wall(x,y),
    zoneAt:()=>zone,logicalToPhysical:(x,y)=>({x,z:y,y:floor,renderGroup:group}),floorAt:()=>floor,ceilAt:()=>ceiling,flagsAt:()=>0};
  return plan;
}
const snap=(changes={})=>({active:true,damageId:input.damageId,takeId:input.takeId,roomId:'main_b3',stage:'watching',pressure:.4,pulseIndex:0,effectsMode:'full',...changes});
const frame=(snapshot=snap(),changes={})=>chapelRetakeHauntInstances(snapshot,{plan:fakePlan(),group:'ground',logicalOrigin:{x:0,y:0},listener:{x:0,y:1.62,z:0,yaw:0},timeSec:3,reducedMotion:false,...changes});

test('witnesses use actual floor-supported room space and existing split body geometry with a fixed budget',()=>{
  const plan=fakePlan(),f=frame(snap({pulseIndex:3}),{plan});
  assert.equal(f.length,9);assert.equal(new Set(f.map(p=>p.id)).size,9);
  assert.deepEqual([...new Set(f.map(p=>p.mesh))].sort(),['chapel_presence_head','chapel_presence_kneeling_lower','chapel_presence_kneeling_upper'].sort());
  for(const p of f){
    assert.equal(plan.isSolid(p.logical.x,p.logical.y),false);assert.equal(p.zone,ZONE.studio);assert.equal(p.blocks,false);assert.equal(p.interactive,false);
    assert.ok([...p.matrix].every(Number.isFinite));assert.ok(Math.hypot(p.x,p.z)>1.7);
  }
  assert.equal(frame(snap(),{plan}).length,6,'two witnesses establish the room before the first pulse');
  assert.equal(frame(snap({active:false}),{plan}).length,0);
});

test('wrong zone, unsupported floor/headroom, blocked cells and foreign groups fail closed',()=>{
  for(const plan of[fakePlan({zone:ZONE.foyer}),fakePlan({ceiling:1.5}),fakePlan({wall:()=>true})])assert.equal(frame(snap({pulseIndex:3}),{plan}).length,0);
  assert.equal(frame(snap(),{group:'upper'}).length,0);
  assert.equal(frame(snap(),{canOccupy:()=>false}).length,0);
  assert.equal(frame(snap(),{logicalOrigin:{x:NaN,y:0}}).length,0);
});

test('witness stations survive camera changes; reduced motion and effects off keep static readable figures',()=>{
  const plan=fakePlan(),options={plan,reducedMotion:true},a=frame(snap({pulseIndex:3}),options),b=frame(snap({pulseIndex:3}),{...options,timeSec:70,listener:{x:.2,y:1.62,z:.1,yaw:2}});
  assert.deepEqual(a,b,'camera movement never drags or repositions the witnesses');
  const off=frame(snap({effectsMode:'off',pulseIndex:3}),{plan,timeSec:99});assert.equal(off.length,9);assert.ok(off.every(p=>p.apparitionVariant===0));
  assert.deepEqual(off,frame(snap({effectsMode:'off',pulseIndex:3}),{plan,timeSec:0}));
});

test('the compiled recording rooms admit only their own connected zone, physical group and support',()=>{
  FP.compile(conservatory.levels,conservatory);
  const cells=FP.physicalSpanData().cells,rooms=new Map([[ZONE.studio,'main_b3'],[ZONE.natatorium,'the_tub'],[ZONE.hall,'amplifications'],[ZONE.practice,'soundnoisemusic']]);
  const tested=new Set();
  for(const key of cells.keys()){
    const[x,y]=key.split(',').map(Number),zone=FP.zoneAt(x,y),roomId=rooms.get(zone);if(!roomId||tested.has(roomId)||FP.isSolid(x,y))continue;
    const at=FP.logicalToPhysical(x,y),f=chapelRetakeHauntInstances(snap({roomId,pulseIndex:3,takeId:`take:${roomId}`}),
      {plan:FP,group:at.renderGroup,logicalOrigin:{x,y},listener:{x:at.x*CELL,y:at.y+1.62,z:at.z*CELL,yaw:0},reducedMotion:true});
    if(f.length<6)continue;
    tested.add(roomId);
    for(const p of f){const q=FP.logicalToPhysical(p.logical.x,p.logical.y);assert.equal(FP.zoneAt(p.logical.x,p.logical.y),zone);assert.equal(q.renderGroup,at.renderGroup);if(p.mesh.endsWith('_lower'))assert.equal(p.y,FP.floorAt(p.logical.x,p.logical.y));}
  }
  assert.deepEqual([...tested].sort(),[...rooms.values()].sort(),'each actual eligible room has at least two supported witnessing positions');
});
