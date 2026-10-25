import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeSourceReturnFlashbackScene} from '../src/game/source-return-flashback-scene.js';
import {createSourceReturnFlashback} from '../src/game/source-return-flashback.js';
const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
const returnPose={x:133.1875,y:89.3625,yaw:1.2375,pitch:-.1675,facing:1.25,floorH:0,eyeHeight:1.62};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function fixture(extra={}){
 const events=[],covers=[],saves=[],restores=[],done=[],errors=[];let externalHeld=false,renderSuccess=true;
 const renderer={initializeCalls:0,disposeCalls:0,frames:[],async initialize(){this.initializeCalls++;events.push('renderer.initialize');return true;},render(frame){this.frames.push(structuredClone(frame));events.push('renderer.render');return renderSuccess;},last(){return{driveState:{programTime:this.frames.at(-1)?.timeSec},weather:{rain:.2},evolution:{stage:'return'}};},dispose(){this.disposeCalls++;events.push('renderer.dispose');},diagnostics(){return{frames:this.frames.length};}};
 const audio={initializeCalls:0,disposeCalls:0,pauses:[],syncs:[],async initialize(){this.initializeCalls++;events.push('audio.initialize');return true;},setPaused(value){this.pauses.push(value);},sync(...args){this.syncs.push(args);},dispose(){this.disposeCalls++;events.push('audio.dispose');}};
 let scene;const opts={destination:'chapel',returnPose,context:{},destinationAudio:{},fetcher:async()=>({ok:true,json:async()=>metrics}),isHeld:()=>externalHeld,
  createRenderer:()=>{events.push('renderer.create');return renderer;},createAudio:()=>{events.push('audio.create');return audio;},
  paintCover:value=>{covers.push(value);events.push('cover:'+value);},onCheckpoint:value=>saves.push(structuredClone(value)),
  onRestore:value=>{restores.push({...structuredClone(value),paintedCover:covers.at(-1)});events.push('restore');},onDone:value=>{done.push(structuredClone(value));events.push('done');},onError:value=>errors.push(String(value?.message||value)),...extra};
 scene=makeSourceReturnFlashbackScene(opts);return{scene,renderer,audio,events,covers,saves,restores,done,errors,setHeld:value=>{externalHeld=value;},setRender:value=>{renderSuccess=value;}};
}
async function preview(f){for(let i=0;i<61&&f.scene.diagnostics().preview<3;i++){f.scene.update(.05);f.scene.render();}await flush();f.scene.render();}

test('the actual destination remains visible for2seconds then fades for1second before renderer borrowing and automatic driving',async()=>{
 const f=fixture();await f.scene.initialize();assert.equal(f.renderer.initializeCalls,0);assert.equal(f.scene.worldPresentation,'visible');
 for(let i=0;i<39;i++){f.scene.update(.05);f.scene.render();}assert.ok(f.scene.diagnostics().preview<2);assert.equal(f.covers.at(-1),0);assert.equal(f.renderer.initializeCalls,0);
 for(let i=0;i<10;i++){f.scene.update(.05);f.scene.render();}assert.ok(f.covers.at(-1)>0&&f.covers.at(-1)<1);assert.equal(f.renderer.initializeCalls,0);
 await preview(f);assert.equal(f.scene.worldPresentation,'hidden');assert.equal(f.renderer.initializeCalls,1);assert.equal(f.audio.initializeCalls,1);assert.equal(f.renderer.frames.at(-1).timeSec,0);assert.equal(f.covers.at(-1),1);
 f.scene.update(.1);f.scene.render();assert.equal(f.scene.serialize().elapsed,.1,'no Enter or begin command is required');assert.equal(f.audio.pauses.at(-1),false);f.scene.exit();
});

test('a saved active sequence prepares automatically, preserving elapsed time and the exact previously captured entrance',async()=>{
 const checkpoint=createSourceReturnFlashback({destination:'tower',metrics,returnPose});checkpoint.elapsed=19.375;
 const f=fixture({destination:'tower',checkpoint,returnPose:{...returnPose,x:0}});await f.scene.initialize();await flush();f.scene.update(.05);await flush();f.scene.render();await flush();f.scene.render();
 assert.equal(f.scene.diagnostics().ready,true,'resuming past preview must still prepare the renderer');assert.equal(f.renderer.initializeCalls,1);assert.equal(f.scene.serialize().elapsed,19.375);assert.deepEqual(f.scene.serialize().returnPose,returnPose);assert.equal(f.renderer.frames.at(-1).timeSec,19.375);f.scene.update(.125);assert.equal(f.scene.serialize().elapsed,19.5);f.scene.exit();
});

test('pause, blur, external holds and missing renders freeze the clock and mute without clearing independent holds',async()=>{
 const f=fixture();await f.scene.initialize();await preview(f);f.scene.update(.1);const at=f.scene.serialize().elapsed;
 f.scene.pause();f.scene.blur();f.scene.focus();f.scene.render();f.scene.update(.1);assert.equal(f.scene.serialize().elapsed,at,'focus cannot dismiss a still-active pause');assert.equal(f.audio.pauses.at(-1),true);
 f.scene.resume();f.scene.blur();f.scene.pause();f.scene.resume();f.scene.render();f.scene.update(.1);assert.equal(f.scene.serialize().elapsed,at,'resume cannot dismiss a still-active blur');f.scene.focus();
 f.setHeld(true);f.scene.update(.1);f.scene.render();assert.equal(f.scene.serialize().elapsed,at);assert.equal(f.audio.pauses.at(-1),true);f.setHeld(false);
 f.setRender(false);f.scene.render();f.scene.update(.1);assert.equal(f.scene.serialize().elapsed,at);assert.equal(f.audio.pauses.at(-1),true);assert.equal(f.covers.at(-1),1);
 f.setRender(true);f.scene.render();f.scene.update(.1);assert.equal(f.scene.serialize().elapsed,at+.1);f.scene.exit();
});

test('normal completion waits for a successful covered final picture then restores once and reveals the exact real exit',async()=>{
 const f=fixture();await f.scene.initialize();await preview(f);for(let i=0;i<219;i++){f.scene.update(.25);f.scene.render();}assert.equal(f.scene.serialize().elapsed,54.75);assert.equal(f.restores.length,0);assert.ok(f.covers.at(-1)<1);
 f.scene.update(.25);assert.equal(f.restores.length,0,'unpresented final time cannot release the renderer');f.setRender(false);f.scene.render();f.scene.update(.05);assert.equal(f.restores.length,0,'a missing final picture also cannot hand off');f.setRender(true);f.scene.render();assert.equal(f.covers.at(-1),1);f.scene.update(.05);
 assert.equal(f.restores.length,1);assert.equal(f.restores[0].paintedCover,1,'the live destination is restored only under full cover');assert.deepEqual(f.restores[0].returnPose,returnPose);assert.equal(f.restores[0].destination,'chapel');assert.equal(f.done.length,0,'the actual arrival still has to reveal');assert.equal(f.scene.worldPresentation,'visible');assert.equal(f.renderer.disposeCalls,1);assert.equal(f.audio.disposeCalls,1);
 f.scene.render();assert.equal(f.covers.at(-1),1);for(let i=0;i<10;i++){f.scene.update(.05);f.scene.render();}assert.ok(f.covers.at(-1)>0&&f.covers.at(-1)<1);for(let i=0;i<10;i++){f.scene.update(.05);f.scene.render();}assert.equal(f.done.length,1);
 f.scene.update(.25);f.scene.render();f.scene.exit();f.scene.exit();assert.equal(f.restores.length,1);assert.equal(f.done.length,1);assert.equal(f.renderer.disposeCalls,1);assert.equal(f.audio.disposeCalls,1);
});

test('a failed renderer acquisition cannot leave an indefinitely black active scene',async()=>{
 const f=fixture();f.renderer.initialize=async()=>false;await f.scene.initialize();await preview(f);assert.equal(f.restores.length,1);assert.equal(f.done.length,1);assert.equal(f.restores[0].paintedCover,1);assert.equal(f.audio.initializeCalls,0);assert.equal(f.renderer.disposeCalls,1);assert.ok(f.errors.some(x=>/render|picture|prepar|view/i.test(x)));f.scene.exit();assert.equal(f.restores.length,1);
});

test('exit during renderer initialization disposes once and cannot start audio or install a late active scene',async()=>{
 const gate=deferred(),f=fixture();f.renderer.initialize=()=>{f.renderer.initializeCalls++;return gate.promise;};await f.scene.initialize();await preview(f);assert.equal(f.renderer.initializeCalls,1);f.scene.exit();gate.resolve(true);await flush();assert.equal(f.renderer.disposeCalls,1);assert.equal(f.audio.initializeCalls,0);assert.equal(f.restores.length,1);assert.equal(f.scene.diagnostics().ready,false);f.scene.update(.25);f.scene.render();assert.equal(f.renderer.frames.length,0);
});

test('exit during audio initialization disposes each borrowed owner exactly once',async()=>{
 const gate=deferred(),f=fixture();f.audio.initialize=()=>{f.audio.initializeCalls++;return gate.promise;};await f.scene.initialize();await preview(f);assert.equal(f.audio.initializeCalls,1);f.scene.exit();gate.resolve(true);await flush();assert.equal(f.audio.disposeCalls,1);assert.equal(f.renderer.disposeCalls,1);assert.equal(f.restores.length,1);assert.equal(f.scene.diagnostics().ready,false);
});

test('an interrupted preview stays put and assets that resolve after exit cannot borrow the renderer',async()=>{
 const gate=deferred(),f=fixture({fetcher:()=>gate.promise});const loading=f.scene.initialize();f.setHeld(true);for(let i=0;i<100;i++)f.scene.update(.05);assert.equal(f.scene.diagnostics().preview,0);f.scene.exit();gate.resolve({ok:true,json:async()=>metrics});await loading;await flush();assert.equal(f.renderer.initializeCalls,0);assert.equal(f.audio.initializeCalls,0);assert.equal(f.restores.length,1);assert.deepEqual(f.restores[0].returnPose,returnPose);
});

test('a metrics body that finishes decoding after exit cannot write a late active checkpoint',async()=>{
 const gate=deferred(),f=fixture({fetcher:async()=>({ok:true,json:()=>gate.promise})});const loading=f.scene.initialize();await flush();f.scene.exit();const saved=f.saves.length;gate.resolve(metrics);await loading;await flush();assert.equal(f.saves.length,saved);assert.equal(f.renderer.initializeCalls,0);assert.equal(f.audio.initializeCalls,0);assert.equal(f.restores.length,1);
});

test('the browser default fetch keeps its Window receiver when the audio owner requests assets',async()=>{
 const original=globalThis.fetch,requests=[];let passed;
 globalThis.fetch=async function(url){assert.equal(this,globalThis,'Safari Window.fetch requires its original receiver');requests.push(url);return{ok:true,json:async()=>metrics};};
 let f;try{
  f=fixture({fetcher:undefined,createAudio:options=>{passed=options.fetcher;return f.audio;}});
  f.audio.initialize=async()=>{await passed('assets/audio/source-drive/programmes.json');return true;};
  await f.scene.initialize();await preview(f);assert.equal(f.scene.diagnostics().ready,true);assert.equal(f.errors.length,0);assert.equal(requests.length,2);
 }finally{f?.scene.exit();globalThis.fetch=original;}
});
