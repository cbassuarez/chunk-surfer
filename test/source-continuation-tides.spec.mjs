import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSourceContinuation,stepSourceContinuation,normalizeSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_TIDES,sourceTideField,sourceTideWind} from '../src/game/source-continuation-tides.js';
import {windAt} from '../src/world/wind.js';

function run(start,seconds,input={}){
  let state={...freshSourceContinuation({runId:'tides'}),status:'active',...start,lastSafe:{...start}};
  const events=[],path=[];
  for(let t=0;t<seconds;t+=1/30){
    const r=stepSourceContinuation(state,{dt:1/30,environment:true,...(typeof input==='function'?input(state,t):input)});
    state=r.state;events.push(...r.events);path.push({x:state.x,z:state.z,feet:state.feet,chartId:state.chartId,phase:state.phase});
  }
  return{state,events,path};
}
const refuge={x:0,z:-19,feet:8.4,phase:'wrong-return',chartId:0,level:0};
const causeway={x:-147,z:-92,feet:-12.6,phase:'catch',chartId:0,level:3};

test('standing still in Source II, the tide slides the body off and the construction loops it back onto itself',()=>{
  const {events,path}=run({x:3.85,z:-18,feet:8.4,phase:'wrong-return',chartId:0,level:0},30);
  const drops=events.filter(e=>e.type==='drop'&&e.trigger==='step-off'),wraps=events.filter(e=>e.type==='space-wrap'),lands=events.filter(e=>e.type==='land');
  assert.ok(drops.length>=2,'pulled off an edge more than once');
  assert.ok(wraps.length>=1&&lands.length>=1,'the fall loops and lands on the construction');
  assert.ok(path.every(p=>p.chartId===0&&p.phase==='wrong-return'),'the tide never carries the body through a fold or threshold');
  assert.ok(!events.some(e=>['return','complete','fold','phase'].includes(e.type)));
});

test('the pull gathers with stillness, stays shallow while walking, and points at the hole with a swirl',()=>{
  const well=SOURCE_TIDES.wells['wrong-return'],at={...refuge,elapsed:0};
  const fresh=sourceTideField(at,{still:0}),held=sourceTideField(at,{still:SOURCE_TIDES.graceSeconds+SOURCE_TIDES.gatherSeconds+1}),walking=sourceTideField(at,{still:60,moving:true});
  assert.ok(held.pull>fresh.pull*3,'stillness gathers the tide');
  assert.ok(walking.pull<held.pull/3&&walking.pull>0,'walking keeps it shallow but present');
  assert.ok(held.pull<3.2*.6,'a walker can always out-walk the hole');
  const toward=[well.x-at.x,well.z-at.z],len=Math.hypot(...toward),pull=[held.x-held.wind.x,held.z-held.wind.z];
  assert.ok((pull[0]*toward[0]+pull[1]*toward[1])/len>held.pull*.9,'toward the black hole');
  assert.ok(Math.abs(pull[0]*toward[1]-pull[1]*toward[0])/len>held.pull*.2,'with a frame-dragging swirl');
});

test('the gust is the night wind shared with the opening, and the field is deterministic',()=>{
  for(const t of [0,3.3,17,120.5]){
    const w=sourceTideWind(t),gust=Math.max(0,(windAt(t,{depth:SOURCE_TIDES.wind.depth})-1)/(.34*SOURCE_TIDES.wind.depth));
    assert.equal(w.gust,gust);assert.deepEqual(sourceTideWind(t),w);
  }
  const gusts=Array.from({length:400},(_,k)=>sourceTideWind(k*.5).gust);
  assert.ok(Math.max(...gusts)>.6&&Math.min(...gusts)===0,'gusts come and go');
});

test('a walker makes headway against the tide, even after it has gathered',()=>{
  // Stand on the open ground crossing while the tide gathers, then walk east,
  // directly away from the hole, for four seconds.
  const ground={x:-8,z:-3,feet:0,phase:'wrong-return',chartId:0,level:0,yaw:Math.PI/2};
  // Like a player, the walker keeps turning to face its goal down the crossing.
  const goal={x:16,z:-3},steer=s=>({forward:1,look:{yaw:Math.atan2(goal.x-s.x,-(goal.z-s.z)),pitch:0}});
  const {state}=run(ground,7.5,(s,t)=>t<3.5?{}:steer(s));
  // At the new walk (1.4, against the same tide), he must still make real headway.
  assert.ok(state.feet===0&&state.x-ground.x>4,`only ${(state.x-ground.x).toFixed(2)}m of headway`);
});

test('seated is anchored: no pull, no gust, and the tide resets',()=>{
  const {state,path}=run(refuge,20,{anchored:true});
  assert.ok(path.every(p=>Math.hypot(p.x-refuge.x,p.z-refuge.z)<1e-9));
  assert.deepEqual(state.tide,{still:0,vx:0,vz:0});
});

test('without the live environment the pure physics is unchanged',()=>{
  let state={...freshSourceContinuation({runId:'tides'}),status:'active',...refuge,lastSafe:{...refuge}};
  for(let n=0;n<600;n++)state=stepSourceContinuation(state,{dt:1/30}).state;
  assert.ok(Math.hypot(state.x-refuge.x,state.z-refuge.z)<1e-9);
});

test('in Source III the tide pulls across the causeways, off the islands, and recovery returns the body',()=>{
  const {events,path}=run(causeway,20);
  const first=path.findIndex(p=>p.feet<causeway.feet-.5);
  assert.ok(first>0,'pulled off the causeway');
  assert.ok(path[first].z>causeway.z,'toward the hole, south across the causeway');
  assert.ok(events.some(e=>e.type==='capture'&&e.reason==='void-fall')&&events.some(e=>e.type==='recovered'));
  assert.ok(!events.some(e=>e.type==='complete'),'never swept through the final door');
});

test('the tide survives a save round trip and never exceeds walking speed',()=>{
  const {state}=run(causeway,1.5);
  const again=normalizeSourceContinuation(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(again.tide,state.tide);
  const wild=normalizeSourceContinuation({...state,tide:{still:1e9,vx:99,vz:-99}});
  assert.ok(Math.abs(wild.tide.vx)<=3.2&&Math.abs(wild.tide.vz)<=3.2&&wild.tide.still<=60);
});
