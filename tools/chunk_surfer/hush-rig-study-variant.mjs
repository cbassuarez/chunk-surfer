// Study-only neck envelope correction. All bytes outside JOINTS_0 / WEIGHTS_0
// are retained exactly, including mesh positions, four morphs and every clip.
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {parseCharacterAsset} from '../../src/render/character-asset.js';
const source=new URL('../../public/assets/pressure-character.glb',import.meta.url),dir=new URL('../../artifacts/hush-motion-study/rig/',import.meta.url);
const bytes=readFileSync(source),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),e=asset.entries[0],p=e.primitives[0],j=asset.json;
const raw=Buffer.from(bytes),jsonBytes=bytes.readUInt32LE(12),binaryStart=12+8+jsonBytes+8;
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
// Weld only exact positional UV splits; no proximity transfer across the shell.
const welded=new Map(),groups=[],vertexGroup=new Int32Array(p.vertexCount);
for(let v=0;v<p.vertexCount;v++){
 const key=Array.from(p.positions.subarray(v*3,v*3+3)).map(n=>n.toFixed(6)).join(',');
 if(!welded.has(key)){welded.set(key,groups.length);groups.push({vertices:[],position:Array.from(p.positions.subarray(v*3,v*3+3)),neighbors:new Set()});}
 const i=welded.get(key);vertexGroup[v]=i;groups[i].vertices.push(v);
}
for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){
 const a=vertexGroup[p.indices[i+k]],b=vertexGroup[p.indices[i+(k+1)%3]];if(a!==b){groups[a].neighbors.add(b);groups[b].neighbors.add(a);}
}
const count=e.skin.joints.length,names=e.skin.joints.map(n=>asset.nodes[n].name),chest=names.indexOf('chest'),allowed=new Set(['head','neck','chest','spine_upper']);
let weights=groups.map(g=>{
 const w=new Float64Array(count);for(const v of g.vertices)for(let k=0;k<4;k++)w[p.joints[v*4+k]]+=p.weights[v*4+k]/g.vertices.length;return w;
});
const original=weights.map(w=>w.slice());
const mask=groups.map(g=>{
 const [x,y]=g.position;
 return smooth((y-1.76)/.09)*smooth((2.14-y)/.08)*smooth((.25-Math.abs(x))/.09);
});
// In the fused collar centre, shoulder-specific influences are anatomically
// remapped to their chest parent before diffusion. The four shared influences
// avoid a hard fifth-influence truncation seam across adjacent triangles.
for(let i=0;i<groups.length;i++){
 const [x,y]=groups[i].position,core=smooth((.18-Math.abs(x))/.07)*smooth((y-1.80)/.07)*smooth((2.12-y)/.06);
 for(let k=0;k<count;k++)if(!allowed.has(names[k])){const a=weights[i][k]*core;weights[i][k]-=a;weights[i][chest]+=a;}
}
for(let pass=0;pass<18;pass++){
 const next=weights.map(w=>w.slice());
 for(let i=0;i<groups.length;i++)if(mask[i]>.0001){
  const near=[...groups[i].neighbors],w=weights[i],total=near.length;if(!total)continue;
  for(let k=0;k<count;k++){let sum=0;for(const n of near)sum+=weights[n][k];next[i][k]=w[k]*(1-.45*mask[i])+sum/total*(.45*mask[i]);}
 }
 weights=next;
}
function writeAccessor(index,values){
 const a=j.accessors[index],view=j.bufferViews[a.bufferView],bytesPer={5121:1,5123:2,5126:4}[a.componentType],width=4,stride=view.byteStride||bytesPer*width,offset=binaryStart+(view.byteOffset||0)+(a.byteOffset||0);
 assert(bytesPer);for(let v=0;v<a.count;v++)if(mask[vertexGroup[v]]>=.0001)for(let k=0;k<width;k++){
  const at=offset+v*stride+k*bytesPer,n=values[v*4+k];
  if(a.componentType===5121)raw.writeUInt8(n,at);else if(a.componentType===5123)raw.writeUInt16LE(n,at);else raw.writeFloatLE(n,at);
 }
 return{offset,end:offset+(a.count-1)*stride+bytesPer*width};
}
const joints=Array.from(p.joints),outWeights=Array.from(p.weights);let changedVertices=0,maxWeightDelta=0;
for(let v=0;v<p.vertexCount;v++){
 const g=vertexGroup[v];if(mask[g]<.0001)continue;
 const top=Array.from(weights[g],(w,k)=>({k,w})).sort((a,b)=>b.w-a.w).slice(0,4),sum=top.reduce((s,x)=>s+x.w,0);
 const ow=new Float64Array(count);for(let k=0;k<4;k++)ow[p.joints[v*4+k]]=p.weights[v*4+k];
 for(let k=0;k<4;k++){joints[v*4+k]=top[k].k;outWeights[v*4+k]=top[k].w/sum;}
 const nw=new Float64Array(count);for(let k=0;k<4;k++)nw[joints[v*4+k]]=outWeights[v*4+k];
 const delta=Math.max(...nw.map((w,k)=>Math.abs(w-ow[k])));maxWeightDelta=Math.max(maxWeightDelta,delta);if(delta>.000001)changedVertices++;
}
const prim=j.meshes[0].primitives[0],regions=[writeAccessor(prim.attributes.JOINTS_0,joints),writeAccessor(prim.attributes.WEIGHTS_0,outWeights)];
let changedBytes=0;for(let i=0;i<bytes.length;i++)if(bytes[i]!==raw[i]){assert(regions.some(r=>i>=r.offset&&i<r.end),'non-skin bytes changed');changedBytes++;}
const target=parseCharacterAsset(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));assert.deepEqual(asset.json,target.json,'GLB JSON/layout changed');
mkdirSync(dir,{recursive:true});writeFileSync(new URL('pressure-character-neck-study.glb',dir),raw);
const out={kind:'hush-neck-envelope-study',productionUntouched:true,source:source.pathname,sourceSha256:createHash('sha256').update(bytes).digest('hex'),studySha256:createHash('sha256').update(raw).digest('hex'),sourceBytes:bytes.length,studyBytes:raw.length,changedBytes,changedVertices,maxWeightDelta,weldedVertices:groups.length,outsideMaskVerticesByteIdentical:true,method:'Exact-position UV weld;18 geodesic adjacency weight-diffusion iterations at .45 within feathered collar mask y1.76–2.14m,abs(x)<.25m. Central collar maps secondary shoulder/other influences to chest;4 shared upper-neck influences avoid fifth-influence truncation seam. No positions, normals, morphs, clips, materials, UVs or inverse-bind bytes changed. Joint/weight attribute bytes outside the collar mask remain exact source bytes.',changedRanges:regions,limitations:['Art-directed local study correction, not a general skinning algorithm or production rollout.','Silhouette anatomy remains the approved mesh; changed animated envelope requires neutral and final-render review.']};
writeFileSync(new URL('neck-study-provenance.json',dir),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
