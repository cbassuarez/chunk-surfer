import test from 'node:test';
import assert from 'node:assert/strict';
import {readHorizonApproachRecord,horizonApproachSelection,HORIZON_RECORD_FLAGS as F,HORIZON_SARAH_RULE as RULE} from '../src/game/horizon-approach-record.js';

test('the record reader uses actual evidence and leaves old saves a complete route',()=>{
  const old={'confession.kind':'name','confession.value':'Sarah','last.arc':'.3'},before=JSON.stringify(old),record=readHorizonApproachRecord(old);
  assert.equal(record.confession,'Sarah');assert.equal(record.arc,.3);
  assert.equal(record.sarahRespected,false);assert.equal(record.lyleBox,null);assert.equal(record.antWatched,false);
  assert.equal(horizonApproachSelection(old).occupant,'daisy');assert.equal(JSON.stringify(old),before);
  assert.deepEqual(readHorizonApproachRecord(key=>old[key]),record);
  assert.equal(readHorizonApproachRecord({'confession.kind':'nothing','confession.value':'Sarah'}).confession,null);
  for(const [value,want] of [['bad',0],[-4,0],[2,1]])assert.equal(readHorizonApproachRecord({'last.arc':value}).arc,want);
});
test('Sarah needs encountered refusal and no later call, with the rule explicitly named',()=>{
  for(const evidence of [F.sarahRefusal,F.sarahBench]){
    const flags={[evidence]:true,'confession.kind':'name','confession.value':'Sarah'};
    assert.equal(readHorizonApproachRecord(flags).sarahRespected,true);
    assert.equal(horizonApproachSelection(flags).occupant,'sarah');
    assert.equal(readHorizonApproachRecord({...flags,'phone.called.sarah':true}).sarahRespected,false);
    assert.equal(readHorizonApproachRecord(flags,{sarahRule:RULE.PENDING}).sarahRespected,false);
  }
  assert.equal(readHorizonApproachRecord({[F.sarahPage]:true}).sarahRespected,false,'a page is no consent decision');
  assert.equal(readHorizonApproachRecord({'phone.called.enquiries':true}).sarahRespected,false,'calling 192 does not prove the refusal was heard');
  assert.equal(readHorizonApproachRecord({'phone.cost.sarah':true}).sarahRespected,false);
});
test('Lyle prefers the completed broken-box encounter over explicit whole-box evidence',()=>{
  const both={'station.coast.complete':true,'station.coast.musicbox.heard':true,[F.lyleWhole]:true};
  assert.equal(readHorizonApproachRecord(both).lyleBox,'broken');
  assert.equal(readHorizonApproachRecord({[F.lyleWhole]:true}).lyleBox,'whole');
  assert.equal(readHorizonApproachRecord({'station.coast.complete':true}).lyleBox,null);
  assert.equal(readHorizonApproachRecord({'station.coast.musicbox.heard':true}).lyleBox,null);
  assert.equal(readHorizonApproachRecord({'cab.music-box.inspected':true}).lyleBox,null);
});
test('finishing the cab tune earns the broken-box offer without inventing a coast visit',()=>{
  const flags={[F.lyleCab]:true,'confession.kind':'name','confession.value':'Lyle'},record=readHorizonApproachRecord(flags),selection=horizonApproachSelection(flags);
  assert.equal(F.lyleCab,'horizon.lyle.cabTuneHeard');assert.equal(record.lyleBox,'broken');assert.equal(record.coast,false);
  assert.equal(selection.occupant,'lyle');assert.equal(selection.condition,true);assert.equal(selection.lyleBox,'broken');
  assert.equal(readHorizonApproachRecord({...flags,[F.lyleWhole]:true}).lyleBox,'broken');
  assert.equal(readHorizonApproachRecord({[F.lyleCab]:false}).lyleBox,null);
  assert.equal(readHorizonApproachRecord({'opening.cab.music-box.wound':true}).lyleBox,null);
});
test('the ant condition records its actual crossing outcome, never merely the visit',()=>{
  assert.equal(readHorizonApproachRecord({[F.antOutcome]:'gone'}).antWatched,true);
  for(const value of [undefined,'stood','over',true])assert.equal(readHorizonApproachRecord({[F.antOutcome]:value,'memory.field.second':true}).antWatched,false);
  assert.equal(horizonApproachSelection({'last.arc':'.9',[F.antOutcome]:'gone'}).occupant,'ant');
});
