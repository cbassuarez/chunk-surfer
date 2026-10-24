import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
import {normalizeChunkSurfState} from '../src/game/chunk-surf-state.js';
import {freshSourceEarthfall,normalizeSourceEarthfall} from '../src/game/source-earthfall.js';
import {sourceEarthfallNeeded} from '../src/game/source-earthfall-entry.js';
import {createSourceEarthfallScene} from '../src/game/source-earthfall-scene.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const initial=()=>buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL,{seed:4417}).state;
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){
 const start=main.indexOf(`function ${name}(`),asyncStart=main.lastIndexOf('async ',start);
 assert.ok(start>=0,name);const from=asyncStart===start-6?asyncStart:start;
 return main.slice(from,main.indexOf('\n}\n',start)+3);
}
function host(){
 const runtime=createSourceSpaceRuntime({initialState:initial()});
 const entry=runtime.sourceContinuationEntry('forward',{runId:'earthfall-test'});
 const snapshots=[],rendered=[],trace=[],audio={updates:[],stops:0,stop(){this.stops++;},update(...args){this.updates.push(args);}};
 let data={run:{id:'earthfall-test'},settings:{},chunkSurf:runtime.state()},returned=0,continued=0,disposals=0,disposed=false;
 const h={chunkSurfRuntime:runtime,sourceContinuationScene:null,sourceContinuationRenderer:null,
  sourceContinuationAudio:null,sourceEarthfallAudio:null,sourceContinuationTrace:trace,
  sourceDriveSession:null,sourcePubScene:null,hushRunActive:false,paused:false,
  REC:{isRecording:()=>false,isListening:()=>false},PB:{isPlaying:()=>false},
  document:{hidden:false,hasFocus:()=>true},r3dCache:{},px:0,py:0,renderMove:null,motionRig:null,trail:[],
  freshSourceEarthfall,normalizeSourceEarthfall,sourceEarthfallNeeded,createSourceEarthfallScene,
  createSourceEarthfallRenderer:()=>({initialize:async()=>true,ready:()=>true,
    render:s=>{rendered.push(copy(s));return true;},dispose:()=>{if(disposed)return false;disposed=true;disposals++;return true;}}),
  createSourceEarthfallAudio:()=>audio,
  scenes:{push:s=>s.enter(),remove:s=>s.exit()},
  ensureCtx(){},actx:{},sfxGain:{},getSave:()=>data,
  saveCommit:patch=>{data={...data,...patch};snapshots.push(copy(patch));},
  pubRoomAudio:null,windowChoreography:null,towerBellDirector:null,bellPealPerformance:null,
  frontEndSession:null,frontEndPlateOverride:null,
  RT:{setBed(){}},STORY:{stopAll(){}},SPEECH:{clearSpeech(){}},
  R3:{r3dSetFrontEndPlate(){},r3dSetLookAngles(){},r3dSnapCameraOnNextFrame(){},r3dResetVfdMemory(){}},
  flashMode:()=> 'full',shakeMode:()=> 'full',gameplayInputLifecycleActive:()=>true,
  sourceCameraPatch:()=>({}),pushEvent:e=>{throw Error(e);},
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
 const heights=[];for(let i=0;i<650&&scene.serialize().phase!=='landed';i++){scene.update(1/60);scene.render();heights.push(scene.serialize().feet);}
 assert.equal(scene.serialize().feet,0);assert.ok(heights.some(y=>y>45&&y<55),'the actual body traversed the middle of100m');
 assert.ok(heights.every((y,i)=>!i||y<=heights[i-1]+1e-8));
 assert.equal(x.continued(),0);assert.deepEqual(x.runtime.state().sourceContinuation,original);
 scene.key({key:'w'});for(let i=0;i<900&&scene.serialize().z>-40.2;i++)scene.update(1/60);scene.keyup({key:'w'});
 scene.key({key:'e'});assert.equal(x.continued(),0,'opening does not transfer');
 for(let i=0;i<60;i++)scene.update(1/60);
 scene.key({key:'w'});for(let i=0;i<90&&!scene.view().leaving;i++)scene.update(1/60);scene.keyup({key:'w'});
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(x.continued(),1);assert.equal(x.runtime.state().sourceEarthfall.status,'completed');
 assert.equal(x.runtime.state().sourceEarthfall.exitReceipt.delivered,true);
 assert.deepEqual(x.runtime.state().sourceContinuation,original,'the next controller owns its own meters and progress');
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
