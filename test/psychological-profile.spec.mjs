import assert from 'node:assert/strict';
import {
  PSYCH_PROFILE_CONSENT_VERSION,
  PSYCH_PROFILE_MODULE_KEYS,
  freshPsychProfileState,
  normalizePsychObservation,
  normalizePsychProfileSettings,
  profileInfluence,
  psychProfileChoice,
  psychProfileStatus,
  psychProfilePublicSummary,
  reducePsychProfile,
  blendAdjacentRule,
  snapshotBattleIntent,
} from '../src/game/psychological-profile.js';
import { normalizeMeta, normalizeSettings } from '../src/progression/schema.js';

const enabled = psychProfileChoice(true);
assert.equal(enabled.consentVersion, PSYCH_PROFILE_CONSENT_VERSION);
assert.equal(psychProfileStatus(enabled), 'FULL');
assert.deepEqual(Object.values(enabled.modules), PSYCH_PROFILE_MODULE_KEYS.map(() => true));
assert.equal(enabled.windowIntensity, 'hostile');
assert.deepEqual(
  { status: psychProfilePublicSummary(enabled, freshPsychProfileState(), 'denied').status,
    micStatus: psychProfilePublicSummary(enabled, freshPsychProfileState(), 'denied').micStatus },
  { status: 'FULL', micStatus: 'MIC BLOCKED' },
  'OS denial leaves the full profile on while reporting the blocked mic module',
);

const disabled = psychProfileChoice(false, enabled);
assert.equal(psychProfileStatus(disabled), 'OFF');
assert.deepEqual(Object.values(disabled.modules), PSYCH_PROFILE_MODULE_KEYS.map(() => false));

const custom = normalizePsychProfileSettings({
  schema: 1,
  consentVersion: PSYCH_PROFILE_CONSENT_VERSION,
  modules: { ...enabled.modules, microphone: false },
  windowIntensity: 'standard',
});
assert.equal(psychProfileStatus(custom), 'CUSTOM');
assert.equal(custom.modules.microphone, false);

const stored = normalizeSettings({ psychProfile: enabled, mic: 'off' });
assert.equal(stored.psychProfile.consentVersion, PSYCH_PROFILE_CONSENT_VERSION);
assert.equal(stored.psychProfile.modules.microphone, true, 'new schema is authoritative over legacy mic');
assert.equal(normalizeMeta({ psychProfile: { ...freshPsychProfileState(), sampleCount: 9 } }).psychProfile.sampleCount, 9);

const legacy = normalizeSettings({
  mic: 'on',
  personalInterference: { enabled: true, sourceSteam: true, sourceOs: false, sourceHost: true, sourceMic: true },
});
assert.equal(legacy.psychProfile.consentVersion, '', 'legacy profiles still require the omnibus');
assert.equal(legacy.psychProfile.modules.microphone, true);
assert.equal(legacy.psychProfile.modules.behavioralMeasurement, false);

assert.equal(normalizePsychObservation({ kind: 'permission', signals: { vigilance: 1 } }), null);
assert.equal(normalizePsychObservation({ kind: 'take', identity: 'Seb', signals: {} }), null);
assert.deepEqual(
  Object.keys(normalizePsychObservation({ kind: 'battle', identity: 'Seb', signals: { resistance: 2 } })),
  ['kind', 'signals', 'weight'],
  'the observation contract has no raw PII field',
);
const battleFixture = { combat: { movements: [{ intents: [
  { id: 'quiet', kind: 'conceal', damage: 1 },
  { id: 'hard', kind: 'overload', damage: 3 },
] }] } };
const pressureBattle = snapshotBattleIntent(battleFixture, { adaptiveBand: 1 });
assert.equal(pressureBattle.intent, 'pressure');
assert.deepEqual(pressureBattle.definition.combat.movements[0].intents.map((entry) => entry.id), ['hard', 'quiet']);
assert.deepEqual(battleFixture.combat.movements[0].intents.map((entry) => entry.id), ['quiet', 'hard'], 'the authored definition is not mutated');
assert.equal(snapshotBattleIntent(battleFixture, { adaptiveBand: 1 }, { tutorial: true }).intent, 'baseline');

let state = freshPsychProfileState();
for (let index = 0; index < 12; index += 1) {
  state = reducePsychProfile(state, {
    kind: 'battle',
    signals: { resistance: 1, composure: 1, exposure: 0, vigilance: 0 },
  }, { runId: 'run-safe' });
}
assert.equal(state.adaptiveBand, 1);
assert.equal(state.lastUpdatedRun, 'run-safe');
assert.ok(state.confidence >= 0.5);

const contract = profileInfluence(state, { preset: 'contract' });
assert.equal(contract.presenceBlend, 0.5);
assert.equal(contract.contactWeightShift, 0.1);
assert.equal(contract.battleIntent, 'pressure');
assert.equal(profileInfluence(state, { preset: 'story' }).adaptiveBand, 0, 'STORY cannot adapt upward');
assert.equal(profileInfluence(state, { preset: 'dead-air' }).adaptiveBand, 0, 'DEAD AIR is stable');
assert.equal(profileInfluence(state, { adaptiveDifficulty: false }).adaptiveBand, 0);
assert.deepEqual(
  blendAdjacentRule({ speed: 1, hearing: 1 }, { speed: 1.4, hearing: 1.2 }, 1),
  { speed: 1.2, hearing: 1.1 },
  'named presence values blend no more than halfway toward the adjacent tier',
);

console.log('psychological profile contract tests passed');
