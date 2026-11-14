import test from 'node:test';
import assert from 'node:assert/strict';
import {VAN_ICON_LAUNCH as L,VAN_ICON_PHYSICS as P,vanIconPose,vanTravelAt,vanSpeedAt,vanTyreContact} from '../tools/app-icon/motion.mjs';

test('reverse arrival follows one measured 1.53m path and a distinct hard braking interval',()=>{
 assert.equal(vanTravelAt(0),0);assert.equal(vanTravelAt(P.stopAt),1.53);
 let integrated=0;for(let t=.0005;t<P.stopAt;t+=.001)integrated+=vanSpeedAt(t)*.001;
 assert.ok(Math.abs(integrated-1.53)<.002);
 assert.ok(vanSpeedAt(.94)>2.3);assert.ok(vanSpeedAt(1.22)<.6);assert.equal(vanSpeedAt(1.27),0);
 const start=vanIconPose(0),end=vanIconPose(3.4);
 assert.ok(Math.hypot(end.x-start.x,end.z-start.z)>1.5);
 for(let t=0;t<3.4;t+=.01)assert.ok(vanTravelAt(t+.01)>=vanTravelAt(t));
});

test('wheels roll from real travel then lock while the last forty centimetres skid',()=>{
 for(const t of[0,.2,.5,.9])assert.ok(Math.abs(vanIconPose(t).wheelAngle-(vanTravelAt(t)-1.53)/.33)<1e-10);
 assert.equal(vanIconPose(1.04).wheelAngle,vanIconPose(1.26).wheelAngle);
 assert.ok(vanIconPose(1.04).slipping);assert.equal(vanIconPose(1.28).slipping,false);
 const skid=vanTravelAt(P.stopAt)-vanTravelAt(P.lockAt);assert.ok(skid>.39&&skid<.41);
});

test('braking produces visible yaw and load transfer without moving tyre contact off the ground',()=>{
 const pose=vanIconPose(1.12);assert.ok(pose.yaw>.2);assert.ok(pose.body.heave<-.06);assert.ok(pose.body.pitch>.05);assert.ok(Math.abs(pose.body.roll)>.04);
 for(const x of[-.83,.83])for(const z of[-1.3,1.535])for(let t=0;t<3.4;t+=.03){
  const point=vanTyreContact({x,z},t,-1.012);assert.equal(point.y,-1.012);assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.z));
 }
});

test('actual axle paths leave finite trails on both sides and contact stops at parking',()=>{
 const paths=[-.83,.83].map(x=>[.95,1.10,1.20,1.27].map(t=>vanTyreContact({x,z:1.535},t,-1)));
 for(const path of paths){const distance=path.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-path[i].x,p.z-path[i].z),0);assert.ok(distance>.2);}
 assert.deepEqual(vanTyreContact({x:.83,z:1.535},2,-1),vanTyreContact({x:.83,z:1.535},3.4,-1));
});

test('lights and friction have perceptible peaks and disappear before the final stable still',()=>{
 assert.ok(vanIconPose(.6).head>.95);assert.ok(vanIconPose(.6).pool>.95);
 assert.ok(vanIconPose(1.15).brake>2.8);assert.ok(vanIconPose(1.15).tracks>.65);assert.ok(vanIconPose(1.2).smoke>.95);
 assert.equal(vanIconPose(1.65).smoke,0,'friction puff ends near the skid rather than persisting like exhaust');
 const end=vanIconPose(3.4);for(const name of['head','running','pool','tracks','smoke'])assert.equal(end[name],0,name);
 assert.equal(end.brake,.28);assert.equal(end.yaw,0);assert.equal(end.z,0);assert.equal(end.x,0);
 assert.ok(Math.abs(end.body.heave)<.000002);assert.ok(Math.abs(end.body.pitch)<.000002);
 assert.deepEqual(end,vanIconPose(100),'the timeline has no repeating idle loop');
});

test('native, startup and audio use one 84-frame 3.4-second clock',()=>{
 assert.deepEqual([L.frameCount,L.cell,L.cellSize,L.columns,L.rows,L.durationSeconds],[84,256,256,8,11,3.4]);
 assert.equal(L.columns*L.rows-L.frameCount,4);
 assert.deepEqual(L.stages,[{atSeconds:0,name:'arrival'},{atSeconds:.95,name:'brake'},{atSeconds:1.27,name:'settle'},{atSeconds:3.4,name:'parked'}]);
 assert.equal(L.stagesSeconds.brakeStart,P.brakeAt);assert.equal(L.stagesSeconds.lockStart,P.lockAt);assert.equal(L.stagesSeconds.stop,P.stopAt);
});
