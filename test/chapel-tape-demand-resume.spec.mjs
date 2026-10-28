import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as D from '../src/game/chapel-tape-demand.js';
import {endingManifest} from '../src/data/endings.js';
import {dueTimelineSteps} from '../src/game/ending-runtime.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const block=(start,end)=>{const a=main.indexOf(start),b=main.indexOf(end,a);assert.ok(a>=0&&b>a,start);return main.slice(a,b);};
const copy=value=>JSON.parse(JSON.stringify(value));
const context={runId:'chapel-objective-resume',chapelWon:true,chapelRoute:true};
const sourceSteps=endingManifest('inversion').objective.timeline;
const noop=()=>{};

function harness({saved=null,now=0}={}){
  let clock=now,worldBlocked=false,inputActive=true;
  const save=saved?copy(saved):{run:{id:context.runId,status:'active'},flags:{},encounters:{cleared:['chapel']},area:'conservatory',chunkSurf:{finale:{route:'chapel'}}};
  const events=[],recordingPressureVoices=new Set();
  const door={id:'chapel-c17',open:true,cx:3.5,cy:5.5,widthAxis:'x',cells:[{x:2,y:5},{x:3,y:5},{x:4,y:5}]};
  const host={...D,CHAPEL_TAPE_DEMAND_FLAG:D.CHAPEL_TAPE_DEMAND_FLAG,CELL:.5,storyMode:true,inRogue:true,paused:false,runPlayDurationClock:{suspend:()=>{}},
    getSave:()=>save,saveCommit:patch=>Object.assign(save,patch),recordingPressureVoices,ENCOUNTERS:{encounterCleared:()=>true},normalizeChunkSurfState:value=>value,SOURCE_FINALE_ROUTE:{CHAPEL:'chapel'},
    performance:{now:()=>clock},scenes:{blocksWorld:()=>worldBlocked},gameplayInputLifecycleActive:()=>inputActive,usingPlan:()=>true,usingSpecialSpace:()=>false,
    FP:{isSolid:()=>false,logicalToPhysical:(x,y)=>({x,y:0,z:y,renderGroup:'upper'}),doorAt:()=>door,homeAnchor:()=>({x:4,y:8}),toRuntimePoint:point=>point},
    PROPS:{propCanOccupy:()=>true,propById:()=>null},tapeDemandWallContact:()=>({gap:.5,cell:{x:3,y:6},planeX:null,planeY:7,nx:0,ny:-1,floor:0,yaw:0}),
    px:3,py:6,R3:{r3dChapelTapeDemandReady:()=>true,r3dChapelTapeDemandStatus:()=>({ready:true}),r3dLookAngles:()=>({yaw:0,pitch:-.12}),r3dSetLookAngles:noop},
    PB:{isPlaying:()=>false,stopPlayback:noop},playbackRoom:null,
    escape:null,endingTimeline:null,activeEndingCutscene:null,sourceContinuationScene:null,chapelTapeTugHeld:false,chapelTapeSavedProgress:0,
    chapelTapeWarningDoor:null,chapelTapeWarningSeconds:0,chapelCollectionWarningId:null,chapelCollectionWarningSeconds:0,
    renderMove:null,motionRig:null,trail:[],finaleActive:false,MAIN_EXIT_CELL:{x:79,y:3},endingManifest,dueTimelineSteps,
    fireCue:noop,SPEECH:{say:noop},cancelLastExposure:noop,arrowDelta:()=>[0,0],applyLensPreset:noop,advanceActiveEndingCutscene:noop,applyEndingEvent:event=>events.push(copy(event)),
    getInDriveTeaserScene:null,sourceReturnFlashbackScene:null,pubRoomAudio:null,sourcePubAudio:null,sourceContinuationAudio:null,towerWarningAudio:null,
    sourceDriveSession:null,sourcePubScene:null,standingTearScene:null,coastalMemoryScene:null,academicGhostDispatch:null,outskirtsStreetAudio:null,
    bellPealPerformance:null,towerBellDirector:null,personalWindowEffects:{},windowChoreography:{},dialogGain:null,sfxGain:null,sfxDirectGain:null,musicGain:null,whisperBed:null,
    syncPointerMode:noop,saveAcademicGhostClub:noop,cancelApparitionApplause:noop,pauseTowerEndingRecording:noop,saveSourceView:noop,
    pauseOutskirtsLastLight:noop,lowerTowerPersonalRecorder:noop,stopTowerPersonalWorldSignal:noop,resetMotionInput:noop,
    stopAllVoices:noop,stopWorldLayerVoice:noop,silenceAmbientDrone:noop,setGainNode:noop,pushEvent:noop,applyAudioSettings:noop,
    startAmbientDroneAt:noop,currentAmbientTarget:noop,updateAudio:noop,resumeGameplayInput:noop};
  vm.createContext(host);
  vm.runInContext(block('function chapelTapeDemandContext(){','// The last walk owns a physical progression')
    +block('function tickEndingTimeline(){','function applyEndingEvent(')
    +block('function cancelRecordingPressureAudio(){','function recordingPressureFrame(')
    +block('function setGameplayPaused(next,','function togglePause(){'),host);
  const run=code=>vm.runInContext(code,host);
  return{host,save,events,run,set now(value){clock=value;},get now(){return clock;},
    set blocked(value){worldBlocked=value;},set focused(value){inputActive=value;},
    start(){host.escape={kind:'inversion',stage:'door',doorCell:{x:4,y:8},rescueCell:{x:79,y:3},deadlineMs:clock+60000};run("startEndingTimeline(endingManifest('inversion').objective.timeline,{duringObjective:true});beginChapelTapeDeparture('inversion');");},
    tick(){run('tickEndingTimeline()');},
    snapshot(){run('rememberChapelTapeDemandDeparture({commit:true})');return copy(save);},
    catch(){host.chapelTapeWarningDoor=door.id;host.chapelTapeWarningSeconds=1;
      assert.equal(run('chapelTapeDemandBeforeStep({x:3,y:6},{x:3,y:5})'),true);assert.equal(save.flags[D.CHAPEL_TAPE_DEMAND_FLAG].status,'caught');},
    release(){
      assert.equal(run('chapelTapeDemandBeforeStep({x:3,y:6},{x:3,y:7})'),false,'step toward the actual attachment remains usable');
      host.px=3;host.py=7;clock+=1600;run('interactChapelTapeDemand();tickEndingTimeline();');
      assert.equal(save.flags[D.CHAPEL_TAPE_DEMAND_FLAG].status,'released');
    },
  };
}

test('a late catch, long wait, JSON reload and spatial release preserve the remaining authored collapse once only',()=>{
  const first=harness();first.start();first.now=10000;first.tick();
  assert.deepEqual(first.events.map(e=>e.at),[2,7]);first.catch();first.now=210000;first.tick();
  const saved=first.snapshot(),timeline=saved.flags[D.CHAPEL_TAPE_DEMAND_FLAG].departure.timeline;
  assert.equal(timeline.elapsedMs,10000);assert.equal(timeline.cursorSeconds,10);assert.equal(timeline.eventsKey,JSON.stringify(sourceSteps));
  const resumed=harness({saved,now:900000});assert.equal(resumed.run('restoreChapelTapeDemandDeparture()'),true);
  assert.equal(resumed.host.endingTimeline.cursor,10);assert.equal(resumed.host.escape.deadlineMs,null);
  resumed.now=1200000;resumed.tick();assert.equal(resumed.events.length,0,'offline and caught time cannot spend the collapse');
  resumed.release();assert.equal(resumed.events.length,0,'the time spent recovering the case does not advance the objective');
  const releasedAt=resumed.now;resumed.now=releasedAt+1000;resumed.tick();assert.deepEqual(resumed.events.map(e=>e.at),[11]);
  resumed.tick();assert.equal(resumed.events.length,1,'sampling the same frame does not replay a cue');
  resumed.now=releasedAt+28000;resumed.tick();assert.deepEqual([...first.events,...resumed.events],copy(sourceSteps));
});

test('actual pause entry/resume rebases this objective clock and a paused snapshot survives reload',()=>{
  const first=harness();first.start();first.now=5000;first.tick();
  assert.deepEqual(first.events.map(e=>e.at),[2]);
  let pressureStops=0;for(let i=0;i<2;i++)first.host.recordingPressureVoices.add({stop:()=>pressureStops++});
  first.run('setGameplayPaused(true,{announce:false})');first.now=205000;first.tick();
  assert.equal(first.host.escape.deadlineMs,null,'the actual escape clock pauses with the objective cue clock');
  assert.equal(pressureStops,2);assert.equal(first.host.recordingPressureVoices.size,0,'pause releases every recording-pressure voice before the objective resumes');
  assert.equal(first.host.endingTimeline.cursor,5);const saved=first.snapshot();
  assert.equal(saved.flags[D.CHAPEL_TAPE_DEMAND_FLAG].departure.timeline.elapsedMs,5000);
  first.run('setGameplayPaused(false,{announce:false})');first.tick();assert.deepEqual(first.events.map(e=>e.at),[2]);
  assert.equal(first.host.escape.deadlineMs,260000,'pause preserves the original 55-second remainder');
  first.now=207000;first.tick();assert.deepEqual(first.events.map(e=>e.at),[2,7]);
  const resumed=harness({saved,now:800000});assert.equal(resumed.run('restoreChapelTapeDemandDeparture()'),true);resumed.tick();assert.equal(resumed.events.length,0);
  resumed.now=802000;resumed.tick();assert.deepEqual(resumed.events.map(e=>e.at),[7]);
});

test('a released checkpoint resumes at its saved cursor and changed event identity never replays an old sequence',()=>{
  const first=harness();first.start();first.now=1000;first.tick();first.catch();first.release();first.now+=17000;first.tick();
  const saved=first.snapshot(),record=saved.flags[D.CHAPEL_TAPE_DEMAND_FLAG];assert.equal(record.status,'released');
  const resumed=harness({saved,now:100000});assert.equal(resumed.run('restoreChapelTapeDemandDeparture()'),true);resumed.tick();assert.equal(resumed.events.length,0);
  resumed.now+=5000;resumed.tick();assert.deepEqual(resumed.events.map(e=>e.at),[23]);
  const changed=copy(saved);changed.flags[D.CHAPEL_TAPE_DEMAND_FLAG].departure.timeline.eventsKey+=' source changed';
  const mismatch=harness({saved:changed,now:100000});assert.equal(mismatch.run('restoreChapelTapeDemandDeparture()'),true);
  assert.equal(mismatch.host.endingTimeline,null,'unknown event sequences fail open without guessing or replay');
});

test('the production spatial host persists a lost grip, permits retreat, and requires an in-reach reclaim after reload',()=>{
  const first=harness();first.start();first.now=10000;first.tick();first.catch();
  first.host.chapelTapeTugHeld=true;
  for(let i=0;i<30;i++)first.run('tickChapelTapeDemand(1/60)');
  first.focused=false;first.now=210000;first.run('tickChapelTapeDemand(60)');
  assert.equal(first.save.flags[D.CHAPEL_TAPE_DEMAND_FLAG].catch.holder,'player','focus loss cannot convert a half-second strain into seizure');
  first.focused=true;first.host.chapelTapeTugHeld=true;
  for(let i=0;i<30;i++)first.run('tickChapelTapeDemand(1/60)');
  assert.equal(first.save.flags[D.CHAPEL_TAPE_DEMAND_FLAG].catch.holder,'anchor');
  assert.equal(first.host.chapelTapeTugHeld,false,'custody change drops held intent');
  assert.equal(first.run('chapelTapeDemandBeforeStep({x:3,y:6},{x:12,y:12})'),false,'the case remains locally held while walking is available');
  const saved=first.snapshot();
  const resumed=harness({saved,now:900000});assert.equal(resumed.run('restoreChapelTapeDemandDeparture()'),true);
  assert.equal(resumed.save.flags[D.CHAPEL_TAPE_DEMAND_FLAG].catch.holder,'anchor');
  assert.equal(resumed.host.escape.deadlineMs,null,'custody must resolve before route progress');
  resumed.host.px=12;resumed.host.py=12;resumed.run('interactChapelTapeDemand()');
  assert.equal(resumed.save.flags[D.CHAPEL_TAPE_DEMAND_FLAG].status,'caught','a distant interact cannot teleport the case back');
  resumed.host.px=3;resumed.host.py=7;resumed.run('interactChapelTapeDemand()');
  const state=resumed.save.flags[D.CHAPEL_TAPE_DEMAND_FLAG];
  assert.equal(state.status,'released');assert.equal(state.catch.holder,'player');
  assert.deepEqual(state.spent,['chapel-c17']);assert.equal(resumed.host.escape.deadlineMs,950000,'the original 50-second allowance returns exactly');
});

test('only a bounded, internally ordered inversion objective payload is admitted; Source IV remains authoritative',()=>{
  const first=harness();first.start();first.now=5000;first.tick();const saved=first.snapshot(),state=saved.flags[D.CHAPEL_TAPE_DEMAND_FLAG],valid=state.departure.timeline;
  for(const patch of [{schema:2},{id:'surfaced-objective'},{eventsKey:''},{eventsKey:'x'.repeat(32769)},{elapsedMs:-1},{elapsedMs:Infinity},{elapsedMs:3600001},{cursorSeconds:-1},{cursorSeconds:6}]){
    const raw=copy(state);raw.departure.timeline={...valid,...patch};assert.equal(D.normalizeChapelTapeDemand(raw,context).departure.timeline,null);
  }
  const otherRoute={...state,route:'surfaced',departure:{...state.departure,stage:'public-doors'}};assert.equal(D.normalizeChapelTapeDemand(otherRoute,context).departure.timeline,null);
  const sourceSave=copy(saved);sourceSave.sourceIV={sequenceId:'source-IV',runId:context.runId,status:'active'};
  const sourceOwner=harness({saved:sourceSave,now:100000});assert.equal(sourceOwner.run('restoreChapelTapeDemandDeparture()'),false);assert.equal(sourceOwner.host.escape,null);assert.equal(sourceOwner.host.endingTimeline,null);
});

test('unrelated ending timelines and deadlines are untouched by the chapel-specific clock hold',()=>{
  const h=harness();h.host.escape={kind:'inversion',stage:'door',deadlineMs:12345};h.run("startEndingTimeline(endingManifest('inversion').objective.timeline,{duringObjective:true})");
  h.run('setGameplayPaused(true,{announce:false})');assert.equal(h.host.endingTimeline.chapelDemandHeldAtMs,undefined);assert.equal(h.host.escape.deadlineMs,12345);
  h.run('setGameplayPaused(false,{announce:false})');h.now=8000;h.tick();assert.deepEqual(h.events.map(e=>e.at),[2,7]);
});
