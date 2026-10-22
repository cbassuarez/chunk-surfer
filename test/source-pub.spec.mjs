import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_PUB,sourcePubStations,sourcePubStretch,sourcePubTask,sourcePubFloorHeight,sourcePubFloorHoles} from '../src/data/source-pub.js';
import {freshSourcePubCheckpoint,normalizeSourcePubCheckpoint,sourcePubEntry,sourcePubEligible,sourcePubCanOccupy,focusedSourcePubStation,stepSourcePub,createSourcePubScene} from '../src/game/source-pub.js';
const originalPose={x:231.125,y:98.75,yaw:-1.438,pitch:.071,facing:2,floorH:-.0625,sourceTag:'last-light',nested:{unchanged:true}};
const fresh=()=>sourcePubEntry({flags:{[SOURCE_PUB.unlockFlag]:true},runId:'run-1',returnPose:originalPose});
function atStation(state,id){const station=sourcePubStations(state).find(s=>s.id===id);assert.ok(station);
  let z=1.25,x=station.z>2.4||id==='exit'?station.x:Math.max(.5,station.x-1.45);
  if(!sourcePubCanOccupy(x,z,state)){x=station.x-1.45;z=station.z>2.4?2.4:1.25;}
  assert.ok(sourcePubCanOccupy(x,z,state),'the chosen interaction is approached from physical floor');
  const dx=station.x-x,dz=station.z-z,distance=Math.hypot(dx,dz);
  return{...state,x,z,yaw:Math.atan2(dx,-dz),pitch:Math.max(-.8,Math.min(.75,Math.atan2(station.y-(SOURCE_PUB.floor+SOURCE_PUB.eyeHeight),distance)))};
}
function choose(state,id){const aim=atStation(state,id);assert.equal(focusedSourcePubStation(aim)?.id,id);return stepSourcePub(aim,{interact:true});}

test('only the optional favor flag opens the Source leg, with a run-scoped exact return pose',()=>{
  assert.equal(sourcePubEntry({runId:'run-1',returnPose:originalPose}),null);
  assert.equal(sourcePubEligible({flags:{'pub.help.complete':true}}),false);
  const entered=fresh();assert.equal(entered.status,'active');assert.deepEqual(entered.returnPose,originalPose);
  originalPose.nested.unchanged=false;assert.equal(entered.returnPose.nested.unchanged,true);originalPose.nested.unchanged=true;
  assert.equal(sourcePubEntry({flags:new Set([SOURCE_PUB.unlockFlag]),runId:'run-1'}),null,'an exact exterior pose is required');
  const completed={...entered,stage:SOURCE_PUB.rounds.length,status:'returned',completed:true};
  assert.equal(sourcePubEligible({flags:[SOURCE_PUB.unlockFlag],runId:'run-1',checkpoint:completed}),false);
  assert.equal(sourcePubEligible({flags:[SOURCE_PUB.unlockFlag],runId:'run-2',checkpoint:completed}),true,'a new run does not inherit the previous run completion');
  assert.equal(normalizeSourcePubCheckpoint(completed,{runId:'run-2'}).returnPose,null);
});

test('idle time, wrong-facing E, and out-of-range E cannot serve any order',()=>{
  let state=fresh();
  for(let i=0;i<500;i++)state=stepSourcePub(state,{dt:.25}).state;
  assert.equal(state.stage,0);assert.equal(state.task,0);
  const away={...atStation(state,'collect'),yaw:0};assert.equal(stepSourcePub(away,{interact:true}).event,null);
  assert.equal(stepSourcePub({...atStation(state,'collect'),x:1.25},{interact:true}).event,null);
  const paused=stepSourcePub(atStation(state,'collect'),{dt:.2,forward:1,interact:true,paused:true});
  assert.equal(paused.state.task,0);assert.equal(paused.state.elapsed,state.elapsed);assert.equal(paused.event,null);
});

test('all five rounds require actual service, barrel work and two chosen descents',()=>{
  let state=fresh();const orders=[],events=[],layers=[];let actions=0;
  while(state.stage<SOURCE_PUB.rounds.length){
    const task=sourcePubTask(state),stage=state.stage,priorTask=state.task,result=choose(state,task.id);actions++;events.push(result.event);
    assert.equal(result.event.type,'service');assert.equal(result.event.station,task.id);assert.equal(result.event.stage,stage);
    if(task.id==='collect')orders.push(result.event.orders);
    assert.equal(result.state.stage,priorTask===SOURCE_PUB.rounds[stage].tasks.length-1?stage+1:stage);state=result.state;
    if(state.fall){while(state.fall)state=stepSourcePub(state,{dt:.1}).state;layers.push(state.layer);}
    state=normalizeSourcePubCheckpoint(JSON.parse(JSON.stringify(state)),{runId:'run-1'});
    assert.ok(actions<40,'authored service cannot enter a repeating task loop');
  }
  assert.equal(actions,28);assert.deepEqual(orders,[2,2,0,-9,0]);assert.deepEqual(layers,[1,2]);
  assert.equal(events.filter(e=>e.station==='barrel').length,3);assert.equal(events.filter(e=>e.station==='descend').length,2);
  assert.equal(state.stage,5);assert.equal(state.completed,false,'the last service still requires the real exit');
  const end=choose(state,'exit');assert.equal(end.event.type,'exit-request');assert.equal(end.event.completed,true);assert.equal(end.state.status,'active');
  assert.deepEqual(end.state.returnPose,originalPose);
});

test('WASD owns actual collision and the stretched public aisle remains connected',()=>{
  for(let stage=0;stage<SOURCE_PUB.rounds.length;stage++){
    const scale=sourcePubStretch({stage});let state={...fresh(),stage,layer:SOURCE_PUB.rounds[stage].layer,x:1.25*scale,z:1.25,yaw:Math.PI/2};
    for(let i=0;i<Math.ceil(16*scale/(SOURCE_PUB.walkSpeed*.1));i++)state=stepSourcePub(state,{dt:.1,forward:1}).state;
    assert.ok(state.x>13*scale&&state.x<16*scale-.39,'walk traverses the actual stretched room');
    assert.ok(sourcePubCanOccupy(state.x,state.z,state));
    state={...state,x:10*scale,z:1.25,yaw:Math.PI};
    for(let i=0;i<100;i++)state=stepSourcePub(state,{dt:.1,forward:1}).state;
    assert.ok(state.z<2.70,'the body stops before the real bar counter');
    for(let x=.5;x<16*scale-.5;x+=.1)assert.equal(sourcePubCanOccupy(x,1.25,{stage}),true,'a continuous actual walking aisle survives the stretch');
  }
  const corrupt=normalizeSourcePubCheckpoint({...fresh(),x:10,z:3.4});assert.equal(corrupt.x,SOURCE_PUB.spawn.x);assert.equal(corrupt.z,SOURCE_PUB.spawn.z);
});

test('scene Escape pauses without returning, explicit door confirmation restores the exact original pose once',async()=>{
  const saves=[],returns=[],calls=[];
  const checkpoint=atStation(fresh(),'exit');
  const scene=createSourcePubScene({checkpoint,runId:'run-1',renderer:{initialize:async()=>true,render:()=>calls.push('render'),dispose:()=>calls.push('dispose')},
    onCheckpoint:value=>saves.push(value),onReturn:value=>returns.push(value)});
  assert.equal(scene.blocksWorld,true);assert.equal(scene.worldPresentation,'hidden');assert.equal(scene.allowsLook,false);
  await scene.initialize();assert.equal(scene.key({key:'Escape'}),false);assert.equal(returns.length,0);
  scene.key({key:'w'});scene.pause();scene.update(100);scene.resume();assert.equal(scene.view().task,0);
  scene.key({key:'e'});assert.equal(scene.view().exitPrompt,true);assert.equal(returns.length,0);
  scene.key({key:'x'});assert.equal(scene.view().exitPrompt,false);scene.key({key:'e'});scene.key({key:'e',repeat:true});assert.equal(returns.length,0);
  scene.key({key:'e'});scene.key({key:'e'});assert.equal(returns.length,1);assert.equal(returns[0].completed,false);assert.deepEqual(returns[0].returnPose,originalPose);
  scene.exit();scene.exit();assert.deepEqual(calls,['dispose']);assert.ok(saves.every(s=>s.returnPose.x===originalPose.x));
});

test('RMB drag changes local look, held keys clear on pause and an interrupted scene preserves progress',async()=>{
  const state=choose(fresh(),'collect').state,initial={...state,x:3,z:1.25,yaw:Math.PI/2},saves=[];
  const scene=createSourcePubScene({checkpoint:initial,renderer:{initialize:async()=>true,render(){},dispose(){}},onCheckpoint:s=>saves.push(s)});
  await scene.initialize();scene.pointer({type:'pointerdown',button:2,clientX:10,clientY:10});scene.pointer({type:'pointermove',clientX:80,clientY:30});scene.pointer({type:'pointerup'});
  assert.notEqual(scene.view().yaw,initial.yaw);const x=scene.view().x;scene.key({key:'w'});scene.pause();scene.resume();scene.update(.1);assert.equal(scene.view().x,x);
  scene.exit();assert.equal(saves.at(-1).task,1);assert.equal(saves.at(-1).status,'active');
});

test('failed or interrupted loading never steals the renderer after release, and still allows a safe return',async()=>{
  let resolve,disposed=0;const returns=[];
  const scene=createSourcePubScene({checkpoint:fresh(),renderer:{initialize:()=>new Promise(done=>resolve=done),render(){},dispose(){disposed++;}}});
  const loading=scene.initialize();await Promise.resolve();scene.exit();resolve(true);assert.equal(await loading,false);assert.equal(scene.view().ready,false);assert.equal(disposed,1);
  const failed=createSourcePubScene({checkpoint:fresh(),renderer:{initialize:async()=>{throw Error('pack failed');},render(){},dispose(){}},onReturn:s=>returns.push(s)});
  await failed.initialize();failed.key({key:'e'});assert.equal(returns.length,1);assert.equal(returns[0].completed,false);assert.deepEqual(returns[0].returnPose,originalPose);
});

test('loading is checkpointed immediately and X can return before a stalled asset finishes',async()=>{
  const saves=[],returns=[];let finish;
  const scene=createSourcePubScene({checkpoint:choose(fresh(),'collect').state,
    renderer:{initialize:()=>new Promise(resolve=>finish=resolve),render(){},dispose(){}},
    onCheckpoint:(value,meta)=>saves.push({value,reason:meta.reason}),onReturn:value=>returns.push(value)});
  const loading=scene.initialize();assert.equal(saves[0].reason,'loading');assert.equal(saves[0].value.task,1);
  await Promise.resolve();assert.equal(scene.key({key:'Escape'}),false);assert.equal(returns.length,0);
  scene.key({key:'x'});assert.equal(returns.length,1);assert.deepEqual(returns[0].returnPose,originalPose);
  assert.equal(returns[0].completed,false);assert.equal(returns[0].checkpoint.task,1);
  finish(true);assert.equal(await loading,false);assert.equal(scene.view().ready,false);
});

test('stalled residency repair exposes loading and a safe road return without advancing its checkpoint',async()=>{
  for(const exitKey of['x','e']){
    let resident=true,renders=0,clears=0,disposed=0;const saves=[],returns=[];
    const checkpoint=atStation(choose(fresh(),'collect').state,'exit');
    const scene=createSourcePubScene({checkpoint,renderer:{initialize:async()=>true,ready:()=>resident,
      render(){renders++;return true;},clear(){clears++;},dispose(){disposed++;}},
      onCheckpoint:(value,meta)=>saves.push({value,reason:meta.reason}),onReturn:value=>returns.push(value)});
    await scene.initialize();assert.equal(scene.view().ready,true);
    if(exitKey==='e'){scene.key({key:'e'});assert.equal(scene.view().exitPrompt,true);}
    scene.key({key:'w'});resident=false;const before=scene.serialize();
    assert.equal(scene.view().ready,false,'a repaired-once renderer can become loading again');assert.equal(scene.view().focus,null);
    scene.render();assert.ok(renders>0,'the renderer keeps an opportunity to request its missing residency');assert.ok(clears>0);
    for(let i=0;i<100;i++){scene.key({key:'w'});scene.update(.25);}
    scene.pointer({type:'pointerdown',button:2,clientX:0,clientY:0});scene.pointer({type:'pointermove',clientX:80,clientY:40});
    assert.deepEqual(scene.serialize(),before,'no clock, held movement, service or look accrues behind missing scenery');
    scene.key({key:exitKey});assert.equal(returns.length,1,'both loading X and an existing E confirmation remain usable');
    assert.deepEqual(returns[0].returnPose,originalPose);assert.equal(returns[0].checkpoint.task,before.task);assert.equal(returns[0].completed,false);
    assert.equal(saves.at(-1).reason,'left-early');scene.exit();assert.equal(disposed,1);
    resident=true;scene.update(.25);scene.render();assert.equal(scene.view().ready,false,'late repair cannot revive a released scene');
    assert.equal(returns.length,1);
  }
});

test('successful residency repair requires fresh movement input and preserves an interrupted fall',async()=>{
  let resident=true;const checkpoint=stepSourcePub(choose({...fresh(),stage:2,task:2},'descend').state,{dt:.2}).state;
  const scene=createSourcePubScene({checkpoint,renderer:{initialize:async()=>true,ready:()=>resident,render:()=>true,dispose(){}}});
  await scene.initialize();scene.key({key:'w'});resident=false;const before=scene.serialize();
  scene.render();scene.update(10);scene.key({key:'w'});assert.deepEqual(scene.serialize(),before);
  resident=true;assert.equal(scene.view().ready,true);scene.update(.1);assert.ok(scene.serialize().fall.elapsed>before.fall.elapsed);
  while(scene.serialize().fall)scene.update(.1);const landed=scene.serialize();scene.update(.1);assert.equal(scene.serialize().x,landed.x,'repair must discard held input rather than catch it up after landing');
  scene.key({key:'d'});scene.update(.1);assert.notEqual(scene.serialize().x,landed.x,'a fresh press works after repair');scene.exit();
});

test('both E and X recover a rejected or false renderer load without having to focus the door',async()=>{
  for(const key of['e','x'])for(const initialize of[async()=>false,async()=>{throw Error('missing character texture');}]){
    const returns=[],scene=createSourcePubScene({checkpoint:{...fresh(),x:12,z:1.25},renderer:{initialize,render(){},dispose(){}},onReturn:value=>returns.push(value)});
    assert.equal(await scene.initialize(),false);assert.equal(scene.view().ready,false);
    assert.equal(scene.key({key:'Escape'}),false);scene.key({key});
    assert.equal(returns.length,1);assert.deepEqual(returns[0].returnPose,originalPose);assert.equal(returns[0].completed,false);
  }
});

test('a frame failure becomes the same recoverable state and preserves the exact return pose',async()=>{
  const returns=[],errors=[];const scene=createSourcePubScene({checkpoint:fresh(),
    renderer:{initialize:async()=>true,render(){throw Error('WebGL context lost');},clear(){},dispose(){}},onReturn:value=>returns.push(value),onError:err=>errors.push(err.message)});
  await scene.initialize();scene.render();assert.equal(scene.view().ready,false);assert.match(scene.view().error,/context lost/);
  assert.deepEqual(errors,['WebGL context lost']);scene.key({key:'x'});assert.equal(returns.length,1);assert.deepEqual(returns[0].returnPose,originalPose);
});

test('a failed host return rolls the saved checkpoint back to active and permits a retry',async()=>{
  for(const failure of['throw','reject','false']){
    const saves=[];let attempts=0;
    const scene=createSourcePubScene({checkpoint:atStation({...fresh(),stage:SOURCE_PUB.rounds.length},'exit'),
      renderer:{initialize:async()=>true,render(){},dispose(){}},onCheckpoint:(state,meta)=>saves.push({state,reason:meta.reason}),
      onReturn(){attempts++;if(attempts>1)return true;if(failure==='throw')throw Error('host busy');if(failure==='reject')return Promise.reject(Error('host busy'));return false;}});
    await scene.initialize();scene.key({key:'e'});scene.key({key:'e'});
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    assert.equal(scene.view().leaving,false);assert.equal(scene.view().status,'active');assert.equal(scene.view().completed,false);
    assert.equal(saves.at(-1).reason,'return-failed');assert.equal(saves.at(-1).state.status,'active');
    scene.key({key:'e'});assert.equal(attempts,2);assert.equal(scene.view().completed,true);
  }
});

test('a failed persistence/reporting callback cannot disable the return control',async()=>{
  const returns=[],scene=createSourcePubScene({checkpoint:fresh(),
    renderer:{initialize:async()=>false,render(){},dispose(){}},onCheckpoint(){throw Error('storage unavailable');},
    onError(){throw Error('reporter unavailable');},onReturn:value=>returns.push(value)});
  assert.equal(await scene.initialize(),false);scene.key({key:'x'});
  assert.equal(returns.length,1);assert.deepEqual(returns[0].returnPose,originalPose);
});

test('nonfinite body coordinates are rejected before they can bypass furniture collision',()=>{
  for(const value of[NaN,Infinity,-Infinity,undefined]){
    assert.equal(sourcePubCanOccupy(value,1.25,{stage:0}),false);
    assert.equal(sourcePubCanOccupy(1.25,value,{stage:0}),false);
  }
});

test('the midpoint drops an item first; only a deliberate disclosed descent moves the player',()=>{
  let state={...fresh(),stage:2,task:1,carried:'empty-tray',x:7,z:1.25};state=choose(state,'serve').state;
  assert.equal(state.task,2);assert.equal(state.layer,0);assert.equal(state.fall,null);assert.equal(state.itemFall.kind,'tray');assert.equal(state.carried,null);
  assert.ok(sourcePubFloorHoles(state).some(h=>h.layer===0&&h.toLayer===1));
  for(let i=0;i<50;i++)state=stepSourcePub(state,{dt:.25}).state;
  assert.equal(state.layer,0);assert.equal(state.task,2);assert.equal(state.fall,null);assert.equal(state.fallenItem.kind,'tray');
  state=choose(state,'descend').state;assert.equal(state.fall.kind,'player');assert.equal(state.fall.duration,1.35);assert.equal(state.layer,0);
  const started=structuredClone(state),paused=stepSourcePub(state,{dt:.25,forward:1,interact:true,paused:true}).state;assert.deepEqual(paused,started);
  const crossing=stepSourcePub(state,{dt:.2,look:{yaw:1.9,pitch:-.3},forward:1}).state;
  assert.ok(Math.abs(crossing.yaw-1.9)<1e-10);assert.equal(crossing.pitch,-.3);assert.ok(crossing.x>state.x,'the chosen fall crosses the edge without taking look controls');
  assert.equal(sourcePubFloorHeight(crossing),sourcePubFloorHeight(state),'cross the edge before descending through the deck');
  const half=stepSourcePub(crossing,{dt:.25,forward:1}).state;
  assert.ok(sourcePubFloorHeight(half)<sourcePubFloorHeight(state));
  assert.equal(half.x,half.fall.landing.x,'horizontal crossing finishes before the eye passes through the upper floor');
  let resumed=normalizeSourcePubCheckpoint(JSON.parse(JSON.stringify(half)),{runId:'run-1'}),continuous=half;
  for(let i=0;i<20;i++){resumed=stepSourcePub(resumed,{dt:.1}).state;continuous=stepSourcePub(continuous,{dt:.1}).state;}
  assert.deepEqual(resumed,continuous);assert.equal(resumed.fall,null);assert.equal(resumed.layer,1);assert.deepEqual(resumed.returnPose,originalPose);
  assert.equal(choose(resumed,'recover').state.carried,'empty-tray');
});

test('open floor blocks ordinary walking, while chosen falls resume over an intact destination layer',()=>{
  for(const [stage,task,layer] of[[2,2,0],[3,3,1]]){
    const scale=sourcePubStretch({stage}),holeX=1.8*scale;
    let state={...fresh(),stage,task,layer,x:holeX-1.45,z:1.25,yaw:Math.PI/2};
    assert.equal(sourcePubCanOccupy(holeX,1.25,state),false,'missing floor cannot support an ordinary body');
    assert.equal(sourcePubCanOccupy(holeX+.78,1.25+.78,state),false,'square deck corners must also remain unsupported');
    assert.equal(sourcePubCanOccupy(holeX,1.25,{...state,layer:layer+1}),true,'the lower landing is actual intact floor');
    for(let i=0;i<30;i++)state=stepSourcePub(state,{dt:.1,forward:1}).state;
    assert.ok(state.x<=holeX-(.8+SOURCE_PUB.bodyRadius),'walking stops at the disclosed edge');
    assert.equal(state.fall,null);assert.equal(state.layer,layer);assert.equal(state.task,task);
    // The same aisle remains recoverable around the gap, including the exit.
    for(let x=holeX-1.4;x<holeX+1.4;x+=.05)assert.equal(sourcePubCanOccupy(x,2.4,state),true);
    state=choose(state,'descend').state;assert.ok(state.fall);state=stepSourcePub(state,{dt:.25}).state;state=stepSourcePub(state,{dt:.25}).state;
    assert.equal(state.x,holeX);assert.equal(sourcePubCanOccupy(state.x,state.z,{...state,fall:null}),false);
    const resumed=normalizeSourcePubCheckpoint(JSON.parse(JSON.stringify(state)),{runId:'run-1'});
    assert.deepEqual(resumed,state,'mid-fall serialization must retain its exact crossing, height and layer');
    assert.notEqual(resumed.x,SOURCE_PUB.spawn.x*scale,'validation must not snap a falling body to the entrance');
    while(state.fall)state=stepSourcePub(state,{dt:.1}).state;
    assert.equal(state.layer,layer+1);assert.equal(sourcePubCanOccupy(state.x,state.z,state),true);
  }
});

test('a barrel is physical carried work with bounded movement, never a timed order gate',()=>{
  const empty={...fresh(),stage:1,x:7,z:1.25,yaw:Math.PI/2},barrel={...empty,carried:'barrel'};
  const a=stepSourcePub(empty,{dt:.2,forward:1}).state,b=stepSourcePub(barrel,{dt:.2,forward:1}).state;
  assert.ok(b.x>barrel.x&&b.x-barrel.x<a.x-empty.x);assert.ok(Math.abs((b.x-barrel.x)-SOURCE_PUB.barrelSpeed*.2)<1e-8);
  let waiting=barrel;for(let i=0;i<100;i++)waiting=stepSourcePub(waiting,{dt:.25}).state;assert.equal(waiting.task,0);assert.equal(waiting.stage,1);
  assert.ok(SOURCE_PUB.barrelStacks.reduce((n,s)=>n+s.columns*s.levels,0)>150,'the barrel stacks are massive authored structures');
});

test('version-one saves migrate progress, completion and exact exterior pose without replaying served rounds',()=>{
  for(const[oldStage,oldTask,stage,task,layer]of[[0,1,0,1,0],[1,0,2,0,0],[1,2,2,2,0],[2,1,3,7,2],[3,0,5,0,2]]){
    const old={...fresh(),version:1,stage:oldStage,task:oldTask,x:2,z:1.25,status:'active'},migrated=normalizeSourcePubCheckpoint(old,{runId:'run-1'});
    assert.equal(migrated.version,2);assert.equal(migrated.stage,stage);assert.equal(migrated.task,task);assert.equal(migrated.layer,layer);assert.deepEqual(migrated.returnPose,originalPose);
  }
  const completed=normalizeSourcePubCheckpoint({...fresh(),version:1,stage:3,task:0,status:'returned',completed:true},{runId:'run-1'});assert.equal(completed.stage,5);assert.equal(completed.completed,true);
  const corrupt={...fresh(),fall:{elapsed:Infinity,fromLayer:0,toLayer:7,kind:'player',landing:{x:NaN,z:1}}};assert.equal(normalizeSourcePubCheckpoint(corrupt).fall,null);
});
