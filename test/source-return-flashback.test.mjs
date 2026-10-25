import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_RETURN_FLASHBACK as C,createSourceReturnFlashback,stepSourceReturnFlashback,sourceReturnFlashbackFrame,sampleSourceReturnFlashback,normalizeSourceReturnFlashbackCheckpoint} from '../src/game/source-return-flashback.js';
import {coastalLocalPoint} from '../src/data/coastal-memory.js';
import {doorDriveTeaserPoseAt,DOOR_DRIVE_TEASER} from '../src/game/source-drive/door-teaser.js';
import {worldAt} from '../src/game/source-drive/road.js';

const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url))),target={x:132.125,y:85.975,facing:2.8,yaw:2.7501,pitch:-.1275,floorH:0,eyeHeight:1.62};
const sample=(t,extra={})=>sampleSourceReturnFlashback(t,{destination:'chapel',metrics,...extra});
const close=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} differs from ${b}`);
const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function rigid(m){assert.equal(m.length,16);assert.ok(m.every(Number.isFinite));const axes=[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]];for(const a of axes)close(Math.hypot(...a),1,1e-6);for(const[a,b]of[[0,1],[0,2],[1,2]])close(axes[a].reduce((s,x,k)=>s+x*axes[b][k],0),0,1e-6);}
function local(m,p){const d=p.map((x,k)=>x-m[12+k]);return[m[0]*d[0]+m[1]*d[1]+m[2]*d[2],m[4]*d[0]+m[5]*d[1]+m[6]*d[2],m[8]*d[0]+m[9]*d[1]+m[10]*d[2]];}
const point=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];

test('the sea fades in under cover and only the final covered frame releases the exact existing exit',()=>{
 for(const destination of['chapel','tower']){const state=createSourceReturnFlashback({destination,returnPose:target,metrics});assert.equal(sourceReturnFlashbackFrame(state).coverAlpha,1);assert.equal(sample(2).coverAlpha,0);assert.equal(sample(52).coverAlpha,0);state.elapsed=54.999;const held=sourceReturnFlashbackFrame(state);assert.equal(held.handoffReady,false);assert.equal(held.destination,null);assert.equal(held.returnPose,null);state.elapsed=55;const done=sourceReturnFlashbackFrame(state);assert.equal(done.coverAlpha,1);assert.equal(done.handoffReady,true);assert.equal(done.destination,destination);assert.deepEqual(done.returnPose,target);done.returnPose.x=0;assert.deepEqual(state.returnPose,target,'returned copies cannot rewrite the actual captured exit');}
});

test('the deep start uses the same coast frame at42m, with a slow bounded drift and an exact C2 lift join',()=>{
 const first=sample(0),atFour=sample(4),atEight=sample(8),p=first.vehicle.position,localStart=coastalLocalPoint([32+p.x,p.y,32+p.z]);close(localStart[1],-42);assert.equal(first.phase,'seabed');assert.equal(first.underwater,1);assert.equal(first.vehicle.gear,-1);const distance=Math.hypot(...['x','y','z'].map(k=>atFour.vehicle.position[k]-p[k]));close(distance,.3,1e-6);for(const k of['x','y','z'])close(atEight.vehicle.position[k],p[k],1e-7);assert.ok(first.camera.pitch>.9,'an upward windscreen view belongs to an actual nose-up body');
 const forward=[Math.sin(first.camera.yaw)*Math.cos(first.camera.pitch),Math.sin(first.camera.pitch),-Math.cos(first.camera.yaw)*Math.cos(first.camera.pitch)],bodyForward=[-first.vehicle.bodyMatrix[8],-first.vehicle.bodyMatrix[9],-first.vehicle.bodyMatrix[10]];assert.ok(forward.reduce((s,x,k)=>s+x*bodyForward[k],0)>.97,'seat look uses the windscreen rather than pointing straight through the roof');
});

test('the backwards ascent reuses the real opening fall and cliff-road endpoints',()=>{
 for(const[t,source]of[[12,DOOR_DRIVE_TEASER.settledStart],[18,DOOR_DRIVE_TEASER.fallStart]]){const actual=sample(t).vehicle,opening=doorDriveTeaserPoseAt(source);for(const k of['x','y','z'])close(actual.position[k],opening.position[k],1e-6);for(let k=0;k<16;k++)close(actual.bodyMatrix[k],opening.bodyMatrix[k],1e-5);}
 const crest=sample(23).vehicle,road=worldAt(250);close(crest.distance,250);close(crest.position.x,road.x);close(crest.position.y,road.y);close(crest.position.z,road.z);close(angle(crest.heading,road.heading),0);let previous=304;for(let t=18;t<=23;t+=.1){const p=sample(t).vehicle;assert.ok(p.distance<=previous+1e-6);previous=p.distance;}
 const turned=sample(29).vehicle;close(turned.distance,225);close(Math.abs(angle(turned.heading,worldAt(225).heading)),Math.PI,1e-7);assert.equal(turned.gear,1);
 for(const t of[31,35,40])assert.ok(sample(t).vehicle.speed>0,'after the turn the van travels forward along its own axis');
});

test('all phases and every authored join remain finite and rigid without camera roll or body teleports',()=>{
 for(let t=0;t<=55;t+=.1){const f=sample(t);rigid(f.vehicle.bodyMatrix);assert.ok([...f.camera.eye,f.camera.yaw,f.camera.pitch,f.coverAlpha,f.sourceBlack,f.underwater,f.vehicle.speed].every(Number.isFinite));assert.equal(f.camera.roll,0);for(const a of[f.coverAlpha,f.sourceBlack,f.underwater])assert.ok(a>=0&&a<=1);assert.equal(f.controlsEnabled,false);}
 for(const t of[8,12,18,23,29,44,51,52]){const a=sample(t-1e-5),b=sample(t+1e-5);assert.ok(Math.hypot(...['x','y','z'].map(k=>a.vehicle.position[k]-b.vehicle.position[k]))<.001,'position joins at'+t);assert.ok(Math.abs(angle(a.vehicle.heading,b.vehicle.heading))<.001,'heading joins at'+t);assert.ok(Math.abs(a.vehicle.pitch-b.vehicle.pitch)<.001,'pitch joins at'+t);}
});

test('pause, focus loss and unavailable pictures freeze saved simulation time; reload retains the real target view',()=>{
 const state=createSourceReturnFlashback({destination:'tower',returnPose:target,metrics});stepSourceReturnFlashback(state,.25);const frozen=structuredClone(state);for(const flags of[{paused:true},{hidden:true},{interrupted:true},{renderReady:false}])for(let i=0;i<10;i++)stepSourceReturnFlashback(state,.25,flags);assert.deepEqual(state,frozen);const restored=normalizeSourceReturnFlashbackCheckpoint(JSON.parse(JSON.stringify(state)));assert.deepEqual(restored,state);assert.deepEqual(sourceReturnFlashbackFrame(restored),sourceReturnFlashbackFrame(state));const resumed=createSourceReturnFlashback({destination:'tower',checkpoint:restored,metrics,returnPose:{...target,x:0}});assert.deepEqual(resumed.returnPose,target,'resume preserves the original entrance instead of a cinematic camera');stepSourceReturnFlashback(resumed,.25);assert.equal(resumed.elapsed,.5);assert.deepEqual(state.returnPose,target);
});

test('normal advancement is partition independent while a long interrupted frame cannot skip the return',()=>{
 const a=createSourceReturnFlashback({destination:'chapel',metrics}),b=structuredClone(a);for(let i=0;i<100;i++)stepSourceReturnFlashback(a,.1);for(let i=0;i<40;i++)stepSourceReturnFlashback(b,.25);close(a.elapsed,b.elapsed);const fa=sourceReturnFlashbackFrame(a),fb=sourceReturnFlashbackFrame(b);for(const k of['x','y','z'])close(fa.vehicle.position[k],fb.vehicle.position[k],1e-7);const lag=createSourceReturnFlashback({destination:'chapel',metrics});stepSourceReturnFlashback(lag,30);assert.equal(lag.elapsed,.25);assert.equal(lag.clippedSeconds,29.75);for(let i=0;i<230;i++)stepSourceReturnFlashback(lag,.25);assert.equal(lag.elapsed,55);assert.equal(sourceReturnFlashbackFrame(lag).handoffReady,true);
});

test('reduced motion preserves the actual180degree vehicle turn while covering and stabilizing its camera transition',()=>{
 let previous=null;for(let t=23;t<=29;t+=.02){const normal=sample(t),reduced=sample(t,{reducedMotion:true});assert.deepEqual(normal.vehicle,reduced.vehicle,'accessibility does not alter where the car actually goes');assert.equal(reduced.camera.roll,0);if(previous&&reduced.coverAlpha<.99&&previous.coverAlpha<.99)assert.ok(Math.abs(angle(reduced.camera.yaw,previous.camera.yaw))<.05,'uncovered reduced camera cannot spin with the hydroplane');previous=reduced;}
 assert.equal(sample(26,{reducedMotion:true}).coverAlpha,1);assert.equal(sample(26).coverAlpha,0);close(sample(29,{reducedMotion:true}).camera.yaw,sample(29).camera.yaw,1e-6);
});

test('the camera physically exits through the driver-side window and rises outside the body before its rear dolly',()=>{
 const seat=metrics.eye.map((x,k)=>x+metrics.cabinBodyMount[k]),first=sample(44);for(let k=0;k<3;k++)close(first.camera.eye[k],point(first.vehicle.bodyMatrix,seat)[k],1e-6);assert.equal(first.camera.mode,'first-person');
 for(let t=47;t<=55;t+=.1){const f=sample(t),p=local(f.vehicle.bodyMatrix,f.camera.eye),lo=metrics.body.min,hi=metrics.body.max;assert.ok(p.some((x,k)=>x<lo[k]||x>hi[k]),'released camera remains physically outside the closed body');}
 const final=sample(51),p=local(final.vehicle.bodyMatrix,final.camera.eye);assert.ok(p[2]>metrics.body.max[2]+5);assert.ok(p[1]>metrics.body.max[1]+2);assert.equal(final.sourceBlack,1);assert.equal(final.camera.mode,'physical-dolly');
 for(const f of[first,final,sample(4)])for(const[i,lamp]of f.lamps.entries()){const expected=point(f.vehicle.bodyMatrix,metrics.body.headlamps[i]);for(let k=0;k<3;k++)close(lamp.position[k],expected[k],1e-6);close(Math.hypot(...lamp.direction),1,1e-6);}
});

test('checkpoint validation rejects wrong routes, invalid clocks and invented camera mounts',()=>{
 const state=createSourceReturnFlashback({destination:'chapel',metrics,returnPose:target});for(const bad of[null,{...state,destination:'town'},{...state,elapsed:Infinity},{...state,elapsed:-1},{...state,elapsed:56},{...state,returnPose:{...target,yaw:NaN}},{...state,vehicleMetrics:{...state.vehicleMetrics,eye:[0,0,NaN]}}])assert.equal(normalizeSourceReturnFlashbackCheckpoint(bad),null);assert.equal(normalizeSourceReturnFlashbackCheckpoint(state,{destination:'tower'}),null);assert.throws(()=>createSourceReturnFlashback({destination:'town',metrics}),/existing chapel or tower/);assert.throws(()=>createSourceReturnFlashback({destination:'chapel'}),/actual loaded vehicle metrics/);
});
