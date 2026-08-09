import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STEDMAN_TRIPLES_84_WITH_TENOR } from '../src/data/bell-tower.js';
import { PEAL_ASSIST_MODE, PEAL_INTERFERENCE, TENOR_TIMING, createBellPealClock, createBellPealPerformance, gradeTenorTiming, pealInterferenceAt, pealMusicalElapsedForRow, tenorTargetForRow } from '../src/game/bell-peal-performance.js';
import { calibrationOffsetFromSamples } from '../src/game/bell-peal-calibration-scene.js';
import { createBellPealScene } from '../src/game/bell-peal-scene.js';
import { createBellTowerRuntime } from '../src/game/bell-tower-runtime.js';

assert.equal(STEDMAN_TRIPLES_84_WITH_TENOR.length,84);
for(let row=0;row<84;row++){const target=tenorTargetForRow(row);assert.equal(target.row[7],8);assert.equal(target.place,undefined);}
for(const delta of [-90,0,90])assert.equal(gradeTenorTiming(delta),'perfect');
for(const delta of [-180,-91,91,180])assert.equal(gradeTenorTiming(delta),'good');
for(const delta of [-260,-181,181,260])assert.equal(gradeTenorTiming(delta),'accepted');
for(const delta of [-261,261])assert.equal(gradeTenorTiming(delta),'miss');
for(const delta of [-140,140])assert.equal(gradeTenorTiming(delta,PEAL_ASSIST_MODE.WIDE),'perfect');
for(const delta of [-260,-141,141,260])assert.equal(gradeTenorTiming(delta,PEAL_ASSIST_MODE.WIDE),'good');
for(const delta of [-400,-261,261,400])assert.equal(gradeTenorTiming(delta,PEAL_ASSIST_MODE.WIDE),'accepted');
for(const delta of [-401,401])assert.equal(gradeTenorTiming(delta,PEAL_ASSIST_MODE.WIDE),'miss');
assert.equal(calibrationOffsetFromSamples([50,55,45,50],30),-20);

assert.deepEqual(pealInterferenceAt(PEAL_INTERFERENCE.learningMs-1).activeBells,[1,2,3,4,5,6,7,8]);
assert.deepEqual(pealInterferenceAt(PEAL_INTERFERENCE.learningMs).removedBells,[2],'the Surfer first removes one working bell after the teaching section');
assert.deepEqual(pealInterferenceAt(69_000).activeBells,[8],'the subtraction resolves into a tenor-only timing section');
assert.deepEqual(pealInterferenceAt(PEAL_INTERFERENCE.returnAtMs).activeBells,[1,8],'the first absent rope returns at the ninety-second musical mark');
assert.equal(pealInterferenceAt(126_000).activeBells.length,8,'the full band returns before the closing rows');
assert.equal(pealInterferenceAt(69_000).hud.timing,true,'Surfer interference never removes the indispensable timing cue');
assert.equal(pealInterferenceAt(69_000).hud.progress,false,'nonessential HUD is stripped during the solo');
assert.ok(pealMusicalElapsedForRow(56)>=90_000&&pealMusicalElapsedForRow(55)<90_000,'row-derived musical time crosses the return close to 1:30');

let audioSeconds=10,perfNow=1000;
const clock=createBellPealClock({context:{get currentTime(){return audioSeconds;},baseLatency:.01,outputLatency:.02},performanceApi:{now:()=>perfNow},timingOffsetMs:5});
clock.start(0);audioSeconds=10.6;perfNow=1600;
assert.equal(Math.round(clock.nowMs()),600);assert.equal(Math.round(clock.judgementNowMs()),575);
assert.equal(Math.round(clock.eventTransportMs(1580)),555,'event age, automatic output latency, and manual offset share one mapping');
clock.freeze();audioSeconds=20;assert.equal(Math.round(clock.nowMs()),600,'a frozen audio clock ignores wall/audio time');clock.resume();audioSeconds=20.2;assert.equal(Math.round(clock.nowMs()),800);

let stampedAudio=20,stampedPerf=4000;
const stampedClock=createBellPealClock({
  context:{get currentTime(){return stampedAudio;},baseLatency:.01,outputLatency:.02,getOutputTimestamp(){return{contextTime:stampedAudio-.06,performanceTime:stampedPerf};}},
  performanceApi:{now:()=>stampedPerf},timingOffsetMs:5,
});
stampedClock.start(0);stampedAudio=20.5;stampedPerf=4500;
assert.equal(Math.round(stampedClock.nowMs()),500);assert.equal(Math.round(stampedClock.judgementNowMs()),445);
assert.equal(stampedClock.snapshot().timestampMapping,'output-timestamp');assert.equal(Math.round(stampedClock.snapshot().automaticLatencyMs),60);

const strikes=[];let completed=0,misses=0,rows=0;
const performance=createBellPealPerformance({
  onStrike:(record,options)=>strikes.push({record,options}),onRow:({row})=>{rows=row;},onMiss:()=>{misses++;},onComplete:()=>{completed++;},
});
assert.deepEqual([0,13,14,27,28,41,42,55,56,69,70,83].map((row)=>createBellPealPerformance({initialRow:row}).snapshot().phrase),[0,0,1,1,2,2,3,3,4,4,5,5],'six deterministic presentation phrases contain fourteen rows each');
performance.start();performance.tick(TENOR_TIMING.countInBeatMs*TENOR_TIMING.countInBeats/1000);
let snap=performance.snapshot();assert.equal(snap.phase,'row');assert.equal(snap.row,0);assert.equal(strikes.length,7);
performance.tick((snap.target.atMs-snap.clockMs-300)/1000);assert.equal(performance.press().ok,false);assert.equal(misses,1);assert.equal(performance.snapshot().row,0);
performance.tick(TENOR_TIMING.retryMs/1000);assert.equal(performance.snapshot().row,0);

let guard=0;
while(performance.snapshot().phase!=='complete'&&guard++<20000){
  snap=performance.snapshot();
  if(snap.phase==='row'&&!snap.tenorResolved){performance.tick(Math.max(0,(snap.target.atMs-snap.clockMs)/1000));assert.equal(performance.press().ok,true);}
  else performance.tick(.05);
}
assert.equal(rows,84);assert.equal(completed,1);assert.equal(performance.snapshot().row,84);
performance.start();performance.tick(10);assert.equal(completed,1,'completion callback remains exactly once');
assert.equal(strikes.filter((entry)=>entry.options.player).length,84);
assert.ok(strikes.filter((entry)=>!entry.options.player).every((entry)=>entry.record.bell!==8));

const soloStrikes=[];
const soloPerformance=createBellPealPerformance({initialRow:44,onStrike:(record,options)=>soloStrikes.push({record,options})});
soloPerformance.start();soloPerformance.tick(TENOR_TIMING.countInBeatMs*TENOR_TIMING.countInBeats/1000);
assert.deepEqual(soloPerformance.snapshot().activeBells,[8]);
assert.equal(soloStrikes.filter((entry)=>!entry.options.player).length,0,'removed members leave actual audible holes rather than merely hiding UI');

let hitchAudio=0,hitchPerf=0,recalls=0;
const hitchClock=createBellPealClock({context:{get currentTime(){return hitchAudio;},baseLatency:0,outputLatency:0},performanceApi:{now:()=>hitchPerf}});
const hitchPerformance=createBellPealPerformance({clock:hitchClock,onRecall:()=>{recalls++;}});hitchPerformance.start();
for(let index=0;index<8;index++){hitchAudio+=.3;hitchPerf+=300;hitchPerformance.tick(99);}
assert.equal(hitchPerformance.snapshot().phase,'row');hitchAudio+=.7;hitchPerf+=700;hitchPerformance.tick(.001);
assert.equal(hitchPerformance.snapshot().phase,'count_in');assert.equal(recalls,1,'an audio scheduler hitch recalls only the uncommitted row');
hitchPerformance.suspend('pause');hitchAudio+=10;hitchPerf+=10_000;assert.equal(hitchPerformance.snapshot().row,0);hitchPerformance.resume('pause');assert.equal(hitchPerformance.snapshot().phase,'count_in');

let runtimeNow=0,stood=0,performanceBusStarts=0,performanceAudioStrikes=0;
const runtime=createBellTowerRuntime({now:()=>runtimeNow,onCleared:()=>{stood++;},audio:{resetPerformance(){performanceBusStarts++;},strike(){performanceAudioStrikes++;}}});
runtime.start();runtime.beginPerformance();
assert.equal(performanceBusStarts,1,'taking the rope explicitly reopens the tower audio bus');
runtime.queuePerformanceStrike({bell:1,stroke:'hand',rowIndex:0,place:0},{delayMs:100});
runtimeNow=120;runtime.tick(.12);assert.equal(runtime.snapshot().runtimeMode,'performance');
assert.equal(performanceAudioStrikes,1,'queued peal contacts reach the audio runtime');
assert.equal(runtime.requestPerformanceStand().ok,true);
for(;runtimeNow<20_000&&runtime.state()!=='cleared';runtimeNow+=100)runtime.tick(.1);
assert.equal(runtime.state(),'cleared');assert.equal(stood,1);

let sceneStarts=0,scenePresses=0,sceneReleases=0;
const scene=createBellPealScene({performance:{start(){sceneStarts++;},tick(){},press(){scenePresses++;},release(){sceneReleases++;},snapshot:()=>null}});
scene.enter();scene.key({key:'',code:'',controllerAction:'mark',repeat:false,metaKey:false,ctrlKey:false,altKey:false});
scene.key({key:'',code:'',controllerAction:'interact',repeat:false,metaKey:false,ctrlKey:false,altKey:false});
assert.deepEqual([sceneStarts,scenePresses,sceneReleases],[1,1,1],'controller mark rings and controller interact lets go');
const sceneSource=readFileSync('src/game/bell-peal-scene.js','utf8');
assert.match(sceneSource,/drawMachinePanel\(/,'the peal uses the same screen-instrument chassis as combat');
assert.match(sceneSource,/TENOR ABSENT/,'a missed tenor gets explicit visual feedback');
assert.match(sceneSource,/MS \$\{side\}/,'judgements report signed early or late timing');
assert.doesNotMatch(sceneSource,/drawFirstPersonHands|r3dProjectWorld|anchor\?\./,'the retired world-anchored rope overlay is not rendered');
console.log('bell peal performance tests ok');
