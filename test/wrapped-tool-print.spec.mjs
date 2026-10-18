import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FIELD_WRAPPED_PRINT,facetedWrappedPrintGeometry,torchGripRingYs} from '../src/render/wrapped-tool-print.js';
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
function housingAt(point,surface){
 const [x,y,z]=point,theta=Math.atan2(x,z),delta=2*Math.PI/surface.segments,sector=Math.floor(theta/delta),angle=(sector+.5)*delta;
 const slope=(surface.radiusTopM-surface.radiusBottomM)/surface.heightM,c=Math.cos(delta/2),radius=surface.radiusBottomM+(y-(surface.centerY-surface.heightM/2))*slope;
 const normal=unit([Math.sin(angle),-slope*c,Math.cos(angle)]),plane=(radius*c-slope*c*y)/Math.hypot(1,slope*c);
 const radialBody=radius*c/Math.cos(theta-angle);
 return{gap:dot(normal,point)-plane,normal,radialBody};
}
function rowIntersections(geometry,v){
 const points=[];
 for(let i=0;i<geometry.indices.length;i+=3){
  const ids=geometry.indices.slice(i,i+3);
  for(let k=0;k<3;k++){
   const a=ids[k],b=ids[(k+1)%3],va=geometry.uvs[a*2+1],vb=geometry.uvs[b*2+1];
   if((v-va)*(v-vb)>0||Math.abs(va-vb)<1e-12)continue;
   const t=(v-va)/(vb-va),u=geometry.uvs[a*2]+t*(geometry.uvs[b*2]-geometry.uvs[a*2]);
   points.push({u,p:[0,1,2].map(j=>geometry.positions[a*3+j]+t*(geometry.positions[b*3+j]-geometry.positions[a*3+j]))});
  }
 }
 return points.sort((a,b)=>a.u-b.u).filter((point,i,a)=>i===0||Math.abs(point.u-a[i-1].u)>1e-9);
}
for(const [id,fit]of Object.entries(FIELD_WRAPPED_PRINT))test(`${id} print stays 0.1mm above the real faceted housing, including triangle interiors`,()=>{
 const geometry=facetedWrappedPrintGeometry(fit),surface=fit.surface;
 const housing=new THREE.Mesh(new THREE.CylinderGeometry(surface.radiusTopM,surface.radiusBottomM,surface.heightM,surface.segments,1),new THREE.MeshBasicMaterial());
 housing.position.y=surface.centerY;housing.updateMatrixWorld(true);
 // Check Float32 positions as actually uploaded, not merely ideal double math.
 const points=Array.from(new Float32Array(geometry.positions));
 for(let i=0;i<geometry.indices.length;i+=3){
  const ids=geometry.indices.slice(i,i+3),p=ids.map(id=>points.slice(id*3,id*3+3)),normal=unit(cross(sub(p[1],p[0]),sub(p[2],p[0])));
  const centre=[0,1,2].map(k=>(p[0][k]+p[1][k]+p[2][k])/3);
  assert.ok(dot(normal,housingAt(centre,surface).normal)>.99999,'Every paint triangle must occupy one actual housing facet');
  const ray=new THREE.Raycaster(new THREE.Vector3(...centre),new THREE.Vector3(-centre[0],0,-centre[2]).normalize(),0,.001),hit=ray.intersectObject(housing,false)[0];
  assert.ok(hit&&hit.distance>.000095&&hit.distance<.000105,'A radial ray must meet the actual Three CylinderGeometry immediately under the paint');
  for(const weights of[[1,0,0],[0,1,0],[0,0,1],[1/3,1/3,1/3],[.2,.3,.5]]){
   const point=[0,1,2].map(k=>weights.reduce((s,w,j)=>s+w*p[j][k],0)),contact=housingAt(point,surface),radial=Math.hypot(point[0],point[2]);
   assert.ok(Math.abs(contact.gap-surface.offsetM)<2e-7,`${id} paint/body gap ${contact.gap} must stay at100um, not become a floating plane`);
   assert.ok(radial>contact.radialBody&&radial-contact.radialBody<.000105,'A radial ray must hit paint immediately before its real polygonal body');
  }
  for(const id of ids){const n=geometry.normals.slice(id*3,id*3+3);assert.ok(Math.abs(Math.hypot(...n)-1)<1e-10);assert.ok(dot(n,normal)>.994,'Paint shading normals must agree with the authored smooth housing');}
 }
 for(const v of[.1,.5,.9]){
  const row=rowIntersections(geometry,v);assert.ok(row.length>4);
  const arc=row.slice(1).reduce((s,p,i)=>s+Math.hypot(...sub(p.p,row[i].p)),0);
  assert.ok(Math.abs(arc-fit.widthM)<1e-10,'Wrapping must preserve the existing width in surface arclength');
  assert.ok(row[0].p[0]<row.at(-1).p[0],'The actual inscription must read forward across the tool front');
 }
 const top=geometry.uvs.map((q,i)=>i%2===1&&q>.999?geometry.positions[Math.floor(i/2)*3+1]:-Infinity),bottom=geometry.uvs.map((q,i)=>i%2===1&&q<.001?geometry.positions[Math.floor(i/2)*3+1]:Infinity);
 assert.ok(Math.max(...top)>Math.min(...bottom),'Three top=V1 remains above the lower copy edge');
 housing.geometry.dispose();housing.material.dispose();
});
test('only the torch rib crossing the literal print band is removed; cup print clears its grip rings',()=>{
 const original=[];for(let y=-.078;y<.040;y+=.008)original.push(y);
 const current=torchGripRingYs(),removed=original.filter(y=>!current.includes(y));
 assert.equal(removed.length,1);assert.ok(Math.abs(removed[0]+.062)<1e-12);
 const band=FIELD_WRAPPED_PRINT.torch;for(const y of current)assert.ok(y+.0008<band.centerY-band.heightM/2||y-.0008>band.centerY+band.heightM/2);
 const cup=FIELD_WRAPPED_PRINT.coffee,bottom=cup.centerY-cup.heightM/2;
 assert.ok(bottom>.012+.0005,'NIGHT SHIFT must sit above the actual upper grip ring');
 assert.equal(cup.centerY,.030);assert.deepEqual(cup.surface,{centerY:-.011,heightM:.125,radiusBottomM:.027,radiusTopM:.038,segments:32,offsetM:.0001});
});
