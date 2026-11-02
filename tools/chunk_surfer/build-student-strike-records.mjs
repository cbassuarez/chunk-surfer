// Two isolated CPU-baked recovery records. Never writes a shared pack/atlas.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {Document,NodeIO} from '@gltf-transform/core';
import {STUDENT_STRIKE_DOCUMENTS as records,STUDENT_STRIKE_RECORD_PROPS as props} from '../../src/data/student-strike-evidence.js';
import {bakeLetteringAtlases,printedSurfaceMetadata} from './lettering/physical-lettering.mjs';
import {printedFaceGeometry} from './lettering/face-geometry.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--out-dir'))throw Error('Usage: build-student-strike-records.mjs [--out-dir REPOSITORY_ROOT]');
const output=args.length?path.resolve(args[1]):root;
const assetDir=path.join(output,'public/assets/student-strike-records');
fs.mkdirSync(assetDir,{recursive:true});
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const protectedPaths=['public/assets/conservatory-props.glb','public/assets/props.glb','assets/paper/world-atlas.webp','src/generated/paper-catalog.js'];
const protectedHashes=Object.fromEntries(protectedPaths.filter(p=>fs.existsSync(path.join(root,p))).map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));
const jobs=records.map(record=>({id:record.id,lines:record.printLines,
  widthM:.21,heightM:.297,category:'record',font:'NimbusMonoPS-Regular.otf',
  process:'typed retained office paper',polarity:'dark-on-light',
  rasterWidthPx:960,rasterHeightPx:1358,capHeightM:.0036,
  palette:{ground:[.84,.82,.75],ink:[.035,.037,.032]},
  finishSupport:{kind:'carrier',edgeWear:true,contact:'handled',exposure:'interior'},
}));
const bake=await bakeLetteringAtlases(jobs,{outputDir:assetDir,pageSize:2048});
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Student strike retained recovery records');
const textureCache=new Map();
const texture=(page,role)=>{const key=`${page}:${role}`;
  if(!textureCache.has(key))textureCache.set(key,doc.createTexture(`recovery-record-${key}`)
    .setImage(bake.pages[page][role]).setMimeType('image/png'));
  return textureCache.get(key);
};
const accessor=(name,values,type,int=false)=>doc.createAccessor(name).setArray(int?new Uint32Array(values):new Float32Array(values)).setType(type).setBuffer(buffer);
const baked=[],meshStats={};
for(const record of records){
  const entry=bake.entries.get(record.id),placement=props.find(p=>p.id===record.hosted);
  if(!entry||!placement)throw Error('Missing retained record: '+record.id);
  const material=doc.createMaterial(`retained typed paper: ${record.id}`)
    .setBaseColorFactor([1,1,1,1]).setMetallicFactor(1).setRoughnessFactor(1)
    .setBaseColorTexture(texture(entry.page,'albedo')).setNormalTexture(texture(entry.page,'normal'))
    .setMetallicRoughnessTexture(texture(entry.page,'orm')).setDoubleSided(true)
    .setExtras({materialFactors:'gltf',printedSurface:printedSurfaceMetadata(entry),
      letteringFinish:{version:1,profile:entry.finish.profile,localSpecular:true}});
  // The sheet lies on a genuine floor/bench surface. +Y face; text top is -Z.
  const g=printedFaceGeometry({center:[0,.003,0],normal:[0,1,0],readerRight:[1,0,0],up:[0,0,-1],widthM:.21,heightM:.297,uvRect:entry.uvRect});
  const primitive=doc.createPrimitive().setAttribute('POSITION',accessor(record.id+'-position',g.positions,'VEC3'))
    .setAttribute('NORMAL',accessor(record.id+'-normal',g.normals,'VEC3'))
    .setAttribute('TEXCOORD_0',accessor(record.id+'-uv',g.uvs,'VEC2'))
    .setIndices(accessor(record.id+'-indices',g.indices,'SCALAR',true)).setMaterial(material);
  const mesh=doc.createMesh(placement.mesh).addPrimitive(primitive)
    .setExtras({documentId:record.id,physicalDimensionsM:[.21,.297],bodySource:'src/data/student-strike-evidence.js'});
  scene.addChild(doc.createNode(placement.mesh).setMesh(mesh));
  meshStats[placement.mesh]={triangles:g.indices.length/3,bounds:{min:[-.105,.003,-.1485],max:[.105,.003,.1485]}};
  // Reader uses the same printed face at full resolution with opaque stock;
  // pigment coverage alpha is material data, never reader transparency.
  const page=bake.pages[entry.page],metadata=await sharp(page.albedo).metadata();
  const [u0,v0,u1,v1]=entry.uvRect;
  const left=Math.round(u0*metadata.width),top=Math.round(v0*metadata.height);
  const width=Math.round((u1-u0)*metadata.width),height=Math.round((v1-v0)*metadata.height);
  const file=record.id+'.webp';
  await sharp(page.albedo).extract({left,top,width,height}).removeAlpha().webp({lossless:true}).toFile(path.join(assetDir,file));
  baked.push({id:record.id,format:'A4',issuer:'ellery-internal',template:'retained-recovery-record',
    handlingVector:[-1,0,0,0],semanticHash:sha(JSON.stringify(record.printLines)),
    pages:[{path:'assets/student-strike-records/'+file,atlasIndex:-1,materialPath:null}]});
}
const bytes=Buffer.from(await new NodeIO().writeBinary(doc));
fs.writeFileSync(path.join(output,'public/assets/student-strike-records.glb'),bytes);
const sources=['src/data/student-strike-evidence.js','tools/chunk_surfer/build-student-strike-records.mjs','tools/chunk_surfer/lettering/physical-lettering.mjs','tools/chunk_surfer/lettering/rasterize.py'];
const stats={pack:'student-strike-records.glb',bytes:bytes.length,sha256:sha(bytes),meshes:meshStats,
  readerRecords:baked,sourceHashes:Object.fromEntries(sources.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))])),
  letteringManifest:'assets/student-strike-records/atlas-manifest.json',protectedAssets:protectedHashes,
  validation:'CPU asset/data validation only; native placement and legibility pending'};
for(const[p,hash]of Object.entries(protectedHashes))if(sha(fs.readFileSync(path.join(root,p)))!==hash)throw Error('Shared asset changed: '+p);
stats.protectedAssetsUnchanged=true;
fs.writeFileSync(path.join(output,'public/assets/student-strike-records.stats.json'),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(path.join(output,'public/assets/student-strike-records.credits.json'),JSON.stringify({
  pack:stats.pack,sha256:stats.sha256,geometry:'Original two project-native A4 retained records',
  text:'Original Chunk Surfer fiction; no external institutional records',
  lettering:{pipeline:'Existing pinned physical lettering pipeline',font:'NimbusMonoPS-Regular.otf',
    manifest:'assets/fonts/manifest.json',licence:'URW AGPL-3.0 with upstream document exception; vendored licence retained'},
  sources,limitations:stats.validation},null,2)+'\n');
const generated=path.join(output,'src/generated/student-strike-records.js');fs.mkdirSync(path.dirname(generated),{recursive:true});
fs.writeFileSync(generated,'// Generated by the isolated student-strike records builder.\nexport const STUDENT_STRIKE_BAKED_RECORDS=Object.freeze('+JSON.stringify(baked,null,2)+');\n');
console.log(JSON.stringify({pack:stats.pack,bytes:stats.bytes,meshes:Object.keys(meshStats),readerRecords:baked.length,protectedAssetsUnchanged:true}));
