import test from 'node:test';
import assert from 'node:assert/strict';
import * as scenes from '../src/game/scenes.js';
import { createPracticeDrill, performPracticeMove, practiceDrillCue, PRACTICE_MOVES } from '../src/game/practice-drill.js';
import { makeCombatScene } from '../src/game/combat.js';
import { attachCombatDefinition } from '../src/data/combat-definitions.js';
import { compilePracticeCuePlan, createWindowChoreographyDirector } from '../src/platform/window-choreography.js';

import { validateWindowCompositionPlan } from '../src/platform/window-composition.js';
import { PRACTICE_REBUSES } from '../src/render/practice-rebus.js';

const battle = attachCombatDefinition({ id: 'practice', enemy: 'Practice room', rounds: [] });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('run seeds choose a stable, executable four-move phrase and 2–4 cycles', () => {
  const orders = new Set(), counts = new Set();
  for (let seed = 0; seed < 500; seed++) {
    const state = createPracticeDrill({ seed });
    assert.deepEqual(state, createPracticeDrill({ seed }));
    assert.deepEqual([...state.sequence].sort(), PRACTICE_MOVES.map(m => m.id).sort());
    assert.ok(state.sequence.indexOf('monitor') < state.sequence.indexOf('playback'));
    orders.add(state.sequence.join(',')); counts.add(state.cycles);
  }
  assert.ok(orders.size >= 8);
  assert.deepEqual([...counts].sort(), [2, 3, 4]);
});

test('the same exact phrase empties each health bar and wins after the last cycle', () => {
  for (let seed = 0; seed < 100; seed++) {
    let state = createPracticeDrill({ seed });
    const phrase = [...state.sequence], total = state.cycles;
    for (let cycle = 0; cycle < total; cycle++) {
      for (const [index, move] of phrase.entries()) {
        const cue = practiceDrillCue(state);
        assert.equal(cue.step, index + 1); assert.equal(cue.cycle, cycle + 1);
        assert.deepEqual(cue.parts, [`${move}:left`, `${move}:right`]);
        state = performPracticeMove(state, move);
        assert.ok(state.last.correct);
        if (move === 'monitor') assert.equal(state.loaded, true);
        if (move === 'playback') assert.equal(state.loaded, false);
      }
      assert.equal(state.cycle, cycle + 1);
      assert.deepEqual(state.sequence, phrase, 'a new cycle repeats the same moves');
      assert.equal(state.result, cycle === total - 1 ? 'win' : null);
    }
    assert.equal(state.turns, total * 4);
    assert.equal(practiceDrillCue(state), null);
    assert.strictEqual(performPracticeMove(state, phrase[0]), state);
  }
});

test('a mistake costs composure, preserves progress and repeats the same clue', () => {
  const before = createPracticeDrill({ seed: 6 });
  const wrong = PRACTICE_MOVES.find(m => m.id !== before.sequence[0]).id;
  let state = performPracticeMove(before, wrong);
  assert.equal(before.mistakes, 0, 'reducer preserves the prior state');
  assert.deepEqual(practiceDrillCue(state), practiceDrillCue(before));
  assert.equal(state.composure, before.composure - 5);
  assert.equal(state.step, 0);
  while (!state.result) state = performPracticeMove(state, wrong);
  assert.equal(state.result, 'lose'); assert.equal(state.composure, 0);
});

test('practice uses the new finite scene and a provided kit even with an empty bag', async () => {
  let shown = 0, closed = 0, won = 0;
  const scene = makeCombatScene({ battle, seed: 3,
    loadout: { tools: { torch: false, recorder: false } }, resources: { battery: 0 },
    practiceClues: { show: async () => { shown++; return { native: false }; }, close: () => closed++ },
    onWin: result => { won++; assert.equal(result.practice.completed, result.practice.cycles); },
  });
  scenes.push(scene); await flush();
  assert.equal(scene.battleView().actions.length, 4);
  assert.ok(scene.battleView().actions.every(m => m.enabled));
  const cue = scene.battleView().cue;
  scene.key({ key: '1', repeat: true });
  assert.deepEqual(scene.battleView().cue, cue);
  while (!scene.battleView().state.result) {
    const view = scene.battleView();
    const action = view.practice.sequence[view.practice.step];
    scene.key({ key: String(PRACTICE_MOVES.findIndex(m => m.id === action) + 1) });
    scene.update(.8); await flush();
  }
  scene.key({ key: 'Enter' }); await flush();
  assert.equal(won, 1); assert.equal(closed, 1);
  assert.equal(shown, scene.battleView().practice.cycles * 4);
  assert.equal(scenes.depth(), 0);
});

test('removing a practice scene cancels delayed clue readiness and closes its windows', async () => {
  let ready, closed = 0, aborted = 0;
  const scene = makeCombatScene({ battle,
    practiceClues: { show: () => new Promise(resolve => { ready = resolve; }), close: () => closed++ },
    onAbort: () => aborted++,
  });
  scenes.push(scene); scenes.remove(scene); ready({ native: true }); await flush();
  assert.equal(aborted, 1); assert.equal(closed, 1);
  assert.equal(scene.battleView().nativeClues, false);
});

test('resuming refreshes the current clue without advancing the exercise', async () => {
  const shown = [];
  const scene = makeCombatScene({ battle, practiceClues: {
    show: async cue => { shown.push(cue); return {native:true}; }, close: () => {},
  } });
  scenes.push(scene); await flush();
  const before = scene.battleView().practice;
  scenes.push({id:'pause'}); scenes.pop(); await flush();
  assert.equal(shown.length,2); assert.deepEqual(shown[0],shown[1]);
  assert.deepEqual(scene.battleView().practice,before);
  scenes.remove(scene); await flush();
});

test('losing closes the clues and reports defeat once without consuming real equipment', async () => {
  let closed = 0, lost = 0, spent = 0;
  const scene = makeCombatScene({ battle, loadout:{composure:5},
    resources:{battery:0,spendBattery:() => spent++,consumeItem:() => spent++},
    practiceClues:{show:async () => ({native:false}),close:() => closed++},
    onLose:result => {lost++; assert.equal(result.composure,0);},
  });
  scenes.push(scene); await flush();
  const view = scene.battleView();
  const wrong = PRACTICE_MOVES.findIndex(move => move.id !== view.practice.sequence[0]);
  scene.key({key:String(wrong + 1)}); scene.update(.8);
  scene.key({key:'Enter'}); scene.key({key:'Enter'}); await flush();
  assert.equal(lost,1); assert.equal(closed,1); assert.equal(spent,0);
  assert.equal(scenes.depth(),0);
});

test('rebus plans keep clues in two external windows, with two independent NVMe footage windows', async () => {
  let state = createPracticeDrill({ seed: 3 });
  for (const move of state.sequence) {
    const cue = practiceDrillCue(state), plan = compilePracticeCuePlan(cue,{clueTokens:['snapshot-left','snapshot-right']});
    assert.ok(validateWindowCompositionPlan(plan).ok);
    assert.equal(plan.surfaces.length, 4);
    assert.deepEqual(plan.surfaces.slice(0,2).map(p => p.content.token),['snapshot-left','snapshot-right']);
    assert.ok(plan.surfaces.slice(0,2).every(p => p.shader==='violet-dither'));
    assert.ok(plan.surfaces.slice(2).every(p => p.shader==='nvme-sector' && p.content.kind==='video'));
    assert.equal(plan.completion.mode,'nonblocking');
    state = performPracticeMove(state, move);
  }
  let calls = 0;
  const director = createWindowChoreographyDirector({ getEnabled: () => false, runtimeApi: { invoke: () => calls++ }, documentApi: null });
  const result = await director.showPracticeCue(practiceDrillCue(createPracticeDrill()));
  assert.equal(result.native, false); assert.equal(calls, 0, 'disabled windows stay in-game without requesting fullscreen exit');
});

test('each rebus requires naming and subtraction, and both remainders form exactly its move', () => {
  for (const [move,parts] of Object.entries(PRACTICE_REBUSES)) {
    const answer = parts.map(({word,remove}) => {
      for (const letter of remove) { assert.ok(word.includes(letter)); word=word.replace(letter,''); }
      return word;
    }).join('');
    assert.equal(answer,move.toUpperCase());
    assert.ok(parts.every(part => part.remove.length > 0 && part.word!==move.toUpperCase()));
  }
});

test('reduced motion and flash-off retain readable clue cards and the authored footage', () => {
  const options={clueTokens:['snapshot-left','snapshot-right'],epochMs:1000};
  const cue=practiceDrillCue(createPracticeDrill());
  const regular=compilePracticeCuePlan(cue,options);
  const reduced=compilePracticeCuePlan(cue,{...options,reducedMotion:true,flashMode:'off'});
  assert.deepEqual(regular.surfaces.map(p=>p.content),reduced.surfaces.map(p=>p.content));
  assert.equal(reduced.fault.flashMode,'off');
  assert.equal(reduced.formation.durationMs,0);
  assert.ok(reduced.fault.cadenceMs>regular.fault.cadenceMs);
});
