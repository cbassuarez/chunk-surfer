import test from 'node:test';
import assert from 'node:assert/strict';
import {MEMORY_FIELD_VISIT} from '../src/data/memory-field.js';
import {createMemoryFieldScene} from '../src/game/memory-field-scene.js';
import {readHorizonApproachRecord,HORIZON_RECORD_FLAGS as F} from '../src/game/horizon-approach-record.js';

async function field(visit=MEMORY_FIELD_VISIT.second){
  const flags={'memory.field.second':true},events=[];
  const scene=createMemoryFieldScene({visit,renderer:{initialize:()=>true,render:()=>true},
    onEvent:event=>{events.push(event);if(event.type==='stand')flags[F.antOutcome]=event.why;},
  });
  await scene.initialize();
  return{scene,flags,events};
}
const advance=(scene,seconds)=>{for(let t=0;t<seconds;t+=.05)scene.update(.05);};

test('the real field scene reports a completed ant crossing once, making the Horizon evidence durable',async()=>{
  const {scene,flags,events}=await field();
  assert.equal(readHorizonApproachRecord(flags).antWatched,false);
  advance(scene,10);scene.pause();advance(scene,30);
  assert.equal(readHorizonApproachRecord(flags).antWatched,false);
  scene.resume();advance(scene,100);
  assert.equal(flags[F.antOutcome],'gone');
  assert.equal(events.filter(e=>e.type==='stand').length,1);
  assert.equal(readHorizonApproachRecord(JSON.parse(JSON.stringify(flags))).antWatched,true);
});
test('getting up early is a different actual outcome and does not claim a crossing',async()=>{
  const {scene,flags,events}=await field();
  scene.key({key:'w'});advance(scene,1);scene.keyup({key:'w'});advance(scene,20);
  assert.equal(flags[F.antOutcome],'stood');assert.equal(events.filter(e=>e.type==='stand').length,1);
  assert.equal(readHorizonApproachRecord(flags).antWatched,false);
});
test('an interrupted visit or safety timeout does not invent the ant condition',async()=>{
  const partial=await field();advance(partial.scene,3);partial.scene.exit();advance(partial.scene,100);
  assert.equal(partial.events.some(e=>e.type==='stand'),false);assert.equal(readHorizonApproachRecord(partial.flags).antWatched,false);
  const visit={...MEMORY_FIELD_VISIT.second,ant:{...MEMORY_FIELD_VISIT.second.ant,maxSeconds:.15}};
  const timed=await field(visit);advance(timed.scene,1);
  assert.equal(timed.flags[F.antOutcome],'over');assert.equal(readHorizonApproachRecord(timed.flags).antWatched,false);
});
