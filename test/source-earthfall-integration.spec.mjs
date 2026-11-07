import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
import {normalizeChunkSurfState} from '../src/game/chunk-surf-state.js';
import {freshSourceEarthfall,normalizeSourceEarthfall} from '../src/game/source-earthfall.js';
import {SOURCE_EARTHFALL as C} from '../src/data/source-earthfall.js';
import {sourceEarthfallNeeded} from '../src/game/source-earthfall-entry.js';
import {createSourceEarthfallScene} from '../src/game/source-earthfall-scene.js';
import {freshSourceEarthfallElleryAside,normalizeSourceEarthfallElleryAside,stepSourceEarthfallElleryAside} from '../src/game/source-earthfall-ellery-aside.js';
import {continuationFromEarthfall,sourceContinuationEntranceOffset} from '../src/game/source-continuation-entry.js';
import {releaseSourceRecordingCassetteLabels} from '../src/render/source-recording-cassette.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const initial=()=>buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL,{seed:4417}).state;
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){
 const start=main.indexOf(`function ${name}(`),asyncStart=main.lastIndexOf('async ',start);
 assert.ok(start>=0,name);const from=asyncStart===start-6?asyncStart:start;
 // Vite substitutes this build-time flag before the main function executes.
 // A Script VM has no import.meta; exercise the ordinary runtime branch.
 return main.slice(from,main.indexOf('\n}\n',start)+3).replaceAll('import.meta.env.DEV','false');
}
function host(){
 const runtime=createSourceSpaceRuntime({initialState:initial()});
 const entry=runtime.sourceContinuationEntry('forward',{runId:'earthfall-test'});
 const snapshots=[],rendered=[],trace=[],audio={updates:[],stops:0,stop(){this.stops++;},update(...args){this.updates.push(args);}};
 let data={run:{id:'earthfall-test'},settings:{},chunkSurf:runtime.state()},returned=0,continued=0,disposals=0,disposed=false;
 const h={createFakeElleryHost:()=>({noise:()=>false,protectedNow:()=>false,contact:()=>false,cancel(){}}),chunkSurfRuntime:runtime,sourceContinuationScene:null,sourceContinuationRenderer:null,
  sourceContinuationAudio:null,sourceEarthfallAudio:null,sourceContinuationTrace:trace,
  sourceDriveSession:null,sourcePubScene:null,hushRunActive:false,paused:false,
  REC:{isRecording:()=>false,isListening:()=>false,saveRecState:()=>copy(data.rec||{}),lightOn:()=>true,batteryLevel:()=>1,drainLight:()=>false,toggleLight:()=>false},PB:{isPlaying:()=>false},
  sourcePresentationTorch:()=>({on:true,look:{power:.5,reach:.5}}),flagTest:()=>false,itemLost:()=>false,CUES:{CUE:{light:'light'},playCue(){}},
  document:{hidden:false,hasFocus:()=>true},performance,r3dCache:{},px:0,py:0,renderMove:null,motionRig:null,trail:[],
  freshSourceEarthfall,normalizeSourceEarthfall,sourceEarthfallNeeded,createSourceEarthfallScene,continuationFromEarthfall,
  createSourceEarthfallRenderer:()=>({initialize:async()=>true,ready:()=>true,
    render:s=>{rendered.push(copy(s));return true;},dispose:()=>{if(disposed)return false;disposed=true;disposals++;return true;}}),
  createSourceEarthfallAudio:()=>audio,
  scenes:{push:s=>s.enter(),remove:s=>s.exit()},
  ensureCtx(){},actx:{},sfxGain:{},getSave:()=>data,
  saveCommit:patch=>{data={...data,...patch};snapshots.push(copy(patch));},
  pubRoomAudio:null,pubPressureAudio:null,windowChoreography:null,towerBellDirector:null,bellPealPerformance:null,
  frontEndSession:null,frontEndPlateOverride:null,
  playSceneFootContact(){},clearSceneFootContacts(){},
  RT:{setBed(){}},STORY:{stopAll(){}},SPEECH:{clearSpeech(){}},
  R3:{r3dSetFrontEndPlate(){},r3dSetLookAngles(){},r3dSnapCameraOnNextFrame(){},r3dResetVfdMemory(){}},
  flashMode:()=> 'full',shakeMode:()=> 'full',gameplayInputLifecycleActive:()=>true,
  sourceCameraPatch:()=>({}),releaseSourceRecordingCassetteLabels,P3:{},pushEvent:e=>{throw Error(e);},
  beginSourceContinuation:async options=>{continued++;return {id:'source-continuation',options,view:()=>({ready:true})};},
 };
 for(const key of ['resetMotionInput','cancelOutskirtDoorAnswer','stopOutskirtsStreetAudio','pauseOutskirtsLastLight',
  'stopSourceShoreAudio','stopSourceDockDoorAudio','stopSourceCorridorRain','syncStationEdgeSound','syncElsewhereBeds',
  'endHorizonScore','stopAllVoices','stopWorldLayerVoice','silenceAmbientDrone','endBootWeather','syncSourceRender',
  'updateAudio','ensureInteractionFocus'])h[key]=()=>{};
 const returnContinuation=runtime.returnContinuation;
 runtime.returnContinuation=(...args)=>{returned++;return returnContinuation(...args);};
 const context=vm.createContext(h);
 for(const name of ['sourceEarthfallProtected','commitSourceContinuation','releaseSourceContinuation','beginSourceEarthfall'])vm.runInContext(production(name),context);
 return {h,entry,runtime,rendered,snapshots,audio,data:()=>data,continued:()=>continued,returned:()=>returned,disposals:()=>disposals};
}

test('only the unused forward SourceII entrance gets the fall; current and reverse journeys retain their position',()=>{
 const runtime=createSourceSpaceRuntime({initialState:initial()}),entry=runtime.sourceContinuationEntry('forward',{runId:'a'});
 assert.equal(sourceEarthfallNeeded(null,entry.checkpoint),true);
 for(const patch of [{elapsed:2},{knowledge:['seam']},{x:2},{phase:'catch'},{completed:true}]){
  assert.equal(sourceEarthfallNeeded(null,{...entry.checkpoint,...patch}),false);
  assert.equal(sourceEarthfallNeeded(freshSourceEarthfall({runId:'a'}),{...entry.checkpoint,...patch}),false,'a stale unfinished fall cannot replace an already occupied SourceII');
 }
 assert.equal(sourceEarthfallNeeded(null,entry.checkpoint,'reverse'),false);
 assert.equal(sourceEarthfallNeeded({status:'completed'},entry.checkpoint),false);
 assert.equal(sourceEarthfallNeeded(freshSourceEarthfall({runId:'a'}),entry.checkpoint),true);
});

test('earthfall checkpoint normalization preserves the100m body and the existing route state across save/reload',()=>{
 const runtime=createSourceSpaceRuntime({initialState:initial()}),entry=runtime.sourceContinuationEntry('forward',{runId:'a'});
 const before=copy(runtime.state()),value={...freshSourceEarthfall({runId:'a',returnPose:entry.returnPose}),committed:true,phase:'falling',feet:63,clock:5,elapsed:5,velocityY:-19};
 assert.ok(runtime.setEarthfallCheckpoint(value));
 const restored=createSourceSpaceRuntime({initialState:normalizeChunkSurfState(JSON.parse(JSON.stringify(runtime.state())))});
 assert.equal(restored.state().sourceEarthfall.feet,63);
 assert.equal(restored.state().sourceContinuation.elapsed,before.sourceContinuation.elapsed);
 for(const key of ['phase','finale','finalEncounter','sourceContacts','sourceDivide','sourceDemolition','firstLiftCompleted'])assert.deepEqual(restored.state()[key],before[key],key);
 assert.equal(runtime.setEarthfallCheckpoint({...value,runId:'another-run'}),false);
});

test('actual main callback pauses, resumes and walks the full physical fall into exactly one existing SourceII scene',async()=>{
 const x=host(),scene=await x.h.beginSourceEarthfall(x.entry),original=copy(x.runtime.state().sourceContinuation);
 assert.equal(scene.id,'source-earthfall');assert.equal(scene.serialize().feet,100);
 scene.key({key:'w'});for(let i=0;i<30;i++)scene.update(1/60);scene.keyup({key:'w'});
 assert.equal(scene.serialize().committed,true);
 scene.pause();const frozen=copy(scene.serialize());for(let i=0;i<60;i++)scene.update(1/60);
 assert.deepEqual(scene.serialize(),frozen);scene.resume();
 const heights=[];for(let i=0;i<Math.ceil((C.footingLossAt+8)*60)&&scene.serialize().phase!=='landed';i++){scene.update(1/60);scene.render();heights.push(scene.serialize().feet);}
 assert.equal(scene.serialize().feet,0);assert.ok(heights.some(y=>y>45&&y<55),'the actual body traversed the middle of100m');
 assert.ok(heights.every((y,i)=>!i||y>86||y<=heights[i-1]+1e-8),'below the shallow material the body must fall continuously; local rubble contacts may raise feet above that boundary');
 assert.equal(x.continued(),0);assert.deepEqual(x.runtime.state().sourceContinuation,original);
 // Falling material now deflects the real body. Use ordinary lateral input
 // to reach the visible lower spine rather than assuming a scripted centre.
 for(let align=0;align<300&&Math.abs(scene.serialize().x)>.18;align++){const key=scene.serialize().x<0?'d':'a';scene.key({key});scene.update(1/60);scene.keyup({key});}
 assert.ok(Math.abs(scene.serialize().x)<=.18,'ordinary lateral input must reach the visible spine');
 scene.key({key:'Shift'});scene.key({key:'w'});for(let i=0;i<1500&&scene.serialize().z>C.passage.exitZ+1.8;i++)scene.update(1/60);scene.keyup({key:'w'});scene.keyup({key:'Shift'});
 assert.equal(scene.serialize().exitDoor.open,true,'the ordinary walk opens the lower leaves without interaction');
 assert.equal(x.continued(),0,'an opened door still requires physical crossing');
 for(let i=0;i<60;i++)scene.update(1/60);
 scene.key({key:'Shift'});scene.key({key:'w'});for(let i=0;i<90&&!scene.view().leaving;i++)scene.update(1/60);scene.keyup({key:'w'});scene.keyup({key:'Shift'});
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(x.continued(),1);assert.equal(x.runtime.state().sourceEarthfall.status,'completed');
 assert.equal(x.runtime.state().sourceEarthfall.exitReceipt.delivered,true);
 const transferred=x.runtime.state().sourceContinuation,fallen=scene.serialize();
 assert.equal(transferred.z,fallen.z+sourceContinuationEntranceOffset().z,'the real body clearance continues through the same doorway instead of snapping to spawn');
 assert.equal(transferred.x,fallen.x);assert.equal(transferred.feet,fallen.feet);assert.equal(transferred.yaw,fallen.yaw);assert.equal(transferred.pitch,fallen.pitch);
 assert.equal(transferred.doorOpen['wrong-entry-return'],true);assert.deepEqual(transferred.knowledge,original.knowledge);
 assert.equal(x.disposals(),1);assert.ok(x.rendered.length>100);assert.ok(x.audio.stops>0);
 scene.update(1);assert.equal(x.continued(),1);
});

test('the actual entry preserves recording and permits a physical retreat before footing loss',async()=>{
 const protectedHost=host();protectedHost.h.REC.isRecording=()=>true;
 assert.equal(await protectedHost.h.beginSourceEarthfall(protectedHost.entry),false);
 assert.equal(protectedHost.h.sourceContinuationScene,null);assert.equal(protectedHost.runtime.state().sourceEarthfall,null);
 const x=host(),scene=await x.h.beginSourceEarthfall(x.entry);
 scene.key({key:'s'});for(let i=0;i<100&&!scene.view().leaving;i++)scene.update(1/60);scene.keyup({key:'s'});
 await Promise.resolve();assert.equal(x.returned(),1);assert.equal(x.continued(),0);
 assert.equal(x.runtime.state().sourceEarthfall.status,'returned');assert.equal(x.runtime.state().sourceContinuation.status,'returned');
 assert.equal(x.runtime.state().horizon.entered,false);
});

test('Earthfall owns ordinary relative look while lowering and has a bounded impact-only control hold',async()=>{
 const renderer={initialize:async()=>true,render(){return true;},ready:()=>true,dispose(){}},scene=createSourceEarthfallScene({checkpoint:freshSourceEarthfall({runId:'look'}),renderer});
 assert.equal(scene.allowsLook,false);await scene.initialize();assert.equal(scene.allowsLook,true);assert.equal(scene.lookBy(.3,-.2),true);const before=scene.lookAngles();scene.pause();assert.equal(scene.lookBy(.2,.2),false);assert.deepEqual(scene.lookAngles(),before);scene.resume();assert.equal(scene.lookBy(.2,.2),true);
 scene.setLook({yaw:0,pitch:0});scene.key({key:'w'});for(let i=0;i<65;i++)scene.update(1/120);scene.keyup({key:'w'});assert.ok(scene.serialize().committed);
 let sawHold=false;for(let i=0;i<Math.ceil((C.footingLossAt+8)*120)&&scene.serialize().phase!=='landed';i++){scene.update(1/120);if(scene.serialize().phase==='fracturing'){assert.equal(scene.allowsLook,true);scene.lookBy(.001,0);}if(scene.serialize().phase==='catching'){sawHold=true;assert.equal(scene.allowsLook,false);assert.equal(scene.lookBy(.2,.2),false);}}
 assert.ok(sawHold);assert.equal(scene.serialize().phase,'landed');assert.equal(scene.allowsLook,true);assert.equal(scene.lookBy(.2,.1),true);scene.exit();
});

test('Ellery contacts follow supported voluntary walking and never the fall or passive sagging floor',async()=>{
 const contacts=[],cleared=[],renderer={initialize:()=>true,ready:()=>true,render:()=>true,renderAside:()=>true,dispose(){}};
 const create=aside=>createSourceEarthfallScene({checkpoint:{...freshSourceEarthfall({runId:'feet'}),elleryAside:aside},renderer,
  onFootContact:event=>contacts.push(event),clearFootContacts:owner=>cleared.push(owner)});
 const scene=create({...freshSourceEarthfallElleryAside({runId:'feet'}),yaw:0});await scene.initialize();
 scene.key({key:'w'});for(let i=0;i<45;i++)scene.update(1/60);scene.keyup({key:'w'});
 assert.ok(contacts.length>0);assert.ok(contacts.every(e=>e.owner==='source-earthfall:ellery'&&e.surface==='service-concrete'&&e.profile==='physical'&&e.strideM>0&&e.interval>0&&e.distanceM>0));
 scene.pause();assert.equal(cleared.at(-1),'source-earthfall:ellery');scene.exit();
 // Deliberate legacy physical-collapse staging isolates passive floor carry;
 // a fresh modern aside is quiet until player noise and must not auto-sag.
 let aside=normalizeSourceEarthfallElleryAside({...freshSourceEarthfallElleryAside({runId:'feet'}),version:3,id:'source-earthfall:ellery-aside-v3',gag:undefined,chase:undefined});for(let i=0;i<Math.round(3.6*60);i++)aside=stepSourceEarthfallElleryAside(aside,{dt:1/60}).state;
 const late=create(aside);await late.initialize();const before=contacts.length,position=late.serialize().elleryAside;
 for(let i=0;i<60;i++)late.update(1/60);
 const after=late.serialize().elleryAside;assert.ok(Math.hypot(after.x-position.x,after.z-position.z)>.01,'the sagging support really carries the body');
 assert.equal(contacts.length,before,'support carry is not walking');late.exit();
 const falling=create(null);await falling.initialize();falling.key({key:'w'});for(let i=0;i<300;i++)falling.update(1/60);
 assert.equal(contacts.length,before,'the actual Earth Fall does not emit walking contacts');falling.exit();
});
