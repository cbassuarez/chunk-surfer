import test from 'node:test';
import assert from 'node:assert/strict';
import {createExteriorConversationPerformance as fresh,transitionExteriorConversationPerformance as transition,sampleExteriorConversationPerformance as sample,exteriorPerformanceFrame} from '../src/render/exterior-conversation-performance.js';
import {streetCrowdPose,streetCrowdInstances,STREET_CROWD_DESIGNS} from '../src/render/street-crowd-performance.js';
import {vigilCharacterPose,vigilCharacterDescriptor} from '../src/render/vigil-character-performance.js';
import {VIGIL_CHARACTER_DESIGNS} from '../src/data/vigil-character-design.js';
import {VIGIL_CHARACTER_RIGS} from '../src/data/vigil-character-rigs.js';

const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const conversation=(speaking=true,headYaw=.22)=>({active:true,speaking,elapsedSec:2,weight:1,speakingWeight:speaking?1:0,headYaw});
const checkPose=pose=>{
  for(const joint of Object.values(pose.joints)){
    assert.ok([...joint.translation,...joint.rotation].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(...joint.rotation)-1)<1e-7);
  }
  for(const contact of pose.contacts)assert.ok(contact.error<1e-5,`anatomical ${contact.kind}/${contact.side} contact remains reachable`);
};

test('conversation channels enter, change speaker, interrupt and settle continuously without mutating their input',()=>{
  const idle=fresh(),snapshot=JSON.stringify(idle);
  const begin=transition(idle,{active:true,speaking:false,timeSec:10,headYaw:.9});
  assert.equal(sample(begin,10).weight,0);
  assert.equal(sample(begin,11).weight,1);
  assert.equal(sample(begin,11).headYaw,.38,'gaze stays within a humane local head rotation');
  const talk=transition(begin,{speaking:true,timeSec:11});
  assert.equal(sample(talk,11).speakingWeight,0);
  assert.equal(sample(talk,11.3).speakingWeight,1);
  const interrupt=transition(talk,{speaking:false,timeSec:11.4});
  assert.equal(sample(interrupt,11.4).speakingWeight,sample(talk,11.4).speakingWeight);
  assert.ok(sample(interrupt,11.5).speakingWeight>0&&sample(interrupt,11.5).speakingWeight<1);
  const end=transition(interrupt,{active:false,timeSec:11.5});
  assert.equal(sample(end,11.5).weight,sample(interrupt,11.5).weight);
  assert.equal(sample(end,12.5).weight,0);
  assert.equal(sample(end,12.5).speakingWeight,0);
  assert.equal(sample(end,12.5).headYaw,0);
  assert.equal(JSON.stringify(idle),snapshot);
  assert.ok(Object.isFrozen(end)&&Object.isFrozen(end.attention));
});

test('a gaze-only retarget preserves conversation phase and speech rhythm',()=>{
  const begin=transition(fresh(),{active:true,speaking:true,timeSec:5,headYaw:.1});
  const gaze=transition(begin,{active:true,speaking:true,timeSec:6,headYaw:-.25});
  assert.equal(gaze.phaseStartedAt,begin.phaseStartedAt);
  assert.equal(gaze.attention,begin.attention);
  assert.equal(gaze.speech,begin.speech);
  assert.equal(sample(gaze,6).elapsedSec,1);
  assert.equal(sample(gaze,6).headYaw,sample(begin,6).headYaw);
  assert.equal(sample(gaze,6.5).headYaw,-.25);
});

test('reduced-motion conversation is a deterministic held posture with no mouth or gesture clock',()=>{
  const track=transition(fresh(),{active:true,speaking:true,timeSec:5,headYaw:.2});
  assert.deepEqual(sample(track,5,{reducedMotion:true}),sample(track,300,{reducedMotion:true}));
  const reduced=sample(track,50,{reducedMotion:true});
  for(const id of ['ruth','kit','district-pub-driver']){
    const a=exteriorPerformanceFrame(id,{timeSec:8,reducedMotion:true,conversation:reduced});
    const b=exteriorPerformanceFrame(id,{timeSec:888,reducedMotion:true,conversation:reduced});
    assert.deepEqual(a,b);assert.equal(a.jaw,0);assert.equal(a.gesture,0);assert.equal(a.ambient,0);
  }
});

test('all six named people retain planted feet and exact object contacts through talk, listen and release',()=>{
  const rigBefore=JSON.stringify(VIGIL_CHARACTER_RIGS);
  for(const id of Object.keys(VIGIL_CHARACTER_DESIGNS)){
    const rest=vigilCharacterPose(id),talk=vigilCharacterPose(id,{timeSec:12,conversation:conversation()});
    const listen=vigilCharacterPose(id,{timeSec:12,conversation:conversation(false)});
    assert.notDeepEqual(talk.joints[`vigil_${id}_head`],rest.joints[`vigil_${id}_head`],`${id} turns its attention to the player`);
    assert.notDeepEqual(talk.joints[`vigil_${id}_jaw`].rotation,listen.joints[`vigil_${id}_jaw`].rotation,`${id} responds to the actual speaking window`);
    for(const pose of [talk,listen,vigilCharacterPose(id,{timeSec:12.2,conversation:{active:false,elapsedSec:.2,weight:.7,speakingWeight:.3,headYaw:.1}})]){
      checkPose(pose);
      for(const side of ['L','R'])for(const name of ['thigh','shin','foot','toe']){
        assert.deepEqual(pose.joints[`vigil_${id}_${name}_${side}`],rest.joints[`vigil_${id}_${name}_${side}`]);
      }
    }
  }
  const kitTalk=vigilCharacterPose('kit',{timeSec:12,conversation:conversation()});
  const kitListen=vigilCharacterPose('kit',{timeSec:12,conversation:conversation(false)});
  assert.ok(kitListen.object.position[2]<kitTalk.object.position[2]-.025,'Kit offers the microphone when the other person speaks');
  assert.equal(JSON.stringify(VIGIL_CHARACTER_RIGS),rigBefore);
});

test('vigil body and held-part descriptors share one bounded solve at 30Hz',()=>{
  const options={timeSec:12.001,conversation:conversation()};
  const body=vigilCharacterDescriptor('vigil_ruth_mallory',null,options);
  const part=vigilCharacterDescriptor('vigil_part_ruth_binder',null,{...options,timeSec:12.010});
  assert.equal(body,part,'linked object receives the identical joint object within this pose sample');
  assert.notEqual(vigilCharacterDescriptor('vigil_ruth_mallory',null,{...options,timeSec:12.040}),body);
  const reduced=vigilCharacterDescriptor('vigil_kit_renshaw',null,{timeSec:0,reducedMotion:true});
  assert.equal(vigilCharacterDescriptor('vigil_part_kit_microphone',null,{timeSec:100,reducedMotion:true}),reduced);
});

test('named idle respiration is visible immediately but keeps root, shoes and grasp contacts planted',()=>{
  for(const id of Object.keys(VIGIL_CHARACTER_DESIGNS)){
    const a=vigilCharacterPose(id,{timeSec:4}),b=vigilCharacterPose(id,{timeSec:12});
    assert.notDeepEqual(a.joints[`vigil_${id}_chest`],b.joints[`vigil_${id}_chest`]);
    assert.deepEqual(a.joints[`vigil_${id}_pelvis`],b.joints[`vigil_${id}_pelvis`]);
    for(const side of ['L','R'])for(const name of ['thigh','shin','foot','toe'])assert.deepEqual(a.joints[`vigil_${id}_${name}_${side}`],b.joints[`vigil_${id}_${name}_${side}`]);
    checkPose(a);checkPose(b);
  }
});

test('both talkable street locals gesture differently while their feet and instance anchors stay planted',()=>{
  const poses=[];
  for(const id of ['district-mews-neighbor','district-pub-driver']){
    const rest=streetCrowdPose(id,{timeSec:12}),talk=streetCrowdPose(id,{timeSec:12,conversation:conversation()});
    assert.notDeepEqual(streetCrowdPose(id,{timeSec:4}).joints.street_male_chest,rest.joints.street_male_chest,'quiet locals breathe before their first conversation');
    checkPose(talk);poses.push(talk);
    assert.ok(distance(rest.hands.R,talk.hands.R)>.012,'speaking has a deliberate free-hand gesture');
    for(const side of ['L','R'])for(const name of ['thigh','shin','foot','toe']){
      assert.deepEqual(talk.joints[`street_male_${name}_${side}`],rest.joints[`street_male_${name}_${side}`]);
    }
    const instance={id,mesh:STREET_CROWD_DESIGNS[id].legacyMesh,x:18,y:.12,z:40,yaw:.7};
    const body=streetCrowdInstances([instance],{timeSec:12,conversations:{[id]:conversation()}})[0];
    assert.deepEqual([...body.matrix.slice(12,15)],[18,Math.fround(.12),40]);
    assert.deepEqual(body.character.joints,talk.joints);
  }
  assert.notDeepEqual(poses[0].hands.R,poses[1].hands.R);
});

test('background movement is sparse and object-led, with no shared whole-body bob',()=>{
  const activeCounts=new Map(),signatures=new Set();
  for(const [id,design]of Object.entries(STREET_CROWD_DESIGNS)){
    if(id.startsWith('district-'))continue;
    let count=0;const signature=[];
    for(let t=6;t<100;t+=.5){const perf=exteriorPerformanceFrame(id,{timeSec:t});if(perf.ambient>.001)count++;signature.push(perf.ambient.toFixed(2));}
    assert.ok(count>0&&count<35,`${id} has a brief purposeful adjustment surrounded by stillness`);
    activeCounts.set(id,count);signatures.add(signature.join(','));
    for(const t of [0,12,38,73])checkPose(streetCrowdPose(id,{timeSec:t}));
    if(design.accessory==='umbrella'){
      const a=streetCrowdPose(id,{timeSec:12}),b=streetCrowdPose(id,{timeSec:55});
      assert.deepEqual(a.joints[`street_${design.source}_pelvis`].translation,b.joints[`street_${design.source}_pelvis`].translation);
    }
  }
  assert.equal(signatures.size,18,'individual people do not share one phase-shifted short idle loop');
});
