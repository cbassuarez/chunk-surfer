// Secondary gestures must have real articles, reachable pinches, intact arms
// and a different visual intention from the old generic head nod.
import assert from 'node:assert/strict';
import {secondaryVigilObjects} from '../tools/chunk_surfer/characters/vigil-secondary-objects.mjs';
import {OWEN_KEY_RING,vigilHandFrame,vigilHandPoint} from '../src/data/vigil-secondary-object-layout.js';
import {VIGIL_CHARACTER_RIGS as rigs} from '../src/data/vigil-character-rigs.js';
import {vigilCharacterPose} from '../src/render/vigil-character-performance.js';
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a),unit=a=>mul(a,1/length(a));
const rotate=(v,q)=>{const p=q.slice(0,3),t=mul(cross(p,v),2);return add(v,add(mul(t,q[3]),cross(p,t)));};
const close=(a,b,label,tolerance=1e-5)=>assert.ok(length(sub(a,b))<tolerance,label);
function transform(id,pose,name,p){const b=rigs[id].find(b=>b.name===name),j=pose.joints[`vigil_${id}_${name}`];return add(add(b.head,j.translation),rotate(sub(p,b.head),j.rotation));}
const mats={metal:4,ink:5},meshes=secondaryVigilObjects('owen',rigs.owen,mats),frame=vigilHandFrame(rigs.owen,'L'),handJoint=rigs.owen.findIndex(b=>b.name==='hand_L');
assert.equal(meshes.length,10,'Owen needs one split ring and three distinct keys with open bows, cut blades and grooves');
for(const id of['ruth','leila','denise','malcolm','kit'])assert.deepEqual(secondaryVigilObjects(id,rigs[id],mats),[]);
for(const mesh of meshes){
  const count=mesh.positions.length/3;assert.ok(count>=8&&mesh.indices.length>=12);
  assert.equal(mesh.normals.length,count*3);assert.equal(mesh.skinIndex.length,count*4);assert.equal(mesh.skinWeight.length,count*4);
  assert.ok(mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite));
  for(let i=0;i<count;i++){assert.equal(mesh.skinIndex[i*4],handJoint);assert.deepEqual(mesh.skinWeight.slice(i*4,i*4+4),[1,0,0,0]);assert.ok(Math.abs(length(mesh.normals.slice(i*3,i*3+3))-1)<1e-6);}
  assert.ok(mesh.indices.every(v=>v>=0&&v<count));
}
const ring=meshes[0],ringLocal=Array.from({length:ring.positions.length/3},(_,i)=>{const p=sub(ring.positions.slice(i*3,i*3+3),frame.origin);return[dot(p,frame.x),dot(p,frame.y),dot(p,frame.z)];});
for(const p of ringLocal){const d=sub(p,OWEN_KEY_RING.center);assert.ok(Math.hypot(d[0],d[1])>=OWEN_KEY_RING.radius-OWEN_KEY_RING.wire-1e-6,'keyring hole was filled');}
// Every torus triangle faces away from its local tube centre. An inward shell
// can vanish in the final culled world renderer despite plausible wireframes.
for(let i=0;i<56*8*6;i+=3){const ids=ring.indices.slice(i,i+3),p=ids.map(v=>ringLocal[v]),center=mul(p.reduce(add,[0,0,0]),1/3),n=cross(sub(p[1],p[0]),sub(p[2],p[0])),t=ids.reduce((n,v)=>n+Math.floor(v/8),0)/(3*56),angle=-.13+(Math.PI*2+.26)*t,tube=add(OWEN_KEY_RING.center,[Math.sin(angle)*OWEN_KEY_RING.radius,-Math.cos(angle)*OWEN_KEY_RING.radius,.0048*(t-.5)]);assert.ok(dot(n,sub(center,tube))>0,'keyring triangle winding faces inward');}
const idle=vigilCharacterPose('owen'),peak=vigilCharacterPose('owen',{action:'key-check',progress:.5});
close(sub(peak.hands.L,idle.hands.L),[0,.080,-.025],'key-check must lift the held keyring into inspection');
close(peak.object.position,idle.object.position,'key-check lifts the grounded umbrella');close(peak.object.rotation,idle.object.rotation,'key-check turns the grounded umbrella');
const glance=rotate([0,0,-1],peak.joints.vigil_owen_head.rotation),idleGlance=rotate([0,0,-1],idle.joints.vigil_owen_head.rotation);
assert.ok(glance[1]<idleGlance[1]-.12,'Owen does not look down at his keys');
for(const reducedMotion of[false,true])for(let i=0;i<=20;i++){
  const p=vigilCharacterPose('owen',{action:'key-check',progress:i/20,reducedMotion});
  for(const finger of['thumb','index']){
    const c=p.contacts.find(c=>c.secondary==='keys'&&c.finger===finger);assert.ok(c&&c.error<.00001,'keyring pinch is unreachable');
    close(c.point,transform('owen',p,'hand_L',vigilHandPoint(frame,OWEN_KEY_RING.pinch[finger])),'fingertip detaches from rigid hand-bound ring');
    const links=['','_mid','_tip'].map(s=>rigs.owen.find(b=>b.name===finger+s+'_L'));
    for(let j=0;j<2;j++)close(transform('owen',p,links[j].name,links[j].tail),transform('owen',p,links[j+1].name,links[j+1].head),'pinch breaks a phalanx');
  }
  const wrist=p.contacts.find(c=>c.kind==='wrist'&&c.side==='L');assert.ok(wrist.error<1e-6,'key-check wrist is out of reach');
  for(const side of['L','R']){const forearm=rigs.owen.find(b=>b.name==='forearm_'+side),hand=rigs.owen.find(b=>b.name==='hand_'+side);close(transform('owen',p,forearm.name,forearm.tail),transform('owen',p,hand.name,hand.head),'key-check disconnects an arm');}
  if(i===0||i===20)for(const[name,j]of Object.entries(idle.joints)){close(p.joints[name].translation,j.translation,'key-check endpoint translation pops');close(p.joints[name].rotation,j.rotation,'key-check endpoint rotation pops');}
}
const leilaIdle=vigilCharacterPose('leila'),leilaLook=vigilCharacterPose('leila',{action:'window-look',progress:.5}),look=rotate([0,0,-1],leilaLook.joints.vigil_leila_head.rotation),restLook=rotate([0,0,-1],leilaIdle.joints.vigil_leila_head.rotation);
assert.ok(look[1]>restLook[1]+.25,'window-look does not lift Leila’s gaze to the upper storey');
assert.ok(Math.abs(look[0]-restLook[0])>.25,'window-look is still the generic nod without a turn');
close(leilaLook.object.position,leilaIdle.object.position,'window-look disturbs the held flask');close(leilaLook.hands.L,leilaIdle.hands.L,'window-look detaches flask hand');
for(const progress of[0,1])for(const reducedMotion of[false,true]){const p=vigilCharacterPose('leila',{action:'window-look',progress,reducedMotion});for(const[name,j]of Object.entries(leilaIdle.joints))close(p.joints[name].rotation,j.rotation,'window-look endpoint pops');}
console.log('vigil secondary object specs passed (real keys, rigid pinches, grounded umbrella, window gaze)');
