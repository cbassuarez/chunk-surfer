import test from 'node:test';
import assert from 'node:assert/strict';
import {PIXEL_MESH_FRAG,sourceWaterRecordedInk} from '../src/render/pixel-mesh/shader.js';

const luminance=rgb=>rgb.reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);
const near=(a,b,epsilon=1e-12)=>a.forEach((value,i)=>assert.ok(Math.abs(value-b[i])<epsilon,`${a} != ${b}`));
const ink=[.35,.43,.465],submerged={enabled:true,eye:[0,0,0],world:[-8,0,0],waterY:2,absorptionScale:.35};

test('ordinary scenes, dry rays, zero path and exact black retain their original recorded endpoints',()=>{
  for(const options of [{...submerged,enabled:false},{...submerged,eye:[0,3,0],world:[-8,3,0]},
    {...submerged,world:[0,0,0]}])assert.deepEqual(sourceWaterRecordedInk(ink,options),ink);
  for(const distance of [.01,1,18,200])assert.deepEqual(sourceWaterRecordedInk([0,0,0],{...submerged,world:[-distance,0,0]}),[0,0,0]);
  const original=structuredClone(submerged),originalInk=[...ink];sourceWaterRecordedInk(ink,submerged);
  assert.deepEqual(submerged,original);assert.deepEqual(ink,originalInk);
});

test('submerged water changes chromatic ratios while preserving each endpoint luminance before clamp',()=>{
  for(const original of[ink,[.026,.075,.125],[.0015,.005,.0045]]){
    const result=sourceWaterRecordedInk(original,submerged);
    assert.ok(Math.abs(luminance(result)-luminance(original))<1e-12);
    assert.ok(result[0]/result[1]<original[0]/original[1],'the longer red path is absorbed more strongly');
    assert.ok(result[2]/result[1]<original[2]/original[1],'blue transmission differs from green instead of becoming a flat cyan grade');
  }
  const eyeAbove=sourceWaterRecordedInk(ink,{...submerged,eye:[0,5,0],world:[0,-5,0],waterY:0}),
    fiveMetres=sourceWaterRecordedInk(ink,{...submerged,world:[-5,0,0]});
  near(eyeAbove,fiveMetres);
  near(sourceWaterRecordedInk(ink,{...submerged,world:[0,10,0]}),sourceWaterRecordedInk(ink,{...submerged,world:[-10,0,0]}));
});

test('the near-water ramp is continuous, the optical path is bounded, and display inks stay bounded',()=>{
  const shallow=sourceWaterRecordedInk(ink,{...submerged,world:[-.01,0,0]}),
    medium=sourceWaterRecordedInk(ink,{...submerged,world:[-1,0,0]}),
    atLimit=sourceWaterRecordedInk(ink,{...submerged,world:[-18,0,0]}),
    farther=sourceWaterRecordedInk(ink,{...submerged,world:[-1000,0,0]});
  assert.ok(Math.abs(shallow[0]-ink[0])<Math.abs(medium[0]-ink[0]));near(atLimit,farther);
  for(const distance of[.0001,.1,1,4,18,200])for(const original of[ink,[.70,.86,.93],[1,1,1]])
    assert.ok(sourceWaterRecordedInk(original,{...submerged,world:[-distance,0,0]}).every(value=>Number.isFinite(value)&&value>=0&&value<=1));
  const weak=sourceWaterRecordedInk(ink,{...submerged,absorptionScale:.1}),strong=sourceWaterRecordedInk(ink,{...submerged,absorptionScale:1});
  assert.ok(strong[0]/strong[1]<weak[0]/weak[1]);
});

test('the GLSL hook uses world metres after blueprint endpoint selection and leaves the original capture decision intact',()=>{
  assert.match(PIXEL_MESH_FRAG,/uniform vec4 uSourceWaterInk;/);
  const helper=PIXEL_MESH_FRAG.slice(PIXEL_MESH_FRAG.indexOf('vec3 sourceWaterRecordedInk('),PIXEL_MESH_FRAG.indexOf('vec2 printedSurfaceTexel('));
  assert.match(helper,/vec3 eye=uCam\*uCellMeters/);assert.match(helper,/length\(worldMetres-eye\)/);
  assert.match(helper,/min\(path,18\.0\)/);assert.match(helper,/vec3\(\.24,\.075,\.105\)/);
  assert.match(helper,/luma\(ink\)\/max\(\.000001,luma\(tinted\)\)/);
  assert.doesNotMatch(helper,/captureBit|formTone|threshold|discard|gl_FragDepth|uTime|sampler|uMarks/);
  const blueprint=PIXEL_MESH_FRAG.indexOf('captureLight=sourceBlueprintRecordedInk('),
    dark=PIXEL_MESH_FRAG.indexOf('captureDark=sourceWaterRecordedInk(captureDark,worldMetres)'),
    light=PIXEL_MESH_FRAG.indexOf('captureLight=sourceWaterRecordedInk(captureLight,worldMetres)'),
    resolve=PIXEL_MESH_FRAG.indexOf('vec3 oneBitScene = mix(captureDark, captureLight, captureBit)');
  assert.ok(blueprint<dark&&dark<light&&light<resolve);
  assert.match(PIXEL_MESH_FRAG,/finalColor\*=1\.0-missingCore/,'the final exact-black material reservation still owns absence');
});
