import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C} from '../src/data/source-continuation.js';
import {freshSourceContinuation,stepSourceContinuation,sourceContinuationDoorFraction} from '../src/game/source-continuation.js';

const seed=extra=>({...freshSourceContinuation({runId:'door-approach'}),status:'active',...extra});
function advance(value,seconds,input={}){let state=value;const events=[];for(let left=seconds;left>1e-8;left-=.05){const r=stepSourceContinuation(state,{dt:Math.min(.05,left),...input});state=r.state;events.push(...r.events);}return{state,events};}
const onward={x:-12,z:-12,feet:8.4,yaw:-Math.PI/2};

test('a visible forward approach opens the leaves once before contact without crossing the threshold',()=>{
  const r=advance(seed(onward),1);assert.equal(r.state.doorOpen['wrong-onward'],true);
  assert.equal(r.events.filter(e=>e.type==='door'&&e.id==='wrong-onward').length,1);
  assert.equal(r.events.find(e=>e.type==='door').automatic,true);
  assert.equal(sourceContinuationDoorFraction(r.state,'wrong-onward'),1);assert.equal(r.state.x,onward.x);assert.equal(r.state.phase,'wrong-return');
});
test('distance, approach alignment, view and floor prevent remote or unseen openings',()=>{
  for(const extra of[{...onward,x:-10},{...onward,z:-16},{...onward,yaw:Math.PI/2},{...onward,feet:0}]){
    const r=advance(seed(extra),1);assert.equal(r.state.doorOpen['wrong-onward'],undefined);
  }
});
test('pause and unready presentation cannot open a door or consume its leaf clock',()=>{
  for(const input of[{paused:true},{renderReady:false}]){
    const before=seed(onward),r=advance(before,1,input);assert.equal(r.state.elapsed,0);assert.deepEqual(r.state.doorOpen,{});
  }
});
test('false-return recognition follows seeing the opened porch rather than an unseen automatic handle event',()=>{
  let r=advance(seed({x:6,z:-2,feet:8.4,yaw:Math.PI}),1);assert.equal(r.state.doorOpen['wrong-false-return'],true);assert.equal(r.state.closure.mode,'dormant');
  r=advance({...r.state,z:3,yaw:0},1);assert.equal(r.state.closure.mode,'dormant','looking away does not witness the altered return');
  r=advance({...r.state,yaw:Math.PI},.1);assert.equal(r.state.closure.mode,'primed');assert.equal(r.events.filter(e=>e.type==='return-recognized').length,1);
});
test('the final leaves welcome approach but completion still requires ordinary walking through them',()=>{
  let r=advance(seed({phase:'catch',level:3,...C.catch.finalApproach}),1);assert.equal(r.state.doorOpen['catch-final'],true);assert.equal(r.state.completed,false);
  r=advance(r.state,1,{forward:1});assert.equal(r.state.completed,true);assert.equal(r.events.filter(e=>e.type==='complete').length,1);
});
test('manual leaf reversal survives later ticks and reload instead of fighting automatic reopening',()=>{
  let r=stepSourceContinuation(seed({...onward,x:-16.5}),{interact:true});r=advance(r.state,1);r=stepSourceContinuation(r.state,{interact:true});assert.equal(r.state.doorOpen['wrong-onward'],false);
  r=advance(JSON.parse(JSON.stringify(r.state)),1);assert.equal(sourceContinuationDoorFraction(r.state,'wrong-onward'),0);assert.ok(!r.events.some(e=>e.type==='door'));
});
test('a redundant handle press cannot shut an automatically welcomed threshold, including after reload',()=>{
  let r=advance(seed({...onward,x:-16.5}),.2);assert.equal(r.state.doorMotion['wrong-onward'].automatic,true);
  r=stepSourceContinuation(JSON.parse(JSON.stringify(r.state)),{interact:true});assert.equal(r.state.doorOpen['wrong-onward'],true);assert.ok(!r.events.some(e=>e.type==='door'));
  r=advance(r.state,1);assert.equal(sourceContinuationDoorFraction(r.state,'wrong-onward'),1);
});
test('return frames remain an intentional retreat and auto doors never grant a new destination on their own',()=>{
  const r=advance(seed({x:0,z:2,feet:0,yaw:Math.PI}),2);assert.deepEqual(r.state.doorOpen,{});assert.equal(r.state.status,'active');assert.equal(r.state.completed,false);
});
