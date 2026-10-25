import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,CONTINUATION_DROP_LIPS,continuationCatchFloor} from '../src/data/source-continuation.js';
import {freshSourceContinuation,stepSourceContinuation,sourceContinuationThreatTelemetry} from '../src/game/source-continuation.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';

const seed=()=>({...freshSourceContinuation({runId:'pursuit-entry'}),status:'active',x:-13.19,z:-1,feet:3,
  yaw:-Math.PI/2,doorOpen:{'wrong-onward':true}});
const next=(state,input={})=>stepSourceContinuation(state,{dt:1/60,...input});
function entry(){const result=next(seed(),{forward:1});assert.equal(result.state.phase,'catch');return result.state;}
function reveal(state){const events=[];while(state.reveal){const result=next(state);state=result.state;events.push(...result.events);}return{state,events};}

test('the machine wakes once only after the overhead reveal restores agency, with its full existing warning',()=>{
  let state=entry();const pose={x:state.x,z:state.z,feet:state.feet};
  assert.equal(state.counterweight.active,false);
  for(const gate of [{paused:true},{renderReady:false}]){
    const result=next(state,{...gate,dt:.25,side:1,interact:true});
    assert.deepEqual(result.state,state);assert.deepEqual(result.events,[]);
  }
  const events=[];
  while(state.reveal){
    const result=next(state,{forward:1,side:1,interact:true});state=result.state;events.push(...result.events);
    assert.deepEqual({x:state.x,z:state.z,feet:state.feet},pose);
    if(state.reveal){assert.equal(state.counterweight.active,false);assert.equal(state.counterweight.elapsed,0);}
  }
  assert.deepEqual(events.map(e=>e.type),['reveal-complete','counterweight-warning']);
  assert.equal(events[1].reason,'overhead-agency-restored');
  assert.equal(state.counterweight.active,true);assert.equal(state.counterweight.mode,'warning');assert.equal(state.counterweight.elapsed,0);
  const machine={x:state.counterweight.x,y:state.counterweight.y,z:state.counterweight.z};
  for(let i=0;i<179;i++){
    const result=next(state);state=result.state;
    assert.deepEqual(result.events,[]);assert.equal(state.counterweight.mode,'warning');
    assert.deepEqual({x:state.counterweight.x,y:state.counterweight.y,z:state.counterweight.z},machine);
  }
  const following=[];
  while(state.counterweight.mode==='warning'){const result=next(state);state=result.state;following.push(...result.events);}
  assert.deepEqual(following.map(e=>e.type),['counterweight-moves']);
  assert.ok(Math.abs(state.elapsed-(C.revealSeconds+C.catch.counterweightWarningSeconds))<.06);
});

test('old inactive Catch saves receive one warning at their retained machinery position, never a restart on reload',()=>{
  const old={...entry(),reveal:null};
  Object.assign(old.counterweight,{x:-17.7,z:-4,y:3,cycle:2});
  let result=next(old);assert.equal(result.events[0].type,'counterweight-warning');
  assert.equal(result.events[0].reason,'restored-catch-agency');
  assert.deepEqual(result.events[0].position,{x:-17.7,y:3,z:-4});assert.equal(result.state.counterweight.cycle,2);
  const saved=JSON.parse(JSON.stringify(result.state));result=next(saved);
  assert.equal(result.events.some(e=>e.type==='counterweight-warning'),false);
  assert.ok(result.state.counterweight.elapsed>saved.counterweight.elapsed);
});

test('waiting can observe repeated physical circuits while both the entry bridge and every return refuge stay usable',()=>{
  const start=reveal(entry()).state,entries=[];
  let state=start;const modes=new Set(),events=[];
  for(let i=0;i<210*30;i++){
    const before=state.counterweight,result=next(state,{dt:1/30});state=result.state;events.push(...result.events);
    modes.add(state.counterweight.mode);
    assert.equal(state.recovery,null,'the protected bridge is not a compulsory commitment');
    assert.equal(state.x,start.x);assert.equal(state.z,start.z);
    assert.ok(Math.hypot(state.counterweight.x-before.x,state.counterweight.y-before.y,state.counterweight.z-before.z)<.41,
      'the continuing threat cannot reposition between physical phases');
    if(result.events.some(e=>e.type==='counterweight-cycle'))entries.push(state.counterweight.cycle);
  }
  assert.ok(entries.length>=2,'deliberate waiting cannot exhaust the mechanism');
  assert.deepEqual(entries,entries.map((_,i)=>i+1));
  for(const mode of ['warning','walking','falling','returning','rewinding','hoisting','traversing','lowering-warning','lowering'])assert.ok(modes.has(mode),mode);
  assert.equal(events.filter(e=>e.type==='counterweight-warning').length,0,'return cycles keep their existing cues instead of replaying entry');
  for(let level=0;level<C.catch.levels;level++){
    const refuge={...state,x:-30.5,z:7.5,level,feet:continuationCatchFloor(level)};
    const prediction=sourceContinuationThreatTelemetry(refuge,{horizonSeconds:210});
    assert.equal(prediction.refuge,true);assert.equal(prediction.timeToContact,null);
  }
});

test('an exposed first landing receives about seven seconds after wake before physically reachable contact',()=>{
  let state=reveal(entry()).state;
  Object.assign(state,{x:CONTINUATION_DROP_LIPS[0].x,z:CONTINUATION_DROP_LIPS[0].z,grace:0});
  const wakeAt=state.elapsed,prediction=sourceContinuationThreatTelemetry(state,{horizonSeconds:20});
  assert.ok(prediction.timeToContact>7&&prediction.timeToContact<8);
  while(!state.recovery&&state.elapsed-wakeAt<20)state=next(state).state;
  assert.ok(state.recovery);assert.equal(state.recovery.reason,'counterweight');
  assert.ok(Math.abs(state.elapsed-wakeAt-prediction.timeToContact)<.05);
  assert.ok(Math.hypot(state.x-state.counterweight.x,state.z-state.counterweight.z)<C.catch.counterweightRadius+C.bodyRadius+.08);
  assert.equal(state.recovery.repaired,false);
  while(state.recovery)state=next(state).state;
  assert.ok(state.grace>2.9);assert.equal(state.x,-30.5);assert.equal(state.z,7.5);
  assert.equal(sourceContinuationThreatTelemetry(state).timeToContact,null);
});

test('held first-person input and input pressed during the reveal cannot move the restored overhead body',async()=>{
  const trace=[],audio=[],scene=createSourceContinuationScene({checkpoint:seed(),
    renderer:{initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}},
    audio:{event:e=>audio.push(e.type),update(){},pause(){},stop(){}},onTrace:t=>trace.push(t)});
  await scene.initialize();scene.key({key:'w'});scene.update(.1);
  assert.ok(scene.serialize().reveal);const pose=scene.serialize();scene.key({key:'d'});
  while(scene.serialize().reveal)scene.update(1/60);
  assert.equal(scene.serialize().x,pose.x);assert.equal(scene.serialize().z,pose.z);
  for(let i=0;i<12;i++){scene.key({key:'w',repeat:true});scene.key({key:'d',repeat:true});scene.update(1/60);}
  assert.equal(scene.serialize().x,pose.x);assert.equal(scene.serialize().z,pose.z);
  assert.deepEqual(trace.filter(t=>t.type==='control-boundary').map(t=>t.reason),['phase','reveal-complete']);
  assert.equal(audio.filter(e=>e==='counterweight-warning').length,1);
  scene.keyup({key:'w'});scene.keyup({key:'d'});scene.key({key:'a'});scene.update(.1);
  assert.ok(scene.serialize().x<pose.x,'fresh overhead movement is available immediately');scene.exit();
});

test('a frame spanning the supported landing discards its remaining old movement sample',()=>{
  let state=reveal(entry()).state;
  Object.assign(state,{x:CONTINUATION_DROP_LIPS[0].x,z:CONTINUATION_DROP_LIPS[0].z});
  state=next(state,{dt:0,interact:true}).state;assert.ok(state.fall);
  for(let i=0;i<600;i++){
    const neutral=next(state,{dt:.25});
    if(neutral.events.some(e=>e.type==='land')){
      const held=next(state,{dt:.25,side:1,forward:1});
      assert.deepEqual(held.state,neutral.state,'the drop has no air steering and cannot spend remaining frame time walking after contact');
      assert.equal(held.state.fall,null);assert.equal(held.state.accumulator,0);
      const fresh=next(held.state,{side:1});assert.ok(fresh.state.x>held.state.x);return;
    }
    state=next(state).state;
  }
  assert.fail('the existing correct lip must reach its supported landing');
});
