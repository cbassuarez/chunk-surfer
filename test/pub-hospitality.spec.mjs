import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {PUB_HOSPITALITY as CONFIG,PUB_HOSPITALITY_MESH,PUB_HOSPITALITY_LIGHTS} from '../src/data/pub-hospitality.js';
import {PUB_INTERIOR_LAYOUT} from '../src/data/exterior-pub-furnishings.js';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const stats=JSON.parse(read('public/assets/pub-hospitality.stats.json')),credits=JSON.parse(read('public/assets/pub-hospitality.credits.json'));
for(const[f,hash]of Object.entries(credits.sourceSha256))assert.equal(sha(read(f)),hash,'hospitality build source/protected pack changed: '+f);
for(const p of credits.packs){assert.equal(sha(read(p.file)),p.sha256);assert.equal(read(p.file).length,p.bytes);}
const doc=await new NodeIO().read(new URL('../public/assets/pub-hospitality.glb',import.meta.url).pathname);
assert.deepEqual(doc.getRoot().listMeshes().map(m=>m.getName()),[PUB_HOSPITALITY_MESH]);assert.ok(doc.getRoot().listMaterials().every(m=>m.getName().startsWith('pub warmth / ')));
assert.ok(doc.getRoot().listMaterials().some(m=>m.getName().includes('upholstery')&&m.getBaseColorFactor()[0]>.20));
assert.ok(doc.getRoot().listMaterials().filter(m=>m.getEmissiveFactor().some(n=>n>0)).length>=3,'stove embers and visible practical glass emit light');
assert.ok(stats.bytes<CONFIG.maximumBytes);assert.ok(stats.addedTriangles<=CONFIG.maximumAddedTriangles);assert.equal(stats.removedStoveTriangles,14,'only the opaque stove pane/front face are opened');
const oldBytes=read(CONFIG.sourceAsset),old=JSON.parse(oldBytes.subarray(20,20+oldBytes.readUInt32LE(12))),base=old.meshes.find(m=>m.name===CONFIG.baseMesh),oldBin=oldBytes.subarray(28+oldBytes.readUInt32LE(12));
const baseTriangles=base.primitives.reduce((sum,p)=>sum+old.accessors[p.indices].count/3,0);
assert.equal(stats.retainedTriangles+stats.removedStoveTriangles,baseTriangles,'hospitality retains every current canonical triangle except the stove aperture');
for(const p of base.primitives){const material=old.materials[p.material].name,now=doc.getRoot().listMeshes()[0].listPrimitives().find(p=>p.getMaterial().getName()==='pub warmth / '+material),a=old.accessors[p.attributes.POSITION],v=old.bufferViews[a.bufferView],raw=new Float32Array(oldBin.buffer,oldBin.byteOffset+v.byteOffset+(a.byteOffset||0),a.count*3),actual=now.getAttribute('POSITION').getArray();assert.deepEqual(Array.from(actual.subarray(0,raw.length)),Array.from(raw),'retained geometry/origin/furniture vertices stay exact: '+material);}
for(const d of stats.dressing){
  const support=PUB_INTERIOR_LAYOUT.furniture.find(f=>f.id===d.support);assert.ok(support);
  assert.ok(Math.abs(d.actualBounds.min[1]-d.y)<1e-6,'every added item actually contacts its table/counter');
  if(support.kind==='table')for(const x of[d.actualBounds.min[0],d.actualBounds.max[0]])for(const z of[d.actualBounds.min[2],d.actualBounds.max[2]])assert.ok(Math.hypot(x-support.x,z-support.z)<.47,'actual meal/lamp footprint fits the real round table');
  if(support.kind==='counter'){assert.ok(d.actualBounds.min[0]>=-3.91&&d.actualBounds.max[0]<=-3.17);assert.ok(d.actualBounds.min[2]>=-24.8&&d.actualBounds.max[2]<=-18.35);}
  for(const aisle of[PUB_INTERIOR_LAYOUT.publicAisle,PUB_INTERIOR_LAYOUT.staffAisle])assert.ok(d.actualBounds.max[0]<=aisle.x0||d.actualBounds.min[0]>=aisle.x1||d.actualBounds.max[2]<=aisle.z0||d.actualBounds.min[2]>=aisle.z1,'no dressing enters a real public or staff walking aisle');
  assert.ok(Math.hypot(d.x-(-3.14),d.z-(-22.50))>d.radius+.197+.08,'optional service tray and favor space remain clear');
}
assert.equal(PUB_HOSPITALITY_LIGHTS.length,10);for(const l of PUB_HOSPITALITY_LIGHTS){assert.ok([l.x,l.y,l.z,l.radius,l.intensity,...l.color].every(Number.isFinite));assert.ok(l.y>0&&l.y<3.4);}
for(const s of CONFIG.sconces){assert.ok(s.x-.115>=PUB_INTERIOR_LAYOUT.publicAisle.x1,'wall sconces clear the public walking aisle');assert.ok(s.y-.145>1.7,'sconces sit on the window mullions above the sill');}
assert.ok(PUB_HOSPITALITY_LIGHTS.find(l=>l.id==='pub-hearth-light').y<.7);assert.ok(PUB_HOSPITALITY_LIGHTS.filter(l=>/table-lamp|counter-lamp/.test(l.id)).every(l=>l.y<1.6),'lower face pools are motivated by actual table/counter lamps');
console.log(JSON.stringify({ok:true,mesh:PUB_HOSPITALITY_MESH,bytes:stats.bytes,retainedTriangles:stats.retainedTriangles,addedTriangles:stats.addedTriangles,lights:PUB_HOSPITALITY_LIGHTS.length,supportedDressing:stats.dressing.length,sourcePacksUnchanged:true}));
