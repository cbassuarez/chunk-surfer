import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as REC from '../src/game/recordist.js';
import * as PB from '../src/game/playback.js';
import {createConversation} from '../src/game/conversation.js';
import {createRecordingStopConfirmation,recordingStopPrompt} from '../src/game/recording-stop-confirmation.js';

function fixture(overrides={}){
  let time=0,stops=0,opened=0,choice=null;
  const take={id:'run:take:1',runId:'run',recording:true,elapsed:2,minimum:45,active:true,...overrides};
  const api=createRecordingStopConfirmation({readTake:()=>take,now:()=>time,
    openChoice:value=>{opened++;choice=value;return {};},
    onDiscard:()=>{stops++;take.recording=false;}});
  return {take,api,get choice(){return choice;},get stops(){return stops;},get opened(){return opened;},advance:ms=>time+=ms};
}

test('early STOP explains actual duration and defaults to continuing without a state write',()=>{
  const f=fixture();assert.equal(f.api.request(),true);assert.equal(f.stops,0);
  assert.match(f.api.notice(),/TOO SHORT.*2.0 \/ 45.0s MIN/);
  assert.equal(f.choice.nodes.start.choices[0].recordingStop,'continue');
  f.choice.onDone();assert.equal(f.stops,0);assert.equal(f.take.recording,true);
  assert.equal(f.api.notice(),'RECORDING CONTINUES');
});

test('discard requires the explicit choice and commits exactly once after the picker completes',()=>{
  const f=fixture();f.api.request();f.choice.onChoice({recordingStop:'discard'});
  assert.equal(f.stops,0);f.choice.onDone();f.choice.onDone();f.choice.onCancel();
  assert.equal(f.stops,1);assert.equal(f.api.notice(),'TAKE DISCARDED · ROOM NOT COMPLETE');
});

test('discard feedback survives production tape cleanup and stays with its run until the next roll',()=>{
  const room='main_b3';
  try{
    for(const transition of ['timeout','new take','new run']){
      PB.loadTakes([]);
      PB.beginTake(room,{x:15,y:12});
      const abandoned=PB.startTapeTake(room);
      let time=0,recording=true,runId='run',choice;
      const api=createRecordingStopConfirmation({
        readTake:()=>({id:PB.takeFor(room)?.id,runId,recording,elapsed:2,minimum:45}),
        openChoice:config=>{choice=config;return {};},now:()=>time,
        onDiscard:()=>{recording=false;PB.finishTapeTake(room,{elapsed:2});},
      });
      assert.equal(api.request(),true);
      choice.onChoice({recordingStop:'discard'});choice.onDone();
      assert.equal(PB.takeFor(room),null);
      assert.equal(PB.tapeTake(abandoned.id).status,'abandoned');
      assert.equal(PB.tapeTake(abandoned.id).counted,false);
      assert.equal(api.notice(),'TAKE DISCARDED · ROOM NOT COMPLETE');
      if(transition==='timeout')time=4200;
      if(transition==='new take'){
        PB.beginTake(room,{x:15,y:12});PB.startTapeTake(room);recording=true;
      }
      if(transition==='new run')runId='next-run';
      assert.equal(api.notice(),'');
    }
  }finally{PB.loadTakes([]);}
});

test('the short take notice stays readable while its confirmation is open',()=>{
  const f=fixture();f.api.request();f.advance(9000);
  assert.match(f.api.notice(),/TOO SHORT/);
  f.choice.onDone();assert.equal(f.api.notice(),'RECORDING CONTINUES');
  f.advance(4200);assert.equal(f.api.notice(),'');
});

test('Escape and scene removal abandon a selected discard without stopping',()=>{
  const f=fixture();f.api.request();f.choice.onChoice({recordingStop:'discard'});f.choice.onCancel();f.choice.onDone();
  assert.equal(f.stops,0);assert.equal(f.api.notice(),'RECORDING CONTINUES');
});

test('repeated STOP cannot stack confirmations for the same take',()=>{
  const f=fixture();for(let i=0;i<12;i++)assert.equal(f.api.request(),true);
  assert.equal(f.opened,1);assert.equal(f.stops,0);
});

test('an old picker cannot discard a later attempt, including a later attempt in the same room',()=>{
  const f=fixture();f.api.request();const old=f.choice;f.take.id='run:take:2';f.api.request();
  old.onChoice({recordingStop:'discard'});old.onDone();assert.equal(f.stops,0);
  f.choice.onChoice({recordingStop:'discard'});f.choice.onDone();assert.equal(f.stops,1);
});

test('pause, focus loss, end of take and a newly usable take prevent a stale discard',()=>{
  for(const change of [{active:false},{recording:false},{elapsed:45},{spoiled:true},{interrupted:true}]){
    const f=fixture();f.api.request();f.choice.onChoice({recordingStop:'discard'});Object.assign(f.take,change);
    f.choice.onDone();assert.equal(f.stops,0,JSON.stringify(change));
  }
});

test('valid takes, calibration, slate, paused source and authored interruption retain direct authority',()=>{
  for(const state of [{elapsed:45},{elapsed:60},{calibration:true},{slating:true},{stalled:true},{interrupted:true},{spoiled:true},{recording:false},{id:null}]){
    const f=fixture(state);assert.equal(f.api.request(),false,JSON.stringify(state));assert.equal(f.opened,0);
  }
});

test('VFD refusal expires and cannot leak into another attempt',()=>{
  const f=fixture();f.api.refuse('STOP JAMMED · RECORDING CONTINUES');
  assert.match(f.api.notice(),/STOP JAMMED/);f.advance(4201);assert.equal(f.api.notice(),'');
  f.api.refuse('B3 SOURCE ACTIVE · STOP LOCKED');f.take.id='run:take:2';assert.equal(f.api.notice(),'');
});

test('unavailable confirmation never silently discards an early take',()=>{
  let stops=0;
  const api=createRecordingStopConfirmation({readTake:()=>({id:'run:take:1',recording:true,elapsed:1,minimum:45}),
    openChoice:()=>null,onDiscard:()=>stops++});
  assert.equal(api.request(),true);assert.equal(stops,0);assert.equal(api.inspect().pending,null);
});

test('the configured recording setup supplies the real usable minimum',()=>{
  for(const scale of [.5,1,1.5]){
    REC.stopRecording();REC.stopListening();REC.loadRecState({injuries:0});
    REC.configureDifficulty({takeSecondsScale:scale});REC.startListening();REC.startRecording();
    const minimum=REC.minimumTakeDuration(),f=fixture({minimum});f.api.request();
    assert.match(f.choice.nodes.start.lines[0].text,new RegExp(minimum.toFixed(1).replace('.','\\.')));
    REC.stopRecording();
  }
  REC.configureDifficulty({takeSecondsScale:1});
});

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
test('production STOP checks authored gates before ordinary confirmation',()=>{
  const a=main.indexOf('function recordAction('),b=main.indexOf('\n  if(usingSourceSpace()){',a);
  const action=main.slice(a,b)+'\n}';
  function run({hunter=false,b3=false,interrupted=false,confirm=true}={}){
    const events=[],context=vm.createContext({
      chapelTapeCaseAvailable:()=>true,cancelApparitionApplause(){},micCheckActive:()=>false,
      REC:{isRecording:()=>true,isSlating:()=>false,isStalled:()=>false,takeInterrupted:()=>interrupted},
      takeRoom:b3?'main_b3':'the_tub',b3Speaker:{snapshot:()=>({phase:'playing'})},b3SpeakerAudio:{state:()=>({error:null})},
      activeDifficulty:{values:{}},takeHunter:{active:hunter},HUNTER:{tryCancelTake:()=>({state:{active:true},resisted:true})},
      recordingStopConfirmation:{request:()=>{events.push('confirmation');return confirm;},refuse:text=>events.push(text)},
      pressControl(){},pressPromptControl(){},recordingPressurePerformance:{stopPress(){}},recordingPressureFrame:()=>({}),
      SPEECH:{say(){}},stopTake:()=>events.push('stop'),
    });
    vm.runInContext(action,context);context.recordAction();return events;
  }
  assert.deepEqual(run(),['confirmation']);
  assert.deepEqual(run({confirm:false}),['confirmation','stop']);
  assert.deepEqual(run({b3:true}),['B3 SOURCE ACTIVE · STOP LOCKED']);
  assert.deepEqual(run({hunter:true}),['STOP JAMMED · RECORDING CONTINUES']);
  assert.deepEqual(run({hunter:true,interrupted:true,confirm:false}),['confirmation','stop']);
});

test('the actual recorder note and live footer both receive local STOP feedback',()=>{
  assert.match(main,/note:recordingStopConfirmation\.notice\(\)\|\|/);
  assert.match(main,/footer: recordingStopConfirmation\.notice\(\)\|\|/);
  assert.match(main,/converse\('recording-stop',nodes,[\s\S]*?blocksWorld:true/);
  assert.match(main,/converse\('recording-stop',nodes,[\s\S]*?audio:\{\.\.\.STORY,stopTapeHiss:undefined\}/);
  assert.match(main,/const recorderNotice=[^\n]*recordingStopConfirmation\.notice\(\);[\s\S]*?drawVfdText\(x,y,message,/);
  assert.equal(recordingStopPrompt({elapsed:1,minimum:45}).done.lines.length,0);
});

test('the production conversation service defaults to continue and finishes without a second confirmation',()=>{
  for(const key of ['Enter','2']){
    const f=fixture();f.api.request();
    const convo=createConversation({...f.choice,voiceEnabled:false});convo.start();convo.update(2);convo.key({key:'Enter'});
    assert.equal(convo.view().pending.index,0);convo.key({key});
    assert.equal(convo.view().finished,true);assert.equal(f.stops,key==='2'?1:0);
  }
});

test('ordinary recording capture is event-based and its only raw slate capture ends before confirmation',()=>{
  const playback=readFileSync(new URL('../src/game/playback.js',import.meta.url),'utf8');
  const a=main.indexOf('function finishRecordingSlate('),b=main.indexOf('\nfunction tickRecordingSlate(',a),slate=main.slice(a,b);
  assert.match(slate,/active\.capture\.stop\(\)/);assert.match(slate,/REC\.finishSlate\(\)/);
  assert.ok(slate.indexOf('active.capture.stop()')<slate.indexOf('REC.finishSlate()'));
  assert.equal(playback.includes('new MediaRecorder'),false);
  assert.match(main,/if\(!scenes\.blocksWorld\(\)\)\{[\s\S]*?tickRecorder\(dt\)/);
  assert.match(main,/if\(REC\.isRecording\(\)\)PB\.advanceTape\(takeRoom,REC\.recState\(\)\.takeTapeElapsed\)/);
});
