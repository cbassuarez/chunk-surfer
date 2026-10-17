import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalAnatomy,retargetMesh} from '../tools/chunk_surfer/characters/vigil-tailoring.mjs';
import {retainedBody,fittedProxyGarment,fitClothToEnvelope} from '../tools/chunk_surfer/characters/vigil-body-fit.mjs';
import {extendOuterwear} from '../tools/chunk_surfer/characters/vigil-garment-drape.mjs';
import {VIGIL_CHARACTER_DESIGNS} from '../src/data/vigil-character-design.js';
import {vigilCharacterPose} from '../src/render/vigil-character-performance.js';
import {VIGIL_VOICES} from '../src/data/exterior-vigil.js';

const sources={woman:canonicalAnatomy(JSON.parse(fs.readFileSync(new URL('../artifacts/bus-woman-production/anatomy.json',import.meta.url)))),man:canonicalAnatomy(JSON.parse(fs.readFileSync(new URL('../public/assets/recordist-characters/contractor.json',import.meta.url))))};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],distance=(a,b)=>Math.hypot(...sub(a,b));
const rotate=(p,q)=>{const t=mul(cross(q,p),2);return add(p,add(mul(t,q[3]),cross(q,t)));};
const armWeight=(mesh,bones,id)=>{let n=0;for(let slot=0;slot<4;slot++)if(/^(upperarm|forearm|hand|thumb|index|middle|ring|little)/.test(bones[mesh.skinIndex[id*4+slot]]?.name||''))n+=mesh.skinWeight[id*4+slot];return n;};
function skinned(mesh,bones,pose){const out=[];for(let id=0;id<mesh.positions.length/3;id++){const p=mesh.positions.slice(id*3,id*3+3),point=[0,0,0];for(let slot=0;slot<4;slot++){const at=id*4+slot,w=mesh.skinWeight[at],bone=bones[mesh.skinIndex[at]],joint=pose.joints['vigil_'+pose.id+'_'+bone.name];if(!w)continue;const transformed=add(add(bone.head,joint.translation),rotate(sub(p,bone.head),joint.rotation));for(let axis=0;axis<3;axis++)point[axis]+=w*transformed[axis];}out.push(...point);}return out;}
function convexHull(points){const p=[...new Map(points.map(p=>[p.map(v=>Math.round(v*1e7)).join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),turn=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),a=[],b=[];for(const v of p){while(a.length>1&&turn(a.at(-2),a.at(-1),v)<=0)a.pop();a.push(v);}for(const v of p.toReversed()){while(b.length>1&&turn(b.at(-2),b.at(-1),v)<=0)b.pop();b.push(v);}return a.slice(0,-1).concat(b.slice(0,-1));}
function section(mesh,bones,y,positions=mesh.positions,outerCount=Infinity){
 const points=[],segments=[];
 for(let i=0;i<mesh.indices.length;i+=3){
  const ids=mesh.indices.slice(i,i+3);if(ids.some(id=>id>=outerCount)||ids.reduce((n,id)=>n+armWeight(mesh,bones,id),0)/3>.15)continue;
  const p=ids.map(id=>positions.slice(id*3,id*3+3)),hits=[];
  for(let edge=0;edge<3;edge++){const a=p[edge],b=p[(edge+1)%3];if((a[1]<y)===(b[1]<y)||Math.abs(a[1]-b[1])<1e-9)continue;const t=(y-a[1])/(b[1]-a[1]);hits.push([a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t]);}
  points.push(...hits);if(hits.length>=2)segments.push([hits[0],hits[1]]);
 }
 const out=convexHull(points);out.segments=segments;return out;
}
function ray(polygon,center,direction,exact=false){
 let hit=0;const edges=exact?polygon.segments:polygon.map((p,i)=>[p,polygon[(i+1)%polygon.length]]);
 for(const[first,last]of edges){const a=sub(first,center),b=sub(last,center),edge=sub(b,a),den=direction[0]*edge[1]-direction[1]*edge[0];if(Math.abs(den)<1e-9)continue;const r=(a[0]*edge[1]-a[1]*edge[0])/den,t=(a[0]*direction[1]-a[1]*direction[0])/den;if(r>0&&t>=0&&t<=1)hit=Math.max(hit,r);}return hit;
}
function mergeBodyAndPants(body,pants){const out={...body,positions:[...body.positions],indices:[...body.indices],skinIndex:[...body.skinIndex],skinWeight:[...body.skinWeight]};for(const mesh of pants){const offset=out.positions.length/3;out.positions.push(...mesh.positions);out.indices.push(...mesh.indices.map(id=>id+offset));out.skinIndex.push(...mesh.skinIndex);out.skinWeight.push(...mesh.skinWeight);}return out;}
const proof=[];
for(const[id,design]of Object.entries(VIGIL_CHARACTER_DESIGNS)){
 const source=sources[design.source],body=retainedBody(source,design),asset=['folder','umbrella','photographs'].includes(design.object)?'male_elegantsuit01':'male_casualsuit01',proxy=fittedProxyGarment(source,design,asset),pants=source.meshes.filter(m=>/tailored-trousers|denim-trousers/.test(m.name)).map(m=>retargetMesh(m,source,source,design)),envelope=mergeBodyAndPants(body,pants),before=JSON.stringify([proxy.positions,proxy.indices,proxy.skinIndex,proxy.skinWeight]),poses=[vigilCharacterPose(id,{rig:body.bones}),...['weight-shift',Object.values(VIGIL_VOICES).find(v=>v.mesh===design.mesh).actionSet[0]].map(action=>vigilCharacterPose(id,{action,progress:.5,rig:body.bones}))],draped=extendOuterwear(proxy,body.bones,design,{body:envelope}),coat=fitClothToEnvelope(draped,envelope,{ease:.012,poses,bones:body.bones}),n=coat.drape.outerVertices;
 assert.equal(JSON.stringify([proxy.positions,proxy.indices,proxy.skinIndex,proxy.skinWeight]),before,id+' mutated the native proxy');
 assert.equal(coat.drape.waistLoops,1,id+' does not continue from one closed torso contour');
 assert.ok(coat.drape.rimVertices>=60,id+' lost the native waist contour');
 assert.equal(coat.positions.length/3,n*2,id+' is missing its physical inner surface');
 const edges=new Map();for(let i=0;i<coat.indices.length;i+=3)for(let j=0;j<3;j++){const a=coat.indices[i+j],b=coat.indices[i+(j+1)%3],key=a<b?a+':'+b:b+':'+a,old=edges.get(key)||{count:0,winding:0};old.count++;old.winding+=a<b?1:-1;edges.set(key,old);}for(const edge of edges.values()){assert.equal(edge.count,2,id+' has an open or nonmanifold seam');assert.equal(edge.winding,0,id+' has a reversed sewn face');}
 const proxyPoints=new Map(Array.from({length:proxy.positions.length/3},(_,i)=>[proxy.sourceVertexIndices[i],proxy.positions.slice(i*3,i*3+3)]));let retained=0,unchangedUpper=0;
 for(let vertex=0;vertex<n;vertex++){
  const outer=coat.positions.slice(vertex*3,vertex*3+3),inner=coat.positions.slice((vertex+n)*3,(vertex+n)*3+3);
  assert.ok(outer.every(Number.isFinite)&&inner.every(Number.isFinite),id+' has invalid garment geometry');
  assert.ok(Math.abs(distance(outer,inner)-.0025)<1e-8,id+' lost its 2.5 mm sewn thickness');
  for(const v of[vertex,vertex+n]){const weights=coat.skinWeight.slice(v*4,v*4+4);assert.ok(weights.every(w=>Number.isFinite(w)&&w>=0));assert.ok(Math.abs(weights.reduce((n,w)=>n+w,0)-1)<1e-8,id+' has unnormalized clothing skin weights');assert.ok(coat.skinIndex.slice(v*4,v*4+4).every(j=>j>=0&&j<body.bones.length));}
  if(coat.sourceVertexIndices[vertex]>=0){const original=proxyPoints.get(coat.sourceVertexIndices[vertex]);assert.ok(original,id+' lost its retained garment correspondence');if(original[1]>body.bones.find(b=>b.name==='chest').head[1]+.03||armWeight(coat,body.bones,vertex)>.35){assert.ok(distance(outer,original)<1e-8,id+' moved an authored shoulder/sleeve vertex');unchangedUpper++;}retained++;}
 }
 assert.ok(retained>2000,id+' replaced the fitted proxy with a procedural shell');assert.ok(unchangedUpper>1200,id+' lost its native shoulders or sleeves');
 // The rejected coat reached 24–34 cm behind the torso. Check sections of the
 // actual upper garment, excluding sleeve volume, against that visible defect.
 const chest=body.bones.find(b=>b.name==='chest'),pelvis=body.bones.find(b=>b.name==='pelvis');let back=-Infinity,maxDepth=0;
 for(const fraction of[.25,.5,.75]){const y=coat.drape.cutY+(chest.tail[1]-.08-coat.drape.cutY)*fraction,p=section(coat,body.bones,y,coat.positions,n);assert.ok(p.length>=4,id+' has no continuous torso section');back=Math.max(back,...p.map(p=>p[1]));maxDepth=Math.max(maxDepth,Math.max(...p.map(p=>p[1]))-Math.min(...p.map(p=>p[1])));}
 assert.ok(back<.21,id+' regressed to an inflated upper back: '+back.toFixed(3)+' m');assert.ok(maxDepth<.37,id+' regressed to a rigid barrel torso: '+maxDepth.toFixed(3)+' m');
 const pose={...vigilCharacterPose(id,{rig:body.bones}),id},posedCoat=skinned(coat,body.bones,pose),posedEnvelope=skinned(envelope,body.bones,pose);let minimumClearance=Infinity,waistDeviation=0;
 if(coat.drape.cutY-design.hem>.05){
  const contours=[-.018,0,.018].map(offset=>section(coat,body.bones,coat.drape.cutY+offset,posedCoat,n)).map(p=>[Math.min(...p.map(p=>p[0])),Math.max(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1])),Math.max(...p.map(p=>p[1]))]);
  waistDeviation=Math.max(...contours[1].map((v,i)=>Math.abs(v-(contours[0][i]+contours[2][i])/2)));
  assert.ok(waistDeviation<.009,id+' has a visible rigid waist hinge: '+(waistDeviation*1000).toFixed(1)+' mm contour deviation');
 }

 const hemVertices=coat.drape.panelRows?Array.from({length:coat.drape.rimVertices},(_,i)=>n-coat.drape.rimVertices+i):Array.from({length:n},(_,i)=>i).filter(i=>Math.abs(draped.positions[i*3+1]-coat.drape.cutY)<1e-6&&armWeight(coat,body.bones,i)<.15);let worstAction=null,worstY=null;
 assert.ok(hemVertices.length>=60,id+' has no sewn hem contour');
 for(const action of[null,...Object.values(VIGIL_VOICES).find(v=>v.mesh===design.mesh).actionSet]){
  const active={...vigilCharacterPose(id,{action,progress:.5,rig:body.bones}),id},coatPositions=action?skinned(coat,body.bones,active):posedCoat,envelopePositions=action?skinned(envelope,body.bones,active):posedEnvelope;
  // A tilted hem deliberately reveals the trousers below it. Sample only
  // planes where the entire circumference is actually covered by outerwear.
  const hemTop=Math.max(...hemVertices.map(i=>coatPositions[i*3+1])),lowerBand=Math.max(hemTop+.012,coat.drape.hipY-.10),upperBand=Math.min(chest.head[1]-.045,pelvis.head[1]+.12),bandSteps=Math.max(1,Math.ceil((upperBand-lowerBand)/.025)),heights=Array.from({length:bandSteps+1},(_,i)=>lowerBand+(upperBand-lowerBand)*i/bandSteps);
  if(upperBand<=lowerBand)continue;
  for(const y of heights){
   const inside=section(envelope,body.bones,y,envelopePositions),outside=section(coat,body.bones,y,coatPositions,n);assert.ok(inside.length>=4&&outside.length>=4,id+' missing hip section');const center=[(Math.min(...inside.map(p=>p[0]))+Math.max(...inside.map(p=>p[0])))/2,(Math.min(...inside.map(p=>p[1]))+Math.max(...inside.map(p=>p[1])))/2];
   for(let i=0;i<72;i++){const a=i*Math.PI/36,d=[Math.cos(a),Math.sin(a)],clearance=ray(outside,center,d,true)-ray(inside,center,d);if(clearance<minimumClearance){minimumClearance=clearance;worstAction=action;worstY=y;}}
  }
 }
 // The 2.5 mm lining must also clear the body: require a further 1 mm air gap.
 if(Number.isFinite(minimumClearance))assert.ok(minimumClearance>=.0035,id+' '+(worstAction||'idle')+' needs at least 3.5 mm outer clearance; measured '+(minimumClearance*1000).toFixed(1)+' mm at Y '+worstY?.toFixed(3));
 proof.push({id,vertices:n*2,retainedNativeVertices:retained,unchangedUpperVertices:unchangedUpper,panelRows:coat.drape.panelRows,upperBackM:+back.toFixed(3),torsoDepthM:+maxDepth.toFixed(3),waistContourDeviationMm:+(waistDeviation*1000).toFixed(1),minimumPosedHipClearanceMm:Number.isFinite(minimumClearance)?+(minimumClearance*1000).toFixed(1):null,worstHipAction:worstAction,worstHipY:worstY===null?null:+worstY.toFixed(3)});
}
console.log('vigil draped garment specs passed '+JSON.stringify(proof));
