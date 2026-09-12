import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import * as THREE from 'three';
import {VAN_KIT_MODELS,vanKitModel} from '../src/data/van-kit-models.js';
import {itemPortrait} from '../src/data/item-portraits.js';

const io=new NodeIO(),load=id=>io.read(`public/${VAN_KIT_MODELS[id].model}`);
const find=(doc,name)=>doc.getRoot().listNodes().find(node=>node.getName()===name);
const shapeContains=(a,b,c,x,y)=>{
 const cross=(u,v)=>(v[0]-u[0])*(y-u[1])-(v[1]-u[1])*(x-u[0]);
 const signs=[cross(a,b),cross(b,c),cross(c,a)];
 return signs.every(s=>s>=-1e-9)||signs.every(s=>s<=1e-9);
};
function triangles(node){
 return node.getMesh().listPrimitives().flatMap(primitive=>{
  const p=primitive.getAttribute('POSITION'),indices=primitive.getIndices(),result=[];
  for(let i=0;i<(indices?.getCount()??p.getCount());i+=3)result.push([0,1,2].map(j=>p.getElement(indices?indices.getScalar(i+j):i+j,[])));
  return result;
 });
}
test('eight independent original kit assets ship with floor-centered geometry and bounded real inspection models',async()=>{
 const hashes=new Set();assert.equal(Object.keys(VAN_KIT_MODELS).length,8);
 for(const spec of Object.values(VAN_KIT_MODELS)){
  assert.equal(vanKitModel(spec.id),spec);assert.equal(itemPortrait(spec.id).model,spec.model);
  const doc=await load(spec.id),root=doc.getRoot().listScenes()[0].listChildren()[0],extras=root.getExtras();
  assert.equal(extras.authorship,'Original AUDIOCORP field-kit geometry');assert.equal(extras.origin,'floor-center');
  assert.ok(extras.triangles>5000&&extras.triangles<60000,spec.id);
  const bounds=new THREE.Box3();
  for(const node of doc.getRoot().listNodes())if(node.getMesh()){
   const matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix());
   for(const primitive of node.getMesh().listPrimitives()){
    const p=primitive.getAttribute('POSITION');
    for(let i=0;i<p.getCount();i++)bounds.expandByPoint(new THREE.Vector3(...p.getElement(i,[])).applyMatrix4(matrix));
   }
  }
  assert.ok(Math.abs(bounds.min.y)<1e-5,`${spec.id}: sits on floor`);
  assert.ok(Math.abs(bounds.max.x+bounds.min.x)<1e-5&&Math.abs(bounds.max.z+bounds.min.z)<1e-5,`${spec.id}: centered staging origin`);
  assert.ok((await stat(`public/${spec.model}`)).size<1_000_000,spec.id);
  hashes.add(createHash('sha256').update(await readFile(`public/${spec.model}`)).digest('hex'));
 }
 assert.equal(hashes.size,8,'variants are separately authored physical objects, never duplicated composite kit files');
 assert.equal(vanKitModel('unknown'),null);
});
test('open case has five true fitted foam apertures, retention straps, distinct foam, hinges and serviceable latches',async()=>{
 const doc=await load('field-case'),foam=find(doc,'fitted-foam-with-five-real-cutouts');assert.ok(foam);
 for(const name of['lid-retaining-strap','hinge-pin','open-latch-loop','formed-carry-handle','case-bottom-foot','molded-lid-foam-rib'])assert.ok(find(doc,name),name);
 for(const tri of triangles(foam))if(tri.every(p=>Math.abs(p[2]-tri[0][2])<1e-7))for(const[x,y]of[[-.65,-.22],[.14,-.22],[.75,-.22],[-.48,.39],[.47,.40]])assert.equal(shapeContains(...tri,x,y),false,'foam aperture is not painted over an opaque slab');
 const material=foam.getMesh().listPrimitives()[0].getMaterial();
 assert.equal(material.getRoughnessFactor(),1);assert.equal(material.getMetallicFactor(),0);
 assert.ok(Math.max(...material.getBaseColorFactor().slice(0,3))<.01,'absorbing dark foam, not reflective molded metal');
});
test('headphone variants retain real open cushions, suspended yokes and continuous leads; only open backs expose the wire lattice',async()=>{
 for(const variant of['reference','closed','open']){
  const doc=await load(`headphones-${variant}`),cushion=find(doc,'open-ear-cushion');assert.ok(cushion);
  assert.ok(find(doc,'spring-steel-headband'));assert.ok(find(doc,'floating-fork-yoke'));assert.ok(find(doc,'continuous-coiled-lead'));assert.ok(find(doc,'quarter-inch-plug'));
  for(const tri of triangles(cushion))assert.equal(shapeContains(...tri,0,0),false,'cushion has a genuinely hollow ear opening');
  assert.equal(!!find(doc,'open-back-mesh-horizontal'),variant==='open');
  assert.equal(!!find(doc,'sealed-cup-back'),variant!=='open');
  const material=cushion.getMesh().listPrimitives()[0].getMaterial();assert.equal(material.getName(),'leather');assert.equal(material.getMetallicFactor(),0);
 }
});
test('microphones have distinct capsule topology, open wire screens and recessed three-pin connectors',async()=>{
 for(const variant of['reference','directional','wide']){
  const doc=await load(`microphone-${variant}`);
  assert.ok(find(doc,'XLR-contact-pin'));assert.ok(find(doc,'jack-mouth-aperture'));assert.ok(find(doc,'capsule-end-cross-screen'));
  if(variant==='reference')assert.ok(find(doc,'crossed-suspension-elastic'));
  if(variant==='directional'){assert.ok(find(doc,'interference-tube-web'));assert.ok(find(doc,'interference-slot-band'));}
  if(variant==='wide'){assert.ok(find(doc,'left-XY-capsule'));assert.ok(find(doc,'right-XY-capsule'));}
 }
});
test('recorder identity now resolves to the approved standalone wide instrument with idle VFD behind transparent cover',async()=>{
 const spec=itemPortrait('recorder');assert.equal(spec.id,'recorder');assert.equal(spec.model,VAN_KIT_MODELS['field-recorder'].model);
 assert.equal(spec.small,'assets/items/field-recorder-192.webp');
 const doc=await load('field-recorder'),nodes=doc.getRoot().listNodes();
 assert.ok(!nodes.some(node=>/headphone|earcup/i.test(node.getName())),'headphones are a separate item, never welded to the recorder');
 for(const name of['recorder-faceplate-with-optical-aperture','recorder-dark-optical-well','recorder-display-substrate','recorder-idle-electrodes',
  'zero-counter-electrode','unenergized-output-electrodes','location-start-cursor','transport-REC-cap','transport-STOP-cap','transport-TAKES-cap','removable-field-cell-cover','rear-vent-with-ten-open-slots'])assert.ok(find(doc,name),name);
 const substrate=find(doc,'recorder-display-substrate'),cover=find(doc,'recorder-front-cover-glass'),electrode=find(doc,'zero-counter-electrode');
 assert.ok(substrate.getMesh().listPrimitives()[0].getAttribute('TEXCOORD_0'),'live display supports actual mapped readings');
 assert.ok(substrate.getTranslation()[2]<electrode.getTranslation()[2]&&electrode.getTranslation()[2]<cover.getTranslation()[2]);
 const glass=cover.getMesh().listPrimitives()[0].getMaterial();assert.equal(glass.getAlphaMode(),'BLEND');assert.ok(glass.getBaseColorFactor()[3]<.15);
 const keyYs=['REC','STOP','TAKES'].map(id=>find(doc,`transport-${id}-cap`).getTranslation()[1]);assert.equal(new Set(keyYs).size,1,'three bottom keys share a horizontal row');
});
