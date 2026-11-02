// Dedicated replacement for one existing boundary mesh. Shared props stay put.
import fs from 'node:fs';import crypto from 'node:crypto';
import {Document,NodeIO} from '@gltf-transform/core';
import {buildArrivalCourt} from './arrival-court-geometry.mjs';
import {ARRIVAL_COURT as C} from '../../src/data/arrival-court.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const source='public/assets/conservatory-props.glb',before=sha(fs.readFileSync(source)),meshes=new Map(),materials=[];
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mesh=name=>{const m={name,groups:new Map()};meshes.set(name,m);return m;};
const addQuad=(m,a,b,c,d,material)=>{
  let g=m.groups.get(material);if(!g){g={material,positions:[],normals:[],uvs:[],indices:[]};m.groups.set(material,g);}
  const normal=unit(cross(b.map((x,i)=>x-a[i]),c.map((x,i)=>x-a[i]))),start=g.positions.length/3;
  const dominant=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),axes=dominant===0?[2,1]:dominant===1?[0,2]:[0,1];
  for(const p of[a,b,c,d]){g.positions.push(...p);g.normals.push(...normal);g.uvs.push(p[axes[0]],p[axes[1]]);}
  g.indices.push(start,start+1,start+2,start,start+2,start+3);
};
const box=(m,c,size,material,axes=[[1,0,0],[0,1,0],[0,0,1]])=>{
  const p=Array.from({length:8},(_,i)=>c.map((v,k)=>v+axes.reduce((s,a,j)=>s+a[k]*size[j]*(i&(1<<j)?1:-1)/2,0)));
  for(const face of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])addQuad(m,...face.map(i=>p[i]),material);
};
const addBeam=(m,a,b,width,material)=>{const f=unit(b.map((v,i)=>v-a[i])),u=unit(cross(f,Math.abs(f[1])>.9?[1,0,0]:[0,1,0])),v=cross(f,u);box(m,a.map((x,i)=>(x+b[i])/2),[width,width,Math.hypot(...b.map((x,i)=>x-a[i]))],material,[u,v,f]);};
const geometry=buildArrivalCourt({mesh,materials,addBox:box,addBeam,addQuad}),selected=meshes.get(C.meshes.boundary);
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Retained civic boundary with Jardins opening');
const mats=materials.map(m=>doc.createMaterial(m.name).setBaseColorFactor(m.pbrMetallicRoughness.baseColorFactor).setRoughnessFactor(m.pbrMetallicRoughness.roughnessFactor).setMetallicFactor(m.pbrMetallicRoughness.metallicFactor).setExtras({materialFactors:'gltf'}));
const attribute=(name,a,type,int=false)=>doc.createAccessor(name).setType(type).setArray(int?new Uint32Array(a):new Float32Array(a)).setBuffer(buffer);
const output=doc.createMesh(selected.name).setExtras({revision:'yard-quarter-turn-1',opening:{x0:41.5,x1:45,z:1.5},retainedVehicleOpening:C.opening});
for(const g of selected.groups.values())output.addPrimitive(doc.createPrimitive().setAttribute('POSITION',attribute('position',g.positions,'VEC3')).setAttribute('NORMAL',attribute('normal',g.normals,'VEC3')).setAttribute('TEXCOORD_0',attribute('uv',g.uvs,'VEC2')).setIndices(attribute('index',g.indices,'SCALAR',true)).setMaterial(mats[g.material]));
scene.addChild(doc.createNode(output.getName()).setMesh(output));
const bytes=Buffer.from(await new NodeIO().writeBinary(doc));if(sha(fs.readFileSync(source))!==before)throw Error('Shared props changed during isolated boundary build');
const paths=['src/data/arrival-court.js','src/data/yard-turn.js','src/data/yard-jardins.js','tools/chunk_surfer/arrival-court-geometry.mjs','tools/chunk_surfer/build-yard-jardins-boundary.mjs'];
const stats={revision:'yard-quarter-turn-1',bytes:bytes.length,sha256:sha(bytes),mesh:selected.name,triangles:geometry.meshes[selected.name].triangles,geometry,protectedSource:{path:source,sha256:before,unchanged:true},sourceHashes:Object.fromEntries(paths.map(p=>[p,sha(fs.readFileSync(p))]))};
fs.writeFileSync('public/assets/yard-jardins-boundary.glb',bytes);fs.writeFileSync('public/assets/yard-jardins-boundary.stats.json',JSON.stringify(stats,null,2)+'\n');fs.writeFileSync('public/assets/yard-jardins-boundary.credits.json',JSON.stringify({author:'Chunk Surfer project',license:'Original project-native geometry',sources:paths,purpose:'Same retained civic boundary and original vehicle gate, with one physically open pedestrian bay serving the garden perimeter.'},null,2)+'\n');
console.log(JSON.stringify({mesh:stats.mesh,triangles:stats.triangles,bytes:stats.bytes,sha256:stats.sha256,sharedSourceUnchanged:true},null,2));
