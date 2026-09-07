import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_ACTION,
  advanceEnemy,
  availableCombatActions,
  createCombatState,
  currentCombatIntent,
  reduceCombat,
  runCombatTurn,
  validateCombatDefinition,
} from '../src/game/combat-state.js';
import { trainingCombatBattle } from '../src/data/combat-definitions.js';
import { COMBAT_TUTORIAL_STEPS, createCombatTutorialDirector } from '../src/game/combat-tutorial.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import { makeCombatScene } from '../src/game/combat.js';

const trainingState = (options = {}) => createCombatState(trainingCombatBattle().combat, options);
const scriptedActions = ['hold', 'expose', 'hold', 'monitor', 'playback'];
function teach({ difficulty = COMBAT_RULES.standard, seed = 0, parry = false } = {}) {
  const director = createCombatTutorialDirector();
  let state = director.prepareState(trainingState({ difficulty, seed }));
  const play = (action, { react = false } = {}) => {
    const before = state;
    assert.ok(director.filterMoves(availableCombatActions(state)).some(move => move.id === action && move.enabled),
      `${director.step()?.id} exposes usable ${action}`);
    state = runCombatTurn(state, { type: action });
    if (react) state = reduceCombat(state, { type: COMBAT_ACTION.PARRY });
    director.advance(before, state);
    assert.equal(state.result, null, 'the taught sequence never accidentally kills either side');
    state = director.prepareState(state);
  };
  for (const action of scriptedActions) play(action);
  assert.equal(director.step().id, 'parry');
  play('wait', { react: parry });
  if (!parry) {
    assert.equal(director.snapshot().attempts, 1);
    assert.equal(currentCombatIntent(state).id, 'training:contact', 'a retry offers another actual parryable blow');
    play('wait');
  }
  return { state, director };
}

test('the director gates moves to the current lesson and releases them at the end', () => {
  const director = createCombatTutorialDirector();
  const state = trainingState();
  const gated = director.filterMoves(availableCombatActions(state));
  for (const move of gated) {
    if (move.id === COMBAT_ACTION.HOLD) assert.equal(move.enabled, true);
    else {
      assert.equal(move.enabled, false, `${move.id} is gated during the hold lesson`);
      assert.equal(move.reason, 'DRILL · HOLD NEXT');
    }
  }
  director.skip();
  assert.equal(director.active(), false);
  const freed = director.filterMoves(availableCombatActions(state));
  assert.deepEqual(freed, availableCombatActions(state));
});

test('the drill teaches hold, exposure, free tempo, capture, playback, and a bounded parry', () => {
  const director = createCombatTutorialDirector();
  let state = director.prepareState(trainingState());
  const play = (actionId) => {
    const before = state;
    state = runCombatTurn(state, { type: actionId });
    const advanced = director.advance(before, state);
    state = director.prepareState(state);
    return advanced;
  };
  assert.equal(director.step().id, 'hold');
  assert.equal(play(COMBAT_ACTION.HOLD), true);
  assert.equal(director.step().id, 'expose');
  assert.equal(play(COMBAT_ACTION.EXPOSE), true);
  assert.equal(director.step().id, 'settle');
  assert.equal(state.tempo, true);
  const upcoming = currentCombatIntent(state).id;
  assert.equal(play(COMBAT_ACTION.HOLD), true);
  assert.equal(state.tempo, false);
  assert.equal(currentCombatIntent(state).id, upcoming, 'spending tempo does not consume the next telegraph');
  assert.equal(director.step().id, 'monitor');
  assert.equal(play(COMBAT_ACTION.MONITOR), true);
  assert.ok(state.take);
  assert.equal(director.step().id, 'tempo');
  assert.equal(play(COMBAT_ACTION.PLAYBACK), true);
  assert.equal(state.take, null);
  assert.equal(director.step().id, 'parry');
  assert.equal(play(COMBAT_ACTION.WAIT), false, 'one missed attempt does not advance');
  assert.equal(director.step().id, 'parry');
  assert.equal(play(COMBAT_ACTION.WAIT), true, 'two attempts are enough to learn the timing exists');
  assert.equal(director.step().id, 'free');
  assert.equal(director.completeBattle(), false, 'the director cannot manufacture a victory');
  assert.equal(director.active(), true);
  assert.equal(state.result, null);
  assert.ok(state.movementCoherence >= 20, 'there is a real short finish still to play');
  assert.deepEqual(director.filterMoves(availableCombatActions(state)), availableCombatActions(state));
});

test('skipping the lesson gate permits practice without falsely completing the battle', () => {
  const director=createCombatTutorialDirector();
  director.skip();
  assert.equal(director.active(),false);
  assert.equal(director.completeBattle(),false);
});

test('all difficulties and seeded rolls reach a short real finish with useful choices', () => {
  for (const difficulty of Object.values(COMBAT_RULES)) for (let seed = 0; seed < 32; seed++) {
    for (const parry of [false, true]) {
      let { state, director } = teach({ difficulty, seed, parry });
      assert.equal(director.step().id, 'free');
      assert.ok(availableCombatActions(state).filter(move => move.enabled).length >= 4);
      let finishActions = 0;
      while (!state.result && finishActions < 9) {
        const intent = currentCombatIntent(state);
        const action = state.tempo ? state.take ? 'playback' : 'expose'
          : intent.kind === 'broadcast' ? 'monitor' : intent.kind === 'overload' ? 'hold' : 'expose';
        const before = state;
        state = runCombatTurn(state, { type: action });
        director.advance(before, state);
        finishActions++;
      }
      assert.equal(state.result?.result, 'win', `${difficulty.id}/${seed}/${parry}: actual reducer victory`);
      assert.ok(finishActions >= 2 && finishActions <= 8, `${finishActions} finish choices, not another full fight`);
      assert.equal(director.active(), false);
    }
  }
});

test('the training battle ships intro, win, and lose dialogue and step metadata is frozen', () => {
  const battle = trainingCombatBattle();
  assert.equal(battle.id, 'training');
  assert.equal(battle.combat.movements.length, 1, 'one bar, no surprise second full fight');
  assert.deepEqual(validateCombatDefinition(battle.combat), []);
  assert.ok(battle.intro.length && battle.win.length && battle.lose.length);
  assert.equal(battle.combat.signature, null);
  assert.ok(COMBAT_TUTORIAL_STEPS.every((step) => step.id && step.say));
  assert.throws(() => { COMBAT_TUTORIAL_STEPS[0].say = 'x'; });
});

test('the training nightmare preserves the authored level-check joke payoff', () => {
  assert.deepEqual(trainingCombatBattle().intro, [
    { who: 'direction', text: 'And there it is. Nine feet of it, in the deep end, exactly as daft as he described.' },
    { who: 'you', text: "Oh, that's not fair. I was joking. I was making a joke." },
  ]);
});

test('a real player commitment survives reaction rewrites and an enemy-only beat teaches nothing', () => {
  const director = createCombatTutorialDirector();
  const before = director.prepareState(trainingState());
  let after = runCombatTurn(before, { type: COMBAT_ACTION.HOLD });
  after = reduceCombat(after, { type: COMBAT_ACTION.PARRY });
  assert.equal(after.last.action, COMBAT_ACTION.PARRY);
  assert.equal(director.advance(before, after), true, 'HOLD was still the committed lesson');
  const stalled = createCombatTutorialDirector();
  const enemyOnly = advanceEnemy(before);
  enemyOnly.last = { ...enemyOnly.last, action: COMBAT_ACTION.HOLD };
  assert.equal(stalled.advance(before, enemyOnly), false, 'a stale last.action does not pretend the player acted');
  assert.equal(stalled.snapshot().attempts, 0);
});

test('house supplies are local, issued once, and never normalize another battle', () => {
  const director = createCombatTutorialDirector();
  const empty = trainingState({ tools: { torch: false, recorder: false }, battery: 0, composure: 1 });
  const supplied = director.prepareState(empty);
  assert.equal(supplied.tools.torch, true);
  assert.equal(supplied.tools.recorder, true);
  assert.equal(supplied.take, null, 'the player must really make the take');
  assert.equal(supplied.composure, supplied.maxComposure);
  assert.equal(empty.tools.torch, false);
  assert.equal(empty.battery, 0, 'supplies do not mutate the caller or real inventory');
  const spent = { ...supplied, battery: .2, composure: 9 };
  assert.equal(director.prepareState(spent).battery, .2, 'preparing another selection cannot refill resources');
  assert.equal(director.prepareState(spent).composure, 9);
  const foreign = { ...empty, definition: { ...empty.definition, id: 'hall', rehearsal: null } };
  assert.equal(director.prepareState(foreign), foreign);
});

const press = (scene, event = { key: 'Enter', code: 'Enter' }) => {
  scene.key(event); scene.keyup(event);
};
function commitVisibleLesson(scene, input = 'keyboard') {
  const view = scene.battleView(), chosen = view.moves[view.selectedMove];
  assert.equal(view.phase, 'move', `${view.tutorial.id}: the taught action is already reachable`);
  assert.ok(chosen?.enabled, `${view.tutorial.id}: no disabled selected move`);
  if (input === 'pointer') {
    scene.render();
    const rect = scene.battleView().inputRects.moves.find(row => row.id === chosen.id);
    assert.ok(rect, `${chosen.id} is actually laid out, not just present in a list`);
    scene.pointer({ type: 'pointerdown', pointerId: 7, button: 0, cellX: rect.x + rect.w / 2, cellY: rect.y + rect.h / 2 });
    scene.pointer({ type: 'pointerup', pointerId: 7, cellX: -1, cellY: -1 });
  } else press(scene, input === 'controller' ? { controllerAction: 'confirm', controller: true } : undefined);
  assert.equal(scene.battleView().phase, 'resolve', 'the visible action really commits');
}
function settleScene(scene, { parry = false } = {}) {
  let reacted = false;
  for (let frame = 0; frame < 600 && scene.battleView().phase === 'resolve'; frame++) {
    const view = scene.battleView();
    if (parry && !reacted && view.resolution?.side === 'enemy' && view.resolution.parry?.armed) {
      press(scene, { controllerAction: 'confirm', controller: true });
      reacted = true;
    }
    scene.update(1 / 60);
  }
  assert.notEqual(scene.battleView().phase, 'resolve', 'each played beat settles');
  return reacted;
}
function chooseAction(scene, id) {
  let view = scene.battleView();
  if (view.phase === 'move') press(scene, { key: 'ArrowUp', code: 'ArrowUp' });
  const tool = view.tools.findIndex(item => item.moves.includes(id));
  assert.ok(tool >= 0, `tool for ${id} exists`);
  for (let i = 0; scene.battleView().selectedTool !== tool && i < view.tools.length; i++) press(scene, { key: 'ArrowRight', code: 'ArrowRight' });
  press(scene, { key: 'ArrowDown', code: 'ArrowDown' });
  view = scene.battleView();
  const target = view.moves.findIndex(move => move.id === id);
  for (let i = 0; scene.battleView().selectedMove !== target && i < view.moves.length; i++) press(scene, { key: 'ArrowRight', code: 'ArrowRight' });
  assert.equal(scene.battleView().moves[scene.battleView().selectedMove]?.id, id);
}

test('the actual scene exposes every taught action to keyboard, controller, and pointer on every difficulty', () => {
  for (const difficulty of Object.values(COMBAT_RULES)) for (const input of ['keyboard', 'controller', 'pointer']) {
    const scene = makeCombatScene({ battle: trainingCombatBattle(), director: createCombatTutorialDirector(),
      difficulty, skipOpening: true, loadout: { tools: { torch: false, recorder: false }, battery: 0 } });
    scene.enter();
    try {
      const seen = [];
      while (scene.battleView().tutorial?.id !== 'free' && seen.length < 9) {
        const before = scene.battleView();
        seen.push(before.tutorial.id);
        const selected = before.moves[before.selectedMove];
        assert.equal(selected.id, COMBAT_TUTORIAL_STEPS[before.tutorial.index].preferred);
        assert.equal(before.turnClock, null);
        const logLength = before.state.actionLog.length;
        scene.update(120);
        assert.equal(scene.battleView().state.actionLog.length, logLength, 'reading cannot forfeit or drift a lesson');
        commitVisibleLesson(scene, input);
        settleScene(scene, { parry: before.tutorial.id === 'parry' });
        assert.equal(scene.battleView().state.result, null, 'guided steps never substitute for finishing the enemy');
      }
      assert.deepEqual(seen, ['hold', 'expose', 'settle', 'monitor', 'tempo', 'parry']);
      let choices = 0;
      while (!scene.battleView().state.result && choices < 9) {
        const view = scene.battleView();
        const id = view.state.tempo ? view.state.take ? 'playback' : 'expose'
          : view.intent.kind === 'broadcast' ? 'monitor' : view.intent.kind === 'overload' ? 'hold' : 'expose';
        chooseAction(scene, id);
        commitVisibleLesson(scene, input);
        settleScene(scene);
        choices++;
      }
      assert.equal(scene.battleView().state.result?.result, 'win', `${difficulty.id}/${input}: normal damage earned the win`);
      assert.ok(choices >= 2 && choices <= 8);
    } finally { scene.exit(); }
  }
});

test('the real reaction scene offers two safe misses then an ungated finish, not an automatic result', () => {
  const scene = makeCombatScene({ battle: trainingCombatBattle(), director: createCombatTutorialDirector(),
    difficulty: COMBAT_RULES['dead-air'], skipOpening: true });
  scene.enter();
  try {
    let parryAttempts = 0;
    for (let i = 0; i < 9 && scene.battleView().tutorial.id !== 'free'; i++) {
      if (scene.battleView().tutorial.id === 'parry') parryAttempts++;
      commitVisibleLesson(scene);
      settleScene(scene);
    }
    assert.equal(parryAttempts, 2);
    assert.equal(scene.battleView().tutorial.id, 'free');
    assert.equal(scene.battleView().state.result, null);
    assert.ok(scene.battleView().state.composure > 0);
    const before = scene.battleView().state.actionLog.length;
    scene.update(120);
    assert.equal(scene.battleView().state.actionLog.length, before);
    assert.ok(scene.battleView().moves.some(move => move.enabled));
  } finally { scene.exit(); }
});
