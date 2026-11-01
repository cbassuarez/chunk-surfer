import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import * as HUNTER from '../src/game/take-hunter.js';
import { createRecordingPressurePerformance } from '../src/game/recording-pressure.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name,next){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf(`\n${next}`,start);
  assert.ok(start>=0&&end>start,`${name} production body`);return source.slice(start,end);
}
function harness(){
  let recording=false,micReads=0,roomReads=0;
  const events=[],calls=[],rec={takes:[],takeTapeElapsed:0,spoiled:false};
  const pressure=createRecordingPressurePerformance({emit:event=>{events.push(event);return true;}});
  const h={HUNTER,storyMode:true,paused:false,takeHunter:HUNTER.freshTakeHunter(),takeHunterClosing:false,
    environmentalTenorFired:true,takeRoom:'main_b3',spoilPendingMs:0,
    gameplayInputLifecycleActive:()=>true,chapelTapeRetakeRoom:()=>null,usingSpecialSpace:()=>false,
    REC:{isRecording:()=>recording,isSlating:()=>false,isStalled:()=>false,isAssistPaused:()=>false,
      currentNoise:()=>.02,recState:()=>rec,takeProgress:()=>.5,decayNoise:()=>{},tickRecording:()=>null},
    MIC:{micActive:()=>true,micMaySpoil:()=>true,micEffectiveMeasurement:()=>{micReads++;return{effective:{rms:.2}};}},
    PB:{takeFor:()=>({id:'take-1'}),advanceTape:()=>{}},getSave:()=>({run:{id:'run'},settings:{}}),
    currentWorld:()=> 'main_b3',TUT:{tutorialActive:()=>false},scenes:{suppressesHud:()=>false},
    recordingPressurePerformance:pressure,STORY:{setTapeHissPressure(){}},TAKE_HISS:{},
    SPEECH:{say:line=>calls.push(line.text)},maybeIndependentBattle:()=>calls.push('between-takes'),
    maybeBattle:()=>calls.push('recording-battle'),tickNatatoriumDread:()=>calls.push('dread'),
    tickChapelRetakeHaunt:()=>{},tickInstrument:()=>{},tickPracticeMetronomes:()=>{},tickPracticeStudent:()=>{},
    tickStopListening:()=>calls.push('listening'),tickDreamFigure:()=>{},tickTakeSelfAudioMask:()=>{},tickMic:()=>{roomReads++;},
    tickRecordingHallucinations:()=>{},tickRecordingSlate:()=>{},currentFearPressure:()=>({tapeHiss:0})};
  vm.createContext(h);
  vm.runInContext(production('recordingPressureFrame','const recordingPressurePerformance')+'\n'+
    production('tickTakeHunter','function tickMic(')+'\n'+production('tickRecorder','// The real room,'),h);
  return {h,pressure,events,calls,get micReads(){return micReads;},get roomReads(){return roomReads;},setRecording:v=>{recording=v;}};
}

test('production recorder keeps idle battles and listening active without sampling the hunter mic',()=>{
  const t=harness();t.h.tickRecorder(.016);
  assert.equal(t.micReads,0);
  assert.deepEqual(t.calls,['between-takes','recording-battle','dread','listening']);
  assert.equal(t.pressure.inspect().takeId,null);
});

test('production recorder samples active hunters, then tears them and pressure down on stop',()=>{
  const t=harness();t.setRecording(true);t.h.tickRecorder(.016);
  assert.equal(t.micReads,0,'an unarmed hunter does not sample');
  assert.equal(t.roomReads,1,'normal recording mic still ticks');
  assert.equal(t.pressure.inspect().takeId,'run:take-1');
  t.h.takeHunter={...HUNTER.armTakeHunter(null,{roll:0}),seconds:2};
  const before=t.h.takeHunter.cells;
  t.h.tickRecorder(.1);
  assert.equal(t.micReads,1);assert.equal(t.roomReads,2);
  assert.ok(t.h.takeHunter.cells<before,'active hunter responds to the sampled sound');
  assert.ok(t.events.some(event=>event.kind==='recording.answer'));
  t.setRecording(false);t.h.tickRecorder(.016);
  assert.equal(t.micReads,1,'the stop frame no longer samples');
  assert.equal(t.h.takeHunter.active,false);
  assert.ok(t.calls.includes('Whatever that was, it stopped when the tape did.'));
  assert.equal(t.pressure.inspect().closed,true,'the pressure session closes on the stop frame');
});
