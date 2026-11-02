import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import * as FP from '../src/world/floorplan.js';import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {EXTERIOR_INFRASTRUCTURE as C,EXTERIOR_INFRASTRUCTURE_MESHES as M,EXTERIOR_INFRASTRUCTURE_PROPS as P} from '../src/data/exterior-infrastructure.js';
import {exteriorInfrastructureGeometry} from '../tools/chunk_surfer/exterior-infrastructure-geometry.mjs';
import {pubPhysicalAt} from '../src/data/exterior-pub.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
const data=exteriorInfrastructureGeometry(),near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),sha=b=>createHash('sha256').update(b).digest('hex');
const worldBounds=m=>({min:m.bounds.min.map((v,k)=>v+(k===0?m.origin.x:k===2?m.origin.z:0)),max:m.bounds.max.map((v,k)=>v+(k===0?m.origin.x:k===2?m.origin.z:0))});
const overlaps=(a,b)=>[0,1,2].every(k=>a.min[k]<b.max[k]-1e-5&&a.max[k]>b.min[k]+1e-5);
test('generated original services match their source, deployment catalog and bounded mesh envelopes',()=>{
 const bytes=fs.readFileSync(new URL('../public/assets/exterior-infrastructure.glb',import.meta.url)),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/exterior-infrastructure.stats.json',import.meta.url))),g=parseGlb(bytes);
 assert.equal(sha(bytes),stats.sha256);assert.ok(bytes.length<=C.maximumBytes);assert.ok(stats.triangles<=C.maximumTriangles);assert.equal(stats.protectedAssetsUnchanged,true);
 assert.deepEqual(g.json.meshes.map(m=>m.name),Object.keys(M));
 for(const [p,h]of Object.entries(stats.sourceHashes))assert.equal(sha(fs.readFileSync(new URL('../'+p,import.meta.url))),h,p);
 for(const m of data.meshes){const spec=M[m.name];assert.ok(m.bounds.max[0]-m.bounds.min[0]<=spec.w+1e-6,m.name);assert.ok(m.bounds.max[2]-m.bounds.min[2]<=spec.d+1e-6,m.name);assert.ok(m.bounds.max[1]<=spec.h+1e-6,m.name);for(const p of m.primitives)assert.ok([...p.positions,...p.normals].every(Number.isFinite));}
});
test('camera arm and tapered bin skins face outwards rather than disappearing under backface culling',()=>{
 const camera=data.meshes.find(m=>m.name===C.camera.mesh);let sides=0;
 for(const g of camera.primitives.filter(g=>g.material===0))for(let i=0;i<g.positions.length;i+=12){const c=[0,1,2].map(k=>[0,1,2,3].reduce((n,j)=>n+g.positions[i+j*3+k],0)/4),n=g.normals.slice(i,i+3);
  if(c[2]<-.10&&c[2]>-.35&&Math.abs(c[0])<.04&&Math.abs(c[1]-3.30)<.04){assert.ok(n[0]*c[0]+n[1]*(c[1]-3.30)>0);sides++;}}
 assert.equal(sides,10);
 const bin=data.meshes.find(m=>m.name===C.bins.mesh).primitives.find(p=>p.material===3);
 for(let i=0;i<48;i+=12){const c=[0,1,2].map(k=>[0,1,2,3].reduce((n,j)=>n+bin.positions[i+j*3+k],0)/4),n=bin.normals.slice(i,i+3);assert.ok(c[0]*n[0]+(c[2]+.41)*n[2]>0);}
});
test('new assemblies avoid retained backstage/projection masses and attach their rainwater pads to real masonry',()=>{
 const retained=[{min:[42.3,0,30],max:[49.7,8.4,39.8]},
  ...[56.7,66.7].map(z=>({min:[46.6,0,z-3.7],max:[50,9.4,z+3.7]})),
  ...[75.5,82.7,89.7].map(z=>({min:[47.5,0,z-2.9],max:[50,7.65,z+2.9]}))];
 for(const m of data.meshes)assert.ok(!retained.some(b=>overlaps(worldBounds(m),b)),`${m.name} is buried in retained architecture`);
 for(const spec of C.rainwater){const mesh=data.meshes.find(m=>m.name===spec.mesh);const pads=mesh.parts.filter(p=>p.id.endsWith(':wall-pad'));assert.ok(pads.length>=4);for(const p of pads)assert.ok(spec.origin.x+p.center[0]+p.size[0]/2>=49.26);const receiver=mesh.parts.find(p=>p.id==='gully-dark-trap');assert.ok(receiver&&receiver.center[1]<.06);}
 const aim=C.camera.target.map((v,k)=>v-C.camera.eye[k]),toBin=[C.bins.origin.x,.6,C.bins.origin.z].map((v,k)=>v-C.camera.eye[k]);
 const cosine=aim.reduce((s,v,k)=>s+v*toBin[k],0)/Math.hypot(...aim)/Math.hypot(...toBin);assert.ok(cosine>Math.cos(C.camera.fieldOfViewDegrees*Math.PI/360));
});
test('compiled props preserve exact placement, real bin collision, failed-pack safety and the protected walking strip',()=>{
 FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
 PROPS.setColliderGroupEnabled('exterior-infrastructure',true);
 const instances=PROPS.renderInstances({group:'ground',inscriptions:false});
 for(const spec of [C.camera,C.extract,C.bins,...C.rainwater]){const p=instances.find(p=>p.id===spec.id);assert.ok(p,spec.id);const target=C.rainwater.includes(spec)?spec.origin:pubPhysicalAt(spec.origin);near(p.x,target.x);near(p.z,target.z);}
 const body=(x,z)=>{const p=FP.logicalAtPhysical(x/.5-.5,z/.5-.5,{group:'ground',floor:0});assert.ok(p,`${x},${z} is supported`);return p;},bin=body(pubPhysicalAt(C.bins.origin).x,pubPhysicalAt(C.bins.origin).z);
 PROPS.setColliderGroupEnabled('exterior-infrastructure',false);assert.equal(PROPS.propCanOccupy(bin.x,bin.y),true);assert.equal(PROPS.tallBlockingPropAt(bin.x,bin.y),false);
 PROPS.setColliderGroupEnabled('exterior-infrastructure',true);assert.equal(PROPS.propCanOccupy(bin.x,bin.y),false);assert.equal(PROPS.tallBlockingPropAt(bin.x,bin.y),true);
 PROPS.setColliderGroupEnabled('exterior-infrastructure',false);
 const route=[];for(let z=27.5;z<=38.5;z+=.5){const p=body(30,z);if(!FP.isSolid(p.x,p.y)&&PROPS.propCanOccupy(p.x,p.y))route.push({p,z});}
 assert.ok(route.length>=10,'an existing stretch of clear west approach must remain');PROPS.setColliderGroupEnabled('exterior-infrastructure',true);
 for(const {p,z}of route)assert.equal(PROPS.propCanOccupy(p.x,p.y),true,`new bins block the retained route at ${z}`);
 PROPS.setColliderGroupEnabled('exterior-infrastructure',false);
});
