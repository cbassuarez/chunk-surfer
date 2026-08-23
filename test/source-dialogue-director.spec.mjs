import assert from 'node:assert/strict';
import { SOURCE_PAGES } from '../src/data/source-pages.js';
import {
  SOURCE_DIALOGUE_FACT,
  SOURCE_DIALOGUE_LIMITS,
  assignSourceDialoguePage,
  freshSourceDialogueState,
  normalizeSourceDialogueState,
  recordSourceDialogueFact,
  sourceDialogueFactEligible,
  sourceDialogueMetrics,
  sourceWrongPageBucket,
} from '../src/game/source-dialogue.js';

function read(state, id, hallStage = 4) {
  return assignSourceDialoguePage(state, SOURCE_PAGES, { sheetId: id, hallStage });
}

// Same physical paper, same authored note forever — including after JSON save/load.
{
  const first = read(freshSourceDialogueState({ seed: 4417 }), 'source-sheet-81', 4);
  assert.ok(first.page);
  assert.equal(first.assigned, true);
  const restored = normalizeSourceDialogueState(JSON.parse(JSON.stringify(first.state)));
  const second = read(restored, 'source-sheet-81', 4);
  assert.equal(second.page.id, first.page.id);
  assert.equal(second.assigned, false);
  assert.equal(second.state.readCount, first.state.readCount, 're-reading a sheet advanced exposure');
}

// Selection is deterministic for equivalent history, not Math.random-driven.
{
  const a = read(freshSourceDialogueState({ seed: 8877 }), 'source-sheet-17', 2);
  const b = read(freshSourceDialogueState({ seed: 8877 }), 'source-sheet-17', 2);
  assert.equal(a.page.id, b.page.id);
}

// Local facts have latency. A note cannot visibly answer the input that just made it eligible.
{
  let state = freshSourceDialogueState({ seed: 99 });
  state = recordSourceDialogueFact(state, SOURCE_DIALOGUE_FACT.APPROACHED_THEN_RETREATED, true, {
    latencyReads: SOURCE_DIALOGUE_LIMITS.localFactLatencyReads,
  });
  assert.equal(sourceDialogueFactEligible(state, SOURCE_DIALOGUE_FACT.APPROACHED_THEN_RETREATED), false);
  for (let i = 0; i < SOURCE_DIALOGUE_LIMITS.localFactLatencyReads; i += 1) state = read(state, `latency-${i}`, 4).state;
  assert.equal(sourceDialogueFactEligible(state, SOURCE_DIALOGUE_FACT.APPROACHED_THEN_RETREATED), true);
}

assert.equal(sourceWrongPageBucket(1), 'few');
assert.equal(sourceWrongPageBucket(6), 'several');
assert.equal(sourceWrongPageBucket(12), 'many');

// Adaptation never fabricates a required event. Over many late reads with no
// facts, every selected contingent/impossible page must therefore be absent.
{
  let state = freshSourceDialogueState({ seed: 731 });
  for (let i = 0; i < 40; i += 1) state = read(state, `no-facts-${i}`, 4).state;
  const pages = state.history.map((entry) => SOURCE_PAGES.find((page) => page.id === entry.id));
  assert.ok(pages.every((page) => !['contingent', 'impossible'].includes(page.adaptationTier)));
}

// With every semantic fact available, scarcity rules remain absolute.
{
  let state = freshSourceDialogueState({ seed: 1234, facts: {
    turnedBackInSearch: true,
    stoodStillUnderPressure: true,
    rainStarted: true,
    spoiledRecording: true,
    retakes: 'many',
    approachedStillPage: true,
    approachedThenRetreated: true,
  } });
  for (let i = 0; i < 60; i += 1) state = read(state, `all-facts-${i}`, 4).state;
  const m = sourceDialogueMetrics(state);
  assert.ok(m.contingent <= SOURCE_DIALOGUE_LIMITS.maxContingent);
  assert.ok(m.impossible <= SOURCE_DIALOGUE_LIMITS.maxImpossible);
  assert.ok(m.ventriloquial <= SOURCE_DIALOGUE_LIMITS.maxVentriloquial);
  assert.ok(m.activeThreads <= SOURCE_DIALOGUE_LIMITS.maxActiveThreads);
  assert.ok(m.maxHighRun <= SOURCE_DIALOGUE_LIMITS.maxHighLoadConsecutive);
}

console.log('source dialogue director specs passed');
