import test from 'node:test';
import assert from 'node:assert/strict';
import {captureStudentStrikeReturnPose,studentStrikeSavePatch,createStudentStrikeInputGate} from '../src/game/student-strike-host.js';
test('borrowed camera never replaces exact parked body/floor/view in the save patch',()=>{
 const source={x:122.315,y:541.82,floor:10,yaw:-1.31,pitch:.187,facing:3,renderGroup:'academic',camera:{eye:{x:67.812,y:11.62,z:35.71},tanHalfFov:.95,lens:{active:false}}};
 const pose=captureStudentStrikeReturnPose(source);source.camera.eye.x=90;assert.equal(pose.camera.eye.x,67.812);
 assert.deepEqual(studentStrikeSavePatch(pose),{px:122.315,py:541.82,view:{yaw:-1.31,pitch:.187},facing:3,area:'conservatory'});
 assert.throws(()=>captureStudentStrikeReturnPose({...source,floor:NaN}),/finite/);
});
test('a held cutscene key cannot begin movement after return, even after a different fresh key',()=>{
 const gate=createStudentStrikeInputGate(),w={code:'KeyW',repeat:false};gate.begin();gate.keyDown(w,{captured:true});gate.returnToPlayer();
 assert.equal(gate.keyDown({...w,repeat:true}),false);assert.equal(gate.keyDown({code:'KeyE',repeat:false}),true);assert.equal(gate.keyDown({...w,repeat:true}),false);
 gate.keyUp(w);assert.equal(gate.keyDown(w),true);assert.equal(gate.keyDown({...w,repeat:true}),true);
});
test('lost cutscene keydown repeats are also rejected until a fresh press',()=>{
 const gate=createStudentStrikeInputGate();gate.returnToPlayer();assert.equal(gate.keyDown({code:'KeyW',repeat:true}),false);
 assert.equal(gate.keyDown({code:'KeyW',repeat:false}),true);gate.keyUp({code:'KeyW'});assert.equal(gate.keyDown({code:'KeyW',repeat:true}),false);
});
