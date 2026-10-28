import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import{createHash}from'node:crypto';
import{EXTERIOR_STREET_FABRIC as C,EXTERIOR_STREET_FABRIC_MESHES,EXTERIOR_STREET_LAMP,exteriorStreetLampLights,exteriorStreetWallServiceInstances}from'../src/data/exterior-street-fabric.js';
import{buildExteriorStreetFabric}from'../tools/chunk_surfer/exterior-street-fabric-geometry.mjs';
import{STREET_PILOT,streetPilotFloorAt}from'../src/data/street-pilot.js';
import{gridDrawnHeight}from'../src/data/main-stair-geometry.js';
import{parseGlb}from'../tools/chunk_surfer/rebuild-tree-crowns.mjs';
const shapes=[],materials=[],result=buildExteriorStreetFabric({materials,mesh:name=>({name}),addQuad(m,...args){shapes.push({mesh:m.name,kind:'quad',args});},addBox(m,...args){shapes.push({mesh:m.name,kind:'box',args});},addBeam(m,...args){shapes.push({mesh:m.name,kind:'beam',args});},addCylinder(m,...args){shapes.push({mesh:m.name,kind:'cylinder',args});}});
const intersects=(a,b)=>a.min[0]<b.x1-1e-7&&a.max[0]>b.x0+1e-7&&a.min[2]<b.z1-1e-7&&a.max[2]>b.z0+1e-7;
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('construction preserves the authored14m section and exact northpilot seam levels',()=>{
 assert.equal(C.section.carriagewayWidth+2*C.section.settMarginWidth+2*C.section.footwayWidth,14);
 near(C.section.carriagewayWidth,STREET_PILOT.road.z1-STREET_PILOT.road.z0);
 assert.deepEqual(C.protectedPilot,STREET_PILOT.patch);
 near(C.section.roadFloor,streetPilotFloorAt(63,-7.5));near(C.section.settFloor,streetPilotFloorAt(63,-3.5));near(C.section.footwayFloor,streetPilotFloorAt(63,-1));
 assert.equal(result.seams.northPilot.maximumConstructionGap,.007);
 near(result.seams.northPilot.drawnFootwayTop,gridDrawnHeight(.12));near(result.seams.northPilot.drawnSettTop,gridDrawnHeight(.025));
});
test('every actual piece leaves the pilot untouched and has finite geometry below the footway or on masonry',()=>{
 assert.equal(shapes.length,result.parts.length);
 for(let i=0;i<result.parts.length;i++){
  const part=result.parts[i];assert.ok([...part.bounds.min,...part.bounds.max].every(Number.isFinite),part.id);
  if(!part.world)continue;
  assert.equal(intersects(part.bounds,C.protectedPilot),false,`${part.id} overlaps protected crossing construction`);
  if(part.mesh==='exterior_street_kerbs')assert.ok(part.bounds.max[1]<=C.drawnSection.footwayFloor+1e-8,part.id);
  if(part.mesh==='exterior_street_paving_joints')near(part.bounds.max[1],C.drawnSection.footwayFloor+.001);
  if(part.mesh==='exterior_street_services')assert.ok(part.bounds.max[1]<=C.drawnSection.footwayFloor+.00250001,part.id);
  if(part.mesh==='exterior_street_nameplates'){
   assert.ok(part.bounds.min[1]>=3.99&&part.bounds.max[1]<=4.25,'nameplates sit on solid inter-floor masonry above ground openings');
   const north=part.bounds.max[2]<-.5,south=part.bounds.min[2]>106.5,west=part.bounds.max[0]<-14.5,east=part.bounds.min[0]>142.5;
   assert.ok(north||south||west||east,`${part.id} must sit behind the walking surface`);
  }
 }
});
test('flag joints, covers, gutters and kerb tops face upward in the actual emitted quad order',()=>{
 let checked=0;
 for(let i=0;i<shapes.length;i++){
  const s=shapes[i],part=result.parts[i];if(s.kind!=='quad'||part.bounds.max[1]!==part.bounds.min[1])continue;
  const[a,b,c]=s.args,u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),normalY=u[2]*v[0]-u[0]*v[2];
  assert.ok(normalY>0,`${part.id} is backface culled from above`);checked++;
 }
 assert.ok(checked>1000);
});
test('the busstop widening is retained and no arbitrary above-floor furniture narrows a two-metre footway',()=>{
 const bus=C.busStopFootway;
 for(const part of result.parts.filter(p=>p.world&&p.mesh==='exterior_street_paving_joints'))assert.equal(intersects(part.bounds,bus),false,part.id);
 assert.ok(result.parts.some(p=>p.id==='bus-stop-existing-footway-edge'));
 assert.ok(result.placements.filter(p=>p.kind==='flush-utility-cover').every(p=>p.authoredTop-.12<.003));
 assert.deepEqual(C.nameplates.map(s=>s.text),['BOROUGH PASSAGE','WEST MEWS','WORKSHOP COURT','LYRIC YARD']);
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
test('dedicated generatedpack has all five meshes and preserves the current pilot bytes',()=>{
 const root=path.resolve(import.meta.dirname,'..'),bytes=fs.readFileSync(path.join(root,'public/assets/exterior-street-fabric.glb')),stats=JSON.parse(fs.readFileSync(path.join(root,'public/assets/exterior-street-fabric.stats.json'))),g=parseGlb(bytes);
 assert.deepEqual(g.json.meshes.map(m=>m.name),C.meshNames);assert.equal(stats.totalTriangles<=C.maximumTriangles,true);assert.equal(bytes.length<=C.maximumBytes,true);assert.equal(stats.protectedAssetsUnchanged,true);assert.equal(stats.worldFloorChanged,false);assert.equal(stats.collisionChanged,false);
 assert.ok(g.json.meshes.every(m=>m.primitives.every(p=>p.attributes.NORMAL!==undefined&&p.attributes.TEXCOORD_0!==undefined)));
 const repo=process.env.STREET_FABRIC_REPO||root,pilot=fs.readFileSync(path.join(repo,'public/assets/street-pilot.glb'));
 assert.equal(createHash('sha256').update(pilot).digest('hex'),stats.protectedAssets['public/assets/street-pilot.glb']);
 for(const [mesh,data]of Object.entries(stats.meshes)){
  const d=EXTERIOR_STREET_FABRIC_MESHES[mesh];assert.ok(data.bounds.max[0]-data.bounds.min[0]<=d.w+1e-5,mesh);assert.ok(data.bounds.max[2]-data.bounds.min[2]<=d.d+1e-5,mesh);
 }
});
