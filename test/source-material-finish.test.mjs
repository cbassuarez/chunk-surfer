import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_FINISH,normalizeSourceFinish,sourcePrismaticInk,sourceMaterialRecordedInk,sourceFaultRecordedInk,SOURCE_CHUNK_ERROR_BYTE,SOURCE_CHUNK_ERROR_TAG,SOURCE_MATERIAL_FINISH_GLSL} from '../src/render/source-material-finish.js';
import {PIXEL_MESH_FRAG} from '../src/render/pixel-mesh/shader.js';
import {tracePrimitiveMaterialRole} from './helpers/prop-material-role-binding.mjs';

const close=(a,b)=>a.forEach((n,i)=>assert.ok(Math.abs(n-b[i])<1e-12,`${a} != ${b}`));
test('Source finish modes are explicit and default to the approved crash-screen stock',()=>{
  assert.deepEqual(SOURCE_FINISH,{none:0,bsod:1,silicon:2,bismuth:3});
  for(const [name,value]of Object.entries(SOURCE_FINISH)){assert.equal(normalizeSourceFinish(name),value);assert.equal(normalizeSourceFinish(value),value);}
  for(const bad of [null,undefined,'arbitrary',{},NaN,Infinity,-1,4])assert.equal(normalizeSourceFinish(bad),1);
});
test('prismatic substrates are strongly saturated and retain white/silver code at every sampled position',()=>{
  for(const finish of ['silicon','bismuth'])for(let n=0;n<120;n++){
    const context={finish,world:[n*.13,-n*.07,n*.31],facing:.5+(n%40)/80};
    const stock=sourcePrismaticInk(context),code=sourcePrismaticInk({...context,pigment:1});
    assert.ok(stock.every(v=>v>=.015&&v<=1));
    assert.ok(Math.max(...stock)-Math.min(...stock)>.75,'spectral stock cannot converge back to beige or gray');
    close(code,[.96,.985,1]);
    const dark=sourcePrismaticInk({...context,light:false});assert.ok(dark.every((v,i)=>v<stock[i]));
  }
});
test('silicon responds continuously to the view, while bismuth retains discrete physical terraces',()=>{
  const context={finish:'silicon',world:[.1,.1,.1],facing:.7};
  const a=sourcePrismaticInk(context),b=sourcePrismaticInk({...context,facing:.700001});
  assert.ok(Math.max(...a.map((v,i)=>Math.abs(v-b[i])))<.00002);
  assert.notDeepEqual(a,sourcePrismaticInk({...context,facing:.4}));
  const terrace={finish:'bismuth',world:[.1,.1,.1],facing:.7};
  assert.deepEqual(sourcePrismaticInk(terrace),sourcePrismaticInk({...terrace,world:[.1001,.1,.1]}));
  assert.notDeepEqual(sourcePrismaticInk(terrace),sourcePrismaticInk({...terrace,world:[.6,.1,.1]}));
});
test('ordinary materials, Source I, exact darkness and disabled finishes are unchanged',()=>{
  const original=[.07,.12,.35];
  for(const finish of ['none','bsod'])assert.deepEqual(sourceMaterialRecordedInk(original,{finish,pigmentKind:2,capturedLight:1}),original);
  for(const finish of ['silicon','bismuth']){
    for(const pigmentKind of [0,1,1.49])assert.deepEqual(sourceMaterialRecordedInk(original,{finish,pigmentKind,capturedLight:1}),original);
    assert.deepEqual(sourceMaterialRecordedInk([0,0,0],{finish,pigmentKind:2,capturedLight:0}),[0,0,0]);
  }
});
test('only depth-winning chunk-error material keeps its hyperchromatic raw ink',()=>{
  const original=[.9,.9,.9],raw=[1,.01,.8];
  for(let byte=0;byte<256;byte++){
    const out=sourceFaultRecordedInk(original,raw,{enabled:true,tag:byte/255,capturedLight:1});
    if(byte===SOURCE_CHUNK_ERROR_BYTE){assert.ok(out[0]-out[1]>.9);close(out,[.98,.01475,.785]);}
    else assert.deepEqual(out,original,`unrelated material byte ${byte} must retain its ink`);
  }
  assert.deepEqual(sourceFaultRecordedInk(original,raw,{tag:SOURCE_CHUNK_ERROR_TAG,capturedLight:1}),original);
  assert.deepEqual(sourceFaultRecordedInk([0,0,0],raw,{enabled:true,tag:SOURCE_CHUNK_ERROR_TAG,capturedLight:0}),[0,0,0]);
  const props=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
  const trace=tracePrimitiveMaterialRole(props,'uSourceChunkError',[{p:{materialRole:'source-chunk-error'}},{p:{}},{p:{materialRole:'quiet-metal'}}]);
  assert.deepEqual(trace.values,[1,0,0],'every actual primitive resets the categorical fault binding');
});
test('fault identity cannot be synthesized by filtered neighbouring material tags',()=>{
  const original=[.9,.9,.9],raw=[1,.01,.8],context={enabled:true,capturedLight:1};
  const neighbours=[245/255,255/255];
  for(const tag of neighbours)assert.deepEqual(sourceFaultRecordedInk(original,raw,{...context,tag}),original);
  // Linear sampling 40% across a smoke/world boundary fabricates fault byte
  // 249 even though neither depth-winning texel belongs to a chunk error.
  const filteredTag=neighbours[0]*.6+neighbours[1]*.4;
  assert.ok(Math.abs(filteredTag-SOURCE_CHUNK_ERROR_TAG)<1e-12);
  assert.notDeepEqual(sourceFaultRecordedInk(original,raw,{...context,tag:filteredTag}),original);
  assert.match(PIXEL_MESH_FRAG,/float faultMaterialTag=texelFetch\(uMarks,\s*clamp\(ivec2\(frag\),ivec2\(0\),textureSize\(uMarks,0\)-1\),0\)\.a\*\(1\.0-printedOccluded\)/,'faults use an exact clamped depth-winning texel and respect Pressure occlusion');
  for(const endpoint of ['Dark','Light'])assert.match(PIXEL_MESH_FRAG,new RegExp(`capture${endpoint}=sourceFaultRecordedInk\\(capture${endpoint},srcFull\\.rgb,uSourceFinish,faultMaterialTag,`));
  assert.doesNotMatch(PIXEL_MESH_FRAG,/sourceFaultRecordedInk\([^;]*markSample\.a/);
});
test('spectral color resolves after acquisition and before emergency/Pressure identities with no new texture budget',()=>{
  assert.ok(PIXEL_MESH_FRAG.includes(SOURCE_MATERIAL_FINISH_GLSL));
  assert.doesNotMatch(SOURCE_MATERIAL_FINISH_GLSL,/uniform\s+sampler|uTime|captureBit|discard|gl_FragDepth/);
  assert.ok(PIXEL_MESH_FRAG.indexOf('float captureBit =')<PIXEL_MESH_FRAG.indexOf('captureLight=sourceMaterialRecordedInk'));
  assert.ok(PIXEL_MESH_FRAG.indexOf('captureLight=sourceFaultRecordedInk')<PIXEL_MESH_FRAG.indexOf('captureLight=mix(captureLight,vec3(.98,.018,.008),emergencyRed)'));
  assert.match(PIXEL_MESH_FRAG,/finishColourLoss=step\(.5,uSourceFinish\)\*uSourceRestFacultyState.x/,'a rest perception sequence can still remove color');
  const host=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  assert.match(host,/gl.uniform1f\(pixelMeshU\('uSourceFinish'\),blueprintRecording\?normalizeSourceFinish\(sourceLook.finish\):0\)/,'the actual host gates the finish to explicit Source physical rendering');
});
