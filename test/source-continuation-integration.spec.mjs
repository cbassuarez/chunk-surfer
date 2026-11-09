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
import {installSourceRest} from '../src/game/source-rest-runtime.js';
import {createSourceRestMusic} from '../src/audio/source-rest-music.js';
import {createSourceRestScores} from '../src/audio/source-rest-scores.js';
import {nightDeadlinePending} from '../src/game/night-deadline.js';
import {sourceContinuationRecordingReturnProps,sourceContinuationRecordingDestination} from '../src/game/source-continuation-contact.js';
import {claimSourceRecording} from '../src/game/source-recording-custody.js';
import {releaseSourceRecordingCassetteLabels} from '../src/render/source-recording-cassette.js';
import {createSourceRestBreath} from '../src/audio/source-rest-breath.js';
import {createSourceRestWeather} from '../src/audio/source-rest-weather.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation} from '../src/game/source-continuation.js';
import {resumeSourceContinuationHandoff} from '../src/game/source-continuation-handoff.js';
import {SOURCE_CONTINUATION} from '../src/data/source-continuation.js';
import {SOURCE_III_ARCHIPELAGO} from '../src/data/source-continuation-archipelago.js';
import {InputManager} from '../src/input/input-manager.js';
import * as REC from '../src/game/recordist.js';
import {resolveTorchLook} from '../src/render/lighting-model.js';
import {applyFieldKitTorchLook} from '../src/render/field-kit-torch.js';
import {applyHushTorchInterference,inactiveHushField} from '../src/game/hush-field.js';

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
  return normalizeSourceContinuation({...checkpoint,status:'active',phase:'catch',level:0,
    expedition:{version:1,visited:[...SOURCE_III_ARCHIPELAGO.mainIslandIds],activeSeconds:0,travelMetres:0,chases:[]},
    ...SOURCE_CONTINUATION.catch.finalApproach,fall:null,recovery:null});
}
function completeAtFinalDoor(checkpoint){
  let result=stepSourceContinuation(finalDoorCheckpoint(checkpoint),{interact:true,renderReady:true});
  assert.equal(result.state.doorOpen['catch-final'],true,'E opens the actual final goods pair');
  assert.equal(result.state.completed,false,'opening alone does not transfer the player');
  // The final approach faces east. Ordinary forward movement follows that
  // physical yaw through the existing goods pair.
  for(let i=0;i<160&&result.event?.type!=='complete';i++)result=stepSourceContinuation(result.state,{dt:.05,forward:1,renderReady:true});
  assert.equal(result.event?.type,'complete','walking through the open final passage grants the exit receipt');
  assert.ok(result.state.x>SOURCE_CONTINUATION.catch.finalDoor.x);
  return result.state;
}
async function walkFinalDoor(scene){
  scene.key({key:'e'});assert.equal(scene.serialize().doorOpen['catch-final'],true);assert.equal(scene.serialize().completed,false);
  scene.key({key:'w'});
  for(let i=0;i<160&&scene.serialize().status==='active';i++)scene.update(.05);
  scene.keyup({key:'w'});await Promise.resolve();await Promise.resolve();
  assert.equal(scene.serialize().completed,true,'the real scene receives movement through the final door');
  scene.update(.2);scene.update(.2);await Promise.resolve();await Promise.resolve();
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
  assert.equal(back.checkpoint.phase,'catch');assert.equal(back.checkpoint.level,SOURCE_CONTINUATION.catch.levels-1);assert.equal(back.checkpoint.completed,true);
  assert.equal(back.checkpoint.direction,'reverse');
  for(const key of ['x','z','feet'])assert.equal(back.checkpoint[key],SOURCE_CONTINUATION.catch.finalApproach[key]);
  const returned=runtime.returnContinuation(back.checkpoint);assert.equal(returned.handled,true);
  assert.equal(runtime.state().phase,CHUNK_SURF_PHASE.LANDSCAPE,'the preexisting field-return reducer owns the phase transition');
  assert.equal(runtime.state().sourceContinuation.completed,true);
  const resumed=runtime.sourceContinuationEntry('forward');
  assert.equal(resumed.checkpoint.phase,'catch');assert.equal(resumed.checkpoint.level,SOURCE_CONTINUATION.catch.levels-1);
  assert.equal(resumed.checkpoint.completed,true);assert.equal(resumed.checkpoint.direction,'forward');
  assert.equal(runtime.state().finale.route,null,'returning preserves the possibility of choosing the original route later');
});

// Exercise actual host callbacks with the real runtime, controller and scene.
// Only the renderer/audio devices and the existing onward-drive owner are
// replaced; boot, canvas creation and game processes never run in this suite.
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function balancedEnd(source,start,open,close){
  assert.equal(source[start],open);let depth=0,quote='',line=false,block=false;
  for(let i=start;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(line){if(ch==='\n')line=false;continue;}
    if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue;}
    if(quote){if(ch==='\\'){i++;continue;}if(ch===quote)quote='';continue;}
    if(ch==='/'&&next==='/'){line=true;i++;continue;}
    if(ch==='/'&&next==='*'){block=true;i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}
    if(ch===open)depth++;else if(ch===close&&--depth===0)return i;
  }
  assert.fail(`Production ${open}${close} block has no closing delimiter`);
}
const production=(name,next,environment)=>{
  const at=main.indexOf(`function ${name}(`),boundary=main.indexOf(next,at);assert.ok(at>=0&&boundary>at,name);
  const parameters=main.indexOf('(',at),parametersEnd=balancedEnd(main,parameters,'(',')');
  const body=main.indexOf('{',parametersEnd),end=balancedEnd(main,body,'{','}')+1;
  assert.ok(end<=boundary,`${name} closes before its following marker`);
  const start=main.slice(Math.max(0,at-6),at)==='async '?at-6:at;
  // Match Vite's production build flag before compiling the extracted host
  // function as a script. DEV-only preview hooks are not part of this route.
  const source=main.slice(start,end).trim().replaceAll('import.meta.env.DEV','false');
  return Function('environment',`with(environment){return (${source});}`)(environment);
};

function host({source=initial(),checkpoint=null,initialize=null,driveReady=true,driveReturned=false,recorderState={},flags={},lostItems=[]}={}){
  scenes.clear();
  const runtime=createSourceSpaceRuntime({initialState:{...source,edgeDoorOpen:true}}),at=runtime.edgeDoorApproach();
  runtime.setPlayerPosition(at);
  const run=freshRunRecord({id:'main-continuation',startedAt:1000}),base=freshSave({run});
  // Use the real carried-instrument rules. This file's explicitly bounded host
  // fixture owns and restores the singleton; audio/canvas devices stay mocked.
  const originalRecorder=copy(REC.recState()),originalDifficulty=REC.recordistDifficulty();
  REC.loadRecState(base.rec);Object.assign(REC.recState(),{phase:'idle',light:true,...recorderState});
  const missingItems=new Set(lostItems);
  if(checkpoint)runtime.setContinuationCheckpoint(checkpoint);
  let data={...base,flags:{...base.flags,...flags},rec:REC.saveRecState(),chunkSurf:runtime.state(),sourceView:{x:at.x,y:at.y,yaw:.7,pitch:-.04},
    sourceDrive:{...base.sourceDrive,...(driveReturned?{status:'returned'}:{})}},look={yaw:.7,pitch:-.04},focused=true,disposed=0,playing=false,audioOptions=null;
  const calls=[],renderers=[],recorderWindows=[],mediaPresentations=[],audio={stop:()=>calls.push(['audio-stop']),pause:()=>calls.push(['audio-pause']),event(){},update(){}};
  const e={sourceContinuationScene:null,sourceContinuationRenderer:null,sourceContinuationAudio:null,sourceEarthfallAudio:null,sourceContinuationTrace:[],sourceRestBreath:null,sourceRestWeather:null,sourceRestLiveMusic:null,endingStaticMix:null,firstStrikeScene:null,firstStrikeAudio:null,
    sourceEarthfallNeeded:()=>false,sourceFalseReturnNeeded:()=>false,sourceContinuationStudyRotation:0,resumeSourceContinuationHandoff,
    controllerGameplayAxes:()=>({moveX:0,moveY:0,turnX:0,lookY:0}),runPlayDurationClock:{suspend(){}},
    clamp:(n,lo,hi)=>Math.max(lo,Math.min(hi,n)),mouseLookSensitivity:()=>2,mouseInvertY:()=>false,shakeMode:()=> 'full',noteExteriorArrivalControl(){},cancelLastExposure(){},
    sourcePubScene:null,sourceDriveSession:null,coastalMemoryScene:null,standingTearScene:null,sourceReturnFlashbackScene:null,chunkSurfRuntime:runtime,paused:false,actx:null,sfxGain:null,musicGain:null,
    px:at.x,py:at.y,renderMove:{},motionRig:{},trail:[1],r3dCache:{physicalKey:'source',physicalGroup:'source-space',fogSize:2},
    getSave:()=>data,saveCommit:patch=>{data={...data,...patch};calls.push(['save',copy(patch)]);},scenes,
    // These host fixtures check lifecycle, not physics: a still body holds still.
    createSourceContinuationScene:options=>createSourceContinuationScene({...options,tides:false}),installSourceRest,createSourceRestMusic,createSourceRestScores:options=>createSourceRestScores({...options,createBach:value=>e.createSourceRestMusic(value)}),createSourceRestBreath,createSourceRestWeather,SOURCE_REST_SEATS,
    persistNightRestLock:()=>false,nightDeadlinePending,openSourceHushContact:()=>false,openSourceRecordingCassette:()=>false,roomLabel:id=>id,pressurePresentationSnapshot:()=>null,
    sourceContinuationRecordingReturnProps,releaseSourceRecordingCassetteLabels,P3:{},prewarmSourceRecordingCassetteMeshes:async()=>true,
    fireCue(){},CR:{fx(){}},dialogGain:null,master:null,
    REC,resolveTorchLook,applyFieldKitTorchLook,applyHushTorchInterference,inactiveHushField,
    itemLost:id=>missingItems.has(id),flagTest:id=>!!data.flags[id],flagGet:id=>data.flags[id],openPauseMenu:()=>calls.push(['pause-menu']),currentPerception:()=>({torch:1}),activeKitEffects:{},
    flashMode:()=> 'full',performance:{now:()=>1000},CUES:{CUE:{light:'light'},playCue:(id,options)=>calls.push(['cue',id,copy(options)])},
    R3:{r3dLookAngles:()=>({...look}),r3dFacing:()=>2,r3dSetLookAngles:value=>{look={yaw:value.yaw,pitch:value.pitch};},r3dSetFrontEndPlate(){},r3dSnapCameraOnNextFrame(){},r3dResetVfdMemory(){}},
    createSourceContinuationRenderer:options=>{let ready=false,dead=false;
      const renderer={initialize:async()=>{const result=initialize?await initialize():true;ready=result!==false;return result;},
        ready:()=>ready&&!dead,render:()=>ready&&!dead,torch:()=>options.getTorch(),clear(){},dispose:()=>{if(dead)return false;dead=true;disposed++;return true;}};
      renderers.push(renderer);return renderer;},
    createSourceContinuationAudio:options=>{audioOptions=options;return audio;},
    // These are device boundaries, not an alternate rest implementation.
    // Creation and ordinary frame updates never request or show a window.
    createSourceRestRecorderWindow:options=>{
      let requested=false,dead=false;
      const bridge={options,state:()=>({requested,visible:false,mode:requested?'contained':'closed',disposed:dead}),
        update(){calls.push(['rest-recorder-update']);return bridge.state();},
        toggle(){if(!dead){requested=!requested;calls.push(['rest-recorder-toggle',requested]);}return bridge.state();},
        renderFallback:()=>false,dispose(){if(!dead){dead=true;requested=false;calls.push(['rest-recorder-dispose']);}return bridge.state();}};
      recorderWindows.push(bridge);return bridge;
    },
    createSourceRestMediaPresentation:options=>{
      let latest=null;
      const bridge={options,update(value){latest=value;calls.push(['rest-media-update']);},
        stop(reason){latest=null;calls.push(['rest-media-stop',reason]);},snapshot:()=>latest};
      mediaPresentations.push(bridge);return bridge;
    },
    playSceneFootContact(){},clearSceneFootContacts(){},
    syncSourceRender:()=>calls.push(['restore-source']),usingSourceSpace:()=>true,
    PB:{stopPlayback:()=>{playing=false;calls.push(['stop-playback']);},isPlaying:()=>playing,tapeTake:id=>(REC.recState().tapes||[]).find(row=>row.id===id)||null},STORY:{stopAll:()=>calls.push(['stop-story'])},SPEECH:{clearSpeech(){},say(){}},RT:{setBed(){}},
    towerBellDirector:{suspend(){},resume:()=>calls.push(['resume-bells'])},bellPealPerformance:{suspend(){},resume(){}},
    windowChoreography:{leaveSource:async()=>{},requestSourceRestRecorder:async options=>{calls.push(['native-recorder-request',options]);return false;}},
    sourceWindowMedia:{stop(){}},frontEndSession:{markLive(){}},frontEndPlateOverride:null,
    ensureCtx(){},resetMotionInput:reason=>calls.push(['reset-input',reason]),pubRoomAudio:{stop(){},pause(){}},pubPressureAudio:null,sourcePubAudio:null,
    retireStandingTear(){return false;},releaseSourceRestEndingMusic(){return false;},
    resumeStandingTearFromSave(){return false;},
    cancelOutskirtDoorAnswer(){},stopOutskirtsStreetAudio(){},pauseOutskirtsLastLight(){},stopSourceShoreAudio(){},stopSourceDockDoorAudio(){},stopSourceCorridorRain(){},
    syncStationEdgeSound(){},syncElsewhereBeds(){},endHorizonScore(){},stopAllVoices(){},stopWorldLayerVoice(){},silenceAmbientDrone(){},endBootWeather(){},
    pushEvent:value=>calls.push(['error',value]),updateAudio(){},ensureInteractionFocus(){},
    document:{hidden:false,visibilityState:'visible',hasFocus:()=>focused},IS_TAURI:false,
    academicGhostDispatch:null,sourceShoreAudio:null,towerWarningAudio:null,openingArrivalAudio:null,openingCabRadio:null,openingVehicleScene:null,openingOvertureScene:null,chapelTapeTugHeld:false,recordingPressureVoices:new Set(),
    architectureDoorAudio:{pause:reason=>calls.push(['door-audio-pause',reason])},architectureDoorEvents:{hold:()=>calls.push(['door-events-hold'])},resetArchitectureDoorAudio:reason=>calls.push(['door-audio-reset',reason]),
    rememberChapelTapeDemandDeparture(){},activeRecordingSlate:null,liveRecordingPointerControls:new Set(),
    cancelApparitionApplause(){},setUiCueFocused(){},cancelControlScope(){},pointerMode:{release(){}},recoverInteractionAudio:async()=>{},
    enterHorizon:(reason,options)=>{assert.equal(runtime.state().phase,CHUNK_SURF_PHASE.HORIZON,'the runtime transition must precede the existing main handoff');calls.push(['horizon',reason,options]);},
    beginSourceDriveJourney:async()=>{calls.push(['drive']);if(!driveReady)return false;data={...data,sourceDrive:{...data.sourceDrive,status:'active'}};return{};},
  };
  e.sourcePresentationTorch=production('sourcePresentationTorch','\nasync function beginCoastalMemoryJourney(',e);
  e.sourceRecordingDisplayCustody=production('sourceRecordingDisplayCustody','\nfunction openSourceRecordingCassette(',e);
  e.sourceCameraPatch=production('sourceCameraPatch','\nfunction saveSourceView(',e);
  e.gameplayInputLifecycleActive=production('gameplayInputLifecycleActive','\nfunction holdUnavailableGameplayInput(',e);
  e.commitSourceContinuation=production('commitSourceContinuation','\nfunction releaseSourceContinuation(',e);
  e.releaseSourceContinuation=production('releaseSourceContinuation','\nasync function deliverSourceContinuationHandoff(',e);
  e.deliverSourceContinuationHandoff=production('deliverSourceContinuationHandoff','\nasync function beginSourceFalseReturn(',e);
  e.beginSourceContinuation=production('beginSourceContinuation','\nfunction sourcePubEntranceFrame(',e);
  e.cancelRecordingPressureAudio=production('cancelRecordingPressureAudio','\nfunction recordingPressureFrame(',e);
  e.onBlur=production('onBlur','\n// Focus, capture and a level head',e);
  return{e,runtime,calls,data:()=>data,look:()=>({...look}),focus:value=>{focused=value;},disposed:()=>disposed,renderers,recorderWindows,mediaPresentations,
    audioOptions:()=>audioOptions,playback:value=>{playing=!!value;},flag:(id,value)=>{data.flags={...data.flags,[id]:value};},missingItems,
    close(){try{if(e.sourceContinuationScene){e.commitSourceContinuation();e.releaseSourceContinuation();}scenes.clear();}
      finally{Object.assign(REC.recState(),originalRecorder);REC.configureDifficulty(originalDifficulty);}}};
}

test('actual DEV Contact and return fixtures survive canonical checkpointing and the full continuation/rest host',async()=>{
  const marker=main.indexOf('contactFixture:async(chapter,repeat,'),bodyAt=main.indexOf('=>{',marker)+2,
    end=balancedEnd(main,bodyAt,'{','}')+1;
  assert.ok(marker>=0&&bodyAt>marker);
  for(const chapter of ['II','III'])for(const recovery of [false,true]){
    const h=host(),e=h.e,at=sourceContinuationRecordingDestination(chapter);
    try{
      e.requestAnimationFrame=fn=>queueMicrotask(()=>fn(1000));
      // Native window/media devices are outside this CPU fixture. The actual
      // continuation scene, rest adapter, canonical state and physics remain.
      e.createSourceRestRecorderWindow=()=>({state:()=>({}),update(){},dispose(){},renderFallback(){},toggle(){}});
      e.createSourceRestMediaPresentation=()=>({update(){},stop(){}});
      e.sourceWindowMedia={stop(){}};
      const take={id:'native-proof-take',ordinal:1,roomId:'main_b3',place:'Studio B3',status:'accepted',counted:true,startSeconds:0,endSeconds:60,durationSeconds:60};
      e.PB.tapeTake=id=>id===take.id?take:null;
      const custody=claimSourceRecording(null,{runId:h.data().run.id,chapter:'II',contactId:'dev-contact-return',takes:[take],destination:at}).state;
      e.chunkSurfRuntime=createSourceSpaceRuntime({initialState:{...e.chunkSurfRuntime.state(),sourceRecordingCustody:recovery?custody:null}});
      await e.beginSourceContinuation({skipFalseReturn:true,skipEarthfall:true});
      e.sourceContinuationRecordingDestination=sourceContinuationRecordingDestination;
      e.activateSourceSpace=source=>{e.chunkSurfRuntime=createSourceSpaceRuntime({initialState:source,
        onState:next=>e.saveCommit({chunkSurf:next})});return e.chunkSurfRuntime;};
      const fixture=Function('environment',`with(environment){return (${main.slice(marker+'contactFixture:'.length,end)});}`)(e);
      const scene=await fixture(chapter,true,{recovery});
      assert.ok(scene?.sourceRest,'the actual main host installs its ordinary rest wrapper');
      const state=scene.serialize(),stored=e.chunkSurfRuntime.state().sourceContinuation;
      assert.equal(state.phase,chapter==='III'?'catch':'wrong-return');
      assert.ok(Math.hypot(state.x-at.x,state.z-at.z)<2.1,'the staged body is not silently replaced by the entry/refuge');
      assert.equal(stored.x,state.x);assert.equal(stored.z,state.z);assert.equal(stored.feet,state.feet);
      assert.equal(scene.view().focus?.type,recovery?'source-recording-return':'source-contact');
      assert.equal(scene.view().focus?.chapter,chapter);
      const staged=e.sourceContinuationTrace.filter(row=>row.type?.startsWith('DEV-contact-'));
      assert.equal(staged.at(-2).stagedNoticeSeconds,120,'QA setup receives an explicitly disclosed, finite notice interval');
      assert.equal(staged.at(-2).stored.x,state.x);assert.equal(staged.at(-2).stored.z,state.z);
      assert.equal(staged.at(-1).sameOwner,true);assert.equal(staged.at(-1).sameScene,true);
      assert.equal(staged.at(-1).storedAfterFrames.x,state.x);assert.equal(staged.at(-1).storedAfterFrames.z,state.z);
      assert.equal(staged.at(-1).focus.type,recovery?'source-recording-return':'source-contact');
      if(!recovery)assert.ok(Math.hypot(state.hush.x-state.x,state.hush.z-state.z)>1.05,'Contact does not begin overlapping the body');
      for(let tick=0;tick<120;tick++)scene.update(1/60);
      assert.equal(scene.serialize().x,state.x);assert.equal(scene.serialize().z,state.z);
      assert.equal(scene.view().focus?.type,recovery?'source-recording-return':'source-contact');
    }finally{h.close();}
  }
});

test('old twenty-second DEV Contact staging reproduces entrance recovery, while the disclosed review interval stays usable then expires normally',()=>{
  const marker=main.indexOf('contactFixture:async(chapter,repeat,'),end=main.indexOf('\n        press:',marker),
    fixtureSource=main.slice(marker,end),notice=Number(fixtureSource.match(/mode:'notice',notice:(\d+)/)?.[1]);
  assert.equal(notice,120);
  const make=seconds=>{const base=freshSourceContinuation({runId:'review-expiry'}),at={x:16,z:-20,feet:0,chartId:0,level:0,yaw:0,pitch:0};
    return normalizeSourceContinuation({...base,...at,phase:'wrong-return',status:'active',lastSafe:{...at},hush:{...base.hush,...at,z:-22,active:true,armed:true,mode:'notice',notice:seconds,trail:[]},counterweight:{...base.counterweight,active:false}});};
  let old=make(20),current=make(notice);const oldEvents=[],currentEvents=[];
  for(let tick=0;tick<132;tick++){
    const result=stepSourceContinuation(old,{dt:.25,renderReady:true});old=result.state;oldEvents.push(...result.events);
  }
  assert.ok(oldEvents.some(event=>event.type==='capture'&&event.reason==='hush-pressure'));
  assert.ok(oldEvents.some(event=>event.type==='recovered'));assert.equal(old.x,0);assert.equal(old.z,2);
  for(let tick=0;tick<240;tick++){
    const result=stepSourceContinuation(current,{dt:.25,renderReady:true});current=result.state;currentEvents.push(...result.events);
  }
  assert.equal(current.x,16);assert.equal(current.z,-20);assert.equal(current.hush.mode,'notice');assert.ok(current.hush.notice>59);
  assert.equal(currentEvents.some(event=>event.type==='capture'),false);
  for(let tick=0;tick<248&&!currentEvents.some(event=>event.type==='capture');tick++){
    const result=stepSourceContinuation(current,{dt:.25,renderReady:true});current=result.state;currentEvents.push(...result.events);
  }
  assert.ok(currentEvents.some(event=>event.type==='capture'&&event.reason==='hush-pressure'),'the bounded DEV notice does not disable ordinary pursuit');
});

test('the actual DEV fixture rejects a refused checkpoint or mismatched scene instead of silently reporting staging success',async()=>{
  const marker=main.indexOf('contactFixture:async(chapter,repeat,'),bodyAt=main.indexOf('=>{',marker)+2,
    end=balancedEnd(main,bodyAt,'{','}')+1;
  for(const failure of ['refused-checkpoint','mismatched-scene']){
    const h=host(),e=h.e;
    try{
      e.requestAnimationFrame=fn=>queueMicrotask(()=>fn(1000));
      e.sourceContinuationRecordingDestination=sourceContinuationRecordingDestination;
      e.activateSourceSpace=source=>{
        e.chunkSurfRuntime=createSourceSpaceRuntime({initialState:source});
        if(failure==='refused-checkpoint')e.chunkSurfRuntime.setContinuationCheckpoint=()=>false;
      };
      let opened=0;e.beginSourceContinuation=async()=>{opened++;return{id:'source-continuation',serialize:()=>({x:0,z:2,feet:0,chartId:0,phase:'wrong-return'}),view:()=>({focus:null})};};
      const fixture=Function('environment',`with(environment){return (${main.slice(marker+'contactFixture:'.length,end)});}`)(e);
      await assert.rejects(fixture('II',true),failure==='refused-checkpoint'?/checkpoint was not retained/:/scene did not retain/);
      assert.equal(opened,failure==='refused-checkpoint'?0:1);
      assert.equal(e.sourceContinuationTrace.at(-1).earnedProgression,false);
      if(failure==='mismatched-scene'){assert.equal(e.sourceContinuationTrace.at(-1).actual.x,0);assert.equal(e.sourceContinuationTrace.at(-1).sameScene,false);}
    }finally{h.close();}
  }
});

test('main entry waits for actual renderer readiness, then an opened physical return restores the original body and gaze',async()=>{
  let resolveLoad;const h=host({initialize:()=>new Promise(resolve=>{resolveLoad=resolve;})}),e=h.e;
  try{
    const initialView=copy(h.data().sourceView),promise=e.beginSourceContinuation(),scene=e.sourceContinuationScene;
    assert.ok(scene);assert.ok(scene.sourceRest,'the production continuation host installs the real rest adapter');assert.equal(scenes.top(),scene);assert.equal(scenes.blocksWorld(),true);assert.equal(scenes.allowsLook(),false);
    scene.key({key:'w'});scene.update(.2);assert.equal(scene.view().elapsed,0);assert.equal(scene.view().ready,false);
    assert.deepEqual(e.sourceCameraPatch(e.px,e.py),{},'borrowed renderer gaze never becomes original Source gaze');
    assert.deepEqual(h.data().sourceView,initialView);
    await Promise.resolve();resolveLoad(true);assert.equal(await promise,scene);assert.equal(scene.view().ready,true);
    scene.update(.2);assert.equal(scene.view().z,SOURCE_CONTINUATION.spawn.z,'loading dropped held movement instead of queueing it');
    scene.setLook({yaw:Math.PI,pitch:.1});assert.equal(scene.view().focus?.type,'return');
    const original=scene.serialize().returnPose;scene.key({key:'e'});
    assert.equal(e.sourceContinuationScene,scene,'the handle alone does not return the player');
    assert.equal(scene.serialize().status,'active');
    for(let i=0;i<4;i++)scene.update(.2);
    scene.key({key:'w'});for(let i=0;i<40&&scene.serialize().status==='active';i++)scene.update(.05);scene.keyup({key:'w'});
    assert.equal(scene.serialize().status,'returned','the actual body crossed the opened return plane');
    assert.ok(scene.serialize().z>3.5+SOURCE_CONTINUATION.bodyRadius);
    scene.update(.2);scene.update(.2);await Promise.resolve();
    assert.equal(e.sourceContinuationScene,null);assert.equal(scenes.has('source-continuation'),false);
    assert.equal(h.data().chunkSurf.sourceContinuation.status,'returned');
    assert.deepEqual({x:e.px,y:e.py},{x:original.x,y:original.y});assert.deepEqual(h.look(),{yaw:original.yaw,pitch:original.pitch});
    assert.deepEqual(h.data().sourceView,{x:original.x,y:original.y,yaw:original.yaw,pitch:original.pitch});
    assert.equal(h.disposed(),1,'the device owner is disposed once despite scene/host cleanup both calling it');
    assert.equal(h.calls.filter(c=>c[0]==='drive').length,0);assert.equal(h.runtime.state().horizon.entered,false);
  }finally{h.close();}
});

test('ordinary Source entry and presentation updates leave the optional recorder window closed',async()=>{
  for(const checkpoint of [null,finalDoorCheckpoint(freshSourceContinuation({runId:'main-continuation'}))]){
    const h=host({checkpoint});try{
      const scene=await h.e.beginSourceContinuation({checkpoint});
      assert.equal(h.recorderWindows.length,1);assert.equal(h.mediaPresentations.length,1);
      assert.equal(scene.sourceRestRecorder,h.recorderWindows[0]);assert.equal(scene.sourceRestMedia,h.mediaPresentations[0]);
      scene.update(.1);scene.syncRestPresentation();scene.syncRestPresentation({held:true});
      assert.equal(h.calls.filter(row=>row[0]==='rest-recorder-update').length,2);
      assert.equal(h.calls.filter(row=>row[0]==='rest-media-update').length,2);
      assert.equal(scene.sourceRestRecorder.state().requested,false);
      assert.equal(h.calls.some(row=>row[0]==='rest-recorder-toggle'||row[0]==='native-recorder-request'),false,
        'constructing the host or syncing its presentation cannot stand in for the player choosing the recorder');
      assert.equal(scene.sourceRestRecorder.renderFallback(),false);
      h.e.releaseSourceContinuation();assert.equal(scene.sourceRestRecorder.state().disposed,true);
      assert.equal(h.calls.filter(row=>row[0]==='rest-recorder-dispose').length,1);
      assert.ok(h.calls.some(row=>row[0]==='rest-media-stop'&&row[1]==='scene-exit'));
    }finally{h.close();}
  }
});

test('the production Source II host keeps one performance through approach, sitting and standing',async()=>{
  const seat=SOURCE_REST_SEATS[0],start={...seat.discovery,feet:seat.feet,
    phase:seat.phase,chartId:seat.chartId,level:seat.level};
  const checkpoint=normalizeSourceContinuation({...freshSourceContinuation({runId:'main-continuation'}),
    status:'active',...start,lastSafe:{...start}});
  const h=host({checkpoint}),e=h.e,events=[];let active=false,time=11.25;
  const owner={start(){events.push('start');active=true;return true;},stop(){events.push('stop');active=false;},
    finishAfterCycle(){events.push('finish');},dispose(){events.push('dispose');},
    update(){},snapshot:()=>({active,playing:active,failed:null,currentTime:time,duration:720})};
  e.createSourceRestMusic=()=>owner;
  try{
    const scene=await e.beginSourceContinuation({checkpoint});assert.ok(scene?.view().ready);
    scene.update(.05);assert.deepEqual(events,['start'],'the performance starts on Source II entry');
    assert.equal(scene.sourceRest.focus(),null,'the starting point requires a genuine approach');
    // Follow the actual dogleg; the former straight preview would begin
    // with the player's body intersecting the newly authored window jamb.
    for(const target of [{x:seat.approach.x,z:start.z},seat.approach]){
      for(let i=0;i<120;i++){
        const at=scene.view(),dx=target.x-at.x,dz=target.z-at.z;
        if(Math.hypot(dx,dz)<.05)break;
        scene.setLook({yaw:Math.atan2(dx,-dz),pitch:0});scene.key({key:'w'});scene.update(.025);
      }
      scene.keyup({key:'w'});
    }
    scene.setLook({yaw:Math.atan2(seat.x-seat.approach.x,seat.approach.z-seat.z),pitch:0});
    assert.ok(scene.sourceRest.focus(),'walking reaches the actual supported seat');
    assert.deepEqual(events,['start']);time=17.5;
    scene.key({key:'e'});
    assert.equal(scene.sourceRest.view().mode,'sitting');assert.equal(scenes.top()?.id,'source-rest:wrong-return');
    assert.deepEqual(events,['start'],'sitting does not start a second source or stop the first');
    assert.equal(owner.snapshot().currentTime,17.5,'sitting does not seek or replace the recording');
    scene.syncRestPresentation();
    assert.equal(h.calls.some(row=>row[0]==='rest-recorder-toggle'||row[0]==='native-recorder-request'),false,
      'sitting and the ordinary presentation callback do not open the optional recorder');
    scenes.key({key:'r',ctrlKey:true});scenes.key({key:'r',repeat:true});
    assert.equal(h.calls.some(row=>row[0]==='rest-recorder-toggle'),false,'modified and repeated keys do not request it');
    scenes.key({key:'r',code:'KeyR'});
    assert.deepEqual(h.calls.filter(row=>row[0]==='rest-recorder-toggle'),[['rest-recorder-toggle',true]],
      'the real conversation key reaches main’s onRecorder callback exactly once');
    assert.equal(scene.sourceRestRecorder.state().requested,true);assert.equal(scenes.top()?.id,'source-rest:wrong-return');
    scenes.key({controllerAction:'recorder'});
    assert.deepEqual(h.calls.filter(row=>row[0]==='rest-recorder-toggle'),[['rest-recorder-toggle',true],['rest-recorder-toggle',false]],
      'the same explicit callback closes it through the controller action');
    assert.deepEqual(events,['start'],'operating the recorder presentation does not replace or restart the score');
    scenes.key({key:'Escape'});
    assert.ok(h.calls.some(c=>c[0]==='pause-menu'),'Escape uses the ordinary pause owner');
    scenes.key({key:'e'});
    for(let i=0;i<6;i++)scene.update(.2);
    assert.equal(scene.sourceRest.view().mode,'idle');assert.deepEqual(events,['start'],'standing keeps the performance');
    assert.equal(owner.snapshot().currentTime,17.5);
  }finally{h.close();}
});

test('the production host stops the carried Source II performance when the scene is in Source III',async()=>{
  const checkpoint=finalDoorCheckpoint(freshSourceContinuation({runId:'main-continuation'})),h=host({checkpoint}),e=h.e;
  const events=[];let active=true;
  e.createSourceRestMusic=()=>({start(){events.push('start');active=true;},stop(){events.push('stop');active=false;},
    dispose(){events.push('dispose');},finishAfterCycle(){},update(){},snapshot:()=>({active,playing:active,failed:null})});
  try{
    const scene=await e.beginSourceContinuation({checkpoint});assert.equal(scene.view().phase,'catch');
    scene.update(.05);assert.equal(active,false);assert.deepEqual(events,['stop']);
    scene.update(.05);assert.deepEqual(events,['stop'],'Source III does not restart or repeatedly stop the recording');
  }finally{h.close();}
});

test('pause, lost focus and blur freeze the real scene and discard held movement before resume',async()=>{
  const h=host(),e=h.e;try{
    const scene=await e.beginSourceContinuation();scene.key({key:'w'});scene.update(.1);const moved=scene.view();assert.ok(moved.z<2);
    scene.key({key:'Escape'});scene.pause();e.paused=true;scenes.push({id:'pause',blocksWorld:true,blocksInput:true});
    scenes.update(.2);assert.equal(scene.view().elapsed,moved.elapsed);assert.equal(scene.view().z,moved.z);
    scenes.pop();e.paused=false;scene.update(.1);assert.equal(scene.view().z,moved.z,'pause cleared the held key');
    let pressureStops=0;
    for(let i=0;i<2;i++)e.recordingPressureVoices.add({stop:()=>pressureStops++});
    scene.key({key:'w'});h.focus(false);e.onBlur();scene.update(.2);const blurred=scene.view();
    assert.equal(pressureStops,2,'blur stops every owned recording-pressure voice');assert.equal(e.recordingPressureVoices.size,0);
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

test('the actual host supplies the carried torch to the renderer and F operates that same instrument',async()=>{
  const h=host(),e=h.e;try{
    const scene=await e.beginSourceContinuation(),renderer=h.renderers[0],before=copy(h.data());
    assert.equal(renderer.torch().on,true);assert.ok(renderer.torch().look.power>0);
    scene.key({key:'f'});
    assert.equal(REC.lightOn(),false,'F reaches the real recorder-owned switch');
    assert.equal(renderer.torch().on,false,'the renderer reads the changed same instrument');
    assert.equal(renderer.torch().look.power,0,'an off switch cannot retain an invented preview beam');
    assert.equal(h.calls.filter(c=>c[0]==='cue'&&c[1]==='light').length,1);
    assert.equal(h.calls.filter(c=>c[0]==='cue').at(-1)[2].rate,.92);
    scene.key({key:'f'});assert.equal(REC.lightOn(),true);assert.ok(renderer.torch().look.power>0);
    assert.equal(h.data().rec.battery,REC.batteryLevel());
    for(const key of ['flags','sourceDrive','sourcePub','items','takes'])assert.deepEqual(h.data()[key],before[key],`${key} is untouched by operating the torch`);
    assert.equal(h.data().rec.injuries,before.rec.injuries);
  }finally{h.close();}
});

test('Source presentation cannot restore a depleted, lost or unfitted carried torch',async()=>{
  for(const fixture of [
    {recorderState:{light:false,battery:0},label:'depleted'},
    {lostItems:['torch'],label:'lost'},
    {recorderState:{light:false,battery:1},flags:{'van.bench.v2':true,'kit.fitted':false,'van.packed.flashlight':false},label:'unfitted'},
  ]){
    const h=host(fixture);try{
      const scene=await h.e.beginSourceContinuation(),renderer=h.renderers[0],battery=REC.batteryLevel();
      assert.equal(renderer.torch().on,false,`${fixture.label} lamp starts physically off`);
      assert.equal(renderer.torch().look.power,0);
      const calls=h.calls.length;scene.key({key:'f'});scene.update(.1);
      assert.equal(renderer.torch().on,false,`${fixture.label} instrument cannot be restored by a detached presentation`);
      assert.equal(renderer.torch().look.power,0);assert.equal(REC.batteryLevel(),battery);
      assert.equal(h.calls.slice(calls).filter(c=>c[0]==='cue').length,0,'a refused switch makes no false activation cue');
    }finally{h.close();}
  }
});

test('actual metered torch drain freezes with loading, pause and hidden state, and depletion is checkpointed once',async()=>{
  let resolveLoad;const h=host({flags:{'torch.metered':true},recorderState:{light:true,battery:.0001},initialize:()=>new Promise(resolve=>{resolveLoad=resolve;})}),e=h.e;
  try{
    const pending=e.beginSourceContinuation(),scene=e.sourceContinuationScene;
    scene.update(.25);assert.equal(REC.batteryLevel(),.0001,'loading cannot consume an unseen instrument interval');
    await Promise.resolve();resolveLoad(true);await pending;
    scene.pause();scene.update(.25);assert.equal(REC.batteryLevel(),.0001);
    scene.resume();e.document.hidden=true;scene.update(.25);assert.equal(REC.batteryLevel(),.0001);
    e.document.hidden=false;scene.update(.1);
    assert.equal(REC.batteryLevel(),0);assert.equal(REC.lightOn(),false);
    assert.equal(h.renderers[0].torch().look.power,0);
    assert.equal(h.calls.filter(c=>c[0]==='cue'&&c[2].rate===.72).length,1,'one physical depletion produces one brownout cue');
    scene.checkpoint();assert.equal(h.data().rec.battery,0,'the actual host checkpoint includes the consumed carried state');
    scene.update(.2);assert.equal(h.calls.filter(c=>c[0]==='cue'&&c[2].rate===.72).length,1);
  }finally{h.close();}
});

test('the actual host audio protection follows recording, listening and playback instead of scene decoration',async()=>{
  const h=host();try{
    await h.e.beginSourceContinuation();const protection=h.audioOptions().protectedAudio;
    assert.equal(protection(),false);
    for(const phase of ['recording','listening']){
      REC.recState().phase=phase;assert.equal(protection(),true,`${phase} owns the acoustic protection`);
    }
    REC.recState().phase='idle';h.playback(true);assert.equal(protection(),true);
    h.playback(false);assert.equal(protection(),false);
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

test('independent look applies actual pointer intent to the continuation camera without turning the parked world',async()=>{
  const h=host(),e=h.e;try{
    const scene=await e.beginSourceContinuation(),before=scene.lookAngles();let looks=0;
    e.motionInput=new InputManager({target:null,documentRef:null,navigatorRef:null});e.motionInput.setPointerLocked(true);
    e.motionInput.addPointerDelta(60,-25);e.holdUnavailableGameplayInput=()=>false;e.RENDERER='3d';e.costumeInspectionScene=null;
    e.CONTROLLER={controllerMotionAxes:()=>{throw Error('the borrowed scene must not sample original-world look');}};
    e.R3.r3dLook=()=>{looks++;};
    const tickLook=production('tickIndependentLook','\nfunction mouseLookSensitivity(',e);tickLook(.1);
    assert.equal(e.motionInput.pointerDx,0);assert.equal(e.motionInput.pointerDy,0);assert.equal(looks,0);
    assert.ok(Math.abs(scene.lookAngles().yaw-before.yaw-60*2*.0085)<1e-9);
    assert.ok(Math.abs(scene.lookAngles().pitch-before.pitch-25*2*.0068)<1e-9);
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
      usingPlan:()=>false,usingSpecialSpace:()=>true,retireStudentStrike(){},stopBellTowerRuntime(){},stopHushAudioRuntime(){},apparitionDirector:{reset(){}},resetHorrorState(){},PRES:{despawn(){}},
      setGameplayPaused(){},setGameChrome(){},silenceSampleField(){},resetRunAudio(){},FEAR:{setFear(){}},godFxOverride:{},makeTitle:()=>({id:'title'}),refreshHushAvailability:async()=>{}});
    e.windowChoreography.emergencyRestore=()=>Promise.resolve();e.windowChoreography.beginTitle=()=>{};
    e.saveSourceView=production('saveSourceView','\n// DROPPING THE SOURCE RUNTIME',e);
    const title=production('returnToTitle','\nfunction showReturnReport(',e);title();await Promise.resolve();
    assert.equal(e.sourceContinuationScene,null);assert.equal(scenes.top().id,'title');assert.equal(h.disposed(),1);
    assert.equal(h.data().chunkSurf.sourceContinuation.status,'active');assert.equal(h.data().chunkSurf.sourceContinuation.yaw,-2);
    assert.deepEqual(h.data().sourceView,{x:original.x,y:original.y,yaw:original.yaw,pitch:original.pitch});
  }finally{h.close();}
});

test('the live host asks each Source to pull on a still body; the scene alone does not',()=>{
  assert.match(main,/createSourceContinuationScene\(\{checkpoint:entry\.checkpoint,[^\n]*tides:true,/);
});
