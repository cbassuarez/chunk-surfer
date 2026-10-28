import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import crypto from'node:crypto';import{NodeIO}from'@gltf-transform/core';
import{ELLERY_PUBLIC_FRONT as C,ELLERY_PUBLIC_FORECOURT_LEVEL as LEVEL,ELLERY_PUBLIC_FRONT_PROPS,ELLERY_PUBLIC_FRONT_LETTERING as COPY,ELLERY_PUBLIC_FRONT_HERO_CLIPS as HERO_CLIPS}from'../src/data/ellery-public-front.js';
import{GLASS_COURT_SIGHTLINES}from'../src/data/glass-court-sightlines.js';
import{elleryPublicFrontGeometry,heroFingerprint}from'../tools/chunk_surfer/ellery-public-front-geometry.mjs';
const source=process.env.ELLERY_PUBLIC_SOURCE_PACK||new URL('../public/assets/conservatory-props.glb',import.meta.url),io=new NodeIO();
const before=await io.readBinary(fs.readFileSync(source)),bytes=fs.readFileSync(new URL('../public/assets/ellery-public-front.glb',import.meta.url)),after=await io.readBinary(bytes),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/ellery-public-front.stats.json',import.meta.url))),models=elleryPublicFrontGeometry();
const contains=(p,q)=>p.kind==='box'&&q.every((v,k)=>Math.abs(v-p.center[k])<p.size[k]/2-1e-6);
const triangle=(p,ids)=>ids.map(i=>({position:p.getAttribute('POSITION').getElement(i,[]),normal:p.getAttribute('NORMAL').getElement(i,[]),uv:p.getAttribute('TEXCOORD_0').getElement(i,[])}));
const outside=(tri,epsilon=1e-6)=>HERO_CLIPS.every(box=>[0,1,2].some(k=>tri.every(v=>v.position[k]<=box.min[k]+epsilon)||tri.every(v=>v.position[k]>=box.max[k]-epsilon)));
const triKey=(mat,t)=>JSON.stringify([mat,t.map(v=>[...v.position,...v.normal,...v.uv])]);

test('dedicated pack owns only the existing hero repair and three bounded public-front meshes',()=>{
 assert.deepEqual(after.getRoot().listMeshes().map(m=>m.getName()),[C.hero.mesh,...models.map(m=>m.name)]);
 assert.equal(stats.sourcePack.unchangedDuringBuild,true);assert.equal(stats.protectedMeshes.allUnmodifiedInSourcePack,true);
 assert.ok(stats.addedTriangles<=C.maximumAddedTriangles);assert.ok(stats.addedBytes<=C.maximumAddedBytes);
 assert.ok(stats.baselineHeroBytes>0&&stats.addedBytes===stats.bytes-stats.baselineHeroBytes);
 assert.ok(ELLERY_PUBLIC_FRONT_PROPS.every(p=>p.blocks===false&&p.floorOverride===0));
 assert.equal(ELLERY_PUBLIC_FRONT_PROPS[0].renderOffsetZ,-.25);
});

test('hero trimming leaves no scenic surface through the real atrium or greenhouse and preserves all protected triangles exactly',()=>{
 const a=before.getRoot().listMeshes().find(m=>m.getName()===C.hero.mesh),b=after.getRoot().listMeshes().find(m=>m.getName()===C.hero.mesh);
 assert.equal(heroFingerprint(a),stats.sourceHero.fingerprint,'only a changed hero requires extraction again, not unrelated main-pack edits');
 const out=new Map();for(const p of b.listPrimitives()){const ix=p.getIndices().getArray();for(let i=0;i<ix.length;i+=3){const t=triangle(p,[ix[i],ix[i+1],ix[i+2]]);assert.ok(outside(t,1e-4),'no retained triangle crosses either actual occupied-air clip');const k=triKey(p.getMaterial().getName(),t);out.set(k,(out.get(k)||0)+1);}}
 let protectedCount=0,originalIntrusions=0;
 for(const p of a.listPrimitives()){
  const ix=p.getIndices().getArray(),m=p.getMaterial();
  for(let i=0;i<ix.length;i+=3){const t=triangle(p,[ix[i],ix[i+1],ix[i+2]]);if(!outside(t,-1e-5)){originalIntrusions++;continue;}const k=triKey(m.getName(),t);assert.ok(out.get(k)>0,'every wholly protected source triangle survives without changing position, normal, UV or winding');out.set(k,out.get(k)-1);protectedCount++;}
  const other=b.listPrimitives().find(q=>q.getMaterial().getName()===m.getName())?.getMaterial();if(!other)continue;
  for(const get of['getBaseColorFactor','getMetallicFactor','getRoughnessFactor','getEmissiveFactor','getExtras'])assert.deepEqual(other[get](),m[get]());
  for(const get of['getBaseColorTexture','getNormalTexture','getMetallicRoughnessTexture'])assert.deepEqual(other[get]()?.getImage(),m[get]()?.getImage());
 }
 assert.ok(protectedCount>16000,'the bounded repair retains the overwhelming majority of the original scenic work');
 assert.ok(originalIntrusions>0,'the original source mesh actually contains the intrusion caught by this check');
});

test('new public wall respects the real paired entrance and W3 through-aperture',()=>{
 const front=models.find(m=>m.name===C.facade.mesh);
 for(const[x,y]of[[78.25,.5],[79,1.7],[79.75,3.2],[84.25,1.2],[86,2.1],[87.75,3.3]])for(const z of[2.8,3.05,3.25])assert.equal(front.parts.some(p=>contains(p,[x,y,z])),false,'public door and window are real masonry holes');
 assert.ok(front.parts.some(p=>contains(p,[76,2,3.1])),'the public front is a wall, not only freestanding ornament');
 assert.ok(front.parts.some(p=>contains(p,[90,2,3.1])));
 assert.ok(COPY.every(p=>p.readerRight[0]===-1),'lettering faces the north public approach, not the inside of its carrier');
 assert.ok(COPY.some(p=>p.lines.join(' ').includes('WEST SERVICE YARD')),'closed public entrance explains the existing service arrival');
});

test('forecourt meets the existing footway without shifting the atrium or sealing the wall row',()=>{
 assert.deepEqual(LEVEL.physicalOrigin,{x:74,y:0});assert.equal(LEVEL.rows.length,3);assert.ok(LEVEL.rows.every(r=>r.length===24));
 assert.equal(LEVEL.physicalBounds.z1,3);assert.equal(LEVEL.connectionStrip.z0,-.5);assert.equal(LEVEL.connectionStrip.z1,0);
 assert.equal(LEVEL.floor,.12);assert.ok(Math.abs(LEVEL.drawnFloor-.1568627450980392)<1e-9);
 assert.equal(LEVEL.profile().floor,.12,'the exported level profile actually supplies the raised collision floor');
 const m=models.find(m=>m.name===C.forecourt.mesh);
 assert.equal(m.parts.filter(p=>p.id.startsWith('forecourt-flag-')).length,80);
 for(const p of m.parts)if(p.kind==='box')assert.ok(p.center[1]+p.size[1]/2<.25,'paving and drain details cannot become hidden body-height blockers');
 for(const x of[74.2,79,86,97.8])for(const z of[-.3,.5,1.4])assert.equal(models.flatMap(m=>m.parts).some(p=>contains(p,[x,1.6,z])),false,'public through route and door approach retain body clearance');
});

test('D0 high fanlight derives from the shared sightline contract and has no opaque pane',()=>{
 const f=GLASS_COURT_SIGHTLINES.fanlight,m=models.find(m=>m.name===C.fanlight.mesh);
 for(const k of['x0','x1','z0','z1','planeZ','sill','head'])assert.equal(C.fanlight[k],f[k]);
 for(const x of[83.3,84,84.7])for(const y of[3.7,4.7,5.2])assert.equal(m.parts.some(p=>contains(p,[x,y,27.5])),false,'real panes remain open to the existing view');
 assert.ok(m.parts.every(p=>p.kind!=='box'||Math.min(...p.size)<=.08),'no broad back face or opaque glazing surrogate');
 assert.equal(C.fanlight.doorId,'pool-lobby');assert.equal(C.fanlight.sill,3.4,'ordinary paired leaves retain their existing aperture below');
});

test('new authored geometry is finite, nondegenerate and uses unit normals',()=>{
 for(const m of models)for(const p of m.primitives){assert.ok([...p.positions,...p.uvs].every(Number.isFinite));for(let i=0;i<p.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...p.normals.slice(i,i+3))-1)<1e-6);for(let i=0;i<p.indices.length;i+=3){const[a,b,c]=p.indices.slice(i,i+3).map(n=>p.positions.slice(n*3,n*3+3)),u=b.map((v,k)=>v-a[k]),v=c.map((q,k)=>q-a[k]);assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-10);}}
});

test('asset receipt binds current authored inputs and keeps native acceptance explicitly pending',()=>{
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),root=new URL('../',import.meta.url);
 assert.equal(sha(bytes),stats.sha256);for(const[p,h]of Object.entries(stats.sourceHashes))assert.equal(sha(fs.readFileSync(new URL(p,root))),h,p);
 assert.ok(stats.pending.includes('native matched eye-level inspection'));
});

const vsub=(a,b)=>a.map((v,k)=>v-b[k]),vcross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],vdot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
function rayTriangle(o,d,a,b,c){const e1=vsub(b,a),e2=vsub(c,a),h=vcross(d,e2),det=vdot(e1,h);if(Math.abs(det)<1e-9)return null;const inv=1/det,s=vsub(o,a),u=inv*vdot(s,h);if(u<0||u>1)return null;const q=vcross(s,e1),v=inv*vdot(d,q);if(v<0||u+v>1)return null;const t=inv*vdot(e2,q);return t>1e-5?t:null;}
const rayHits=(mesh,origin,direction,anchor,maxT)=>{const hits=[];for(const p of mesh.listPrimitives()){const pos=p.getAttribute('POSITION'),ix=p.getIndices().getArray();for(let i=0;i<ix.length;i+=3){const tri=[ix[i],ix[i+1],ix[i+2]].map(k=>pos.getElement(k,[]).map((v,j)=>v+anchor[j]));const t=rayTriangle(origin,direction,...tri);if(t!==null&&t<maxT)hits.push({t,material:p.getMaterial().getName()});}}return hits;};
test('generated GLB clears the measured W3 to D0 borrowed ray and original scenic wall would block it',()=>{
 const sourceHero=before.getRoot().listMeshes().find(m=>m.getName()===C.hero.mesh),hero=after.getRoot().listMeshes().find(m=>m.getName()===C.hero.mesh),front=after.getRoot().listMeshes().find(m=>m.getName()===C.facade.mesh);
 const origin=[84.75,1.7,1.25],direction=[0,(3.70-origin[1])/(27.5-origin[2]),1],limit=32-origin[2]-.001;
 assert.ok(rayHits(sourceHero,origin,direction,[50,0,7.5],limit).some(h=>h.material==='board marked concrete'),'negative control: original scenic wall blocks the actual greenhouse view');
 assert.deepEqual(rayHits(hero,origin,direction,[50,0,7.5],limit),[],'no retained hero surface occludes the actual borrowed ray');
 assert.deepEqual(rayHits(front,origin,direction,[86,0,1.25],27.5-origin[2]),[],'generated W3 hole clears the sloped ray through the real GLB');
 assert.deepEqual(C.hero.greenhouseClip.physicalMin,[71,0,28]);assert.deepEqual(C.hero.greenhouseClip.physicalMax,[92,5.5,32]);
});
