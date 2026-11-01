import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_REST_PERFORMANCE} from '../src/data/source-rest-performance.js';
import {sourceRestAfflictionFrame as frame,SOURCE_REST_AFFLICTION as config} from '../src/game/source-rest-affliction.js';
const active=(time,extra={})=>frame({active:true,currentTime:time,playedSeconds:time,...extra});
const ranges=SOURCE_REST_PERFORMANCE.annotations.filter(row=>row.type==='grueling');

test('only the exact human-marked onset begins hurt, including clustered mistakes',()=>{
  const first=SOURCE_REST_PERFORMANCE.annotations.find(row=>row.type==='mistake');
  assert.equal(first.start,35.032);
  assert.equal(active(first.start-1e-10).pain,0);
  const at=active(first.start),after=active(first.start+1e-10),peak=active(first.start+.014);
  assert.equal(at.mistakeCount,1);assert.equal(at.latestMistake.id,first.id);assert.ok(at.pain>0);
  assert.equal(after.mistakeIds[0],first.id);assert.ok(peak.pain>at.pain);
  assert.equal(active(first.start+config.mistakeSeconds).pain,0);
  const cluster=active(678.396+.014);
  assert.ok(cluster.mistakeIds.length>=4);assert.ok(cluster.pain>0&&cluster.pain<=1);
  assert.equal(cluster.latestMistake.time,678.396);
});

test('all 127 reported mistakes retain an individual physical cue, including those after black',()=>{
  const rows=SOURCE_REST_PERFORMANCE.annotations.filter(row=>row.type==='mistake');
  assert.equal(rows.length,127);
  for(const row of rows){
    const cue=active(row.start,{progress:row.start>=510?1:.2});
    assert.ok(cue.mistakeIds.includes(row.id),`${row.id} at ${row.start} was omitted`);
    assert.ok(cue.pain>0,`${row.id} must hurt even at its exact onset`);
  }
});

test('marked strain ramps, releases, and leaves irreversible world damage behind',()=>{
  const first=ranges[0],second=ranges[1];
  assert.equal(active(first.start-1e-10).passage,null);
  assert.equal(active(first.start).passage.id,first.id);assert.equal(active(first.start).strain,0);
  const during=active(first.start+12),edge=active(first.end-1e-10),after=active(first.end),recovered=active(first.end+22);
  assert.ok(during.strain>.4);assert.equal(edge.passage.id,first.id);assert.equal(after.passage,null);
  assert.ok(after.strain>0,'the body takes a breath after exertion');
  assert.ok(recovered.strain<after.strain*.01);
  assert.ok(recovered.destruction>=after.destruction,'completed structural damage never heals between passages');
  assert.ok(active(second.end+1).destruction>recovered.destruction);
});

test('the final marked passage and late mistakes continue after the earlier black',()=>{
  const terminal=ranges[2],length=SOURCE_REST_PERFORMANCE.duration;
  assert.equal(terminal.endPolicy,'track-end');assert.equal(terminal.start,621.375);
  const late=active(700.6+.014,{progress:1});
  assert.equal(late.phase,'black-ordeal');assert.equal(late.latestMistake.time,700.6);assert.ok(late.pain>.4);
  assert.equal(late.passage.id,terminal.id);assert.equal(late.passage.effectiveEnd,length);assert.equal(late.passage.terminal,true);
  assert.equal(active(terminal.end+.01,{progress:1}).passage.id,terminal.id,'raw marked end does not release the deliberate last passage');
  assert.equal(active(length-1e-10,{progress:1}).passage.id,terminal.id);
  const end=active(length,{progress:1});assert.equal(end.passage,null);assert.equal(end.strain,0);assert.equal(end.pressure,0);assert.equal(end.phase,'spent');
  assert.equal(end.destruction,1);assert.equal(end.mistakeCount,127);
});

test('motor failure is authored after the opportunity to leave, never inferred from a late media position',()=>{
  const lateArrival=active(665,{progress:.1});assert.equal(lateArrival.motorGain,1);assert.equal(lateArrival.inputLost,false);
  const before=active(457,{progress:.56}),weak=active(457,{progress:.74}),lastResponse=active(480,{progress:.88-1e-10}),lost=active(480,{progress:.88});
  assert.equal(before.motorGain,1);assert.ok(weak.motorGain>0&&weak.motorGain<before.motorGain);
  assert.equal(lastResponse.inputLost,false);assert.equal(lost.motorGain,0);assert.equal(lost.inputLost,true);assert.equal(lost.facultyLoss,1);
});

test('holds are deterministic, reduced motion preserves consequence, and inactive owners are completely released',()=>{
  const values={active:true,currentTime:460.11,playedSeconds:460.11,progress:.78};
  assert.deepEqual(frame(values),frame(values),'no frame-time or random source can run during a hold');
  const reduced=frame({...values,reducedMotion:true}),ordinary=frame(values);
  for(const key of ['pain','strain','destruction','facultyLoss','motorGain','inputLost'])assert.equal(reduced[key],ordinary[key]);
  const off=frame({...values,active:false});
  for(const key of ['pain','strain','destruction','facultyLoss','pressure','mistakeCount'])assert.equal(off[key],0);
  assert.equal(off.motorGain,1);assert.equal(off.inputLost,false);assert.equal(off.latestMistake,null);assert.equal(off.passage,null);
  assert.ok(Object.values(frame({active:true,currentTime:Infinity,playedSeconds:NaN,progress:NaN})).every(value=>typeof value!=='number'||Number.isFinite(value)));
});

test('an actually completed media cycle does not repair the accumulated architecture',()=>{
  const length=SOURCE_REST_PERFORMANCE.duration,wrapped=frame({active:true,currentTime:0,playedSeconds:length,progress:.5});
  assert.equal(wrapped.completedCycles,1);assert.equal(wrapped.destruction,1);assert.equal(wrapped.mistakeCount,127);
  assert.equal(wrapped.motorGain,1,'the conversation still owns the early opportunity to leave');
});
