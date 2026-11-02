import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceRestClock,SOURCE_REST_BLACK_PROGRESS} from '../src/game/source-rest-pacing.js';

const source=(time=0)=>({playing:true,paused:false,protected:false,currentTime:time,playedSeconds:time,duration:716.4});

test('a late arrival gets a complete readable arc without an enforced extra musical cycle',()=>{
  const audio=source(500),clock=createSourceRestClock(()=>audio);clock.update();
  assert.equal(clock.snapshot().heardSeconds,0);assert.equal(clock.snapshot().untilBlack,435);
  assert.equal(clock.snapshot().cueMode,'late-arrival');
  audio.currentTime=600;audio.playedSeconds=600;clock.update();
  assert.equal(clock.snapshot().heardSeconds,100);
  assert.ok(clock.snapshot().progress>0&&clock.snapshot().progress<SOURCE_REST_BLACK_PROGRESS);
});

test('unity-speed seating retains the preferred cue only while the real readable budget fits',()=>{
  const audio=source(75),clock=createSourceRestClock(()=>audio);clock.update();
  assert.equal(clock.snapshot().untilBlack,435);assert.equal(clock.snapshot().targetPlayhead,510);
  assert.equal(clock.snapshot().cueMode,'preferred');
  const preferredEdge=createSourceRestClock(()=>source(75));preferredEdge.update();assert.equal(preferredEdge.snapshot().cueMode,'preferred');
  const shifted=createSourceRestClock(()=>source(76));shifted.update();assert.equal(shifted.snapshot().cueMode,'within-major');
  assert.equal(shifted.snapshot().targetPlayhead,511);
  const edge=createSourceRestClock(()=>source(115));edge.update();assert.equal(edge.snapshot().cueMode,'within-major');
  assert.equal(edge.snapshot().targetPlayhead,550);
  const after=createSourceRestClock(()=>source(116));after.update();assert.equal(after.snapshot().cueMode,'late-arrival','the shifted cue does not claim alignment beyond 550s');
});

test('pause, protection and a regressed counter cannot manufacture progress',()=>{
  const audio=source(),clock=createSourceRestClock(()=>audio);clock.update();
  audio.playedSeconds=10;audio.currentTime=10;clock.update();
  const held=clock.snapshot();audio.paused=true;audio.playedSeconds=20;clock.update(10);
  audio.paused=false;audio.protected=true;audio.playedSeconds=30;clock.update(10);
  assert.equal(clock.snapshot().heardSeconds,held.heardSeconds);
  audio.protected=false;audio.playedSeconds=5;clock.update();
  assert.equal(clock.snapshot().heardSeconds,held.heardSeconds);
  audio.playedSeconds=6;clock.update();assert.equal(clock.snapshot().heardSeconds,held.heardSeconds+1);
});

test('a held decision keeps narrative progress still while the performance continues, then anchors a readable remainder',()=>{
  const audio=source(),clock=createSourceRestClock(()=>audio);clock.update();
  audio.playedSeconds=60;audio.currentTime=60;clock.update();clock.hold();const p=clock.snapshot().progress;
  audio.playedSeconds=600;audio.currentTime=600;clock.update();
  assert.equal(clock.snapshot().progress,p);assert.equal(clock.snapshot().heardSeconds,600);
  clock.resume();const resumed=clock.snapshot();assert.ok(resumed.untilBlack-600>350&&resumed.untilBlack-600<435);
  assert.equal(resumed.cueMode,'late-arrival');assert.equal(resumed.progress,p);
});

test('loading does not invent performance; an explicit failure permits a finite fallback',()=>{
  let audio={playing:false,loading:true};const clock=createSourceRestClock(()=>audio);
  clock.update(30);assert.equal(clock.snapshot().progress,0);
  audio={playing:false,failed:'not available'};clock.update(10);
  assert.equal(clock.snapshot().failed,true);assert.equal(clock.snapshot().heardSeconds,10);
  assert.ok(clock.snapshot().progress>0);
});
