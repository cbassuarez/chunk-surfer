import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET} from '../src/game/chunk-surf-god.js';
import {CHUNK_SURF_PHASE,SOURCE_FINALE_ROUTE,SOURCE_FINALE_STAGE,normalizeChunkSurfState,reduceChunkSurf} from '../src/game/chunk-surf-state.js';
import {nextSourceContact,resolveSourceContact} from '../src/game/source-contact.js';
import {freshSave,getSave,saveCommit,withTransientGameState} from '../src/game/save.js';
import {freshMeta,freshRunRecord} from '../src/progression/schema.js';
import * as scenes from '../src/game/scenes.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_CONTINUATION} from '../src/data/source-continuation.js';
import {InputManager} from '../src/input/input-manager.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const initial=()=>buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FINAL,{seed:4417}).state;
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);

function field(source=initial()){
  const runtime=createSourceSpaceRuntime({initialState:{...source,edgeDoorOpen:true}});
  const at=runtime.edgeDoorApproach();
  runtime.setPlayerPosition(at);
  return{runtime,at};
}
function crossEdge(runtime,{reverse=false}={}){
  const frame=runtime.edgeDoorFrame();assert.ok(frame,'the preserved grey pair exists');
  const [a,b]=frame.threshold,x=(a.x+b.x)/2,y=(a.y+b.y)/2;
  const from={x,y:reverse?Math.floor(y):Math.ceil(y),facing:reverse?2:0,yaw:reverse?Math.PI:0,pitch:-.08};
  const to={...from,y:reverse?Math.ceil(y)+1:Math.floor(y)-1};
  runtime.setPlayerPosition(from);
  assert.equal(runtime.geometry.canStep(from.x,from.y,to.x,to.y).ok,true,'the actual open threshold accepts this body step');
  return runtime.onStep(from,to);
}
function contactFields(state){
  return copy({sourceContacts:state.sourceContacts,finalEncounter:state.finalEncounter,finale:state.finale,injuriesAtEntry:state.injuriesAtEntry,bestEligible:state.bestEligible,optionalTraces:state.optionalTraces});
}
function committedContact(){
  let state=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT,{seed:4417,injuries:0}).state;
  const encounter=nextSourceContact(state.sourceContacts,{seed:state.seed,victories:0});
  let contact=resolveSourceContact(state.sourceContacts,encounter,'contact.warning');
  contact=resolveSourceContact(contact,encounter,'contact.confirm');
  state=reduceChunkSurf({...state,sourceContacts:contact},{type:'CONTACT_COMMITTED'});
  assert.equal(state.finale.route,SOURCE_FINALE_ROUTE.CONTACT);
  assert.equal(state.finale.stage,SOURCE_FINALE_STAGE.CONTACT_COMMITTED);
  return state;
}
function finalDoorCheckpoint(checkpoint){
  return normalizeSourceContinuation({...checkpoint,status:'active',phase:'catch',level:5,
    ...SOURCE_CONTINUATION.catch.finalApproach,fall:null,recovery:null});
}
function completeAtFinalDoor(checkpoint){
  let result=stepSourceContinuation(finalDoorCheckpoint(checkpoint),{interact:true,renderReady:true});
  assert.equal(result.state.doorOpen['catch-final'],true,'E opens the actual final goods pair');
  assert.equal(result.state.completed,false,'opening alone does not transfer the player');
  for(let i=0;i<30&&result.event?.type!=='complete';i++)result=stepSourceContinuation(result.state,{dt:.05,side:1,renderReady:true});
  assert.equal(result.event?.type,'complete','walking through the open final plane grants the exit receipt');
  assert.ok(result.state.x>SOURCE_CONTINUATION.catch.finalDoor.x);
  return result.state;
}
async function walkFinalDoor(scene){
  scene.key({key:'e'});assert.equal(scene.serialize().doorOpen['catch-final'],true);assert.equal(scene.serialize().completed,false);
  scene.key({key:'d'});
  for(let i=0;i<30&&scene.serialize().status==='active';i++)scene.update(.05);
  scene.keyup({key:'d'});await Promise.resolve();await Promise.resolve();
  assert.equal(scene.serialize().completed,true,'the real scene receives movement through the final door');
}

test('the default real grey crossing enters the continuation before the original onward transition',()=>{
  const{runtime}=field(),before=runtime.state(),contract=contactFields(before);
  const event=crossEdge(runtime);
  assert.equal(event?.event,'source-continuation');
  assert.equal(runtime.state().phase,before.phase,'Source I phase is retained while the separate scene borrows its renderer');
  assert.equal(runtime.state().horizon.entered,false,'the original normal exit has not happened yet');
  assert.deepEqual(contactFields(runtime.state()),contract,'entering an apparent escape does not commit Contact or classify an ending');
  assert.ok(own(runtime.state(),'sourceContinuation'),'continuation progress is durable chunkSurf state');
  const entry=runtime.sourceContinuationEntry('forward');
  assert.ok(entry?.checkpoint&&entry.returnPose,'the real crossing exposes a checkpoint and original-world return pose');
  assert.ok([entry.returnPose.x,entry.returnPose.y].every(Number.isFinite));
  assert.ok(runtime.geometry.cellAt(entry.returnPose.x,entry.returnPose.y),'retreat has supported original Source ground');
});

test('false grey echoes retain their erasure behavior and cannot start the continuation',()=>{
  const{runtime}=field(),before=copy(runtime.state().sourceContinuation);
  const fake=runtime.edgeDoorField().find(door=>door.index===1);assert.ok(fake);
  const at={x:Math.round(fake.x),y:Math.ceil(fake.y)+3,facing:0};runtime.setPlayerPosition(at);
  assert.equal(runtime.inspectFocused(at.x,at.y,at.facing).event,'edge-door-zapped');
  assert.equal(runtime.edgeDoorField().find(door=>door.id===fake.id).erased,true);
  assert.deepEqual(runtime.state().sourceContinuation,before);
  assert.equal(runtime.state().horizon.entered,false);
});

test('an early refuge return retains continuation progress and restores the original approach without Contact authority',()=>{
  const{runtime}=field(),contract=contactFields(runtime.state());crossEdge(runtime);
  const entry=runtime.sourceContinuationEntry('forward');assert.ok(entry?.checkpoint);
  runtime.setContinuationCheckpoint(entry.checkpoint);
  const checkpoint=copy(runtime.state().sourceContinuation);
  const result=runtime.returnContinuation(checkpoint);
  assert.equal(result?.event,'source-field-returned');
  assert.deepEqual({x:result.position.x,y:result.position.y},{x:entry.returnPose.x,y:entry.returnPose.y});
  assert.equal(runtime.state().horizon.entered,false);
  assert.deepEqual(contactFields(runtime.state()),contract);
  assert.deepEqual(runtime.state().sourceContinuation,{...checkpoint,status:'returned'},'returning changes its lifecycle status without erasing the local route checkpoint');
  const again=runtime.sourceContinuationEntry('forward');
  assert.deepEqual(again.checkpoint,{...checkpoint,status:'active'},'forward entry resumes the retained local sequence');
});

test('a checkpoint from another run cannot move or return the original Source body',()=>{
  const{runtime}=field();crossEdge(runtime);const entry=runtime.sourceContinuationEntry('forward');
  const before=copy(runtime.state());
  const foreign={...entry.checkpoint,runId:'foreign-run',returnPose:{...entry.returnPose,x:entry.returnPose.x+100}};
  assert.equal(runtime.setContinuationCheckpoint(foreign),false);
  assert.equal(runtime.returnContinuation(foreign)?.handled,false);
  assert.deepEqual(runtime.state(),before);
});

test('the real chunkSurf/save normalizers retain the continuation and preserve unrelated route receipts',async()=>{
  const{runtime}=field();crossEdge(runtime);
  const entry=runtime.sourceContinuationEntry('forward');runtime.setContinuationCheckpoint(entry.checkpoint);
  const source=copy(runtime.state()),run=freshRunRecord({id:'continuation-integration',startedAt:1000});
  const base=freshSave({run}),flags={...base.flags,'pub.help.sourceUnlocked':true,'outskirts.lastLight.heard':true};
  const original={...base,flags,chunkSurf:source};
  assert.deepEqual(normalizeChunkSurfState(copy(source)).sourceContinuation,source.sourceContinuation);
  await withTransientGameState({save:original,meta:freshMeta()},async()=>{
    const before=copy({flags:getSave().flags,sourceDrive:getSave().sourceDrive,sourcePub:getSave().sourcePub,items:getSave().items,takes:getSave().takes});
    assert.deepEqual(getSave().chunkSurf.sourceContinuation,source.sourceContinuation);
    saveCommit({chunkSurf:copy(runtime.state())});
    assert.deepEqual(getSave().chunkSurf.sourceContinuation,source.sourceContinuation);
    assert.deepEqual({flags:getSave().flags,sourceDrive:getSave().sourceDrive,sourcePub:getSave().sourcePub,items:getSave().items,takes:getSave().takes},before);
    const restored=createSourceSpaceRuntime({initialState:copy(getSave().chunkSurf)});
    assert.deepEqual(restored.sourceContinuationEntry('forward').checkpoint,source.sourceContinuation);
    assert.deepEqual(contactFields(restored.state()),contactFields(source));
  });
});

test('legacy saves already beyond the original handoff continue their existing route without being dragged back',()=>{
  let legacy=reduceChunkSurf(initial(),{type:'SOURCE_NORMAL_EXIT'});delete legacy.sourceContinuation;
  assert.equal(legacy.phase,CHUNK_SURF_PHASE.HORIZON);
  const loaded=createSourceSpaceRuntime({initialState:copy(legacy)});
  assert.equal(loaded.state().phase,CHUNK_SURF_PHASE.HORIZON);
  assert.equal(loaded.state().horizon.entered,true);
  const returned=reduceChunkSurf(loaded.state(),{type:'SOURCE_FIELD_RETURNED'});
  const{runtime}=field(returned),out=crossEdge(runtime);
  assert.equal(out?.event,'horizon','an original beyond-handoff save keeps its original onward transition');
  assert.equal(runtime.state().phase,CHUNK_SURF_PHASE.HORIZON);
});

test('Contact commitment and bust decisions refuse every continuation entry/completion path',()=>{
  const committed=committedContact();
  const blocked=[committed,...['accepted','declined'].map(decision=>{
    const horizon=reduceChunkSurf(initial(),{type:'SOURCE_NORMAL_EXIT'});
    return{...horizon,finale:{...horizon.finale,bust:{...horizon.finale.bust,decision}}};
  })];
  for(const source of blocked){
    const runtime=createSourceSpaceRuntime({initialState:source}),before=copy(runtime.state());
    assert.ok(!runtime.sourceContinuationEntry('forward'));
    assert.ok(!runtime.sourceContinuationEntry('reverse'));
    const result=runtime.completeContinuation(before.sourceContinuation);
    assert.ok(!result?.handled,'completion cannot replace an existing committed route');
    assert.deepEqual(runtime.state(),before);
  }
});

test('only the new final door dispatches the original normal exit and its delivered receipt survives reload',()=>{
  const{runtime}=field(),contacts=copy(runtime.state().sourceContacts);crossEdge(runtime);
  const entry=runtime.sourceContinuationEntry('forward');
  assert.equal(runtime.completeContinuation(entry.checkpoint)?.handled,false,'an unfinished continuation cannot use its original-world threshold');
  const completed=completeAtFinalDoor(entry.checkpoint),result=runtime.completeContinuation(completed);
  assert.equal(result?.handled,true);assert.equal(result.event,'horizon');assert.equal(result.through,'source-continuation');
  assert.equal(runtime.state().phase,CHUNK_SURF_PHASE.HORIZON);assert.equal(runtime.state().horizon.entered,true);
  assert.equal(runtime.state().finale.route,null,'the road still precedes the original voluntary bust choice');
  assert.deepEqual(runtime.state().sourceContacts,contacts,'normal exit does not create Contact consent or victories');
  assert.ok([result.checkpoint.x,result.checkpoint.y].every(Number.isFinite));
  assert.ok(runtime.geometry.cellAt(result.checkpoint.x,result.checkpoint.y),'handoff restores supported original road geometry');
  assert.equal(result.receipt,completed.exitReceipt.id);
  assert.equal(runtime.acknowledgeContinuationHandoff('another-receipt'),false);
  assert.equal(runtime.acknowledgeContinuationHandoff(result.receipt),true);
  assert.equal(runtime.acknowledgeContinuationHandoff(result.receipt),false,'one handoff receipt is acknowledged once');
  assert.equal(runtime.completeContinuation(completed)?.handled,false,'repeating the final callback cannot deliver twice');
  const reloaded=createSourceSpaceRuntime({initialState:copy(runtime.state())});
  assert.equal(reloaded.state().sourceContinuation.exitReceipt.delivered,true);
  assert.equal(reloaded.completeContinuation(completed)?.handled,false,'reload cannot repeat a delivered handoff');
});

test('reverse road entry offers the completed Catch balcony and a refuge returns to original Source with progress intact',()=>{
  const{runtime}=field();crossEdge(runtime);const forward=runtime.sourceContinuationEntry('forward');
  const out=runtime.completeContinuation(completeAtFinalDoor(forward.checkpoint));runtime.acknowledgeContinuationHandoff(out.receipt);
  const reverse=crossEdge(runtime,{reverse:true});assert.equal(reverse.event,'source-continuation');assert.equal(reverse.direction,'reverse');
  const back=runtime.sourceContinuationEntry('reverse');
  assert.equal(back.checkpoint.phase,'catch');assert.equal(back.checkpoint.level,5);assert.equal(back.checkpoint.completed,true);
  assert.equal(back.checkpoint.direction,'reverse');
  for(const key of ['x','z','feet'])assert.equal(back.checkpoint[key],SOURCE_CONTINUATION.catch.finalApproach[key]);
  const returned=runtime.returnContinuation(back.checkpoint);assert.equal(returned.handled,true);
  assert.equal(runtime.state().phase,CHUNK_SURF_PHASE.LANDSCAPE,'the preexisting field-return reducer owns the phase transition');
  assert.equal(runtime.state().sourceContinuation.completed,true);
  const resumed=runtime.sourceContinuationEntry('forward');
  assert.equal(resumed.checkpoint.phase,'catch');assert.equal(resumed.checkpoint.level,5);
  assert.equal(resumed.checkpoint.completed,true);assert.equal(resumed.checkpoint.direction,'forward');
  assert.equal(runtime.state().finale.route,null,'returning preserves the possibility of choosing the original route later');
});

// Exercise actual host callbacks with the real runtime, controller and scene.
// Only the renderer/audio devices and the existing onward-drive owner are
// replaced; boot, canvas creation and game processes never run in this suite.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const production=(name,next,environment)=>{
  const at=main.indexOf(`function ${name}(`),end=main.indexOf(next,at);assert.ok(at>=0&&end>at,name);
  const start=main.slice(Math.max(0,at-6),at)==='async '?at-6:at;
  return Function('environment',`with(environment){return (${main.slice(start,end).trim()});}`)(environment);
};

function host({source=initial(),checkpoint=null,initialize=null,driveReady=true,driveReturned=false}={}){
  scenes.clear();
  const runtime=createSourceSpaceRuntime({initialState:{...source,edgeDoorOpen:true}}),at=runtime.edgeDoorApproach();
  runtime.setPlayerPosition(at);
  const run=freshRunRecord({id:'main-continuation',startedAt:1000}),base=freshSave({run});
  if(checkpoint)runtime.setContinuationCheckpoint(checkpoint);
  let data={...base,chunkSurf:runtime.state(),sourceView:{x:at.x,y:at.y,yaw:.7,pitch:-.04},
    sourceDrive:{...base.sourceDrive,...(driveReturned?{status:'returned'}:{})}},look={yaw:.7,pitch:-.04},focused=true,disposed=0;
  const calls=[],renderers=[],audio={stop:()=>calls.push(['audio-stop']),pause:()=>calls.push(['audio-pause']),event(){},update(){}};
  const e={sourceContinuationScene:null,sourceContinuationRenderer:null,sourceContinuationAudio:null,sourceContinuationTrace:[],
    sourcePubScene:null,sourceDriveSession:null,chunkSurfRuntime:runtime,paused:false,actx:null,sfxGain:null,
    px:at.x,py:at.y,renderMove:{},motionRig:{},trail:[1],r3dCache:{physicalKey:'source',physicalGroup:'source-space',fogSize:2},
    getSave:()=>data,saveCommit:patch=>{data={...data,...patch};calls.push(['save',copy(patch)]);},scenes,createSourceContinuationScene,
    R3:{r3dLookAngles:()=>({...look}),r3dFacing:()=>2,r3dSetLookAngles:value=>{look={yaw:value.yaw,pitch:value.pitch};},r3dSetFrontEndPlate(){},r3dSnapCameraOnNextFrame(){},r3dResetVfdMemory(){}},
    createSourceContinuationRenderer:()=>{let ready=false,dead=false;
      const renderer={initialize:async()=>{const result=initialize?await initialize():true;ready=result!==false;return result;},
        ready:()=>ready&&!dead,render:()=>ready&&!dead,clear(){},dispose:()=>{if(dead)return false;dead=true;disposed++;return true;}};
      renderers.push(renderer);return renderer;},
    createSourceContinuationAudio:()=>audio,
    syncSourceRender:()=>calls.push(['restore-source']),usingSourceSpace:()=>true,
    PB:{stopPlayback:()=>calls.push(['stop-playback'])},STORY:{stopAll:()=>calls.push(['stop-story'])},SPEECH:{clearSpeech(){}},RT:{setBed(){}},
    towerBellDirector:{suspend(){},resume:()=>calls.push(['resume-bells'])},bellPealPerformance:{suspend(){},resume(){}},
    windowChoreography:{leaveSource:async()=>{}},frontEndSession:{markLive(){}},frontEndPlateOverride:null,
    ensureCtx(){},resetMotionInput:reason=>calls.push(['reset-input',reason]),pubRoomAudio:{stop(){},pause(){}},sourcePubAudio:null,
    cancelOutskirtDoorAnswer(){},stopOutskirtsStreetAudio(){},pauseOutskirtsLastLight(){},stopSourceShoreAudio(){},stopSourceDockDoorAudio(){},stopSourceCorridorRain(){},
    syncStationEdgeSound(){},syncElsewhereBeds(){},endHorizonScore(){},stopAllVoices(){},stopWorldLayerVoice(){},silenceAmbientDrone(){},endBootWeather(){},
    pushEvent:value=>calls.push(['error',value]),updateAudio(){},ensureInteractionFocus(){},
    document:{hidden:false,visibilityState:'visible',hasFocus:()=>focused},IS_TAURI:false,
    academicGhostDispatch:null,sourceShoreAudio:null,activeRecordingSlate:null,liveRecordingPointerControls:new Set(),
    cancelApparitionApplause(){},setUiCueFocused(){},cancelControlScope(){},pointerMode:{release(){}},recoverInteractionAudio:async()=>{},
    enterHorizon:(reason,options)=>{assert.equal(runtime.state().phase,CHUNK_SURF_PHASE.HORIZON,'the runtime transition must precede the existing main handoff');calls.push(['horizon',reason,options]);},
    beginSourceDriveJourney:async()=>{calls.push(['drive']);if(!driveReady)return false;data={...data,sourceDrive:{...data.sourceDrive,status:'active'}};return{};},
  };
  e.sourceCameraPatch=production('sourceCameraPatch','\nfunction saveSourceView(',e);
  e.gameplayInputLifecycleActive=production('gameplayInputLifecycleActive','\nfunction holdUnavailableGameplayInput(',e);
  e.commitSourceContinuation=production('commitSourceContinuation','\nfunction releaseSourceContinuation(',e);
  e.releaseSourceContinuation=production('releaseSourceContinuation','\nasync function deliverSourceContinuationHandoff(',e);
  e.deliverSourceContinuationHandoff=production('deliverSourceContinuationHandoff','\nasync function beginSourceContinuation(',e);
  e.beginSourceContinuation=production('beginSourceContinuation','\nfunction sourcePubEntranceFrame(',e);
  e.onBlur=production('onBlur','\n// Focus, capture and a level head',e);
  return{e,runtime,calls,data:()=>data,look:()=>({...look}),focus:value=>{focused=value;},disposed:()=>disposed,renderers,
    close(){if(e.sourceContinuationScene){e.commitSourceContinuation();e.releaseSourceContinuation();}scenes.clear();}};
}

test('main entry waits for actual renderer readiness, then real E retreat restores the original body and gaze',async()=>{
  let resolveLoad;const h=host({initialize:()=>new Promise(resolve=>{resolveLoad=resolve;})}),e=h.e;
  try{
    const initialView=copy(h.data().sourceView),promise=e.beginSourceContinuation(),scene=e.sourceContinuationScene;
    assert.ok(scene);assert.equal(scenes.top(),scene);assert.equal(scenes.blocksWorld(),true);assert.equal(scenes.allowsLook(),false);
    scene.key({key:'w'});scene.update(.2);assert.equal(scene.view().elapsed,0);assert.equal(scene.view().ready,false);
    assert.deepEqual(e.sourceCameraPatch(e.px,e.py),{},'borrowed renderer gaze never becomes original Source gaze');
    assert.deepEqual(h.data().sourceView,initialView);
    await Promise.resolve();resolveLoad(true);assert.equal(await promise,scene);assert.equal(scene.view().ready,true);
    scene.update(.2);assert.equal(scene.view().z,SOURCE_CONTINUATION.spawn.z,'loading dropped held movement instead of queueing it');
    scene.setLook({yaw:Math.PI,pitch:.1});assert.equal(scene.view().focus?.type,'return');
    const original=scene.serialize().returnPose;scene.key({key:'e'});await Promise.resolve();
    assert.equal(e.sourceContinuationScene,null);assert.equal(scenes.has('source-continuation'),false);
    assert.equal(h.data().chunkSurf.sourceContinuation.status,'returned');
    assert.deepEqual({x:e.px,y:e.py},{x:original.x,y:original.y});assert.deepEqual(h.look(),{yaw:original.yaw,pitch:original.pitch});
    assert.deepEqual(h.data().sourceView,{x:original.x,y:original.y,yaw:original.yaw,pitch:original.pitch});
    assert.equal(h.disposed(),1,'the device owner is disposed once despite scene/host cleanup both calling it');
    assert.equal(h.calls.filter(c=>c[0]==='drive').length,0);assert.equal(h.runtime.state().horizon.entered,false);
  }finally{h.close();}
});

test('pause, lost focus and blur freeze the real scene and discard held movement before resume',async()=>{
  const h=host(),e=h.e;try{
    const scene=await e.beginSourceContinuation();scene.key({key:'w'});scene.update(.1);const moved=scene.view();assert.ok(moved.z<2);
    scene.key({key:'Escape'});scene.pause();e.paused=true;scenes.push({id:'pause',blocksWorld:true,blocksInput:true});
    scenes.update(.2);assert.equal(scene.view().elapsed,moved.elapsed);assert.equal(scene.view().z,moved.z);
    scenes.pop();e.paused=false;scene.update(.1);assert.equal(scene.view().z,moved.z,'pause cleared the held key');
    scene.key({key:'w'});h.focus(false);e.onBlur();scene.update(.2);const blurred=scene.view();
    assert.ok(Math.abs(blurred.elapsed-moved.elapsed-.1)<1e-8);assert.equal(blurred.z,moved.z);
    h.focus(true);scene.focus();scene.update(.1);assert.equal(scene.view().z,moved.z,'focus resume does not resurrect pre-blur intent');
    e.document.hidden=true;const hidden=scene.serialize();scene.update(.2);assert.deepEqual(scene.serialize(),hidden,'hidden windows cannot advance threats or falling');
  }finally{h.close();}
});

test('main checkpoint/save callbacks retain local look while autosave and release preserve original Source view',async()=>{
  const h=host(),e=h.e;try{
    const scene=await e.beginSourceContinuation(),original=copy(h.data().sourceView);scene.setLook({yaw:-1.2,pitch:.3});
    e.commitSourceContinuation();assert.equal(h.data().chunkSurf.sourceContinuation.yaw,-1.2);assert.deepEqual(h.data().sourceView,original);
    e.saveSourceView=production('saveSourceView','\n// DROPPING THE SOURCE RUNTIME',e);assert.equal(e.saveSourceView(),true);assert.deepEqual(h.data().sourceView,original);
    e.saveAcc=3.95;const saveTick=production('saveTick','\n// One question, two geometry providers:',e);saveTick(.1);
    assert.deepEqual(h.data().sourceView,original);assert.equal(h.data().chunkSurf.sourceContinuation.yaw,-1.2);
    const saved=copy(h.data().chunkSurf.sourceContinuation);e.releaseSourceContinuation();assert.equal(saved.status,'active');
    assert.deepEqual(h.look(),{yaw:saved.returnPose.yaw,pitch:saved.returnPose.pitch});
    const resumed=await e.beginSourceContinuation({checkpoint:saved});assert.ok(resumed);assert.equal(resumed.view().yaw,-1.2);
    assert.deepEqual(h.data().sourceView,original,'resuming a local camera never overwrites the original body checkpoint');
  }finally{h.close();}
});

test('opening and walking through the actual final door hands control to the original drive once it has a resumable checkpoint',async()=>{
  const seed=freshSourceContinuation({runId:'main-continuation'}),checkpoint=finalDoorCheckpoint({...seed,status:'active'}),h=host({checkpoint}),e=h.e;
  try{
    const scene=await e.beginSourceContinuation({checkpoint});assert.equal(scene.view().focus?.type,'final');
    await walkFinalDoor(scene);
    assert.equal(e.sourceContinuationScene,null);assert.equal(h.runtime.state().phase,CHUNK_SURF_PHASE.HORIZON);
    assert.equal(h.data().chunkSurf.sourceContinuation.exitReceipt.delivered,true);
    assert.equal(h.data().sourceDrive.status,'active');assert.equal(h.calls.filter(c=>c[0]==='drive').length,1);
    assert.equal(h.calls.filter(c=>c[0]==='horizon').length,1);scene.key({key:'e'});await Promise.resolve();
    assert.equal(h.calls.filter(c=>c[0]==='drive').length,1,'a released old scene cannot replay its completion callback');
    assert.equal(h.runtime.state().finale.route,null,'the onward road retains both original bust alternatives');
  }finally{h.close();}
  const failed=host({checkpoint,driveReady:false});try{
    const scene=await failed.e.beginSourceContinuation({checkpoint});await walkFinalDoor(scene);
    assert.equal(failed.runtime.state().sourceContinuation.completed,true);
    assert.equal(failed.runtime.state().sourceContinuation.exitReceipt.delivered,false,'failed drive initialization leaves its receipt pending for reload recovery');
  }finally{failed.close();}
});

test('a completed previous drive is not replayed when the extension final door is revisited',async()=>{
  const checkpoint=finalDoorCheckpoint(freshSourceContinuation({runId:'main-continuation'})),h=host({checkpoint,driveReturned:true});
  try{
    const scene=await h.e.beginSourceContinuation({checkpoint});await walkFinalDoor(scene);
    assert.equal(h.calls.filter(c=>c[0]==='drive').length,0);assert.equal(h.data().sourceDrive.status,'returned');
    assert.equal(h.runtime.state().sourceContinuation.exitReceipt.delivered,true);assert.equal(h.runtime.state().phase,CHUNK_SURF_PHASE.HORIZON);
  }finally{h.close();}
});

test('the actual resume branch keeps the authoritative onward road position when an older Source view is stale',async()=>{
  const{runtime}=field();crossEdge(runtime);
  const out=runtime.completeContinuation(completeAtFinalDoor(runtime.sourceContinuationEntry('forward').checkpoint));
  const h=host({source:copy(runtime.state())}),e=h.e;try{
    e.px=out.checkpoint.x;e.py=out.checkpoint.y;
    assert.notEqual(h.data().sourceView.y,e.py,'fixture retains the older original-field view while px/py are the onward threshold');
    const start=main.indexOf('  const resumedContinuation=chunkSurfRuntime?.state?.().sourceContinuation;');
    const end=main.indexOf('  // The tutorial\'s own state',start);assert.ok(start>=0&&end>start);
    const resume=Function('environment',`with(environment){${main.slice(start,end)}}`);resume(e);
    await Promise.resolve();await Promise.resolve();
    assert.deepEqual({x:e.px,y:e.py},{x:out.checkpoint.x,y:out.checkpoint.y},'recovery must not overwrite the saved road pose with old sourceView coordinates');
    assert.equal(h.data().chunkSurf.sourceContinuation.exitReceipt.delivered,true);
  }finally{h.close();}
});

test('stale resume checkpoints cannot bypass Contact, bust or local-checkpoint ownership',async()=>{
  const checkpoint={...freshSourceContinuation({runId:'main-continuation'}),status:'active'};
  for(const source of [committedContact(),...['accepted','declined'].map(decision=>{
    const state=reduceChunkSurf(initial(),{type:'SOURCE_NORMAL_EXIT'});return{...state,finale:{...state.finale,bust:{...state.finale.bust,decision}},sourceContinuation:checkpoint};
  })]){
    const h=host({source:{...source,sourceContinuation:checkpoint}});try{
      assert.equal(await h.e.beginSourceContinuation({checkpoint}),false);assert.equal(h.e.sourceContinuationScene,null);assert.equal(h.renderers.length,0);
    }finally{h.close();}
  }
  const h=host({checkpoint});try{
    assert.equal(await h.e.beginSourceContinuation({checkpoint:{...checkpoint,runId:'other-run'}}),false);assert.equal(h.renderers.length,0);
  }finally{h.close();}
});

test('renderer initialization failure permits actual E return without advancing or losing the original world',async()=>{
  const h=host({initialize:async()=>{throw Error('test asset unavailable');}});try{
    const scene=await h.e.beginSourceContinuation(),before=scene.serialize();assert.equal(scene.view().ready,false);assert.match(scene.view().error,/asset unavailable/);
    scene.key({key:'w'});scene.update(.25);assert.deepEqual(scene.serialize(),before);scene.key({key:'e'});await Promise.resolve();
    assert.equal(h.e.sourceContinuationScene,null);assert.equal(h.runtime.state().horizon.entered,false);assert.equal(h.disposed(),1);
  }finally{h.close();}
});

test('independent world look drains actual pointer intent while the continuation owns its camera',async()=>{
  const h=host(),e=h.e;try{
    await e.beginSourceContinuation();let looks=0;
    e.motionInput=new InputManager({target:null,documentRef:null,navigatorRef:null});e.motionInput.setPointerLocked(true);
    e.motionInput.addPointerDelta(60,-25);e.holdUnavailableGameplayInput=()=>false;e.RENDERER='3d';e.costumeInspectionScene=null;
    e.CONTROLLER={controllerMotionAxes:()=>{throw Error('the borrowed scene must not sample original-world look');}};
    e.R3.r3dLook=()=>{looks++;};
    const tickLook=production('tickIndependentLook','\nfunction mouseLookSensitivity(',e);tickLook(.1);
    assert.equal(e.motionInput.pointerDx,0);assert.equal(e.motionInput.pointerDy,0);assert.equal(looks,0);
  }finally{h.close();}
});

test('releasing during asynchronous initialization cannot resurrect its local camera or scene',async()=>{
  let resolveLoad;const h=host({initialize:()=>new Promise(resolve=>{resolveLoad=resolve;})}),e=h.e;try{
    const pending=e.beginSourceContinuation(),scene=e.sourceContinuationScene;await Promise.resolve();
    const original=scene.serialize().returnPose;e.releaseSourceContinuation();resolveLoad(true);await pending;
    assert.equal(e.sourceContinuationScene,null);assert.equal(scenes.has('source-continuation'),false);assert.equal(scene.view().closed,true);assert.equal(scene.view().ready,false);
    assert.equal(h.disposed(),1);assert.deepEqual(h.look(),{yaw:original.yaw,pitch:original.pitch});
    const checkpoint=copy(h.data().chunkSurf.sourceContinuation);scene.update(.25);scene.key({key:'e'});assert.deepEqual(h.data().chunkSurf.sourceContinuation,checkpoint);
  }finally{h.close();}
});

test('the actual return-to-title cleanup saves local progress before restoring and checkpointing original Source gaze',async()=>{
  const h=host(),e=h.e;try{
    const scene=await e.beginSourceContinuation(),original=scene.serialize().returnPose;scene.setLook({yaw:-2,pitch:.4});
    Object.assign(e,{costumeInspectionScene:null,sourcePubAudio:null,sourceRepriseWorldLease:null,storyMode:true,hushRunActive:false,activeBattleId:null,
      godBattleOpen:false,sampleFieldEnabled:false,bellTowerImpactActive:true,bellTowerCollisionEnabled:false,RENDERER:'3d',FP:{isLoaded:()=>false},
      usingPlan:()=>false,usingSpecialSpace:()=>true,stopBellTowerRuntime(){},stopHushAudioRuntime(){},apparitionDirector:{reset(){}},resetHorrorState(){},PRES:{despawn(){}},
      setGameplayPaused(){},setGameChrome(){},silenceSampleField(){},resetRunAudio(){},FEAR:{setFear(){}},godFxOverride:{},makeTitle:()=>({id:'title'}),refreshHushAvailability:async()=>{}});
    e.windowChoreography.emergencyRestore=()=>Promise.resolve();e.windowChoreography.beginTitle=()=>{};
    e.saveSourceView=production('saveSourceView','\n// DROPPING THE SOURCE RUNTIME',e);
    const title=production('returnToTitle','\nfunction showReturnReport(',e);title();await Promise.resolve();
    assert.equal(e.sourceContinuationScene,null);assert.equal(scenes.top().id,'title');assert.equal(h.disposed(),1);
    assert.equal(h.data().chunkSurf.sourceContinuation.status,'active');assert.equal(h.data().chunkSurf.sourceContinuation.yaw,-2);
    assert.deepEqual(h.data().sourceView,{x:original.x,y:original.y,yaw:original.yaw,pitch:original.pitch});
  }finally{h.close();}
});
