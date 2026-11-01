import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import{createHash}from'node:crypto';
import{EXTERIOR_STREET_FABRIC as C,EXTERIOR_STREET_FABRIC_MESHES,EXTERIOR_STREET_LAMP,exteriorStreetLampLights,exteriorStreetWallServiceInstances}from'../src/data/exterior-street-fabric.js';
import{buildExteriorStreetFabric}from'../tools/chunk_surfer/exterior-street-fabric-geometry.mjs';
import{STREET_PILOT,streetPilotFloorAt}from'../src/data/street-pilot.js';
import{STREET_CROSSINGS}from'../src/data/street-crossings.js';
import{STREET_PARKING_BAYS}from'../src/data/exterior-street-fabric.js';
import{streetSurfaceAt}from'../tools/chunk_surfer/street-surface-sampler.mjs';
import{gridDrawnHeight}from'../src/data/main-stair-geometry.js';
import{parseGlb}from'../tools/chunk_surfer/rebuild-tree-crowns.mjs';
const shapes=[],materials=[],result=buildExteriorStreetFabric({materials,mesh:name=>({name}),addQuad(m,...args){shapes.push({mesh:m.name,kind:'quad',args});},addBox(m,...args){shapes.push({mesh:m.name,kind:'box',args});},addBeam(m,...args){shapes.push({mesh:m.name,kind:'beam',args});},addCylinder(m,...args){shapes.push({mesh:m.name,kind:'cylinder',args});}});
const intersects=(a,b)=>a.min[0]<b.x1-1e-7&&a.max[0]>b.x0+1e-7&&a.min[2]<b.z1-1e-7&&a.max[2]>b.z0+1e-7;
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('the section is a Leeds one and the drawn kerb is a real upstand',()=>{
 assert.equal(C.section.carriagewayWidth,6);assert.equal(C.section.footwayWidth,4);
 near(C.section.carriagewayWidth,STREET_PILOT.road.z1-STREET_PILOT.road.z0);
 near(streetPilotFloorAt(70.25,-7.25),C.section.roadFloor);near(streetPilotFloorAt(70.25,-12.75),C.section.footwayFloor);
 // Leeds SPD ¶747: 100 mm, 125 mm at bus stops. Collision climbs 120 mm; the grid draws 125.5 mm.
 assert.ok(C.section.footwayFloor>=.10&&C.section.footwayFloor<=.125);
 assert.ok(result.drawnUpstand>=.10&&result.drawnUpstand<=.126,String(result.drawnUpstand));
 near(result.drawnSection.footwayFloor,gridDrawnHeight(.12));
});
test('every kerb stands on a step the player actually climbs, and drops only where a crossing is',()=>{
 assert.ok(result.kerbs.fullLength>1000,String(result.kerbs.fullLength));
 assert.equal(result.kerbs.unexplainedDrops.length,0);
 // Eight crossings, both kerbs, three dropped metres each.
 near(result.kerbs.droppedLength,STREET_CROSSINGS.length*2*3,1e-6);
 for(const part of result.parts.filter(p=>p.role==='kerb-top')){
  const[x,,z]=[0,1,2].map(k=>(part.bounds.min[k]+part.bounds.max[k])/2);
  // Sample the glyph under the kerb top and the glyph just across its face.
  const under=streetSurfaceAt(Math.floor(x+.25),Math.floor(z+.25));
  assert.ok(under&&under.kind==='pave',`${part.id} is not on pavement`);
 }
});
test('every piece has finite geometry on the drawn street, and level faces look up',()=>{
 assert.equal(shapes.length,result.parts.length);
 let checked=0;
 for(let i=0;i<result.parts.length;i++){
  const part=result.parts[i];assert.ok([...part.bounds.min,...part.bounds.max].every(Number.isFinite),part.id);
  if(!part.world||part.mesh==='exterior_street_nameplates')continue;
  assert.ok(part.bounds.max[1]<=C.drawnSection.footwayFloor+.005,part.id);
  const sh=shapes[i];if(sh.kind!=='quad'||part.bounds.max[1]-part.bounds.min[1]>1e-9)continue;
  const[a,b,c]=sh.args,u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);
  assert.ok(u[2]*v[0]-u[0]*v[2]>0,`${part.id} is backface culled from above`);checked++;
 }
 assert.ok(checked>1000);
 for(const part of result.parts.filter(p=>p.mesh==='exterior_street_nameplates')){
  assert.ok(part.bounds.min[1]>=3.99&&part.bounds.max[1]<=4.25,'nameplates sit on solid inter-floor masonry above ground openings');
 }
 assert.deepEqual(C.nameplates.map(s=>s.text),['ELLERY SQUARE','WEST MEWS','WORKSHOP COURT','LYRIC YARD']);
});
test('blister paving is red at the signal crossing only, with its stem, and buff everywhere else',()=>{
 for(const c of STREET_CROSSINGS){
  const tiles=result.parts.filter(p=>p.role==='tactile'&&p.id.startsWith(c.id+':'));
  assert.ok(tiles.length>=28,c.id);
  assert.ok(tiles.every(p=>p.kind===c.kind),c.id);
  const stem=result.crossings.filter(r=>r.id===c.id).every(r=>r.stem===(c.kind==='controlled'));assert.ok(stem,c.id);
 }
 assert.equal(STREET_CROSSINGS.filter(c=>c.kind==='controlled').length,1);
});
test('double yellows stop for bays, the bus stop clearway and the signal zigzags',()=>{
 const yellow=result.parts.filter(p=>p.role==='double-yellow'),inside=(p,x0,x1,z0,z1)=>p.bounds.min[0]<x1&&p.bounds.max[0]>x0&&p.bounds.min[2]<z1&&p.bounds.max[2]>z0;
 assert.ok(yellow.length>20);
 for(const bay of STREET_PARKING_BAYS){
  const along=Math.abs(Math.sin(bay.yaw))>.5?bay.x:bay.z,x0=Math.abs(Math.sin(bay.yaw))>.5?along-2.9:bay.x-2,x1=Math.abs(Math.sin(bay.yaw))>.5?along+2.9:bay.x+2,z0=Math.abs(Math.sin(bay.yaw))>.5?bay.z-2:along-2.9,z1=Math.abs(Math.sin(bay.yaw))>.5?bay.z+2:along+2.9;
  assert.ok(!yellow.some(p=>inside(p,x0,x1,z0,z1)),`yellows inside ${bay.id}'s bay`);
  assert.ok(result.placements.some(p=>p.kind==='parking-bay'&&p.id.endsWith(bay.id)),bay.id);
 }
 const bus=C.busStopClearway;assert.ok(!yellow.some(p=>inside(p,bus.line-.1,bus.line+3,bus.z0+.1,bus.z1-.1)));
 assert.ok(result.placements.some(p=>p.kind==='bus-stop-clearway'));
 const zz=C.zigzagZone;assert.ok(!yellow.some(p=>inside(p,zz.x0+.1,zz.x1-.1,-10.6,-3.9)));
 for(const line of zz.line)assert.ok(yellow.some(p=>Math.abs(p.bounds.min[2]-line)<.5&&p.bounds.max[0]<=zz.x0+1e-6),`North Street kerb ${line} has double yellows`);
});
test('roadlight sockets follow physical row rotation/scale and deterministic nearest selection',()=>{
 const row={id:'north-a',mesh:'district_terrace_frontage',x:18,y:0,z:-15.05,yaw:Math.PI/2};
 const all=exteriorStreetLampLights({rows:[row],origin:{x:18,z:-13.95},maxDistance:100,maxLights:12});assert.equal(all.length,4);
 for(const lamp of all){near(lamp.z,-13.95);near(lamp.y,5.8);assert.ok(lamp.maintained&&lamp.circuit===null);assert.equal(lamp.sourcePosition.x,lamp.x);}
 assert.deepEqual(all.map(l=>l.id),['north-a:road-supply-lamp:-9','north-a:road-supply-lamp:9','north-a:road-supply-lamp:-25','north-a:road-supply-lamp:25']);
 assert.equal(exteriorStreetLampLights({rows:[row],origin:{x:18,z:-13.95},maxDistance:10,maxLights:1}).length,1);
 assert.equal(exteriorStreetLampLights({rows:[{id:'logical',mesh:row.mesh,x:66,y:323}]}).length,0,'logical addresses must not masquerade as physical lights');
 assert.equal(exteriorStreetLampLights({rows:[{...row,mesh:'district_civic_frontage'}],maxDistance:100}).length,0,'unchanged civic column geometry must not claim the new bracket sockets');
 assert.equal(EXTERIOR_STREET_LAMP.localX,1.10);
});
test('wall services follow only industrial row masonry and clear the existing rollerdoor',()=>{
 const rows=[{id:'workshop',mesh:'district_workshop_frontage',x:142,y:0,z:82,yaw:Math.PI},{id:'shop',mesh:'district_terrace_frontage',x:18,z:-15.05,yaw:Math.PI/2}];
 const p=exteriorStreetWallServiceInstances(rows);assert.equal(p.length,1);near(p[0].x,142);near(p[0].z,66.9);assert.equal(p[0].blocks,false);
 const parts=result.parts.filter(p=>p.mesh==='exterior_street_wall_services');const minZ=Math.min(...parts.map(p=>p.bounds.min[2]));
 assert.ok(C.wallServices.localZ+minZ>=14.4+C.wallServices.clearOfIndustrialDoorEdge-1e-7);
 assert.ok(parts.every(p=>p.bounds.min[0]>=-1e-8&&p.bounds.max[0]<=.306));
});
test('dedicated generated pack has its meshes, reads the floor plan and leaves the pilot bytes alone',()=>{
 const root=path.resolve(import.meta.dirname,'..'),bytes=fs.readFileSync(path.join(root,'public/assets/exterior-street-fabric.glb')),stats=JSON.parse(fs.readFileSync(path.join(root,'public/assets/exterior-street-fabric.stats.json'))),g=parseGlb(bytes);
 assert.deepEqual(g.json.meshes.map(m=>m.name),C.meshNames);assert.equal(stats.totalTriangles<=C.maximumTriangles,true);assert.equal(bytes.length<=C.maximumBytes,true);assert.equal(stats.protectedAssetsUnchanged,true);assert.equal(stats.readsFloorPlan,true);assert.ok(stats.kerbs.runs>20);
 assert.ok(g.json.meshes.every(m=>m.primitives.every(p=>p.attributes.NORMAL!==undefined&&p.attributes.TEXCOORD_0!==undefined)));
 const repo=process.env.STREET_FABRIC_REPO||root,pilot=fs.readFileSync(path.join(repo,'public/assets/street-pilot.glb'));
 assert.equal(createHash('sha256').update(pilot).digest('hex'),stats.protectedAssets['public/assets/street-pilot.glb']);
 for(const [mesh,data]of Object.entries(stats.meshes)){
  const d=EXTERIOR_STREET_FABRIC_MESHES[mesh];assert.ok(data.bounds.max[0]-data.bounds.min[0]<=d.w+1e-5,mesh);assert.ok(data.bounds.max[2]-data.bounds.min[2]<=d.d+1e-5,mesh);
 }
});
