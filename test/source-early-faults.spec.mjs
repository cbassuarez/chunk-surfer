import test from 'node:test';
import assert from 'node:assert/strict';
import {CELL} from '../src/data/floorplan/legend.js';
import {SOURCE_EARLY_FAULT_COUNTS,SOURCE_EARLY_FAULT_GEOMETRY,SOURCE_EARLY_FAULT_SITES,sourceEarlyFaultFrame} from '../src/game/source-early-faults.js';
import {SOURCE_CONTINUATION_FAULT_REGIONS} from '../src/render/source-continuation-faults.js';
import {SOURCE_EARTHFALL_FAULTS} from '../src/data/source-earthfall-faults.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {buildChunkSurfGodPreset,buildPreTapeGodPreset,CHUNK_SURF_GOD_PRESET as P} from '../src/game/chunk-surf-god.js';
import {reduceChunkSurf} from '../src/game/chunk-surf-state.js';
import {applySourcePs2GeometryFault} from '../src/game/source-faults.js';

test('the earlier Source has sparse unequal clusters, with II, III and Earthfall carrying the densest fields',()=>{
  const values=Object.values(SOURCE_EARLY_FAULT_COUNTS),dense=SOURCE_CONTINUATION_FAULT_REGIONS.filter(r=>r.id==='ii'||r.id==='iii').map(r=>r.sites.reduce((n,s)=>n+s.count,0));
  assert.equal(values.length,6);assert.ok(new Set(values).size>3);assert.ok(values.every(n=>n>0&&dense.every(d=>d>n)));
  assert.ok(dense.every(n=>n<SOURCE_EARTHFALL_FAULTS.count));assert.ok(SOURCE_EARLY_FAULT_GEOMETRY.length<=18);
});

test('early fragments keep their world addresses as the listener and clock change',()=>{
  const origin={x:72,y:-250},site=SOURCE_EARLY_FAULT_SITES.find(s=>s.id==='shore-near'),player={x:origin.x+site.x/CELL,y:origin.y+site.z/CELL};
  const a=sourceEarlyFaultFrame({phase:'landscape',shore:true,origin,player}),b=sourceEarlyFaultFrame({phase:'landscape',shore:true,origin,player:{x:player.x+1,y:player.y},time:40});
  const select=f=>f.props.filter(p=>p.faultSite===site.id).map(p=>[p.id,p.mesh,Array.from(p.matrix)]);
  assert.ok(select(a).length);assert.deepEqual(select(a),select(b));
  assert.ok(a.props.every(p=>p.decorative&&!p.structural&&!p.collidable&&p.noShadow&&p.noReflection));
  assert.deepEqual(applySourcePs2GeometryFault(a.props,{active:true,geometry:1,seed:17,slot:3}),a.props,'the screen corruption does not move world-fixed sheets');
  assert.deepEqual(sourceEarlyFaultFrame({phase:'landscape',shore:true,origin,player,suspended:true}).props,[]);
});

test('real Source runtime submits local faults in the hall, shore, field and road',()=>{
  const fixtures=[
    {preset:P.HALL_ENTRY,site:'hall-first'},
    {preset:P.LANDING,site:'shore-near',open:true},
    {preset:P.FIRST_CONTACT,site:'field-trace'},
    {road:true,site:'road-3'},
  ];
  for(const f of fixtures){
    const built=f.road?buildPreTapeGodPreset(0,{seed:4417}):buildChunkSurfGodPreset(f.preset,{seed:4417});
    const initial=f.open?reduceChunkSurf(built.state,{type:'SOURCE_LANDING_DOOR_OPENED'}):built.state;
    const runtime=createSourceSpaceRuntime({initialState:initial}),site=SOURCE_EARLY_FAULT_SITES.find(s=>s.id===f.site),origin=runtime.state().landscapeOrigin||{x:0,y:0};
    const at=site.profile==='hall'?{x:site.x/CELL,y:site.z/CELL}:{x:origin.x+site.x/CELL,y:origin.y+site.z/CELL};
    runtime.setPlayerPosition({...at,facing:0});
    assert.ok(runtime.propInstances(at.x,at.y,{reducedMotion:true}).some(p=>p.sourceAmbientFault&&p.faultSite===site.id),`${site.id} not submitted`);
  }
});
