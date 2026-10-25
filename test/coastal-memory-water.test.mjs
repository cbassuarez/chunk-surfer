import test from 'node:test';
import assert from 'node:assert/strict';
import {coastalWaterUniforms,coastalRayWater,coastalCameraResponse,COASTAL_MEMORY_WATER_GLSL} from '../src/render/coastal-memory-water.js';
const frame={active:true,siteMatrix:[0,0,-1,0,0,1,0,0,1,0,0,0,32,-20,48,1],waterY:0,time:12,lights:[{position:[35,-23,46],direction:[0,-.1,-1],intensity:.7}]};
test('coast is opt-in and rejects a scaled or tilted sea frame',()=>{
 assert.equal(coastalWaterUniforms(null).active,false);
 const scaled=[...frame.siteMatrix];scaled[8]=2;assert.equal(coastalWaterUniforms({...frame,siteMatrix:scaled}).active,false);
 const tilted=[...frame.siteMatrix];tilted[5]=.7;assert.equal(coastalWaterUniforms({...frame,siteMatrix:tilted}).active,false);
});
test('actual underwater lamps are transformed into the same metre-scaled site',()=>{
 const uniforms=coastalWaterUniforms(frame);assert.equal(uniforms.active,true);
 assert.deepEqual(Array.from(uniforms.positions.slice(0,3)),[2,-3,3]);
 assert.ok(Math.abs(uniforms.directions[0]-1/Math.hypot(1,.1))<1e-6);
 assert.deepEqual(uniforms.params,[1,0,12,0]);
 assert.deepEqual(uniforms.optics,[1,1],'ordinary coast retains its calibration');
});
test('cinematic water calibration is explicitly opted in and bounded',()=>{
 assert.deepEqual(coastalWaterUniforms({...frame,waterOptics:{absorptionScale:.35,scatterScale:.12}}).optics,[.35,.12]);
 assert.deepEqual(coastalWaterUniforms({...frame,waterOptics:{absorptionScale:-2,scatterScale:8}}).optics,[.05,1]);
 assert.deepEqual(coastalWaterUniforms(frame).optics,[1,1],'one owner cannot leak its water settings to another');
});
test('near opaque rock and cabin surfaces occlude the water; submerged geometry keeps only underwater depth',()=>{
 const base={frame,eye:[32,8,48],ray:[0,-1,0]};
 assert.equal(coastalRayWater({...base,surfaceDistance:20}),null);
 const water=coastalRayWater({...base,surfaceDistance:31});assert.equal(water.begin,28);assert.equal(water.length,3);
 const under=coastalRayWater({frame,eye:[32,-23,48],ray:[0,1,0],surfaceDistance:12});assert.equal(under.below,true);assert.equal(under.length,3);
});
test('waves, light escape and cabin flooding live in physical depth before final acquisition',()=>{
 assert.match(COASTAL_MEMORY_WATER_GLSL,/waterEnd-waterBegin/);
 assert.match(COASTAL_MEMORY_WATER_GLSL,/coastSurfaceEscape\(p\.xz/);
 assert.match(COASTAL_MEMORY_WATER_GLSL,/uCoastSea\.z\*\(1\.0-uReduceMotionOptical\)/);
 assert.match(COASTAL_MEMORY_WATER_GLSL,/return displayColour\(transmitted\+scatter\*uCoastOptics\.y\)/);
});
test('one physical camera shoulder preserves black, material hue and highlight ordering across the measured coast range',()=>{
 assert.deepEqual(coastalCameraResponse([0,0,0]),[0,0,0]);
 const dark=coastalCameraResponse([.01,.01,.01]),wood=coastalCameraResponse([11/255,5/255,2/255]),stone=coastalCameraResponse([54/255,54/255,45/255]);
 assert.ok(dark[0]>.04&&dark[0]<.06,'measured cloud light must reach the screen');
 assert.ok(wood[0]>.14&&wood[1]>.06,'measured dark timber must retain actual reflected light');
 assert.ok(stone[0]<.27&&stone[0]>wood[0],'the pale plinth retains headroom rather than clipping under linear gain');
 assert.ok(Math.abs(wood[0]/wood[1]-11/5)<1e-12,'meter luminance, not separate RGB curves');
 let previous=0;for(const value of[.001,.01,.1,1,10,100]){const y=coastalCameraResponse([value,value,value])[0];assert.ok(y>previous&&y<.3);previous=y;}
});
