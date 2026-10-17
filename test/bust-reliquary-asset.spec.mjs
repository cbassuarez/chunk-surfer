import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {BUST_RELIQUARY_RIG as RIG} from '../src/data/bust-reliquary-rig.js';
import {createCanonicalEyeGeometry} from '../tools/chunk_surfer/reliquary-geometry.mjs';
const bytes=fs.readFileSync(new URL('../public/assets/horizon-bust.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
const retained=JSON.parse(fs.readFileSync(new URL('../artifacts/bust-reliquary-production/portrait.json',import.meta.url),'utf8'));
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const distance=(a,b)=>Math.hypot(...a.map((x,k)=>x-b[k]));
function raySurface(g,x,y){
 let hit=-Infinity;
 for(let i=0;i<g.indices.length;i+=3){const p=Array.from(g.indices.slice(i,i+3),j=>Array.from(g.positions.slice(j*3,j*3+3)));const [[ax,ay,az],[bx,by,bz],[cx,cy,cz]]=p;const d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<1e-12)continue;const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/d,v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/d,w=1-u-v;if(u>=-1e-7&&v>=-1e-7&&w>=-1e-7)hit=Math.max(hit,u*az+v*bz+w*cz)}return hit;
}
test('selected reliquary is a bounded real16joint rig with five production clips',()=>{
 assert.equal(RIG.joints.length,16);assert.equal(asset.json.skins[0].joints.length,16);
 assert.deepEqual(Object.fromEntries([...asset.clips].map(([n,c])=>[n,c.duration])),RIG.clips);
 for(const e of asset.entries)for(const p of e.primitives){assert.ok(e.extras.reliquaryRole);for(let i=0;i<p.weights.length;i+=4){assert.deepEqual(Array.from(p.weights.slice(i,i+4)),[1,0,0,0]);assert.ok(p.joints[i]<16)}}
 const ys=asset.entries.flatMap(e=>e.primitives.flatMap(p=>Array.from(p.positions).filter((_,i)=>i%3===1)));assert.ok(Math.abs(Math.max(...ys)-6.5)<1e-5);
});
test('each actual closed socket has space in front of its recessed back for the canonical eye',()=>{
 assert.equal(retained.head.nonManifoldEdges,0);assert.equal(retained.torso.nonManifoldEdges,0);
 for(const c of Object.values(RIG.eyeCenters)){const back=raySurface(retained.head,c[0],c[1]);assert.ok(Number.isFinite(back));assert.ok(back<c[2]-.08,`bore back${back} intersects eye seat${c[2]}`)}
});
test('canonical pupil and iris are in front of the physical cut globe and remain distinct',()=>{
 const groups=createCanonicalEyeGeometry({radius:1,side:'L'});const globe=raySurface(groups.stone,0,0),iris=raySurface(groups.iris,0,0),pupil=raySurface(groups.pupil,0,0);assert.ok(iris>globe+.01);assert.ok(pupil>iris+.005);
 const left=createCanonicalEyeGeometry({radius:1,side:'L'}),right=createCanonicalEyeGeometry({radius:1,side:'R'});assert.notDeepEqual(left.vein.positions,right.vein.positions);
});
test('baked recognition articulates both shutters and eyes while preserving rigid stone and neutral gaze endpoint',()=>{
 const head=asset.entries.find(e=>e.name==='horizon_bust_portrait'),shutter=asset.entries.find(e=>e.name==='horizon_bust_shutter_L');const first=sampleCharacterPose(asset,shutter,{clip:'recognition-returned',time:0}),open=sampleCharacterPose(asset,shutter,{clip:'recognition-returned',time:4});const j=RIG.jointIndex.shutter_L;assert.ok(open.bones[j*16+13]-first.bones[j*16+13]>.17);
 const end=sampleCharacterPose(asset,head,{clip:'recognition-returned',time:10});for(const name of ['neck_yaw','neck_pitch','eye_L_yaw','eye_R_yaw']){const m=end.bones.slice(RIG.jointIndex[name]*16,RIG.jointIndex[name]*16+16);assert.ok(Math.abs(m[0]-1)<1e-6&&Math.abs(m[5]-1)<1e-6)}
 for(const t of [0,2.5,5,7.5,10]){const p=sampleCharacterPose(asset,head,{clip:'recognition-returned',time:t}),m=p.bones.slice(RIG.jointIndex.neck_pitch*16,RIG.jointIndex.neck_pitch*16+16),a=[-.8,5.5,.7],b=[.4,6.2,.1];assert.ok(Math.abs(distance(transform(m,a),transform(m,b))-distance(a,b))<1e-5)}
});
test('ritual depresses the reachable seal and turns the concealed neck pivot without moving pedestal',()=>{
 assert.equal(RIG.sealCenter[1],1.25);const e=asset.entries.find(e=>e.name==='horizon_bust_seal'),start=sampleCharacterPose(asset,e,{clip:'ritual',time:0}),press=sampleCharacterPose(asset,e,{clip:'ritual',time:1}),end=sampleCharacterPose(asset,e,{clip:'ritual',time:5});const j=RIG.jointIndex.seal_plunger;assert.ok(press.bones[j*16+14]-start.bones[j*16+14]<-.034);assert.ok(Math.abs(end.bones[j*16+14])<1e-6);assert.ok(Math.abs(end.bones[RIG.jointIndex.neck_yaw*16+2])>.30);assert.deepEqual(Array.from(end.bones.slice(0,16)),[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
});
test('the hand seal is cut into the planar stone front with a recessed moving palm',()=>{
 const mesh=name=>asset.entries.find(e=>e.name===name)?.primitives[0];
 const stone=mesh('horizon_bust_pedestal'),palm=mesh('horizon_bust_seal');
 assert.ok(stone&&palm);
 const front=raySurface(stone,.7,1.25),opening=raySurface(stone,0,1.25),finger=raySurface(stone,0,1.60),besideFinger=raySurface(stone,.35,1.72),palmFace=raySurface(palm,0,1.25);
 assert.ok(front>.7&&opening<0&&finger<0&&besideFinger>.7,'stone must have a hand-shaped opening, not a circular surface decal');
 assert.ok(palmFace>0&&palmFace<front-.035,'the moving palm must sit behind the stone front');
 assert.equal(asset.entries.find(e=>e.name==='horizon_bust_seal')?.extras.handShaped,true);
});
test('the conservatoire plinth has no exposed machinery or neck choker',()=>{
 const names=asset.entries.map(e=>e.name);
 assert.ok(names.includes('horizon_bust_neck_core'));
 const core=asset.entries.find(e=>e.name==='horizon_bust_neck_core');
 assert.equal(asset.json.materials[core.primitives[0].material].name,'marble','the neck join should disappear into the portrait, not read as metal');
 for(const part of ['service_plate','service_fasteners','linkage_L','linkage_R','bronze_fittings','neck_bearing','neck_race'])assert.ok(!names.includes(`horizon_bust_${part}`),`${part} should not be visible`);
 const front=asset.entries.find(e=>e.name==='horizon_bust_pedestal')?.primitives[0];
 assert.ok(front&&Math.abs(raySurface(front,.7,1)-raySurface(front,.7,2.5))<1e-5,'the unadorned shaft has one planar face');
});
test('three mechanically cheaper LODs retain real socket and eye geometry',()=>{
 const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/horizon-bust.stats.json',import.meta.url),'utf8'));assert.ok(stats.lods[0].totalTriangles>stats.lods[1].totalTriangles);assert.ok(stats.lods[1].totalTriangles>stats.lods[2].totalTriangles);for(const lod of stats.lods){const b=fs.readFileSync(new URL('../public/assets/'+lod.file,import.meta.url)),a=parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));assert.ok(a.entries.some(e=>e.extras.physicalSocket));assert.equal(a.entries.filter(e=>e.extras.reliquaryRole==='eye').length,8)}
});
