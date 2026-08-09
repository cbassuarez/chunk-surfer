import assert from 'node:assert/strict';
import {
  CHAPEL_TOWER_PHASE,
  TOWER_PEAL_STAGE,
  TOWER_STEDMAN_ROWS,
  chapelTowerKeyring,
  freshChapelTowerState,
  inferLegacyChapelTower,
  normalizeChapelTowerState,
  reduceChapelTower,
  towerObjective,
  towerPealStage,
} from '../src/game/chapel-tower-state.js';
import { applyTowerPealAdvantage } from '../src/game/tower-chapel-bridge.js';

let state=freshChapelTowerState();
assert.equal(state.schema,4);assert.equal(state.layoutSchema,2);assert.equal(state.legacyLayout,false);
const earlyDiscovery=reduceChapelTower(state,{type:'CHAPEL_CORRIDOR_REACHED'});
assert.equal(earlyDiscovery.phase,CHAPEL_TOWER_PHASE.FORESHADOW);
assert.equal(earlyDiscovery.corridorDiscovered,true,'the chapel route latches before the fourth take');
assert.equal(reduceChapelTower(earlyDiscovery,{type:'FOURTH_TAKE_COMPLETED'}).corridorDiscovered,true,'the early route discovery survives source activation');
state=reduceChapelTower(state,{type:'FOURTH_TAKE_COMPLETED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.SOURCE_READY);
state=reduceChapelTower(state,{type:'BELL_TRANSPORT_SAVED',elapsedMs:4321,mode:'source_wash',washMs:2750,transitionProgress:.2});
assert.equal(state.transportElapsedMs,4321);assert.equal(state.transportWashMs,2750);assert.equal(state.transportTransitionProgress,.2);
assert.equal(towerObjective(state).id,'locate-bells');assert.equal(towerPealStage(state),TOWER_PEAL_STAGE.LOCATE);
state=reduceChapelTower(state,{type:'CHAPEL_CORRIDOR_REACHED'});assert.equal(towerObjective(state).id,'enter-source');
state=reduceChapelTower(state,{type:'SOURCE_COMPLETED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.TRANSITION_READY);
state=reduceChapelTower(state,{type:'TRANSITION_COMMITTED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.TOWER_ACTIVE);
assert.deepEqual(chapelTowerKeyring(state),['tower-live']);assert.equal(towerObjective(state).id,'take-tenor');
state=reduceChapelTower(state,{type:'TENOR_ROPE_TAKEN'});assert.equal(towerPealStage(state),TOWER_PEAL_STAGE.PERFORM);
state=reduceChapelTower(state,{type:'TOWER_COLLISION'});assert.equal(state.attempts,1);
for(let row=1;row<=TOWER_STEDMAN_ROWS;row++)state=reduceChapelTower(state,{type:'TENOR_ROW_COMPLETED',row});
state=reduceChapelTower(state,{type:'PEAL_COMPLETED'});assert.equal(towerPealStage(state),TOWER_PEAL_STAGE.STANDING);
state=reduceChapelTower(state,{type:'BELLS_STOOD'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.TOWER_CLEARED);
assert.deepEqual(chapelTowerKeyring(state),['tower-live','tower-cleared']);assert.equal(towerObjective(state).id,'descend-nave');
state=reduceChapelTower(state,{type:'CHAPEL_REACHED'});assert.equal(towerObjective(state).id,'roll-fifth-take');
state=reduceChapelTower(state,{type:'CHAPEL_FINALE_STARTED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.CHAPEL_FINAL);

const baseBattle={intro:[],combat:{baseComposure:8,movements:[{coherence:3,before:[]},{coherence:4,before:[]}]}};
const bridgedBattle=applyTowerPealAdvantage(baseBattle,state);
assert.equal(bridgedBattle.combat.towerPealCompleted,true);assert.equal(bridgedBattle.combat.baseComposure,10);
assert.equal('towerRelayBroken' in bridgedBattle.combat,false);
assert.equal(bridgedBattle.combat.movements[0].coherence,2);

assert.throws(()=>reduceChapelTower(freshChapelTowerState(),{type:'SOURCE_COMPLETED'}),/requires source_ready/);
assert.throws(()=>reduceChapelTower(
  reduceChapelTower(reduceChapelTower(freshChapelTowerState(),{type:'FOURTH_TAKE_COMPLETED'}),{type:'SOURCE_COMPLETED'}),
  {type:'TENOR_ROW_COMPLETED'},
),/requires tower_active/);
const migrated=normalizeChapelTowerState({schema:3,phase:CHAPEL_TOWER_PHASE.TOWER_ACTIVE,relayInterruptions:2,attempts:4});
assert.equal(migrated.tenorRowsCompleted,56);assert.equal(migrated.attempts,4);assert.equal(migrated.pealCompleted,false);
const migratedSolved=normalizeChapelTowerState({schema:3,phase:CHAPEL_TOWER_PHASE.TOWER_ACTIVE,relayInterruptions:3});
assert.equal(migratedSolved.tenorRowsCompleted,84);assert.equal(migratedSolved.pealCompleted,true);
assert.equal(inferLegacyChapelTower({takes:['a','b','c','d']}).phase,CHAPEL_TOWER_PHASE.SOURCE_READY);
assert.equal(inferLegacyChapelTower({flags:{'chunkSurf.completed':true}}).phase,CHAPEL_TOWER_PHASE.TRANSITION_READY);
assert.equal(inferLegacyChapelTower({takes:['lux_nova']}).phase,CHAPEL_TOWER_PHASE.CHAPEL_FINAL);
console.log('chapel tower state tests ok');
