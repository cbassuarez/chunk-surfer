import test from 'node:test';
import assert from 'node:assert/strict';
import {freshChapelTowerState,normalizeChapelTowerState,reduceChapelTower,CHAPEL_TOWER_PHASE,chapelTowerKeyring} from '../src/game/chapel-tower-state.js';
import {applyTowerPealAdvantage} from '../src/game/tower-chapel-bridge.js';
import {GRID} from '../src/game/combat-damage.js';
const bypass=()=>reduceChapelTower({...freshChapelTowerState(),phase:CHAPEL_TOWER_PHASE.TRANSITION_READY},{type:'TOWER_BYPASSED'});
const battle=()=>({intro:[{who:'you',text:'Existing chapel opening.'}],combat:{baseComposure:8*GRID,movements:[{coherence:5*GRID},{coherence:4*GRID}]}});
const unplayed=state=>{assert.equal(state.pealCompleted,false);assert.equal(state.bellsStanding,false);assert.equal(state.tenorRowsCompleted,0);};

test('explicit unrung bypass survives normal reads and repeated JSON save/reload',()=>{
 let state=bypass();unplayed(state);for(let n=0;n<4;n++){state=normalizeChapelTowerState(JSON.parse(JSON.stringify(state)));unplayed(state);}
 assert.equal(state.phase,CHAPEL_TOWER_PHASE.TOWER_CLEARED);assert.equal(state.chapelReached,true);assert.deepEqual(chapelTowerKeyring(state),['tower-live','tower-cleared'],'the earned navigation access remains open');
});
test('entering the chapel finale does not retroactively perform the bypassed tower',()=>{
 const state=reduceChapelTower(bypass(),{type:'CHAPEL_FINALE_STARTED'});assert.equal(state.phase,CHAPEL_TOWER_PHASE.CHAPEL_FINAL);unplayed(normalizeChapelTowerState(state));
});
test('the actual battle adapter grants no peal resources, weaker movement or misleading dialogue to a bypass',()=>{
 const original=battle(),before=structuredClone(original);assert.equal(applyTowerPealAdvantage(original,bypass()),original);assert.deepEqual(original,before);
 assert.equal(applyTowerPealAdvantage(original,reduceChapelTower(bypass(),{type:'CHAPEL_FINALE_STARTED'})),original);
});
test('completed legacy phase-only and relay saves retain their performance advantage',()=>{
 for(const source of[{phase:CHAPEL_TOWER_PHASE.TOWER_CLEARED},{schema:3,phase:CHAPEL_TOWER_PHASE.CHAPEL_FINAL,relayInterruptions:3},{schema:3,phase:CHAPEL_TOWER_PHASE.TOWER_ACTIVE,shuttersReleased:true}]){
  const state=normalizeChapelTowerState(source);assert.equal(state.pealCompleted,true);assert.equal(state.tenorRowsCompleted,84);if(source.phase!==CHAPEL_TOWER_PHASE.TOWER_ACTIVE){assert.equal(state.bellsStanding,true);assert.equal(applyTowerPealAdvantage(battle(),state).combat.towerPealCompleted,true);}
 }
});
test('an actually completed current performance still gains exactly the original peal advantage',()=>{
 let state={...freshChapelTowerState(),phase:CHAPEL_TOWER_PHASE.TOWER_ACTIVE};state=reduceChapelTower(state,{type:'PEAL_COMPLETED'});state=reduceChapelTower(state,{type:'BELLS_STOOD'});const original=battle(),result=applyTowerPealAdvantage(original,JSON.parse(JSON.stringify(state)));
 assert.equal(result.combat.towerPealCompleted,true);assert.equal(result.combat.baseComposure,10*GRID);assert.equal(result.combat.movements[0].coherence,4*GRID);assert.equal(result.combat.movements[1].coherence,original.combat.movements[1].coherence);
});
