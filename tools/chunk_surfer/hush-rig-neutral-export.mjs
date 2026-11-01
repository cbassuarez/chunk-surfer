import{readFileSync,writeFileSync}from'node:fs';
import{parseCharacterAsset,sampleCharacterPose}from'../../src/render/character-asset.js';
const dir=new URL('../../artifacts/hush-motion-study/rig/',import.meta.url);
for(const name of ['baseline','neck-study']){
 const b=readFileSync(name==='baseline'?new URL('../../public/assets/pressure-character.glb',import.meta.url):new URL('pressure-character-neck-study.glb',dir)),a=parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),e=a.entries[0],p=e.primitives[0];
 const frames=[];for(const[clip,time]of[['pressure_advance',.54],['pressure_load',.5],['pressure_hold',0]]){
  const pose=sampleCharacterPose(a,e,{clip,time}),points=[];
  for(let v=0;v<p.vertexCount;v++){
   const q=Array.from(p.positions.subarray(v*3,v*3+3));for(let m=0;m<e.morphCount;m++)for(let k=0;k<3;k++)q[k]+=p.targets[m].positions[v*3+k]*pose.morphs[m];
   const out=[0,0,0];for(let j=0;j<4;j++){const at=p.joints[v*4+j]*16,w=p.weights[v*4+j];for(let k=0;k<3;k++)out[k]+=(pose.bones[at+k]*q[0]+pose.bones[at+4+k]*q[1]+pose.bones[at+8+k]*q[2]+pose.bones[at+12+k])*w;}points.push(out);
  }
  frames.push({clip,time,points});
 }
 writeFileSync(new URL(`neutral-${name}-geometry.json`,dir),JSON.stringify({kind:'production-sampler-neutral-export',name,frames,indices:Array.from(p.indices)})+'\n');
}
