import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PINS,
  PIN_SOURCES,
  TUTORIAL_CABLE_GRANTS,
  freshCombatBuild,
  learnCombatTechnique,
  normalizeCombatBuild,
  pullCombatTechnique,
} from '../src/game/combat-progression.js';
import { TECHNIQUE } from '../src/game/combat-state.js';
import { DIFFICULTY_PRESETS } from '../src/progression/difficulty-defs.js';

const contextualize = (build, combatAssistance, tutorialComplete = true) => normalizeCombatBuild(
  build, [], null, { tutorialComplete, combatAssistance },
);

test('starter cables follow the four combat difficulties only after the tutorial', () => {
  assert.deepEqual(TUTORIAL_CABLE_GRANTS, { guided: 2, standard: 1, severe: 0, 'dead-air': 0 });
  for (const [preset, count] of [['story', 2], ['contract', 1], ['night', 0], ['dead-air', 0]]) {
    const assistance = DIFFICULTY_PRESETS[preset].values.combatAssistance;
    const before = contextualize(freshCombatBuild(), assistance, false);
    assert.equal(before.unspent, 0, `${preset}: no issue before the drill`);
    assert.equal(before.tutorialGrant, null);
    const after = contextualize(before, assistance);
    assert.equal(after.unspent, count, preset);
    assert.deepEqual(after.tutorialGrant, { schema: 1, combatAssistance: assistance });
  }
});

test('the finalized issue cannot be repeated or enlarged by changing difficulty', () => {
  for (const [assistance, count] of Object.entries(TUTORIAL_CABLE_GRANTS)) {
    let build = contextualize(freshCombatBuild(), assistance);
    for (const next of ['guided', 'standard', 'severe', 'dead-air', 'guided']) {
      build = contextualize(build, next);
      assert.equal(build.pinsEarned, count);
      assert.equal(build.tutorialGrant.combatAssistance, assistance);
    }
    assert.deepEqual(normalizeCombatBuild(build), build, 'context-free normalization preserves the original issue');
  }
});

test('old builds receive one issue when their tutorial and difficulty context first arrives', () => {
  const legacy = { schema: 1, rewardedEncounters: ['recording-2'], techniques: [TECHNIQUE.AFTERIMAGE] };
  const raw = normalizeCombatBuild(legacy);
  assert.equal(raw.tutorialGrant, null);
  assert.equal(raw.pinsEarned, 1);
  const continued = contextualize(raw, 'guided');
  assert.equal(continued.pinsEarned, 3);
  assert.equal(continued.unspent, 2);
  assert.deepEqual(contextualize(continued, 'guided'), continued);
  assert.deepEqual(continued.techniques, [TECHNIQUE.AFTERIMAGE]);
});

test('numeric balances and malformed grant fields cannot invent starter cables', () => {
  for (const tutorialGrant of [null, 2, true, {}, { amount: 99 }, { schema: 1, combatAssistance: 'fake', amount: 99 }]) {
    const build = normalizeCombatBuild({ tutorialGrant, pinsEarned: 999, pinsSpent: -40, unspent: 999 });
    assert.equal(build.pinsEarned, 0);
    assert.equal(build.unspent, 0);
    assert.equal(build.tutorialGrant, null);
  }
  const bounded = normalizeCombatBuild({ tutorialGrant: { schema: 1, combatAssistance: 'standard', amount: 999 } });
  assert.equal(bounded.pinsEarned, 1);
  assert.equal(bounded.tutorialGrant.amount, undefined);
  assert.equal(contextualize(null, 'guided', 'true').tutorialGrant, null);
  assert.equal(contextualize(null, 'fake').tutorialGrant, null);
});

test('earned leads remain intact, capped at six, and starter leads can be repatched', () => {
  const flags = Object.fromEntries(PIN_SOURCES.flags.map((flag) => [flag, true]));
  for (const assistance of Object.keys(TUTORIAL_CABLE_GRANTS)) {
    const capped = normalizeCombatBuild(contextualize(null, assistance), PIN_SOURCES.encounters, flags);
    assert.equal(capped.pinsEarned, MAX_PINS);
    assert.deepEqual(capped.rewardedEncounters, PIN_SOURCES.encounters);
    assert.deepEqual(capped.rewardedFlags, PIN_SOURCES.flags);
    assert.deepEqual(normalizeCombatBuild(capped), capped);
  }
  let build = contextualize(null, 'guided');
  build = learnCombatTechnique(build, TECHNIQUE.AFTERIMAGE).build;
  build = learnCombatTechnique(build, TECHNIQUE.WHITEOUT).build;
  assert.equal(build.unspent, 0);
  const pulled = pullCombatTechnique(build, TECHNIQUE.AFTERIMAGE);
  assert.equal(pulled.returned, 2);
  assert.equal(pulled.build.tutorialGrant.combatAssistance, 'guided');
  assert.equal(learnCombatTechnique(pulled.build, TECHNIQUE.PUNCH_IN).changed, true);
});

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
globalThis.localStorage = new MemoryStorage();
const saveApi = await import('../src/game/save.js');

test('save completion commits the issue, reload preserves it, and a fresh run resets it', () => {
  saveApi.saveLoad();
  const start = saveApi.newGame({ preset: 'story', values: DIFFICULTY_PRESETS.story.values, now: 1000 });
  assert.equal(start.combatBuild.unspent, 0);
  assert.equal(start.combatBuild.tutorialGrant, null);
  const complete = saveApi.saveCommit({ flags: { 'combat.trained': true } });
  assert.equal(complete.combatBuild.unspent, 2);
  assert.equal(saveApi.saveLoad().save.combatBuild.unspent, 2);
  const next = saveApi.newGame({ preset: 'night', values: DIFFICULTY_PRESETS.night.values, now: 2000 });
  assert.equal(next.combatBuild.tutorialGrant, null);
  assert.equal(next.flags['combat.trained'], undefined);
  const harder = saveApi.saveCommit({ flags: { 'combat.trained': true } });
  assert.equal(harder.combatBuild.unspent, 0);
  const easier = saveApi.saveCommit({ run: {
    ...harder.run, rules: { ...harder.run.rules, currentPreset: 'story', values: DIFFICULTY_PRESETS.story.values },
  } });
  assert.equal(easier.combatBuild.unspent, 0, 'zero issue remains finalized after an easier difficulty is chosen');
  assert.equal(saveApi.saveLoad().save.combatBuild.tutorialGrant.combatAssistance, 'severe');
});

test('legacy trained saves gain the issue through normal load with preserved earned cables', () => {
  const base = saveApi.newGame({ preset: 'contract', values: DIFFICULTY_PRESETS.contract.values, now: 3000 });
  const legacy = {
    ...base, flags: { 'combat.trained': true, 'pin.academic': true },
    encounters: { cleared: ['recording-2'] },
    combatBuild: { schema: 1, techniques: [TECHNIQUE.AFTERIMAGE], pinsEarned: 500, unspent: 500 },
  };
  localStorage.setItem('chunk-surfer:save:v4', JSON.stringify(legacy));
  const loaded = saveApi.saveLoad().save;
  assert.equal(loaded.combatBuild.pinsEarned, 3);
  assert.equal(loaded.combatBuild.unspent, 2);
  assert.equal(loaded.combatBuild.tutorialGrant.combatAssistance, 'standard');
  saveApi.saveCommit({});
  assert.deepEqual(saveApi.saveLoad().save.combatBuild, loaded.combatBuild);
});
