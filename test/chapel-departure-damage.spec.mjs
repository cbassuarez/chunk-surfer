import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/game/chapel-tape-demand.js';

const context={runId:'chapel-damage-test',chapelWon:true,chapelRoute:true};
const reduce=(state,event)=>D.reduceChapelTapeDemand(state,event,context);
const target={takeId:'take:4',roomId:'soundnoisemusic',ordinal:4};
function departing(){
  let state=reduce(D.freshChapelTapeDemand(context.runId),{type:'arm'});
  return reduce(state,{type:'depart',route:'inversion',departure:{stage:'rescue',position:{x:18,y:7},remainingMs:51000}});
}
function caught(state=departing(),doorId='chapel-c17',extra={}){
  return reduce(state,{type:'catch',catch:{doorId,anchor:{x:8,y:5.74,z:2},position:{x:18,y:7},group:doorId==='front-main'?'ground':'upper',
    mode:'spatial',kind:'building',floor:4.8,wallYaw:1.2,initialDistance:1.8,...extra}});
}
function lose(state,hz=60){
  const seconds=D.chapelTapeDemandStrainSeconds(state);
  for(let n=0;n<Math.ceil(seconds*hz);n++)state=reduce(state,{type:'strain',seconds:1/hz});
  return state;
}
const reclaim=state=>reduce(state,{type:'interact',distanceM:.8,slack:true});
function spilled(extra={}){
  const first=reclaim(lose(caught()));
  return lose(caught(first,'front-main',{damageTarget:target,...extra}));
}

test('first lost grip breaks the case; second distinct loss requests one named recording damage',()=>{
  let state=caught();assert.equal(state.failures,0);assert.equal(state.caseDamaged,false);assert.equal(state.spill,null);
  state=lose(state);assert.equal(state.failures,1);assert.equal(state.caseDamaged,true);assert.equal(state.spill,null);
  state=reclaim(state);assert.deepEqual(state.spent,['chapel-c17']);
  state=caught(state,'front-main',{damageTarget:target});
  assert.deepEqual(state.catch.damageTarget,target,'the endangered take is known before irreversible loss');
  for(let i=0;i<10;i++)state=reduce(state,{type:'strain',seconds:.1});
  assert.equal(state.catch.holder,'player','the damaged-case warning affords more time than the first struggle');
  for(let i=0;i<8;i++)state=reduce(state,{type:'strain',seconds:.1});
  assert.equal(state.catch.holder,'anchor');assert.equal(state.failures,2);
  assert.equal(state.spill.damageId,'chapel-spill:chapel-damage-test:front-main:2');
  assert.deepEqual(state.spill.target,target);assert.deepEqual(state.spill.anchor,state.catch.anchor);
  assert.equal(state.spill.floor,4.8);assert.equal(state.spill.applied,false);assert.equal(state.spill.needsRetake,true);
});

test('counts actual player-to-anchor custody transitions, not grabs, failed release presses or held duration after loss',()=>{
  let state=caught();
  for(let i=0;i<20;i++)state=reduce(state,{type:'interact',distanceM:5,slack:false});
  assert.equal(state.failures,0);
  const released=reclaim(state);assert.equal(released.failures,0);assert.equal(released.caseDamaged,false);
  state=lose(state);const once=structuredClone(state);
  for(let i=0;i<200;i++)state=reduce(state,{type:'strain',seconds:.1});
  assert.deepEqual(state,once);assert.equal(state.failures,1);
});

test('pause and frame stalls cannot turn a partial warning into an unearned failure',()=>{
  let state=caught();
  for(let i=0;i<5;i++)state=reduce(state,{type:'strain',seconds:.1});
  const partial=structuredClone(state);
  for(let i=0;i<30;i++)state=reduce(state,{type:'strain',seconds:60,paused:true});
  assert.deepEqual(state,partial);
  state=reduce(state,{type:'strain',seconds:60});assert.equal(state.catch.holder,'player');assert.equal(state.failures,0);
  assert.ok(state.catch.strainSeconds<.61,'a dropped frame advances at most .1s');
});

test('second loss is elapsed-time based at ordinary frame rates',()=>{
  for(const hz of [30,60,144]){
    const first=reclaim(lose(caught(),hz));
    const second=lose(caught(first,'front-main',{damageTarget:target}),hz);
    assert.equal(second.failures,2,`${hz}Hz`);assert.equal(second.catch.holder,'anchor');
    assert.deepEqual(second.spill.target,target);
  }
});

test('JSON reload preserves the broken latch, pending damage identity and fixed spill after reclaim',()=>{
  const first=lose(caught());
  const reloaded=D.normalizeChapelTapeDemand(JSON.parse(JSON.stringify(first)),context);
  assert.deepEqual(reloaded,first);
  const second=lose(caught(reclaim(reloaded),'front-main',{damageTarget:target}));
  const pending=D.normalizeChapelTapeDemand(JSON.parse(JSON.stringify(second)),context);
  assert.deepEqual(pending,second);
  const after=reclaim(pending);assert.equal(after.status,'released');assert.equal(after.catch.holder,'player');
  assert.deepEqual(after.spill,second.spill,'recovering the case does not remove spilled material or the damage request');
  assert.deepEqual(after.spent,['chapel-c17','front-main']);
});

test('damage application is matching, idempotent and separate from the physical failure',()=>{
  let state=spilled();const original=structuredClone(state);
  assert.deepEqual(reduce(state,{type:'damage-applied',damageId:'another-spill',needsRetake:false}),state);
  assert.deepEqual(reduce(state,{type:'repair-status',damageId:state.spill.damageId,needsRetake:false}),state,'cannot fulfil unapplied damage');
  state=reduce(state,{type:'damage-applied',damageId:state.spill.damageId,needsRetake:true});
  assert.equal(state.spill.applied,true);assert.equal(state.spill.fulfilled,false);
  assert.deepEqual(reduce(state,{type:'damage-applied',damageId:state.spill.damageId,needsRetake:false}),state,'duplicate callback does not replace the first applied result');
  assert.deepEqual(original,spilled(),'events never mutate the caller checkpoint');
});

test('an intact backup or replacement fulfils the recovery without erasing the spill history',()=>{
  let state=spilled();state=reduce(state,{type:'damage-applied',damageId:state.spill.damageId,needsRetake:true});
  state=reduce(state,{type:'repair-status',damageId:state.spill.damageId,needsRetake:false});
  assert.equal(state.spill.fulfilled,true);assert.equal(state.spill.needsRetake,false);assert.equal(state.failures,2);
  const repaired=structuredClone(state);
  state=reduce(state,{type:'repair-status',damageId:state.spill.damageId,needsRetake:true});
  assert.deepEqual(state,repaired,'an unrelated later loss cannot rewrite this recovery’s closure');
  const backup=reduce(spilled(),{type:'damage-applied',damageId:spilled().spill.damageId,needsRetake:false});
  assert.equal(backup.spill.fulfilled,true);assert.equal(backup.spill.needsRetake,false);
});

test('ineligible or missing take targets still spill visually without inventing a room debt',()=>{
  for(const damageTarget of [null,{...target,roomId:'lux_nova'},{...target,roomId:'tower-personal'},
    {...target,takeId:''},{...target,ordinal:0},{...target,ordinal:1.1}]){
    const state=spilled({damageTarget});
    assert.equal(state.failures,2);assert.equal(state.spill.target,null);assert.equal(state.spill.needsRetake,false);
    assert.equal(state.spill.applied,false);assert.equal(state.spill.fulfilled,true);
  }
});

test('legacy schema-1 effort catches retain their release rule and gain no retrospective punishment',()=>{
  let state=reduce(departing(),{type:'catch',catch:{doorId:'chapel-c17',anchor:{x:0,y:.94,z:0},position:{x:2,y:3},group:'upper'}});
  for(let i=0;i<100;i++)state=reduce(state,{type:'pull',seconds:1/60});
  assert.equal(state.status,'released');assert.equal(state.failures,0);assert.equal(state.caseDamaged,false);assert.equal(state.spill,null);
  const old=structuredClone(state);delete old.failures;delete old.caseDamaged;delete old.spill;
  assert.equal(D.normalizeChapelTapeDemand(old,context).failures,0);
});

test('completion clears the active grip, preserving damage history and existing ending authority',()=>{
  const state=spilled(),done=reduce(state,{type:'complete'});
  assert.equal(done.status,'complete');assert.equal(done.catch.holder,'player');assert.equal(done.failures,2);assert.deepEqual(done.spill,state.spill);
  const save={run:{id:context.runId,status:'active'},encounters:{cleared:['chapel']},area:'source-space'};
  assert.equal(D.chapelTapeDemandResume(state,save),null);
  assert.equal(D.normalizeChapelTapeDemand(state,{runId:'another-run'}).failures,0);
  for(const patch of [{chapelWon:false},{chapelRoute:false}])assert.deepEqual(D.reduceChapelTapeDemand(caught(),{type:'strain',seconds:.1},{...context,...patch}),caught());
});
