import assert from 'node:assert/strict';
import {
  CHAPEL_TOWER_PHASE,
  TOWER_RELAY_STAGE,
  chapelTowerKeyring,
  freshChapelTowerState,
  inferLegacyChapelTower,
  reduceChapelTower,
  towerObjective,
  towerRelayStage,
} from '../src/game/chapel-tower-state.js';
import { applyTowerRelayAdvantage } from '../src/game/tower-chapel-bridge.js';

let state=freshChapelTowerState();
assert.equal(state.schema,3);assert.equal(state.layoutSchema,2);assert.equal(state.legacyLayout,false);
state=reduceChapelTower(state,{type:'FOURTH_TAKE_COMPLETED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.SOURCE_READY);
assert.equal(towerObjective(state).id,'enter-source');
state=reduceChapelTower(state,{type:'SOURCE_COMPLETED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.TRANSITION_READY);
state=reduceChapelTower(state,{type:'TRANSITION_COMMITTED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.TOWER_ACTIVE);
assert.deepEqual(chapelTowerKeyring(state),['tower-live']);
assert.equal(towerRelayStage(state),TOWER_RELAY_STAGE.DIAGNOSE);
state=reduceChapelTower(state,{type:'ROPE_ROOM_VISITED'});
state=reduceChapelTower(state,{type:'CLOCK_HAMMER_ISOLATED'});
state=reduceChapelTower(state,{type:'BELL_HATCH_INSPECTED'});
assert.equal(towerRelayStage(state),TOWER_RELAY_STAGE.INTERRUPT);
state=reduceChapelTower(state,{type:'TOWER_COLLISION'});assert.equal(state.attempts,1);
for(let i=0;i<3;i+=1)state=reduceChapelTower(state,{type:'RELAY_INTERRUPTED'});
assert.equal(state.relayInterruptions,3);
assert.equal(towerRelayStage(state),TOWER_RELAY_STAGE.RELEASE);
state=reduceChapelTower(state,{type:'SHUTTERS_RELEASED'});assert.equal(state.shuttersReleased,true);
state=reduceChapelTower(state,{type:'BELLS_STOOD'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.TOWER_CLEARED);
assert.deepEqual(chapelTowerKeyring(state),['tower-live','tower-cleared']);
assert.equal(towerObjective(state).id,'descend-nave');
state=reduceChapelTower(state,{type:'CHAPEL_REACHED'});assert.equal(towerObjective(state).id,'roll-fifth-take');
state=reduceChapelTower(state,{type:'CHAPEL_FINALE_STARTED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.CHAPEL_FINAL);
const baseBattle={intro:[],combat:{baseComposure:8,movements:[{coherence:3,before:[]},{coherence:4,before:[]}]}};
const bridgedBattle=applyTowerRelayAdvantage(baseBattle,state);
assert.equal(bridgedBattle.combat.towerRelayBroken,true);
assert.equal(bridgedBattle.combat.baseComposure,10,'breaking the carrier grants chapel composure');
assert.equal(bridgedBattle.combat.movements[0].coherence,2,'the first chapel movement loses its tower carrier');

assert.throws(()=>reduceChapelTower(freshChapelTowerState(),{type:'SOURCE_COMPLETED'}),/requires source_ready/);
assert.throws(()=>reduceChapelTower(
  reduceChapelTower(
    reduceChapelTower(freshChapelTowerState(),{type:'FOURTH_TAKE_COMPLETED'}),
    {type:'SOURCE_COMPLETED'},
  ),
  {type:'RELAY_INTERRUPTED'},
),/requires tower_active/);
assert.equal(inferLegacyChapelTower({takes:['a','b','c','d']}).phase,CHAPEL_TOWER_PHASE.SOURCE_READY);
assert.equal(inferLegacyChapelTower({rec:{takes:['a','b','c','d']}}).phase,CHAPEL_TOWER_PHASE.SOURCE_READY);
assert.equal(inferLegacyChapelTower({flags:{'chunkSurf.completed':true}}).phase,CHAPEL_TOWER_PHASE.TRANSITION_READY);
assert.equal(inferLegacyChapelTower({takes:['lux_nova']}).phase,CHAPEL_TOWER_PHASE.CHAPEL_FINAL);
console.log('chapel tower state tests ok');
