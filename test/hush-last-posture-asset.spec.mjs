import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';

const root=path.resolve(import.meta.dirname,'..');
const file=path.resolve(root,process.env.HUSH_LAST_POSTURE_ASSET_PATH||'public/assets/hush-density.glb');
const bytes=readFileSync(file),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const entries=Object.fromEntries(asset.entries.map(entry=>[entry.name,entry]));
const volume=entries.hush_density_volume,p=volume?.primitives[0];
assert.ok(p,'the full skinned volume must be present');
const nodes=new Map(asset.nodes.map((node,index)=>[node.name,{...node,index}]));
const sha=value=>createHash('sha256').update(value).digest('hex');
const inverse=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const xyz=(values,i)=>Array.from(values.subarray(i*3,i*3+3));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
function bindPoint(name){
 let out=[0,0,0],node=nodes.get(name);
 while(node){out=out.map((v,i)=>v+node.translation[i]);node=node.parent>=0?asset.nodes[node.parent]:null;}
 return out;
}
function skin(descriptor,entry=volume){
 const primitive=entry.primitives[0],pose=sampleCharacterPose(asset,entry,descriptor),m=pose.bones;
 const out=new Float64Array(primitive.positions.length);
 for(let i=0;i<primitive.vertexCount;i++)for(let k=0;k<4;k++){
  const at=primitive.joints[i*4+k]*16,w=primitive.weights[i*4+k];if(!w)continue;
  const[x,y,z]=xyz(primitive.positions,i);
  out[i*3]+=w*(m[at]*x+m[at+4]*y+m[at+8]*z+m[at+12]);
  out[i*3+1]+=w*(m[at+1]*x+m[at+5]*y+m[at+9]*z+m[at+13]);
  out[i*3+2]+=w*(m[at+2]*x+m[at+6]*y+m[at+10]*z+m[at+14]);
 }
 assert.ok(out.every(Number.isFinite),'actual shader-equivalent skin output stays finite');return out;
}
function bounds(values){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<values.length;i++){
  min[i%3]=Math.min(min[i%3],values[i]);max[i%3]=Math.max(max[i%3],values[i]);
 }
 return{min,max,dimensions:max.map((v,i)=>v-min[i])};
}
function difference(a,b){let maximum=0;for(let i=0;i<a.length;i+=3)maximum=Math.max(maximum,distance(xyz(a,i/3),xyz(b,i/3)));return maximum;}
const report={kind:'last-posture-export-cpu-validation',asset:file,assetSha256:sha(bytes),checks:[],limits:[
 'Actual GLB, shader-equivalent CPU skin, hierarchy and sampled authored clips only; no native, final-dither, perceptual or fear acceptance.',
 'Clip-only foot positions are not world-planted contact. Live support and swept collision need their separate runtime evidence.',
 'Finite samples and closed topology do not establish absence of all-time self-intersection.',
]};

test('Last Posture exports the three compatible skin entries within the original visible-surface budget',()=>{
 assert.deepEqual(Object.keys(entries).sort(),['hush_density_core','hush_density_return','hush_density_volume']);
 assert.equal(asset.clips.size,16);assert.equal(volume.skin.joints.length,43);
 let total=0;for(const entry of asset.entries){assert.equal(entry.primitives.length,1);assert.equal(entry.morphCount,0);assert.deepEqual(entry.skin.joints,volume.skin.joints);total+=entry.primitives[0].vertexCount;}
 assert.ok(total<=50000);assert.ok(p.indices.length/3<=44000);
 assert.equal((entries.hush_density_core.primitives[0].indices.length+entries.hush_density_return.primitives[0].indices.length)/3,p.indices.length/3);
 const fraction=entries.hush_density_return.primitives[0].indices.length/p.indices.length;
 assert.ok(fraction>=.03&&fraction<=.06,'restrained anatomical return surface occupies 3–6% of the exact skin');
 report.geometry={sculptVertices:p.vertexCount,sculptTriangles:p.indices.length/3,exportedVertices:total,returnTriangleFraction:fraction};
});

test('core and return exactly partition the closed full body and retain identical skin channels',()=>{
 const key=(primitive,i)=>xyz(primitive.positions,i).join(','),lookup=new Map();
 for(let i=0;i<p.vertexCount;i++){assert.ok(!lookup.has(key(p,i)),'unique sculpt coordinates make partition comparison unambiguous');lookup.set(key(p,i),i);}
 const triangles=new Map();for(let i=0;i<p.indices.length;i+=3){const key=Array.from(p.indices.subarray(i,i+3)).join(',');assert.ok(!triangles.has(key));triangles.set(key,1);}
 for(const name of['hush_density_core','hush_density_return']){
  const q=entries[name].primitives[0],remap=[];
  for(let i=0;i<q.vertexCount;i++){
   const j=lookup.get(key(q,i));assert.notEqual(j,undefined);remap.push(j);
   for(const[channel,width]of[['positions',3],['normals',3],['uv',2],['joints',4],['weights',4]])assert.deepEqual(q[channel].slice(i*width,i*width+width),p[channel].slice(j*width,j*width+width));
  }
  for(let i=0;i<q.indices.length;i+=3){const key=Array.from(q.indices.subarray(i,i+3),n=>remap[n]).join(',');assert.equal(triangles.get(key),1,'a surface face must exist exactly once');triangles.set(key,0);}
 }
 assert.ok([...triangles.values()].every(count=>count===0),'no body face can be omitted or drawn in both surface zones');
 const edges=new Map(),parent=Array.from({length:p.vertexCount},(_,i)=>i);
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(let i=0;i<p.indices.length;i+=3)for(let k=0;k<3;k++){
  const a=p.indices[i+k],b=p.indices[i+(k+1)%3],key=Math.min(a,b)+','+Math.max(a,b);edges.set(key,(edges.get(key)||0)+1);parent[find(a)]=find(b);
 }
 assert.ok([...edges.values()].every(count=>count===2),'one continuous skin has no boundary or nonmanifold edge');
 assert.equal(new Set(parent.map((_,i)=>find(i))).size,1,'the adult is one connected body rather than detached primitive masses');
 report.partition={exact:true,identicalVertexChannels:true,connectedComponents:1,boundaryEdges:0,nonManifoldEdges:0};
});

test('the real anatomical hierarchy has bent legs, shoulder failure and ten articulated relaxed fingers',()=>{
 const parent=name=>asset.nodes[nodes.get(name)?.parent]?.name;
 assert.equal(parent('pelvis'),'posture_root');assert.equal(parent('spine_low'),'pelvis');assert.equal(parent('spine_mid'),'spine_low');assert.equal(parent('chest'),'spine_mid');assert.equal(parent('neck'),'chest');assert.equal(parent('head'),'neck');
 assert.ok(!asset.nodes.some(node=>/^fold_/.test(node.name)),'the old fold skeleton is not reused');
 for(const side of['L','R']){
  for(const[a,b]of[['thigh','pelvis'],['shin','thigh_'+side],['foot','shin_'+side],['toe','foot_'+side],['clavicle','chest'],['upper_arm','clavicle_'+side],['forearm','upper_arm_'+side],['hand','forearm_'+side]])assert.equal(parent(a+'_'+side),b);
  for(const finger of['thumb','index','middle','ring','little']){assert.equal(parent(`${finger}_${side}_01`),'hand_'+side);assert.equal(parent(`${finger}_${side}_02`),`${finger}_${side}_01`);const base=bindPoint(`${finger}_${side}_01`), tip=bindPoint(`${finger}_${side}_02`), length=distance(base,tip);
   assert.ok(length>=.025&&length<=.065,'finger segment has anatomical length independent of its bearing');
   assert.ok(tip[1]<base[1]-.010,'relaxed phalanx remains below its own joint');
   if(finger==='thumb')assert.ok(Math.abs(tip[2]-base[2])>.018,'thumb actually opposes the other four fingers');}
  const hip=bindPoint('thigh_'+side),knee=bindPoint('shin_'+side),ankle=bindPoint('foot_'+side);
  assert.ok(knee[2]<hip[2]-.15,'the load-bearing knee is bent in depth');
  assert.ok((distance(hip,knee)+distance(knee,ankle))/distance(hip,ankle)>1.05,'each leg chain has real bend and gathering reach');
 }
 const pelvis=bindPoint('pelvis'),head=bindPoint('head'),left=bindPoint('upper_arm_L'),right=bindPoint('upper_arm_R');
 assert.ok(head[0]-pelvis[0]>.25,'the terminal head/upper-mass relation is laterally off-axis');assert.ok(left[1]-right[1]>.12,'the shoulder toward the fallen head sits substantially below the opposite shoulder');
 const feet={L:bindPoint('foot_L'),R:bindPoint('foot_R')},supportMidpoint=feet.L.map((v,i)=>(v+feet.R[i])/2);
 const thighL=bindPoint('thigh_L'),thighR=bindPoint('thigh_R');
 assert.ok(Math.abs(pelvis[2]-supportMidpoint[2])>=.03,'the pelvis is pitched away from the support midpoint');
 assert.ok(Math.abs(thighL[1]-thighR[1])>=.02&&Math.abs(feet.L[2]-feet.R[2])>=.06,'hip loading and foot placement are both asymmetric');
 report.anatomy={joints:43,headOffsetFromPelvisM:head.map((v,i)=>v-pelvis[i]),shoulderHeightDifferenceM:right[1]-left[1],referenceFeet:feet,pelvisOffsetFromSupportMidpointM:pelvis.map((v,i)=>v-supportMidpoint[i])};
});

test('actual exported rest shape has adult scale and a genuinely compact side-leading envelope',()=>{
 const rest=skin({clip:'pressure_hold',time:0}),b=bounds(rest);
 assert.ok(b.dimensions[1]>=2.01&&b.dimensions[1]<=2.08,'adult source height before world scaling');
 assert.ok(Math.abs(b.dimensions[1]-asset.json.extras.heightM)<2e-6,'measured source height is the actual renderer scale denominator');assert.ok(b.dimensions[0]>=.8&&b.dimensions[0]<=.90);assert.ok(b.dimensions[2]>=.42&&b.dimensions[2]<=.53,'real knee and skull depth retained in the neutral pose');
 assert.ok(Math.abs(b.min[1])<2e-6,'rest feet meet the authored floor');
 assert.ok(difference(rest,p.positions)<3e-6,'inverse bind matrices reproduce the actual sculpt');
 report.restBounds=b;
});

test('all authored clips skin finitely, preserve collapsed endpoints and fit the measured swept envelope',()=>{
 const rest=skin({clip:'pressure_hold',time:0}),union={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},clips=[];
 for(const[name,clip]of asset.clips){
  assert.ok(!clip.channels.some(channel=>asset.nodes[channel.node].name==='posture_root'),'no clip can move or rotate the authoritative root');
  let maximumMotion=0,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  const phases=[...new Set([...Array.from({length:17},(_,i)=>i/16),.08,.14,.34,.43,.58,.64,.84,.93])].sort((a,b)=>a-b);
  for(const phase of phases){const result=skin({clip:name,time:phase*clip.duration,loop:false}),b=bounds(result);maximumMotion=Math.max(maximumMotion,difference(rest,result));for(let axis=0;axis<3;axis++){lo[axis]=Math.min(lo[axis],b.min[axis]);hi[axis]=Math.max(hi[axis],b.max[axis]);}}
  assert.ok(difference(rest,skin({clip:name,time:0,loop:false}))<3e-6,name+' starts in the terminal rest');assert.ok(difference(rest,skin({clip:name,time:clip.duration,loop:false}))<3e-6,name+' ends in the same terminal rest');
  assert.ok(hi[0]-lo[0]<=.90);assert.ok(hi[2]-lo[2]<=.55,name+' preserves the measured anatomical envelope');
  for(let axis=0;axis<3;axis++){union.min[axis]=Math.min(union.min[axis],lo[axis]);union.max[axis]=Math.max(union.max[axis],hi[axis]);}
  clips.push({name,duration:clip.duration,samples:phases.length,min:lo,max:hi,dimensions:hi.map((v,i)=>v-lo[i]),maximumMotionFromRestM:maximumMotion});
 }
 for(const name of['pressure_hold','pressure_idle','pressure_arrest','density_retained'])assert.ok(clips.find(clip=>clip.name===name).maximumMotionFromRestM<3e-6,name+' must be still, not a breathing loop');
 assert.ok(clips.find(clip=>clip.name==='pressure_approach').maximumMotionFromRestM>.01);assert.ok(clips.find(clip=>clip.name==='density_listen').maximumMotionFromRestM>.01);
 report.authoredClips=clips;report.sampledSweptBounds={...union,dimensions:union.max.map((v,i)=>v-union.min[i])};
});

test('finite listening and settling leave the leg chains still and the current contact solver accepts the new rig',()=>{
 const rest=skin({clip:'pressure_hold',time:0}),identity=sampleCharacterPose(asset,volume,{clip:'pressure_hold',time:0}).bones;
 for(const name of['density_listen','pressure_listen','density_idle']){
  const clip=asset.clips.get(name);
  assert.ok(!clip.channels.some(channel=>/^(posture_root|pelvis|thigh_|shin_|foot_|toe_)/.test(asset.nodes[channel.node].name)),'finite upper-body responses must not contain leg/root animation channels');
  for(let n=0;n<=16;n++){
   const pose=sampleCharacterPose(asset,volume,{clip:name,time:n*clip.duration/16,loop:false});
   for(const side of['L','R'])for(const bone of['thigh','shin','foot','toe']){
    const slot=volume.skin.joints.indexOf(nodes.get(bone+'_'+side).index)*16;
    assert.ok(inverse(Array.from(pose.bones.slice(slot,slot+16)),Array.from(identity.slice(slot,slot+16)))<2e-6,name+' must not animate the legs or feet');
   }
  }
 }
 const supported=skin({clip:'pressure_hold',time:0,support:{clip:'pressure_hold',time:0,contacts:['L','R'].map(side=>({side,offset:[0,0,0],yaw:0,weight:1}))}});
 assert.ok(difference(rest,supported)<3e-6,'existing two-bone support chains reproduce the rest contacts without a body snap');
 report.support={referenceClip:'pressure_hold',chainsCompatible:true,referenceContactSkinDifferenceM:difference(rest,supported),liveWorldPlantingProven:false};
});

test('the retained human recording still has its original asset bytes',()=>{
 const original=readFileSync(path.join(root,'public/assets/pressure-character.glb'));
 assert.equal(sha(original),'29f4321a45f48cff08f243591153adbc0de5b25e31a3adb2f26ce2c6d78368b9');
 report.originalHumanSha256=sha(original);
 if(process.env.HUSH_LAST_POSTURE_RECEIPT)writeFileSync(path.resolve(root,process.env.HUSH_LAST_POSTURE_RECEIPT),JSON.stringify(report,null,2)+'\n');
});
