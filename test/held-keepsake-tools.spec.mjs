import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DOOR_WEDGE_GEOMETRY, DOOR_WEDGE_SHAPE } from '../src/data/door-wedge.js';
import { carryItemDefinition } from '../src/game/carry-items.js';
import { buildBattleHandTool } from '../src/render/battle-hand-tools.js';
import { RETAINED_HELD_MODELS, retainedPropTemplate, warmRetainedHeldItem, retainedHeldItemReady } from '../src/render/held-keepsake-tools.js';
import { fieldHeldItemFrame, createFieldHeldItemPresenter } from '../src/render/field-held-item.js';
import { applyRecordistInspectionCamera } from '../src/render/battle-hands.js';
import { createBattleHandRig, parseBattleHandTemplate } from '../src/render/battle-hand-rig.js';
import { sourceRecordingCassetteGeometry } from '../src/render/source-recording-cassette-model.js';
import { sourceRecordingCassetteLabelBitmap } from '../src/render/source-recording-cassette.js';
import { itemPortrait } from '../src/data/item-portraits.js';
const io = new NodeIO(); let base;
const originalPack = () => base ||= io.read('public/assets/conservatory-props.glb');
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a-b)<epsilon, `${a} versus ${b}`);
function retainedEntry(doc, name, { texture = false } = {}) {
  const mesh = doc.getRoot().listMeshes().find(mesh=>mesh.getName()===name); assert.ok(mesh,name);
  const node = doc.getRoot().listNodes().find(node=>node.getMesh()===mesh);
  return {name,nodeMatrix:node?.getMatrix(),primitives:mesh.listPrimitives().map(primitive=>{
    const material=primitive.getMaterial();
    return {materialName:material.getName(),base:material.getBaseColorFactor(),roughness:material.getRoughnessFactor(),metallic:material.getMetallicFactor(),
      texture:texture?{}:null,nativeReceiverGeometry:{positions:primitive.getAttribute('POSITION').getArray(),normals:primitive.getAttribute('NORMAL')?.getArray(),uvs:primitive.getAttribute('TEXCOORD_0')?.getArray(),indices:primitive.getIndices().getArray()}};
  })};
}
function triangleDistance(group, position) {
  group.updateMatrixWorld(true); const p = new THREE.Vector3(...position), tri=new THREE.Triangle(), closest=new THREE.Vector3(); let distance=Infinity;
  group.traverse(mesh=>{if(!mesh.isMesh)return; const v=mesh.geometry.attributes.position,i=mesh.geometry.index;
    for(let at=0;at<(i?.count||v.count);at+=3){
      for(const [n,key] of [[0,'a'],[1,'b'],[2,'c']])tri[key].fromBufferAttribute(v,i?i.getX(at+n):at+n).applyMatrix4(mesh.matrixWorld);
      tri.closestPointToPoint(p,closest);distance=Math.min(distance,p.distanceTo(closest));
    }
  }); return distance;
}
let handTemplate;
async function proveGrip(tool, tolerance=.0016) {
  if(!handTemplate){const bytes=await readFile('public/assets/battle-hands/right.glb');handTemplate=await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));}
  const hand=createBattleHandRig(handTemplate,{nails:false}),grip=tool.contacts.right;
  hand.setRootPose(grip.wrist);hand.setFingerPose(grip.pose);
  const report=hand.measureGrip(grip,{space:'world'});
  for(const digit of ['index','middle','ring','pinky'].filter(d=>grip[d])){
    assert.ok(report[digit].error<.0016,`${tool.id}/${digit} actual skin-pad error ${report[digit].error}`);
    assert.ok(triangleDistance(tool.group,grip[digit].position)<tolerance,`${tool.id}/${digit} is not physically supported: ${triangleDistance(tool.group,grip[digit].position)}`);
  }
  hand.dispose();
}

test('all retained ownership IDs resolve exact geometry without granting a battle operation',()=>{
  for(const [id,model] of [['ren-home-cassette','ren-home-cassette'],['marble-eyes','marble-eyes'],['recording-cassette:12','recording-cassette'],['b3-session-card','b3-session-card'],['vale-guarantor-slip','vale-guarantor-slip'],['lyle-music-box','music-box'],['door-wedge','door-wedge']]){
    const f=fieldHeldItemFrame({id,toolId:model,active:true,present:true,now:71,inspectionView:{yaw:Math.PI,pitch:.3}}, {width:600,height:420,mode:'inspection'});
    assert.equal(f.tool,model);assert.equal(f.itemId,id);assert.equal(f.now,0);assert.equal(f.reducedMotion,true);
    assert.equal(f.move,null);assert.equal(f.actionActor,null);assert.equal(f.fieldLight,null);near(f.inspectionView.yaw,Math.PI);
    assert.equal(fieldHeldItemFrame({id,toolId:'torch',active:true,present:true}),null);
  }
  assert.equal(fieldHeldItemFrame({id:'unsupported-wedge-proxy',active:true,present:true}),null,'an object without retained physical geometry stays nonready');
});

test('HOME cassette uses its closed case and actual hubs in the existing hand cradle',async()=>{
  const portrait=itemPortrait('ren-home-cassette');
  const bytes=await readFile(`public/${portrait.model}`);
  assert.equal(await warmRetainedHeldItem('ren-home-cassette',{resolveAsset(asset){
    assert.equal(asset,portrait.model);
    return `data:application/octet-stream;base64,${bytes.toString('base64')}`;
  }}),true);
  const tool=buildBattleHandTool('ren-home-cassette');
  let identity;
  tool.group.traverse(node=>{if(node.userData.item==='ren-home-cassette')identity=node;});
  assert.equal(identity?.userData.item,'ren-home-cassette');
  assert.equal(identity.userData.markedSpine,'HOME');
  assert.equal(identity.userData.caseClosed,true);
  const lid=tool.group.getObjectByName('closed_clear_lid');
  assert.ok(lid?.isMesh&&lid.material.transparent&&lid.material.opacity<1,'the closed case shows the cassette through its lid');
  assert.ok(tool.group.getObjectByName('folded_J-card_spine')?.isMesh);
  const hubs=[];
  tool.group.traverse(node=>{if(node.isMesh&&node.userData.name==='nylon drive hub')hubs.push(node);});
  assert.equal(hubs.length,4,'two real hubs are visible from either side');
  assert.ok(hubs.every(hub=>hub.geometry.index.count>100));
  assert.ok(tool.bounds.width>=.118&&tool.bounds.width<=.124);
  assert.equal(tool.carryIncline,.55);
  for(const finger of ['index','middle','ring','pinky'])assert.ok(tool.contacts.right[finger]);
  await proveGrip(tool);tool.dispose();
});

test('both authored papers retain exact resident source arrays and their existing cradle',async()=>{
  const doc=await originalPack();
  for(const [id,name] of [['b3-session-card','b3_session_card'],['vale-guarantor-slip','loose_note']]){
    const entry=retainedEntry(doc,name),before=Array.from(entry.primitives[0].nativeReceiverGeometry.positions);
    const native={installAuthoredPropMeshes(fn){return fn({}, {catalog:new Map([[name,entry]])});}};
    assert.equal(await warmRetainedHeldItem(id,{props:native}),true);assert.equal(retainedHeldItemReady(id),true);
    const tool=buildBattleHandTool(id);assert.deepEqual(Object.keys(tool.controls),[]);assert.equal(tool.carryIncline,.55);
    const object=tool.group.getObjectByName(`retained original: ${id}`);assert.ok(object);
    object.traverse(mesh=>{if(mesh.isMesh)assert.ok(!mesh.material.map);});
    const copies=[];object.traverse(mesh=>{if(mesh.isMesh)copies.push(mesh.geometry.attributes.position.array);});
    for(const [index,copy] of copies.entries())assert.deepEqual(Array.from(copy),Array.from(entry.primitives[index].nativeReceiverGeometry.positions));
    await proveGrip(tool);tool.dispose();assert.deepEqual(Array.from(entry.primitives[0].nativeReceiverGeometry.positions),before);
  }
});

test('resident receiver conversion refuses incomplete textured material rather than stripping its identity',async()=>{
  const entry=retainedEntry(await originalPack(),'academic_roof_cassette',{texture:true});
  assert.throws(()=>retainedPropTemplate(entry),/complete retained material unavailable/);
});

test('the two real chipped eyes are rearranged separately onto two anatomical pads',async()=>{
  const bytes=await readFile('public/assets/items/marble-eyes.glb');
  const source=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const before=new THREE.Box3().setFromObject(source.scene);await warmRetainedHeldItem('marble-eyes',{template:source});
  const tool=buildBattleHandTool('marble-eyes');
  for(const name of ['L separate marble eye','R separate marble eye'])assert.ok(tool.group.getObjectByName(name));
  assert.ok(!tool.contacts.right.middle&&!tool.contacts.right.pinky,'do not claim pads in the gaps between loose eyes');
  await proveGrip(tool,.002);assert.deepEqual(new THREE.Box3().setFromObject(source.scene),before);tool.dispose();
});

test('numbered cartridge uses every existing standalone part and excludes recorder hardware',async()=>{
  const tool=buildBattleHandTool('recording-cassette'),geometry=sourceRecordingCassetteGeometry();
  const meshes=[];tool.group.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});assert.equal(meshes.length,8);
  for(const mesh of meshes){const name=mesh.name.slice('retained cartridge: '.length),source=geometry[`source_recording_cassette_${name}`];assert.ok(source);
    assert.equal(mesh.geometry.attributes.position.count,source.i.length);assert.equal(mesh.geometry.index.count,source.i.length);
  }
  assert.deepEqual(Object.keys(tool.controls),[]);await proveGrip(tool,.002);tool.dispose();
});

test('the shipped Lyle box retains the original broken surfaces, photograph and key and fits two hand pads',async()=>{
  const portrait=itemPortrait({sourceId:'lyle-music-box',modelId:'music-box'});
  assert.equal(RETAINED_HELD_MODELS['music-box'].asset,portrait.model);
  const [shipped,coastal]=await Promise.all([
    io.read(`public/${portrait.model}`),
    io.read('public/assets/source-drive/coastal-memory/coastal-memory.glb'),
  ]);
  const meshes=shipped.getRoot().listMeshes();
  assert.deepEqual(meshes.map(mesh=>mesh.getName()).sort(),['cm_broken_music_box','cm_broken_music_box_key']);
  const originalByName=new Map(coastal.getRoot().listMeshes().map(mesh=>[mesh.getName(),mesh]));
  for(const mesh of meshes){
    const original=originalByName.get(mesh.getName()).listPrimitives();
    const primitives=mesh.listPrimitives();
    assert.equal(primitives.length,original.length);
    for(const [i,primitive] of primitives.entries()){
      const source=original[i],material=primitive.getMaterial(),sourceMaterial=source.getMaterial();
      assert.equal(material.getName(),sourceMaterial.getName());
      assert.deepEqual(primitive.getIndices().getArray(),source.getIndices().getArray());
      for(const key of ['POSITION','NORMAL','TEXCOORD_0']){
        assert.deepEqual(primitive.getAttribute(key)?.getArray(),source.getAttribute(key)?.getArray());
      }
      assert.deepEqual(material.getBaseColorTexture()?.getImage(),sourceMaterial.getBaseColorTexture()?.getImage());
      if(/boxScuff$/.test(material.getName())){
        for(const getTexture of ['getNormalTexture','getMetallicRoughnessTexture','getOcclusionTexture']){
          assert.deepEqual(material[getTexture]()?.getImage(),sourceMaterial[getTexture]()?.getImage());
        }
      }
    }
  }
  const materials=shipped.getRoot().listMaterials();
  assert.ok(materials.some(material=>/\/ portrait$/.test(material.getName())&&material.getBaseColorTexture()));
  assert.ok(materials.some(material=>/ImpactUndercoat/.test(material.getName())));

  // Compare the image bytes above and measure support against the shipped
  // vertices below. Node does not decode the photograph into a GPU texture.
  const geometry=new THREE.Group();
  for(const mesh of meshes)geometry.add(retainedPropTemplate(retainedEntry(shipped,mesh.getName())));
  await warmRetainedHeldItem('music-box',{template:geometry});
  const tool=buildBattleHandTool('music-box');
  assert.ok(tool.bounds.width>.05&&tool.bounds.width<.06);
  assert.ok(tool.contacts.right.index&&tool.contacts.right.middle);
  assert.ok(!tool.contacts.right.ring&&!tool.contacts.right.pinky);
  await proveGrip(tool,.002);tool.dispose();
});

test('inspection camera shows front/back/side by orbiting the whole supported object and resets exactly',()=>{
  const tool=buildBattleHandTool('recording-cassette'),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,5);
  tool.group.rotation.set(.505,-.08,-.025);tool.group.updateMatrixWorld(true);const initial=tool.group.matrixWorld.clone();
  for(const [yaw,pitch] of [[0,0],[Math.PI,0],[Math.PI/2,.3],[-Math.PI/2,-.3]]){
    const diagnostic=applyRecordistInspectionCamera(THREE,camera,tool,{yaw,pitch},1.5);assert.ok(diagnostic.radius>.03);assert.deepEqual(tool.group.matrixWorld,initial);
    const corners=[];for(const x of [tool.inspectionBounds.min.x,tool.inspectionBounds.max.x])for(const y of [tool.inspectionBounds.min.y,tool.inspectionBounds.max.y])for(const z of [tool.inspectionBounds.min.z,tool.inspectionBounds.max.z])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(tool.group.matrixWorld).project(camera));
    for(const point of corners)assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,'all real object bounds remain inside the inspection aperture');
  }
  assert.equal(applyRecordistInspectionCamera(THREE,camera,tool,null),null);assert.deepEqual(camera.position.toArray(),[0,0,1.8]);assert.deepEqual(camera.quaternion.toArray(),[0,0,0,1]);tool.dispose();
});

test('missing resident finds never substitute another model and recovered broken metadata wins over generic model aliases',()=>{
  let draws=0,requests=0;
  const presenter=createFieldHeldItemPresenter({draw(){draws++;return true;},prepare:async()=>{requests++;return false;},retainedReady:()=>false});
  assert.equal(presenter.draw({ctx:{},width:500,height:400,mode:'inspection',frame:{id:'ren-home-cassette',present:true,active:true}}),false);
  assert.equal(draws,0);assert.equal(requests,1);assert.equal(presenter.diagnostics().reason,'asset-loading');
  const portrait=itemPortrait({sourceId:'lyle-music-box',modelId:'music-box'});
  assert.equal(portrait.retainedMesh,'cm_broken_music_box');
  assert.equal(portrait.model,'assets/items/lyle-music-box.glb');
  for(const id of ['ren-home-cassette','b3-session-card','vale-guarantor-slip'])assert.equal(itemPortrait(id).model,`assets/items/${id}.glb`);
  assert.equal(itemPortrait('recording-cassette:1').model,'assets/items/recording-cassette.glb');
});

function labelDocument() {
  const text=[];
  return {text,createElement(){const element={width:0,height:0};element.getContext=()=>({scale(){},fillRect(){},clearRect(){},font:'',measureText(value){const size=Number.parseFloat(this.font)||16;return{width:value.length*size*.55,actualBoundingBoxAscent:size*.7,actualBoundingBoxDescent:size*.2};},fillText(value){text.push(value);},getImageData(){return{data:new Uint8ClampedArray(element.width*element.height*4)};}});return element;}};
}
test('stock cartridge labels expose only real stock status and recording metadata',()=>{
  for(const [stock,expected,absent] of [
    [{cassetteNumber:4,content:null},['CASSETTE 004','UNRECORDED'],['0:00','NO TAPE ID','UNLABELLED','No slate']],
    [{cassetteNumber:7,content:{kind:'take',roomId:'main_b3',takeId:'take-authored-7'}},['CASSETTE 007','RECORDED','STUDIO B3','take-authored-7'],['0:00','NO TAPE ID','No slate']],
    [{cassetteNumber:9},['CASSETTE 009'],['RECORDED','UNRECORDED','0:00','UNLABELLED']],
  ]){const ownerDocument=labelDocument();sourceRecordingCassetteLabelBitmap({takeOrdinal:stock.cassetteNumber},{ownerDocument,stock});
    for(const wanted of expected)assert.ok(ownerDocument.text.some(text=>text.includes(wanted)),wanted);
    for(const forbidden of absent)assert.ok(ownerDocument.text.every(text=>!text.includes(forbidden)),forbidden);
  }
  assert.equal(fieldHeldItemFrame({id:'recording-cassette:2',recording:{cassetteNumber:3},present:true,active:true}),null,'wrong cassette metadata never changes a retained object identity');
});

test('cloned retained materials and maps are owned without disposing their source template',async()=>{
  const geometry=new THREE.BoxGeometry(.054,.046,.032),map=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
  const material=new THREE.MeshStandardMaterial({map}),mesh=new THREE.Mesh(geometry,material);mesh.position.y=.023;
  const source=new THREE.Group();source.add(mesh);await warmRetainedHeldItem('music-box',{template:source});
  const tool=buildBattleHandTool('music-box'),copy=tool.group.getObjectByProperty('isMesh',true);
  assert.notEqual(copy.geometry,geometry);assert.notEqual(copy.material,material);assert.notEqual(copy.material.map,map);
  let sourceDisposals=0,copyDisposals=0;map.addEventListener('dispose',()=>sourceDisposals++);copy.material.map.addEventListener('dispose',()=>copyDisposals++);
  tool.dispose();assert.equal(sourceDisposals,0);assert.equal(copyDisposals,1);
  geometry.dispose();material.dispose();map.dispose();
});

test('the recoverable wedge shares the actual installed rubber geometry and two supported palm pads',async()=>{
  const definition=carryItemDefinition('door-wedge');assert.equal(definition.heldModelId,'door-wedge');assert.equal(definition.battleToolId,null);
  assert.equal(await warmRetainedHeldItem('door-wedge'),true);assert.equal(retainedHeldItemReady('door-wedge'),true);
  const tool=buildBattleHandTool('door-wedge'),mesh=tool.group.getObjectByName('portable_door_wedge'),source=DOOR_WEDGE_GEOMETRY[0];
  assert.ok(mesh);assert.deepEqual(Object.keys(tool.controls),[]);
  const positions=mesh.geometry.attributes.position.array;
  assert.deepEqual(Array.from(positions),Array.from(Float32Array.from(source.i.flatMap(index=>source.p.slice(index*3,index*3+3)))));
  const box=new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position),size=box.getSize(new THREE.Vector3());
  near(size.x,DOOR_WEDGE_SHAPE.width);near(size.y,DOOR_WEDGE_SHAPE.height);near(size.z,DOOR_WEDGE_SHAPE.length);
  near(mesh.material.roughness,source.roughness);near(mesh.material.metalness,source.metallic);
  for(const [axis,value] of ['r','g','b'].map((axis,index)=>[axis,source.base[index]]))near(mesh.material.color[axis],value);
  assert.ok(!tool.contacts.right.ring&&!tool.contacts.right.pinky,'no claimed support outside the small wedge footprint');
  await proveGrip(tool);tool.dispose();
  assert.equal(fieldHeldItemFrame({id:'door-wedge',active:true,present:false}),null,'a wedge left under a door never remains in hand');
});
