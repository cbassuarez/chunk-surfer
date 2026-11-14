import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Document,NodeIO} from '@gltf-transform/core';
import {copyToDocument,prune} from '@gltf-transform/functions';
import {subtractTriangleBox} from './exterior-stationers-geometry.mjs';
import {parseGlb} from './rebuild-tree-crowns.mjs';
import {extractExteriorCollision} from './build-exterior-collision.mjs';
import {buildApproachEdges} from './ellery-garden-approaches-geometry.mjs';
import {ELLERY_APPROACH_AIR,ELLERY_GARDEN_APPROACHES as C} from '../../src/data/ellery-garden-approaches.js';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const SOURCE_PACKS=['public/assets/conservatory-props.glb','public/assets/ellery-public-front.glb'];
// Coordinates are local to the delivered scenic elevation. Retain the chapel's
// nave and the fly tower's roof, and reduce only the silhouettes above them.
const skyline=[
 {id:'chapel-belfry',x:[51.29,58.71],z:[63.09,70.51],heights:[[13.95,13.95],[23.5,16.9],[27.7,19.5]]},
 {id:'fly-tower-tank',x:[14.85,18.15],z:[30.44,36.23],heights:[[17.6,17.6],[21.99,18.95]]},
];
function lowerSkyline(triangle,receipts){
 const top=Math.max(...triangle.map(vertex=>vertex.position[1]));
 const part=skyline.find(({x,z,heights})=>top>heights[0][0]+1e-4&&triangle.every(({position:[vx,,vz]})=>
  vx>=x[0]&&vx<=x[1]&&vz>=z[0]&&vz<=z[1]));
 if(!part)return triangle;
 const segments=part.heights.slice(1).map(([oldTop,newTop],index)=>{
  const [oldBase,newBase]=part.heights[index];
  return {oldTop,oldBase,newBase,scale:(newTop-newBase)/(oldTop-oldBase)};
 });
 const base=Math.min(...triangle.map(vertex=>vertex.position[1]));
 const segmentFor=height=>segments.findLast(({oldBase})=>height>=oldBase-1e-4);
 // A tower's vertical face may span its sill. A sloped face must stay in a
 // single height segment so the inverse-transpose produces its correct normal.
 const planeSegment=segmentFor(base);
 if(planeSegment!==segmentFor(top)&&triangle.some(({normal})=>Math.abs(normal[1])>1e-4))
  throw Error(`Sloped face crosses a height break on ${part.id}`);
 const result=triangle.map(({position,normal,uv})=>{
  const [x,y,z]=position,segment=segmentFor(y);
  return {position:[x,segment?segment.newBase+(y-segment.oldBase)*segment.scale:y,z],
   normal:[normal[0],normal[1]/(planeSegment?.scale??1),normal[2]],uv};
 });
 const receipt=receipts[part.id];
 receipt.triangles++;
 receipt.sourceTop=Math.max(receipt.sourceTop,top);
 receipt.top=Math.max(receipt.top,...result.map(vertex=>vertex.position[1]));
 return result;
}
const specs=[
 {source:SOURCE_PACKS[1],from:'conservatory_west_elevation',to:'ellery_garden_elevation',anchor:{x:50,z:7.5},clips:ELLERY_APPROACH_AIR,lowerSkyline:true},
 {source:SOURCE_PACKS[0],from:'scene_dock_room_fabric',to:'ellery_garden_dock',anchor:{x:53,z:7.5},clips:[{min:[71,-3,3],max:[1000,9.45,18]}],relocateLedge:true},
 {source:SOURCE_PACKS[0],from:'getin_sightline_shell',to:'ellery_garden_getin_sightline',anchor:{x:53,z:7.5},clips:[ELLERY_APPROACH_AIR[0]]},
 {source:SOURCE_PACKS[0],from:'hall_structure',to:'ellery_garden_hall',anchor:{x:113,z:23},clips:[{min:[98,-3,0],max:[101,9.45,15]}]},
 {source:SOURCE_PACKS[0],from:'natatorium_roof_structure',to:'ellery_baths_roof',anchor:{x:83,z:38.5},clips:[]},
];
export async function buildElleryGardenApproaches({outputDir=path.join(ROOT,'public/assets'),collisionFile=path.join(ROOT,'src/data/generated/ellery-garden-collision.js')}={}){
 const io=new NodeIO(),doc=new Document(),buffer=doc.createBuffer('garden variants'),scene=doc.createScene('Actual Ellery separated wings and detached baths');
 const bytes=new Map(SOURCE_PACKS.map(f=>[f,fs.readFileSync(path.join(ROOT,f))])),sources=new Map();
 const add=(name,array,type,index=false)=>doc.createAccessor(name).setBuffer(buffer).setType(type).setArray(index?Uint32Array.from(array):Float32Array.from(array));
 const stats={schemaVersion:1,asset:C.pack,sourcePacks:Object.fromEntries([...bytes].map(([f,b])=>[f,{sha256:sha(b),bytes:b.length}])),meshes:{},totalTriangles:0,addedTriangles:0,budgets:{maximumBytes:12*1024*1024,maximumAddedTriangles:6500}};
 for(const spec of specs){
  if(!sources.has(spec.source))sources.set(spec.source,await io.readBinary(bytes.get(spec.source)));
  const source=sources.get(spec.source),original=source.getRoot().listMeshes().find(m=>m.getName()===spec.from);if(!original)throw Error('Missing actual delivered mesh '+spec.from);
  const mesh=copyToDocument(doc,source,[original]).get(original);mesh.setName(spec.to);scene.addChild(doc.createNode(spec.to).setMesh(mesh));
  const localClips=spec.clips.map(b=>({min:[b.min[0]-spec.anchor.x,b.min[1],b.min[2]-spec.anchor.z],max:[b.max[0]-spec.anchor.x,b.max[1],b.max[2]-spec.anchor.z]}));
  const receipt={sourcePack:spec.source,sourceMesh:spec.from,anchor:spec.anchor,worldClips:spec.clips,inputTriangles:0,outputTriangles:0,modifiedInputTriangles:0,removedInputTriangles:0,relocatedLedgeTriangles:0};
  if(spec.lowerSkyline)receipt.skyline=Object.fromEntries(skyline.map(({id})=>[id,{triangles:0,sourceTop:0,top:0}]));
  for(const p of mesh.listPrimitives()){
   const position=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),uv=p.getAttribute('TEXCOORD_0'),indices=p.getIndices()?.getArray()||Uint32Array.from({length:position.getCount()},(_,i)=>i),positions=[],normals=[],uvs=[],kept=[];
   receipt.inputTriangles+=indices.length/3;
   for(let i=0;i<indices.length;i+=3){
    let triangle=Array.from(indices.slice(i,i+3),k=>({position:position.getElement(k,[]),normal:normal?normal.getElement(k,[]):[0,1,0],uv:uv?uv.getElement(k,[]):[0,0]}));
    if(spec.relocateLedge&&triangle.every(v=>{const[x,y,z]=v.position;return x+spec.anchor.x>=69.69&&x+spec.anchor.x<=71.91&&y>=-.001&&y<=.831&&z+spec.anchor.z>=3.93&&z+spec.anchor.z<=4.58;})){
     triangle=triangle.map(v=>({...v,position:[v.position[0]-2,v.position[1],v.position[2]]}));receipt.relocatedLedgeTriangles++;
    }
    const skylineTriangle=receipt.skyline?lowerSkyline(triangle,receipt.skyline):triangle;
    let pieces=[skylineTriangle],changed=skylineTriangle!==triangle;for(const clip of localClips){const next=[];for(const tri of pieces){const result=subtractTriangleBox(tri,clip);changed ||=result.changed;next.push(...result.triangles);}pieces=next;}
    if(changed)receipt.modifiedInputTriangles++;if(!pieces.length)receipt.removedInputTriangles++;
    for(const tri of pieces){const start=positions.length/3;for(const v of tri){positions.push(...v.position);const len=Math.hypot(...v.normal)||1;normals.push(...v.normal.map(n=>n/len));uvs.push(...v.uv);}kept.push(start,start+1,start+2);}
   }
   receipt.outputTriangles+=kept.length/3;
   if(!kept.length){mesh.removePrimitive(p);p.dispose();continue;}
   p.setAttribute('POSITION',add(spec.to+' position',positions,'VEC3')).setAttribute('NORMAL',add(spec.to+' normal',normals,'VEC3')).setAttribute('TEXCOORD_0',add(spec.to+' uv',uvs,'VEC2')).setIndices(add(spec.to+' index',kept,'SCALAR',true));
  }
  if(spec.relocateLedge&&receipt.relocatedLedgeTriangles!==72)throw Error('Expected exact 72-triangle maintenance ledge, got '+receipt.relocatedLedgeTriangles);
  if(receipt.skyline)for(const {id,heights} of skyline){
   const [sourceTop,top]=heights.at(-1),part=receipt.skyline[id];
   if(!part.triangles||Math.abs(part.sourceTop-sourceTop)>1e-4||Math.abs(part.top-top)>1e-4)
    throw Error(`Unexpected ${id} skyline geometry: ${JSON.stringify(part)}`);
  }
  mesh.setExtras({...mesh.getExtras(),privateActualElleryVariant:true,anchor:spec.anchor,constructionReceipt:receipt});stats.meshes[spec.to]=receipt;
 }
 const edges=buildApproachEdges(),materials=edges.materials.map(s=>doc.createMaterial(s.name).setBaseColorFactor([...s.color,1]).setRoughnessFactor(s.roughness).setMetallicFactor(s.metallic||0));
 for(const m of edges.meshes){
  const mesh=doc.createMesh(m.name).setExtras({privateActualElleryVariant:true,anchor:m.anchor,parts:m.parts,apertures:m.apertures});scene.addChild(doc.createNode(m.name).setMesh(mesh));let n=0;
  for(const[index,g]of m.groups){mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION',add(m.name+' position',g.positions,'VEC3')).setAttribute('NORMAL',add(m.name+' normal',g.normals,'VEC3')).setAttribute('TEXCOORD_0',add(m.name+' uv',g.uvs,'VEC2')).setIndices(add(m.name+' index',g.indices,'SCALAR',true)).setMaterial(materials[index]));n+=g.indices.length/3;}
  stats.meshes[m.name]={anchor:m.anchor,outputTriangles:n,parts:m.parts,apertures:m.apertures};stats.addedTriangles+=n;
 }
 await doc.transform(prune({keepAttributes:true,keepExtras:true,keepSolidTextures:true}));
 for(const m of doc.getRoot().listMeshes()){
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const p of m.listPrimitives()){const a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++)a.getElement(i,[]).forEach((v,k)=>{bounds.min[k]=Math.min(bounds.min[k],v);bounds.max[k]=Math.max(bounds.max[k],v);});}
  stats.meshes[m.getName()].bounds=bounds;stats.totalTriangles+=stats.meshes[m.getName()].outputTriangles;
 }
 if(stats.addedTriangles>stats.budgets.maximumAddedTriangles)throw Error('Garden added-geometry budget exceeded');
 const output=Buffer.from(await io.writeBinary(doc));stats.bytes=output.length;stats.sha256=sha(output);if(output.length>stats.budgets.maximumBytes)throw Error('Garden pack transfer budget exceeded');
 for(const[f,b]of bytes)if(sha(fs.readFileSync(path.join(ROOT,f)))!==sha(b))throw Error('Shared source changed during extraction: '+f);
 stats.protectedSourcePacksUnchangedDuringBuild=true;
 stats.sourceSha256=Object.fromEntries(['tools/chunk_surfer/build-ellery-garden-approaches.mjs','tools/chunk_surfer/ellery-garden-approaches-geometry.mjs','src/data/ellery-garden-approaches.js','src/data/atrium-circulation.js','tools/chunk_surfer/exterior-stationers-geometry.mjs','tools/chunk_surfer/build-exterior-collision.mjs','tools/chunk_surfer/rebuild-tree-crowns.mjs'].map(f=>[f,sha(fs.readFileSync(path.join(ROOT,f)))]));
 const collision=extractExteriorCollision(parseGlb(output),['ellery_garden_elevation']);
 const collisionSource={version:1,asset:'public/assets/ellery-garden-approaches.glb',sha256:stats.sha256,generator:'tools/chunk_surfer/build-ellery-garden-approaches.mjs',coordinateSpace:'exact clipped private mesh local metres; apply actual instance matrix',derivation:'Existing extractExteriorCollision on actual final packed triangles, retaining aperture holes.',meshes:Object.keys(collision)};
 for(const m of Object.values(collision))m.asset=collisionSource.asset;
 fs.mkdirSync(path.dirname(collisionFile),{recursive:true});
 fs.writeFileSync(collisionFile,'// Generated only for the actual separated-wing Ellery; Source retains its original skin.\n'+`export const ELLERY_GARDEN_COLLISION_SOURCE=Object.freeze(${JSON.stringify(collisionSource)});\n`+`export const ELLERY_GARDEN_COLLISION_GEOMETRY=Object.freeze(${JSON.stringify(collision)});\n`);
 stats.collision={file:path.relative(ROOT,collisionFile),source:collisionSource,wallCount:Object.values(collision).reduce((n,m)=>n+m.walls.length,0),triangleCount:Object.values(collision).reduce((n,m)=>n+m.triangles.length,0)};
 fs.mkdirSync(outputDir,{recursive:true});fs.writeFileSync(path.join(outputDir,'ellery-garden-approaches.glb'),output);fs.writeFileSync(path.join(outputDir,'ellery-garden-approaches.stats.json'),JSON.stringify(stats,null,2)+'\n');
 fs.writeFileSync(path.join(outputDir,'ellery-garden-approaches.credits.json'),JSON.stringify({schemaVersion:1,origin:'Project-authored construction and private derivatives extracted from delivered project packs. Existing material/texture provenance unchanged.',license:'Project source; copied material rights retained from original packs.',sourcePacks:stats.sourcePacks,sourceSha256:stats.sourceSha256,geometry:'Actual-room copies clipped to the public approaches. The maintenance ledge moves two metres. The chapel belfry and fly-tower tank sit lower in the street skyline. The pack includes the perforated baths roof, turning service landing, eight stair treads, masonry setbacks, parked gates, paving and rainwater joints.',scope:'Ordinary Ellery. Source and the opening overture retain their original shared geometry.',pack:{bytes:stats.bytes,sha256:stats.sha256},pending:['Native reciprocal greenhouse sightlines and real roof gaps','Ordinary route/body/door and final dither acceptance','Uninstrumented performance and participant observations']},null,2)+'\n');
 return stats;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const at=process.argv.indexOf('--out'),s=await buildElleryGardenApproaches({outputDir:at>=0?path.resolve(process.argv[at+1]):undefined});console.log(JSON.stringify({asset:s.asset,triangles:s.totalTriangles,addedTriangles:s.addedTriangles,bytes:s.bytes,sha256:s.sha256,meshes:Object.fromEntries(Object.entries(s.meshes).map(([n,m])=>[n,{input:m.inputTriangles,output:m.outputTriangles,relocated:m.relocatedLedgeTriangles,bounds:m.bounds}]))}));}
