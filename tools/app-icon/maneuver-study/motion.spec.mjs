import test from 'node:test';
import assert from 'node:assert/strict';
import {SPEC,samples,maneuverAt,verifyMotion,presentationTime} from './motion.mjs';
test('parked coordinate normalization preserves a continuous rear axle path',()=>{
 const parked=maneuverAt(SPEC.stop);assert.equal(parked.x,0);assert.equal(parked.z,0);assert.equal(parked.yaw,0);
 for(let i=1;i<samples.length;i++){
  const a=samples[i-1],b=samples[i];
  assert.ok(Math.hypot(b.rearX-a.rearX,b.rearZ-a.rearZ)<=SPEC.forwardPeak/SPEC.hz+1e-8);
 }
});
test('independently measured tyre paths agree with rolling and steering',()=>{
 const result=verifyMotion();
 assert.ok(result.lateralError<1e-10);
 assert.ok(result.rollingError<2e-8);
 assert.ok(result.wheelLateralError<1e-5);
 assert.ok(Math.abs(result.reverseDistance-1.1)<1e-6);
 for(const sample of samples){
  const [left,right]=sample.wheels;
  if(sample.curvature>.001)assert.ok(left.steer>right.steer);
  if(sample.curvature<-.001)assert.ok(left.steer>right.steer,'negative turns: right is more negative');
 }
});
test('sprung body settles without altering wheel pivot heights or travel',()=>{
 const p=maneuverAt(1.9);assert.ok(Math.abs(p.body.pitch)<.00002);assert.ok(Math.abs(p.body.heave)<.000001);
 assert.ok(verifyMotion().maxPitch<.028);
 const dock=maneuverAt(3.4,{presentation:'dock'}),parked=maneuverAt(SPEC.depart-1/SPEC.hz);
 assert.deepEqual(dock.wheels,parked.wheels);assert.equal(dock.x,parked.x);assert.equal(dock.z,parked.z);
});
test('late joins, readiness and focus never replay or gate readiness',()=>{
 assert.equal(presentationTime(.8,{lateJoin:1.1}).visible,false);
 assert.equal(presentationTime(1.2,{lateJoin:1.1}).time,1.2);
 assert.equal(presentationTime(1,{readyAt:.9}).visible,false);
 assert.equal(presentationTime(5).time,SPEC.depart-1/SPEC.hz);
 const departure=presentationTime(2.8,{readyAt:2.4});assert.ok(Math.abs(departure.time-2.34)<1e-9);
 assert.match(departure.stage,/Input live/);
 assert.equal(presentationTime(1,{hidden:true}).visible,false);
 assert.equal(presentationTime(1.8).time,1.8);
 assert.equal(presentationTime(1,{reduced:true}).time,SPEC.depart-1/SPEC.hz);
 assert.equal(presentationTime(3,{reduced:true,readyAt:2.4}).visible,false);
});
