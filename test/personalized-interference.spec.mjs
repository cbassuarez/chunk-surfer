import assert from 'node:assert/strict';
import {
  createPersonalizedInterference,
  normalizePersonalInterferenceSettings,
  safeInterferenceSettingsForStorage,
  sanitizeInterferenceName,
} from '../src/game/personalized-interference.js';
import { normalizeSettings } from '../src/progression/schema.js';

assert.equal(sanitizeInterferenceName('Sebastian'), 'Sebastian');
assert.equal(sanitizeInterferenceName('  Seb\tSuarez  '), 'Seb Suarez');
assert.equal(sanitizeInterferenceName('seb@example.com'), null);
assert.equal(sanitizeInterferenceName('/Users/seb'), null);
assert.equal(sanitizeInterferenceName('a'), null);
assert.equal(sanitizeInterferenceName('________________________________'), null);

const normalized = normalizeSettings({
  personalInterference: {
    enabled: true,
    sourceSteam: false,
    sourceOs: true,
    vfdText: true,
    localSpeech: true,
    intensity: 'hostile',
    display: 'SHOULD_NOT_SURVIVE',
    username: 'SHOULD_NOT_SURVIVE',
  },
});
assert.deepEqual(normalized.personalInterference, {
  enabled: true,
  sourceSteam: false,
  sourceOs: true,
  vfdText: true,
  localSpeech: true,
  intensity: 'hostile',
});
assert.equal(JSON.stringify(normalized).includes('SHOULD_NOT_SURVIVE'), false);

const safeStored = safeInterferenceSettingsForStorage({
  personalInterference: { enabled: true, intensity: 'bad', sourceOs: false },
});
assert.deepEqual(safeStored, {
  enabled: true,
  sourceSteam: true,
  sourceOs: false,
  vfdText: true,
  localSpeech: false,
  intensity: 'standard',
});

let nowMs = 0;
let calls = 0;
const spoken = [];
const runtime = createPersonalizedInterference({
  now: () => nowMs,
  identityProvider: async () => {
    calls++;
    return { source: 'os', display: 'Sebastian' };
  },
  speech: { speak: (event) => { spoken.push(event.voiceText); return true; }, cancel() {} },
});

let event = runtime.tick({
  settings: { enabled: false },
  recording: true,
  takeSlot: 3,
  takeProgress: 1,
  runSeconds: 999,
});
assert.equal(event, null);
assert.equal(calls, 0);

event = runtime.tick({
  settings: { enabled: true, sourceOs: true, sourceSteam: true, vfdText: true, localSpeech: true, intensity: 'hostile' },
  recording: true,
  takeSlot: 3,
  takeProgress: 0.95,
  runSeconds: 999,
  roomId: 'main_b3',
});
assert.equal(event, null, 'first tick starts async identity load only');
await Promise.resolve();
event = runtime.tick({
  settings: { enabled: true, sourceOs: true, sourceSteam: true, vfdText: true, localSpeech: true, intensity: 'hostile' },
  recording: true,
  takeSlot: 3,
  takeProgress: 0.95,
  runSeconds: 999,
  roomId: 'main_b3',
});
assert.ok(event);
assert.match(event.text, /SEBASTIAN/i);
assert.equal(spoken.length, 1);
assert.equal(JSON.stringify(runtime.debug()).includes('Sebastian'), false);

nowMs += 31000;
event = runtime.tick({
  settings: { enabled: true, sourceOs: true, sourceSteam: true, vfdText: true, localSpeech: false, intensity: 'hostile' },
  recording: true,
  takeSlot: 4,
  takeProgress: 0.95,
  runSeconds: 999,
  roomId: 'the_tub',
});
assert.equal(event, null, 'expired identity is refreshed asynchronously');
await Promise.resolve();
assert.equal(calls, 2);

console.log('personalized interference contracts passed');
