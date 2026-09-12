import test from 'node:test';
import assert from 'node:assert/strict';
import * as REC from '../src/game/recordist.js';
import * as PB from '../src/game/playback.js';
import { ROOM_HISTORY, roomHistory } from '../src/data/room-history.js';
import { FACILITY_SPACE_IDS } from '../src/data/building-map.js';
import { makeTakeSlate, tickTakeSlate } from '../src/audio/take-slate.js';
import { buildRunSummary } from '../src/progression/report.js';
import { freshRunRecord, freshMeta } from '../src/progression/schema.js';

const reset=()=>{REC.stopRecording();REC.stopListening();REC.setTakeSink(null);REC.configureDifficulty({takeSecondsScale:1});REC.loadRecState({});PB.loadTakes([]);};
test('every issued room and discovered tower room has authored history; unknown rooms reveal none',()=>{
  assert.deepEqual(Object.keys(ROOM_HISTORY).sort(),[...FACILITY_SPACE_IDS].sort());
  for(const id of FACILITY_SPACE_IDS){const record=roomHistory({id});assert.ok(record.period&&record.use&&record.fact);assert.equal(roomHistory({id,unknown:true}),null);}
});
test('the slate and held tape advance physical time without earning clean seconds',()=>{
  reset();REC.startListening();REC.startRecording({slate:true});
  REC.emitNoise(.9,0,0,'spoken slate');assert.equal(REC.tickRecording(6),'slating');
  assert.equal(REC.recState().takeElapsed,0);assert.equal(REC.recState().takeTapeElapsed,6);
  REC.finishSlate();REC.stallTake();REC.tickRecording(9);REC.resumeTake();REC.tickRecording(45);
  assert.equal(REC.usableTake(),true);
  const result=REC.stopRecording();assert.equal(result.completed,true);assert.equal(result.elapsed,45);assert.equal(result.tapeElapsed,60);
});
test('reference 44.99 is short, 45 is fully usable, 60 auto-completes; microphones retain both timing costs',()=>{
  for(const [scale,minimum,target] of [[1,45,60],[1.1,49.5,66],[.9,40.5,54]]){
    reset();REC.configureDifficulty({takeSecondsScale:scale});REC.startListening();REC.startRecording();
    assert.equal(REC.minimumTakeDuration(),minimum);assert.equal(REC.takeDuration(),target);
    REC.tickRecording(minimum-.01);assert.equal(REC.usableTake(),false);
    REC.tickRecording(.011);assert.equal(REC.usableTake(),true);assert.equal(REC.stopRecording().completed,true);
    REC.startListening();REC.startRecording();assert.equal(REC.tickRecording(target),'complete');REC.stopRecording();
  }
});
test('abandoned and spoiled takes retain audio events and a good replacement counts the room only once',()=>{
  reset();
  for(const [elapsed,completed,spoiled] of [[15,false,false],[21,false,true],[49,true,false]]){
    PB.beginTake('main_b3',{});const take=PB.startTapeTake('main_b3',{text:'Ellery',mode:'fallback'});
    PB.notePresence('main_b3',.7,9);PB.noteDiscrete('main_b3',{cueId:'bell.tenor.clock',atSec:10});
    if(completed)PB.markTake('main_b3');
    PB.finishTapeTake('main_b3',{elapsed:completed?45:elapsed,tapeElapsed:elapsed,completed,spoiled});
    assert.equal(PB.hasTake(take.id),true);assert.equal(PB.takeRoomIds().length,completed?1:0);
  }
  const saved=JSON.parse(JSON.stringify(PB.serializeTakes()));PB.loadTakes(saved);
  assert.deepEqual(PB.serializeTakes(),saved);
  assert.deepEqual(PB.tapeTakes().map(t=>[t.status,t.startSeconds,t.endSeconds]),[['abandoned',0,15],['spoiled',15,36],['accepted',36,85]]);
  assert.deepEqual(PB.takeRoomIds(),['main_b3']);assert.equal(PB.tapeTransport().headSeconds,85);
  for(const take of PB.tapeTakes()){assert.equal(take.presence.peak,.7);assert.equal(take.discrete[0].atSec,10);}
  REC.loadRecState({tapes:saved});assert.deepEqual(REC.recState().takes,['main_b3']);
});
test('quitting during a take retains the elapsed attempt without awarding the room',()=>{
  reset();PB.beginTake('r',{});PB.startTapeTake('r');PB.advanceTape('r',17);
  PB.loadTakes(JSON.parse(JSON.stringify(PB.serializeTakes())));
  assert.equal(PB.tapeTakes()[0].status,'abandoned');assert.equal(PB.tapeTransport().endSeconds,17);assert.deepEqual(PB.takeRoomIds(),[]);
});
test('opening and closing the monitor does not consume tape or discard an accepted take',()=>{
  reset();PB.beginTake('r',{});PB.sealTake('r');const end=PB.tapeTransport().endSeconds;
  PB.beginTake('r',{});PB.abortTake('r');assert.equal(PB.hasTake('r'),true);assert.equal(PB.tapeTakes().length,1);assert.equal(PB.tapeTransport().endSeconds,end);
});
test('slating waits for a voice and a clean pause, never for speech recognition',()=>{
  const slate=makeTakeSlate({room:'Studio B3',ordinal:3,date:new Date(2026,8,7)});
  assert.match(slate.text,/Take 3/);assert.match(slate.text,/7 September 2026/);
  assert.equal(tickTakeSlate(slate,{dt:4,level:0}),false);
  assert.equal(tickTakeSlate(slate,{dt:.7,level:.02}),false);
  assert.equal(tickTakeSlate(slate,{dt:.5,level:0}),false);
  assert.equal(tickTakeSlate(slate,{dt:.7,level:0}),true);
});
test('unfinished work lowers the assessment until a clean replacement is delivered',()=>{
  const run=freshRunRecord({preset:'contract',id:'test-tape-report',now:1000});
  const save={run,rec:{tapes:[{roomId:'b3',status:'abandoned'},{roomId:'tub',status:'spoiled'}]}};
  const assess=(takes,contaminated=[])=>buildRunSummary({endingId:'inversion',save,meta:freshMeta(),authoritative:{rec:{takes,contaminated}},now:2000}).takes;
  assert.deepEqual(assess([]).unfinishedRooms,['b3','tub']);
  assert.equal(assess([]).assessment,'RETAKES OUTSTANDING');
  assert.deepEqual(assess(['b3','tub'],['tub']).unfinishedRooms,['tub']);
  const replaced=assess(['b3','tub','c','d','e']);
  assert.deepEqual(replaced.unfinishedRooms,[]);assert.equal(replaced.assessment,'COMPLETE');
});
test('a recorded apparition returns at its original tape time through a long take',()=>{
  const presence={peak:.75,atSec:38};
  const shape=PB.guestShape(presence,{durationSeconds:78,playbackSeconds:78});
  assert.equal(shape.enterSec,38);assert.equal(shape.corroborated,true);
});
test('STOP cancels a seek, preserves the tape head and permits fast-forward to append',()=>{
  reset();let stops=0;
  const ctx={currentTime:0};
  PB.playbackInit({ctx,bus:{},onTransport:()=>({stop:()=>stops++})});
  PB.beginTake('r',{});PB.startTapeTake('r');PB.finishTapeTake('r',{elapsed:15,completed:false});
  const seek=PB.playTake('take:1');ctx.currentTime=seek.seconds/2;PB.tickPlayback();
  const halfway=PB.tapeTransport().headSeconds;assert.ok(halfway>0&&halfway<15);
  PB.stopPlayback();ctx.currentTime+=10;assert.equal(PB.tickPlayback(),'idle');
  assert.equal(PB.tapeTransport().headSeconds,halfway);
  assert.equal(PB.cueTapeEnd(),true);ctx.currentTime+=5;assert.equal(PB.tickPlayback(),'cued');
  assert.equal(PB.tapeTransport().headSeconds,15);assert.equal(stops,2);
});
