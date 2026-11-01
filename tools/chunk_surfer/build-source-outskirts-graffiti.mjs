// Original CC0 digital graffiti as masked ink on existing Source supports.
// Meshes are host-local, require no changes to collision, and use existing
// world lighting and the final dither pass.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=path.join(root,'assets/source-graffiti/unikumpu');
const output=process.env.SOURCE_GRAFFITI_OUT_DIR||path.join(root,'public/assets');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(output,{recursive:true});
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Artist-created Source street graffiti');
const materials=new Map(),provenance=[];
function paint(filename){
  if(materials.has(filename))return materials.get(filename);
  const entry=manifest.files.find(item=>item.filename===filename);
  if(!entry||manifest.license!=='CC0 1.0')throw Error(`Missing documented original: ${filename}`);
  const bytes=fs.readFileSync(path.join(source,filename));
  if(sha(bytes)!==entry.sha256)throw Error(`Source image hash mismatch: ${filename}`);
  const texture=doc.createTexture(filename).setImage(bytes).setMimeType('image/png');
  const mat=doc.createMaterial(`original graffiti ${filename}`).setBaseColorFactor([1,1,1,1])
    .setMetallicFactor(0).setRoughnessFactor(.92).setDoubleSided(true)
    .setAlphaMode('MASK').setAlphaCutoff(.15).setBaseColorTexture(texture)
    .setExtras({materialFactors:'gltf',creator:manifest.creator,license:manifest.license,source:entry.source,sha256:entry.sha256});
  materials.set(filename,mat);provenance.push({file:filename,sha256:entry.sha256,source:entry.source});return mat;
}
function accessor(data,type){return doc.createAccessor().setBuffer(buffer).setType(type).setArray(data);}
function makeMesh(name,faces){
  const mesh=doc.createMesh(name);
  for(const face of faces){
    const {x,centreZ,centreY,width,height,file}=face,side=Math.sign(x),left=centreZ+side*width/2,right=centreZ-side*width/2;
    // Facing either flank, u=0 is the reader's left and v=0 the top. This
    // ensures the art stays legible rather than mirrored on the opposite side.
    const positions=new Float32Array([x,centreY+height/2,left,x,centreY+height/2,right,x,centreY-height/2,right,x,centreY-height/2,left]);
    const normals=new Float32Array(Array.from({length:4},()=>[side,0,0]).flat());
    const uv=new Float32Array([0,0,1,0,1,1,0,1]);
    const indices=new Uint16Array([0,2,1,0,3,2]);
    mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',accessor(positions,'VEC3'))
      .setAttribute('NORMAL',accessor(normals,'VEC3')).setAttribute('TEXCOORD_0',accessor(uv,'VEC2'))
      .setIndices(accessor(indices,'SCALAR')).setMaterial(paint(file)));
  }
  scene.addChild(doc.createNode(name).setMesh(mesh));
}
// The wall is .32m thick with piers at z ±1m; its cap starts at y=1.325.
makeMesh('source_outskirts_wall_graffiti',[
  {x:.167,centreZ:0,centreY:.81,width:1.32,height:.88,file:'Decal_Graffiti_valha.png'},
]);
// Both buses share these low, solid side panels. These areas are between the
// wheel arches and between the horizontal trims, outside both door apertures.
makeMesh('source_outskirts_bus_graffiti',[
  {x:-1.257,centreZ:0,centreY:1.08,width:1.08,height:.72,file:'Decal_Graffiti_dephy.png'},
  {x:1.257,centreZ:0,centreY:1.08,width:1.08,height:.72,file:'Decal_Graffiti_RANDOM.png'},
]);
const bytes=Buffer.from(await new NodeIO().writeBinary(doc));
const glb=path.join(output,'source-outskirts-graffiti.glb');fs.writeFileSync(glb,bytes);
fs.writeFileSync(glb.replace('.glb','.credits.json'),JSON.stringify({
  pack:path.basename(glb),sha256:sha(bytes),creator:manifest.creator,license:manifest.license,
  licenseUrl:manifest.license_url,creatorStatement:manifest.creator_statement,
  sourceManifest:'assets/source-graffiti/unikumpu/manifest.json',images:provenance,
  adaptation:'Original PNG bytes embedded; authored placements, scale, and renderer MASK cutoff.',
  ukOriginClaimed:false,nativeDitherAcceptance:'pending',
},null,2)+'\n');
console.log(`source-outskirts-graffiti.glb: ${bytes.length} bytes`);
