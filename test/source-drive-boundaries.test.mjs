import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BOUNDARY_MESH_BOUNDS,FINITE_ROAD,ROUTE_BOUNDARIES,boundaryInnerLateral,roadBoundaryColliders,roadBoundaryInstances,containsDrivePose} from '../src/game/source-drive/route-boundaries.js';
import {DRIVE_BODY_FOOTPRINT,driveBodyCorners,vehiclePoseIntersects,resolveVehicleContacts} from '../src/game/source-drive/vehicle-contacts.js';
import {worldAt,roadAt,roadSurfaceAt} from '../src/game/source-drive/road.js';
import {driveRoadAttitude,makeDriveScene,driveColliders} from '../src/game/source-drive/scene.js';
import {createDrive} from '../src/game/source-drive/drive-state.js';
import {ROUTE,ROUTE_PLACEMENTS} from '../src/game/source-drive/route-layout.js';
const metrics=JSON.parse(readFileSync(new URL('../artifacts/source-drive-study/geometry/metrics.json',import.meta.url)));
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
const pose=(d,l=0,yaw=0)=>{const a=worldAt(d,l);return{x:a.x,z:a.z,heading:a.heading+yaw};};
function glb(path){const bytes=readFileSync(new URL(path,import.meta.url)),len=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+len)),bin=bytes.subarray(28+len);return{bytes,doc,bin};}
function values(asset,index){const a=asset.doc.accessors[index],v=asset.doc.bufferViews[a.bufferView],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],width={5126:4,5125:4,5123:2,5121:1}[a.componentType],getter={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType],out=[];for(let row=0;row<a.count;row++)for(let c=0;c<size;c++)out.push(asset.bin[getter]((v.byteOffset||0)+(a.byteOffset||0)+row*(v.byteStride||size*width)+c*width));return out;}
function meshBounds(asset,name){const mesh=asset.doc.meshes.find(m=>m.name===name);assert.ok(mesh,`${name} exists`);const out={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const primitive of mesh.primitives){const p=values(asset,primitive.attributes.POSITION);for(let i=0;i<p.length;i++){const axis=i%3;out.min[axis]=Math.min(out.min[axis],p[i]);out.max[axis]=Math.max(out.max[axis],p[i]);}}return out;}
const drive=glb('../artifacts/source-drive-study/drive.glb'),roadside=glb('../artifacts/source-drive-study/cut/cut-roadside.glb');
const transform=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12]-32,m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]-32];

test('boundary and vehicle contact dimensions come from final built meshes',()=>{
 for(const[name,b]of Object.entries(BOUNDARY_MESH_BOUNDS)){const actual=meshBounds(name.startsWith('cut_')?roadside:drive,name);for(const key of['min','max'])actual[key].forEach((v,i)=>close(v,b[key][i],2e-6));}
 const b=meshBounds(drive,'drive_vehicle_body');close(-b.min[0],DRIVE_BODY_FOOTPRINT.halfWidth);close(b.max[0],DRIVE_BODY_FOOTPRINT.halfWidth);close(-b.min[2],DRIVE_BODY_FOOTPRINT.front);close(b.max[2],DRIVE_BODY_FOOTPRINT.rear);
});

test('every physical boundary is the tight horizontal hull of the same visible mesh and matrix',()=>{
 assert.equal(ROUTE_BOUNDARIES.length,854);
 for(const row of ROUTE_BOUNDARIES){const {collider:c,localBounds:b,matrix:m}=row,cs=Math.cos(c.yaw),sn=Math.sin(c.yaw),points=[];for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])points.push(transform(m,[x,y,z]));
  const x=points.map(p=>(p[0]-c.x)*cs+(p[2]-c.z)*sn),z=points.map(p=>-(p[0]-c.x)*sn+(p[2]-c.z)*cs);close(Math.max(...x),c.halfX);close(Math.min(...x),-c.halfX);close(Math.max(...z),c.halfZ);close(Math.min(...z),-c.halfZ);
  const visual=roadBoundaryInstances((row.start+row.end)/2,2).find(v=>v.id===row.id);assert.ok(visual);assert.deepEqual(visual.matrix,m);assert.equal(visual.mesh,row.mesh);
  assert.ok(row.height<1.5,'retained bank remains low; no enclosing corridor');
 }
 const openFlank=ROUTE_BOUNDARIES.filter(r=>r.start>=590&&r.end<=660);assert.ok(openFlank.every(r=>r.mesh==='cut_guardrail'),'the exposed flank keeps an open skyline');
});

test('ordinary dual lanes, the single cliff lane and turning courts remain full-body clear',()=>{
 for(let d=-27;d<1239;d+=2)for(const lateral of(d>=145&&d<=465?[0]:[-1.35,1.35]))assert.equal(containsDrivePose(pose(d,lateral)),true,`authored lane at ${d}/${lateral}`);
 for(const d of[250,315,380])for(const lateral of[-1.35,1.35])assert.equal(containsDrivePose(pose(d,lateral)),false,`the cliff cannot falsely promise two lanes at ${d}/${lateral}`);
 for(const d of[-20,0,12,1196,1210,1233])for(const yaw of[0,Math.PI/2,Math.PI,Math.PI*1.5])assert.equal(containsDrivePose(pose(d,0,yaw)),true,`turning court ${d}/${yaw}`);
 assert.ok(roadAt(0).leftWidth+roadAt(0).rightWidth>14);
 assert.equal(containsDrivePose(pose(-40)),false);assert.equal(containsDrivePose(pose(1260)),false);
 for(const d of[200,500,850,1200])for(const side of[-1,1])assert.equal(containsDrivePose(pose(d,side*20)),false);
 assert.equal(containsDrivePose({x:NaN,z:0,heading:0}),false);
});

test('the entire 44 m pull-in remains an unmarked paved choice, with open tapered entry and departure',()=>{
 assert.deepEqual([ROUTE.pullIn.start,ROUTE.pullIn.fullStart,ROUTE.pullIn.fullEnd,ROUTE.pullIn.end],[816,839,883,906]);
 for(let d=839;d<=883;d++){close(roadAt(d).leftWidth,5.95);assert.equal(roadSurfaceAt(pose(d,-4.6).x,pose(d,-4.6).z).kind,'asphalt');assert.equal(containsDrivePose(pose(d,-4.6)),true,`off-lane stop ${d}`);}
 for(let d=816;d<=906;d+=.5){const a=roadAt(d),lateral=-1.35-(a.pullIn*3.25);assert.equal(containsDrivePose(pose(d,lateral)),true,`entry sweep at ${d}`);}
 assert.equal(containsDrivePose(pose(850,-1.3,Math.PI/2)),true,'a crosswise turn is possible, without mandatory lane alignment');
 assert.ok(!ROUTE_PLACEMENTS.some(p=>['pullin-back-wall','departure-wall','cutting-wall','goods-low-wall'].some(prefix=>p.id.startsWith(prefix))),'legacy walls do not overlap the one perimeter');
 assert.ok(roadBoundaryColliders(770,90).some(c=>c.id.startsWith('route-edge-left-83')),'the approaching query includes the bay at a readable distance');
});

function attemptedSweep(start,end,colliders){const s=Object.assign(createDrive(),start,{paused:false,contactStartX:start.x,contactStartZ:start.z,contactStartHeading:start.heading,speed:25,lateralSpeed:0,programTime:1,odometer:100,wheelRotation:50},end);const result=resolveVehicleContacts(s,colliders);return{s,result};}
test('swept full-body contact closes both sides, including across bends and at the opened bay',()=>{
 for(const d of[0,100,300,540,700,850,950,1150,1215])for(const side of[-1,1]){
  const yaw=d>=145&&d<=465?0:side*Math.PI/2,start=pose(d,side*.2,yaw),end=pose(d,side*20,yaw);
  assert.equal(containsDrivePose(start),true,`the sweep begins with a legal body at ${d}/${side}`);
  const {s,result}=attemptedSweep(start,end,driveColliders({...start,z:start.z,cutEnabled:true}));
  assert.equal(result.collided,true,`side ${side} at ${d}`);assert.equal(containsDrivePose(s),true,`swept body remains inside ${d}/${side}`);close(s.heading,start.heading);assert.ok(s.odometer<100,'untravelled distance is not credited');
 }
});

test('visible end returns block reverse escape and both goods-door bypasses without forced yaw',()=>{
 for(const[d,lateral,yaw,target]of[[-20,-2,Math.PI,-60],[1210,-3.5,0,1270],[1210,3.5,0,1270]]){
  const start=pose(d,lateral,yaw),end=pose(target,lateral,yaw),{s,result}=attemptedSweep(start,end,driveColliders(start));assert.equal(result.collided,true);assert.ok(result.contacts[0].id.startsWith('route-end-'));assert.equal(containsDrivePose(s),true);close(s.heading,start.heading);
 }
 assert.ok(roadBoundaryColliders(1205,50).some(c=>c.id==='route-end-service-court-return'),'caps are queried by their covered interval');
});

test('the actual bumper corners contact, rather than clipping through an under-width capsule',()=>{
 const p={x:0,z:0,heading:0},solid={id:'corner',x:1.065,z:-3.24,halfX:.04,halfZ:.04};assert.equal(vehiclePoseIntersects(p,solid),true);
 assert.equal(driveBodyCorners(p).length,4);assert.equal(vehiclePoseIntersects(p,{...solid,x:1.09}),false);
});

test('leaning against one visible rail emits a contact episode rather than an event every frame',()=>{
 const s=Object.assign(createDrive(),{x:0,z:0,heading:0,speed:0,lateralSpeed:0,odometer:0,wheelRotation:0}),wall={id:'rail-1',contactGroup:'left-edge',x:-1.15,z:0,halfX:.1,halfZ:10};
 for(let i=0;i<1000;i++){s.contactStartX=s.x;s.contactStartZ=s.z;s.contactStartHeading=s.heading;s.x-=.03;s.programTime=i/120;resolveVehicleContacts(s,[wall]);}
 assert.equal(s.events.filter(e=>e.type==='vehicle-contact').length,1);assert.ok(s.x>-0.012);
});

test('unmarked bay paving uses the exact existing road surface and paint stays on the unchanged centreline',()=>{
 const plain=roadside.doc.meshes.find(m=>m.name==='drive_plain_paving');assert.equal(plain.primitives.length,1);const p=plain.primitives[0],mat=roadside.doc.materials[p.material],original=drive.doc.materials.find(m=>m.name==='damp road aggregate');assert.equal(mat.name,original.name);assert.equal(mat.pbrMetallicRoughness.roughnessFactor,original.pbrMetallicRoughness.roughnessFactor);assert.deepEqual(meshBounds(roadside,'drive_plain_paving'),meshBounds({...drive,doc:{...drive.doc,meshes:[{name:'plain',primitives:[drive.doc.meshes.find(m=>m.name==='drive_road').primitives[0]]}]}},'plain'));
 const textureBytes=(asset,material)=>{const texture=asset.doc.textures[material.pbrMetallicRoughness.baseColorTexture.index],image=asset.doc.images[texture.source],view=asset.doc.bufferViews[image.bufferView];return asset.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength);};assert.deepEqual(textureBytes(roadside,mat),textureBytes(drive,original));
 const s=Object.assign(createDrive(),pose(850),{roadHeight:roadAt(850).height,cutEnabled:true});const scene=makeDriveScene(s,metrics,{showHands:false}),road=scene.props.find(p=>p.id==='drive_road-852-0'),a=worldAt(852);assert.ok(road);close(road.matrix[12],32+a.x);close(road.matrix[14],32+a.z);assert.ok(scene.props.some(p=>p.mesh==='drive_plain_paving'));assert.equal(scene.props.some(p=>p.id.startsWith('cut-rail-')),false,'one rail system remains');
});

test('static body, head and headlamp grade respect forward, reversed and crosswise vehicle headings',()=>{
 const d=338,road=roadAt(d);assert.ok(road.grade>.01);
 for(const yaw of[0,Math.PI,Math.PI/2,-Math.PI/2]){const s=Object.assign(createDrive(),pose(d,0,yaw),{roadHeight:road.height,bodyPitch:0,bodyRoll:0,bodyHeave:0}),attitude=driveRoadAttitude(s),delta=s.heading-road.heading;close(attitude.pitch,Math.atan(road.grade*Math.cos(delta)));close(attitude.roll,Math.atan(-road.grade*Math.sin(delta)));
  const scene=makeDriveScene(s,metrics,{showHands:false});close(scene.roadPitch,attitude.pitch);close(scene.lamps[0].shadowPitch,attitude.pitch-.02);const expectedUp=[-road.grade*Math.sin(road.heading),1,road.grade*Math.cos(road.heading)],length=Math.hypot(...expectedUp),actualUp=[scene.body[4],scene.body[5],scene.body[6]];actualUp.forEach((v,i)=>close(v,expectedUp[i]/length,2e-6));
 }
});

test('study and production geometry/contact sources stay synchronized',()=>{
 for(const name of['route-layout.js','road.js','route-boundaries.js','vehicle-contacts.js','scene.js','cut/scene.js']){const production=readFileSync(new URL('../src/game/source-drive/'+name,import.meta.url),'utf8'),study=readFileSync(new URL('../artifacts/source-drive-study/'+name,import.meta.url),'utf8');assert.equal(study,production.replace("from'../../data/source-door-fields.js'","from'/src/data/source-door-fields.js'"),name);}
 const m=JSON.parse(readFileSync(new URL('../artifacts/source-drive-study/cut/roadside-metrics.json',import.meta.url)));assert.equal(m.sha256,createHash('sha256').update(roadside.bytes).digest('hex'));
});
