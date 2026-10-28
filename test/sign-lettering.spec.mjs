// Production print: exact copy, forward UVs, real pigment masks and opaque depth.
// This verifies the built carriers. Human reading through the final shader is a
// separate acceptance gate; matching metadata is never presented as OCR proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {printedFaceGeometry} from '../tools/chunk_surfer/lettering/face-geometry.mjs';
import {WORLD_INSCRIPTIONS,corridorInscriptionsForHosts} from '../src/data/world-inscriptions.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
const dir=process.env.CHUNK_SURFER_PROPS_TEST_DIR||'public/assets';
const bytes=fs.readFileSync(path.join(dir,'conservatory-props.glb'));
const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength)),bin=bytes.subarray(28+jsonLength);
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'conservatory-props.lettering.json')));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.packSha256);
// A narrow atlas revision records its producer inputs separately; the original
// full-bake input hashes remain historical provenance for the retained faces.
for(const[file,hash]of Object.entries({...manifest.sourceHashes,...manifest.giltRevision?.sourceHashes,...manifest.currentAssetReconciliation?.sourceHashes}))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,'Production lettering generator changed without rebuilding: '+file);
const expected={
 exterior_pub_frontage:['PUBLIC HOUSE','THE LYRIC'],
 yard_van:['04 / LIGHTING','01 / MONITORING','02 / MICROPHONE','03 / AMPLIFIER','SERVICE / FACEPLATES'],
 tower_rope_mat_tenor:['8/\nTENOR'],ending_returned_ledger:['','ALAN'],
 scene_dock_sign_foh:['FRONT OF HOUSE'],scene_dock_sign_services:['STUDIOS / PLANT'],
 vigil_part_sign_save:['SAVE ELLERY'],vigil_part_sign_strike:['NO FIRST\nSTRIKE\n06:00'],
 vigil_part_sign_chapel:['SAVE THE\n1908 CHAPEL'],vigil_part_sign_record:['OUR ROOMS\nOUR RECORD'],
 vigil_part_sign_signed:['WHO SIGNED\nTHIS OFF?'],vigil_part_banner:['KEEP ELLERY\nSTANDING'],
 city_phone_box:Array(4).fill('TELEPHONE'),city_phone_box_apparatus:['PAY ON ANSWER','POST OFFICE','1','2','3','4','5','6','7','8','9','0','999','100'],
 outskirts_bus:['ELLERY','J 063'],outskirts_car:['J 063'],outskirts_lodge:['PORTER'],
 outskirts_shelter_timetable:['ELLERY\nLAST BUS\n23:10\n23:40\n00:10'],
 outskirts_lodge_ledger:['VISITORS',''],outskirts_ledger_signed:['VISITORS',''],outskirts_ticket:['ELLERY','063'],
 door_stencil_b1:['B1'],door_stencil_b2:['B2'],door_stencil_b3:['B3'],door_stencil_b5:['B5'],source_hall_number_17:['17'],
 hymn_board:['17 · 44 · 91'],tower_peal_board:['ELLERY COLLEGIATE CHAPEL — STEDMAN TRIPLES — 1908'],
 rekey_ledger:['REPLACEMENT LOCK — CHAPEL — CABINET C-17'],
 chapel_key_ring_ch04:['CH-04\nCHAPEL — MAIN'],chapel_key_ring_c17:['C-17'],chapel_key_ring_fohm:['FOH-M\nFRONT OF HOUSE — MASTER'],
};
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
 widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
 edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.propsInit(FP);
const corridorInscriptions=corridorInscriptionsForHosts(PROPS.renderInstances({inscriptions:false}));
for(const spec of [...WORLD_INSCRIPTIONS,...corridorInscriptions])(expected[spec.mesh]||=[]).push(spec.copy);
assert.deepEqual(manifest.corridorInscriptionAttachments.map(({id,hostId,hostMesh,copy})=>({id,hostId,hostMesh,copy})),
 corridorInscriptions.map(({id,hostId,hostMesh,copy})=>({id,hostId,hostMesh,copy})),
 'Baked corridor labels must match only actual compiled hosts and their exact current literal names');
assert.deepEqual(manifest.entries.filter(e=>e.id.startsWith('pub-lyric-fascia-')).map(({id,mesh,copy})=>({id,mesh,copy})).sort((a,b)=>a.id.localeCompare(b.id)),[
 {id:'pub-lyric-fascia-east',mesh:'exterior_pub_frontage',copy:'PUBLIC HOUSE'},
 {id:'pub-lyric-fascia-west',mesh:'exterior_pub_frontage',copy:'THE LYRIC'},
],'both authored pub fascia copies occupy their stable exact physical faces');
assert.equal(manifest.entries.length,Object.values(expected).reduce((n,a)=>n+a.length,0));
assert.equal(new Set(manifest.entries.map(e=>e.mesh)).size,Object.keys(expected).length);
for(const [mesh,copies]of Object.entries(expected))assert.deepEqual(manifest.entries.filter(e=>e.mesh===mesh).map(e=>e.copy).sort(),copies.sort(),mesh+' authored content changed');
const read=index=>{const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],size={5125:4,5126:4}[a.componentType],width={SCALAR:1,VEC2:2,VEC3:3}[a.type];return Array.from({length:a.count*width},(_,i)=>a.componentType===5126?bin.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+i*size):bin.readUInt32LE((v.byteOffset||0)+(a.byteOffset||0)+i*size));};
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),sub=(a,b)=>a.map((v,k)=>v-b[k]);
const imageCache=new Map();async function image(index){if(imageCache.has(index))return imageCache.get(index);const def=gltf.images[gltf.textures[index].source],view=gltf.bufferViews[def.bufferView];assert.equal(def.mimeType,'image/png');const value=await sharp(bin.subarray(view.byteOffset,view.byteOffset+view.byteLength)).ensureAlpha().raw().toBuffer({resolveWithObject:true});imageCache.set(index,value);return value;}
let faceTriangles=0;
for(const entry of manifest.entries){
 const mesh=gltf.meshes.find(m=>m.name===entry.mesh),meta=mesh.extras.lettering.find(e=>e.id===entry.id),primitive=mesh.primitives.find(p=>p.material===meta.material),material=gltf.materials[meta.material];
 assert.equal(material.alphaMode,'OPAQUE');assert.equal(material.extras.printedSurface.coverage,'baseColorAlpha');
 assert.equal(material.extras.printedSurface.polarity,entry.polarity);assert.equal(material.extras.printedSurface.process,entry.process);
 assert.equal(material.extras.printedSurface.emission,entry.emission);
 assert.equal(Boolean(material.emissiveFactor),entry.emission==='substrate','Ordinary pigment must not glow');
 assert.ok(entry.metrics.coverage>.003&&entry.metrics.coverage<.65,entry.id+' empty or flooded mask');
 assert.equal(entry.metrics.glyphs.map(g=>g.character).join(''),entry.copy.replace(/\s/g,''),entry.id+' missing codepoints');
 assert.ok(entry.metrics.stemWidthM>0&&entry.metrics.stemWidthM<entry.heightM*.25);
 const p=read(primitive.attributes.POSITION),uv=read(primitive.attributes.TEXCOORD_0),n=read(primitive.attributes.NORMAL),indices=read(primitive.indices),lo=meta.firstVertex,hi=lo+meta.vertexCount;
 const vertex=i=>p.slice(i*3,i*3+3),points=Array.from({length:meta.vertexCount},(_,i)=>vertex(lo+i));
 for(let i=lo;i<hi;i++){
  assert.ok(uv[i*2]>=entry.uvRect[0]-1e-6&&uv[i*2]<=entry.uvRect[2]+1e-6);
  assert.ok(uv[i*2+1]>=entry.uvRect[1]-1e-6&&uv[i*2+1]<=entry.uvRect[3]+1e-6);
  const normal=n.slice(i*3,i*3+3);
  assert.ok(Math.abs(Math.hypot(...normal)-1)<1e-5,'Print surface normals must remain unit length');
  assert.ok(dot(normal,meta.normal)>(meta.shape==='railing-banner'?.85:.98),'Print normals point away from the reader');
 }
 for(let at=meta.firstIndex;at<meta.firstIndex+meta.indexCount;at+=3){
  const [a,b,c]=indices.slice(at,at+3).map(vertex),u=sub(b,a),v=sub(c,a),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  assert.ok(dot(cross,meta.normal)>0,entry.id+' reversed physical winding');
  if(meta.shape==='railing-banner'){
   const length=Math.hypot(...cross),faceNormal=cross.map(q=>q/length);
   for(const index of indices.slice(at,at+3))assert.ok(dot(faceNormal,n.slice(index*3,index*3+3))>.98,entry.id+' cloth normals disagree with their actual curved triangles');
  }
 }
 // Independently recover image direction from geometry: increasing U must
 // travel to the reader's right; increasing V must travel down the surface.
 const extremes=points.map((point,i)=>({point,u:uv[(lo+i)*2],v:uv[(lo+i)*2+1]}));
 const left=extremes.reduce((a,b)=>a.u<b.u?a:b),right=extremes.reduce((a,b)=>a.u>b.u?a:b);
 const top=extremes.reduce((a,b)=>a.v<b.v?a:b),bottom=extremes.reduce((a,b)=>a.v>b.v?a:b);
 assert.ok(dot(sub(right.point,left.point),meta.readerRight)>entry.widthM*.95,entry.id+' mirrored U');
 assert.ok(dot(sub(top.point,bottom.point),meta.up)>entry.heightM*.95,entry.id+' upside-down V');
 const {data,info}=await image(material.pbrMetallicRoughness.baseColorTexture.index);
 let ground=0,pigment=0,substrateRgb=0;const x0=Math.round(entry.uvRect[0]*info.width),x1=Math.round(entry.uvRect[2]*info.width),y0=Math.round(entry.uvRect[1]*info.height),y1=Math.round(entry.uvRect[3]*info.height);
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const at=(y*info.width+x)*4;if(data[at+3]===0){ground++;if(data[at]+data[at+1]+data[at+2]>12)substrateRgb++;}if(data[at+3]>200)pigment++;}
 assert.ok(ground>20&&pigment>10,entry.id+' mask is not a real two-region carrier');
 if(!entry.substrate)assert.equal(substrateRgb,ground,entry.id+' transparent PNG processing destroyed substrate RGB');
 faceTriangles+=meta.indexCount/3;
}
for(const name of manifest.blankSurfacesPreserved)assert.ok(!manifest.entries.some(e=>e.mesh===name),name+' gained invented copy');
for(const family of ['city_phone_box','city_phone_box_apparatus','outskirts_lodge_ledger','outskirts_ledger_signed'])assert.ok(manifest.entries.some(e=>e.mesh===family));
const opal=manifest.entries.filter(e=>e.mesh==='city_phone_box');assert.equal(new Set(opal.map(e=>e.page+':'+e.uvRect.join(','))).size,1,'Identical opal printing lost atlas sharing');
assert.deepEqual(opal.map(e=>e.geometry.normal),[[0,0,1],[1,0,0],[0,0,-1],[-1,0,0]]);
const baseBytes=manifest.pages.reduce((s,p)=>s+p.rgbaBaseLevelBytes,0);assert.ok(baseBytes<40*1024*1024,'Whole-game print atlas residency exceeds declared production budget');
// Paper uses its existing flipped-Y runtime atlas. Geometry is unchanged; only
// upward faces receive real page UVs. No reversed text is put on the underside.
assert.equal(manifest.runtimePaperUvs.length,2);
for(const paper of manifest.runtimePaperUvs){
 const mesh=gltf.meshes.find(m=>m.name===paper.mesh);let spread=0;
 if(paper.mesh==='loose_note_page6'){
  assert.equal(paper.removedLegacyTextProxyBoxes,4,'Paper must identify the retired raised text placeholders');
  assert.equal(mesh.primitives.length,2,'Only the physical sheet and folded corners should remain');
  assert.ok(mesh.primitives.every(p=>gltf.materials[p.material].name!=='dark wood'),'Primitive bars must not obscure the real document');
 }
 for(const primitive of mesh.primitives){const uv=read(primitive.attributes.TEXCOORD_0),normal=read(primitive.attributes.NORMAL),p=read(primitive.attributes.POSITION);
  for(let i=0;i<normal.length;i+=3){const u=uv[i/3*2],v=uv[i/3*2+1];assert.ok(u>=0&&u<=1&&v>=0&&v<=1);if(normal[i+1]<-.5)assert.deepEqual([u,v],[0,0]);if(normal[i+1]>.5&&u>.05&&v>.05)spread++;}
  const top=[];for(let i=0;i<Math.min(72,p.length);i+=3)if(normal[i+1]>.9)top.push([p[i],p[i+2],uv[i/3*2],uv[i/3*2+1]]);
  assert.ok(top.length>=4);const a=top.reduce((a,b)=>a[0]<b[0]?a:b),b=top.reduce((a,b)=>a[0]>b[0]?a:b);assert.ok(b[2]>a[2],'Paper U reverses reader-right');
 }
 assert.ok(spread>=4,paper.mesh+' still has a degenerate world-paper map');
}
// Explicitly check the reusable geometry carrier against adversarial axes.
for(const readerRight of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){const g=printedFaceGeometry({center:[2,3,4],readerRight,up:[0,1,0],widthM:2,heightM:1});assert.equal(g.positions.length,12);assert.equal(g.indices.length,6);}
console.log(JSON.stringify({surfaces:manifest.entries.length,meshes:Object.keys(expected).length,runtimePaperMeshes:manifest.runtimePaperUvs.length,faceTriangles,atlasPages:manifest.pages.length,textureBaseLevelBytes:baseBytes,estimatedMipBytes:Math.ceil(baseBytes*4/3),codepoints:'complete authored copy',readerCorrectUv:true,opaqueCoverage:true,humanReading:'separate acceptance gate'}));
