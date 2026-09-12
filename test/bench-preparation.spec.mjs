import test from 'node:test';
import assert from 'node:assert/strict';
import { BENCH_PACK_GROUPS, prepareWorkbenchFlags, packedWorkbenchGroups, packWorkbenchGroup, workbenchPackingComplete } from '../src/game/bench-preparation.js';

test('catalog defaults never silently pack a new physical workbench',()=>{
  const original={'van.preparation.v1':true};
  let flags=prepareWorkbenchFlags(original);
  assert.equal(original['van.bench.v2'],undefined);
  assert.deepEqual(packedWorkbenchGroups(flags),[]);
  assert.equal(workbenchPackingComplete(flags),false);
  for(const group of BENCH_PACK_GROUPS){
    assert.equal(workbenchPackingComplete(flags),false);
    flags=packWorkbenchGroup(flags,group);
  }
  assert.equal(workbenchPackingComplete(flags),true);
  assert.deepEqual(packedWorkbenchGroups(flags),BENCH_PACK_GROUPS);
});

test('partial packing survives reopening and only real hardware marks a bay',()=>{
  let flags=prepareWorkbenchFlags({unrelated:true});
  assert.equal(packWorkbenchGroup(flags,'faceplate'),flags);
  assert.equal(packWorkbenchGroup(flags,'difficulty'),flags);
  flags=packWorkbenchGroup(flags,'flashlight');
  const restored=JSON.parse(JSON.stringify(flags));
  assert.equal(prepareWorkbenchFlags(restored),restored);
  assert.deepEqual(packedWorkbenchGroups(restored),['flashlight']);
  assert.equal(restored.unrelated,true);
  assert.equal(workbenchPackingComplete(restored),false);
});

test('old already-open cases keep the kit they were issued without changing unrelated flags',()=>{
  assert.equal(workbenchPackingComplete({}),true,'old finalization fixtures remain compatible');
  const old={'bag.taken':true,'van.difficulty.pending':true,'van.spanner.taken':true};
  const migrated=prepareWorkbenchFlags(old);
  assert.deepEqual(packedWorkbenchGroups(migrated),BENCH_PACK_GROUPS);
  assert.equal(migrated['van.spanner.taken'],true);
  assert.equal(migrated['van.difficulty.pending'],true);
  assert.equal(old['van.bench.v2'],undefined);
});
