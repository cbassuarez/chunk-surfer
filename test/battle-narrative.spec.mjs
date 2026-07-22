import test from 'node:test';
import assert from 'node:assert/strict';

import { runtimeBattle } from '../src/narrative/runtime-content.js';
import { validateCombatDefinition, createCombatState } from '../src/game/combat-state.js';

const RECORDING_BATTLES = [
  'battle.natatoriumbattle.unnamed', 'battle.natatoriumbattle.named',
  'battle.practicebattle.unnamed', 'battle.practicebattle.named',
  'battle.hallbattle.unnamed', 'battle.hallbattle.named',
];
const CHAPEL_BATTLES = [
  'battle.chapel.nothing', 'battle.chapel.name-sarah', 'battle.chapel.name-other',
  'battle.chapel.reason-money', 'battle.chapel.reason-superstition',
  'battle.chapel.reason-other', 'battle.chapel.feeling',
];

test('every authored battle rehydrates into a valid combat definition', () => {
  for (const id of [...RECORDING_BATTLES, ...CHAPEL_BATTLES]) {
    const battle = runtimeBattle(id);
    assert.deepEqual(validateCombatDefinition(battle.combat), [], id);
    assert.doesNotThrow(() => createCombatState(battle.combat, {}), id);
  }
});

test('every movement of every battle carries a story beat (before or on-listen)', () => {
  for (const id of [...RECORDING_BATTLES, ...CHAPEL_BATTLES]) {
    const battle = runtimeBattle(id);
    battle.combat.movements.forEach((movement, index) => {
      const beats = (movement.before || []).length + (movement.onListen || []).length;
      assert.ok(beats > 0, `${id} movement ${index} (${movement.title}) has no dialogue beat`);
    });
  }
});

test('chapel battles run five movements ending on THE SOURCE, with no redact-era vocabulary', () => {
  for (const id of CHAPEL_BATTLES) {
    const battle = runtimeBattle(id);
    assert.equal(battle.combat.movements.length, 5, id);
    assert.equal(battle.combat.movements[4].title, 'THE SOURCE', id);
    const raw = JSON.stringify(battle);
    assert.ok(!raw.includes('BLACKED OUT'), `${id} still carries blackout vocabulary`);
    // Old checkpoint prompts must have been folded into playable channels —
    // the combat scene never reads checkpoint blocks.
    for (const movement of battle.combat.movements) {
      assert.ok(!movement.checkpoint || movement.checkpoint.prompt.length === 0,
        `${id} still relies on checkpoint prompts the scene cannot play`);
    }
  }
});

test('the broken pronoun interpolation stays fixed in the unnamed variants', () => {
  for (const id of ['battle.natatoriumbattle.unnamed', 'battle.practicebattle.unnamed']) {
    const raw = JSON.stringify(runtimeBattle(id));
    assert.ok(!raw.includes('I recorded she'), `${id} regressed to "I recorded she"`);
    assert.ok(raw.includes('I recorded her'), `${id} lost the corrected line`);
  }
});
