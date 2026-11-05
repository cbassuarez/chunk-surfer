import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_IV_FAULT_SITES,sourceIVRenderFrame} from '../src/render/source-iv-renderer.js';
import {sourceAmbientFaultGeometry} from '../src/render/source-ambient-fault-geometry.js';
import {freshSourceIV} from '../src/game/source-iv.js';
import {sourceIVCollisionAt} from '../src/data/source-iv.js';

test('Source IV keeps sparse, uneven, world-fixed non-colliding fault remnants',()=>{
  const meshes=sourceAmbientFaultGeometry({sites:SOURCE_IV_FAULT_SITES,palettePrefix:'source-IV-ambient-fault'});
  assert.deepEqual(SOURCE_IV_FAULT_SITES.map(s=>s.count),[4,9,3]);
  assert.equal(meshes.reduce((n,m)=>n+m.sheetRanges.length,0),16);
  assert.ok(meshes.length<=6&&new Set(meshes.map(m=>m.palette)).size>=3);
  const first=sourceIVRenderFrame(freshSourceIV()),later=sourceIVRenderFrame({...freshSourceIV(),elapsed:200,x:5,z:-46,yaw:1});
  const faults=f=>f.props.filter(p=>p.ambientFault).map(p=>({id:p.id,mesh:p.mesh,matrix:[...p.matrix],sheets:p.sheets}));
  assert.deepEqual(faults(first),faults(later),'movement and time never move the fixed shards');
  assert.equal(faults(first).reduce((n,p)=>n+p.sheets,0),16);
  assert.ok(first.props.filter(p=>p.ambientFault).every(p=>p.structural===false&&p.collidable===false&&p.noShadow));
  for(let z=-3;z>=-103;z-=2)assert.equal(sourceIVCollisionAt(0,z),null,`ordinary route at ${z}`);
});
