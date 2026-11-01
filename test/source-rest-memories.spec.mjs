import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestMemories,sourceRestPassingCars} from '../src/game/source-rest-memories.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {OPENING_VEHICLE} from '../src/data/opening-vehicle.js';
import {sourceContinuationRenderFrame,SOURCE_CONTINUATION_ARCHITECTURE} from '../src/render/source-continuation-renderer.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
const seat=SOURCE_REST_SEATS[0];
const state=memory=>({...freshSourceContinuation({runId:'embodied-memories'}),status:'active',...seat,...seat.approach,
  sourceRestView:{seatId:seat.id,progress:1,look:seat.view,degradation:.57,memory}});
const bodies=rows=>rows.filter(p=>p.mesh==='opening_drive_vehicle_body');
const near=(actual,expected,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);

test('a complete ordinary-scale vehicle passes outside the window without enclosing the seat or replacing its floor',()=>{
  const s=state({drive:1,ellery:0,listener:null});s.sourceRestView.audibleSeconds=3.4;
  const v=sourceRestMemories(s),body=bodies(v.drive)[0];
  assert.ok(body);near(body.x,seat.x-4.15);near(body.z,seat.z);
  assert.equal(v.drive.filter(p=>p.mesh==='opening_drive_tyre').length,4);
  for(const mesh of ['opening_drive_cabin','opening_drive_cabin_door_r'])assert.ok(v.drive.some(p=>p.mesh===mesh));
  assert.ok(!v.drive.some(p=>/radio|needle|wheel$|wiper/.test(p.mesh)),'no cockpit inserts float around the listener');
  assert.ok(v.drive.every(p=>!p.structural&&p.decorative&&p.collidable===false&&!p.cabinVolume));
  assert.equal(v.road.length,0,'the Source architecture is never hidden behind an invented road slab');
  assert.ok(v.drive.every(p=>Math.hypot(p.x-seat.x,p.z-seat.z)>2));
  assert.equal(v.tableaux.length,0);
});

test('passing bodies face their travel, their four tyres roll by distance, and the listener retains physical clearance',()=>{
  for(const start of [.1,9.3,18.7]){
    const a=bodies(sourceRestPassingCars(start))[0],b=bodies(sourceRestPassingCars(start+.2))[0];
    assert.ok(a&&b);assert.equal(a.memoryRoute,b.memoryRoute);
    const dx=b.x-a.x,dz=b.z-a.z,distance=Math.hypot(dx,dz),scale=a.memoryScale;
    near(-a.matrix[8]/scale,dx/distance);near(-a.matrix[10]/scale,dz/distance);
    near(a.memoryWheelRotation,a.memoryTravel/(OPENING_VEHICLE.wheels.radius*scale));
    assert.ok(b.memoryWheelRotation>a.memoryWheelRotation);
    const tyres=sourceRestPassingCars(start).filter(p=>p.mesh==='opening_drive_tyre');assert.equal(tyres.length,4);
    assert.ok(tyres.every(p=>p.y>a.y&&p.y<a.y+.4));
    const nextTyres=sourceRestPassingCars(start+.2).filter(p=>p.mesh==='opening_drive_tyre');
    assert.notDeepEqual(tyres[0].matrix.slice(0,12),nextTyres[0].matrix.slice(0,12));
  }
  for(let t=0;t<31;t+=.05){
    const vehicles=bodies(sourceRestPassingCars(t));assert.ok(vehicles.length<=1,'crossing routes never collide with each other');
    for(const p of vehicles){
      const m=p.matrix,s=p.memoryScale,dx=seat.x-p.x,dz=seat.z-p.z,
        localX=(dx*m[0]+dz*m[2])/(s*s),localZ=(dx*m[8]+dz*m[10])/(s*s);
      assert.ok(Math.abs(localX)>1.145+.15||localZ<OPENING_VEHICLE.bodyBox.min[2]-.15||localZ>OPENING_VEHICLE.bodyBox.max[2]+.15,
        'the full shell, including its cabin and mirrors, never intersects the supported listener');
      assert.ok(s>=.96&&s<=1.02,'cars keep metre-scale proportions');
    }
  }
});

test('traffic arrives, passes and clears the musical view instead of looping continuously across it',()=>{
  const samples=[3.0,14.3,21.75].map(t=>bodies(sourceRestPassingCars(t))[0]);
  assert.deepEqual(samples.map(p=>p.memoryRoute),['pass-left','pass-right','pass-front']);
  assert.ok(samples.slice(0,2).every(p=>Math.abs(p.z-seat.z)<2.3));
  assert.ok(Math.abs(samples[2].x-seat.x)<4.2);
  for(const t of [7.5,8.9,16.8,18.4,25.1,30.99])assert.equal(sourceRestPassingCars(t).length,0,'a genuine empty interval restores the note architecture');
  assert.equal(sourceRestPassingCars(21.75,{intensity:.3}).length,0,'the frontal crossing is reserved for stronger delirium');
  const before=bodies(sourceRestPassingCars(7.19))[0],after=bodies(sourceRestPassingCars(31))[0];
  assert.ok(before.x<seat.x-30&&after.x>seat.x+13,'vehicles leave far away and re-enter behind, rather than wrapping beside the face');
  assert.equal(after.memoryMotion.cycle,1);
  const reduced=sourceRestPassingCars(0,{reducedMotion:true}),reducedLater=sourceRestPassingCars(80,{reducedMotion:true});
  assert.deepEqual(reduced.map(p=>p.matrix),reducedLater.map(p=>p.matrix));
  assert.ok(bodies(reduced).every(p=>p.x<seat.x-7&&p.memoryWheelRotation===0));
  const s=state({drive:0,ellery:0,listener:null});s.sourceRestView.degradation=.8;s.sourceRestView.audibleSeconds=3.0;
  const a=sourceRestMemories(s),b=sourceRestMemories({...s,elapsed:9000});
  assert.deepEqual(a.drive,b.drive,'frame/wall time cannot alter the pass');
  assert.ok(a.drive.some(p=>p.kind==='delirium-vehicle'));
  assert.equal(a.road.length,0);
});

test('practice and recital are different furnished physical settings with the same real instrument and unassigned listeners',()=>{
  for(const kind of ['practice','recital']){
    const v=sourceRestMemories(state({drive:0,ellery:0,listener:kind}));
    assert.ok(v.tableaux.some(p=>p.mesh==='marimba'));
    assert.ok(v.tableaux.some(p=>p.mesh==='ending_recorder_open'));
    assert.ok(v.tableaux.filter(p=>p.mesh==='chair').length>=2);
    assert.ok(v.tableaux.every(p=>p.x<seat.x&&Math.abs(p.x-seat.x)<15));
    assert.ok(!v.tableaux.some(p=>/sarah|lyle|face|body/.test(p.id)),'no invented face, performance or friend-to-setting assignment');
  }
  const practice=sourceRestMemories(state({drive:0,ellery:0,listener:'practice'}));
  const recital=sourceRestMemories(state({drive:0,ellery:0,listener:'recital'}));
  assert.ok(practice.tableaux.some(p=>p.id.includes('working-page')));
  assert.ok(recital.tableaux.some(p=>p.id.includes('proscenium')));
  assert.ok(recital.tableaux.filter(p=>p.id.includes('audience')).length>=8);
});

test('production submission uses full Ellery frontage and staged memories without changing the physical route',()=>{
  const before=sourceContinuationRenderFrame(state({drive:0,ellery:0,listener:null}));
  for(const memory of [{drive:1,ellery:0,listener:null},{drive:0,ellery:1,listener:'practice'},{drive:0,ellery:1,listener:'recital'}]){
    const frame=sourceContinuationRenderFrame(state(memory)),props=frame.props.filter(p=>p.restMemory||p.restFlood);
    assert.ok(props.length>2);assert.ok(props.every(p=>p.chartId===seat.chartId&&p.decorative&&!p.structural));
    assert.deepEqual(frame.geometry.surfaces,before.geometry.surfaces);
    assert.ok(frame.counts.props<SOURCE_CONTINUATION_ARCHITECTURE.maxInstances);
    assert.ok(frame.lights.length<=SOURCE_CONTINUATION_ARCHITECTURE.maxLights);
    if(memory.ellery)assert.ok(props.some(p=>p.mesh==='ellery_public_front'));
    if(memory.drive)assert.ok(props.some(p=>p.mesh==='opening_drive_vehicle_body'),'the established early memory remains before the bounded flood');
  }
  const s=state({drive:1,ellery:1,listener:'recital'});s.sourceRestView.degradation=.9;
  const last=sourceRestMemories(s);assert.equal(last.drive.length+last.ellery.length+last.tableaux.length,0);
});
