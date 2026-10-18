// Tree-only reproducible patch of the existing vegetation pack. All non-tree
// accessor bytes, material definitions and embedded images are conserved.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildTreeCrown,TREE_CROWN_NAMES,TREE_CROWN_REVISION} from './tree-crown-geometry.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const align=n=>(n+3)&~3;
export function parseGlb(bytes){const length=bytes.readUInt32LE(12);return{json:JSON.parse(bytes.subarray(20,20+length).toString('utf8').trim()),bin:bytes.subarray(28+length,28+length+bytes.readUInt32LE(20+length))};}
export function encodeGlb(json,bin){const text=Buffer.from(JSON.stringify(json)),jb=Buffer.alloc(align(text.length),32);text.copy(jb);const bb=Buffer.alloc(align(bin.length));bin.copy(bb);const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+jb.length+bb.length,8);header.writeUInt32LE(jb.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bb.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,jb,bh,bb]);}
export function meshFingerprint({json,bin},mesh){
  const bytes=index=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView],size=({5126:4,5125:4,5123:2,5121:1})[a.componentType]*({SCALAR:1,VEC2:2,VEC3:3,VEC4:4})[a.type],stride=v.byteStride||size,start=(v.byteOffset||0)+(a.byteOffset||0);return Buffer.concat(Array.from({length:a.count},(_,i)=>bin.subarray(start+i*stride,start+i*stride+size)));};
  return sha(Buffer.concat([Buffer.from(JSON.stringify(mesh.extras||{})),...mesh.primitives.flatMap(p=>[Buffer.from(JSON.stringify({material:p.material,mode:p.mode??4})),bytes(p.indices),...Object.keys(p.attributes).sort().map(k=>Buffer.concat([Buffer.from(k),bytes(p.attributes[k])]))])]));
}
export function patchTreeCrowns(input){
  const json=structuredClone(input.json),chunks=[Buffer.from(input.bin)];let byteLength=input.bin.length;
  const accessor=(values,components,integer=false)=>{
    const array=integer?new Uint32Array(values):new Float32Array(values),bytes=Buffer.from(array.buffer),offset=align(byteLength);
    if(offset>byteLength)chunks.push(Buffer.alloc(offset-byteLength));chunks.push(bytes);byteLength=offset+bytes.length;
    const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});
    const a={bufferView:view,componentType:integer?5125:5126,count:values.length/components,type:components===1?'SCALAR':`VEC${components}`};
    if(components===3&&!integer){a.min=Array.from({length:3},(_,k)=>Math.min(...values.filter((_,i)=>i%3===k)));a.max=Array.from({length:3},(_,k)=>Math.max(...values.filter((_,i)=>i%3===k)));}
    const index=json.accessors.length;json.accessors.push(a);return index;
  };
  const stem=json.materials.findIndex(m=>m.name==='vegetation.stem'),leaf=json.materials.findIndex(m=>m.name==='vegetation.blade');
  if(stem<0||leaf<0)throw Error('Required existing vegetation materials absent');
  for(const [variant,base]of TREE_CROWN_NAMES.entries())for(let lod=0;lod<3;lod++){
    const name=base+(lod?`_lod${lod}`:''),mesh=json.meshes.find(m=>m.name===name);if(!mesh)throw Error(`Missing ${name}`);
    const built=buildTreeCrown(variant,lod);mesh.primitives=built.primitives.map(p=>({attributes:{POSITION:accessor(p.positions,3),NORMAL:accessor(p.normals,3),TEXCOORD_0:accessor(p.uvs,2)},indices:accessor(p.indices,1,true),material:p.role==='leaf'?leaf:stem}));
    mesh.extras={...mesh.extras,...built.extras};
  }
  const bin=Buffer.concat(chunks),usedA=new Set();
  for(const mesh of json.meshes)for(const p of mesh.primitives){usedA.add(p.indices);Object.values(p.attributes).forEach(i=>usedA.add(i));}
  const ai=[...usedA].sort((a,b)=>a-b),am=new Map(ai.map((old,i)=>[old,i])),usedV=new Set(ai.map(i=>json.accessors[i].bufferView));
  json.images.forEach(i=>usedV.add(i.bufferView));const vi=[...usedV].sort((a,b)=>a-b),vm=new Map(vi.map((old,i)=>[old,i]));
  const compact=[],views=[];let cursor=0;
  for(const old of vi){const v=json.bufferViews[old],offset=align(cursor);if(offset>cursor)compact.push(Buffer.alloc(offset-cursor));compact.push(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));views.push({...v,buffer:0,byteOffset:offset});cursor=offset+v.byteLength;}
  json.accessors=ai.map(i=>({...json.accessors[i],bufferView:vm.get(json.accessors[i].bufferView)}));json.bufferViews=views;
  for(const mesh of json.meshes)for(const p of mesh.primitives){p.indices=am.get(p.indices);p.attributes=Object.fromEntries(Object.entries(p.attributes).map(([k,i])=>[k,am.get(i)]));}
  json.images=json.images.map(i=>({...i,bufferView:vm.get(i.bufferView)}));json.buffers=[{byteLength:cursor}];
  return{json,bin:Buffer.concat(compact)};
}
export function crownStats(bytes,json,previous){
  const meshes={};for(const[index,m]of json.meshes.entries()){
    const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];let triangles=0,vertices=0;
    for(const p of m.primitives){const a=json.accessors[p.attributes.POSITION];vertices+=a.count;triangles+=json.accessors[p.indices].count/3;for(let k=0;k<3;k++){low[k]=Math.min(low[k],a.min[k]);high[k]=Math.max(high[k],a.max[k]);}}
    meshes[m.name]={index,triangles,vertices,primitives:m.primitives.length,bounds:{min:low,max:high},extras:m.extras||{}};
  }
  return{...previous,bytes:bytes.length,sha256:sha(bytes),totalTriangles:Object.values(meshes).reduce((s,m)=>s+m.triangles,0),meshes,treeCrown:{revision:TREE_CROWN_REVISION,generator:'tools/chunk_surfer/tree-crown-geometry.mjs',source:'original deterministic geometry; existing non-tree plants, materials and texture data retained'}};
}
async function main(){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),file=path.join(root,'public/assets/vegetation.glb'),before=fs.readFileSync(file),previous=JSON.parse(fs.readFileSync(file.replace('.glb','.stats.json'),'utf8'));
  const original=parseGlb(before),patched=patchTreeCrowns(original),bytes=encodeGlb(patched.json,patched.bin),stats=crownStats(bytes,patched.json,previous),limits=stats.limits;
  const changed=[];for(const mesh of original.json.meshes.filter(m=>!m.name.startsWith('opening_street_tree_small'))){if(meshFingerprint(original,mesh)!==meshFingerprint(patched,patched.json.meshes.find(m=>m.name===mesh.name)))changed.push(mesh.name);}
  if(changed.length||JSON.stringify(original.json.materials)!==JSON.stringify(patched.json.materials))throw Error(`Unrelated vegetation changed: ${changed.join(',')}`);
  const imageHashes=pack=>pack.json.images.map(i=>{const v=pack.json.bufferViews[i.bufferView];return sha(pack.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));});
  if(JSON.stringify(imageHashes(original))!==JSON.stringify(imageHashes(patched)))throw Error('Embedded image preservation failed');
  if(stats.totalTriangles>limits.triangles||stats.bytes>limits.bytes)throw Error('Tree rebuild exceeded established pack limits');
  const creditsFile=file.replace('.glb','.credits.json'),credits=JSON.parse(fs.readFileSync(creditsFile,'utf8'));credits.pack={sha256:stats.sha256,bytes:stats.bytes,triangles:stats.totalTriangles};credits.treeCrown=stats.treeCrown;
  fs.writeFileSync(file,bytes);fs.writeFileSync(file.replace('.glb','.stats.json'),JSON.stringify(stats,null,2)+'\n');fs.writeFileSync(creditsFile,JSON.stringify(credits,null,2)+'\n');
  const report={revision:TREE_CROWN_REVISION,beforeSha256:sha(before),afterSha256:stats.sha256,bytes:stats.bytes,triangles:stats.totalTriangles,nonTreeMeshesPreserved:patched.json.meshes.length-9,nonTreeFingerprints:Object.fromEntries(patched.json.meshes.filter(m=>!m.name.startsWith('opening_street_tree_small')).map(m=>[m.name,meshFingerprint(patched,m)])),materialsUnchanged:true,embeddedImagesUnchanged:true,generator:stats.treeCrown};
  fs.writeFileSync(path.join(root,'artifacts/tree-crown-rebuild.json'),JSON.stringify(report,null,2)+'\n');
  const artifactFile=path.join(root,'artifacts/vegetation-assets.json'),artifact=JSON.parse(fs.readFileSync(artifactFile,'utf8'));artifact.build=stats;artifact.treeCrownRebuild=report;fs.writeFileSync(artifactFile,JSON.stringify(artifact,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
