import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
import {normalizeChunkSurfState} from '../src/game/chunk-surf-state.js';
import {freshSourceFalseReturn,normalizeSourceFalseReturn,sourceFalseReturnNeeded} from '../src/game/source-false-return.js';
import {sourceEarthfallNeeded} from '../src/game/source-earthfall-entry.js';
import {freshSourceEarthfall} from '../src/game/source-earthfall.js';
import {createSourceFalseReturnScene} from '../src/game/source-false-return-scene.js';

const copy=v=>JSON.parse(JSON.stringify(v));
const initial=()=>buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL,{seed:4417}).state;
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){const start=main.indexOf(`function ${name}(`);assert.ok(start>=0,name);return main.slice(main.slice(start-6,start)==='async '?start-6:start,main.indexOf('\n}\n',start)+3);}
const layout={spawn:{x:0,z:1,feet:4.8,yaw:0,pitch:0},bounds:{minX:-3,maxX:3,minZ:-18,maxZ:4},
  doors:Array.from({length:5},(_,i)=>({id:'practice-'+i,x:0,z:-2-i*3,feet:4.8,normal:{x:0,z:-1},halfWidth:.8,counted:true,openSeconds:.45})),
  loops:[],supportAt:()=>({floor:4.8,ceil:8.4}),canOccupy:()=>true};
function host(){
  const runtime=createSourceSpaceRuntime({initialState:initial()}),entry=runtime.sourceContinuationEntry('forward',{runId:'false-main'});
  let data={run:{id:'false-main'},chunkSurf:runtime.state()},continued=0,disposals=0;
  const traces=[],audio={stop(){},pause(){},event(){},update(){}},body=runtime.edgeDoorApproach();
  const h={chunkSurfRuntime:runtime,sourceContinuationScene:null,sourceContinuationRenderer:null,sourceContinuationAudio:null,sourceEarthfallAudio:null,sourceContinuationTrace:traces,
    sourceDriveSession:null,sourcePubScene:null,coastalMemoryScene:null,paused:false,document:{hidden:false,hasFocus:()=>true},r3dCache:{},px:body.x,py:body.y,renderMove:null,motionRig:null,trail:[],
    freshSourceFalseReturn,normalizeSourceFalseReturn,sourceFalseReturnNeeded,sourceEarthfallNeeded,createSourceFalseReturnScene,
    buildSourceFalseReturnLayout:()=>layout,FP:{},PROPS:{renderInstances:()=>[],allProps:()=>[]},resolveLocalLights:()=>[],liveLightCircuits:()=>new Set(),ZONE:{practice:6},
    createSourceFalseReturnRenderer:()=>({initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){if(this.dead)return false;this.dead=true;disposals++;return true;}}),
    createSourceContinuationAudio:()=>audio,scenes:{push:s=>s.enter(),remove:s=>s.exit()},ensureCtx(){},actx:{},sfxGain:{},getSave:()=>data,saveCommit:p=>{data={...data,...p};},
    PB:{stopPlayback(){}},pubRoomAudio:null,windowChoreography:null,towerBellDirector:null,bellPealPerformance:null,frontEndSession:null,frontEndPlateOverride:null,
    RT:{setBed(){}},STORY:{stopAll(){}},SPEECH:{clearSpeech(){}},R3:{r3dSetFrontEndPlate(){},r3dSetLookAngles(){},r3dSnapCameraOnNextFrame(){},r3dResetVfdMemory(){}},
    sourceCameraPatch:()=>({}),sourcePresentationTorch:()=>({on:false,look:{power:0}}),
    sourceEarthfallProtected:()=>false,gameplayInputLifecycleActive:()=>true,pushEvent:e=>{throw Error(e);},
    beginSourceEarthfall:async next=>{continued++;const scene={id:'source-earthfall',view:()=>({ready:true}),entry:next};h.sourceContinuationScene=scene;return scene;},
  };
  for(const key of ['resetMotionInput','cancelOutskirtDoorAnswer','stopOutskirtsStreetAudio','pauseOutskirtsLastLight','stopSourceShoreAudio','stopSourceDockDoorAudio','stopSourceCorridorRain','syncStationEdgeSound','syncElsewhereBeds','endHorizonScore','stopAllVoices','stopWorldLayerVoice','silenceAmbientDrone','endBootWeather','syncSourceRender','updateAudio','ensureInteractionFocus'])h[key]=()=>{};
  const context=vm.createContext(h);for(const name of ['commitSourceContinuation','releaseSourceContinuation','beginSourceFalseReturn','beginSourceContinuation'])vm.runInContext(production(name),context);
  return{h,runtime,entry,body,traces,data:()=>data,continued:()=>continued,disposals:()=>disposals};
}
function update(scene,seconds){for(let i=0;i<Math.round(seconds*60);i++)scene.update(1/60);}
function walk(scene,seconds){scene.key({key:'w'});update(scene,seconds);scene.keyup({key:'w'});}

test('the actual fresh-forward main entry borrows Ellery and the fifth crossing retains the full original onward route',async()=>{
  const x=host(),before=copy(x.runtime.state()),scene=await x.h.beginSourceContinuation({checkpoint:x.entry.checkpoint});
  assert.equal(scene.id,'source-false-return');assert.equal(x.continued(),0);
  assert.equal(x.h.px,x.body.x);assert.equal(x.h.py,x.body.y);
  walk(scene,.5);
  for(let i=0;i<5;i++){scene.key({key:'e'});update(scene,.5);assert.equal(x.continued(),0);walk(scene,1);}
  update(scene,.5);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(x.continued(),1);assert.equal(x.h.sourceContinuationScene.id,'source-earthfall');
  assert.equal(x.runtime.state().sourceFalseReturn.status,'completed');assert.equal(x.runtime.state().sourceFalseReturn.exitReceipt.delivered,true);
  assert.equal(x.disposals(),1);assert.deepEqual(x.runtime.state().sourceContinuation,before.sourceContinuation);
  for(const key of ['phase','finale','finalEncounter','sourceContacts','sourceDivide','sourceDemolition','firstLiftCompleted'])assert.deepEqual(x.runtime.state()[key],before[key],key);
  assert.equal(x.traces.filter(t=>t.event?.type==='complete').length,1);
});

test('run-scoped save normalization preserves false doors without granting real-building or Contact authority',()=>{
  const x=host(),before=copy(x.runtime.state()),value=freshSourceFalseReturn({runId:'false-main',returnPose:{x:999,y:999},spawn:layout.spawn});
  value.opened=['practice-west-1','practice-east-1'];value.doorOpen={'practice-west-1':true};value.x=61;
  assert.ok(x.runtime.setFalseReturnCheckpoint(value));
  assert.deepEqual(x.runtime.state().sourceFalseReturn.returnPose,x.entry.returnPose,'the original held body anchor cannot be overwritten by local input');
  const restored=createSourceSpaceRuntime({initialState:normalizeChunkSurfState(copy(x.runtime.state()))});
  assert.deepEqual(restored.state().sourceFalseReturn.opened,value.opened);assert.equal(restored.state().sourceFalseReturn.x,61);
  assert.equal(x.runtime.setFalseReturnCheckpoint({...value,runId:'another'}),false);
  for(const key of ['phase','finale','sourceContacts','sourceContinuation','sourceEarthfall'])assert.deepEqual(x.runtime.state()[key],before[key],key);
});

test('existing Earthfall journeys and occupied Source II saves bypass the added fake return',async()=>{
  const x=host();x.runtime.setEarthfallCheckpoint(freshSourceEarthfall({runId:'false-main',returnPose:x.entry.returnPose}));
  // Any real prior Earthfall save is kept by the normalizer and prevents a new
  // prefix being imposed on an existing journey. Its own gate remains owner.
  const prior=x.runtime.state().sourceEarthfall;assert.ok(prior);
  const scene=await x.h.beginSourceContinuation({checkpoint:x.entry.checkpoint});
  assert.equal(scene.id,'source-earthfall');assert.equal(x.runtime.state().sourceFalseReturn,null);
  assert.equal(sourceFalseReturnNeeded(null,{...x.entry.checkpoint,elapsed:2}),false);
  assert.equal(sourceFalseReturnNeeded(null,x.entry.checkpoint,'reverse'),false);
});
