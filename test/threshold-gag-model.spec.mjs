import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import crypto from 'node:crypto';
import{Box3,Vector3,Triangle,Ray}from'three';
import{thresholdGagGeometry,thresholdGagPosePoint,THRESHOLD_GAG_MODEL as C,THRESHOLD_GAG_MATERIALS as MATERIALS}from'../tools/chunk_surfer/threshold-gag-geometry.mjs';
import{buildThresholdGag}from'../tools/chunk_surfer/build-threshold-gag.mjs';
import{THRESHOLD_GAG as SITE,thresholdGagPoint}from'../src/data/threshold-gag.js';
const geometry=thresholdGagGeometry(),moving=geometry.filter(m=>m.part==='moving');
function eachTriangle(mesh,callback){for(const[material,g]of mesh.groups)for(let k=0;k<g.i.length;k+=3){const points=g.i.slice(k,k+3).map(i=>g.p.slice(i*3,i*3+3));callback(points,material,g,k);}}
const point=p=>new Vector3(...p),rot=(p,a)=>point(thresholdGagPosePoint(p,a));

test('the visible ghost is a finite sided sheet with front-only face/boo paint and a plain reverse',()=>{
 const ghost=geometry.find(m=>m.name==='ellery_threshold_ghost');let reverse=0,front=0,ink=0;
 eachTriangle(ghost,(p,material,g,k)=>{const ids=g.i.slice(k,k+3),normal=ids.map(i=>g.n.slice(i*3,i*3+3));
  if(material===6){ink++;assert.ok(p.every(v=>v[2]>=C.board.frontZ),'eyes, mouth and exact boo! brushwork stay on the front');assert.ok(normal.every(n=>n[2]>.99));}
  if(p.every(v=>Math.abs(v[2]-C.board.backZ)<1e-8)&&normal.every(n=>n[2]<-.99)){reverse++;assert.equal(material,2,'reverse is unfinished hardboard, never mirrored white paint or lettering');}
  if(p.every(v=>Math.abs(v[2]-C.board.frontZ)<1e-8)&&normal.every(n=>n[2]>.99))front++;
 });assert.ok(reverse>10&&front>10&&ink>50);assert.equal(C.text,'boo!');assert.ok(C.board.thickness>=.01&&C.board.thickness<=.02);
});

test('the approved student mock-title is physical reverse-only brushwork inside the existing silhouette',()=>{
 const ghost=geometry.find(m=>m.name==='ellery_threshold_ghost'),label=C.reverseInscription,panel=label.panel;let strokes=0;
 eachTriangle(ghost,(vertices,material,g,k)=>{if(material!==label.inkMaterial)return;strokes++;
  for(const index of g.i.slice(k,k+3)){const p=g.p.slice(index*3,index*3+3),n=g.n.slice(index*3,index*3+3);
   assert.ok(n[2]<-.99,'the title must face an inspecting player behind the cutout');
   assert.ok(p[2]<panel.backZ&&Math.abs(p[2]-label.inkZ)<1e-8,'paint sits on the actual outward reverse face');
   assert.ok(p[0]>panel.minX&&p[0]<panel.maxX&&p[1]>panel.minY&&p[1]<panel.maxY,'lettering stays on the offcut');
  }
 });
 assert.ok(strokes>250,'a substantial, readable multi-line inscription is emitted');
 assert.deepEqual(label.lines,['HIS FEARFUL','MEDIOCRITY']);assert.equal(label.attribution,'ELLERY STUDENTS');
 assert.deepEqual(label.handwrittenLines.map(s=>s.toUpperCase()),label.lines,'mixed-case handwriting retains the exact approved reading');
 assert.equal(label.handwrittenAttribution.toUpperCase(),label.attribution,'informal credit and accessible reading agree');
 // Preserve dark-on-hardboard source separation: the initial pale paint
 // washed out in the actual flashlight/hatch capture. This source check
 // guards that fix; final displayed readability still needs engine review.
 const luminance=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722,inkLight=luminance(MATERIALS[label.inkMaterial][1]),boardLight=luminance(MATERIALS[2][1]);
 assert.ok(inkLight<.02,'the writing remains near-black charcoal ink under the carried lamp');
 assert.ok((boardLight+.05)/(inkLight+.05)>=5,'unfinished hardboard and charcoal retain the source contrast budget');
 // At any player-eye ray normal to the painted front, the original sheet
 // must hide every new inscription vertex. The offcut cannot alter its outline.
 const frontTriangles=[];eachTriangle(ghost,(p,material,g,k)=>{if(material===0&&g.n[g.i[k]*3+2]>.99)frontTriangles.push(p.map(point));});
 const hit=new Vector3(),ink=ghost.groups.get(label.inkMaterial);
 for(let i=0;i<ink.p.length;i+=3){const target=point(ink.p.slice(i,i+3)),eye=target.clone().setZ(.5),ray=new Ray(eye,new Vector3(0,0,-1)),span=eye.distanceTo(target);
  assert.ok(frontTriangles.some(([a,b,c])=>ray.intersectTriangle(a,b,c,false,hit)&&hit.distanceTo(eye)<span-.01),'student writing may not peek beyond the original white silhouette');
 }
});

test('the complete emitted moving geometry clears the concealment flat through the full swing and rebound',()=>{
 const wallMinX=C.scenery.minX;
 for(let k=0;k<=180;k++){const angle=k/180*Math.PI/2;for(const mesh of moving)for(const g of mesh.groups.values())for(let i=0;i<g.p.length;i+=3){const p=thresholdGagPosePoint(g.p.slice(i,i+3),angle);assert.ok(p[0]<wallMinX-.015,`${mesh.name} at ${angle}: X=${p[0]}`);}}
});

test('actual moving triangles stop at the wood block and clear fixed timber without a rebound penetration',()=>{
 // These are the physical stop and mounting timber's interior, shrunk by
 // 0.5mm so deliberate boundary contact is not reported as penetration.
 const stop=new Box3(point([-.2795,-.0645,.0305]),point([-.2105,.0645,.0795])),mount=new Box3(point([.0105,-.1195,.0335]),point([.1995,.1195,.1625]));
 for(let k=0;k<=90;k++){const angle=k/90*Math.PI/2;for(const mesh of moving)eachTriangle(mesh,p=>{const t=new Triangle(...p.map(v=>rot(v,angle)));assert.equal(stop.intersectsTriangle(t),false,`stop penetration at ${angle}, ${mesh.name}`);assert.equal(mount.intersectsTriangle(t),false,`mount penetration at ${angle}, ${mesh.name}`);});}
 // The rotating arm's actual +Z face lies on the stop plane at zero angle.
 const arm=geometry.find(m=>m.name==='ellery_threshold_armature').groups.get(3),face=[];
 for(let i=0;i<arm.p.length;i+=3){const p=arm.p.slice(i,i+3);if(p[0]>=-.77&&p[0]<=0&&Math.abs(p[1])<.053&&Math.abs(p[2]-.030)<1e-8)face.push(p);}
 assert.ok(face.length>=4);assert.equal(C.contact.movingArmFrontZ,C.contact.stopMinZ);
});

test('the frontal apron and projecting slot cleat clear every emitted moving triangle throughout swing and rebound',()=>{
 const a=C.frontalApron,epsilon=.0005,volume=(min,max)=>new Box3(point(min.map(v=>v+epsilon)),point(max.map(v=>v-epsilon))),volumes=[
  volume([a.minX,a.slotMaxY,a.minZ],[a.maxX,C.scenery.topY,a.maxZ]),
  volume([a.minX,C.scenery.floorY,a.minZ],[a.maxX,a.slotMinY,a.maxZ]),
  volume([a.breastplate.minX,a.breastplate.minY,a.breastplate.minZ],[a.breastplate.maxX,a.breastplate.maxY,a.breastplate.maxZ]),
 ];
 for(let k=0;k<=180;k++){const angle=k/180*Math.PI/2;for(const mesh of moving)eachTriangle(mesh,p=>{const t=new Triangle(...p.map(v=>rot(v,angle)));for(const box of volumes)assert.equal(box.intersectsTriangle(t),false,`${mesh.name} penetrates apron at ${angle}`);});}
});

test('actual fixed triangles hide the whole folded ghost and tab on the returned fake-Ellery approach',()=>{
 const ghosts=geometry.find(m=>m.name==='ellery_threshold_ghost'),targets=new Map(),fixed=[];
 for(const g of ghosts.groups.values())for(let i=0;i<g.p.length;i+=3){const p=thresholdGagPosePoint(g.p.slice(i,i+3),C.restAngle);targets.set(p.map(v=>v.toFixed(6)).join(','),p);}
 for(const m of geometry.filter(m=>m.part==='fixed'))eachTriangle(m,p=>fixed.push(p.map(point)));
 const{mount}=SITE,c=Math.cos(mount.yaw),s=Math.sin(mount.yaw),hit=new Vector3();
 // Read the live fake-Ellery rig site and its trigger/arming positions.
 // The real copied practice route is at Z58.75 with eyeY6.42.
 for(const worldX of[SITE.triggerX,SITE.armX,73,75]){
  const dx=worldX-mount.x,dz=58.75-mount.z,eyeY=SITE.feet+SITE.eyeHeight,eye=point([c*dx+s*dz,eyeY-mount.y,-s*dx+c*dz]);
  for(const p of targets.values()){const target=point(p),span=target.distanceTo(eye),ray=new Ray(eye,target.clone().sub(eye).normalize());
   const hidden=fixed.some(([a,b,c])=>ray.intersectTriangle(a,b,c,false,hit)&&hit.distanceTo(eye)<span-.001);
   assert.ok(hidden,`visible folded point at worldX${worldX}: ${p}`);
  }
 }
});

test('the entire actual swing remains clear of the necessary copied-Ellery walking lane',()=>{
 let maximumZ=-Infinity;
 for(let k=0;k<=180;k++){const angle=k/180*Math.PI/2;for(const mesh of moving)for(const g of mesh.groups.values())for(let i=0;i<g.p.length;i+=3){const p=thresholdGagPoint(g.p.slice(i,i+3),angle);maximumZ=Math.max(maximumZ,p.z);}}
 const laneZ=58.75,bodyRadius=SITE.bodyRadius;
 assert.ok(laneZ-maximumZ>=bodyRadius+.10,`moving apparatus leaves only ${laneZ-maximumZ-bodyRadius}m beyond the body's radius`);
});

test('the speaker anchor is on the actual reverse driver and follows the same mounted rigid pose',()=>{
 const armature=geometry.find(m=>m.name==='ellery_threshold_armature'),anchor=C.anchors.speaker;
 assert.ok(anchor[2]<C.board.backZ-.1);let nearest=Infinity;
 eachTriangle(armature,(points,material)=>{if(material!==8&&material!==7)return;for(const p of points)nearest=Math.min(nearest,Math.hypot(...p.map((v,k)=>v-anchor[k])));});
 assert.ok(nearest<.08,'anchor belongs at the real speaker cone, not at the player or hinge');
 assert.deepEqual(SITE.speaker,C.anchors.speaker,'live positional sound uses the real modeled driver');assert.deepEqual(SITE.contact,C.anchors.stop,'live stop cue uses the real modeled wood contact');
 const{mount}=SITE;for(const angle of[0,.04,.1,.7,Math.PI/2]){const p=thresholdGagPoint(anchor,angle);assert.ok(Math.abs(Math.hypot(p.x-mount.x,p.z-mount.z)-Math.hypot(anchor[0],anchor[2]))<1e-8);}
});

test('the shipped dedicated GLB is reproducible and contains only the single approved apparatus',async()=>{
 const built=await buildThresholdGag({write:false}),disk=await fs.readFile(new URL('../public/assets/ellery-threshold-gag.glb',import.meta.url));
 assert.deepEqual(disk,built.bytes);assert.equal(crypto.createHash('sha256').update(disk).digest('hex'),built.stats.sha256);
 assert.ok(built.stats.totalTriangles<10000&&built.stats.bytes<1000000);assert.equal(built.stats.images,0,'not the supplied concept pasted onto a plane');
 assert.deepEqual(built.stats.metadata.movingMeshes,C.movingMeshes);assert.equal(built.stats.metadata.meshes.filter(m=>m.part==='moving').length,2);
});
