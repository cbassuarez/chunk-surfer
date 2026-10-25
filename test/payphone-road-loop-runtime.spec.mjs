import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL } from '../src/data/floorplan/legend.js';
import { SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { PAYPHONE_LOOP_ROUTE as route, planPayphoneRoadLoop } from '../src/game/payphone-road-loop.js';

const near = (a,b,label='') => assert.ok(Math.abs(a-b)<1e-7,`${label}: ${a} != ${b}`);
// Freeze the existing performance-driven broken-phone lamps as well as the
// supplied simulation time. This test compares one instant, not two flicker phases.
Object.defineProperty(globalThis.performance,'now',{value:()=>77000,configurable:true});
function fixture(along = route.end + .173) {
  const built = buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength + along / CELL,{seed:4417,marbleEyes:'returned'});
  const runtime = createSourceSpaceRuntime({initialState:built.state});
  let position = {...built.position}; runtime.setPlayerPosition(position);
  position.y += (runtime.payphoneRoadLoopFrame().along-along)/CELL;
  runtime.setPlayerPosition(position); runtime.setPayphoneRoadLoopHolding(true);
  return {runtime,position};
}
const eyeOf = p => ({x:(p.x+.5)*CELL,z:(p.y+.5)*CELL});
function scene(runtime,position) {
  const eye=eyeOf(position), options={time:77,viewYaw:0,reducedMotion:true};
  return runtime.propInstances(position.x,position.y,options).map(p=>({
    id:p.id,mesh:p.mesh,matrix:Array.from(p.matrix,(v,i)=>i===12?v-eye.x:i===14?v-eye.z:v),
    emissive:p.emissive,character:p.character,structural:p.structural,
  })).sort((a,b)=>a.id.localeCompare(b.id));
}
function compareScene(a,b) {
  assert.equal(b.length,a.length,'visible instance count changed at the seam');
  for(let i=0;i<a.length;i++){
    assert.equal(b[i].id,a[i].id,'a physical row lost its stable identity');
    assert.equal(b[i].mesh,a[i].mesh);
    // Production matrices are Float32 at roughly kilometre world coordinates;
    // their quantization is below 0.2 mm and is not a camera jump.
    a[i].matrix.forEach((v,j)=>assert.ok(Math.abs(b[i].matrix[j]-v)<.0002,`${a[i].id} matrix ${j}: ${b[i].matrix[j]} != ${v}`));
    assert.deepEqual(b[i].emissive,a[i].emissive,`${a[i].id} lamp/material changed`);
    assert.deepEqual(b[i].character,a[i].character,`${a[i].id} pose or animation clock changed`);
  }
}
function relativePools(runtime,position){const e=eyeOf(position);return runtime.outskirtLampPools(position.x,position.y)
  .map(p=>({...p,x:p.x-e.x,z:p.z-e.z,lightAt:p.lightAt.map((v,i)=>i===0?v-e.x:i===2?v-e.z:v)}));}
function collision(runtime,position){const result=[];for(let x=-20;x<=20;x+=2)for(let y=-14;y<=14;y+=2){
  const from={x:position.x+x,y:position.y+y};result.push(runtime.geometry.canStep(from.x,from.y,from.x,from.y-1).ok);
}return result;}
function rebase(f){const plan=planPayphoneRoadLoop({along:f.runtime.payphoneRoadLoopFrame().along,holding:true});assert.ok(plan);
  f.position={...f.position,y:f.position.y+plan.deltaRuntimeY};
  f.runtime.setPlayerPosition(f.position);assert.ok(f.runtime.rebasePayphoneRoadLoop(plan));return plan;}

test('the actual full visible set, lamp pools, collision and bed placement are congruent after rebasing',()=>{
  const f=fixture();f.runtime.outskirtsBeatFrame({viewYaw:0,reducedMotion:true});
  const beforeScene=scene(f.runtime,f.position), beforePools=relativePools(f.runtime,f.position), beforeCollision=collision(f.runtime,f.position);
  const beforeState=f.runtime.state().outskirtsExperience;
  const beforeStreet=f.runtime.outskirtsStreetFrame({time:77,viewYaw:0,reducedMotion:true});
  const beforeEye=eyeOf(f.position), losing=f.runtime.outskirtsLosing(),wet=f.runtime.outskirtsReflection().wet;
  rebase(f);
  compareScene(beforeScene,scene(f.runtime,f.position));
  const afterPools=relativePools(f.runtime,f.position);assert.equal(afterPools.length,beforePools.length);
  for(let i=0;i<beforePools.length;i++){assert.equal(afterPools[i].id,beforePools[i].id);near(afterPools[i].x,beforePools[i].x);near(afterPools[i].z,beforePools[i].z);near(afterPools[i].strength,beforePools[i].strength);}
  assert.deepEqual(collision(f.runtime,f.position),beforeCollision);
  const afterState=f.runtime.state().outskirtsExperience;
  assert.deepEqual(afterState.lampsOff,beforeState.lampsOff,'a wrap relit or remapped a spent lamp');
  assert.deepEqual(afterState.seen,beforeState.seen);
  const afterStreet=f.runtime.outskirtsStreetFrame({time:77,viewYaw:0,reducedMotion:true}), afterEye=eyeOf(f.position);
  assert.equal(afterStreet.beds.length,beforeStreet.beds.length);
  for(let i=0;i<beforeStreet.beds.length;i++){
    assert.equal(afterStreet.beds[i].id,beforeStreet.beds[i].id);
    near(afterStreet.beds[i].x-afterEye.x,beforeStreet.beds[i].x-beforeEye.x);
    near(afterStreet.beds[i].z-afterEye.z,beforeStreet.beds[i].z-beforeEye.z);
    near(afterStreet.beds[i].gain,beforeStreet.beds[i].gain);
  }
  near(f.runtime.outskirtsLosing(),losing);near(f.runtime.outskirtsReflection().wet,wet);
  assert.equal(f.runtime.outskirtsPassAt(),route.pass);
});

test('the approach stays actual, and only future physical rows become the held logical pass',()=>{
  const f=fixture(route.start+3);
  const earlier=f.runtime.outskirtsPiece('r12-bus-woman');assert.ok(earlier,'the last actual earlier woman disappeared');
  const instances=f.runtime.propInstances(f.position.x,f.position.y,{time:77,viewYaw:0,reducedMotion:true});
  assert.ok(instances.some(p=>p.id==='r12-bus-woman'));
  assert.ok(!instances.some(p=>p.id==='r14-page-fence'),'future pass14 leaked its played-back variation into the loop');
  assert.ok(instances.some(p=>p.id==='r14-booth-ledger'),'a future loop copy used pass14 instead of the complete quiet pass13');
});

test('multiple laps retain physical IDs and accumulated state; release keeps the current copy and resumes pass14',()=>{
  const f=fixture();rebase(f);
  f.position={...f.position,y:f.position.y-route.period/CELL};f.runtime.setPlayerPosition(f.position);
  const before=scene(f.runtime,f.position);rebase(f);compareScene(before,scene(f.runtime,f.position));
  assert.equal(f.runtime.payphoneRoadLoopFrame().turns,2);
  assert.equal(f.runtime.state().outskirtsExperience.loopTurns,2);
  // Stand at the current physical box before releasing, as ordinary pickup does.
  const currentBox=f.runtime.phoneBoxPose();assert.equal(currentBox.id,'r15-phone-box');
  f.position={...currentBox.inside,facing:0};f.runtime.setPlayerPosition(f.position);f.runtime.setPhoneBoxInside(true);
  const heldPose=f.runtime.phoneBoxPose();f.runtime.setPayphoneRoadLoopHolding(false);
  assert.deepEqual(f.runtime.phoneBoxPose(),heldPose,'pickup substituted a different kiosk');
  assert.equal(f.runtime.outskirtsPiece('r13-van').id,'r15-van','logical phone lookup returned an old copy');
  f.runtime.setPhoneBoxInside(false);
  const desired=route.end+2;f.position.y+=(f.runtime.payphoneRoadLoopFrame().along-desired)/CELL;f.runtime.setPlayerPosition(f.position);
  assert.equal(f.runtime.outskirtsPassAt(),14);
  assert.equal(f.runtime.outskirtsPiece('r14-phone-box').id,'r16-phone-box');
  assert.equal(f.runtime.outskirtsPassBreak(),'played-back');
});

test('save/reload retains loop copies, lamp histories, current kiosk and clocks without rewriting recorded history',()=>{
  const f=fixture();f.runtime.tickOutskirtsCharacters(.15,{viewYaw:0,reducedMotion:true,moving:true,speed:2});
  f.runtime.outskirtsBeatFrame({viewYaw:0,reducedMotion:true});
  const historyBefore=f.runtime.state().outskirtsExperience.history;rebase(f);
  assert.deepEqual(f.runtime.state().outskirtsExperience.history,historyBefore);
  const saved=JSON.parse(JSON.stringify(f.runtime.state())), before=scene(f.runtime,f.position), pose=f.runtime.phoneBoxPose();
  const restored=createSourceSpaceRuntime({initialState:saved});restored.setPlayerPosition(f.position);
  compareScene(before,scene(restored,f.position));
  assert.deepEqual(restored.phoneBoxPose(),pose);
  assert.equal(restored.payphoneRoadLoopFrame().turns,1);
  assert.equal(restored.payphoneRoadLoopFrame().holding,true);
  assert.deepEqual(restored.state().outskirtsExperience.history,historyBefore);
  near(restored.outskirtsCharacterFrame().clock,f.runtime.outskirtsCharacterFrame().clock);
  assert.deepEqual(restored.state().outskirtsExperience.lampsOff,saved.outskirtsExperience.lampsOff);
});

test('live locomotion keeps its stride derivative and the recorded earlier double keeps its world anchor',()=>{
  const f=fixture(route.start-2);
  f.runtime.tickOutskirtsCharacters(.1,{viewYaw:.12,reducedMotion:true,moving:true});
  f.position.y-=1;f.runtime.setPlayerPosition(f.position);
  f.runtime.tickOutskirtsCharacters(.1,{viewYaw:.12,reducedMotion:true,moving:true});
  f.position.y+=(f.runtime.payphoneRoadLoopFrame().along-(route.end+.173))/CELL;f.runtime.setPlayerPosition(f.position);
  f.runtime.tickOutskirtsCharacters(.1,{viewYaw:0,reducedMotion:true,moving:true});
  const before=scene(f.runtime,f.position), history=f.runtime.state().outskirtsExperience.history;
  assert.ok(before.some(p=>p.id==='outskirts-double'),'the controlled previous traversal produced no replay witness');
  rebase(f);compareScene(before,scene(f.runtime,f.position));
  assert.deepEqual(f.runtime.state().outskirtsExperience.history,history,'rebasing rewrote recorded evidence');
  const gait=f.runtime.outskirtsCharacterFrame().locomotion.gaitTime;
  assert.equal(f.runtime.geometry.canStep(f.position.x,f.position.y,f.position.x,f.position.y-1).ok,true);
  f.position.y-=1;f.runtime.setPlayerPosition(f.position);
  f.runtime.tickOutskirtsCharacters(.1,{viewYaw:0,reducedMotion:true,moving:true});
  assert.ok(f.runtime.outskirtsCharacterFrame().locomotion.gaitTime>gait+.4,'a wrap erased the next real half-metre stride');
});

test('large canonical town context repeats every four physical rows and never follows the camera',()=>{
  const f=fixture(route.start+2);
  let instances=f.runtime.propInstances(f.position.x,f.position.y,{time:77,viewYaw:0,reducedMotion:true});
  const contexts=instances.filter(p=>p.id.startsWith('outskirts-town:'));
  assert.ok(contexts.length>0);
  assert.ok(contexts.every(p=>Number(p.id.split(':')[1])%4===0));
  assert.ok(!instances.some(p=>p.id==='source-outskirt-elevation'));
  const stable=contexts.find(p=>p.id.includes('district-'));
  assert.ok(stable,'no recognizable canonical district frontage was submitted');
  f.position.y-=2;f.runtime.setPlayerPosition(f.position);
  const moved=f.runtime.propInstances(f.position.x,f.position.y,{time:77,viewYaw:0,reducedMotion:true}).find(p=>p.id===stable.id);
  assert.ok(moved);assert.deepEqual(moved.matrix,stable.matrix,'the town translated with the observer');
  const first=fixture(12);
  instances=first.runtime.propInstances(first.position.x,first.position.y,{time:77,viewYaw:0,reducedMotion:true});
  const ellery=instances.filter(p=>p.mesh==='opening_street_frontage'||p.mesh==='ellery_west_roofline_closure');
  assert.ok(ellery.length>0);assert.ok(ellery.every(p=>p.id.startsWith('outskirts-town:0:')),'the whole Ellery frontage tiled into later road rows');
});
