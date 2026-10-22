import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {academicBouncerPose as pose,academicBouncerInstances as instances} from '../src/render/academic-bouncers.js';
import {academicFloorPopulationInstances} from '../src/render/academic-society-characters.js';
import {ACADEMIC_FLOOR_POPULATION_DESIGNS as DESIGNS,ACADEMIC_SOCIETY_CHARACTER_RIGS as RIGS} from '../src/data/academic-society-character-design.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {createAcademicBouncers} from '../src/game/academic-bouncers.js';
import {ACADEMIC_BOUNCER_ACTORS} from '../src/data/academic-bouncers.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../src/data/academic-society.js';
import {ACADEMIC_BOUNCER_SOCIAL_BEATS} from '../src/data/academic-bouncer-society.js';
const bytes=fs.readFileSync(new URL('../public/assets/academic-society-characters.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const guards=[{id:'protocol',designId:'listener',x:12.125,y:275.25,yaw:.4,height:1.9,width:1.08,depth:1.03},{id:'literalist',designId:'attendant',x:13.625,y:275.25,yaw:-.4,height:1.76,width:1.03,depth:1.02}];
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} differs from ${b}`),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const jointPoint=(frame,character,name)=>{const source=DESIGNS[frame.designId].source,bone=RIGS[source].find(b=>b.name===name);return bone.head.map((v,i)=>v+character.joints[`society_${source}_${name}`].translation[i]);};
const vertex=(p,gpu,v)=>[0,1,2].map(axis=>{let value=0;for(let slot=0;slot<4;slot++){const w=p.weights[v*4+slot],at=p.joints[v*4+slot]*16;value+=w*(gpu.bones[at+axis]*p.positions[v*3]+gpu.bones[at+axis+4]*p.positions[v*3+1]+gpu.bones[at+axis+8]*p.positions[v*3+2]+gpu.bones[at+axis+12]);}return value;});

test('door staff use two distinct complete period bodies already present in the actual loaded pack',()=>{
  const rendered=instances(guards);assert.equal(rendered.length,2);assert.notEqual(rendered[0].mesh,rendered[1].mesh);
  for(const[i,frame]of guards.entries()){
    const body=rendered[i],d=DESIGNS[frame.designId],entry=asset.entries.find(e=>e.name===body.mesh);
    assert.ok(entry);assert.equal(body.mesh,d.mesh);assert.equal(body.academicBouncerActor,frame.id);assert.equal(body.id,'academic-bouncer-'+frame.id);assert.equal(body.structural,false);
    assert.deepEqual(new Set(Object.keys(body.character.joints)),new Set(entry.skin.joints.map(j=>asset.nodes[j].name)));
    assert.equal(Object.keys(body.character.joints).length,54);assert.ok(entry.extras.parts.some(p=>/resculpted face/.test(p.name)));assert.ok(d.costume.date==='1642'||d.costume.date==='1775–1785');
  }
});

test('fractional placement, one stature scale and authored heading survive mirrored unequal projections',()=>{
  for(const project of[(x,y)=>({x,y:10,z:y}),(x,y)=>({x:400-x*.7,y:10.25,z:900-y*2.3})])for(const frame of guards)for(const yaw of[0,Math.PI/2,Math.PI,-Math.PI/2,.37]){
    const body=instances([{...frame,yaw}],{project,zone:6})[0],at=project(frame.x,frame.y),target=project(frame.x+Math.sin(yaw),frame.y-Math.cos(yaw)),forward=[-body.matrix[8],-body.matrix[10]],toward=[target.x-at.x,target.z-at.z];
    close((forward[0]*toward[0]+forward[1]*toward[1])/(Math.hypot(...forward)*Math.hypot(...toward)),1);
    assert.equal(body.matrix[12],Math.fround(at.x));assert.equal(body.matrix[13],Math.fround(at.y));assert.equal(body.matrix[14],Math.fround(at.z));assert.equal(body.zone,6);
    close(Math.hypot(body.matrix[0],body.matrix[2]),frame.width);close(body.matrix[5]*(DESIGNS[frame.designId].source==='male'?1.78:1.70),frame.height);
  }
});

test('controller-owned guard, intermediate and aside roots are rendered exactly without hidden relocation',()=>{
  for(const guard of guards){
    const frames=[{...guard,stance:'guard'},{...guard,x:guard.x+.2,y:guard.y+.15,yaw:guard.yaw+.1,stance:'guard'},{...guard,x:guard.x+.4,y:guard.y+.3,yaw:guard.yaw+.2,stance:'aside'}],snapshot=structuredClone(frames);
    const bodies=instances(frames);for(let i=0;i<frames.length;i++){close(bodies[i].x,frames[i].x);close(bodies[i].z,frames[i].y);close(bodies[i].y,10);}
    assert.notDeepEqual(bodies[0].character.joints,bodies[2].character.joints,'aside hands relax into a distinct reserved stance');assert.deepEqual(frames,snapshot);
  }
});

test('controller phase freezes actual jaw and guard cues; reduced motion keeps a stable body',()=>{
  for(const guard of guards){
    const frame={...guard,phase:1.2,speaking:true,performance:{role:'speaker',cue:'stop',elapsedSec:.7}};
    assert.deepEqual(pose(frame,{timeSec:0}),pose(frame,{timeSec:9999}));
    assert.deepEqual(pose(frame,{reducedMotion:true}),pose({...frame,phase:999,speaking:false,performance:null},{reducedMotion:true}));
    const rest=pose({...guard,phase:1}),talk=pose({...guard,phase:1,speaking:true}),jaw=`society_${DESIGNS[guard.designId].source}_jaw`;
    assert.notDeepEqual(rest.joints[jaw].rotation,talk.joints[jaw].rotation);for(const name of Object.keys(rest.joints))if(name!==jaw)assert.deepEqual(rest.joints[name],talk.joints[name]);
  }
});

test('controller distance drives real planted-foot steps during the authored movement aside',()=>{
  for(const guard of guards){
    const frame={...guard,yaw:0,y:guard.y-.14,mode:'walk',speed:.8,distance:.14,phase:2},a=pose(frame,{timeSec:0}),b=pose(frame,{timeSec:800});
    assert.deepEqual(a,b,'wall clock cannot move a frozen walking frame');
    const left=a.contacts.find(c=>c.kind==='leg'&&c.side==='L');assert.ok(left.planted,'first gait contact should remain in stance');
    const nextFrame={...frame,y:guard.y-.20,distance:.20},next=pose(nextFrame),nextLeft=next.contacts.find(c=>c.kind==='leg'&&c.side==='L');assert.ok(nextLeft.planted);
    // Travel toward local -Z exactly offsets the foot moving back during its
    // stance. This tests the shared gait's world contact, not just joint names.
    const worldFoot=(frame,character)=>{const m=instances([frame])[0].matrix,p=jointPoint(frame,character,'foot_L');return[0,1,2].map(axis=>m[axis]*p[0]+m[axis+4]*p[1]+m[axis+8]*p[2]+m[axis+12]);};
    const firstContact=worldFoot(frame,a),nextContact=worldFoot(nextFrame,next);for(let axis=0;axis<3;axis++)assert.ok(Math.abs(firstContact[axis]-nextContact[axis])<.00005,'planted foot moved in world space after body scale');
    assert.notDeepEqual(a.joints,next.joints,'root interpolation must have a real leg step');
    for(const character of[a,next])for(const c of character.contacts)assert.ok(c.error<.0001);
    assert.deepEqual(pose({...frame,speed:0}),pose({...frame,speed:0,mode:'idle'}),'stopped movement does not continue cycling the legs');
  }
});

test('guard refusals and releases are one restrained breath, keep feet and fingers connected, and settle on held lines',()=>{
  for(const guard of guards)for(const cue of['stop','assure','release','offer','object','interrupt','concede']){
    const frame={...guard,phase:1},rest=pose(frame),at=t=>pose({...frame,performance:{role:'speaker',cue,elapsedSec:t}}),active=at(.7),source=DESIGNS[guard.designId].source;
    assert.deepEqual(at(0),rest);assert.deepEqual(at(3),rest);assert.deepEqual(at(10),rest);
    const shift=Math.max(...['L','R'].map(side=>distance(jointPoint(guard,rest,'hand_'+side),jointPoint(guard,active,'hand_'+side))));assert.ok(shift>.04&&shift<.19,'guard gesture stays readable and reserved: '+shift);
    for(const name of['pelvis','thigh_L','thigh_R','shin_L','shin_R','foot_L','foot_R','toe_L','toe_R'])assert.deepEqual(rest.joints[`society_${source}_${name}`],active.joints[`society_${source}_${name}`]);
    for(const c of active.contacts)assert.ok(c.error<.0001);
    for(const side of['L','R'])for(const digit of['thumb','index','middle','ring','little'])close(distance(jointPoint(guard,rest,'hand_'+side),jointPoint(guard,rest,digit+'_tip_'+side)),distance(jointPoint(guard,active,'hand_'+side),jointPoint(guard,active,digit+'_tip_'+side)));
  }
  for(const guard of guards)for(const cue of['attend','settle']){const frame={...guard,phase:1,performance:{role:'listener',cue,elapsedSec:.7}},listener=pose(frame),rest=pose({...frame,performance:null}),source=DESIGNS[guard.designId].source;assert.notDeepEqual(listener.joints[`society_${source}_head`],rest.joints[`society_${source}_head`]);assert.notDeepEqual(pose({...frame,speaking:true}).joints[`society_${source}_jaw`].rotation,listener.joints[`society_${source}_jaw`].rotation,'listener nod must not substitute for an actual speaking jaw');}
});

test('all guard cue poses skin the real period clothes and hands finitely within a human envelope',()=>{
  for(const guard of guards)for(const stance of['guard','aside'])for(const cue of['stop','assure','release','attend'])for(const mode of['idle','walk']){
    const frame={...guard,phase:2.5,stance,mode,speed:.8,distance:.37,speaking:cue!=='attend',performance:{role:cue==='attend'?'listener':'speaker',cue,elapsedSec:.7}},character=pose(frame),d=DESIGNS[guard.designId],entry=asset.entries.find(e=>e.name===d.mesh),gpu=sampleCharacterPose(asset,entry,{joints:character.joints});
    for(const joint of Object.values(character.joints)){assert.ok(joint.translation.every(Number.isFinite));assert.ok(joint.rotation.every(Number.isFinite));close(Math.hypot(...joint.rotation),1);}
    for(const p of entry.primitives)for(let i=0;i<p.vertexCount;i++){const v=vertex(p,gpu,i);assert.ok(v.every(Number.isFinite));assert.ok(Math.abs(v[0])<.8&&v[1]>-.03&&v[1]<1.9&&Math.abs(v[2])<.7,`${guard.id}/${cue} skin escapes guard envelope: ${v}`);}
  }
});

test('guard performances never mutate or borrow the population cached pose objects',()=>{
  const population=academicFloorPopulationInstances(guards),snapshot=structuredClone(population.map(p=>p.character.joints));
  for(const guard of guards){const a=pose({...guard,phase:1}),b=pose({...guard,phase:1});assert.notEqual(a.joints,b.joints);for(const name of Object.keys(a.joints))assert.notEqual(a.joints[name].rotation,b.joints[name].rotation);instances([{...guard,speaking:true,performance:{role:'speaker',cue:'stop',elapsedSec:.7}}]);}
  assert.deepEqual(population.map(p=>p.character.joints),snapshot);const again=academicFloorPopulationInstances(guards);for(let i=0;i<population.length;i++)assert.equal(population[i].character.joints,again[i].character.joints);
});

test('invalid, hollow or hidden staff cannot introduce missing placeholder bodies',()=>{
  assert.equal(pose({id:'bad',designId:'hollow-coat'}),null);assert.deepEqual(instances([null,{id:'bad',designId:'celeste'}, {...guards[0],visible:false},{...guards[0],x:NaN}]),[]);
});

test('actual social actor frames keep the voice on its rendered guard and reserve the other guard for listening',()=>{
  const controller=createAcademicBouncers({admitted:true});
  for(const beat of ACADEMIC_BOUNCER_SOCIAL_BEATS)for(const line of beat.lines){
    const frames=controller.actorFrame({speakingActorId:line.actorId,voiceActorId:line.actorId,speakingLine:line,actorTargets:ACADEMIC_SOCIETY_ACTORS});
    const rendered=instances(frames),withoutVoice=instances(frames.map(frame=>({...frame,speaking:false})));
    assert.deepEqual(frames.filter(frame=>frame.speaking).map(frame=>frame.id),ACADEMIC_BOUNCER_ACTORS.some(actor=>actor.id===line.actorId)?[line.actorId]:[]);
    for(let i=0;i<frames.length;i++){
      const frame=frames[i],source=DESIGNS[frame.designId].source,jaw=`society_${source}_jaw`;
      assert.equal(rendered[i].academicBouncerActor,frame.id);assert.equal(rendered[i].mesh,frame.mesh);
      assert.equal(rendered[i].character.joints[jaw].rotation.every(Number.isFinite),true);
      if(frame.speaking)assert.notDeepEqual(rendered[i].character.joints[jaw],withoutVoice[i].character.joints[jaw]);
      else assert.deepEqual(rendered[i].character.joints[jaw],withoutVoice[i].character.joints[jaw],'a named resident reply must not animate Hugh or Vera\'s jaw');
      if(frame.id===line.toActorId)assert.equal(frame.performance.role,'listener');
    }
    const held=controller.actorFrame({speakingActorId:line.actorId,voiceActorId:null,speakingLine:line,actorTargets:ACADEMIC_SOCIETY_ACTORS});
    assert.ok(held.every(frame=>!frame.speaking));assert.deepEqual(instances(held),instances(held,{timeSec:9999}),'held controller phase owns idle, head, hand and jaw clocks');
  }
});

test('local social gaze leads the head while actual aside roots and body headings stay owned by admission',()=>{
  const controller=createAcademicBouncers({admitted:true}),baseline=controller.actorFrame(),rest=instances(baseline);
  for(const id of['hugh-odette-closing','hugh-agathe-category']){
    const beat=ACADEMIC_BOUNCER_SOCIAL_BEATS.find(beat=>beat.id===id);
    for(const line of beat.lines){
      const frames=controller.actorFrame({speakingActorId:line.actorId,voiceActorId:line.actorId,speakingLine:line,actorTargets:ACADEMIC_SOCIETY_ACTORS}),rendered=instances(frames);
      for(let i=0;i<frames.length;i++){
        assert.equal(frames[i].x,baseline[i].x);assert.equal(frames[i].y,baseline[i].y);assert.equal(frames[i].bodyYaw,baseline[i].bodyYaw);assert.deepEqual(rendered[i].matrix,rest[i].matrix,'a look toward Odette or Agathe cannot silently move or rotate the guard root');
        const frame=frames[i],targetId=frame.id===line.actorId?line.toActorId:frame.id===line.toActorId?line.actorId:null;
        if(targetId){
          assert.equal(frame.gazeKey,targetId);const neutral=instances([{...frame,yaw:frame.bodyYaw}])[0],head=`society_${DESIGNS[frame.designId].source}_head`;
          assert.notDeepEqual(rendered[i].character.joints[head],neutral.character.joints[head],'physical local target must produce a visible head lead');
        }
      }
    }
  }
});

test('real long-held social lines settle their gesture, freeze on pause and preserve the reduced-motion stance',()=>{
  for(const line of ACADEMIC_BOUNCER_SOCIAL_BEATS.flatMap(beat=>beat.lines)){
    const controller=createAcademicBouncers({admitted:true});controller.actorFrame({speakingActorId:line.actorId,speakingLine:line});
    for(let n=0;n<31;n++)controller.tick(.1);
    const frames=controller.actorFrame({speakingActorId:line.actorId,voiceActorId:null,speakingLine:line,actorTargets:ACADEMIC_SOCIETY_ACTORS});
    for(const frame of frames){
      assert.deepEqual(pose(frame),pose({...frame,performance:null}),'all actual authored cues return to stance after a breath');
      assert.deepEqual(pose(frame,{reducedMotion:true}),pose({...frame,phase:999,speaking:true,performance:null},{reducedMotion:true}));
    }
    const before=instances(frames);controller.tick(20,{suspended:true});
    const frozen=controller.actorFrame({speakingActorId:line.actorId,voiceActorId:null,speakingLine:line,actorTargets:ACADEMIC_SOCIETY_ACTORS});assert.deepEqual(instances(frozen),before,'pause cannot spend phase or pose time');
  }
});
