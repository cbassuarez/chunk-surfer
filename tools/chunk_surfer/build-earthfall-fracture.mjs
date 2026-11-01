// The false Ellery that falls with the player in Earthfall, broken into the
// chunks and fragments it comes apart into on the way down.
//
// Input is the exact retained Source elevation the game draws beside the
// plaza (source_demolition_retained in public/assets/source-demolition.glb),
// read-only. Blender breaks it twice with Cell Fracture's Voronoi cells (see
// build-earthfall-fracture.py); this encodes the pieces with their original
// factor materials plus the fracture-core material for the cut faces.
//
//   node tools/chunk_surfer/build-earthfall-fracture.mjs
//   BLENDER_BIN=...  BLENDER_USER_RESOURCES=<dir with cell_fracture installed>
//
// Writes public/assets/source-earthfall-fracture.glb and
// src/data/generated/source-earthfall-fracture.js.
import fs from 'node:fs';import path from 'node:path';import cp from 'node:child_process';import crypto from 'node:crypto';
import {parseGlb,encodeGlb} from './rebuild-tree-crowns.mjs';
import {readAccessor} from './build-st-brendans-treatment.mjs';

const ROOT=path.resolve(import.meta.dirname,'../..'),WORK=path.join(ROOT,'artifacts/earthfall-fracture');
const SOURCE=path.join(ROOT,'public/assets/source-demolition.glb'),OUT=path.join(ROOT,'public/assets/source-earthfall-fracture.glb');
const META=path.join(ROOT,'src/data/generated/source-earthfall-fracture.js');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(WORK,{recursive:true});

const sourceBytes=fs.readFileSync(SOURCE),pack=parseGlb(sourceBytes);
const retained=pack.json.meshes.find(m=>m.name==='source_demolition_retained');
if(!retained)throw Error('source_demolition_retained is missing from source-demolition.glb');
const used=[...new Set(retained.primitives.map(p=>p.material))],slot=new Map(used.map((m,i)=>[m,i]));
const materials=used.map(m=>{const d=pack.json.materials[m];return{name:d.name,color:d.pbrMetallicRoughness?.baseColorFactor||[.5,.5,.5,1],
  metallic:d.pbrMetallicRoughness?.metallicFactor??0,roughness:d.pbrMetallicRoughness?.roughnessFactor??1};});
const primitives=retained.primitives.map(p=>({material:slot.get(p.material),positions:readAccessor(pack,p.attributes.POSITION),indices:readAccessor(pack,p.indices)}));
const input=path.join(WORK,'elevation.json'),output=path.join(WORK,'fracture.json');
fs.writeFileSync(input,JSON.stringify({sourceSha256:sha(sourceBytes),materials,primitives}));

const blender=process.env.BLENDER_BIN||'/Applications/Blender.app/Contents/MacOS/Blender';
const run=cp.spawnSync(blender,['--background','--factory-startup','--python',path.join(import.meta.dirname,'build-earthfall-fracture.py'),'--','--input',input,'--output',output],
  {encoding:'utf8',maxBuffer:64*1024*1024,env:process.env});
const marker=(run.stdout||'').split('\n').find(line=>line.startsWith('EARTHFALL_FRACTURE'));
if(run.status!==0||!marker){process.stderr.write((run.stdout||'').slice(-4000)+(run.stderr||'').slice(-4000));throw Error('Blender fracture failed');}
const authored=JSON.parse(fs.readFileSync(output));

const json={asset:{version:'2.0',generator:'Chunk Surfer / Blender Cell Fracture Earthfall elevation'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[]};
for(const m of materials)json.materials.push({name:m.name,pbrMetallicRoughness:{baseColorFactor:m.color,metallicFactor:m.metallic,roughnessFactor:m.roughness}});
json.materials.push({name:'earthfall fracture core',pbrMetallicRoughness:{baseColorFactor:[.19,.23,.20,1],metallicFactor:0,roughnessFactor:.97}});
const chunks=[];let cursor=0;
function accessor(values,n,int=false){
  const array=int?new Uint32Array(values):new Float32Array(values),bytes=Buffer.from(array.buffer);
  const offset=(cursor+3)&~3;if(offset>cursor)chunks.push(Buffer.alloc(offset-cursor));chunks.push(bytes);cursor=offset+bytes.length;
  json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,...(int?{target:34963}:{target:34962})});
  const a={bufferView:json.bufferViews.length-1,componentType:int?5125:5126,count:values.length/n,type:{1:'SCALAR',2:'VEC2',3:'VEC3'}[n]};
  if(n===3&&!int){a.min=[0,1,2].map(k=>Math.min(...values.filter((_,i)=>i%3===k)));a.max=[0,1,2].map(k=>Math.max(...values.filter((_,i)=>i%3===k)));}
  json.accessors.push(a);return json.accessors.length-1;
}
const pieces=[];
for(const piece of authored.pieces){
  const mesh={name:`earthfall_ellery_${piece.name}`,primitives:[]};let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],radius=0;
  for(const g of piece.groups){
    const count=g.positions.length/3;
    for(let i=0;i<count;i++)for(let k=0;k<3;k++){const v=g.positions[i*3+k];lo[k]=Math.min(lo[k],v);hi[k]=Math.max(hi[k],v);}
    for(let i=0;i<count;i++)radius=Math.max(radius,Math.hypot(g.positions[i*3],g.positions[i*3+1],g.positions[i*3+2]));
    // Shared corners are written once: position and normal together are the key.
    const map=new Map(),positions=[],normals=[],indices=[];
    for(let i=0;i<count;i++){
      const key=g.positions.slice(i*3,i*3+3).concat(g.normals.slice(i*3,i*3+3)).join(',');
      if(!map.has(key)){map.set(key,positions.length/3);positions.push(...g.positions.slice(i*3,i*3+3));normals.push(...g.normals.slice(i*3,i*3+3));}
      indices.push(map.get(key));
    }
    mesh.primitives.push({attributes:{POSITION:accessor(positions,3),NORMAL:accessor(normals,3),TEXCOORD_0:accessor(new Array(positions.length/3*2).fill(0),2)},
      indices:accessor(indices,1,true),material:g.material});
  }
  json.meshes.push(mesh);json.nodes.push({name:mesh.name,mesh:json.meshes.length-1});json.scenes[0].nodes.push(json.nodes.length-1);
  pieces.push({id:piece.name,mesh:mesh.name,level:piece.level,parent:piece.parent,pivot:piece.pivot,triangles:piece.triangles,
    radius:+radius.toFixed(3),bounds:{min:lo.map(v=>+v.toFixed(3)),max:hi.map(v=>+v.toFixed(3))}});
}
json.buffers=[{byteLength:cursor}];
const glb=encodeGlb(json,Buffer.concat(chunks));fs.writeFileSync(OUT,glb);
const chunkCount=pieces.filter(p=>p.level===1).length,fragmentCount=pieces.length-chunkCount;
const meta={version:1,asset:'/assets/source-earthfall-fracture.glb',sha256:sha(glb),sourceSha256:sha(sourceBytes),sourceMesh:'source_demolition_retained',
  method:'Voronoi cells from Blender Cell Fracture (extensions.blender.org cell_fracture, fracture_cell_calc), cut by plane bisection instead of its boolean because the elevation is open shells; two levels from deterministic seed points; small section loops capped',seed:authored.seed,
  chunks:chunkCount,fragments:fragmentCount,triangles:pieces.reduce((n,p)=>n+p.triangles,0),pieces};
fs.writeFileSync(META,'// Generated by tools/chunk_surfer/build-earthfall-fracture.mjs; do not hand edit.\n'
  +`export const SOURCE_EARTHFALL_FRACTURE=Object.freeze(${JSON.stringify(meta)});\n`);
fs.writeFileSync(OUT.replace('.glb','.credits.json'),JSON.stringify({pack:'source-earthfall-fracture',sha256:meta.sha256,
  source:'Project-native source_demolition_retained (the retained Source elevation of conservatory_west_elevation), read-only',
  tool:meta.method},null,1));
console.log(`wrote ${path.relative(ROOT,OUT)} (${(glb.length/1024).toFixed(0)} KB): ${chunkCount} chunks, ${fragmentCount} fragments, ${meta.triangles} triangles`);
