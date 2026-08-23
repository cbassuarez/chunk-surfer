import assert from 'node:assert/strict';
import { SOURCE_PAGES } from '../src/data/source-pages.js';
import {
  SOURCE_DIALOGUE_LIMITS,
  assignSourceDialoguePage,
  freshSourceDialogueState,
  sourceDialogueMetrics,
} from '../src/game/source-dialogue.js';

function syntheticFacts(seed) {
  return {
    ...(seed % 2 === 0 ? { turnedBackInSearch: true } : {}),
    ...(seed % 3 === 0 ? { stoodStillUnderPressure: true } : {}),
    ...(seed % 4 !== 0 ? { rainStarted: true } : {}),
    ...(seed % 5 === 0 ? { spoiledRecording: true, retakes: seed % 10 === 0 ? 'many' : 'few' } : {}),
    ...(seed % 7 === 0 ? { approachedStillPage: true } : {}),
    ...(seed % 29 === 0 ? { approachedStillPage: true, approachedThenRetreated: true } : {}),
  };
}

let impossibleRuns = 0;
let ventriloquialRuns = 0;
let ordinaryAfterTen = 0;
for (let seed = 1; seed <= 10_000; seed += 1) {
  let state = freshSourceDialogueState({ seed, facts: syntheticFacts(seed) });
  for (let read = 0; read < 18; read += 1) {
    const selected = assignSourceDialoguePage(state, SOURCE_PAGES, { sheetId: `sim-${seed}-${read}`, hallStage: 4 });
    assert.ok(selected.page, `seed ${seed} read ${read}: selector dead-ended`);
    state = selected.state;
  }
  const m = sourceDialogueMetrics(state);
  assert.ok(m.maxHighRun <= SOURCE_DIALOGUE_LIMITS.maxHighLoadConsecutive, `seed ${seed}: high-load run exceeded limit`);
  assert.ok(m.contingent <= SOURCE_DIALOGUE_LIMITS.maxContingent, `seed ${seed}: contingent scarcity failed`);
  assert.ok(m.impossible <= SOURCE_DIALOGUE_LIMITS.maxImpossible, `seed ${seed}: impossible scarcity failed`);
  assert.ok(m.ventriloquial <= SOURCE_DIALOGUE_LIMITS.maxVentriloquial, `seed ${seed}: ventriloquism repeated`);
  assert.ok(m.activeThreads <= SOURCE_DIALOGUE_LIMITS.maxActiveThreads, `seed ${seed}: too many active dialogue threads`);

  // Every rupture >= .75 must encounter a <= .25 recovery within the next two
  // assigned reads whenever those reads exist.
  for (let i = 0; i < state.history.length; i += 1) {
    if (state.history[i].dialogicLoad < SOURCE_DIALOGUE_LIMITS.ruptureLoad || i + 2 >= state.history.length) continue;
    assert.ok(state.history.slice(i + 1, i + 3).some((entry) => entry.dialogicLoad <= SOURCE_DIALOGUE_LIMITS.recoveryLoad),
      `seed ${seed}: rupture at ${i} had no ordinary recovery`);
  }

  impossibleRuns += m.impossible > 0 ? 1 : 0;
  ventriloquialRuns += m.ventriloquial > 0 ? 1 : 0;
  ordinaryAfterTen += state.history.slice(10).some((entry) => entry.dialogicLoad <= .18) ? 1 : 0;
}

// These are guardrails, not claims about empirical player response. They make
// sure the rare effects remain rare while late sequences still contain plain
// paperwork often enough for sameness to remain camouflage.
assert.ok(impossibleRuns / 10_000 < 0.08, `impossible assimilation overexposed: ${impossibleRuns}/10000`);
assert.ok(ventriloquialRuns / 10_000 < 0.12, `ventriloquism overexposed: ${ventriloquialRuns}/10000`);
assert.ok(ordinaryAfterTen / 10_000 > 0.55, `late ordinary camouflage too scarce: ${ordinaryAfterTen}/10000`);

console.log(`source dialogue simulation specs passed (10000 histories; impossible=${impossibleRuns}, ventriloquial=${ventriloquialRuns})`);
