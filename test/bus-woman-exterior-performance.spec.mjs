import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {busWomanExteriorDescriptor,busWomanExteriorInstances} from '../src/render/bus-woman-exterior-performance.js';

const woman={id:'yard-bus-waiter',mesh:'exterior_bus_woman',x:4,y:.12,z:8,yaw:.4,zone:18};
test('shelter woman breathes continuously while her authored placement and bag stay intact',()=>{
  const before=busWomanExteriorInstances(woman,{timeSec:0}),after=busWomanExteriorInstances(woman,{timeSec:4});
  assert.deepEqual(before.map(p=>p.mesh),['exterior_bus_woman','bus_woman_bag']);
  assert.notDeepEqual(before[0].character,after[0].character);
  assert.ok([...before,...after].every(p=>p.x===4&&p.y===.12&&p.z===8&&p.yaw===.4));
  assert.equal(after[0].character,after[1].character,'the bag samples exactly the body pose');
  const a=busWomanExteriorDescriptor({timeSec:18-1/30}),b=busWomanExteriorDescriptor({timeSec:18});
  assert.ok(Math.abs(a.time-b.time)<.001,'the cycle returns through a smooth endpoint');
});
test('shelter conversation turns attention without changing the ticket or the returning-road performance',()=>{
  const idle=busWomanExteriorDescriptor({timeSec:4}),talk=busWomanExteriorDescriptor({timeSec:4,conversation:{active:true,speaking:true,weight:1,speakingWeight:1,headYaw:.32}});
  assert.equal(talk.clip,idle.clip);assert.equal(talk.time,idle.time);
  assert.notDeepEqual(talk.joints.bus_woman_head,idle.joints.bus_woman_head);
  assert.notDeepEqual(talk.joints.bus_woman_jaw,idle.joints.bus_woman_jaw);
  for(const pose of Object.values(talk.joints))assert.ok([...pose.translation,...pose.rotation].every(Number.isFinite));
  assert.equal(busWomanExteriorInstances(woman,{conversation:{active:true}}).length,2,'talking never creates a returned ticket');
});
test('reduced motion freezes the idle and speaking rhythm',()=>{
  const options={reducedMotion:true,conversation:{active:true,speaking:true,headYaw:.2}};
  assert.deepEqual(busWomanExteriorDescriptor({...options,timeSec:0}),busWomanExteriorDescriptor({...options,timeSec:100}));
});

// A finite, normalized quaternion can still articulate a human jaw backwards.
// Check the actual weighted production skin, with identical head/body poses,
// so this fails on the original upward/closing speech rotation.
test('the exported shelter woman lowers her jaw to speak while her head and bag keep the same pose',()=>{
  const bytes=fs.readFileSync(new URL('../public/assets/bus-woman-character.glb',import.meta.url)),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)),entry=asset.entries.find(e=>e.name==='exterior_bus_woman');
  assert.ok(entry);const jaw=entry.skin.joints.findIndex(i=>asset.nodes[i].name==='bus_woman_jaw');assert.ok(jaw>=0);
  const options={timeSec:4.7,conversation:{active:true,weight:1,headYaw:0}},listen=busWomanExteriorDescriptor(options),talk=busWomanExteriorDescriptor({...options,conversation:{...options.conversation,speaking:true,speakingWeight:1}}),a=sampleCharacterPose(asset,entry,listen),b=sampleCharacterPose(asset,entry,talk);
  for(const name of Object.keys(listen.joints))if(name!=='bus_woman_jaw')assert.deepEqual(talk.joints[name],listen.joints[name],'mouth articulation must not displace the head, hands, bag or ticket');
  const point=(p,v,pose)=>{const out=[0,0,0];for(let slot=0;slot<4;slot++){const joint=p.joints[v*4+slot]*16,weight=p.weights[v*4+slot];for(let axis=0;axis<3;axis++)out[axis]+=weight*(pose.bones[joint+axis]*p.positions[v*3]+pose.bones[joint+axis+4]*p.positions[v*3+1]+pose.bones[joint+axis+8]*p.positions[v*3+2]+pose.bones[joint+axis+12]);}return out;};
  const displacements=[];
  for(const p of entry.primitives)for(let v=0;v<p.vertexCount;v++){let weight=0;for(let slot=0;slot<4;slot++)if(p.joints[v*4+slot]===jaw)weight+=p.weights[v*4+slot];if(weight>.75)displacements.push(point(p,v,b)[1]-point(p,v,a)[1]);}
  assert.ok(displacements.length>100,'the regression must inspect retained lower-jaw skin, not a helper or proxy point');
  assert.ok(displacements.every(y=>y<-.0002),'the actual jaw-weighted skin must lower to open, rather than rise and close');
  assert.ok(displacements.reduce((a,b)=>a+b,0)/displacements.length<-.001,'the held speech sample should visibly separate the lower jaw by over one millimetre on average');
});
