import test from 'node:test';
import assert from 'node:assert/strict';
import { cathedralBellCombatDefinition } from '../src/data/combat-definitions.js';
import {
  COMBAT_ACTION as A, TECHNIQUE, availableCombatActions, combatContinuationSnapshot,
  createCombatState, currentCombatIntent, predictedCombatIntent, reduceCombat, advanceEnemy,
  combatResult, runCombatTurn,
} from '../src/game/combat-state.js';
import { combatCheckpointSnapshot, normalizeCombatCheckpoint, restoreCombatCheckpoint, cathedralRetryCheckpoint } from '../src/game/combat-checkpoint.js';
import { makeCombatScene, combatChoiceSeconds, cathedralCombatLayout } from '../src/game/combat.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';

const noop = () => {};
const copy = (value) => JSON.parse(JSON.stringify(value));
const answer = { broadcast: A.MONITOR, overload: A.HOLD, conceal: A.EXPOSE, loop: A.MONITOR };
const basic = { torch: true, recorder: true };

function oneIntent(kind, phase = 1) {
  const definition = cathedralBellCombatDefinition({ phase });
  const intent = definition.movements.flatMap((movement) => movement.intents).find((entry) => entry.kind === kind);
  const broadcast = definition.movements.flatMap((movement) => movement.intents).find((entry) => entry.kind === 'broadcast');
  definition.movements = [{ id: 'test-return', title: 'TEST RETURN', coherence: 100, intents: kind === 'broadcast' ? [intent] : [intent, broadcast], before: [], after: [] }];
  definition.music = { mode: 'fixed', lead: 'lead-1' };
  definition.pinnedCycle = true;
  return definition;
}

test('Cathedral has its own objective and truthful reads, without Source channels or signature', () => {
  for (const phase of [1, 2]) {
    const definition = cathedralBellCombatDefinition({ phase });
    const state = createCombatState(definition, { difficulty: COMBAT_RULES.severe, source: { rescueEligible: true }, seed: 67 });
    assert.equal(definition.kind, 'cathedral');
    assert.ok(definition.objective);
    assert.equal(definition.signature, undefined);
    assert.equal(state.source, null);
    assert.equal(state.misread, null);
    assert.deepEqual(predictedCombatIntent(state), currentCombatIntent(state));
  }
});

test('each basic Cathedral counter prevents the whole blow, including loops, on every difficulty', () => {
  for (const difficulty of ['guided', 'standard', 'severe', 'dead-air']) for (const phase of [1, 2]) for (const kind of Object.keys(answer)) {
    let state = createCombatState(oneIntent(kind, phase), { difficulty: COMBAT_RULES[difficulty], tools: basic, seed: 41 });
    const before = state.composure;
    state = reduceCombat(state, { type: answer[kind], replaceTake: true });
    assert.equal(state.last.perfect, true, `${difficulty}/${phase}/${kind} was not a counter`);
    state = advanceEnemy(state);
    assert.equal(state.composure, before, `${difficulty}/${phase}/${kind} leaked damage`);
    assert.equal(state.last.received, 0);
    if (kind === 'loop') assert.ok(state.take, 'the basic recorder cannot capture the loop');
  }
  const ordinary = oneIntent('broadcast');
  ordinary.kind = 'regular';
  let state = createCombatState(ordinary, { tools: basic });
  const before = state.composure;
  state = runCombatTurn(state, { type: A.MONITOR });
  assert.ok(state.composure < before, 'the existing ordinary counter balance changed');
});

test('the optional reference gives one safe playback without another charge or a repeat grant', () => {
  const definition = oneIntent('overload');
  definition.openingTake = cathedralBellCombatDefinition({ personalOpening: true }).openingTake;
  let state = createCombatState(definition, { tools: basic, techniques: [TECHNIQUE.MULTITRACK] });
  assert.equal(state.charge, createCombatState(oneIntent('overload')).charge);
  assert.equal(availableCombatActions(state).find((move) => move.id === A.PLAYBACK).perfect, true);
  const composure = state.composure;
  state = runCombatTurn(state, { type: A.PLAYBACK });
  assert.equal(state.composure, composure);
  assert.equal(state.openingReferenceUsed, true);
  assert.ok(state.take, 'the explicit multitrack technique should retain its usual residue');
  assert.equal(availableCombatActions(state).find((move) => move.id === A.PLAYBACK).perfect, false, 'the residual reference granted another safe answer');
  const restored = restoreCombatCheckpoint(definition, copy(combatCheckpointSnapshot(state))).state;
  assert.equal(restored.openingReferenceUsed, true);
  const second = createCombatState(cathedralBellCombatDefinition({ phase: 2, personalOpening: true }), { tools: basic, continuation: combatContinuationSnapshot(state) });
  assert.equal(second.openingReferenceUsed, true);
  assert.notEqual(second.take?.id, 'cathedral:contractor-reference');
});

test('a basic torch and recorder can finish both phases by reading their counters', () => {
  for (const difficulty of ['guided', 'standard', 'severe', 'dead-air']) for (let seed = 1; seed <= 24; seed += 1) {
    let continuation = null;
    for (const phase of [1, 2]) {
      let state = createCombatState(cathedralBellCombatDefinition({ phase }), { difficulty: COMBAT_RULES[difficulty], seed, tools: basic, continuation, battery: 0, composure: 20 });
      const opening = state.composure;
      for (let guard = 0; !state.result && guard < 120; guard += 1) {
        const action = state.tempo ? state.take ? A.PLAYBACK : A.EXPOSE : answer[predictedCombatIntent(state).kind];
        state = runCombatTurn(state, { type: action, replaceTake: true });
      }
      assert.equal(state.result?.result, 'win', `${difficulty}/${seed}/${phase} did not finish`);
      assert.equal(state.composure, opening, `${difficulty}/${seed}/${phase} correct answers lost composure`);
      continuation = combatResult(state).continuation;
    }
  }
});

test('phase two carries spent composure once and keeps the same ceiling', () => {
  let state = createCombatState(cathedralBellCombatDefinition(), { difficulty: COMBAT_RULES.guided, injuries: 1, composure: 27 });
  state = runCombatTurn(state, { type: A.EXPOSE });
  const continuation = combatContinuationSnapshot(state);
  const second = createCombatState(cathedralBellCombatDefinition({ phase: 2, carriedDamage: 30 }), { difficulty: COMBAT_RULES.guided, injuries: 4, continuation });
  assert.equal(second.maxComposure, state.maxComposure);
  assert.equal(second.composure, state.composure);
  const retry = cathedralRetryCheckpoint(combatCheckpointSnapshot(second), { composure: second.maxComposure, battery: .35 });
  assert.equal(retry.state.composure, state.maxComposure);
  assert.equal(retry.state.battery, .35);
});

test('Guided Cathedral choices are untimed; other fights retain their clocks', () => {
  assert.equal(combatChoiceSeconds(createCombatState(cathedralBellCombatDefinition(), { difficulty: COMBAT_RULES.guided })), null);
  const standard = createCombatState(cathedralBellCombatDefinition(), { difficulty: COMBAT_RULES.standard });
  assert.ok(combatChoiceSeconds(standard) >= 5);
  standard.definition.kind = 'regular'; standard.difficulty.guidance = 'full';
  assert.ok(combatChoiceSeconds(standard) >= 5);
  for (const size of [{ cols: 100, rows: 45 }, { cols: 60, rows: 30 }]) {
    const layout = cathedralCombatLayout(size);
    assert.ok(layout.world.h >= size.rows * .4, 'commands consume the cathedral view');
    assert.ok(layout.y >= layout.world.y + layout.world.h);
  }
});

test('JSON checkpoints preserve resources, committed action and deterministic next resolution', () => {
  const definition = cathedralBellCombatDefinition({ phase: 2 });
  let state = createCombatState(definition, { difficulty: COMBAT_RULES.severe, tools: basic, seed: 311, battery: .42, composure: 28 });
  state = reduceCombat(state, { type: A.MONITOR });
  const checkpoint = copy(combatCheckpointSnapshot(state, { phase: 'tool', selectedTool: 2, selectedMove: 1 }));
  const restored = restoreCombatCheckpoint(definition, checkpoint);
  assert.deepEqual(restored.state, state);
  assert.deepEqual(advanceEnemy(restored.state), advanceEnemy(state));
  const corrupt = copy(checkpoint); corrupt.state.battery = -1;
  assert.equal(normalizeCombatCheckpoint(corrupt), null);
  assert.equal(restoreCombatCheckpoint(cathedralBellCombatDefinition(), checkpoint), null);
  const retry = cathedralRetryCheckpoint(checkpoint, { composure: 40, battery: .35 });
  assert.equal(retry.state.movementIndex, state.movementIndex);
  assert.equal(retry.state.movementCoherence, state.movementCoherence);
  assert.equal(retry.state.phase, 'select');
  assert.equal(retry.state.pendingEnemy, null);
  assert.equal(retry.state.result, null);
  assert.equal(retry.scene.resolution, null);
  assert.deepEqual(retry.state.actionLog, state.actionLog);
});

function harness({ definition = cathedralBellCombatDefinition(), checkpoint = null, difficulty = 'standard', techniques = [] } = {}) {
  const completed = [], checkpoints = [], impacts = [], batterySpend = [];
  const battle = { id: definition.id, enemy: definition.enemy, combat: definition, intro: [], win: [], lose: [] };
  const scene = makeCombatScene({ battle, checkpoint, difficulty: COMBAT_RULES[difficulty], skipOpening: true,
    loadout: { tools: basic, composure: 40, techniques }, getAudio: () => null,
    fx: { stopCues: noop, flash: noop, cue: noop, glitch: noop, shake: noop },
    audio: { stopTyping: noop, menuMove: noop, menuConfirm: noop },
    resources: { playImpact: (event) => impacts.push(event), playTool: noop, spendBattery: (amount) => batterySpend.push(amount) },
    onMovementCompleted: (event) => completed.push(event), onCheckpoint: (event) => checkpoints.push(copy(event)),
  });
  scene.enter();
  return { scene, completed, checkpoints, impacts, batterySpend };
}
function press(scene, key) { scene.key({ key }); scene.keyup({ key }); }
function choose(scene, id) {
  assert.equal(scene.battleView().phase, 'tool');
  const tool = scene.battleView().tools.findIndex((entry) => entry.moves.includes(id));
  assert.ok(tool >= 0, `no tool for ${id}`);
  for (let n = 0; scene.battleView().selectedTool !== tool && n < 12; n += 1) press(scene, 'ArrowRight');
  press(scene, 'ArrowDown');
  const move = scene.battleView().moves.findIndex((entry) => entry.id === id);
  for (let n = 0; scene.battleView().selectedMove !== move && n < 16; n += 1) press(scene, 'ArrowRight');
  press(scene, 'Enter');
}
function until(scene, predicate) {
  for (let index = 0; index < 200 && !predicate(scene.battleView()); index += 1) scene.update(.04);
  assert.ok(predicate(scene.battleView()), `stuck in ${scene.battleView().phase}`);
}

test('actual scene restores a player resolution without repeating the action or resource spend', () => {
  const h = harness({ techniques: [TECHNIQUE.WHITEOUT] });
  try {
    choose(h.scene, A.WHITEOUT);
    assert.ok(h.batterySpend[0] > 0, 'the test did not spend an external resource');
    h.scene.update(.12);
    const saved = copy(h.scene.battleView().checkpoint);
    const loaded = harness({ checkpoint: saved });
    try {
      const view = loaded.scene.battleView();
      assert.equal(view.phase, 'resolve');
      assert.equal(view.resolution.side, 'player');
      assert.equal(view.resolution.elapsed, saved.scene.resolution.elapsed);
      assert.deepEqual(view.state, saved.state);
      until(h.scene, (entry) => entry.phase === 'tool');
      until(loaded.scene, (entry) => entry.phase === 'tool');
      assert.deepEqual(loaded.scene.battleView().state, h.scene.battleView().state);
      assert.equal(loaded.scene.battleView().state.actionLog.filter((entry) => entry.action === A.WHITEOUT).length, 1);
      assert.equal(h.batterySpend.length, 1);
      assert.equal(loaded.batterySpend.length, 0, 'reload charged the torch again');
    } finally { loaded.scene.exit(); }
  } finally { h.scene.exit(); }
});

test('actual scene restores an enemy resolution with its parry window and applies the blow once', () => {
  const h = harness({ definition: oneIntent('broadcast') });
  try {
    choose(h.scene, A.EXPOSE);
    until(h.scene, (view) => view.resolution?.side === 'enemy');
    h.scene.update(.3);
    const saved = copy(h.scene.battleView().checkpoint);
    const loaded = harness({ definition: oneIntent('broadcast'), checkpoint: saved });
    try {
      const view = loaded.scene.battleView();
      assert.equal(view.resolution.side, 'enemy');
      assert.ok(view.resolution.parry, 'no parry window was restored');
      assert.deepEqual(view.resolution.parry, h.scene.battleView().resolution.parry);
      assert.deepEqual(view.state, saved.state);
      until(loaded.scene, (entry) => entry.phase === 'tool');
      until(h.scene, (entry) => entry.phase === 'tool');
      assert.deepEqual(loaded.scene.battleView().state, h.scene.battleView().state);
      assert.equal(loaded.scene.battleView().state.actionLog.filter((entry) => entry.action === 'enemy').length, 1);
    } finally { loaded.scene.exit(); }
  } finally { h.scene.exit(); }
});

test('a restored enemy blow can still be parried at its saved contact time', () => {
  const definition = oneIntent('broadcast');
  const h = harness({ definition });
  try {
    choose(h.scene, A.EXPOSE);
    until(h.scene, (view) => view.resolution?.side === 'enemy');
    until(h.scene, (view) => view.resolution?.parry?.armed && view.resolution.parry.tier === 'perfect');
    const saved = copy(h.scene.battleView().checkpoint);
    const loaded = harness({ definition, checkpoint: saved });
    try {
      assert.equal(loaded.scene.battleView().resolution.parry.armed, true);
      press(h.scene, ' '); press(loaded.scene, ' ');
      assert.equal(loaded.scene.battleView().state.last.parryTier, 'perfect');
      assert.equal(loaded.scene.battleView().state.composure, 40);
      until(loaded.scene, (view) => view.phase === 'tool');
      until(h.scene, (view) => view.phase === 'tool');
      assert.deepEqual(loaded.scene.battleView().state, h.scene.battleView().state);
    } finally { loaded.scene.exit(); }
  } finally { h.scene.exit(); }
});

test('normal and final movement completion reach the world callback once, including reload', () => {
  const definition = cathedralBellCombatDefinition();
  definition.movements.forEach((movement) => { movement.coherence = 1; movement.before = []; movement.after = []; });
  const h = harness({ definition });
  try {
    choose(h.scene, A.EXPOSE);
    until(h.scene, (view) => view.phase === 'tool' && view.state.movementIndex === 1);
    assert.deepEqual(h.completed.map((entry) => entry.id), [definition.movements[0].id]);
    const saved = copy(h.scene.battleView().checkpoint);
    const loaded = harness({ definition, checkpoint: saved });
    try {
      assert.equal(loaded.completed.length, 0, 'reload repeated an acknowledged world break');
      choose(loaded.scene, A.EXPOSE);
      until(loaded.scene, () => loaded.completed.length === 1);
      assert.equal(loaded.completed[0].id, definition.movements[1].id);
      assert.equal(loaded.completed[0].cathedralPhase, 1);
      for (let n = 0; n < 8; n += 1) loaded.scene.update(.1);
      assert.equal(loaded.completed.length, 1);
    } finally { loaded.scene.exit(); }
  } finally { h.scene.exit(); }
});
