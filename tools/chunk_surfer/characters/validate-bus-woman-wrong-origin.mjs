// Validate the actual packaged anatomy and deformation, including the sleeve
// cap failure that source-only rest checks cannot detect.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseCharacterAsset,sampleCharacterPose} from '../../../src/render/character-asset.js';
import {busWomanWrongOriginDescriptor} from '../../../src/render/bus-woman-wrong-origin-performance.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const bytes=fs.readFileSync(root+'public/assets/outskirts-bus-woman-wrong-origin.glb');
const baseline=fs.readFileSync(root+'public/assets/bus-woman-character.glb');
const parse=b=>parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const asset=parse(bytes),ordinary=parse(baseline),canonical=ordinary.entries.find(e=>e.name==='outskirts_bus_woman');
const checkpointBytes=fs.readFileSync(root+'artifacts/bus-woman-wrong-origin/checkpoint-B/public/assets/outskirts-bus-woman-wrong-origin.glb'),checkpoint=parse(checkpointBytes);
assert.deepEqual(asset.entries.map(e=>e.name),[1,2,3,4,5].map(i=>'outskirts_bus_woman_wrong_origin_'+i));
for(const stage of [1,2]){
 const name='outskirts_bus_woman_wrong_origin_'+stage,a=asset.entries.find(e=>e.name===name),b=checkpoint.entries.find(e=>e.name===name);
 assert.deepEqual(a.primitives,b.primitives,name+' changed accepted early geometry/influences');
 for(const p of a.primitives)assert.deepEqual(asset.json.materials[p.material],checkpoint.json.materials[p.material],name+' changed accepted early material');
}
for(const e of asset.entries){assert.equal(e.skin.joints.length,54);assert.equal(e.morphCount,0);assert.deepEqual(e.skin.inverseBind,canonical.skin.inverseBind);assert(e.primitives.length<=16);assert(e.primitives.reduce((s,p)=>s+p.vertexCount,0)<50000);}
function posed(p,bones){const out=new Float32Array(p.positions.length);
 for(let v=0;v<p.vertexCount;v++)for(let j=0;j<4;j++){
  const w=p.weights[v*4+j];if(!w)continue;const at=p.joints[v*4+j]*16,x=p.positions[v*3],y=p.positions[v*3+1],z=p.positions[v*3+2];
  for(let k=0;k<3;k++)out[v*3+k]+=w*(bones[at+k]*x+bones[at+4+k]*y+bones[at+8+k]*z+bones[at+12+k]);
 }return out;
}
const dist=(p,a,b)=>Math.hypot(p[a*3]-p[b*3],p[a*3+1]-p[b*3+1],p[a*3+2]-p[b*3+2]);
function edgeStats(entry,pack,descriptor,roles=['coat']){const pose=sampleCharacterPose(pack,entry,descriptor);let maxLength=0,maxStretch=0,worst=null;
 for(const [primitive,p]of entry.primitives.entries()){
  const role=pack.json.materials[p.material]?.extras?.characterRole;if(!roles.includes(role))continue;
  const q=posed(p,pose.bones);
  for(let i=0;i<p.indices.length;i+=3)for(const [a,b]of [[p.indices[i],p.indices[i+1]],[p.indices[i+1],p.indices[i+2]],[p.indices[i+2],p.indices[i]]]){
   const rest=dist(p.positions,a,b),length=dist(q,a,b),stretch=length/Math.max(.0001,rest);maxStretch=Math.max(maxStretch,stretch);
   if(length>maxLength){maxLength=length;worst={primitive,a,b,rest,length,stretch};}
  }
 }return {maxLength,maxStretch,worst};
}
const clips=[...asset.clips.keys()];assert.deepEqual(clips,[...ordinary.clips.keys()]);const deformation=[];
for(const clip of clips){const duration=asset.clips.get(clip).duration;
 for(const fraction of [0,.18,.275,.5,.75,1]){
  const descriptor={clip,time:duration*fraction,loop:false},control=edgeStats(canonical,ordinary,descriptor);
  for(const entry of asset.entries){const changed=edgeStats(entry,asset,descriptor);
   // New local apertures may not produce a triangle larger than the ordinary
   // garment by 3cm. A bad Boolean cap previously reached .351m at receive1.1.
   assert(changed.maxLength<=control.maxLength+.03,entry.name+' '+clip+' has a garment sail: '+JSON.stringify({control:control.worst,changed:changed.worst}));
   deformation.push({entry:entry.name,clip,time:descriptor.time,maxGarmentEdgeMetres:changed.maxLength,canonicalMaxGarmentEdgeMetres:control.maxLength,maxGarmentStretch:changed.maxStretch});
   const stage=entry.extras.authoredStage,stretch={1:3,2:6,3:9,4:11,5:12}[stage],mode=clip.replace('bus_woman_','').replaceAll('_','-');
   const production=busWomanWrongOriginDescriptor(mode,descriptor.time,{stretch});
   const actual=edgeStats(entry,asset,production);
   assert(actual.maxLength<.24&&actual.maxLength<=Math.max(.185,control.maxLength+.055),entry.name+' production '+clip+' has a garment sail: '+JSON.stringify({control:control.worst,changed:actual.worst}));
   const tissue=edgeStats(entry,asset,production,['muscle','injured-skin','fascia']);
   assert(tissue.maxLength<.17,entry.name+' production '+clip+' has a stretched tissue panel: '+JSON.stringify(tissue.worst));
   deformation.push({entry:entry.name,clip,time:descriptor.time,productionWrongOrigin:true,stretch,maxGarmentEdgeMetres:actual.maxLength,canonicalMaxGarmentEdgeMetres:control.maxLength,maxGarmentStretch:actual.maxStretch,maxTissueEdgeMetres:tissue.maxLength,maxTissueStretch:tissue.maxStretch});
  }
 }
}
// Check the exact ordinary finger/hand surface remains in every stage. The
// facial wound may change face topology but must never delete/corrupt a grip.
const source=JSON.parse(fs.readFileSync(root+'artifacts/bus-woman-production/anatomy.json'));
const staged=JSON.parse(fs.readFileSync(root+'artifacts/bus-woman-wrong-origin/anatomy.json'));
const retainedSource=JSON.parse(fs.readFileSync(root+'artifacts/bus-woman-wrong-origin/checkpoint-B/artifacts/bus-woman-wrong-origin/anatomy.json'));
for(const stage of [1,2])assert.deepEqual(staged.variants.find(v=>v.stage===stage),retainedSource.variants.find(v=>v.stage===stage),'Editable retained source changed early state '+stage);
const face=source.meshes.find(m=>m.name.includes('ordinary-face'));
const handJoints=new Set(source.bones.map((b,i)=>[b.name,i]).filter(([n])=>n.startsWith('hand_')||/^(thumb|index|middle|ring|little)/.test(n)).map(([,i])=>i));
const key=m=>m.join(',');const exactHand=[];
for(let v=0;v<face.positions.length/3;v++){
 let w=0;for(let j=0;j<4;j++)if(handJoints.has(face.skinIndex[v*4+j]))w+=face.skinWeight[v*4+j];
 if(w>.5)exactHand.push(key(face.positions.slice(v*3,v*3+3)));
}
for(const stage of staged.variants){const body=stage.meshes.find(m=>m.name.includes('ordinary-face'));const positions=new Set(Array.from({length:body.positions.length/3},(_,v)=>key(body.positions.slice(v*3,v*3+3))));assert(exactHand.every(p=>positions.has(p)),stage.name+' changed a canonical grip vertex');}
const result={passed:true,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),ordinarySHA256:crypto.createHash('sha256').update(baseline).digest('hex'),acceptedEarlyCheckpointSHA256:crypto.createHash('sha256').update(checkpointBytes).digest('hex'),acceptedEarlyStatesPreserved:[1,2],exactHandVerticesPerStage:exactHand.length,deformationSamples:deformation.length,worstGarmentEdgeMetres:Math.max(...deformation.map(d=>d.maxGarmentEdgeMetres)),worstTissueEdgeMetres:Math.max(...deformation.map(d=>d.maxTissueEdgeMetres||0)),deformation};
fs.writeFileSync(root+'artifacts/bus-woman-wrong-origin/deformation-validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,deformation:undefined},null,2));
