import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/game/chapel-tape-demand.js';

const context={runId:'combined-departure',chapelWon:true,chapelRoute:true};
const reduce=(state,event)=>D.reduceChapelTapeDemand(state,event,context);
function departure(){
  let state=reduce(D.freshChapelTapeDemand(context.runId),{type:'arm'});
  return reduce(state,{type:'depart',route:'inversion',departure:{stage:'rescue',position:{x:12,y:7},remainingMs:53000}});
}
const spatial=(doorId='chapel-c17',extra={})=>({doorId,anchor:{x:0,y:.94,z:0},position:{x:12,y:7},group:'upper',wallYaw:0,
  mode:'spatial',kind:'building',initialDistance:1.8,...extra});
const caught=(extra={})=>reduce(departure(),{type:'catch',catch:spatial('chapel-c17',extra)});

test('the learned physical rule returns at the public exit once, never at a spent anchor',()=>{
  let state=caught();
  assert.equal(D.chapelTapeDemandCanCatch(state,'front-main'),false,'one contest at a time');
  state=reduce(state,{type:'interact',distanceM:.8,slack:true});
  assert.equal(state.status,'released');
  assert.deepEqual(state.spent,['chapel-c17']);
  assert.equal(D.chapelTapeDemandCanCatch(state,'chapel-c17'),false);
  assert.equal(D.chapelTapeDemandCanCatch(state,'front-main'),true);
  assert.deepEqual(reduce(state,{type:'catch',catch:spatial()}),state);
  state=reduce(state,{type:'catch',catch:spatial('front-main',{group:'ground'})});
  assert.equal(state.status,'caught');
  assert.equal(state.catch.doorId,'front-main');
  state=reduce(state,{type:'interact',distanceM:.8,slack:true});
  assert.deepEqual(state.spent,['chapel-c17','front-main']);
  assert.equal(D.chapelTapeDemandCanCatch(state,'front-main'),false);
});

test('a visible spatial catch needs slack and reach, not accumulated input or passive waiting',()=>{
  let state=caught();const original=structuredClone(state);
  for(let i=0;i<200;i++)state=reduce(state,{type:'pull',seconds:.1});
  assert.deepEqual(state,original,'legacy held effort cannot solve a spatial catch');
  for(const event of [{type:'interact',distanceM:.9,slack:false},{type:'interact',distanceM:1.31,slack:true},
    {type:'interact',distanceM:-1,slack:true},{type:'interact',distanceM:NaN,slack:true},
    {type:'interact',distanceM:.9,slack:true,paused:true}])assert.deepEqual(reduce(state,event),state);
  const interaction=D.chapelTapeDemandInteraction(state,{x:.8,z:0});
  assert.deepEqual(interaction,{distanceM:.8,slack:true,canRelease:true,held:false});
  state=reduce(state,{type:'interact',...interaction});assert.equal(state.status,'released');
});

test('movement can create slack and use available radius; outward strain remains a physical restraint',()=>{
  const state=caught();
  const move=(a,b)=>D.chapelTapeDemandMove(state,{physicalFrom:{x:a[0],z:a[1]},physicalTo:{x:b[0],z:b[1]}});
  assert.equal(move([1.8,0],[1.3,0]).allowed,true);
  assert.equal(move([1,0],[1,.5]).allowed,true,'sideways repositioning inside the strap radius');
  assert.equal(move([1.8,0],[2.3,0]).allowed,false);
  assert.ok(move([1.8,0],[2.3,0]).effortM>.49);
  assert.equal(D.chapelTapeDemandInteraction(state,{x:1.7,z:0}).slack,false);
  assert.equal(D.chapelTapeDemandInteraction(state,{x:1.6,z:0}).slack,true);
  assert.equal(D.chapelTapeDemandInteraction(state,{x:1.6,z:0}).canRelease,false,'slack does not substitute for arm reach');
});

test('a held case cannot be reclaimed through a floor at matching horizontal coordinates',()=>{
  let state=caught({anchor:{x:0,y:5.74,z:0},holder:'anchor'});
  const below=D.chapelTapeDemandInteraction(state,{x:.5,y:0,z:0});
  assert.equal(below.distanceM,Infinity);assert.equal(below.slack,false);assert.equal(below.canRelease,false);
  assert.equal(reduce(state,{type:'interact',...below}).status,'caught','the production distance/slack event also refuses the wrong floor');
  const sameFloor=D.chapelTapeDemandInteraction(state,{x:.5,y:4.8,z:0});
  assert.equal(sameFloor.canRelease,true);assert.equal(reduce(state,{type:'interact',...sameFloor}).status,'released');
  assert.equal(D.chapelTapeDemandInteraction(state,{x:.5,z:0}).canRelease,true,'height-free legacy callers retain their contract');
  assert.equal(D.chapelTapeDemandInteraction(state,{x:.5,y:NaN,z:0}).canRelease,false,'an invalid supplied floor is not treated as an absent floor');
});

test('losing grip places custody at the local anchor and lets walking resume without certifying departure',()=>{
  let state=caught({kind:'congregation',receiverId:'chapel-dressing:presence-0'});
  for(let i=0;i<10;i++)state=reduce(state,{type:'strain',seconds:.1});
  assert.equal(state.catch.holder,'anchor');assert.equal(state.status,'caught');
  assert.equal(state.catch.receiverId,'chapel-dressing:presence-0');
  assert.equal(D.chapelTapeDemandBlocksProgress(state),true);
  assert.equal(D.chapelTapeDemandMove(state,{physicalFrom:{x:1,z:0},physicalTo:{x:4,z:0}}).allowed,true);
  assert.equal(D.chapelTapeDemandInteraction(state,{x:2,z:0}).canRelease,false);
  const reach=D.chapelTapeDemandInteraction(state,{x:1,z:0});
  assert.equal(reach.held,true);assert.equal(reach.canRelease,true);
  state=reduce(state,{type:'interact',...reach});assert.equal(state.status,'released');
});

test('outward strain is elapsed-time based and paused intervals cannot seize custody',()=>{
  for(const hz of [30,60,144]){
    let state=caught();
    for(let i=0;i<hz;i++)state=reduce(state,{type:'strain',seconds:1/hz});
    assert.equal(state.catch.holder,'anchor',`${hz}Hz`);
  }
  let state=caught();
  for(let i=0;i<50;i++)state=reduce(state,{type:'strain',seconds:10,paused:true});
  assert.equal(state.catch.strainSeconds,0);assert.equal(state.catch.holder,'player');
  state=reduce(state,{type:'strain',seconds:10});assert.equal(state.catch.strainSeconds,.1,'a long stall cannot cause an immediate seizure');
});

test('save and reload preserve exact holder, receiver, cause and spent beats without duplicating a case',()=>{
  let state=caught({kind:'congregation',receiverId:'chapel-dressing:presence-0'});
  for(let i=0;i<10;i++)state=reduce(state,{type:'strain',seconds:.1});
  const save={run:{id:context.runId,status:'active'},encounters:{cleared:['chapel']},area:'conservatory'};
  const copy=JSON.parse(JSON.stringify(state));
  assert.deepEqual(D.chapelTapeDemandResume(copy,save),state);
  assert.equal(D.chapelTapeDemandResume(copy,{...save,sourceIV:{runId:context.runId,status:'active'}}),null);
  const immutable=structuredClone(copy);reduce(copy,{type:'interact',distanceM:.7,slack:true});assert.deepEqual(copy,immutable);
});

test('malformed spatial catches fail open rather than restoring an invisible or invented constraint',()=>{
  for(const patch of [{initialDistance:NaN},{initialDistance:0},{initialDistance:4},{group:''},{mode:'unknown'},
    {group:'unrendered-group'},{holder:'another-case'},{kind:'new-adversary'},{anchor:{x:0,y:0,z:Infinity}}]){
    const raw={...caught(),catch:spatial('chapel-c17',patch)};
    const next=D.normalizeChapelTapeDemand(raw,context);
    assert.equal(next.status,'departing',JSON.stringify(patch));
    assert.equal(next.catch,null);
  }
  const forged={...caught(),spent:['chapel-c17','chapel-c17','not-a-door']};
  const normal=D.normalizeChapelTapeDemand(forged,context);
  assert.equal(normal.status,'released');assert.deepEqual(normal.spent,['chapel-c17']);
});

test('schema-1 legacy effort saves retain their release rule and mark the survived threshold spent',()=>{
  const old=spatial();for(const key of ['mode','kind','initialDistance'])delete old[key];
  let state=reduce(departure(),{type:'catch',catch:old});
  assert.equal(state.catch.mode,undefined);
  for(let i=0;i<100;i++)state=reduce(state,{type:'pull',seconds:.02});
  assert.equal(state.status,'released');assert.deepEqual(state.spent,['chapel-c17']);
  const raw={...state};delete raw.spent;
  assert.deepEqual(D.normalizeChapelTapeDemand(raw,context).spent,['chapel-c17']);
});

test('completion and unavailable visuals retire the active physical state without altering recording credit',()=>{
  let state=caught();for(let i=0;i<10;i++)state=reduce(state,{type:'strain',seconds:.1});
  const media={takes:[{id:'real-take',source:'indexeddb:original',credited:true}],chapelWon:true};
  const before=JSON.stringify(media);
  const completed=reduce(state,{type:'complete'});
  assert.equal(completed.status,'complete');assert.equal(completed.catch.holder,'player');
  assert.equal(D.chapelTapeDemandBlocksProgress(completed),false);
  assert.equal(D.chapelTapeDemandInteraction(completed,{x:1,z:0}).held,false);
  const recovered=reduce(state,{type:'recover-missing-asset'});
  assert.equal(recovered.status,'released');assert.deepEqual(recovered.spent,['chapel-c17']);
  assert.equal(JSON.stringify(media),before);
});
