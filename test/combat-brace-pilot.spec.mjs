import assert from 'node:assert/strict';
import test from 'node:test';
import { attachCombatDefinition } from '../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import { GRID } from '../src/game/combat-damage.js';
import {
  availableCombatActions, combatApparitionTargetIds, COMBAT_ACTION, createCombatState, currentCombatIntent, reduceCombat,
  runCombatTurn, SNR_STATE, TECHNIQUE,
} from '../src/game/combat-state.js';

function pilot(id, { patched = true, difficulty = 'standard' } = {}) {
  const { combat } = attachCombatDefinition({ id, enemy: 'TEST', rounds: [] });
  const startingMovementIndex = id === 'chapel' ? 3 : 0;
  return createCombatState(combat, {
    difficulty: COMBAT_RULES[difficulty],
    techniques: patched ? [TECHNIQUE.BRACE] : [],
    startingMovementIndex,
    tools: { torch:true, recorder:true, radio:true, spanner:true },
  });
}

// Keep the authored actor and hit rules while selecting a repeatable test
// commitment. The simulation tool exercises unscripted choices separately.
function commit(state, kind) {
  const movement = state.definition.movements[state.movementIndex];
  const intent = movement.intents.find(candidate => candidate.kind === kind);
  assert.ok(intent, `authored ${kind} intent in ${movement.id}`);
  state.committed = { index:state.intentIndex, id:intent.id };
  if (state.apparitions) {
    const actor = state.apparitions.members.find(member => member.health > 0);
    actor.intentId = intent.id;
  }
  assert.equal(currentCombatIntent(state).id, intent.id);
  return state;
}

const move = (state, id) => availableCombatActions(state).find(action => action.id === id);
const hold = state => reduceCombat(state, { type: COMBAT_ACTION.HOLD });

for (const id of ['hall', 'chapel']) {
  test(`${id}: a patched HOLD turns a read once and previews the same result`, () => {
    const patched = commit(pilot(id), 'overload');
    const empty = commit(pilot(id, { patched:false }), 'overload');
    const advertised = move(patched, COMBAT_ACTION.HOLD);
    assert.equal(advertised.turnsOverload, true);
    assert.equal(advertised.prevents, move(empty, COMBAT_ACTION.HOLD).prevents + GRID);
    const regular = hold(empty);
    const turned = hold(patched);
    assert.equal(regular.last.perfect, true);
    assert.equal(turned.last.turnedOverload, true);
    assert.equal(turned.last.dealt, regular.last.dealt + GRID);
    assert.equal(turned.pendingEnemy.prevention, regular.pendingEnemy.prevention + GRID);
    assert.ok(turned.last.dealt >= advertised.damageBand.min && turned.last.dealt <= advertised.damageBand.max);
    assert.equal(turned.charge, regular.charge, 'the same read earns the same charge');

    // Already used, even if another action brought us back to SIGNAL.
    const next = commit({ ...patched, braceUsedMovement:patched.movementIndex }, 'overload');
    assert.equal(move(next, COMBAT_ACTION.HOLD).turnsOverload, undefined);
    assert.equal(hold(next).last.turnedOverload, undefined);
    assert.equal(hold(next).last.dealt, regular.last.dealt);
  });

  test(`${id}: wrong reads, a repeated stance, and bonus actions cannot spend BRACE`, () => {
    const wrong = commit(pilot(id), 'broadcast');
    const regular = commit(pilot(id, { patched:false }), 'broadcast');
    assert.equal(move(wrong, COMBAT_ACTION.HOLD).prevents, move(regular, COMBAT_ACTION.HOLD).prevents);
    assert.equal(move(wrong, COMBAT_ACTION.SPANNER_GUARD).prevents, move(regular, COMBAT_ACTION.SPANNER_GUARD).prevents);
    assert.equal(hold(wrong).last.turnedOverload, undefined);
    assert.equal(hold(wrong).last.dealt, 0);
    const tempo = commit({ ...pilot(id), tempo:true }, 'overload');
    assert.equal(hold(tempo).last.turnedOverload, undefined);
    assert.equal(hold(tempo).last.dealt, 0);
    const silence = commit({ ...pilot(id), snr:SNR_STATE.SILENCE }, 'overload');
    assert.equal(hold(silence).last.turnedOverload, undefined);
    assert.ok(hold(silence).last.dealt > 0, 'baseline overload counter still works');
  });
}

test('Dead Air describes the BRACE condition without exposing the committed intent', () => {
  const overload = commit(pilot('chapel', { difficulty:'dead-air' }), 'overload');
  const broadcast = commit(pilot('chapel', { difficulty:'dead-air' }), 'broadcast');
  assert.deepEqual(move(overload, COMBAT_ACTION.HOLD), move(broadcast, COMBAT_ACTION.HOLD));
  assert.equal(move(overload, COMBAT_ACTION.HOLD).braceOnRead, true);
  assert.equal(hold(overload).last.turnedOverload, true);
  assert.equal(hold(broadcast).last.turnedOverload, undefined);
});

test('blind HOLD cannot keep turning overloads across multiple rounds', () => {
  let state = commit(pilot('chapel', { difficulty:'severe' }), 'overload');
  assert.equal(hold(state).last.turnedOverload, true);
  state = runCombatTurn(state, { type: COMBAT_ACTION.HOLD });
  for (let step = 0; step < 8 && !state.result; step += 1) {
    if (!state.tempo) commit(state, 'overload');
    assert.equal(hold(state).last.turnedOverload, undefined);
    state = runCombatTurn(state, { type: COMBAT_ACTION.HOLD });
  }
});

test('Hall Torch patch cashes in only after EXPOSE and a loaded take', () => {
  for (const patched of [false, true]) {
    const state = pilot('hall', { patched:false });
    state.techniques = patched ? [TECHNIQUE.AFTERIMAGE] : [];
    state.take = { id:'test-take', damage:10, label:'TAKE' };
    const before = move(state, COMBAT_ACTION.PLAYBACK).damageBand;
    const exposed = reduceCombat(commit(state, 'conceal'), { type: COMBAT_ACTION.EXPOSE });
    const residue = patched ? 2 * GRID : GRID;
    assert.equal(exposed.exposedBonus, residue);
    const next = runCombatTurn(state, { type:COMBAT_ACTION.EXPOSE });
    assert.equal(next.exposedBonus, residue);
    const playback = move(next, COMBAT_ACTION.PLAYBACK).damageBand;
    assert.ok(playback.min >= before.min + residue);
    assert.equal(reduceCombat(next, { type:COMBAT_ACTION.PLAYBACK }).exposedBonus, 0);
  }
});

test('Hall WHITEOUT clears the aimed guards and leaves the third body alone', () => {
  const state = pilot('hall', { patched:false });
  state.techniques = [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT];
  state.charge = 2;
  for (const member of state.apparitions.members) member.guard = { mode:'parry', armedRound:1 };
  const targets = combatApparitionTargetIds(state, COMBAT_ACTION.WHITEOUT);
  const after = reduceCombat(state, { type:COMBAT_ACTION.WHITEOUT });
  assert.equal(targets.length, 2);
  assert.deepEqual(after.last.apparitions.parried, []);
  for (const member of after.apparitions.members) {
    assert.equal(member.guard === null, targets.includes(member.id));
    assert.equal(member.health < member.maxHealth, targets.includes(member.id));
  }
  assert.equal(after.charge, 0);
  assert.ok(after.battery < state.battery);
});
