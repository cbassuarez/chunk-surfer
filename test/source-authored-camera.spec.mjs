import test from 'node:test';
import assert from 'node:assert/strict';
import {authoredCameraFrame} from '../src/render/authored-camera.js';
import {cameraBasis} from '../src/render/camera-basis.js';

test('overhead uses an exact finite camera basis with a fixed north',()=>{
  const input={eye:[64,19,64],yaw:0,pitch:-Math.PI/2};
  const frame=authoredCameraFrame(input),basis=cameraBasis(frame.yaw,frame.pitch);
  assert.ok(Math.abs(basis.forward[1]+1)<1e-12);
  assert.deepEqual(basis.right,[1,0,0]);
  assert.ok(Math.abs(basis.up[2]+1)<1e-12);
  frame.eye[0]=0;assert.equal(input.eye[0],64);
});
test('bad authored frames cannot poison ordinary rendering',()=>{
  for(const value of [null,{}, {eye:[0,NaN,0],yaw:0,pitch:0},
    {eye:[0,1,0],yaw:0,pitch:2}, {eye:[0,1,0],yaw:Infinity,pitch:0}])
    assert.equal(authoredCameraFrame(value),null);
});
