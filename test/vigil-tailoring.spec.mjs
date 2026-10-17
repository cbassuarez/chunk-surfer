// Regression for the underlying cause of the vigil's disconnected sleeves and
// rigid fingers: changing a joint name alone cannot retarget bind-space cloth,
// and adding knuckle names cannot articulate unweighted skin.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalAnatomy,retargetMesh,extendWristUnderlap} from '../tools/chunk_surfer/characters/vigil-tailoring.mjs';

const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8'));
const maleSource=read('../public/assets/recordist-characters/contractor.json');
const femaleSource=read('../artifacts/bus-woman-production/anatomy.json');
const male=canonicalAnatomy(maleSource),female=canonicalAnatomy(femaleSource);
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const unit=a=>{const size=Math.hypot(...a);return a.map(v=>v/size);};
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const close=(actual,expected,message,tolerance=1e-6)=>assert.ok(distance(actual,expected)<tolerance,`${message}: ${actual} vs ${expected}`);

assert.equal(maleSource.bones.length,34,'fixture should retain the original collapsed male rig');
assert.equal(male.bones.length,54,'male needs three genuinely weighted phalanges per finger');
assert.deepEqual(female,femaleSource,'fully articulated female donor must remain unchanged');
assert.deepEqual(canonicalAnatomy(male),male,'canonicalization must be idempotent');
assert.equal(maleSource.bones.length,34,'canonicalization mutated the retained source');
const skin=male.meshes.find(mesh=>mesh.name==='contractor-anatomical-skin');
for(const side of['L','R'])for(const digit of['thumb','index','middle','ring','little']){
  const original=maleSource.bones.find(b=>b.name===digit+'_'+side);
  const chain=['','_mid','_tip'].map(suffix=>male.bones.find(b=>b.name===digit+suffix+'_'+side));
  close(chain[0].head,original.head,`${digit} ${side} palm attachment`);
  close(chain[2].tail,original.tail,`${digit} ${side} fingertip`);
  assert.equal(chain[1].parent,chain[0].name);assert.equal(chain[2].parent,chain[1].name);
  close(chain[0].tail,chain[1].head,`${digit} ${side} first knuckle continuity`);
  close(chain[1].tail,chain[2].head,`${digit} ${side} second knuckle continuity`);
  for(const bone of chain){
    assert.ok(distance(bone.head,bone.tail)>.008,`${bone.name} has a degenerate phalanx`);
    const index=male.bones.indexOf(bone);let weighted=0;
    for(let i=0;i<skin.skinIndex.length;i++)if(skin.skinIndex[i]===index&&skin.skinWeight[i]>.05)weighted++;
    assert.ok(weighted>=25,`${bone.name} was added without meaningful anatomical skin weights`);
  }
}
// These coordinates come from the retained MakeHuman knuckles, not thirds of
// the original rigid finger line. Preserve their real curvature and lengths.
close(male.bones.find(b=>b.name==='index_mid_L').head,[-.5240894021076647,1.056500408814289,-.3328751862951191],'actual index PIP joint',1e-9);
close(male.bones.find(b=>b.name==='index_tip_L').head,[-.5233453371021679,1.039145629884497,-.35158427611696574],'actual index DIP joint',1e-9);
for(const mesh of male.meshes)for(let vertex=0;vertex<mesh.positions.length/3;vertex++){
  const weights=mesh.skinWeight.slice(vertex*4,vertex*4+4);
  assert.ok(weights.every(w=>Number.isFinite(w)&&w>=0),`${mesh.name} has invalid repaired skin weights`);
  assert.ok(Math.abs(weights.reduce((sum,w)=>sum+w,0)-1)<1e-6,`${mesh.name} repaired skin weights are not normalized`);
  for(const index of mesh.skinIndex.slice(vertex*4,vertex*4+4))assert.ok(index>=0&&index<male.bones.length);
}

const design={width:.89,height:1.74,depth:.96};
const scale=[design.width,design.height/male.height,design.depth];
for(let joint=0;joint<female.bones.length;joint++){
  const bone=female.bones[joint],destination=male.bones.find(b=>b.name===bone.name);
  // A pure-weighted head/tail is a strong bind-space contract: swapping indices
  // without moving donor vertices fails this by centimetres on every sleeve.
  const donorAxis=unit(subtract(bone.tail,bone.head)),normal=unit(cross(donorAxis,Math.abs(donorAxis[0])<.8?[1,0,0]:[0,1,0]));
  const mesh={name:bone.name,positions:[...bone.head,...bone.tail],normals:[...normal,...normal],skinIndex:[joint,0,0,0,joint,0,0,0],skinWeight:[1,0,0,0,1,0,0,0]};
  const tailored=retargetMesh(mesh,female,male,design);
  close(tailored.positions.slice(0,3),destination.head.map((v,i)=>v*scale[i]),`${bone.name} retargeted head`);
  close(tailored.positions.slice(3,6),destination.tail.map((v,i)=>v*scale[i]),`${bone.name} retargeted tail`);
  const actualAxis=unit(subtract(tailored.positions.slice(3,6),tailored.positions.slice(0,3)));
  const expectedAxis=unit(subtract(destination.tail,destination.head).map((v,i)=>v*scale[i]));
  assert.ok(dot(actualAxis,expectedAxis)>1-1e-10,`${bone.name} retargeting preserved position but lost orientation`);
  assert.equal(tailored.skinIndex[0],male.bones.indexOf(destination),`${bone.name} references the wrong target joint`);
  assert.ok(tailored.normals.every(Number.isFinite),`${bone.name} retargeted normals are not finite`);
  assert.ok(Math.abs(Math.hypot(...tailored.normals.slice(0,3))-1)<1e-9,`${bone.name} retargeted normal is not normalized`);
  assert.ok(Math.abs(dot(tailored.normals.slice(0,3),actualAxis))<1e-9,`${bone.name} normal lost orthogonality under its rest affine map`);
}

for(const source of[female,male]){
  const design={width:1.13,height:source.height*.98,depth:.94},factors=[1.13,.98,.94];
  for(const mesh of source.meshes){
    const tailored=retargetMesh(mesh,source,source,design);
    for(let i=0;i<mesh.positions.length;i++)assert.ok(Math.abs(tailored.positions[i]-mesh.positions[i]*factors[i%3])<1e-9,`${mesh.name} same-donor rest shape changed`);
    assert.deepEqual(tailored.skinIndex,mesh.skinIndex,`${mesh.name} same-donor joint map changed`);
  }
}

// The retained woman's anatomical skin stops in a jagged loop at her wrist.
// Cuff contact requires a real overlapping skin surface; recolouring the gap or
// moving the hand would hide the symptom and break the grasp we just repaired.
const originalSkin=female.meshes.find(mesh=>mesh.name==='woman-ordinary-face-neck-anatomical-hands');
const visible=vertex=>{
  let total=0;for(let slot=0;slot<4;slot++)if(/^(head|jaw|neck|hand|thumb|index|middle|ring|little)/.test(female.bones[originalSkin.skinIndex[vertex*4+slot]].name))total+=originalSkin.skinWeight[vertex*4+slot];
  return total;
};
const croppedIndices=[];for(let i=0;i<originalSkin.indices.length;i+=3){const triangle=originalSkin.indices.slice(i,i+3);if(triangle.reduce((sum,v)=>sum+visible(v),0)/3>.42)croppedIndices.push(...triangle);}
const cropped={...originalSkin,indices:croppedIndices},before=structuredClone(cropped),underlap=extendWristUnderlap(cropped,female.bones);
assert.deepEqual(cropped,before,'wrist repair mutated the anatomical source');
assert.deepEqual(underlap.wristUnderlap.map(repair=>repair.side),['L','R'],'repair touched the face/hair boundary or missed a wrist');
assert.deepEqual(underlap.positions.slice(0,cropped.positions.length),cropped.positions,'underlap moved existing hand/finger vertices');
assert.deepEqual(underlap.skinIndex.slice(0,cropped.skinIndex.length),cropped.skinIndex,'underlap changed original hand skin joints');
assert.deepEqual(underlap.skinWeight.slice(0,cropped.skinWeight.length),cropped.skinWeight,'underlap changed original hand skin weights');
assert.deepEqual(underlap.indices.slice(0,cropped.indices.length),cropped.indices,'underlap changed anatomical surface topology');
function boundaryEdges(indices){const edges=new Map();for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){const a=indices[i+j],b=indices[i+(j+1)%3],key=a<b?a+':'+b:b+':'+a;edges.set(key,(edges.get(key)||0)+1);}return edges;}
const beforeEdges=boundaryEdges(cropped.indices),afterEdges=boundaryEdges(underlap.indices),repairedVertices=new Set(underlap.wristUnderlap.flatMap(repair=>repair.boundary));
for(const[key,count]of beforeEdges)if(count===1){const[a,b]=key.split(':').map(Number);assert.equal(afterEdges.get(key),repairedVertices.has(a)&&repairedVertices.has(b)?2:1,'wrist underlap left a gap or altered an unrelated skin boundary');}
for(const repair of underlap.wristUnderlap){
  const hand=female.bones.find(b=>b.name==='hand_'+repair.side),forearm=female.bones[repair.forearmJoint],axis=unit(subtract(forearm.tail,forearm.head));
  assert.ok(repair.boundary.length>=20);assert.equal(repair.rings.length,3);
  for(let ring=0;ring<3;ring++){
    assert.equal(repair.rings[ring].length,repair.boundary.length);
    for(let i=0;i<repair.boundary.length;i++){
      const original=repair.boundary[i],vertex=repair.rings[ring][i],point=underlap.positions.slice(vertex*3,vertex*3+3),delta=subtract(point,hand.head),weights=underlap.skinWeight.slice(vertex*4,vertex*4+4);
      assert.ok(Math.abs(weights.reduce((sum,w)=>sum+w,0)-1)<1e-9,'underlap weights are not normalized');
      assert.ok(dot(delta,axis)<.008,'new skin ring extends out of its cuff toward the fingers');
      if(ring===2){
        assert.ok(Math.abs(dot(delta,axis)+.03)<1e-9,'skin underlap is not buried 3cm behind wrist');
        assert.equal(underlap.skinIndex[vertex*4],repair.forearmJoint);assert.equal(underlap.skinWeight[vertex*4],1,'buried skin does not move with its forearm/cuff');
      }
      const oldPoint=cropped.positions.slice(original*3,original*3+3),oldDelta=subtract(oldPoint,hand.head),oldRadial=subtract(oldDelta,axis.map(v=>v*dot(oldDelta,axis))),radial=subtract(delta,axis.map(v=>v*dot(delta,axis)));
      assert.ok(Math.abs(Math.hypot(...radial)-Math.hypot(...oldRadial)*(1-.04*(ring+1)/3))<1e-8,'wrist underlap changed the anatomical cross-section');
    }
  }
}
assert.ok(underlap.positions.every(Number.isFinite)&&underlap.normals.every(Number.isFinite));
console.log('vigil tailoring specs passed (true phalanges, weighted skin, rest-frame tailoring, buried wrist underlap)');
