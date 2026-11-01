import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceRestHarpsichordResponse} from '../src/game/source-rest-harpsichord-response.js';
import {parseSourceRestNoteScore,createSourceRestNoteAsset} from '../src/game/source-rest-note-score.js';

const score=parseSourceRestNoteScore({duration:30,notes:[{midi:48,onset:2,duration:1,velocity:.9,confidence:.9},
  {midi:67,onset:3,duration:.7,velocity:.8,confidence:.85},{midi:86,onset:4,duration:.8,velocity:.7,confidence:.9}]});
test('strings follow real independent note onsets and registers, not an elapsed animation clock',()=>{
  const before=sourceRestHarpsichordResponse({score,currentTime:1.9}),low=sourceRestHarpsichordResponse({score,currentTime:2.2}),
    high=sourceRestHarpsichordResponse({score,currentTime:4.2});
  assert.equal(before.pressure,0);assert.ok(low.registers[0]>0);assert.equal(low.registers[1],0);assert.equal(low.registers[2],0);
  assert.ok(high.registers[2]>0);assert.ok(low.acousticLift>0);assert.equal(low.electronicLift,0);
  assert.equal(low.diagnostics.independentClock,false);assert.equal(low.diagnostics.extraAudio,false);
  assert.deepEqual(low,sourceRestHarpsichordResponse({score,currentTime:2.2,elapsed:1000}));
});
test('the actual revoicing mix transfers response between choirs without altering pitches or source position',()=>{
  const acoustic=sourceRestHarpsichordResponse({score,currentTime:4.2,electronic:0}),electronic=sourceRestHarpsichordResponse({score,currentTime:4.2,electronic:1});
  assert.ok(acoustic.acousticLift>electronic.acousticLift);assert.ok(electronic.electronicLift>acoustic.electronicLift);
  assert.deepEqual(acoustic.diagnostics.activeNoteIds,electronic.diagnostics.activeNoteIds);
  assert.equal(acoustic.time,electronic.time);
});
test('reduced motion removes mechanical displacement; unavailable analysis uses measured audio without invented notes',()=>{
  const reduced=sourceRestHarpsichordResponse({score,currentTime:4.2,signal:.5,electronic:.8,reducedMotion:true});
  for(const key of ['acousticLift','electronicLift','bridgeLift','lidAngle'])assert.equal(reduced[key],0);
  assert.ok(reduced.lightPressure>0);
  const quiet=sourceRestHarpsichordResponse({currentTime:20}),level=sourceRestHarpsichordResponse({currentTime:20,signal:.7});
  assert.equal(quiet.pressure,0);assert.equal(level.pressure,.7);assert.deepEqual(level.diagnostics.activeNoteIds,[]);
  assert.equal(level.diagnostics.inventedNotes,false);assert.equal(level.diagnostics.notes,0);
});
test('the shipped full Couperin analysis remains bounded through note-heavy passages and repeat playheads',()=>{
  const actual=parseSourceRestNoteScore(JSON.parse(readFileSync(new URL('../public/audio/source-rest/couperin/couperin-revoicing.json',import.meta.url))));
  assert.equal(actual.notes.length,9153);
  const samples=[];for(let time=0;time<actual.duration;time+=.733){
    const response=sourceRestHarpsichordResponse({score:actual,currentTime:time,electronic:.8,signal:.5});samples.push(response);
    assert.ok(response.diagnostics.examined<=256);assert.ok(response.lidAngle<=.018);
    assert.ok(response.acousticLift<=.040&&response.electronicLift<=.048&&response.bridgeLift<=.012);
    assert.ok(Object.values(response).filter(value=>typeof value==='number').every(Number.isFinite));
  }
  assert.ok(samples.some(sample=>sample.diagnostics.activeNoteIds.length>5));
  assert.deepEqual(sourceRestHarpsichordResponse({score:actual,currentTime:100}),sourceRestHarpsichordResponse({score:actual,currentTime:100}));
});
test('the existing asset owner can load Couperin explicitly while its Bach default remains unchanged',async()=>{
  const calls=[],fetcher=async url=>{calls.push(url);return{ok:true,json:async()=>({duration:30,notes:[]})};};
  const bach=createSourceRestNoteAsset({fetcher,resolveAsset:p=>p}),couperin=createSourceRestNoteAsset({fetcher,resolveAsset:p=>p,url:'audio/source-rest/couperin/couperin-revoicing.json'});
  await Promise.all([bach.load(),couperin.load()]);
  assert.deepEqual(calls,['audio/source-rest/seb-bach-chaconne-notes.json','audio/source-rest/couperin/couperin-revoicing.json']);
  assert.equal(couperin.snapshot().state,'ready');
});
