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
import {createMemoryFieldScene,memoryFieldNeural,memoryFieldLook,freshMemoryField,stepMemoryField} from '../src/game/memory-field-scene.js';
import {neuralSeconds,NEURAL_NONE} from '../src/game/neural-transition.js';

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

test('extras keeps source media as an explicit archive and has no world-interruption launch actions',()=>{
  const scenesOpened=[],archiveOpened=[],removed=[];
  const room=makeTransferRoomScene({host:{
    beginScene:id=>{scenesOpened.push(id);return true;},beginField:id=>{archiveOpened.push(id);return true;},
    flashSeep:()=>removed.push('seep'),playBleed:()=>removed.push('bleed'),deadVerb:()=>removed.push('verb'),
  }});
  room.key({key:'2'});room.key({key:'Enter'});
  assert.deepEqual(archiveOpened,['flowers-seb']);assert.deepEqual(scenesOpened,[]);assert.deepEqual(removed,[]);
  room.key({key:'1'});room.key({key:'Enter'});assert.deepEqual(scenesOpened,['first']);
  const source=readFileSync(new URL('../src/game/transfer-room.js',import.meta.url),'utf8');
  assert.match(source,/MEDIA ARCHIVE/);assert.doesNotMatch(source,/interruptionRows|flashSeep|playBleed|deadDoorCue|deadVerb|INTERRUPTIONS/);
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

test('field light is an arrival/departure transition and is absent during even a fully decayed visit',async()=>{
  for(const reducedFlash of[false,true]){
    const options={reducedFlash},arrive=memoryFieldNeural({elapsed:0,decay:1},options);
    assert.ok(arrive.white>0&&arrive.leak>0,'entry reveals the actual field through light');
    if(reducedFlash)assert.ok(arrive.white<=.5);
    const settled={...freshMemoryField(V.fourth),elapsed:20,decay:1};
    assert.equal(memoryFieldNeural(settled,options),NEURAL_NONE,'decay never schedules another leak or lens event');
    assert.ok(memoryFieldLook(settled,V.fourth,options).skyFault>0,'the existing field breakdown still works');
    const leaving=memoryFieldNeural({...settled,leaving:{at:19.3}},options);
    assert.ok(leaving.leak>0,'departure still uses the real transition');
  }
  scenes.clear();let sounds=0;
  const f=fixture(V.fourth,{effect:{kind:'seep',plate:{id:'glass'}},presentation:()=>({reducedFlash:true}),playEffect(){sounds++;}});
  scenes.push(f.scene);await f.scene.initialize();advance(f.scene,5);
  assert.deepEqual(f.plates,[],'the retired effect argument cannot revive an image interruption');assert.equal(sounds,0);
  assert.ok(f.frames.some(row=>row.look.neural.white>0));
  assert.ok(f.frames.filter(row=>row.state.elapsed>neuralSeconds('arrive',{reducedFlash:true})).every(row=>row.look.neural===undefined||row.look.neural.leak===0));
  f.scene.cancel();assert.equal(f.plates.at(-1),null);assert.equal(f.disposed,1);
});

test('a reduced-flash field departure completes before releasing its actual scene',async()=>{
  scenes.clear();const f=fixture(V.fourth,{presentation:()=>({reducedFlash:true})});
  scenes.push(f.scene);await f.scene.initialize();f.scene.place({elapsed:10,leaving:{at:10,why:'through'}});
  advance(f.scene,1.15);assert.equal(f.returned,0,'the normal 1.1s boundary cannot cut the slowed transition');
  assert.ok(f.scene.view().state.elapsed-10<neuralSeconds('leave',{reducedFlash:true}));
  advance(f.scene,.55);assert.equal(f.returned,1);assert.equal(f.disposed,1);
  let state={...freshMemoryField(V.third),elapsed:10,leaving:{at:10,why:'through'}};
  for(let i=0;i<12;i++)state=stepMemoryField(state,V.third,{dt:.1}).state;
  assert.equal(state.left,true,'normal field departure retains its existing short duration');
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
