import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {OPENING_OVERTURE as C,OPENING_OVERTURE_SHOTS as SHOTS,OPENING_OVERTURE_BIRDS as BIRDS,openingOvertureFrame} from '../src/data/opening-overture.js';
import {openingOvertureBirdPose,openingOvertureBirdInstances} from '../src/render/opening-overture.js';
import {buildOpeningOverture} from '../tools/chunk_surfer/build-opening-overture.mjs';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readExteriorAccessor as read} from '../tools/chunk_surfer/build-exterior-collision.mjs';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL} from '../src/data/floorplan/legend.js';
import {openingArrivalWorldView} from '../src/game/opening-arrival-world.js';
const bytes=fs.readFileSync(new URL('../public/assets/opening-overture.glb',import.meta.url)),asset=parseGlb(bytes),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/opening-overture.stats.json',import.meta.url))),credits=JSON.parse(fs.readFileSync(new URL('../public/assets/opening-overture.credits.json',import.meta.url)));
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const close=(a,b,label='')=>assert.ok(Math.abs(a-b)<1e-5,`${label}: ${a} != ${b}`);
function triangles(pack,name){const mesh=pack.json.meshes.find(m=>m.name===name);assert.ok(mesh,name);return mesh.primitives.flatMap(p=>{const ps=read(pack,p.attributes.POSITION),ids=read(pack,p.indices).flat();return Array.from({length:ids.length/3},(_,i)=>ids.slice(i*3,i*3+3).map(k=>ps[k]));});}
function height(rows,x,z){let result=-Infinity;for(const[a,b,c]of rows){const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-10)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,w=1-u-v;if(Math.min(u,v,w)>=-1e-6)result=Math.max(result,u*a[1]+v*b[1]+w*c[1]);}return result;}

test('the approved edit moves from social life to public face, service and work without replacing the player route',()=>{
 assert.equal(C.duration,36.5);assert.equal(SHOTS.length,8);assert.equal(C.birdsEnabled,false,'retained bird assets are not part of the active edit');assert.deepEqual(C.readyShotIds,SHOTS.map(s=>s.id));
 assert.deepEqual(SHOTS.map(s=>s.sourcePlanId),['R01','R02','R03','R04','R05','R06','R07','R08']);
 assert.deepEqual(SHOTS.map(s=>s.id),['pub-evening','vigil','ellery-title','service-approach','room-chamber','room-b3','tower','return']);
 assert.equal(SHOTS[0].start,0);assert.equal(SHOTS.at(-1).end,C.duration);
 for(let k=1;k<SHOTS.length;k++)assert.equal(SHOTS[k-1].end,SHOTS[k].start,'each threshold belongs to one receiving shot');
 for(const s of SHOTS){const f=openingOvertureFrame(s.start,{returnView:{eye:[17.13,1.74,9.31],yaw:-1.21,pitch:.27,renderGroup:'ground',floorH:.12}});assert.equal(f.shotId,s.id);assert.equal(f.sourcePlanId,s.sourcePlanId);assert.equal(f.controlsEnabled,false);assert.equal(f.titleAlpha,0,'no explanatory title is inserted over these compositions');assert.equal(f.birdPresentation,false);assert.equal(f.birdsVisible,false);}
 assert.equal(openingOvertureFrame(0).black,1,'the chosen vehicle exit can hand over under black');
 assert.ok(openingOvertureFrame(.3).black<1);assert.equal(openingOvertureFrame(1).shotId,'pub-evening','the score entrance belongs to the new social image, not a resurrected birds shot');
});

test('every authored camera continues through its cut while reduced motion removes camera and focus pumping',()=>{
 for(const s of SHOTS.filter(s=>!s.dynamicReturn)){
  const duration=s.end-s.start,a=openingOvertureFrame(s.end-.5),b=openingOvertureFrame(s.end-1/24);
  assert.ok(Math.hypot(...a.eye.map((v,k)=>v-b.eye[k]))>.02,`${s.id} must retain useful travel in its final half-second`);
  const reducedA=openingOvertureFrame(s.start+.05,{reducedMotion:true}),reducedB=openingOvertureFrame(s.end-.05,{reducedMotion:true});
  const fullA=openingOvertureFrame(s.start+.05),fullB=openingOvertureFrame(s.end-.05);
  const reducedDrift=Math.hypot(...reducedB.eye.map((v,k)=>v-reducedA.eye[k])),fullTravel=Math.hypot(...fullB.eye.map((v,k)=>v-fullA.eye[k]));
  assert.ok(reducedDrift>.01&&reducedDrift<fullTravel*.7,s.id+' reduced camera keeps a slow drift and never a whip');
  assert.deepEqual(reducedA.lens,reducedB.lens,s.id+' reduced focus does not pump');
  for(let local=0;local<duration;local+=1/24){const f=openingOvertureFrame(s.start+local);assert.ok([...f.eye,...f.target,f.yaw,f.pitch].every(Number.isFinite));assert.ok(Math.abs(f.pitch)<=Math.PI/2);assert.equal(f.observer.renderGroup,f.renderGroup);}
 }
});

test('each local interaction or architectural axis remains on one camera side through the authored move',()=>{
 for(const s of SHOTS.filter(s=>!s.dynamicReturn)){
  const line=s.axisGeometry?.lineXZ;assert.ok(line,s.id+' declares its own local axis');const [[ax,az],[bx,bz]]=line,signs=new Set();
  assert.ok(Math.hypot(bx-ax,bz-az)>.1);
  for(let local=0;local<s.duration;local+=1/24){const f=openingOvertureFrame(s.start+local),side=(bx-ax)*(f.eye[2]-az)-(bz-az)*(f.eye[0]-ax);if(Math.abs(side)>1e-7)signs.add(Math.sign(side));}
  assert.ok(signs.size<=1,s.id+' must not silently reverse its declared local axis');
 }
});

test('cinematic optics remain finite and develop attention by range while the existing rooms retain their floor bands',()=>{
 FP.compile(conservatory.levels,conservatory);
 for(const s of SHOTS.filter(s=>!s.dynamicReturn))for(const fraction of[0,.25,.5,.75,.999]){
  const f=openingOvertureFrame(s.start+s.duration*fraction),l=f.lens;assert.ok(l);assert.deepEqual(Object.keys(l).sort(),['apertureFNumber','focalLengthMm','focusDistanceM','maxBlurPx','sensorHeightMm']);
  assert.ok(Object.values(l).every(Number.isFinite));close(l.sensorHeightMm,12.445,'selected gate');assert.ok(l.focalLengthMm>=21&&l.focalLengthMm<=65);assert.ok(l.apertureFNumber>=4&&l.apertureFNumber<=8);assert.ok(l.focusDistanceM>=.1&&l.maxBlurPx<=12);
  const view=openingArrivalWorldView({...f,openingOverture:true},FP,{cell:CELL});assert.ok(view,s.id+' has a valid render observer');assert.deepEqual(view.authoredCamera.eye,f.eye,'the envelope observer cannot replace the physical camera');assert.equal(view.renderGroup,f.renderGroup);
  if(['room-b3','room-chamber'].includes(s.id)){const logical=FP.logicalAtPhysical(f.eye[0]/CELL,f.eye[2]/CELL,{group:f.renderGroup,floor:f.floorH});assert.ok(logical,s.id+' retains its existing physical room');assert.equal(FP.isSolid(logical.x,logical.y),false,s.id+' camera does not occupy masonry');close(FP.logicalToPhysical(logical.x,logical.y).y,f.floorH);}
 }
 for(const id of['pub-evening','room-chamber']){const s=SHOTS.find(s=>s.id===id),a=openingOvertureFrame(s.start+.01),b=openingOvertureFrame(s.end-.01);assert.ok(b.lens.focusDistanceM>a.lens.focusDistanceM+.4,id+' develops attention from the near plane into the working depth');}
});

test('the first return frame restores the exact saved pose and ordinary projection under an authored black crossing',()=>{
 const back={eye:[17.13,1.74,9.31],yaw:-1.21,pitch:.27,renderGroup:'ground',floorH:.12},copy=JSON.stringify(back),s=SHOTS.at(-1);
 assert.equal(s.id,'return');assert.equal(s.start,34.5);assert.throws(()=>openingOvertureFrame(s.start),TypeError,'a native return must not invent a player pose');assert.ok(openingOvertureFrame(s.start-1/24,{returnView:back}).black>.98);
 for(const reducedMotion of[false,true])for(const time of[s.start,s.start+.15,s.start+.7,C.duration-.01,C.duration]){
  const f=openingOvertureFrame(time,{returnView:back,reducedMotion});assert.deepEqual(f.eye,back.eye);assert.equal(f.yaw,back.yaw);assert.equal(f.pitch,back.pitch);assert.equal(f.renderGroup,back.renderGroup);assert.equal(f.floorH,back.floorH);assert.equal(f.lens,null,'cinematic focus ownership is cleared before reveal');
  if(time<s.start+.18)assert.equal(f.black,1);if(time>=s.start+.7)assert.equal(f.black,0);
 }
 assert.equal(JSON.stringify(back),copy);assert.equal(openingOvertureFrame(C.duration,{returnView:back}).done,true);
});

test('the Tower remains the shipped architectural mass rather than a replacement or transplanted route',()=>{
 const tower=SHOTS.find(s=>s.id==='tower');assert.equal(tower.architecture.asset,'assets/ellery-public-front.glb');assert.equal(tower.architecture.mesh,'conservatory_west_elevation');
 const source=parseGlb(fs.readFileSync(new URL('../public/'+tower.architecture.asset,import.meta.url))),rows=triangles(source,tower.architecture.mesh).map(t=>t.map(p=>p.map((v,k)=>v+tower.architecture.anchor[k]))),upper=rows.filter(t=>t.every(p=>p[0]>101&&p[0]<109&&p[2]>70&&p[2]<79&&p[1]>=17));
 assert.ok(upper.length>200);close(Math.max(...upper.flat().map(p=>p[1])),27.7,'shipped slate point');
 const final=openingOvertureFrame(tower.end-.01);assert.equal(final.renderGroup,'ground');assert.ok(final.eye[1]>12,'the elevated viewpoint retains its intended scale');
});

test('the standalone asset is deterministic, finite solid geometry with ten articulated bird parts and one parking marking and no external textures',()=>{
 const rebuilt=buildOpeningOverture({write:false});assert.equal(Buffer.compare(bytes,rebuilt.buffer),0);assert.equal(stats.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(stats.bytes,bytes.length);assert.equal(stats.triangles,8844);assert.ok(stats.bytes<1000000&&stats.triangles<9000);assert.deepEqual(asset.json.meshes.map(m=>m.name).sort(),[...C.requiredMeshes].sort());assert.equal(asset.json.nodes.length,11);assert.equal(asset.json.animations,undefined);assert.equal(asset.json.images,undefined);assert.equal(credits.license,'CC0-1.0');assert.deepEqual(credits.externalSources,[]);
 for(const m of asset.json.meshes){let faces=0;for(const p of m.primitives){const positions=read(asset,p.attributes.POSITION),normals=read(asset,p.attributes.NORMAL);assert.ok(positions.flat().every(Number.isFinite));assert.ok(normals.flat().every(Number.isFinite));assert.ok(normals.every(n=>Math.abs(Math.hypot(...n)-1)<1e-5));faces+=read(asset,p.indices).length/3;assert.deepEqual(asset.json.materials[p.material].emissiveFactor,[0,0,0]);}assert.ok(faces>=100,m.name+' has actual detailed geometry');}
 assert.ok(stats.meshes.find(m=>m.name.endsWith('wing_outer_l')).triangles>300);assert.ok(stats.meshes.find(m=>m.name.endsWith('foot_r')).triangles>200);
});

test('all five birds plant real toes on shipped roof triangles, then push into separate continuous powered paths',()=>{
 const source=parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url))),roof=triangles(source,'yard_stable_range').map(ps=>ps.map(p=>[p[0]+36,p[1],p[2]+18]));
 assert.equal(BIRDS.length,5);assert.equal(new Set(BIRDS.map(b=>b.takeoffAt)).size,5);assert.equal(new Set(BIRDS.map(b=>b.heading)).size,5);
 for(const bird of BIRDS){close(bird.perch[1]-height(roof,bird.perch[0],bird.perch[2]),.005,'actual roof-height provenance');const feet=openingOvertureBirdInstances(bird.takeoffAt-.001).filter(p=>p.birdId===bird.id&&p.birdPart.startsWith('foot_'));assert.equal(feet.length,2);let lowest=Infinity;for(const foot of feet)for(const triangle of triangles(asset,foot.mesh))for(const v of triangle){const world=point(foot.matrix,v),clearance=world[1]-height(roof,world[0],world[2]);lowest=Math.min(lowest,clearance);assert.ok(clearance>=-.003,'solid toes cannot sink into the roof');}assert.ok(lowest>=-.003&&lowest<.012,'real toes remain planted, rather than a floating silhouette');
  assert.deepEqual(openingOvertureBirdPose(bird,bird.takeoffAt-.001).position,bird.perch);close(Math.hypot(...openingOvertureBirdPose(bird,bird.takeoffAt+.000001).position.map((v,k)=>v-bird.perch[k])),0,'continuous launch');for(const age of[.05,.15,.3,1,2]){const pose=openingOvertureBirdPose(bird,bird.takeoffAt+age);assert.ok(pose.position[1]>bird.perch[1]);assert.equal(pose.grounded,false);assert.ok([...pose.position,pose.wingAngle,pose.heading].every(Number.isFinite));if(age<.4){const footParts=openingOvertureBirdInstances(bird.takeoffAt+age).filter(p=>p.birdId===bird.id&&p.birdPart.startsWith('foot_'));for(const p of footParts)assert.ok(p.y>height(roof,p.x,p.z)-.01,'takeoff clears the actual roof');}}
 }
});

test('bird articulation has one bounded real geometry submission per part, obeys pause clocks and preserves reduced-motion travel',()=>{
 const a=openingOvertureBirdInstances(2.4),b=openingOvertureBirdInstances(2.4);assert.deepEqual(a,b);assert.equal(a.length,50);assert.equal(new Set(a.map(p=>p.id)).size,50);assert.ok(a.every(p=>C.requiredMeshes.includes(p.mesh)&&p.matrix.length===16&&p.matrix.every(Number.isFinite)&&p.noCollision&&!p.walkable));
 for(const bird of BIRDS){const ordinary=openingOvertureBirdPose(bird,2.4),reduced=openingOvertureBirdPose(bird,2.4,{reducedMotion:true});assert.deepEqual(ordinary.position,reduced.position);assert.equal(ordinary.heading,reduced.heading);}
 const before=openingOvertureBirdInstances(1.4),after=openingOvertureBirdInstances(1.45);assert.notDeepEqual(before.filter(p=>p.birdPart==='wing_inner_l').map(p=>p.matrix),after.filter(p=>p.birdPart==='wing_inner_l').map(p=>p.matrix));assert.deepEqual(openingOvertureBirdInstances(C.birdsVisibleUntil+.001),[]);
});


test('the parking bay is sparse worn real ivory paint on a2.8m by6.2m footprint with an open centre',()=>{
 const mesh=asset.json.meshes.find(m=>m.name==='overture_parking_bay');assert.ok(mesh);assert.equal(mesh.extras.role,'parking-marking');assert.equal(mesh.extras.noCollision,true);const s=stats.meshes.find(m=>m.name===mesh.name);assert.deepEqual(s.bounds.min,[-1.4,.010,-3.1]);assert.deepEqual(s.bounds.max,[1.4,.014,3.1]);const rows=triangles(asset,mesh.name);assert.equal(height(rows,0,0),-Infinity);assert.ok(Number.isFinite(height(rows,1.365,3.06)));assert.equal(height(rows,1.365,.72),-Infinity,'each dashed side has a real worn gap');let area=0;for(const[a,b,c]of rows)if(Math.abs(a[1]-.014)<1e-6&&Math.abs(b[1]-.014)<1e-6&&Math.abs(c[1]-.014)<1e-6)area+=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;assert.ok(area>.35&&area<.48,'only the corner and dashed paint remains, not a filled rectangle');const material=asset.json.materials[mesh.primitives[0].material];assert.equal(material.name,'opening pigeon worn ivory parking paint');assert.deepEqual(material.emissiveFactor,[0,0,0]);
});
