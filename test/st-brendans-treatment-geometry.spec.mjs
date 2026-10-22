import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {buildStBrendansTreatment,readAccessor,expandedPrimitive,removeOldFrameCrossmembers} from '../tools/chunk_surfer/build-st-brendans-treatment.mjs';
import {createStBrendansTreatmentGeometry,BRENDAN_MATERIALS,bounds} from '../tools/chunk_surfer/st-brendans-treatment-geometry.mjs';
import {ST_BRENDANS_TREATMENT_BUDGET as budget,ST_BRENDANS_TREATMENT_MESH_NAMES as names,stBrendansTreatmentMesh,ST_BRENDANS_EMBRASURES} from '../src/data/st-brendans-treatment.js';
import {ELLERY_BELLS} from '../src/data/bell-tower.js';
import {createTwoTierBellFrameLayout} from '../src/data/bell-tower-layout.js';
const file=new URL('../public/assets/st-brendans-treatment.glb',import.meta.url),bytes=fs.readFileSync(file),pack=parseGlb(bytes),sourceBytes=fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)),source=parseGlb(sourceBytes),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/st-brendans-treatment.stats.json',import.meta.url))),built=createStBrendansTreatmentGeometry();
const sha=values=>crypto.createHash('sha256').update(Buffer.from(new Float32Array(values).buffer)).digest('hex');
function mesh(name){const m=pack.json.meshes.find(m=>m.name===name);assert.ok(m,name);return m}
function triangles(name,material=null){return mesh(name).primitives.filter(p=>!material||pack.json.materials[p.material].extras.brendanRole===material).flatMap(p=>{const v=readAccessor(pack,p.attributes.POSITION),ids=readAccessor(pack,p.indices);return Array.from({length:ids.length/3},(_,i)=>ids.slice(i*3,i*3+3).map(id=>v.slice(id*3,id*3+3)))})}
function rayTriangle(origin,dir,[a,b,c]){
 const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),e1=sub(b,a),e2=sub(c,a),h=cross(dir,e2),det=dot(e1,h);
 if(Math.abs(det)<1e-9)return null;const f=1/det,s=sub(origin,a),u=f*dot(s,h);if(u<0||u>1)return null;const q=cross(s,e1),v=f*dot(dir,q);if(v<0||u+v>1)return null;const t=f*dot(e2,q);return t>1e-7?t:null;
}
test('dedicated GLB is deterministic, compact, finite and renderer-compatible',()=>{
 assert.equal(Buffer.compare(bytes,buildStBrendansTreatment(sourceBytes).bytes),0);
 assert.ok(bytes.length<=budget.bytes);assert.ok(stats.packedTriangles<=budget.triangles);
 assert.deepEqual(pack.json.meshes.map(m=>m.name).sort(),[...names].sort());
 assert.equal(pack.json.images,undefined);assert.equal(pack.json.animations,undefined);assert.equal(pack.json.skins,undefined);
 assert.ok(pack.json.nodes.every(n=>!n.translation&&!n.matrix&&!n.children));
 for(const m of pack.json.meshes)for(const p of m.primitives){assert.equal(p.mode,4);const v=readAccessor(pack,p.attributes.POSITION),n=readAccessor(pack,p.attributes.NORMAL),ids=readAccessor(pack,p.indices);assert.ok(v.every(Number.isFinite));assert.ok(n.every(Number.isFinite));assert.ok(ids.every(i=>i>=0&&i<v.length/3));assert.equal(ids.length%3,0);}
 assert.ok(stats.uniquePrimitiveTriangles<stats.packedTriangles-20000,'identical small apparatus share accessors');
});
test('all original circulation triangles and normals survive with only48 accounted apparatus triangles removed',()=>{
 const original=source.json.meshes.find(m=>m.name==='st_brendan_church'),replacement=mesh('brendan_church_treated');let removed=0;
 for(let i=0;i<original.primitives.length;i++){
  const p=original.primitives[i],material=source.json.materials[p.material].name;let expected;
  if(material==='dark wood'){
   const g=removeOldFrameCrossmembers({positions:readAccessor(source,p.attributes.POSITION),normals:readAccessor(source,p.attributes.NORMAL),indices:readAccessor(source,p.indices)});removed+=g.removedTriangles;
   expected=g.indices.flatMap(i=>[...g.positions.slice(i*3,i*3+3),...g.normals.slice(i*3,i*3+3)]);
  }else expected=expandedPrimitive(source,p);
  assert.equal(sha(expandedPrimitive(pack,replacement.primitives[i])),sha(expected),`${material}: every retained triangle and normal`);
 }
 assert.equal(removed,48);assert.equal(stats.basePrimitiveHashes.reduce((s,p)=>s+p.removedApparatusTriangles,0),48);
});
test('real bell cavity has an open mouth and measurable cast soundbow thickness',()=>{
 for(let id=1;id<=8;id++){
  const ts=triangles(`brendan_bell_0${id}`,'bronze');
  const upward=ts.map(t=>rayTriangle([.002,-1.3,.001],[0,1,0],t)).filter(Number.isFinite).sort((a,b)=>a-b);
  assert.ok(upward[0]>.9,'centre ray reaches the inner crown, not a solid lip cap');
  const radial=ts.map(t=>rayTriangle([0,-.98,.001],[1,0,0],t)).filter(Number.isFinite).sort((a,b)=>a-b);
  assert.ok(radial.length>=2);assert.ok(radial.at(-1)-radial[0]>.025,'inside and outside are distinct physical surfaces');
  const b=stats.meshes[`brendan_bell_0${id}`].bounds;assert.equal(b.min[1],Math.fround(-1.055));assert.ok(b.max[1]<.16);
 }
});
test('moving bells keep the original pivots and named parts, shared tower instances stay unchanged',()=>{
 for(const part of['bell','wheel','clapper','stay','slider'])for(let i=1;i<=8;i++)assert.equal(stBrendansTreatmentMesh({id:`brendan-${part}-${i}`,mesh:`tower_${part}_0${i}`}),`brendan_${part}_0${i}`);
 assert.equal(stBrendansTreatmentMesh({id:'brendan-fallen-bell',mesh:'tower_bell_08'}),'brendan_bell_08');
 assert.equal(stBrendansTreatmentMesh({id:'ending-peal-bell-1',mesh:'tower_bell_01'}),'tower_bell_01');
 assert.equal(stBrendansTreatmentMesh({id:'chapel-pew-1',mesh:'pew'}),'pew');
 const wheel=built.get('brendan_wheel_01');assert.deepEqual(bounds({positions:[...wheel.values()].flatMap(g=>g.positions)}).min.slice(0,2),[-1.07,-1.07]);
 const low=stats.meshes.brendan_clapper_01.bounds;assert.ok(Math.abs(low.min[1]+1.01)<1e-6);assert.ok(low.max[1]<.085);
});
test('every bearing bore clears the exact moving Z gudgeon axis and its round shaft',()=>{
 const parts=built.get('brendan_church_treated'),ts=['iron','ironWear'].flatMap(material=>{const g=parts.get(material);return Array.from({length:g.indices.length/3},(_,i)=>g.indices.slice(i*3,i*3+3).map(k=>g.positions.slice(k*3,k*3+3)))});
 for(const bell of createTwoTierBellFrameLayout(ELLERY_BELLS,{centerX:16,centerZ:73,lowerFloorY:10.2,upperPivotY:14.4}))for(const side of[-1,1]){
  const s=bell.visualScale,c=[bell.pivot.x-16,bell.pivot.y,bell.pivot.z-70+side*.56*s];
  for(const [dx,dy]of[[0,0],[.045*s,0],[-.045*s,0],[0,.045*s],[0,-.045*s]]){
   const hits=ts.map(t=>rayTriangle([c[0]+dx,c[1]+dy,c[2]-.07*s],[0,0,1],t)).filter(t=>Number.isFinite(t)&&t<.14*s);
   assert.equal(hits.length,0,`bell${bell.id} gudgeon${side}: casting/bolts do not seal the bearing bore`);
  }
 }
 for(let id=1;id<=8;id++){
  const hits=triangles(`brendan_bell_0${id}`,'ironWear').map(t=>rayTriangle([0,0,-.8],[0,0,1],t)).filter(Number.isFinite).sort((a,b)=>a-b);
  assert.ok(Math.abs(hits[0]-.16)<1e-6,'round shaft runs on the unchanged local-Z roll axis');
 }
});
test('screen is actually pierced, maintains a broad central passage and damage is a single fallen wing',()=>{
 const ts=triangles('brendan_pulpitum'),origin=[0,1.2,-1],dir=[0,0,1];assert.equal(ts.map(t=>rayTriangle(origin,dir,t)).filter(Number.isFinite).length,0);
 assert.equal(ts.map(t=>rayTriangle([-2.9,1.2,-1],dir,t)).filter(Number.isFinite).length,0,'light passes through one tracery bay');
 const b=stats.meshes.brendan_pulpitum_broken.bounds;assert.ok((b.max[0]-b.min[0])*.5<2.5,'existing sx=.5 yields one wing, not another whole screen');
 assert.ok(b.max[0]<2.5&&b.min[0]>-2.5,'broken geometry is centred on its new pivot');
});
test('new construction does not cap the hatch or add walking obstacles in belfry perimeter',()=>{
 const added=built.get('brendan_church_treated');for(const g of added.values())for(let i=0;i<g.positions.length;i+=3){
  const[x,y,z]=g.positions.slice(i,i+3),wx=x+16,wz=z+70;
  if(y>10.2&&y<11.9)assert.ok(wx>=13.6&&wx<=18.4&&wz>=71.0&&wz<=75.0,'all low belfry apparatus stays within the guarded pit');
  assert.ok(!(wx>16&&wx<17&&wz>73&&wz<74&&Math.abs(y-10.2)<.05),'no new deck occupies hatch');
 }
});
test('deep closed window splays have interior depth and a restrained dedicated opaque palette',()=>{
 assert.equal(ST_BRENDANS_EMBRASURES.length,5);assert.ok(ST_BRENDANS_EMBRASURES.every(e=>e.depth>=.4));
 assert.ok(pack.json.materials.every(m=>m.name.startsWith('Brendan ')&&m.extras.studyLocalFinish));
 for(const m of pack.json.materials){assert.ok(m.pbrMetallicRoughness.roughnessFactor>=.37);assert.equal(m.alphaMode,undefined);assert.equal(m.doubleSided,undefined);assert.equal(m.pbrMetallicRoughness.baseColorTexture,undefined);}
 assert.ok(BRENDAN_MATERIALS.iron.color[0]<.1,'guard iron no longer has painted-steel albedo');
 const glass=triangles('brendan_church_treated','glass');assert.equal(glass.length,10);assert.ok(glass.every(t=>t.every(p=>p[1]>2)));
});
test('furnishings stay within existing footprints and removed objects remain traces',()=>{
 for(const[name,w,d]of[['brendan_pew',2.72,.68],['brendan_choir_stall',2.72,.68],['brendan_altar',1.81,.79],['brendan_font',1.01,1.01],['brendan_tomb',2.11,.87]]){
  const b=stats.meshes[name].bounds;assert.ok(b.max[0]-b.min[0]<=w);assert.ok(b.max[2]-b.min[2]<=d,name);
 }
 assert.ok(mesh('brendan_altar').primitives.some(p=>pack.json.materials[p.material].extras.brendanRole==='absence'));
 const font=triangles('brendan_font');const down=font.map(t=>rayTriangle([.001,1.4,.002],[0,-1,0],t)).filter(Number.isFinite).sort((a,b)=>a-b);assert.ok(down[0]>.3,'dry bowl has a real lowered interior');
});
