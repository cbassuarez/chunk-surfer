// Independent agent technical review. Offline exact exported-skin measures;
// not an external animation review, native acceptance or full playthrough.
import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{performance}from'node:perf_hooks';
import{parseCharacterAsset,sampleCharacterPose}from'../../src/render/character-asset.js';
import{pressureInstances}from'../../src/render/pressure-volume.js';
import{interpolatePressurePresentation}from'../../src/game/pressure-performance.js';
import{createTractionPerformance}from'../../artifacts/hush-motion-study/traction-performance.js';
const dir=new URL('../../artifacts/hush-motion-study/rig/',import.meta.url);
const load=p=>{const b=readFileSync(p);return parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const base=load(new URL('../../public/assets/pressure-character.glb',import.meta.url)),study=load(new URL('pressure-character-neck-study.glb',dir)),e=base.entries[0],p=e.primitives[0],fixtures=JSON.parse(readFileSync(new URL('../fixtures.json',dir)));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const quant=(v,u)=>{const a=[...v].sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.floor(a.length*u))]||0;};
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
function points(asset,instance){
 const e=asset.entries[0],p=e.primitives[0],po=sampleCharacterPose(asset,e,instance.character),out=new Float64Array(p.vertexCount*3),c=Math.cos(instance.yaw),s=Math.sin(instance.yaw),scale=instance.scale;
 for(let v=0;v<p.vertexCount;v++){
  const at=v*3;let x=p.positions[at],y=p.positions[at+1],z=p.positions[at+2];
  for(let m=0;m<e.morphCount;m++){const a=p.targets[m].positions;x+=a[at]*po.morphs[m];y+=a[at+1]*po.morphs[m];z+=a[at+2]*po.morphs[m];}
  let a=0,b=0,d=0;for(let j=0;j<4;j++){const i=p.joints[v*4+j]*16,w=p.weights[v*4+j],M=po.bones;a+=(M[i]*x+M[i+4]*y+M[i+8]*z+M[i+12])*w;b+=(M[i+1]*x+M[i+5]*y+M[i+9]*z+M[i+13])*w;d+=(M[i+2]*x+M[i+6]*y+M[i+10]*z+M[i+14])*w;}
  out[at]=(c*a-s*d)*scale;out[at+1]=b*scale;out[at+2]=(s*a+c*d)*scale;
 }
 return{points:out,morphs:Array.from(po.morphs)};
}
const hold=points(base,{character:{clip:'pressure_hold',time:0},yaw:0,scale:1}).points;
const neckEdges=[],edgeSeen=new Set();for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){
 const a=p.indices[i+k],b=p.indices[i+(k+1)%3],key=Math.min(a,b)*p.vertexCount+Math.max(a,b);if(edgeSeen.has(key))continue;edgeSeen.add(key);
 const isNeck=v=>hold[v*3+1]>1.76&&hold[v*3+1]<2.14&&Math.abs(hold[v*3])<.25;
 const length=Math.hypot(hold[a*3]-hold[b*3],hold[a*3+1]-hold[b*3+1],hold[a*3+2]-hold[b*3+2]);if(isNeck(a)&&isNeck(b)&&length>.005)neckEdges.push({a,b,length});
}
function maximumNeckStrain(P,scale){let max=0;for(const e of neckEdges){const l=Math.hypot(P[e.a*3]-P[e.b*3],P[e.a*3+1]-P[e.b*3+1],P[e.a*3+2]-P[e.b*3+2]);max=Math.max(max,l/(e.length*scale));}return max;}
const soles={};for(const side of['L','R']){const js=new Set(e.skin.joints.flatMap((n,i)=>new RegExp(`^(?:foot|toe)_${side}$`).test(base.nodes[n].name)?[i]:[]));let low=Infinity,vs=[];for(let v=0;v<p.vertexCount;v++){let w=0;for(let k=0;k<4;k++)if(js.has(p.joints[v*4+k]))w+=p.weights[v*4+k];if(w>.95){low=Math.min(low,hold[v*3+1]);vs.push(v);}}soles[side]=vs.filter(v=>hold[v*3+1]<low+.008);}
const centroid=(P,vs,root)=>vs.reduce((s,v)=>s.map((x,k)=>x+(P[v*3+k]+root[k])/vs.length),[0,0,0]);
const arrestedPoints=points(base,{character:{clip:'pressure_arrest',time:1},yaw:0,scale:1}).points;
const referenceSoles=Object.fromEntries(['L','R'].map(side=>[side,centroid(arrestedPoints,soles[side],[0,0,0])]));
function anchorError(actor,instance,P){
 const g=actor.performance.gait;if(!g||!instance.character.support)return null;let worst=0,samples=0;
 for(const contact of instance.character.support.contacts){
  if(contact.weight<.999)continue;const left=contact.side==='L',yaw=left?g.targetHeading:g.startHeading,travel=left&&!g.pivot?(g.stepDistanceMetres??.42):0;
  const root=[(g.stepStartX+.5)*.5+Math.sin(g.targetHeading)*travel,actor.floorH,(g.stepStartY+.5)*.5-Math.cos(g.targetHeading)*travel],q=referenceSoles[contact.side].map(v=>v*instance.scale),c=Math.cos(yaw),s=Math.sin(yaw),expected=[root[0]+c*q[0]-s*q[2],root[1]+q[1],root[2]+s*q[0]+c*q[2]],actual=centroid(P,soles[contact.side],[instance.x,instance.y,instance.z]);
  worst=Math.max(worst,distance(actual,expected));samples++;
 }
 return samples?worst:null;
}
function summarize(rows){const values=rows.map(x=>x.value);return{p50:quant(values,.5),p95:quant(values,.95),max:Math.max(...values),worst:rows.reduce((a,b)=>!a||b.value>a.value?b:a,null)};}
function atTime(frames,t,key='actor'){let i=0;while(i+1<frames.length&&frames[i+1].t<t-1e-8)i++;if(i+1>=frames.length)return structuredClone(frames.at(-1)[key]||frames.at(-1).actor);const a=frames[i],b=frames[i+1],u=(t-a.t)/(b.t-a.t);return interpolatePressurePresentation({clock:a.t,primary:a[key]||a.actor},{clock:b.t,primary:b[key]||b.actor},Math.max(0,Math.min(1,u))).primary;}
const results=[];for(const fixture of fixtures){
 const driver=createTractionPerformance(),rows={baseline:[],candidate:[]},details={},absent={baseline:0,candidate:0};let maxSoleDifference=0,maxRootDifference=0;
 for(let n=0,t=fixture.frames[0].t;t<=fixture.frames.at(-1).t+1e-8;n++,t=fixture.frames[0].t+n*.02){
  const actor=atTime(fixture.frames,t),candidateActor=atTime(fixture.frames,t,'proposedActor'),baseline=pressureInstances(actor,null)[0],candidate=driver.tick(n?.02:0,candidateActor),pair={baseline:{instance:baseline,diagnostics:null},candidate},frameSkins={};
  for(const [name,entry]of Object.entries(pair)){
   if(!entry.instance){details[name]=null;absent[name]++;continue;}const renderActor=name==='baseline'?actor:candidateActor,instance=entry.instance,skin=points(name==='baseline'?base:study,instance),root=[instance.x,instance.y,instance.z],previous=details[name],row={t,root,heading:instance.yaw,skin,morphs:skin.morphs,diagnostics:entry.diagnostics};frameSkins[name]=row;
   if(previous){
    const rootDelta=root.map((v,k)=>v-previous.root[k]),rootTravel=Math.hypot(...rootDelta),dt=t-previous.t;let maxPose=0,maxWorld=0;
    for(let v=0;v<p.vertexCount;v++){const at=v*3,dx=skin.points[at]-previous.skin.points[at],dy=skin.points[at+1]-previous.skin.points[at+1],dz=skin.points[at+2]-previous.skin.points[at+2];maxPose=Math.max(maxPose,Math.hypot(dx,dy,dz));maxWorld=Math.max(maxWorld,Math.hypot(dx+rootDelta[0],dy+rootDelta[1],dz+rootDelta[2]));}
    rows[name].push({t,dt,rootTravelMetres:rootTravel,zeroMotion:rootTravel<1e-7,maxRootRelativeSurfaceMetres:maxPose,maxWorldSurfaceMetres:maxWorld,maxNeckEdgeStretch:maximumNeckStrain(skin.points,instance.scale),fullWeightSoleAnchorErrorMetres:anchorError(renderActor,instance,skin.points),headingChangeRadians:Math.abs(angle(instance.yaw-previous.heading)),footCentroidTravelMetres:Object.fromEntries(['L','R'].map(s=>[s,distance(centroid(skin.points,soles[s],root),centroid(previous.skin.points,soles[s],previous.root))])),phaseClip:name==='candidate'&&!renderActor.performance.gait?'continuous-study-clock':renderActor.performance.clip,phaseSeconds:entry.diagnostics?.phaseSeconds??renderActor.performance.time,cycleRate:entry.diagnostics?.cycleRate,visualHeadingLag:entry.diagnostics?.visualHeadingLag,gaitPhase:renderActor.performance.gait?.phase,gaitElapsed:renderActor.performance.gait?.elapsed,gaitDuration:renderActor.performance.gait?.duration,gaitPivot:renderActor.performance.gait?.pivot});
   }
   details[name]=row;
  }
  if(frameSkins.baseline&&frameSkins.candidate){const a=frameSkins.baseline,b=frameSkins.candidate;maxRootDifference=Math.max(maxRootDifference,distance(a.root,b.root));for(const side of['L','R'])maxSoleDifference=Math.max(maxSoleDifference,distance(centroid(a.skin.points,soles[side],a.root),centroid(b.skin.points,soles[side],b.root)));}
 }
 const summary={};for(const[name,list]of Object.entries(rows)){
  const convert=key=>summarize(list.map(r=>({value:r[key],t:r.t,rootTravelMetres:r.rootTravelMetres}))),still=list.filter(r=>r.zeroMotion);
  summary[name]={frames:list.length,absentFrames:absent[name],dtSeconds:.02,rootRelativeSurfaceDeltaMetres:convert('maxRootRelativeSurfaceMetres'),worldSurfaceDeltaMetres:convert('maxWorldSurfaceMetres'),maximumNeckEdgeStretch:convert('maxNeckEdgeStretch'),maximumFullWeightSoleAnchorErrorMetres:list.reduce((s,r)=>Math.max(s,r.fullWeightSoleAnchorErrorMetres||0),0),headingChangeRadians:convert('headingChangeRadians'),zeroMotionFrames:still.length,zeroMotionMaxSurfaceMetres:still.reduce((s,r)=>Math.max(s,r.maxWorldSurfaceMetres),0),zeroMotionMaxPhaseJumpSeconds:still.reduce((s,r)=>{const i=list.indexOf(r);return i?Math.max(s,Math.abs(r.phaseSeconds-list[i-1].phaseSeconds)):s;},0),zeroMotionMaxSameClipPhaseAdvanceSeconds:still.reduce((s,r)=>{const i=list.indexOf(r);return i&&r.phaseClip===list[i-1].phaseClip?Math.max(s,r.phaseSeconds-list[i-1].phaseSeconds):s;},0),stopBoundaryFrames:list.filter((r,i)=>i&&r.zeroMotion&&!list[i-1].zeroMotion),phaseBoundaryFrames:list.filter((r,i)=>i&&r.gaitPhase&&r.gaitPhase!==list[i-1].gaitPhase),cornerFrames:list.filter(r=>r.headingChangeRadians>.035),maxCycleRate:list.reduce((s,r)=>Math.max(s,r.cycleRate||0),0),maxVisualHeadingLag:list.reduce((s,r)=>Math.max(s,Math.abs(r.visualHeadingLag||0)),0)};
 }
 results.push({id:fixture.id,qualification:fixture.qualification,comparisonContract:fixture.frames.some(f=>f.proposedActor)?'Explicit altered-timing proposal; candidate consumes proposedActor, so root-path differences are expected.':'Identical authoritative root/phase; presentation-only comparison.',resampling:'Production pressure-presentation interpolation sampled at50Hz; candidate re-evaluated at50Hz. This is an offline controller fixture, not ordinary-control play.',candidateVsBaseline:{maximumRootDifferenceMetres:maxRootDifference,maximumSoleCentroidDifferenceMetres:maxSoleDifference},summary,rows});
}
// Actual render-descriptor correction weights against raw authored clip weights.
function neckStrain(asset,instance){const P=points(asset,instance).points,ratios=neckEdges.map(e=>Math.hypot(P[e.a*3]-P[e.b*3],P[e.a*3+1]-P[e.b*3+1],P[e.a*3+2]-P[e.b*3+2])/e.length);return{p95:quant(ratios,.95),p99:quant(ratios,.99),max:Math.max(...ratios)};}
const morphSuppression=[],actualNeckMeasures=[];for(const[clip,c]of base.clips)for(const phase of[0,.25,.5,.75,1]){
 const actor={id:'raw-runtime-comparison',x:-.5,y:-.5,floorH:0,heightM:2.18,strength:1,performance:{version:1,role:'court-trace',heading:0,clip,time:c.duration*phase,loop:false,seed:0,manifestation:1,motion:'idle',cue:null,reducedMotion:false}},actual=pressureInstances(actor,null)[0],raw=sampleCharacterPose(base,e,{clip,time:c.duration*phase});
 morphSuppression.push({clip,phase,raw:Array.from(raw.morphs),runtime:Array.from(sampleCharacterPose(base,e,actual.character).morphs)});
 if(['pressure_load','pressure_advance','pressure_arrest','pressure_pivot'].includes(clip)){
  const rawInstance={...actual,character:{clip,time:c.duration*phase,loop:false}};
  actualNeckMeasures.push({clip,phase,rawClip:{baseline:neckStrain(base,rawInstance),weightStudy:neckStrain(study,rawInstance)},actualRuntime:{baseline:neckStrain(base,actual),weightStudy:neckStrain(study,actual)}});
 }
}
// CPU sampler benchmark only: warmed same process, not a GPU or renderer cost.
const sampleFixture=fixtures.find(f=>f.id==='source-speed-sweep'),actor=sampleFixture.frames.find(f=>f.t>5).actor,driver=createTractionPerformance();driver.tick(.02,actor);const candidate=driver.tick(.02,{...actor,y:actor.y-.252}).instance,baseline=pressureInstances(actor,null)[0],bench={};
for(const[name,descriptor]of[['baseline',baseline.character],['candidate',candidate.character]]){
 const asset=name==='baseline'?base:study,entry=asset.entries[0];for(let i=0;i<100;i++)sampleCharacterPose(asset,entry,descriptor);const samples=[];for(let i=0;i<500;i++){const start=performance.now();sampleCharacterPose(asset,entry,descriptor);samples.push(performance.now()-start);}bench[name]={samples:samples.length,p50Milliseconds:quant(samples,.5),p95Milliseconds:quant(samples,.95),maximumMilliseconds:Math.max(...samples)};
}
const output={kind:'independent-agent-traction-skin-review',candidateSha256:hash(new URL('../traction-performance.js',dir)),fixtureSha256:hash(new URL('../fixtures.json',dir)),assetHashes:{productionGLB:hash(new URL('../../public/assets/pressure-character.glb',import.meta.url)),studyGLB:hash(new URL('pressure-character-neck-study.glb',dir)),exactMorphCurves:hash(new URL('../traction-morph-curves.js',dir))},method:'Every exported vertex sampled through production CPU deformation at50Hz; beforeusesproductionGLB,afterusesneckstudyGLB. Surface differences are measured after bone,morph,instanceyaw,scale and root transforms.',results,morphSuppression,actualNeckMeasures,perPoseSamplingBenchmark:bench,limits:['Independent agent technical review; not an external technical animator or fresh-player test.','CPU timings are a small warmed-process benchmark during shared work, not native frame cost.','FiftyHz interpolation is documented; exact source-II record timestamps originate at60Hz.','No swept triangle/self-collision or anatomical mass distribution proof.','Ordinary zero-root-motion phases can include an intentional pivot or upper-body loading; phase-freeze acceptance applies to continuous Source travel.']};
writeFileSync(new URL('traction-technical-review.json',dir),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({candidateSha256:output.candidateSha256,results:results.map(x=>({id:x.id,summary:x.summary})),perPoseSamplingBenchmark:bench},null,2));
