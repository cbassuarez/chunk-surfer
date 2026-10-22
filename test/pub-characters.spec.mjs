import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {PUB_CHARACTER_DESIGNS as DESIGNS,PUB_CHARACTER_MESHES,pubCharacterPose,pubCharacterDescriptor,pubCharacterInstances,pubSeatedVigilPose} from '../src/render/pub-character-performance.js';
import {VIGIL_CHARACTER_RIGS} from '../src/data/vigil-character-rigs.js';
import {vigilCharacterPose} from '../src/render/vigil-character-performance.js';
import {PUB_NEW_ACTORS} from '../src/data/pub-population.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url)),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const receipt=JSON.parse(read('public/assets/pub-characters.credits.json')),bytes=read('public/assets/pub-characters.glb'),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
assert.equal(asset.entries.length,7);assert.deepEqual(asset.entries.map(e=>e.name),PUB_CHARACTER_MESHES);assert.equal(asset.nodes.length,115,'two shared anatomical rigs keep the isolated pack within the renderer node limit');assert.ok(bytes.length<10*1024*1024);
for(const pack of receipt.packs){const bytes=read(pack.file);assert.equal(sha(bytes),pack.sha256);assert.equal(bytes.length,pack.bytes);}
for(const[file,digest]of Object.entries(receipt.sourceSha256))assert.equal(sha(read(file)),digest,'rebuild pub pack after its owned source changes: '+file);
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,n)=>a.map(v=>v*n),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
const faces=[],bounds={};let vertices=0,samples=0;
for(const[id,d]of Object.entries(DESIGNS)){
  const entry=asset.entries.find(e=>e.name===d.mesh),meta=asset.json.meshes.find(m=>m.name===d.mesh).extras;
  assert.equal(entry.skin.joints.length,54);assert.equal(meta.anatomical,true);assert.deepEqual(meta.forward,[0,0,-1]);assert.ok(!meta.parts.some(p=>/umbrella|map|photograph|folder|attendance ledger|shoulder cape/.test(p)),'new ordinary patrons carry pub objects and clothing');
  const skin=entry.primitives.find(p=>asset.json.materials[p.material].extras.characterRole==='skin'),hair=entry.primitives.find(p=>asset.json.materials[p.material].extras.characterRole==='hair');assert.ok(skin?.vertexCount>3000);assert.ok(hair?.vertexCount>250);faces.push(sha(Buffer.from(skin.positions.buffer,skin.positions.byteOffset,skin.positions.byteLength)));
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const timeSec of[0,1.7,8.4]){
    const pose=pubCharacterPose(id,{timeSec,reducedMotion:true,seatY:Number.isFinite(d.seatY)?d.seatY-.012:undefined}),gpu=sampleCharacterPose(asset,entry,{joints:pose.joints});assert.ok([...gpu.bones].every(Number.isFinite));samples++;
    for(const contact of pose.contacts)assert.ok(contact.error<1e-4,'all anatomical arm/leg contact targets remain reachable');
    if(Number.isFinite(d.seatY))for(const c of pose.contacts.filter(c=>c.kind==='seat')){assert.equal(c.seatY,d.seatY-.012);assert.ok(c.knee[2]<-.30);assert.ok(Math.abs(c.ankle[1]-(d.stance==='stool'?.343:(d.source==='male'?.072566:.078185)*pose.scale[1]))<.002);}
    if(timeSec)continue;
    for(const p of entry.primitives)for(const v of new Set(p.indices)){for(let axis=0;axis<3;axis++){let q=0;for(let k=0;k<4;k++){const j=p.joints[v*4+k]*16,w=p.weights[v*4+k];q+=w*(gpu.bones[j+axis]*p.positions[v*3]+gpu.bones[j+axis+4]*p.positions[v*3+1]+gpu.bones[j+axis+8]*p.positions[v*3+2]+gpu.bones[j+axis+12]);}q*=pose.scale[axis];assert.ok(Number.isFinite(q)&&Math.abs(q)<2.5);min[axis]=Math.min(min[axis],q);max[axis]=Math.max(max[axis],q);}vertices++;}
  }
  assert.ok(max[0]-min[0]<.73,'compact held elbows fit the patron seat envelope');assert.ok(max[2]-min[2]<.70,'knees and shoes fit under the real pub tables');assert.ok(min[1]>-.012,'feet cannot sink through the parquet');
  if(d.wardrobe==='apron'){assert.ok(meta.parts.some(p=>/polishing cloth/.test(p)));assert.ok(meta.parts.some(p=>/polishing tumbler/.test(p)));assert.ok(min[2]>-.56&&max[2]<.24,'bartender back remains clear of the back bar');}
  if(Number.isFinite(d.seatY))assert.ok(max[1]<d.height+.02,'seated patrons cannot remain standing on their chairs');
  bounds[id]={min,max};
}
assert.equal(new Set(faces).size,7,'each new occupant keeps a different anatomical face rather than a repeated cloned donor');
const reduced=pubCharacterDescriptor('pub-patron-ed',{timeSec:0,reducedMotion:true}),reducedLater=pubCharacterDescriptor('pub-patron-ed',{timeSec:200,reducedMotion:true});assert.deepEqual(reduced,reducedLater);assert.equal(pubCharacterDescriptor('missing'),null);
const instance=pubCharacterInstances([{id:'pub-patron-mavis',x:2,y:.132,z:4,yaw:Math.PI/2,seatY:.503}],{reducedMotion:true})[0];assert.equal(instance.mesh,'pub_patron_mavis');assert.deepEqual([...instance.matrix.slice(12,15)],[2,Math.fround(.132),4]);assert.ok(instance.character.joints.pub_female_pelvis);
for(const actor of PUB_NEW_ACTORS){const [instance]=pubCharacterInstances([actor],{reducedMotion:true});assert.equal(instance.y,actor.floor,'district actor.y is horizontal; physical floor owns vertical placement');if(Number.isFinite(actor.seatHeight))assert.deepEqual(instance.character,pubCharacterDescriptor(actor.id,{reducedMotion:true,seatY:actor.seatHeight-.012}));}
const original=vigilCharacterPose('malcolm',{reducedMotion:true}),seated=pubSeatedVigilPose('vigil_malcolm_vey',null,{seatY:.8205,reducedMotion:true}),rig=VIGIL_CHARACTER_RIGS.malcolm,delta=.8205+.09-rig.find(b=>b.name==='pelvis').head[1];assert.ok(seated);assert.equal(pubSeatedVigilPose('missing'),null);
for(const name of['hand_L','hand_R','object']){const key='vigil_malcolm_'+name;assert.deepEqual(seated.joints[key].rotation,original.joints[key].rotation);assert.ok(Math.abs(seated.joints[key].translation[1]-original.joints[key].translation[1]-delta)<1e-8,'seated map and hands move together');}
for(const c of seated.contacts.filter(c=>c.kind==='seat'))assert.ok(c.error<1e-5&&Math.abs(c.ankle[1]-.343)<1e-6);
assert.deepEqual(pubSeatedVigilPose('vigil_part_malcolm_map',null,{reducedMotion:true}).joints,seated.joints,'the map part and seated body use the same pose');
const propsBytes=read('public/assets/pub-quest-props.glb'),view=new DataView(propsBytes.buffer,propsBytes.byteOffset,propsBytes.byteLength),json=JSON.parse(new TextDecoder().decode(propsBytes.subarray(20,20+view.getUint32(12,true))));assert.deepEqual(json.meshes.map(m=>m.name),['pub_service_tray_loaded','pub_service_tray_empty','pub_bottle_opener','pub_order_book']);assert.ok(!json.skins,'service tray, opener and book use the ordinary static prop path');for(const mesh of json.meshes)for(const p of mesh.primitives){assert.equal(p.mode,4);assert.ok(p.attributes.POSITION!=null&&p.attributes.NORMAL!=null);assert.equal(p.attributes.JOINTS_0,undefined);}
console.log(JSON.stringify({ok:true,characters:7,samples,vertices,characterBytes:bytes.length,propBytes:propsBytes.length,bounds,nativeMaterialAcceptance:false}));
