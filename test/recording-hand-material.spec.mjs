import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recordingHandPlane} from '../src/render/recording-hand-material.js';
import {installRecordingEmbodimentMaterials,RECORDING_EMBODIMENT_MESHES} from '../src/render/recording-embodiment.js';

test('the anatomical receiving floor retains original reflectance and reveals planes instead of a white rim',()=>{
 const base=[.47,.32,.245].map(n=>n*.7);let last=-1;
 for(let n=0;n<=100;n++){
  const c=recordingHandPlane(base,n/100,{enabled:true});
  assert.ok(c.every(v=>Number.isFinite(v)&&v>=0&&v<.18));
  assert.ok(c[0]>=last);last=c[0];assert.ok(Math.abs(c[0]/c[1]-base[0]/base[1])<1e-12);
 }
 assert.ok(recordingHandPlane(base,1,{enabled:true})[0]>recordingHandPlane(base,0,{enabled:true})[0]*3);
 assert.deepEqual(recordingHandPlane(base,1),[0,0,0],'ordinary materials have no receiving-floor contribution');
});
test('only owned anatomical aliases opt in; retained equipment and character resources are unchanged',()=>{
 const donor={name:'rest_hand_left',extras:{},primitives:[{base:[.47,.32,.245,1],emissive:[0,0,0]}]},
  second=structuredClone(donor),before=structuredClone(donor),pack={catalog:new Map([['rest_hand_left',donor],['rest_hand_right',second]])};
 installRecordingEmbodimentMaterials(null,pack);assert.deepEqual(donor,before);
 for(const name of RECORDING_EMBODIMENT_MESHES){const mesh=pack.catalog.get(name);assert.equal(mesh.extras.recordingEmbodiment,true);assert.deepEqual(mesh.primitives[0].emissive,[0,0,0]);}
 const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
 assert.match(source,/setMaterialScalar\('uRecordingFace',m\.extras\?\.recordingEmbodiment===true\?1:0\)/);
 assert.match(source,/if\(uRecordingFace>\.5\)col=max\(col,recordingHandPlane\(base,n,normalize\(uEye-vWorld\)\)\)/);
});
test('near-hand fragments retain their original cell sample even when a nearby wall cell is pulled',()=>{
 const shader=readFileSync(new URL('../src/render/pixel-mesh/shader.js',import.meta.url),'utf8');
 assert.match(shader,/fullWorldGate<=0\.0\?vec3\(memoryUv,0\.0\):recordingPulledImage\(memoryUv\)/);
 assert.match(shader,/texture\(uPrev, memoryUv\)/);
});
