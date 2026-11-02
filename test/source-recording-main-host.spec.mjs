import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeSourceRecordingInspectionHost} from '../src/game/source-recording-inspection-host.js';
import {claimSourceRecording,recoverSourceRecording} from '../src/game/source-recording-custody.js';
import {sourceContinuationRecordingReturnProps,sourceContinuationRecordingDestination} from '../src/game/source-continuation-contact.js';
import {freshSourceContinuation,normalizeSourceContinuation} from '../src/game/source-continuation.js';
import {nightDeadlinePending} from '../src/game/night-deadline.js';
import * as actualScenes from '../src/game/scenes.js';
import {createSourceRecordingInspectionScene} from '../src/game/source-recording-inspection.js';
import {releaseSourceRecordingCassetteLabels} from '../src/render/source-recording-cassette.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf('function sourceRecordingDisplayCustody(){'),end=main.indexOf('\nfunction openSourceHushContact(',start);
assert.ok(start>=0&&end>start);const source=main.slice(start,end);
function fixture(){
 const original={id:'take:2',ordinal:2,roomId:'main_b3',place:'Studio B3',status:'accepted',counted:true,startSeconds:60,endSeconds:120,durationSeconds:60,slate:{text:'B3. Take two.'}},
  other={...original,id:'take:1',ordinal:1,startSeconds:0,endSeconds:60,slate:{text:'B3. Take one.'}},destination=sourceContinuationRecordingDestination('II');
 let takes=[other,original],custody=claimSourceRecording(null,{runId:'night',chapter:'I',contactId:'repeat1',takes,destination}).state,
  body=normalizeSourceContinuation({...freshSourceContinuation({runId:'night'}),status:'active',x:16,z:-21.4,feet:0,yaw:0}),active=null,position=0,audioReady=false;
 body.counterweight.active=false;
 const calls={save:[],speech:[],opened:0,disposed:0,released:0,played:[],prewarm:[],errors:[],audioInit:0},data={run:{id:'night'},flags:{'bag.taken':true},nightDeadline:{phase:'warning'}},busy={recording:false,listening:false,lostItem:null};
 const runtime={sourceRecordingCustody:()=>custody,state:()=>({sourceRecordingCustody:custody}),recoverSourceRecording:options=>{const result=recoverSourceRecording(custody,options);custody=result.state;return result;}},
  owner={serialize:()=>body,releaseContact:()=>calls.released++};
 const PB={serializeTakes:()=>takes,tapeTake:id=>takes.find(row=>row.id===id)||null,isPlaying:()=>!!active,isArchivedPlaybackOwner:handle=>!!handle&&handle===active,
  playArchivedTake:(take,options)=>{if(!audioReady)return null;calls.played.push({take,options});position=options.offsetSeconds;return active={take};},tickPlayback(){},playbackSnapshot:()=>active?{elapsedSec:position}:null,stopPlayback:()=>{active=null;}};
 const scope=vm.createContext({sourceRecordingInspectionScene:null,sourceRecordingInspectionRenderer:null,sourceContinuationScene:owner,chunkSurfRuntime:runtime,
  nightDeadlinePending,getSave:()=>data,REC:{isRecording:()=>busy.recording,isListening:()=>busy.listening,saveRecState:()=>({stable:true})},PB,
  flagTest:id=>data.flags[id]===true,itemLost:id=>busy.lostItem===id,
  createSourceRecordingCassetteRenderer:()=>{calls.opened++;return{dispose:()=>calls.disposed++};},
  makeSourceRecordingInspectionHost:options=>makeSourceRecordingInspectionHost({...options,makeScene:value=>{scope.inspectionOptions=value;return{id:'source-recording-inspection'};}}),
  sourcePresentationTorch:()=>({on:false}),R3:{},P3:{},sourceContinuationRecordingReturnProps,releaseSourceRecordingCassetteLabels,
  ensureTapeAudio:()=>{calls.audioInit++;audioReady=true;},
  prewarmSourceRecordingCassetteMeshes:async options=>{calls.prewarm.push(options.recordings);return true;},
  paused:false,document:{hidden:false},gameplayInputLifecycleActive:()=>true,shakeMode:()=> 'full',saveCommit:patch=>calls.save.push(patch),
  SPEECH:{say:line=>calls.speech.push(line)},roomLabel:id=>id,pushEvent:error=>calls.errors.push(error),sourceContinuationTrace:[],ensureInteractionFocus(){},
  scenes:{push:scene=>{scope.pushed=scene;}},
 });
 vm.runInContext(source,scope);
 return{scope,calls,runtime,owner,data,busy,original,other,PB,request:{receiptId:custody.recordings[0].id,chapter:'II',locationId:destination.locationId},custody:()=>custody,
  takes:value=>{takes=value;},move:()=>{body={...body,x:body.x+20};},otherPlayback:()=>{active={id:'unrelated'};}};
}

test('actual main opens a physical inspection of the exact held take without automatically recovering it',()=>{
 const f=fixture();assert.equal(f.scope.openSourceRecordingCassette(f.request),true);assert.ok(f.scope.pushed);assert.equal(f.scope.inspectionOptions.recording.takeId,'take:2');
 assert.equal(f.calls.audioInit,1);assert.equal(f.calls.played.length,0);
 assert.equal(f.scope.inspectionOptions.recording.slate.text,'B3. Take two.');assert.equal(f.custody().recordings[0].status,'held');assert.equal(f.calls.save.length,0);assert.equal(f.calls.speech.length,0);
 f.scope.inspectionOptions.onExit({reason:'put-back',recovered:false});assert.equal(f.calls.save.length,0);assert.equal(f.custody().recordings[0].status,'held');assert.equal(f.calls.released,1);assert.equal(f.scope.sourceRecordingInspectionScene,null);
});

test('a missing actual recorder permits physical recovery but cannot audition or keep an owned preview sounding',async()=>{
 const f=fixture();f.busy.lostItem='recorder';assert.equal(f.scope.openSourceRecordingCassette(f.request),true);
 assert.equal(f.scope.inspectionOptions.presentation().recorderAvailable,false);
 assert.equal(await f.scope.inspectionOptions.onAudition({positionSeconds:0}),null);assert.equal(f.calls.played.length,0);
 f.busy.lostItem=null;const transport=await f.scope.inspectionOptions.onAudition({positionSeconds:0});assert.ok(transport);
 f.data.flags['bag.taken']=false;assert.equal(transport.snapshot().available,false);assert.equal(f.PB.isPlaying(),false);
 assert.equal(f.scope.inspectionOptions.onRecover(),true,'the physical tape can still be kept without inventing hardware');
});

test('audition uses the exact original interval rather than another take in the same room, and only explicit keep saves',async()=>{
 const f=fixture(),before=structuredClone([f.other,f.original]);f.scope.openSourceRecordingCassette(f.request);
 const transport=await f.scope.inspectionOptions.onAudition({positionSeconds:23});assert.ok(transport);assert.equal(f.calls.played[0].take.id,'take:2');assert.equal(f.calls.played[0].take.ordinal,2);assert.equal(f.calls.played[0].options.offsetSeconds,23);
 assert.equal(f.calls.save.length,0);assert.equal(f.custody().recordings[0].status,'held');transport.stop();
 assert.equal(f.scope.inspectionOptions.onRecover(),true);assert.equal(f.calls.save.length,1);assert.equal(f.calls.save[0].chunkSurf.sourceRecordingCustody.recordings[0].status,'recovered');assert.equal(f.calls.speech.length,1);
 assert.deepEqual([f.other,f.original],before);await Promise.resolve();assert.equal(f.calls.prewarm.length,1);
});

test('cold restored takes bind the real playback audio through actual main entry before a deliberate physical audition',async()=>{
 const PB=await import('../src/game/playback.js?source-cassette-cold-entry');
 class Param{setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}cancelScheduledValues(){}}
 class Node{constructor(){this.gain=new Param();this.frequency=new Param();this.playbackRate=new Param();}connect(node){return node;}disconnect(){}start(){this.started=true;}stop(){}}
 const ctx={currentTime:10,sampleRate:8000,sources:[],createGain:()=>new Node(),createBiquadFilter:()=>new Node(),
  createBuffer:(channels,length,rate)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return{duration:length/rate,getChannelData:index=>data[index]};},
  createBufferSource(){const node=new Node();this.sources.push(node);return node;}},bus=ctx.createGain(),originalBuffer=ctx.createBuffer(1,8000,8000),f=fixture();
 PB.playbackInit({chunkByKey:key=>key==='original-room-voice'?{buffer:originalBuffer}:null,pickGuest:()=>null});
 PB.loadTakes([f.other,{...f.original,audible:[['original-room-voice',.2]]}]);
 const original=PB.serializeTakes().at(-1),before=PB.serializeTakes(),head=PB.tapeTransport();
 assert.equal(PB.playArchivedTake(original),null);assert.equal(PB.playbackError(),null);assert.equal(ctx.sources.length,0);
 Object.assign(f.scope,{PB,actx:ctx,sfxGain:bus,master:null,ensureCtx:()=>{f.calls.audioInit++;},b3SpeakerAudio:{scheduleTapeCue(){throw Error('unrequested speaker cue');}},
  CUES:{playCue(){throw Error('unrequested transport sound');},CUE:{rewind:'rewind'}},createSamDialogVoice(){throw Error('unrequested slate');},readSlateAudio:async()=>null});
 const at=main.indexOf('function ensureTapeAudio(){'),until=main.indexOf('\nfunction finishRecordingSlate(',at);
 assert.ok(at>=0&&until>at);vm.runInContext(main.slice(at,until),f.scope);
 try{
  assert.equal(f.scope.openSourceRecordingCassette(f.request),true);assert.equal(f.calls.audioInit,1);assert.equal(PB.isPlaying(),false);assert.equal(ctx.sources.length,0);
  const transport=await f.scope.inspectionOptions.onAudition({positionSeconds:23});assert.ok(transport);assert.equal(transport.snapshot().available,true);
  assert.ok(ctx.sources.some(node=>node.started&&node.buffer===originalBuffer),'the original recorded room source is scheduled');
  assert.equal(PB.archivedPlaybackPosition().positionSeconds,23);transport.stop();
  assert.deepEqual(PB.serializeTakes(),before);assert.deepEqual(PB.tapeTransport(),head);assert.equal(f.custody().recordings[0].status,'held');assert.equal(f.calls.save.length,0);
 }finally{PB.stopPlayback();PB.loadTakes([]);}
});

test('stale owner/runtime/run/body or changed original take cannot save recovery through the old main callbacks',async()=>{
 for(const change of['owner','runtime','run','body','take']){
  const f=fixture();f.scope.openSourceRecordingCassette(f.request);
  if(change==='owner')f.scope.sourceContinuationScene={releaseContact:()=>assert.fail('stale owner released')};
  else if(change==='runtime')f.scope.chunkSurfRuntime={};else if(change==='run')f.data.run.id='other-night';else if(change==='body')f.move();
  else f.takes([f.other,{...f.original,id:'different-take'}]);
  assert.equal(f.scope.inspectionOptions.onRecover(),false,change);assert.equal(await f.scope.inspectionOptions.onAudition({positionSeconds:0}),null,change);
  assert.equal(f.calls.save.length,0);assert.equal(f.calls.speech.length,0);assert.equal(f.custody().recordings[0].status,'held');
 }
});

test('expired night and occupied transports deny main inspection before renderer allocation or save',()=>{
 for(const gate of['recording','listening','playback','pending','presenting','terminal']){
  const f=fixture();if(gate in f.busy)f.busy[gate]=true;else if(gate==='playback')f.otherPlayback();else f.data.nightDeadline.phase=gate;
  assert.equal(f.scope.openSourceRecordingCassette(f.request),false,gate);assert.equal(f.calls.opened,0);assert.equal(f.calls.audioInit,0);assert.equal(f.calls.save.length,0);
 }
});

test('an invalid receipt is rejected without stealing or recovering a same-room recording',()=>{
 const f=fixture();assert.equal(f.scope.openSourceRecordingCassette({...f.request,receiptId:'missing'}),false);assert.equal(f.calls.disposed,1);assert.equal(f.calls.save.length,0);assert.equal(f.custody().recordings[0].status,'held');
});

test('physical inspection releases the normal camera capture lease while its own precise object drag stays responsive',async()=>{
 const f=fixture(),at=main.indexOf('function gameplayWantsPointerCapture(){'),until=main.indexOf('\nfunction syncPointerMode(',at),
  scope=vm.createContext({RENDERER:'3d',storyMode:true,hushRunActive:false,inRogue:true,paused:false,scenes:actualScenes});
 vm.runInContext(main.slice(at,until),scope);actualScenes.clear();actualScenes.push({id:'source-continuation',allowsLook:true,blocksInput:true});assert.equal(scope.gameplayWantsPointerCapture(),true);
 const s=createSourceRecordingInspectionScene({recording:f.custody().recordings[0],renderer:{initialize:()=>true,ready:()=>true,render:()=>true,hitTest:()=>null}});
 try{
  actualScenes.push(s);await s.initialize();assert.equal(s.allowsLook,false);assert.equal(scope.gameplayWantsPointerCapture(),false);assert.equal(actualScenes.lookOwner(),null);
  const yaw=s.view().yaw;s.pointer({type:'pointerdown',button:0,clientX:100,clientY:100});s.pointer({type:'pointermove',clientX:160,clientY:100});s.pointer({type:'pointerup'});assert.ok(s.view().yaw>yaw);
  s.key({key:'Escape'});assert.equal(scope.gameplayWantsPointerCapture(),true);
 }finally{actualScenes.clear();}
});

test('actual main pause stops the inspection transport before a stacked pause freezes its update, and return never auto-auditions',async()=>{
 const PB=await import('../src/game/playback.js?source-cassette-stacked-pause'),{createSourceRecordingAudition}=await import('../src/game/source-recording-audition.js');
 class Param{setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}cancelScheduledValues(){}}
 class Node{constructor(){this.gain=new Param();this.frequency=new Param();this.playbackRate=new Param();}connect(node){return node;}disconnect(){}start(){}stop(){}}
 const ctx={currentTime:10,sampleRate:8000,createGain:()=>new Node(),createBiquadFilter:()=>new Node(),createBufferSource:()=>new Node(),
  createBuffer:(channels,length,rate)=>({duration:length/rate,getChannelData:()=>new Float32Array(length)})},buffer=ctx.createBuffer(1,8000,8000),f=fixture();
 PB.playbackInit({ctx,bus:ctx.createGain(),chunkByKey:key=>key==='original'?{buffer}:null,pickGuest:()=>null});PB.loadTakes([{...f.original,audible:[['original',.2]]}]);
 let scope;const scene=createSourceRecordingInspectionScene({recording:f.custody().recordings[0],renderer:{initialize:()=>true,ready:()=>true,render:()=>true},
  presentation:()=>({paused:scope.paused}),onAudition:({positionSeconds,signal})=>createSourceRecordingAudition({playback:PB,take:PB.serializeTakes()[0],positionSeconds,signal})});
 const noop=()=>{},owner={id:'source-continuation',pause:noop,resume:noop},env={paused:false,storyMode:false,inRogue:false,
  sourceRecordingInspectionScene:scene,sourceContinuationScene:owner,runPlayDurationClock:{suspend:noop},FEAR:{setHeartbeatPaused:noop},
  b3SpeakerAudio:{pause:noop},b3Speaker:{flush:noop},architectureDoorEvents:{hold:noop},personalWindowEffects:{suspendSurfaces:noop},windowChoreography:{suspend:noop},
  gameplayInputLifecycleActive:()=>true,currentAmbientTarget:()=>0};
 for(const name of['getInDriveTeaserScene','openingVehicleScene','openingOvertureScene','studentStrikeScene','sourceReturnFlashbackScene','sourceRestBreath','sourceRestWeather','architectureDoorAudio',
  'pubRoomAudio','pubPressureAudio','sourcePubAudio','sourceContinuationAudio','towerWarningAudio','sourceDriveSession','sourcePubScene','firstStrikeScene','standingTearScene','coastalMemoryScene',
  'academicGhostDispatch','outskirtsStreetAudio','bellPealPerformance','towerBellDirector','dialogGain','bodyGain','sfxGain','sfxDirectGain','musicGain','whisperBed'])env[name]=null;
 for(const name of['syncPointerMode','cancelLastExposure','cancelRecordingPressureAudio','cancelApparitionApplause','pauseTowerEndingRecording','saveSourceView','pauseOutskirtsLastLight',
  'lowerTowerPersonalRecorder','stopTowerPersonalWorldSignal','resetMotionInput','stopAllVoices','stopWorldLayerVoice','silenceAmbientDrone','setGainNode','applyAudioSettings','startAmbientDroneAt','updateAudio','resumeGameplayInput'])env[name]=noop;
 env.STORY={pauseOpeningOvertureScore:noop,resumeOpeningOvertureScore:noop};scope=vm.createContext(env);
 const at=main.indexOf('function setGameplayPaused('),until=main.indexOf('\nfunction togglePause(',at);assert.ok(at>=0&&until>at);vm.runInContext(main.slice(at,until),scope);
 actualScenes.clear();actualScenes.push(owner);actualScenes.push(scene);
 try{
  await scene.initialize();await scene.activate('play');ctx.currentTime=13;scene.update(.01);const position=scene.view().positionSeconds;assert.ok(position>2.9&&position<=3);
  scope.setGameplayPaused(true,{announce:false});const pause=actualScenes.push({id:'pause',freezesBelow:true,blocksWorld:true});ctx.currentTime=33;actualScenes.update(.1);
  assert.equal(PB.archivedPlaybackPosition().paused,true);assert.equal(PB.archivedPlaybackPosition().positionSeconds,position);assert.equal(scene.view().playing,false);
  actualScenes.remove(pause);scope.setGameplayPaused(false,{announce:false});ctx.currentTime=43;actualScenes.update(.1);
  assert.equal(PB.archivedPlaybackPosition().paused,true);assert.equal(scene.view().positionSeconds,position,'time under the pause menu is not spent on the tape');
  await scene.activate('play');assert.equal(PB.archivedPlaybackPosition().paused,false,'only a deliberate new press resumes the same interval');
 }finally{actualScenes.clear();PB.stopPlayback();PB.loadTakes([]);}
});
