import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_ACTION,
  availableCombatActions,
  createCombatState,
  reduceCombat,
  runCombatTurn,
} from '../src/game/combat-state.js';
import { authoredCombatProfile, trainingCombatBattle } from '../src/data/combat-definitions.js';
import { COMBAT_TUTORIAL_STEPS, createCombatTutorialDirector } from '../src/game/combat-tutorial.js';

const trainingState = () => createCombatState({
  id: 'training',
  enemy: 'THE BENCH SIGNAL',
  baseComposure: 8,
  ...authoredCombatProfile('training'),
}, { tools: { torch: true, recorder: true } });

test('the director gates moves to the current lesson and releases them at the end', () => {
  const director = createCombatTutorialDirector();
  const state = trainingState();
  const gated = director.filterMoves(availableCombatActions(state));
  for (const move of gated) {
    if (move.id === COMBAT_ACTION.HOLD) assert.equal(move.enabled, true);
    else {
      assert.equal(move.enabled, false, `${move.id} is gated during the hold lesson`);
      assert.equal(move.reason, 'FOLLOW THE DRILL');
    }
  }
  director.skip();
  assert.equal(director.active(), false);
  const freed = director.filterMoves(availableCombatActions(state));
  assert.deepEqual(freed, availableCombatActions(state));
});

test('the drill advances one lesson per scripted turn against the training profile', () => {
  const director = createCombatTutorialDirector();
  let state = trainingState();
  const play = (actionId) => {
    const before = state;
    state = runCombatTurn(state, { type: actionId });
    return director.advance(before, state);
  };
  assert.equal(director.step().id, 'hold');
  assert.equal(play(COMBAT_ACTION.HOLD), true);
  assert.equal(director.step().id, 'monitor');
  assert.equal(play(COMBAT_ACTION.MONITOR), true);
  assert.equal(director.step().id, 'tempo');
  assert.equal(play(COMBAT_ACTION.PLAYBACK), true);
  assert.equal(director.step().id, 'expose');
  assert.equal(play(COMBAT_ACTION.EXPOSE), true);
  assert.equal(director.step().id, 'stance');
  assert.equal(play(COMBAT_ACTION.HOLD), true);
  // The parry lesson. It is the one step a headless walkthrough cannot satisfy —
  // the parry is a timed press against the blow while it lands, not a move — so
  // this is also the test that its `patience` is real: yield twice and the drill
  // moves on rather than trapping a player on a timing.
  assert.equal(director.step().id, 'parry');
  assert.equal(play(COMBAT_ACTION.WAIT), false, 'one missed attempt does not advance');
  assert.equal(director.step().id, 'parry');
  assert.equal(play(COMBAT_ACTION.WAIT), true, 'the second one gives up on the player, not the reverse');
  // The last lesson is free play: it never auto-advances, and every step so
  // far has a prompt and (until now) a spotlight region.
  assert.equal(director.step().id, 'free');
  assert.equal(play(COMBAT_ACTION.HOLD), false);
  assert.equal(director.active(), true);
  assert.ok(director.prompt().length > 0);
});

test('every scripted lesson only allows moves the training state can actually take that turn', () => {
  // Replays the drill but asserts, before each turn, that at least one allowed
  // move is enabled — a regression guard for edits to the intent script.
  const director = createCombatTutorialDirector();
  let state = trainingState();
  const order = [
    COMBAT_ACTION.HOLD, COMBAT_ACTION.MONITOR, COMBAT_ACTION.PLAYBACK,
    COMBAT_ACTION.EXPOSE, COMBAT_ACTION.HOLD, COMBAT_ACTION.WAIT, COMBAT_ACTION.WAIT,
  ];
  for (const actionId of order) {
    const moves = director.filterMoves(availableCombatActions(state));
    const allowed = moves.filter((move) => move.enabled);
    assert.ok(allowed.length >= 1, `${director.step().id} offers an enabled move`);
    assert.ok(allowed.some((move) => move.id === actionId), `${director.step().id} allows ${actionId}`);
    const before = state;
    state = runCombatTurn(state, { type: actionId });
    director.advance(before, state);
    assert.equal(state.result, null, 'the drill never ends mid-lesson');
  }
});

test('the training battle ships intro, win, and lose dialogue and step metadata is frozen', () => {
  const battle = trainingCombatBattle();
  assert.equal(battle.id, 'training');
  assert.ok(battle.combat.movements.length >= 2);
  assert.ok(battle.intro.length && battle.win.length && battle.lose.length);
  assert.equal(battle.combat.signature, null);
  assert.ok(COMBAT_TUTORIAL_STEPS.every((step) => step.id && step.say));
  assert.throws(() => { COMBAT_TUTORIAL_STEPS[0].say = 'x'; });
});
