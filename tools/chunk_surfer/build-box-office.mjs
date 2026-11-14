// Private fitted joinery pack. Never regenerates or modifies Source copies.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {bakeLetteringAtlases,printedSurfaceMetadata} from './lettering/physical-lettering.mjs';
import {buildBoxOfficeGeometry} from './box-office-geometry.mjs';
import {BOX_OFFICE_HATCH,BOX_OFFICE_DESK} from '../../src/data/box-office.js';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const SOURCES=['src/data/box-office.js','tools/chunk_surfer/box-office-geometry.mjs','tools/chunk_surfer/build-box-office.mjs','tools/chunk_surfer/lettering/physical-lettering.mjs','tools/chunk_surfer/lettering/rasterize.py','tools/chunk_surfer/lettering/finish.py','tools/chunk_surfer/lettering/finish-profiles.mjs','tools/chunk_surfer/lettering/fonts/NimbusSansNarrow-Bold.otf'];
const PROTECTED=['public/assets/conservatory-props.glb','public/assets/glass-court.glb','src/data/generated/prop-geometry.js'];
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let v=0xffffffff;for(const b of bytes)v=crcTable[(v^b)&255]^(v>>>8);return(v^0xffffffff)>>>0;}
function png(w,h,pixel){
 const raw=Buffer.alloc((w*4+1)*h);let covered=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=pixel(x,y,w,h);raw.set(p,y*(w*4+1)+1+x*4);if(p[3]>=128)covered++;}
 const chunk=(type,data)=>{const tag=Buffer.from(type),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,sum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(w,0);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;
 return{bytes:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]),width:w,height:h,coverage:covered/(w*h)};
}
export function boxOfficeTextures(){
 return{
  oak:png(128,256,(x,y)=>{const grain=Math.sin(x*.48+Math.sin(y*.027)*1.7)*4+Math.sin(x*.13+y*.003)*6;return[188+grain,167+grain,129+grain,255].map(Math.round);}),
  glass:png(128,256,(x,y,w,h)=>{const u=x/(w-1),v=y/(h-1),edge=x<1||x>w-2||y<1||y>h-2,run=Math.abs(u-(.19+.006*Math.sin(v*11)))<.0035&&v>.36&&v<.82;return edge||run?[166,185,169,255]:[0,0,0,0];}),
 };
}
export async function buildBoxOffice({outputDir=path.join(ROOT,'public/assets')}={}){
 const protectedBefore=Object.fromEntries(PROTECTED.filter(f=>fs.existsSync(path.join(ROOT,f))).map(f=>[f,sha(fs.readFileSync(path.join(ROOT,f)))]));
 const geometry=buildBoxOfficeGeometry(),doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Ellery fitted public hatch and adult clerking furniture');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'chunk-box-office-lettering-'));
 const lettering=await bakeLetteringAtlases([
  {id:'box-office-public-name',lines:['BOX OFFICE'],widthM:.80,heightM:.16,category:'institution',process:'vitreous enamel screen print',font:'NimbusSansNarrow-Bold.otf',palette:{ground:[.66,.67,.56],ink:[.025,.04,.035]},rasterWidthPx:512,rasterHeightPx:128,capHeightM:.075},
  {id:'box-office-tray-stencil',lines:['RETURNS'],widthM:.17,heightM:.074,category:'maintenance',process:'existing returns-tray stencil',font:'NimbusSansNarrow-Bold.otf',palette:{ground:[.19,.21,.18],ink:[.63,.62,.48]},rasterWidthPx:256,rasterHeightPx:128,capHeightM:.027},
 ],{outputDir:temp,pageSize:1024});
 const textures=boxOfficeTextures(),signIds=['box-office-public-name','box-office-tray-stencil'];
 for(const[n,id]of signIds.entries()){const entry=lettering.entries.get(id),page=lettering.pages[entry.page];textures['sign'+n]={bytes:page.albedo,width:page.width,height:page.height,coverage:entry.metrics.coverage};}
 const gpuTextures=new Map(Object.entries(textures).map(([name,t])=>[name,doc.createTexture(name).setMimeType('image/png').setImage(t.bytes)]));
 const materials=geometry.materials.map(spec=>{
  const m=doc.createMaterial(spec.name).setBaseColorFactor([...spec.color,1]).setRoughnessFactor(spec.roughness).setMetallicFactor(spec.metallic||0).setDoubleSided(spec.alphaMode==='MASK');
  if(spec.texture){m.setBaseColorTexture(gpuTextures.get(spec.texture));m.getBaseColorTextureInfo().setWrapS(spec.texture==='oak'?10497:33071).setWrapT(spec.texture==='oak'?10497:33071).setMagFilter(9729).setMinFilter(9987);}
  if(spec.alphaMode)m.setAlphaMode(spec.alphaMode).setAlphaCutoff(spec.alphaCutoff);
  if(spec.texture?.startsWith('sign')){const e=lettering.entries.get(signIds[Number(spec.texture.slice(4))]);m.setExtras({printedSurface:printedSurfaceMetadata(lettering.pages[e.page])});}
  return m;
 });
 const accessor=(type,array)=>doc.createAccessor().setBuffer(buffer).setType(type).setArray(array);
 const stats={schemaVersion:1,asset:BOX_OFFICE_HATCH.pack,contract:{hatch:BOX_OFFICE_HATCH,desk:BOX_OFFICE_DESK},sourceSha256:{},protectedAssetSha256:protectedBefore,meshes:{},totalTriangles:0,textures:{},budgets:{maximumTriangles:geometry.maximumTriangles,maximumBytes:geometry.maximumBytes}};
 for(const[name,data]of geometry.meshes){
  const mesh=doc.createMesh(name).setExtras({boxOfficeOnly:true,ordinaryPhysicalSpace:true,localOrigin:[0,0,0]});scene.addChild(doc.createNode(name).setMesh(mesh));
  for(const[index,g]of data.groups){
   const spec=geometry.materials[index],uv=g.uvs.map((v,i)=>{if(!spec.texture?.startsWith('sign'))return v;const e=lettering.entries.get(signIds[Number(spec.texture.slice(4))]),r=e.uvRect;return i%2?r[1]+(r[3]-r[1])*v:r[0]+(r[2]-r[0])*v;});
   mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',accessor('VEC3',Float32Array.from(g.positions))).setAttribute('NORMAL',accessor('VEC3',Float32Array.from(g.normals))).setAttribute('TEXCOORD_0',accessor('VEC2',Float32Array.from(uv))).setIndices(accessor('SCALAR',Uint16Array.from(g.indices))).setMaterial(materials[index]));
  }
  stats.meshes[name]={bounds:data.bounds,triangles:data.triangles,parts:data.parts};stats.totalTriangles+=data.triangles;
 }
 if(stats.totalTriangles>geometry.maximumTriangles)throw Error('Box office triangle budget exceeded');
 fs.mkdirSync(outputDir,{recursive:true});const file=path.join(outputDir,'box-office.glb');await new NodeIO().write(file,doc);const bytes=fs.readFileSync(file);stats.bytes=bytes.length;stats.sha256=sha(bytes);if(stats.bytes>geometry.maximumBytes)throw Error('Box office transfer budget exceeded');
 stats.textures=Object.fromEntries(Object.entries(textures).map(([n,t])=>[n,{width:t.width,height:t.height,coverage:t.coverage,bytes:t.bytes.length,sha256:sha(t.bytes)}]));
 stats.lettering={inputSha256:lettering.inputSha256,entries:[...lettering.entries.values()],pages:lettering.manifest.pages};
 fs.rmSync(temp,{recursive:true,force:true});
 stats.sourceSha256=Object.fromEntries(SOURCES.map(f=>[f,sha(fs.readFileSync(path.join(ROOT,f)))]));
 for(const[f,before]of Object.entries(protectedBefore))if(sha(fs.readFileSync(path.join(ROOT,f)))!==before)throw Error('Protected file changed during private build: '+f);
 stats.protectedAssetsUnchangedDuringBuild=true;
 fs.writeFileSync(path.join(outputDir,'box-office.stats.json'),JSON.stringify(stats,null,2)+'\n');
 fs.writeFileSync(path.join(outputDir,'box-office.credits.json'),JSON.stringify({schemaVersion:1,source:'tools/chunk_surfer/build-box-office.mjs',license:'Project source',origin:'New project-authored fitted joinery, sliding glazing, restrained fixed grille, clerking furniture and deterministic code-native textures. No external photo pixels or meshes.',provenance:'Dimensions resolved against actual game chair, room, staff door and approved hatch aperture. Reference and unknowns remain documented in artifacts/ellery-construction-source-drive-audit/report.html. Not a surveyed historic reconstruction.',glass:'Sparse alpha-MASK surface evidence; actual room visibility is the wall aperture. No optical transparency or refraction claimed.',scope:'Existing box office only. No new key, puzzle, dialogue, encounter or global furniture change.',sourceSha256:stats.sourceSha256,pack:{file:'public/assets/box-office.glb',bytes:stats.bytes,sha256:stats.sha256},meshes:Object.keys(stats.meshes)},null,2)+'\n');
 return stats;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const at=process.argv.indexOf('--out'),s=await buildBoxOffice({outputDir:at>=0?path.resolve(process.argv[at+1]):undefined});console.log(JSON.stringify({asset:s.asset,triangles:s.totalTriangles,bytes:s.bytes,sha256:s.sha256,meshNames:Object.keys(s.meshes),glassCoverage:s.textures.glass.coverage}));}
