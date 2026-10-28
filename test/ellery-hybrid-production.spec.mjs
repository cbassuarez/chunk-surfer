import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {NodeIO} from '@gltf-transform/core';

// Use the real installed production sources, freshly compiled plan and final
// generated collision. The environment override allows a private staging copy.
const root=process.env.TOWNSCAPE_REPO||fileURLToPath(new URL('../',import.meta.url));
const load=p=>import(pathToFileURL(path.join(root,p)).href);
const [FP,P,{conservatory:C},{ELLERY_PUBLIC_FRONT:F},facade,{EXTERIOR_COLLISION_GEOMETRY:collision},{parseGlb,meshFingerprint}]=await Promise.all([
 load('src/world/floorplan.js'),load('src/game/props.js'),load('src/data/floorplan/conservatory.js'),load('src/data/ellery-public-front.js'),
 load('src/world/exterior-facade-collision.js'),load('src/data/generated/exterior-collision.js'),load('tools/chunk_surfer/rebuild-tree-crowns.mjs'),
]);
FP.compile(C.levels,C);P.propsInit(FP);
const instance=P.renderInstances({group:'ground',inscriptions:false}).find(p=>p.id==='ellery-actual-public-front');assert.ok(instance);
const body=p=>{const a=FP.logicalToPhysical(p.x,p.y);return{x:(a.x+.5)*.5,z:(a.z+.5)*.5,feet:a.y};};
const at=(x,z)=>{const q=FP.logicalAtPhysical(x*2,z*2,{group:'ground',floor:.12});assert.ok(q,`no actual cell ${x},${z}`);return{x:Math.floor(q.x),y:Math.floor(q.y)};};
const step=(p,dx,dy)=>{const r=FP.canStep(p.x,p.y,p.x+dx,p.y+dy,{keys:new Set()});assert.equal(r.ok,true,JSON.stringify(r));const next=r.redirect||{x:p.x+dx,y:p.y+dy};assert.equal(P.propCanOccupy(next.x,next.y,{from:p}),true,`body collision ${JSON.stringify(body(next))}`);return next;};
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('production collision is generated from the installed hybrid public-front mesh',()=>{
 const pack=parseGlb(fs.readFileSync(path.join(root,'public/assets/ellery-public-front.glb'))),m=pack.json.meshes.find(m=>m.name===F.facade.mesh);assert.ok(m);
 assert.equal(collision[F.facade.mesh].sha256,meshFingerprint(pack,m),'collision must be regenerated from this exact mesh');
 assert.ok(instance.x===F.anchor.x&&instance.z===F.anchor.z,'the real rendered instance supplies collision placement');
});

test('the real bench seat stops the player, leaves the adjacent lane clear, and permits moving out of overlap',()=>{
 const src=at(95.25,1.75),blocked=at(95.25,2.25),a=body(src),b=body(blocked);near(a.feet,.12);near(b.feet,.12);
 assert.equal(P.propCanOccupy(src.x,src.y),true);assert.equal(P.propCanOccupy(blocked.x,blocked.y,{from:src}),false,'normal production movement is blocked');
 const contact=facade.exteriorFacadeCanStep({from:a,to:b},[instance]);assert.equal(contact.ok,false);assert.equal(contact.hit.id,instance.id);
 for(const point of contact.hit.segment)near(point.z,F.forecourt.bench.z0,1e-4);
 near(contact.hit.height[0],.56,1e-4);near(contact.hit.height[1],F.forecourt.bench.seatTop,1e-4);
 assert.equal(P.propCanOccupy(src.x,src.y,{from:blocked}),true,'a loaded position already touching the bench can retreat');
 const clear={x:95.25,z:2.15,feet:.12},toward={x:95.25,z:2.25,feet:.12};
 assert.equal(facade.exteriorFacadeCanOccupy(clear,[instance]).ok,true,'the body fits beside the bench');
 assert.equal(facade.exteriorFacadeCanStep({from:toward,to:clear},[instance]).ok,true,'continuous overlap recovery goes outward');
 assert.equal(facade.exteriorFacadeCanStep({from:clear,to:toward},[instance]).ok,false,'inward motion cannot use the recovery exemption');
});

test('all 48 actual half-metre approach lanes cross the street seam and return without a bounce',()=>{
 const portal=FP.edgePortalState().find(p=>p.id==='north-footway-to-public-forecourt');assert.equal(portal.lanes,48);
 for(let lane=0;lane<48;lane++){
  let p=at(74.25+lane*.5,-.75);p=step(p,0,1);near(body(p).z,-.25);p=step(p,0,1);near(body(p).z,.25);p=step(p,0,1);near(body(p).z,.75);
  p=step(p,0,-1);near(body(p).z,.25);p=step(p,0,-1);near(body(p).z,-.25);p=step(p,0,-1);near(body(p).z,-.75);
 }
});

test('the real public doorway stays clear of facade mesh and still requires the closure order',()=>{
 const front=FP.doorState().find(d=>d.id==='front-main');assert.ok(front);assert.equal(front.keyId,'closure-order');assert.equal(front.open,false);
 const a={x:79.25,z:2,feet:.12},b={x:79.25,z:3.25,feet:.12};assert.equal(facade.exteriorFacadeCanStep({from:a,to:b},[instance]).ok,true,'static mesh does not seal the real paired door');
 const p=at(79.25,2.25),next=step(p,0,1),locked=FP.canStep(next.x,next.y,next.x,next.y+1,{keys:new Set(['master'])});assert.equal(locked.ok,false);assert.equal(locked.keyId,'closure-order');
});

const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
function intersects(o,d,a,b,c){const e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)return null;const inv=1/det,s=sub(o,a),u=inv*dot(s,h);if(u<0||u>1)return null;const q=cross(s,e1),v=inv*dot(d,q);if(v<0||u+v>1)return null;const t=inv*dot(e2,q);return t>1e-5?t:null;}
function hits(mesh,o,d,anchor,limit){const found=[];for(const p of mesh.listPrimitives()){const pos=p.getAttribute('POSITION'),ix=p.getIndices().getArray();for(let i=0;i<ix.length;i+=3){const points=[ix[i],ix[i+1],ix[i+2]].map(k=>pos.getElement(k,[]).map((v,j)=>v+anchor[j])),t=intersects(o,d,...points);if(t!==null&&t<limit)found.push(p.getMaterial().getName());}}return found;}
test('final installed triangles preserve the real W3–D0–greenhouse viewing ray',async()=>{
 const io=new NodeIO(),final=await io.readBinary(fs.readFileSync(path.join(root,'public/assets/ellery-public-front.glb'))),source=await io.readBinary(fs.readFileSync(path.join(root,'public/assets/conservatory-props.glb')));
 const mesh=(doc,name)=>doc.getRoot().listMeshes().find(m=>m.getName()===name),hero=mesh(final,F.hero.mesh),front=mesh(final,F.facade.mesh),original=mesh(source,F.hero.mesh);
 const origin=[84.75,1.7,1.25],d=[0,(3.70-origin[1])/(27.5-origin[2]),1],limit=32-origin[2]-.001;
 assert.ok(hits(original,origin,d,[50,0,7.5],limit).includes('board marked concrete'),'negative control: the original scenic wall seals this view');
 assert.deepEqual(hits(hero,origin,d,[50,0,7.5],limit),[]);assert.deepEqual(hits(front,origin,d,[86,0,1.25],27.5-origin[2]),[],'hybrid canopy and liner do not seal W3');
});
