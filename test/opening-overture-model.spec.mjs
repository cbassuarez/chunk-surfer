import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {buildOpeningOverture,OPENING_PIGEON_REFERENCES} from '../tools/chunk_surfer/build-opening-overture.mjs';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readExteriorAccessor as read} from '../tools/chunk_surfer/build-exterior-collision.mjs';
import {OPENING_OVERTURE as C,OPENING_OVERTURE_BIRDS as BIRDS} from '../src/data/opening-overture.js';
import {openingOvertureBirdFlight} from '../src/data/opening-overture-flight.js';
import {openingOvertureBirdPose,openingOvertureBirdInstances} from '../src/render/opening-overture.js';

const bytes=fs.readFileSync(new URL('../public/assets/opening-overture.glb',import.meta.url)),pack=parseGlb(bytes),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/opening-overture.stats.json',import.meta.url))),credits=JSON.parse(fs.readFileSync(new URL('../public/assets/opening-overture.credits.json',import.meta.url)));
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],close=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const triangles=(source,name)=>source.json.meshes.find(m=>m.name===name).primitives.flatMap(p=>{const ps=read(source,p.attributes.POSITION),ids=read(source,p.indices).flat();return Array.from({length:ids.length/3},(_,i)=>ids.slice(i*3,i*3+3).map(k=>ps[k]));});
const vertices=name=>triangles(pack,name).flat();
function roofHeight(rows,x,z){let y=-Infinity;for(const[a,b,c]of rows){const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-10)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,w=1-u-v;if(Math.min(u,v,w)>=-1e-6)y=Math.max(y,u*a[1]+v*b[1]+w*c[1]);}return y;}

test('the original CC0 hero asset is deterministic, under one megabyte and nine thousand triangles, with primary references rather than imported media',()=>{
 const built=buildOpeningOverture({write:false});assert.deepEqual(built.buffer,bytes);assert.equal(stats.triangles,8844);assert.ok(bytes.length<1000000);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),stats.sha256);assert.equal(pack.json.meshes.length,11);assert.deepEqual(new Set(pack.json.meshes.map(m=>m.name)),new Set(C.requiredMeshes));assert.equal(credits.license,'CC0-1.0');assert.deepEqual(credits.externalSources,[]);assert.deepEqual(credits.referenceSources,OPENING_PIGEON_REFERENCES);assert.equal(credits.referenceSources.length,4);assert.ok(credits.referenceSources.every(s=>s.assetReuse===false&&s.url.startsWith('https://')));assert.equal(pack.json.images,undefined);
});

test('the plump breast has a smaller smooth slate head, separate orange iris and pupil, pale cere and a thin split bill',()=>{
 const meshes=new Map(stats.meshes.map(m=>[m.name,m])),head=meshes.get('overture_pigeon_head').bounds,body=meshes.get('overture_pigeon_body').bounds,bill=meshes.get('overture_pigeon_beak').bounds;
 assert.ok((head.max[0]-head.min[0])/(body.max[0]-body.min[0])<.6);assert.ok(head.max[1]-head.min[1]<.075);assert.ok(bill.max[0]-bill.min[0]<.027);assert.ok(bill.max[2]-bill.min[2]>.04);
 const used=name=>new Set(pack.json.meshes.find(m=>m.name===name).primitives.map(p=>pack.json.materials[p.material].name));assert.ok([...used('overture_pigeon_head')].some(n=>n.includes('orange-red iris')));assert.ok([...used('overture_pigeon_head')].some(n=>n.includes('dark bill and pupil')));assert.ok([...used('overture_pigeon_beak')].some(n=>n.includes('ivory bill cere')));assert.ok([...used('overture_pigeon_body')].some(n=>n.includes('violet neck sheen')));assert.ok([...used('overture_pigeon_body')].some(n=>n.includes('white rump feathers')));
 for(const m of pack.json.meshes)for(const p of m.primitives){assert.ok(read(pack,p.attributes.POSITION).flat().every(Number.isFinite));assert.ok(read(pack,p.attributes.NORMAL).every(n=>Math.abs(Math.hypot(...n)-1)<1e-5));assert.deepEqual(pack.json.materials[p.material].emissiveFactor,[0,0,0]);}
});

test('feather vanes, wing bars, tail band and scaled clawed feet are solid volumes with outward winding',()=>{
 for(const name of ['overture_pigeon_wing_inner_l','overture_pigeon_wing_outer_l','overture_pigeon_tail','overture_pigeon_foot_l','overture_pigeon_head']){
  const ts=triangles(pack,name),volume=ts.reduce((s,[a,b,c])=>s+dot(a,cross(b,c))/6,0);assert.ok(volume>1e-9,`${name} encloses outward-facing volume`);
  const edges=new Map(),key=p=>p.map(v=>Math.round(v*1e8)).join(',');for(const t of ts)for(let k=0;k<3;k++){const a=key(t[k]),b=key(t[(k+1)%3]);if(a===b)continue;const id=[a,b].sort().join('/');edges.set(id,(edges.get(id)||0)+1);}assert.ok([...edges.values()].every(n=>n%2===0),`${name} has closed solid surfaces rather than feather cards`);
 }
 const foot=pack.json.meshes.find(m=>m.name==='overture_pigeon_foot_r');assert.ok(foot.primitives.some(p=>pack.json.materials[p.material].name.includes('raised pink leg scales')));assert.ok(foot.primitives.some(p=>pack.json.materials[p.material].name.includes('dark keratin claws')));
});

test('all five actual roof perches retain planted toes while the body crouches then extends for the push',()=>{
 const source=parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url))),roof=triangles(source,'yard_stable_range').map(ps=>ps.map(p=>[p[0]+36,p[1],p[2]+18]));assert.equal(BIRDS.length,5);
 for(const bird of BIRDS){
  const crouch=openingOvertureBirdPose(bird,bird.takeoffAt-.15),push=openingOvertureBirdPose(bird,bird.takeoffAt-.001);assert.ok(crouch.crouch<-.02);assert.ok(push.crouch>0);assert.deepEqual(crouch.position,bird.perch);assert.deepEqual(push.position,bird.perch);
  for(const t of[bird.takeoffAt-.3,bird.takeoffAt-.15,bird.takeoffAt-.001]){let min=Infinity;for(const foot of openingOvertureBirdInstances(t).filter(p=>p.birdId===bird.id&&p.birdPart.startsWith('foot_')))for(const v of vertices(foot.mesh)){const q=point(foot.matrix,v),clearance=q[1]-roofHeight(roof,q[0],q[2]);assert.ok(clearance>=-.003);min=Math.min(min,clearance);}assert.ok(min<.012,'the lowest real toe is on its shipped roof');}
 }
});

test('takeoff opens into a strong first downstroke and folds the feet only after the physical push',()=>{
 for(const bird of BIRDS){const up=openingOvertureBirdPose(bird,bird.takeoffAt),down=openingOvertureBirdPose(bird,bird.takeoffAt+.58/(5.2+bird.beat*.25));assert.ok(up.wingAngle>1);assert.ok(down.wingAngle<-1);assert.ok(Math.abs(up.footFold)<1e-10);assert.ok(openingOvertureBirdPose(bird,bird.takeoffAt+.4).footFold<-1.2);assert.ok(down.position[1]>bird.perch[1]+.1);assert.equal(up.unfold,1);}
});

test('the shared flight has continuous position and velocity, turns from the actual departure heading, and converges into one loose flock',()=>{
 for(const bird of BIRDS){for(const age of[.05,.4,1.199,1.2,1.201,2]){const t=bird.takeoffAt+age,a=openingOvertureBirdFlight(bird,t-1e-5),b=openingOvertureBirdFlight(bird,t+1e-5),at=openingOvertureBirdFlight(bird,t);for(let k=0;k<3;k++)close((b.position[k]-a.position[k])/2e-5,at.velocity[k],.001);assert.ok(at.velocity[1]>0);}
  const initial=openingOvertureBirdFlight(bird,bird.takeoffAt+1e-6);close(Math.sin(initial.heading),Math.sin(bird.heading),1e-4);const end=openingOvertureBirdFlight(bird,BIRDS.at(-1).takeoffAt+2);assert.ok(end.velocity[0]>4&&end.velocity[2]<-2);close(end.heading,1.03+bird.turn*.05);
 }
 const flock=BIRDS.map(b=>openingOvertureBirdFlight(b,5).position);assert.equal(new Set(flock.map(p=>p.join(','))).size,5);assert.ok(Math.max(...flock.map(p=>p[0]))-Math.min(...flock.map(p=>p[0]))<18);
});

test('folded wings lie behind the shoulder and the real feathered spread reaches a pigeon-scale wingspan within the fifty-part budget',()=>{
 const bird=BIRDS[2],folded=openingOvertureBirdInstances(bird.takeoffAt-.35).filter(p=>p.birdId===bird.id),spread=openingOvertureBirdInstances(bird.takeoffAt+.052).filter(p=>p.birdId===bird.id);
 const extent=rows=>{const body=rows.find(p=>p.birdPart==='body'),right=body.matrix.slice(0,3),length=Math.hypot(...right),r=right.map(v=>v/length),p=rows.filter(p=>p.birdPart.startsWith('wing_')).flatMap(part=>vertices(part.mesh).map(v=>dot(point(part.matrix,v),r)));return Math.max(...p)-Math.min(...p);};const small=extent(folded),large=extent(spread);assert.ok(small<.30);assert.ok(large>.45&&large<.70);assert.ok(large>small*1.6);
 const all=openingOvertureBirdInstances(2.4);assert.equal(all.length,50);assert.equal(new Set(all.map(p=>p.id)).size,50);for(const part of all)assert.ok(part.matrix.every(Number.isFinite));for(const b of BIRDS){const a=openingOvertureBirdPose(b,2.4),reduced=openingOvertureBirdPose(b,2.4,{reducedMotion:true});assert.deepEqual(a.position,reduced.position);assert.equal(a.heading,reduced.heading);}
});
