import {STUDENT_STRIKE_FOOD} from '../src/render/student-strike-props.js';
// Focused CPU proof against the shipped native geometry and native skinning.
// It does not claim final rendered performance, cloth collision or perception.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {academicFloorPopulationInstances} from '../src/render/academic-society-characters.js';
import {ACADEMIC_FLOOR_GUESTS} from '../src/data/academic-floor-population.js';
import {ACADEMIC_SOCIETY_CHARACTER_RIGS as RIGS} from '../src/data/academic-society-character-design.js';
import {articulateStrikeActor,STRIKE_PERFORMANCE_SITES as S,STRIKE_SKIN_CONTACT_MARKERS as MARKERS,sampleStrikePlateOffer,strikeSkinMarkerWorld} from '../src/render/student-strike-performance.js';

const root=new URL('../',import.meta.url),read=path=>fs.readFileSync(new URL(path,root));
const pack=read('public/assets/academic-society-characters.glb'),asset=parseCharacterAsset(pack.buffer.slice(pack.byteOffset,pack.byteOffset+pack.byteLength));
const propBytes=read('public/assets/conservatory-props.glb'),view=new DataView(propBytes.buffer,propBytes.byteOffset,propBytes.byteLength),jsonSize=view.getUint32(12,true),props=JSON.parse(propBytes.subarray(20,20+jsonSize));
const mesh=name=>props.meshes.find(m=>m.name===name);
const deskTop=props.accessors[mesh('school_desk').primitives.find(p=>props.materials[p.material].name==='ivory').attributes.POSITION].max[1];
const keyTop=props.accessors[mesh('upright_piano').primitives.find(p=>props.materials[p.material].name==='ivory').attributes.POSITION].max[1];
assert.ok(Math.abs(deskTop+.0-(S.meal.desktopTopY-10))<1e-8);
assert.ok(Math.abs(keyTop-(S.pianist.keyboardTopY-10))<1e-8);
const food=STUDENT_STRIKE_FOOD;
const near=(a,b,e=1e-5)=>assert.ok(Math.hypot(...a.map((v,k)=>v-b[k]))<=e,JSON.stringify({a,b,e}));
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
function skinVertex(entry,primitive,v,pose){
  const p=[...primitive.positions.slice(v*3,v*3+3)],out=[0,0,0];
  for(let k=0;k<4;k++){const w=primitive.weights[v*4+k];if(!w)continue;const i=primitive.joints[v*4+k],q=transform(pose.bones.slice(i*16,i*16+16),p);for(let j=0;j<3;j++)out[j]+=w*q[j];}
  return out;
}
function nativeInstance(kind,t){
  const pianist=kind==='keyboard-refusal',site=pianist?S.pianist:S.meal,p=pianist?site.root:site.giverRoot,yaw=pianist?site.yaw:site.giverYaw;
  const donor=ACADEMIC_FLOOR_GUESTS.find(a=>a.id===(pianist?'academic-guest-piano':'academic-guest-fold'));
  const frame={...donor,x:p[0],y:p[2],floor:p[1],bodyYaw:yaw,yaw,heldProp:null,activity:null,support:null};
  return academicFloorPopulationInstances([frame],{project:(x,z)=>({x,y:p[1],z}),timeSec:t,zone:13})[0];
}
test('native skin contacts, withdrawal and own-side release preserve real support and fixed feet',()=>{
const markers=[];
for(const [source,name]of [['male','academic_population_listener'],['female','academic_population_attendant']]){
  const entry=asset.entries.find(e=>e.name===name);
  for(const side of ['L','R']){
    const marker=MARKERS[source][side],p=entry.primitives[marker.primitive];near([...p.positions.slice(marker.vertex*3,marker.vertex*3+3)],marker.point,1e-8);
    const influence=Array.from({length:4},(_,k)=>({joint:p.joints[marker.vertex*4+k],weight:p.weights[marker.vertex*4+k]})).find(j=>j.weight>.99999);
    assert.ok(influence);assert.equal(asset.nodes[entry.skin.joints[influence.joint]].name,`society_${source}_${marker.bone}`);
    markers.push({source,side,primitive:marker.primitive,vertex:marker.vertex,bone:marker.bone,fullWeight:influence.weight});
  }
}

const plateOptions={approach:[1.5,2.4],slide:[2.4,3.6],release:[6.1,7.4]};
let maxContactError=0,maxNativeSkinError=0,maxReachError=0,maxFootDrift=0,minKeyboardHandClearance=Infinity,minDeskHandClearance=Infinity,maxPlateSupportError=0,keyboardWitness=null;
const traces=[],feet=new Map();
for(const kind of ['keyboard-refusal','plate-offer'])for(let frame=0;frame<=192;frame++){
  const t=frame/24,base=nativeInstance(kind,t),instance=articulateStrikeActor(base,{kind,seconds:t,clockSeconds:t,plateOptions}),a=instance.strikeArticulation;
  const source=kind==='keyboard-refusal'?'male':'female',entry=asset.entries.find(e=>e.name===instance.mesh),pose=sampleCharacterPose(asset,entry,instance.character);
  assert.deepEqual([...instance.matrix],[...base.matrix]);assert.equal(instance.yaw,base.yaw);
  for(const value of Object.values(instance.character.joints)){
    assert.ok([...value.translation,...value.rotation].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...value.rotation)-1)<1e-6);
  }
  for(const contact of a.contacts.filter(c=>c.active)){
    maxContactError=Math.max(maxContactError,contact.errorM);maxReachError=Math.max(maxReachError,contact.worldReachErrorM);
    const marker=MARKERS[source][contact.side],actual=transform(instance.matrix,skinVertex(entry,entry.primitives[marker.primitive],marker.vertex,pose));
    near(actual,contact.actualWorld,2e-6);near(actual,strikeSkinMarkerWorld(instance,source,contact.side),2e-6);
    maxNativeSkinError=Math.max(maxNativeSkinError,Math.hypot(...actual.map((v,k)=>v-contact.requestedWorld[k])));
  }
  for(const side of ['L','R']){
    const bone=RIGS[source].find(b=>b.name==='foot_'+side),joint=instance.character.joints[`society_${source}_${bone.name}`],p=transform(instance.matrix,bone.head.map((v,k)=>v+joint.translation[k]));
    const key=kind+side;if(!feet.has(key))feet.set(key,p);maxFootDrift=Math.max(maxFootDrift,Math.hypot(...p.map((v,k)=>v-feet.get(key)[k])));
  }
  const skin=entry.primitives.find(p=>asset.json.materials[p.material].extras?.characterRole==='skin');
  for(let v=0;v<skin.vertexCount;v++){
    let handWeight=0;for(let k=0;k<4;k++)if(/_(hand|thumb|index|middle|ring|little)/.test(asset.nodes[entry.skin.joints[skin.joints[v*4+k]]].name))handWeight+=skin.weights[v*4+k];
    if(handWeight<.5)continue;const p=transform(instance.matrix,skinVertex(entry,skin,v,pose));
    if(kind==='keyboard-refusal'&&p[0]>53.2425&&p[0]<53.5625&&p[2]>3.79&&p[2]<5.01){const gap=p[1]-S.pianist.keyboardTopY;if(gap<minKeyboardHandClearance){minKeyboardHandClearance=gap;keyboardWitness={t,v,p};}}
    if(kind==='plate-offer'&&p[0]>60.49&&p[0]<61.11&&p[2]>5.4&&p[2]<5.88)minDeskHandClearance=Math.min(minDeskHandClearance,p[1]-S.meal.desktopTopY);
  }
  if(kind==='plate-offer'){
    const plate=sampleStrikePlateOffer(t,plateOptions),supportError=Math.abs(plate.position[1]+food.bounds.min[1]-S.meal.desktopTopY);maxPlateSupportError=Math.max(maxPlateSupportError,supportError);
    assert.ok(plate.position[0]+food.bounds.min[0]>=60.49&&plate.position[0]+food.bounds.max[0]<=61.11);
    assert.ok(plate.position[2]+food.bounds.min[2]>=5.4&&plate.position[2]+food.bounds.max[2]<=5.88);
  }
  if(frame%12===0)traces.push({kind,t,torsoYaw:a.torsoYaw,headYaw:a.headYaw,contacts:a.contacts,plate:a.plate});
}
assert.ok(maxContactError<1e-5);assert.ok(maxReachError<.002);assert.ok(maxFootDrift<1e-7);assert.ok(maxPlateSupportError<1e-7);
assert.ok(minKeyboardHandClearance>.001,'All native hand skin vertices over the keyboard must clear it.');
assert.ok(minDeskHandClearance>=0,'All native hand skin vertices over the desktop must clear it.');
assert.throws(()=>articulateStrikeActor(nativeInstance('keyboard-refusal',0),{kind:'keyboard-refusal',keyboardContact:{L:[100,100,100],R:[100,100,100]}}),/unreachable/);

  const released=articulateStrikeActor(nativeInstance('plate-offer',8),{kind:'plate-offer',seconds:8,clockSeconds:8,plateOptions});
  const plate=sampleStrikePlateOffer(8,plateOptions),right=strikeSkinMarkerWorld(released,'female','R'),left=strikeSkinMarkerWorld(released,'female','L');
  assert.equal(plate.weight,0,'plate contact has actually ended');
  assert.ok(right[0]>61.12&&left[0]>61.12,'both hands finish on the giver side of the actual tabletop');
  assert.ok(right[1]>plate.supportY+.17&&left[1]>plate.supportY+.25,'both hands settle visibly above and away from the food');
  assert.ok(Math.hypot(...right.map((n,i)=>n-plate.contactWorld[i]))>.30,'release is a substantial physical withdrawal, not an IK weight change');
});
