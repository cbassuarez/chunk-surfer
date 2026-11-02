import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {OUTSKIRTS_BUS_PASSAGE as C,busPassageFloorAt} from '../src/data/outskirts-bus-passage.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readBusAccessor} from '../tools/chunk_surfer/build-outskirts-bus-passage.mjs';
import {buildBusRefinement} from '../tools/chunk_surfer/build-bus-refinement.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),bytes=fs.readFileSync(new URL('../public/assets/bus-refinement.glb',import.meta.url)),pack=parseGlb(bytes),source=parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url))),passage=parseGlb(fs.readFileSync(new URL('../public/assets/outskirts-bus-passage.glb',import.meta.url))),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/bus-refinement.stats.json',import.meta.url)));
const model=(p,name)=>p.json.meshes.find(m=>m.name===name);
function triangles(p,mesh,transform=x=>x){return mesh.primitives.flatMap(pd=>{const v=readBusAccessor(p,pd.attributes.POSITION),ix=readBusAccessor(p,pd.indices);return Array.from({length:ix.length/3},(_,k)=>({material:p.json.materials[pd.material].name,p:[0,1,2].map(c=>transform(v.slice(ix[k*3+c]*3,ix[k*3+c]*3+3)))}));});}
const body=triangles(pack,model(pack,C.mesh));
function clipHeight(poly,edge,above){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],aIn=above?a[1]>=edge:a[1]<=edge,bIn=above?b[1]>=edge:b[1]<=edge;if(aIn)out.push(a);if(aIn!==bIn){const t=(edge-a[1])/(b[1]-a[1]);out.push(a.map((x,k)=>x+t*(b[k]-x)));}}return out;}
function distanceSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz);}
function touches(x,z,floor,t,r=.25){if(Math.max(...t.p.map(p=>p[1]))<floor+.45||Math.min(...t.p.map(p=>p[1]))>floor+1.70)return false;let poly=clipHeight(t.p,floor+.45,true);if(poly.length<2)return false;poly=clipHeight(poly,floor+1.70,false);if(poly.length<2)return false;let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[2]>z)!==(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])inside=!inside;}return inside||poly.some((p,i)=>distanceSegment(x,z,p,poly[(i+1)%poly.length])<r-1e-5);}
const doorTriangles=(which,angle)=>triangles(passage,model(passage,which==='entry'?C.entryMesh:C.exitMesh),p=>{const d=C[which],c=Math.cos(angle),s=Math.sin(angle);return[d.hinge[0]+p[0]*c+p[2]*s,d.hinge[1]+p[1],d.hinge[2]-p[0]*s+p[2]*c];});
function walk(points,geometry=body){for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.10));for(let i=0;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n,floor=busPassageFloorAt(x,z),hit=geometry.find(t=>touches(x,z,floor,t));assert.equal(hit,undefined,`refined geometry obstructs body at ${x.toFixed(3)},${z.toFixed(3)} floor ${floor}: ${hit?.material}`);}}}
function surfaces(x,z){const found=[];for(const t of body){const[a,b,c]=t.p,d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-10)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,w=1-u-v;if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6){const y=u*a[1]+v*b[1]+w*c[1];if(y<=.501)found.push(y);}}return found;}

test('three stable bus IDs use bounded geometry/material budgets without replacing gameplay-owned parts',()=>{
 assert.equal(sha(bytes),stats.sha256);assert.ok(bytes.length<5e6);assert.deepEqual(pack.json.meshes.map(m=>m.name),['ambient_late_bus','outskirts_bus','outskirts_bus_passage']);
 assert.ok(stats.meshes.ambient_late_bus.primitives<=8);assert.ok(stats.meshes.outskirts_bus_passage.primitives<=14);assert.ok(stats.totalTriangles<35000);
 assert.ok(!pack.json.materials.some(m=>m.alphaMode==='BLEND'),'mirror/translucent whole panes are not supported by this surface');
 assert.ok(!model(pack,C.mesh).primitives.some(p=>pack.json.materials[p.material].emissiveFactor?.some(x=>x>0)),'the bus body must not take ownership of switched lamps');
 for(const[p,h]of Object.entries(stats.sourceHashes))assert.equal(sha(fs.readFileSync(new URL('../'+p,import.meta.url))),h,'protected original '+p);
});

test('window middles are real open apertures with interior seats, never opaque warm rectangles',()=>{
 for(const name of['ambient_late_bus','outskirts_bus','outskirts_bus_passage']){
  const body=triangles(pack,model(pack,name)),scale=name==='ambient_late_bus'?.98:1;
  // A thin horizontal ray across the glazing at each clear pane centre.
  for(const side of[-1,1])for(const z of[-1.75,.02,1.78]){
   const x=side*1.25*scale,y=1.99;
   const blocker=body.find(t=>t.p.every(p=>Math.abs(p[0]-x)<.065)&&t.p.some(p=>p[1]>y-.05)&&t.p.some(p=>p[1]<y+.05)&&Math.min(...t.p.map(p=>p[2]))<z-.05&&Math.max(...t.p.map(p=>p[2]))>z+.05);
   assert.equal(blocker,undefined,`${name} filled a glass opening ${side}/${z}`);
  }
  assert.ok(model(pack,name).primitives.some(p=>pack.json.materials[p.material].name==='outskirts green moquette'));
 }
});

test('all six packed stair tops and the existing floor still match the authoritative support contract',()=>{
 for(const step of C.treads)for(const u of[.15,.5,.85])for(const v of[.15,.5,.85]){const x=step.x0+(step.x1-step.x0)*u,z=step.z0+(step.z1-step.z0)*v;assert.ok(Math.abs(Math.max(...surfaces(x,z))-step.top)<1e-6,step.id);}
 for(const[x,z]of[[0,0],[0,-3.15],[0,3.85],[-.30,2.9],[.30,-2.7]])assert.ok(Math.abs(Math.max(...surfaces(x,z))-C.floor)<1e-6);
});

test('the refined packed bus clears entry, both aisle grid phases, rear turning space and open emergency door',()=>{
 const geometry=[...body,...doorTriangles('entry',C.entry.openYaw),...doorTriangles('exit',C.exit.openYaw)],route=[[-2,-3.15],[-.25,-3.15],[-.25,-2.75],[0,-2.75],[0,3.85],[2,3.85]];walk(route,geometry);walk([...route].reverse(),geometry);
 for(const phase of[-.25,.25])walk([[phase,-2.75],[phase,3.85]],geometry);
 for(const phase of[-.249,-.125,-.001,0,.125,.249])for(const zp of[0,.15,.25,.375]){const chosen=phase<0?phase+.5:phase,turn=2+zp+(zp===0?.5:0),exit=3.5+zp+(3.5+zp<3.64?.5:0);walk([[phase,-2.5],[phase,turn],[chosen,turn],[chosen,exit],[2+phase,exit]],geometry);}
 for(const z of[-3.40,-3.15,-2.90])walk([[-1.75,z],[-.47,z]],geometry);for(const z of[3.60,3.85,4.10])walk([[.47,z],[1.75,z]],geometry);
 // New rear engine details must never seal the separate body-passage plane.
 walk([[0,2.7],[0,C.bodyPassage.planeZ]],body);
});

test('source destination/registration print retains original image bytes and actual printed triangle geometry',()=>{
 const textureHash=(p,m,key)=>{const t=key==='normalTexture'?m.normalTexture:m.pbrMetallicRoughness[key],im=p.json.images[p.json.textures[t.index].source],v=p.json.bufferViews[im.bufferView];return sha(p.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));};
 for(const[name,oldPack]of[['outskirts_bus',source],['outskirts_bus_passage',passage]]){
  const old=model(oldPack,name).primitives.filter(p=>oldPack.json.materials[p.material].extras?.printedSurface),next=model(pack,name).primitives.filter(p=>pack.json.materials[p.material].extras?.printedSurface);assert.equal(next.length,old.length);
  for(let i=0;i<old.length;i++){for(const role of['baseColorTexture','metallicRoughnessTexture','normalTexture'])assert.equal(textureHash(pack,pack.json.materials[next[i].material],role),textureHash(oldPack,oldPack.json.materials[old[i].material],role));for(const attr of['POSITION','NORMAL','TEXCOORD_0']){const n=attr==='TEXCOORD_0'?2:3,unpack=(p,pd)=>{const v=readBusAccessor(p,pd.attributes[attr]);return readBusAccessor(p,pd.indices).flatMap(ix=>v.slice(ix*n,ix*n+n));};assert.deepEqual(unpack(pack,next[i]),unpack(oldPack,old[i]));}}
 }
});

test('refined cushions have upward visible caps and exterior nose normals point out of the coach',()=>{
 for(const name of['ambient_late_bus','outskirts_bus_passage']){const mesh=model(pack,name),seat=mesh.primitives.find(p=>pack.json.materials[p.material].name==='outskirts green moquette'),p=readBusAccessor(pack,seat.attributes.POSITION),n=readBusAccessor(pack,seat.attributes.NORMAL);assert.ok(p.some((v,i)=>i%3===1&&Math.abs(v-1.105)<1e-5&&n[i]>.9),'seat cushion top faces inward');
  const body=mesh.primitives.find(p=>pack.json.materials[p.material].name.startsWith('outskirts municipal enamel')),v=readBusAccessor(pack,body.attributes.POSITION),normal=readBusAccessor(pack,body.attributes.NORMAL);for(const sign of[-1,1])assert.ok(v.some((x,i)=>i%3===0&&Math.sign(x)===sign&&Math.abs(x)>1&&Math.abs(x)<1.205&&v[i+2]<-4.60&&v[i+1]>.67&&normal[i]*sign>.1),'nose normals fail '+sign);
 }
});

test('existing artist graffiti remains outside the actual street bus side skins',()=>{
 const bus=triangles(pack,model(pack,'ambient_late_bus'));
 for(const[side,z]of[[1,-.75],[1,.28],[-1,.02]]){
  const hits=[];for(const t of bus){const[a,b,c]=t.p,y=1.08,d=(b[2]-c[2])*(a[1]-c[1])+(c[1]-b[1])*(a[2]-c[2]);if(Math.abs(d)<1e-9)continue;const u=((b[2]-c[2])*(y-c[1])+(c[1]-b[1])*(z-c[2]))/d,v=((c[2]-a[2])*(y-c[1])+(a[1]-c[1])*(z-c[2]))/d,w=1-u-v;if(u>=0&&v>=0&&w>=0){const x=u*a[0]+v*b[0]+w*c[0];if(Math.sign(x)===side)hits.push(Math.abs(x));}}
  const wall=Math.max(...hits);assert.ok(wall>1.20&&wall<1.229,`paint plane1.231 no longer clears wall ${wall}`);
 }
});

test('all coach barrel roofs have sealed front and rear caps above the old flat headers',()=>{
 for(const name of['ambient_late_bus','outskirts_bus','outskirts_bus_passage']){
  const geometry=triangles(pack,model(pack,name)),scale=name==='ambient_late_bus'?.98:1;
  for(const z of[-4.587,4.627])for(const rawX of[-.6,0,.6]){
   const x=rawX*scale,y=2.985,found=geometry.some(t=>{
    if(!t.p.every(p=>Math.abs(p[2]-z)<1e-5))return false;
    const[a,b,c]=t.p,d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(d)<1e-10)return false;
    const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d;return u>=-1e-6&&v>=-1e-6&&1-u-v>=-1e-6;
   });assert.ok(found,`${name} has open roof end at ${x},${y},${z}`);
  }
 }
});

test('dedicated bus refinement is byte reproducible from its protected production sources',async()=>{const built=await buildBusRefinement();assert.equal(sha(built.bytes),sha(bytes));});
