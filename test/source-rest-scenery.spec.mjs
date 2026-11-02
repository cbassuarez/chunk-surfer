import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {continuationSupportAt} from '../src/data/source-continuation.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {SOURCE_REST_SKY,sourceRestScenery} from '../src/game/source-rest-scenery.js';
import {sourceContinuationRenderFrame,SOURCE_CONTINUATION_ARCHITECTURE} from '../src/render/source-continuation-renderer.js';

const seat=SOURCE_REST_SEATS[0];
const state=(signal=0)=>({...freshSourceContinuation({runId:'rest-scenery'}),...seat.approach,
  phase:seat.phase,chartId:seat.chartId,feet:seat.feet,status:'active',
  sourceRestView:{seatId:seat.id,progress:1,look:seat.view,musicSignal:signal}});

test('the listening place has supported furnishings and a bounded sky in its own chart',()=>{
  const s=state(),view=sourceRestScenery(s),frame=sourceContinuationRenderFrame(s);
  assert.ok(view);assert.equal(view.lamps.length,2);
  for(const prop of [view.carpet,...view.lamps])assert.ok(continuationSupportAt(prop.x,prop.z,s),`${prop.id} is on existing floor`);
  const shown=frame.props.filter(p=>p.restSky&&!p.portalDestination),place=frame.props.filter(p=>p.restPlace);
  const weatherCount=view.weather.streaks.length+view.weather.roof.length+view.weather.wet.length+view.weather.ripples.length+view.weather.objects.length;
  assert.equal(shown.length,view.arcs.length+view.motes.length+view.vaults.length+view.rallyFragments.length+view.vista.length+weatherCount);assert.ok(place.length>30);
  assert.equal(view.vaults.length,0,'thin wire-only vaults no longer dominate the native view');
  assert.ok(!view.vista.some(p=>p.mesh.endsWith('rest-vista-arch')),'the actual nook window frames Source without floating scenic arches');
  assert.ok(shown.every(p=>p.chartId===seat.chartId&&p.decorative&&!p.structural));
  assert.ok(frame.counts.props<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances,'sky stays within the renderer instance budget');
  // The installation lies ahead of the actual seated view, not behind it or
  // in a chart that only exists across a portal.
  const direction=[Math.sin(frame.yaw),-Math.cos(frame.yaw)],delta=[view.centre.x-frame.eye[0],view.centre.z-frame.eye[2]];
  assert.ok(direction[0]*delta[0]+direction[1]*delta[1]>40);
  assert.equal(sourceRestScenery({...s,chartId:seat.chartId+1}),null);
  assert.equal(sourceRestScenery({...s,phase:'catch'}).region,'catch','Source III has its own shelter, not a copy of this garden');
});

test('the listening world parts in stages, briefly gathers, then recedes without changing support',()=>{
  const base=state(.4),at=d=>({...base,sourceRestView:{...base.sourceRestView,degradation:d}});
  const initial=sourceRestScenery(at(0)),early=sourceRestScenery(at(.5)),near=sourceRestScenery(at(.76)),
    rally=sourceRestScenery(at(.85)),last=sourceRestScenery(at(.94));
  assert.equal(initial.rallyFragments.length,0);assert.ok(rally.rallyFragments.length>0);
  assert.equal(last.rallyFragments.length,0,'the rally is gone before the last black');
  assert.ok(near.vista[0].y<initial.vista[0].y,'the garden slips below the refuge as the world loosens');
  assert.notEqual(early.vista[0].y,initial.vista[0].y,'distant forms drift before the final release');
  const before=sourceContinuationRenderFrame(at(0)),during=sourceContinuationRenderFrame(at(.72)),after=sourceContinuationRenderFrame(at(.89));
  const surfaces=frame=>frame.props.filter(p=>p.physicalKind==='surface'&&p.region==='wrong-return');
  assert.ok(surfaces(before).length);assert.ok(surfaces(during).some(p=>p.restDrift>0));
  assert.ok(surfaces(after).some(p=>p.restDrift>surfaces(during).find(q=>q.id===p.id)?.restDrift));
  assert.deepEqual(before.geometry.surfaces,after.geometry.surfaces,'the walkable world is never modified');
  assert.ok(continuationSupportAt(base.x,base.z,at(.89)),'the player remains on real supported ground');
  assert.equal(sourceRestScenery(at(.85),{reducedMotion:true}).rallyFragments.length,0);
});

test('the installation responds to measured music level and respects reduced motion',()=>{
  const quiet=sourceRestScenery(state(0)),sounding=sourceRestScenery(state(.8)),reduced=sourceRestScenery(state(.8),{reducedMotion:true});
  assert.notDeepEqual(sounding.vista,quiet.vista);
  assert.deepEqual(reduced.vista,quiet.vista);
  assert.deepEqual(sourceRestScenery({...state(0),elapsed:700}).vista,quiet.vista,'no invented beat clock animates the scene');
});

test('drive and Ellery memories use existing assets, appear in sequence, and leave before black',()=>{
  const glbNames=file=>{const bytes=readFileSync(new URL('../public/assets/'+file,import.meta.url)),n=bytes.readUInt32LE(12);return new Set(JSON.parse(bytes.subarray(20,20+n)).meshes.map(m=>m.name));};
  const vehicle=glbNames('source-vehicle-interior.glb'),architecture=glbNames('ellery-public-front.glb');
  for(const name of ['opening_drive_cabin','opening_drive_wheel','opening_drive_wiper','opening_drive_vehicle_body'])assert.ok(vehicle.has(name));
  for(const name of ['ellery_public_front','ellery_public_forecourt'])assert.ok(architecture.has(name));
  const base=state(),at=d=>({...base,sourceRestView:{...base.sourceRestView,degradation:d}}),show=d=>sourceContinuationRenderFrame(at(d));
  const first=show(0),drive=show(.26),both=show(.38),ellery=show(.56),last=show(.90);
  const memories=frame=>frame.props.filter(p=>p.restMemory);
  assert.equal(memories(first).length,0);
  assert.ok(memories(drive).some(p=>p.mesh==='opening_drive_vehicle_body'));
  assert.equal(memories(drive).some(p=>p.mesh==='opening_drive_wheel'),false,'passing traffic does not install a cockpit around the seat');
  assert.equal(memories(drive).filter(p=>p.restMemoryKind==='drive-road').length,0,'the listening place keeps its own ground');
  assert.ok(memories(both).some(p=>p.mesh==='ellery_public_front'));
  assert.ok(memories(ellery).some(p=>p.mesh==='ellery_public_forecourt'));
  assert.ok(!memories(ellery).some(p=>p.restMemoryKind==='drive'));
  assert.equal(memories(last).length,0);
  assert.ok(memories(both).every(p=>p.decorative&&!p.structural&&p.chartId===seat.chartId));
  assert.ok([drive,both,ellery].every(f=>f.counts.props<=SOURCE_CONTINUATION_ARCHITECTURE.maxInstances));
  assert.deepEqual(first.geometry.surfaces,last.geometry.surfaces);
  assert.deepEqual(sourceRestScenery({...base,sourceRestView:undefined}).memories.drive,[]);
  assert.equal(sourceRestScenery({...at(.26),sourceRestView:{...at(.26).sourceRestView,memoryDrive:0}}).memories.drive.length,0,'the authored dialogue beat can retire the road');
  assert.ok(sourceRestScenery({...at(.05),sourceRestView:{...at(.05).sourceRestView,memoryDrive:1}}).memories.drive.length>0,'the established driving memory remains before the late storm');
});
