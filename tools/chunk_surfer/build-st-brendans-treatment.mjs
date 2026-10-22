// A scoped pack build: conservatory-props.glb is a read-only source for the
// existing church shell. No shared asset, floorplan or collision is regenerated.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseGlb,encodeGlb} from './rebuild-tree-crowns.mjs';
import {BRENDAN_MATERIALS,createStBrendansTreatmentGeometry,bounds} from './st-brendans-treatment-geometry.mjs';
import {ST_BRENDANS_TREATMENT_VERSION,ST_BRENDANS_TREATMENT_BUDGET,ST_BRENDANS_TREATMENT_MESH_NAMES} from '../../src/data/st-brendans-treatment.js';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),root=path.resolve(import.meta.dirname,'../..');
const BASE_MAP={'chapel stone':'stone','ellery dark brick':'stoneDark','black lacquer':'iron','wet slate':'slate','dark wood':'oak','painted steel':'iron','occupied warm glass':'warm'};
export function readAccessor(pack,id){
 const a=pack.json.accessors[id],v=pack.json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],width={5126:4,5125:4,5123:2,5121:1}[a.componentType],stride=v.byteStride||n*width,start=(v.byteOffset||0)+(a.byteOffset||0),get={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType];
 if(!n||!width||a.sparse)throw Error('Unsupported source accessor');
 return Array.from({length:a.count*n},(_,i)=>pack.bin[get](start+Math.floor(i/n)*stride+(i%n)*width));
}
export function expandedPrimitive(pack,p){const pos=readAccessor(pack,p.attributes.POSITION),norm=readAccessor(pack,p.attributes.NORMAL),indices=readAccessor(pack,p.indices);return indices.flatMap(i=>[...pos.slice(i*3,i*3+3),...norm.slice(i*3,i*3+3)])}
// Four old .18m beams intersected the moving axes. Only their48 triangles are
// replaced; none of the church's walkable/contact construction is touched.
export function removeOldFrameCrossmembers(g){
 const indices=[],removed=[];for(let i=0;i<g.indices.length;i+=3){const ids=g.indices.slice(i,i+3),points=ids.map(k=>g.positions.slice(k*3,k*3+3));
  const old=[12.25,14.4].some(h=>[2,4].some(z=>points.every(p=>Math.abs(p[1]-h)<.091&&Math.abs(p[2]-z)<.091&&p[0]>=-2.21&&p[0]<=2.21)));
  (old?removed:indices).push(...ids);
 }return{...g,indices,removedTriangles:removed.length/3};
}
function weld(g){
 const positions=[],normals=[],indices=[],seen=new Map();
 for(const old of g.indices){
  const values=[...g.positions.slice(old*3,old*3+3),...g.normals.slice(old*3,old*3+3)].map(Math.fround),key=values.map(v=>Object.is(v,-0)?'-0':String(v)).join(',');let i=seen.get(key);
  if(i===undefined){i=positions.length/3;seen.set(key,i);positions.push(...values.slice(0,3));normals.push(...values.slice(3));}indices.push(i);
 }return{positions,normals,indices};
}
export function buildStBrendansTreatment(sourceBytes){
 const source=parseGlb(sourceBytes),base=source.json.meshes.find(m=>m.name==='st_brendan_church');if(!base)throw Error('Existing church mesh missing');
 const built=createStBrendansTreatmentGeometry(),materials=Object.entries(BRENDAN_MATERIALS).map(([key,m])=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:m.color,roughnessFactor:m.roughness,metallicFactor:m.metallic||0},...(m.emissive?{emissiveFactor:m.emissive}:{}),extras:{studyLocalFinish:true,materialFactors:'gltf',brendanRole:key}})),materialIndex=Object.fromEntries(Object.keys(BRENDAN_MATERIALS).map((k,i)=>[k,i]));
 const json={asset:{version:'2.0',generator:'Chunk Surfer / build-st-brendans-treatment.mjs'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials,accessors:[],bufferViews:[],buffers:[]},chunks=[],accessors=new Map();let cursor=0;
 const accessor=(values,n,integer=false)=>{
  const small=integer&&values.every(v=>v<65536),typed=integer?(small?new Uint16Array(values):new Uint32Array(values)):new Float32Array(values),bytes=Buffer.from(typed.buffer),key=`${n}:${integer}:${small}:${sha(bytes)}`;if(accessors.has(key))return accessors.get(key);
  const offset=(cursor+3)&~3;if(offset>cursor)chunks.push(Buffer.alloc(offset-cursor));chunks.push(bytes);cursor=offset+bytes.length;
  const v=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});
  const a={bufferView:v,componentType:integer?(small?5123:5125):5126,count:values.length/n,type:n===1?'SCALAR':`VEC${n}`};if(n===3&&!integer){const b=bounds({positions:typed});a.min=b.min;a.max=b.max;}
  const i=json.accessors.length;json.accessors.push(a);accessors.set(key,i);return i;
 };
 const primitive=(g,material)=>{g=weld(g);return{attributes:{POSITION:accessor(g.positions,3),NORMAL:accessor(g.normals,3)},indices:accessor(g.indices,1,true),material:materialIndex[material],mode:4}};
 const stats={revision:ST_BRENDANS_TREATMENT_VERSION,limits:ST_BRENDANS_TREATMENT_BUDGET,baseSource:'public/assets/conservatory-props.glb',baseSourceSha256:sha(sourceBytes),baseGeometryPreservedExceptApparatus:true,apparatusException:'48 triangles forming four legacy beams at the gudgeon axes are replaced by bearers below sixteen aligned Z-axis bearings; all other source triangles and normals retained',basePrimitiveHashes:[],meshes:{},packedTriangles:0,uniquePrimitiveTriangles:0};
 for(const [name,groups]of built){
  const primitives=[];
  if(name==='brendan_church_treated')for(const p of base.primitives){
   const material=BASE_MAP[source.json.materials[p.material].name];if(!material)throw Error(`Unknown base material ${source.json.materials[p.material].name}`);
   let g={positions:readAccessor(source,p.attributes.POSITION),normals:readAccessor(source,p.attributes.NORMAL),indices:readAccessor(source,p.indices)};const sourceTriangles=g.indices.length/3;
   if(source.json.materials[p.material].name==='dark wood')g=removeOldFrameCrossmembers(g);
   const expanded=g.indices.flatMap(i=>[...g.positions.slice(i*3,i*3+3),...g.normals.slice(i*3,i*3+3)]),before=sha(Buffer.from(new Float32Array(expanded).buffer)),q=primitive(g,material);primitives.push(q);stats.basePrimitiveHashes.push({material:source.json.materials[p.material].name,sha256:before,triangles:g.indices.length/3,sourceTriangles,removedApparatusTriangles:g.removedTriangles||0});
  }
  for(const [material,g]of groups)if(g.indices.length)primitives.push(primitive(g,material));
  const i=json.meshes.length;json.meshes.push({name,primitives});json.nodes.push({name,mesh:i});json.scenes[0].nodes.push(i);
  const b={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let triangles=0,vertices=0;
  for(const p of primitives){const a=json.accessors[p.attributes.POSITION];triangles+=json.accessors[p.indices].count/3;vertices+=a.count;for(let k=0;k<3;k++){b.min[k]=Math.min(b.min[k],a.min[k]);b.max[k]=Math.max(b.max[k],a.max[k])}}
  stats.meshes[name]={triangles,vertices,primitives:primitives.length,bounds:b};stats.packedTriangles+=triangles;
 }
 json.buffers=[{byteLength:cursor}];const bin=Buffer.concat(chunks),bytes=encodeGlb(json,bin);stats.bytes=bytes.length;stats.sha256=sha(bytes);
 const unique=new Set();for(const mesh of json.meshes)for(const p of mesh.primitives)if(!unique.has(p.indices)){stats.uniquePrimitiveTriangles+=json.accessors[p.indices].count/3;unique.add(p.indices)}
 if(JSON.stringify([...built.keys()].sort())!==JSON.stringify([...ST_BRENDANS_TREATMENT_MESH_NAMES].sort()))throw Error('Mesh catalogue mismatch');
 if(stats.bytes>stats.limits.bytes||stats.packedTriangles>stats.limits.triangles)throw Error(`Treatment budget exceeded: ${stats.bytes} bytes / ${stats.packedTriangles} triangles`);
 return{bytes,json,bin,stats};
}
function main(){
 const source=fs.readFileSync(path.join(root,'public/assets/conservatory-props.glb')),built=buildStBrendansTreatment(source),out=path.join(root,'public/assets/st-brendans-treatment.glb');
 fs.writeFileSync(out,built.bytes);fs.writeFileSync(out.replace('.glb','.stats.json'),JSON.stringify(built.stats,null,2)+'\n');
 fs.writeFileSync(out.replace('.glb','.credits.json'),JSON.stringify({pack:'st-brendans-treatment',revision:ST_BRENDANS_TREATMENT_VERSION,sha256:built.stats.sha256,
  source:'Original project-native geometry in tools/chunk_surfer/st-brendans-treatment-geometry.mjs; dedicated church shell is copied from the project-native st_brendan_church generated by tools/chunk_surfer/build-props.mjs. No third-party textures, scans or models.',
  build:'node tools/chunk_surfer/build-st-brendans-treatment.mjs',
  retained:'Original church geometry/normals retained except48 explicitly identified apparatus triangles: four frame crossmembers previously passed through the gudgeon axes. Replacement crossmembers sit below sixteen scale-aware bearing housings. All stairs, rail guards, decks, hatch, route/collision remain owned by src/data/st-brendans.js and the compiled floorplan. Material palette is dedicated and quieter.',
  authored:'Actual hollow bell sections, soundbows, six canons/headstocks; grooved wooden wheels and individual clappers. Frame joinery, bearings/ironwork; large paving; carved empty choir stalls/pews, font bowl, heavy altar with removed-object traces, abraded memorial, recumbent stone tomb, pierced pulpitum and separate fallen wings.',
  windows:'Deep inward stone splays and closed cold glazing are in front of existing solid wall faces. These are not newly cut raymarch windows and do not create through-views or alter collision.',
  referenceOnly:[{url:'https://belfryupkeep.cccbr.org.uk/docs/050-bell-frames/',source:'Central Council of Church Bell Ringers, Bell frames',use:'Structural frame/load-path and metal/timber component grammar only; no asset copied or exact real church claimed.'}],
  budgets:built.stats.limits},null,2)+'\n');
 if(sha(source)!==sha(fs.readFileSync(path.join(root,'public/assets/conservatory-props.glb'))))throw Error('Read-only source changed during build');
 console.log(JSON.stringify({file:path.relative(root,out),bytes:built.stats.bytes,triangles:built.stats.packedTriangles,uniquePrimitiveTriangles:built.stats.uniquePrimitiveTriangles,meshes:built.json.meshes.length}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
