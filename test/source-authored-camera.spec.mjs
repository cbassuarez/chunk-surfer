import test from 'node:test';
import assert from 'node:assert/strict';
import {authoredCameraFrame} from '../src/render/authored-camera.js';
import {cameraBasis} from '../src/render/camera-basis.js';
import {propViewMatrix} from '../src/render/props3d.js';
import {sourceContinuationCamera} from '../src/render/source-continuation-renderer.js';
import {SOURCE_CONTINUATION as C,continuationStage,continuationRadialPoint,continuationSupportAt} from '../src/data/source-continuation.js';

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
test('both continuation phases retain the authoritative first-person head over actual support without moving the body',()=>{
  const stage=continuationStage(2),point=continuationRadialPoint((stage.innerRadius+stage.outerRadius)/2,(stage.startAngle+stage.endAngle)/2);
  for(const phase of['catch','wrong-return']){
    const source={phase,level:2,player:{...point,y:stage.y,yaw:1.3,pitch:.7},heading:-.4},before=structuredClone(source),camera=sourceContinuationCamera(source);
    assert.ok(continuationSupportAt(point.x,point.z,{feet:stage.y,chartId:0}),'the fixture stands on a real receiving shelf');
    assert.deepEqual(source,before);assert.deepEqual(camera.eye,[point.x,stage.y+C.eyeHeight,point.z]);assert.equal(camera.yaw,source.player.yaw);assert.equal(camera.pitch,source.player.pitch);assert.equal(camera.strictOverhead,false);
    assert.notEqual(camera.yaw,source.heading,'the character heading cannot replace the player’s look');assert.ok(authoredCameraFrame(camera));
    camera.eye[0]+=10;assert.deepEqual(source,before,'editing a submitted camera cannot move the physical body');
  }
});

test('the production prop view retains visible width and height at both camera poles',()=>{
  const eye=[-23,17,0];
  const project=(m,p)=>[0,1,2].map(row=>m[row]*p[0]+m[row+4]*p[1]+m[row+8]*p[2]+m[row+12]);
  for(const pitch of [-Math.PI/2,Math.PI/2]){
    const m=propViewMatrix(eye,0,pitch),basis=cameraBasis(0,pitch);
    const ahead=eye.map((v,k)=>v+basis.forward[k]*14);
    const centre=project(m,ahead),right=project(m,ahead.map((v,k)=>v+basis.right[k]*4)),up=project(m,ahead.map((v,k)=>v+basis.up[k]*4));
    assert.ok(Math.abs(centre[2]+14)<1e-5);
    assert.ok(Math.abs(right[0]-centre[0]-4)<1e-5,'horizontal geometry must not collapse');
    assert.ok(Math.abs(up[1]-centre[1]-4)<1e-5,'vertical geometry must not collapse');
    for(const axis of [0,1,2])assert.ok(Math.abs(Math.hypot(m[axis],m[axis+4],m[axis+8])-1)<1e-5);
  }
});
