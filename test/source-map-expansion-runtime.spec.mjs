import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONTINUATION as C,CONTINUATION_CATCH_STAGES,continuationCatchFloor,continuationStage,continuationSupportAt} from '../src/data/source-continuation.js';
import {ARCHIPELAGO_ISLANDS,SOURCE_III_ARCHIPELAGO} from '../src/data/source-continuation-archipelago.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation,sourceContinuationDoorFraction,sourceContinuationGait} from '../src/game/source-continuation.js';
import {freshArchipelagoProgress,normalizeArchipelagoProgress,advanceArchipelagoProgress,archipelagoExitReady} from '../src/game/source-archipelago-progress.js';

const at=pose=>({...freshSourceContinuation({runId:'map-expansion'}),status:'active',phase:'catch',...pose});
test('both Sources retain their complete world bounds and all seven shelf elevations',()=>{
  for(const stage of CONTINUATION_CATCH_STAGES){assert.equal(continuationStage(stage.level),stage);assert.equal(continuationCatchFloor(stage.level),stage.y);assert.ok(stage.y>=C.bounds.minY);}
  const entry=normalizeSourceContinuation(freshSourceContinuation());assert.equal(entry.x,0);assert.equal(entry.z,2);
  assert.ok(C.bounds.minX<=-455&&C.bounds.maxX>=40&&C.bounds.minZ<=-275&&C.bounds.maxZ>=75);
});
test('only real supported arrivals release the final counterweight, with no elapsed-time requirement',()=>{
  const state=at(C.catch.finalApproach);state.doorOpen['catch-final']=true;
  assert.equal(sourceContinuationDoorFraction(state,'catch-final'),0);
  state.elapsed=100000;assert.equal(archipelagoExitReady(state),false);
  for(const id of SOURCE_III_ARCHIPELAGO.mainIslandIds){
    const island=ARCHIPELAGO_ISLANDS.find(row=>row.id===id);
    Object.assign(state,island);assert.ok(continuationSupportAt(state.x,state.z,state));
    advanceArchipelagoProgress(state);assert.ok(state.expedition.visited.includes(id));
  }
  assert.equal(state.expedition.activeSeconds,0);assert.equal(archipelagoExitReady(state),true);
  Object.assign(state,C.catch.finalApproach);assert.equal(sourceContinuationDoorFraction(state,'catch-final'),1);
  const restored=normalizeSourceContinuation(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.expedition,state.expedition);assert.equal(archipelagoExitReady(restored),true);
});
test('pursuit sprint preserves jump momentum and a winded body falls back to the exterior run',()=>{
  const island=ARCHIPELAGO_ISLANDS.find(row=>row.id==='iii-echo-colonnade');
  const state=at(island);state.hush.active=false;
  state.expedition.visited=['iii-arrival-court',island.id];
  assert.equal(sourceContinuationGait(state,{run:true}).speed,7.5);
  const jump=stepSourceContinuation(state,{dt:0,side:1,jump:true,run:true}).state;
  assert.equal(jump.fall.vx,7.5);
  state.breath={reserve:0,winded:true,sprinting:false};assert.equal(sourceContinuationGait(state,{run:true}).speed,5.2);
  state.expedition.visited.push('iii-inverted-chapel');assert.equal(sourceContinuationGait(state,{run:true}).speed,5.2);
});
test('malformed and old saves receive bounded progress without inventing island visits',()=>{
  assert.deepEqual(normalizeArchipelagoProgress({version:1,visited:'bad',chases:{},activeSeconds:Infinity}),freshArchipelagoProgress());
  const old=at({x:-162,z:-92,feet:8.4,level:0});delete old.expedition;delete old.breath;
  const restored=normalizeSourceContinuation(old);assert.equal(restored.x,old.x);assert.deepEqual(restored.expedition.visited,[]);assert.equal(restored.breath.reserve,1);
  const finished=normalizeSourceContinuation({...old,layoutVersion:3,completed:true,status:'completed'});
  assert.equal(finished.feet,8.4);assert.ok(continuationSupportAt(finished.x,finished.z,finished));assert.equal(archipelagoExitReady(finished),true);
});
