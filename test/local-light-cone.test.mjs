import test from 'node:test';
import assert from 'node:assert/strict';
import {localLightConeDescriptor,localLightConeWeight} from '../src/render/local-light-cone.js';
import {coastalMemoryRenderFrame} from '../src/render/coastal-memory-renderer.js';
import {COASTAL_MEMORY_LAYOUT as L} from '../src/data/coastal-memory.js';
import {r3dSetLocalLights,r3dLightingDebug} from '../src/render/r3d.js';

test('ordinary lamps retain their omnidirectional response; malformed cones cannot darken them',()=>{
 for(const light of[{}, {direction:[0,0,0],coneOuterCos:.72,coneInnerCos:.94}, {direction:[0,0,-1],coneOuterCos:.94,coneInnerCos:.72}, {direction:[NaN,0,-1],coneOuterCos:.72,coneInnerCos:.94}]){
  assert.equal(localLightConeWeight(light,[0,0,-20]),1);
  assert.equal(localLightConeWeight(light,[0,0,20]),1);
 }
});
test('physical cone excludes behind/sideways spill and normalizes emitter and ray lengths',()=>{
 const light={direction:[0,0,-5],coneOuterCos:.72,coneInnerCos:.94};
 assert.deepEqual(localLightConeDescriptor(light).direction,[0,0,-1]);
 assert.equal(localLightConeWeight(light,[0,0,-20]),1);
 assert.equal(localLightConeWeight(light,[0,0,20]),0);
 assert.equal(localLightConeWeight(light,[20,0,0]),0);
 const ray=[Math.sqrt(1-.83*.83),0,-.83];
 assert.ok(Math.abs(localLightConeWeight(light,ray)-.5)<1e-12);
 assert.ok(Math.abs(localLightConeWeight(light,ray.map(v=>v*28))-.5)<1e-12);
});
test('submerged mesh illumination follows the actual pitched van lamps used by the water volume',()=>{
 const frame=coastalMemoryRenderFrame({pose:L.spawn,elapsed:8,wreckLightLevel:1});
 for(const [i,lamp] of frame.scene.water.realHeadlamps.entries()){
  const water=frame.coastalMemory.lights[i],direction=water.direction;
  assert.deepEqual(lamp.direction,direction);
  assert.equal(localLightConeWeight(lamp,direction),1);
  assert.equal(localLightConeWeight(lamp,direction.map(v=>-v)),0,'the sea-facing headlamp must not whiten the cliff behind the wreck');
 }
});
test('the actual light owner normalizes cone axes and clears them when returning to ordinary Source lamps',()=>{
 try{
  r3dSetLocalLights([{id:'test-real-cone',x:1,y:2,z:3,direction:[2,-1,-4],coneOuterCos:.72,coneInnerCos:.94}]);
  const lamp=r3dLightingDebug().lights[0],length=Math.sqrt(21);
  lamp.direction.forEach((v,i)=>assert.ok(Math.abs(v-[2,-1,-4][i]/length)<1e-7));
  assert.ok(Math.abs(lamp.coneOuterCos-.72)<1e-7);
  r3dSetLocalLights([{id:'ordinary-source',x:4,y:5,z:6}]);
  assert.deepEqual(r3dLightingDebug().lights[0].direction,[0,0,0]);
 }finally{r3dSetLocalLights([]);}
});
