import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateSourceRestCommittedCheckpoint} from '../src/game/source-rest-legacy.js';
import {SOURCE_REST_SEATS,sourceRestFocus} from '../src/game/source-rest-seat.js';
import {freshSourceContinuation,sourceContinuationCanOccupy} from '../src/game/source-continuation.js';

test('an already committed legacy rest ending resumes at the relocated supported seat without losing progress',()=>{
  const old={...freshSourceContinuation(),status:'active',phase:'wrong-return',chartId:1,feet:16.8,x:-99.35,z:-18,
    yaw:1,pitch:0,lastSafe:{x:-99.35,z:-18,feet:16.8,chartId:1},stepCount:12,
    velocity:{x:1,z:1},cameraTransit:{elapsed:0},bodyTransit:{elapsed:0},fall:{elapsed:0},recovery:{elapsed:0},reveal:{elapsed:0}};
  const updated=migrateSourceRestCommittedCheckpoint(old,{committed:true}),seat=SOURCE_REST_SEATS[0];
  assert.notEqual(updated,old);assert.equal(updated.stepCount,12);
  assert.equal(updated.x,seat.approach.x);assert.equal(updated.z,seat.approach.z);
  assert.equal(updated.chartId,seat.chartId);assert.equal(updated.feet,seat.feet);
  assert.ok(sourceContinuationCanOccupy(updated.x,updated.z,updated));
  assert.equal(sourceRestFocus(updated)?.id,seat.id);
  assert.equal(updated.fall,null);assert.equal(updated.recovery,null);assert.equal(updated.reveal,null);
  assert.equal(updated.cameraTransit,null);assert.equal(updated.bodyTransit,null);
  assert.deepEqual(updated.velocity,{x:0,z:0});
  assert.equal(migrateSourceRestCommittedCheckpoint(updated,{committed:true}),updated,'idempotent');
  assert.equal(old.chartId,1,'does not mutate the supplied save');
});

test('uncommitted, unrelated and Source III saves are never relocated by rest-ending migration',()=>{
  const old={phase:'wrong-return',chartId:1,feet:16.8,x:-99.35,z:-18};
  for(const value of [old,{...old,phase:'catch'},{...old,chartId:0},{...old,x:-80},{...old,feet:0},null]){
    assert.equal(migrateSourceRestCommittedCheckpoint(value),value);
    if(value!==old)assert.equal(migrateSourceRestCommittedCheckpoint(value,{committed:true}),value);
  }
});
