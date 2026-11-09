import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPrologueDrive} from '../src/game/source-drive/prologue-drive.js';
import {prologueRoadAt,prologueRoadSurfaceAt} from '../src/game/source-drive/prologue-road.js';
import {wheelHandDiagnostics,resetWheelHands} from '../src/game/source-drive/geometry/wheel-hands-pose.js';
import {makeDriveScene} from '../src/game/source-drive/scene.js';
import {createDrive} from '../src/game/source-drive/drive-state.js';

const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url),'utf8'));
const advance=(d,seconds)=>{for(let t=0;t<seconds-1e-8;t+=1/60)d.update(Math.min(1/60,seconds-t));};
const prop=(f,id)=>{const p=f.scene.props.find(p=>p.id===id);assert.ok(p,id);return p;};
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const matrixClose=(a,b,e=1e-6)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>close(v,b[i],e));};
function localRotation(body,matrix){return [0,1,2].flatMap(c=>[0,1,2].map(r=>body[r*4]*matrix[c*4]+body[r*4+1]*matrix[c*4+1]+body[r*4+2]*matrix[c*4+2]));}

test('a five minute answer wait keeps a physically moving van on the same safe road',()=>{
 const d=createPrologueDrive();assert.equal(d.start(),true);const first=d.snapshot();assert.ok(first.driveState.odometer>1);assert.ok(first.driveState.speed>12);let previous=first.vehiclePose.distance,minSpeed=Infinity,maxOffset=0;
 for(let frame=0;frame<300*30;frame++){
  d.update(1/30);const s=d.snapshot(),r=prologueRoadSurfaceAt(s.driveState.x,s.driveState.z);
  assert.ok(r.distance>previous,'no reversed travel or coordinate rebase');previous=r.distance;minSpeed=Math.min(minSpeed,s.driveState.speed);maxOffset=Math.max(maxOffset,Math.abs(r.offset));
  assert.equal(s.commitment,null);assert.equal(s.finished,false);assert.equal(s.driveState.brakeHold,false);assert.equal(s.driveState.journey.maxBacktrackMetres,0);assert.equal(s.driveState.journey.returnMetres,0);assert.equal(r.unsupported,false);
  if(frame%900===0){const f=d.frame(metrics);assert.ok(f.scene.props.length<800);assert.ok(!f.scene.props.some(p=>/canonical-goods|opening-warning-wheel|dp_wreck|cut_/.test(p.id)));for(const p of f.scene.props)assert.ok(Array.from(p.matrix).every(Number.isFinite));assert.equal(f.coastalMemory,null);}
 }
 assert.ok(previous>3500);assert.ok(minSpeed>12);assert.ok(maxOffset<2.6,`maximum offset ${maxOffset}`);d.dispose();
});

test('the retained opening bends join the continued road without a position or tangent jump',()=>{
 const a=prologueRoadAt(-32-1e-5),b=prologueRoadAt(-32+1e-5);close(a.x,b.x,1e-6);close(a.heading,b.heading,1e-6);close(a.curvature,b.curvature,1e-6);
});

test('holding a real blade phase stops the blade matrices while rain and travel continue, then resumes that phase',()=>{
 const d=createPrologueDrive();d.start();advance(d,.6);const before=d.frame(metrics),phase=d.snapshot().wiperPhase,rotation=localRotation(before.scene.body,prop(before,'drive-wiper-left').matrix),wet=before.weather.wetness.data.reduce((a,b)=>a+b,0);
 d.setEmbodiment({holdWiper:true});advance(d,3);const held=d.frame(metrics),s=d.snapshot();close(s.wiperPhase,phase,1e-10);assert.equal(s.wiperMoving,false);assert.ok(s.weatherClock>3);assert.ok(s.driveState.odometer>before.driveState.odometer+30);matrixClose(localRotation(held.scene.body,prop(held,'drive-wiper-left').matrix),rotation,2e-6);assert.ok(held.weather.wetness.data.reduce((a,b)=>a+b,0)>wet);
 d.setEmbodiment({holdWiper:false});d.update(1/60);const resumed=d.snapshot();assert.equal(resumed.wiperMoving,true);close((resumed.wiperPhase-phase+Math.PI*2)%(Math.PI*2),Math.PI*2/2.62/60,1e-8);d.dispose();
});

test('the seam performs one actual full wheel turn while the submitted palm transforms stay planted',()=>{
 const d=createPrologueDrive();d.start();d.frame(metrics);d.setEmbodiment({cue:'seam',progress:0});const a=d.frame(metrics),rootA=prop(a,'drive_right_hand').character.joints.drive_wheel_hands_root;
 d.setEmbodiment({progress:.5});const half=d.frame(metrics),rootHalf=prop(half,'drive_right_hand').character.joints.drive_wheel_hands_root;assert.notDeepEqual(prop(half,'drive_wheel').matrix,prop(a,'drive_wheel').matrix);assert.deepEqual(rootHalf,rootA);close(a.embodiment.wheelAngle-half.embodiment.wheelAngle,Math.PI,1e-10);
 d.setEmbodiment({progress:1});const full=d.frame(metrics);matrixClose(prop(full,'drive_wheel').matrix,prop(a,'drive_wheel').matrix);assert.deepEqual(prop(full,'drive_right_hand').character.joints.drive_wheel_hands_root,rootA);close(a.embodiment.wheelAngle-full.embodiment.wheelAngle,Math.PI*2,1e-10);assert.equal(wheelHandDiagnostics().hands.right.unreachable,false);d.dispose();
});

test('release and grip change actual finger joints without detaching the thumb or wrists',()=>{
 const d=createPrologueDrive();d.start();d.frame(metrics);d.setEmbodiment({cue:'release',progress:0});const closed=prop(d.frame(metrics),'drive_left_hand').character.joints;
 d.setEmbodiment({progress:1});const opened=prop(d.frame(metrics),'drive_left_hand').character.joints;assert.notDeepEqual(opened['drive_left_index-finger-phalanx-proximal'],closed['drive_left_index-finger-phalanx-proximal']);assert.deepEqual(opened.drive_wheel_hands_root,closed.drive_wheel_hands_root);assert.deepEqual(opened['drive_left_thumb-phalanx-proximal'].rotation,[0,0,0,1]);
 d.setEmbodiment({cue:'grip',progress:1});const grip=prop(d.frame(metrics),'drive_left_hand').character.joints;assert.notDeepEqual(grip['drive_left_index-finger-phalanx-proximal'],closed['drive_left_index-finger-phalanx-proximal']);assert.ok(wheelHandDiagnostics().hands.left.poseOpen<0);d.dispose();
});

test('pause freezes the drive, body performance and glass, and disposal prevents presentation',()=>{
 const d=createPrologueDrive();d.start();d.setEmbodiment({cue:'seam'});d.update(.2);d.setPaused(true);const a=d.snapshot();d.update(20);assert.deepEqual(d.snapshot(),a);assert.equal(d.lookBy(.1,.1),false);d.setPaused(false);d.update(.1);assert.ok(d.snapshot().timeSec>a.timeSec);assert.equal(d.dispose(),true);assert.equal(d.frame(metrics),null);assert.equal(d.setEmbodiment({cue:'release'}),false);
});

test('cab-only borrowing preserves the ordinary cabin geometry and lighting by default',()=>{
 const state=createDrive();Object.assign(state,{paused:false,speed:13,programTime:1});resetWheelHands();const ordinary=makeDriveScene(state,metrics);resetWheelHands();const cab=makeDriveScene(state,metrics,{cabOnly:true});
 for(const p of cab.props){const old=ordinary.props.find(q=>q.id===p.id);assert.ok(old,p.id);assert.deepEqual(p,old);}
 assert.deepEqual(cab.lamps.slice(0,3),ordinary.lamps.slice(0,3));assert.deepEqual(cab.eye,ordinary.eye);assert.deepEqual(cab.body,ordinary.body);assert.deepEqual(cab.cabLight,ordinary.cabLight);
});
