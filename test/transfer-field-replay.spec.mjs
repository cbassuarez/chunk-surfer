import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import {createTransferFieldReplay} from '../src/game/transfer-field-replay.js';
import {makeTransferRoomScene,transferSceneRows} from '../src/game/transfer-room.js';
import {MEMORY_FIELD_VISIT as V,MEMORY_FIELD_VISITS} from '../src/data/memory-field.js';
import {makeTitleScene} from '../src/game/title.js';
import {withTransientGameState} from '../src/game/save.js';
import {transferRoomCopy} from '../src/game/post-run-copy.js';
import {createMemoryFieldScene} from '../src/game/memory-field-scene.js';

function fixture(visit=V.fourth,extra={}){
  let disposed=0,returned=0,stopped=0;const frames=[],plates=[];
  const renderer={initialize:async()=>true,render:(state,look)=>{frames.push({state:structuredClone(state),look:structuredClone(look)});return true;},dispose(){disposed++;}};
  const scene=createTransferFieldReplay({visit,renderer,audio:{start(){},stop(){stopped++;},update(){},event(){}},
    presentation:()=>({}),setTableau:value=>plates.push(value),
    onReturn(){returned++;scenes.remove(scene);},...extra});
  return{scene,frames,plates,get disposed(){return disposed;},get returned(){return returned;},get stopped(){return stopped;}};
}
function advance(scene,seconds){for(let t=0;t<seconds;t+=.05){scene.update(.05);scene.render();}}

test('extras offers all five actual visits before any media and launches scenes through ordinary menu input',()=>{
  const rows=transferSceneRows();assert.deepEqual(rows.map(row=>row.id),MEMORY_FIELD_VISITS.map(row=>row.id));
  const opened=[];const room=makeTransferRoomScene({host:{beginScene:id=>{opened.push(id);return true;}}});
  room.key({key:'Enter'});room.key({key:'ArrowDown'});room.key({key:'Enter'});
  assert.deepEqual(opened,['first','second']);
});

test('the production title exposes extras after a filed sheet or ending and Enter invokes the real callback',async()=>{
  for(const[meta,expected]of[
    [{},false],
    [{knowledge:{documents:{'work-order':{firstSeenAt:1,firstSeenRunId:'test',count:1}}}},true],
    [{endingsSeen:['sacrifice']},true],
  ])await withTransientGameState({meta},()=>{
    let selected='',opened=0;
    const title=makeTitleScene({onSelectionChange:id=>{selected=id;},onTransferRoom:()=>{opened++;}});
    for(let i=0;i<9&&selected!=='transfer-room';i++)title.key({key:'ArrowDown'});
    assert.equal(selected==='transfer-room',expected,JSON.stringify(meta));
    if(expected){title.key({key:'Enter'});assert.equal(opened,1);}
  });
  assert.equal(transferRoomCopy({filed:0,unlocked:true}).enabled,true,'a completed night does not require an unrelated document pickup');
});

test('a replay is the real walking scene, with free look and immediate Escape cleanup',async()=>{
  scenes.clear();const f=fixture();scenes.push(f.scene);await f.scene.initialize();
  const before=f.scene.view().state;
  f.scene.key({key:'w'});advance(f.scene,1);f.scene.keyup({key:'w'});
  const after=f.scene.view().state;
  assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>2.3,'ordinary W actually moves the borrowed body');
  assert.equal(f.scene.lookBy(.3,-.2),true);assert.equal(f.scene.lookAngles().yaw,after.yaw+.3);
  f.scene.key({key:'Escape',preventDefault(){}});
  assert.equal(f.returned,1);assert.equal(f.disposed,1);assert.equal(scenes.depth(),0);
  f.scene.cancel();assert.equal(f.returned,1,'exit is idempotent');
});

test('the first replay lends a real walking body after its breath while the live first visit still ends',async()=>{
  scenes.clear();const original={...V.first};
  const f=fixture(V.first);scenes.push(f.scene);await f.scene.initialize();
  f.scene.key({key:'w',code:'KeyW'});advance(f.scene,3.4);
  assert.equal(f.scene.allowsLook,false);assert.equal(f.scene.view().state.z,0,'authored breath keeps its original held body');
  advance(f.scene,1.0);
  assert.equal(f.scene.allowsLook,true);assert.ok(Math.hypot(f.scene.view().state.x,f.scene.view().state.z)>1,'held W continues into the actual field body');
  assert.equal(f.returned,0);f.scene.keyup({key:'w',code:'KeyW'});f.scene.cancel();
  assert.deepEqual(V.first,original,'the frozen authored live visit is untouched');
  let liveDone=0;
  const live=createMemoryFieldScene({visit:V.first,renderer:{initialize:async()=>true,render:()=>true,dispose(){}},onDone(){liveDone++;}});
  await live.initialize();advance(live,5);
  assert.equal(liveDone,1);assert.equal(live.view().state.x,0);assert.equal(live.view().state.z,0);
  assert.equal(V.first.walk,false);assert.equal(V.first.maxSeconds,3.6);live.exit();
});

test('the real stuck door reacts to reaching, gives after quiet, and accepts an ordinary walk through',async()=>{
  scenes.clear();const f=fixture();scenes.push(f.scene);await f.scene.initialize();
  // This explicit fixture placement avoids spending the test walking seven
  // metres. Every door press, release and threshold crossing below is real.
  f.scene.place({x:.5,z:-5,yaw:0,pitch:0});
  f.scene.key({key:'e'});assert.equal(f.scene.view().state.tries,1);
  f.scene.key({key:'w'});advance(f.scene,1.1);f.scene.keyup({key:'w'});
  assert.ok(f.scene.view().state.z>-7,'a closed leaf blocks crossing');
  advance(f.scene,35);assert.notEqual(f.scene.view().state.released,null);
  advance(f.scene,1.4);f.scene.key({key:'w'});advance(f.scene,1.5);f.scene.keyup({key:'w'});
  assert.equal(f.returned,1);assert.equal(f.disposed,1);
});

test('the ant remains an encounter, then hands the body back to walk',async()=>{
  scenes.clear();const f=fixture(V.second);scenes.push(f.scene);await f.scene.initialize();
  f.scene.key({key:'w'});advance(f.scene,.1);f.scene.keyup({key:'w'});
  assert.equal(f.scene.view().state.ant.tried,true);assert.equal(f.scene.allowsLook,false);
  advance(f.scene,16);
  assert.equal(f.scene.view().state.ant.done,true);assert.equal(f.scene.allowsLook,true);
  const before=f.scene.view().state;f.scene.key({key:'w'});advance(f.scene,1);f.scene.keyup({key:'w'});
  const after=f.scene.view().state;assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>2);
  f.scene.cancel();
});

test('a light-leak preview owns its plate and clears it before returning; reduced flash stays capped',async()=>{
  scenes.clear();let sounds=0;const plate={id:'glass'};
  const f=fixture(V.fourth,{effect:{kind:'seep',plate},presentation:()=>({reducedFlash:true}),playEffect(){sounds++;}});
  scenes.push(f.scene);await f.scene.initialize();advance(f.scene,5);
  assert.ok(f.plates.includes(plate));assert.equal(f.plates.at(-1),null);assert.equal(sounds,1);
  const effectFrames=f.frames.filter(row=>row.state.elapsed>=2.4&&row.state.elapsed<4.8);
  assert.ok(effectFrames.every(row=>(row.look.neural?.white||0)<=.5));
  f.scene.cancel();assert.equal(f.plates.at(-1),null);assert.equal(f.disposed,1);
});

test('main opens and leaves a replay without changing a run or discarding the title',async()=>{
  scenes.clear();const save={run:{id:'held-night',status:'active'},flags:{'memory.field.fourth':true},rec:{takes:[{id:'held-take'}]},nightClock:{elapsedSeconds:123},settings:{}};
  const original=JSON.stringify(save);const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=source.indexOf('let transferReplayScene=null;'),end=source.indexOf('function makeTitle(',start);
  assert.ok(start>=0&&end>start);
  const errors=[];const context={scenes,MEMORY_FIELD_VISIT:V,makeTransferRoomScene,createTransferFieldReplay,
    RENDERER:'3d',paused:false,inRogue:false,actx:null,sfxGain:null,master:null,
    createMemoryFieldRenderer:()=>({initialize:async()=>true,render:()=>true,dispose(){}}),
    createMemoryFieldAudio:()=>({start(){},stop(){},update(){},event(){}}),
    ensureCtx(){},resetMotionInput(){},getMeta:()=>({}),getSave:()=>save,
    R3:{r3dLookAngles:()=>({yaw:1,pitch:.1}),r3dRainAmount:()=>1,r3dSetSourceScene(){},r3dSetTableau(){}},
    gameplayInputLifecycleActive:()=>true,document:{hidden:false},shakeMode:()=> 'full',lastMinutesReducedDread:()=>false,flashMode:()=> 'full',
    r3dCache:{},usingSourceSpace:()=>false,syncPointerMode(){},ensureInteractionFocus(){},
    windowTakeover:null,windowTakeoverOwner:null,CUES:{playCue(){}},SPEECH:{isSpeaking:()=>false},
    uiSize:()=>({cols:100,rows:40}),uiCenter(){},uiText(){},uiFill(){},BINDINGS:{promptLine:()=>''},console:{warn:(...value)=>errors.push(value)},};
  const open=vm.runInNewContext(source.slice(start,end)+'\nopenTransferRoom',context);
  scenes.push({id:'title',blocksInput:true});assert.equal(open(),true);
  const room=scenes.top();room.key({key:'ArrowDown'});room.key({key:'ArrowDown'});room.key({key:'ArrowDown'});room.key({key:'Enter'});
  const replay=scenes.top();assert.equal(replay.id,'transfer-field-replay');await replay.initialize();
  const before=replay.view().state;replay.key({key:'w'});advance(replay,1);
  assert.equal(scenes.top(),replay,'the real scene must remain active after drawing');
  assert.equal(replay.view().failed,false);assert.ok(Math.hypot(replay.view().state.x-before.x,replay.view().state.z-before.z)>2);
  replay.key({key:'Escape'});assert.deepEqual(errors,[]);
  assert.equal(scenes.top(),room);assert.equal(JSON.stringify(save),original);
  room.key({key:'Escape'});assert.equal(scenes.top().id,'title');scenes.clear();
});
