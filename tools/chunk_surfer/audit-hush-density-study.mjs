import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseCharacterAsset,sampleCharacterPose} from '../../src/render/character-asset.js';
import {prepareControllerFixture,poseFrameAt,authoredFrameAt,studyCameraAt} from '../../artifacts/hush-density-study/performance.js';
const base=new URL('../../artifacts/hush-density-study/',import.meta.url),h=b=>createHash('sha256').update(b).digest('hex');
async function asset(name){const b=await readFile(new URL(name,base));return {bytes:b,asset:parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))};}
const source=await asset('density-study.glb'),zoned=await asset('density-material-study.glb'),entry=source.asset.entries[0],p=entry.primitives[0];
assert.equal(entry.skin.joints.length,19);assert.equal(entry.morphCount,0);assert.equal(source.asset.clips.size,15);
for(const e of zoned.asset.entries){const q=e.primitives[0];for(const key of ['positions','normals','uvs','joints','weights'])if(p[key])assert.deepEqual(q[key],p[key]);}
const counts=new Map();for(let i=0;i<p.indices.length;i+=3){const k=Array.from(p.indices.slice(i,i+3)).join(',');counts.set(k,(counts.get(k)||0)+1);}
for(const name of ['density_core','density_return']){const q=zoned.asset.entries.find(e=>e.name===name).primitives[0];for(let i=0;i<q.indices.length;i+=3){const k=Array.from(q.indices.slice(i,i+3)).join(',');counts.set(k,(counts.get(k)||0)-1);}}
assert([...counts.values()].every(n=>n===0),'material zones must partition every original triangle exactly once');
const data=JSON.parse(await readFile(new URL('controller-fixtures.json',base),'utf8'));
const fixtures=Object.fromEntries(data.fixtures.map(f=>[f.id,prepareControllerFixture(f,Object.fromEntries([...source.asset.clips].map(([k,c])=>[k,c.duration])))]));
const modes=[];
for(const mode of ['phrase','phrase-still','encounter','obstructed','held','neutral']){
 let samples=0,maxRootError=0;
 for(let t=0;t<=20;t+=.037){const a=poseFrameAt(mode,t,fixtures);assert.deepEqual(a,poseFrameAt(mode,t,fixtures));const pose=sampleCharacterPose(source.asset,entry,a.character);assert(pose.bones.every(Number.isFinite));assert(!('support'in a.character));samples++;}
 if(fixtures[mode])for(const f of fixtures[mode].prepared){const a=poseFrameAt(mode,f.t,fixtures);maxRootError=Math.max(maxRootError,Math.hypot(a.root.x-f.x,a.root.z-f.z));}
 assert(maxRootError<1e-8);modes.push({mode,samples,deterministic:true,maxRootError});
}
assert.deepEqual(authoredFrameAt(0).root,authoredFrameAt(3).root);assert.equal(authoredFrameAt(22).root.z,-.84);
const root=poseFrameAt('phrase',7,fixtures).root;for(const camera of['front3','front6','quarter2','side3','walk']){studyCameraAt(camera,7);assert.deepEqual(poseFrameAt('phrase',7,fixtures).root,root);}
function skin(descriptor){const m=sampleCharacterPose(source.asset,entry,descriptor).bones,r=new Float32Array(p.positions.length);for(let i=0;i<p.vertexCount;i++)for(let k=0;k<4;k++){const j=p.joints[i*4+k]*16,w=p.weights[i*4+k],x=p.positions[i*3],y=p.positions[i*3+1],z=p.positions[i*3+2];r[i*3]+=w*(m[j]*x+m[j+4]*y+m[j+8]*z+m[j+12]);r[i*3+1]+=w*(m[j+1]*x+m[j+5]*y+m[j+9]*z+m[j+13]);r[i*3+2]+=w*(m[j+2]*x+m[j+6]*y+m[j+10]*z+m[j+14]);}return r;}
const neutral=skin({clip:'pressure_hold',time:0}),displacement=[];
for(const clip of[{clip:'density_retained',time:0},{clip:'pressure_load',time:.5},{clip:'density_clamp',time:.35}]){const r=skin(clip);let maximum=0;for(let i=0;i<r.length;i+=3)maximum=Math.max(maximum,Math.hypot(r[i]-neutral[i],r[i+1]-neutral[i+1],r[i+2]-neutral[i+2]));displacement.push({...clip,maximumFromNeutralM:maximum});}
const result={kind:'hush-density-bounded-audit',sourceSha256:h(source.bytes),materialVariantSha256:h(zoned.bytes),joints:19,clips:15,vertices:p.vertexCount,triangles:p.indices.length/3,materialZonePartitionExact:true,sharedVertexChannelsExact:true,cameraIndependentRoot:true,modes,displacement,scope:'Actual exported data and CPU pose/controller fixture checks. No native, full-route, auditory or human fear result.'};
await writeFile(new URL('performance-checks.json',base),JSON.stringify(result,null,2));console.log(JSON.stringify({modes:modes.length,samples:modes.reduce((n,m)=>n+m.samples,0),materialPartition:result.materialZonePartitionExact,source:result.sourceSha256,displacement},null,2));
