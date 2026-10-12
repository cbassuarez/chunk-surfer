import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChunkSurfState, reduceChunkSurf, SOURCE_FINALE_ROUTE, SOURCE_FINALE_STAGE } from '../src/game/chunk-surf-state.js';
import { cathedralBellCombatDefinition } from '../src/data/combat-definitions.js';
import { createCombatState } from '../src/game/combat-state.js';
import { combatCheckpointSnapshot, cathedralRetryCheckpoint } from '../src/game/combat-checkpoint.js';
import { CATHEDRAL_LESSONS, cathedralLessonTree } from '../src/game/cathedral-descent.js';

const reload=(state)=>normalizeChunkSurfState(JSON.parse(JSON.stringify(state)));
const dispatch=(state,type,extra={})=>reduceChunkSurf(state,{type,...extra});
const fighting=()=>normalizeChunkSurfState({finale:{route:SOURCE_FINALE_ROUTE.TOWER,stage:SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT}});

test('phase-two handoff survives reload before its first command surface exists',()=>{
  let source=fighting();
  source=dispatch(source,'CATHEDRAL_STAGED',{mark:'bell-fallen'});
  source=dispatch(source,'CATHEDRAL_FIGHT_CHECKPOINT',{fight:{phase:2,continuation:{composure:23,battery:.27,charge:1,take:{label:'BELL FRAME',damage:10}}}});
  const restored=reload(source);
  assert.equal(restored.finale.cathedral.fight.phase,2);
  assert.equal(restored.finale.cathedral.fight.continuation.composure,23);
  assert.equal(restored.finale.cathedral.fight.continuation.take.label,'BELL FRAME');
  assert.deepEqual(restored.finale.cathedral.damage,['bell-fallen']);
});

test('two defeats preserve the second phase and damage, while the third closes the route',()=>{
  let source=fighting();
  const combat=createCombatState(cathedralBellCombatDefinition({phase:2}),{composure:12,battery:.08});
  const checkpoint=combatCheckpointSnapshot(combat,{phase:'tool'});
  assert.ok(checkpoint);
  source=dispatch(source,'CATHEDRAL_STAGED',{mark:'pulpitum-split'});
  source=dispatch(source,'CATHEDRAL_FIGHT_CHECKPOINT',{fight:{phase:2,checkpoint}});
  for(let defeat=1;defeat<=3;defeat++){
    source=reload(dispatch(source,'CATHEDRAL_FIGHT_LOST'));
    assert.equal(source.finale.bust.defeats,defeat);
    assert.deepEqual(source.finale.cathedral.damage,['pulpitum-split']);
    assert.equal(source.finale.route,SOURCE_FINALE_ROUTE.TOWER);
    if(defeat<3){
      assert.equal(source.finale.stage,SOURCE_FINALE_STAGE.CATHEDRAL);
      assert.equal(source.finale.cathedral.fight.phase,2);
      assert.equal(source.finale.cathedral.fight.retry,true);
      source=dispatch(source,'CATHEDRAL_FIGHT_STARTED');
      const retry=cathedralRetryCheckpoint(source.finale.cathedral.fight.checkpoint,{composure:40,battery:.35});
      assert.ok(retry);
      assert.equal(retry.state.phase,'select');
      assert.equal(retry.state.composure,retry.state.maxComposure);
      assert.equal(retry.state.battery,.35);
      source=dispatch(source,'CATHEDRAL_FIGHT_CHECKPOINT',{fight:{phase:2,checkpoint:retry}});
    }else{
      assert.equal(source.finale.stage,SOURCE_FINALE_STAGE.RESOLVED);
      assert.equal(source.finale.result,'lost');
    }
  }
});

test('safe lessons keep the same responses as the actual duel and cannot spend a fight attempt',()=>{
  let source=normalizeChunkSurfState({finale:{route:SOURCE_FINALE_ROUTE.TOWER,stage:SOURCE_FINALE_STAGE.CATHEDRAL}});
  for(const lesson of CATHEDRAL_LESSONS){
    const tree=cathedralLessonTree(lesson);
    assert.equal(tree.choose.choices.filter((choice)=>choice.correct).length,1);
    assert.ok(tree.choose.choices.some((choice)=>choice.text===lesson.correct&&choice.goto==='learned'));
    source=dispatch(source,'CATHEDRAL_LESSON_COMPLETED',{id:lesson.id});
  }
  source=reload(source);
  assert.deepEqual(source.finale.cathedral.lessons,['clapper','louvre','wheel']);
  assert.equal(source.finale.stage,SOURCE_FINALE_STAGE.CATHEDRAL);
  assert.equal(source.finale.bust.defeats,0);
});
