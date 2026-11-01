import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEndingCutsceneCheckpoint,freshSave,withTransientGameState,getSave} from '../src/game/save.js';
import {freshRunRecord} from '../src/progression/schema.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';

const final={schema:1,endingId:'contact-lost',arrival:'rested',variant:'source-rest'};

test('a pre-final Source Rest lock retains only its exact run/real-seat identity across normalization and reload',async()=>{
  for(const seat of SOURCE_REST_SEATS){
    const checkpoint={...final,restLock:{runId:'lock-save-test',seatId:seat.id,untrusted:'discard'}};
    const normalized=normalizeEndingCutsceneCheckpoint(checkpoint);
    assert.deepEqual(normalized,{...final,restLock:{runId:'lock-save-test',seatId:seat.id}});
    const save=freshSave({run:freshRunRecord({id:'lock-save-test'})});save.endingCutscene=JSON.parse(JSON.stringify(normalized));
    await withTransientGameState({save},()=>assert.deepEqual(getSave().endingCutscene,normalized));
  }
});

test('malformed pre-final consent is rejected instead of silently being promoted into a final unmarked ending',()=>{
  for(const marker of [null,[],{},'source-rest',{runId:'',seatId:'source-rest-ii'},{runId:' x',seatId:'source-rest-ii'},
    {runId:42,seatId:'source-rest-ii'},{runId:'x'.repeat(513),seatId:'source-rest-ii'},{runId:'run',seatId:'invented-seat'},
    {runId:'run',seatId:1}])assert.equal(normalizeEndingCutsceneCheckpoint({...final,restLock:marker}),null);
});

test('other ending/arrival/variant combinations never acquire a temporary Rest lock',()=>{
  const marker={runId:'run',seatId:'source-rest-ii'};
  for(const checkpoint of [{endingId:'helped',arrival:'agreed'},{endingId:'contact-lost',arrival:'defeated'},
    {endingId:'contact-lost',arrival:'rested'},{endingId:'contact-lost',arrival:'rested',variant:'wrong'},
    {endingId:'sacrifice',arrival:'agreed',variant:'century-stay'}]){
    const normalized=normalizeEndingCutsceneCheckpoint({...checkpoint,restLock:marker});
    assert.ok(normalized);assert.equal(Object.hasOwn(normalized,'restLock'),false);
  }
});

test('the real final onCommit receipt remains unmarked and existing ending normalization is unchanged',()=>{
  const normalized=normalizeEndingCutsceneCheckpoint(final);assert.deepEqual(normalized,final);assert.equal(Object.hasOwn(normalized,'restLock'),false);
  assert.deepEqual(normalizeEndingCutsceneCheckpoint({endingId:'tower-won',arrival:'escaped',cursor:7}),{schema:1,endingId:'tower-won',arrival:'escaped'});
  assert.equal(normalizeEndingCutsceneCheckpoint({endingId:'unknown',arrival:'rested',restLock:{runId:'run',seatId:'source-rest-ii'}}),null);
});
