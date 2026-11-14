import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as REC from '../src/game/recordist.js';
import * as PB from '../src/game/playback.js';
import * as PLANT from '../src/game/plant-incident.js';
import * as HUNTER from '../src/game/take-hunter.js';
import {classifyTakeAttempt} from '../src/game/take-acceptance.js';
import {createCassetteLedger,nextCassette,recordOnCassette} from '../src/game/cassette-ledger.js';
import {createB3SpeakerDisturbance} from '../src/game/b3-speaker-disturbance.js';
import {recordingOverlayButtons} from '../src/render/recorder-view.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function body(name){
  const start=main.indexOf(`function ${name}(`),open=main.indexOf('{',main.indexOf(')',start));
  assert.ok(start>=0&&open>start,name);let depth=0;
  for(let at=open;at<main.length;at++){
    if(main[at]==='{')depth++;
    if(main[at]==='}'&&--depth===0)return main.slice(start,at+1);
  }
  throw Error(`Missing function end: ${name}`);
}
const noop=()=>{};
function roll(options={}){
  REC.stopRecording();REC.stopListening();REC.setLoudNoiseSink(null);REC.setAcousticEmitter(null);
  REC.setTakeSink(null);REC.setTakeSpoilSink(null);REC.loadRecState({injuries:0,takes:[]});REC.decayNoise(100);
  REC.configureDifficulty({minorNoise:'spoil',spoilNoiseScale:1,spoilToleranceScale:1,recordingNoiseScale:1,takeSecondsScale:1});
  PB.loadTakes([]);REC.startListening();REC.startRecording(options);
  PB.beginTake('the_tub',{});PB.startTapeTake('the_tub');
}
test.afterEach(()=>{REC.stopRecording();REC.stopListening();REC.setLoudNoiseSink(null);REC.setTakeSpoilSink(null);PLANT.resetPlantIncident();});

test('ordinary noise and explicit handling faults run to the target and fail only when filed',()=>{
  for(const fault of [()=>REC.emitNoise(.24,0,0,'you made a sound'),()=>REC.spoilTake('you moved')]){
    roll();REC.tickRecording(12);fault();
    assert.equal(REC.recState().spoiled,true);assert.equal(REC.takeInterrupted(),false);
    assert.equal(REC.tickRecording(10),'running');assert.equal(REC.recState().takeElapsed,22);
    assert.equal(REC.tickRecording(REC.takeDuration()-22),'complete');assert.equal(REC.isRecording(),true);
    const events=REC.takeEvents(),result=REC.stopRecording(),attempt=classifyTakeAttempt(result,{events});
    assert.equal(result.completed,false);assert.equal(result.elapsed,60);assert.equal(result.tapeElapsed,60);
    assert.equal(attempt.outcome,'spoilt');assert.equal(REC.hasTake('the_tub'),false);
  }
});

test('the sheet retains the first fault when later noises reach the tape',()=>{
  roll();REC.tickRecording(8);REC.spoilTake('you reached for the light',{sourceKind:'player',sourceId:'torch'});
  REC.tickRecording(20);REC.emitNoise(.4,0,0,'you made a sound',{sourceId:'room-mic'});REC.tickRecording(32);
  const events=REC.takeEvents(),result=REC.stopRecording();
  assert.deepEqual(classifyTakeAttempt(result,{events}),{outcome:'spoilt',atSec:8,cause:'HANDLING'});
});

test('authored source interruption is event-specific; an unrelated sound from that source is ordinary',()=>{
  for(const sourceId of ['b3-control-speakers','practice-metronome-lesson']){
    roll();REC.emitRoomSourceNoise(.4,0,0,'an unrelated sound',{sourceId});
    assert.equal(REC.tickRecording(.1),'running');assert.equal(REC.takeInterrupted(),false);
    REC.emitRoomSourceNoise(.4,0,0,'the authored source',{sourceId,interruption:'authored'});
    assert.equal(REC.tickRecording(.1),'spoiled');assert.equal(REC.takeInterrupted(),true);
  }
  roll({authoredNoise:true});REC.emitNoise(.4,0,0,'the level-check lesson');
  assert.equal(REC.tickRecording(.1),'spoiled');
});

test('the actual B3 speaker beat still interrupts before the minimum',()=>{
  roll();const speaker=createB3SpeakerDisturbance();let status='running';
  for(let n=0;n<200&&status==='running';n++){
    speaker.step({dt:.1,enabled:true,recording:true,roomId:'main_b3',takeElapsed:REC.recState().takeElapsed,minimumSeconds:REC.minimumTakeDuration()});
    speaker.reportToRecorder(REC,{x:0,y:0});status=REC.tickRecording(.1);
  }
  assert.equal(status,'spoiled');assert.equal(REC.recState().spoilMeta.interruption,'authored');
  assert.ok(REC.recState().takeElapsed<REC.minimumTakeDuration());
});

test('physical contact interrupts even after an earlier quality fault or during source protection',()=>{
  for(const options of [{},{protectedSourceId:'b3-control-speakers'}]){
    roll(options);REC.emitNoise(.4,0,0,'handling noise');REC.tickRecording(8);
    REC.spoilTake('it found you',{interruption:'contact'});
    assert.equal(REC.takeInterrupted(),true);assert.equal(REC.tickRecording(.1),'spoiled');
    const result=REC.stopRecording();assert.equal(result.spoilMeta.interruption,'contact');
    assert.equal(classifyTakeAttempt(result,{events:REC.takeEvents()}).cause,'PRESENCE');
  }
});

function presentation(){
  let drawn=null;
  const h=vm.createContext({REC,PB,HUNTER,takeHunter:HUNTER.freshTakeHunter(),performance:{now:()=>2000},
    recordingStopConfirmation:{notice:()=>''},
    monitorExposureSnapshot:{},liveTakeRecorderLowered:()=>false,canLowerLiveTakeRecorder:()=>false,
    currentWorld:()=> 'the_tub',usingSourceSpace:()=>false,sourceContinuationScene:null,recorderRefusal:()=>null,
    chapelTapeRetakeRoom:()=>null,tickTapeMarkers:noop,tapeMarkerNote:()=>null,roomLabel:id=>id,
    formatPlaybackTime:seconds=>String(seconds),SPEECH:{speechPanelRows:()=>0},
    MIC:{micActive:()=>false},MONITOR:{monitorSnapshotForRms:rms=>({rms,db:rms?20*Math.log10(rms):-96})},
    presenceMeterLevel:()=>0,setPieceMeterPinned:false,ROOM_TONE:{spoilNoise:.18},
    takePanelRect:()=>({x:0,y:0,w:60,h:30,bar:2}),uiFill:noop,
    recorderRigFrame:()=>null,drawRecorderFace:view=>{drawn=view;},TRANSPORT:{RECORD:'record'},recordingOverlayButtons});
  vm.runInContext(body('recorderMachineState')+'\n'+body('drawTakeOverlay'),h);
  return{machine:()=>h.recorderMachineState(),overlay:()=>{h.drawTakeOverlay(120,60);return drawn;}};
}
test('both recorder faces keep their reels, elapsed counter and neutral quality display after noise',()=>{
  roll();REC.tickRecording(20);const p=presentation(),before=p.machine();
  REC.emitNoise(.3,0,0,'you moved');REC.tickRecording(1);
  const machine=p.machine();
  for(const face of [{...machine.face,spin:machine.spin},p.overlay()]){
    assert.match(face.lamp.text,/REC/);assert.equal(face.lamp.role,'ui-marker');assert.ok(face.spin>0);
    assert.equal(face.counterTotal,'21 ELAPSED');assert.ok(face.locationMarks.every(mark=>mark.kind==='event'));
    assert.ok(face.meterMarks.some(mark=>mark.kind==='catch'&&mark.label==='DANGER'));
    assert.doesNotMatch(JSON.stringify(face),/SPOILED|you moved|CATCH/);
  }
  assert.equal(p.machine().face.lamp.text,before.face.lamp.text);
  REC.tickRecording(25);
  assert.match(p.machine().note,/MINIMUM REACHED/);assert.match(p.overlay().footer,/MINIMUM REACHED/);
});

function host(){
  let now=0,ledger=createCassetteLedger(),sheetCount=0,stops=0;const spoken=[];
  const h=vm.createContext({REC,PB,HUNTER,PLANT,storyMode:true,paused:false,document:{hidden:false},
    scenes:{blocksWorld:()=>false},monitorExposureSnapshot:{},
    takeRoom:'the_tub',takeOrigin:null,px:0,py:0,LEVEL_CHECK_ROOM:'level-check',spoilPendingMs:0,
    gameplayInputLifecycleActive:()=>true,holdB3RecordingForLifecycle:()=>false,
    chapelTapeRetakeRoom:()=>null,usingSpecialSpace:()=>false,recordableRoomAt:()=> 'the_tub',currentWorld:()=> 'the_tub',
    performance:{now:()=>now},getSave:()=>({run:{rules:{values:{recordingForgiveness:'standard'}}}}),
    classifyTakeAttempt,rollCassette:1,commitCassettes:noop,cassetteLedger:()=>ledger,
    fileTakeOnCassette:(roomId,attempt)=>{ledger=recordOnCassette(ledger,nextCassette(ledger).n,{roomId,...attempt}).ledger;},
    openWorkOrderCheckoff:()=>sheetCount++,
    environmentalTenorFired:true,STORY:{stopTapeHiss:noop},tickRecordingListen:noop,
    liveTakeRecorderIsLowered:false,SPEECH:{say:line=>spoken.push(line.text)},TUT:{tutorialActive:()=>false},
    LINES:{recSpoiled:()=>({text:'authored failure'})},
    cancelRecordingPressureAudio:noop,recordingPressurePerformance:{reset:noop},cancelControlScope:noop,
    liveRecordingPointerControls:new Map(),finishRecordingSlate:noop,activeTakeOrdinal:0,recordingFalseHush:null,
    recordingHallucinationProbeUntil:0,recordingHallucinations:{clear:noop},activeTakeContamination:null,
    activeTakeWitnessed:false,takePlace:null,clearInstrument:noop,instrArmedThisTake:false,metronomeRestartPending:null,
    CUES:{playCue:noop,CUE:{}},emitRecorderTransport:()=>stops++,updateAudio:noop,activeSourceReplayTake:null,
    EVENT_TYPES:{},emitProgress:noop,saveCommit:noop,flushMetronomeTakeEvents:noop,
    onTakeBroken:()=>spoken.push('interrupted')});
  for(const name of ['tickB3Speaker','maybeIndependentBattle','maybeBattle','tickNatatoriumDread','tickChapelRetakeHaunt',
    'tickTakeHunter','tickRecordingEmbodiment','tickInstrument','tickPracticeMetronomes','tickPracticeStudent',
    'tickStopListening','tickDreamFigure','tickTakeSelfAudioMask','tickMic','tickRecordingHallucinations','tickRecordingSlate'])h[name]=noop;
  vm.runInContext(body('fileTakeAttempt')+'\n'+body('stopTake')+'\n'+body('tickRecorder'),h);
  return{h,spoken,tick:dt=>{now+=dt*1000;h.tickRecorder(dt);},ledger:()=>ledger,sheets:()=>sheetCount,stops:()=>stops};
}
test('the real recorder host records the full failed attempt and writes its sheet only after stopping',()=>{
  roll();const f=host();f.tick(10);REC.emitNoise(.25,0,0,'you made a sound');
  f.tick(2);assert.equal(REC.isRecording(),true);assert.equal(f.sheets(),0);assert.deepEqual(f.spoken,[]);
  f.tick(48);assert.equal(REC.isRecording(),false);assert.equal(f.sheets(),1);assert.equal(f.stops(),1);
  assert.equal(PB.tapeTakes()[0].endSeconds,60);assert.equal(PB.tapeTakes()[0].status,'spoiled');
  assert.equal(f.ledger().cassettes[0].content.outcome,'spoilt');assert.deepEqual(f.spoken,[]);
});
test('STOP ends an ordinary failed take early and reveals it on the same sheet',()=>{
  roll();const f=host();f.tick(10);REC.spoilTake('you moved');f.tick(3);f.h.stopTake();
  assert.equal(REC.isRecording(),false);assert.equal(f.sheets(),1);assert.equal(PB.tapeTakes()[0].endSeconds,13);
  assert.deepEqual(f.spoken,[]);assert.equal(f.h.spoilPendingMs,0);
});
test('an early STOP without noise also leaves the redo decision to the sheet',()=>{
  roll();const f=host();f.tick(10);f.h.stopTake();
  assert.equal(f.sheets(),1);assert.equal(f.ledger().cassettes[0].content.outcome,'spoilt');
  assert.deepEqual(f.spoken,[]);
});
test('the host keeps immediate feedback and a bounded stop for an authored interruption',()=>{
  roll();const f=host();f.tick(10);REC.spoilTake('the authored source',{interruption:'authored'});
  f.tick(.1);assert.equal(REC.isRecording(),true);assert.deepEqual(f.spoken,['interrupted']);
  f.tick(1);assert.equal(REC.isRecording(),false);assert.equal(f.sheets(),1);
});

test('the recorder leaves an ordinary interruption unresolved while exposure is about to catch',()=>{
  roll();const f=host();f.tick(10);REC.spoilTake('physical interruption',{interruption:'contact'});
  f.h.monitorExposureSnapshot.captureWarning='quiet';
  f.tick(.1);assert.equal(REC.isRecording(),true);assert.deepEqual(f.spoken,[]);
  f.h.monitorExposureSnapshot.captureWarning=null;
  f.tick(.1);assert.equal(REC.isRecording(),true);assert.deepEqual(f.spoken,['interrupted']);
});

test('the actual metronome beat interrupts, without making other practice-room noises exceptions',()=>{
  roll();REC.emitNoise(.3,0,0,'handling');assert.equal(REC.tickRecording(1),'running');
  const h=vm.createContext({REC,metronomeTakeRoom:()=> 'soundnoisemusic',takeOrigin:{x:0,y:0},CELL:.5,
    FP:{logicalToPhysical:()=>({x:0,z:0}),toAuthoredCoord:n=>n},practiceRoomAt:()=> 'lesson',
    PRACTICE_METRONOMES:[{id:'practice-metronome-lesson',roomId:'lesson',label:'Lesson'}],
    PROPS:{propById:()=>({rx:0,ry:0})},metronomeShutIn:()=>false,metronomeTickLevel:()=>.4,
    coincidentTicks:()=>[{indices:[0],level:.4}]});
  vm.runInContext(body('landMetronomeTicksOnTake'),h);
  h.landMetronomeTicksOnTake([{indices:[0],ticks:[{index:0,level:.4}],level:.4}]);
  assert.equal(REC.tickRecording(.1),'spoiled');assert.equal(REC.recState().spoilMeta.sourceId,'practice-metronome-lesson');
});

test('the pressure incident remains a specific authored exception and does not consume assisted noise',()=>{
  const start=main.indexOf('REC.setTakeSpoilSink?.('),end=main.indexOf('\n});',start)+4;
  assert.ok(start>=0&&end>start);
  const installSink=(takeRoom,activeTakeOrdinal)=>vm.runInNewContext(main.slice(start,end),{
    REC,PLANT,takeRoom,LEVEL_CHECK_ROOM:'loading_dock',activeTakeOrdinal,
    instrArmedThisTake:true,clearInstrument:noop,syncPlantIncidentProps:noop,savePlantIncident:noop,
    SPEECH:{say:noop},
  });
  const spoil=()=>REC.emitNoise(.3,0,0,'handling',{playerGenerated:true,sourceId:'player'});
  for(const {room,acceptedB3} of [
    {room:'main_b3',acceptedB3:false},
    {room:'the_tub',acceptedB3:false},
    {room:'main_b3',acceptedB3:true},
    {room:'loading_dock',acceptedB3:true},
  ]){
    roll();PLANT.resetPlantIncident();
    if(acceptedB3)REC.addTake('main_b3');
    installSink(room,2);spoil();
    assert.equal(REC.takeInterrupted(),false,room);
    assert.equal(PLANT.plantHissing(),false,room);
  }
  for(const ordinal of [1,2,3,4]){
    roll();PLANT.resetPlantIncident();REC.addTake('main_b3');
    installSink('the_tub',ordinal);spoil();
    assert.equal(REC.takeInterrupted(),ordinal===2||ordinal===3);
    if(REC.takeInterrupted())assert.equal(REC.recState().spoilMeta.interruption,'authored');
  }
  roll();PLANT.resetPlantIncident();REC.addTake('main_b3');REC.configureDifficulty({minorNoise:'pause'});
  installSink('the_tub',2);REC.emitNoise(.2,0,0,'handling');
  assert.equal(REC.isAssistPaused(),true);assert.equal(PLANT.plantHissing(),false);
  roll();PLANT.resetPlantIncident();REC.addTake('main_b3');
  installSink('the_tub',2);
  REC.spoilTake('you reached for the light',{sourceId:'torch',playerGenerated:true});
  assert.equal(REC.takeInterrupted(),true);assert.equal(PLANT.plantHissing(),true);
});

test('latent quality failure cannot bypass a live hunter or release its pressure performance',()=>{
  roll();REC.spoilTake('you moved');
  const h=vm.createContext({REC,PB,HUNTER,takeRoom:'the_tub',currentWorld:()=> 'the_tub',
    takeHunter:{...HUNTER.armTakeHunter(null,{roll:0}),cells:4,seconds:9,warningSeconds:2.4},getSave:()=>({run:{id:'run'}}),
    recordingStopConfirmation:{request:()=>false,refuse:noop},
    chapelTapeCaseAvailable:()=>true,cancelApparitionApplause:noop,micCheckActive:()=>false,
    pressControl:noop,pressPromptControl:noop,recordingPressurePerformance:{stopPress:noop},
    TUT:{tutorialActive:()=>false},SPEECH:{say:noop},stopTake:()=>REC.stopRecording()});
  vm.runInContext(body('recordingPressureFrame')+'\n'+body('recordAction'),h);
  assert.equal(h.recordingPressureFrame().recording,true);h.recordAction();
  assert.equal(REC.isRecording(),true);assert.equal(h.takeHunter.cancelTries,1);
});
