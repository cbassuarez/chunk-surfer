import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import {makeCostumeInspectionScene,costumeInspectionCamera} from '../src/game/costume-inspection-scene.js';

test.afterEach(()=>scenes.clear());

test('the physical inspection finds the pin before raising the eye to the head, with reduced motion retaining the reveal',()=>{
  const options={floor:-4.35,actorPoint:{x:3.12,z:18.20}};
  const pin=costumeInspectionCamera({phase:'inspect',elapsed:.8},options);
  assert.deepEqual(pin.target,{x:3.955,y:-4.35+.491,z:18.235});
  const head=costumeInspectionCamera({phase:'notice',elapsed:.65},options);
  assert.deepEqual(head.target,{x:3.12,y:-4.35+1.72,z:18.20});
  assert.ok(head.eye.y>pin.eye.y&&head.pitch>pin.pitch);
  const full=costumeInspectionCamera({phase:'startle',elapsed:.14},options);
  const reduced=costumeInspectionCamera({phase:'startle',elapsed:.14},{...options,reducedMotion:true});
  assert.ok(full.eye.z>reduced.eye.z,'the brief physical recoil can be reduced');
  assert.deepEqual(full.target,reduced.target,'reduced motion keeps the head in the shot');
  const after=costumeInspectionCamera({phase:'done'},options);
  assert.equal(after.target.y,-4.35+.12,'the aftermath looks at the empty cloth on the floor');
  for(const shot of[pin,head,full,reduced,after])assert.ok([...Object.values(shot.eye),shot.yaw,shot.pitch].every(Number.isFinite));
});

test('a stopped or replaced performance cannot strand the inspection camera',()=>{
  let exits=0,cancels=0,actor={phase:'inspect',elapsed:0};
  const scene=makeCostumeInspectionScene({getActor:()=>actor,onCancel:()=>cancels++,onExit:()=>exits++});
  scenes.push(scene);
  for(let i=0;i<95;i++)scenes.update(.1);
  assert.equal(scenes.has('costume-inspection'),false,'the finite active-time lease expires even if its world clock stops');
  assert.equal(cancels,1);assert.equal(exits,1);assert.equal(scene.view().closed,true);
  actor={phase:'inspect',elapsed:0};
  const replaced=makeCostumeInspectionScene({getActor:()=>actor,onCancel:()=>cancels++,onExit:()=>exits++});
  scenes.push(replaced);actor={phase:'work',elapsed:0};scenes.update(.016);
  assert.equal(scenes.blocksInput(),false,'a replaced actor state releases its old camera');
  assert.equal(cancels,2);assert.equal(exits,2);
});
