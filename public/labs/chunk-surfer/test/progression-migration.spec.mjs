import assert from 'node:assert/strict';

class MemoryStorage {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const legacyMeta = {
  version: 1,
  endingsSeen: ['sacrifice', 'sacrifice', 'unknown'],
  hushMet: true,
  leftMidRun: true,
  runs: 3,
  lastSeenAt: 123,
};
const legacySave = {
  version: 2,
  flags: { prologueDone: true },
  area: 'main_b3',
  px: 9,
  py: 12,
  takes: ['main_b3'],
  items: ['chapel_key'],
  steps: 44,
  settings: { volume: 0.5, instantText: true },
};

globalThis.localStorage = new MemoryStorage({
  'chunk-surfer:meta:v1': JSON.stringify(legacyMeta),
  'chunk-surfer:save:v2': JSON.stringify(legacySave),
});

const saveApi = await import('../src/game/save.js');
const loaded = saveApi.saveLoad();
assert.equal(loaded.meta.version, 2);
assert.deepEqual(loaded.meta.endingsSeen, ['sacrifice']);
assert.equal(loaded.meta.hushMet, true);
assert.equal(loaded.meta.leftMidRun, true);
assert.equal(loaded.meta.stats.runsStarted, 3);
assert.equal(loaded.save.version, 3);
assert.equal(loaded.save.flags.prologueDone, true);
assert.equal(loaded.save.area, 'main_b3');
assert.deepEqual(loaded.save.takes, ['main_b3']);
assert.deepEqual(loaded.save.items, ['chapel_key']);
assert.equal(loaded.save.settings.volume, 0.5);
assert.equal(loaded.save.settings.instantText, true);
assert.equal(loaded.save.settings.dialog, 1);
assert.equal(loaded.save.run.status, 'active');
assert.equal(loaded.save.run.replay.isReplay, true);
assert.equal(globalThis.localStorage.getItem('chunk-surfer:meta:v2') != null, true);
assert.equal(globalThis.localStorage.getItem('chunk-surfer:save:v3') != null, true);

// Corrupt new-version records repair safely and strip unknown achievements.
globalThis.localStorage.setItem('chunk-surfer:meta:v2', JSON.stringify({
  version: 2,
  achievements: { ACH_FIRST_TAKE: { unlockedAt: 1 }, ACH_FAKE: { unlockedAt: 1 } },
  endingsSeen: 'not-an-array',
}));
globalThis.localStorage.setItem('chunk-surfer:save:v3', JSON.stringify({
  version: 3,
  settings: null,
  run: {
    id: 'run_bad',
    status: 'active',
    rules: {
      startedPreset: 'fake-mode',
      currentPreset: 'fake-mode',
      values: { escapeTimer: 'impossible', presencePressure: 'severe' },
    },
    integrity: { deadAir: { startedEligible: false, eligible: true, invalidations: [] } },
  },
}));
const repaired = saveApi.saveLoad();
assert.deepEqual(repaired.meta.endingsSeen, []);
assert.ok(repaired.meta.achievements.ACH_FIRST_TAKE);
assert.equal(repaired.meta.achievements.ACH_FAKE, undefined);
assert.equal(repaired.save.run.rules.startedPreset, 'contract');
assert.equal(repaired.save.run.rules.currentPreset, 'contract');
assert.equal(repaired.save.run.rules.values.escapeTimer, 'standard');
assert.equal(repaired.save.run.rules.values.presencePressure, 'severe');
assert.equal(repaired.save.run.integrity.deadAir.eligible, false);
assert.equal(repaired.save.run.integrity.deadAir.invalidations.at(-1).reason, 'REPAIRED_INVALID_CERTIFICATION');

console.log('progression migration tests ok');
