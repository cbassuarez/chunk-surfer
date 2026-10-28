import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {ELLERY_PUBLIC_FRONT as C,ELLERY_PUBLIC_FRONT_LETTERING as COPY} from '../src/data/ellery-public-front.js';

const io=new NodeIO(),doc=await io.readBinary(fs.readFileSync(new URL('../public/assets/ellery-public-front.glb',import.meta.url)));
const mesh=doc.getRoot().listMeshes().find(m=>m.getName()===C.facade.mesh),parts=mesh.getExtras().parts;
const sockets=C.hybrid.sockets,anchor=[C.anchor.x,0,C.anchor.z];
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
function hitTriangle(o,d,a,b,c){const e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)return null;const inv=1/det,s=sub(o,a),u=inv*dot(s,h);if(u<0||u>1)return null;const q=cross(s,e1),v=inv*dot(d,q);if(v<0||u+v>1)return null;const t=inv*dot(e2,q);return t>1e-5?t:null;}
function ray(o,d,max,filter=()=>true){const hits=[];for(const p of mesh.listPrimitives()){const mat=p.getMaterial().getName();if(!filter(mat))continue;const pos=p.getAttribute('POSITION'),ix=p.getIndices().getArray();for(let i=0;i<ix.length;i+=3){const xyz=[ix[i],ix[i+1],ix[i+2]].map(j=>pos.getElement(j,[]).map((v,k)=>v+anchor[k])),t=hitTriangle(o,d,...xyz);if(t!==null&&t<=max)hits.push({t,mat});}}return hits.sort((a,b)=>a.t-b.t);}
function ceiling(x){const c=C.hybrid.canopy,i=x<=c.x[1]?0:1,alpha=(x-c.x[i])/(c.x[i+1]-c.x[i]);return c.bottomY[i]+alpha*(c.bottomY[i+1]-c.bottomY[i]);}

test('the actual GLB carries the old arts relief, left entrance lettering and a single solid-backed modern screen',()=>{
 assert.ok(parts.some(p=>p.id==='public-arts-terracotta-panel'));
 assert.ok(parts.some(p=>p.id==='lyre-crossbar-1'));
 assert.equal(parts.filter(p=>p.id.startsWith('hybrid-blind-screen-fin-')).length,21);
 assert.ok(parts.some(p=>p.id==='upper-blind-brick-panel-86'));
 const p=COPY.find(p=>p.id==='ellery-public-name');assert.deepEqual(p.lines,['ELLERY']);assert.ok(p.center[0]>C.facade.door.x0&&p.center[0]<C.facade.door.x1);assert.ok(p.widthM<3);
 const screen=ray([86,6.55,0],[0,0,1],4);assert.ok(screen.some(h=>h.mat==='hybrid blackened bronze'));assert.ok(screen.some(h=>h.mat==='ellery red brick'),'brick must remain behind the screen');
});

test('the folded canopy is a solid, connected, overhead addition with downward underside normals',()=>{
 const c=C.hybrid.canopy;assert.equal(c.x[0],77.2);assert.equal(c.x.at(-1),88.4);assert.ok(Math.min(...c.bottomY)>=3.65);assert.ok(C.facade.planeZ-c.frontZ<=1.2+1e-6);
 const bronze=mesh.listPrimitives().find(p=>p.getMaterial().getName()==='hybrid blackened bronze');assert.ok(bronze);
 for(const x of[77.4,80.0,82.7,85,88.2]){
  const hits=ray([x,3.5,2.18],[0,1,0],2,m=>m==='hybrid blackened bronze');assert.ok(hits.length>=2,'both faces of the actual canopy exist at x='+x);assert.ok(Math.abs(3.5+hits[0].t-ceiling(x))<.01);
 }
 const pos=bronze.getAttribute('POSITION'),normal=bronze.getAttribute('NORMAL');let bottoms=0,tops=0;
 for(let i=0;i<pos.getCount();i++){const v=pos.getElement(i,[]).map((q,k)=>q+anchor[k]),n=normal.getElement(i,[]);if(v[0]>=77.19&&v[0]<=88.41&&v[2]>=c.frontZ-.01&&v[2]<=c.backZ+.01&&Math.abs(v[1]-ceiling(v[0]))<.005&&n[1]<-.8)bottoms++;if(v[0]>=77.19&&v[0]<=88.41&&v[2]>=c.frontZ-.01&&v[2]<=c.backZ+.01&&Math.abs(v[1]-ceiling(v[0])-c.thickness)<.005&&n[1]>.8)tops++;}
 assert.ok(bottoms>=8&&tops>=8,'top and underside actually face outward');
});

test('each proposed light source has a compact actual diffuser located in its canopy',()=>{
 for(const socket of sockets){
  const part=parts.find(p=>p.id===socket.id);assert.ok(part,socket.id);assert.deepEqual(part.center,[socket.x,socket.y,socket.z]);
  assert.ok(part.size[0]<=.11&&part.size[2]<=.11,'fixtures are compact, not luminous strips');
  const prim=mesh.listPrimitives().find(p=>p.getMaterial().getName()===socket.material);assert.ok(prim,socket.material);
  const pos=prim.getAttribute('POSITION'),values=Array.from({length:pos.getCount()},(_,i)=>pos.getElement(i,[]).map((v,k)=>v+anchor[k]));
  for(let k=0;k<3;k++){const centre=(Math.min(...values.map(v=>v[k]))+Math.max(...values.map(v=>v[k])))/2;assert.ok(Math.abs(centre-[socket.x,socket.y,socket.z][k])<1e-4);}
  const ySurface=ceiling(socket.x)+(socket.id.includes('relief')?C.hybrid.canopy.thickness:0);assert.ok(Math.abs(socket.y-ySurface)<.05,'diffuser actually meets metal sheet');
  assert.ok(prim.getMaterial().getEmissiveFactor().every(v=>v<.2),'fixtures are gently luminous');
 }
});

test('actual low-height GLB surfaces leave the 2.4m route open and bench seat remains a physical obstacle',()=>{
 assert.equal(C.forecourt.clearThrough.z1,2.4);assert.ok(C.forecourt.bench.z0>=2.4);assert.ok(C.forecourt.bench.seatTop>.60);
 for(let x=74.25;x<98;x+=.5)for(const y of[.30,.60,1.10,1.60])assert.deepEqual(ray([x,y,-.35],[0,0,1],2.75),[],`clear body ray at ${x}, ${y}`);
 const bench=ray([95.2,.60,2.30],[0,0,1],.25);assert.ok(bench.some(h=>h.mat==='weathered bench timber'&&Math.abs(2.30+h.t-C.forecourt.bench.z0)<.002),'solid seat begins at the authored band edge');
});
