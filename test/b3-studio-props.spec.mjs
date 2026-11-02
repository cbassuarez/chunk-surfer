import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {buildB3StudioProps} from '../tools/chunk_surfer/build-b3-studio-props.mjs';
import {B3_STUDIO_PROPS_ASSET,B3_STUDIO_PROPS_MESHES} from '../src/data/b3-studio-props.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),asset=path.join(root,'public',B3_STUDIO_PROPS_ASSET);
const doc=await new NodeIO().read(asset),stats=JSON.parse(fs.readFileSync(asset.replace('.glb','.stats.json'),'utf8'));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function intersections(name,origin,ray){
 const hits=[];const mesh=doc.getRoot().listMeshes().find(m=>m.getName()===name);assert.ok(mesh,name);
 for(const p of mesh.listPrimitives()){
  const positions=p.getAttribute('POSITION').getArray(),indices=p.getIndices().getArray();
  const point=i=>Array.from(positions.slice(i*3,i*3+3));
  for(let i=0;i<indices.length;i+=3){
   const a=point(indices[i]),b=point(indices[i+1]),c=point(indices[i+2]),e1=sub(b,a),e2=sub(c,a),h=cross(ray,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)continue;
   const s=sub(origin,a),u=dot(s,h)/det;if(u<0||u>1)continue;const q=cross(s,e1),v=dot(ray,q)/det;if(v<0||u+v>1)continue;const t=dot(e2,q)/det;if(t>=0)hits.push(t);
  }
 }
 return hits.sort((a,b)=>a-b);
}

test('dedicated B3 pack is reproducible, finite, opaque and within its bounded resource contract',async()=>{
 assert.deepEqual(doc.getRoot().listMeshes().map(m=>m.getName()).sort(),Object.keys(B3_STUDIO_PROPS_MESHES).sort());
 assert.equal(stats.sha256,sha(fs.readFileSync(asset)));assert.ok(stats.bytes<stats.limits.bytes);assert.ok(stats.triangles<stats.limits.triangles);assert.ok(stats.primitives<=stats.limits.primitives);
 for(const a of doc.getRoot().listAccessors())assert.ok([...a.getArray()].every(Number.isFinite));
 for(const m of doc.getRoot().listMaterials()){assert.equal(m.getAlphaMode(),'OPAQUE');assert.deepEqual(m.getEmissiveFactor(),[0,0,0]);}
 const rebuilt=await buildB3StudioProps({root,write:false});assert.equal(sha(rebuilt.bytes),stats.sha256);
});

test('all sixteen moving channel caps retain clear travel over the actual exported tracks',()=>{
 for(let channel=0;channel<16;channel++)for(const value of[0,.75,1]){
  const x=-.97+channel*.112,z=.1225+.27*(.75-value),hit=intersections('b3_mixing_console',[x,2,z],[0,-1,0]);
  assert.ok(hit.length,'track has physical support');const top=2-hit[0];assert.ok(top<.9051,`channel ${channel+1} value ${value}: top ${top} intersects moving cap`);assert.ok(top>.89);
 }
 const cap=stats.meshes.find(m=>m.name==='b3_fader_cap');assert.ok(cap.bounds.min[1]>=-.01301);assert.ok(cap.bounds.max[1]<=.01411);
});

test('raked EQ knob tops are physically visible from the actual operator side',()=>{
 const eye=[0,1.6,1.2],surface=z=>.955+.05/Math.cos(.28)-Math.tan(.28)*(z+.185);
 for(const channel of[0,7,15])for(const row of[0,1,2,3]){
  const z=-.025-row*.077,target=[-.97+channel*.112,surface(z)+.012+.0155,z],delta=sub(target,eye),distance=Math.hypot(...delta),ray=delta.map(v=>v/distance),hits=intersections('b3_mixing_console',eye,ray);
  assert.ok(hits.length,`channel ${channel+1} EQ ${row+1} has a surface`);
  assert.ok(hits[0]>distance-.025&&hits[0]<distance+.004,`channel ${channel+1} EQ ${row+1}: first surface ${hits[0]}, knob top ${distance}; unrelated desk geometry must not bury the control`);
 }
});

test('both window surrounds leave their true sight apertures open and retain physical jambs',()=>{
 for(const[name,half]of[['b3_window_surround',2.5],['b3_window_south_surround',1.5]]){
  for(const y of[1.12,1.5,2.2,2.95])for(const z of[-half+.13,0,half-.13])assert.equal(intersections(name,[-.6,y,z],[1,0,0]).length,0,`${name} aperture ${y},${z}`);
  assert.ok(intersections(name,[-.6,2.05,half+.07],[1,0,0]).length>0,'jamb is geometry');
 }
});

test('engineer seat has a real sitting surface with no central pedestal protrusion',()=>{
 const hit=intersections('b3_engineer_chair',[0,2,0],[0,-1,0]);assert.ok(hit.length);const seat=2-hit[0];assert.ok(seat>.52&&seat<.54,`seat at ${seat}`);
 const chair=stats.meshes.find(m=>m.name==='b3_engineer_chair');assert.ok(chair.bounds.max[1]<1.17);assert.ok(chair.bounds.min[1]>=-.001);
});

test('reused public source files match recording-specific CC0 provenance and source hashes',()=>{
 const sources=JSON.parse(fs.readFileSync(path.join(root,'assets/third-party/b3-studio/sources.json'),'utf8')).sources;
 assert.equal(sources.length,4);for(const s of sources){assert.equal(s.licence,'CC0-1.0');assert.match(s.provenance,/AI-assisted/);assert.equal(sha(fs.readFileSync(path.join(root,s.file))),s.sha256);}
});
