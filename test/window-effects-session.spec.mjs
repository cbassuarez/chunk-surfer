import assert from 'node:assert/strict';
import { createPersonalizedWindowEffects } from '../src/platform/personalized-window-effects.js';

const calls = [];
let releaseExecute;
const executeGate = new Promise((resolve) => { releaseExecute = resolve; });
const api = {
  async invoke(command, payload) {
    calls.push([command, payload]);
    if (command === 'chunk_window_choreography_capabilities') return { nativePositioning: true };
    if (command === 'chunk_window_choreography_begin') return true;
    if (command === 'chunk_window_choreography_execute') { await executeGate; return true; }
    return true;
  },
};
const main = {
  async title() { return 'Chunk Surfer'; },
  async isFocused() { return true; },
  async setTitle() {},
};
const tokens = ['session-aaaaaaaa', 'session-bbbbbbbb', 'session-cccccccc'];
const effects = createPersonalizedWindowEffects({
  runtimeApi: api,
  mainWindow: main,
  tokenFactory: () => tokens.shift(),
  documentApi: null,
  sleep: async () => {},
});

const first = await effects.begin({ intensity: 'hostile' });
const second = await effects.begin({ intensity: 'hostile' });
assert.notEqual(first, second);
assert.equal(await effects.end(first), false, 'stale cleanup cannot end the newer session');
assert.equal(effects.sessionToken(), second);

const pending = effects.apply('overload', { token: second, inputLocked: true });
await Promise.resolve();
const emergency = effects.emergencyRestore({ notify: false });
assert.equal(effects.active(), false, 'emergency abort invalidates the token before awaiting native work');
releaseExecute();
await Promise.all([pending, emergency]);
assert.ok(calls.some(([command, payload]) => command === 'chunk_window_choreography_restore' && payload.token === null));

const fullscreen = await effects.begin({ intensity: 'hostile', fullscreen: true });
await effects.apply('broadcast', { token: fullscreen, inputLocked: true });
assert.equal(
  calls.filter(([command, payload]) => command === 'chunk_window_choreography_begin' && payload.token === fullscreen).length,
  0,
  'fullscreen never enters the native geometry executor',
);
await effects.end(fullscreen);

console.log('window choreography session tests passed');
