import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = undefined;

const saveApi = await import('../src/game/save.js');
const runtime = await import('../src/progression/runtime.js');
const { syncPlatform } = await import('../src/progression/platform-sync.js');
const { EVENT_TYPES } = await import('../src/progression/events.js');
const { browserPlatform } = await import('../src/platform/browser.js');

saveApi.saveLoad();
runtime.progressionInit({ build: 'TEST' });
saveApi.newGame({ preset: 'contract', now: 1000 });
runtime.beginRunProgression();
runtime.emitProgress(EVENT_TYPES.TAKE_COMPLETED, { roomId: 'main_b3', elapsed: 45 }, 'test', { at: 1100 });
assert.ok(saveApi.getMeta().achievements.ACH_FIRST_TAKE);
assert.ok(saveApi.getMeta().platform.pendingAchievements.includes('ACH_FIRST_TAKE'));
assert.equal(saveApi.getMeta().platform.pendingStats.STAT_TAKES_COMPLETED, 1);

const localOnly = await syncPlatform({ platform: browserPlatform });
assert.equal(localOnly.ok, true);
assert.equal(localOnly.localOnly, true);
assert.ok(saveApi.getMeta().platform.pendingAchievements.includes('ACH_FIRST_TAKE'));

const calls = [];
const steam = {
  kind: 'steam-mock',
  nativeAchievements: true,
  async initialize() {
    calls.push(['initialize']);
    return {
      ready: true,
      achievements: ['ACH_NAME_SARAH', 'ACH_NOT_REAL'],
      stats: { STAT_TAKES_COMPLETED: 4, STAT_RUNS_STARTED: 2 },
    };
  },
  async unlockAchievement(id) { calls.push(['unlock', id]); return true; },
  async setStat(id, value) { calls.push(['stat', id, value]); return true; },
  async flush() { calls.push(['flush']); return true; },
};
const synced = await syncPlatform({ platform: steam });
assert.equal(synced.ok, true);
assert.equal(synced.pendingAchievements, 0);
assert.equal(synced.pendingStats, 0);
assert.ok(saveApi.getMeta().achievements.ACH_NAME_SARAH);
assert.equal(saveApi.getMeta().achievements.ACH_NOT_REAL, undefined);
assert.equal(saveApi.getMeta().stats.takesCompleted, 4);
assert.equal(saveApi.getMeta().stats.runsStarted, 2);
assert.deepEqual(saveApi.getMeta().platform.pendingAchievements, []);
assert.deepEqual(saveApi.getMeta().platform.pendingStats, {});
assert.ok(calls.some((call) => call[0] === 'unlock' && call[1] === 'ACH_FIRST_TAKE'));
assert.equal(calls.some((call) => call[0] === 'stat' && call[1] === 'STAT_TAKES_COMPLETED'), false);
assert.ok(calls.some((call) => call[0] === 'flush'));

// A platform write failure never rolls back local truth and remains queued.
runtime.emitProgress(EVENT_TYPES.COFFEE_DRUNK, {}, 'test', { at: 1200 });
const failing = {
  kind: 'steam-mock',
  nativeAchievements: true,
  async initialize() { return { ready: true, achievements: [], stats: {} }; },
  async unlockAchievement() { throw new Error('offline'); },
  async setStat() { return false; },
  async flush() { throw new Error('offline'); },
};
const failed = await syncPlatform({ platform: failing });
assert.equal(failed.ok, true);
assert.ok(saveApi.getMeta().achievements.ACH_COFFEE);
assert.ok(saveApi.getMeta().platform.pendingAchievements.includes('ACH_COFFEE'));
assert.ok(Object.keys(saveApi.getMeta().platform.pendingStats).length > 0);

console.log('platform sync tests ok');
