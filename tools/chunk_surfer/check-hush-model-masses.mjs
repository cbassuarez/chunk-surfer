import{readFileSync,writeFileSync}from'node:fs';import{createHash}from'node:crypto';import assert from'node:assert/strict';
import{parseCharacterAsset,sampleCharacterPose}from'../../src/render/character-asset.js';
const dir=new URL('../../artifacts/hush-model-directions/',import.meta.url),rows=[];
for(const id of['compression','cleft','brace','carrier']){
 const bytes=readFileSync(new URL(id+'.glb',dir)),a=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),e=a.entries[0],p=e.primitives[0],pose=sampleCharacterPose(a,e,{clip:'pressure_approach',time:1}),m=pose.bones.subarray(0,16),identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],maxBindError=Math.max(...m.map((v,k)=>Math.abs(v-identity[k]))),parent=Int32Array.from({length:p.vertexCount},(_,i)=>i),sizes=new Uint32Array(p.vertexCount).fill(1),edgeCounts=new Map();
 const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;},join=(x,y)=>{x=root(x);y=root(y);if(x!==y){parent[y]=x;sizes[x]+=sizes[y];}};
 for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){let x=p.indices[i+k],y=p.indices[i+(k+1)%3];join(x,y);const key=Math.min(x,y)*p.vertexCount+Math.max(x,y);edgeCounts.set(key,(edgeCounts.get(key)||0)+1);}
 const comps=[];for(let i=0;i<p.vertexCount;i++)if(root(i)===i)comps.push(sizes[i]);comps.sort((a,b)=>b-a);
 const data={id,sha256:createHash('sha256').update(bytes).digest('hex'),maxPelvisBindError:maxBindError,boundaryEdges:[...edgeCounts.values()].filter(n=>n===1).length,nonManifoldEdges:[...edgeCounts.values()].filter(n=>n>2).length,connectedComponents:comps};
 assert.equal(data.boundaryEdges,0,`${id} is not capped`);assert.equal(data.nonManifoldEdges,0,`${id} has nonmanifold edges`);assert.equal(comps.length,1,`${id} has disconnected anatomy`);assert(maxBindError<.00001);assert(p.vertexCount<50000);
 const first=sampleCharacterPose(a,e,{clip:'pressure_idle',time:0}),last=sampleCharacterPose(a,e,{clip:'pressure_idle',time:9.6});assert.deepEqual(first.bones,last.bones);assert.deepEqual(first.morphs,last.morphs);
 if(id==='cleft'){
  const probes=[];for(const y of[1.30,1.55,1.65,1.80])for(const x of[-.03,.02,.07]){
   let hits=0;for(let i=0;i<p.indices.length;i+=3){
    const[A,B,C]=Array.from(p.indices.subarray(i,i+3),v=>Array.from(p.positions.subarray(v*3,v*3+3))),d=(B[1]-C[1])*(A[0]-C[0])+(C[0]-B[0])*(A[1]-C[1]);if(Math.abs(d)<1e-10)continue;
    const u=((B[1]-C[1])*(x-C[0])+(C[0]-B[0])*(y-C[1]))/d,v=((C[1]-A[1])*(x-C[0])+(A[0]-C[0])*(y-C[1]))/d;if(u>=0&&v>=0&&u+v<=1)hits++;
   }probes.push({x,y,triangleIntersectionsAcrossFullDepth:hits,backgroundVisible:hits===0});
  }data.negativeSpaceProbes=probes;assert(probes.filter(p=>p.backgroundVisible).length>=6,'Cleft has lost its real through-gap');
 }
 rows.push(data);
}
const out={kind:'static-mass-loader-and-topology-check',meaning:'Actual exported character GLBs; all vertices, caps and constant clips checked. No animation, perception, navigation or production acceptance implied.',rows};
writeFileSync(new URL('geometry-validation.json',dir),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
