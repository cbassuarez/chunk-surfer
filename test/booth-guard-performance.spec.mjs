import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {BOOTH_GUARD_ASSET,BOOTH_GUARD_RIG,BOOTH_GUARD_STAGE as STAGE} from '../src/data/booth-guard-rig.js';
import {boothGuardPose,boothGuardDescriptor,boothGuardHeldInstances,boothGuardTransitionSnapshot,guardPointToBooth,boothPointToGuard} from '../src/render/booth-guard-performance.js';
import {boothGuardRenderInstance} from '../src/game/booth-presentation.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=read(BOOTH_GUARD_ASSET.path),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),entry=asset.entries.find(e=>e.name===BOOTH_GUARD_ASSET.mesh),rig=new Map(BOOTH_GUARD_RIG.map(b=>[b.name,b]));
const ordinaryBytes=read('public/assets/guard-presentations.glb'),ordinaryAsset=parseCharacterAsset(ordinaryBytes.buffer.slice(ordinaryBytes.byteOffset,ordinaryBytes.byteOffset+ordinaryBytes.byteLength)),ordinaryEntry=ordinaryAsset.entries.find(e=>e.name==='overworld_booth_guard');
const propBytes=read('public/assets/booth-guard-props.glb'),io=new NodeIO(),props=await io.readBinary(new Uint8Array(propBytes)),base=await io.readBinary(new Uint8Array(read('public/assets/conservatory-props.glb')));
const mesh=(doc,name)=>doc.getRoot().listMeshes().find(m=>m.getName()===name),sub=(a,b)=>a.map((v,k)=>v-b[k]),distance=(a,b)=>Math.hypot(...sub(a,b));
const point=(matrix,p,offset=0)=>[0,1,2].map(k=>matrix[offset+k]*p[0]+matrix[offset+4+k]*p[1]+matrix[offset+8+k]*p[2]+matrix[offset+12+k]);
function skinned(p,i,palette){
  const v=Array.from(p.positions.subarray(i*3,i*3+3)),out=[0,0,0];
  for(let k=0;k<4;k++){const q=point(palette,v,p.joints[i*4+k]*16),w=p.weights[i*4+k];for(let j=0;j<3;j++)out[j]+=q[j]*w;}
  return out;
}
function hits(m,origin,target){
  const d=sub(target,origin),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),out=[];
  for(const p of m.listPrimitives()){const pos=p.getAttribute('POSITION').getArray(),ind=p.getIndices().getArray();for(let j=0;j<ind.length;j+=3){const[a,b,c]=Array.from(ind.subarray(j,j+3),i=>Array.from(pos.subarray(i*3,i*3+3))),e=sub(b,a),f=sub(c,a),h=cross(d,f),det=dot(e,h);if(Math.abs(det)<1e-9)continue;const s=sub(origin,a),u=dot(s,h)/det;if(u<0||u>1)continue;const q=cross(s,e),v=dot(d,q)/det;if(v<0||u+v>1)continue;const t=dot(f,q)/det;if(t>=0&&t<=1)out.push(t);}}
  return out.sort((a,b)=>a-b);
}

test('booth uses the retained exact anatomical asset and hierarchical bind contract',()=>{
  assert.equal(sha(bytes),BOOTH_GUARD_ASSET.sha256);
  assert.equal(BOOTH_GUARD_RIG.length,34);
  assert.equal(BOOTH_GUARD_RIG.find(b=>b.name==='hand_R').parent,'forearm_R');
  assert.deepEqual(asset.entries.map(e=>e.name),['outskirts_fold_guard','outskirts_overprint_body']);
  assert.equal(entry.primitives.reduce((n,p)=>n+p.vertexCount,0),27890);
  assert.equal(boothGuardRenderInstance({id:'chair',mesh:'chair'}).mesh,'chair');
  assert.equal(boothGuardRenderInstance({id:'yard-booth-guard-idle',mesh:'yard_booth_guard_idle',x:0,y:0,z:0}).mesh,'overworld_booth_guard');
  assert.equal(boothGuardRenderInstance({id:'yard-booth-guard-idle',mesh:'yard_booth_guard_idle',x:0,y:0,z:0}).fallbackMesh,'yard_booth_guard_idle','an absent ordinary pack must not expose the Source facial hole');
  assert.ok(ordinaryEntry);
  for(let i=0;i<entry.skin.joints.length;i++){
    const before=asset.nodes[entry.skin.joints[i]],after=ordinaryAsset.nodes[ordinaryEntry.skin.joints[i]];assert.equal(after.name,before.name);
    for(const name of['translation','rotation','scale'])for(let k=0;k<before[name].length;k++)assert.ok(Math.abs(before[name][k]-after[name][k])<.000005);
    for(let k=0;k<16;k++)assert.ok(Math.abs(entry.skin.inverseBind[i][k]-ordinaryEntry.skin.inverseBind[i][k])<.000005);
  }
});

test('all sampled states and transitions preserve actual exported arm links and plant both feet',()=>{
  let maxHeadError=0,maxTargetError=0,maxExtension=0;
  for(const pose of['idle','ledger','handoff'])for(const previousPose of['idle','ledger','handoff'])for(let frame=0;frame<=90;frame+=3){
    const options={pose,previousPose,poseElapsedSec:frame/30,timeSec:7+frame/30,conversation:{active:true,speaking:true,elapsedSec:frame/30,headYaw:.12}},p=boothGuardPose(options),actual=sampleCharacterPose(ordinaryAsset,ordinaryEntry,boothGuardDescriptor(options));
    assert.ok([...actual.bones].every(Number.isFinite));
    for(const c of p.contacts){
      assert.ok(Math.abs(distance(c.shoulder,c.elbow)-distance(rig.get('upperarm_'+c.side).head,rig.get('upperarm_'+c.side).tail))<1e-6);
      assert.ok(Math.abs(distance(c.elbow,c.wrist)-distance(rig.get('forearm_'+c.side).head,rig.get('forearm_'+c.side).tail))<1e-6);
      maxTargetError=Math.max(maxTargetError,c.error);maxExtension=Math.max(maxExtension,c.extension);
    }
    for(let i=0;i<ordinaryEntry.skin.joints.length;i++){const name=ordinaryAsset.nodes[ordinaryEntry.skin.joints[i]].name,expected=p.posed.get(name).head,result=point(actual.bones,rig.get(name).head,i*16);maxHeadError=Math.max(maxHeadError,distance(expected,result));}
    for(const foot of p.feet)assert.deepEqual(p.posed.get('foot_'+foot.side).head,rig.get('foot_'+foot.side).head);
    assert.deepEqual(Array.from(actual.morphs),[0,0,0,0],'the ordinary guard must never inherit the later suffering shapes');
  }
  assert.ok(maxHeadError<.000005,`parent-local descriptor error ${maxHeadError}`);
  assert.ok(maxTargetError<.00001,`unreachable hand target ${maxTargetError}`);
  assert.ok(maxExtension<.995,`locked straight arm ${maxExtension}`);
});

test('the real thumb/index tips meet at the pen and key, and the open hand meets the page',()=>{
  for(const pose of['ledger','handoff']){
    const p=boothGuardPose({pose,previousPose:pose,timeSec:2,poseElapsedSec:1.3}),right=p.contacts.find(c=>c.side==='R'),left=p.contacts.find(c=>c.side==='L');
    assert.ok(distance(right.tips.thumb,right.tips.index)<.000001);
    assert.ok(distance(guardPointToBooth(right.point),pose==='ledger'?p.frame.pen:STAGE.key)<.000001);
    assert.ok(distance(guardPointToBooth(left.point),[STAGE.brace[0],STAGE.brace[1]+.001,STAGE.brace[2]])<.000001);
    assert.ok(right.extension<.995);
  }
});

test('corrected public window contains a real pass-through; material, maps and UVs remain physical',()=>{
  const glazing=mesh(props,'yard_booth_glazing');
  assert.equal(hits(glazing,[-.72,1.63,.9],[-.72,1.63,1.5]).length,0,'hand/key slot blocked by opaque pane');
  assert.ok(hits(glazing,[.55,1.9,.9],[.55,1.9,1.5]).length>0,'the original panes must remain in their parked position');
  for(const name of['yard_booth_glazing','yard_booth_interior','yard_booth_practicals']){
    const old=mesh(base,name).listPrimitives(),now=mesh(props,name).listPrimitives();assert.equal(now.length,old.length);
    for(let i=0;i<old.length;i++){
      const a=old[i].getMaterial(),b=now[i].getMaterial();
      for(const method of['getName','getBaseColorFactor','getMetallicFactor','getRoughnessFactor','getEmissiveFactor','getAlphaMode'])assert.deepEqual(b[method](),a[method](),`${name} changed ${method}`);
      assert.deepEqual(now[i].getAttribute('TEXCOORD_0').getArray(),old[i].getAttribute('TEXCOORD_0').getArray());
      for(const method of['getBaseColorTexture','getNormalTexture','getMetallicRoughnessTexture']){const x=a[method](),y=b[method]();assert.equal(!!x,!!y);if(x)assert.equal(sha(x.getImage()),sha(y.getImage()));}
    }
  }
  assert.equal(mesh(props,'yard_booth_handoff').listPrimitives().length,1,'old floating key/pen duplicated the held objects');
  assert.equal(mesh(props,'yard_booth_handoff').listPrimitives()[0].getMaterial().getName(),'paper label');
});

test('actual skin and garment vertices clear the finished counter and glazing in all work poses',()=>{
  for(const [source,body]of[[asset,entry],[ordinaryAsset,ordinaryEntry]])for(const pose of['idle','ledger','handoff'])for(const poseElapsedSec of[0,.3,.6,.9,1.3,1.8,2.2,2.8]){
    const palette=sampleCharacterPose(source,body,boothGuardDescriptor({pose,poseElapsedSec,timeSec:2,previousPose:'idle'})).bones;
    let top=0,panel=0,window=0;
    for(const p of body.primitives)for(let i=0;i<p.vertexCount;i++){
      const q=guardPointToBooth(skinned(p,i,palette));
      if(q[0]>-1.305&&q[0]<.405&&q[1]>1.415&&q[1]<1.545&&q[2]>.625&&q[2]<1.165)top++;
      if(q[0]>-1.235&&q[0]<.335&&q[1]>.835&&q[1]<1.405&&q[2]>.885&&q[2]<.995)panel++;
      if(q[2]>1.28)window++;
    }
    assert.equal(top,0,`${pose}@${poseElapsedSec}: counter-top penetration`);
    assert.equal(panel,0,`${pose}@${poseElapsedSec}: counter-panel penetration`);
    assert.equal(window,0,`${pose}@${poseElapsedSec}: glove/body touches glass`);
  }
});

test('work states differ, settle continuously, and stay deterministic under pause/replay',()=>{
  const idle=boothGuardPose({pose:'idle',timeSec:3}),ledger=boothGuardPose({pose:'ledger',timeSec:3}),handoff=boothGuardPose({pose:'handoff',timeSec:3,poseElapsedSec:1.2});
  assert.ok(distance(idle.contacts[1].point,ledger.contacts[1].point)>.40);
  assert.ok(distance(ledger.contacts[1].point,handoff.contacts[1].point)>.15);
  assert.deepEqual(boothGuardDescriptor({pose:'ledger',timeSec:9}),boothGuardDescriptor({pose:'ledger',timeSec:9}));
  assert.deepEqual(boothGuardDescriptor({pose:'ledger',timeSec:9,reducedMotion:true}),boothGuardDescriptor({pose:'ledger',timeSec:19,reducedMotion:true}));
  const noSpeech=boothGuardDescriptor({timeSec:3}),speaking=boothGuardDescriptor({timeSec:3,conversation:{active:true,speaking:true,elapsedSec:.2}});
  assert.notDeepEqual(noSpeech.joints.jaw.rotation,speaking.joints.jaw.rotation);
  for(const pose of['ledger','handoff']){
    let previous=boothGuardPose({pose,poseElapsedSec:0,timeSec:2}).contacts;
    for(let i=1;i<=120;i++){const current=boothGuardPose({pose,poseElapsedSec:i/60,timeSec:2+i/60}).contacts;for(let side=0;side<2;side++)assert.ok(distance(current[side].wrist,previous[side].wrist)<.022,'one-frame wrist teleport');previous=current;}
  }
});

test('speaking lowers the actual exported lower jaw instead of pressing it up into the mouth',()=>{
  const options={pose:'idle',previousPose:'idle',timeSec:4,poseElapsedSec:4},conversation={active:true,elapsedSec:.14};
  const quiet=sampleCharacterPose(ordinaryAsset,ordinaryEntry,boothGuardDescriptor({...options,conversation:{...conversation,speaking:false}}));
  const speech=sampleCharacterPose(ordinaryAsset,ordinaryEntry,boothGuardDescriptor({...options,conversation:{...conversation,speaking:true}}));
  const jaw=ordinaryEntry.skin.joints.findIndex(index=>ordinaryAsset.nodes[index].name==='jaw'),displacements=[];
  for(const p of ordinaryEntry.primitives)for(let i=0;i<p.vertexCount;i++){
    let weight=0;for(let k=0;k<4;k++)if(p.joints[i*4+k]===jaw)weight+=p.weights[i*4+k];
    // Only retained mandible/lower-lip anatomy, excluding upper mouth corners.
    if(weight<.70||p.positions[i*3+1]>=rig.get('jaw').head[1])continue;
    displacements.push(skinned(p,i,speech.bones)[1]-skinned(p,i,quiet.bones)[1]);
  }
  assert.ok(displacements.length>100,'regression must exercise actual weighted lower-face geometry');
  assert.ok(displacements.every(d=>d<-.0005),'lower-jaw surface rises during speech');
  const mean=displacements.reduce((n,d)=>n+d,0)/displacements.length;
  assert.ok(mean<-.001,'speech must open a measurable lower-jaw aperture');
});

test('held objects use the body transform once and release onto supported paper or counter',()=>{
  for(const yaw of[0,Math.PI/2,-Math.PI/2])for(const pose of['ledger','handoff']){
    const options={pose,previousPose:pose,timeSec:2,poseElapsedSec:1.2},body=boothGuardRenderInstance({id:'yard-booth-guard-'+pose,mesh:'yard_booth_guard_'+pose,x:24,y:0,z:14,yaw},options),held=boothGuardHeldInstances(body,options),p=boothGuardPose(options),contact=p.contacts.find(c=>c.side==='R').point,c=Math.cos(body.yaw),s=Math.sin(body.yaw);
    assert.equal(held.length,1);assert.equal(held[0].character,undefined);assert.ok([...held[0].matrix].every(Number.isFinite));
    const expected=[body.x+contact[0]*c-contact[2]*s,body.y+contact[1],body.z+contact[0]*s+contact[2]*c];
    assert.ok(distance([held[0].x,held[0].y,held[0].z],expected)<.000001);
    assert.ok(distance(point(held[0].matrix,[0,0,0]),expected)<.000005);
  }
  const body=boothGuardRenderInstance({id:'yard-booth-guard-handoff',x:0,y:0,z:0,yaw:0}),key=boothGuardHeldInstances(body,{pose:'handoff',poseElapsedSec:4})[0],cup=boothGuardHeldInstances(body,{pose:'handoff',poseElapsedSec:4,sourceId:'coffee.line.1'})[0];
  assert.equal(key.mesh,'booth_guard_key');assert.equal(cup.mesh,'booth_guard_cup');
  assert.ok(Math.abs(key.y-1.626)<.000001);assert.ok(Math.abs(cup.y-.058-1.55)<.000001);
  assert.ok(distance(guardPointToBooth(boothPointToGuard(STAGE.key)),STAGE.key)<1e-9);
  assert.ok(propBytes.length<300_000);
  assert.deepEqual(props.getRoot().listMeshes().map(m=>m.getName()).sort(),['yard_booth_interior','yard_booth_glazing','yard_booth_practicals','yard_booth_handoff','booth_guard_pen','booth_guard_key','booth_guard_cup'].sort());
});

test('rapid dialogue changes start from the actual interrupted hands and body instead of a canonical pose',()=>{
  let options={pose:'idle',previousPose:'idle',timeSec:4,poseElapsedSec:4};
  for(const [pose,elapsed]of[['ledger',.18],['handoff',.27],['idle',.12],['ledger',.39],['handoff',.65],['idle',.2]]){
    const before=boothGuardPose(options),transitionFrom=boothGuardTransitionSnapshot(options),next={pose,previousPose:options.pose,timeSec:options.timeSec,poseElapsedSec:0,transitionFrom},start=boothGuardPose(next);
    for(const side of['L','R']){
      assert.ok(distance(start.posed.get('hand_'+side).head,before.posed.get('hand_'+side).head)<1e-7,'interrupted wrist jumps');
      assert.ok(distance(start.posed.get('hand_'+side).rotation,before.posed.get('hand_'+side).rotation)<1e-7,'interrupted hand twists');
    }
    for(const name of['chest','head'])assert.ok(distance(start.posed.get(name).head,before.posed.get(name).head)<1e-7);
    options={...next,timeSec:next.timeSec+elapsed,poseElapsedSec:elapsed};
  }
});
