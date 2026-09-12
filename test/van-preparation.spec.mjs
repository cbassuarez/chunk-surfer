import test from 'node:test';
import assert from 'node:assert/strict';
import { freshRunRecord, freshMeta } from '../src/progression/schema.js';
import { DIFFICULTY_PRESETS } from '../src/progression/difficulty-defs.js';
import { EVENT_TYPES, validateEvent } from '../src/progression/events.js';
import { applyRuleChange } from '../src/progression/integrity.js';
import { freshVanPreparation, normalizeVanPreparation, prepareVanDifficultyFinalization } from '../src/progression/van-preparation.js';
import { BENCH_PACK_GROUPS, packWorkbenchGroup } from '../src/game/bench-preparation.js';

const pending = () => ({ flags: { 'van.preparation.v1': true, 'van.difficulty.pending': true },
  settings: { micInput: { deviceId: 'private-device' }, volume: .7, lastDifficulty: 'night' },
  takes: [], run: freshRunRecord({ now: 1000, id: 'van-run' }),
  vanPreparation: { schema: 1, difficulty: { preset: 'story' } },
});

test('draft difficulty is mutable, normalized, and cannot inject preset values', () => {
  assert.deepEqual(normalizeVanPreparation(), freshVanPreparation());
  assert.deepEqual(normalizeVanPreparation({ difficulty: { preset: 'bad' } }), freshVanPreparation());
  assert.deepEqual(normalizeVanPreparation({ difficulty: { preset: 'story', values: { combatAssistance: 'dead-air' } } }).difficulty,
    { preset: 'story', values: DIFFICULTY_PRESETS.story.values });
  assert.equal(normalizeVanPreparation({ difficulty: { preset: 'custom', values: { escapeTimer: 'fake' } } }).difficulty.values.escapeTimer, 'standard');
});

test('packing finalizes initial rules and RUN_STARTED as a single deterministic transaction', () => {
  const save = pending(), before = structuredClone(save);
  const result = prepareVanDifficultyFinalization(save, undefined, freshMeta(), 2500);
  assert.equal(result.ok, true);
  assert.equal(result.patch.run.rules.startedPreset, 'story');
  assert.deepEqual(result.patch.run.rules.values, DIFFICULTY_PRESETS.story.values);
  assert.equal(result.patch.run.id, save.run.id);
  assert.equal(result.patch.run.startedAt, save.run.startedAt);
  assert.deepEqual(result.patch.run.environment, save.run.environment);
  assert.equal(result.event.type, EVENT_TYPES.RUN_STARTED);
  assert.equal(result.event.payload.preset, 'story');
  assert.equal(validateEvent(result.event), true);
  assert.equal(result.patch.run.ledger.seq, result.event.seq);
  assert.deepEqual(result.patch.vanPreparation, freshVanPreparation());
  assert.equal(result.patch.flags['kit.fitted'], true);
  assert.equal(result.patch.flags['van.difficulty.pending'], false);
  assert.equal(result.patch.flags['van.difficulty.chosen'], true);
  assert.deepEqual(result.patch.settings.micInput, save.settings.micInput);
  assert.equal(result.patch.settings.volume, .7);
  assert.deepEqual(save, before, 'pure helper does not mutate the draft');
  const committed = { ...save, ...result.patch };
  assert.equal(prepareVanDifficultyFinalization(committed, { preset: 'night' }).changed, false);
  assert.equal(committed.run.ledger.seq, 1);
});

test('Dead Air and custom unlocks remain enforced; easier changes cannot recertify', () => {
  const save = pending();
  assert.equal(prepareVanDifficultyFinalization(save, { preset: 'dead-air' }, freshMeta()).reason, 'PRESET_LOCKED');
  assert.equal(prepareVanDifficultyFinalization(save, { preset: 'custom' }, freshMeta()).reason, 'PRESET_LOCKED');
  const meta = { ...freshMeta(), endingsSeen: ['inversion'] };
  const result = prepareVanDifficultyFinalization(save, { preset: 'dead-air' }, meta);
  assert.equal(result.patch.run.integrity.deadAir.eligible, true);
  let run = applyRuleChange(result.patch.run, { key: 'combatAssistance', to: 'guided' }, 3000);
  run = applyRuleChange(run, { key: 'combatAssistance', to: 'dead-air' }, 3001);
  assert.equal(run.rules.startedPreset, 'dead-air');
  assert.equal(run.integrity.deadAir.eligible, false);
  const custom = prepareVanDifficultyFinalization(save, { preset: 'custom', values: { combatAssistance: 'guided' } },
    { ...meta, challengeCompletions: { deadAir: true } });
  assert.equal(custom.ok, true);
  assert.equal(custom.patch.run.rules.custom, true);
  assert.equal(custom.patch.run.integrity.deadAir.eligible, false);
});

test('legacy and already-progressed saves cannot receive a new initial qualification', () => {
  for (const patch of [{ flags: { 'bag.taken': true } }, { run: null },
    { takes: ['main_b3'] }, { flags: { 'van.preparation.v1': true, 'van.difficulty.pending': true, 'combat.trained': true } }]) {
    assert.equal(prepareVanDifficultyFinalization({ ...pending(), ...patch }, { preset: 'contract' }, freshMeta()).changed, false);
  }
  const save = pending(); save.run.ledger.battles.started = 1;
  assert.equal(prepareVanDifficultyFinalization(save).reason, 'RUN_ALREADY_PROGRESSED');
});

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
globalThis.localStorage = new MemoryStorage();
const saveApi = await import('../src/game/save.js');

test('new van run persists draft and kit, finalizes once after reload, and resets next run', () => {
  saveApi.saveLoad();
  saveApi.newGame({ prepareInVan: true, now: 1000 });
  assert.equal(saveApi.getSave().flags['van.preparation.v1'], true);
  assert.equal(saveApi.getSave().run.ledger.seq, 0);
  assert.equal(saveApi.getSave().run.integrity.deadAir.eligible, false);
  saveApi.saveCommit({ fieldKit: { headphones: 'closed', cosmetics: { faceplate: 'olive' } },
    vanPreparation: { schema: 1, difficulty: { preset: 'night' } } });
  saveApi.saveCommit({ vanPreparation: { schema: 1, difficulty: { preset: 'story' } } });
  saveApi.saveLoad();
  assert.equal(saveApi.getSave().fieldKit.headphones, 'closed');
  assert.equal(saveApi.getSave().fieldKit.cosmetics.faceplate, 'olive');
  assert.equal(saveApi.getSave().vanPreparation.difficulty.preset, 'story');
  const runs = saveApi.getMeta().stats.runsStarted;
  assert.equal(saveApi.finalizeVanDifficulty(undefined, 1900).ok, false, 'unpacked reference defaults cannot finalize a new bench');
  for (const group of BENCH_PACK_GROUPS) saveApi.saveCommit({ flags: packWorkbenchGroup(saveApi.getSave().flags, group) });
  const result = saveApi.finalizeVanDifficulty(undefined, 2000);
  assert.equal(result.ok, true);
  assert.equal(saveApi.getSave().run.rules.startedPreset, 'story');
  assert.equal(saveApi.getSave().combatBuild.unspent, 0);
  assert.equal(saveApi.getMeta().stats.runsStarted, runs, 'packing is not another new run');
  saveApi.saveLoad();
  assert.equal(saveApi.finalizeVanDifficulty({ preset: 'contract' }).changed, false);
  assert.equal(saveApi.getSave().run.ledger.seq, result.event.seq);
  saveApi.saveCommit({ flags: { ...saveApi.getSave().flags, 'combat.trained': true } });
  assert.equal(saveApi.getSave().combatBuild.unspent, 2, 'the actual chosen difficulty owns the one-time issue');
  saveApi.newGame({ prepareInVan: true, now: 3000 });
  assert.equal(saveApi.getSave().fieldKit.headphones, 'reference');
  assert.equal(saveApi.getSave().vanPreparation.difficulty, null);
  assert.equal(saveApi.getSave().combatBuild.unspent, 0);
  assert.equal(saveApi.getSave().settings.lastDifficulty, 'story');
});

test('old saved bags gain baseline equipment without replaying fitting or altering original rules', () => {
  saveApi.newGame({ preset: 'contract', now: 4000 });
  const run = structuredClone(saveApi.getSave().run);
  saveApi.saveCommit({ flags: { 'bag.taken': true }, fieldKit: null });
  saveApi.saveLoad();
  assert.equal(saveApi.getSave().flags['kit.taken'], true);
  assert.equal(saveApi.getSave().flags['kit.fitted'], true);
  assert.equal(saveApi.getSave().flags['van.preparation.v1'], undefined);
  assert.equal(saveApi.getSave().fieldKit.recorder, 'reference');
  assert.deepEqual(saveApi.getSave().run.rules, run.rules);
  assert.equal(saveApi.finalizeVanDifficulty({ preset: 'story' }).changed, false);
});
