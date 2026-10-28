import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {EXTERIOR_FOREGROUND} from '../src/data/exterior-foreground.js';
import {parseGlb,encodeGlb,meshFingerprint} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {patchOpeningGround} from '../tools/chunk_surfer/rebuild-opening-ground.mjs';
import {patchOpeningFrontage} from '../tools/chunk_surfer/repair-loading-apron-aperture.mjs';
const bytes=fs.readFileSync(new URL('../public/assets/opening-street.glb',import.meta.url)),pack=parseGlb(bytes),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/opening-street.stats.json',import.meta.url),'utf8'));
function values(i){const a=pack.json.accessors[i],v=pack.json.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3}[a.type],size={5126:4,5125:4,5123:2}[a.componentType],stride=v.byteStride||width*size,start=(v.byteOffset||0)+(a.byteOffset||0);return Array.from({length:a.count},(_,k)=>Array.from({length:width},(_,q)=>{const n=start+k*stride+q*size;return a.componentType===5126?pack.bin.readFloatLE(n):size===2?pack.bin.readUInt16LE(n):pack.bin.readUInt32LE(n);}));}
const ground=pack.json.meshes.find(m=>m.name==='opening_street_ground'),triangles=ground.primitives.flatMap(p=>{const v=values(p.attributes.POSITION).map(([x,y,z])=>[x+8,y,z+7.5]),ids=values(p.indices).flat(),role=pack.json.materials[p.material].extras.openingStreetRole;return Array.from({length:ids.length/3},(_,i)=>({role,p:ids.slice(i*3,i*3+3).map(k=>v[k])}));});
function contains(t,x,z){const[a,b,c]=t.p,d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-9)return false;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d;return u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7;}
const rolesAt=(x,z)=>new Set(triangles.filter(t=>contains(t,x,z)).map(t=>t.role));
for(const lawn of EXTERIOR_FOREGROUND.arrival.lawns)for(let z=lawn.z0+.05;z<lawn.z1;z+=.1)for(let x=lawn.x0+.05;x<lawn.x1;x+=.1)assert.deepEqual([...rolesAt(x,z)],['grass'],`real grass receiver covers lawn at ${x},${z}`);
const path=EXTERIOR_FOREGROUND.arrival.path;
for(let z=path.z0+.05;z<path.z1;z+=.1)for(let x=path.x0+.01;x<path.x1;x+=.05)assert.deepEqual([...rolesAt(x,z)],['asphalt'],`whole two-metre path remains free of grass at ${x},${z}`);
for(const t of triangles)assert.ok(t.p.every(p=>p[2]>=-1e-6),'opening ground no longer overlays the separate north-street segment');
for(const x of[14,18,22,25])for(const z of[-4,-2,-.1])assert.equal(rolesAt(x,z).size,0,'retired north grass/cross-path receivers are absent');
const grassArea=triangles.filter(t=>t.role==='grass').reduce((sum,{p:[a,b,c]})=>sum+Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2,0);
assert.ok(Math.abs(grassArea-40.64)<.0001,'actual exported grass surface area matches its bounded contract');
assert.equal(triangles.length,14);assert.equal(stats.materialAreas.opening_street_ground.grass,40.64);assert.equal(stats.materialAreas.opening_street_ground.asphalt,490);assert.equal(stats.materialAreas.opening_street_ground.cobbles,36);
const approvedFrontageFingerprint='f20fa7f73f89b4adbc5ba0bee388dffd0d0bc3e69f9303daf9abbc45b0ab1a83';
for(const[name,fingerprint]of Object.entries(stats.groundReceiver?.unchangedMeshes||{})){
 const mesh=pack.json.meshes.find(m=>m.name===name);
 assert.ok(mesh,`${name} exists`);
 assert.equal(meshFingerprint(pack,mesh),name==='opening_street_frontage'?approvedFrontageFingerprint:fingerprint,`${name} preserves its approved primitive data`);
}
const frontageSource=fs.readFileSync(new URL('../tools/chunk_surfer/build-opening-street.py',import.meta.url),'utf8');
const repaired=patchOpeningFrontage(pack,frontageSource);
assert.deepEqual(encodeGlb(repaired.json,repaired.bin),bytes,'approved apron frontage is already repaired and byte-stable');
if(stats.groundReceiver){const hashes=pack.json.images.map(i=>{const v=pack.json.bufferViews[i.bufferView];return crypto.createHash('sha256').update(pack.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)).digest('hex');});assert.deepEqual(hashes,stats.groundReceiver.embeddedImageHashes,'all embedded texture bytes remain original');}
const once=patchOpeningGround(pack),twice=patchOpeningGround(once);assert.deepEqual(encodeGlb(...Object.values(twice)),encodeGlb(...Object.values(once)),'repeat repair is byte deterministic without binary growth');
console.log('opening ground: exact lawn/path receivers, no duplicate north panels, four other meshes and textures preserved');
