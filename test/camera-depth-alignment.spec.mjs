import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CELL } from '../src/data/floorplan/legend.js';
import { cameraBasis, DOWNWARD_LOOK_LIMIT, CAMERA_FORWARD_GLSL } from '../src/render/camera-basis.js';
import { PIXEL_MESH_FRAG } from '../src/render/pixel-mesh/shader.js';
import { homeRealmAcquisition } from '../src/render/realm-pocket-geometry.js';
import { r3dEyePoint, r3dProjectWorld, r3dSetLightingContext, r3dSetLookAngles } from '../src/render/r3d.js';

const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-8,`${message}: ${a} != ${b}`);

test('steep camera rays retain a common orthonormal angle basis',()=>{
  for(const yaw of[0,.7,Math.PI/2,Math.PI*1.8])for(const pitch of[.62,0,-.62,-1.2,DOWNWARD_LOOK_LIMIT]){
    const {forward,right,up}=cameraBasis(yaw,pitch);
    for(const axis of[forward,right,up])close(dot(axis,axis),1,'unit axis');
    close(dot(forward,right),0,'forward/right');
    close(dot(forward,up),0,'forward/up');
    close(dot(right,up),0,'right/up');
    close(forward[1],Math.sin(pitch),'pitch is a radian angle, not a slope');
  }
});

test('world projection centres the same steep ray as the raster prop camera',()=>{
  try{
    r3dSetLightingContext({roofSkyRecovery:.95});
    for(const yaw of[0,.7,Math.PI/2,Math.PI*1.8])for(const pitch of[-.62,-1.2,DOWNWARD_LOOK_LIMIT]){
      r3dSetLookAngles({yaw,pitch});
      const eye=r3dEyePoint(),{forward}=cameraBasis(yaw,pitch),distance=12;
      const point={x:eye.x*CELL+forward[0]*distance,
        y:eye.y*CELL+forward[1]*distance,z:eye.z*CELL+forward[2]*distance};
      const projected=r3dProjectWorld(point);
      close(projected.x,.5,'ray centre x');close(projected.y,.5,'ray centre y');
      close(projected.depth,distance/CELL,'view depth matches the raster camera');
      assert.equal(projected.visible,true);
    }
    const capped=r3dSetLookAngles({pitch:-2.3});
    close(capped.pitch,DOWNWARD_LOOK_LIMIT,'looking down stops short of flipping over');
    r3dSetLightingContext({roofSkyRecovery:0});
    close(r3dSetLookAngles({pitch:-2.3}).pitch,-.62,'indoor pitch range returns');
  }finally{r3dSetLightingContext({});r3dSetLookAngles({yaw:0,pitch:0});}
});

test('sector depth and dither reconstruction share the same angular forward function',()=>{
  const sector=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  assert.ok(sector.includes('${CAMERA_FORWARD_GLSL}'));
  assert.match(sector,/vec3 fwd = cameraForward\(uYaw,uPitch\)/);
  assert.ok(PIXEL_MESH_FRAG.includes(CAMERA_FORWARD_GLSL));
  assert.equal((PIXEL_MESH_FRAG.match(/vec3 fwd = cameraForward\(uYaw,uPitch\)/g)||[]).length,2,
    'both the screen ray and packed-depth reconstruction use the raster angle');
  assert.doesNotMatch(sector+PIXEL_MESH_FRAG,/normalize\(vec3\(sy,\s*uPitch,\s*-cy\)\)/,
    'the old slope ray cannot return in either depth pass');
});

test('the home realm supplies an angle to the same acquisition camera',()=>{
  const realm={variant:5,stage:'inside',home:{eligible:true},decoherence:0,
    pose:{x:0,z:0,floorY:0,yaw:.3,pitch:-.48}};
  const acquisition=homeRealmAcquisition({realm,reveal:1});
  close(acquisition.pitch,realm.pose.pitch,'realm pitch remains in radians');
  close(acquisition.yaw,Math.PI+realm.pose.yaw,'realm handedness is preserved');
});
