import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOF_WATCHERS} from '../src/data/roof-watchers.js';
import {stepRoofWatcherPerformance,roofWatcherWorldPivot,roofWatcherTargetOffset,
  ROOF_WATCHER_PERFORMANCE_CONTRACT as contract,
} from '../src/render/roof-watcher-performance.js';

const DEG=Math.PI/180,anchor={x:85.25,y:17,z:15.5,yaw:0,scale:1,zone:21};
const northEye=[84,18.62,6];
const step=(prior,timeSec,eye=northEye,extra={})=>stepRoofWatcherPerformance(prior?.state||null,{anchor,eye,timeSec,...extra});
function simulate(seconds,{frequency=60,eyeAt=()=>northEye,extra={}}={}){
  let frame=step(null,0,eyeAt(0),extra);
  for(let i=1;i<=Math.round(seconds*frequency);i++)frame=step(frame,i/frequency,eyeAt(i/frequency),extra);
  return frame;
}
const near=(a,b,epsilon=1e-10)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} and ${b} differ`);

test('local carving pivots compose the actual physical roof prop, including its yaw and scale',()=>{
  const foliate=ROOF_WATCHERS[0];
  assert.deepEqual(roofWatcherWorldPivot(foliate,anchor),[74.15,20.990000000000002,9.5]);
  const transformed={x:100,y:17,z:50,yaw:Math.PI/2,scale:2,scaleX:1,scaleY:.75,scaleZ:1.5,zone:21};
  const pivot=roofWatcherWorldPivot(foliate,transformed);
  [118,22.985,27.8].forEach((expected,i)=>near(pivot[i],expected));
  const frame=stepRoofWatcherPerformance(null,{anchor:transformed,eye:[118,18.62,47.8],timeSec:0});
  const instance=frame.instances[0];
  pivot.forEach((expected,i)=>near(instance.matrix[12+i],expected));
  near(instance.matrix[8],0);near(instance.matrix[10],2);
  assert.equal(instance.zone,21);assert.equal(instance.structural,true);assert.equal(instance.noShadow,false);
  assert.equal(instance.mesh,foliate.mesh);
});

test('tracking uses the prop +Z facing convention and shortest local yaw, not camera yaw',()=>{
  const west={id:'west',mesh:'test',localPivot:[0,0,0],restYaw:-Math.PI/2,maxYaw:.4,seed:1};
  const east={...west,id:'east',restYaw:Math.PI/2};
  const origin={x:0,y:0,z:0,yaw:0,scale:1};
  near(roofWatcherTargetOffset(west,origin,[10,0,0]),0);
  assert.ok(roofWatcherTargetOffset(west,origin,[10,0,-3])<0);
  assert.ok(roofWatcherTargetOffset(east,origin,[-10,0,-3])>0);
  const wrapped={...west,restYaw:Math.PI-.04};
  const targetYaw=-Math.PI+.04;
  near(roofWatcherTargetOffset(wrapped,origin,[-Math.sin(targetYaw)*10,0,Math.cos(targetYaw)*10]),.08);
  const fixed={...west,maxYaw:0};near(roofWatcherTargetOffset(fixed,origin,[10,0,-3]),0);
});

test('each carving recognizes late, turns within anatomical limits, and holds an independent stare',()=>{
  let frame=step(null,0);
  const firstTurn={},firstStare={};
  for(let tick=1;tick<=600;tick++){
    const before=frame;
    frame=step(frame,tick/60);
    frame.presentation.watchers.forEach((w,index)=>{
      assert.ok(Math.abs(w.yawOffset)<=ROOF_WATCHERS[index].maxYaw+1e-12);
      assert.ok(Math.abs(w.yawOffset-before.presentation.watchers[index].yawOffset)<=8*DEG/60+1e-12,'stone never snaps between gaze targets');
      if(Math.abs(w.yawOffset)>.01*DEG&&firstTurn[w.id]===undefined)firstTurn[w.id]=tick/60;
      if(w.stage==='staring'&&firstStare[w.id]===undefined)firstStare[w.id]=tick/60;
      if(tick<15)near(w.yawOffset,0);
    });
  }
  assert.ok(firstTurn['roof-watcher-hound']<firstTurn['roof-watcher-owl'],'the two beasts are not synchronized');
  assert.ok(new Set(Object.values(firstStare)).size===3,'all three holds begin at different times');
  frame.presentation.watchers.forEach((w,index)=>assert.ok(Math.abs(w.yawOffset)>.95*ROOF_WATCHERS[index].maxYaw));
  frame.instances.forEach((instance,index)=>{
    const pivot=roofWatcherWorldPivot(ROOF_WATCHERS[index],anchor);
    assert.deepEqual([instance.x,instance.y,instance.z],pivot,'only the head swivels; the neck root never wanders');
  });
});

test('heads follow lateral physical travel and reverse their gaze without requiring the player to look away',()=>{
  let frame=simulate(8),time=8;
  const start=frame.presentation.watchers.map(w=>w.yawOffset);
  for(let tick=1;tick<=720;tick++)frame=step(frame,time+tick/60,[84,18.62,6+tick/60*1.5]);
  time+=12;
  for(let tick=1;tick<=360;tick++)frame=step(frame,time+tick/60,[84,18.62,24]);
  frame.presentation.watchers.forEach((w,index)=>{
    assert.ok(start[index]*w.yawOffset<0,`${w.id} follows the player across its sightline`);
    assert.ok(Math.abs(w.yawOffset)>8*DEG,'the final tracking turn is visible, not microscopic noise');
  });
});

test('fixed-time integration is independent of render frequency for the same interpolated player path',()=>{
  const eyeAt=t=>[84+.35*t,18.62,6+1.8*t];
  const slow=simulate(9,{frequency:20,eyeAt}),fast=simulate(9,{frequency:144,eyeAt});
  near(slow.state.clockSec,fast.state.clockSec,1e-11);
  slow.presentation.watchers.forEach((w,index)=>{
    near(w.yawOffset,fast.presentation.watchers[index].yawOffset,1e-10);
    assert.equal(w.stage,fast.presentation.watchers[index].stage);
  });
});

test('same-frame shadow and reflected eyes reuse immutable main-eye poses',()=>{
  const frame=simulate(3),before=JSON.stringify(frame.state);
  const repeated=stepRoofWatcherPerformance(frame.state,{anchor,eye:[-500,-100,500],timeSec:3});
  assert.equal(repeated.state,frame.state);assert.equal(repeated.instances,frame.instances);
  assert.equal(repeated.presentation,frame.presentation);
  assert.deepEqual(repeated.presentation.eye,northEye);
  assert.throws(()=>{frame.state.stones[ROOF_WATCHERS[0].id].yawOffset=123;},TypeError);
  step(frame,3.1,[84,18.62,20]);
  assert.equal(JSON.stringify(frame.state),before,'stepping cannot mutate a previous frame');
});

test('reduced motion freezes the current stone angle and resumes without accumulated movement',()=>{
  let frame=simulate(4),held=frame.instances.map(i=>i.yaw),clock=frame.state.clockSec;
  for(let tick=1;tick<=180;tick++)frame=step(frame,4+tick/60,[84,18.62,24],{reducedMotion:true});
  assert.deepEqual(frame.instances.map(i=>i.yaw),held);
  near(frame.state.clockSec,clock);
  assert.equal(frame.presentation.reason,'reduced-motion');
  const resumed=step(frame,7+1/60,[84,18.62,24]);
  near(resumed.state.clockSec,clock+1/60);
  resumed.instances.forEach((instance,i)=>assert.ok(Math.abs(instance.yaw-held[i])<8*DEG/60+1e-10));
});

test('inactive geometry submits no duplicate heads and resets before a split asset becomes active',()=>{
  const frame=simulate(3);
  const off=stepRoofWatcherPerformance(frame.state,{active:false,timeSec:3.1});
  assert.equal(off.state,null);assert.deepEqual(off.instances,[]);assert.equal(off.presentation.reason,'inactive-geometry');
  const fresh=step(off,3.2);
  fresh.presentation.watchers.forEach(w=>near(w.yawOffset,0));
  assert.equal(fresh.presentation.reason,'initial');
  const missing=stepRoofWatcherPerformance(frame.state,{anchor:null,eye:northEye,timeSec:4});
  assert.deepEqual(missing.instances,[]);assert.equal(missing.presentation.reason,'missing-physical-input');
});

test('hidden-tab gaps and reversed clocks rebase without a leap or stale catch-up',()=>{
  const frame=simulate(3),before=frame.instances.map(i=>i.yaw);
  const gap=step(frame,100,[84,18.62,24]);
  assert.equal(gap.presentation.reason,'gap-rebased');assert.deepEqual(gap.instances.map(i=>i.yaw),before);
  near(gap.state.clockSec,frame.state.clockSec);
  const reversed=step(gap,90,[84,18.62,24]);
  assert.equal(reversed.presentation.reason,'clock-rebased');assert.deepEqual(reversed.instances.map(i=>i.yaw),before);
  const resumed=step(reversed,90+1/60,[84,18.62,24]);
  near(resumed.state.clockSec,frame.state.clockSec+1/60);
  assert.equal(contract.maximumFrameGapSeconds,.35);
});
