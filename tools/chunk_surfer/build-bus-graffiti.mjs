// Original, publicly released Unikumpu paint on the existing moving Ellery bus.
// Separate, bus-local masked print faces carry the actual source image bytes;
// no shared bus mesh, collision, lights, glazing or route signs are modified.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {printedFaceGeometry} from './lettering/face-geometry.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sourceDir=path.join(root,'assets/source-graffiti/unikumpu');
const sourceManifest=JSON.parse(fs.readFileSync(path.join(sourceDir,'manifest.json'),'utf8'));
const output=process.env.BUS_GRAFFITI_OUT_DIR||path.join(root,'public/assets');
fs.mkdirSync(output,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Paint on Ellery traffic bus');
const mesh=doc.createMesh('ambient_bus_graffiti');
// The source image frames are 900x600; crop transparent margins with UVs,
// preserving the authored artwork and its proportions without re-encoding it.
const tags=[
  {id:'ASP',file:'Decal_Graffiti_ASP.png',side:1,z:-.75,y:1.08,width:.78,height:.56,uv:[105/900,40/600,851/900,580/600]},
  {id:'CAS',file:'Decal_Graffiti_CAS.png',side:1,z:.28,y:1.08,width:.22,height:.61,uv:[356/900,19/600,554/900,547/600]},
  {id:'Johnny2',file:'Decal_Graffiti_Johnny2.png',side:-1,z:.02,y:1.08,width:.99,height:.56,uv:[30/900,104/600,861/900,581/600]},
];
const add=(name,values,type,integer=false)=>doc.createAccessor(name).setBuffer(buffer).setType(type)
  .setArray(integer?new Uint32Array(values):new Float32Array(values));
const sources=[];
for(const tag of tags){
  const original=fs.readFileSync(path.join(sourceDir,tag.file));
  const record=sourceManifest.files.find(item=>item.filename===tag.file);
  if(!record||sha(original)!==record.sha256)throw Error(`Original source hash mismatch: ${tag.file}`);
  const texture=doc.createTexture('Unikumpu '+tag.id).setImage(original).setMimeType('image/png');
  const material=doc.createMaterial('Unikumpu '+tag.id+' worn matte spray')
    .setBaseColorFactor([1,1,1,.84]).setBaseColorTexture(texture)
    .setAlphaMode('MASK').setAlphaCutoff(.32).setMetallicFactor(0).setRoughnessFactor(.95)
    .setDoubleSided(true).setExtras({materialFactors:'gltf',originalArtist:'unikumpu',sourceHash:record.sha256});
  // A positive-X viewer reads toward -Z; on the other flank reader-right is
  // +Z. This preserves the actual artist's lettering rather than mirroring it.
  const face=printedFaceGeometry({center:[tag.side*1.231,tag.y,tag.z],readerRight:[0,0,-tag.side],
    up:[0,1,0],widthM:tag.width,heightM:tag.height,uvRect:tag.uv});
  mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',add(tag.id+' position',face.positions,'VEC3'))
    .setAttribute('NORMAL',add(tag.id+' normal',face.normals,'VEC3'))
    .setAttribute('TEXCOORD_0',add(tag.id+' uv',face.uvs,'VEC2'))
    .setIndices(add(tag.id+' indices',face.indices,'SCALAR',true)).setMaterial(material));
  sources.push({...tag,source:record.source,sha256:record.sha256});
}
mesh.setExtras({purpose:'artist-original masked paint on lower side panels of ambient_late_bus',busLocal:true,
  bounds:{min:[-1.45,0,-4.8],max:[1.45,3.1,4.8]},avoids:['windows','destination board','windscreen','lamps','wheels'],sources});
scene.addChild(doc.createNode('ambient_bus_graffiti').setMesh(mesh));doc.getRoot().setDefaultScene(scene);
const bytes=Buffer.from(await new NodeIO().writeBinary(doc));
const stats={version:2,sha256:sha(bytes),bytes:bytes.length,mesh:'ambient_bus_graffiti',triangles:tags.length*2,
  creator:sourceManifest.creator,license:sourceManifest.license,licenseUrl:sourceManifest.license_url,
  creatorStatement:sourceManifest.creator_statement,sourceManifest:'assets/source-graffiti/unikumpu/manifest.json',
  adaptation:'Original image bytes and colours embedded; UVs trim transparent margins; alpha cutoff softens paint coverage.',
  tags:sources,pending:['native final-dither readability and moving-bus inspection']};
fs.writeFileSync(path.join(output,'bus-graffiti.glb'),bytes);
fs.writeFileSync(path.join(output,'bus-graffiti.stats.json'),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(path.join(output,'bus-graffiti.credits.json'),JSON.stringify({pack:'bus-graffiti.glb',
  creator:sourceManifest.creator,license:sourceManifest.license,licenseUrl:sourceManifest.license_url,
  creatorStatement:sourceManifest.creator_statement,sourceManifest:stats.sourceManifest,adaptation:stats.adaptation,
  sources:sources.map(({file,source,sha256})=>({file,source,sha256})),sha256:stats.sha256},null,2)+'\n');
console.log(JSON.stringify({bytes:bytes.length,sha256:stats.sha256,tags:tags.map(t=>t.id)},null,2));
