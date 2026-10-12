import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';

const bytes=readFileSync(process.env.PRESSURE_CHARACTER_ASSET||new URL('../public/assets/pressure-character.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const body=asset.entries.find(e=>e.name==='pressure_body');
assert.ok(body,'the production Pressure mesh must load through the real bounded character parser');
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))];
function deform(primitive,v,pose){
  const p=Array.from(primitive.positions.subarray(v*3,v*3+3));
  for(let m=0;m<body.morphCount;m++)for(let k=0;k<3;k++)p[k]+=primitive.targets[m].positions[v*3+k]*pose.morphs[m];
  const q=[0,0,0];for(let j=0;j<4;j++){const at=primitive.joints[v*4+j]*16,w=primitive.weights[v*4+j];for(let k=0;k<3;k++)q[k]+=(pose.bones[at+k]*p[0]+pose.bones[at+4+k]*p[1]+pose.bones[at+8+k]*p[2]+pose.bones[at+12+k])*w;}return q;
}
const hold=sampleCharacterPose(asset,body,{clip:'pressure_hold',time:0});
const surfaces=body.primitives.map(primitive=>({primitive,points:Array.from({length:primitive.vertexCount},(_,v)=>deform(primitive,v,hold))}));
const points=surfaces.flatMap(s=>s.points),min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));
function supportedSole(side){
  const joints=new Set(body.skin.joints.flatMap((node,i)=>new RegExp(`^(?:foot|toe)_${side}$`).test(asset.nodes[node].name)?[i]:[])),candidates=[];
  for(const{primitive,points}of surfaces)for(let v=0;v<primitive.vertexCount;v++){
    let weight=0;for(let j=0;j<4;j++)if(joints.has(primitive.joints[v*4+j]))weight+=primitive.weights[v*4+j];
    if(weight>.9)candidates.push({primitive,v,p:points[v]});
  }
  assert.ok(candidates.length>20,`the ${side} foot has no actual supported surface`);
  const bottom=Math.min(...candidates.map(v=>v.p[1]));return candidates.filter(v=>v.p[1]<bottom+.008);
}
const centroid=(list,pose)=>list.reduce((sum,v)=>{const q=deform(v.primitive,v.v,pose);return sum.map((x,k)=>x+q[k]/list.length);},[0,0,0]);
function jointOrigin(name,pose){
  const index=body.skin.joints.findIndex(node=>asset.nodes[node].name===name),ib=body.skin.inverseBind[index],m=pose.bones.subarray(index*16,index*16+16);
  // Inverse bind has rigid unit-scale rotation. Its inverse origin is the
  // actual retained rest joint, so this measures exported pose geometry.
  const p=[0,4,8].map(at=>-(ib[at]*ib[12]+ib[at+1]*ib[13]+ib[at+2]*ib[14]));
  return[0,1,2].map(k=>m[k]*p[0]+m[4+k]*p[1]+m[8+k]*p[2]+m[12+k]);
}

test('Pressure is a full 3D front/side/rear volume at world scale, not a thickened camera-facing card', () => {
  assert.deepEqual(asset.entries.map(e=>e.name),['pressure_body']);
  assert.ok(min[1]>-.015&&min[1]<.02,'Pressure does not meet its floor origin');
  assert.ok(max[1]>1.9&&max[1]<2.5,`Pressure height ${max[1].toFixed(3)}m is not the authored scale`);
  for(const [lo,hi]of[[.36,.52],[.56,.74]]){
    const band=points.filter(p=>p[1]>max[1]*lo&&p[1]<max[1]*hi);
    assert.ok(band.length>100,'the torso has no measurable surface at a required cross section');
    const extent=k=>percentile(band.map(p=>p[k]),.97)-percentile(band.map(p=>p[k]),.03);
    assert.ok(extent(0)>.30,'the frontal body collapses into an edge');
    assert.ok(extent(2)>.12,`the side body has no substantial volume (${extent(2).toFixed(3)}m depth)`);
  }
  const area={front:0,rear:0,left:0,right:0};
  for(const{primitive,points}of surfaces)for(let i=0;i<primitive.indices.length;i+=3){
    const[a,b,c]=Array.from(primitive.indices.subarray(i,i+3),v=>points[v]),u=b.map((v,k)=>v-a[k]),v=c.map((x,k)=>x-a[k]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    area[n[2]<0?'front':'rear']+=Math.abs(n[2])*.5;area[n[0]<0?'left':'right']+=Math.abs(n[0])*.5;
  }
  for(const side of['front','rear'])assert.ok(area[side]>.15,`the ${side} surface is missing`);
  for(const side of['left','right'])assert.ok(area[side]>.08,`the ${side} surface is missing`);
});

test('production Pressure has bounded textures/materials, a meaningful rig and correctives, and continuous authored clips', () => {
  assert.ok(bytes.length<=12*1024*1024,`Pressure GLB is ${(bytes.length/1048576).toFixed(1)}MiB`);
  const vertices=body.primitives.reduce((n,p)=>n+p.vertexCount,0),triangles=body.primitives.reduce((n,p)=>n+p.indices.length/3,0);
  assert.ok(vertices<=50000&&triangles<=80000,'Pressure exceeds its single-character geometry budget');
  assert.ok(body.primitives.length<=4&&body.skin.joints.length<=48,'Pressure exceeds its rig/draw budget');
  assert.deepEqual(body.morphNames,['sternum_sink','collar_draw','scapula_lock','longitudinal_tension']);
  const required=['pressure_hold','pressure_idle','pressure_approach','pressure_limp','pressure_listen'];
  for(const clip of required)assert.ok(asset.clips.has(clip),`missing authored ${clip}`);
  for(const material of asset.json.materials){assert.equal(material.alphaMode||'OPAQUE','OPAQUE','the negative body cannot rely on alpha billboards');assert.ok(material.normalTexture,'the finished surface has no authored relief map');}
  function imageSize(index){
    const image=asset.json.images[asset.json.textures[index].source],view=asset.json.bufferViews[image.bufferView],data=asset.bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength),d=new DataView(data.buffer,data.byteOffset,data.byteLength);
    if(image.mimeType==='image/png')return[d.getUint32(16),d.getUint32(20)];
    if(image.mimeType==='image/jpeg'){for(let at=2;at+8<data.length;){if(data[at++]!==255)continue;let marker=data[at++];while(marker===255)marker=data[at++];if(marker===0xd8||marker===0xd9)continue;const length=d.getUint16(at);if([0xc0,0xc1,0xc2].includes(marker))return[d.getUint16(at+5),d.getUint16(at+3)];at+=length;}}
    throw new Error('Pressure texture dimensions are not inspectable');
  }
  const textureBytes=(asset.json.textures||[]).reduce((sum,_t,i)=>{const[w,h]=imageSize(i);assert.ok(w<=1024&&h<=1024,'Pressure texture exceeds the authored resolution cap');return sum+w*h*4*4/3;},0);
  assert.ok(textureBytes<=12.1*1048576,`Pressure textures cost ${(textureBytes/1048576).toFixed(2)}MiB with mips`);
  const usedMorphs=new Set();let motion=0;
  for(const clip of required){const duration=asset.clips.get(clip).duration,start=sampleCharacterPose(asset,body,{clip,time:0}),end=sampleCharacterPose(asset,body,{clip,time:duration});
    for(let k=0;k<start.bones.length;k++)assert.ok(Math.abs(start.bones[k]-end.bones[k])<.001,`${clip} snaps at its loop seam`);
    for(let k=0;k<4;k++)assert.ok(Math.abs(start.morphs[k]-end.morphs[k])<.001,`${clip} corrective snaps at its loop seam`);
    for(const phase of[0,.125,.25,.375,.5,.625,.75,.875,1]){
      const pose=sampleCharacterPose(asset,body,{clip,time:duration*phase});
      assert.ok([...pose.bones,...pose.morphs,...pose.bounds.min,...pose.bounds.max].every(Number.isFinite));
      pose.morphs.forEach((weight,k)=>{assert.ok(weight>=0&&weight<=1,'corrective escapes authored bounds');if(weight>.001)usedMorphs.add(k);});
      for(const{primitive}of surfaces)for(let v=0;v<primitive.vertexCount;v+=43){const q=deform(primitive,v,pose);for(let k=0;k<3;k++)assert.ok(q[k]>=pose.bounds.min[k]-1e-4&&q[k]<=pose.bounds.max[k]+1e-4,'deformed Pressure escapes animated bounds');if(clip==='pressure_idle')motion=Math.max(motion,distance(q,deform(primitive,v,start)));}
    }
  }
  assert.equal(usedMorphs.size,4,'some promised correctives never occur in the actual performance');
  assert.ok(motion>.003,'the actual exported idle surface never deforms');
  console.log(`Pressure budget: ${vertices} vertices/${triangles} triangles, ${(textureBytes/1048576).toFixed(2)}MiB textures, ${(bytes.length/1048576).toFixed(2)}MiB GLB`);
});

test('actual Pressure surfaces stay intact under all clips and four dense corrective extremes', () => {
  const edges=surfaces.map(({primitive,points})=>{const seen=new Set(),edges=[];for(let i=0;i<primitive.indices.length;i+=3)for(let k=0;k<3;k++){const a=primitive.indices[i+k],b=primitive.indices[i+(k+1)%3],key=Math.min(a,b)*primitive.vertexCount+Math.max(a,b);if(seen.has(key))continue;seen.add(key);const length=distance(points[a],points[b]);if(length>.005)edges.push({a,b,length});}return{primitive,edges};});
  const performances=[...asset.clips].flatMap(([clip,c])=>[0,.125,.25,.375,.5,.625,.75,.875,1].map(phase=>({clip,time:c.duration*phase})));
  for(const name of body.morphNames)performances.push({clip:'pressure_hold',time:0,morphs:{[name]:1}});
  let worst={ratio:0};
  for(const descriptor of performances){const pose=sampleCharacterPose(asset,body,descriptor);for(const{primitive,edges:list}of edges){const moved=Array.from({length:primitive.vertexCount},(_,v)=>deform(primitive,v,pose));for(const{a,b,length}of list){const ratio=distance(moved[a],moved[b])/length;if(ratio>worst.ratio)worst={ratio,descriptor,a,b,material:asset.json.materials[primitive.material]?.name};}}}
  assert.ok(worst.ratio<8,`Pressure surface stretches ${worst.ratio.toFixed(2)}x: ${worst.material}/${JSON.stringify(worst.descriptor)} edge${worst.a}–${worst.b}`);
  console.log(`Pressure maximum sampled surface extension: ${worst.ratio.toFixed(2)}x`);
});

test('Pressure feet support the real volume, and planted gait phases cancel the exact runtime root stride', () => {
  const soles={L:supportedSole('L'),R:supportedSole('R')};
  for(const clip of['pressure_hold','pressure_idle','pressure_listen'])for(const phase of[0,.125,.25,.375,.5,.625,.75,.875,1]){const pose=sampleCharacterPose(asset,body,{clip,time:asset.clips.get(clip).duration*phase});for(const side of['L','R']){const q=centroid(soles[side],pose),base=centroid(soles[side],hold);assert.ok(q[1]>=-.008&&q[1]<.025,`${clip} ${side} sole floats or penetrates`);assert.ok(distance(q,base)<.025,`${clip} ${side} supported foot slides`);}}
  let worstSlide=0;
  for(const[clip,stride]of[['pressure_approach',.50],['pressure_limp',.375]]){
    const duration=asset.clips.get(clip).duration;
    for(const[side,intervals]of[['L',[[.36,.98]]],['R',[[.02,.42],[.80,.98]]]])for(const[from,to]of intervals){let origin=null;
      for(let phase=from;phase<=to+.00001;phase+=.02){const q=centroid(soles[side],sampleCharacterPose(asset,body,{clip,time:duration*phase}));q[2]-=stride*phase;origin||=q;worstSlide=Math.max(worstSlide,distance(q,origin));assert.ok(q[1]>=-.008&&q[1]<.03,`${clip} ${side} planted sole loses floor support`);}
    }
  }
  assert.ok(worstSlide<.025,`actual planted soles slide ${(worstSlide*1000).toFixed(1)}mm under the runtime half-metre/.375m gait`);
  console.log(`Pressure maximum planted weighted-sole slide: ${(worstSlide*1000).toFixed(1)}mm`);
});

test('Arrested Thing has an absolute static stop, a planted compression and exact authored phase seams', () => {
  const durations={pressure_load:.50,pressure_advance:.72,pressure_arrest:1,pressure_pivot:.72};
  for(const[clip,duration]of Object.entries(durations))assert.ok(Math.abs(asset.clips.get(clip)?.duration-duration)<1e-5,`${clip} duration is not exact`);
  const at=(clip,time)=>sampleCharacterPose(asset,body,{clip,time,loop:false}),arrest=at('pressure_arrest',1),loaded=at('pressure_load',.50);
  function sameSurface(a,b,label){
    for(let k=0;k<a.bones.length;k++)assert.ok(Math.abs(a.bones[k]-b.bones[k])<1e-5,`${label} changes a retained joint matrix`);
    for(let k=0;k<4;k++)assert.ok(Math.abs(a.morphs[k]-b.morphs[k])<1e-6,`${label} changes a corrective`);
    for(const{primitive}of surfaces)for(let v=0;v<primitive.vertexCount;v+=37)assert.ok(distance(deform(primitive,v,a),deform(primitive,v,b))<.0001,`${label} snaps a real surface`);
  }
  for(const phase of[0,.03,.125,.25,.5,.75,.999,1])sameSurface(arrest,at('pressure_arrest',phase),'absolute arrest');
  sameSurface(arrest,at('pressure_load',0),'arrest → load');
  for(const clip of['pressure_advance','pressure_pivot']){
    sameSurface(loaded,at(clip,0),`load → ${clip}`);sameSurface(arrest,at(clip,.72),`${clip} → arrest`);
  }
  const soles={L:supportedSole('L'),R:supportedSole('R')};
  for(const phase of[0,.1,.25,.5,.75,.9,1])for(const side of['L','R'])assert.ok(distance(centroid(soles[side],arrest),centroid(soles[side],at('pressure_load',.50*phase)))<.0001,'compression moves a planted sole');
  const chest0=jointOrigin('chest',arrest),chest1=jointOrigin('chest',loaded),head0=jointOrigin('head',arrest),head1=jointOrigin('head',loaded);
  assert.ok(chest1[1]<chest0[1]-.018&&chest1[2]>chest0[2]+.015,'sternum compression is absent from the actual rig');
  assert.ok(head1[1]<head0[1]-.020&&head1[2]>head0[2]+.020,'sealed head never retracts into its collar');
  assert.ok(jointOrigin('upperarm_L',loaded)[1]>jointOrigin('upperarm_L',arrest)[1]+.020,'one shoulder never binds upward');
  assert.ok(loaded.morphs[0]>arrest.morphs[0]+.50&&loaded.morphs[1]>arrest.morphs[1]+.50,'deep pressure correctives are absent');
  let displacement=0;
  for(const{primitive,points}of surfaces)for(let v=0;v<points.length;v++)if(points[v][1]>1.50&&points[v][1]<2.05&&Math.abs(points[v][0])<.18)displacement=Math.max(displacement,distance(deform(primitive,v,loaded),deform(primitive,v,arrest)));
  assert.ok(displacement>.035,'the compression never changes the actual torso/collar surface');
  const relativeHand=pose=>{const h=jointOrigin('hand_R',pose),p=jointOrigin('pelvis',pose);return h.map((v,k)=>v-p[k]);};
  assert.ok(distance(relativeHand(loaded),relativeHand(at('pressure_advance',.72*.80)))<.0001,'the hand releases before the late resisted phase');
  assert.ok(distance(relativeHand(loaded),relativeHand(arrest))>.015,'the hand never releases from the loaded pose');
  console.log(`Arrested torso/collar compression: ${(displacement*1000).toFixed(1)}mm; static stop and phase seams <0.1mm.`);
});

test('one arrested scrape and zero-travel pivot retain real support without a mesh-root lunge', () => {
  const soles={L:supportedSole('L'),R:supportedSole('R')};let worstSlide=0,maxLift={L:0,R:0};
  for(const[clip,stride]of[['pressure_advance',.42],['pressure_pivot',0]]){
    const at=phase=>sampleCharacterPose(asset,body,{clip,time:.72*phase}),start=at(0),end=at(1);
    for(const[side,from,to]of[['L',.40,1],['R',0,.56]]){
      let origin=null;
      for(let phase=from;phase<=to+1e-5;phase+=.01){const q=centroid(soles[side],at(phase));q[2]-=stride*phase;origin||=q;worstSlide=Math.max(worstSlide,distance(q,origin));assert.ok(q[1]>-.008&&q[1]<.015,`${clip}/${side} loses floor support`);}
    }
    for(let phase=0;phase<=1+1e-5;phase+=.02){
      const pose=at(phase),heights=['L','R'].map(side=>centroid(soles[side],pose)[1]);
      assert.ok(Math.min(...heights)<.012,`${clip} has no supporting foot`);
      for(let k=0;k<2;k++)maxLift[['L','R'][k]]=Math.max(maxLift[['L','R'][k]],heights[k]);
      const pelvis=jointOrigin('pelvis',pose);assert.ok(Math.abs(pelvis[2]-jointOrigin('pelvis',start)[2])<.0001,`${clip} adds a forward mesh-root lunge`);
      for(const{primitive}of surfaces)for(let v=0;v<primitive.vertexCount;v+=97){const q=deform(primitive,v,pose);for(let k=0;k<3;k++)assert.ok(q[k]>=pose.bounds.min[k]-1e-4&&q[k]<=pose.bounds.max[k]+1e-4,'arrested volume escapes animated bounds');}
    }
    for(const side of['L','R'])assert.ok(distance(centroid(soles[side],start),centroid(soles[side],end))<.0001,`${clip} resets its staggered foot anchor`);
  }
  assert.ok(worstSlide<.002,`actual arrested planted sole slides ${(worstSlide*1000).toFixed(2)}mm`);
  assert.ok(maxLift.L>.018&&maxLift.L<.035&&maxLift.R>.005&&maxLift.R<.018,'leading scrape and reluctant trailing drag have no distinct floor clearance');
  console.log(`Arrested actual weighted-sole slide: ${(worstSlide*1000).toFixed(3)}mm; leading/trailing clearance ${(maxLift.L*1000).toFixed(1)}/${(maxLift.R*1000).toFixed(1)}mm.`);
});
