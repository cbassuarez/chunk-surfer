import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestFlood,sourceRestFloodFrame,SOURCE_REST_FLOOD_LIMITS,SOURCE_REST_FLOOD_MESHES} from '../src/game/source-rest-flood.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {coastalWaterUniforms,coastalRayWater} from '../src/render/coastal-memory-water.js';
const seat=SOURCE_REST_SEATS[0],state=(progress,clock=0,age=24)=>({phase:seat.phase,chartId:seat.chartId,sourceRestView:{seatId:seat.id,degradation:progress,audibleSeconds:clock,weatherCue:{flood:sourceRestFloodFrame({progress,clock,stormAge:age})}}});

test('the late flood rises, holds briefly and settles within54audible seconds',()=>{
  for(const progress of [0,.05,.30,.63])assert.equal(sourceRestFloodFrame({progress}).active,false);
  let previous=-Infinity;
  for(let age=8;age<=19;age+=.1){const f=sourceRestFloodFrame({progress:.68,stormAge:age});assert.ok(f.waterY>=previous);previous=f.waterY;}
  const top=sourceRestFloodFrame({progress:.68,stormAge:24});assert.equal(top.submersion,1);
  assert.ok(top.waterY>SOURCE_REST_FLOOD_LIMITS.eyeY);
  const end=sourceRestFloodFrame({progress:.68,stormAge:54});assert.equal(end.active,false);assert.equal(end.submersion,0);
  assert.ok(end.waterY<SOURCE_REST_FLOOD_LIMITS.eyeY);
  assert.equal(sourceRestFloodFrame({active:false,progress:.68,stormAge:24}).active,false);
});

test('the actual coastal water API receives real depth and a held audible clock without an opaque water sheet',()=>{
  const f=sourceRestFloodFrame({progress:.68,clock:230,stormAge:24}),u=coastalWaterUniforms(f.water);
  assert.equal(u.active,true);assert.equal(u.params[1],f.waterY);assert.equal(u.params[2],230);
  assert.deepEqual(u.optics,[.35,.12]);
  const ray=coastalRayWater({frame:f.water,eye:[seat.x,SOURCE_REST_FLOOD_LIMITS.eyeY,seat.z],ray:[-.8,.6,0],surfaceDistance:30});
  assert.ok(ray.below&&ray.length>0);assert.ok(ray.surface>0);
  assert.equal(sourceRestFloodFrame({progress:.68,clock:230,stormAge:24,reducedMotion:true}).water.time,0);
});

test('original coastal fish swim in fixed submerged world lanes with coherent heading and reduced-motion stillness',()=>{
  const f=sourceRestFlood(state(.3,15)),b=f.props.filter(p=>p.mesh==='source_return_fish_body');
  assert.equal(b.length,9);assert.deepEqual(SOURCE_REST_FLOOD_MESHES,['source_return_fish_body','source_return_fish_fins']);
  assert.equal(f.props.filter(p=>p.mesh==='source_return_fish_fins').length,b.length);
  for(const p of b){
    assert.ok(p.x<seat.x-2);assert.ok(p.y+.26*p.fishScale<f.waterY);
    const length=Math.hypot(p.forward.x,p.forward.z),m=p.matrix,scale=p.fishScale,
      fwdX=-m[8]/scale,fwdZ=-m[10]/scale,horizontal=Math.hypot(fwdX,fwdZ);
    assert.ok(Math.abs(fwdX/horizontal-p.forward.x/length)<1e-7);
    assert.ok(Math.abs(fwdZ/horizontal-p.forward.z/length)<1e-7);
  }
  const a=sourceRestFlood(state(.3,15),{reducedMotion:true}),c=sourceRestFlood(state(.3,150),{reducedMotion:true});
  assert.deepEqual(a.props.map(p=>p.matrix),c.props.map(p=>p.matrix));
  assert.deepEqual(f.props,sourceRestFlood({...state(.3,15),elapsed:9999}).props);
});

test('the complete real van assemblies sink and overturn without moving support or adding collision',()=>{
  const input=state(.30,35),original=structuredClone(input),f=sourceRestFlood(input),cars=f.props.filter(p=>p.mesh==='opening_drive_vehicle_body');
  assert.deepEqual(input,original);assert.equal(cars.length,3);assert.ok(f.props.length<=SOURCE_REST_FLOOD_LIMITS.maxProps);
  for(const car of cars){
    const assembly=f.props.filter(p=>p.memoryWreck===car.memoryWreck);
    assert.equal(assembly.filter(p=>p.mesh==='opening_drive_tyre').length,4);
    assert.ok(assembly.some(p=>p.mesh==='opening_drive_cabin'));assert.ok(assembly.some(p=>p.mesh==='opening_drive_cabin_door_r'));
    assert.ok(assembly.every(p=>p.decorative&&!p.structural&&!p.collidable));
  }
  const upright=cars.find(p=>p.memoryWreck==='sunken-near'),overturned=cars.find(p=>p.memoryWreck==='sunken-overturned');
  assert.ok(upright.matrix[5]>.9);assert.ok(overturned.matrix[5]<-.7,'the second van has rolled past its side, not merely slid down');
  assert.equal(f.diagnostics.supportChanged,false);assert.equal(f.diagnostics.inputChanged,false);
  assert.equal(sourceRestFlood({...input,phase:'catch'}).props.length,0);
  assert.equal(sourceRestFlood({...input,sourceRestView:null}).props.length,0);
});

test('the flooded medium scatters the near wreck’s two actual transformed headlamps',()=>{
  const f=sourceRestFlood(state(.30,35)),body=f.props.find(p=>p.memoryWreck==='sunken-near'&&p.mesh==='opening_drive_vehicle_body').matrix,
    lights=f.water.lights,u=coastalWaterUniforms(f.water);
  assert.equal(lights.length,2);assert.equal(f.diagnostics.volumeLights,2);
  for(const[i,side]of[-1,1].entries()){
    const p=[side*.6,.65,-2.2],expected=[0,1,2].map(k=>body[k]*p[0]+body[k+4]*p[1]+body[k+8]*p[2]+body[k+12]);
    for(let k=0;k<3;k++){
      assert.ok(Math.abs(lights[i].position[k]-expected[k])<1e-7);
      assert.ok(Math.abs(lights[i].direction[k]+body[k+8])<1e-7);
    }
    assert.ok(lights[i].position[1]<f.waterY);assert.ok(lights[i].intensity>0);
    assert.ok(u.positions[i*4+3]>0,'the shared coastal compositor receives both volume-light carriers');
  }
  const early=sourceRestFloodFrame({progress:.17}).water.lights;
  assert.equal(early.length,2);assert.ok(early.every(light=>light.source==='sunken-deep'&&light.intensity>0));
});

test('small real bubble shells rise from fixed chains to the actual surface and hold under reduced motion',()=>{
  const a=sourceRestFlood(state(.3,15)),b=sourceRestFlood(state(.3,15.01)),bubble=p=>p.kind==='flood-bubble',rows=a.props.filter(bubble),later=b.props.filter(bubble);
  assert.equal(rows.length,12);assert.equal(a.diagnostics.bubbleProps,12);assert.ok(a.props.length<=SOURCE_REST_FLOOD_LIMITS.maxProps);
  for(let i=0;i<rows.length;i++){
    const p=rows[i];assert.equal(p.mesh,'source-continuation-rest-flood-bubble');
    assert.ok(p.bubbleRadius>0&&p.bubbleRadius<=.055);assert.ok(p.y+p.bubbleRadius<a.waterY);
    assert.ok(p.x>=seat.x-1.6&&p.x<=seat.x-.8);assert.ok(Math.abs(p.z-seat.z)<.3);
    assert.ok(p.decorative&&!p.structural&&!p.collidable);
    if(later[i].bubblePhase>=p.bubblePhase)assert.ok(later[i].y>p.y);
  }
  const r=sourceRestFlood(state(.3,15),{reducedMotion:true}),s=sourceRestFlood(state(.3,150),{reducedMotion:true});
  assert.deepEqual(r.props.filter(bubble),s.props.filter(bubble));
  assert.equal(sourceRestFlood(state(.10,15,-1)).props.filter(bubble).length,0);
});

test('the persistent tide and storm remain within their declared combined prop ceiling',()=>{
  for(const progress of [0,.3,.65,.9,1])for(let age=0;age<=54;age+=1)for(const clock of [0,1,2,3,4,5,6]){
    const frame=sourceRestFlood(state(progress,clock,age));
    assert.ok(frame.props.length<=SOURCE_REST_FLOOD_LIMITS.maxProps,`progress ${progress}, storm age ${age}, clock ${clock}`);
    assert.ok(frame.diagnostics.wrecks<=SOURCE_REST_FLOOD_LIMITS.wrecks);
  }
});
