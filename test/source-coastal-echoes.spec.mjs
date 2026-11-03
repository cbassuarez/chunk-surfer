import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_COASTAL_ECHOES,sourceCoastalEchoFrame,sourceCoastalEchoGeometry} from '../src/game/source-coastal-echoes.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {continuationSupportAt} from '../src/data/source-continuation.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {sourceShoreBounds} from '../src/data/source-hanging-shore.js';
import {sourceShoreGeometry} from '../src/render/source-shore3d.js';

test('each outward chart carries a fixed roadside fragment outside its walking support',()=>{
  const echoes=sourceCoastalEchoFrame({phase:'wrong-return'}),kit=sourceCoastalEchoGeometry()['coastal-echo-rail'];
  assert.ok(kit.i.length>0&&kit.p.every(Number.isFinite));
  assert.deepEqual(SOURCE_COASTAL_ECHOES.map(p=>p.chartId),[0,1,2,3,4]);
  for(const site of SOURCE_COASTAL_ECHOES){
    const rail=echoes.find(p=>p.id===site.id+'-rail');assert.ok(rail);
    assert.equal(rail.collidable,false);assert.equal(rail.structural,false);
    assert.equal(continuationSupportAt(site.x,site.z,{phase:'wrong-return',chartId:site.chartId,feet:site.y}),null,site.id);
    assert.ok(echoes.some(p=>p.id===site.id+'-reflector'));
  }
  for(const site of SOURCE_COASTAL_ECHOES.filter(p=>p.wreck)){
    const parts=echoes.filter(p=>p.id.startsWith(site.id+'-')&&p.coastalEchoWreck);
    assert.ok(parts.some(p=>p.mesh==='opening_drive_vehicle_body'),'the actual opening vehicle is reused');
    assert.equal(echoes.filter(p=>p.id.startsWith(site.id+'-headlamp-')).length,2);
  }
  assert.deepEqual(sourceCoastalEchoFrame({phase:'catch'}),[]);
});

test('the actual continuation submits only the present chart without displacing portal images',()=>{
  for(let chartId=0;chartId<=4;chartId++){
    const frame=sourceContinuationRenderFrame({...freshSourceContinuation(),status:'active',phase:'wrong-return',chartId});
    assert.ok(frame.coastalEchoes.length>=2);assert.ok(frame.coastalEchoes.every(p=>p.chartId===chartId&&p.coastalEcho&&p.collidable===false));
    assert.ok(frame.coastalEchoes.every(p=>p.matrix.length===16&&Array.from(p.matrix).every(Number.isFinite)));
    assert.ok(frame.props.length<=760);
  }
});

test('first nothingness has two fixed roadside fragments and paired distant lamps in the physical shore pass',()=>{
  const at=(x,y)=>sourceShoreGeometry({...sourceShoreBounds({x,y}),active:true,outside:true,proper:false});
  const a=at(0,0),b=at(20,-10),rails=a.boxes.filter(p=>/^coastal-echo-\d-rail$/.test(p.id));
  assert.equal(rails.length,2);assert.ok(rails.every(p=>Math.abs((p.minX+p.maxX)/2)>6));
  const lamps=a.hardware.filter(p=>p.id.startsWith('coastal-echo-wreck-headlamp-'));
  assert.equal(lamps.length,2);assert.ok(lamps.every(p=>p.glow>0));
  assert.equal(a.hardware.find(p=>p.id==='coastal-echo-wreck-body')?.name,'opening_drive_vehicle_body');
  const shifted=b.hardware.find(p=>p.id===lamps[0].id);
  assert.equal(shifted.x-lamps[0].x,10);assert.equal(shifted.z-lamps[0].z,-5);
});
