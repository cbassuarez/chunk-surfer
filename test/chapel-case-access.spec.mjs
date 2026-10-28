import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as D from '../src/game/chapel-tape-demand.js';
import * as tapes from '../src/game/playback.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function sourceFunction(name){
  const start=main.indexOf(`function ${name}(`),end=main.indexOf('\n}',start)+2;
  assert.ok(start>=0&&end>start,`production ${name} exists`);
  // The availability helper is intentionally a one-line function.
  return name==='chapelTapeCaseAvailable'?main.slice(start,main.indexOf('\n',start)):main.slice(start,end);
}
const context={runId:'chapel-case-access',chapelWon:true};
function heldState(){
  let state=D.reduceChapelTapeDemand(D.freshChapelTapeDemand(context.runId),{type:'arm'},context);
  state=D.reduceChapelTapeDemand(state,{type:'depart',route:'inversion'},context);
  return D.reduceChapelTapeDemand(state,{type:'catch',catch:{mode:'spatial',kind:'congregation',receiverId:'chapel-dressing:presence-0',doorId:'chapel-c17',
    anchor:{x:0,y:.94,z:0},initialDistance:1.8,position:{x:0,y:2},group:'upper',holder:'anchor'}},context);
}
function mediaSnapshot(){return JSON.stringify({takes:tapes.serializeTakes(),transport:tapes.tapeTransport()});}
function loadOriginalMedia(){
  tapes.loadTakes([{id:'actual-take:1',ordinal:1,roomId:'main_b3',startSeconds:0,endSeconds:47,durationSeconds:47,status:'accepted',sealed:true,counted:true,
    audible:[['original-buffer-id',.2]],discrete:[{cueId:'unchanged-marker',atSec:9}],slate:{key:'original-indexeddb-key'}}]);
  tapes.loadTapeTransport({headSeconds:23});
}
function harness(initial=heldState()){
  const log=[],live={case:initial,special:false,recording:false,playing:false};
  const host={...D,
    chapelTapeDemandState:()=>live.case,chapelTapeDemandContext:()=>context,usingSpecialSpace:()=>live.special,
    storyMode:true,itemLost:()=>false,usingSourceSpace:()=>false,usingStairAnomaly:()=>false,
    px:0,py:2,recordableRoomAt:()=> 'main_b3',setupComplete:()=>true,levelCheckHere:()=>false,flagTest:()=>true,
    currentElectricalHumFrame:()=>({audible:false}),currentWorld:()=> 'main_b3',finaleActive:false,
    REC:{isRecording:()=>live.recording,isListening:()=>false,isSlating:()=>false,isStalled:()=>false,
      hasTake:()=>false,takeIsContaminated:()=>false,recState:()=>({takes:[],spoiled:false})},
    PB:{hasTake:room=>tapes.hasTake(room),tapeTake:room=>tapes.tapeTake(room),isPlaying:()=>live.playing,
      playTake:room=>{log.push(['play',room]);live.playing=true;return true;},stopPlayback:()=>{log.push('stop-playback');live.playing=false;}},
    SPEECH:{say:line=>log.push(['say',line])},cancelApparitionApplause:()=>log.push('cancel-applause'),micCheckActive:()=>false,
    openListen:room=>log.push(['listen',room]),takeHunter:{active:false},stopTake:()=>log.push('stop-take'),
    dreamFigure:null,toggleTowerPersonalRecorder:()=>false,tryRigCheck:()=>false,recorderLate:{pending:false,bypass:false},
    scenes:{has:()=>false,push:scene=>log.push(['scene',scene.id]),blocksWorld:()=>false,blocksInput:()=>false},RECORDER_SCENE_ID:'recorder',
    CUES:{CUE:{bag:'bag'},playCue:()=>log.push('case-cue')},makeRecorderScene:()=>({id:'recorder'}),
    recorderMachineState:()=>({}),recorderTapeRows:()=>[],firstTakeIntercept:()=>false,
    ensureTapeAudio:()=>log.push('audio-init'),roomToneCharacter:()=>({}),lowerTowerPersonalRecorder:()=>log.push('lower-recorder'),
    framedLine:key=>({text:key}),LINES:{},playbackRoom:'main_b3',pendingTapeRoll:false,
    paused:false,gameplayInputLifecycleActive:()=>true,arrowDelta:()=>[0,0],R3:{r3dChapelTapeDemandStatus:()=>({ready:true})},
    chapelTapeTugHeld:true,chapelTapeSavedProgress:0,chapelTapeDemandPhysical:p=>({x:p.x,y:0,z:p.y}),
    commitChapelTapeDemand:next=>{live.case=next;},fireCue:()=>{},rememberChapelTapeDemandDeparture:()=>{},syncChapelTapeDemandTimelineHold:()=>{},escape:null,performance:{now:()=>1000},
  };
  vm.createContext(host);
  vm.runInContext(['chapelTapeCaseAvailable','recorderRefusal','recordAction','openRecorder','playTakeFrom','tickChapelTapeDemand'].map(sourceFunction).join('\n'),host);
  return{host,live,log,run:code=>vm.runInContext(code,host)};
}

test('actual availability follows physical custody and leaves special-scene ownership intact',()=>{
  const h=harness();assert.equal(h.run('chapelTapeCaseAvailable()'),false);
  h.live.case={...h.live.case,catch:{...h.live.case.catch,holder:'player'}};
  assert.equal(h.run('chapelTapeCaseAvailable()'),true,'the player can use a case still in their own grip');
  h.live.case=heldState();h.live.special=true;
  assert.equal(h.run('chapelTapeCaseAvailable()'),true,'protected special scenes retain their own recorder routing');
  h.live.special=false;h.live.case={...h.live.case,status:'complete'};
  assert.equal(h.run('chapelTapeCaseAvailable()'),true,'a completed old checkpoint cannot suppress later equipment');
});

test('production recorder, record and playback entries refuse the locally held case without changing its media',()=>{
  loadOriginalMedia();const before=mediaSnapshot(),h=harness();
  assert.equal(h.run('recorderRefusal().reason'),'CASE OUT OF REACH');
  h.run('recordAction()');assert.equal(h.run('openRecorder()'),false);assert.equal(h.run("playTakeFrom('main_b3')"),false);
  assert.ok(h.log.every(entry=>Array.isArray(entry)&&entry[0]==='say'),'refusals create no transport, scene or recording side effects');
  assert.equal(h.log.length,2);assert.equal(mediaSnapshot(),before,'original buffers, media references, ordering, markers, credit and tape head remain intact');
});

test('reclaim restores the actual entry paths rather than recreating recordings',()=>{
  loadOriginalMedia();const before=mediaSnapshot(),h=harness();
  h.live.case=D.reduceChapelTapeDemand(h.live.case,{type:'interact',distanceM:.8,slack:true},context);
  assert.equal(h.run('recorderRefusal()'),null);
  h.run('recordAction()');assert.ok(h.log.some(entry=>entry[0]==='listen'&&entry[1]==='main_b3'));
  assert.equal(h.run('openRecorder()'),true);assert.ok(h.log.some(entry=>entry[0]==='scene'&&entry[1]==='recorder'));
  assert.equal(h.run("playTakeFrom('main_b3')"),true);assert.ok(h.log.some(entry=>entry[0]==='play'&&entry[1]==='main_b3'));
  assert.equal(mediaSnapshot(),before);
});

test('the production custody transition stops active playback once and leaves the original tape manifest intact',()=>{
  loadOriginalMedia();const before=mediaSnapshot(),held=heldState();
  const h=harness({...held,catch:{...held.catch,holder:'player',strainSeconds:.9}});h.live.playing=true;
  h.run('tickChapelTapeDemand(.1)');
  assert.equal(h.live.case.catch.holder,'anchor');assert.equal(h.live.playing,false);assert.equal(h.host.playbackRoom,null);
  assert.equal(h.log[0],'stop-playback');assert.equal(h.log.length,2);assert.match(h.log[1][1].text,/case latch has snapped/);
  assert.equal(h.run('chapelTapeCaseAvailable()'),false);
  h.run('tickChapelTapeDemand(.1)');assert.equal(h.log.length,2,'continued held custody does not restart playback or repeat the damage warning');
  assert.equal(mediaSnapshot(),before);
});

test('the actual reclaim action requires the same floor group and a clear reach through the rendered wall spans',()=>{
  loadOriginalMedia();const before=mediaSnapshot(),h=harness(),spans=new Map();
  let clear=false,group='ground',checks=0;h.host.py=.8;
  h.host.FP={logicalToPhysical:()=>({renderGroup:group}),physicalSpanData:()=>({cells:spans})};
  h.host.chapelLineOfSight=(actual,from,to)=>{
    checks++;assert.equal(actual,spans);assert.equal(from.y,1.1);
    assert.equal(to,h.live.case.catch.anchor);return clear;
  };
  vm.runInContext(sourceFunction('interactChapelTapeDemand'),h.host);
  h.run('interactChapelTapeDemand()');assert.equal(h.live.case.status,'caught');assert.equal(checks,0,'a different floor group refuses before reaching through its ceiling');
  group='upper';h.run('interactChapelTapeDemand()');
  assert.equal(h.live.case.status,'caught');assert.equal(checks,1,'a nearby case across stone cannot be reclaimed');
  clear=true;h.run('interactChapelTapeDemand()');
  assert.equal(h.live.case.status,'released');assert.equal(checks,2);assert.equal(h.run('chapelTapeCaseAvailable()'),true);
  assert.equal(mediaSnapshot(),before);
});
