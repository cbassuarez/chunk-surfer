import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBAT_ACTION as A, TECHNIQUE, createCombatState, reduceCombat,
  availableCombatActions, availableCombatTools, combatRecoveryStatus,
} from '../src/game/combat-state.js';
import { authoredCombatProfile } from '../src/data/combat-definitions.js';

const cases = [
  { tool:'torch', reason:'NO TORCH', actions:[A.EXPOSE,A.WHITEOUT] },
  { tool:'recorder', reason:'NO RECORDER', actions:[A.MONITOR,A.PLAYBACK,A.MASTER_TAKE] },
  { tool:'rig', reason:'NO SERVICE INTERFACE', actions:[A.INVERT,A.RUNAWAY_FEEDBACK] },
  { tool:'fork', reason:'NO FORK', actions:[A.TUNE] },
  { tool:'radio', reason:'NO RADIO', actions:[A.RADIO_DECOY] },
  { tool:'coffee', reason:'NO COFFEE', actions:[A.STEADY_HANDS] },
  { tool:'spanner', reason:'NO SPANNER', actions:[A.SWING,A.SPANNER_GUARD] },
];
const definition = {
  id:'natatorium', enemy:'NATATORIUM', baseComposure:40,
  ...authoredCombatProfile('natatorium'),
};
function prepared(tool = null) {
  const state=createCombatState(definition, {
    seed:72, tools:Object.fromEntries(cases.map(entry=>[entry.tool,entry.tool===tool])),
    techniques:[TECHNIQUE.WHITEOUT,TECHNIQUE.MASTER_TAKE,TECHNIQUE.RUNAWAY_FEEDBACK],
  });
  // Satisfy the independent resource requirements so an absent physical tool,
  // rather than an empty take/charge pool or full composure, is what refuses.
  state.take={label:'LOADED TEST TAKE',tag:'body',damage:10};
  state.charge=state.maxCharge;
  state.composure=Math.max(1,state.maxComposure-10);
  return state;
}
const exceptLast = value => { const copy=structuredClone(value); delete copy.last; return copy; };

for(const {tool,reason,actions} of cases) {
  test(`the actual reducer refuses every ${tool} action when that tool is not carried`,()=>{
    for(const action of actions) {
      const state=prepared(),before=structuredClone(state),after=reduceCombat(state,{type:action});
      assert.equal(after.last.notice,reason,action);
      assert.deepEqual(exceptLast(after),exceptLast(before),`${action} spent or changed state without its tool`);
      assert.deepEqual(state,before,'the input state was mutated');
      assert.ok(!availableCombatTools(state).some(entry=>entry.id===tool));
      const displayed=availableCombatActions(state).find(entry=>entry.id===action);
      assert.ok(!displayed||displayed.enabled===false,`${action} was shown as usable without its tool`);
    }
  });
  test(`carrying the ${tool} still permits its actions with their normal resource rules`,()=>{
    for(const action of actions) {
      const state=prepared(tool),before=structuredClone(state),move=availableCombatActions(state).find(entry=>entry.id===action);
      assert.equal(move?.enabled,true,`${action} was not available with its real tool and resources`);
      const after=reduceCombat(state,{type:action});
      assert.equal(after.last.action,action);
      assert.equal(after.toolsUsed[tool],1,`${action} failed to use the carried tool`);
      assert.notEqual(after.last.notice,reason);
      assert.deepEqual(state,before,'the input state was mutated');
    }
  });
}

test('an empty active inventory retains the intended barehanded ways to act',()=>{
  for(const action of [A.SHOUT,A.HOLD,A.WAIT,A.COMPOSE]) {
    const state=prepared(),move=availableCombatActions(state).find(entry=>entry.id===action);
    assert.equal(move?.enabled,true,action);
    const after=reduceCombat(state,{type:action});
    assert.equal(after.last.action,action);
    assert.ok(!/^NO (?:TORCH|RECORDER|SERVICE INTERFACE|FORK|RADIO|COFFEE|SPANNER)$/.test(after.last.notice));
  }
});

test('a carried spanner is a progress route while the genuinely empty kit retains recovery',()=>{
  for(const tool of [null,'spanner']) {
    const state=prepared(tool);
    state.difficulty.recoveryHolds=1;
    state.recoveryHolds=0;
    state.recoveryUnlocked=false;
    const before=structuredClone(state),recovery=combatRecoveryStatus(state);
    assert.equal(recovery.stranded,tool===null,'repeatable steel must not be classified like an empty kit');
    const swing=availableCombatActions(state).find(move=>move.id===A.SWING);
    assert.equal(swing?.enabled===true,tool==='spanner');

    const braced=reduceCombat(state,{type:A.HOLD});
    assert.equal(braced.recoveryHolds,tool===null?1:0,'recovery credit must follow the actual absence of progress tools');
    assert.equal(braced.last.action,A.HOLD,'ordinary bracing must remain legal in either kit');
    assert.deepEqual(state,before,'checking recovery or bracing mutated the input');
  }
});
