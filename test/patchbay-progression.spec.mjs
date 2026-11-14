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
import { createCassetteLedger, loseCassetteOnContact, recordOnCassette } from '../src/game/cassette-ledger.js';
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

test('only the first clean B3 cassette issues one reusable lead on every preset', () => {
  saveApi.saveLoad();
  for (const [preset, tutorialCables] of [['story', 2], ['contract', 1], ['night', 0], ['dead-air', 0]]) {
    const start = saveApi.newGame({ preset, values: DIFFICULTY_PRESETS[preset].values, now: 4000 });
    let cassettes = { ...createCassetteLedger(preset), runId: start.run.id };
    const drill = saveApi.saveCommit({ flags: { 'combat.trained': true }, cassettes });
    assert.equal(drill.combatBuild.pinsEarned, tutorialCables);
    assert.equal(drill.combatBuild.b3LeadEarned, false);
    for (const [roomId, outcome] of [['main_b3', 'spoilt'], ['main_b3', 'rejected'], ['amplifications', 'clean']]) {
      cassettes = recordOnCassette(cassettes, 1, { roomId, outcome }).ledger;
      const save = saveApi.saveCommit({ cassettes });
      assert.equal(save.combatBuild.b3LeadEarned, false);
      assert.equal(save.combatBuild.pinsEarned, tutorialCables);
    }
    cassettes = recordOnCassette(cassettes, 1, { roomId: 'main_b3', outcome: 'clean' }).ledger;
    const first = saveApi.saveCommit({ cassettes });
    assert.equal(first.combatBuild.b3LeadEarned, true);
    assert.equal(first.combatBuild.pinsEarned, tutorialCables + 1);
    const patched = learnCombatTechnique(first.combatBuild, TECHNIQUE.ROOM_TONE);
    assert.equal(patched.changed, true);
    saveApi.saveCommit({ combatBuild: patched.build });
    const retry = recordOnCassette(cassettes, 2, { roomId: 'main_b3', outcome: 'clean' }).ledger;
    saveApi.saveCommit({ cassettes: retry });
    const reloaded = saveApi.saveLoad().save.combatBuild;
    assert.equal(reloaded.unspent, tutorialCables);
    assert.deepEqual(reloaded.techniques, [TECHNIQUE.ROOM_TONE]);
    assert.equal(pullCombatTechnique(reloaded, TECHNIQUE.ROOM_TONE).build.unspent, tutorialCables + 1);
  }
  assert.equal(saveApi.newGame({ preset: 'night', now: 5000 }).combatBuild.b3LeadEarned, false);
});

test('cassette history restores the B3 lead after overwrite and loss', () => {
  const base = saveApi.newGame({ preset: 'night', now: 6000 });
  let cassettes = { ...createCassetteLedger('night'), runId: base.run.id };
  cassettes = recordOnCassette(cassettes, 1, { roomId: 'main_b3', outcome: 'clean' }).ledger;
  cassettes = recordOnCassette(cassettes, 1, { roomId: 'amplifications', outcome: 'clean' }).ledger;
  cassettes = loseCassetteOnContact(cassettes, { random: () => 0 }).ledger;
  assert.equal(cassettes.cassettes[0].lost, true);
  localStorage.setItem('chunk-surfer:save:v4', JSON.stringify({ ...base, cassettes }));
  const migrated = saveApi.saveLoad().save;
  assert.equal(migrated.combatBuild.b3LeadEarned, true);
  assert.equal(migrated.combatBuild.pinsEarned, 1);
  const committed = saveApi.saveCommit({ cassettes: null });
  assert.deepEqual(committed.combatBuild, migrated.combatBuild);
  assert.deepEqual(saveApi.saveLoad().save.combatBuild, migrated.combatBuild);
});

test('the first job lead does not require training and never raises the rack cap', () => {
  const start = saveApi.newGame({ preset: 'night', now: 6500 });
  const cassettes = { ...createCassetteLedger('night'), runId: start.run.id };
  const clean = recordOnCassette(cassettes, 1, { roomId: 'main_b3', outcome: 'clean' }).ledger;
  const earned = saveApi.saveCommit({ cassettes: clean });
  assert.equal(earned.combatBuild.unspent, 1);
  assert.equal(earned.combatBuild.tutorialGrant, null);
  const flags = Object.fromEntries(PIN_SOURCES.flags.map((flag) => [flag, true]));
  const capped = saveApi.saveCommit({ encounters: { cleared: PIN_SOURCES.encounters }, flags });
  assert.equal(capped.combatBuild.b3LeadEarned, true);
  assert.equal(capped.combatBuild.pinsEarned, MAX_PINS);
  assert.deepEqual(capped.combatBuild.rewardedFlags, PIN_SOURCES.flags);
  assert.deepEqual(capped.combatBuild.rewardedEncounters, PIN_SOURCES.encounters);
});

test('legacy accepted room evidence migrates without inferring a lead from training or a rejected tape', () => {
  const base = saveApi.newGame({ preset: 'night', now: 7000 });
  const load = (patch) => {
    localStorage.setItem('chunk-surfer:save:v4', JSON.stringify({ ...base, ...patch }));
    return saveApi.saveLoad().save.combatBuild;
  };
  assert.equal(load({ flags: { 'combat.trained': true }, rec: { tapes: [
    { roomId: 'main_b3', status: 'abandoned' },
    { roomId: 'main_b3', status: 'spoiled' },
    { roomId: 'main_b3', status: 'accepted', debug: true },
  ] } }).b3LeadEarned, false);
  assert.equal(load({ combatBuild: { b3LeadEarned: 'true', pinsEarned: 99 } }).pinsEarned, 0);
  assert.equal(load({ rec: { takes: ['main_b3'] } }).pinsEarned, 1);
  assert.equal(load({ rec: { tapes: [{ roomId: 'main_b3', status: 'accepted', lost: true }] } }).pinsEarned, 1);
  assert.equal(load({ run: { ...base.run, ledger: {
    ...base.run.ledger, takes: { ...base.run.ledger.takes, rooms: ['main_b3'] },
  } } }).pinsEarned, 1);
  let foreign = { ...createCassetteLedger('night'), runId: 'a-different-run' };
  foreign = recordOnCassette(foreign, 1, { roomId: 'main_b3', outcome: 'clean' }).ledger;
  assert.equal(load({ cassettes: foreign }).b3LeadEarned, false);
  const current = { ...createCassetteLedger('night'), runId: base.run.id };
  const rejected = recordOnCassette(current, 1, { roomId: 'main_b3', outcome: 'rejected' }).ledger;
  assert.equal(load({ cassettes: rejected, rec: { takes: ['main_b3'] } }).b3LeadEarned, false);
});
