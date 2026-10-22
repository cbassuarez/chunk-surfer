import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roadTreatmentAt,DRIVE_PREDICAMENT_SECTIONS} from '../src/game/source-drive/route-treatment.js';
import {roadAt,roadSurfaceAt,worldAt} from '../src/game/source-drive/road.js';
import {ALIGNMENT,HEIGHT_PROFILE,ORDINARY_BRIDGE,ORDINARY_DESTINATION} from '../src/game/source-drive/route-layout.js';
import {ROUTE_BOUNDARIES,roadBoundaryColliders,containsDrivePose,boundaryInnerLateral} from '../src/game/source-drive/route-boundaries.js';
import {DRIVE_BODY_FOOTPRINT,driveBodyCorners,resolveVehicleContacts,vehiclePoseIntersects} from '../src/game/source-drive/vehicle-contacts.js';
import {VEHICLE} from '../src/game/source-drive/vehicle-dynamics.js';
import {createDrive} from '../src/game/source-drive/drive-state.js';
import {driveColliders,makeDriveScene} from '../src/game/source-drive/scene.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url)),metrics=JSON.parse(read('public/assets/source-drive/geometry/metrics.json'));
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} versus ${b}`);
const pose=(d,lateral=0,yaw=0)=>{const r=worldAt(d,lateral);return{x:r.x,z:r.z,heading:r.heading+yaw};};
function meshBounds(path,name){
 const bytes=read(path),n=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+n)),bin=bytes.subarray(28+n),mesh=doc.meshes.find(m=>m.name===name),bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};assert.ok(mesh,name);
 for(const p of mesh.primitives){const a=doc.accessors[p.attributes.POSITION],v=doc.bufferViews[a.bufferView];assert.equal(a.componentType,5126);for(let i=0;i<a.count;i++)for(let axis=0;axis<3;axis++){const x=bin.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||12)+axis*4);bounds.min[axis]=Math.min(bounds.min[axis],x);bounds.max[axis]=Math.max(bounds.max[axis],x);}}
 return bounds;
}
const asphalt=meshBounds('public/assets/source-drive/drive.glb','drive_road'),plain=meshBounds('public/assets/source-drive/cut/cut-roadside.glb','drive_plain_paving'),snow=meshBounds('public/assets/source-drive/predicaments/drive-predicaments.glb','dp_snow_paving'),verge=meshBounds('public/assets/source-drive/drive.glb','drive_verge');
const projectLateral=(m,p,road)=>{const x=m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]-32,z=m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]-32;return(x-road.x)*Math.cos(road.heading)+(z-road.z)*Math.sin(road.heading);};

test('two distinct fixed road predicaments preserve the bridge, pull-in and destination',()=>{
 assert.deepEqual(DRIVE_PREDICAMENT_SECTIONS.map(s=>[s.id,s.start,s.end]),[['the-queue',145,465],['the-white-sea',945,1165]]);
 for(const d of[250,315,380]){const r=roadAt(d);near(r.halfWidth*2,3.34);near(boundaryInnerLateral(d,1)-r.rightWidth,.26);assert.equal(r.treatment.section,'the-queue');}
 for(const d of[1000,1060,1090])near(roadAt(d).halfWidth*2,54.5);
 for(const d of[24,540,850,1200])near(roadAt(d).halfWidth,3.25);
 assert.equal(ORDINARY_BRIDGE.d,540);assert.equal(ORDINARY_DESTINATION.d,1228);
 near(roadAt(850).leftWidth,5.95);near(roadAt(1200).leftWidth,4.80);
 assert.deepEqual(roadTreatmentAt(NaN),roadTreatmentAt(0));
});

test('cliff geometry has finite steering and grade demands with C2 seams',()=>{
 let maxCurvature=0,maxGrade=0;
 for(let d=140;d<=470;d+=.25){const r=roadAt(d);maxCurvature=Math.max(maxCurvature,Math.abs(r.curvature));maxGrade=Math.max(maxGrade,Math.abs(r.grade));assert.ok([r.x,r.height,r.heading,r.curvature,r.grade].every(Number.isFinite));}
 const minimumRadius=1/maxCurvature,kinematicLimit=VEHICLE.wheelbase/Math.tan(VEHICLE.maxWheelAngle);
 assert.ok(minimumRadius>kinematicLimit*2.5,`${minimumRadius}m curve must be feasible for ${kinematicLimit}m steering radius`);
 assert.ok(maxGrade<.10,`${maxGrade} is an excessive unsupported grade for this van`);
 for(const d of new Set([...ALIGNMENT.map(r=>r.d),...HEIGHT_PROFILE.map(r=>r.d),145,212,390,465,945,1000,1090,1165])){
  const a=roadAt(d-1e-4),b=roadAt(d+1e-4);near(a.heading,b.heading,2e-5);near(a.grade,b.grade,2e-5);near(a.curvature,b.curvature,2e-5);
  near(a.halfWidth,b.halfWidth,.0003);near(a.shoulderWidth,b.shoulderWidth,2e-5);
  const h=.001,f=x=>roadAt(x).halfWidth,c=f(d),left=(c-f(d-h))/h,right=(f(d+h)-c)/h;
  near(left,right,1e-4);near((c-2*f(d-h)+f(d-2*h))/(h*h),(f(d+2*h)-2*f(d+h)+c)/(h*h),.002);
 }
});

test('the complete van sweeps the cliff centre forward and reversed at quarter-metre spacing',()=>{
 for(const direction of[1,-1]){
  const distances=Array.from({length:1281},(_,i)=>direction>0?145+i*.25:465-i*.25);let previous=null;
  for(const d of distances){
   const p=pose(d,0,direction<0?Math.PI:0),colliders=driveColliders({...p,cutEnabled:true,furthest:465,programTime:40});
   assert.equal(containsDrivePose(p),true,`full body clear ${d}/${direction}`);
   assert.ok(!colliders.some(c=>vehiclePoseIntersects(p,c)),`all scene solids clear ${d}/${direction}`);
   for(const corner of driveBodyCorners(p))assert.equal(roadSurfaceAt(corner.x,corner.z).kind,'asphalt',`bumper stays on actual asphalt ${d}/${direction}`);
   if(previous){const s=Object.assign(createDrive(),p,{contactStartX:previous.x,contactStartZ:previous.z,contactStartHeading:previous.heading,speed:direction*3,odometer:100,wheelRotation:5,programTime:40});assert.equal(resolveVehicleContacts(s,colliders).collided,false,`swept body passage ${d}/${direction}`);}
   previous=p;
  }
 }
});

test('the narrow rail hulls never overlap the physically driven asphalt',()=>{
 for(const row of ROUTE_BOUNDARIES.filter(r=>r.start>=145&&r.end<=465)){
  assert.equal(row.mesh,'cut_guardrail');const side=row.kind.endsWith('left')?-1:1,c=row.collider,cs=Math.cos(c.yaw),sn=Math.sin(c.yaw);
  for(const x of[-c.halfX,c.halfX])for(const z of[-c.halfZ,c.halfZ]){const r=roadSurfaceAt(c.x+x*cs-z*sn,c.z+x*sn+z*cs),edge=side<0?r.leftWidth:r.rightWidth;assert.ok(side*r.offset-edge>.20,`${row.id} intrudes into asphalt or its designed shoulder`);}
 }
 for(const d of[250,315,380]){assert.equal(containsDrivePose(pose(d)),true);assert.equal(containsDrivePose(pose(d,0,Math.PI/2)),false,'a three-point turn is deliberately not promised on the cliff');}
});

test('actual submitted road and shoulder meshes agree with the physical width in both predicaments',()=>{
 for(const d of[150,200,250,380,440,540,850,960,1000,1060,1140,1200]){
  const p=pose(d),s=Object.assign(createDrive(),p,{roadHeight:roadAt(d).height,furthest:d,programTime:40}),scene=makeDriveScene(s,metrics,{showHands:false}),r=roadAt(d),road=scene.props.find(v=>v.id===`drive_road-${d}-0`);assert.ok(road,`road row ${d}`);
  const b=road.mesh==='dp_snow_paving'?snow:road.mesh==='drive_plain_paving'?plain:asphalt;
  near(projectLateral(road.matrix,[b.min[0],0,0],r),-r.halfWidth,2e-4);near(projectLateral(road.matrix,[b.max[0],0,0],r),r.halfWidth,2e-4);
  if(d===250||d===1060)assert.notEqual(road.mesh,'drive_road','paint cannot advertise stale ordinary lanes in either impossible width');
  for(const side of[-1,1]){const width=side<0?r.leftWidth:r.rightWidth,shoulder=scene.props.find(v=>v.id===`drive_verge-${d}-${side*(width+r.shoulderWidth/2)}`);assert.ok(shoulder,`fitted shoulder ${d}/${side}`);const inner=side<0?verge.max[0]:verge.min[0],outer=side<0?verge.min[0]:verge.max[0];near(projectLateral(shoulder.matrix,[inner,0,0],r),side*width,2e-4);near(projectLateral(shoulder.matrix,[outer,0,0],r),side*(width+r.shoulderWidth),2e-4);}
 }
 for(const lateral of[-23,23]){const p=pose(1060,lateral);assert.equal(roadSurfaceAt(p.x,p.z).kind,'asphalt');assert.equal(containsDrivePose(p),true,'the expanse is physically wide, not a stretched visual illusion over old colliders');}
});

test('edge contact resolves locally at the chosen heading without lane teleport or recovery',()=>{
 for(const d of[250,350,1060])for(const side of[-1,1])for(const yaw of[-.08,.08,Math.PI]){
  const r=roadAt(d),start=pose(d,0,yaw),end=pose(d,side*(r.halfWidth+8),yaw),s=Object.assign(createDrive(),end,{contactStartX:start.x,contactStartZ:start.z,contactStartHeading:start.heading,speed:3,odometer:100,wheelRotation:5,programTime:40});
  assert.equal(containsDrivePose(start),true);const result=resolveVehicleContacts(s,roadBoundaryColliders(d,40));assert.equal(result.collided,true,`physical edge at ${d}/${side}/${yaw}`);
  assert.equal(containsDrivePose(s),true);near(s.heading,start.heading);assert.equal(s.boundaryRecovery,undefined);
  const moved=roadSurfaceAt(s.x,s.z);assert.ok(side*moved.offset>.25,'contact leaves the car beside the struck rail rather than recentering it');assert.ok(Math.abs(moved.distance-d)<DRIVE_BODY_FOOTPRINT.front+1,'side contact cannot skip to another stretch of road');
 }
});
