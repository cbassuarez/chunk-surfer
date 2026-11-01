import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {GOD_PLACE_HOOKS} from '../src/data/god-hooks.js';
import {CELL,F,MATERIAL,ZONE} from '../src/data/floorplan/legend.js';
import {SOURCE_REST_ALCOVE_SOLIDS} from '../src/data/source-rest-alcove.js';
import {continuationSurfaces,continuationSurfaceContains} from '../src/data/source-continuation.js';
import {sourceContinuationGeometry,sourceContinuationMeshPayload} from '../src/render/source-continuation-renderer.js';
import {STILLNESS_ANATOMY} from '../src/data/generated/stillness-anatomy.js';
import {resolveStillnessReceivers,traceStillnessWall,sourceStillnessReceivers} from '../src/render/stillness-receivers.js';

function room({originX=0,originY=0,floor=0,ceil=3,material=MATERIAL.practiceFoam}={}){
  const w=16,h=16,rgba=new Uint8Array(w*h*4),materials=new Uint8Array(w*h).fill(material);
  const write=(x,z,values={})=>{const i=z*w+x;rgba.set([FP.encodeH(values.floor??floor),FP.encodeH(values.ceil??ceil),values.flags??0,values.zone??ZONE.practice],i*4);materials[i]=values.material??material;};
  for(let z=0;z<h;z++)for(let x=0;x<w;x++)write(x,z,{flags:x===0||z===0||x===w-1||z===h-1?F.SOLID:0});
  return{w,h,rgba,material:materials,originX,originY,key:'test-room',group:'upper',write};
}
const camera={eye:[4.25,1.62,4.25],yaw:0,pitch:0};
const north=options=>traceStillnessWall({camera,direction:[0,0,-1],...options});
const near=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} should be ${expected}`);
function points(receiver){return[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>receiver.origin.map((v,i)=>v+receiver.right[i]*x*receiver.widthM/2+receiver.up[i]*y*receiver.heightM/2));}
function donorUvMatches(receiver,payload){
  for(let i=0;i<payload.positions.length;i+=3){
    const normal=[...payload.normals.subarray(i,i+3)];
    if(normal.reduce((sum,v,a)=>sum+v*receiver.normal[a],0)<.999)continue;
    const world=[...payload.positions.subarray(i,i+3)].map((v,a)=>v+payload.bounds.center[a]);
    const delta=world.map((v,a)=>v-receiver.origin[a]);
    const dx=delta.reduce((sum,v,a)=>sum+v*receiver.right[a],0),dy=delta.reduce((sum,v,a)=>sum+v*receiver.up[a],0);
    for(let a=0;a<2;a++)near(payload.uvs[i/3*2+a],receiver.uvOrigin[a]+receiver.uvRight[a]*dx+receiver.uvUp[a]*dy,1e-5);
    return;
  }
  assert.fail('the actual donor must include the receiver-facing plane');
}

test('cardinal receivers are bounded real planes and preserve their native material and anatomical aspect',()=>{
  const plan=room(),result=resolveStillnessReceivers({renderPlan:plan,camera});
  assert.equal(result.receivers.length,4);assert.equal(result.rejected.length,0);
  const facing=result.receivers.find(r=>r.normal[2]===1);
  near(facing.origin[2],.5);assert.equal(facing.materialId,MATERIAL.practiceFoam);assert.equal(facing.zone,ZONE.practice);
  for(const receiver of result.receivers){
    assert.ok(receiver.widthM<=1.4+1e-9&&receiver.heightM<=1.9+1e-9);near(receiver.heightM/receiver.widthM,1.4);
    const [r,u,n]=[receiver.right,receiver.up,receiver.normal];
    [r[1]*u[2]-r[2]*u[1],r[2]*u[0]-r[0]*u[2],r[0]*u[1]-r[1]*u[0]].forEach((v,i)=>near(v,n[i]));
    for(const p of points(receiver))p.forEach((v,i)=>assert.ok(v>=receiver.host.min[i]-1e-8&&v<=receiver.host.max[i]+1e-8));
  }
});

test('a first wall stops the ray; another attractive receiver behind it is never selected',()=>{
  const plan=room();for(let x=1;x<15;x++)plan.write(x,5,{flags:F.SOLID});
  const hit=north({renderPlan:plan});assert.equal(hit.supported,true);near(hit.distanceM,1.25);near(hit.point[2],3);
  assert.deepEqual(hit.normal,[0,0,1]);assert.equal(hit.cell.z,6);
});

test('a material seam and an aperture limit the full rectangle, rather than only its centre',()=>{
  const plan=room();
  for(let x=1;x<8;x++)plan.write(x,1,{material:MATERIAL.acousticFoam});
  plan.write(9,0); // an actual opening immediately beside the acquired wall
  const result=resolveStillnessReceivers({renderPlan:plan,camera,viewRay:true});
  assert.equal(result.receivers.length,1);const r=result.receivers[0];
  assert.ok(r.host.min[0]>=4.025-1e-8);assert.ok(r.host.max[0]<=4.475+1e-8);
  assert.ok(r.widthM<.5,'the head fits the single surviving half-metre face');
  near(r.heightM/r.widthM,1.4);
});

test('doorways, glazing, a riser and open map edges produce explicit rejections',()=>{
  const door=room();door.write(8,3,{flags:F.DOOR});assert.equal(north({renderPlan:door}).reason,'door');
  const glass=room({material:MATERIAL.roofGlass});assert.equal(north({renderPlan:glass}).reason,'glass');
  const riser=room();riser.write(8,3,{floor:2});assert.equal(north({renderPlan:riser}).reason,'riser');
  const header=room();header.write(8,3,{ceil:1});assert.equal(north({renderPlan:header}).reason,'header');
  const edge=room();for(let z=0;z<16;z++)edge.write(8,z);assert.equal(north({renderPlan:edge}).reason,'open-edge');
  const short=room({ceil:.4});const result=resolveStillnessReceivers({renderPlan:short,camera:{eye:[4.25,.2,4.25]}});
  assert.equal(result.receivers.length,0);assert.ok(result.rejected.every(r=>r.reason.startsWith('insufficient-')));
});

test('body-height and view rays use the encoded visible height, including down-looking floor rejection',()=>{
  const plan=room({floor:.03,ceil:2.53});
  // Deliberately contradict float arrays: the renderer uses its RGBA bytes.
  plan.floor=new Float32Array(256).fill(999);plan.ceil=new Float32Array(256).fill(-999);
  const result=resolveStillnessReceivers({renderPlan:plan,camera});assert.equal(result.receivers.length,4);
  near(result.receivers[0].host.floorM,FP.decodeH(FP.encodeH(.03)));
  near(result.receivers[0].host.ceilingM,FP.decodeH(FP.encodeH(2.53)));
  const down=resolveStillnessReceivers({renderPlan:plan,camera:{...camera,pitch:-.9},viewRay:true});
  assert.equal(down.receivers.length,0);assert.equal(down.rejected[0].reason,'floor');
  const wet=room({material:MATERIAL.wetTile});
  assert.equal(traceStillnessWall({renderPlan:wet,camera,direction:[0,-1,0]}).reason,'water-or-wet-floor');
});

test('the exact bounded range includes a wall on its boundary, and sky/walled heights match MARCH',()=>{
  assert.equal(north({renderPlan:room(),maxDistanceM:3.75}).supported,true);
  assert.equal(north({renderPlan:room(),maxDistanceM:3.74}).reason,'out-of-range');
  const sky=room({ceil:.5});for(let z=1;z<15;z++)for(let x=1;x<15;x++)sky.write(x,z,{flags:F.SKY});
  assert.equal(north({renderPlan:sky}).supported,true,'unwalled sky replaces the nominal ceiling with the horizon height');
  for(let z=1;z<15;z++)for(let x=1;x<15;x++)sky.write(x,z,{flags:F.SKY|F.WALLED});
  assert.equal(north({renderPlan:sky}).reason,'outside-wall-height');
});

test('negative physical origins stay in metres and never use logical map coordinates',()=>{
  const plan=room({originX:-40,originY:200});
  const translated={eye:[camera.eye[0]-20,camera.eye[1],camera.eye[2]+100],yaw:0,pitch:0};
  const a=resolveStillnessReceivers({renderPlan:room(),camera,viewRay:true}).receivers[0];
  const b=resolveStillnessReceivers({renderPlan:plan,camera:translated,viewRay:true}).receivers[0];
  near(b.origin[0],a.origin[0]-20);near(b.origin[2],a.origin[2]+100);
  assert.equal(b.host.originX,-40);assert.equal(b.host.originY,200);assert.deepEqual(b.normal,a.normal);
});

test('a nearer prop blocks placement, while protected writing clips the host at its complete projection',()=>{
  const plan=room();
  const blocked=north({renderPlan:plan,blockedPropAABBs:[{id:'notice-board',min:[4,1,1],max:[4.5,2.5,2]}]});
  assert.equal(blocked.reason,'blocked-prop');assert.equal(blocked.propId,'notice-board');
  const result=resolveStillnessReceivers({renderPlan:plan,camera,viewRay:true,
    blockedPropAABBs:[{id:'writing',min:[3.5,.6,.48],max:[4.1,2.5,.52]}]});
  assert.equal(result.receivers.length,1);assert.ok(result.receivers[0].host.min[0]>=4.125-1e-8);
});

test('lower-wall protection shrinks anatomy near the acquired gaze before lifting it outside the view',()=>{
  const plan=room({floor:4.8,ceil:8.94}),eye=[4.25,6.42,4.25];
  const blocked={id:'protected-lower-wall',min:[.5,4.8,.48],max:[7.5,6.185,.52]};
  const result=resolveStillnessReceivers({renderPlan:plan,camera:{eye,yaw:0,pitch:0},viewRay:true,blockedPropAABBs:[blocked]});
  assert.equal(result.receivers.length,1);const r=result.receivers[0];
  near(r.origin[1],6.57);near(r.heightM,.72);near(r.heightM/r.widthM,1.4);
  assert.ok(r.host.min[1]>=6.21-1e-8,'all anatomy remains above the protected surface');
  assert.ok(Math.abs(r.origin[1]-(eye[1]-.1))<=.25+1e-8);
  const eyeUv=STILLNESS_ANATOMY.landmarkUVs.leftLid.neutral[1];
  assert.ok(Math.abs(r.origin[1]+(eyeUv-.5)*r.heightM-eye[1])<.25,'the actual anatomical eyes remain around the acquired gaze');
  for(const p of points(r))assert.ok(p[1]>=6.21-1e-8&&p[1]<=FP.decodeH(FP.encodeH(8.94))-.025+1e-8);
  const tooHigh={...blocked,max:[7.5,6.305,.52]};
  const rejected=resolveStillnessReceivers({renderPlan:plan,camera:{eye,yaw:0},viewRay:true,blockedPropAABBs:[tooHigh]});
  assert.equal(rejected.receivers.length,0,'reject an unusably small head instead of lifting it farther above view');
});

test('invalid inputs stay finite, and valid inputs are not mutated or re-latched by the resolver',()=>{
  for(const options of[{}, {renderPlan:room(),camera:{eye:[NaN,0,0]}}, {renderPlan:room(),camera:{eye:[0,Infinity,0]}}]){
    const result=resolveStillnessReceivers(options);assert.deepEqual(result.receivers,[]);assert.equal(result.rejected.length,1);
  }
  const plan=room(),rgba=plan.rgba.slice(),eye=[...camera.eye];
  const a=resolveStillnessReceivers({renderPlan:plan,camera,maxDistanceM:Infinity,widthM:Infinity,heightM:NaN,depthM:-99});
  assert.ok(a.receivers.length);assert.deepEqual(plan.rgba,rgba);assert.deepEqual(camera.eye,eye);
  for(const r of a.receivers)assert.ok([...r.origin,...r.right,...r.up,...r.normal,r.widthM,r.heightM,r.depthM].every(Number.isFinite));
});

test('the actual compiled Practice 2 review wall has the exact physical plane and installed material',()=>{
  FP.compile(conservatory.levels,conservatory);
  const logical=FP.toRuntimePoint(GOD_PLACE_HOOKS['practice-2'].at),physical=FP.logicalToPhysical(logical.x,logical.y);
  assert.equal(FP.isSolid(logical.x,logical.y),false);
  const plan=FP.physicalRenderPlanFor(logical.x,logical.y),eye=[physical.x*CELL,physical.y+1.62,physical.z*CELL];
  const result=resolveStillnessReceivers({renderPlan:plan,camera:{eye,yaw:Math.PI,pitch:0},viewRay:true});
  assert.equal(result.receivers.length,1);const r=result.receivers[0];
  assert.equal(r.host.group,'upper');assert.equal(r.materialId,MATERIAL.practiceFoam);assert.equal(r.zone,ZONE.practice);
  near(r.host.planeCoordinate,53.5);assert.deepEqual(r.normal,[0,0,-1]);assert.ok(r.distanceM<1.51);
  // Both sides of every advertised corner agree with the actual physical
  // slice: front is air at that height, rear is solid, including seam ends.
  for(const corner of points(r))for(const sign of[-1,1]){
    const point=corner.map((v,i)=>v+r.normal[i]*sign*.005);
    const ix=Math.floor(point[0]/CELL)-plan.originX,iz=Math.floor(point[2]/CELL)-plan.originY;
    const flags=plan.rgba[(iz*plan.w+ix)*4+2];assert.equal(!!(flags&F.SOLID),sign<0);
  }
  const portalIndex=plan.rgba.findIndex((value,index)=>index%4===2&&(value&F.DOOR)&&!(value&F.SOLID));
  assert.ok(portalIndex>=0,'the real slice includes native doorway semantics');
  const cell=(portalIndex-2)/4,doorX=(cell%plan.w+plan.originX+.5)*CELL,doorZ=(Math.floor(cell/plan.w)+plan.originY+.5)*CELL;
  const floor=FP.decodeH(plan.rgba[cell*4]);
  const doorHit=traceStillnessWall({renderPlan:plan,camera:{eye:[doorX,floor+1.3,doorZ]},direction:[1,0,0]});
  assert.equal(doorHit.reason,'door');
  const pilot=resolveStillnessReceivers({renderPlan:plan,camera:{eye:[68.75,6.42,52.75],yaw:Math.PI,pitch:0},viewRay:true,
    blockedPropAABBs:[{id:'pilot-lower-wall-protection',min:[66,4.8,53.48],max:[71,6.185,53.52]}]});
  assert.equal(pilot.receivers.length,1);near(pilot.receivers[0].origin[1],6.57);near(pilot.receivers[0].heightM,.72);
  near(pilot.receivers[0].host.planeCoordinate,53.5);assert.ok(pilot.receivers[0].host.min[1]>=6.21-1e-8);
});

test('curated II fits real wood anatomy into its north jamb and reports the undersized south host',()=>{
  const result=sourceStillnessReceivers(1);assert.equal(result.receivers.length,1);assert.equal(result.rejected.length,1);
  const r=result.receivers[0],solid=SOURCE_REST_ALCOVE_SOLIDS.find(s=>s.id===r.host.sourceId);
  assert.equal(r.sourceMaterial,'wood');assert.equal(r.origin[0],solid.maxX);assert.ok(r.widthM<=.46+1e-9);near(r.heightM/r.widthM,1.4);
  assert.equal(result.rejected[0].reason,'insufficient-width');assert.ok(result.rejected[0].availableWidthM<.2);
  const donors=sourceContinuationGeometry({phase:'wrong-return'});const donor=donors.find(p=>p.name===r.donorName);assert.ok(donor);
  const payload=sourceContinuationMeshPayload(donor);
  for(const corner of points(r))assert.ok(corner[2]>solid.minZ&&corner[2]<solid.maxZ&&corner[1]>solid.minY&&corner[1]<solid.maxY);
  assert.ok(payload.triangles>0);near(r.uvRight[0],1/2.8);near(r.uvUp[1],-1/2.8);donorUvMatches(r,payload);
});

test('curated III rectangles fit the actual tessellated receiving floors and preserve every donor UV mapping',()=>{
  const {receivers,rejected}=sourceStillnessReceivers(2);assert.equal(receivers.length,4);assert.equal(rejected.length,0);
  const surfaces=continuationSurfaces({phase:'catch'}),geometry=sourceContinuationGeometry({phase:'catch'});
  for(const r of receivers){
    const s=surfaces.find(s=>s.id===r.host.sourceId),donor=geometry.find(p=>p.name===r.donorName);assert.ok(s&&donor);
    assert.equal(r.origin[1],s.y);near(r.heightM/r.widthM,1.4);assert.deepEqual(r.normal,[0,1,0]);
    for(const p of points(r))assert.ok(continuationSurfaceContains(s,p[0],p[2],.02));
    const sample=sourceContinuationMeshPayload(donor);assert.ok(sample.triangles>0);
    const metres=r.sourceMaterial==='cold-stone'?8:2.8;
    near(r.uvOrigin[0],r.origin[0]/metres);near(r.uvOrigin[1],r.origin[2]/metres);
    near(r.uvRight[0],r.right[0]/metres);near(r.uvRight[1],r.right[2]/metres);
    donorUvMatches(r,sample);
  }
  assert.deepEqual(receivers[0].origin,[-166.3,8.4,-83.7]);
});
