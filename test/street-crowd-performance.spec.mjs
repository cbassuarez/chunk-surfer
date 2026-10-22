import assert from 'node:assert/strict';
import {VIGIL_CROWD,VIGIL_MESHES,VIGIL_VOICES} from '../src/data/exterior-vigil.js';
import {SOURCE_LAST_RECEPTION_RESIDENT_RIGS as RIGS} from '../src/data/source-last-reception-resident-rigs.js';
import {STREET_CROWD_DESIGNS as DESIGNS,STREET_CROWD_IDS,STREET_CROWD_VIGIL_IDS,STREET_CROWD_LOCAL_IDS,STREET_CROWD_CHARACTER_MESHES,STREET_CROWD_GARMENTS,streetCrowdDesign,streetCrowdGarment} from '../src/data/street-crowd-characters.js';
import {streetCrowdPose,streetCrowdDescriptor,streetCrowdCharacterIdForMesh,streetCrowdRenderInstance,streetCrowdInstances} from '../src/render/street-crowd-performance.js';

// Replace exactly the old background population. Named performers, signed
// objects, conversation IDs and physical route envelopes remain authoritative.
assert.equal(STREET_CROWD_IDS.length,20);
assert.deepEqual(STREET_CROWD_VIGIL_IDS,VIGIL_CROWD.map(figure=>figure.id));
assert.deepEqual(STREET_CROWD_LOCAL_IDS,['district-mews-neighbor','district-pub-driver']);
assert.equal(new Set(STREET_CROWD_CHARACTER_MESHES).size,20);
for(const figure of VIGIL_CROWD){
  const d=DESIGNS[figure.id];assert.equal(d.legacyMesh,figure.mesh);
  assert.ok(VIGIL_MESHES[d.legacyMesh].blocks,'the old crowd collision envelope remains in use');
  assert.equal(streetCrowdDesign(d.mesh),d);
}
for(const voice of Object.values(VIGIL_VOICES))assert.equal(streetCrowdDesign(voice.id),null);
assert.equal(streetCrowdDesign('vigil_figure_umbrella_a'),null,'shared old meshes cannot identify individual background occupants');
assert.equal(streetCrowdCharacterIdForMesh('exterior_pub_driver'),'district-pub-driver','the ending worker shares the retained driver rig');
assert.equal(streetCrowdPose('missing'),null);assert.equal(streetCrowdDescriptor('missing'),null);

// Silhouette differences are measurable tailoring/stature, rather than just
// changed material swatches. All clothing comes from five reusable patterns.
assert.equal(Object.keys(STREET_CROWD_GARMENTS).length,5);
const silhouettes=new Set();
for(const d of Object.values(DESIGNS)){
  const garment=streetCrowdGarment(d.id);assert.ok(garment.hem>0&&garment.shoulder>0&&garment.hip>0);
  silhouettes.add(JSON.stringify([d.height,d.width,d.depth,d.wardrobe,d.headwear,d.posture,d.lean]));
  assert.ok(d.silhouette.length>20);assert.ok(['male','female'].includes(d.source));
}
assert.equal(silhouettes.size,20);
assert.ok(Math.max(...Object.values(DESIGNS).map(d=>d.height))-Math.min(...Object.values(DESIGNS).map(d=>d.height))>.20);
assert.ok(Math.max(...Object.values(DESIGNS).map(d=>d.width))-Math.min(...Object.values(DESIGNS).map(d=>d.width))>.20);
assert.ok(STREET_CROWD_GARMENTS.raincoat.hem<STREET_CROWD_GARMENTS.anorak.hem-.25);
assert.ok(STREET_CROWD_GARMENTS.duffle.shoulder>STREET_CROWD_GARMENTS.cardigan.shoulder);

let samples=0;const before=JSON.stringify(RIGS),actions=[null,'weight-shift','umbrella-settle','page-turn','cup-handoff','camera-check','placard-lower','chair-settle'];
let grippedPads=0;
for(const d of Object.values(DESIGNS)){
  assert.equal(RIGS[d.source].length,54);
  for(const action of actions)for(const progress of[0,.5,1]){
    const p=streetCrowdPose(d.id,{timeSec:5.3,frame:{action,elapsedMs:progress*2400,durationMs:2400},reducedMotion:true});samples++;
    assert.equal(Object.keys(p.joints).length,54);
    for(const bone of RIGS[d.source]){
      const joint=p.joints[`street_${d.source}_${bone.name}`];assert.ok(joint);
      assert.ok([...joint.translation,...joint.rotation].every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...joint.rotation)-1)<1e-8);
    }
    for(const contact of p.contacts)assert.ok(contact.error<1e-5,`${d.id} ${action} ${progress} keeps its arms/legs within anatomical reach`);
    for(const contact of p.contacts.filter(c=>c.kind==='finger'&&c.gripped)){
      grippedPads++;const point=contact.physicalPoint,object=p.objects[contact.object];
      assert.ok(contact.object,'every grasp names the independently authored object it supports');
      if(['umbrella','flask','cup'].includes(contact.object)){
        assert.ok(Math.abs(Math.hypot(point[0]-object.center[0],point[2]-object.center[2])-object.radius)<1e-5,'fingertip pads wrap the actual cylinder surface instead of an upright open palm');
        if(contact.finger==='thumb')assert.ok(point[2]>object.center[2]);
        if(contact.finger==='index')assert.ok(point[2]<object.center[2],'thumb and index oppose across the cylinder');
      }
      if(contact.object==='bag'||(contact.object==='camera'&&contact.side==='R')){
        const center=contact.object==='bag'?object.grip:[object.center[0],object.center[1]+.105,object.center[2]],radius=contact.object==='bag'?.007:.009;
        assert.ok(Math.abs(Math.hypot(point[1]-center[1],point[2]-center[2])-radius)<1e-5,'fingers close around the horizontal handle bar');
      }
      if(contact.object==='camera'&&contact.side==='L')assert.ok(Math.abs(point[1]-(object.center[1]-.073))<1e-5,'the support hand meets the camera underside');
      if(contact.object==='pamphlets')assert.ok(Math.abs(point[2]-object.center[2])<.009,'the paper remains pinched between opposing finger pads');
    }
    if(d.accessory==='umbrella'){
      const left=p.contacts.filter(c=>c.kind==='finger'&&c.side==='L'),wrist=p.contacts.find(c=>c.kind==='wrist'&&c.side==='L');
      assert.ok(left.every(c=>!c.gripped&&c.physicalPoint[1]<wrist.physicalPoint[1]),'the non-holding umbrella hand relaxes downward rather than repeating the stop-sign palm');
    }
    if(d.posture==='seated')for(const c of p.contacts.filter(c=>c.kind==='seat')){
      assert.equal(c.seatY,.475,'hips meet the retained folding chair top');
      assert.ok(c.knee[2]<-.30&&c.knee[2]>-.46,'knees bend forward inside the original seated depth');
      assert.ok(c.ankle[1]>.06&&c.ankle[1]<.085,'the shoes remain on the pavement');
      assert.ok(c.hip[1]>.54&&c.hip[1]<.57);
    }
    else for(const side of['L','R'])for(const name of['thigh','shin','foot','toe']){
      const joint=p.joints[`street_${d.source}_${name}_${side}`];assert.deepEqual(joint.translation,[0,0,0]);assert.deepEqual(joint.rotation,[0,0,0,1]);
    }
  }
  assert.deepEqual(streetCrowdPose(d.id,{timeSec:0,reducedMotion:true}),streetCrowdPose(d.id,{timeSec:200,reducedMotion:true}));
}
assert.equal(JSON.stringify(RIGS),before,'posing a person cannot mutate a shared anatomical rig');
const sign='vigil-crowd-verge-1',rest=streetCrowdPose(sign,{reducedMotion:true}),lowered=streetCrowdPose(sign,{frame:{action:'placard-lower',elapsedMs:1200,durationMs:2400,part:{dx:.05,dy:-.12,dz:0,dyaw:0}},yaw:Math.PI/2,reducedMotion:true});
for(const side of['L','R']){
  const a=rest.contacts.find(c=>c.kind==='wrist'&&c.side===side).physicalPoint,b=lowered.contacts.find(c=>c.kind==='wrist'&&c.side===side).physicalPoint;
  assert.ok(Math.abs(b[1]-a[1]+.12)<1e-7);assert.ok(Math.abs(b[2]-a[2]+.05)<1e-7,'hands follow world-axis linked-sign drift through actor yaw');
}

const raw={id:'district-pub-driver',mesh:'exterior_pub_driver',x:18,y:.12,z:105,yaw:Math.PI,zone:4,noShadow:true,emissive:.2,custom:'retained'};
const rendered=streetCrowdRenderInstance(raw,{reducedMotion:true});
assert.equal(rendered.id,raw.id);assert.equal(rendered.mesh,'district_pub_driver');
assert.deepEqual([...rendered.matrix.slice(12,15)],[18,Math.fround(.12),105]);assert.equal(rendered.noShadow,true);assert.equal(rendered.emissive,.2);assert.equal(rendered.custom,'retained');assert.equal(raw.character,undefined);
assert.ok(Math.abs(Math.hypot(...rendered.matrix.slice(0,3))-DESIGNS[raw.id].width)<1e-6);
const ending={...raw,id:'ending-worker-2',scaleX:.8,matrix:new Float32Array([2,0,0,0,0,3,0,0,0,0,4,0,7,8,9,1])},endingRendered=streetCrowdRenderInstance(ending,{reducedMotion:true});
assert.equal(endingRendered.id,'ending-worker-2');assert.deepEqual([...endingRendered.matrix.slice(12,15)],[7,8,9]);assert.ok(Math.abs(endingRendered.matrix[0]-2*DESIGNS[raw.id].width)<1e-6);
const unknown={id:'vigil-ruth-mallory',mesh:'vigil_ruth_mallory'};assert.equal(streetCrowdRenderInstance(unknown),unknown);
const raws=Object.values(DESIGNS).map((d,index)=>({id:d.id,mesh:d.legacyMesh,x:index,y:.12,z:index+2,yaw:.3,zone:4})),all=streetCrowdInstances([...raws,unknown],{reducedMotion:true,frames:[{actorId:sign,action:'placard-lower',elapsedMs:1200,durationMs:2400}]});
assert.equal(all.filter(i=>i.character).length,20);assert.equal(all.filter(i=>i.mesh==='street_crowd_folding_chair').length,3);assert.equal(all.filter(i=>i.mesh==='street_crowd_camera_tripod').length,2);
for(const extra of all.filter(i=>!i.character)){const parent=raws.find(i=>extra.id.startsWith(i.id));assert.ok(parent);assert.deepEqual([...extra.matrix.slice(12,15)],[parent.x,Math.fround(parent.y),parent.z]);assert.ok(Math.abs(Math.hypot(...extra.matrix.slice(0,3))-1)<1e-6,'fixed equipment keeps physical metre dimensions, independent of occupant height');}
assert.equal(streetCrowdInstances([{...raw,visible:false}]).length,0);
console.log(JSON.stringify({ok:true,characters:20,backgroundVigil:18,sharedRigs:2,sharedGarments:5,poseSamples:samples,grippedFingerPadSamples:grippedPads,fixedChairs:3,fixedTripods:2,nativeVisualAcceptance:false}));
