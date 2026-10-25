import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as scenes from '../src/game/scenes.js';
import {makeSourceReturnFlashbackScene} from '../src/game/source-return-flashback-scene.js';
import {createSourceReturnFlashback,normalizeSourceReturnFlashbackCheckpoint} from '../src/game/source-return-flashback.js';
import {freshSave,withTransientGameState,saveCommit,getSave,normalizeSourceReturnFlashbackPending} from '../src/game/save.js';
import {CHAPEL_OUTER_CHECKPOINT} from '../src/data/bell-tower-layout.js';
import {GOD_LOCATION_HOOKS} from '../src/data/god-hooks.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
const copy=value=>JSON.parse(JSON.stringify(value));
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function block(from,to){const a=main.indexOf(from),b=main.indexOf(to,a);assert.ok(a>=0&&b>a,from);return main.slice(a,b);}
function production(name){const a=main.indexOf(`function ${name}(`),b=main.indexOf('\n}',a);assert.ok(a>=0&&b>a,name);return main.slice(a,b+2);}
test.afterEach(()=>scenes.clear());

function harness(saved=null,{metricsGate=null}={}){
 scenes.clear();const calls=[],speech=[],commits=[],covers=[];
 let look={yaw:.25,pitch:-.12},facing=0,focused=true,domFocused=true,hidden=false,renderOK=true,renderCount=0,audioDisposed=0,rendererDisposed=0;
 const data=saved?copy(saved):{...freshSave(),area:'source-space',playSeconds:41,chapelTower:{phase:'ready'},chunkSurf:{phase:'completed'}};
 const env={scenes,normalizeSourceReturnFlashbackCheckpoint,normalizeSourceReturnFlashbackPending,px:10,py:20,paused:false,saveAcc:0,
  renderMove:null,motionRig:null,trail:[],chuteRide:null,r3dCache:{},actx:{state:'running'},sfxGain:{},master:{},
  getSave:()=>data,saveCommit:patch=>{commits.push(copy(patch));Object.assign(data,copy(patch));return data;},rememberChapelTapeDemandDeparture(){},
  usingSourceSpace:()=>false,gameplayInputLifecycleActive:()=>focused&&!hidden,document:{get hidden(){return hidden;},hasFocus:()=>domFocused},
  R3:new Proxy({r3dLookAngles:()=>({...look}),r3dFacing:()=>facing,r3dSetFacing:v=>{facing=v;look.yaw=v*Math.PI/2;},
   r3dSetLookAngles:v=>{look={yaw:v.yaw,pitch:v.pitch};}}, {get:(target,key)=>target[key]||(()=>{})}),
  REC:{isRecording:()=>false,isListening:()=>false},PB:{stopPlayback:()=>calls.push('playback-stop')},STORY:{stopAll:()=>calls.push('story-stop')},
  SPEECH:{clearSpeech:()=>calls.push('speech-clear'),say:value=>speech.push(copy(value)),sayAll:(value,options)=>speech.push({value:copy(value),options:copy(options)})},
  towerBellDirector:{suspend:()=>calls.push('tower-suspend'),resume:()=>calls.push('tower-resume')},
  bellPealPerformance:{suspend:()=>calls.push('peal-suspend'),resume:()=>calls.push('peal-resume')},RT:{setBed(){}},
  ensureCtx(){},stopTake(){},resetMotionInput:()=>calls.push('motion-clear'),stopAllVoices(){},stopWorldLayerVoice(){},silenceSampleField(){},silenceAmbientDrone(){},
  godSyncBuildingRender:()=>calls.push('building-sync'),syncDoorDynamicProps(){},updateAudio:()=>calls.push('world-audio-resume'),ensureInteractionFocus(){},
  shakeMode:()=> 'full',uiSize:()=>({rows:30,cols:80}),uiFill:(...args)=>covers.push(args),openPauseMenu:()=>{env.paused=true;},pushEvent(){},console,
  BINDINGS:{inputPrompt:()=> 'QUIET'},VIGIL_LINKED_CHAPELS_FLAG:'linked',flagTest:()=>false,vigilBelfryRecognition:()=>[],
  GOD_LOCATION_HOOKS,godHookPoint:()=>({x:512,y:714}),applySourceDoorCarry(){},CHAPEL_OUTER_CHECKPOINT,
  ensureTowerBellDirector:()=>({setTransitionProgress(){},snapshot:()=>null}),
  commitChapelTower:()=>{calls.push('route-commit');return{phase:'cleared'};},chapelTowerState:()=>({phase:'ready'}),CHAPEL_TOWER_PHASE:{TRANSITION_READY:'ready'},
  reduceChunkSurf:s=>s,normalizeChunkSurfState:s=>s,reduceChapelTower:s=>s,
  stopSourceCorridorRain(){},clearSourceRuntime:()=>calls.push('source-clear'),PRES:{despawn(){}},
  chapelDoorArrival:()=>({x:185,y:127,facing:2}),CUES:{CUE:{door:'door'},playCue(){}},
 };
 env.makeSourceReturnFlashbackScene=options=>{
  calls.push('flashback-created');
  return makeSourceReturnFlashbackScene({...options,fetcher:async()=>{if(metricsGate)await metricsGate;return{ok:true,json:async()=>metrics};},
   createRenderer:()=>({initialize:async()=>true,render:()=>{renderCount++;look={yaw:-2.4,pitch:.7};return renderOK;},last:()=>null,dispose:()=>{rendererDisposed++;}}),
   createAudio:()=>({initialize:async()=>{},setPaused(){},dispose:()=>{audioDisposed++;}})});
 };
 vm.createContext(env);
 vm.runInContext(block('let sourceReturnFlashbackScene=null;','function beginSourceTowerTransition('),env);
 for(const name of['beginSourceTowerTransition','beginChapelFromHorizon','saveTick'])vm.runInContext(production(name),env);
 const api=vm.runInContext('({begin:beginSourceReturnFlashback,resume:resumeSourceReturnFlashbackFromSave,active:()=>sourceReturnFlashbackScene})',env);
 async function advance(seconds){for(let left=seconds;left>1e-8;left-=.05){scenes.update(Math.min(.05,left));scenes.render();await flush();}}
 return{env,data,calls,speech,commits,covers,api,advance,look:()=>({...look}),renderCount:()=>renderCount,disposed:()=>({audioDisposed,rendererDisposed}),
  focus:v=>{focused=v;},domFocus:v=>{domFocused=v;},hidden:v=>{hidden=v;},renderOK:v=>{renderOK=v;}};
}

for(const route of['chapel','tower'])test(`the existing ${route} arrival commits once, previews its actual destination and defers speech until automatic return`,async()=>{
 const h=harness();const started=route==='tower'?h.env.beginSourceTowerTransition():h.env.beginChapelFromHorizon();
 assert.equal(started,true);assert.equal(h.calls.filter(c=>c==='route-commit').length,1);assert.deepEqual(h.speech,[]);
 assert.ok(h.calls.indexOf('building-sync')<h.calls.indexOf('flashback-created'),'the existing room is acquired before the preview');
 await flush();const origin=copy(h.data.sourceReturnFlashback.returnPose);
 assert.deepEqual([origin.x,origin.y],route==='tower'?[512,714]:[185,127]);
 await h.advance(1.9);assert.equal(scenes.worldPresentation(),'visible');assert.equal(h.renderCount(),0);assert.ok(h.covers.every(args=>!args[4]||args[4]==='rgba(0,0,0,0)'));
 await h.advance(1.3);assert.equal(scenes.worldPresentation(),'hidden');assert.ok(h.renderCount()>0);assert.deepEqual(h.speech,[]);
 await h.advance(56);assert.equal(h.api.active(),null);assert.equal(h.data.sourceReturnFlashback,null);assert.equal(scenes.depth(),0);
 assert.equal(h.speech.length,1);assert.equal(h.calls.filter(c=>c==='route-commit').length,1);
 assert.deepEqual([h.env.px,h.env.py],[origin.x,origin.y]);assert.deepEqual(h.look(),{yaw:origin.yaw,pitch:origin.pitch});
 assert.equal(h.calls.filter(c=>c==='tower-resume').length,1);assert.deepEqual(h.disposed(),{audioDisposed:1,rendererDisposed:1});
});

test('autosave retains the real destination camera and body while the car borrows the renderer',async()=>{
 const h=harness();h.api.begin('chapel');await flush();await h.advance(8);const cp=copy(h.api.active().serialize());
 assert.notDeepEqual(h.look(),{yaw:cp.returnPose.yaw,pitch:cp.returnPose.pitch});h.env.saveTick(4);
 assert.deepEqual(h.data.view,{yaw:cp.returnPose.yaw,pitch:cp.returnPose.pitch});assert.deepEqual([h.data.px,h.data.py],[cp.returnPose.x,cp.returnPose.y]);
 assert.equal(h.data.sourceReturnFlashback.elapsed,cp.elapsed);assert.equal(h.data.area,'conservatory');assert.deepEqual(h.speech,[]);
});

for(const route of['chapel','tower'])test(`a saved ${route} flashback resumes the same checkpoint without replaying route commitment or arrival prose`,async()=>{
 const cp=createSourceReturnFlashback({destination:route,metrics,returnPose:{x:201,y:301,yaw:.5,pitch:-.1,facing:0}});cp.elapsed=22;
 const h=harness({...freshSave(),area:'conservatory',sourceReturnFlashback:cp});assert.equal(h.api.resume(),true);await flush();
 assert.equal(h.api.active().serialize().elapsed,22);assert.deepEqual(h.speech,[]);assert.equal(h.calls.filter(c=>c==='route-commit').length,0);
 await h.advance(1);assert.ok(h.api.active().serialize().elapsed>22);assert.equal(h.api.active().serialize().destination,route);
 h.focus(false);await h.advance(1);const frozen=h.api.active().serialize().elapsed;await h.advance(2);assert.equal(h.api.active().serialize().elapsed,frozen);
 h.focus(true);await h.advance(.2);assert.ok(h.api.active().serialize().elapsed>frozen);
});

test('an explicit warp clears the presentation owner and checkpoint without inventing arrival dialogue',async()=>{
 const h=harness();h.api.begin('tower');await flush();await h.advance(4);scenes.clear();
 assert.equal(h.api.active(),null);assert.equal(h.data.sourceReturnFlashback,null);assert.deepEqual(h.speech,[]);assert.deepEqual(h.disposed(),{audioDisposed:1,rendererDisposed:1});
});

test('closing before metrics load retains a synchronous destination intent and reload reconstructs it without another route commitment',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),h=harness(null,{metricsGate:gate});h.api.begin('chapel');
 assert.equal(h.data.sourceReturnFlashback,null);assert.equal(h.data.sourceReturnFlashbackPending.destination,'chapel');
 const saved=copy(h.data),pose=copy(saved.sourceReturnFlashbackPending.returnPose);scenes.clear();release();await flush();
 const restored=harness(saved);assert.equal(restored.api.resume(),true);await flush();
 assert.deepEqual(copy(restored.api.active().serialize().returnPose),pose);assert.equal(restored.data.sourceReturnFlashbackPending,null);
 assert.equal(restored.calls.filter(c=>c==='route-commit').length,0);assert.deepEqual(restored.speech,[]);
});

test('confirmed gameplay lifecycle focus can resume despite delayed DOM focus while hidden or unfocused windows still hold',async()=>{
 const h=harness();h.domFocus(false);h.api.begin('tower');await flush();await h.advance(4);
 const before=h.api.active().serialize().elapsed;await h.advance(.5);assert.ok(h.api.active().serialize().elapsed>before);
 h.hidden(true);const held=h.api.active().serialize().elapsed;await h.advance(.5);assert.equal(h.api.active().serialize().elapsed,held);
});

test('the real save normalizer retains valid return checkpoints and retires malformed data without changing route or tape state',async()=>{
 assert.equal(freshSave().sourceReturnFlashback,null);
 assert.equal(freshSave().sourceReturnFlashbackPending,null);
 const checkpoint=createSourceReturnFlashback({destination:'tower',metrics,returnPose:{x:2,y:3,yaw:0,pitch:0,facing:0}});checkpoint.elapsed=20;
 await withTransientGameState({save:freshSave()},async()=>{
  const prior=copy(getSave());saveCommit({sourceReturnFlashback:checkpoint});assert.deepEqual(getSave().sourceReturnFlashback,checkpoint);
  assert.deepEqual(getSave().takes,prior.takes);assert.deepEqual(getSave().chunkSurf,prior.chunkSurf);assert.deepEqual(getSave().chapelTower,prior.chapelTower);
  saveCommit({sourceReturnFlashback:{...checkpoint,returnPose:{x:NaN,y:0}}});assert.equal(getSave().sourceReturnFlashback,null);
  saveCommit({sourceReturnFlashback:{...checkpoint,returnPose:null}});assert.equal(getSave().sourceReturnFlashback,null,'a review-only state without its physical return cannot become a durable route owner');
  const pending={version:1,destination:'tower',returnPose:checkpoint.returnPose};saveCommit({sourceReturnFlashbackPending:pending});assert.deepEqual(getSave().sourceReturnFlashbackPending,pending);
  saveCommit({sourceReturnFlashback:checkpoint});assert.equal(getSave().sourceReturnFlashbackPending,null,'a loaded checkpoint replaces its preparation intent');
 });
});
