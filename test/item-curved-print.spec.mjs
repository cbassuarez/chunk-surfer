import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {conformVectorLettering,FIELD_KIT_METRES_PER_UNIT} from '../scripts/curved-item-lettering.mjs';
const surfaces=[
 {centerY:-.24,heightM:.54,radiusTopM:.115,radiusBottomM:.115*.86,segments:40,hostName:'tapered-microphone-body'},
 {centerY:0,heightM:1.16,radiusTopM:.132,radiusBottomM:.132,segments:48,hostName:'flashlight-main-barrel'},
];
for(const surface of surfaces)test(`${surface.hostName}: original vector area and host contact survive real facet boundaries`,()=>{
 const origin=[-.071,surface.centerY-.042,.17],positions=new Float32Array([0,0,0,.14,0,0,.14,.035,0,0,0,0,.14,.035,0,0,.035,0]);
 const result=conformVectorLettering({positions,origin,surface});
 assert.ok(Math.abs(result.contact.sourceVectorArea-result.contact.conformedVectorArea)<1e-12);
 const host=new THREE.Mesh(new THREE.CylinderGeometry(surface.radiusTopM,surface.radiusBottomM,surface.heightM,surface.segments,1),new THREE.MeshBasicMaterial());host.position.y=surface.centerY;host.updateMatrixWorld(true);
 const stored=Array.from(new Float32Array(result.positions));
 for(let i=0;i<result.indices.length;i+=3){
  const ids=result.indices.slice(i,i+3),points=ids.map(id=>stored.slice(id*3,id*3+3).map((v,k)=>v+origin[k]));
  const vectors=points.map(p=>new THREE.Vector3(...p)),faceNormal=vectors[1].clone().sub(vectors[0]).cross(vectors[2].clone().sub(vectors[0])).normalize();
  assert.ok(ids.every(id=>faceNormal.dot(new THREE.Vector3(...result.normals.slice(id*3,id*3+3)))>.995),'Winding and interpolated normals must agree with the actual facade facet');
  for(const weights of[[.2,.3,.5],[1/3,1/3,1/3]]){
   const p=[0,1,2].map(k=>weights.reduce((s,w,j)=>s+w*points[j][k],0)),ray=new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(-p[0],0,-p[2]).normalize(),0,.01);
   const hit=ray.intersectObject(host,false)[0];assert.ok(hit,'Every glyph interior must have the actual generated body directly beneath it');
   const physicalGap=hit.distance*FIELD_KIT_METRES_PER_UNIT;assert.ok(physicalGap>.000099&&physicalGap<.000102,'Vector ink cannot become a floating flat plaque');
  }
 }
 assert.ok(result.positions.every(Number.isFinite)&&result.normals.every(Number.isFinite));
 host.geometry.dispose();host.material.dispose();
});
test('flat vector glyphs cannot leave the known barrel or acquire an arbitrary paint standoff',()=>{
 const surface=surfaces[0],positions=[0,0,0,.02,0,0,0,.02,0];
 assert.throws(()=>conformVectorLettering({positions,origin:[0,2,0],surface}),/leaves its physical housing/);
 assert.throws(()=>conformVectorLettering({positions,origin:[0,-.3,0],surface:{...surface,offsetPhysicalM:.001}}),/actual polygonal/);
});
