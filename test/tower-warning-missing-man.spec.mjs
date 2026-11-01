import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MISSING_MAN_CORE_BYTE,MISSING_MAN_CORE_TAG,MISSING_MAN_MATERIAL_GLSL,missingManMaterialRole,isMissingManCoreTag,
} from '../src/render/missing-man-material.js';
import {
  MISSING_MAN_SMOKE,MISSING_MAN_SMOKE_MESH,missingManSmokePoint,sampleMissingManSmoke,
  missingManSmokeInstances,installMissingManSmoke,
} from '../src/render/missing-man-smoke.js';
import {towerWarningPcmEnvelope,createTowerWarningAudio} from '../src/audio/tower-warning.js';
import {towerWarningAssetContract,towerWarningPerformance,TOWER_WARNING_PERFORMANCE} from '../src/render/tower-warning-performance.js';
import {TOWER_WARNING as WARNING} from '../src/data/tower-warning.js';
import {freshTowerWarning,towerWarningFrame,stepTowerWarning,towerWarningOccluded} from '../src/game/tower-warning.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {installTowerWarningFigure,towerWarningInstances,towerWarningFigureStatus,towerWarningLighting} from '../src/render/tower-warning.js';
import {nativeSegmentObstruction} from '../src/render/stillness-native-receivers.js';

const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
const tip=[-.21,1.32,-.34],sink=[0,1.65,-.075];
const contract={durations:{smoke:2.8,walk:1.2},gait:{strideMetres:.9},
  rig:{head:{bone:'head',yawAxis:[0,1,0]},neck:{bone:'neck',yawAxis:[0,1,0]},jaw:{bone:'jaw'}},
  morphs:{coat:'coat_lag',collar:'collar_lag'}};
const baseFrame={phase:'waiting',position:{x:0,y:0,z:0},yaw:0,elapsed:1,phaseSeconds:0,distance:0,visible:true};
const assetBytes=fs.readFileSync(new URL('../public/assets/tower-warning-missing-man.glb',import.meta.url));
const builtAsset=parseCharacterAsset(assetBytes.buffer.slice(assetBytes.byteOffset,assetBytes.byteOffset+assetBytes.byteLength));
const builtEntry=builtAsset.entries.find(e=>e.name==='tower_warning_missing_man');
const builtContract=builtEntry?.extras?.missingMan;
const materialName=p=>builtAsset.json.materials[p.material]?.name;
function transform(m,p){return[0,1,2].map(k=>m[k]*p[0]+m[4+k]*p[1]+m[8+k]*p[2]+m[12+k]);}
function skinVertex(primitive,vertex,pose){
  const p=Array.from(primitive.positions.subarray(vertex*3,vertex*3+3));
  primitive.targets.forEach((t,n)=>{for(let k=0;k<3;k++)p[k]+=t.positions[vertex*3+k]*pose.morphs[n];});
  const out=[0,0,0];
  for(let n=0;n<4;n++){
    const at=primitive.joints[vertex*4+n]*16,w=primitive.weights[vertex*4+n],m=pose.bones;
    for(let k=0;k<3;k++)out[k]+=w*(m[at+k]*p[0]+m[at+4+k]*p[1]+m[at+8+k]*p[2]+m[at+12+k]);
  }
  return out;
}
function builtAnchor(anchor,pose){
  const joint=builtEntry.skin.joints.findIndex(n=>builtAsset.nodes[n].name===anchor.joint);
  assert.ok(joint>=0,anchor.joint);return transform(pose.bones.subarray(joint*16,joint*16+16),anchor.position);
}
function skinnedBounds(pose){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const p of builtEntry.primitives)for(let n=0;n<p.vertexCount;n++){
    const v=skinVertex(p,n,pose);assert.ok(v.every(Number.isFinite));
    for(let k=0;k<3;k++){min[k]=Math.min(min[k],v[k]);max[k]=Math.max(max[k],v[k]);}
  }
  return{min,max};
}
const subtract=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
const along=(a,b,t)=>a.map((v,k)=>v+b[k]*t);
// Closest point on an actual triangle, including edges and vertices. Contact
// tests must not mistake sparse neighbouring vertex spacing for an air gap.
function closestTriangle(p,a,b,c){
  const ab=subtract(b,a),ac=subtract(c,a),ap=subtract(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return a;
  const bp=subtract(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
  const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return along(a,ab,d1/(d1-d3));
  const cp=subtract(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
  const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return along(a,ac,d2/(d2-d6));
  const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return along(b,subtract(c,b),(d4-d3)/(d4-d3+d5-d6));
  const denominator=1/(va+vb+vc);return along(along(a,ab,vb*denominator),ac,vc*denominator);
}

test('the opaque core material identity survives RGBA8 without claiming existing material ranges',()=>{
  assert.equal(MISSING_MAN_CORE_BYTE,Math.round(MISSING_MAN_CORE_TAG*255));
  const shaderByte=Number(MISSING_MAN_MATERIAL_GLSL.match(/MISSING_MAN_CORE_TAG\s*=\s*([\d.]+)\/255\.0/)?.[1]);
  assert.equal(shaderByte,MISSING_MAN_CORE_BYTE,'CPU and all interpolated shader passes must name the same material byte');
  const accepted=[];
  for(let byte=0;byte<=255;byte++){
    const value=new Uint8Array([Math.round(byte/255*255)])[0]/255;
    if(!isMissingManCoreTag(value))continue;
    accepted.push(byte);
    assert.equal(value>=.68&&value<.86,false,'the apparition coverage decoder must not claim this core');
    assert.equal(byte>=112&&byte<=171,false,'printed surfaces must not claim this core');
    for(const tag of[225,229,237])assert.ok(Math.abs(byte-tag)>=1.5,`collision with existing tag ${tag}`);
  }
  assert.deepEqual(accepted,[MISSING_MAN_CORE_BYTE-1,MISSING_MAN_CORE_BYTE,MISSING_MAN_CORE_BYTE+1]);
  for(const value of[NaN,Infinity,-Infinity,undefined,null])assert.equal(isMissingManCoreTag(value),false);
});

test('only authored negative core and smoke materials acquire special roles',()=>{
  assert.equal(missingManMaterialRole({materialName:'warning_negative_core'}),'missing-man-core');
  assert.equal(missingManMaterialRole({materialName:'warning_smoke'}),'missing-man-smoke');
  for(const materialName of['warning_coat_wool','warning_felt_trilby','warning_hand_skin','warning_ember','outskirts skin','black enamel']){
    assert.equal(missingManMaterialRole({materialName}),null,materialName);
  }
  assert.equal(missingManMaterialRole({materialRole:'weathered-surface'}),'weathered-surface');
  assert.equal(missingManMaterialRole(),null);
});

test('the smoke rises off the actual ember, curls and thins, and never bends back into the face',()=>{
  for(const clock of[0,.1,1,17,10000])for(let strand=0;strand<MISSING_MAN_SMOKE.strands;strand++){
    missingManSmokePoint(tip,0,{clock,strand}).forEach((value,k)=>near(value,tip[k]));
    let previous=tip[1];
    for(let u=.1;u<=1.0001;u+=.1){const p=missingManSmokePoint(tip,u,{clock,strand});assert.ok(p[1]>previous,'every part of the plume is above the part below it');previous=p[1];}
    assert.ok(previous-tip[1]>.35,'the plume climbs well clear of the hand');
  }
  const plume=sampleMissingManSmoke({tip,clock:1});
  for(let strand=0;strand<MISSING_MAN_SMOKE.strands;strand++){
    const own=plume.filter(s=>s.strand===strand);
    for(let n=1;n<own.length;n++){assert.ok(own[n].width>own[n-1].width,'it widens as it rises');assert.ok(own[n].density<own[n-1].density+1e-9||n<2,'and thins');}
  }
  for(const s of plume)assert.ok(distance(s.b,sink)>.1,'no strand is drawn into the face');
  assert.equal(missingManSmokePoint(null,.5),null);
  assert.equal(missingManSmokePoint(tip,NaN),null);
});

test('smoke is finite, bounded world geometry across clocks and translated anchors',()=>{
  const most=MISSING_MAN_SMOKE.strands*MISSING_MAN_SMOKE.segments+MISSING_MAN_SMOKE.breath.strands*MISSING_MAN_SMOKE.breath.segments;
  for(const clock of[0,.001,1,4.59,4.6,18,10000]){
    const input={tip,mouth:sink,forward:[0,0,-1],breath:.7,clock},segments=sampleMissingManSmoke(input);
    assert.ok(segments.length>0&&segments.length<=most);
    for(const s of segments){
      assert.ok([...s.a,...s.b,s.width,s.density,s.age].every(Number.isFinite));
      assert.ok(s.width>0&&s.width<.05);assert.ok(s.density>0&&s.density<=1);
      assert.ok(s.age>=0&&s.age<1);assert.ok(distance(s.a,s.b)<.1,'strands are continuous ribbons, not jumps');
      assert.ok(distance(s.a,tip)<.7||distance(s.a,sink)<.4);
    }
    const shift=[120,.12,-105],moved=sampleMissingManSmoke({...input,tip:tip.map((v,k)=>v+shift[k]),mouth:sink.map((v,k)=>v+shift[k])});
    assert.equal(moved.length,segments.length);
    for(let n=0;n<segments.length;n++)for(const end of['a','b'])for(let k=0;k<3;k++)near(moved[n][end][k]-shift[k],segments[n][end][k],1e-6);
  }
  for(const input of[{}, {tip:[NaN,0,0]}])assert.deepEqual(sampleMissingManSmoke(input),[]);
});

test('each strand is one unbroken ribbon whose curl climbs with the clock',()=>{
  const before=sampleMissingManSmoke({tip,clock:.2}),after=sampleMissingManSmoke({tip,clock:.3});
  assert.equal(before.length,after.length);
  for(let strand=0;strand<MISSING_MAN_SMOKE.strands;strand++){
    const own=before.filter(s=>s.strand===strand);
    for(let n=1;n<own.length;n++)own[n].a.forEach((v,k)=>near(v,own[n-1].b[k]));
  }
  assert.ok(before.some((s,n)=>distance(s.b,after[n].b)>1e-4),'the shape moves');
  assert.ok(before.every((s,n)=>Math.abs(s.b[1]-after[n].b[1])<1e-9),'rise is a fixed profile; only the curl travels');
});

test('a breath leaves the mouth along his facing only when he speaks or exhales',()=>{
  const forward=[Math.sin(.6),0,-Math.cos(.6)],input={tip,mouth:sink,forward,clock:3};
  assert.equal(sampleMissingManSmoke({...input,breath:0}).some(s=>s.kind==='breath'),false);
  const breath=sampleMissingManSmoke({...input,breath:.8}).filter(s=>s.kind==='breath');
  assert.ok(breath.length>0);
  for(const strand of new Set(breath.map(s=>s.strand))){
    const own=breath.filter(s=>s.strand===strand),first=own[0].a,last=own.at(-1).b;
    first.forEach((v,k)=>near(v,sink[k],.02));
    assert.ok(dot(subtract(last,first),forward)>.12,'out in front of his face');
    assert.ok(last[1]>first[1],'and rising as it slows');
  }
  const weak=sampleMissingManSmoke({...input,breath:.2}).filter(s=>s.kind==='breath');
  assert.ok(weak.reduce((n,s)=>n+s.density,0)<breath.reduce((n,s)=>n+s.density,0));
});

test('idle smoke remains present, engagement changes density only, and reduced motion has no free-running clock',()=>{
  const input={tip,sink,clock:1};
  const idle=sampleMissingManSmoke(input),engaged=sampleMissingManSmoke({...input,engaged:true});
  assert.ok(idle.length>0);assert.equal(engaged.length,idle.length);
  idle.forEach((s,n)=>{
    assert.deepEqual(engaged[n].a,s.a);assert.deepEqual(engaged[n].b,s.b);
    assert.ok(engaged[n].density>s.density);
  });
  const reduced=sampleMissingManSmoke({...input,reducedMotion:true});
  assert.deepEqual(reduced,sampleMissingManSmoke({...input,clock:1000,reducedMotion:true}));
  assert.deepEqual(reduced,sampleMissingManSmoke({...input,clock:0}));
});

test('smoke instance matrices place real ribbon endpoints and keep scene reflection/depth eligibility',()=>{
  const input={tip,sink,clock:1.31},segments=sampleMissingManSmoke(input),instances=missingManSmokeInstances(input,{zone:8});
  assert.equal(instances.length,segments.length);
  for(let n=0;n<instances.length;n++){
    const i=instances[n],s=segments[n],m=i.matrix;
    assert.equal(i.mesh,MISSING_MAN_SMOKE_MESH);assert.equal(i.zone,8);
    assert.equal(i.blocks,false);assert.equal(i.interactive,false);assert.equal(i.noShadow,true);assert.equal(i.noReflection,false);
    assert.ok(m.every(Number.isFinite));
    for(let k=0;k<3;k++){near(m[12+k],s.a[k]);near(m[12+k]+m[4+k],s.b[k]);}
    near(Math.hypot(m[0],m[1],m[2]),s.width);
    near(Math.hypot(m[8],m[9],m[10]),s.width);
  }
});

test('the smoke catalog installs finite three-plane geometry once without BLEND materials',()=>{
  const uploads=[];let created=0;
  const gl={ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,FLOAT:4,UNSIGNED_SHORT:5,
    createVertexArray:()=>({id:++created}),createBuffer:()=>({id:++created}),bindVertexArray(){},bindBuffer(){},
    bufferData(target,data){uploads.push({target,data});},enableVertexAttribArray(){},vertexAttribPointer(){},
    vertexAttribDivisor(){},disableVertexAttribArray(){},vertexAttrib1f(){}};
  const pack={catalog:new Map()};
  assert.equal(installMissingManSmoke(null,pack),false);assert.equal(installMissingManSmoke(gl,pack),true);
  const mesh=pack.catalog.get(MISSING_MAN_SMOKE_MESH),count=created;
  assert.equal(mesh.primitives.length,1);assert.equal(mesh.primitives[0].count,18);
  assert.equal(mesh.primitives[0].base[3],1);assert.equal(mesh.primitives[0].materialRole,'missing-man-smoke');
  assert.ok(uploads.every(u=>Array.from(u.data).every(Number.isFinite)));
  const primitive=mesh.primitives[0],geometry=primitive.nativeReceiverGeometry;
  assert.ok(geometry,'the installed ribbon retains its actual native query geometry');
  for(const[key,index,ArrayType]of[['positions',0,Float32Array],['normals',1,Float32Array],['uvs',2,Float32Array],['indices',3,Uint16Array]]){
    assert.deepEqual(Array.from(ArrayType.from(geometry[key])),Array.from(uploads[index].data),`${key} matches the actual uploaded buffer rather than an invented blocker`);
  }
  for(const side of['min','max'])for(let k=0;k<3;k++){
    const values=Array.from(geometry.indices,id=>geometry.positions[id*3+k]);
    const actual=Math[side](...values),bound=primitive.nativeReceiverBounds[side][k];
    assert.ok(side==='min'?bound<=actual+1e-7:bound>=actual-1e-7,'retained broad bounds contain every uploaded ribbon vertex');
  }
  const distant=missingManSmokeInstances({tip:[120,.12,-105],clock:1.31});
  const clear=nativeSegmentObstruction({eye:[33.5,1.74,31.35],target:[33.15,.97,32.85],instances:distant,catalog:pack.catalog});
  assert.deepEqual(clear,{blocked:false,hit:null},'actual distant smoke instances do not fail an unrelated pub sightline globally');
  const ribbon=missingManSmokeInstances({tip,clock:1.31})[0];
  const triangle=Array.from(geometry.indices.slice(0,3),id=>transform(ribbon.matrix,Array.from(geometry.positions.slice(id*3,id*3+3))));
  const u=subtract(triangle[1],triangle[0]),v=subtract(triangle[2],triangle[0]);
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],normal=cross.map(n=>n/Math.hypot(...cross));
  const centre=[0,1,2].map(k=>triangle.reduce((sum,p)=>sum+p[k],0)/3);
  const crossing=nativeSegmentObstruction({eye:along(centre,normal,.25),target:along(centre,normal,-.25),instances:[ribbon],catalog:pack.catalog});
  assert.equal(crossing.blocked,true);assert.equal(crossing.hit.id,ribbon.id);assert.equal(crossing.hit.conservative,false,'a ray crossing the real ribbon hits triangles, not a placeholder box');
  assert.ok(crossing.hit.distance>0&&crossing.hit.distance<.5-.02);
  assert.equal(installMissingManSmoke(gl,pack),true);assert.equal(created,count,'repeat frames reuse one geometry allocation');
  assert.equal(pack.catalog.get(MISSING_MAN_SMOKE_MESH),mesh);
});

test('speech measurements come from the selected PCM window and are inactive without actual playback',()=>{
  const samples=Float32Array.from({length:100},(_,n)=>n<50?.1:.5),pcm={samples,sampleRate:1000};
  const quiet=towerWarningPcmEnvelope(pcm,.024,{active:true,lineId:'first'});
  near(quiet.rms,.1);near(quiet.peak,.1);near(quiet.value,.4);assert.equal(quiet.lineId,'first');
  const loud=towerWarningPcmEnvelope(pcm,.074,{active:true,lineId:'first'});
  near(loud.rms,.5);near(loud.peak,.5);assert.equal(loud.value,1);assert.equal(loud.source,'pcm');
  const paused=towerWarningPcmEnvelope(pcm,.074,{active:false,lineId:'first'});
  assert.equal(paused.value,0);assert.equal(paused.rms,0);assert.equal(paused.peak,0);
  assert.equal(paused.heldValue,1,'a frozen visual pose may retain its exact last PCM sample');
  assert.equal(paused.offset,loud.offset);assert.equal(paused.sampledRms,loud.rms);
  for(const offset of[.1,100])assert.equal(towerWarningPcmEnvelope(pcm,offset,{active:true}).active,false,'ended PCM cannot claim live speech');
  for(const pcm of[null,{samples:[],sampleRate:1000},{samples,sampleRate:0}]){
    const e=towerWarningPcmEnvelope(pcm,.074,{active:true});
    assert.equal(e.available,false);assert.equal(e.active,false);assert.equal(e.value,0);
  }
});

test('the real speech transport envelope freezes at its rate-adjusted cursor through pause and resumes only on update',async()=>{
  const sources=[],node=more=>({connect(){},disconnect(){},...more});
  const context={currentTime:10,state:'running',
    createGain:()=>node({gain:{value:0}}),
    createBuffer:(_channels,length,sampleRate)=>{
      const data=new Float32Array(length);return{duration:length/sampleRate,getChannelData:()=>data};
    },
    createBufferSource:()=>{const source=node({playbackRate:{},starts:[],start(...a){this.starts.push(a);},stop(){this.onended?.();}});sources.push(source);return source;},
  };
  const samples=Float32Array.from({length:1000},(_,n)=>n<500?.1:.5);
  const audio=createTowerWarningAudio({getAudio:()=>({context,destination:{}}),renderVoice:async()=>({samples,sampleRate:1000,provider:'test-pcm'})});
  const line={id:'transport-voice',text:'fixture',rate:.5},frame={line,paused:false,enabled:true,source:{},listener:{}};
  await audio.prepare([line]);audio.update(frame);context.currentTime=11.2;
  const live=audio.snapshot();near(live.offset,.6);assert.equal(live.envelope.value,1);assert.equal(live.envelope.active,true);
  const paused=audio.pause();near(paused.offset,.6);assert.equal(paused.envelope.value,0);assert.equal(paused.envelope.heldValue,1);
  context.currentTime=99;audio.setPaused(false);
  assert.equal(sources.length,1);near(audio.snapshot().offset,.6);assert.equal(audio.snapshot().envelope.active,false);
  audio.update(frame);assert.equal(sources.length,2);near(sources[1].starts[0][1],.6);
  assert.equal(audio.snapshot().envelope.active,true);assert.equal(audio.snapshot().envelope.value,1);
  audio.destroy();assert.equal(audio.snapshot().envelope.value,0);assert.equal(audio.snapshot().envelope.available,false);
});

test('the performance is deterministic and pauses a selected gesture without inventing an arm or jaw axis',()=>{
  const input={assetContract:contract,listener:{x:.8,z:-2}};
  const waiting=towerWarningPerformance(baseFrame,input);
  assert.deepEqual(waiting,towerWarningPerformance(structuredClone(baseFrame),structuredClone(input)));
  assert.equal(waiting.character.clip,'warning_smoke');near(waiting.character.time,1);
  assert.equal(waiting.hand.overrides,false);assert.deepEqual(Object.keys(waiting.character.joints).sort(),['head','jaw','neck']);
  assert.deepEqual(waiting.character.joints.jaw.rotation,[0,0,0,1]);
  const paused=towerWarningPerformance(baseFrame,{...input,paused:true});
  assert.deepEqual(paused.character,waiting.character);assert.equal(paused.hand.held,true);
  assert.equal(paused.smoke.emitting,false);assert.equal(paused.smoke.clock,waiting.smoke.clock);
  const quiet=towerWarningPerformance({...baseFrame,elapsed:5},input);
  assert.equal(quiet.character.clip,'warning_hold');assert.equal(quiet.character.time,0);
  const reduced=towerWarningPerformance(baseFrame,{...input,reducedMotion:true});
  assert.equal(reduced.character.clip,'warning_hold');assert.equal(reduced.smoke.enabled,true);assert.equal(reduced.smoke.animated,false);
});

test('raw GLB and expanded bake contracts resolve to identical gait, axes and cigarette channels',()=>{
  const anchors={bone:'hand_R',tip:[0,.1,0]},morphs={coat:'coat_lag',collar:'collar_lag'};
  const expanded={...contract,clips:{depart:'warning_depart'},durations:{...contract.durations,depart:1.05},cigarette:anchors};
  const raw={missingMan:{holdClip:'warning_hold',gestureClip:'warning_smoke',walkClip:'warning_walk',
    gestureDurationSec:2.8,walkDurationSec:1.2,strideM:.9,gazeAxes:{head:[0,1,0],neck:[0,1,0]},
    morphs:{coatSettle:morphs.coat,collarSettle:morphs.collar},anchors,departureClip:'warning_depart',departureDurationSec:1.05}};
  assert.deepEqual(towerWarningAssetContract(raw),towerWarningAssetContract(expanded));
  const f={...baseFrame,phase:'leaving',distance:.45,walking:true};
  assert.deepEqual(towerWarningPerformance(f,{assetContract:raw}),towerWarningPerformance(f,{assetContract:expanded}));
  assert.equal(towerWarningAssetContract().durations.smoke,2.8);
  assert.equal(towerWarningPerformance(baseFrame).character.time,1,'missing metadata must retain the default sparse gesture duration');
});

test('turning retains the entry gesture before lowering and speaking holds its physical grip still',()=>{
  for(const phaseSeconds of[0,.1,.23]){
    const p=towerWarningPerformance({...baseFrame,phase:'turning',elapsed:1+phaseSeconds,phaseSeconds},{assetContract:contract});
    assert.equal(p.character.clip,'warning_smoke');near(p.character.time,1);assert.equal(p.hand.held,true);
  }
  const lowered=towerWarningPerformance({...baseFrame,phase:'turning',elapsed:1.82,phaseSeconds:.82},{assetContract:contract});
  near(lowered.character.time,2.8);near(lowered.hand.lift,0);
  for(const elapsed of[2,50]){
    const speaking=towerWarningPerformance({...baseFrame,phase:'speaking',elapsed,phaseSeconds:1,speaking:true},{assetContract:contract});
    assert.equal(speaking.character.clip,'warning_hold');assert.equal(speaking.character.time,0);
    assert.deepEqual(speaking.character.joints.jaw.rotation,[0,0,0,1]);
  }
});

test('walk phase derives from real travelled distance and freezes the existing stride when obstructed or paused',()=>{
  const frame={...baseFrame,phase:'leaving',elapsed:8,phaseSeconds:3,distance:.45,walking:true};
  const moving=towerWarningPerformance(frame,{assetContract:contract});
  assert.equal(moving.character.clip,'warning_walk');near(moving.character.time,.6);
  assert.equal(moving.character.loop,true);assert.equal(moving.gait.active,true);
  const blocked=towerWarningPerformance({...frame,elapsed:80,phaseSeconds:75,walking:false,blocked:true},{assetContract:contract});
  assert.equal(blocked.character.clip,moving.character.clip);assert.equal(blocked.character.time,moving.character.time);
  assert.equal(blocked.gait.active,false);assert.equal(blocked.gait.heldPose,true);
  const paused=towerWarningPerformance(frame,{assetContract:contract,paused:true});
  assert.equal(paused.character.time,moving.character.time);assert.equal(paused.gait.active,false);
  const reduced=towerWarningPerformance(frame,{assetContract:contract,reducedMotion:true});
  assert.equal(reduced.character.clip,'warning_walk','essential locomotion remains distance-owned');near(reduced.character.time,.6);
  assert.equal(towerWarningPerformance({...frame,distance:0,walking:false},{assetContract:contract}).character.clip,'warning_hold');
});

test('head attention uses the renderer yaw convention, stays bounded, and releases after departure',()=>{
  const frame={...baseFrame,phase:'speaking',elapsed:8,phaseSeconds:3};
  for(const side of[-1,1]){
    const p=towerWarningPerformance(frame,{assetContract:contract,listener:{x:side,z:-2}});
    assert.equal(Math.sign(p.attention.headYaw),side);
    // For a +Y bind axis the actual standard quaternion must rotate local
    // forward -Z towards the listener's world X, opposite game root yaw.
    const q=p.character.joints.head.rotation,forwardX=-2*q[1]*q[3];
    assert.equal(Math.sign(forwardX),side);
    assert.ok(Math.abs(p.attention.headYaw)<=TOWER_WARNING_PERFORMANCE.maxHeadYaw);
    assert.ok(Math.abs(p.attention.neckYaw)<=TOWER_WARNING_PERFORMANCE.maxNeckYaw);
  }
  const behind=towerWarningPerformance(frame,{assetContract:contract,listener:{x:0,z:2}});
  assert.equal(behind.attention.weight,0,'no backwards neck reversal');
  const far=towerWarningPerformance(frame,{assetContract:contract,listener:{x:1,z:-100}});assert.equal(far.attention.weight,0);
  const departed=towerWarningPerformance({...frame,phase:'leaving',phaseSeconds:2},{assetContract:contract,listener:{x:1,z:-2}});
  assert.equal(departed.attention.weight,0);
  const unsafe=towerWarningPerformance(frame,{assetContract:{},listener:{x:1,z:-2}});
  assert.equal(unsafe.attention.rigReady,false);assert.deepEqual(Object.keys(unsafe.character.joints),['jaw'],'missing rig axes must not be guessed');
});

test('speech response accepts only the owned active PCM line and freezes its measured value on pause',()=>{
  const frame={...baseFrame,phase:'speaking',speaking:true,line:{id:'owned'}};
  const audio={lineId:'owned',ready:true,active:true,paused:false,done:false,offset:.6,
    envelope:{lineId:'owned',available:true,active:true,value:.7,heldValue:.7}};
  const live=towerWarningPerformance(frame,{assetContract:contract,audio});
  assert.equal(live.speech.source,'pcm');assert.equal(live.speech.active,true);near(live.speech.value,.7);
  const paused=towerWarningPerformance(frame,{assetContract:contract,audio,paused:true});
  assert.equal(paused.speech.active,false);assert.equal(paused.speech.value,0);near(paused.speech.heldValue,.7);
  near(paused.smoke.density,live.smoke.density);assert.deepEqual(paused.character,live.character);
  for(const invalid of[{...audio,lineId:'stale'},{...audio,ready:false},{...audio,error:'failed'},{...audio,done:true},null]){
    const p=towerWarningPerformance(frame,{assetContract:contract,audio:invalid});
    assert.equal(p.speech.active,false);assert.equal(p.speech.value,0);assert.equal(p.smoke.energy,0);
    assert.deepEqual(p.character.joints.jaw.rotation,[0,0,0,1]);
  }
  const gone=towerWarningPerformance({...frame,phase:'departed',visible:false},{assetContract:contract,audio});
  assert.equal(gone.visible,false);assert.equal(gone.smoke.enabled,false);assert.equal(gone.smoke.density,0);
});

test('retirement needs all three body rays behind masonry and the actual end of the departure route',()=>{
  const listener={x:0,y:1,z:0},position={x:0,y:0,z:-2};
  const box=(minY,maxY)=>({minX:-1,maxX:1,minZ:-1.01,maxZ:-.99,minY,maxY});
  assert.equal(towerWarningOccluded(listener,position,{boxes:[box(1.2,1.6)]}),false,'a hidden head does not hide the torso or feet');
  assert.equal(towerWarningOccluded(listener,position,{boxes:[box(.4,.8),box(1.2,1.6)]}),false,'a visible torso keeps the body present');
  assert.equal(towerWarningOccluded(listener,position,{boxes:[box(.4,1.6)]}),true);
  let moving=freshTowerWarning({phase:'leaving',phaseSeconds:2,distance:1,yaw:-Math.PI/2});
  moving=stepTowerWarning(moving,{dt:.1,exitOccluded:true});
  assert.equal(moving.phase,'leaving','early occlusion cannot retire a body before it reaches the corner route');
  const length=WARNING.route.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-WARNING.route[i].x,p.z-WARNING.route[i].z),0);
  const endpoint=freshTowerWarning({phase:'leaving',phaseSeconds:20,distance:length,walkSeconds:10});
  assert.equal(stepTowerWarning(endpoint,{dt:.1,exitOccluded:false}).phase,'leaving','following the endpoint preserves the real body');
  const departed=stepTowerWarning(endpoint,{dt:.1,exitOccluded:true});
  assert.equal(towerWarningFrame(departed).visible,false);
  const reloaded=freshTowerWarning(JSON.parse(JSON.stringify(departed)));
  assert.equal(towerWarningFrame(reloaded).visible,false);
  assert.deepEqual(stepTowerWarning(reloaded,{dt:.1,exitOccluded:false}),reloaded,'reload cannot summon it again');
});

test('the shipped dedicated GLB contains opaque real garments, a separate black core and bounded production rig',()=>{
  assert.equal(builtAsset.entries.length,1);assert.ok(builtEntry);assert.equal(builtEntry.skin.joints.length,34);
  assert.deepEqual(builtAsset.nodes[builtEntry.node].scale,[1,1,1]);
  assert.deepEqual(builtAsset.nodes[builtEntry.node].translation,[0,0,0]);
  for(const clip of['warning_hold','warning_smoke','warning_walk'])assert.ok(builtAsset.clips.has(clip));
  for(const name of['warning_negative_core','warning_coat_wool','warning_hand_skin','warning_felt_trilby','warning_boot_leather','warning_cigarette_paper']){
    const material=builtAsset.json.materials.find(m=>m.name===name);assert.ok(material,name);
    assert.equal(material.alphaMode||'OPAQUE','OPAQUE',name);assert.equal(material.pbrMetallicRoughness?.baseColorFactor?.[3]??1,1,name);
  }
  const core=builtAsset.json.materials.find(m=>m.name==='warning_negative_core');
  assert.deepEqual(core.pbrMetallicRoughness.baseColorFactor,[0,0,0,1]);
  assert.deepEqual(core.emissiveFactor||[0,0,0],[0,0,0]);
  for(const name of['warning_coat_wool','warning_felt_trilby']){
    const pbr=builtAsset.json.materials.find(m=>m.name===name).pbrMetallicRoughness;
    assert.ok(pbr.baseColorTexture&&pbr.metallicRoughnessTexture,`${name} needs its actual pigment and surface response`);
  }
  assert.ok(builtEntry.morphNames.includes('coat_settle')&&builtEntry.morphNames.includes('collar_settle'));
  assert.ok(builtEntry.primitives.reduce((sum,p)=>sum+p.vertexCount,0)<=50000);
});

test('the actual rig turns head forward towards the listener with a level local yaw axis',()=>{
  const headIndex=builtEntry.skin.joints.findIndex(n=>builtAsset.nodes[n].name==='head');
  for(const side of[-1,1]){
    const p=towerWarningPerformance({...baseFrame,phase:'speaking',phaseSeconds:1},{assetContract:builtContract,listener:{x:side,z:-2}});
    assert.equal(p.attention.rigReady,true);
    const pose=sampleCharacterPose(builtAsset,builtEntry,p.character),matrix=pose.bones.subarray(headIndex*16,headIndex*16+16);
    const a=transform(matrix,[0,1.66,0]),b=transform(matrix,[0,1.66,-.17]),forward=subtract(b,a);
    assert.equal(Math.sign(forward[0]),side,'actual skinned head, not only semantic metadata, must face the correct side');
    assert.ok(forward[2]<-.1);assert.ok(Math.abs(forward[1])<.001,'attention cannot roll the head on its bind axis');
  }
});

test('cigarette grip and emitter remain attached to the real right hand across the complete baked gestures',()=>{
  const hand=builtEntry.primitives.find(p=>materialName(p)==='warning_hand_skin');
  const filter=builtEntry.primitives.find(p=>materialName(p)==='warning_cigarette_filter');
  const ember=builtEntry.primitives.find(p=>materialName(p)==='warning_ember');
  assert.ok(hand&&filter&&ember);
  const handIndex=builtEntry.skin.joints.findIndex(n=>builtAsset.nodes[n].name==='hand_R');
  for(const p of[filter,ember])for(let n=0;n<p.vertexCount;n++){
    const owned=Array.from({length:4},(_,k)=>p.joints[n*4+k]===handIndex?p.weights[n*4+k]:0).reduce((a,b)=>a+b,0);
    near(owned,1,1e-6,'cigarette skin weights cannot transfer ownership to the world');
  }
  let gripLength=null;
  const poses=[['warning_hold',0],['warning_smoke',.7],['warning_smoke',1.1],['warning_smoke',2.8],['warning_walk',.55]];
  if(builtContract.departureClip)poses.push([builtContract.departureClip,builtContract.departureDurationSec*.5]);
  for(const [clip,time]of poses){
    const pose=sampleCharacterPose(builtAsset,builtEntry,{clip,time,loop:false});
    const tip=builtAnchor(builtContract.anchors.ember,pose),base=builtAnchor(builtContract.anchors.cigaretteBase,pose);
    const length=distance(tip,base);if(gripLength==null)gripLength=length;else near(length,gripLength,1e-5);
    let emberDistance=Infinity;
    for(let v=0;v<ember.vertexCount;v++)emberDistance=Math.min(emberDistance,distance(tip,skinVertex(ember,v,pose)));
    assert.ok(emberDistance<.012,'smoke must start on the posed ember mesh');
    const handVertices=Array.from({length:hand.vertexCount},(_,v)=>skinVertex(hand,v,pose));
    let handDistance=Infinity;
    for(let v=0;v<filter.vertexCount;v++){
      const p=skinVertex(filter,v,pose);
      for(let t=0;t<hand.indices.length;t+=3){
        const close=closestTriangle(p,handVertices[hand.indices[t]],handVertices[hand.indices[t+1]],handVertices[hand.indices[t+2]]);
        handDistance=Math.min(handDistance,distance(p,close));
      }
    }
    assert.ok(handDistance<=.008,`${clip}@${time}: filter floats ${(handDistance*100).toFixed(2)}cm from actual hand triangles`);
  }
});

test('the relaxed unused fingers clear the real cigarette and garment surfaces through the held performances',()=>{
  const hand=builtEntry.primitives.find(p=>materialName(p)==='warning_hand_skin');
  const garments=builtEntry.primitives.filter(p=>['warning_coat_wool','warning_lining'].includes(materialName(p)));
  for(const [clip,time]of[['warning_hold',0],['warning_smoke',1.1],['warning_depart',.55],['warning_walk',.55]]){
    const pose=sampleCharacterPose(builtAsset,builtEntry,{clip,time,loop:false});
    const base=builtAnchor(builtContract.anchors.cigaretteBase,pose),tip=builtAnchor(builtContract.anchors.ember,pose);
    const axis=subtract(tip,base),lengthSquared=dot(axis,axis);
    const surfaces=garments.map(p=>({indices:p.indices,vertices:Array.from({length:p.vertexCount},(_,n)=>skinVertex(p,n,pose))}));
    for(const bone of['ring_R','little_R']){
      const joint=builtEntry.skin.joints.findIndex(n=>builtAsset.nodes[n].name===bone),ib=builtEntry.skin.inverseBind[joint],owned=[];
      for(let vertex=0;vertex<hand.vertexCount;vertex++){
        let weight=0;for(let n=0;n<4;n++)if(hand.joints[vertex*4+n]===joint)weight+=hand.weights[vertex*4+n];
        if(weight<.5)continue;
        const p=skinVertex(hand,vertex,pose),alongAxis=Math.max(0,Math.min(1,dot(subtract(p,base),axis)/lengthSquared));
        assert.ok(distance(p,along(base,axis,alongAxis))>.01,`${bone} clips the cigarette instead of leaving the index/middle grip intact`);
        const bind=hand.positions.subarray(vertex*3,vertex*3+3);
        owned.push({p,distal:ib[1]*bind[0]+ib[5]*bind[1]+ib[9]*bind[2]+ib[13]});
      }
      assert.ok(owned.length>20);
      for(const {p}of owned.sort((a,b)=>b.distal-a.distal).slice(0,12)){
        let gap=Infinity;
        for(const surface of surfaces)for(let n=0;n<surface.indices.length;n+=3){
          const q=closestTriangle(p,surface.vertices[surface.indices[n]],surface.vertices[surface.indices[n+1]],surface.vertices[surface.indices[n+2]]);
          gap=Math.min(gap,distance(p,q));
        }
        assert.ok(gap>.004,`${bone} fingertip touches or pierces the worn coat at ${clip}@${time}`);
      }
    }
  }
});

test('actual weighted walk vertices retain standing scale without a collapsed first key or oversized limb sweep',()=>{
  const hold=skinnedBounds(sampleCharacterPose(builtAsset,builtEntry,{clip:'warning_hold',time:0}));
  assert.ok(hold.max[1]<=WARNING.bodyHeight&&hold.max[1]>1.80);
  for(let n=0;n<=16;n++){
    const time=1.1*n/16,pose=sampleCharacterPose(builtAsset,builtEntry,{clip:'warning_walk',time,loop:false}),bounds=skinnedBounds(pose);
    assert.ok(bounds.max[1]>1.72&&bounds.max[1]<1.90,`walk@${time.toFixed(3)} height ${bounds.max[1].toFixed(3)}m`);
    assert.ok(bounds.min[1]>-.055,`walk@${time.toFixed(3)} sinks below real paving`);
    assert.ok(bounds.max[2]-bounds.min[2]<1.25,`walk@${time.toFixed(3)} fore/aft span ${(bounds.max[2]-bounds.min[2]).toFixed(3)}m`);
    const face=builtAnchor(builtContract.anchors.face,pose);
    assert.ok(face[1]>1.54&&face[1]<1.74,`walk@${time.toFixed(3)} head height ${face[1].toFixed(3)}m`);
  }
});

test('published stride matches actual planted feet instead of sliding the body over a decorative walk cycle',()=>{
  const normalized=towerWarningAssetContract(builtContract),windows=builtContract.gait.plantedWindows;
  for(const bone of['foot_R','foot_L']){
    const[from,to]=windows[bone];assert.ok(to-from>.35,`${bone} carries weight for a real share of the cycle`);
    const joint=builtEntry.skin.joints.findIndex(n=>builtAsset.nodes[n].name===bone),ib=builtEntry.skin.inverseBind[joint];
    // The exported bind is rigid with baked scale. Inverting its translation
    // using the transposed rotation recovers this actual ankle pivot.
    const bind=[0,1,2].map(k=>-ib[k*4]*ib[12]-ib[k*4+1]*ib[13]-ib[k*4+2]*ib[14]);
    let planted=null;
    for(let n=0;n<=12;n++){
      const distance=normalized.gait.strideMetres*(from+(to-from)*n/12);
      const performance=towerWarningPerformance({...baseFrame,phase:'leaving',phaseSeconds:3,distance,walking:true},{assetContract:builtContract});
      const pose=sampleCharacterPose(builtAsset,builtEntry,performance.character),p=builtAnchor({joint:bone,position:bind},pose);
      const world=[p[0],p[1],p[2]-distance];
      if(!planted)planted=world;
      assert.ok(Math.hypot(world[0]-planted[0],world[2]-planted[2])<.004,`${bone}@${n}: planted foot drifts across real paving`);
      assert.ok(Math.abs(world[1]-planted[1])<.003,`${bone}@${n}: stance foot pumps vertically`);
    }
  }
});

test('departure blends actual weighted hold and first-stride poses during the existing pretravel hold',()=>{
  const normalized=towerWarningAssetContract(builtContract),clip=normalized.clips.depart,duration=normalized.durations.depart;
  assert.ok(clip&&builtAsset.clips.has(clip),'the departure blend must exist in the shipped GLB');
  assert.ok(duration>.5&&duration<=1.05,'departure uses the existing hold instead of adding a movement delay');
  const hold=sampleCharacterPose(builtAsset,builtEntry,{clip:'warning_hold',time:0,loop:false});
  const walk=sampleCharacterPose(builtAsset,builtEntry,{clip:'warning_walk',time:0,loop:false});
  for(const [time,target]of[[0,hold],[duration,walk]]){
    const p=towerWarningPerformance({...baseFrame,phase:'leaving',phaseSeconds:time,distance:0,walking:false},{assetContract:builtContract});
    assert.equal(p.character.clip,clip);near(p.character.time,time);assert.equal(p.character.loop,false);
    const pose=sampleCharacterPose(builtAsset,builtEntry,p.character);
    for(const primitive of builtEntry.primitives)for(let vertex=0;vertex<primitive.vertexCount;vertex++){
      assert.ok(distance(skinVertex(primitive,vertex,pose),skinVertex(primitive,vertex,target))<.001,'departure endpoint cannot pop to a different full-body pose');
    }
  }
  let prior=null;
  for(let n=0;n<=12;n++){
    const p=towerWarningPerformance({...baseFrame,phase:'leaving',phaseSeconds:duration*n/12,distance:0},{assetContract:builtContract});
    const pose=sampleCharacterPose(builtAsset,builtEntry,p.character),face=builtAnchor(builtContract.anchors.face,pose);
    if(prior)assert.ok(distance(face,prior)<.02,'the previous5.8cm first-stride height jump must be distributed across the hold');
    prior=face;
  }
  const held=towerWarningPerformance({...baseFrame,phase:'leaving',phaseSeconds:3,distance:0},{assetContract:builtContract});
  assert.equal(held.character.clip,clip,'root turning or physical obstruction holds the prepared stride');near(held.character.time,duration);
});

test('he stays clear of the house until he walks into it, and the wall then takes all of him',()=>{
  let state=freshTowerWarning({phase:'leaving',yaw:WARNING.yaw});
  let checked=0,inside=null;const house=WARNING.occluders[0];
  const skinned=(frame,performance)=>{
    const pose=sampleCharacterPose(builtAsset,builtEntry,performance.character),c=Math.cos(frame.yaw),s=Math.sin(frame.yaw),out=[];
    for(const primitive of builtEntry.primitives)for(let vertex=0;vertex<primitive.vertexCount;vertex+=3){
      const p=skinVertex(primitive,vertex,pose);out.push([frame.position.x+p[0]*c-p[2]*s,frame.position.y+p[1],frame.position.z+p[0]*s+p[2]*c]);
    }
    return out;
  };
  const within=(w,box)=>w[0]>box.minX&&w[0]<box.maxX&&w[1]>box.minY&&w[1]<box.maxY&&w[2]>box.minZ&&w[2]<box.maxZ;
  for(let n=0;n<170;n++){
    state=stepTowerWarning(state,{dt:.1});
    const frame=towerWarningFrame(state);if(frame.position.z>WARNING.pier.plinth-.55||n%4)continue;
    // One millimetre tolerates tailoring contact; nothing reaches the house
    // before the masonry legs begin.
    for(const w of skinned(frame,towerWarningPerformance(frame,{assetContract:builtContract})))
      for(const box of WARNING.occluders)assert.equal(within(w,{minX:box.minX+.001,maxX:box.maxX-.001,minY:box.minY+.001,maxY:box.maxY-.001,minZ:box.minZ+.001,maxZ:box.maxZ-.001}),false,`enters ${box.id} at ${frame.distance.toFixed(3)}m`);
    checked++;
  }
  const frame=towerWarningFrame(state);
  assert.ok(checked>=4);assert.equal(frame.routeFinished,true);
  assert.equal(frame.visible,true,'the body is retired by the host on real occlusion, not by this walk');
  inside=skinned(frame,towerWarningPerformance(frame,{assetContract:builtContract}));
  assert.ok(inside.every(w=>within(w,house)),'coat tails, heels and hat brim are all inside the house front');
});

test('the actual renderer attaches world smoke and ember light to its sampled hand and uses only owned PCM density',()=>{
  const primitives=builtEntry.primitives.map((p,index)=>({vao:{index},materialName:materialName(p),base:[1,1,1,1]}));
  const source={name:builtEntry.name,characterAsset:builtAsset,characterEntry:builtEntry,primitives};
  const pack={catalog:new Map([[source.name,source]])};assert.equal(installTowerWarningFigure(null,pack),true);
  const frame={...baseFrame,phase:'speaking',speaking:true,line:{id:'owned'},position:{x:12,y:.12,z:21},yaw:.7,phaseSeconds:1};
  const listener={x:12+Math.sin(.7),y:1.74,z:21-Math.cos(.7)};
  const audio={lineId:'owned',ready:true,active:true,paused:false,done:false,offset:.6,
    envelope:{lineId:'owned',available:true,active:true,value:.7,heldValue:.7}};
  const quiet=towerWarningInstances(frame,{listener}),live=towerWarningInstances(frame,{listener,audio});
  const status=towerWarningFigureStatus(),body=live[0],pose=sampleCharacterPose(builtAsset,builtEntry,body.character);
  const local=builtAnchor(builtContract.anchors.ember,pose),c=Math.cos(frame.yaw),s=Math.sin(frame.yaw);
  const world=[frame.position.x+c*local[0]-s*local[2],frame.position.y+local[1],frame.position.z+s*local[0]+c*local[2]];
  world.forEach((v,k)=>near(v,status.current.tip[k]));
  const light=towerWarningLighting(frame,{listener,audio})[0];
  [light.x,light.y,light.z].forEach((v,k)=>near(v,world[k]));
  assert.ok(live.length>quiet.length,'his words carry a breath of smoke');assert.ok(quiet.length>1);
  for(let n=1;n<quiet.length;n++){
    assert.deepEqual(live[n].matrix,quiet[n].matrix,'PCM does not detach or resize the rising smoke');
    near(live[n].emissive[3]/quiet[n].emissive[3],( .8+.7*.3)/.8);
  }
  const paused=towerWarningInstances(frame,{listener,audio:{...audio,active:false,paused:true},paused:true});
  for(let n=1;n<live.length;n++)assert.deepEqual(paused[n],live[n],'pause retains acquired smoke and measured density without an independent clock');
  const stale=towerWarningInstances(frame,{listener,audio:{...audio,lineId:'stale'}});
  assert.equal(stale.length,quiet.length,'a stale line carries no breath');
  for(let n=1;n<quiet.length;n++)assert.equal(stale[n].emissive[3],quiet[n].emissive[3]);
  assert.deepEqual(towerWarningInstances({...frame,phase:'departed',visible:false},{listener,audio}),[]);
  assert.deepEqual(towerWarningLighting({...frame,phase:'departed',visible:false},{listener,audio}),[]);
});
