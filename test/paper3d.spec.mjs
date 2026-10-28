import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { paper3dDebugShaders, paper3dProbe } from '../src/render/paper3d.js';
import { PAPER_ATLAS_HANDLING, PAPER_DOCUMENTS } from '../src/generated/paper-catalog.js';
import { PROP_INSTANCE_FLOATS, PROP_INSTANCE_BINDINGS, writePropInstanceFlags, propPoweredMaterialScale } from '../src/render/prop-instance-layout.js';

const shader=paper3dDebugShaders();
assert.match(shader.vertex,/MESH|uHandling|uShape|crease|turn/i);
assert.match(shader.fragment,/uMaterial|rough|transmission|discard/);
assert.match(shader.fragment,/vec2 tuv=vUv/,'front paper art samples upright DOM texture coordinates');
assert.doesNotMatch(shader.fragment,/1\.0-vUv\.y/,'Paper3D does not vertically invert the printed front');
assert.equal(paper3dProbe().ready,false,'Node import remains browser-safe and lazy');
assert.ok(Array.isArray(PAPER_ATLAS_HANDLING));
assert.equal(PAPER_ATLAS_HANDLING.length,Object.values(PAPER_DOCUMENTS).reduce((n,d)=>n+d.pages.length,0));
for(const vector of PAPER_ATLAS_HANDLING){assert.equal(vector.length,4);}
const reader=readFileSync('src/game/document.js','utf8');
assert.match(reader,/paper3dRender/);
assert.match(reader,/paperMaterialState/);
assert.match(reader,/frame\)/);
const props=readFileSync('src/render/props3d.js','utf8');
assert.match(props,/aPaperHandling/);
assert.match(props,/PAPER_ATLAS_HANDLING/);
assert.match(props,/Float32Array\(list\.length\*PROP_INSTANCE_FLOATS\)/);
const uploadStart=props.indexOf('function uploadInstances(mesh,list){'),uploadEnd=props.indexOf('\nfunction renderShadowPass(',uploadStart);
assert.ok(uploadStart>=0&&uploadEnd>uploadStart,'execute the actual complete prop instance uploader');
let uploaded=null;
const upload=runInNewContext(props.slice(uploadStart,uploadEnd)+'\nuploadInstances;',{
  PROP_INSTANCE_FLOATS,PAPER_ATLAS_HANDLING,writePropInstanceFlags,propPoweredMaterialScale,
  practicalLightFrameByPropId:new Map(),modelMatrix:instance=>instance.matrix,
  gl:{ARRAY_BUFFER:34962,DYNAMIC_DRAW:35048,bindBuffer(){},bufferData(_target,data){uploaded=data;}},
});
const page=PAPER_ATLAS_HANDLING.findIndex(vector=>vector.every(value=>value!==0&&value!==-1));
assert.ok(page>=0,'exercise every handling channel with a real catalogue page');
const matrices=[Float32Array.from({length:16},(_,i)=>i+.25),Float32Array.from({length:16},(_,i)=>i+100.25)];
upload({instanceBuffer:{}},[{id:'paper',matrix:matrices[0],paperIndex:page,emissive:[.1,.2,.3,.4]},
  {id:'ordinary',matrix:matrices[1]}]);
assert.equal(uploaded.length,2*PROP_INSTANCE_FLOATS);
const paperBinding=PROP_INSTANCE_BINDINGS.find(([location])=>location===11);
const handlingBinding=PROP_INSTANCE_BINDINGS.find(([location])=>location===12);
assert.equal(handlingBinding[1],4);assert.ok(handlingBinding[2]/4+4<=PROP_INSTANCE_FLOATS);
for(let instance=0;instance<2;instance++){
  const at=instance*PROP_INSTANCE_FLOATS;
  assert.deepEqual([...uploaded.slice(at,at+16)],[...matrices[instance]],'paper metadata cannot overwrite either model matrix');
  assert.equal(uploaded[at+paperBinding[2]/4],instance===0?page:-1);
  const expected=instance===0?PAPER_ATLAS_HANDLING[page]:[-1,0,0,0];
  for(let channel=0;channel<4;channel++)assert.ok(Math.abs(uploaded[at+handlingBinding[2]/4+channel]-expected[channel])<1e-6,
    `instance ${instance} preserves paper handling channel ${channel}`);
}
console.log('paper3d contracts passed');
