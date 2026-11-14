import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {subtractTriangleBox} from '../tools/chunk_surfer/exterior-stationers-geometry.mjs';
import {ELLERY_APPROACH_AIR} from '../src/data/ellery-garden-approaches.js';
import {segmentHitsTriangle} from './helpers/packed-prop-mesh.mjs';
import {ELLERY_GARDEN_COLLISION_GEOMETRY,ELLERY_GARDEN_COLLISION_SOURCE} from '../src/data/generated/ellery-garden-collision.js';
import {parseGlb,meshFingerprint} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {HALL_STAGE_SERVICE_STAIR as S,hallServiceTreadHeight} from '../src/data/atrium-circulation.js';
const io=new NodeIO(),doc=await io.read(new URL('../public/assets/ellery-garden-approaches.glb',import.meta.url).pathname),meshes=new Map(doc.getRoot().listMeshes().map(m=>[m.getName(),m]));
const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/ellery-garden-approaches.stats.json',import.meta.url)));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function triangles(m,anchor={x:0,z:0}){
 const out=[];for(const p of m.listPrimitives()){
  const a=p.getAttribute('POSITION'),uv=p.getAttribute('TEXCOORD_0'),normal=p.getAttribute('NORMAL'),indices=p.getIndices().getArray();
  for(let i=0;i<indices.length;i+=3)out.push({material:p.getMaterial().getName(),v:Array.from(indices.slice(i,i+3),j=>{const v=a.getElement(j,[]);return{position:[v[0]+anchor.x,v[1],v[2]+anchor.z],normal:normal.getElement(j,[]),uv:uv.getElement(j,[])};})});
 }return out;
}
const area=t=>{const[a,b,c]=t.map(v=>v.position),u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])*.5;};
const key=t=>JSON.stringify({material:t.material,vertices:t.v.map(v=>[...v.position,...v.uv])});
test('private pack is bounded and retains read-only source provenance',()=>{
 assert.equal(meshes.size,8);assert.ok(stats.addedTriangles<=6500);assert.ok(stats.bytes<12*1024*1024);assert.equal(stats.protectedSourcePacksUnchangedDuringBuild,true);
 for(const[f,record]of Object.entries(stats.sourcePacks))assert.equal(sha(fs.readFileSync(new URL('../'+f,import.meta.url))),record.sha256,'copied source pack remains untouched '+f);
});
test('actual copied rooms have zero triangle area in approved public air',()=>{
 for(const name of['ellery_garden_elevation','ellery_garden_dock','ellery_garden_hall','ellery_garden_getin_sightline']){
  const r=stats.meshes[name],ts=triangles(meshes.get(name),r.anchor);let removedArea=0;
  for(const t of ts)for(const box of r.worldClips){const inner={min:box.min.map(v=>v+.0001),max:box.max.map(v=>v-.0001)};const kept=subtractTriangleBox(t.v,inner).triangles;removedArea+=Math.max(0,area(t.v)-kept.reduce((s,t)=>s+area(t),0));}
  assert.ok(removedArea<1e-6,name+' does not retain hidden submitted faces in the public route: '+removedArea);
 }
});
test('private exterior collision fingerprints the actual clipped final hero',()=>{
 const bytes=fs.readFileSync(new URL('../public/assets/ellery-garden-approaches.glb',import.meta.url)),pack=parseGlb(bytes),name='ellery_garden_elevation';
 assert.equal(ELLERY_GARDEN_COLLISION_SOURCE.sha256,sha(bytes));
 assert.equal(ELLERY_GARDEN_COLLISION_GEOMETRY[name].sha256,meshFingerprint(pack,pack.json.meshes.find(m=>m.name===name)));
 assert.ok(ELLERY_GARDEN_COLLISION_GEOMETRY[name].walls.length>0);
});
test('perforated roof preserves every original triangle and UV',async()=>{
 const src=await io.read(new URL('../public/assets/conservatory-props.glb',import.meta.url).pathname);
 for(const[from,to]of[['natatorium_roof_structure','ellery_baths_roof']]){
  const original=src.getRoot().listMeshes().find(m=>m.getName()===from);
  assert.deepEqual(triangles(meshes.get(to)).map(key),triangles(original).map(key),'unchanged actual geometry '+from);
 }
});
test('bespoke service landing and all eight treads match real footing and avoid the downstage stair bay',()=>{
 assert.deepEqual([S.at.x,S.at.y],[102,9]);assert.deepEqual([S.landing.x,S.landing.y,S.landing.width,S.landing.depth],[102,8,1,4]);assert.deepEqual([S.from.x,S.from.y,S.treads,S.going],[103,8,8,.5]);
 const ts=triangles(meshes.get('ellery_garden_steps'),{x:S.at.x,z:S.at.y});
 const support=(x,z,maxY)=>{let top=-Infinity;for(const t of ts){const[a,b,c]=t.v.map(v=>v.position);if(Math.max(a[1],b[1],c[1])-Math.min(a[1],b[1],c[1])>1e-6||a[1]>maxY)continue;const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)top=Math.max(top,a[1]);}return top;};
 for(const x of[102.25,102.5,102.75])for(const z of[8.25,9.75,11.5])assert.ok(Math.abs(support(x,z,.01))<1e-6,'the entire turning landing supports the body');
 for(let i=0;i<S.treads;i++)for(const z of[8.25,8.75,9.25])assert.ok(Math.abs(support(103+(i+.5)*.5,z,hallServiceTreadHeight(i)+.01)-hallServiceTreadHeight(i))<1e-6,'actual tread support '+i);
 const bay={min:[106,-2,10],max:[108,2,11]};let intrudingArea=0;
 for(const t of ts)intrudingArea+=Math.max(0,area(t.v)-subtractTriangleBox(t.v,bay).triangles.reduce((n,q)=>n+area(q),0));
 assert.ok(intrudingArea<1e-6,'no stair or guard geometry enters the existing downstage step bay');
 for(const y of[.25,.7,1.58]){
  assert.equal(ts.some(t=>segmentHitsTriangle([101.8,y,11.5],[102.5,y,11.5],t.v.map(v=>v.position))),false,'west service leaf opens onto a clear landing');
  assert.equal(ts.some(t=>segmentHitsTriangle([102.5,y,11.5],[102.5,y,8.75],t.v.map(v=>v.position))),false,'the landing permits the full turn toward descent');
 }
});
test('the complete maintenance ledge moves with its collider instead of being truncated',async()=>{
 const src=await io.read(new URL('../public/assets/conservatory-props.glb',import.meta.url).pathname),old=triangles(src.getRoot().listMeshes().find(m=>m.getName()==='scene_dock_room_fabric'),{x:53,z:7.5});
 const ledge=old.filter(t=>t.v.every(v=>{const[x,y,z]=v.position;return x>=69.69&&x<=71.91&&y>=-.001&&y<=.831&&z>=3.93&&z<=4.58;}));
 assert.equal(ledge.length,72);
 const actual=new Set(triangles(meshes.get('ellery_garden_dock'),{x:53,z:7.5}).map(key));
 for(const t of ledge){const moved={...t,v:t.v.map(v=>({...v,position:[v.position[0]-2,v.position[1],v.position[2]]}))};assert.ok(actual.has(key(moved)),'every old ledge triangle survives the exact two-metre relocation');}
});
test('built wall apertures and both ordinary body bands are physically open',()=>{
 const ts=triangles(meshes.get('ellery_garden_built_edges'),{x:72,z:2});
 for(const[x,z]of[[70.5,13.5],[101.5,11.5]])for(const y of[.2,1.58,2.9])assert.equal(ts.some(t=>segmentHitsTriangle([x-.8,y,z],[x+.8,y,z],t.v.map(v=>v.position))),false,'full-depth service aperture has no wall face');
 for(const air of ELLERY_APPROACH_AIR){
  // These bands leave >2.4m clear between parked gates/drains and the atrium;
  // a 40cm body moves along their centre and both ordinary lateral choices.
  for(const x of[air.min[0]+.45,(air.min[0]+air.max[0])/2,air.max[0]-.45])for(const y of[.25,1.58])assert.equal(ts.some(t=>segmentHitsTriangle([x,y,.25],[x,y,air.max[2]-.25],t.v.map(v=>v.position))),false,'no obstacle across the ordinary public approach');
 }
});
test('new roof work leaves the central broken-pane sky volume open',()=>{
 const ts=triangles(meshes.get('ellery_baths_roof_exterior'),{x:83,z:38.5});
 for(const x of[79,81,83,85,87])for(const z of[38.8,40,42])assert.equal(ts.some(t=>segmentHitsTriangle([x,5,z],[x,10,z],t.v.map(v=>v.position))),false,'no invented roof slab at '+x+','+z);
});
