import test from 'node:test';
import assert from 'node:assert/strict';
import {createConservatoryRiftScene} from '../src/game/conservatory-rift-scene.js';
import {conservatoryRiftFrame} from '../src/game/conservatory-rift.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function fixture({optionId='bad-bar',study=false,initialization=null,renderResult=true,onReturn=()=>{}}={}){
  let collisionQueries=0;
  const camera={eye:[66,6.42,0],yaw:0,pitch:0};
  const common={spawn:{x:66,z:0,feet:4.8,yaw:0,pitch:0},camera,liveSource:{x:65,z:0},referenceSource:{x:61,z:-2}};
  const sites={
    'bad-bar':{...common},
    'after-company':{...common,arrival:{x:66,z:3},paper:{x:61,z:-2},doors:[{id:'memory-door',x:65,z:0}],
      authoredRoute:[{x:66,z:0},{x:65,z:0},{x:64,z:0},{x:63,z:0},{x:62,z:0},{x:61,z:0},{x:61,z:-2},{x:64,z:-2},{x:66,z:3}],
      canOccupy(){collisionQueries++;return true;}},
    'fifth-chair':{...common,board:{x:66,z:0},camera:{eye:[66,7,0],yaw:0,pitch:-Math.PI/2,orthographic:true}},
  };
  const calls={initializations:0,drawn:[],disposed:0,stopped:0,destroyed:0,audio:[],traces:[],returns:[],errors:[]};
  const renderer={initialize(){calls.initializations++;return initialization?.promise??Promise.resolve(true);},
    render(frame){calls.drawn.push(frame);return renderResult;},dispose(){calls.disposed++;},diagnostics:()=>({fixture:true})};
  const audio={event:(event,frame)=>calls.audio.push({kind:'event',event,frame}),
    update:(frame,options)=>calls.audio.push({kind:'update',frame,options,afterDestroy:calls.destroyed>0}),stop(){calls.stopped++;},destroy(){calls.destroyed++;}};
  const scene=createConservatoryRiftScene({optionId,sites,renderer,audio,study,runId:'one-night',
    returnPose:{x:20,y:30,yaw:.2,pitch:-.1},onTrace:trace=>calls.traces.push(trace),onError:error=>calls.errors.push(error),
    onReturn:payload=>{calls.returns.push(payload);return onReturn(payload);}});
  return{scene,calls,sites,collisionQueries:()=>collisionQueries};
}
const advance=(scene,seconds)=>{for(let i=0;i<Math.round(seconds*20);i++)scene.update(.05);};
const pointer=(scene,type,x,y)=>scene.pointer({type,button:2,clientX:x,clientY:y});

test('input held during asynchronous preparation cannot become movement when the renderer becomes ready',async()=>{
  const gate=deferred(),h=fixture({optionId:'after-company',initialization:gate});
  const first=h.scene.initialize();h.scene.enter();h.scene.key({key:'w'});h.scene.update(10);h.scene.render();
  assert.equal(h.calls.initializations,1);assert.equal(h.calls.drawn.length,0);assert.equal(h.scene.view().state.distance,0);
  gate.resolve(true);assert.equal(await first,true);
  h.scene.key({key:'w',repeat:true});advance(h.scene,.5);assert.equal(h.scene.view().state.distance,0);
  h.scene.key({key:'w'});advance(h.scene,.5);assert.ok(h.scene.view().state.distance>1);
  h.scene.exit();
});

test('pause freezes walking and clears both held movement and a captured right-button drag',async()=>{
  const h=fixture({optionId:'after-company'});await h.scene.initialize();h.scene.key({key:'w'});advance(h.scene,.5);
  pointer(h.scene,'pointerdown',10,10);pointer(h.scene,'pointermove',25,5);h.scene.pause();
  const paused=h.scene.view().state,audioCount=h.calls.audio.length;
  advance(h.scene,20);h.scene.key({key:'d'});pointer(h.scene,'pointermove',300,200);
  assert.deepEqual(h.scene.view().state,paused);assert.equal(h.calls.audio.length,audioCount);assert.equal(h.calls.stopped,1);
  h.scene.resume();h.scene.key({key:'w',repeat:true});pointer(h.scene,'pointermove',400,300);advance(h.scene,.5);
  assert.deepEqual(h.scene.view().state.pose,paused.pose);assert.equal(h.scene.view().state.distance,paused.distance);
  h.scene.key({key:'d'});advance(h.scene,.2);assert.ok(h.scene.view().state.distance>paused.distance);h.scene.exit();
});

test('pausing a held piano action releases it on resume instead of silently continuing a performance',async()=>{
  const h=fixture();await h.scene.initialize();h.scene.key({key:'e'});advance(h.scene,1.2);
  const before=h.scene.view().state;assert.equal(before.performances,1);assert.equal(before.held,true);
  h.scene.pause();advance(h.scene,5);h.scene.resume();h.scene.key({key:'e',repeat:true});advance(h.scene,.2);
  const after=h.scene.view().state;assert.equal(after.playedSeconds,before.playedSeconds);assert.equal(after.held,false);
  assert.equal(after.releases,before.releases+1);h.scene.exit();
});

test('physical completion owns one handoff even when fresh exit input arrives before its promise settles',async()=>{
  const gate=deferred(),h=fixture({onReturn:()=>gate.promise});await h.scene.initialize();
  h.scene.key({key:'e'});advance(h.scene,2.2);h.scene.keyup({key:'e'});h.scene.key({key:'s'});h.scene.update(.05);
  assert.equal(h.calls.returns.length,1);assert.equal(h.calls.returns[0].checkpoint.completed,true);
  assert.deepEqual(h.calls.returns[0].checkpoint.returnPose,{x:20,y:30,yaw:.2,pitch:-.1});
  const at=h.scene.view().state;
  h.scene.key({key:'x'});h.scene.key({key:'x'});pointer(h.scene,'pointerdown',0,0);pointer(h.scene,'pointermove',100,100);
  h.scene.preview(0);h.scene.play();advance(h.scene,1);
  assert.equal(h.calls.returns.length,1);assert.deepEqual(h.scene.view().state,at);
  gate.resolve(true);await Promise.resolve();advance(h.scene,.5);assert.equal(h.calls.returns.length,1);h.scene.exit();
});

test('early X withdrawal uses the same one-shot receipt without granting completed understanding',async()=>{
  const gate=deferred(),h=fixture({onReturn:()=>gate.promise});await h.scene.initialize();
  h.scene.key({key:'x'});h.scene.key({key:'x'});h.scene.update(.1);
  assert.equal(h.calls.returns.length,1);assert.equal(h.calls.returns[0].checkpoint.status,'completed');
  assert.equal(h.calls.returns[0].checkpoint.completed,false);assert.ok(h.calls.returns[0].checkpoint.returnReceipt);
  gate.resolve(true);await Promise.resolve();h.scene.exit();
});

test('a synchronous world handback cannot dispatch the rest of its update into destroyed audio',async()=>{
  let h;h=fixture({onReturn:()=>h.scene.exit()});await h.scene.initialize();
  h.scene.key({key:'s'});h.scene.update(.05);
  assert.equal(h.calls.returns.length,1);assert.equal(h.calls.destroyed,1);assert.equal(h.calls.disposed,1);
  assert.equal(h.calls.audio.some(call=>call.afterDestroy),false,'the handback may retire the owner inside apply()');
});

test('synchronous and asynchronous handoff faults are reported once and never leave live input running',async()=>{
  for(const rejected of[false,true]){
    const h=fixture({optionId:'after-company',onReturn:()=>{if(rejected)return Promise.reject(Error('handoff unavailable'));throw Error('handoff unavailable');}});
    await h.scene.initialize();assert.doesNotThrow(()=>h.scene.key({key:'x'}));await Promise.resolve();await Promise.resolve();
    assert.equal(h.calls.errors.length,1);assert.match(h.scene.view().error,/handoff unavailable/);
    const before=h.scene.view().state;h.scene.key({key:'w'});h.scene.key({key:'x'});pointer(h.scene,'pointerdown',0,0);pointer(h.scene,'pointermove',70,20);advance(h.scene,1);
    assert.deepEqual(h.scene.view().state,before);assert.equal(h.calls.returns.length,1);h.scene.exit();
  }
});

test('study views reuse one simulated corridor frame, and the displayed state is exactly the state sent to rendering',async()=>{
  const h=fixture({optionId:'after-company',study:true});await h.scene.initialize();const preview=h.scene.preview(2);
  assert.equal(preview.phase,'leak');assert.ok(h.collisionQueries()>0);const queries=h.collisionQueries();
  for(let i=0;i<20;i++){
    h.scene.key({key:'w'});h.scene.key({key:'e'});h.scene.update(.1);h.scene.render();const view=h.scene.view();
    assert.equal(view.frame,preview);assert.equal(view.renderedFrame,preview);assert.equal(h.calls.drawn.at(-1),preview);
    assert.deepEqual(view.state,preview.studyState);
    assert.deepEqual({...preview,studyBeat:undefined,studyState:undefined},{...conservatoryRiftFrame(view.state,{sites:h.sites}),studyBeat:undefined,studyState:undefined});
  }
  assert.equal(h.collisionQueries(),queries,'reading or drawing a cached study must not re-walk its entire route');
  assert.equal(h.calls.returns.length,0);h.scene.exit();
});

test('return previews stay inspectable while Play candidate completes through the real handoff',async()=>{
  const h=fixture({study:true});await h.scene.initialize();
  const frame=h.scene.preview(3);assert.equal(frame.phase,'return');advance(h.scene,1);h.scene.render();assert.equal(h.calls.returns.length,0);
  h.scene.play();assert.equal(h.scene.view().studyBeat,null);assert.equal(h.scene.view().state.phase,'entry');
  h.scene.key({key:'s'});h.scene.update(.05);assert.equal(h.calls.returns.length,1);assert.equal(h.calls.returns[0].checkpoint.completed,false);
  h.scene.exit();
});

for(const failed of[false,true])test(`a renderer preparation ${failed?'failure':'success'} after exit cannot resurrect the scene or notify its retired host`,async()=>{
  const gate=deferred(),h=fixture({initialization:gate});const pending=h.scene.initialize();h.scene.exit();
  if(failed)gate.reject(Error('late preparation failure'));else gate.resolve(true);
  assert.equal(await pending,false);assert.equal(h.scene.view().closed,true);assert.equal(h.scene.view().ready,false);
  assert.equal(h.calls.errors.length,0);assert.equal(await h.scene.initialize(),false);assert.equal(h.calls.initializations,1);
  assert.equal(h.calls.disposed,1);assert.equal(h.calls.destroyed,1);
});

test('render failure freezes pointer and keyboard input and reports the owned fault only once',async()=>{
  const h=fixture({optionId:'after-company',renderResult:false});await h.scene.initialize();h.scene.render();
  assert.equal(h.calls.errors.length,1);const before=h.scene.view().state;
  h.scene.key({key:'w'});pointer(h.scene,'pointerdown',0,0);pointer(h.scene,'pointermove',50,50);advance(h.scene,.5);h.scene.render();
  assert.deepEqual(h.scene.view().state,before);assert.equal(h.calls.errors.length,1);assert.equal(h.calls.returns.length,0);h.scene.exit();
});

test('exit releases only this scene once and no later device event can change its retired checkpoint',async()=>{
  const h=fixture({optionId:'after-company'});await h.scene.initialize();h.scene.key({key:'w'});advance(h.scene,.2);h.scene.exit();
  const before=h.scene.view().state,events=h.calls.traces.length,audio=h.calls.audio.length;
  h.scene.exit();h.scene.pause();h.scene.resume();h.scene.key({key:'e'});h.scene.key({key:'x'});
  pointer(h.scene,'pointerdown',0,0);pointer(h.scene,'pointermove',100,100);advance(h.scene,2);h.scene.render();
  assert.equal(h.calls.disposed,1);assert.equal(h.calls.destroyed,1);assert.deepEqual(h.scene.view().state,before);
  assert.equal(h.calls.traces.length,events);assert.equal(h.calls.audio.length,audio);assert.equal(h.calls.returns.length,0);
});
