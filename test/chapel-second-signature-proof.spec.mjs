import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import {
  COMBAT_ACTION as A, advanceEnemy, availableCombatActions, combatResult,
  createCombatState, currentCombatIntent, predictedCombatIntent, reduceCombat,
} from '../src/game/combat-state.js';
import { attachCombatDefinition } from '../src/data/combat-definitions.js';
import { availableBattleTools, COMBAT_TOP_CAPACITY } from '../src/game/combat-loadout.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import { canQualifyBorrowedRecordist, deriveStoryEvidence } from '../src/game/story-evidence.js';
import { sourceContactDialogue } from '../src/game/source-contact.js';

// Exercise the unmodified production boss from its first movement. These are
// supplied player actions, not an ordinary world playthrough, and there are no
// injected proofs, starting phases, outcomes, resource refills or techniques.
const definition = attachCombatDefinition({ id: 'chapel', enemy: 'chapel', rounds: [] }).combat;
const top = ['light', 'recorder', 'interface', 'tuning-fork'];
const order = availableBattleTools({ top }, top.map(id => ({ id, present: true })));
const tools = { ...Object.fromEntries(['torch', 'recorder', 'rig', 'fork', 'radio', 'coffee']
  .map(id => [id, order.includes(id)])), order };
const counters = { broadcast: A.MONITOR, overload: A.HOLD, conceal: A.EXPOSE, loop: A.INVERT, silence: A.EXPOSE };

function play({ preset = 'standard', injuries = 0, seed = 42, omitSourcePlayback = false } = {}) {
  let state = createCombatState(definition, { tools, composure: 20, injuries, battery: 0,
    seed, difficulty: COMBAT_RULES[preset] });
  const actions = [], earned = [];
  for (let guard = 0; !state.result && guard < 300; guard++) {
    const available = availableCombatActions(state).filter(move => move.enabled);
    const can = id => available.some(move => move.id === id);
    const intent = predictedCombatIntent(state), movement = state.definition.movements[state.movementIndex];
    let id;
    if (!omitSourcePlayback && movement.id === 'source' && state.take?.tag === 'body'
      && !state.proofs.includes('return.source') && can(A.PLAYBACK)) id = A.PLAYBACK;
    else if (can(A.TUNE)) id = A.TUNE;
    else if (state.composure <= state.maxComposure * .5 && can(A.COMPOSE)) id = A.COMPOSE;
    else id = [counters[intent?.kind], ...(omitSourcePlayback && movement.id === 'source' ? [] : [A.PLAYBACK]),
      A.EXPOSE, A.MONITOR, A.HOLD].find(can) || A.WAIT;
    assert.ok(can(id), `an actual available action is required: ${id}`);
    const before = state;
    state = reduceCombat(state, { type: id, replaceTake: true });
    const record = { index: actions.length, movement: movement.id, intent: currentCombatIntent(before)?.id,
      intentKind: intent?.kind, action: id, replacementConfirmed: !!before.take && id === A.MONITOR,
      perfect: !!state.last?.perfect, takeBefore: before.take?.tag || null, takeAfter: state.take?.tag || null,
      composureBefore: before.composure, composureAfter: state.composure,
      proofs: state.proofs.filter(proof => !before.proofs.includes(proof)) };
    if (record.proofs.length) earned.push(record);
    actions.push(record);
    for (let actor = 0; state.phase === 'enemy' && !state.result && actor < 4; actor++) state = advanceEnemy(state);
  }
  assert.ok(state.result, 'the actual combat progression must finish');
  return { state, metrics: combatResult(state), actions, earned };
}

function releaseFrom(metrics, overrides = {}) {
  return canQualifyBorrowedRecordist({ hasRig: true, hasFork: true,
    chapelReturnGranted: metrics.finale.grants.includes('route.surfaced'),
    chapelReturnLocked: metrics.finale.locks.includes('route.surfaced'), ...overrides });
}

test('real Chapel counter and body playback earn release with a legal four-slot kit, including wounded arrivals', () => {
  assert.equal(top.length, COMBAT_TOP_CAPACITY);
  assert.equal(tools.radio, false); assert.equal(tools.coffee, false);
  for (const preset of ['guided', 'standard']) for (const injuries of [0, 2, 4]) for (const seed of [0, 1, 2, 3, 11, 42, 31337, 2130706433]) {
    const proof = play({ preset, injuries, seed });
    assert.equal(proof.metrics.result, 'win', `${preset}/${injuries}/${seed}`);
    assert.equal(releaseFrom(proof.metrics), true, `${preset}/${injuries}/${seed}`);
    const human = proof.earned.find(row => row.proofs.includes('return.recordist'));
    const source = proof.earned.find(row => row.proofs.includes('return.source'));
    assert.equal(human?.movement, 'recordist'); assert.equal(human?.action, A.MONITOR);
    assert.equal(human?.intentKind, 'broadcast'); assert.equal(human?.perfect, true);
    assert.equal(source?.movement, 'source'); assert.equal(source?.action, A.PLAYBACK);
    assert.equal(source?.takeBefore, 'body');
    assert.equal(proof.actions.some(row => row.action === A.PARRY), false, 'a frame-perfect reaction is not a hidden release requirement');
  }
});

test('winning while omitting the body playback does not qualify, even with every document and obsolete Source rescue flags', () => {
  const proof = play({ omitSourcePlayback: true });
  assert.equal(proof.metrics.result, 'win');
  assert.ok(proof.state.proofs.includes('return.recordist'));
  assert.equal(proof.state.proofs.includes('return.source'), false);
  assert.equal(releaseFrom(proof.metrics), false);
  const ledger = { documentsRead: ['faculty-reference-requirement', 'student-monitoring-notes',
    'pre-roll-analysis', 'work-order-carbon', 'page-9'] };
  assert.equal(deriveStoryEvidence(ledger).strongestRouteEvidence, true);
  assert.equal(canQualifyBorrowedRecordist({ ledger, hasRig: true, hasFork: true,
    bodyRedacted: true, bestEligible: true }), false);
});

test('the earned release still requires both physical instruments and an unlocked Chapel return', () => {
  const proof = play();
  for (const override of [{ hasRig: false }, { hasFork: false }, { chapelReturnGranted: false },
    { chapelReturnLocked: true }, { hasRig: 'true' }, { chapelReturnGranted: 1 }, { chapelReturnLocked: null }])
    assert.equal(releaseFrom(proof.metrics, override), false, JSON.stringify(override));
  assert.equal(canQualifyBorrowedRecordist(), false);
});

test('the early human-reference clue stays optional and gives neither a name nor a mechanical release', () => {
  const dialogue = sourceContactDialogue(null, { chapter: 'I' });
  const early = dialogue['identity-smaller'].lines.find(line => line.id === 'identity-smaller.line.5');
  const later = dialogue['consent-return'].lines.find(line => line.id === 'consent-return.line.6');
  assert.equal(early.who, 'hands'); assert.match(early.text, /does not get to answer for both/);
  assert.equal(later.who, 'me'); assert.match(later.text, /answer for himself/);
  assert.doesNotMatch(`${early.text} ${later.text}`, /Alan|Sarah|Lyle|HUSH|you must|three fights/i);
  assert.equal(canQualifyBorrowedRecordist({ hasRig: true, hasFork: true }), false);
});

if (process.env.CHAPEL_PROOF_EVIDENCE) {
  const proof = play({ injuries: 2 });
  writeFileSync(process.env.CHAPEL_PROOF_EVIDENCE, JSON.stringify({
    kind: 'production-chapel-action-policy', evidenceTier: 'focused-production-state-sequence',
    ordinaryPlay: false, limits: 'Actual production definition and combat reducer with supplied player actions. No browser, world traversal, audio or physical release is proved.',
    kit: top, initial: { composure: 20, injuries: 2, battery: 0, seed: 42, preset: 'standard', techniques: [] },
    result: proof.metrics.result, grantedRelease: releaseFrom(proof.metrics), metrics: proof.metrics,
    earned: proof.earned, actions: proof.actions,
  }, null, 2) + '\n');
}
