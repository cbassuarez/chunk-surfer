import test from 'node:test';
import assert from 'node:assert/strict';
import {createStandingTearScene} from '../src/game/standing-tear-scene.js';
import {freshStandingTear} from '../src/game/standing-tear.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
const advance=(scene,seconds)=>{for(let i=0;i<Math.round(seconds*20);i++)scene.update(.05);};
const pose={x:68.125,y:53.9,feet:4.8,floor:'upper',yaw:.713,pitch:-.257};
function fixture({checkpoint=null,initialization=null,onRestore=()=>{},onDone=()=>{},renderResult=true}={}){
  const calls={init:0,drawn:[],disposed:0,stopped:0,destroyed:0,audio:[],covers:[],restores:[],done:[],errors:[],checkpoints:[],traces:[]};
  let hidden=false,hostPaused=false,active=true,look=null;
  const renderer={initialize(){calls.init++;return initialization?.promise??true;},render(f){calls.drawn.push(f);return renderResult;},dispose(){calls.disposed++;},diagnostics:()=>({fixture:true})};
  const audio={event:(event,frame)=>calls.audio.push({kind:'event',event,frame,afterDestroy:calls.destroyed>0}),update:(frame,options)=>calls.audio.push({kind:'update',frame,options,afterDestroy:calls.destroyed>0}),stop(){calls.stopped++;},setPaused:value=>calls.audio.push({kind:'paused',value}),destroy(){calls.destroyed++;},snapshot:()=>({fixture:true})};
  const scene=createStandingTearScene({checkpoint,returnPose:pose,runId:'night-7',renderer,audio,
    getLook:()=>look,isHidden:()=>hidden,isPaused:()=>hostPaused,inputActive:()=>active,
    paintCover:alpha=>calls.covers.push(alpha),onCheckpoint:(state,reason)=>calls.checkpoints.push({state,reason}),onTrace:v=>calls.traces.push(v),
    onError:e=>calls.errors.push(e),onRestore:value=>{calls.restores.push(value);return onRestore(value);},onDone:value=>{calls.done.push(value);return onDone(value);}});
  return{scene,calls,setHidden:v=>{hidden=v;},setPaused:v=>{hostPaused=v;},setActive:v=>{active=v;},setLook:v=>{look=v;}};
}
function endingCheckpoint(){const value=freshStandingTear({runId:'night-7',returnPose:pose});return{...value,phase:'ending',elapsed:30,completed:true,released:true,architectureRunning:true,returnReceipt:{id:'night-7:standing-tear:return',complete:true},pose:{x:9,z:8,feet:0,yaw:0,pitch:0}};}

test('preparation retains the threshold raster without a loading flash or carried movement or action',async()=>{
  const gate=deferred(),h=fixture({initialization:gate});const pending=h.scene.initialize();h.scene.enter();h.scene.key({key:'w'});h.scene.key({key:'e'});advance(h.scene,1);h.scene.render();
  assert.equal(h.calls.init,0);await flush();assert.equal(h.calls.init,1);assert.deepEqual(h.calls.covers,[]);assert.equal(h.calls.drawn.length,0);assert.equal(h.scene.worldPresentation,'hidden');assert.equal(h.scene.view().state.elapsed,0);
  gate.resolve(true);assert.equal(await pending,true);h.scene.key({key:'w',repeat:true});advance(h.scene,.2);assert.equal(h.scene.view().state.distance,0);
  h.scene.key({key:'w'});advance(h.scene,.2);assert.ok(h.scene.view().state.distance>.4);h.scene.exit();
});

test('ordinary host look controls the borrowed camera and freezes only for the authored cut',async()=>{
  const h=fixture();await h.scene.initialize();assert.equal(h.scene.allowsLook,true);h.setLook({yaw:1.2,pitch:-.4});h.scene.update(.05);
  assert.equal(h.scene.view().frame.camera.yaw,1.2);assert.equal(h.scene.view().frame.camera.pitch,-.4);
  h.scene.withdraw();const before=h.scene.view().state.pose;assert.equal(h.scene.allowsLook,false);h.setLook({yaw:0,pitch:1});h.scene.update(.05);assert.deepEqual(h.scene.view().state.pose,before);h.scene.exit();
});

test('pause, hidden presentation and blur freeze time and require fresh movement on return',async()=>{
  for(const kind of['pause','hidden','blur','host-pause','inactive']){
    const h=fixture();await h.scene.initialize();h.scene.key({key:'w'});advance(h.scene,.2);
    if(kind==='pause')h.scene.pause();if(kind==='hidden')h.setHidden(true);if(kind==='blur')h.scene.blur();if(kind==='host-pause')h.setPaused(true);if(kind==='inactive')h.setActive(false);
    h.scene.render();const before=h.scene.serialize();advance(h.scene,4);h.scene.key({key:'d'});assert.deepEqual(h.scene.serialize(),before,kind);
    if(kind==='pause')h.scene.resume();if(kind==='hidden')h.setHidden(false);if(kind==='blur')h.scene.focus();if(kind==='host-pause')h.setPaused(false);if(kind==='inactive')h.setActive(true);
    h.scene.render();h.scene.key({key:'w',repeat:true});advance(h.scene,.2);assert.equal(h.scene.view().state.distance,before.distance,kind);
    h.scene.key({key:'w'});advance(h.scene,.2);assert.ok(h.scene.view().state.distance>before.distance,kind);h.scene.exit();
  }
});

test('the completed confinement cut waits under full black for actual building readiness',async()=>{
  const gate=deferred(),h=fixture({checkpoint:endingCheckpoint(),onRestore:()=>gate.promise});await h.scene.initialize();
  h.scene.key({key:'e'});assert.equal(h.scene.view().state.completed,true);assert.equal(h.scene.allowsLook,false);advance(h.scene,.85);assert.equal(h.calls.restores.length,0);
  advance(h.scene,.05);h.scene.render();await flush();assert.equal(h.calls.restores.length,1);assert.equal(h.calls.disposed,1);assert.equal(h.scene.worldPresentation,'visible');assert.equal(h.calls.covers.at(-1),1);
  advance(h.scene,3);h.scene.render();assert.equal(h.scene.view().state.endingSeconds,1.15);assert.equal(h.calls.done.length,0);assert.equal(h.calls.covers.at(-1),1);
  assert.deepEqual(h.calls.restores[0].returnPose,pose);gate.resolve(true);await flush();advance(h.scene,.85);h.scene.render();assert.equal(h.calls.done.length,0);assert.ok(h.scene.view().frame.fade<.01);
  advance(h.scene,.3);assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].completed,true);assert.equal(h.calls.done[0].restored,true);assert.deepEqual(h.calls.done[0].returnPose,pose);
  h.scene.key({key:'w'});advance(h.scene,1);assert.equal(h.calls.restores.length,1);assert.equal(h.calls.done.length,1);h.scene.exit();assert.equal(h.calls.disposed,1);assert.equal(h.calls.destroyed,1);
});

test('early withdrawal uses the same covered handback without granting completion or touching original pose',async()=>{
  const h=fixture();await h.scene.initialize();const original=JSON.stringify(pose);assert.equal(h.scene.withdraw(),true);assert.equal(h.scene.withdraw(),false);advance(h.scene,1);await flush();advance(h.scene,1.4);
  assert.equal(h.calls.restores.length,1);assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].completed,false);assert.equal(h.calls.done[0].receipt.complete,false);assert.equal(JSON.stringify(pose),original);h.scene.exit();
});

test('Escape remains the run-level pause command and does not withdraw or advance the encounter',async()=>{
  const h=fixture();await h.scene.initialize();assert.equal(h.scene.handlesEscape,false);assert.equal(h.scene.key({key:'Escape'}),false);assert.equal(h.scene.view().state.phase,'arrival');assert.equal(h.calls.restores.length,0);h.scene.exit();
});

test('a reloaded return reacquires building readiness under black without constructing Source again',async()=>{
  const value=endingCheckpoint();Object.assign(value,{phase:'ending',restoreIssued:true,endingSeconds:1.7,completed:true,returnReceipt:{id:'night-7:standing-tear:return',complete:true}});
  const gate=deferred(),h=fixture({checkpoint:value,onRestore:()=>gate.promise});await h.scene.initialize();h.scene.render();await flush();assert.equal(h.calls.init,0);assert.equal(h.calls.disposed,1);assert.equal(h.calls.restores.length,1);assert.equal(h.calls.covers.at(-1),1);
  gate.resolve(true);await flush();advance(h.scene,1.5);assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].completed,true);h.scene.exit();
});

test('renderer preparation and presentation failures lead to the covered recovery path once',async()=>{
  for(const preparation of[true,false]){
    const gate=deferred(),h=fixture(preparation?{initialization:gate}:{renderResult:false});const pending=h.scene.initialize();
    if(preparation){await flush();gate.reject(Error('asset unavailable'));await pending;}else{await pending;h.scene.render();h.scene.render();}
    assert.equal(h.calls.errors.length,1);assert.equal(h.scene.view().state.phase,'ending');advance(h.scene,1);await flush();advance(h.scene,1.4);assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].completed,false);h.scene.exit();
  }
});

test('a failed world restoration reports the fault and hands fallback ownership back instead of stranding the scene',async()=>{
  const h=fixture({onRestore:()=>Promise.reject(Error('building frame unavailable'))});await h.scene.initialize();h.scene.withdraw();advance(h.scene,1);await flush();assert.equal(h.calls.errors.length,1);assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].restored,false);assert.match(h.calls.done[0].error,/building frame/);h.scene.exit();
});

test('retiring the scene inside onDone cannot send more audio or overwrite the cleared host checkpoint',async()=>{
  let h;h=fixture({onDone:()=>h.scene.exit()});await h.scene.initialize();h.scene.withdraw();advance(h.scene,1);await flush();advance(h.scene,1.4);
  assert.equal(h.calls.destroyed,1);assert.equal(h.calls.audio.some(c=>c.afterDestroy),false);assert.equal(h.calls.checkpoints.at(-1).reason.reason,'return-ready');
});

test('late preparation cannot resurrect a disposed scene or notify its retired host',async()=>{
  for(const rejection of[false,true]){
    const gate=deferred(),h=fixture({initialization:gate});const pending=h.scene.initialize();await flush();h.scene.exit();if(rejection)gate.reject(Error('late failure'));else gate.resolve(true);
    assert.equal(await pending,false);assert.equal(h.calls.restores.length,0);assert.equal(h.calls.done.length,0);assert.equal(h.calls.errors.length,0);assert.equal(h.calls.disposed,1);assert.equal(h.calls.destroyed,1);
  }
});

test('retiring the owner before the restoration microtask cannot restore an old body into a new run or title',async()=>{
  const h=fixture();await h.scene.initialize();h.scene.withdraw();advance(h.scene,.9);assert.equal(h.scene.view().restoring,true);h.scene.exit();await flush();
  assert.equal(h.calls.restores.length,0);assert.equal(h.calls.done.length,0);assert.equal(h.calls.errors.length,0);assert.equal(h.calls.disposed,1);assert.equal(h.calls.destroyed,1);
});

test('withdrawal while assets prepare cannot be undone by the late acquisition promise',async()=>{
  const gate=deferred(),h=fixture({initialization:gate});const pending=h.scene.initialize();await flush();h.scene.withdraw();advance(h.scene,1);await flush();
  assert.equal(h.calls.restores.length,1);assert.equal(h.calls.disposed,1);gate.resolve(true);assert.equal(await pending,false);assert.equal(h.scene.view().ready,false);
  advance(h.scene,.7);h.scene.render();assert.ok(h.calls.covers.at(-1)>0&&h.calls.covers.at(-1)<1,'the prepared building can reveal even if Source never acquired');
  advance(h.scene,.7);assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].completed,false);assert.equal(h.calls.disposed,1);h.scene.exit();
});

test('a late preparation failure still withdraws through opaque restoration after preserving the threshold image',async()=>{
  const gate=deferred(),world=deferred(),h=fixture({initialization:gate,onRestore:()=>world.promise});const pending=h.scene.initialize();await flush();advance(h.scene,3);h.scene.render();
  assert.equal(h.calls.drawn.length,0);assert.equal(h.calls.covers.length,0);
  gate.reject(Error('late asset failure'));assert.equal(await pending,false);h.scene.render();assert.equal(h.calls.covers.at(-1),1);
  advance(h.scene,1);await flush();h.scene.render();assert.equal(h.calls.restores.length,1);assert.equal(h.calls.covers.at(-1),1);assert.equal(h.calls.done.length,0);
  world.resolve(true);await flush();advance(h.scene,1.4);assert.equal(h.calls.done.length,1);assert.equal(h.calls.done[0].completed,false);assert.equal(h.calls.done[0].restored,true);h.scene.exit();
});

test('trace contains actual camera and action timings while gameplay has no text payload',async()=>{
  const h=fixture();await h.scene.initialize();h.scene.key({key:'w'});advance(h.scene,.5);h.scene.render();const view=h.scene.view();
  assert.deepEqual(view.frame.gameplayHud,[]);assert.equal(view.frame.caption,null);assert.ok(h.scene.trace().some(t=>t.type==='pose'&&Number.isFinite(t.pose.yaw)));assert.equal(h.scene.trace().some(t=>t.type==='event'&&t.event.type==='move'),false);assert.deepEqual(view.renderedFrame.camera,view.frame.camera);h.scene.exit();
});
