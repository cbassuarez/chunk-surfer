// The dust billows of the false Ellery's implosion (the Earthfall aside).
// Demolition dust is cauliflower: a mass of small rounded heads, not a ball.
// Each billow here is a cluster of overlapping lumps, so its silhouette breaks
// up through the one-bit halftone. The material is dark and matte, with a
// little emission: a pale mass where nothing lights it, and a torch beam
// cannot burn a white disc onto it.
//
//   node tools/chunk_surfer/build-earthfall-dust.mjs
//
// Writes public/assets/source-earthfall-dust.glb and its .credits.json.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {encodeGlb} from './rebuild-tree-crowns.mjs';

const ROOT=path.resolve(import.meta.dirname,'../..'),OUT=path.join(ROOT,'public/assets/source-earthfall-dust.glb');
const VARIANTS=3,LUMPS=24,PUFF_LUMPS=9;
// Emission of the tone bands, under to crown. The albedo stays dark throughout.
const TONES=[.045,.085,.135,.2];

function icosphere(level){
 const t=(1+Math.sqrt(5))/2,v=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(p=>{const l=Math.hypot(...p);return p.map(x=>x/l);});
 let f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
 for(let l=0;l<level;l++){
  const mid=new Map(),half=(a,b)=>{const k=a<b?a+','+b:b+','+a;if(!mid.has(k)){const p=v[a].map((x,i)=>(x+v[b][i])/2),n=Math.hypot(...p);v.push(p.map(x=>x/n));mid.set(k,v.length-1);}return mid.get(k);};
  f=f.flatMap(([a,b,c])=>{const ab=half(a,b),bc=half(b,c),ca=half(c,a);return[[a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]];});
 }
 return{vertices:v,faces:f};
}
// One billow: a core and its lumps, all deterministic from the seed. Normals
// lean outward from the billow's centre, so light rolls across the whole head
// instead of picking out each lump as a bubble.
function cluster(seed,lumps,subdivisions){
 const {vertices,faces}=icosphere(subdivisions);
 const rand=i=>{let n=Math.imul(i*7919+seed*104729+1,0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return((n^(n>>>16))>>>0)/4294967296;};
 const parts=[{at:[0,0,0],r:.68}];
 for(let i=0;i<lumps;i++){
  const z=rand(i*5)*2-1,a=rand(i*5+1)*Math.PI*2,c=Math.sqrt(1-z*z),out=.48+.26*rand(i*5+2),big=rand(i*5+3);
  parts.push({at:[c*Math.cos(a)*out,z*out*(z<0?.8:1),c*Math.sin(a)*out],r:.14+.26*big*big});
 }
 // Volume is baked: every triangle joins one of the tone bands by how far it
 // faces the sky and how far out on the head it sits, so the halftone prints
 // shaded heads with dark creases between them.
 const bands=TONES.map(()=>({positions:[],normals:[],indices:[]}));
 for(const part of parts){
  const placed=vertices.map(v=>{const p=v.map((x,k)=>part.at[k]+x*part.r),l=Math.hypot(...p)||1,n=v.map((x,k)=>x*.6+p[k]/l*.4),m=Math.hypot(...n)||1;return{p,n:n.map(x=>x/m),out:l};});
  // A band shares this lump's corners, so the pack stays small.
  const shared=bands.map(()=>new Map());
  for(const f of faces){
   const c=f.map(k=>placed[k]),up=(c[0].n[1]+c[1].n[1]+c[2].n[1])/3,out=(c[0].out+c[1].out+c[2].out)/3;
   const tone=Math.max(0,Math.min(.999,.42+.38*up+.55*(out-.72))),b=Math.floor(tone*TONES.length),band=bands[b];
   for(const k of f){
    if(!shared[b].has(k)){shared[b].set(k,band.positions.length/3);band.positions.push(...placed[k].p);band.normals.push(...placed[k].n);}
    band.indices.push(shared[b].get(k));
   }
  }
 }
 return bands.map((band,material)=>({...band,material})).filter(band=>band.indices.length);
}

const json={asset:{version:'2.0',generator:'Chunk Surfer / Earthfall implosion dust'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],
 materials:TONES.map((e,i)=>({name:'earthfall implosion dust '+i,doubleSided:true,emissiveFactor:[e,e*.955,e*.82],pbrMetallicRoughness:{baseColorFactor:[.1,.097,.087,1],metallicFactor:0,roughnessFactor:1}})),accessors:[],bufferViews:[]};
const chunks=[];let cursor=0;
function accessor(values,n,int=false){
 const array=int?new Uint32Array(values):new Float32Array(values),bytes=Buffer.from(array.buffer);
 const offset=(cursor+3)&~3;if(offset>cursor)chunks.push(Buffer.alloc(offset-cursor));chunks.push(bytes);cursor=offset+bytes.length;
 json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:int?34963:34962});
 const a={bufferView:json.bufferViews.length-1,componentType:int?5125:5126,count:values.length/n,type:{1:'SCALAR',2:'VEC2',3:'VEC3'}[n]};
 if(n===3&&!int){a.min=[0,1,2].map(k=>{let m=Infinity;for(let i=k;i<values.length;i+=3)m=Math.min(m,values[i]);return m;});a.max=[0,1,2].map(k=>{let m=-Infinity;for(let i=k;i<values.length;i+=3)m=Math.max(m,values[i]);return m;});}
 json.accessors.push(a);return json.accessors.length-1;
}
let triangles=0;
const meshes=[...Array.from({length:VARIANTS},(_,v)=>['earthfall_dust_billow_'+v,cluster(v+1,LUMPS,2)]),['earthfall_dust_puff',cluster(11,PUFF_LUMPS,1)]];
for(const[name,g]of meshes){
 const mesh={name,primitives:g.map(b=>({attributes:{POSITION:accessor(b.positions,3),NORMAL:accessor(b.normals,3),TEXCOORD_0:accessor(new Array(b.positions.length/3*2).fill(0),2)},indices:accessor(b.indices,1,true),material:b.material}))};
 triangles+=g.reduce((n,b)=>n+b.indices.length/3,0);json.meshes.push(mesh);json.nodes.push({name:mesh.name,mesh:json.meshes.length-1});json.scenes[0].nodes.push(json.nodes.length-1);
}
json.buffers=[{byteLength:cursor}];
const glb=encodeGlb(json,Buffer.concat(chunks));fs.writeFileSync(OUT,glb);
const sha=crypto.createHash('sha256').update(glb).digest('hex');
fs.writeFileSync(OUT.replace('.glb','.credits.json'),JSON.stringify({pack:'source-earthfall-dust',sha256:sha,source:'Procedural (this script): deterministic clusters of subdivided icosahedra',tool:'tools/chunk_surfer/build-earthfall-dust.mjs'},null,1));
console.log(`wrote ${path.relative(ROOT,OUT)} (${(glb.length/1024).toFixed(1)} KB): ${meshes.length} meshes, ${triangles} triangles`);
