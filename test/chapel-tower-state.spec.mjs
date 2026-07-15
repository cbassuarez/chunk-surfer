import assert from 'node:assert/strict';
import {
  CHAPEL_TOWER_PHASE,
  freshChapelTowerState,
  inferLegacyChapelTower,
  reduceChapelTower,
} from '../src/game/chapel-tower-state.js';

let state=freshChapelTowerState();
assert.equal(state.schema,2);assert.equal(state.layoutSchema,2);assert.equal(state.legacyLayout,false);
state=reduceChapelTower(state,{type:'FOURTH_TAKE_COMPLETED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.SOURCE_READY);
state=reduceChapelTower(state,{type:'SOURCE_COMPLETED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.TRANSITION_READY);
state=reduceChapelTower(state,{type:'TRANSITION_COMMITTED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.TOWER_ACTIVE);
state=reduceChapelTower(state,{type:'TOWER_COLLISION'});assert.equal(state.attempts,1);
state=reduceChapelTower(state,{type:'SHUTTERS_RELEASED'});assert.equal(state.shuttersReleased,true);
state=reduceChapelTower(state,{type:'BELLS_STOOD'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.TOWER_CLEARED);
state=reduceChapelTower(state,{type:'CHAPEL_FINALE_STARTED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.CHAPEL_FINAL);

assert.throws(()=>reduceChapelTower(freshChapelTowerState(),{type:'SOURCE_COMPLETED'}),/requires source_ready/);
assert.equal(inferLegacyChapelTower({takes:['a','b','c','d']}).phase,CHAPEL_TOWER_PHASE.SOURCE_READY);
assert.equal(inferLegacyChapelTower({rec:{takes:['a','b','c','d']}}).phase,CHAPEL_TOWER_PHASE.SOURCE_READY);
assert.equal(inferLegacyChapelTower({flags:{'chunkSurf.completed':true}}).phase,CHAPEL_TOWER_PHASE.TRANSITION_READY);
assert.equal(inferLegacyChapelTower({takes:['lux_nova']}).phase,CHAPEL_TOWER_PHASE.CHAPEL_FINAL);
console.log('chapel tower state tests ok');
