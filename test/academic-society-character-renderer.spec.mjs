import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {academicSocietyCharacterPose as pose,academicSocietyCharacterInstances as instances,academicFloorPopulationInstances as populationInstances,academicFloorPopulationPose} from '../src/render/academic-society-characters.js';
import {ACADEMIC_FLOOR_GUESTS as GUESTS} from '../src/data/academic-floor-population.js';
import {ACADEMIC_SOCIETY_CHARACTER_DESIGNS as DESIGNS,ACADEMIC_SOCIETY_CHARACTER_RIGS as RIGS,ACADEMIC_FLOOR_POPULATION_DESIGNS as POPULATION} from '../src/data/academic-society-character-design.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
const bytes=fs.readFileSync(new URL('../public/assets/academic-society-characters.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const actors=Object.keys(DESIGNS).map((id,index)=>({id,x:12.25+index*.125,y:246.375+index*.25,yaw:.3+index*.2}));
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-5,message||`${a} differs from ${b}`);
const direction=i=>[-i.matrix[8],-i.matrix[10]];
function faces(instance,target){const a=direction(instance),b=[target.x-instance.x,target.z-instance.z],dot=(a[0]*b[0]+a[1]*b[1])/(Math.hypot(...a)*Math.hypot(...b));assert.ok(dot>.99999,`local -Z faces away from projected listener: ${dot}`);}

test('seven original character meshes use the exact shared anatomical rig mappings',()=>{
 const all=instances(actors);assert.equal(all.length,7);
 for(const[i,actor]of actors.entries()){
  const d=DESIGNS[actor.id],instance=all[i],entry=asset.entries.find(e=>e.name===instance.mesh);assert.equal(instance.mesh,d.mesh);assert.equal(instance.id,'academic-person-'+actor.id);assert.equal(instance.academicSocietyActor,actor.id);assert.equal(instance.structural,false);assert.equal(entry.skin.joints.length,54);
  const names=Object.keys(instance.character.joints);assert.equal(names.length,54);assert.deepEqual(names,RIGS[d.source].map(b=>`society_${d.source}_${b.name}`));assert.deepEqual(new Set(names),new Set(entry.skin.joints.map(j=>asset.nodes[j].name)));
 }
});

test('idle, listening and speaking always produce finite unit 54-joint poses in the actual asset',()=>{
 for(const actor of actors)for(const speaking of[false,true])for(const talkingToPlayer of[false,true])for(const reducedMotion of[false,true])for(const timeSec of[0,.125,12.75,2000.5]){
  const character=pose({...actor,speaking,talkingToPlayer},{timeSec,reducedMotion});assert.equal(Object.keys(character.joints).length,54);
  for(const joint of Object.values(character.joints)){assert.ok(joint.translation.every(Number.isFinite));assert.ok(joint.rotation.every(Number.isFinite));close(Math.hypot(...joint.rotation),1);}
  const entry=asset.entries.find(e=>e.name===DESIGNS[actor.id].mesh),gpu=sampleCharacterPose(asset,entry,{joints:character.joints});assert.ok([...gpu.bones].every(Number.isFinite));assert.ok(character.contacts.every(c=>c.error<.001));
 }
});

test('fractional authored placement and stature scale reach the world matrix exactly once',()=>{
 const project=(x,y)=>({x:100+x*1.75,y:10.375,z:800-y*.625}),all=instances(actors,{project,zone:3});
 for(const[i,actor]of actors.entries()){
  const d=DESIGNS[actor.id],instance=all[i],point=project(actor.x,actor.y),m=instance.matrix;
  assert.equal(instance.x,point.x);assert.equal(instance.y,10.375);assert.equal(instance.z,point.z);close(m[12],point.x);close(m[13],point.y);close(m[14],point.z);assert.equal(instance.zone,3);
  close(Math.hypot(m[0],m[2]),d.width);close(m[5],d.height/(d.source==='male'?1.78:1.70));close(Math.hypot(m[8],m[10]),d.depth);
  close(m[5]*(d.source==='male'?1.78:1.70),d.height,'height must not be applied both to skin and instance');
 }
});

test('local -Z faces a listening player in every cardinal and diagonal direction',()=>{
 const actor={...actors[0],talkingToPlayer:true};
 for(const[dx,dy]of[[0,-3],[3,0],[0,3],[-3,0],[1.25,2.75],[-2.25,-1.5]]){const listener={x:actor.x+dx,y:actor.y+dy},instance=instances([actor],{listener})[0];faces(instance,{x:listener.x,z:listener.y});}
});

test('listener facing follows the supplied world projection including mirrored and unequal axes',()=>{
 const actor={...actors[1],talkingToPlayer:true},project=(x,y)=>({x:400-x*.7,y:10,z:-100-y*2.3});
 for(const[dx,dy]of[[0,-3],[3,0],[0,3],[-3,0],[1.25,2.75]]){const listener={x:actor.x+dx,y:actor.y+dy},instance=instances([actor],{listener,project})[0];faces(instance,project(listener.x,listener.y));}
});

test('authored yaw keeps the same local -Z heading through the world projection',()=>{
 const project=(x,y)=>({x:400-x*.7,y:10,z:-100-y*2.3});
 for(const yaw of[0,Math.PI/2,Math.PI,-Math.PI/2,.37]){const actor={...actors[2],yaw,talkingToPlayer:false},instance=instances([actor],{project,listener:{x:1000,y:1000}})[0],target=project(actor.x+Math.sin(yaw),actor.y-Math.cos(yaw));faces(instance,target);}
});

test('overlapping player position retains authored facing instead of snapping to an undefined bearing',()=>{
 const actor={...actors[3],talkingToPlayer:true,yaw:.65},idle=instances([{...actor,talkingToPlayer:false}])[0],listening=instances([actor],{listener:{x:actor.x,y:actor.y}})[0];assert.deepEqual(listening.matrix,idle.matrix);
});

test('speech articulates only the real jaw and reduced motion disables the added mouth movement',()=>{
 for(const actor of actors){const timeSec=.37,rest=pose(actor,{timeSec}),talk=pose({...actor,speaking:true},{timeSec}),key=`society_${DESIGNS[actor.id].source}_jaw`;assert.notDeepEqual(talk.joints[key].rotation,rest.joints[key].rotation);assert.deepEqual(talk.joints[key].translation,rest.joints[key].translation);for(const name of Object.keys(rest.joints))if(name!==key)assert.deepEqual(talk.joints[name],rest.joints[name]);assert.deepEqual(pose({...actor,speaking:true},{timeSec,reducedMotion:true}),pose({...actor,speaking:false},{timeSec,reducedMotion:true}));}
});

test('reduced motion keeps body poses stable across clock changes without moving the authored root',()=>{
 for(const actor of actors){assert.deepEqual(pose({...actor,speaking:true},{timeSec:0,reducedMotion:true}),pose({...actor,speaking:true},{timeSec:5000,reducedMotion:true}));const a=instances([actor],{timeSec:0})[0],b=instances([actor],{timeSec:5000})[0];assert.deepEqual(a.matrix,b.matrix);}
});

test('controller phase freezes the entire performance including the real jaw during interruption',()=>{
 for(const actor of actors){
  const frozen={...actor,phase:3.25,speaking:false};assert.deepEqual(pose(frozen,{timeSec:0}),pose(frozen,{timeSec:5000}),'wall clock must not advance frozen controller idle');
  const speaking={...frozen,speaking:true,performance:{key:'frozen-line',role:'speaker',cue:'offer',elapsedSec:.7}};
  const a=pose(speaking,{timeSec:.2}),b=pose(speaking,{timeSec:5000});assert.deepEqual(a,b,'suspended active dialogue must not move a hand, head or mouth');
  const advanced=pose({...speaking,phase:3.45,performance:{...speaking.performance,elapsedSec:.9}},{timeSec:5000}),jaw=`society_${DESIGNS[actor.id].source}_jaw`;
  assert.notDeepEqual(a.joints[jaw].rotation,advanced.joints[jaw].rotation,'resumed controller time still articulates the actual jaw');
 }
});

const vertex=(primitive,gpu,index)=>[0,1,2].map(axis=>{
 let value=0;for(let slot=0;slot<4;slot++){const weight=primitive.weights[index*4+slot],at=primitive.joints[index*4+slot]*16;value+=weight*(gpu.bones[at+axis]*primitive.positions[index*3]+gpu.bones[at+axis+4]*primitive.positions[index*3+1]+gpu.bones[at+axis+8]*primitive.positions[index*3+2]+gpu.bones[at+axis+12]);}return value;
});
const jointPoint=(actor,character,name)=>{
 const bone=RIGS[DESIGNS[actor.id].source].find(b=>b.name===name),joint=character.joints[`society_${DESIGNS[actor.id].source}_${name}`];return bone.head.map((v,i)=>v+joint.translation[i]);
};
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

test('semantic offers, interruptions and refusals make readable hand changes while feet stay planted',()=>{
 for(const actor of actors){
  const fixed={...actor,phase:1,speaking:true},rest=pose(fixed),source=DESIGNS[actor.id].source;
  for(const cue of['offer','assure','interrupt','object','concede','recollect','refuse']){
   const start=pose({...fixed,performance:{role:'speaker',cue,elapsedSec:0}}),active=pose({...fixed,performance:{role:'speaker',cue,elapsedSec:1}});
   assert.deepEqual(start,rest,`${actor.id} ${cue} must enter from its held pose without a hand snap`);
   const changed=Math.max(...['L','R'].map(side=>distance(jointPoint(actor,rest,'hand_'+side),jointPoint(actor,active,'hand_'+side))));
   assert.ok(changed>.025,`${actor.id} ${cue} wrist change is too small to carry a readable gesture: ${changed}`);
   assert.ok(changed<.23,`${actor.id} ${cue} wrist escaped its conversational reach: ${changed}`);
   for(const name of['pelvis','spine_lower','spine_mid','thigh_L','thigh_R','shin_L','shin_R','foot_L','foot_R','toe_L','toe_R'])assert.deepEqual(active.joints[`society_${source}_${name}`],rest.joints[`society_${source}_${name}`],`${name} must stay planted`);
   for(const contact of active.contacts)assert.ok(contact.error<.0001,`${actor.id} ${cue} ${contact.kind} could not reach its contact: ${contact.error}`);
  }
 }
});

test('addressed listeners visibly react without inheriting the speaking mouth or arm cue',()=>{
 for(const actor of actors)for(const cue of['attend','amused','guarded','settle']){
  const fixed={...actor,phase:2.1},rest=pose(fixed),listening=pose({...fixed,performance:{role:'listener',cue,elapsedSec:1.1}}),source=DESIGNS[actor.id].source;
  assert.notDeepEqual(listening.joints[`society_${source}_head`],rest.joints[`society_${source}_head`],`${cue} requires an actual listener head reaction`);
  assert.deepEqual(listening.joints[`society_${source}_foot_L`],rest.joints[`society_${source}_foot_L`]);
  const reduced=pose({...fixed,speaking:true,performance:{role:'listener',cue,elapsedSec:1.1}},{reducedMotion:true});
  assert.deepEqual(reduced,pose({...fixed,speaking:false,performance:{role:'listener',cue,elapsedSec:40}},{reducedMotion:true}),'reduced motion must preserve a stable held body across line times');
 }
});

test('each held line has one breath-length gesture and settles without repeating',()=>{
 for(const actor of actors)for(const role of['speaker','listener'])for(const cue of role==='speaker'?['offer','assure','interrupt','object','concede','recollect','refuse']:['attend','amused','guarded','settle']){
  const fixed={...actor,phase:2.1,speaking:role==='speaker'},rest=pose(fixed),at=t=>pose({...fixed,performance:{key:'same-held-line',role,cue,elapsedSec:t}});
  assert.notDeepEqual(at(.7),rest,`${actor.id} ${cue} needs its initial gesture`);
  assert.deepEqual(at(3),rest,`${actor.id} ${cue} must settle into its held body before a long line ends`);
  assert.deepEqual(at(10),rest,`${actor.id} ${cue} must not repeat while the same line remains held`);
  // The final return also has a gentle endpoint, rather than dropping the arm
  // on a frame boundary just before the nominal 2.2-second gesture completes.
  const late=at(2.19);for(const side of['L','R'])assert.ok(distance(jointPoint(actor,late,'hand_'+side),jointPoint(actor,rest,'hand_'+side))<.0001);
 }
});

test('all cue extremes deform the actual skinned characters finitely without stretching fingers or limbs',()=>{
 let sampled=0;
 for(const actor of actors)for(const role of['speaker','listener'])for(const cue of role==='speaker'?['offer','assure','interrupt','object','concede','recollect','refuse']:['attend','amused','guarded','settle'])for(const elapsedSec of[0,.14,.28,1,3,12]){
  const frame={...actor,phase:3,speaking:role==='speaker',performance:{role,cue,elapsedSec}},character=pose(frame),entry=asset.entries.find(e=>e.name===DESIGNS[actor.id].mesh),gpu=sampleCharacterPose(asset,entry,{joints:character.joints});sampled++;
  for(const joint of Object.values(character.joints)){assert.ok(joint.translation.every(Number.isFinite));assert.ok(joint.rotation.every(Number.isFinite));close(Math.hypot(...joint.rotation),1);}
  for(const side of['L','R']){
   const rig=RIGS[DESIGNS[actor.id].source],upper=rig.find(b=>b.name==='upperarm_'+side),fore=rig.find(b=>b.name==='forearm_'+side);
   close(distance(jointPoint(actor,character,upper.name),jointPoint(actor,character,fore.name)),distance(upper.head,upper.tail));
   close(distance(jointPoint(actor,character,fore.name),jointPoint(actor,character,'hand_'+side)),distance(fore.head,fore.tail));
   const held=pose({...actor,phase:3});
   for(const digit of['thumb','index','middle','ring','little'])close(distance(jointPoint(actor,character,'hand_'+side),jointPoint(actor,character,digit+'_tip_'+side)),distance(jointPoint(actor,held,'hand_'+side),jointPoint(actor,held,digit+'_tip_'+side)),'anatomical fingers must follow the wrist without stretching');
  }
  // Sample every triangle vertex at the largest gesture, not a proxy skeleton.
  if(elapsedSec===1)for(const primitive of entry.primitives)for(let index=0;index<primitive.vertexCount;index++){
   const p=vertex(primitive,gpu,index);assert.ok(p.every(Number.isFinite));assert.ok(Math.abs(p[0])<1.1&&p[1]>-.03&&p[1]<1.9&&Math.abs(p[2])<.85,`${actor.id} ${cue} deformed skin escaped its anatomical envelope: ${p}`);
  }
 }
 assert.equal(sampled,462);
});

test('controlled body yaw remains independent of player bearing while the real head attends ahead',()=>{
 const actor={...actors[1],bodyYaw:.1,yaw:.4,talkingToPlayer:true,phase:1},project=(x,y)=>({x:400-x*.7,y:10,z:-100-y*2.3}),listener={x:actor.x+5,y:actor.y+2};
 const instance=instances([actor],{project,listener})[0],target=project(actor.x+Math.sin(actor.bodyYaw),actor.y-Math.cos(actor.bodyYaw));faces(instance,target);
 const resting=instances([{...actor,yaw:actor.bodyYaw}],{project,listener})[0],head=`society_${DESIGNS[actor.id].source}_head`;
 assert.notDeepEqual(instance.character.joints[head].rotation,resting.character.joints[head].rotation,'head must lead the controlled turn instead of rigidly rotating the whole body');
 assert.deepEqual(instance.matrix,resting.matrix,'head attention cannot move the feet or root transform');
});

test('head lead turns toward the actual addressee through mirrored projections and the yaw wrap',()=>{
 const rotate=(v,q)=>{const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],a=q.slice(0,3),t=cross(a,v).map(n=>n*2),second=cross(a,t);return v.map((n,i)=>n+t[i]*q[3]+second[i]);};
 for(const project of[(x,y)=>({x,y:10,z:y}),(x,y)=>({x:400-x*.7,y:10,z:-100-y*2.3})])for(const[bodyYaw,yaw]of[[0,.3],[0,-.3],[3.12,-3.1],[-3.12,3.1]]){
  const actor={...actors[1],bodyYaw,yaw,talkingToPlayer:true,phase:1},instance=instances([actor],{project})[0],local=rotate([0,0,-1],instance.character.joints.society_male_head.rotation),m=instance.matrix,world=[m[0]*local[0]+m[8]*local[2],m[2]*local[0]+m[10]*local[2]],target=project(actor.x+Math.sin(yaw),actor.y-Math.cos(yaw)),toward=[target.x-instance.x,target.z-instance.z];
  const dot=(world[0]*toward[0]+world[1]*toward[1])/(Math.hypot(...world)*Math.hypot(...toward));assert.ok(dot>.998,`head lead turned away from the projected addressee: ${dot}`);
 }
});

test('hidden or unknown cast entries are excluded without introducing a placeholder body',()=>{
 assert.equal(pose({id:'unknown'}),null);assert.deepEqual(instances([{id:'unknown'},{id:'celeste',x:0,y:0,visible:false}]),[]);
});

test('ordinary and hollow population bodies have independent world placement and cached immutable real poses',()=>{
 const frames=Object.keys(POPULATION).map((designId,index)=>({id:'guest-'+index,designId,x:22.25+index*.3,y:260.125-index*.4,yaw:.27+index*.3})),project=(x,y)=>({x:100-x*.7,y:10,z:800-y*1.3});
 const a=populationInstances(frames,{project,zone:2}),b=populationInstances(frames.map(f=>({...f,phase:1000})),{project,zone:2});assert.equal(a.length,4);
 for(let i=0;i<a.length;i++){
  const frame=frames[i],d=POPULATION[frame.designId],entry=asset.entries.find(e=>e.name===d.mesh),instance=a[i],target=project(frame.x+Math.sin(frame.yaw),frame.y-Math.cos(frame.yaw)),position=project(frame.x,frame.y);
  assert.equal(instance.mesh,d.mesh);assert.equal(instance.id,'academic-population-'+frame.id);assert.equal(instance.academicPopulationActor,frame.id);assert.equal(instance.structural,false);assert.equal(instance.zone,2);assert.equal(instance.hollow,d.hollow||null);faces(instance,target);
  close(instance.x,position.x);close(instance.y,10);close(instance.z,position.z);close(instance.matrix[5],d.height/(d.source==='male'?1.78:1.70));
  assert.equal(instance.character.joints,b[i].character.joints,'silent background pose must be cached, rather than rerun IK for every sample');assert.ok(Object.isFrozen(instance.character.joints));
  for(const joint of Object.values(instance.character.joints)){assert.ok(Object.isFrozen(joint));assert.ok(Object.isFrozen(joint.rotation));assert.ok(Object.isFrozen(joint.translation));}
  assert.equal(Object.keys(instance.character.joints).length,54);const gpu=sampleCharacterPose(asset,entry,{joints:instance.character.joints});assert.ok([...gpu.bones].every(Number.isFinite));
 }
 assert.deepEqual(populationInstances([{id:'bad',designId:'unknown'},null,{...frames[0],visible:false}]),[]);
});

test('ordinary connecting walks retain planted contacts after actual stature and depth scaling',()=>{
 for(const actor of GUESTS.filter(actor=>actor.route)){
  const frame={...actor,yaw:0,bodyYaw:0,y:actor.y-.14,phase:2,mode:'walk',speed:.34,distance:.14},next={...frame,y:actor.y-.20,distance:.20};
  const a=academicFloorPopulationPose(frame),b=academicFloorPopulationPose(next);
  assert.deepEqual(a,academicFloorPopulationPose(frame,{timeSec:9999}));
  for(const p of[a,b]){assert.ok(p.contacts.find(c=>c.kind==='leg'&&c.side==='L').planted);assert.ok(p.contacts.every(c=>c.error<.0001));}
  const worldFoot=(f,p)=>{const source=POPULATION[f.designId].source,rig=RIGS[source],bone=rig.find(b=>b.name==='foot_L'),joint=p.joints[`society_${source}_foot_L`],local=bone.head.map((v,i)=>v+joint.translation[i]),m=populationInstances([f])[0].matrix;return[0,1,2].map(axis=>m[axis]*local[0]+m[axis+4]*local[1]+m[axis+8]*local[2]+m[axis+12]);};
  const first=worldFoot(frame,a),last=worldFoot(next,b);for(let axis=0;axis<3;axis++)assert.ok(Math.abs(first[axis]-last[axis])<.00005,actor.id+' planted contact slides after scaling');
 }
});

test('population gestures and voices use real joints without mutating held poses or animating a silent jaw',()=>{
 for(const designId of['attendant','listener']){
  const base={id:'ordinary-'+designId,designId,x:0,y:0,phase:2,bodyYaw:0,yaw:0},quiet=populationInstances([base])[0],held=structuredClone(quiet.character.joints),source=POPULATION[designId].source,jaw=`society_${source}_jaw`;
  const silent={...base,performance:{role:'speaker',cue:'offer',elapsedSec:.7}},gestured=populationInstances([silent])[0];
  assert.notDeepEqual(gestured.character.joints,quiet.character.joints,'silent company still has a real offered hand');
  assert.deepEqual(gestured.character.joints[jaw].rotation,quiet.character.joints[jaw].rotation,'a silent gesture must not open the mouth; the whole breathing head may translate');
  const speaking=populationInstances([{...silent,speaking:true}])[0];assert.notDeepEqual(speaking.character.joints[jaw],gestured.character.joints[jaw]);
  speaking.character.joints[jaw].rotation[0]=99;assert.deepEqual(populationInstances([base])[0].character.joints,held);
  const reduced=populationInstances([silent],{reducedMotion:true})[0];assert.deepEqual(reduced.character.joints,held);
  const entry=asset.entries.find(e=>e.name===POPULATION[designId].mesh),gpu=sampleCharacterPose(asset,entry,gestured.character);assert.ok([...gpu.bones].every(Number.isFinite));
 }
 const far=[0,17.9,18.1].map((x,i)=>({id:'distance-'+i,designId:'listener',x,y:0}));
 assert.equal(populationInstances(far,{listener:{x:0,y:0}}).length,2);assert.equal(populationInstances(far).length,3);
});
