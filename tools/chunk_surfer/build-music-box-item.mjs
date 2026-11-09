// Isolated inspection asset, generated from exactly the same local geometry
// and physical maps as the cab/coast. Never extracts an old world-space mesh.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {buildMusicBoxModel,MUSIC_BOX_MATERIALS,MUSIC_BOX_CONSTRUCTION,musicBoxMaterialMaps} from './lib/music-box-model.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export async function buildMusicBoxItem({root=ROOT,write=true,damaged=false}={}){
 const model=buildMusicBoxModel({damaged}),doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Lyle’s closed keepsake'),materials=new Map();
 const attribute=(values,type)=>doc.createAccessor().setType(type).setArray(type==='SCALAR'?Uint32Array.from(values):Float32Array.from(values)).setBuffer(buffer);
 for(const part of['body','key']){const mesh=doc.createMesh('music_box_'+part);for(const g of model[part]){let mat=materials.get(g.material);if(!mat){const q=MUSIC_BOX_MATERIALS[g.material],maps=musicBoxMaterialMaps(g.material,{root}),texture=key=>doc.createTexture(q.label+' '+key).setImage(maps[key]).setMimeType('image/png');mat=doc.createMaterial(q.label).setBaseColorFactor([1,1,1,1]).setRoughnessFactor(1).setMetallicFactor(1).setBaseColorTexture(texture('albedo')).setNormalTexture(texture('normal')).setMetallicRoughnessTexture(texture('orm')).setExtras({materialFactors:'gltf',musicBoxConstruction:MUSIC_BOX_CONSTRUCTION.revision,coatedCase:true});materials.set(g.material,mat);}mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',attribute(g.positions,'VEC3')).setAttribute('NORMAL',attribute(g.normals,'VEC3')).setAttribute('TEXCOORD_0',attribute(g.uvs,'VEC2')).setIndices(attribute(g.indices,'SCALAR')).setMaterial(mat));}scene.addChild(doc.createNode('music_box_'+part).setMesh(mesh).setExtras({part,...model.features}));}
 const bytes=Buffer.from(await new NodeIO().writeBinary(doc));if(write){const file=path.join(root,'public/assets/items/music-box.glb');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}return{bytes,features:model.features,triangles:[...model.body,...model.key].reduce((n,g)=>n+g.indices.length/3,0)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const r=await buildMusicBoxItem();console.log(JSON.stringify({bytes:r.bytes.length,triangles:r.triangles,construction:r.features.construction}));}
