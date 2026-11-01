import test from 'node:test';
import assert from 'node:assert/strict';
import {chunkSurfFinaleRouting,normalizeChunkSurfState,freshChunkSurfState,CHUNK_SURF_PHASE,HORIZON_EXIT,SOURCE_FINALE_ROUTE,SOURCE_FINALE_STAGE,SOURCE_FINALE_RESULT} from '../src/game/chunk-surf-state.js';

const routing=value=>{const {route,stage,result}=normalizeChunkSurfState(value).finale;return {route,stage,result};};
test('routing projection agrees with full normalization across modern and legacy saves',()=>{
  const schemas=[undefined,0,2,4,5,6,'4','5'];
  const phases=[undefined,'bad',CHUNK_SURF_PHASE.HALL,CHUNK_SURF_PHASE.HORIZON,CHUNK_SURF_PHASE.COMPLETED];
  const exits=[undefined,'bad',HORIZON_EXIT.TOWER,HORIZON_EXIT.CHAPEL];
  const routes=[null,'bad',...Object.values(SOURCE_FINALE_ROUTE)];
  const stages=[null,'bad',...Object.values(SOURCE_FINALE_STAGE)];
  for(const schema of schemas)for(const phase of phases)for(const exit of exits){
    const i=schemas.indexOf(schema)+phases.indexOf(phase)+exits.indexOf(exit);
    const value={schema,phase,completed:false,horizon:{exit},finale:{route:routes[i%routes.length],stage:stages[i%stages.length],result:SOURCE_FINALE_RESULT.WON}};
    assert.deepEqual(chunkSurfFinaleRouting(value),routing(value),JSON.stringify(value));
  }
  for(const v of [null,undefined,3,'bad',[],{},freshChunkSurfState(),{schema:2,completed:true,finalEncounter:{won:false}},{schema:2,completed:true},{schema:4,phase:CHUNK_SURF_PHASE.HORIZON,horizon:{exit:HORIZON_EXIT.CHAPEL}}])assert.deepEqual(chunkSurfFinaleRouting(v),routing(v));
});
test('routing retains old save migration and reads immediate mutations',()=>{
  const legacy={schema:4,phase:CHUNK_SURF_PHASE.HORIZON,horizon:{exit:HORIZON_EXIT.TOWER},finale:{route:'bad'}};
  assert.equal(chunkSurfFinaleRouting(legacy).route,SOURCE_FINALE_ROUTE.TOWER);
  assert.equal(chunkSurfFinaleRouting(legacy).stage,SOURCE_FINALE_STAGE.TOWER_COMMITTED);
  legacy.horizon.exit=HORIZON_EXIT.CHAPEL;
  assert.equal(chunkSurfFinaleRouting(legacy).route,SOURCE_FINALE_ROUTE.CHAPEL);
  assert.equal(chunkSurfFinaleRouting(legacy).stage,SOURCE_FINALE_STAGE.CHAPEL_COMMITTED);
  const current=freshChunkSurfState();current.finale.route=SOURCE_FINALE_ROUTE.TOWER;current.finale.stage=SOURCE_FINALE_STAGE.CATHEDRAL;
  assert.deepEqual(chunkSurfFinaleRouting(current),routing(current));
});
