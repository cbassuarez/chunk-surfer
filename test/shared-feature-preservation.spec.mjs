import test from 'node:test';
import assert from 'node:assert/strict';
import {Document} from '@gltf-transform/core';
import sharp from 'sharp';
import {sharedFeatureFingerprint} from './helpers/shared-feature-fingerprint.mjs';

async function fixture({reindex=false,unrelated=false,encoding='png',red=17}={}){
 const document=new Document(),buffer=document.createBuffer();
 if(unrelated)document.createMesh('an unrelated later room').addPrimitive(document.createPrimitive().setMaterial(document.createMaterial('different material')));
 const accessor=(type,array)=>document.createAccessor().setBuffer(buffer).setType(type).setArray(array),order=reindex?[2,0,1]:[0,1,2],
  positions=[[0,0,0],[1,0,0],[0,1,0]],uv=[[0,0],[1,0],[0,1]],
  pixels=sharp({create:{width:2,height:2,channels:4,background:{r:red,g:31,b:45,alpha:1}}}),
  image=encoding==='png'?await pixels.png().toBuffer():await pixels.webp({lossless:true,effort:1}).toBuffer(),
  texture=document.createTexture('same wood pixels').setImage(image).setMimeType('image/'+encoding),
  material=document.createMaterial('preserved wood').setRoughnessFactor(.8).setBaseColorTexture(texture),
  primitive=document.createPrimitive().setMaterial(material).setAttribute('POSITION',accessor('VEC3',new Float32Array(order.flatMap(i=>positions[i]))))
    .setAttribute('NORMAL',accessor('VEC3',new Float32Array([0,0,1,0,0,1,0,0,1])))
    .setAttribute('TEXCOORD_0',accessor('VEC2',new Float32Array(order.flatMap(i=>uv[i]))))
    .setIndices(accessor('SCALAR',reindex?new Uint32Array([1,2,0]):new Uint16Array([0,1,2]))),
  mesh=document.createMesh('preserved fixture').addPrimitive(primitive),node=document.createNode('fixture').setMesh(mesh);
 document.createScene('existing room').addChild(node);
 return{document,primitive,material,node};
}
const fingerprint=f=>sharedFeatureFingerprint(f.document,'preserved fixture');

test('feature contract permits unrelated growth, equivalent reindexing and equivalent image encoding without refreshing a golden pack hash',async()=>{
 const a=await fingerprint(await fixture()),b=await fingerprint(await fixture({reindex:true,unrelated:true,encoding:'webp'}));
 assert.deepEqual(a,b);
});

test('feature contract rejects geometry, winding, material response, image pixels and local-origin drift independently',async()=>{
 const original=await fingerprint(await fixture());
 for(const mutate of[
  f=>f.primitive.getAttribute('POSITION').setArray(new Float32Array([0,0,0,1.1,0,0,0,1,0])),
  f=>f.primitive.getIndices().setArray(new Uint16Array([0,2,1])),
  f=>f.material.setRoughnessFactor(.2),
  f=>f.node.setTranslation([.01,0,0]),
 ]){const changed=await fixture();mutate(changed);assert.notEqual((await fingerprint(changed)).sha256,original.sha256);}
 assert.notEqual((await fingerprint(await fixture({red:19}))).sha256,original.sha256);
});
