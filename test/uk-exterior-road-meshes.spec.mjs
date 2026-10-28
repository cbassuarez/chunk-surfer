import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const file=process.env.CS_ROAD_MAIN_PACK||new URL('../public/assets/conservatory-props.glb',import.meta.url),bytes=fs.readFileSync(file),size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+size)),bin=bytes.subarray(28+size);
function array(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType],get={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType];return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,j)=>bin[get]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||n*size)+j*size)));}
function components(name){const rows=[],owner=new Map(),mesh=doc.meshes.find(m=>m.name===name);assert.ok(mesh,name);for(const prim of mesh.primitives){const points=array(prim.attributes.POSITION),ix=array(prim.indices).flat();for(let i=0;i<ix.length;i+=3){const t=ix.slice(i,i+3).map(k=>points[k]),hits=[];for(const p of t){const k=p.map(v=>v.toFixed(5)).join(',');if(owner.has(k))hits.push(owner.get(k));}let row=hits[0]??rows.length;if(!rows[row])rows[row]=new Map();for(const other of new Set(hits))if(other!==row){for(const[k,p]of rows[other]){rows[row].set(k,p);owner.set(k,row);}rows[other].clear();}for(const p of t){const k=p.map(v=>v.toFixed(5)).join(',');rows[row].set(k,p);owner.set(k,row);}}}return rows.filter(r=>r.size).map(r=>[...r.values()]);}
const bounds=p=>({min:[0,1,2].map(k=>Math.min(...p.map(v=>v[k]))),max:[0,1,2].map(k=>Math.max(...p.map(v=>v[k])))});
const near=(a,b)=>Math.abs(a-b)<.00001;
for(const name of ['yard_road','outskirts_road'])test(`${name} has five actual2m centre marks with4m gaps and100mm strokes`,()=>{
 const marks=components(name).map(bounds).filter(b=>near(b.max[0]-b.min[0],2)&&near(b.max[2]-b.min[2],.1)&&near((b.max[2]+b.min[2])/2,0));
 assert.equal(marks.length,5);const xs=marks.map(b=>(b.min[0]+b.max[0])/2).sort((a,b)=>a-b);for(let i=1;i<xs.length;i++)assert.ok(near(xs[i]-xs[i-1],6));
});
test('the yard general-hazard plate has a real UK triangular silhouette',()=>{
 const triangles=components('yard_sign').filter(p=>p.length===3).map(bounds);
 assert.ok(triangles.some(b=>near(b.max[0]-b.min[0],.52)&&near(b.max[1]-b.min[1],.45)&&near(b.max[2]-b.min[2],0)),'black triangular border exists');
 assert.ok(triangles.some(b=>near(b.max[0]-b.min[0],.426)&&near(b.max[1]-b.min[1],.369)&&near(b.max[2]-b.min[2],0)),'yellow triangular field is inset');
});
