import test from 'node:test';
import assert from 'node:assert/strict';
import {freshNightClock,normalizeNightClock,advanceNightClock,applyNightClockLoss,nightClockReadout,captureNightClock,normalizeNightCapture} from '../src/game/night-clock.js';
import {takeStamp,timeOfTake} from '../src/game/clock.js';
import * as SAVE from '../src/game/save.js';
import * as PB from '../src/game/playback.js';

test('new night starts21:38, advances fractional foreground seconds and crosses midnight without a failure',()=>{
 let clock=freshNightClock();assert.equal(nightClockReadout({nightClock:clock}).value,'21:38');
 clock=advanceNightClock(clock,.25);assert.equal(clock.elapsedSeconds,.25);
 clock=advanceNightClock(clock,59.75);assert.equal(nightClockReadout({nightClock:clock}).value,'21:39');
 clock=advanceNightClock(clock,141*60);assert.equal(nightClockReadout({nightClock:clock}).value,'00:00');
 clock=advanceNightClock(clock,86400);assert.equal(nightClockReadout({nightClock:clock}).value,'00:00');
 assert.equal(clock.priorUnmeasured,false);assert.equal('failed'in clock,false);
});

test('explicit pace changes fictional time only and never multiplies a consequence by pace',()=>{
 const original=freshNightClock(),fast=advanceNightClock(original,10,{rate:3});
 assert.equal(original.elapsedSeconds,0);assert.equal(fast.elapsedSeconds,30);assert.equal(fast.rate,3);
 const loss=applyNightClockLoss(fast,8*60,'hush:1');assert.equal(loss.clock.elapsedSeconds,510);
 assert.equal(loss.applied,true);assert.equal(loss.clock.rate,3);
 const replay=applyNightClockLoss(JSON.parse(JSON.stringify(loss.clock)),14*60,'hush:1');
 assert.equal(replay.applied,false);assert.equal(replay.clock.elapsedSeconds,510);assert.equal(replay.clock.lossEvents.length,1);
 assert.equal(applyNightClockLoss(fast,60,'').applied,false);
});

test('legacy migration preserves elapsed/capture evidence without fabricating retrospective precision',()=>{
 const old={playSeconds:125,rec:{takes:['main_b3','the_tub']}};
 const clock=normalizeNightClock(null,{legacySave:old});
 assert.equal(clock.elapsedSeconds,151*60);assert.equal(nightClockReadout({nightClock:clock}).value,'00:09');
 assert.equal(clock.priorUnmeasured,true);assert.equal(nightClockReadout({nightClock:clock}).qualifier,'ESTIMATED');
 const later=normalizeNightClock(null,{legacySave:{playSeconds:20000,rec:{takes:['main_b3']}}});
 assert.equal(later.elapsedSeconds,19980,'whole-minute legacy lower bound, never Date.now');
 const stored=advanceNightClock(clock,12.5);assert.deepEqual(normalizeNightClock(JSON.parse(JSON.stringify(stored)),{legacySave:{playSeconds:999999}}),stored,'valid canonical save never re-infers legacy penalties');
 const irrelevant=normalizeNightClock(null,{legacySave:{rec:{tapes:[{roomId:'coastal_memory',status:'archived',counted:false},{roomId:'main_b3',status:'spoiled'}]}}});
 assert.equal(irrelevant.elapsedSeconds,0);
});

test('new take stamps use a frozen capture instant while unstamped old files keep their original erosion',()=>{
 let clock=advanceNightClock(freshNightClock(),121),stamp=captureNightClock(clock);
 assert.equal(takeStamp(0,{captured:stamp}),'21:4?');
 clock=advanceNightClock(clock,7200);assert.equal(takeStamp(0,{captured:stamp}),'21:4?');
 assert.equal(takeStamp(0),'22:5?');assert.equal(timeOfTake(1),'00:09');
 assert.equal(takeStamp(0,{captured:{...stamp,priorUnmeasured:true}}),'~21:4?');
 for(const bad of [null,{}, {schema:1,elapsedSeconds:-1},{schema:1,elapsedSeconds:NaN}])assert.equal(normalizeNightCapture(bad),null);
});

test('production save normalization retains the canonical night, loss receipts and a fresh new run',async()=>{
 const fresh=SAVE.freshSave();assert.deepEqual(fresh.nightClock,freshNightClock());
 const old={...fresh,playSeconds:10000,rec:{takes:['main_b3']}};delete old.nightClock;
 await SAVE.withTransientGameState({save:old},async()=>{
  const clock=SAVE.getSave().nightClock;assert.equal(clock.priorUnmeasured,true);assert.equal(clock.elapsedSeconds,9960);
  const loss=applyNightClockLoss(clock,360,'save-loss');SAVE.saveCommit({nightClock:loss.clock});
  const saved=structuredClone(SAVE.getSave());
  await SAVE.withTransientGameState({save:saved},async()=>assert.deepEqual(SAVE.getSave().nightClock,loss.clock));
  assert.equal(SAVE.getSave().playSeconds,10000);
 });
});

test('room and continuous cabin recordings persist capture stamps; legacy and received authored tapes stay unstamped',()=>{
 PB.loadTakes([]);let clock=advanceNightClock(freshNightClock(),125);
 PB.setNightClockSource(()=>clock);
 try{
  PB.beginTake('main_b3',{x:1,y:2});const first=PB.startTapeTake('main_b3');
  assert.deepEqual(first.nightStamp,captureNightClock(clock));
  PB.advanceTape('main_b3',60);PB.finishTapeTake('main_b3',{elapsed:60,tapeElapsed:60,completed:true});
  clock=advanceNightClock(clock,300);
  const field=PB.beginContinuousFieldTake({runId:'night-stamp',metadata:{kind:'field'}});assert.deepEqual(field.nightStamp,captureNightClock(clock));
  PB.interruptContinuousFieldTake(field.id,{elapsedSeconds:5});
  const saved=PB.serializeTakes();PB.loadTakes(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(PB.tapeTakes().map(t=>t.nightStamp),saved.map(t=>t.nightStamp));
  const legacy=[{roomId:'the_tub',durationSeconds:60,status:'accepted',counted:true,at:100}];PB.loadTakes(legacy);
  assert.equal(PB.takeFor('the_tub').nightStamp,undefined);assert.equal(PB.serializeTakes()[0].nightStamp,undefined);
  const received=PB.archiveAuthoredTake({roomId:'received',durationSeconds:3});assert.equal(received.nightStamp,undefined);
 }finally{PB.setNightClockSource(null);PB.loadTakes([]);}
});
