import assert from 'node:assert/strict';
import fs from 'node:fs';

class MemoryStorage {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

globalThis.window = undefined;
globalThis.localStorage = new MemoryStorage();

const { BrowserStorage, readLocalStorage } = await import('../src/platform/storage/browserStorage.js');
const { DesktopStorage, MemoryFileAdapter } = await import('../src/platform/storage/desktopStorage.js');
const { makeEnvelope, serializeEnvelope } = await import('../src/platform/storage/jsonEnvelope.js');
const { detectStorageBackendKind } = await import('../src/platform/detect.js');
const { createGameStorage } = await import('../src/platform/storage/storageService.js');
const { SETTINGS_KEY, PROFILE_KEY, AUTOSAVE_KEY, MIGRATION_KEY, SAVE_SLOT_AUTOSAVE } = await import('../src/platform/storage/types.js');

assert.equal(detectStorageBackendKind(), 'browser');
assert.equal(createGameStorage({ gameVersion: 'TEST' }).kind, 'browser');

const browser = new BrowserStorage({ gameVersion: 'TEST' });
await browser.init();
assert.equal((await browser.loadSettings()).volume, 1);
await browser.saveSettings({ volume: 0.25, mic: 'off' });
assert.equal((await browser.loadSettings()).volume, 0.25);
assert.ok(readLocalStorage(SETTINGS_KEY));
assert.ok(readLocalStorage(MIGRATION_KEY));

const profile = await browser.loadProfile();
profile.endingsSeen.push('helped');
await browser.saveProfile(profile);
assert.deepEqual((await browser.loadProfile()).endingsSeen, ['helped']);

await browser.saveGame(SAVE_SLOT_AUTOSAVE, { version: 3, area: 'the_tub', px: 3, py: 4, settings: { volume: 0.6 } });
assert.equal((await browser.loadSave()).area, 'the_tub');
assert.ok(readLocalStorage(AUTOSAVE_KEY));
assert.ok(readLocalStorage(PROFILE_KEY));

const legacy = JSON.parse(fs.readFileSync('test/fixtures/storage/legacy-localstorage.json', 'utf8'));
globalThis.localStorage = new MemoryStorage(Object.fromEntries(Object.entries(legacy).map(([k, v]) => [k, JSON.stringify(v)])));
const migratedBrowser = new BrowserStorage({ gameVersion: 'TEST' });
await migratedBrowser.init();
assert.equal((await migratedBrowser.loadSettings()).volume, 0.33);
assert.equal((await migratedBrowser.loadProfile()).runs, 2);
assert.equal((await migratedBrowser.loadSave()).area, 'main_b3');
assert.ok(globalThis.localStorage.getItem('chunk-surfer:save:v3'));
assert.ok(globalThis.localStorage.getItem(AUTOSAVE_KEY));

globalThis.localStorage = new MemoryStorage();
const adapter = new MemoryFileAdapter();
const desktop = new DesktopStorage({ gameVersion: 'TEST', adapter, paths: { appData: '/fake/data', appConfig: '/fake/config', appLog: '/fake/log' } });
await desktop.init();
assert.equal((await desktop.loadSettings()).volume, 1);
await desktop.saveSettings({ volume: 0.12, mic: 'off' });
assert.equal((await desktop.loadSettings()).volume, 0.12);
await desktop.saveProfile({ version: 2, endingsSeen: ['inversion'], runs: 9 });
assert.deepEqual((await desktop.loadProfile()).endingsSeen, ['inversion']);
await desktop.saveGame(SAVE_SLOT_AUTOSAVE, { version: 3, area: 'chapel', px: 5, py: 6, settings: { volume: 0.8 } });
assert.equal((await desktop.loadSave()).area, 'chapel');

await adapter.writeText('saves/autosave.json', '{ broken', adapter.baseData);
await adapter.writeText('saves/backup/autosave.previous.json', serializeEnvelope(makeEnvelope({ version: 3, area: 'backup_room', settings: { volume: 0.2 } }, { schemaVersion: 1, gameVersion: 'TEST' })), adapter.baseData);
assert.equal((await desktop.loadSave()).area, 'backup_room');
assert.match(await adapter.readText('saves/autosave.json', adapter.baseData), /backup_room/);
assert.ok(desktop.errors.some((e) => e.op === 'schema'));
await desktop.deleteSave(SAVE_SLOT_AUTOSAVE);
assert.equal(await adapter.exists('saves/autosave.json', adapter.baseData), false);
assert.equal(await adapter.exists('saves/backup/autosave.previous.json', adapter.baseData), false);
assert.equal(await desktop.loadSave(), null);

await adapter.writeText('settings.json', serializeEnvelope(makeEnvelope({ volume: 0.99 }, { schemaVersion: 99, gameVersion: 'FUTURE' })), adapter.baseConfig);
const before = await adapter.readText('settings.json', adapter.baseConfig);
assert.equal((await desktop.loadSettings()).volume, 1);
await desktop.saveSettings({ volume: 0.1 });
assert.equal(await adapter.readText('settings.json', adapter.baseConfig), before);

const exported = await desktop.exportAllData();
assert.equal(exported.format, 'chunk-surfer-export');
assert.equal(exported.storage.kind, 'desktop');

// If an earlier desktop launch created the migration marker and an empty
// profile, later availability of legacy WebView localStorage should still
// repair the empty desktop profile without clobbering real progress.
globalThis.localStorage = new MemoryStorage({
  'chunk-surfer:meta:v2': JSON.stringify({ version: 2, endingsSeen: ['helped'], runs: 3, achievements: { ACH_FIRST_TAKE: { at: 1 } }, stats: { runsCompleted: 1, endingsSeen: 1 } }),
});
const repairAdapter = new MemoryFileAdapter();
await repairAdapter.writeText('migration/localstorage-import-v1.json', serializeEnvelope(makeEnvelope({ done: true }, { schemaVersion: 1, gameVersion: 'TEST' })), repairAdapter.baseData);
await repairAdapter.writeText('profile.json', serializeEnvelope(makeEnvelope({ version: 2, endingsSeen: [], runs: 0, achievements: {}, stats: { runsCompleted: 0, endingsSeen: 0 } }, { schemaVersion: 1, gameVersion: 'TEST' })), repairAdapter.baseData);
const repairedDesktop = new DesktopStorage({ gameVersion: 'TEST', adapter: repairAdapter, paths: { appData: '/fake/data', appConfig: '/fake/config', appLog: '/fake/log' } });
await repairedDesktop.init();
assert.deepEqual((await repairedDesktop.loadProfile()).endingsSeen, ['helped']);

console.log('storage platform tests ok');
