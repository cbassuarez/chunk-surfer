import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {EXTERIOR_GRAFFITI_HOSTS} from '../src/data/exterior-graffiti.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';

const assetBytes=readFileSync(new URL('../public/assets/exterior-graffiti.glb',import.meta.url));
const stats=JSON.parse(readFileSync(new URL('../public/assets/exterior-graffiti.stats.json',import.meta.url)));
const paint=parseGlb(assetBytes),building=parseGlb(readFileSync(new URL('../public/assets/exterior-frontages.glb',import.meta.url)));
const stationers=parseGlb(readFileSync(new URL('../public/assets/exterior-stationers.glb',import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const components={SCALAR:1,VEC2:2,VEC3:3};
function data(asset,index){
 const a=asset.json.accessors[index],v=asset.json.bufferViews[a.bufferView],n=components[a.type];
 const size=a.componentType===5123?2:4,start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;
 return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>{
  const p=start+i*stride+k*size;return a.componentType===5126?asset.bin.readFloatLE(p):a.componentType===5123?asset.bin.readUInt16LE(p):asset.bin.readUInt32LE(p);
 }));
}
function triangles(asset,mesh){
 return mesh.primitives.flatMap(p=>{const positions=data(asset,p.attributes.POSITION),indices=data(asset,p.indices).map(v=>v[0]);
  return Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3).map(j=>positions[j]));});
}
// Intersect the actual front triangles along X, without relying on authored
// bounding boxes or assuming a shutter is one plane instead of twelve leaves.
function hitX([a,b,c],y,z){
 const dy1=b[1]-a[1],dz1=b[2]-a[2],dy2=c[1]-a[1],dz2=c[2]-a[2];
 const den=dy1*dz2-dz1*dy2;if(Math.abs(den)<1e-10)return null;
 const u=((y-a[1])*dz2-(z-a[2])*dy2)/den,v=(dy1*(z-a[2])-dz1*(y-a[1]))/den;
 return u>=-1e-5&&v>=-1e-5&&u+v<=1+1e-5?a[0]+u*(b[0]-a[0])+v*(c[0]-a[0]):null;
}

test('each visible outdoor overlay follows its actual nonblocking host pose',()=>{
 for(const config of EXTERIOR_GRAFFITI_HOSTS){
  const host=CONSERVATORY_PROPS.find(p=>p.id===config.host),mark=CONSERVATORY_PROPS.find(p=>p.id===config.id);
  assert.ok(host&&mark,config.host);
  for(const key of ['x','y','yaw','scale','scaleX','scaleY','scaleZ','renderOffsetX','renderOffsetY','renderOffsetZ','worldAligned','floorOverride'])
   assert.equal(mark[key],host[key],`${config.id} ${key}`);
  assert.equal(mark.blocks,false);assert.equal(mark.interactive,false);assert.equal(PROP_MESH[mark.mesh].blocks,false);
  assert.ok(paint.json.meshes.some(m=>m.name===config.mesh));
 }
 assert.equal(sha(assetBytes),stats.sha256);
});

test('production props initialization retains every outdoor overlay at its exact support pose',()=>{
 FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
  connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
 PROPS.propsInit(FP);
 const rendered=PROPS.renderInstances({group:'ground',inscriptions:false});
 for(const cfg of EXTERIOR_GRAFFITI_HOSTS){
  const host=rendered.find(p=>p.id===cfg.host),mark=rendered.find(p=>p.id===cfg.id);
  assert.ok(host,`${cfg.host} reached production`);assert.ok(mark,`${cfg.id} reached production`);
  for(const key of ['x','y','z','yaw','scale','scaleX','scaleY','scaleZ','zone'])assert.equal(mark[key],host[key],`${cfg.id} ${key}`);
 }
});

test('original CC0 artwork and the two credited narrative tags retain transparent mask materials',()=>{
 const original=JSON.parse(readFileSync(new URL('../assets/source-graffiti/unikumpu/manifest.json',import.meta.url)));
 const narrative=JSON.parse(readFileSync(new URL('../assets/source-graffiti/easter-eggs/manifest.json',import.meta.url)));
 for(const image of paint.json.images){
  const v=paint.json.bufferViews[image.bufferView],embedded=paint.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
  const source=stats.sources.find(s=>s.filename===image.name);assert.ok(source,image.name);assert.equal(sha(embedded),source.sha256);
  if(source.artist==='unikumpu')assert.equal(original.files.find(f=>f.filename===image.name).sha256,source.sha256);
  else assert.equal(narrative.outputs.find(f=>f.file===image.name).sha256,source.sha256);
 }
 for(const material of paint.json.materials){assert.equal(material.alphaMode,'MASK');assert.ok(material.alphaCutoff>0);assert.equal(material.emissiveFactor,undefined);}
 const labels=Object.values(stats.marks).flat().filter(m=>m.art==='ELLERY'||m.art==='SURFER');
 assert.deepEqual(labels.map(m=>m.art).sort(),['ELLERY','SURFER']);
});

test('actual paint faces face the player and are supported by the current façade and shutter leaves',()=>{
 for(const cfg of EXTERIOR_GRAFFITI_HOSTS){
  const host=CONSERVATORY_PROPS.find(p=>p.id===cfg.host);
  const pack=host.mesh==='ellery_square_west_terrace_stationer'?stationers:building;
  const wall=pack.json.meshes.find(m=>m.name===host.mesh);
  assert.ok(wall,`current asset has ${host.mesh}`);
  const support=triangles(pack,wall),mesh=paint.json.meshes.find(m=>m.name===cfg.mesh);
  for(const primitive of mesh.primitives){
   const vertices=data(paint,primitive.attributes.POSITION),normals=data(paint,primitive.attributes.NORMAL),indices=data(paint,primitive.indices).map(v=>v[0]);
   for(let i=0;i<indices.length;i+=6){
    const picks=[...new Set(indices.slice(i,i+6))],pts=picks.map(n=>vertices[n]);assert.equal(pts.length,4);
    const [a,b,c]=indices.slice(i,i+3).map(n=>vertices[n]);
    const crossX=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
    const normal=normals[indices[i]][0];assert.ok(crossX*normal>0,`${cfg.id} inward-facing winding`);
    const center=pts.reduce((sum,p)=>sum.map((v,k)=>v+p[k]/4),[0,0,0]);
    const hits=support.map(t=>hitX(t,center[1],center[2])).filter(x=>x!==null&&normal*(center[0]-x)>=-.001)
     .map(x=>normal*(center[0]-x));
    assert.ok(hits.length&&Math.min(...hits)<.012,`${cfg.id} has no nearby actual support at ${center}`);
   }
  }
 }
});

test('all artwork avoids real door jambs, windows and shutter notices',()=>{
 for(const cfg of EXTERIOR_GRAFFITI_HOSTS)for(const m of stats.marks[cfg.id]){
  if(cfg.kind==='court'){
   const doors=m.side===-1?[2.5,6.7,10.9]:[13.5,9.3,5.1];
   for(const z of doors)assert.ok(m.z1<z-.64||m.z0>z+.64,`${cfg.id} door`);
   assert.ok(m.bottom>.60&&m.top<2.75);
  }else if(cfg.kind==='workshop'){
   const deed=Math.round((m.z+28)/8),center=-28+deed*8;
   assert.ok([0,2,6].includes(deed));assert.ok(m.z0>=center-2.31&&m.z1<=center+2.31);
   assert.ok(m.slices>1,'art follows individual shutter leaves');
  }else{
   const first=cfg.kind==='square'?(cfg.host==='ellery-square-north'?-36:-16):-28;
   const deed=Math.round((m.z-first)/8),center=first+deed*8;
   assert.ok(m.z0>center&&m.z1<center+1.395,`${cfg.id} clears sash frames`);
   assert.ok((m.bottom>.88&&m.top<1.54)||(m.bottom>1.58&&m.top<2.24),`${cfg.id} clears the rustication`);
  }
 }
});
