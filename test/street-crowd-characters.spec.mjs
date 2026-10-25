import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {STREET_CROWD_DESIGNS as DESIGNS,STREET_CROWD_CHARACTER_MESHES} from '../src/data/street-crowd-characters.js';
import {streetCrowdPose} from '../src/render/street-crowd-performance.js';
import {SOURCE_LAST_RECEPTION_RESIDENT_RIGS as RIGS} from '../src/data/source-last-reception-resident-rigs.js';
import {VIGIL_MESHES} from '../src/data/exterior-vigil.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url)),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const receipt=JSON.parse(read('public/assets/street-crowd-characters.credits.json')),bytes=read('public/assets/street-crowd-characters.glb'),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
assert.equal(asset.entries.length,20);assert.deepEqual(asset.entries.map(e=>e.name),STREET_CROWD_CHARACTER_MESHES);
assert.equal(asset.nodes.length,128,'twenty bodies share two full anatomical rigs');assert.equal(asset.json.skins.length,2);assert.ok(bytes.length<9*1024*1024,'twenty anatomically fitted and normal-mapped people stay within the isolated 9 MiB pack budget');
assert.equal(receipt.shared.wardrobeStyles,5);assert.ok(receipt.shared.reusedAccessors>700,'exact shared wardrobe/body surfaces reuse their geometry accessors');
for(const pack of receipt.packs){const actual=read(pack.file);assert.equal(actual.length,pack.bytes);assert.equal(sha(actual),pack.sha256);}
for(const[file,digest]of Object.entries(receipt.sourceSha256))assert.equal(sha(read(file)),digest,'rebuild street crowd after source change: '+file);
const posed=(entry,pose)=>{
  const gpu=sampleCharacterPose(asset,entry,{joints:pose.joints});assert.ok([...gpu.bones].every(Number.isFinite));
  return entry.primitives.map(p=>{
    const positions=new Float32Array(p.positions.length);for(let v=0;v<p.vertexCount;v++)for(let axis=0;axis<3;axis++){
      let q=0;for(let k=0;k<4;k++){const j=p.joints[v*4+k]*16,w=p.weights[v*4+k];q+=w*(gpu.bones[j+axis]*p.positions[v*3]+gpu.bones[j+axis+4]*p.positions[v*3+1]+gpu.bones[j+axis+8]*p.positions[v*3+2]+gpu.bones[j+axis+12]);}
      positions[v*3+axis]=q*pose.scale[axis];assert.ok(Number.isFinite(positions[v*3+axis]));
    }
    return{...p,positions};
  });
};
function bounds(primitives){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of primitives)for(const v of new Set(p.indices))for(let a=0;a<3;a++){min[a]=Math.min(min[a],p.positions[v*3+a]);max[a]=Math.max(max[a],p.positions[v*3+a]);}return{min,max};}
function silhouette(primitives,axis){
  const width=72,height=104,out=new Uint8Array(width*height),project=(p,i)=>[(p[i*3+axis]+.75)/1.5*(width-1),(2.10-p[i*3+1])/2.10*(height-1)];
  for(const p of primitives)for(let i=0;i<p.indices.length;i+=3){
    const t=[0,1,2].map(k=>project(p.positions,p.indices[i+k])),minX=Math.max(0,Math.floor(Math.min(...t.map(v=>v[0])))),maxX=Math.min(width-1,Math.ceil(Math.max(...t.map(v=>v[0])))),minY=Math.max(0,Math.floor(Math.min(...t.map(v=>v[1])))),maxY=Math.min(height-1,Math.ceil(Math.max(...t.map(v=>v[1]))));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const edges=t.map((a,k)=>{const b=t[(k+1)%3];return(x+.5-a[0])*(b[1]-a[1])-(y+.5-a[1])*(b[0]-a[0]);});if(edges.every(v=>v>=0)||edges.every(v=>v<=0))out[y*width+x]=1;}
  }
  return out;
}
const actions=[null,'weight-shift','umbrella-settle','placard-lower','cup-handoff','chair-settle','page-turn','camera-check'],summaries=[],silhouettes=[];let samples=0,totalTriangles=0,grippedFingerSamples=0;
for(const[id,d]of Object.entries(DESIGNS)){
  const entry=asset.entries.find(e=>e.name===d.mesh),meta=entry.extras;assert.equal(entry.skin.joints.length,54);assert.equal(meta.anatomical,true);assert.deepEqual(meta.forward,[0,0,-1]);
  const skin=entry.primitives.find(p=>asset.json.materials[p.material].extras.characterRole==='skin');assert.ok(skin?.vertexCount>2000,'real face, wrist and segmented fingers survive crowd simplification');
  const used=new Set();for(let v=0;v<skin.vertexCount;v++)for(let k=0;k<4;k++)if(skin.weights[v*4+k]>.01)used.add(skin.joints[v*4+k]);
  for(const[j,bone]of RIGS[d.source].entries())if(/_(mid|tip)_/.test(bone.name))assert.ok(used.has(j),'all twenty mid/tip finger joints retain anatomical weighted vertices');
  let merged={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const action of actions){
    const pose=streetCrowdPose(id,{frame:action?{action,progress:.5,durationMs:1000,elapsedMs:500}:null,timeSec:3.7,reducedMotion:true}),geometry=posed(entry,pose),b=bounds(geometry);samples++;
    for(const c of pose.contacts)assert.ok(c.error<1e-4,'actual arm and leg contact targets remain reachable');
    const posedSkin=geometry.find(p=>asset.json.materials[p.material].extras.characterRole==='skin');
    for(const contact of pose.contacts.filter(c=>c.kind==='finger'&&c.gripped)){
      const tipIndex=RIGS[d.source].findIndex(b=>b.name===`${contact.finger}_tip_${contact.side}`);assert.ok(tipIndex>=0);
      let nearest=Infinity;for(let v=0;v<posedSkin.vertexCount;v++)for(let slot=0;slot<4;slot++)if(posedSkin.joints[v*4+slot]===tipIndex&&posedSkin.weights[v*4+slot]>.55)nearest=Math.min(nearest,Math.hypot(...contact.physicalTarget.map((n,a)=>n-posedSkin.positions[v*3+a])));
      assert.ok(nearest<.020,`${id}: actual ${contact.side} ${contact.finger} fingertip skin reaches its held object surface (${nearest})`);grippedFingerSamples++;
      const cylinder=d.accessory==='umbrella'&&contact.side==='R'?pose.objects.umbrella:d.accessory==='flask'?(contact.side==='L'?pose.objects.flask:pose.objects.cup):null;
      if(cylinder)assert.ok(Math.abs(Math.hypot(contact.physicalTarget[0]-cylinder.center[0],contact.physicalTarget[2]-cylinder.center[2])-cylinder.radius)<.012,`${id}: held shaft or flask axis actually passes through the closed finger contact surface`);
    }
    for(let axis=0;axis<3;axis++){merged.min[axis]=Math.min(merged.min[axis],b.min[axis]);merged.max[axis]=Math.max(merged.max[axis],b.max[axis]);}
    assert.ok(b.min[1]>-.012,`${id}: shoes remain above the street through ${action}`);assert.ok(b.max[1]<2.04,`${id}: anatomy and carried kit stay below the authored crowd height envelope`);
    assert.ok(b.max[0]-b.min[0]<1.12,`${id}: bent arms and kit retain compact street footprint`);assert.ok(b.max[2]-b.min[2]<1.08,`${id}: seated legs and carried kit retain compact street depth`);
    const envelope=VIGIL_MESHES[d.legacyMesh];if(envelope){assert.ok(b.min[0]>=-envelope.w/2-.015&&b.max[0]<=envelope.w/2+.015,`${id}: actual skinned arms and kit fit the unchanged width collider`);assert.ok(b.min[2]>=-envelope.d/2-.015&&b.max[2]<=envelope.d/2+.015,`${id}: actual skinned knees, shoes and kit fit the unchanged depth collider`);assert.ok(b.max[1]<=envelope.h+.015,`${id}: actual head/kit height agrees with prop metadata`);}
    if(!action)silhouettes.push(sha(Buffer.concat([silhouette(geometry,0),silhouette(geometry,2)])));
  }
  if(d.posture==='seated'){assert.ok(merged.max[1]<1.43,'seated people visibly sit below their standing height');assert.ok(meta.parts.some(n=>/blanket fitted/.test(n)));}
  if(d.accessory==='umbrella')assert.ok(meta.parts.some(n=>/sewn eight panel umbrella canopy/.test(n)));
  if(d.accessory==='flask')assert.ok(meta.parts.some(n=>/vacuum flask/.test(n))&&meta.parts.some(n=>/stacked paper cups/.test(n)));
  if(d.accessory==='camera')assert.ok(meta.parts.some(n=>/camera rounded housing/.test(n))&&meta.parts.some(n=>/camera lens barrel/.test(n)));
  if(d.highVis)assert.equal(meta.parts.filter(n=>/high visibility reflective torso band/.test(n)).length,2,'delivery and demolition worker keeps two actual reflective bands');
  if(d.id==='district-mews-neighbor')assert.ok(meta.parts.some(n=>/flat cap/.test(n))&&meta.parts.some(n=>/scarf/.test(n)),'mews neighbour keeps his cap and scarf');
  const triangles=entry.primitives.reduce((n,p)=>n+p.indices.length/3,0);assert.ok(triangles<25000,'per person geometry stays within the crowd budget');totalTriangles+=triangles;summaries.push({id,triangles,...merged});
}
assert.equal(new Set(silhouettes).size,20,'twenty front-and-side actual triangle masks retain different silhouettes');assert.ok(totalTriangles<420000,'shared crowd geometry stays within its complete-cast triangle budget');
assert.ok(grippedFingerSamples>=800,'held kit uses solved finger contacts rather than raised open palms');
const propsBytes=read('public/assets/street-crowd-props.glb'),view=new DataView(propsBytes.buffer,propsBytes.byteOffset,propsBytes.byteLength),json=JSON.parse(new TextDecoder().decode(propsBytes.subarray(20,20+view.getUint32(12,true)))),binStart=20+view.getUint32(12,true)+8;
assert.deepEqual(json.meshes.map(m=>m.name),['street_crowd_folding_chair','street_crowd_camera_tripod']);assert.equal(json.skins,undefined);
for(const mesh of json.meshes)for(const primitive of mesh.primitives){assert.equal(primitive.attributes.JOINTS_0,undefined,'chairs and tripods remain stationary separate furniture');const accessor=json.accessors[primitive.attributes.POSITION],buffer=json.bufferViews[accessor.bufferView],positions=new Float32Array(propsBytes.buffer,propsBytes.byteOffset+binStart+buffer.byteOffset,accessor.count*3);for(let i=1;i<positions.length;i+=3)assert.ok(positions[i]>-.001,'static furniture feet remain on the street');}
console.log(JSON.stringify({ok:true,characters:20,samples,grippedFingerSamples,totalTriangles,characterBytes:bytes.length,propBytes:propsBytes.length,shared:receipt.shared,bounds:summaries,nativeMaterialAcceptance:false}));
