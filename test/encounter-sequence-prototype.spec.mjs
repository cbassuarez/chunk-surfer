import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncounterSequence } from '../src/prototypes/encounter/sequence.js';
const advanceTo=(s,phase)=>{for(let i=0;i<1000&&s.snapshot().phase!==phase;i++)s.tick(.04);assert.equal(s.snapshot().phase,phase);};
test('scare, battle frame and character reveal precede preparation; READY gates combat',()=>{
  const s=createEncounterSequence(),seen=[];
  s.confirm();
  for(let i=0;i<150;i++){const state=s.tick(.04);if(!seen.includes(state.phase))seen.push(state.phase);assert.equal(state.canAct,false);}
  assert.deepEqual(seen,['called','intrusion','versus','battle','reveal','dialogue']);
  s.confirm();assert.equal(s.snapshot().phase,'equipment');
  for(let i=0;i<500;i++)assert.equal(s.tick(.08).canAct,false);
  s.confirm();assert.equal(s.snapshot().phase,'arming');assert.equal(s.snapshot().canAct,false);
  advanceTo(s,'fight');assert.equal(s.snapshot().canAct,true);
});
test('held confirmation cannot dismiss dialogue or ready the module',()=>{
  const s=createEncounterSequence();s.confirm();advanceTo(s,'dialogue');
  s.confirm({repeat:true});assert.equal(s.snapshot().phase,'dialogue');
  s.confirm();s.confirm({repeat:true});assert.equal(s.snapshot().phase,'equipment');
});
test('dialogue is optional but equipment preparation is mandatory',()=>{
  const s=createEncounterSequence({dialogue:false});s.confirm();advanceTo(s,'equipment');
  assert.equal(s.snapshot().canAct,false);
});
test('a suspended frame cannot consume the scare; pause holds all progress and input',()=>{
  const s=createEncounterSequence();s.confirm();s.tick(100);assert.equal(s.snapshot().phase,'called');
  s.pause(true);const before=s.snapshot();s.tick(1000);s.confirm();assert.deepEqual(s.snapshot(),before);
  s.preview('fight');assert.equal(s.snapshot().canAct,false);s.pause(false);assert.equal(s.snapshot().canAct,true);
});
test('results close the action gate and ignore READY',()=>{
  const s=createEncounterSequence();s.finish();assert.equal(s.snapshot().phase,'exploration');
  s.preview('fight');s.finish();assert.equal(s.snapshot().canAct,false);s.confirm();assert.equal(s.snapshot().phase,'result');
});
