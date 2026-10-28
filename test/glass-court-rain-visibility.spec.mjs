import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import * as FP from '../src/world/floorplan.js';
import * as P from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {GLASS_COURT as C} from '../src/data/glass-court.js';
import {GLASS_COURT_PRESENCES as bodies} from '../src/data/glass-court-presences.js';
import {GLASS_COURT_RAIN_FACES as faces,createGlassCourtRainPresence} from '../src/game/glass-court-rain-presence.js';

// Production meshes and instances, not the geometry generator's intentions.
// This proves sight rays only; lighting, dither and recognition need native viewing.
FP.compile(conservatory.levels,conservatory);
P.propsInit(FP);P.setColliderGroupEnabled('glass-court',true);
const meshes=new Map();
// r3d loads the dedicated court after the base pack; its rehosted entrance
// fixture intentionally replaces the old admission fixture with the same name.
for(const pack of ['conservatory-props','glass-court']){
 const doc=await new NodeIO().readBinary(fs.readFileSync(new URL(`../public/assets/${pack}.glb`,import.meta.url)));
 for(const mesh of doc.getRoot().listMeshes())meshes.set(mesh.getName(),mesh);
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((n,k)=>n-b[k]),dot=(a,b)=>a.reduce((s,n,k)=>s+n*b[k],0);
function intersection(from,to,a,b,c){
 const direction=sub(to,from),e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);
 if(Math.abs(det)<1e-10)return null;
 const inv=1/det,tv=sub(from,a),u=dot(tv,p)*inv;if(u<0||u>1)return null;
 const q=cross(tv,e1),v=dot(direction,q)*inv;if(v<0||u+v>1)return null;
 const t=dot(e2,q)*inv;return t>1e-5&&t<1.00001?t:null;
}
const triangles=[];
for(const instance of P.renderInstances({group:'ground',inscriptions:false})){
 if(!instance.id.startsWith('glass-court')&&instance.id!=='natatorium-entrance-fixtures')continue;
 const mesh=meshes.get(instance.mesh);assert.ok(mesh,instance.mesh);
 const c=Math.cos(instance.yaw||0),s=Math.sin(instance.yaw||0),scale=instance.scale||1;
 for(const primitive of mesh.listPrimitives()){
  const positions=primitive.getAttribute('POSITION').getArray(),indices=primitive.getIndices().getArray();
  const material=primitive.getMaterial();
  for(let i=0;i<indices.length;i+=3){
   const points=[0,1,2].map(j=>{
    const at=indices[i+j]*3,x=positions[at]*scale*(instance.scaleX||1),z=positions[at+2]*scale*(instance.scaleZ||1);
    return[instance.x+x*c-z*s,instance.y+positions[at+1]*scale*(instance.scaleY||1),instance.z+x*s+z*c];
   });
   triangles.push({id:instance.id,mesh:instance.mesh,material:material.getName(),alpha:material.getAlphaMode(),points,
    min:[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...points.map(p=>p[k])))});
  }
 }
}
const features=[[-.135,.11],[.135,.11],[-.15,.18],[.15,.18],[0,-.06],[0,-.264],[-.21,-.10],[.21,-.10]];
function hits(from,to,predicate){
 const lo=from.map((n,k)=>Math.min(n,to[k])),hi=from.map((n,k)=>Math.max(n,to[k]));
 return triangles.filter(t=>predicate(t)&&!t.min.some((n,k)=>n>hi[k]+1e-5)&&!t.max.some((n,k)=>n<lo[k]-1e-5)
  &&intersection(from,to,...t.points)!==null);
}
const eyeFor=face=>[face.x,1.65,C.origin.z+2.5];
const blockers=(face,[x,y])=>hits(eyeFor(face),[face.x+x,face.y+y,face.z],t=>t.alpha==='OPAQUE');

test('both expressions reach the actual inward-facing north pane within the shader tolerance',()=>{
 for(const face of faces)for(const [x,y]of features){
  const from=eyeFor(face),to=[face.x+x,face.y+y,face.z];
  const pane=hits(from,to,t=>t.mesh==='glass_court_glass'&&t.material==='court sparse glazed reflection'&&t.alpha==='MASK');
  assert.ok(pane.length,`${face.sourceId} feature(${x},${y}) lands on real sparse glazing`);
  assert.ok(pane.some(t=>t.points.every(p=>Math.abs(p[2]-face.z)<.018)),`${face.sourceId} uses the real north plane`);
 }
});

test('all eight facial features have clear production sight rays; old eye-height sites fail the same test',()=>{
 for(const [i,face]of faces.entries()){
  for(const feature of features)assert.deepEqual(blockers(face,feature).map(t=>t.id),[],`${face.sourceId}: ${feature}`);
  const old={...face,x:bodies[i].x,y:C.drawnFloor+1.69};
  assert.ok(features.every(feature=>blockers(old,feature).length),`${face.sourceId}: negative control must reproduce the hidden original site`);
 }
});

test('a visitor at ordinary eye height can attend each raised face without input or camera ownership',()=>{
 for(const face of faces){
  const eye=eyeFor(face),to=[face.x,face.y,face.z],delta=sub(to,eye),length=Math.hypot(...delta),forward={x:delta[0]/length,y:delta[1]/length,z:delta[2]/length};
  const controller=createGlassCourtRainPresence();let frame;
  for(let i=0;i<70;i++)frame=controller.update({eye:{x:eye[0],y:eye[1],z:eye[2]},forward,ready:true,dtSec:.05});
  assert.equal(frame.faces.find(f=>f.sourceId===face.sourceId).phase,'recognised');
  assert.ok(Math.asin(forward.y)<.58,'an ordinary upward glance reaches the eaves expression');
  assert.equal(Object.hasOwn(frame,'camera'),false);assert.equal(Object.hasOwn(frame,'input'),false);
 }
});
