import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {KHRMaterialsTransmission,KHRMaterialsIOR,KHRMaterialsVolume} from '@gltf-transform/extensions';
import * as THREE from 'three';
import {BENCH_MODELS,VAN_KIT_MODELS,vanKitModel} from '../src/data/van-kit-models.js';

const io=new NodeIO().registerExtensions([KHRMaterialsTransmission,KHRMaterialsIOR,KHRMaterialsVolume]);
const load=id=>io.read(`public/${vanKitModel(id).model}`);
const find=(doc,name)=>doc.getRoot().listNodes().find(n=>n.getName()===name);
const names=doc=>doc.getRoot().listNodes().map(n=>n.getName());

test('bench stock ships nine independent bounded assets without changing the original eight-item registry',async()=>{
 assert.equal(Object.keys(BENCH_MODELS).length,9);assert.equal(Object.keys(VAN_KIT_MODELS).length,8);
 const hashes=new Set();
 for(const spec of Object.values(BENCH_MODELS)){
  const doc=await load(spec.id),root=doc.getRoot().listScenes()[0].listChildren()[0];
  assert.equal(vanKitModel(spec.id),spec);
  assert.equal(root.getExtras().authorship,'Original AUDIOCORP field-kit geometry');
  assert.ok(root.getExtras().triangles>4000&&root.getExtras().triangles<18000);
  const bounds=new THREE.Box3();
  for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()||[]){
   const p=primitive.getAttribute('POSITION'),matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix());
   for(let i=0;i<p.getCount();i++){
    const point=new THREE.Vector3(...p.getElement(i,[])).applyMatrix4(matrix);
    assert.ok(point.toArray().every(Number.isFinite));bounds.expandByPoint(point);
   }
  }
  assert.ok(Math.abs(bounds.min.y)<1e-5,spec.id);
  assert.ok(Math.abs(bounds.min.x+bounds.max.x)<1e-5&&Math.abs(bounds.min.z+bounds.max.z)<1e-5,spec.id);
  assert.ok((await stat(`public/${spec.model}`)).size<500_000,spec.id);
  hashes.add(createHash('sha256').update(await readFile(`public/${spec.model}`)).digest('hex'));
 }
 assert.equal(hashes.size,9);
});

test('amplifier variants have different housings, genuine controls and service hardware, never decorative readings',async()=>{
 for(const variant of['reference','low-draw','headroom']){
  const doc=await load(`amp-${variant}`),list=names(doc);
  for(const name of['amplifier-front-panel','protected-gain-knob','gain-index','gain-scale-mark','raised-protection-rail','jack-mouth-aperture','amplifier-battery-door','amplifier-belt-clip'])assert.ok(list.includes(name),`${variant}: ${name}`);
  assert.equal(list.includes('high-headroom-heat-sink-fin'),variant==='headroom');
  assert.equal(list.includes('low-draw-power-slide'),variant==='low-draw');
  assert.equal(list.includes('reference-monitor-toggle'),variant==='reference');
  assert.ok(!list.some(n=>/meter|display|reading|vfd|electrode/.test(n)));
 }
});

test('flashlights have independent optical topology, passive emitters and a dedicated cosmetic housing material',async()=>{
 for(const variant of['reference','throw','flood']){
  const doc=await load(`flashlight-${variant}`),list=names(doc);
  for(const name of['flashlight-threaded-tailcap','flashlight-tail-seal','flashlight-spring-pocket-clip','flashlight-lanyard-eye','flashlight-real-parabolic-reflector','flashlight-passive-emitter','flashlight-clear-optical-lens'])assert.ok(list.includes(name),`${variant}: ${name}`);
  assert.equal(list.includes('flood-right-angle-head'),variant==='flood');
  assert.equal(list.includes('flashlight-open-optical-housing'),variant!=='flood');
  const lens=find(doc,'flashlight-clear-optical-lens').getMesh().listPrimitives()[0].getMaterial();
  assert.ok(lens.getExtension('KHR_materials_transmission').getTransmissionFactor()>.9);
  assert.equal(lens.getAlphaMode(),'OPAQUE');
  assert.deepEqual(find(doc,'flashlight-passive-emitter').getMesh().listPrimitives()[0].getMaterial().getEmissiveFactor(),[0,0,0]);
  assert.equal(find(doc,'flashlight-main-barrel').getMesh().listPrimitives()[0].getMaterial().getName(),'flashlight-housing');
  const reflector=find(doc,'flashlight-real-parabolic-reflector').getMesh().listPrimitives()[0].getAttribute('NORMAL');
  assert.ok(Array.from({length:reflector.getCount()},(_,i)=>reflector.getElement(i,[])[1]).every(y=>y>0),'reflector normals face into the visible optical cavity');
 }
});

test('replacement plates have true VFD, three key and four fixing apertures',async()=>{
 const holes=[[0,(202.5-195.5)/300],...[459.5,558.5,657.5].map(x=>[(x-368)/300,(202.5-350.5)/300]),...[25,711].flatMap(x=>[28,372].map(y=>[(x-368)/300,(202.5-y)/300]))];
 const contains=(tri,x,y)=>{
  const signs=tri.map((p,i)=>{const q=tri[(i+1)%3];return(q[0]-p[0])*(y-p[1])-(q[1]-p[1])*(x-p[0]);});
  return signs.every(s=>s>=-1e-9)||signs.every(s=>s<=1e-9);
 };
 for(const finish of['aluminum','black','olive']){
  const doc=await load(`faceplate-${finish}`),plate=find(doc,'replacement-faceplate-with-eight-real-apertures');
  assert.ok(plate);assert.equal(plate.getMesh().listPrimitives()[0].getMaterial().getName(),`faceplate-${finish}`);
  for(const prim of plate.getMesh().listPrimitives()){
   const p=prim.getAttribute('POSITION'),ix=prim.getIndices();
   for(let i=0;i<ix.getCount();i+=3){
    const tri=[0,1,2].map(j=>p.getElement(ix.getScalar(i+j),[]));
    if(tri.every(v=>Math.abs(v[2]-tri[0][2])<1e-6))for(const[x,y]of holes)assert.equal(contains(tri,x,y),false,`${finish}: cutout ${x},${y}`);
   }
  }
 }
});

test('the complete hinged case closes over its foam and exposes three real lid packing anchors',async()=>{
 const doc=await load('field-case'),hinge=find(doc,'open-lid-hinge');
 assert.deepEqual(hinge.getExtras(),{openAngle:-.31,closedAngle:Math.PI/2,rotationAxis:'X'});
 for(const id of['headphones','amp','flashlight']){
  const anchor=find(doc,`packing-bay:${id}`);
  assert.equal(anchor.getParentNode(),hinge);assert.equal(anchor.getExtras().plane,'XY');
  assert.ok(anchor.getExtras().maxWidth>0&&anchor.getExtras().maxHeight>0);
  assert.ok(find(doc,`lid-cradle-edge:${id}`));
 }
 hinge.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0)).toArray());
 const meshes=[];
 for(const node of doc.getRoot().listNodes())for(const prim of node.getMesh()?.listPrimitives()||[]){
  if(node.getName()==='lid-retaining-strap')continue;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(prim.getAttribute('POSITION').getArray(),3));
  geo.setIndex(new THREE.BufferAttribute(prim.getIndices().getArray(),1));
  const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.name=node.getName();
  mesh.matrixAutoUpdate=false;mesh.matrixWorld.fromArray(node.getWorldMatrix());meshes.push(mesh);
 }
 const assembly=find(doc,'open-field-case-assembly'),matrix=new THREE.Matrix4().fromArray(assembly.getWorldMatrix());
 for(const x of[-.9,-.45,0,.45,.9])for(const z of[-.58,0,.58]){
  const origin=new THREE.Vector3(x,5,z).applyMatrix4(matrix);
  const hits=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0)).intersectObjects(meshes,false);
  assert.ok(hits.length);assert.ok(!/foam|packing|fabric|base-pan/.test(hits[0].object.name),`closed case exposes ${hits[0].object.name} at ${x},${z}`);
 }
 for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}
});
