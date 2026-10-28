import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_CONTINUATION as C, CONTINUATION_DROP_LIPS} from '../src/data/source-continuation.js';

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

test('Source III retains ordinary first-person look and camera-relative arrow movement',async()=>{
  const traces=[],scene=createSourceContinuationScene({checkpoint:{...checkpoint(),phase:'catch',...CONTINUATION_DROP_LIPS[0],feet:C.catch.top,level:0},renderer:renderer(),onTrace:v=>traces.push(v)});
  await scene.initialize();assert.equal(scene.lookBy(.2,-.1),true);const before=scene.serialize();
  scene.key({key:'ArrowUp'});scene.update(.05);scene.keyup({key:'ArrowUp'});
  assert.ok(scene.serialize().x>before.x);assert.ok(scene.serialize().z<before.z);assert.ok(Math.abs(scene.lookAngles().yaw-before.yaw)<1e-8);
  scene.setLook({yaw:0,pitch:0});scene.key({key:'e'});scene.update(.2);
  const drop=traces.find(v=>v.event?.type==='drop');assert.ok(drop?.choiceId);
  for(let i=0;i<20;i++)scene.update(.1);
  const pose=traces.find(v=>v.type==='pose'&&v.counterweight?.active);assert.ok(Number.isFinite(pose.threatDistanceMetres));scene.exit();
});

test('crossing into Source III preserves held first-person motion and accepts immediate look',async()=>{
  const scene=createSourceContinuationScene({checkpoint:{...checkpoint(),x:-18.19,z:-12,feet:C.catch.top,yaw:-Math.PI/2,doorOpen:{'wrong-onward':true}},renderer:renderer()});
  await scene.initialize();scene.key({key:'w'});scene.update(.1);const crossed=scene.serialize();assert.equal(crossed.phase,'catch');
  assert.equal(crossed.reveal,null);scene.update(.2);assert.ok(scene.serialize().x<crossed.x,'the same held forward still walks forward');
  assert.equal(scene.lookBy(.3,.2),true);assert.notEqual(scene.serialize().yaw,crossed.yaw);scene.keyup({key:'w'});scene.exit();
});

test('a rotated transfer retains local first-person controls for the correspondingly rotated view',async()=>{
  const seed={...checkpoint(),phase:'catch',x:-28,z:-12,feet:C.catch.top,level:0},scene=createSourceContinuationScene({checkpoint:seed,renderer:renderer(),studyRotation:Math.PI});
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
    const before=scene.serialize();scene.key({key:'d'});scene.update(1);
    assert.deepEqual(scene.serialize(),before,'a failed terminal handoff cannot resume simulation');
    scene.key({key:'e',repeat:true});assert.equal(calls,1);
    scene.key({key:'e'});assert.equal(calls,2,'fresh E retries the intended original destination');scene.exit();
  }
});
