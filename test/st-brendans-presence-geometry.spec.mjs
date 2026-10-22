import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readAccessor} from '../tools/chunk_surfer/build-st-brendans-treatment.mjs';
import {buildStBrendansPresences} from '../tools/chunk_surfer/build-st-brendans-presences.mjs';
import {createStBrendansPresenceGeometry,ST_BRENDANS_PRESENCE_POSES as poses,ST_BRENDANS_PRESENCE_LIMITS as limits,ST_BRENDANS_PRESENCE_SEAT_TOP} from '../tools/chunk_surfer/st-brendans-presence-geometry.mjs';
import {createStBrendansTreatmentGeometry} from '../tools/chunk_surfer/st-brendans-treatment-geometry.mjs';
import {ST_BRENDANS_PRESENCE_BOUNDS as deliveredBounds} from '../src/data/generated/st-brendans-presence-geometry.js';
const bytes=fs.readFileSync(new URL('../public/assets/st-brendans-presences.glb',import.meta.url)),pack=parseGlb(bytes),source=createStBrendansPresenceGeometry();
test('four held silhouettes form a compact deterministic ordinary-prop pack',()=>{
 const built=buildStBrendansPresences();assert.equal(Buffer.compare(bytes,built.bytes),0);assert.ok(bytes.length<=limits.bytes);assert.ok(built.stats.triangles<=limits.triangles);assert.equal(pack.json.meshes.length,4);assert.equal(pack.json.nodes.length,4);
 assert.deepEqual(pack.json.meshes.map(m=>m.name),['brendan_presence_waiting','brendan_presence_braced','brendan_presence_seated','brendan_presence_upward']);
 for(const key of['images','textures','skins','animations','extensionsRequired'])assert.equal(pack.json[key],undefined);
 assert.ok(pack.json.nodes.every(n=>!n.translation&&!n.rotation&&!n.scale&&!n.matrix&&!n.children));
 assert.equal(pack.json.materials.length,1);const material=pack.json.materials[0];assert.equal(material.emissiveFactor,undefined);assert.equal(material.alphaMode,undefined);assert.equal(material.doubleSided,undefined);assert.ok(material.pbrMetallicRoughness.baseColorFactor.slice(0,3).every(v=>v<.04));assert.ok(material.pbrMetallicRoughness.roughnessFactor>.9);
});
test('all delivered vertices, normals, triangle winding and indices are valid',()=>{
 for(const mesh of pack.json.meshes){assert.equal(mesh.primitives.length,1);const p=mesh.primitives[0],v=readAccessor(pack,p.attributes.POSITION),n=readAccessor(pack,p.attributes.NORMAL),ids=readAccessor(pack,p.indices);assert.equal(p.mode,4);assert.equal(p.material,0);assert.ok(v.every(Number.isFinite));assert.ok(n.every(Number.isFinite));assert.ok(ids.every(i=>i>=0&&i<v.length/3));assert.equal(ids.length%3,0);
  for(let i=0;i<n.length;i+=3)assert.ok(Math.abs(Math.hypot(...n.slice(i,i+3))-1)<1e-5);
  for(let i=0;i<ids.length;i+=3){const points=ids.slice(i,i+3).map(id=>v.slice(id*3,id*3+3)),a=points[1].map((q,k)=>q-points[0][k]),b=points[2].map((q,k)=>q-points[0][k]),face=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...face);assert.ok(length>1e-11);for(const id of ids.slice(i,i+3)){const nn=n.slice(id*3,id*3+3);assert.ok(face.reduce((s,v,k)=>s+v*nn[k],0)/length>0,'normal faces out of actual rendered triangle');}}
 }
});
test('every pose has two genuine floor contacts, no negative feet and exact generated bounds',()=>{
 const expectedHeights={waiting:[1.80,1.86],braced:[1.65,1.72],seated:[1.38,1.45],upward:[1.84,1.90]};
 for(const mesh of pack.json.meshes){const p=mesh.primitives[0],a=pack.json.accessors[p.attributes.POSITION],v=readAccessor(pack,p.attributes.POSITION),kind=mesh.name.replace('brendan_presence_','');assert.equal(a.min[1],0);assert.deepEqual({min:a.min,max:a.max},deliveredBounds[mesh.name]);assert.ok(a.max[1]>=expectedHeights[kind][0]&&a.max[1]<=expectedHeights[kind][1]);
  const floor=[];for(let i=0;i<v.length;i+=3)if(v[i+1]===0)floor.push(v.slice(i,i+3));assert.ok(floor.some(p=>p[0]<-.08));assert.ok(floor.some(p=>p[0]>.08));
  assert.ok(a.max[0]-a.min[0]<1.05);assert.ok(a.max[2]-a.min[2]<1.0);
 }
});
test('held poses preserve differentiated human loads, bent knees, wrists and anonymous necks',()=>{
 for(const pose of Object.values(poses)){assert.equal(pose.shoulders.length,2);assert.equal(pose.elbows.length,2);assert.equal(pose.wrists.length,2);assert.equal(pose.knees.length,2);assert.ok(pose.neck[1]<pose.head[1]);assert.ok(pose.shoulders[0][1]!==pose.shoulders[1][1],'uneven shoulder load');assert.notDeepEqual(pose.knees[0].slice(1),pose.knees[1].slice(1),'uneven knee posture');}
 assert.ok(poses.braced.wrists.every(w=>w[1]>=1&&w[1]<=1.4));assert.ok(poses.braced.wrists.every(w=>w[2]<-.45),'hands meet the work ahead, not a prayer pose');
 assert.ok(poses.upward.head[2]>poses.upward.neck[2]);assert.ok(poses.upward.headTilt>.4,'head inclines into overhead machinery');
 assert.ok(poses.seated.knees.every(k=>k[2]<-.35));assert.ok(poses.seated.head[2]<poses.seated.pelvis[2]-.3,'exhausted head folds toward knees');
 assert.equal(source.size,4);
});
test('seated pelvis rests on the actual dedicated pew seat rather than floating above it',()=>{
 const pew=createStBrendansTreatmentGeometry().get('brendan_pew').get('oak'),seatTops=[];for(let i=0;i<pew.positions.length;i+=3){const[x,y,z]=pew.positions.slice(i,i+3),ny=pew.normals[i+1];if(Math.abs(x)<1.24&&z<.25&&y>.45&&y<.55&&ny>.9)seatTops.push(y)}
 assert.ok(seatTops.length>0);const actualTop=Math.max(...seatTops);assert.equal(actualTop,ST_BRENDANS_PRESENCE_SEAT_TOP);assert.ok(Math.abs(poses.seated.pelvis[1]-poses.seated.pelvisRadii[1]-actualTop)<1e-12);
 assert.ok(poses.seated.ankles.every(p=>p[1]===.105),'the same feet remain on the room floor');
});
