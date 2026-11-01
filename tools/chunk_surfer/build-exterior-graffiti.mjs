// Reproducible separate overlay pack: original artist-painted PNGs are alpha
// masked over actual existing outdoor surfaces, never a new wall or texture
// panel that occludes the masonry. UVs preserve source image proportions.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {printedFaceGeometry} from './lettering/face-geometry.mjs';
import {EXTERIOR_GRAFFITI_HOSTS} from '../../src/data/exterior-graffiti.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=path.join(root,'assets/source-graffiti/unikumpu');
const narrative=path.join(root,'assets/source-graffiti/easter-eggs');
const output=process.env.EXTERIOR_GRAFFITI_OUT||path.join(root,'public/assets');
fs.mkdirSync(output,{recursive:true});
const licenseDir=path.join(output,'exterior-graffiti-licenses');fs.mkdirSync(licenseDir,{recursive:true});
fs.copyFileSync(path.join(root,'assets/source-graffiti/tagger/OFL.txt'),path.join(licenseDir,'Tagger-OFL.txt'));
fs.copyFileSync(path.join(root,'assets/source-graffiti/permanent-marker/LICENSE.txt'),path.join(licenseDir,'Permanent-Marker-Apache-2.0.txt'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json')));
const narrativeManifest=JSON.parse(fs.readFileSync(path.join(narrative,'manifest.json')));
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Graffiti on existing street surfaces');
const materials=new Map(),sourceFiles=[];
function image(art){
 if(materials.has(art))return materials.get(art);
 const isNarrative=art==='ELLERY'||art==='SURFER';
 const filename=isNarrative?(art==='ELLERY'?'ellery-listening.png':'surfer-hear-you.png'):`Decal_Graffiti_${art}.png`;
 const filepath=path.join(isNarrative?narrative:source,filename),bytes=fs.readFileSync(filepath);
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`Not a PNG: ${filename}`);
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 const entry=isNarrative?narrativeManifest.outputs.find(f=>f.file===filename):manifest.files.find(f=>f.filename===filename);
 if(!entry||sha(bytes)!==entry.sha256)throw Error(`Source image integrity: ${filename}`);
 const texture=doc.createTexture(filename).setImage(bytes).setMimeType('image/png');
 const tint=art==='ELLERY'?[.83,.80,.69,1]:art==='SURFER'?[.80,.37,.23,1]:[1,1,1,1];
 const material=doc.createMaterial(`Graffiti ${art}`).setBaseColorFactor(tint)
  .setBaseColorTexture(texture).setAlphaMode('MASK').setAlphaCutoff(.24).setMetallicFactor(0).setRoughnessFactor(.96);
 const record={material,width,height,filename,sha256:sha(bytes),artist:isNarrative?`Chunk Surfer / ${entry.font}`:'unikumpu'};
 materials.set(art,record);sourceFiles.push({art,filename,sha256:record.sha256,artist:record.artist,
  ...(isNarrative?{font:entry.font,text:entry.text}:{source:entry.source})});return record;
}
const accessor=(name,array,type,integer=false)=>doc.createAccessor(name).setArray(integer?new Uint32Array(array):new Float32Array(array)).setType(type).setBuffer(buffer);
const stats={pack:'exterior-graffiti.glb',generator:'tools/chunk_surfer/build-exterior-graffiti.mjs',meshes:{},marks:{},sources:sourceFiles,pending:['native final-dither inspection']};
for(const host of EXTERIOR_GRAFFITI_HOSTS){
 const mesh=doc.createMesh(host.mesh),groups=new Map(),markStats=[];
 for(const mark of host.marks){
  const asset=image(mark.art),maxHeight=mark.y1-mark.y0,aspect=asset.width/asset.height;
  const width=Math.min(mark.width,maxHeight*aspect),height=width/aspect;
  const mid=(mark.y0+mark.y1)/2,bottom=mid-height/2,top=mid+height/2;
  const normal=host.kind==='court'?-mark.side:1;
  const plane=host.kind==='court'?mark.side*4.45+normal*.008:mark.surface==='shutter'?.017:.008;
  const group=groups.get(mark.art)||{positions:[],normals:[],uvs:[],indices:[],material:asset.material};groups.set(mark.art,group);
  let slices=[];
  if(mark.surface==='shutter'){
   // Preserve each of the twelve real leaves and the visible intervening gap.
   for(let i=0;i<12;i++){
    const lo=.25+i*.282-.129,hi=.25+i*.282+.129;
    const a=Math.max(bottom,lo),b=Math.min(top,hi);if(b>a+1e-6)slices.push([a,b]);
   }
  }else slices=[[bottom,top]];
  for(const [a,b] of slices){
   const face=printedFaceGeometry({center:[plane,(a+b)/2,mark.z],readerRight:[0,0,-normal],up:[0,1,0],
    widthM:width,heightM:b-a,uvRect:[0,(top-b)/height,1,(top-a)/height]});
   const offset=group.positions.length/3;group.positions.push(...face.positions);group.normals.push(...face.normals);
   group.uvs.push(...face.uvs);group.indices.push(...face.indices.map(i=>i+offset));
  }
  markStats.push({...mark,width,height,bottom,top,plane,normal,slices:slices.length,
   z0:mark.z-width/2,z1:mark.z+width/2,source:asset.filename});
 }
 let triangles=0;
 for(const g of groups.values()){
  triangles+=g.indices.length/3;
  mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',accessor(host.mesh+' position',g.positions,'VEC3'))
   .setAttribute('NORMAL',accessor(host.mesh+' normal',g.normals,'VEC3'))
   .setAttribute('TEXCOORD_0',accessor(host.mesh+' uv',g.uvs,'VEC2'))
   .setIndices(accessor(host.mesh+' indices',g.indices,'SCALAR',true)).setMaterial(g.material));
 }
 scene.addChild(doc.createNode(host.mesh).setMesh(mesh));
 stats.meshes[host.mesh]={triangles,host:host.host,kind:host.kind};stats.marks[host.id]=markStats;
}
const bytes=Buffer.from(await new NodeIO().writeBinary(doc));stats.bytes=bytes.length;stats.sha256=sha(bytes);
fs.writeFileSync(path.join(output,stats.pack),bytes);
fs.writeFileSync(path.join(output,'exterior-graffiti.stats.json'),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(path.join(output,'exterior-graffiti.credits.json'),JSON.stringify({
 pack:{sha256:stats.sha256,bytes:stats.bytes},
 images:{artist:'unikumpu',license:'CC0 1.0',license_url:manifest.license_url,creator_statement:manifest.creator_statement,
  provenance:'assets/source-graffiti/unikumpu/manifest.json',files:sourceFiles.filter(s=>s.artist==='unikumpu')},
 narrative:{artist:'Chunk Surfer',fonts:narrativeManifest.fonts,
  licenseFiles:['assets/exterior-graffiti-licenses/Tagger-OFL.txt','assets/exterior-graffiti-licenses/Permanent-Marker-Apache-2.0.txt'],
  provenance:'assets/source-graffiti/easter-eggs/manifest.json',files:sourceFiles.filter(s=>s.artist!=='unikumpu')},
 treatment:'Source artwork in the game; not represented as UK-created. Transparent regions leave the existing surface visible.',
},null,2)+'\n');
console.log(JSON.stringify({bytes:stats.bytes,sha256:stats.sha256,meshes:stats.meshes}));
