// Test the submitted skin, not merely the pose helper: anatomical continuity,
// actual finite deformation, contact reach, shared origin and recorded gait.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {SOURCE_LAST_RECEPTION_RESIDENT_DESIGNS as designs} from '../src/data/source-last-reception-resident-design.js';
import {SOURCE_LAST_RECEPTION_RESIDENT_RIGS as rigs} from '../src/data/source-last-reception-resident-rigs.js';
import {sourceLastReceptionResidentPose,sourceLastReceptionResidentInstances,SOURCE_LAST_RECEPTION_RESIDENT_MESHES} from '../src/render/source-last-reception-residents.js';
const bytes=fs.readFileSync(new URL('../public/assets/source-last-reception-residents.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/source-last-reception-residents.manifest.json',import.meta.url)));
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
assert.equal(manifest.sha256,digest(bytes));for(const[file,sha]of Object.entries(manifest.sourceSha256))assert.equal(digest(fs.readFileSync(new URL('../'+file,import.meta.url))),sha,`rebuild resident pack after ${file}`);
assert.equal(asset.entries.length,7);assert.deepEqual(asset.entries.map(e=>e.name),SOURCE_LAST_RECEPTION_RESIDENT_MESHES);assert.ok(bytes.length<8*1024*1024);
assert.equal(asset.nodes.length,115,'two shared anatomical rigs should keep the pack within the node budget');
assert.ok(asset.json.materials.every(m=>!m.alphaMode&&m.pbrMetallicRoughness.baseColorFactor[3]===1),'spirits must use opaque world geometry, not transparent overlays');
assert.ok(!asset.json.materials.some(m=>/eye|iris|hair|bus|vigil|contractor/i.test(m.name)),'donor identifying facial materials must not survive');
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],mul=(a,n)=>a.map(v=>v*n);
const rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
const close=(a,b,message)=>assert.ok(Math.hypot(...sub(a,b))<1e-5,message);
let samples=0,maxReachError=0;
for(const[id,d]of Object.entries(designs)){
 const entry=asset.entries.find(e=>e.name===d.mesh),rest=new Map(rigs[d.source].map(b=>[b.name,b]));assert.equal(entry.skin.joints.length,54);
 if(id==='host'||id==='imprint')for(const side of['L','R']){const joint=entry.skin.joints.findIndex(i=>asset.nodes[i].name===`reception_${d.source}_forearm_${side}`),skinMaterial=asset.json.materials.findIndex(m=>m.name===id+' skin'),flesh=entry.primitives.find(p=>p.material===skinMaterial),used=new Set(flesh.indices),forearmVertices=[...used].filter(v=>[0,1,2,3].some(slot=>flesh.joints[v*4+slot]===joint&&flesh.weights[v*4+slot]>.5));assert.ok(forearmVertices.length>60,`${id} ${side} rolled sleeve must have rendered flesh down to its wrist`);}
 for(const side of['L','R'])for(const digit of['thumb','index','middle','ring','little'])for(const suffix of['','_mid','_tip']){const name=`reception_${d.source}_${digit}${suffix}_${side}`,joint=entry.skin.joints.findIndex(i=>asset.nodes[i].name===name);assert.ok(joint>=0);assert.ok(entry.primitives.some(p=>p.joints.some((v,i)=>v===joint&&p.weights[i]>.05)),`${id} ${name} needs weighted skin`);}
 for(const mode of['idle','walk','reach','seated','imprint'])for(const reducedMotion of[false,true])for(let step=0;step<8;step++){
  const frame={mode,elapsed:step*.31,distance:step/8,speed:mode==='walk'?1.1:0,attention:mode==='reach'?1:0},pose=sourceLastReceptionResidentPose(id,frame,{reducedMotion}),gpu=sampleCharacterPose(asset,entry,{joints:pose.joints});samples++;
  for(const joint of Object.values(pose.joints)){assert.ok(joint.translation.every(Number.isFinite)&&joint.rotation.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...joint.rotation)-1)<1e-6);}
  const transform=(name,point)=>{const b=rest.get(name),j=pose.joints[`reception_${d.source}_${name}`];return add(add(b.head,j.translation),rotate(sub(point,b.head),j.rotation));};
  for(const side of['L','R'])for(const[a,b]of[[`upperarm_${side}`,`forearm_${side}`],[`forearm_${side}`,`hand_${side}`],[`thigh_${side}`,`shin_${side}`],[`shin_${side}`,`foot_${side}`]])close(transform(a,rest.get(a).tail),transform(b,rest.get(b).head),`${id} ${mode} disconnected ${a}/${b}`);
  for(const side of['L','R'])for(const digit of['thumb','index','middle','ring','little'])for(const[a,b]of[[digit+'_'+side,digit+'_mid_'+side],[digit+'_mid_'+side,digit+'_tip_'+side]])close(transform(a,rest.get(a).tail),transform(b,rest.get(b).head),`${id} disconnected finger ${a}`);
  for(const c of pose.contacts){maxReachError=Math.max(maxReachError,c.error);assert.ok(c.error<.001,`${id} ${mode} ${c.kind} target unreachable`);}
  if(step===0||step===4)for(const p of entry.primitives)for(const v of new Set(p.indices))for(let axis=0;axis<3;axis++){let value=0;for(let slot=0;slot<4;slot++){const weight=p.weights[v*4+slot],at=p.joints[v*4+slot]*16;value+=weight*(gpu.bones[at+axis]*p.positions[v*3]+gpu.bones[at+axis+4]*p.positions[v*3+1]+gpu.bones[at+axis+8]*p.positions[v*3+2]+gpu.bones[at+axis+12]);}assert.ok(Number.isFinite(value)&&Math.abs(value)<3,`${id} deformed skin escaped human scale`);}
 }
}
const actor={id:'host',x:-54,y:9,z:-450,yaw:0,mode:'walk',speed:1.1,distance:.4,elapsed:12};
const instance=sourceLastReceptionResidentInstances({residents:[actor],elapsed:12},{origin:{x:300,z:600},zone:7})[0];
assert.equal(instance.x,246);assert.equal(instance.y,9);assert.equal(instance.z,150);assert.equal(instance.matrix[12],246);assert.equal(instance.matrix[13],9);assert.equal(instance.matrix[14],150);assert.equal(instance.zone,7);assert.equal(instance.structural,false);assert.ok(!('pressure'in instance)&&!('shadowOnly'in instance),'resident must enter the ordinary world material and final dither path');
assert.ok(-instance.matrix[10]>0,'runtime +Z heading must face the master forward toward +Z');
const flattened=sourceLastReceptionResidentInstances({residents:[{...actor,boundaryWeight:1}]})[0];assert.ok(Math.hypot(flattened.matrix[8],flattened.matrix[10])<.03,'the retaining seam should flatten the resident into physical source relief');assert.equal(flattened.matrix[5],instance.matrix[5],'retaining seam must preserve human height');
const loadedAgain=sourceLastReceptionResidentInstances({residents:[{...actor,elapsed:5000}],elapsed:5000},{reducedMotion:true})[0],paused=sourceLastReceptionResidentInstances({residents:[actor],elapsed:12},{reducedMotion:true})[0];assert.deepEqual(loadedAgain.character,paused.character,'saved distance must preserve gait across pause and reload');
const stance=[.05,.10,.15].map(distance=>{const p=sourceLastReceptionResidentPose('host',{mode:'walk',speed:.65,distance,elapsed:distance/.65}),foot=p.contacts.find(c=>c.kind==='leg'&&c.side==='L');assert.ok(foot.planted);return foot.ankle[2]-distance;});assert.ok(Math.max(...stance)-Math.min(...stance)<1e-5,'slow residents must keep a stance foot fixed in world space');
const withImprint=sourceLastReceptionResidentInstances({residents:[actor],imprint:{x:-64,y:9,z:-460,yaw:0}});assert.equal(withImprint.length,2);assert.equal(withImprint[1].mesh,designs.imprint.mesh);assert.equal(sourceLastReceptionResidentPose('imprint',{mode:'imprint'}).seat,1);
assert.equal(sourceLastReceptionResidentInstances({residents:[actor,{id:'imprint',x:-64,y:9,z:-460}],imprint:true}).length,2,'runtime imprint status must not create a second body at the origin');
assert.equal(sourceLastReceptionResidentInstances({residents:[actor],imprint:true}).length,1,'a status flag has no positional authority');
assert.deepEqual(sourceLastReceptionResidentInstances({residents:[{id:'bus-woman'},null]}),[]);
console.log(JSON.stringify({ok:true,meshes:asset.entries.length,bytes:bytes.length,samples,maxReachError}));
