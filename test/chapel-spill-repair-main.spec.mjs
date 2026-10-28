import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as D from '../src/game/chapel-tape-demand.js';
import * as PB from '../src/game/playback.js';
import * as REC from '../src/game/recordist.js';
import {selectChapelDamageTarget} from '../src/game/tape-damage.js';
import {endingManifest} from '../src/data/endings.js';
import {dueTimelineSteps} from '../src/game/ending-runtime.js';
import {createChapelRetakeHaunt} from '../src/game/chapel-retake-haunt.js';

const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const CONTEXT={runId:'chapel-spill-host',chapelWon:true,chapelRoute:true};
const ACK='chapelTapeDemand.lossAcknowledged';
const ROOMS=['main_b3','the_tub','amplifications','soundnoisemusic','lux_nova'];
const LABELS={main_b3:'Studio B3',the_tub:'The Pool',amplifications:'Amplifications',soundnoisemusic:'Sound, Noise & Music',lux_nova:'The Chapel'};
function fn(name){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);
  const next=source.indexOf('\nfunction ',start+1),comment=source.indexOf('\n// ',start+1);
  const end=Math.min(...[next,comment].filter(n=>n>start));return source.slice(start,end);
}
function media(){
  return ROOMS.map((roomId,index)=>({id:`take:${index+1}`,ordinal:index+1,roomId,status:'accepted',counted:true,durationSeconds:60,cleanSeconds:45,
    startSeconds:index*60,endSeconds:(index+1)*60,at:1000+index,slate:{text:`${LABELS[roomId]}. Take ${index+1}.`,mode:'fallback',atSeconds:0},
    audible:[[`original:${roomId}`,.2]],discrete:[{cueId:'original:event',atSec:9,gain:.3}],cell:{x:index+1,y:10},place:`original station ${index}`}));
}
function wireStore(rows){
  REC.stopRecording();REC.stopListening();REC.setTakeSink(null);REC.configureDifficulty({takeSecondsScale:1});REC.loadRecState({});
  PB.stopPlayback();PB.loadTakes(copy(rows));
  REC.setTakeSink({roomIds:()=>PB.takeRoomIds(),contaminated:()=>PB.contaminatedRooms(),places:()=>PB.takePlaces(),
    mark:(room,options)=>PB.markTake(room,options),serialize:()=>PB.serializeTakes(),transport:()=>PB.tapeTransport()});REC.syncTakes();
}
function beforeSecondCatch(){
  let state=D.reduceChapelTapeDemand(D.freshChapelTapeDemand(CONTEXT.runId),{type:'arm'},CONTEXT);
  state=D.reduceChapelTapeDemand(state,{type:'depart',route:'inversion',departure:{stage:'rescue',position:{x:10,y:2},remainingMs:53000,view:{yaw:0,pitch:0}}},CONTEXT);
  state=D.reduceChapelTapeDemand(state,{type:'catch',catch:{mode:'spatial',kind:'building',doorId:'chapel-c17',anchor:{x:0,y:.94,z:0},position:{x:0,y:2},group:'upper',initialDistance:2}},CONTEXT);
  for(let i=0;i<10;i++)state=D.reduceChapelTapeDemand(state,{type:'strain',seconds:.1},CONTEXT);
  return D.reduceChapelTapeDemand(state,{type:'interact',distanceM:.8,slack:true},CONTEXT);
}
function harness({saved=null,now=1000}={}){
  let clock=now,blocked=false,focused=true;
  const save=saved?copy(saved):{run:{id:CONTEXT.runId,status:'active'},flags:{[D.CHAPEL_TAPE_DEMAND_FLAG]:beforeSecondCatch()},
    encounters:{cleared:['chapel']},area:'conservatory',chunkSurf:{finale:{route:'chapel'}},settings:{flash:'full'}};
  wireStore(saved?.rec?.tapes||media());save.rec=REC.saveRecState();
  const commits=[],speech=[],events=[],thoughts=[],endings=[],hauntPulses=[];
  const host={...D,PB,REC,selectChapelDamageTarget,CHAPEL_TAPE_DEMAND_FLAG:D.CHAPEL_TAPE_DEMAND_FLAG,CHAPEL_TAPE_DAMAGE_ACK:ACK,
    getSave:()=>save,saveCommit:patch=>{Object.assign(save,patch);commits.push(copy(patch));},
    ENCOUNTERS:{encounterCleared:room=>save.encounters.cleared.includes(room)},normalizeChunkSurfState:value=>value,SOURCE_FINALE_ROUTE:{CHAPEL:'chapel',TOWER:'tower'},
    TOWER_PERSONAL_TAKE:'tower-personal',TARGETS:ROOMS,ROOM_CELLS:Object.fromEntries(ROOMS.map((room,index)=>[room,{x:20+index,y:30}])),roomLabel:room=>LABELS[room]||room,
    performance:{now:()=>clock},paused:false,storyMode:true,inRogue:true,usingPlan:()=>true,usingSpecialSpace:()=>false,gameplayInputLifecycleActive:()=>focused,
    scenes:{blocksWorld:()=>blocked,push:scene=>thoughts.push(scene)},makeThoughtScene:options=>options,
    SPEECH:{say:line=>speech.push(copy(line))},pushEvent:line=>events.push(line),fireCue:()=>{},
    FP:{logicalToPhysical:(x,y)=>({x,y:0,z:y,renderGroup:'upper'}),toRuntimePoint:p=>({x:p.x*2,y:p.y*2}),homeAnchor:()=>({x:4,y:8}),
      isSolid:()=>false,physicalSpanData:()=>null},PROPS:{propCanOccupy:()=>true,propById:()=>null},CELL:1,D:metres=>metres,
    px:10,py:2,arrowDelta:()=>[0,1],R3:{r3dChapelTapeDemandStatus:()=>({ready:true}),r3dLookAngles:()=>({yaw:0,pitch:0}),r3dSetLookAngles:()=>{}},
    chapelTapeTugHeld:false,chapelTapeSavedProgress:0,chapelTapeWarningDoor:null,chapelTapeWarningSeconds:0,chapelCollectionWarningId:null,chapelCollectionWarningSeconds:0,
    chapelTapeDamageExitPrompted:false,chapelTapeDamageChoiceOpen:false,chapelRetakeHaunt:createChapelRetakeHaunt(),chapelRetakeHauntFrame:null,chapelRetakeHauntOrigin:null,
    escape:{kind:'inversion',stage:'rescue',doorCell:{x:4,y:8},rescueCell:{x:100,y:100},deadlineMs:null},
    endingTimeline:{duringObjective:true,steps:endingManifest('inversion').objective.timeline,startedMs:clock-5000,cursor:5,chapelDemandHeldAtMs:clock},
    activeEndingCutscene:null,sourceContinuationScene:null,renderMove:null,motionRig:null,trail:[],finaleActive:true,MAIN_EXIT_CELL:{x:79,y:3},endingManifest,dueTimelineSteps,
    advanceActiveEndingCutscene:()=>{},applyEndingEvent:event=>events.push(copy(event)),applyLensPreset:()=>{},
    STORY:{},actx:{},dialogGain:null,master:{},CR:{fx:{}},
    flagTest:key=>key==='prologueDone'||key==='bag.taken'||key==='kit.fitted'||key==='van.closed'||key==='title.shown',
    ENDING_ARRIVAL:{ESCAPED:'escaped',TIMED_OUT:'timed-out'},playEnding:(id,arrival)=>endings.push({id,arrival}),endSacrifice:()=>endings.push({id:'timeout'}),
    dockHauntingGuidance:()=>null,dockHauntingFrame:null,dockHauntingStagingPoint:null,dockHauntingEffectsMode:()=> 'full',
    OBJ:{waypoint:()=>null,objState:()=>({read:[]})},playerKeys:new Set(['chapel']),chapelTowerState:()=>({}),vanDoorOpenFraction:()=>0,
    resolveStoryGuidanceTarget:()=>({id:'ordinary-guidance'}),mapAcquired:()=>true,
    // Ordinary LISTEN starts a genuine new tape attempt; only its audio/UI
    // presentation is replaced here, not the recorder or tape store.
    LEVEL_CHECK_ROOM:'main_b3',ensureCtx:()=>{},takeRoom:null,takePlace:null,takePlaceAt:()=> 'retake station',
    CUES:{CUE:{recorder:'recorder',squelch:'squelch'},playCue:()=>{}},emitRecorderTransport:()=>{},updateAudio:()=>{},committedListen:false,
    currentWorld:()=>host.takeRoom||'main_b3',armTakeHunter:cause=>hauntPulses.push({cause,takeId:host.chapelRetakeHauntFrame.takeId}),
    roomListen:()=>({}),beginRecorderGuide:()=>true,converse:()=>{},roll:()=>{},
  };
  vm.createContext(host);
  const names=['chapelTapeDemandContext','chapelTapeDemandState','chapelTapeCaseAvailable','chapelTapeRetakeRoom','chapelTapeDamageNeedsRetake',
    'chapelTapeDamageTarget','warnChapelTapeDamage','applyPendingChapelTapeDamage','syncChapelTapeRepair','beginChapelTapeRepair','chapelTapeDamageAtExit',
    'askChapelTapeDamageDeparture','commitChapelTapeDemand','syncChapelTapeDemandTimelineHold','rememberChapelTapeDemandDeparture',
    'chapelTapeDemandPhysical','tickChapelTapeDemand','interactChapelTapeDemand','restoreChapelTapeDemandDeparture','tickEndingTimeline',
    'currentStoryGuidanceTarget','tickFinale','openListen','tickChapelRetakeHaunt','recorderTapeRows'];
  vm.runInContext(names.map(fn).join('\n'),host);
  const run=code=>vm.runInContext(code,host);
  return{host,save,commits,speech,events,thoughts,endings,hauntPulses,run,
    get state(){return save.flags[D.CHAPEL_TAPE_DEMAND_FLAG];},get now(){return clock;},set now(value){clock=value;},
    set focused(value){focused=value;},set blocked(value){blocked=value;},
    catchSecond(){
      const target=run('chapelTapeDamageTarget(chapelTapeDemandState())');
      save.flags[D.CHAPEL_TAPE_DEMAND_FLAG]=D.reduceChapelTapeDemand(this.state,{type:'catch',catch:{mode:'spatial',kind:'building',doorId:'front-main',
        anchor:{x:10,y:.94,z:0},position:{x:10,y:2},group:'upper',initialDistance:2,damageTarget:target}},CONTEXT);
      for(let i=0;i<18;i++)run('tickChapelTapeDemand(.1)');return target;
    },
    reclaim(){host.py=1;run('interactChapelTapeDemand()');assert.equal(this.state.status,'released');},
    snapshot(){run('rememberChapelTapeDemandDeparture({commit:true})');return copy(save);},
    replacement({accepted=true}={}){
      const room=run('chapelTapeRetakeRoom()');assert.ok(room);run(`openListen(${JSON.stringify(room)})`);
      assert.equal(REC.startRecording(),true);PB.startTapeTake(room,{text:'replacement slate',mode:'fallback'});REC.tickRecording(accepted?45:12);
      const result=REC.stopRecording();if(!accepted){result.completed=false;result.spoiled=true;}
      PB.finishTapeTake(room,result);REC.syncTakes();return run('syncChapelTapeRepair()');
    },
  };
}

test('the actual second-loss host commits one exact damaged interval and names the work that must be replaced',()=>{
  const h=harness(),before=copy(PB.serializeTakes()),target=h.catchSecond();
  assert.equal(target.roomId,'soundnoisemusic');assert.equal(h.state.failures,2);assert.equal(h.state.spill.applied,true);assert.equal(h.state.spill.needsRetake,true);
  assert.equal(PB.takeRoomIds().includes(target.roomId),false);assert.equal(REC.hasTake(target.roomId),false);assert.equal(h.run('chapelTapeRetakeRoom()'),target.roomId);
  assert.ok(h.speech.some(line=>line.text.includes(LABELS[target.roomId])&&line.text.includes('record that room again')));
  assert.equal(h.save.encounters.cleared.includes('chapel'),true);assert.equal(h.host.finaleActive,true);
  const after=PB.serializeTakes();
  for(let i=0;i<after.length;i++){
    if(after[i].id===target.takeId){assert.ok(after[i].damage);assert.deepEqual(after[i].audible,before[i].audible);assert.deepEqual(after[i].slate,before[i].slate);}
    else assert.deepEqual(after[i],before[i]);
  }
  assert.ok(h.commits.some(patch=>patch.rec?.tapes.some(t=>t.id===target.takeId&&t.damage)&&patch.flags?.[D.CHAPEL_TAPE_DEMAND_FLAG].spill.applied),'loss and progression are committed in the same saved snapshot');
  const manifest=copy(PB.serializeTakes());h.run('applyPendingChapelTapeDamage(chapelTapeDemandState())');assert.deepEqual(PB.serializeTakes(),manifest);
});

test('guidance first points to the held case, then the exact room, and closes after an actual appended retake',()=>{
  const h=harness(),target=h.catchSecond();
  assert.equal(h.run('recorderTapeRows()').find(row=>row.takeId===target.takeId).status,'DAMAGED · RE-RECORD');
  assert.equal(h.run('currentStoryGuidanceTarget().id'),'story:reclaim-tape-case');
  h.reclaim();const guidance=copy(h.run('currentStoryGuidanceTarget()'));
  assert.equal(guidance.id,'story:chapel-retake');assert.equal(guidance.roomId,target.roomId);assert.equal(guidance.label,`RE-RECORD ${LABELS[target.roomId].toUpperCase()}`);
  assert.deepEqual(guidance.point,{x:46,y:60});
  assert.equal(h.replacement({accepted:false}),false);assert.equal(h.state.spill.needsRetake,true);
  assert.equal(h.replacement(),true);assert.equal(h.state.spill.fulfilled,true);assert.equal(h.run('chapelTapeRetakeRoom()'),null);
  assert.equal(h.run('currentStoryGuidanceTarget().id'),'ordinary-guidance');assert.equal(PB.takeFor(target.roomId).id,'take:7');
  assert.ok(PB.tapeTake(target.takeId).damage,'damaged history remains after replacement');
  assert.equal(h.run('recorderTapeRows()').find(row=>row.takeId===target.takeId).status,'DAMAGED · REPLACED','history must stop demanding another retake after repair');
  assert.equal(h.speech.at(-1).text,`${LABELS[target.roomId]} is back on tape. The torn passage is still there. I can leave now.`);
});

test('an interrupted recovery survives reload without spending or refilling the inversion allowance',()=>{
  const first=harness();first.catchSecond();first.reclaim();
  assert.equal(first.host.escape.deadlineMs,null);assert.equal(first.host.escape.chapelDemandDeadlineRemainingMs,53000);
  first.now=300000;first.run('tickEndingTimeline()');const saved=first.snapshot();
  assert.equal(saved.flags[D.CHAPEL_TAPE_DEMAND_FLAG].departure.remainingMs,53000);
  assert.equal(saved.flags[D.CHAPEL_TAPE_DEMAND_FLAG].departure.timeline.cursorSeconds,5);
  const h=harness({saved,now:900000});assert.equal(h.run('restoreChapelTapeDemandDeparture()'),true);
  assert.equal(h.host.escape.deadlineMs,null);assert.equal(h.host.escape.chapelDemandDeadlineRemainingMs,53000);
  h.now=1500000;h.run('tickEndingTimeline()');assert.equal(h.host.endingTimeline.cursor,5);
  assert.equal(h.replacement(),true);assert.equal(h.host.escape.deadlineMs,h.now+53000);
  const elapsed=h.host.endingTimeline.startedMs;h.now+=1000;h.run('tickEndingTimeline()');assert.equal(h.host.endingTimeline.startedMs,elapsed);
  assert.equal(h.host.endingTimeline.cursor,6);
});

test('leaving with ruined work requires an explicit choice and keeps the physical loss on the tape',()=>{
  const h=harness();h.catchSecond();h.reclaim();h.host.px=100;h.host.py=100;
  h.run('tickFinale()');assert.equal(h.thoughts.length,1);assert.equal(h.endings.length,0);
  const first=h.thoughts.at(-1);assert.ok(first.nodes.start.lines[0].includes('job is short a usable recording'));
  first.onCancel();h.run('tickFinale()');assert.equal(h.endings.length,0,'cancel is not permission to abandon the work');
  h.run('askChapelTapeDamageDeparture({force:true})');const choice=h.thoughts.at(-1);
  choice.onChoice(choice.nodes.start.choices.find(row=>row.chapelDamageChoice==='leave'));choice.onDone();
  assert.equal(h.save.flags[ACK],h.state.spill.damageId);assert.equal(h.run('chapelTapeDamageNeedsRetake()'),false);
  h.run('tickFinale()');assert.deepEqual(h.endings,[{id:'inversion',arrival:'escaped'}]);assert.ok(PB.tapeTake(h.state.spill.target.takeId).damage);assert.equal(h.state.spill.needsRetake,true);
});

test('stale or foreign persisted targets cannot damage a different take or manufacture retake credit',()=>{
  const h=harness(),original=copy(PB.serializeTakes());h.catchSecond();const valid=copy(h.state),target=h.state.spill.target;
  // Replay a pre-application checkpoint against a changed physical identity.
  wireStore(original);
  const untouched=copy(PB.serializeTakes());h.save.flags[D.CHAPEL_TAPE_DEMAND_FLAG]={...valid,spill:{...valid.spill,applied:false,target:{...target,ordinal:target.ordinal+1}}};
  h.run('applyPendingChapelTapeDamage(chapelTapeDemandState())');assert.deepEqual(PB.serializeTakes(),untouched);
  assert.equal(h.state.spill.applied,false);
});

test('the production retake director follows the current open take and schedules new pursuit windows for each retry',()=>{
  const h=harness(),target=h.catchSecond();h.reclaim();
  const begin=()=>{
    h.run(`openListen(${JSON.stringify(target.roomId)})`);assert.equal(REC.startRecording(),true);
    const opened=PB.startTapeTake(target.roomId,{text:'retake slate',mode:'fallback'});
    const current=PB.takeFor(target.roomId);
    assert.ok(current?.id);assert.equal(current.sealed,false);
    assert.equal(PB.tapeTakes().some(t=>t.id===current.id),false,'the history API intentionally excludes the in-progress interval');
    h.run('tickChapelRetakeHaunt()');assert.equal(h.host.chapelRetakeHauntFrame.takeId,current.id);
    assert.notEqual(h.host.chapelRetakeHauntFrame.takeId,PB.tapeTakes().at(-1).id,'a previous accepted or failed take is not this attempt');
    return current.id;
  };
  const tick=seconds=>{REC.tickRecording(seconds);h.run('tickChapelRetakeHaunt()');};
  const first=begin();tick(1);tick(REC.minimumTakeDuration()*.18);
  assert.deepEqual(h.hauntPulses,[{cause:'chapel-retake',takeId:first}]);
  const failed=REC.stopRecording();assert.equal(failed.completed,false);PB.finishTapeTake(target.roomId,failed);REC.syncTakes();h.run('tickChapelRetakeHaunt()');
  assert.equal(h.host.chapelRetakeHauntFrame.active,false);assert.equal(h.state.spill.needsRetake,true);
  const second=begin();assert.notEqual(second,first,'a failed and restarted recording has its own physical identity');
  tick(1);tick(REC.minimumTakeDuration()*.18);
  assert.deepEqual(h.hauntPulses,[{cause:'chapel-retake',takeId:first},{cause:'chapel-retake',takeId:second}]);
  h.focused=false;tick(REC.minimumTakeDuration()*.3);assert.equal(h.hauntPulses.length,2,'focus loss consumes the missed window without pursuit');
  h.focused=true;tick(.1);assert.equal(h.hauntPulses.length,2,'returning does not replay a missed window');
  tick(REC.minimumTakeDuration()*.3);assert.equal(h.hauntPulses.length,3);assert.equal(h.hauntPulses.at(-1).takeId,second);
  REC.stopRecording();PB.abortTapeTake?.();
});

test('the carried-recordist departure permits ordinary doors during the repair detour and retains its ledger at the exit',()=>{
  const h=harness();h.catchSecond();h.reclaim();
  let doors=0,alan=0,completed=0;
  Object.assign(h.host,{
    escape:{kind:'surfaced',stage:'service-road',exitCell:{x:100,y:100},ledgerSignatures:0},
    interactTowerWarning:()=>false,talkToAcademicBouncers:()=>false,openCathedralLesson:()=>false,cathedralFightReady:()=>false,usingSourceSpace:()=>false,
    worldInteractionFocus:()=>({doorWins:true,door:{portal:{id:'retake-door'}},prop:null}),PLANT:{heavyWrenchDragging:()=>false},usingStairAnomaly:()=>false,
    interactChapelScreen:()=>false,pageHere:null,sheetMusicNear:()=>false,tryGetInDoorEntry:()=>false,trySetupExitDoor:()=>false,tryTheGreyDoor:()=>false,tryDockHauntingDoor:()=>false,
    mapHeading:()=>0,askAlanWhileCarrying:()=>alan++,completeSurfacedExit:()=>completed++,STORY:{menuDenied:()=>{}},
  });
  h.host.FP.interactDoor=()=>{doors++;return{ok:false,why:'exit-only'};};
  h.host.PROPS.propById=()=>({rx:100,ry:100});vm.runInContext(fn('interact'),h.host);
  h.host.px=10;h.host.py=1;
  h.run('interact()');assert.equal(doors,1);assert.equal(alan,0,'the carry dialogue does not swallow the ordinary door press on the detour');
  h.save.flags[ACK]=h.state.spill.damageId;
  h.run('interact()');assert.equal(doors,2,'acknowledging damaged departure still leaves the repair route usable');
  h.host.px=102.4;h.host.py=100;
  assert.equal(h.run('chapelTapeDamageAtExit()'),false,'ledger gate uses its 2.2m physical reach, not the wider exit threshold');
  h.run('interact()');assert.equal(doors,3);
  h.host.px=102.1;assert.equal(h.run('chapelTapeDamageAtExit()'),true);
  h.run('interact()');assert.equal(h.host.escape.ledgerSignatures,1);assert.equal(doors,3);
  h.run('interact()');assert.equal(completed,1);assert.equal(h.host.escape.ledgerSignatures,2);
});

test('the actual recorder clock holds a repair attempt during native focus loss and pause, then resumes without catch-up',()=>{
  const h=harness();h.catchSecond();h.reclaim();
  const room=h.state.spill.target.roomId;h.run(`openListen(${JSON.stringify(room)})`);
  REC.startRecording();PB.startTapeTake(room,{text:'repair attempt',mode:'fallback'});
  const hunterTicks=[];
  Object.assign(h.host,{
    maybeIndependentBattle:()=>{},maybeBattle:()=>{},tickNatatoriumDread:()=>{},tickTakeHunter:dt=>hunterTicks.push(dt),
    tickInstrument:()=>{},tickPracticeMetronomes:()=>{},tickPracticeStudent:()=>{},tickStopListening:()=>{},tickDreamFigure:()=>{},
    environmentalTenorFired:true,currentFearPressure:()=>({tapeHiss:0}),TAKE_HISS:{},tickTakeSelfAudioMask:()=>{},tickMic:()=>{},
    tickRecordingHallucinations:()=>{},tickRecordingSlate:()=>{},spoilPendingMs:0,
  });
  h.host.STORY.setTapeHissPressure=()=>{};vm.runInContext(fn('tickRecorder'),h.host);
  h.run('tickRecorder(1)');const before=copy(REC.recState()),head=copy(PB.tapeTransport());
  assert.equal(before.takeElapsed,1);assert.equal(before.takeTapeElapsed,1);
  h.focused=false;h.run('tickRecorder(900)');
  assert.equal(REC.recState().takeElapsed,1);assert.equal(REC.recState().takeTapeElapsed,1);assert.deepEqual(PB.tapeTransport(),head);
  assert.equal(h.host.chapelRetakeHauntFrame.stage,'paused');assert.equal(hunterTicks.at(-1),0);assert.equal(h.hauntPulses.length,0);
  h.focused=true;h.host.paused=true;h.run('tickRecorder(900)');assert.equal(REC.recState().takeElapsed,1);assert.equal(hunterTicks.at(-1),0);
  h.host.paused=false;h.run('tickRecorder(.1)');assert.equal(REC.recState().takeElapsed,1.1);assert.equal(hunterTicks.at(-1),.1);
  assert.equal(h.hauntPulses.length,0,'the presented attempt resumes from its own audio/gameplay time, not the hidden elapsed interval');
  h.run('tickRecorder(REC.minimumTakeDuration()*.18)');h.run('tickRecorder(.1)');assert.equal(h.hauntPulses.length,1,'the first authored pursuit pulse remains available after interruption');
  const stopped=REC.stopRecording();PB.finishTapeTake(room,stopped);
});
