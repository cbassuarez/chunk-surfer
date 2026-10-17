// Reproject the original imported stock beneath local ink overlays. No color
// estimation: triangle barycentrics carry the host's real UVs and PBR factors.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};

export function inscriptionTileDimensions(job){
 const lines=job.lines||String(job.copy||'').split('\n'),category=job.category||'institution';
 const maximum=category==='personal'&&job.widthM<2?480:category==='record'?512:job.widthM>3?960:768;
 const desired=job.capHeightM||Math.min(job.heightM/(lines.length*1.65),job.widthM/Math.max(1,Math.max(...lines.map(x=>x.length))*.66));
 const ppm=Math.min(maximum/job.widthM,(job.texelCapPx||(category==='personal'?64:category==='record'?32:48))/Math.max(.001,desired));
 return [Math.max(40,Math.round(job.widthM*ppm)),Math.min(960,Math.max(32,Math.round(job.heightM*ppm)))];
}

export function inscriptionSurfaceTriangles(mesh,job){
 const face=job.orientation||job,normal=unit(cross(face.readerRight,face.up));
 const triangles=[];
 for(const [primitiveIndex,primitive] of mesh.listPrimitives().entries()){
  const positions=primitive.getAttribute('POSITION'),uv=primitive.getAttribute('TEXCOORD_0'),normals=primitive.getAttribute('NORMAL'),indices=primitive.getIndices();
  for(let index=0;index<(indices?.getCount()||positions.getCount());index+=3){
   const vertices=[0,1,2].map(k=>indices?indices.getScalar(index+k):index+k);
   const points=vertices.map(i=>positions.getElement(i,[])),a=sub(points[1],points[0]),b=sub(points[2],points[0]),geometric=unit(cross(a,b));
   if(!Number.isFinite(geometric[0])||dot(geometric,normal)<.80)continue;
   const projected=points.map(point=>{const d=sub(point,face.center);return[dot(d,face.readerRight),dot(d,face.up),dot(d,normal)];});
   const lo=[0,1,2].map(k=>Math.min(...projected.map(p=>p[k]))),hi=[0,1,2].map(k=>Math.max(...projected.map(p=>p[k])));
   if(hi[0]<-job.widthM/2||lo[0]>job.widthM/2||hi[1]<-job.heightM/2||lo[1]>job.heightM/2||hi[2]<-.030||lo[2]>.003)continue;
   triangles.push({primitiveIndex,points,projected,uv:uv?vertices.map(i=>uv.getElement(i,[])):null,
    normals:normals?vertices.map(i=>normals.getElement(i,[])):points.map(()=>geometric)});
  }
 }
 if(!triangles.length)throw new Error(`No supporting host triangles for ${job.id}`);
 return triangles;
}

export async function prepareWorldInscriptionSubstrates(jobs,{root,outputDir}={}){
 if(!root||!outputDir)throw new TypeError('A repository root and task-owned outputDir are required');
 fs.mkdirSync(outputDir,{recursive:true});const io=new NodeIO(),documents=new Map(),textures=new Map(),prepared=new Map(),result=[];
 const texturePath=texture=>{
  if(!texture)return null;
  if(textures.has(texture))return textures.get(texture);
  const bytes=texture.getImage();if(!bytes)throw new Error('Host texture has no image bytes');
  const extension=texture.getMimeType()==='image/jpeg'?'.jpg':'.png';
  const file=path.resolve(outputDir,`host-${sha(bytes).slice(0,20)}${extension}`);
  if(!fs.existsSync(file))fs.writeFileSync(file,bytes);textures.set(texture,file);return file;
 };
 const materialDescription=material=>({
  name:material?.getName(),albedo:texturePath(material?.getBaseColorTexture()),
  normal:texturePath(material?.getNormalTexture()),orm:texturePath(material?.getMetallicRoughnessTexture()),
  occlusion:texturePath(material?.getOcclusionTexture()),
  baseColorFactor:material?.getBaseColorFactor()||[1,1,1,1],
  roughnessFactor:material?.getRoughnessFactor()??1,metallicFactor:material?.getMetallicFactor()??1,
  normalScale:material?.getNormalScale()??1,occlusionStrength:material?.getOcclusionStrength()??1,
 });
 for(const job of jobs){
  if(!job.substrate?.asset){result.push(job);continue;}
  const asset=path.resolve(root,'public/assets',job.substrate.asset);
  if(!documents.has(asset))documents.set(asset,{document:await io.read(asset),sha256:sha(fs.readFileSync(asset))});
  const {document,sha256}=documents.get(asset),mesh=document.getRoot().listMeshes().find(m=>m.getName()===job.substrate.mesh);
  if(!mesh)throw new Error(`Missing stock mesh ${job.substrate.mesh}`);
  const orientation=job.orientation||{center:job.center,readerRight:job.readerRight,up:job.up};
  const [width,height]=inscriptionTileDimensions(job),key=sha(JSON.stringify({sha256,mesh:mesh.getName(),orientation,widthM:job.widthM,heightM:job.heightM,width,height})).slice(0,20);
  if(!prepared.has(key)){
   const input=path.resolve(outputDir,`${key}-projection.json`),prefix=path.resolve(outputDir,key);
   const payload={id:job.id,sourceAsset:asset,sourceAssetSha256:sha256,mesh:mesh.getName(),width,height,
    widthM:job.widthM,heightM:job.heightM,orientation,
    materials:mesh.listPrimitives().map(p=>materialDescription(p.getMaterial())),triangles:inscriptionSurfaceTriangles(mesh,job)};
   fs.writeFileSync(input,JSON.stringify(payload)+'\n');
   const bundled='/Users/seb/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
   const python=process.env.CHUNK_SURFER_LETTERING_PYTHON||(fs.existsSync(bundled)?bundled:'python3');
   const run=spawnSync(python,[path.join(HERE,'sample-host-substrate.py'),input,prefix],{encoding:'utf8',maxBuffer:1024*1024});
   if(run.status!==0)throw new Error(`Host stock projection failed for ${job.id}: ${run.stderr||run.stdout||run.error}`);
   prepared.set(key,{albedoPath:`${prefix}-albedo.png`,normalPath:`${prefix}-normal.png`,ormPath:`${prefix}-orm.png`,
    roughnessFactor:1,metallicFactor:1,normalScale:1,sourceAssetSha256:sha256,projectionReport:`${prefix}-report.json`});
  }
  result.push({...job,substrate:{...job.substrate,...prepared.get(key)}});
 }
 return result;
}
