// Offline measurement of the delivered GLB through the production CPU sampler.
// No production assets or gameplay state are mutated.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCharacterAsset, sampleCharacterPose } from '../../src/render/character-asset.js';
const bytes=readFileSync(process.argv[2] || new URL('../../public/assets/pressure-character.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const body=asset.entries[0], p=body.primitives[0];
const d=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
const q=(values,u)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*u))];
function deform(v,pose){
 const a=Array.from(p.positions.subarray(v*3,v*3+3));
 for(let m=0;m<body.morphCount;m++)for(let k=0;k<3;k++)a[k]+=p.targets[m].positions[v*3+k]*pose.morphs[m];
 const out=[0,0,0];for(let j=0;j<4;j++){const at=p.joints[v*4+j]*16,w=p.weights[v*4+j];for(let k=0;k<3;k++)out[k]+=(pose.bones[at+k]*a[0]+pose.bones[at+4+k]*a[1]+pose.bones[at+8+k]*a[2]+pose.bones[at+12+k])*w;}return out;
}
const pose=(clip,time)=>sampleCharacterPose(asset,body,{clip,time,loop:false});
const hold=pose('pressure_hold',0),arrest=pose('pressure_arrest',1);
const holdPoints=Array.from({length:p.vertexCount},(_,v)=>deform(v,hold));
const soles={};for(const side of ['L','R']){
 const js=new Set(body.skin.joints.flatMap((n,i)=>new RegExp(`^(?:foot|toe)_${side}$`).test(asset.nodes[n].name)?[i]:[]));
 const vs=holdPoints.flatMap((a,v)=>{let w=0;for(let j=0;j<4;j++)if(js.has(p.joints[v*4+j]))w+=p.weights[v*4+j];return w>.95?[{v,a}]:[]});
 const low=Math.min(...vs.map(x=>x.a[1]));soles[side]=vs.filter(x=>x.a[1]<low+.008).map(x=>x.v);
}
const centroid=(vs,a)=>vs.reduce((sum,v)=>sum.map((x,k)=>x+deform(v,a)[k]/vs.length),[0,0,0]);
function compare(a,b){const distances=Array.from({length:p.vertexCount},(_,v)=>d(deform(v,a),deform(v,b)));return{maxMetres:Math.max(...distances),p95Metres:q(distances,.95),rmsMetres:Math.sqrt(distances.reduce((s,v)=>s+v*v,0)/distances.length),soleCentroidDeltaMetres:Object.fromEntries(['L','R'].map(s=>[s,d(centroid(soles[s],a),centroid(soles[s],b))]))};}
const transitions={};
for(const [name,a,b] of [
 ['arrest_to_load',arrest,pose('pressure_load',0)],
 ['load_to_advance',pose('pressure_load',.5),pose('pressure_advance',0)],
 ['advance_to_arrest',pose('pressure_advance',.72),arrest],
 ['source_stationary_hold_to_approach_start',hold,pose('pressure_approach',0)],
 ['reduced_motion_hold_vs_arrest',hold,arrest]
])transitions[name]=compare(a,b);
const approachStops=[];for(let n=0;n<=40;n++){const phase=n/40;approachStops.push({phase,...compare(pose('pressure_approach',2.4*phase),hold)});}
const edges=[],seen=new Set();for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){const a=p.indices[i+k],b=p.indices[i+(k+1)%3],key=Math.min(a,b)*p.vertexCount+Math.max(a,b),length=d(holdPoints[a],holdPoints[b]);if(seen.has(key)||length<.005)continue;seen.add(key);edges.push({a,b,length});}
const neck=v=>{const x=holdPoints[v];return x[1]>1.76&&x[1]<2.14&&Math.abs(x[0])<.25;};
const neckEdge=e=>neck(e.a)&&neck(e.b),extensions=[];
for(const [clip,c]of asset.clips){let worst={ratio:0},minRatio=Infinity,all=[],neckAll=[];for(const phase of [0,.125,.25,.375,.5,.625,.75,.875,1]){const po=pose(clip,c.duration*phase),points=Array.from({length:p.vertexCount},(_,v)=>deform(v,po));for(const e of edges){const ratio=d(points[e.a],points[e.b])/e.length;all.push(ratio);if(neckEdge(e))neckAll.push(ratio);minRatio=Math.min(minRatio,ratio);if(ratio>worst.ratio)worst={ratio,phase,a:e.a,b:e.b,restLengthMetres:e.length,region:neckEdge(e)?'neck-collar':'other',positionA:holdPoints[e.a],positionB:holdPoints[e.b]};}}extensions.push({clip,p95Ratio:q(all,.95),p99Ratio:q(all,.99),minRatio,worst,neck:{p95Ratio:q(neckAll,.95),p99Ratio:q(neckAll,.99),maxRatio:neckAll.reduce((a,b)=>Math.max(a,b),0)}});}
// Moving Source animation has distance phase but no world support anchors.
// Measure one declared straight planted interval, then the identical root path
// with the ordinary follower's maximum 1.8 rad/s heading change.
const turning=[];for(const speed of [.2083333333,1.4,4.1,6.3,18]){
 const turnRate=1.8,phaseStart=.36,phaseEnd=.58,distanceMetres=.5*(phaseEnd-phaseStart),duration=distanceMetres/speed;
 const startPose=pose('pressure_approach',2.4*phaseStart),a=centroid(soles.L,startPose);
 const endPose=pose('pressure_approach',2.4*phaseEnd),b=centroid(soles.L,endPose),yaw=turnRate*duration;
 const end=[Math.cos(yaw)*b[0]-Math.sin(yaw)*b[2],b[1],Math.sin(yaw)*b[0]+Math.cos(yaw)*b[2]-distanceMetres];
 turning.push({speedMetresPerSecond:speed,plantedWindowSeconds:duration,headingDeltaRadians:yaw,soleDriftMetres:d(a,end),cyclesPerSecond:speed/.5,framesPerCycleAt60:60/(speed/.5)});
}
const firstFrame=Object.fromEntries(['L','R'].map(s=>[s,{hold:centroid(soles[s],hold),arrest:centroid(soles[s],arrest),approach:centroid(soles[s],pose('pressure_approach',0))}]));
const rawWeightSums=[];for(let v=0;v<p.vertexCount;v++)rawWeightSums.push(p.weights.subarray(v*4,v*4+4).reduce((s,w)=>s+w,0));
const output={kind:'hush-offline-production-rig-audit',assetSha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,vertices:p.vertexCount,triangles:p.indices.length/3,joints:body.skin.joints.length,morphs:body.morphNames,clips:[...asset.clips].map(([name,c])=>({name,duration:c.duration,channels:c.channels.length,sampleCounts:[...new Set(c.channels.map(ch=>ch.times.length))]})),weightSums:{min:Math.min(...rawWeightSums),max:Math.max(...rawWeightSums)},soleVertexCounts:Object.fromEntries(Object.entries(soles).map(([s,vs])=>[s,vs.length])),firstFrame,transitions,approachStops:{minMaxMetres:Math.min(...approachStops.map(x=>x.maxMetres)),maxMaxMetres:Math.max(...approachStops.map(x=>x.maxMetres)),samples:approachStops},extensions,sourceTurningSynthetic:turning,limitations:['CPU measurements use the exact production deformation sampler and actual delivered GLB.','Synthetic Source turn probes are not earned gameplay or camera-perception evidence.','Maximum edge stretch is diagnostic, not proof of a visible defect; 8x current test threshold is not a perceptual standard.','No human review, native footage or source regeneration performed.']};
mkdirSync(new URL('../../artifacts/hush-motion-study/rig/',import.meta.url),{recursive:true});
writeFileSync(process.argv[3] || new URL('../../artifacts/hush-motion-study/rig/production-rig-audit.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({bytes:output.bytes,transitions,approachStops:{min:output.approachStops.minMaxMetres,max:output.approachStops.maxMaxMetres},extensions,sourceTurningSynthetic:turning},null,2));
