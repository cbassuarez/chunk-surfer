import test from 'node:test';
import assert from 'node:assert/strict';
import {createStandingTearLatch,createStandingTearInputGate,standingTearReturnPatch,standingTearResume} from '../src/game/standing-tear-host.js';
import {freshStandingTear} from '../src/game/standing-tear.js';
import {withTransientGameState,getSave,saveCommit} from '../src/game/save.js';
test('exact return uses every captured coordinate and view component without safety nudges',()=>{
  const pose={x:136.148782,y:109.49991,floor:4.800000190734863,yaw:7.123019,pitch:-.734183,facing:1};
  const patch=standingTearReturnPatch(pose);assert.equal(patch.px,pose.x);assert.equal(patch.py,pose.y);
  assert.deepEqual(patch.view,{yaw:pose.yaw,pitch:pose.pitch});assert.equal(patch.standingTear,null);
  assert.throws(()=>standingTearReturnPatch({...pose,floor:NaN}));
});
test('return cannot bounce into the tear until withdrawal and released movement both occur',()=>{
  const latch=createStandingTearLatch({site:{x:68,z:45}});latch.disarm();
  assert.equal(latch.update({x:67.8,z:45}),false);
  assert.equal(latch.update({x:66,z:45},{movementHeld:true}),false);
  assert.equal(latch.update({x:66,z:45},{movementHeld:false}),true);
});
test('both gamepad sticks and held buttons must neutralize across a body handoff',()=>{
  const gate=createStandingTearInputGate();gate.arm();
  assert.equal(gate.update({axes:{moveY:1,turnX:0},buttons:new Set()}),false);
  assert.equal(gate.update({axes:{moveY:0,turnX:.5},buttons:new Set()}),false);
  assert.equal(gate.update({axes:{moveY:0,turnX:0},buttons:new Set(['a'])}),false);
  assert.equal(gate.update({axes:{moveY:0,turnX:0},buttons:new Set()}),true);
  assert.equal(gate.update({axes:{moveY:1},buttons:new Set(['a'])}),true,'fresh input is available after neutral');
});
test('checkpoint round trips through actual saves without replacing Source, recorder, Contact or inventory',async()=>{
  const returnPose={x:135.5,y:109.5,floor:4.8,yaw:1.57,pitch:-.2};
  await withTransientGameState({save:{run:{id:'tear-run',status:'active'},items:['paper'],flags:{'hush.contact':false}}},async()=>{
  // The existing migration fills dockMoved on its next normalization pass.
  // Establish that unrelated legacy migration before comparing this owner.
  saveCommit({});const base=structuredClone(getSave());
  const next=saveCommit({standingTear:freshStandingTear({runId:base.run.id,returnPose})});
  assert.deepEqual(next.chunkSurf,base.chunkSurf);assert.deepEqual(next.rec,base.rec);assert.deepEqual(next.items,base.items);assert.deepEqual(next.flags,base.flags);
  assert.deepEqual(standingTearResume(next.standingTear,base.run.id).returnPose,returnPose);
  assert.equal(standingTearResume(next.standingTear,'another-run'),null);
  });
});
