import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = undefined;

const saveApi = await import('../src/game/save.js');
const runtime = await import('../src/progression/runtime.js');
const { EVENT_TYPES } = await import('../src/progression/events.js');
const { DIFFICULTY_PRESETS } = await import('../src/progression/difficulty-defs.js');
const { deriveUnlocks } = await import('../src/progression/unlocks.js');

saveApi.saveLoad();
runtime.progressionInit({ build: 'TEST' });

// Contract run: overlapping narrative, discovery, and mastery achievements.
saveApi.newGame({ preset: 'contract', values: DIFFICULTY_PRESETS.contract.values, now: 1000 });
assert.equal(saveApi.getSave().run.rules.startedPreset, 'contract');
assert.equal(saveApi.getMeta().stats.runsStarted, 1);
assert.equal(saveApi.getMeta().platform.pendingStats.STAT_RUNS_STARTED, 1);
assert.equal(runtime.beginRunProgression().ok, true);

runtime.emitProgress(EVENT_TYPES.DOCUMENT_READ, { id: 'work-order' }, 'test', { at: 1100 });
for (const [i, roomId] of ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic', 'lux_nova'].entries()) {
  runtime.emitProgress(EVENT_TYPES.TAKE_COMPLETED, { roomId, elapsed: 45 }, 'test', { at: 1200 + i });
}
for (const [i, id] of ['natatorium', 'practice', 'hall'].entries()) {
  runtime.emitProgress(EVENT_TYPES.BATTLE_STARTED, { id }, 'test', { at: 1300 + i * 2 });
  runtime.emitProgress(EVENT_TYPES.BATTLE_FINISHED, { id, result: 'win', attempts: 1, firstPass: true }, 'test', { at: 1301 + i * 2 });
}
runtime.emitProgress(EVENT_TYPES.CONFESSION_COMMITTED, { kind: 'name', value: 'Sarah' }, 'test', { at: 1400 });
runtime.emitProgress(EVENT_TYPES.PLAYBACK_DISCOVERED, { id: 'the_tub' }, 'test', { at: 1410 });
runtime.emitProgress(EVENT_TYPES.PLAYBACK_DISCOVERED, { id: 'amplifications' }, 'test', { at: 1420 });
runtime.emitProgress(EVENT_TYPES.PLAYBACK_DISCOVERED, { id: 'soundnoisemusic' }, 'test', { at: 1430 });

assert.ok(saveApi.getMeta().achievements.ACH_WORK_ORDER);
assert.ok(saveApi.getMeta().achievements.ACH_FIRST_TAKE);
assert.ok(saveApi.getMeta().achievements.ACH_FIVE_ROOMS);
assert.ok(saveApi.getMeta().achievements.ACH_NAME_SARAH);
assert.ok(saveApi.getMeta().achievements.ACH_ALL_PLAYBACK);
assert.deepEqual(saveApi.getSave().run.ledger.takes.rooms, ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic', 'lux_nova']);

const summary = runtime.commitReturn('inversion', {
  rec: { takes: ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic', 'lux_nova'], injuries: 0 },
  missingEquipment: [],
}, 2000);
assert.equal(summary.endingId, 'inversion');
assert.equal(summary.takes.completed, 5);
assert.equal(summary.takes.spoiled, 0);
assert.equal(summary.battles.firstPassWon, 3);
assert.ok(summary.unlockedAchievements.includes('ACH_END_INVERSION'));
assert.ok(summary.unlockedAchievements.includes('ACH_UNINJURED'));
assert.ok(summary.unlockedAchievements.includes('ACH_UNBROKEN'));
assert.ok(summary.unlockedAchievements.includes('ACH_FIRST_PASS'));
assert.equal(saveApi.getMeta().endingsSeen.includes('inversion'), true);
assert.equal(deriveUnlocks(saveApi.getMeta()).deadAir, true);
assert.equal(runtime.pendingReturnReport().id, summary.id);
assert.equal(saveApi.getMeta().stats.runsCompleted, 1);
assert.equal(saveApi.getMeta().platform.pendingStats.STAT_RUNS_COMPLETED, 1);
assert.equal(saveApi.getMeta().platform.pendingStats.STAT_ENDINGS_SEEN, 1);

// A duplicate or alternate finalizer call for the same run is idempotent.
const duplicate = runtime.commitReturn('sacrifice', {}, 3000);
assert.equal(duplicate.id, summary.id);
assert.deepEqual(saveApi.getMeta().endingsSeen, ['inversion']);
assert.equal(saveApi.getMeta().stats.runsCompleted, 1);

runtime.consumeReturnReport(summary.id);
assert.equal(runtime.pendingReturnReport(), null);
assert.equal(saveApi.getSave().run.status, 'complete');

// Knowledge persists across runs while physical run state is reset.
const metaBeforeReplay = structuredClone(saveApi.getMeta());
saveApi.newGame({ preset: 'dead-air', values: DIFFICULTY_PRESETS['dead-air'].values, now: 4000 });
runtime.beginRunProgression();
assert.equal(saveApi.getSave().run.replay.isReplay, true);
assert.equal(saveApi.getSave().run.replay.endingsAtStart, 1);
assert.equal(saveApi.getSave().items.length, 0);
assert.deepEqual(saveApi.getMeta().endingsSeen, metaBeforeReplay.endingsSeen);
assert.equal(saveApi.getSave().run.integrity.deadAir.eligible, true);

// Accessibility changes are ordinary settings writes and cannot touch integrity.
saveApi.saveCommit({ settings: { ...saveApi.getSave().settings, shake: 'off', flash: 'off', mic: 'off' } });
assert.equal(saveApi.getSave().run.integrity.deadAir.eligible, true);

// Lowering a gameplay axis explicitly invalidates only Dead Air certification.
const preview = runtime.previewCurrentRuleChange('escapeTimer', 'extended');
assert.equal(preview.needsIntegrityWarning, true);
runtime.applyCurrentRuleChange(preview.change, 4100);
assert.equal(saveApi.getSave().run.integrity.deadAir.eligible, false);
assert.equal(saveApi.getSave().run.integrity.deadAir.invalidations.length, 1);
assert.equal(runtime.assertProgressionInvariants().ok, true);

console.log('progression runtime tests ok');
