import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';

const renderer=()=>({initialize:async()=>true,render:()=>true,ready:()=>true,dispose(){}});
const checkpoint=()=>({...freshSourceContinuation({runId:'controls',returnPose:{x:1,y:2}}),status:'active'});

test('keyboard turning is available without moving the first-person body, and pause clears it',async()=>{
  const scene=createSourceContinuationScene({checkpoint:checkpoint(),renderer:renderer()});
  await scene.initialize();const before=scene.serialize();
  scene.key({key:'ArrowLeft'});scene.update(.2);scene.keyup({key:'ArrowLeft'});
  const turned=scene.serialize();assert.ok(turned.yaw<before.yaw);
  assert.equal(turned.x,before.x);assert.equal(turned.z,before.z);
  scene.key({key:'ArrowRight'});scene.pause();scene.resume();scene.update(.2);
  assert.equal(scene.serialize().yaw,turned.yaw);scene.exit();
});

test('the overhead arrow controls retain north orientation and traces identify the actual drop',async()=>{
  const traces=[],scene=createSourceContinuationScene({checkpoint:{...checkpoint(),phase:'catch',x:-19.55,z:0,feet:3,level:0},renderer:renderer(),onTrace:v=>traces.push(v)});
  await scene.initialize();scene.key({key:'ArrowUp'});scene.update(.05);scene.keyup({key:'ArrowUp'});
  assert.equal(scene.serialize().yaw,0);assert.ok(scene.serialize().z<0);
  scene.key({key:'e'});scene.update(.2);
  const drop=traces.find(v=>v.event?.type==='drop');assert.ok(drop?.choiceId);
  for(let i=0;i<20;i++)scene.update(.1);
  const pose=traces.find(v=>v.type==='pose'&&v.counterweight?.active);
  assert.ok(Number.isFinite(pose.threatDistanceMetres));scene.exit();
});

test('crossing into the overhead view releases held first-person controls',async()=>{
  const scene=createSourceContinuationScene({checkpoint:{...checkpoint(),x:-13.18,z:-1,feet:3,yaw:-Math.PI/2,doorOpen:{'wrong-onward':true}},renderer:renderer()});
  await scene.initialize();scene.key({key:'w'});scene.update(.1);
  const crossed=scene.serialize();assert.equal(crossed.phase,'catch');
  scene.update(.2);const stopped=scene.serialize();
  assert.equal(stopped.x,crossed.x);assert.equal(stopped.z,crossed.z);
  scene.key({key:'w',repeat:true});scene.update(.2);
  assert.equal(scene.serialize().z,crossed.z,'OS repeat cannot restore old intent after the axes change');
  for(let i=0;i<10;i++)scene.update(.2);
  scene.key({key:'a'});scene.update(.1);assert.ok(scene.serialize().x<crossed.x);
  scene.exit();
});

test('a transfer layout rotates visible controls with the physical support, without changing the north camera',async()=>{
  const seed={...checkpoint(),phase:'catch',x:-18.5,z:0,feet:3,level:0},scene=createSourceContinuationScene({checkpoint:seed,renderer:renderer(),studyRotation:Math.PI});
  await scene.initialize();scene.key({key:'d'});scene.update(.1);scene.keyup({key:'d'});
  assert.ok(scene.serialize().x<seed.x,'screen-right maps to the rotated physical west support');
  assert.equal(scene.serialize().yaw,seed.yaw);scene.exit();
});

test('the final latch has a finite audible handoff, freezes on pause and dispatches once',async()=>{
  let calls=0,stops=0;const scene=createSourceContinuationScene({checkpoint:{...checkpoint(),phase:'catch',x:-25.2,z:0,feet:-15,level:5},renderer:renderer(),audio:{stop(){stops++;}},onComplete(){calls++;return true;}});
  await scene.initialize();scene.key({key:'e'});scene.key({key:'d'});
  for(let i=0;i<20&&!scene.serialize().completed;i++)scene.update(.05);
  assert.equal(scene.serialize().completed,true);assert.equal(calls,0);assert.equal(stops,0);
  scene.pause();scene.update(1);assert.equal(calls,0);scene.resume();
  scene.update(.2);scene.update(.2);assert.equal(calls,1);scene.update(1);assert.equal(calls,1);scene.exit();
});

test('a rejected host handoff retains the frame and lets a fresh interaction retry',async()=>{
  for(const failure of [false,Error('host unavailable')]){
    let calls=0;const scene=createSourceContinuationScene({checkpoint:{...checkpoint(),phase:'catch',x:-25.2,z:0,feet:-15,level:5},renderer:renderer(),onComplete(){calls++;if(calls===1){if(failure===false)return false;throw failure;}return true;}});
    await scene.initialize();scene.key({key:'e'});scene.key({key:'d'});
    for(let i=0;i<20&&!scene.serialize().completed;i++)scene.update(.05);
    scene.update(.2);scene.update(.2);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,1);assert.equal(scene.view().ready,false);assert.ok(scene.view().error);
    const before=scene.serialize();scene.key({key:'d'});scene.update(1);
    assert.deepEqual(scene.serialize(),before,'a failed terminal handoff cannot resume simulation');
    scene.key({key:'e',repeat:true});assert.equal(calls,1);
    scene.key({key:'e'});assert.equal(calls,2,'fresh E retries the intended original destination');scene.exit();
  }
});
