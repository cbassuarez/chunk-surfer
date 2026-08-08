import assert from 'node:assert/strict';
import { createBattleInterferenceDirector } from '../src/game/interference-director.js';
import { psychProfileChoice } from '../src/game/psychological-profile.js';
import {
  eraseAllInterferenceData,
  loadOrCreateInterferenceKey,
} from '../src/platform/interference-artifacts.js';

let profile = psychProfileChoice(true);
let artifactWrites = 0;
let emergencyRestores = 0;
let clears = 0;
const identityCache = {
  async request() { return { schema: 1, persona: null, hostname: null, mic: null }; },
  clear() { clears += 1; },
  debug() { return { cached: false, sources: null, pending: false }; },
};
const director = createBattleInterferenceDirector({
  identityCache,
  loadKey: async () => new Uint8Array(32).fill(1),
  maskSnapshot: async () => ({ schema: 1, caseId: 'FIELD-1234ABCD', tokens: {} }),
  effects: {
    begin: async () => 'session-profile',
    apply: async () => true,
    end: async () => true,
    emergencyRestore: async () => { emergencyRestores += 1; },
  },
  getSettings: () => ({ enabled: true, sourceSteam: false, sourceOs: false, sourceHost: false, sourceMic: false }),
  getProfile: () => profile,
  getContext: () => ({ run: { preset: 'contract' } }),
  writeArtifact: async () => { artifactWrites += 1; return { ok: true }; },
});

const first = director.forBattle('recording-2', 'natatorium');
await first.enter();
await first.finish('win');
assert.equal(artifactWrites, 1);

const second = director.forBattle('recording-2', 'natatorium');
await second.enter();
profile = { ...profile, modules: { ...profile.modules, fieldReturnFiles: false } };
await second.finish('win');
assert.equal(artifactWrites, 1, 'revoking file generation stops the pending future write without deleting existing files');

profile = { ...profile, modules: { ...profile.modules, windowChoreography: false } };
await director.settingsChanged();
assert.ok(emergencyRestores >= 1, 'window revocation restores immediately');
assert.ok(clears >= 1, 'identity module changes clear the ephemeral cache immediately');

const removed = [];
await eraseAllInterferenceData({
  fsApi: {
    BaseDirectory: { AppData: 'app-data', AppConfig: 'app-config' },
    async remove(path, options) { removed.push([path, options.baseDir, !!options.recursive]); },
  },
});
assert.deepEqual(removed, [
  ['field_returns', 'app-data', true],
  ['personalized-interference.key', 'app-config', false],
]);

let fsCalls = 0;
const ephemeral = await loadOrCreateInterferenceKey({
  persist: false,
  cryptoApi: { getRandomValues(value) { value.fill(7); return value; } },
  fsApi: {
    BaseDirectory: { AppConfig: 'app-config' },
    async readTextFile() { fsCalls += 1; return ''; },
    async writeTextFile() { fsCalls += 1; },
  },
});
assert.equal(fsCalls, 0, 'identity-only masking never requests or writes persistent storage');
assert.deepEqual([...ephemeral], Array(32).fill(7));

console.log('psych profile runtime revocation tests passed');
