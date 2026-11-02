import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_CONTINUATION as C, CONTINUATION_DROP_LIPS} from '../src/data/source-continuation.js';
import {SOURCE_JOURNEY,JOURNEY_PORTALS} from '../src/data/source-continuation-journey.js';

const renderer=()=>({initialize:async()=>true,render:()=>true,ready:()=>true,dispose(){}});
const checkpoint=()=>({...freshSourceContinuation({runId:'controls',returnPose:{x:1,y:2}}),status:'active'});

test('ordinary look deltas belong to the scene and pause clears movement without changing the view',async()=>{
  const scene=createSourceContinuationScene({checkpoint:checkpoint(),renderer:renderer()});
  assert.equal(scene.allowsLook,false);await scene.initialize();const before=scene.serialize();
  assert.equal(scene.allowsLook,true);assert.equal(scene.lookBy(.4,-.2),true);
  const turned=scene.serialize();assert.ok(turned.yaw>before.yaw);assert.equal(turned.pitch,-.2);
  assert.equal(turned.x,before.x);assert.equal(turned.z,before.z);
  scene.key({key:'ArrowRight'});scene.pause();assert.equal(scene.allowsLook,false);assert.equal(scene.lookBy(.4,.2),false);
  scene.resume();scene.update(.2);assert.equal(scene.serialize().x,turned.x);assert.equal(scene.serialize().z,turned.z);scene.exit();
});

test('Space jumps with carried movement, ignores repeats and preserves fresh movement after landing',async()=>{
  const traces=[],scene=createSourceContinuationScene({checkpoint:checkpoint(),renderer:renderer(),onTrace:t=>traces.push(t)});
  await scene.initialize();scene.key({key:'w'});scene.key({key:' ',code:'Space'});
  assert.ok(scene.serialize().fall,'Space works on the ordinary unmarked entry floor');
  const launch=scene.serialize();scene.key({key:' ',code:'Space',repeat:true});assert.deepEqual(scene.serialize(),launch);
  scene.update(.1);scene.pause();const paused=scene.serialize();scene.update(.2);assert.deepEqual(scene.serialize(),paused);scene.resume();
  for(let i=0;i<120&&scene.serialize().fall;i++)scene.update(.025);
  assert.equal(scene.serialize().fall,null);assert.equal(scene.serialize().recovery,null);
  scene.key({key:'w'});const landed=scene.serialize();scene.update(.05);assert.ok(scene.serialize().z<landed.z);
  assert.ok(traces.some(t=>t.event?.type==='drop'&&t.event.trigger==='jump'));scene.exit();
});

test('Source III retains real mouse-look and walking follows the physical view',async()=>{
  const seed={...checkpoint(),phase:'catch',x:C.catch.center.x+10,z:C.catch.center.z,feet:C.catch.top,level:0,yaw:0};
  const scene=createSourceContinuationScene({checkpoint:seed,renderer:renderer()});await scene.initialize();
  assert.equal(scene.allowsLook,true);assert.equal(scene.lookBy(Math.PI/2,-.1),true);
  const before=scene.serialize();scene.key({key:'w'});scene.update(.1);scene.keyup({key:'w'});
  assert.ok(scene.serialize().x>before.x+.2);assert.ok(Math.abs(scene.serialize().z-before.z)<1e-6);
  assert.equal(scene.lookAngles().yaw,Math.PI/2);assert.equal(scene.lookAngles().pitch,-.1);
  scene.pause();assert.equal(scene.allowsLook,false);assert.equal(scene.lookBy(.2,.1),false);
  scene.resume();assert.equal(scene.allowsLook,true);assert.equal(scene.lookBy(-.2,.1),true);
  const resumed=scene.serialize();scene.update(.1);assert.equal(scene.serialize().x,resumed.x,'pause releases the held walk');scene.exit();
});

test('crossing into Source III clears held movement and retains the same first-person control authority',async()=>{
  const scene=createSourceContinuationScene({checkpoint:{...checkpoint(),chartId:4,x:SOURCE_JOURNEY.gate.x+.19,z:SOURCE_JOURNEY.gate.z,feet:C.catch.top,yaw:-Math.PI/2,doorOpen:{'journey-catch-gate':true}},renderer:renderer()});
  await scene.initialize();scene.key({key:'w'});scene.update(.2);const crossed=scene.serialize();assert.equal(crossed.phase,'catch');
  assert.equal(crossed.reveal,null);scene.update(.2);assert.equal(scene.serialize().x,crossed.x);assert.equal(scene.serialize().z,crossed.z);
  assert.equal(scene.lookBy(.3,.2),true);assert.ok(scene.serialize().yaw>crossed.yaw);scene.keyup({key:'w'});
  const turned=scene.serialize();scene.key({key:'w'});scene.update(.1);
  assert.ok((scene.serialize().x-turned.x)*Math.sin(turned.yaw)>0);scene.exit();
});

test('crossing either impossible axis retains held walking through its real receiving fall',async()=>{
  for(const edge of JOURNEY_PORTALS.slice(0,2)){
    const traces=[],seed={...checkpoint(),...edge.a.approach};seed.hush.active=false;
    const scene=createSourceContinuationScene({checkpoint:seed,renderer:renderer(),onTrace:v=>traces.push(v)});await scene.initialize();
    scene.key({key:'w'});
    for(let k=0;k<180&&!scene.serialize().lastFold;k++)scene.update(1/60);
    const crossed=scene.serialize();assert.equal(crossed.lastFold?.id,edge.id);assert.equal(crossed.chartId,edge.toChart);
    assert.ok(traces.some(t=>t.type==='fold-control-continuity'&&t.held.includes('w')));
    for(let k=0;k<120&&(scene.serialize().fall||scene.serialize().cameraTransit);k++)scene.update(1/60);
    const landed=scene.serialize();assert.equal(landed.fall,null);assert.equal(landed.cameraTransit,null);assert.equal(landed.recovery,null);
    scene.update(.1);const next=scene.serialize();assert.ok(Math.hypot(next.x-landed.x,next.z-landed.z)>.2,'held movement must continue after gravity alignment');
    assert.equal(traces.some(t=>t.type==='control-boundary'&&t.reason==='land'),false,'a portal landing retains the same control authority');scene.exit();
  }
});

test('a rotated study keeps first-person input in the same body basis as its rotated view',async()=>{
  const seed={...checkpoint(),phase:'catch',x:C.catch.center.x+10,z:C.catch.center.z,feet:C.catch.top,level:0},scene=createSourceContinuationScene({checkpoint:seed,renderer:renderer(),studyRotation:Math.PI});
  await scene.initialize();scene.key({key:'d'});scene.update(.1);scene.keyup({key:'d'});
  assert.ok(scene.serialize().x>seed.x,'local right maps through the same rotation as the physical camera');assert.equal(scene.serialize().yaw,seed.yaw);scene.exit();
});

test('the final latch has a finite audible handoff, freezes on pause and dispatches once',async()=>{
  let calls=0,stops=0;const scene=createSourceContinuationScene({checkpoint:{...checkpoint(),phase:'catch',...C.catch.finalApproach,level:C.catch.levels-1},renderer:renderer(),audio:{stop(){stops++;}},onComplete(){calls++;return true;}});
  await scene.initialize();scene.key({key:'e'});scene.key({key:'w'});
  for(let i=0;i<20&&!scene.serialize().completed;i++)scene.update(.05);
  assert.equal(scene.serialize().completed,true);assert.equal(calls,0);assert.equal(stops,0);
  scene.pause();scene.update(1);assert.equal(calls,0);scene.resume();
  scene.update(.2);scene.update(.2);assert.equal(calls,1);scene.update(1);assert.equal(calls,1);scene.exit();
});

test('a rejected host handoff retains the frame and lets a fresh interaction retry',async()=>{
  for(const failure of [false,Error('host unavailable')]){
    let calls=0;const scene=createSourceContinuationScene({checkpoint:{...checkpoint(),phase:'catch',...C.catch.finalApproach,level:C.catch.levels-1},renderer:renderer(),onComplete(){calls++;if(calls===1){if(failure===false)return false;throw failure;}return true;}});
    await scene.initialize();scene.key({key:'e'});scene.key({key:'w'});
    for(let i=0;i<20&&!scene.serialize().completed;i++)scene.update(.05);
    scene.update(.2);scene.update(.2);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,1);assert.equal(scene.view().ready,false);assert.ok(scene.view().error);
    const before=scene.serialize();scene.key({key:'w'});scene.update(1);
    assert.deepEqual(scene.serialize(),before,'a failed terminal handoff cannot resume simulation');
    scene.key({key:'e',repeat:true});assert.equal(calls,1);
    scene.key({key:'e'});assert.equal(calls,2,'fresh E retries the intended original destination');scene.exit();
  }
});
