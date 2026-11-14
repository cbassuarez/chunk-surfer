import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {BOX_OFFICE_HATCH as H,BOX_OFFICE_DESK as D,BOX_OFFICE_BOUNDS,BOX_OFFICE_SURFACES} from '../src/data/box-office.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {PROP_BOUNDS,MESH_SURFACE} from '../src/data/generated/prop-geometry.js';
import * as FP from '../src/world/floorplan.js';
import {conservatory as C} from '../src/data/floorplan/conservatory.js';
import * as P from '../src/game/props.js';
import {packedPropMeshes,placedMesh,segmentHitsTriangle} from './helpers/packed-prop-mesh.mjs';
const doc=await new NodeIO().read(new URL('../public/assets/box-office.glb',import.meta.url).pathname);
const privateMeshes=new Map(doc.getRoot().listMeshes().map(m=>[m.getName(),m]));
function packed(name){
 const m=privateMeshes.get(name);if(!m)return shared.mesh(name);const vertices=[],triangles=[],opaqueTriangles=[];
 for(const p of m.listPrimitives()){
  const positions=p.getAttribute('POSITION'),v=Array.from({length:positions.getCount()},(_,i)=>positions.getElement(i,[])),indices=Array.from(p.getIndices().getArray());vertices.push(...v);
  for(let i=0;i<indices.length;i+=3){const t=indices.slice(i,i+3).map(n=>v[n]);triangles.push(t);if(p.getMaterial().getAlphaMode()!=='MASK')opaqueTriangles.push(t);}
 }
 return{vertices,triangles,opaqueTriangles};
}
const shared=packedPropMeshes();
FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});
P.propsInit(FP,CONSERVATORY_PROPS,{bounds:{...PROP_BOUNDS,...BOX_OFFICE_BOUNDS},surfaces:{...MESH_SURFACE,...BOX_OFFICE_SURFACES}});
const byId=new Map(P.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
const model=id=>{const p=byId.get(id);assert.ok(p,'retained actual prop '+id);return placedMesh(p,packed(p.mesh));};
function support(mesh,x,z,maxY){
 let y=-Infinity;for(const[a,b,c]of mesh.triangles){
  if(Math.max(a[1],b[1],c[1])-Math.min(a[1],b[1],c[1])>1e-6||a[1]>maxY+1e-6)continue;
  const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)continue;
  const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
  if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6)y=Math.max(y,a[1]);
 }return y;
}
test('private delivered geometry fits its exact contact bounds and budgets',()=>{
 const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/box-office.stats.json',import.meta.url)));
 assert.deepEqual([...privateMeshes.keys()].sort(),Object.keys(BOX_OFFICE_BOUNDS).sort());
 for(const[name,b]of Object.entries(BOX_OFFICE_BOUNDS)){
  const m=placedMesh({x:0,y:0,z:0,yaw:0},packed(name));for(let i=0;i<3;i++){assert.ok(Math.abs(m.bounds.min[i]-b.min[i])<1e-6,name+' exact min');assert.ok(Math.abs(m.bounds.max[i]-b.max[i])<1e-6,name+' exact max');}
 }
 assert.ok(stats.totalTriangles<=6500);assert.ok(stats.bytes<2*1024*1024);assert.ok(stats.textures.glass.coverage<.04);assert.equal(stats.protectedAssetsUnchangedDuringBuild,true);
});
test('adult worktop and actual chair have credible separation and a real knee well',()=>{
 const desk=model('box-office-desk'),chair=model('box-office-chair'),top=support(desk,93.5,9,1);
 assert.ok(Math.abs(top-.76)<1e-6);assert.ok(top-.4975>.25&&top-.4975<.28);assert.ok(chair.bounds.min[2]-desk.bounds.max[2]>.10);
 const k=D.kneeWell;
 for(const tri of packed(D.mesh).triangles){
  const min=[0,1,2].map(i=>Math.min(...tri.map(v=>v[i]))),max=[0,1,2].map(i=>Math.max(...tri.map(v=>v[i])));
  assert.ok(min[0]>=k.x1||max[0]<=k.x0||min[1]>=k.y1||max[1]<=k.y0||min[2]>=k.z1||max[2]<=k.z0,'no packed face intrudes into the promised knee well');
 }
});
test('all paper, terminal and tray corners have actual horizontal support',()=>{
 for(const[host,ids]of [['box-office-counter',['box-office-program-stack','box-office-cash-terminal','box-office-unsold-roll']],['box-office-desk',['box-office-rota','box-office-till-slip','box-office-returns-tray']]]){
  const h=model(host);for(const id of ids){const m=model(id);for(const x of[m.bounds.min[0],m.bounds.max[0]])for(const z of[m.bounds.min[2],m.bounds.max[2]])assert.ok(Math.abs(support(h,x,z,m.bounds.min[1])-m.bounds.min[1])<1e-5,id+' has support under every extremity');}
 }
});
test('fitted public hatch has accountable depth and an actual view into the office',()=>{
 const p=byId.get('box-office-counter');assert.deepEqual([p.x,p.y,p.z],[H.anchor.x,H.anchor.y,H.anchor.z]);assert.equal(p.yaw,H.yaw);
 const mesh=packed(H.mesh);assert.equal(mesh.opaqueTriangles.some(t=>segmentHitsTriangle([.25,1.5,1.0],[.25,1.5,-1.0],t)),false,'a pane bay has no opaque backing');
 const h=model('box-office-counter');assert.ok(h.bounds.min[0]<H.aperture.x0-.3);assert.ok(h.bounds.max[0]>H.aperture.x1+.3);assert.ok(H.aperture.z1-H.aperture.z0>=3);
 for(const id of['box-office-ledger','box-office-key-cabinet','box-office-key-ring-ch04','box-office-key-ring-c17','box-office-key-ring-fohm'])assert.ok(P.propById(id),'private clue identity preserved '+id);
 assert.equal(CONSERVATORY_PROPS.find(p=>p.id==='brendan-visitor-desk').mesh,'box_office_desk','the existing Source/tower desk is not replaced globally');
});
