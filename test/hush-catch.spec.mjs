import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HUSH_CATCH as C,hushCatchPlan,hushCatchFrame,hushCatchAfterimageAlpha,hushCatchVacuumLevel} from '../src/game/hush-catch.js';
import {contactHitPlan} from '../src/audio/contact-hit.js';
import {pressureBodyPosition} from '../src/game/pressure-performance.js';
import {pressureInstances} from '../src/render/pressure-volume.js';

const eye={x:10,z:10},near=(a,b,m=1e-6)=>assert.ok(Math.abs(a-b)<m,`${a} != ${b}`);
const plan=(target,extra={})=>hushCatchPlan({eye,target,viewYaw:0,lookYaw:.5,lookPitch:0,heightM:2.18,metresPerUnit:.5,...extra});
// Yaw 0 looks along -z.
const ahead={x:10,z:8},behind={x:10,z:12},right={x:12,z:10};
const main=readFileSync('src/main.js','utf8');
const body=name=>{const at=main.indexOf(`function ${name}(`);assert.ok(at>=0,name);return main.slice(at,main.indexOf('\n}\n',at));};

test('the camera turns to the real body, faster than it could be looked at',()=>{
  const rear=plan(behind);
  near(Math.abs(rear.yawDelta),Math.PI);near(rear.whipSeconds,C.whipMaxSeconds);near(rear.flashAt,rear.whipSeconds);
  const side=plan(right);near(side.yawDelta,Math.PI/2);assert.ok(side.whipSeconds>C.whipMinSeconds&&side.whipSeconds<C.whipMaxSeconds);
  const front=plan(ahead);assert.equal(front.yawDelta,0);assert.equal(front.flashAt,0,'already looking at it: the hit is immediate');
  assert.ok(front.pitchTo>0,'it is taller than the eye, so the look lifts');
  const mid=hushCatchFrame(rear,rear.whipSeconds/2),end=hushCatchFrame(rear,rear.whipSeconds);
  assert.ok(Math.abs(mid.look.yaw-.5)>Math.PI*.8,'most of the turn lands in the first half');
  near(end.look.yaw,.5+rear.yawDelta);near(end.look.pitch,rear.pitchTo);
  assert.equal(hushCatchFrame(rear,rear.whipSeconds+C.lookHoldSeconds+.01).look,null,'then the camera is the player\'s again');
});

test('nothing in the plan moves the body or invents a place for it',()=>{
  const gone=hushCatchPlan({eye,target:null,viewYaw:0,lookYaw:.5});assert.equal(gone.moves,false);assert.equal(gone.flashAt,0);
  assert.equal(hushCatchFrame(gone,0).look,null);assert.equal(hushCatchFrame(gone,.01).flash,1,'a catch with nothing to show still lands');
  assert.match(body('armHushJump'),/const target=pressureBodyPosition\(anchor,CELL\)/);
  assert.match(body('armHushJump'),/hushCatchPlan\(\{[^\n]*,target,/);
  const anchor={x:11,y:8,performance:{role:'live-pressure',manifestation:1,
    density:{version:1,postureVersion:2,doorX:.3,doorZ:-.15}}};
  const target=pressureBodyPosition(anchor,.5), [rendered]=pressureInstances(anchor);
  near(target.x,12.1);near(target.z,8.2);
  near(rendered.x,target.x*.5);near(rendered.z,target.z*.5);
  near(plan(target).yawDelta,Math.atan2(2.1,1.8));
  assert.equal(anchor.x,11);assert.equal(anchor.y,8);
});

test('the hit: one white frame behind the body, its negative, a stutter, then the zoom lets go',()=>{
  const p=plan(behind),at=since=>hushCatchFrame(p,p.flashAt+since);
  assert.equal(hushCatchFrame(p,p.flashAt-.01).flash,0,'no flash until the camera gets there');
  assert.equal(at(0).flash,1);assert.equal(at(C.flashSeconds-.001).flash,1);
  assert.equal(at(C.flashSeconds+1e-6).flash,0);assert.equal(at(C.flashSeconds+1e-6).negative,1);
  const stutter=C.flashSeconds+C.negativeSeconds+1e-6;assert.equal(at(stutter).negative,0);assert.equal(at(stutter).stutterStep,0);
  assert.equal(at(stutter+.09).stutterStep,1,'twelve drawn frames a second');assert.equal(at(stutter+C.stutterSeconds).stutterStep,null);
  assert.ok(at(C.zoomInSeconds).zoom>1.2);near(at(C.zoomInSeconds+C.zoomOutSeconds).zoom,1);
  assert.equal(at(.4).flash+at(.4).negative,0,'never a second strobe');
  // Fewer than three flashes in any second: one white, one negative.
  let flashes=0,was=false;for(let t=0;t<1;t+=1/240){const f=hushCatchFrame(p,t),on=f.flash>.5||f.negative>.5;if(on&&!was)flashes++;was=on;}
  assert.equal(flashes,1,'the white and its negative are one continuous event');
});

test('a slow machine still gets the white frame and its negative',()=>{
  const p=plan(ahead),memory={};
  const first=hushCatchFrame(p,.2,memory),second=hushCatchFrame(p,.4,memory),third=hushCatchFrame(p,.6,memory);
  assert.equal(first.flash,1,'the first frame after the hit is white, however late it arrives');
  assert.equal(second.negative,1,'the next one is its negative');assert.equal(third.flash+third.negative,0,'and then it is over');
  const soft={};assert.ok(hushCatchFrame(plan(ahead,{reducedFlash:true}),.2,soft).flash<=C.reducedLift,'reduced flash is never forced white');
});

test('reduced flash has no white field and no burn-in, reduced motion never touches the camera',()=>{
  const soft=plan(behind,{reducedFlash:true});
  for(let t=0;t<.72;t+=.01){const f=hushCatchFrame(soft,t);assert.ok(f.flash<=C.reducedLift+1e-9);assert.equal(f.negative,0);}
  assert.ok(hushCatchFrame(soft,C.reducedLiftSeconds/2).flash>.1,'the body is still lifted out of the dark');
  const still=plan(behind,{reducedMotion:true});assert.equal(still.moves,false);assert.equal(still.flashAt,0);
  for(let t=0;t<.72;t+=.01){const f=hushCatchFrame(still,t);assert.equal(f.look,null);assert.equal(f.zoom,1);assert.equal(f.stutterStep,null);}
  assert.equal(hushCatchFrame(still,.01).flash,1,'motion and flash are separate settings');
  assert.match(body('retainHushCatchFrame'),/hushCatchFlashing/);
  assert.equal(soft.reducedFlash,true);
  const quiet=contactHitPlan({reduced:true}),full=contactHitPlan();assert.ok(quiet.thump.peak<full.thump.peak*.6);assert.equal(quiet.ring,null);assert.equal(quiet.dull,null);
});

test('the sound: a crack at the grab, the thump on the flash, then a dull room',()=>{
  const p=contactHitPlan({flashAt:.18});near(p.flashAt,.18);assert.ok(p.crack.attack<=.002,'an abrupt onset');assert.ok(p.crack.highpassHz>1000,'broadband, above the voice');
  assert.ok(p.thump.toHz<60,'the chest');assert.ok(p.body.fromHz>150,'and something small speakers can play');assert.ok(p.ring.end>=1&&p.dull.end>=1);
  assert.equal(contactHitPlan({intensity:0}).allowed,false,'a silent contact stays silent');
  assert.ok(contactHitPlan().thump.peak+contactHitPlan().crack.peak<1.3,'the limiter catches it, it does not distort it');
});

test('the burn-in is one pale figure, gone inside two seconds',()=>{
  near(hushCatchAfterimageAlpha(0),C.afterimageAlpha);assert.ok(hushCatchAfterimageAlpha(.75)<C.afterimageAlpha/3);
  assert.equal(hushCatchAfterimageAlpha(C.afterimageSeconds),0);assert.ok(C.afterimageSeconds<2);
});

test('every contact path gets it, and the world keeps a clean frame loop',()=>{
  assert.match(body('tickLastExposure'),/hushCatchFrame\(lastExposureEvent\.hushCatch,lastExposureEvent\.elapsed,lastExposureEvent\)/);
  assert.match(body('cancelLastExposure'),/r3dSetCatchFlash\?\.\(0,0\);R3\.r3dSetCatchZoom\?\.\(1\)/);
  assert.match(main,/if\(!lastExposureEvent\?\.hushCatchHold\)render3d\(\);/);
  const shader=readFileSync('src/render/r3d.js','utf8');
  assert.match(shader,/activeCameraTanHalfFov=\(driveFrameActive \? \.65 : cinematicTanHalfFov\(authoredCamera\?\.lens\)\)\/catchZoom;/);
  assert.match(shader,/if\(uCatchFlash\.x>\.001\|\|uCatchFlash\.y>\.001\)\{/,'costs nothing and changes nothing outside a catch');
  const post=shader.slice(shader.indexOf('const POST_FRAG'),shader.indexOf('export function r3dPostShader'));
  assert.ok(post.includes('uCatchFlash'),'on the finished frame: the print stage draws flat white as nothing');
  assert.ok(post.indexOf('THE CATCH.')>post.indexOf('LIGHT IN THE CAMERA'),'over everything printed');
  assert.match(main,/const film=top\?\.faceplate===false\|\|!!\(lastExposureEvent\?\.hushCatch\|\|/,'nothing on screen but the photograph');
});

test('the room falls away as it closes, so the hit has silence to land in',()=>{
  assert.equal(hushCatchVacuumLevel(Infinity),1);assert.equal(hushCatchVacuumLevel(C.vacuumFarMetres),1);
  near(hushCatchVacuumLevel(C.vacuumNearMetres),C.vacuumFloor);near(hushCatchVacuumLevel(.2),C.vacuumFloor);
  assert.ok(hushCatchVacuumLevel(3)<1&&hushCatchVacuumLevel(3)>C.vacuumFloor,'over distance, never a cut');
  assert.ok(C.vacuumFarMetres>C.vacuumNearMetres&&C.vacuumNearMetres>.72,'it is quiet before the catch radius, not at it');
  assert.match(main,/worldDestination:hushCatchVacuum/,'only the room: speech and the heartbeat keep their own path');
  assert.match(main,/createWhisperBed\(actx,\{destination:hushCatchVacuum\|\|master,/,'and the bed that is loudest beside it');
  assert.match(main,/age:-HUSH_CATCH_AFTERIMAGE_DELAY/,'the burn-in waits for the flash to finish, or it would grey the body');
});
