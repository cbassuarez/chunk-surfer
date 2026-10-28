import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,continuationDoors,continuationSurfaces} from '../src/data/source-continuation.js';
import {SOURCE_EARTHFALL as E} from '../src/data/source-earthfall.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {freshSourceEarthfall} from '../src/game/source-earthfall.js';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {createSourceEarthfallScene} from '../src/game/source-earthfall-scene.js';
import {continuationFromEarthfall,sourceContinuationEntranceOffset} from '../src/game/source-continuation-entry.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {sourceEarthfallContinuationPreview,sourceEarthfallRenderFrame} from '../src/render/source-earthfall-renderer.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-5,`${a} != ${b}`);
const renderer=()=>({initialize:async()=>true,ready:()=>true,render:()=>true,dispose(){}});

test('Earthfall transfers actual doorway clearance and carried view without a spawn jump',()=>{
  const checkpoint=freshSourceContinuation({runId:'continuous-entrance'}),fall={...freshSourceEarthfall({runId:'continuous-entrance'}),status:'completed',x:.28,z:E.passage.exitZ-.31,feet:0,yaw:.09,pitch:-.17};
  const arrival=continuationFromEarthfall(checkpoint,fall),offset=sourceContinuationEntranceOffset();
  near(arrival.x-offset.x,fall.x);near(arrival.z-offset.z,fall.z);near(arrival.feet-offset.y,fall.feet);
  near(arrival.yaw,fall.yaw);near(arrival.pitch,fall.pitch);assert.equal(arrival.doorOpen['wrong-entry-return'],true);
  assert.notEqual(arrival.z,C.spawn.z,'do not replace a real crossing with the old camera/spawn snap');
  assert.equal(continuationFromEarthfall(checkpoint,{...fall,status:'active'}),null);
  assert.equal(continuationFromEarthfall(checkpoint,{...fall,runId:'foreign'}),null);
});

test('Earthfall and Source II share the same doorway dimensions and a finite3.6m receiving throat',()=>{
  const door=continuationDoors().find(d=>d.id==='wrong-entry-return');
  assert.equal(door.width,E.door.width);assert.equal(door.height,E.door.height);
  near(door.z-sourceContinuationEntranceOffset().z,E.passage.exitZ);
  const throat=continuationSurfaces().find(s=>s.id==='wrong-entry-throat');
  assert.equal(throat.maxX-throat.minX,E.passage.halfWidth*2);
  near(throat.minZ-sourceContinuationEntranceOffset().z,E.passage.exitZ-3);
  const pad=continuationSurfaces().find(s=>s.id==='wrong-entry');
  near(pad.maxZ,throat.minZ);near(pad.y,E.lowerFloor);
});

test('the approaching Earthfall door already shows the actual persistent destination without duplicate leaves or floor',()=>{
  const preview=sourceEarthfallContinuationPreview(),world=sourceContinuationRenderFrame(freshSourceContinuation());
  assert.ok(preview.props.length>200);
  assert.equal(preview.props.some(p=>p.inheritedRuins||p.role==='inherited-earthfall'||p.doorId==='wrong-entry-return'||p.id.includes('wrong-entry-throat')),false);
  assert.equal(preview.lights.some(light=>light.inheritedEarthfall),false,'the Earthfall owner keeps its original lower-path lights');
  const destination=world.props.find(p=>p.descriptorId==='wrong-entry'&&p.physicalKind==='surface');
  assert.ok(destination);
  const shown=preview.props.find(p=>p.mesh===destination.mesh&&p.physicalKind==='surface');
  near(shown.x,destination.x);near(shown.y,destination.y);near(shown.z,destination.z-sourceContinuationEntranceOffset().z);
  assert.ok(preview.props.some(p=>p.region==='catch'),'III exists at the first threshold rather than being loaded by its phase');
});

test('the same ruined upper anchors survive the scene handoff at identical transformed coordinates',()=>{
  const earth=sourceEarthfallRenderFrame({...freshSourceEarthfall(),committed:true,elapsed:15,clock:15,phase:'landed',feet:0});
  const next=sourceContinuationRenderFrame(freshSourceContinuation());
  const pairs=[
    [earth.props.find(p=>p.earthfallRole==='upper-ruin'),next.props.find(p=>p.upperRemnant&&p.id.includes('upper-exit-remnant'))],
    [earth.props.find(p=>p.earthfallRole==='ellery'),next.props.find(p=>p.sourceAnchor==='earthfall-ellery')],
  ];
  const upper=pairs[0];near(upper[0].z,E.passage.upperExitZ);near(upper[1].z,E.passage.upperExitZ+sourceContinuationEntranceOffset().z);
  assert.notEqual(upper[1].z,continuationDoors().find(door=>door.id==='wrong-entry-return').z,'the old upper doorway stays behind the newly extended lower entrance');
  for(const[a,b]of pairs){assert.ok(a&&b);near(a.x,b.x);near(a.y,b.y);near(a.z,b.z-sourceContinuationEntranceOffset().z);assert.ok(b.y>=100);}
});

test('both physical scene owners route F only while active and freeze instrument time on pause',async()=>{
  for(const[factory,checkpoint]of[[createSourceContinuationScene,freshSourceContinuation()],[createSourceEarthfallScene,freshSourceEarthfall()]]){
    let toggles=0,seconds=0;
    const scene=factory({checkpoint,renderer:renderer(),onTorch:()=>{toggles++;return true;},onInstrumentTick:dt=>{seconds+=dt;}});
    scene.key({key:'f'});assert.equal(toggles,0,'loading cannot restore a lamp');
    await scene.initialize();scene.key({key:'f'});scene.key({key:'f',repeat:true});assert.equal(toggles,1);
    scene.update(.1);assert.ok(seconds>0);scene.pause();const paused=seconds;
    scene.key({key:'f'});scene.update(.2);assert.equal(toggles,1);assert.equal(seconds,paused);
    scene.resume();scene.key({key:'f'});assert.equal(toggles,2);scene.exit();
  }
});
