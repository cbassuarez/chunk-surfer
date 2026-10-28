import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {anatomyOrganPose,ribPose,COSTAL_CARDIAC} from '../src/game/source-drive/cut/landscape-motion.js';
import {makeCutLandscape,CUT_THORAX_CHAMBERS,CUT_THORAX_ORGANS} from '../src/game/source-drive/cut/landscape-scene.js';
import {makeCutScene,cutColliders} from '../src/game/source-drive/cut/scene.js';
import {worldAt,roadSurfaceAt} from '../src/game/source-drive/road.js';
import {makeDriveScene} from '../src/game/source-drive/scene.js';
import {createDrive} from '../src/game/source-drive/drive-state.js';
import {cameraBasis} from '../src/render/camera-basis.js';
import {CUT_HEART_CENTER} from '../src/game/source-drive/cut/anatomy-layout.js';
import {fitActualHeart} from '../tools/chunk_surfer/source-drive-study/thorax-organ-source.mjs';

const evolution={reveal:1,ribcage:1,wave:1};
const input=(timeSec=8)=>({timeSec,furthest:930,distance:829,evolution});
const state=(timeSec=8,distance=829)=>{const a=worldAt(distance,-1.35);return{x:a.x,z:a.z,heading:a.heading,furthest:930,programTime:timeSec};};
const names=['tension','shear','breath','recoil'];
function actualAsset(){const b=readFileSync(new URL('../public/assets/source-drive/cut/cut-landscape.glb',import.meta.url));return parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
function vertex(p,v,weights){const q=Array.from(p.positions.slice(v*3,v*3+3));for(let j=0;j<p.targets.length;j++)for(let k=0;k<3;k++)q[k]+=p.targets[j].positions[v*3+k]*weights[j];return q;}
const world=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]-32,m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]-32];
function posed(entry,descriptor){const w=names.map(n=>descriptor.morphs[n]);return entry.primitives.flatMap(p=>Array.from({length:p.vertexCount},(_,v)=>vertex(p,v,w)));}
function bounds(points){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of points)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}return{lo,hi,extent:hi.map((x,k)=>x-lo[k])};}

test('one organ cavity occupies the real central chamber while all six cages carry cartilage and intercostal vessels',()=>{
 const scene=makeCutLandscape(state(),evolution),anchor=worldAt(829);
 for(const mesh of CUT_THORAX_ORGANS.meshes){const placed=scene.props.filter(p=>p.mesh===mesh);assert.equal(placed.length,1,mesh);const p=placed[0];assert.equal(p.cullRadius,45);assert.deepEqual([p.matrix[12],p.matrix[13],p.matrix[14]],[32+anchor.x,anchor.y,32+anchor.z]);assert.ok(Math.abs(Math.hypot(...p.matrix.slice(0,3))-1)<1e-9);assert.equal(p.matrix[5],1);assert.equal(p.character.motion.distance,829);}
 for(const mesh of['cut_costal_cartilage','cut_intercostal_vessels']){const placed=scene.props.filter(p=>p.mesh===mesh);assert.equal(placed.length,CUT_THORAX_CHAMBERS.length);assert.ok(placed.every(p=>p.cullRadius===45));}
 assert.equal(scene.sources.filter(s=>s.motion.kind==='anatomy'&&CUT_THORAX_CHAMBERS.some(c=>c.id===s.id)).length,6,'existing positioned cage sources remain authoritative');
 assert.equal(scene.sources.some(s=>s.id.startsWith(CUT_THORAX_ORGANS.id)),false,'organ meshes do not add a second soundscape');
 assert.equal(makeCutScene(state(),evolution).sources.length,3,'host retains its existing nearest-three sound budget');
 assert.deepEqual(cutColliders(state()),[]);
});

test('cardiac contraction is distinct from respiration, shared by the coronary tree, bounded and continuous on the saved clock',()=>{
 let low=1,high=0,maxStep=0;
 for(let t=0;t<4;t+=.005){const a=anatomyOrganPose('cut_heart',input(t)),b=anatomyOrganPose('cut_heart',input(t+.005)),coronary=anatomyOrganPose('cut_coronary_vessels',input(t)),rib=ribPose(input(t));assert.deepEqual(a.morphs,coronary.morphs);assert.equal(a.morphs.breath,rib.morphs.breath);assert.equal(a.morphs.recoil,rib.morphs.recoil);for(const x of Object.values(a.morphs))assert.ok(Number.isFinite(x)&&x>=0&&x<=1);low=Math.min(low,a.morphs.tension);high=Math.max(high,a.morphs.tension);maxStep=Math.max(maxStep,Math.abs(a.morphs.tension-b.morphs.tension));const later=anatomyOrganPose('cut_heart',input(t+COSTAL_CARDIAC.periodSeconds));assert.ok(Math.abs(a.morphs.tension-later.morphs.tension)<1e-10,'heart phase is a function of saved programme time');}
 assert.ok(low<.07&&high>.92,'a contraction has a real resting interval and full impulse');assert.ok(maxStep<.08,'no discontinuity at the heartbeat or period boundary');
 for(const mesh of['cut_lungs','cut_great_vessels','cut_diaphragm','cut_wet_blood'])assert.deepEqual(anatomyOrganPose(mesh,input()).morphs,ribPose(input()).morphs,mesh+' retains respiratory attachments');
});

test('waiting keeps organ motion alive while exact time, reverse and checkpoint restoration cannot restart or heal it',()=>{
 const s=state(8),a=makeCutLandscape(s,evolution),paused=makeCutLandscape(JSON.parse(JSON.stringify(s)),evolution),reverse=makeCutLandscape(state(8,850),evolution),later=makeCutLandscape(state(8.15),evolution);
 assert.deepEqual(paused,a);
 for(const mesh of CUT_THORAX_ORGANS.meshes){const p=a.props.find(p=>p.mesh===mesh);assert.deepEqual(reverse.props.find(p=>p.mesh===mesh),p);assert.equal(p.character.morphs.breath,1);assert.deepEqual(p.character.motion.rootTranslation,[0,0,0]);assert.notDeepEqual(later.props.find(p=>p.mesh===mesh).character.morphs,p.character.morphs);}
 for(const mesh of CUT_THORAX_ORGANS.meshes){const hidden=anatomyOrganPose(mesh,{timeSec:8,furthest:0,distance:829,evolution:{reveal:0,ribcage:0,wave:0}});assert.ok(Object.values(hidden.morphs).every(x=>x===0),'unrevealed anatomy stays dormant');}
 assert.deepEqual(makeCutScene({...s,cutEnabled:false},evolution).props,[],'the existing disabled Cut gate also removes organs');
});

test('every submitted anatomical mesh resolves in the production character pack with the actual four target names',()=>{
 const asset=actualAsset(),scene=makeCutLandscape(state(),evolution),meshes=[...CUT_THORAX_ORGANS.meshes,'cut_costal_cartilage','cut_intercostal_vessels'];
 for(const mesh of meshes){const entry=asset.entries.find(e=>e.name===mesh);assert.ok(entry,mesh+' is actually packed');assert.deepEqual(entry.morphNames,names);assert.ok(entry.primitives.some(p=>p.vertexCount>100&&p.indices.length>300),'anatomy has actual volume geometry');const prop=scene.props.find(p=>p.mesh===mesh),pose=sampleCharacterPose(asset,entry,prop.character);assert.deepEqual(Array.from(pose.morphs),names.map(n=>Math.fround(prop.character.morphs[n])));assert.ok([...pose.bones,...pose.morphs].every(Number.isFinite));}
});

test('the real packed rib blades rotate broadly, lungs expand and the diaphragm descends through actual respiratory samples',()=>{
 const asset=actualAsset(),samples=Array.from({length:545},(_,i)=>ribPose(input(i*.025))),low=samples.reduce((a,b)=>a.motion.physiology.respiration<b.motion.physiology.respiration?a:b),high=samples.reduce((a,b)=>a.motion.physiology.respiration>b.motion.physiology.respiration?a:b);
 const bone=asset.entries.find(e=>e.name==='cut_thoracic_bone'),a=posed(bone,low),b=posed(bone,high);let moved=0,max=0,fixed=0;
 for(const entry of[bone,asset.entries.find(e=>e.name==='cut_costal_cartilage')])entry.primitives.forEach(p=>{for(let v=0;v<p.vertexCount;v++){const rest=vertex(p,v,[0,0,1,0]);if(rest[1]<=1.2){for(const target of p.targets)assert.ok(Math.hypot(...target.positions.slice(v*3,v*3+3))<1e-8,'rib/cartilage toe contacts cannot wander');fixed++;}}});
 for(let i=0;i<a.length;i++){const displacement=Math.hypot(...a[i].map((x,k)=>x-b[i][k]));max=Math.max(max,displacement);if(displacement>1)moved++;}
 assert.ok(fixed>30,'actual blade roots were checked');assert.ok(moved>500&&max>1.4,'full respiratory samples must articulate a broad rib region, rather than merely change scalar telemetry');
 const lungs=asset.entries.find(e=>e.name==='cut_lungs'),lungLow=posed(lungs,anatomyOrganPose('cut_lungs',input(low.motion.timeSec))),lungHigh=posed(lungs,anatomyOrganPose('cut_lungs',input(high.motion.timeSec))),ll=bounds(lungLow),lh=bounds(lungHigh);
 assert.ok(lh.extent[0]-ll.extent[0]>.6,'paired lungs physically expand laterally');assert.ok(lh.extent[1]-ll.extent[1]>.5,'lung volume expands in a second axis');
 const diaphragm=asset.entries.find(e=>e.name==='cut_diaphragm'),da=posed(diaphragm,anatomyOrganPose('cut_diaphragm',input(low.motion.timeSec))),db=posed(diaphragm,anatomyOrganPose('cut_diaphragm',input(high.motion.timeSec)));let descent=0;
 for(let i=0;i<da.length;i++)descent=Math.max(descent,da[i][1]-db[i][1]);assert.ok(descent>.85,'diaphragm descends during inspiration');
});

test('the actual packed heart contracts in three dimensions and its coronary tree shares the same cardiac phase',()=>{
 const asset=actualAsset(),samples=Array.from({length:245},(_,i)=>anatomyOrganPose('cut_heart',input(i*.005))),low=samples.reduce((a,b)=>a.morphs.tension<b.morphs.tension?a:b),high=samples.reduce((a,b)=>a.morphs.tension>b.morphs.tension?a:b),heart=asset.entries.find(e=>e.name==='cut_heart'),a=posed(heart,low),b=posed(heart,high),ba=bounds(a),bb=bounds(b);
 for(let k=0;k<3;k++)assert.ok(bb.extent[k]<ba.extent[k]*.96,'the heart contracts instead of translating axis'+k);
 assert.ok(bb.extent.reduce((x,y)=>x*y,1)<ba.extent.reduce((x,y)=>x*y,1)*.86,'cardiac impulse changes a substantial actual organ volume envelope');
 const coronary=asset.entries.find(e=>e.name==='cut_coronary_vessels'),c0=posed(coronary,anatomyOrganPose('cut_coronary_vessels',input(low.motion.timeSec))),c1=posed(coronary,anatomyOrganPose('cut_coronary_vessels',input(high.motion.timeSec)));assert.ok(c0.some((p,i)=>Math.hypot(...p.map((x,k)=>x-c1[i][k]))>.2),'attached vascular geometry participates in the pulse');
});

test('the packed heart retains the licensed external chamber anatomy and shipped attribution',()=>{
 const source=fitActualHeart({center:CUT_HEART_CENTER,maxRadii:[3.45,3,5.5]}),asset=actualAsset(),heart=asset.entries.find(e=>e.name==='cut_heart'),p=heart.primitives[0];
 assert.equal(p.vertexCount,new Set(source.indices).size);assert.equal(p.indices.length,source.indices.length);
 // Export compacts unused vertices. Compare the actual indexed triangles,
 // rather than mistaking that harmless remapping for a shape change.
 for(let i=0;i<p.indices.length;i++){const actual=vertex(p,p.indices[i],[0,0,1,0]);for(let k=0;k<3;k++)assert.ok(Math.abs(actual[k]-source.positions[source.indices[i]*3+k])<3e-6,'full reveal preserves the uniformly scaled source surface');}
 const credit=JSON.parse(readFileSync(new URL('../public/assets/source-drive/cut/credits.json',import.meta.url)));
 assert.equal(credit.sourceSha256,'b1237e7e765178e9357fd2ea7ccf19d55d0bf9ca55e187886635febe28244c70');assert.equal(credit.license,'CC-BY-4.0');assert.equal(credit.parts.length,4);assert.match(credit.requiredCredit,/Kristen Browne/);assert.match(credit.adaptation,/LOD/);
 const b=readFileSync(new URL('../public/assets/source-drive/cut/cut-landscape.glb',import.meta.url)),doc=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
 assert.deepEqual(doc.meshes.find(m=>m.name==='cut_heart').extras.provenance.sourceSha256,credit.sourceSha256);
});

test('the existing hold inspection fixture actually faces the cardiac cavity with its emitter on its visible head',()=>{
 const scene=makeCutScene(state(),evolution),lamp=scene.lights.find(l=>l.id==='cut-inspection-hold'),fixture=scene.props.find(p=>p.id===lamp.id),heart=scene.props.find(p=>p.mesh==='cut_heart'),m=heart.matrix,q=CUT_HEART_CENTER,target=[0,1,2].map(k=>m[k]*q[0]+m[k+4]*q[1]+m[k+8]*q[2]+m[k+12]),ray=target.map((v,k)=>v-[lamp.x,lamp.y,lamp.z][k]),distance=Math.hypot(...ray);
 assert.equal(scene.lights.length,2,'no extra inspection light budget');assert.ok(distance<lamp.radius*.8,'the re-aimed cavity remains inside the existing light radius; final contrast needs native review');assert.ok(ray.reduce((s,v,k)=>s+v/distance*lamp.direction[k],0)>.999);
 assert.ok(Math.abs(lamp.x-(fixture.matrix[12]+fixture.matrix[0]*.335))<1e-6);assert.ok(Math.abs(lamp.z-(fixture.matrix[14]+fixture.matrix[2]*.335))<1e-6);assert.equal(lamp.y,fixture.matrix[13]+4.16);
});

const vehicleMetrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
function carFixture(distance,bodyPitch=0,bodyRoll=0,bodyHeave=0){const a=worldAt(distance,-1.35),s={...createDrive(),x:a.x,z:a.z,heading:a.heading,roadHeight:a.height,furthest:930,programTime:8,bodyPitch,bodyRoll,bodyHeave};return makeDriveScene(s,vehicleMetrics);}
let cachedCarEnvelope;
function carEnvelope(){if(cachedCarEnvelope)return cachedCarEnvelope;let height=0;for(let d=815;d<=860;d+=5)for(const pitch of[-.1,.1])for(const roll of[-.1,.1]){const m=carFixture(d,pitch,roll,.15).body;for(let i=0;i<8;i++){const q=[0,1,2].map(k=>vehicleMetrics.body[(i>>k)&1?'max':'min'][k]),p=world(m,q),r=roadSurfaceAt(p[0],p[2]);height=Math.max(height,p[1]-r.height);}}return cachedCarEnvelope=height;}

test('all actual cage and organ placements clear the physical carriageway and stopping bay through macro unfolding and target corners',t=>{
 const asset=actualAsset(),scene=makeCutLandscape(state(),evolution),wanted=new Set([...CUT_THORAX_ORGANS.meshes,'cut_thoracic_bone','cut_sternum','cut_intercostal_depth','cut_intercostal_sheet','cut_periosteum','cut_costal_cartilage','cut_intercostal_vessels']),props=scene.props.filter(p=>wanted.has(p.mesh));let checked=0,min=Infinity;const minByMesh={};
 for(const prop of props){const entry=asset.entries.find(e=>e.name===prop.mesh),m=prop.matrix,distance=prop.character.motion.distance,wScale=Math.hypot(m[0],m[2]);let roadLo=Infinity,roadHi=-Infinity;
  // Bound the entire actual curved carriageway and bay in this placement's
  // local X. The extra metre conservatively covers between-station curvature.
  for(let d=distance-48;d<=distance+48;d+=.25)for(const side of[-1,1]){const r=worldAt(d),edge=worldAt(d,side*(side<0?r.leftWidth:r.rightWidth)),dx=32+edge.x-m[12],dz=32+edge.z-m[14],x=(dx*m[0]+dz*m[2])/(wScale*wScale);roadLo=Math.min(roadLo,x-1);roadHi=Math.max(roadHi,x+1);}
  for(const p of entry.primitives)for(let v=0;v<p.vertexCount;v++)for(let corner=0;corner<8;corner++){
   const w=[corner&1,(corner>>1)&1,0,(corner>>2)&1],a=vertex(p,v,w);w[2]=1;const b=vertex(p,v,w),loX=Math.min(a[0],b[0]),hiX=Math.max(a[0],b[0]);if(hiX<roadLo||loX>roadHi)continue;
   for(let step=0;step<=8;step++){const t=step/8,q=a.map((x,k)=>x+(b[k]-x)*t);if(q[0]<roadLo||q[0]>roadHi)continue;const point=world(m,q),road=roadSurfaceAt(point[0],point[2]),edge=road.offset<0?road.leftWidth:road.rightWidth;if(Math.abs(road.offset)>edge+.35)continue;const clearance=point[1]-road.height;min=Math.min(min,clearance);minByMesh[prop.mesh]=Math.min(minByMesh[prop.mesh]??Infinity,clearance);checked++;assert.ok(clearance>(['cut_heart','cut_coronary_vessels'].includes(prop.mesh)?carEnvelope()+.35:CUT_THORAX_ORGANS.meshes.includes(prop.mesh)?4.2:6.8),`${prop.id} enters road/bay clearance at macro${t}: ${clearance.toFixed(3)}m`);}
  }
 }
 assert.equal(props.length,CUT_THORAX_CHAMBERS.length*7+CUT_THORAX_ORGANS.meshes.length);assert.ok(checked>50000,'the actual overhead road and stopping-bay envelope was exercised');assert.ok(min>carEnvelope()+.35,'lower cardiac presentation retains the measured full-car attitude envelope plus0.35m');t.diagnostic(JSON.stringify({proof:'heart-clearance',checked,minByMesh,carEnvelopeMetres:carEnvelope(),requiredSpareMetres:.35}));
});

// A camera-projectable object can still be hidden by the actual van. Intersect
// rays with the measured windscreen opening, not just a generic screen box.
test('the actual chamber face clears the Transit header on the near approach without shrinking the licensed heart',t=>{
 const asset=actualAsset(),entry=asset.entries.find(e=>e.name==='cut_heart'),opening=vehicleMetrics.windscreenOpening,mount=vehicleMetrics.cabinBodyMount,results=[];
 const dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),sub=(a,b)=>a.map((v,k)=>v-b[k]);
 for(const d of[800,812,815])for(const timeSec of[0,.15,.30,.45,.60,.75,.90,1.05,1.20]){
  const fixture=carFixture(d),m=fixture.body,eye=fixture.eye,prop=makeCutLandscape(state(timeSec,d),evolution).props.find(p=>p.mesh==='cut_heart'),points=posed(entry,prop.character);
  const local=v=>[m[0]*(v[0]-m[12])+m[1]*(v[1]-m[13])+m[2]*(v[2]-m[14]),m[4]*(v[0]-m[12])+m[5]*(v[1]-m[13])+m[6]*(v[2]-m[14]),m[8]*(v[0]-m[12])+m[9]*(v[1]-m[13])+m[10]*(v[2]-m[14])];
  const origin=local(eye),bottom=[opening.left,opening.bottomY,opening.bottomZ].map((v,k)=>v+mount[k]),normal=[0,-(opening.topZ-opening.bottomZ),opening.topY-opening.bottomY];let visible=0;
  const basis=cameraBasis(worldAt(d).heading,-.035),screen=[];
  for(const p of points){const target=[0,1,2].map(k=>prop.matrix[k]*p[0]+prop.matrix[k+4]*p[1]+prop.matrix[k+8]*p[2]+prop.matrix[k+12]),ray=sub(local(target),origin),t=dot(normal,sub(bottom,origin))/dot(normal,ray),hit=origin.map((v,k)=>v+t*ray[k]);if(t>0&&t<1&&hit[0]>=opening.left+mount[0]&&hit[0]<=opening.right+mount[0]&&hit[1]>=opening.bottomY+mount[1]&&hit[1]<=opening.topY+mount[1])visible++;const delta=sub(target,eye),z=dot(delta,basis.forward);screen.push([663.5+dot(delta,basis.right)/z/.65*400,400-dot(delta,basis.up)/z/.65*400]);}
  assert.ok(visible/points.length>.75,`driver${d}m cardiac phase${timeSec}: only${(visible/points.length*100).toFixed(1)}% of the real heart clears the measured windscreen`);
  const width=Math.max(...screen.map(p=>p[0]))-Math.min(...screen.map(p=>p[0]));assert.ok(width>90,'the actual source scale remains readable at1327x800; this is geometry proof, not perceptual acceptance');results.push({distance:d,timeSec,visibleFraction:visible/points.length,widthPixels:width,yPixels:[Math.min(...screen.map(p=>p[1])),Math.max(...screen.map(p=>p[1]))]});
 }
 t.diagnostic(JSON.stringify({proof:'heart-framing',viewport:[1327,800],tanHalfFov:.65,results}));
});
