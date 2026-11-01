import {courtyardMeshCuts} from '../../src/data/ellery-courtyard-architecture.js';
import {subtractTriangleBox} from './exterior-stationers-geometry.mjs';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {prune} from '@gltf-transform/functions';

// Preserve every untouched index/material/UV. Clip crossing triangles exactly,
// so a room-sized slab cannot survive merely because its vertices lie outside.
export function clipCourtyardPrimitive(group,boxes){
  const {positions,normals,uvs}=group,indices=[];let changed=0;
  const original=[...group.indices];
  for(let i=0;i<original.length;i+=3){
    const ids=original.slice(i,i+3),triangle=ids.map(k=>({position:positions.slice(k*3,k*3+3),normal:normals.slice(k*3,k*3+3),uv:uvs.slice(k*2,k*2+2)}));
    let pieces=[triangle],cut=false;
    for(const box of boxes){const next=[];for(const part of pieces){const result=subtractTriangleBox(part,box);cut ||= result.changed;next.push(...result.triangles);}pieces=next;}
    if(!cut){indices.push(...ids);continue;}
    changed++;
    for(const part of pieces){const start=positions.length/3;for(const v of part){positions.push(...v.position);const n=Math.hypot(...v.normal)||1;normals.push(...v.normal.map(x=>x/n));uvs.push(...v.uv);}indices.push(start,start+1,start+2);}
  }
  group.indices=indices;return changed;
}

export function clipCourtyardArchitecture(meshes){
  const receipt=[];
  for(const mesh of meshes.values()){
    const cuts=courtyardMeshCuts(mesh.name);if(!cuts.length)continue;
    let changed=0;for(const group of mesh.groups.values())changed+=clipCourtyardPrimitive(group,cuts);
    mesh.extras={...mesh.extras,courtyardOpenAir:{revision:1,cuts,changedTriangles:changed}};
    receipt.push({mesh:mesh.name,changedTriangles:changed});
  }
  return receipt;
}

// Optional authored packs replace base catalog names after startup. Apply the
// same physical cut to those replacements, preserving their materials/maps.
export async function clipCourtyardGlb(file){
  const io=new NodeIO(),doc=await io.read(file),buffer=doc.getRoot().listBuffers()[0];
  const receipt=[];
  for(const mesh of doc.getRoot().listMeshes()){
    const cuts=courtyardMeshCuts(mesh.getName());if(!cuts.length)continue;
    let changed=0;
    for(const primitive of [...mesh.listPrimitives()]){
      const get=(name)=>Array.from(primitive.getAttribute(name)?.getArray()||[]);
      const group={positions:get('POSITION'),normals:get('NORMAL'),uvs:get('TEXCOORD_0'),indices:Array.from(primitive.getIndices().getArray())};
      const count=clipCourtyardPrimitive(group,cuts);changed+=count;if(!count)continue;
      if(!group.indices.length){mesh.removePrimitive(primitive);primitive.dispose();continue;}
      for(const[name,key,type]of[['POSITION','positions','VEC3'],['NORMAL','normals','VEC3'],['TEXCOORD_0','uvs','VEC2']]){
        primitive.setAttribute(name,doc.createAccessor().setBuffer(buffer).setType(type).setArray(new Float32Array(group[key])));
      }
      primitive.setIndices(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint32Array(group.indices)));
    }
    mesh.setExtras({...mesh.getExtras(),courtyardOpenAir:{revision:1,cuts,changedTriangles:changed}});
    receipt.push({mesh:mesh.getName(),changedTriangles:changed});
  }
  await doc.transform(prune({keepAttributes:true,keepExtras:true,keepSolidTextures:true}));
  await fs.writeFile(file,await io.writeBinary(doc));return receipt;
}
