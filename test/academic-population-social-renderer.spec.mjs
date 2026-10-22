import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {academicFloorPopulationPose as pose,academicFloorPopulationInstances as instances,
  academicPopulationSocialGeometry as geometry,installAcademicPopulationSocialMeshes as install} from '../src/render/academic-society-characters.js';
import {ACADEMIC_FLOOR_POPULATION_DESIGNS as DESIGNS,ACADEMIC_SOCIETY_CHARACTER_RIGS as RIGS} from '../src/data/academic-society-character-design.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {academicBouncerPose} from '../src/render/academic-bouncers.js';
import {createAcademicFloorPopulation} from '../src/game/academic-floor-population.js';
import {ACADEMIC_FLOOR_POPULATION as CAST} from '../src/data/academic-floor-population.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from '../src/render/prop-instance-layout.js';
const bytes=fs.readFileSync(new URL('../public/assets/academic-society-characters.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const rotate=(v,q)=>{const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],t=cross(q.slice(0,3),v).map(n=>n*2),s=cross(q.slice(0,3),t);return v.map((n,i)=>n+t[i]*q[3]+s[i]);};
const frame=(designId,heldProp,activityPhase=0)=>({id:'social-'+designId,designId,x:29,y:249,bodyYaw:.4,yaw:.4,
  heldProp,activity:heldProp==='cigarette'?'smoke':'drink',activityPhase,phase:2});
const skinPoint=(primitive,bones,index)=>[0,1,2].map(k=>{
  let value=0;for(let slot=0;slot<4;slot++){const w=primitive.weights[index*4+slot],at=primitive.joints[index*4+slot]*16;
    value+=w*(bones[at+k]*primitive.positions[index*3]+bones[at+k+4]*primitive.positions[index*3+1]+bones[at+k+8]*primitive.positions[index*3+2]+bones[at+k+12]);}return value;
});

test('real cigarette, hollow vessels, liquid surfaces and sparse smoke have finite closed-thickness geometry',()=>{
 const meshes=geometry();assert.equal(geometry(),meshes);assert.ok(Object.isFrozen(meshes[0].groups[0].positions));assert.deepEqual(meshes.map(m=>m.name),['academic_social_cigarette','academic_social_glass','academic_social_cup','academic_social_smoke']);
 for(const mesh of meshes){assert.ok(mesh.groups.length>0);for(const group of mesh.groups){
  assert.ok(group.positions.every(Number.isFinite));assert.ok(group.normals.every(Number.isFinite));
  assert.equal(group.positions.length,group.normals.length);assert.equal(group.uvs.length,group.positions.length/3*2);
  assert.ok(group.indices.every(i=>i>=0&&i<group.positions.length/3));assert.ok(group.indices.length>0);
  for(let i=0;i<group.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...group.normals.slice(i,i+3))-1)<1e-5);
  assert.equal(group.base[3],1,'accessories obey the actual opaque mesh contract');
 }
 assert.ok(mesh.bounds.min.every((v,i)=>v<mesh.bounds.max[i]));}
 const cig=meshes[0];assert.ok(cig.bounds.max[0]-cig.bounds.min[0]<.009,'cigarette is not enlarged into a baton');
 assert.ok(cig.bounds.max[2]-cig.bounds.min[2]>.09);assert.ok(cig.groups.find(g=>g.material==='ember'));
 const glass=meshes[1];assert.ok(glass.groups.some(g=>g.material==='wine'));assert.ok(glass.bounds.max[1]>.075&&glass.bounds.min[1]<-.09);
 const cup=meshes[2];assert.ok(cup.groups.some(g=>g.material==='tea'));assert.ok(cup.bounds.max[0]>.06,'real cup handle projects past the vessel');
});

test('production installer creates all normal-pass GPU primitives once with exact shared instance bindings',()=>{
 let id=0;const calls={buffers:[],attributes:[],divisors:[]},gl={ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,FLOAT:4,UNSIGNED_SHORT:5123,
  createBuffer:()=>({id:++id}),createVertexArray:()=>({id:++id}),bindVertexArray(){},bindBuffer(){},enableVertexAttribArray(){},
  bufferData:(target,data,usage)=>calls.buffers.push({target,data,usage}),vertexAttribPointer:(...args)=>calls.attributes.push(args),
  vertexAttribDivisor:(...args)=>calls.divisors.push(args),disableVertexAttribArray(){},vertexAttrib1f(){}};
 const pack={catalog:new Map()},names=install(gl,pack);assert.equal(names.length,4);const allocations=id;install(gl,pack);assert.equal(id,allocations,'repeat load must not allocate duplicate buffers');
 for(const name of names){const mesh=pack.catalog.get(name);assert.equal(mesh.extras.academicSocialProp,true);assert.ok(mesh.extras.bounds);assert.ok(mesh.instanceBuffer);
  for(const p of mesh.primitives){assert.equal(p.indexType,gl.UNSIGNED_SHORT);assert.ok(p.count>0);assert.equal(p.texture,null);assert.ok(p.base.every(Number.isFinite));}}
 for(const[location,size,offset]of PROP_INSTANCE_BINDINGS)assert.ok(calls.attributes.some(a=>a[0]===location&&a[1]===size&&a[4]===PROP_INSTANCE_FLOATS*4&&a[5]===offset));
 assert.ok(calls.divisors.some(a=>a[0]===3&&a[1]===1));assert.deepEqual(install(null,pack),[]);
});

test('smoking and sipping solve actual wrist and fingertip contacts throughout both anatomical rigs',()=>{
 for(const designId of['attendant','listener'])for(const prop of['cigarette','glass','cup'])for(const propHand of['L','R'])for(const t of[0,1.6,2.4,3.4,4.8,6.5,7.1,8.8,14,18]){
  const f={...frame(designId,prop,t),propHand},p=pose(f),d=DESIGNS[designId],entry=asset.entries.find(e=>e.name===d.mesh);
  assert.equal(p.objects.length,1,'a held object cannot disappear between animation phases');assert.equal(p.objects[0].side,propHand);
  for(const c of p.contacts)if(c.kind==='arm'||c.kind==='finger')assert.ok(c.error<.00003,`${designId} ${prop} ${c.kind}/${c.finger} escaped its real contact: ${c.error}`);
  for(const j of Object.values(p.joints)){assert.ok(j.translation.every(Number.isFinite));assert.ok(j.rotation.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...j.rotation)-1)<1e-5);}
  const gpu=sampleCharacterPose(asset,entry,{joints:p.joints});assert.ok([...gpu.bones].every(Number.isFinite));
  for(const side of['L','R'])for(const pair of[['upperarm','forearm'],['forearm','hand']]){
   const a=RIGS[d.source].find(b=>b.name===pair[0]+'_'+side),b=RIGS[d.source].find(b=>b.name===pair[1]+'_'+side),actual=n=>RIGS[d.source].find(b=>b.name===n).head.map((v,i)=>v+p.joints[`society_${d.source}_${n}`].translation[i]);
   assert.ok(Math.abs(distance(actual(a.name),actual(b.name))-distance(a.head,a.tail))<.00003,'arms keep their anatomical length');
  }
 }
});

test('actual rendered vessel rim and cigarette mouth end meet the skinned mouth at lift peak',()=>{
 for(const designId of['attendant','listener'])for(const prop of['cigarette','glass','cup']){
  const f=frame(designId,prop,prop==='cigarette'?4:6),all=instances([f]),body=all.find(i=>i.academicPopulationActor),object=all.find(i=>i.heldObject===prop);
  assert.equal(object.lift,1);const d=DESIGNS[designId],entry=asset.entries.find(e=>e.name===d.mesh),gpu=sampleCharacterPose(asset,entry,body.character),lip=entry.primitives.find(p=>asset.json.materials[p.material].name.endsWith(' lip'));
  const lipMean=[0,1,2].map(k=>Array.from({length:lip.vertexCount},(_,i)=>skinPoint(lip,gpu.bones,i)[k]).reduce((a,b)=>a+b)/lip.vertexCount);
  const mouth=point(body.matrix,lipMean),rim=point(object.matrix,prop==='cigarette'?[0,0,.018]:[0,prop==='glass'?.08:.065,0]);
  assert.ok(distance(mouth,rim)<.035,`${designId} ${prop} must reach the real deformed lips rather than a generic head-height target: ${distance(mouth,rim)}`);
 }
});

test('supported rail lean meets the real projected1.208m crown while shoes stay planted and free hand holds its drink',()=>{
 for(const designId of['attendant','listener'])for(const project of[(x,y)=>({x,y:10,z:y}),(x,y)=>({x:200-x*.7,y:10,z:800-y*1.3})]){
  const f={...frame(designId,'glass'),x:28.3,y:249.2,bodyYaw:Math.PI/2,yaw:Math.PI/2,activity:'lean',support:{id:'academic-west-rail',x:28.84,y:249.2,height:1.208,side:'R',kind:'rail'}};
  const all=instances([f],{project}),body=all[0];assert.equal(body.supported,true);assert.equal(all.find(i=>i.heldObject==='glass').hand,'L');
  const at=project(f.x,f.y),target=project(f.support.x,f.support.y),m=body.matrix,dx=target.x-at.x,dz=target.z-at.z,c=Math.cos(body.yaw),s=Math.sin(body.yaw),sx=Math.hypot(m[0],m[2]),sz=Math.hypot(m[8],m[10]);
  const supportLocal=[(c*dx+s*dz)/sx,1.208/m[5],(-s*dx+c*dz)/sz];
  const p=pose(f,{supportLocal}),contact=p.contacts.find(c=>c.kind==='support');assert.ok(contact);assert.ok(contact.error<.00001);
  assert.ok(distance(point(m,contact.point),[target.x,target.y+1.208,target.z])<.00001,'palm actually meets the authored rail crown after projection and stature scale');
  const idle=academicBouncerPose({...f,stance:'aside'});for(const name of['pelvis','thigh_L','thigh_R','shin_L','shin_R','foot_L','foot_R','toe_L','toe_R'])assert.deepEqual(p.joints[`society_${DESIGNS[designId].source}_${name}`],idle.joints[`society_${DESIGNS[designId].source}_${name}`]);
 }
});

test('missing, distant, unlabelled or unreachable supports never manufacture a leaning body',()=>{
 for(const support of[null,{x:28.84,y:249.2,height:1.208},{id:'fake',x:34,y:249.2,height:1.208,kind:'rail'},
  {id:'wrong-height',x:28.84,y:249.2,height:2.1,kind:'rail'}]){
  const f={id:'unsupported',designId:'attendant',x:28.3,y:249.2,bodyYaw:Math.PI/2,yaw:Math.PI/2,activity:'lean',support};
  const body=instances([f])[0];assert.equal(body.supported,false);const rest=instances([{...f,activity:'talk',support:null}])[0];assert.deepEqual(body.character.joints,rest.character.joints);
 }
});

test('controller time freezes every activity and actual held object; reduced motion holds a stable lower grip',()=>{
 for(const designId of['attendant','listener'])for(const prop of['cigarette','glass','cup']){
  const f=frame(designId,prop,prop==='cigarette'?4:6),a=instances([f],{timeSec:0}),b=instances([f],{timeSec:9999});assert.deepEqual(a,b,'wall-clock must not move a paused social activity');
  assert.deepEqual(instances([f],{reducedMotion:true,timeSec:0}),instances([{...f,activityPhase:1000,phase:2000}],{reducedMotion:true,timeSec:9999}));
  for(const condition of[{speaking:true},{talkingToPlayer:true},{mode:'watching'},{mode:'walk',speed:.34,distance:.2}]){
   const all=instances([{...f,...condition}]),object=all.find(i=>i.heldObject===prop);assert.equal(object.lift,0,'talking, walking or watching keeps the prop below the lips');
  }
 }
});

test('objects retain exact world projection and markers without inflating body counts or animating hollows',()=>{
 const frames=[frame('attendant','glass',6),{...frame('listener','cigarette',4),id:'smoker'},
  {id:'hollow',designId:'unfinished-visitor',x:29,y:249,activity:'smoke',heldProp:'cigarette'}];
 const all=instances(frames,{project:(x,y)=>({x:100-x*.7,y:10.375,z:500-y*1.3}),zone:8});
 assert.equal(all.filter(i=>i.academicPopulationActor).length,3);assert.equal(all.filter(i=>i.academicPopulationProp).length,3);
 for(const part of all.filter(i=>i.academicPopulationProp)){assert.equal(part.academicPopulationActor,undefined);assert.equal(part.character,undefined);assert.equal(part.zone,8);assert.ok([...part.matrix].every(Number.isFinite));assert.ok(distance([part.x,part.y,part.z],[part.matrix[12],part.matrix[13],part.matrix[14]])<.00002);}
 assert.equal(all.find(i=>i.heldObject==='smoke').noShadow,true);
 const hidden=instances(frames,{listener:{x:100,y:100}});assert.deepEqual(hidden,[],'body and all of its held objects share the same visibility gate');
});


test('raised activities keep elbows below shoulders and deform every actual skin vertex within a bounded envelope',()=>{
 let vertices=0;
 for(const designId of['attendant','listener'])for(const heldProp of['cigarette','glass','cup']){
  const f=frame(designId,heldProp,heldProp==='cigarette'?4:6),p=pose(f),arm=p.contacts.find(c=>c.kind==='arm');
  assert.ok(arm.elbow[1]<arm.shoulder[1]+.02,'lifting a glass or cigarette cannot throw the elbow above the ear');
  const entry=asset.entries.find(e=>e.name===DESIGNS[designId].mesh),gpu=sampleCharacterPose(asset,entry,{joints:p.joints});
  for(const primitive of entry.primitives)for(let i=0;i<primitive.vertexCount;i++){
   const v=skinPoint(primitive,gpu.bones,i);vertices++;assert.ok(v.every(Number.isFinite));
   assert.ok(v[1]>-.035&&v[1]<1.9&&Math.abs(v[0])<.95&&Math.abs(v[2])<.8,'real skinned mesh must not stretch away from the standing body');
  }
 }
 assert.ok(vertices>70000);
});

test('current authored groups retain all26 bodies and all18 ordinary held objects without giving props to hollows',()=>{
 const controller=createAcademicFloorPopulation();controller.tick(.1,{onAcademicFloor:true,audibleGroupIds:[],canMove:()=>false});
 const frames=controller.actorFrame(),all=instances(frames),ordinary=CAST.filter(actor=>actor.kind==='npc');
 assert.equal(frames.length,26);assert.equal(all.filter(i=>i.academicPopulationActor).length,26);assert.equal(ordinary.length,18);
 for(const actor of ordinary)assert.equal(all.filter(i=>i.academicPopulationProp===actor.id&&i.heldObject===actor.heldProp).length,1,actor.id+' must visibly retain its authored social object');
 for(const actor of CAST.filter(a=>a.kind==='hollow'))assert.equal(all.filter(i=>i.academicPopulationProp===actor.id).length,0);
});

const closestTriangle=(p,a,b,c)=>{
 const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return a;
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return add(a,mul(ab,d1/(d1-d3)));
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return add(a,mul(ac,d2/(d2-d6)));
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return add(b,mul(sub(c,b),(d4-d3)/((d4-d3)+(d5-d6))));
 const denominator=1/(va+vb+vc);return add(a,add(mul(ab,vb*denominator),mul(ac,vc*denominator)));
};
test('support crown is an actual retained GLB triangle and the skinned palm underside meets it without penetrating',()=>{
 const galleryBytes=fs.readFileSync(new URL('../public/assets/academic-gallery.glb',import.meta.url)),j=JSON.parse(galleryBytes.subarray(20,20+galleryBytes.readUInt32LE(12))),binary=20+galleryBytes.readUInt32LE(12)+8;
 const accessor=index=>{const a=j.accessors[index],v=j.bufferViews[a.bufferView],size=a.type==='VEC3'?3:1,offset=binary+(v.byteOffset||0)+(a.byteOffset||0),Type={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];return new Type(galleryBytes.buffer,galleryBytes.byteOffset+offset,a.count*size);};
 const target=[78.84,11.208,9.2];let nearest=Infinity;
 for(const primitive of j.meshes.find(m=>m.name==='gallery_atrium_structure').primitives){const p=accessor(primitive.attributes.POSITION),indices=accessor(primitive.indices);
  for(let i=0;i<indices.length;i+=3){const q=Array.from(indices.slice(i,i+3),n=>[p[n*3]+85,p[n*3+1]+10,p[n*3+2]+15]);nearest=Math.min(nearest,distance(target,closestTriangle(target,...q)));}}
 assert.ok(nearest<.000001,'rail support must match retained primary mesh triangles, not an assumed waist plane');
 for(const designId of['attendant','listener']){
  const f={id:'skin-rail',designId,x:28.3,y:249.2,yaw:Math.PI/2,bodyYaw:Math.PI/2,activity:'lean',support:{id:'academic-gallery-west-crown',x:28.84,y:249.2,height:1.208,side:'R',kind:'rail'}};
  const body=instances([f],{project:(x,y)=>({x:x+50,y:10,z:y-240})})[0],entry=asset.entries.find(e=>e.name===body.mesh),gpu=sampleCharacterPose(asset,entry,body.character),surface=[];
  for(const primitive of entry.primitives)for(let i=0;i<primitive.vertexCount;i++){
   let handWeight=0;for(let slot=0;slot<4;slot++)if(asset.nodes[entry.skin.joints[primitive.joints[i*4+slot]]].name.endsWith('_hand_R'))handWeight+=primitive.weights[i*4+slot];
   if(handWeight<.7)continue;const p=point(body.matrix,skinPoint(primitive,gpu.bones,i));
   if(Math.abs(p[0]-target[0])<.0445&&Math.abs(p[2]-target[2])<.085)surface.push(p);
  }
  assert.ok(surface.length>60);const underside=Math.min(...surface.map(p=>p[1]));
  assert.ok(underside>=target[1]-.001&&underside<=target[1]+.002,`${designId} actual palm underside must rest on, rather than through or above, the rail: ${underside-target[1]}`);
 }
});


test('rail smoker draws with the free hand through a complete cycle while the supported palm and feet stay fixed',()=>{
 const f={id:'actual-rail-smoker',designId:'listener',x:28.3,y:249.2,yaw:Math.PI/2,bodyYaw:Math.PI/2,activity:'lean',heldProp:'cigarette',phase:1,
  support:{id:'academic-gallery-west-crown',x:28.84,y:249.2,height:1.208,side:'R',kind:'rail'}};
 const supportLocal=[0,1.208/(1.81/1.78),-.54/.99];let atMouth=0,atRest=0;
 for(const t of[0,1.6,2.4,3.4,4.0,4.8,5.6,6.4,10,14]){
  const current={...f,activityPhase:t},p=pose(current,{supportLocal}),all=instances([current]),body=all[0],object=all.find(i=>i.heldObject==='cigarette');
  assert.equal(body.supported,true);assert.equal(object.hand,'L');assert.equal(p.contacts.find(c=>c.kind==='support').side,'R');
  assert.ok(distance(p.contacts.find(c=>c.kind==='support').point,supportLocal)<.00001);
  if(object.lift===0)atRest++;if(object.lift===1){atMouth++;
   const entry=asset.entries.find(e=>e.name===body.mesh),gpu=sampleCharacterPose(asset,entry,body.character),lip=entry.primitives.find(p=>asset.json.materials[p.material].name.endsWith(' lip'));
   const mean=[0,1,2].map(k=>Array.from({length:lip.vertexCount},(_,i)=>skinPoint(lip,gpu.bones,i)[k]).reduce((a,b)=>a+b)/lip.vertexCount);
   assert.ok(distance(point(body.matrix,mean),point(object.matrix,[0,0,.018]))<.035,'leaned head and moving free-hand cigarette still meet at actual lips');
  }
 }
 assert.ok(atMouth>0&&atRest>0,'rail smoker both rests and draws without releasing the support');
});
