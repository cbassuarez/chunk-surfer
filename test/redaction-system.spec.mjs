// Historical filename retained by the test runner. These assertions prove the
// old word-redaction runtime has been replaced by deterministic signal combat.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

import {
  COMBAT_ACTION,
  combatResult,
  advanceEnemy,
  createCombatState,
  currentCombatIntent,
  reduceCombat,
  validateCombatDefinition,
} from '../src/game/combat-state.js';
import { runtimeBattle } from '../src/narrative/runtime-content.js';
import { validateNarrativeDocument } from '../src/narrative/contracts.js';
import { endingChoice } from '../src/data/conservatory-script.js';
import { readFileSync } from 'node:fs';
import { GRID } from '../src/game/combat-damage.js';

test('all 4 authored battle documents use combat metadata and contain no redaction challenges', async () => {
  const files = (await readdir('content/narrative')).filter((name) => /^battle\..*\.story\.json$/.test(name));
  // Four, not thirteen. One per fight: the chapel's seven near-identical
  // documents became one tree with the confession as a conditioned thread, and
  // the three rooms' named/unnamed pairs — which differed by five lines in
  // total — became one tree each, with the naming and the occasion as threads.
  assert.equal(files.length, 4, `expected one document per fight, got: ${files.join(', ')}`);
  for (const name of files) {
    const document = JSON.parse(await readFile(`content/narrative/${name}`, 'utf8'));
    assert.ok(document.metadata.combat?.movements?.length, name);
    assert.ok(document.metadata.combat?.music, `${name} declares its battle-score identity`);
    assert.equal(validateNarrativeDocument(document).ok, true, `${name} passes authoring validation`);
    assert.equal('challenges' in document.metadata, false, name);
    assert.equal('health' in document.metadata, false, name);
  }
});

test('authoring validation rejects incomplete battle-score identities', async () => {
  const document = JSON.parse(await readFile('content/narrative/battle.natatorium.story.json', 'utf8'));
  document.metadata.combat.music = { mode: 'movement', movementLeads: ['lead-1'] };
  const result = validateNarrativeDocument(document);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.path === 'metadata.combat.music.movementLeads'));
});

test('every runtime encounter validates under one deterministic combat contract', () => {
  for (const id of [
    'battle.natatorium', 'battle.practice', 'battle.hall', 'battle.chapel',
  ]) {
    const battle = runtimeBattle(id);
    assert.deepEqual(validateCombatDefinition(battle.combat), [], id);
    assert.ok(battle.combat.music, `${id} preserves music metadata at runtime`);
  }
});

// Point the opponent at a particular blow.
//
// The proofs are earned against specific intents — a broadcast in the
// recordist's movement, the loop in the contract's — and the opponent CHOOSES
// its blow now rather than counting through a list. So a scripted proof walk has
// to name what it wants instead of assuming a cycle position will land on it.
function aimAt(state, intentId) {
  const movement = state.definition.movements[state.movementIndex];
  const index = movement.intents.findIndex((intent) => intent.id === intentId);
  assert.ok(index >= 0, `${intentId} is in movement ${movement.id}`);
  state.intentIndex = index;
  state.committed = { id: intentId, index };
  state.misread = null;
  return state;
}

test('Chapel action proof can unlock both return and inversion without route-name choices', () => {
  // Coherence is padded well past the authored 4 so the walk can reach every
  // proof: the regulars all chip now — MONITOR for listening, HOLD for bracing
  // correctly — so a movement tuned for the real fight breaks long before a
  // scripted proof sequence finishes. This is a proof-reachability test, not a
  // balance one.
  const battle = runtimeBattle('battle.chapel');
  let state = createCombatState(battle.combat, { tools: { rig: true, fork: true }, battery: 1 });
  const enter = (index) => {
    state.movementIndex = index;
    state.movementCoherence = 10 * GRID; state.movementMaxCoherence = 10 * GRID;
    state.tempo = false; state.take = null;
  };
  // Proof behavior itself is authored by movement identity and the physical
  // tool action, not a separate dialogue answer.
  enter(1);
  aimAt(state, 'chapel:body');
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.ok(state.proofs.includes('return.recordist'));

  // The contract's loop, inverted with a take in hand.
  enter(3);
  aimAt(state, 'chapel:terms');
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  state = reduceCombat(state, { type: COMBAT_ACTION.END_TEMPO });
  aimAt(state, 'chapel:contract-loop');
  assert.equal(currentCombatIntent(state).kind, 'loop');
  state = reduceCombat(state, { type: COMBAT_ACTION.INVERT });
  assert.ok(state.proofs.includes('invert.contract'));

  // The source: a borrowed body played back, then the source loop turned.
  enter(4);
  aimAt(state, 'chapel:body-return');
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  state = reduceCombat(state, { type: COMBAT_ACTION.PLAYBACK });
  assert.ok(state.proofs.includes('return.source'));
  state.tempo = false;
  aimAt(state, 'chapel:release-take');
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR, replaceTake: true });
  state.tempo = false;
  aimAt(state, 'chapel:source-loop');
  state = reduceCombat(state, { type: COMBAT_ACTION.INVERT });
  assert.ok(state.proofs.includes('invert.source'), 'the last proof is earned before the fight is closed out');

  // Close the encounter out. The proofs are what this test is about; how many
  // beats the padded coherence takes to finish is not.
  for (let guard = 0; !state.result && guard < 60; guard += 1) {
    state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR, replaceTake: true });
    if (state.phase === 'enemy') state = advanceEnemy(state);
  }
  const result = combatResult(state);
  assert.ok(result.proofs.includes('invert.source'));
  assert.ok(result.finale.grants.includes('route.surfaced'));
  assert.ok(result.finale.grants.includes('route.inversion'));
});

test('finale choice tree consumes combat-derived route availability without exposing route names', () => {
  const full = endingChoice({
    hasRig: true,
    canInvert: true,
    canSurface: true,
    readings: [{ readingId: 'return.source', meaning: 'The body remains returnable.', text: 'BODY BORROWED RETURN' }],
    grants: ['route.inversion', 'route.surfaced'],
    sourceReading: { text: 'BODY BORROWED RETURN' },
  });
  const choiceText = full.start.choices.map((choice) => choice.text).join(' / ');
  assert.match(choiceText, /broken rig/);
  assert.match(choiceText, /borrowed body/);
  assert.doesNotMatch(choiceText, /SURFACED|INVERSION|SACRIFICE/);
});

test('surfaced ending and epilogue still acknowledge the recovered recordist', () => {
  // surfacedEnding() was a JS function in data/chunk-surf-script.js and is now an
  // authored document, so this reads the document. The guarantee is unchanged: the
  // source reading he came back with is interpolated into the ending, and the gate
  // scene counts two people.
  const doc = JSON.parse(readFileSync('content/narrative/ending.surfaced.story.json', 'utf8'));
  const lines = Object.values(doc.nodes).flatMap((node) => node.lines || []);
  assert.ok(lines.some((line) => /\{source\}/.test(line.text)),
    'the ending still quotes the source reading he came back with');
  assert.ok(lines.some((line) => /recordist/i.test(line.who)),
    'and the man being carried actually speaks in it');
  const coda = JSON.parse(readFileSync('content/narrative/ending.epilogue.surfaced.story.json', 'utf8'));
  const codaLines = Object.values(coda.nodes).flatMap((node) => node.lines || []);
  assert.ok(codaLines.some((line) => /Two of you/.test(line.text)), 'the gate counts two people');
});
