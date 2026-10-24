import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import crypto from'node:crypto';
import{COASTAL_MEMORY_LAYOUT as L,COASTAL_RETAINED_ROAD_BASE as B,COASTAL_RETAINED_ROAD_BARRIERS as R,COASTAL_WALKABLE_SURFACE as S,coastalLocalPoint,coastalWorldPoint}from'../src/data/coastal-memory.js';
import{makeCoastalMemoryScene}from'../src/game/coastal-memory/scene.js';
import{createDoorDriveTeaser}from'../src/game/source-drive/door-teaser.js';import{worldAt}from'../src/game/source-drive/road.js';
import{coastalGlbMeshes,coastalMeshTriangles,createCoastalVisibilityQuery}from'../tools/chunk_surfer/source-drive-study/coastal-sightlines.mjs';
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} differs from ${b}`),meshes=coastalGlbMeshes(fs.readFileSync(new URL('../public/assets/source-drive/coastal-memory/coastal-memory.glb',import.meta.url))),coast=meshes.find(m=>m.name==='cm_limestone_coast'),query=createCoastalVisibilityQuery(coastalMeshTriangles([coast],[{id:'coast',mesh:coast.name,matrix:I}],{allOpaque:true}));
function distance(x,z,poly){let inside=false,nearest=Infinity;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;const dx=b[0]-a[0],dz=b[1]-a[1],u=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));nearest=Math.min(nearest,Math.hypot(x-a[0]-u*dx,z-a[1]-u*dz));}return inside?0:nearest;}
const clearance=(x,z)=>Math.min(...R.map(b=>distance(x,z,b.footprint)));
test('the retained formation is one closed buried solid with exact physical bay footprints',()=>{
 assert.equal(B.start,317);assert.equal(B.end,337);assert.equal(B.rows.length,41);assert.equal(B.triangles.length,324);assert.equal(R.length,40);
 const key=p=>p.map(v=>v.toFixed(8)).join(','),edges=new Map();for(const tri of B.triangles)for(let i=0;i<3;i++){const edge=[key(tri[i]),key(tri[(i+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}assert.ok([...edges.values()].every(v=>v===2),'no exposed internal seam or open underside');
 for(const[i,b]of R.entries()){assert.deepEqual(b.footprint,[B.rows[i].leftTop,B.rows[i].rightTop,B.rows[i+1].rightTop,B.rows[i+1].leftTop].map(p=>[p[0],p[2]]));assert.ok(L.barriers.includes(b));assert.equal(L.canOccupy(b.x,b.z),false);for(const p of[B.rows[i].leftBottom,B.rows[i].rightBottom])near(L.supportAt(p[0],p[2]).height-p[1],.20);}
});
test('the actual exported limestone overlaps the retained slab underside instead of leaving suspended asphalt',()=>{
 for(let d=318;d<=336;d+=.5)for(const lateral of[-1.35,0,1.35]){const a=worldAt(d,lateral),p=coastalLocalPoint([32+a.x,a.y-.09,32+a.z]),hit=query.ray([p[0],p[1]+.04,p[2]],[p[0],p[1]-.25,p[2]]);assert.equal(hit.clear,false,`unsupported actual asphalt at ${d},${lateral}`);assert.equal(hit.obstruction.mesh,'cm_limestone_coast');near(hit.obstruction.point[1]-p[1],.02,.001);}
});
test('the formation is submitted once without proxy blocks and keeps old terrain and the D12 lookout unchanged',()=>{
 const scene=makeCoastalMemoryScene({worldFromLocal:I});assert.equal(scene.props.filter(p=>p.mesh==='cm_limestone_coast').length,1);assert.equal(scene.props.filter(p=>p.id.startsWith('coastal-retained-road-base-')).length,0);assert.equal(scene.physical.barriers,L.barriers);
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(S.vertices.filter(p=>p[2]>=-9))).digest('hex'),'aad295166f5b9fc2df0b6a5079a165c6c583a3d13b6de06cb405e1577b6c94b4');near(L.spawn.x,.94533163695);near(L.spawn.z,-45);near(L.spawn.feet,16.09389489694);near(L.spawn.pitch,-.55);
});
test('the actual opening hull never intersects the retained road-base footprints through the fall',()=>{
 const a=worldAt(292),c=createDoorDriveTeaser({initialDrive:{x:a.x,z:a.z,heading:a.heading,roadHeight:a.height,speed:6,furthest:292}});let count=0,min=Infinity;
 try{c.start();for(let i=0;i<300&&!c.snapshot().commitment;i++)c.update(1/120);assert.ok(c.snapshot().commitment);for(let i=0;i<1200&&!c.snapshot().finished;i++){const s=c.snapshot();if(s.worldOwner!=='drive')break;const body=s.vehiclePose.bodyMatrix;for(const x of[-1.04,0,1.04])for(const y of[0,1.3,2.57])for(const z of[-3.25,-.35,2.55]){const p=coastalLocalPoint(coastalWorldPoint([x,y,z],body));min=Math.min(min,clearance(p[0],p[2]));count++;}c.update(1/120);}assert.ok(count>10000);assert.ok(min>6.5,`actual hull clearance ${min}`);}finally{c.dispose();}
});
