// Historical filename retained by the test runner. These assertions prove the
// old word-redaction runtime has been replaced by deterministic signal combat.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

import {
  COMBAT_ACTION,
  combatResult,
  createCombatState,
  currentCombatIntent,
  reduceCombat,
  validateCombatDefinition,
} from '../src/game/combat-state.js';
import { runtimeBattle } from '../src/narrative/runtime-content.js';
import { validateNarrativeDocument } from '../src/narrative/contracts.js';
import { endingChoice, guardEpilogue } from '../src/data/conservatory-script.js';
import { surfacedEnding } from '../src/data/chunk-surf-script.js';

test('all 13 authored battle documents use combat metadata and contain no redaction challenges', async () => {
  const files = (await readdir('content/narrative')).filter((name) => /^battle\..*\.story\.json$/.test(name));
  assert.equal(files.length, 13);
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
  const document = JSON.parse(await readFile('content/narrative/battle.natatoriumbattle.named.story.json', 'utf8'));
  document.metadata.combat.music = { mode: 'movement', movementLeads: ['lead-1'] };
  const result = validateNarrativeDocument(document);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.path === 'metadata.combat.music.movementLeads'));
});

test('every runtime encounter validates under one deterministic combat contract', () => {
  for (const id of [
    'battle.natatoriumbattle.named', 'battle.natatoriumbattle.unnamed',
    'battle.practicebattle.named', 'battle.practicebattle.unnamed',
    'battle.hallbattle.named', 'battle.hallbattle.unnamed',
    'battle.chapel.nothing', 'battle.chapel.name-sarah', 'battle.chapel.name-other',
    'battle.chapel.reason-money', 'battle.chapel.reason-superstition', 'battle.chapel.reason-other', 'battle.chapel.feeling',
  ]) {
    const battle = runtimeBattle(id);
    assert.deepEqual(validateCombatDefinition(battle.combat), [], id);
    assert.ok(battle.combat.music, `${id} preserves music metadata at runtime`);
  }
});

test('Chapel action proof can unlock both return and inversion without route-name choices', () => {
  const battle = runtimeBattle('battle.chapel.nothing');
  let state = createCombatState(battle.combat, { tools: { rig: true, fork: true }, battery: 1 });
  // Proof behavior itself is authored by movement identity and the physical
  // tool action, not a separate dialogue answer.
  state.movementIndex = 1; state.movementCoherence = 4; state.movementMaxCoherence = 4; state.intentIndex = 0;
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.ok(state.proofs.includes('return.recordist'));

  state.movementIndex = 3; state.movementCoherence = 4; state.movementMaxCoherence = 4; state.intentIndex = 0; state.tempo = false; state.take = null;
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  state = reduceCombat(state, { type: COMBAT_ACTION.END_TEMPO });
  assert.equal(currentCombatIntent(state).kind, 'loop');
  state = reduceCombat(state, { type: COMBAT_ACTION.INVERT });
  assert.ok(state.proofs.includes('invert.contract'));

  state.movementIndex = 4; state.movementCoherence = 4; state.movementMaxCoherence = 4; state.intentIndex = 0; state.tempo = false; state.take = null;
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  state = reduceCombat(state, { type: COMBAT_ACTION.PLAYBACK });
  assert.ok(state.proofs.includes('return.source'));
  state = reduceCombat(state, { type: COMBAT_ACTION.HOLD });
  state = reduceCombat(state, { type: COMBAT_ACTION.END_TEMPO });
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  state = reduceCombat(state, { type: COMBAT_ACTION.END_TEMPO });
  state = reduceCombat(state, { type: COMBAT_ACTION.INVERT });
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
  const ending = surfacedEnding({ sourceReading: { text: 'BODY BORROWED RETURN' } });
  assert.ok(ending.some((line) => /BODY BORROWED RETURN/.test(line.text)));
  assert.ok(guardEpilogue('surfaced').some((line) => /Two of you/.test(line.text)));
});
