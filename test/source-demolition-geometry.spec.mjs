import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';import {readAccessor} from '../tools/chunk_surfer/build-st-brendans-treatment.mjs';
import {SOURCE_DEMOLITION_GEOMETRY as G} from '../src/data/generated/source-demolition-geometry.js';import {SOURCE_DEMOLITION_MOTION as M} from '../src/data/generated/source-demolition-motion.js';
import {SOURCE_DEMOLITION as PLAN} from '../src/data/source-demolition.js';
const bytes=fs.readFileSync(new URL('../public/assets/source-demolition.glb',import.meta.url)),pack=parseGlb(bytes),original=parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)));
function triangles(p,m){return m.primitives.flatMap(q=>{const v=readAccessor(p,q.attributes.POSITION),ids=readAccessor(p,q.indices);return Array.from({length:ids.length/3},(_,i)=>ids.slice(i*3,i*3+3).map(id=>v.slice(id*3,id*3+3)))})}
const meshes=new Map(pack.json.meshes.map(m=>[m.name,triangles(pack,m)])),source=triangles(original,original.json.meshes.find(m=>m.name==='conservatory_west_elevation'));
function transform(v,p,q){const[x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return[a+w*tx+y*tz-z*ty+p[0],b+w*ty+z*tx-x*tz+p[1],c+w*tz+x*ty-y*tx+p[2]]}
function at(index){return[...meshes].filter(([name])=>name!==G.darkMesh).flatMap(([name,ts])=>{const t=M.tracks[name];return t?ts.map(p=>p.map(v=>transform(v,t.translations[index],t.rotations[index]))):ts})}
function ray(o,d,[a,b,c]){const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-7)return null;const f=1/det,s=sub(o,a),u=f*dot(s,h);if(u<0||u>1)return null;const q=cross(s,e1),v=f*dot(d,q);if(v<0||u+v>1)return null;const t=f*dot(e2,q);return t>1e-7?t:null}
const nearest=(ts,o,d)=>{let distance=Infinity;for(const t of ts){const v=ray(o,d,t);if(v!==null)distance=Math.min(distance,v)}return distance};
test('bounded CPU-authored pack uses existing materials, finite identity meshes and the small dark cube',()=>{
 assert.ok(bytes.length<=3*1024*1024);assert.ok(pack.json.meshes.length<=62);assert.ok([...meshes.values()].reduce((n,ts)=>n+ts.length,0)<=50000);assert.equal(G.duration,12);assert.equal(G.sampleHz,12);assert.ok(G.parts.length<=60);
 assert.ok(pack.json.nodes.every(n=>!n.translation&&!n.rotation&&!n.scale&&!n.matrix&&!n.children));assert.equal(pack.json.animations,undefined);assert.equal(pack.json.skins,undefined);
 const cube=pack.json.meshes.find(m=>m.name===G.darkMesh);assert.ok(cube);assert.equal(meshes.get(G.darkMesh).length,12);const c=pack.json.accessors[cube.primitives[0].attributes.POSITION];assert.deepEqual(c.min,[-.5,-.5,-.5]);assert.deepEqual(c.max,[.5,.5,.5]);const material=pack.json.materials[cube.primitives[0].material];assert.deepEqual(material.pbrMetallicRoughness.baseColorFactor,[0,0,0,1]);assert.equal(material.emissiveFactor,undefined);
 for(const m of pack.json.meshes)for(const p of m.primitives){const v=readAccessor(pack,p.attributes.POSITION),n=readAccessor(pack,p.attributes.NORMAL),ids=readAccessor(pack,p.indices);assert.ok(v.every(Number.isFinite));assert.ok(n.every(Number.isFinite));assert.ok(ids.every(i=>i>=0&&i<v.length/3));assert.equal(p.mode,4);}
});
test('intact facade keeps original eye-height/frontage intersections and loading-mouth sightline',()=>{
 const assembled=at(0);for(const y of[1.7,7,10,15])for(const z of[-6.5,-5.2,0,3,6,8.4,13.5,17,28,49.2,58.8,75]){
  const a=nearest(source,[-12,y,z],[1,0,0]),b=nearest(assembled,[-12,y,z],[1,0,0]);assert.ok(a===b||Math.abs(a-b)<.00003,`frontage ray y${y},z${z}: ${a} versus${b}`);
 }
 assert.deepEqual(G.originalMouth,{minZ:-4,maxZ:3.6});assert.ok(G.selectedComponentIds===undefined,'selection details remain in build audit, not an invented collision plan');
});
test('sampled baked poses are complete, held before release, finite and normalized',()=>{
 assert.equal(M.times.length,145);assert.equal(M.times[0],0);assert.equal(M.times.at(-1),12);assert.equal(Object.keys(M.tracks).length,G.parts.length);
 for(const part of G.parts){const track=M.tracks[part.mesh];assert.ok(track);assert.equal(track.translations.length,145);assert.equal(track.rotations.length,145);for(let i=0;i<M.times.length;i++){assert.ok(track.translations[i].every(Number.isFinite));assert.ok(track.rotations[i].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...track.rotations[i])-1)<1e-6);if(M.times[i]<=part.startTime){for(let k=0;k<3;k++)assert.ok(Math.abs(track.translations[i][k]-part.pivot[k])<1e-6);assert.deepEqual(track.rotations[i],[0,0,0,1]);}}
 }
});
test('all settled fragments land behind the facade and above their own lowest vertex',()=>{
 for(const part of G.parts){const track=M.tracks[part.mesh],p=track.translations.at(-1),q=track.rotations.at(-1),points=meshes.get(part.mesh).flatMap(t=>t.map(v=>transform(v,p,q))),minX=Math.min(...points.map(v=>v[0])),minY=Math.min(...points.map(v=>v[1]));assert.ok(minX>=2.19,`${part.mesh} leaves road/face, minX${minX}`);assert.ok(minY>=.025&&minY<=.07,`${part.mesh} rests on its lowest vertex rather than floating, minY${minY}`);}
 assert.ok(G.debrisSettledMinX>2.19);
});
test('no moving fragment enters the loading-mouth body corridor during any baked frame',()=>{
 for(const part of G.parts){const track=M.tracks[part.mesh],b=part.localBounds,corners=[];for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])corners.push([x,y,z]);for(let i=0;i<M.times.length;i++){
  const pts=corners.map(v=>transform(v,track.translations[i],track.rotations[i])),min=[0,1,2].map(k=>Math.min(...pts.map(v=>v[k]))),max=[0,1,2].map(k=>Math.max(...pts.map(v=>v[k])));
  assert.ok(max[0]<=-12||min[0]>=1.5||max[1]<=.05||min[1]>=2.0||max[2]<=-3.4||min[2]>=3.0,`${part.mesh} at${M.times[i]} enters the clear body corridor`);
 }}
});
test('a floor-origin panel does not jump to its eventual flat contact height at release',()=>{
 let checked=0;
 for(const part of G.parts){
  if(part.pivot[1]>.05)continue;
  const track=M.tracks[part.mesh],j=Math.ceil((part.startTime+.45)*G.sampleHz),points=meshes.get(part.mesh).flat();
  const required=index=>Math.max(0,.035-Math.min(...points.map(v=>transform(v,[0,0,0],track.rotations[index])[1])));
  const upwardStep=track.translations[j][1]-track.translations[j-1][1];
  assert.ok(upwardStep<=Math.max(0,required(j)-required(j-1))+.012,
   `${part.mesh} rises${upwardStep.toFixed(4)}m before its current rotation demands that support`);
  checked++;
 }
 assert.ok(checked>=6,'exercise the real ground-origin heavy facade panels');
});
test('every baked moving piece respects ground contact and the original early white-walk corridor',()=>{
 for(const part of G.parts){
  const track=M.tracks[part.mesh],points=meshes.get(part.mesh).flat();
  for(let i=0;i<M.times.length;i++)for(const v of points){
   const q=transform(v,track.translations[i],track.rotations[i]);
   assert.ok(q[1]>=-.0001,`${part.mesh} penetrates the support floor at${M.times[i]}`);
   assert.ok(PLAN.across+q[2]>.7,`${part.mesh} crosses the original1.4m white-walk corridor at${M.times[i]}`);
  }
 }
});
test('declared spirit emitters are actual vacated recesses, with opaque back retained',()=>{
 for(const e of G.emitters){const index=Math.ceil(e.availableAt*M.sampleHz),ts=at(index);for(const dy of[-.8,0,.8]){
  const depth=nearest(ts,[-1.2,e.center[1]+dy,e.center[2]],[1,0,0]);assert.ok(depth>=2.99,`${e.id} is clear throughX1.79 at availableAt; firstsurface${depth-1.2}`);assert.ok(depth<3.1,'retained deep wall backs the opening, rather than creating a new room');
 }assert.ok(e.availableAt>0&&e.availableAt<6);assert.equal(e.phase,'infill');assert.deepEqual(e.normal,[-1,0,0]);}
});
