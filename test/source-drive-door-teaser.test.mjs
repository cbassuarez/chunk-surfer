import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDoorDriveTeaser,doorDriveTeaserPoseAt,DOOR_DRIVE_TEASER as C} from '../src/game/source-drive/door-teaser.js';
import {worldAt} from '../src/game/source-drive/road.js';

const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url),'utf8'));
const point=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} differs from ${b}`);
const advance=(teaser,t,dt=1/60)=>{for(let elapsed=0;elapsed<t-1e-9;){const step=Math.min(dt,t-elapsed);teaser.update(step);elapsed+=step;}};

test('a fresh teaser owns no journey, opens already moving and hearing an existing service bulletin',()=>{
 const teaser=createDoorDriveTeaser();assert.equal(teaser.snapshot().phase,'idle');assert.equal(teaser.frame(metrics).renderFrame,null);
 assert.equal(teaser.start(),true);assert.equal(teaser.start(),false);
 const first=teaser.frame(metrics);assert.equal(first.phase,'sound-lead');assert.equal(first.coverAlpha,1);assert.equal(first.worldOwner,'drive');
 assert.ok(first.driveState.speed>6);assert.equal(first.renderFrame.radio.audible,true);assert.equal(first.renderFrame.radio.cue.id,'service-water');
 assert.deepEqual(first.driveState.takes,[]);assert.deepEqual(first.driveState.events,[]);assert.equal(first.driveState.activeTake,null);
 assert.equal(first.renderFrame.recording.active,false);assert.equal(first.renderFrame.cinematicLook,true);
 teaser.update(C.soundLeadEnd);near(teaser.snapshot().vehiclePose.distance,258);teaser.dispose();
});

test('the real exposed edge is fixed from the first view while the closed road and world remain present',()=>{
 const teaser=createDoorDriveTeaser();teaser.start();teaser.update(1.1);
 const {scene}=teaser.frame(metrics).renderFrame;
 assert.ok(scene.teaser.removedIds.some(id=>id.startsWith('route-edge-right-')));
 assert.ok(scene.teaser.removedIds.includes('queue-no-road-below'));
 assert.ok(scene.props.some(p=>p.id==='drive_road-298-0'),'retained carriageway has a visible edge');
 assert.ok(scene.props.some(p=>p.id.startsWith('route-edge-left-')),'the opposite rail is still physical');
 assert.ok(scene.props.some(p=>p.id==='queue-standing'),'the existing climbing queue remains');
 teaser.dispose();
});

test('the exposed cliff commits the opening to a loaded forward pull, including attempted brake and reverse input',()=>{
 const teaser=createDoorDriveTeaser();teaser.start();teaser.update(C.departureStart-.01);
 const before=teaser.snapshot();assert.equal(before.vehiclePose.cliffCommitted,false);assert.ok(before.vehiclePose.distance<C.commitDistance);
 teaser.update(.41,{input:{reverse:true,brake:true,forward:false}});
 const committed=teaser.snapshot();assert.equal(committed.vehiclePose.cliffCommitted,true);assert.ok(committed.vehiclePose.distance>C.commitDistance);
 assert.ok(committed.driveState.engineLoad>before.driveState.engineLoad+.4);assert.ok(committed.driveState.throttle>before.driveState.throttle+.3);
 assert.equal(committed.driveState.brakeHold,false);assert.equal(committed.driveState.brakeAmount,0);
 teaser.update(C.fallStart-committed.timeSec+.8,{input:{reverse:true,brake:true}});
 const falling=teaser.snapshot();assert.equal(falling.phase,'fall');assert.equal(falling.vehiclePose.cliffCommitted,true);assert.ok(falling.vehiclePose.position.y<committed.vehiclePose.position.y-3);
 teaser.setPaused(true);const held=teaser.snapshot();teaser.update(99);assert.deepEqual(teaser.snapshot(),held,'the authored commitment still respects the global pause');teaser.dispose();
});

test('authored motion stays finite and continuous, then falls away from a fixed ground query under gravity',()=>{
 for(let time=0;time<C.duration+.005;time+=.01){
  const p=doorDriveTeaserPoseAt(time);assert.ok(p.bodyMatrix.every(Number.isFinite));assert.ok(Object.values(p.position).every(Number.isFinite));
  assert.ok(p.coverAlpha>=0&&p.coverAlpha<=1);assert.ok(p.timeSec>=0&&p.timeSec<=C.duration);
 }
 for(const t of [C.departureStart,C.fallStart,C.impactStart,C.returnStart]){
  const a=doorDriveTeaserPoseAt(t-1e-6),b=doorDriveTeaserPoseAt(t+1e-6);
  assert.ok(Math.hypot(...['x','y','z'].map(k=>a.position[k]-b.position[k]))<.001,'a phase change cannot teleport the vehicle');
  assert.ok(Math.abs(a.pitch-b.pitch)<.001);
 }
 const a=doorDriveTeaserPoseAt(C.fallStart+1),b=doorDriveTeaserPoseAt(C.fallStart+2);
 assert.deepEqual(a.sceneAnchor,b.sceneAnchor);assert.equal(a.distance,C.releaseDistance);
 near(b.verticalVelocity-a.verticalVelocity,-9.81);assert.ok(b.position.y<a.position.y-15);
 assert.ok(b.position.z<a.position.z-5);assert.equal(b.roll,0);
 assert.deepEqual(doorDriveTeaserPoseAt(Infinity),doorDriveTeaserPoseAt(0));
 assert.deepEqual(doorDriveTeaserPoseAt(-1),doorDriveTeaserPoseAt(0));
 near(doorDriveTeaserPoseAt(999).timeSec,C.duration);
});

test('falling cabin, eyes, hands, headlamps and accumulated pane share the actual transform without moving fixed scenery',()=>{
 const teaser=createDoorDriveTeaser();teaser.start();teaser.update(C.fallStart+.8);
 const a=teaser.frame(metrics),r=a.renderFrame,scene=r.scene;
 assert.ok(scene.body[13]<worldAt(C.releaseDistance).height-3);
 const expectedEye=point(scene.body,metrics.eye.map((v,i)=>v+metrics.cabinBodyMount[i]));
 scene.eye.forEach((v,i)=>near(v,expectedEye[i],2e-5));
 const glassEye=point(r.weather.worldToCabin,scene.eye);glassEye.forEach((v,i)=>near(v,metrics.eye[i],2e-5));
 assert.ok(scene.teaser.attachedIds.some(id=>id.includes('hand')));
 for(const lamp of scene.lamps.filter(l=>l.id.startsWith('drive-headlamp-'))){const paneLamp=r.weather.headlamps.find(l=>l.x===lamp.x&&l.y===lamp.y&&l.z===lamp.z);assert.ok(paneLamp);}
 near(r.weather.groundY,worldAt(C.releaseDistance).height);
 assert.ok(scene.look.pitch<-.25,'the world view follows the nose down');assert.ok(Math.abs(scene.cameraRoll)<1e-5);
 const standing=scene.props.find(p=>p.id==='queue-standing').matrix.slice();
 teaser.update(.5);const later=teaser.frame(metrics).renderFrame;
 assert.deepEqual(later.scene.props.find(p=>p.id==='queue-standing').matrix,standing);
 assert.ok(later.scene.eye[1]<scene.eye[1]-4);assert.equal(later.weather.groundY,r.weather.groundY);
 assert.ok(later.weather.wetness.revision>r.weather.wetness.revision);teaser.dispose();
});

test('pause freezes camera, programme, water history and blade movement; cadence does not change the local weather history',()=>{
 const a=createDoorDriveTeaser(),b=createDoorDriveTeaser();a.start();b.start();advance(a,3.125,1/24);advance(b,3.125,1/144);
 const af=a.frame(metrics),bf=b.frame(metrics);
 near(af.timeSec,bf.timeSec);assert.deepEqual(af.renderFrame.weather.wetness.data,bf.renderFrame.weather.wetness.data);
 assert.equal(af.weatherRevision,bf.weatherRevision);near(af.wiperPhase,bf.wiperPhase);
 a.setPaused(true);const before=a.snapshot(),pane=a.frame(metrics).renderFrame.weather.wetness.data;
 a.update(500);assert.deepEqual(a.snapshot(),before);assert.deepEqual(a.frame(metrics).renderFrame.weather.wetness.data,pane);
 a.setPaused(false);a.update(99,{paused:true});const hostBefore=a.snapshot();a.update(99,{paused:true});assert.deepEqual(a.snapshot(),hostBefore);
 assert.equal(a.snapshot().driveState.paused,true);a.update(.5,{paused:false});near(a.snapshot().timeSec,3.625);assert.equal(a.snapshot().driveState.paused,false);
 a.dispose();b.dispose();
});

test('impact returns ownership only beneath opaque cover; return and final callbacks latch once even across a stalled frame',()=>{
 const events=[],teaser=createDoorDriveTeaser({onCoveredReturn:e=>events.push(['covered',e]),onComplete:e=>events.push(['complete',e])});teaser.start();
 teaser.update(C.impactStart-.001);assert.equal(teaser.snapshot().worldOwner,'drive');assert.ok(teaser.snapshot().coverAlpha>.999);
 teaser.update(.001);const covered=teaser.frame(metrics);assert.equal(covered.worldOwner,'return');assert.equal(covered.coverAlpha,1);assert.equal(covered.renderFrame,null);
 assert.deepEqual(events.map(e=>e[0]),['covered']);teaser.update(C.returnStart-C.impactStart+.5);assert.ok(teaser.snapshot().coverAlpha>0&&teaser.snapshot().coverAlpha<1);
 teaser.update(999);teaser.update(999);teaser.start();teaser.skip();assert.deepEqual(events.map(e=>e[0]),['covered','complete']);assert.equal(teaser.snapshot().finished,true);near(teaser.snapshot().timeSec,C.duration);
 const stalled=[],b=createDoorDriveTeaser({onCoveredReturn:e=>stalled.push(['covered',e]),onComplete:e=>stalled.push(['complete',e])});b.start();b.update(999);
 assert.deepEqual(stalled.map(e=>e[0]),['covered','complete']);assert.equal(stalled[0][1].coverAlpha,1);assert.equal(b.snapshot().coverAlpha,0);teaser.dispose();b.dispose();
});

test('skip is an idempotent fade across a covered handoff, preserves pause and never commits a Source take',()=>{
 const events=[],teaser=createDoorDriveTeaser({onCoveredReturn:e=>events.push(['covered',e]),onComplete:e=>events.push(['complete',e])});
 assert.equal(teaser.skip(),false);teaser.start();teaser.update(2);assert.equal(teaser.skip(),true);assert.equal(teaser.skip(),false);
 teaser.setPaused(true);teaser.update(2);assert.equal(teaser.snapshot().coverAlpha,0);assert.equal(events.length,0);
 teaser.setPaused(false);teaser.update(C.skipCoverSeconds/2);const halfway=teaser.snapshot();assert.ok(halfway.coverAlpha>0&&halfway.coverAlpha<1);assert.equal(halfway.worldOwner,'drive');
 teaser.update(C.skipCoverSeconds/2);assert.equal(teaser.snapshot().coverAlpha,1);assert.equal(teaser.snapshot().worldOwner,'return');assert.equal(teaser.frame(metrics).renderFrame,null);
 teaser.update(C.skipReturnSeconds);teaser.update(99);assert.deepEqual(events.map(e=>e[0]),['covered','complete']);assert.equal(events[1][1].skipped,true);
 assert.equal(teaser.snapshot().timeSec,2);assert.deepEqual(teaser.snapshot().driveState.takes,[]);teaser.dispose();
});

test('snapshots cannot mutate the controller, and disposal cancels without completion or reactivation',()=>{
 let completed=0,returned=0;const teaser=createDoorDriveTeaser({onComplete:()=>completed++,onCoveredReturn:()=>returned++});teaser.start();teaser.update(1);
 const state=teaser.snapshot();state.driveState.events.push({type:'invented'});state.driveState.x=999;state.vehiclePose.position.y=999;
 assert.deepEqual(teaser.snapshot().driveState.events,[]);assert.notEqual(teaser.snapshot().driveState.x,999);assert.notEqual(teaser.snapshot().vehiclePose.position.y,999);
 assert.equal(teaser.dispose(),true);assert.equal(teaser.dispose(),false);teaser.update(999);assert.equal(teaser.start(),false);assert.equal(teaser.skip(),false);
 assert.equal(teaser.snapshot().driveState.paused,true);assert.equal(teaser.frame(metrics).renderFrame,null);assert.equal(completed,0);assert.equal(returned,0);
});
