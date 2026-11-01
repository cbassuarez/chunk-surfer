import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSourceRestNoteScore,createSourceRestNoteAsset} from '../src/game/source-rest-note-score.js';

test('recorded notes retain independent simultaneous pitches, precise onset and bounded decay',()=>{
  const score=parseSourceRestNoteScore({duration:10,notes:[{midi:69,onset:1.137,duration:12,velocity:.7,confidence:.8},
    {midi:62,onset:1.137,duration:.8,velocity:.5,confidence:.9}]});
  assert.equal(score.notes.length,2);assert.equal(score.notes[0].onset,1.137);
  assert.deepEqual(score.notes.map(n=>n.midi),[62,69]);assert.equal(score.notes[1].duration,8.863);
  assert.ok(Object.isFrozen(score.notes));assert.ok(Object.isFrozen(score.notes[0]));
  assert.throws(()=>parseSourceRestNoteScore({duration:10,notes:[{midi:62,onset:NaN,duration:.4}]}));
});

test('one load is shared and an unavailable analysis never invents a replacement score',async()=>{
  let calls=0;const asset=createSourceRestNoteAsset({resolveAsset:p=>p,fetcher:async()=>{calls++;return{ok:false,status:404};}});
  const first=asset.load();assert.equal(asset.load(),first);assert.equal(await first,null);
  assert.equal(calls,1);assert.equal(asset.snapshot().state,'unavailable');assert.equal(asset.snapshot().score,null);
});
