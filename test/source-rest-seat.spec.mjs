import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {continuationDoors,continuationSupportAt,continuationRadialPoint,continuationChartSolids,continuationChartSurfaces,continuationSurfaceContains} from '../src/data/source-continuation.js';
import {sourceContinuationCanOccupy,continuationFocus,freshSourceContinuation,sourceContinuationFrame} from '../src/game/source-continuation.js';
import {sourceContinuationCamera} from '../src/render/source-continuation-renderer.js';
import {sourceRestGeometryLibrary} from '../src/render/source-rest-models.js';
import {SOURCE_REST_SEATS,SOURCE_REST_MESH,SOURCE_REST_II_MESH,SOURCE_REST_III_MESH,sourceRestEyePosition,sourceRestBenchProps,sourceRestFocus,sourceRestSeatForState,
 sourceRestSeatGeometry,sourceRestSeatHasSupport,sourceRestApproachProtected,sourceRestCamera} from '../src/game/source-rest-seat.js';
const state=s=>({...s,...s.approach,status:'active',yaw:s.phase==='catch'?0:Math.PI/2});

test('the actual settle, cloth and arms fit inside the shortened alcove partitions',()=>{
 const seat=SOURCE_REST_SEATS[0],prop=sourceRestBenchProps()[0],models=sourceRestGeometryLibrary(),solids=continuationChartSolids(state(seat));
 for(const name of ['rest-settle-frame','rest-settle-cloth','rest-settle-piping']){
  const positions=models[name].p;
  for(let i=0;i<positions.length;i+=3){
   const lx=positions[i],lz=positions[i+2]*prop.scaleZ,x=seat.x+lx*Math.cos(seat.yaw)+lz*Math.sin(seat.yaw),
     y=seat.feet+positions[i+1],z=seat.z-lx*Math.sin(seat.yaw)+lz*Math.cos(seat.yaw);
   assert.ok(!solids.some(s=>x>s.minX+.001&&x<s.maxX-.001&&y>s.minY+.001&&y<s.maxY-.001&&z>s.minZ+.001&&z<s.maxZ-.001),`${name} vertex ${i/3} intersects a real partition`);
  }
 }
});

test('the bespoke II settle and retained III bench occupy their actual chart refuges',()=>{
 const pack=JSON.parse(readFileSync(new URL('../public/assets/conservatory-props.stats.json',import.meta.url),'utf8'));
 assert.ok(pack.meshes[SOURCE_REST_MESH]?.triangles>0,'bench has real catalog geometry');
 const props=sourceRestBenchProps();assert.equal(props.length,2);
 for(const seat of SOURCE_REST_SEATS){
  const p=props.find(v=>v.id===seat.id);assert.equal(p.mesh,seat.phase==='wrong-return'?SOURCE_REST_II_MESH:SOURCE_REST_III_MESH);assert.equal(p.chartId,seat.chartId);assert.equal(p.region,seat.phase);
  assert.ok(sourceRestSeatHasSupport(seat),`${seat.id}: all corners and approach have floor`);
  assert.ok(sourceRestApproachProtected(seat),`${seat.id}: player can sit inside existing refuge`);
  const st=state(seat),geo=sourceRestSeatGeometry(seat);
  for(const point of [geo.center,...geo.corners])assert.ok(!continuationChartSolids(st).some(v=>point.x>v.minX&&point.x<v.maxX&&point.z>v.minZ&&point.z<v.maxZ&&v.maxY>seat.feet),`${seat.id}: no actual wall intersects the furniture`);
  assert.ok(sourceContinuationCanOccupy(geo.approach.x,geo.approach.z,st),`${seat.id}: the player's body fits at the actual approach`);
  for(let i=0;i<=10;i++){const t=i/10,x=seat.approach.x+(seat.x-seat.approach.x)*t,z=seat.approach.z+(seat.z-seat.approach.z)*t;
   assert.ok(continuationSupportAt(x,z,st));assert.ok(sourceContinuationCanOccupy(x,z,st));}
 }
});

test('seat prompt is local, phase- and chart-specific and cannot take a door handle',()=>{
 for(const seat of SOURCE_REST_SEATS){const s=state(seat),prompt=sourceRestFocus(s);
  assert.equal(prompt?.id,seat.id);assert.equal(prompt.title,'SIT AND LISTEN');
  assert.equal(sourceRestFocus({...s,chartId:seat.chartId+1}),null);
  assert.equal(sourceRestFocus({...s,feet:seat.feet+2}),null);
  assert.equal(sourceRestFocus({...s,fall:{elapsed:0}}),null);
  assert.equal(sourceRestFocus({...s,cameraTransit:{elapsed:0,duration:1}}),null);
  assert.equal(sourceRestFocus({...s,x:s.x-5}),null);
 }
 const door=continuationDoors().find(d=>d.id===`catch-return-${SOURCE_REST_SEATS[1].level}`),seat=SOURCE_REST_SEATS[1];
 const byDoor={...state(seat),x:door.x,z:door.z};assert.equal(sourceRestFocus(byDoor),null);
 assert.equal(continuationFocus(byDoor)?.id,`catch-return-${seat.level}`);
 const exposed={...state(seat),...continuationRadialPoint(11.20,4.13)};
 assert.ok(Math.hypot(exposed.x-seat.x,exposed.z-seat.z)<.72,'physically close to bench');
 assert.equal(sourceRestFocus(exposed),null,'outside actual refuge despite being in reach');
});

test('seated camera transition clears authored support and solid geometry at both seats',()=>{
 for(const seat of SOURCE_REST_SEATS){
  const st={...freshSourceContinuation(),...seat,...seat.approach,status:'active'},base=sourceContinuationCamera(sourceContinuationFrame(st));
  for(let i=0;i<=100;i++){
   const [x,y,z]=sourceRestCamera(seat,base,i/100).eye;
   assert.ok(!continuationChartSolids(st).some(v=>x>=v.minX&&x<=v.maxX&&z>=v.minZ&&z<=v.maxZ&&y>=v.minY&&y<=v.maxY),`${seat.id} avoids existing wall at sample ${i}`);
   assert.ok(!continuationChartSurfaces(st).some(v=>y>=v.y-v.thickness&&y<=v.y&&continuationSurfaceContains(v,x,z)),`${seat.id} avoids existing slab at sample ${i}`);
  }
 }
});

test('wrong-return approach requires looking at the bench',()=>{
 const seat=SOURCE_REST_SEATS[0],s=state(seat);
 assert.ok(sourceRestFocus(s));assert.equal(sourceRestFocus({...s,yaw:-Math.PI/2}),null);
});

test('camera blends from real first-person or overhead frame to a human-height seat and is reversible',()=>{
 for(const seat of SOURCE_REST_SEATS){const original=seat.phase==='catch'
  ?{eye:[-170,26,-90],yaw:0,pitch:-Math.PI/2,strictOverhead:true}
  :{eye:[-100.02,18.42,-18],yaw:Math.PI/2,pitch:0,strictOverhead:false};
  const zero=sourceRestCamera(seat,original,0),half=sourceRestCamera(seat,original,.5),end=sourceRestCamera(seat,original,1);
  assert.deepEqual(zero.eye,original.eye);assert.equal(zero.pitch,original.pitch);
  sourceRestEyePosition(seat).forEach((v,k)=>assert.ok(Math.abs(end.eye[k]-v)<1e-9));assert.ok(Math.abs(end.pitch-seat.view.pitch)<1e-9);
  assert.equal(end.strictOverhead,false);assert.equal(end.restOverride,true);
  for(let i=0;i<3;i++)assert.equal(half.eye[i],(original.eye[i]+end.eye[i])/2);
  const looked=sourceRestCamera(seat,original,1,{yaw:.2,pitch:-.3});assert.ok(Math.abs(looked.yaw-.2)<1e-9);assert.ok(Math.abs(looked.pitch+.3)<1e-9);
  assert.deepEqual(sourceRestCamera(seat,original,0).eye,original.eye,'return uses original camera');
 }
 assert.equal(sourceRestCamera(null,{eye:[0,0,0]},1),null);
});
