import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as HUNTER from '../src/game/take-hunter.js';
import * as REC from '../src/game/recordist.js';
import * as controller from '../src/game/controller.js';
import * as scenes from '../src/game/scenes.js';
import {makeB3ConsoleScene} from '../src/game/b3-console-scene.js';
import {createRecordingPressurePerformance} from '../src/game/recording-pressure.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function section(from,to){const a=main.indexOf(from),b=main.indexOf(to,a);assert.ok(a>=0&&b>a,from);return main.slice(a,b);}
const hunterSource=section('function tickTakeHunter(', '\nfunction tickMic('),
 armSource=section('function armTakeHunter(', '\nfunction tickTakeHunter('),
 actionSource=section('function recordAction(', '\n  if(usingSourceSpace()){')+'\n}',
 rSource=section("    if(bare && is('KeyR','r')){",'\n    // [space]/[enter]');
function open(){
 REC.stopRecording();REC.stopListening();REC.setLoudNoiseSink(null);REC.setAcousticEmitter(null);REC.loadRecState({injuries:0});
 REC.configureDifficulty({minorNoise:'spoil',spoilNoiseScale:1,recordingNoiseScale:1,takeSecondsScale:1});REC.startListening();REC.startRecording();
}
function fixture({cells=4,needs=8}={}){
 open();const events=[],speech=[],calls={mic:0,stops:0,contacts:0};
 const pressure=createRecordingPressurePerformance({emit:e=>{events.push(e);return true;}}),
  h=vm.createContext({HUNTER,REC,storyMode:true,paused:false,focused:true,hud:true,
   gameplayInputLifecycleActive:()=>h.focused,scenes:{suppressesHud:()=>!h.hud},
   takeHunter:{...HUNTER.armTakeHunter(null,{roll:needs===6?0:needs===7?.5:1}),seconds:9,cells,warningSeconds:2.4},takeHunterClosing:true,
   MIC:{micActive:()=>true,micMaySpoil:()=>true,micEffectiveMeasurement:()=>{calls.mic++;return{effective:{rms:0}};}},
   recordingPressurePerformance:pressure,recordingPressureFrame:()=>({takeId:'run:take:1',roomId:'main_b3',recording:REC.isRecording(),stalled:REC.isStalled(),hunter:h.takeHunter,atSec:22}),
   SPEECH:{say:line=>speech.push(line)},CR:{fx:{flash:()=>calls.contacts++,shake(){}}},ROOM_TONE:{catchNoise:.4},px:0,py:0,
   chapelTapeCaseAvailable:()=>true,cancelApparitionApplause(){},micCheckActive:()=>false,pressControl(){},pressPromptControl(){},
   finishRecordingSlate:()=>REC.finishSlate(),resumeInstrumentTake:()=>REC.resumeTake(),
   stopTake:()=>{calls.stops++;REC.stopRecording();},openRecorder(){}});
 vm.runInContext(hunterSource+'\n'+actionSource+'\nfunction r(e){const bare=true,is=(code,ch)=>e.code===code||e.key===ch;'+rSource+'}',h);
 return{h,calls,events,speech,pressure};
}
const r=()=>({key:'r',code:'KeyR',repeat:false,preventDefault(){}});
test.afterEach(()=>{REC.stopRecording();REC.stopListening();scenes.clear();controller.controllerResetForTest();});

test('instrument HOLD freezes hunter distance, warning, quiet, forcing progress and contact despite held-source noise',()=>{
 const f=fixture();f.h.takeHunter.cancelTries=2;f.h.takeHunter.contactWindowElapsed=3.9;REC.stallTake();
 const before=structuredClone(f.h.takeHunter),beforeClosing=f.h.takeHunterClosing;
 for(let tick=0;tick<400;tick++){
  REC.decayNoise(.05);if(tick%40===0)REC.emitNoise(.34,0,0,'the instrument sounded',{sourceKind:'hush',audibleToHush:false,playerGenerated:false});
  f.h.tickTakeHunter(.05);
 }
 assert.deepEqual(f.h.takeHunter,before);assert.equal(f.h.takeHunterClosing,beforeClosing);assert.equal(f.calls.mic,0);assert.equal(f.calls.contacts,0);assert.deepEqual(f.events,[]);assert.equal(REC.takeProgress(),0);
 REC.emitNoise(.34,0,0,'permitted return footstep',{sourceKind:'player'});assert.ok(REC.currentNoise()>.3);
 REC.resumeTake();assert.equal(REC.currentNoise(),0,'actual resume discards the held noise envelope');
 f.h.tickTakeHunter(.05);assert.equal(f.h.takeHunter.quiet,.05);assert.ok(f.h.takeHunter.cells>before.cells);assert.equal(f.h.takeHunter.cancelTries,2);assert.equal(f.h.takeHunter.cancelNeeds,8);
});

test('HOLD rejects both immediate microphone arming and queued sounds crossing into the hold, then ordinary sound works after resume',()=>{
 const f=fixture(),queued=[];let now=1000;
 Object.assign(f.h,{TUT:{tutorialActive:()=>false},nightWorkBegun:()=>true,takeHunterArmedAt:0,
  performance:{now:()=>now},queueMicrotask:fn=>queued.push(fn),takeRoom:'main_b3',currentWorld:()=> 'main_b3'});
 vm.runInContext(armSource,f.h);
 REC.stallTake();const warned=structuredClone(f.h.takeHunter);f.h.armTakeHunter('held voice');
 assert.deepEqual(f.h.takeHunter,warned);assert.equal(queued.length,0);assert.equal(f.h.takeHunterArmedAt,0);assert.equal(f.speech.length,0);
 REC.resumeTake();f.h.takeHunter=HUNTER.freshTakeHunter();f.h.armTakeHunter('voice before hold');assert.equal(queued.length,1);
 REC.stallTake();queued.shift()();assert.equal(f.h.takeHunter.active,false);assert.equal(f.speech.length,0);
 REC.resumeTake();now=1700;f.h.armTakeHunter('actual resumed voice');queued.shift()();
 assert.equal(f.h.takeHunter.active,true);assert.equal(f.h.takeHunter.cause,'actual resumed voice');assert.equal(f.speech.length,1);
 now=2400;f.h.armTakeHunter('second resumed voice');queued.shift()();assert.equal(f.h.takeHunter.startles,1);assert.equal(f.speech.length,1);
});

test('pause, focus loss and hidden HUD cannot spend a ready contact or quiet recovery; ended takes still tear down',()=>{
 for(const gate of['pause','focus','hud']){
  const f=fixture({cells:1});f.h.takeHunter.contactWindowElapsed=4;
  if(gate==='pause')f.h.paused=true;else if(gate==='focus')f.h.focused=false;else f.h.hud=false;
  const before=structuredClone(f.h.takeHunter);f.h.tickTakeHunter(90);
  assert.deepEqual(f.h.takeHunter,before,gate);assert.equal(f.calls.contacts,0,gate);assert.equal(f.calls.mic,0,gate);
  REC.stopRecording();f.h.tickTakeHunter(0);assert.equal(f.h.takeHunter.active,false,'teardown is not held');
 }
});

test('resuming HOLD preserves deliberate bounded STOP seizure and ignores keyboard autorepeat',()=>{
 for(const needs of[6,7,8]){
  const f=fixture({needs});REC.stallTake();const before=structuredClone(f.h.takeHunter);f.h.tickTakeHunter(60);REC.resumeTake();
  for(let n=0;n<20;n++)f.h.r({...r(),repeat:true});assert.equal(f.h.takeHunter.cancelTries,0);
  for(let press=1;press<=needs;press++){
   f.h.r(r());assert.equal(f.h.takeHunter.cancelNeeds,before.cancelNeeds);
   assert.equal(REC.isRecording(),press<needs,`${needs} presses: press ${press}`);
  }
  assert.equal(f.calls.stops,1);assert.equal(f.h.takeHunter.cancelTries,needs);
 }
});

test('actual ordinary tick quiet-release opens the same STOP authority after 1.8 active seconds',()=>{
 const f=fixture();f.h.r(r());assert.equal(f.h.takeHunter.cancelTries,1);assert.equal(REC.isRecording(),true);
 for(let tick=0;tick<17;tick++)f.h.tickTakeHunter(.1);
 assert.equal(HUNTER.takeHunterTransport(f.h.takeHunter).phase,'seized');f.h.tickTakeHunter(.1);
 assert.equal(HUNTER.takeHunterTransport(f.h.takeHunter).quietReleased,true);f.h.r(r());assert.equal(REC.isRecording(),false);assert.equal(f.calls.stops,1);assert.equal(f.h.takeHunter.cancelTries,1);
});

test('actual physical STOP shares ordinary seizure but stops slate or instrument HOLD directly',()=>{
 for(const mode of['seized','ordinary','slate','hold']){
  const f=fixture({needs:6});if(mode==='ordinary')f.h.takeHunter=HUNTER.freshTakeHunter();
  if(mode==='hold')REC.stallTake();
  if(mode==='slate'){REC.stopRecording();REC.startListening();REC.startRecording({slate:true});}
  Object.assign(f.h,{scenePointerPayload:event=>event,pointerEventHitsGameplaySurface:()=>true,
   liveRecordingControlHit:()=>({id:'stop',controlId:'recording:stop'}),liveRecordingPointerControls:new Map(),
   BINDINGS:{setActiveInputDevice(){}},recoverInteractionAudio(){},ensureInteractionFocus(){},
   PB:{isPlaying:()=>false},cancelControlScope(){}});f.h.scenes.pointer=()=>false;
  vm.runInContext(section('function onPointerEvent(e){','\n// ── Boot').replaceAll('import.meta.env.DEV','false'),f.h);
  const press=()=>f.h.onPointerEvent({type:'pointerdown',button:0,pointerId:1});press();
  assert.equal(REC.isRecording(),mode==='seized',mode);
  if(mode==='seized'){
   assert.equal(f.h.takeHunter.cancelTries,1);for(let n=0;n<5;n++)press();
   assert.equal(REC.isRecording(),false);assert.equal(f.h.takeHunter.cancelTries,6);
  }
  assert.equal(f.calls.stops,1,mode);
 }
});

test('actual B3 modal controller allowlist delivers fresh RT to the same stop/refusal callback as keyboard R',()=>{
 const a=main.indexOf('const modalControllerActions = (() => {'),b=main.indexOf('CONTROLLER.gamepadTick({',a),allowed=new Function('modal','activeEndingCutscene',main.slice(a,b)+';return modalControllerActions;'),
  f=fixture({needs:6}),scene=makeB3ConsoleScene({isRecording:()=>REC.isRecording(),onRecord:()=>f.h.recordAction()});
 scenes.push(scene);assert.deepEqual(allowed(scene,null),['recorder']);scene.key(r());assert.equal(f.h.takeHunter.cancelTries,1);
 let down=false;controller.setControllerNavigatorForTest({getGamepads:()=>[{id:'Xbox Wireless Controller',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:18},(_,i)=>({pressed:down&&i===7,value:down&&i===7?1:0}))}]});
 const events=[],poll=()=>controller.gamepadTick({menuContext:true,modalActions:allowed(scene,null),onPress:(action,repeat)=>{events.push(action);scene.key({...r(),repeat,controllerAction:action});}});
 down=true;poll();assert.equal(f.h.takeHunter.cancelTries,2);poll();assert.equal(f.h.takeHunter.cancelTries,2,'holding RT cannot force repeat');
 for(let n=0;n<4;n++){down=false;poll();down=true;poll();}
 assert.equal(REC.isRecording(),false);assert.equal(f.calls.stops,1);assert.equal(events.filter(a=>a==='recorder').length,5);
});
