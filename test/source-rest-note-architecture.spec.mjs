import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceRestNoteArchitecture as render} from '../src/game/source-rest-note-architecture.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {SOURCE_REST_HORIZON} from '../src/game/source-rest-horizon.js';
const notes=[{midi:50,onset:1,duration:1,velocity:.8,confidence:.9},{midi:62,onset:1.02,duration:1.2,velocity:.7,confidence:.85},
  {midi:69,onset:1.05,duration:.4,velocity:.9,confidence:.8},{midi:50,onset:2,duration:.6,velocity:.6,confidence:.9}],
  at=(time,extra={})=>render({notes,currentTime:time,playedSeconds:time,duration:12,...extra});

test('the Ophanim horizon replaces the semiangel at its pivot and submits no organism meshes',()=>{
  const seat=SOURCE_REST_SEATS[0];
  for(const time of[0,1,3,10]){
    const view=at(time);assert.equal(view.parts.length,0);assert.equal(view.lights.length,0);
    assert.equal(view.diagnostics.topology,'ophanim-horizon');assert.equal(view.horizon.active,true);
    assert.deepEqual(view.horizon.centre,[seat.x+SOURCE_REST_HORIZON.pivot[0],seat.feet+SOURCE_REST_HORIZON.pivot[1],seat.z+SOURCE_REST_HORIZON.pivot[2]]);
  }
  assert.equal(at(4,{progress:.96}).horizon.active,false,'the existing blackout still removes the presence');
  const unscored=render({notes:[],currentTime:200,playedSeconds:200});
  assert.equal(unscored.horizon.active,true,'the hole follows the marked recording before the note score has loaded');
  assert.equal(unscored.horizon.breath,0);
});

test('recognized notes are still accounted exactly and never leak forward through interpolation',()=>{
  assert.equal(at(1-1e-10).diagnostics.represented,0);assert.equal(at(1).diagnostics.represented,1);
  assert.equal(at(1.02).diagnostics.represented,2);assert.equal(at(4).diagnostics.represented,4);
  const loop=at(0,{playedSeconds:12});assert.equal(loop.diagnostics.completedPasses,1);assert.equal(loop.diagnostics.represented,4);
  const invalid=render({notes:[...notes,{midi:Infinity,onset:3,duration:1}],currentTime:4});
  assert.equal(invalid.diagnostics.invalid,1);assert.equal(invalid.diagnostics.represented,4);
  const score=JSON.parse(readFileSync(new URL('../public/audio/source-rest/seb-bach-chaconne-notes.json',import.meta.url),'utf8')),
    full=render({notes:score.notes,currentTime:720,playedSeconds:720});
  assert.equal(full.diagnostics.recognized,4009);assert.equal(full.diagnostics.represented,4009);
});

test('the phrase breath that brightens the wheels keeps its nine-second ceiling under dense passages',()=>{
  const dense=Array.from({length:180},(_,i)=>({midi:50,onset:i*.025,duration:.8,velocity:1,confidence:1}));
  let previous=null,peak=0;
  for(let t=0;t<=8;t+=.05){
    const view=render({notes:dense,currentTime:t,playedSeconds:t});peak=Math.max(peak,view.horizon.breath);
    assert.ok(view.horizon.breath>=0&&view.horizon.breath<=1);
    if(previous){const rate=(view.diagnostics.breathPhase-previous.diagnostics.breathPhase)/.05;
      assert.ok(rate>=-1e-5&&rate<=Math.PI*2/9+.001,'onset density cannot accelerate the phrase breath beyond a nine-second cycle');}
    previous=view;
  }
  assert.ok(peak>.5,'dense playing visibly brightens the wheels');
});

test('held clocks are exact and an exhausted score invents no wall-clock motion',()=>{
  assert.deepEqual(at(2.3),at(2.3));
  assert.deepEqual(at(80).horizon.rings.map(r=>r.normal),at(80).horizon.rings.map(r=>r.normal));
  assert.equal(at(80).horizon.breath,at(90).horizon.breath);
});
