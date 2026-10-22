import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {buildRoofWordLockModel} from '../src/render/roof-word-lock-model.js';

// Geometry, UVs, picking and resource lifetime do not require a GPU. This stub
// supplies only the canvas authoring surface; it makes no visual-font claim.
class AuthoringCanvas{
  constructor(width,height){this.width=width;this.height=height;}
  getContext(){
    return new Proxy({measureText:()=>({width:75})},{get:(target,key)=>key in target?target[key]:()=>{}});
  }
}
function fixture(t,rounded=true){
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'OffscreenCanvas');
  Object.defineProperty(globalThis,'OffscreenCanvas',{value:AuthoringCanvas,configurable:true,writable:true});
  t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'OffscreenCanvas',descriptor);else delete globalThis.OffscreenCanvas;});
  const model=buildRoofWordLockModel(THREE,rounded?{RoundedBoxGeometry}:{});
  t.after(()=>model.dispose());return model;
}
const facesOf=wheel=>wheel.children.find(object=>object.name.startsWith('enamel-faces-'));
function faceCentre(face,index){
  return new THREE.Vector3().fromBufferAttribute(face.geometry.getAttribute('position'),index*4)
    .add(new THREE.Vector3().fromBufferAttribute(face.geometry.getAttribute('position'),index*4+2)).multiplyScalar(.5);
}
const rayFromFront=point=>new THREE.Raycaster(point.clone().add(new THREE.Vector3(0,0,1)),new THREE.Vector3(0,0,-1));

test('all 26 physical inscriptions use their own upright atlas tile and reach the index through negative X turns',t=>{
  const model=fixture(t),wheel=model.wheels[0],face=facesOf(wheel),uv=face.geometry.getAttribute('uv');
  assert.equal(model.wheels.length,6);assert.ok(face?.isMesh);
  assert.ok(faceCentre(face,1).y<0,'B physically begins below A, so an upward drag brings it up');
  for(let k=0;k<26;k++){
    wheel.rotation.x=-k*Math.PI*2/26;model.group.updateMatrixWorld(true);
    const centre=face.localToWorld(faceCentre(face,k));
    assert.ok(Math.abs(centre.y)<1e-7,`letter ${k} meets the horizontal index`);
    assert.ok(Math.abs(centre.x-wheel.position.x)<1e-7,`letter ${k} remains centred on its drum`);
    assert.ok(centre.z>.139&&centre.z<.141,`letter ${k} reaches the front of the actual cylinder`);
    const normal=new THREE.Vector3().fromBufferAttribute(face.geometry.getAttribute('normal'),k*4).transformDirection(face.matrixWorld);
    assert.ok(normal.z>.999999&&Math.abs(normal.y)<1e-7,`letter ${k} faces the viewer at its detent`);
    const start=k*4;
    assert.ok(uv.getX(start)>k/26&&uv.getX(start+1)<(k+1)/26,`letter ${k} cannot sample an adjacent glyph`);
    assert.ok(uv.getX(start+1)>uv.getX(start),'the inscription is not mirrored left to right');
    assert.equal(uv.getY(start),0);assert.equal(uv.getY(start+2),1,'the inscription has an upright vertical mapping');
  }
  for(const other of model.wheels){
    assert.equal(facesOf(other).geometry,face.geometry,'all six mechanisms share the validated cylindrical mesh');
    assert.equal(facesOf(other).material.map,face.material.map,'all six use the same complete alphabet atlas');
  }
  assert.equal(face.material.map.image.width,26*128);assert.equal(face.material.map.image.height,128);
});

test('six separate wheel surfaces and the real handle remain directly raycastable',t=>{
  const model=fixture(t);model.group.updateMatrixWorld(true);
  assert.equal(model.targets.length,6);assert.ok(model.handleTarget.isMesh);
  const targets=[...model.targets,model.handleTarget];
  for(let index=0;index<6;index++){
    const target=model.targets[index];assert.ok(target.isMesh);assert.equal(target.userData.kind,'wheel');assert.equal(target.userData.index,index);
    assert.equal(target.material.colorWrite,false);assert.equal(target.material.depthWrite,false);assert.equal(target.material.opacity,0);
    const hit=rayFromFront(target.getWorldPosition(new THREE.Vector3())).intersectObjects(targets,false)[0];
    assert.equal(hit.object,target,`wheel ${index} is not intercepted by its neighbour or the handle`);
    target.geometry.computeBoundingBox();const size=target.geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x<model.diagnostics.dimensions.drumPitch&&size.x>.05,'adjacent targets do not overlap');
    assert.ok(size.y>=.046&&size.y<.08,'the target follows the visible drum window');
    assert.ok(size.z<.01,'picking remains on the surface of the casing');
  }
  const handleHit=rayFromFront(model.handleTarget.getWorldPosition(new THREE.Vector3())).intersectObjects(targets,false)[0];
  assert.equal(handleHit.object,model.handleTarget);assert.equal(handleHit.object.userData.kind,'handle');
});

test('the housing has actual open sightlines, while solid cover hides the drum outside each aperture',t=>{
  const model=fixture(t),physical=[];model.group.updateMatrixWorld(true);
  model.group.traverse(object=>{if(object.isMesh&&object.material.opacity!==0)physical.push(object);});
  for(let i=0;i<6;i++){
    const x=model.wheels[i].position.x;
    const centred=rayFromFront(new THREE.Vector3(x,0,.16)).intersectObjects(physical,false)[0];
    assert.equal(centred.object,facesOf(model.wheels[i]),`the centre of wheel ${i} is not covered by a false front plate`);
    for(const y of[-.04,.04]){
      const covered=rayFromFront(new THREE.Vector3(x,y,.16)).intersectObjects(physical,false)[0];
      assert.ok(covered?.object.name.startsWith('fixed-'),`wheel ${i} is masked beyond the slit`);
      assert.ok(covered.point.z>.15,'the occluder is physically in front of the drum');
    }
  }
});

for(const rounded of[true,false])test(`${rounded?'rounded':'box fallback'} model has finite physical bounds and remains below the geometry budget`,t=>{
  const model=fixture(t,rounded),bounds=new THREE.Box3().setFromObject(model.group),size=bounds.getSize(new THREE.Vector3());let triangles=0;
  for(const component of [...bounds.min.toArray(),...bounds.max.toArray()])assert.ok(Number.isFinite(component));
  const door=model.group.children.find(node=>node.name==='fixed-door');
  door.geometry.computeBoundingBox();const doorSize=door.geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(doorSize.x>=2&&doorSize.x<2.3&&doorSize.y>=2&&doorSize.y<2.5,'the actual leaf remains a full-size door');
  assert.ok(size.x>=8&&size.y>=5,'architectural backing covers the wider inspection frustum');
  assert.ok(size.z>.2&&size.z<.6,'the housing, cylindrical drums, backing and handle have bounded depth');
  model.group.traverse(object=>{
    if(!object.isMesh)return;
    for(const attribute of Object.values(object.geometry.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value),`${object.name} contains a non-finite coordinate`);
    const positions=object.geometry.getAttribute('position');
    if(object.geometry.index)for(const index of object.geometry.index.array)assert.ok(index>=0&&index<positions.count);
    if(object.material.opacity!==0)triangles+=(object.geometry.index?.count??positions.count)/3;
  });
  assert.ok(triangles>1000&&triangles<40000);assert.equal(model.diagnostics.triangles,triangles);
});

test('ordinary, portrait and ultrawide view corners land on opaque architecture instead of revealing the frozen world',t=>{
 const model=fixture(t),physical=[];model.group.traverse(node=>{if(node.isMesh&&node.material.colorWrite!==false)physical.push(node);});
 for(const aspect of[16/10,16/9,32/9,10/16])for(const approach of[0,.12]){
  const fit=Math.max(1,1.45/aspect),camera=new THREE.PerspectiveCamera(36,aspect,.02,12);
  camera.position.set(.36*fit,.12*fit,(.91+approach)*fit);camera.lookAt(-.015,.005,.045);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  for(const x of[-1,1])for(const y of[-1,1]){
   const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x,y),camera);
   assert.ok(ray.intersectObjects(physical,false).length,`alpha hole at ${aspect}, approach ${approach}, corner ${x},${y}`);
  }
 }
});

test('shared geometries, materials and authored textures are disposed once even after repeated teardown',t=>{
  const model=fixture(t),geometries=new Set(),materials=new Set(),textures=new Set(),counts={geometry:0,material:0,texture:0};
  model.group.traverse(object=>{
    if(!object.isMesh)return;geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  for(const geometry of geometries)geometry.addEventListener('dispose',()=>counts.geometry++);
  for(const material of materials)material.addEventListener('dispose',()=>counts.material++);
  for(const texture of textures)texture.addEventListener('dispose',()=>counts.texture++);
  model.dispose();assert.deepEqual(counts,{geometry:geometries.size,material:materials.size,texture:textures.size});
  assert.equal(textures.size,3,'the alphabet and two metal surfaces are shared instead of copied per wheel');
  model.dispose();assert.deepEqual(counts,{geometry:geometries.size,material:materials.size,texture:textures.size});
});
