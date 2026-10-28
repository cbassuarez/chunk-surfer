// Standalone court pack. Canonical data owns placement/navigation; this file
// only writes its dedicated GLB and receipts. All texture pixels are authored
// here, never taken from the four user-provided photographic references.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import os from 'node:os';
import {bakeLetteringAtlases,printedSurfaceMetadata} from './lettering/physical-lettering.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {GLASS_COURT} from '../../src/data/glass-court.js';
import {buildGlassCourtGeometry} from './glass-court-geometry.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.readFileSync(path.join(ROOT,file));
const SOURCES=['tools/chunk_surfer/build-glass-court.mjs','tools/chunk_surfer/glass-court-geometry.mjs','src/data/glass-court.js','tools/chunk_surfer/lettering/physical-lettering.mjs','tools/chunk_surfer/lettering/rasterize.py','tools/chunk_surfer/lettering/finish.py','tools/chunk_surfer/lettering/finish-profiles.mjs','tools/chunk_surfer/lettering/fonts/NimbusSansNarrow-Bold.otf'];
const PROTECTED=['public/assets/conservatory-props.glb','public/assets/conservatory-landing-fittings.glb'];
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
function png(width,height,pixel){
  const raw=Buffer.alloc((width*4+1)*height);let covered=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const rgba=pixel(x,y,width,height);raw.set(rgba,y*(width*4+1)+1+x*4);if(rgba[3]>=128)covered++;
  }
  const chunk=(type,payload)=>{const tag=Buffer.from(type),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(payload.length);sum.writeUInt32BE(crc(Buffer.concat([tag,payload])));return Buffer.concat([length,tag,payload,sum]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return {bytes:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]),width,height,coverage:covered/(width*height)};
}
const hash=(x,y)=>{let n=Math.imul(x+113,374761393)^Math.imul(y+71,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
export function glassCourtTextures(){
  const glass=png(128,256,(x,y,w,h)=>{
    const u=x/(w-1),v=y/(h-1),edge=x<1||x>w-2||y<1||y>h-2;
    const streak=(Math.abs(u-(.19+.018*Math.sin(v*8)))<.0065&&v>.08&&v<.82)
      ||(Math.abs(u-(.73+.014*Math.sin(v*11)))<.008&&v>.29&&v<.96);
    const smear=((u-.12)**2/.018+(v-.78)**2/.008<1||(u-.86)**2/.013+(v-.18)**2/.010<1)&&hash(x,y)>.70;
    const hit=edge||streak||smear;
    return hit?[173,191,172,255]:[0,0,0,0];
  });
  const brick=png(256,128,(x,y)=>{
    const row=Math.floor(y/64),shift=row%2?64:0,xx=(x+shift)%128,yy=y%64;
    if(xx<3||yy<4)return [139,132,115,255];
    const block=Math.floor((x+shift)/128),variation=Math.floor(hash(block,row)*13);
    const edge=xx<6||yy<7?7:0;
    return [91+variation-edge,48+variation*.6-edge*.5,30+variation*.4-edge*.3,255].map(Math.round);
  });
  const terrazzo=png(128,128,(x,y)=>{
    const grain=hash(Math.floor(x/2),Math.floor(y/2));
    if(grain>.974)return [105,112,103,255];
    if(grain<.025)return [219,214,191,255];
    return [182,180,164,255];
  });
  return {glass,brick,terrazzo};
}

export async function buildGlassCourt({outputDir=path.join(ROOT,'public/assets')}={}){
  const protectedBefore=Object.fromEntries(PROTECTED.map(file=>[file,sha(read(file))]));
  const geometry=buildGlassCourtGeometry(GLASS_COURT),doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Indoor greenhouse and changing vestibule');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'chunk-glasshouse-lettering-'));
  const signBake=await bakeLetteringAtlases(GLASS_COURT.signs.map(s=>({id:s.id,lines:s.copy.split(' / '),widthM:s.width,heightM:s.height,category:'institution',process:'vitreous-enamel screen print',palette:{ground:[.70,.70,.60],ink:[.015,.025,.028]},rasterWidthPx:384,rasterHeightPx:192,capHeightM:.065})),{outputDir:temp,pageSize:1024});
  const textures=glassCourtTextures();
  for(const[n,s]of GLASS_COURT.signs.entries()){const entry=signBake.entries.get(s.id),page=signBake.pages[entry.page];textures['sign'+n]={bytes:page.albedo,width:page.width,height:page.height,coverage:entry.metrics.coverage};}
  const gpuTextures=new Map(Object.entries(textures).map(([name,t])=>[name,
    doc.createTexture('court '+name).setMimeType('image/png').setImage(t.bytes)]));
  const materials=geometry.materials.map(spec=>{
    const material=doc.createMaterial(spec.name).setBaseColorFactor([...spec.color,1]).setRoughnessFactor(spec.roughness).setMetallicFactor(spec.metallic).setDoubleSided(false);
    if(spec.emissive)material.setEmissiveFactor(spec.emissive);
    if(spec.texture){material.setBaseColorTexture(gpuTextures.get(spec.texture));const info=material.getBaseColorTextureInfo();info.setWrapS(10497).setWrapT(10497).setMagFilter(9729).setMinFilter(9987);}
    if(spec.texture?.startsWith('sign')){const sign=GLASS_COURT.signs[Number(spec.texture.slice(4))],entry=signBake.entries.get(sign.id),page=signBake.pages[entry.page];material.setExtras({printedSurface:printedSurfaceMetadata(page)});}
    if(spec.alphaMode)material.setAlphaMode(spec.alphaMode).setAlphaCutoff(spec.alphaCutoff);
    return material;
  });
  const accessor=(type,array)=>doc.createAccessor().setBuffer(buffer).setType(type).setArray(array);
  const stats={schemaVersion:1,asset:GLASS_COURT.pack,canonicalCourt:JSON.parse(JSON.stringify(GLASS_COURT)),
    ...geometry.report,sourceSha256:{},protectedAssetSha256:protectedBefore,meshes:{},totalTriangles:0,
    textures:Object.fromEntries(Object.entries(textures).map(([name,t])=>[name,{width:t.width,height:t.height,bytes:t.bytes.length,sha256:sha(t.bytes),coverage:t.coverage}]))};
  for(const[name,data]of geometry.meshes){
    const mesh=doc.createMesh(name).setExtras({localOrigin:[0,0,0],courtId:GLASS_COURT.id,
      floorDatum:0,canonicalBounds:GLASS_COURT.bounds,ordinaryPhysicalSpace:true,instanceOrigin:name===GLASS_COURT.entranceFixtures.mesh?GLASS_COURT.entranceFixtures.origin:GLASS_COURT.origin});
    scene.addChild(doc.createNode(name).setMesh(mesh));
    for(const[index,g]of data.groups){
      const maxIndex=Math.max(...g.indices),IndexArray=maxIndex<65536?Uint16Array:Uint32Array;
      mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',accessor('VEC3',Float32Array.from(g.positions)))
        .setAttribute('NORMAL',accessor('VEC3',Float32Array.from(g.normals)))
        .setAttribute('TEXCOORD_0',accessor('VEC2',Float32Array.from(g.uvs.map((v,i)=>{const spec=geometry.materials[index];if(!spec.texture?.startsWith('sign'))return v;const entry=signBake.entries.get(GLASS_COURT.signs[Number(spec.texture.slice(4))].id),r=entry.uvRect;return i%2?r[1]+(r[3]-r[1])*v:r[0]+(r[2]-r[0])*v;}))))
        .setIndices(accessor('SCALAR',IndexArray.from(g.indices))).setMaterial(materials[index]));
    }
    stats.meshes[name]={bounds:data.bounds,triangles:data.triangles,parts:data.parts};stats.totalTriangles+=data.triangles;
  }
  if(stats.totalTriangles>geometry.report.maximumTriangles)throw Error('Glass court exceeds its triangle budget.');
  fs.mkdirSync(outputDir,{recursive:true});
  const out=path.join(outputDir,'glass-court.glb');await new NodeIO().write(out,doc);
  const bytes=fs.readFileSync(out);stats.bytes=bytes.length;stats.sha256=sha(bytes);
  if(bytes.length>geometry.report.maximumBytes)throw Error('Glass court exceeds its transfer budget.');
  stats.lettering={inputSha256:signBake.inputSha256,entries:[...signBake.entries.values()],pages:signBake.manifest.pages};
  fs.rmSync(temp,{recursive:true,force:true});
  stats.sourceSha256=Object.fromEntries(SOURCES.map(file=>[file,sha(read(file))]));
  for(const[file,before]of Object.entries(protectedBefore))if(sha(read(file))!==before)throw Error('Protected asset changed: '+file);
  stats.protectedAssetsUnchangedDuringBuild=true;
  fs.writeFileSync(path.join(outputDir,'glass-court.stats.json'),JSON.stringify(stats,null,2)+'\n');
  fs.writeFileSync(path.join(outputDir,'glass-court.credits.json'),JSON.stringify({schemaVersion:1,
    source:'tools/chunk_surfer/build-glass-court.mjs',license:'Project source',
    origin:'Project-authored closed geometry, deterministic broadleaf/fern/vine forms and embedded code-native textures.',
    research:'artifacts/greenhouse-study/README.md; four user references inspected for tall glazed bays, fluorescent fixtures, pots and plant density. No photographic pixels, logos, lettering or watermarks copied.',
    glass:'Sparse alpha-MASK surface evidence in the existing opaque/MASK renderer. No BLEND, refraction, translucent tint or renderer modification claimed.',
    scope:'Existing dry north pool approach, indoor greenhouse and changing vestibule. Rehosts the original admission fittings without changing their instance. No new exterior connection, actors, triggers, rewards or mechanics.',
    sourceSha256:stats.sourceSha256,pack:{file:'public/assets/glass-court.glb',bytes:stats.bytes,sha256:stats.sha256},
    meshes:Object.entries(stats.meshes).map(([name,m])=>({name,triangles:m.triangles,bounds:m.bounds})),
  },null,2)+'\n');
  return stats;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const at=process.argv.indexOf('--out'),outputDir=at>=0?path.resolve(process.argv[at+1]):undefined;
  const stats=await buildGlassCourt({outputDir});
  console.log(JSON.stringify({asset:stats.asset,triangles:stats.totalTriangles,bytes:stats.bytes,sha256:stats.sha256,
    meshNames:Object.keys(stats.meshes),glassCoverage:stats.textures.glass.coverage}));
}
