import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BUS_WOMAN_CLIPS,busWomanPose,busWomanTicketVisible} from '../src/render/bus-woman-performance.js';
import {busWomanWrongOriginDescriptor,busWomanWrongOriginFrame,busWomanWrongOriginPose} from '../src/render/bus-woman-wrong-origin-performance.js';
import {busWomanPassageDescriptor,busWomanPassageFrame,busWomanPassagePose} from '../src/render/bus-woman-passage-performance.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {OUTSKIRTS_BUS_PASSAGE as C} from '../src/data/outskirts-bus-passage.js';
import {BUS_WOMAN_RIG} from '../src/data/bus-woman-rig.js';

const load=name=>{const b=fs.readFileSync(new URL(`../public/assets/${name}.glb`,import.meta.url));return parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const altered=load('outskirts-bus-woman-wrong-origin'),canonical=load('bus-woman-character');
const body=altered.entries.find(e=>e.name==='outskirts_bus_woman_wrong_origin_3'),bag=canonical.entries.find(e=>e.name==='bus_woman_bag'),ticket=canonical.entries.find(e=>e.name==='bus_woman_ticket');
const affected=new Set(['neck','head','jaw']),close=(a,b,e=1e-6)=>Math.abs(a-b)<e;
const passage=(clock=4,gazeYaw=-2.75)=>({clock,noticeAt:0,passAt:1,closeAt:.8,exitedAt:null,gazeYaw});
const qmul=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const inverse=q=>[-q[0],-q[1],-q[2],q[3]];
function vertex(p,v,pose){
  const position=[p.positions[v*3],p.positions[v*3+1],p.positions[v*3+2]];
  for(let k=0;k<p.targets.length;k++)for(let axis=0;axis<3;axis++)position[axis]+=p.targets[k].positions[v*3+axis]*pose.morphs[k];
  const out=[0,0,0];for(let slot=0;slot<4;slot++){const at=v*4+slot,w=p.weights[at];if(!w)continue;const j=p.joints[at]*16;for(let axis=0;axis<3;axis++)out[axis]+=w*(pose.bones[j+axis]*position[0]+pose.bones[j+4+axis]*position[1]+pose.bones[j+8+axis]*position[2]+pose.bones[j+12+axis]);}return out;
}
const point=(m,p)=>[0,1,2].map(axis=>m[axis]*p[0]+m[axis+4]*p[1]+m[axis+8]*p[2]+m[axis+12]);

test('passage attention is finite, saved-clock deterministic and reaches the held impossible heading',()=>{
  const masked=busWomanPassageFrame({clock:0,noticeAt:null,passAt:null,gazeYaw:-.8}),notice=busWomanPassageFrame({clock:2,noticeAt:0,passAt:null,gazeYaw:-.8});
  assert.equal(masked.phase,'masked');assert.equal(notice.phase,'recognition');assert.ok(notice.pitch>masked.pitch+.15);
  const early=busWomanPassagePose('wait',4,{stretch:7,passage:passage(1.15)}),held=busWomanPassagePose('wait',4,{stretch:7,passage:passage(4)});
  assert.ok(early.passage.headYaw<early.passage.neckYaw-.3,'the neck and skull rotate as one rigid unit');
  assert.ok(close(held.passage.actualYaw,-2.75,.015),`held head misses the captured gaze: ${held.passage.actualYaw}`);
  for(const acknowledgeYaw of[-.6,0,.6])for(const mode of['wait','acknowledge','acknowledge-ticket','receive']){
    const pose=busWomanPassagePose(mode,2.4,{stretch:7,acknowledgeYaw,passage:passage(4)});
    assert.ok(close(pose.passage.actualYaw,-2.75,.015),`${mode}/${acknowledgeYaw}: the source courtesy turn reverses the captured gaze`);
  }
  assert.deepEqual(busWomanPassageDescriptor('wait',4,{stretch:7,passage:passage(4)}),busWomanPassageDescriptor('wait',4,{stretch:7,passage:structuredClone(passage(4))}));
  for(const clock of[1,1.1,1.3,1.6,2,4]){
    const pose=busWomanPassagePose('wait',4,{stretch:7,passage:passage(clock)});
    for(const name of affected){assert.ok(Object.values(pose.joints[name]).flat().every(Number.isFinite));assert.ok(close(Math.hypot(...pose.joints[name].rotation),1));}
    assert.ok(pose.passage.jawTraction<=.004);
  }
  const reduced=busWomanPassageFrame(passage(1.1),{reducedMotion:true});assert.equal(reduced.pull,0);assert.equal(reduced.jawLag,0);assert.equal(reduced.catchUp,1);
});

test('only cervical, skull and jaw deltas change; receipt, store, retrieval and supported accessories remain exact',()=>{
  for(const[mode,duration]of Object.entries(BUS_WOMAN_CLIPS))for(const seconds of[0,Math.min(.89,duration),Math.min(.91,duration),Math.min(2.94,duration),Math.min(2.96,duration),duration]){
    const options={stretch:7,acknowledgeYaw:-.6,passage:passage()},base=busWomanWrongOriginPose(mode,seconds,options),changed=busWomanPassagePose(mode,seconds,options),old=busWomanWrongOriginDescriptor(mode,seconds,options),next=busWomanPassageDescriptor(mode,seconds,options);
    assert.equal(next.clip,old.clip);assert.equal(next.time,old.time);assert.equal(next.loop,false);
    for(const[name,joint]of Object.entries(base.joints))if(!affected.has(name)){assert.deepEqual(changed.joints[name],joint);assert.deepEqual(next.joints['bus_woman_'+name],old.joints['bus_woman_'+name]);}
    assert.deepEqual(changed.contacts,base.contacts);assert.deepEqual(changed.attachments,base.attachments);
    for(const name of['bag','ticket'])assert.deepEqual(next.joints['bus_woman_'+name+'_joint'],old.joints['bus_woman_'+name+'_joint']);
    assert.equal(busWomanTicketVisible(mode,next.time),busWomanTicketVisible(mode,old.time));
  }
  assert.deepEqual(busWomanPassageDescriptor('search',1.28,{stretch:7}),busWomanWrongOriginDescriptor('search',1.28,{stretch:7}),'ordinary recurrences acquire the passage performance');
});

test('actual skull, cap and eyes follow the articulated head; the cervical anchor and jaw relationship stay continuous',()=>{
  const options={stretch:7,passage:passage(1.35)},base=busWomanWrongOriginPose('wait',4,options),changed=busWomanPassagePose('wait',4,options),descriptor=busWomanPassageDescriptor('wait',4,options),sampled=sampleCharacterPose(altered,body,descriptor);
  assert.deepEqual(changed.joints.neck.translation,base.joints.neck.translation,'the neck detaches from the chest');
  const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
  assert.ok(close(distance(changed.joints.head.translation,changed.joints.neck.translation),distance(base.joints.head.translation,base.joints.neck.translation)));
  assert.ok(distance(changed.joints.jaw.translation,changed.passage.rigidJaw)<=.004+1e-9);
  const restHead=BUS_WOMAN_RIG.find(b=>b.name==='head'),headJoint=body.skin.joints.findIndex(i=>altered.nodes[i].name==='bus_woman_head'),matrix=sampled.bones.subarray(headJoint*16,headJoint*16+16);
  for(const role of['hat','eye','iris']){
    const p=body.primitives.find(p=>altered.json.materials[p.material].extras?.characterRole===role);assert.ok(p,`missing existing ${role}`);
    const candidates=[];for(let v=0;v<p.vertexCount;v++)if(p.weights[v*4]>.999&&p.joints[v*4]===headJoint)candidates.push(v);
    assert.ok(candidates.length,`${role} has no actual head-bound surface`);
    for(const v of[candidates[0],candidates.at(-1)]){
      const rest=Array.from(p.positions.subarray(v*3,v*3+3));assert.ok(distance(vertex(p,v,sampled),point(matrix,rest))<.0001,`${role} leaves the skull palette`);
    }
  }
  // Descriptor composition is tested against the independent semantic pose,
  // not only against a second call to the same descriptor implementation.
  const original=busWomanPose('wait',busWomanWrongOriginFrame('wait',4,options).time),extra=descriptor.joints.bus_woman_head;
  assert.ok(distance(qmul(original.joints.head.rotation,extra.rotation),changed.joints.head.rotation)<1e-9);
  assert.ok(restHead.head.every(Number.isFinite));
});

test('actual lower-neck wound margins retain their cross-material welds through recognition and the held turn',t=>{
  const shared=new Map();
  for(const[ip,p]of body.primitives.entries())for(let v=0;v<p.vertexCount;v++){
    const rest=Array.from(p.positions.subarray(v*3,v*3+3));if(rest[1]<1.36||rest[1]>1.53)continue;
    const key=rest.map(x=>Math.round(x*1e5)).join(',');if(!shared.has(key))shared.set(key,[]);shared.get(key).push({ip,v});
  }
  const seams=[...shared.values()].filter(entries=>new Set(entries.map(e=>e.ip)).size>1);assert.ok(seams.length>=16,'test lost the actual muscular/skin/fascia boundary');
  const base=sampleCharacterPose(altered,body,busWomanWrongOriginDescriptor('wait',4,{stretch:7}));let maximumOpening=0;
  const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  for(const gazeYaw of[-.8,-1.75,-2.75])for(const clock of[0,.2,.8,1.1,1.25,1.4,1.6,2,4]){
    const pose=sampleCharacterPose(altered,body,busWomanPassageDescriptor('wait',4,{stretch:7,passage:passage(clock,gazeYaw)}));
    for(const seam of seams){const first=seam[0],a=vertex(body.primitives[first.ip],first.v,pose),oldA=vertex(body.primitives[first.ip],first.v,base);for(const other of seam.slice(1)){
      const gap=distance(a,vertex(body.primitives[other.ip],other.v,pose)),oldGap=distance(oldA,vertex(body.primitives[other.ip],other.v,base));maximumOpening=Math.max(maximumOpening,gap);
      assert.ok(gap<=oldGap+.001,`neck articulation opens a muscle/skin/fascia boundary by ${gap-oldGap}m`);
    }}
  }
  t.diagnostic(JSON.stringify({crossMaterialNeckSeams:seams.length,maximumOpeningMetres:maximumOpening}));
});

test('the complete packed body, bag and visible paper stay inside the existing clear rear bay through the full turn',t=>{
  const envelope={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},cos=Math.cos(C.woman.yaw),sin=Math.sin(C.woman.yaw);let vertices=0,frames=0;
  const inspect=(mode,seconds,options)=>{
    const descriptor=busWomanPassageDescriptor(mode,seconds,options),entries=[[altered,body],[canonical,bag]];if(busWomanTicketVisible(mode,descriptor.time))entries.push([canonical,ticket]);frames++;
    for(const[asset,entry]of entries){const pose=sampleCharacterPose(asset,entry,descriptor);for(const p of entry.primitives)for(let v=0;v<p.vertexCount;v++){
      const a=vertex(p,v,pose),q=[C.woman.x+a[0]*cos+a[2]*sin,C.woman.y+a[1],C.woman.z-a[0]*sin+a[2]*cos];
      for(let axis=0;axis<3;axis++){envelope.min[axis]=Math.min(envelope.min[axis],q[axis]);envelope.max[axis]=Math.max(envelope.max[axis],q[axis]);}vertices++;
    }}
  };
  for(const[mode,duration]of Object.entries(BUS_WOMAN_CLIPS)){
    if(mode.startsWith('step'))continue;
    for(const gazeYaw of[-.80,-1.75,-2.75])for(const acknowledgeYaw of mode.startsWith('acknowledge')?[-.6,0,.6]:[0])for(let i=0;i<=Math.round(duration*30);i++)inspect(mode,i/30,{stretch:7,acknowledgeYaw,passage:passage(4,gazeYaw)});
  }
  for(let i=0;i<=135;i++){const clock=i/30,gazeYaw=clock<1?-.8:Math.max(-2.75,-.8-(clock-1)*3.9);inspect('wait',Math.min(4,clock),{stretch:7,passage:{...passage(clock,gazeYaw),passAt:1}});}
  for(const clock of[0,.5,1,4])inspect('wait',4,{stretch:7,reducedMotion:true,passage:passage(clock)});
  const b=C.woman.envelope;
  assert.ok(envelope.min[0]>=C.woman.x+b.minX&&envelope.max[0]<=C.woman.x+b.maxX,`turned body crosses the existing X collider: ${JSON.stringify(envelope)}`);
  assert.ok(envelope.min[2]>=C.woman.z+b.minZ&&envelope.max[2]<=C.woman.z+b.maxZ,`turned body crosses the existing Z collider: ${JSON.stringify(envelope)}`);
  assert.ok(envelope.min[1]>=C.floor&&envelope.max[1]<2.5);
  assert.ok(envelope.max[0]+C.bodyRadius<0,'even the unshifted central player body overlaps her head');
  assert.ok(vertices>100000000);t.diagnostic(JSON.stringify({frames,posedVertices:vertices,bounds:envelope,centralBodyGap:-envelope.max[0]-C.bodyRadius,assetsRebuilt:false}));
});
