import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createBackgroundAudioFocusPolicy,
  documentIsUnfocused,
  normalizeBackgroundAudioMode,
} from '../src/audio/background-audio.js';
import { normalizeSettings } from '../src/progression/schema.js';

function fakeContext() {
  return {
    state: 'running',
    suspends: 0,
    async suspend() {
      this.suspends += 1;
      this.state = 'suspended';
    },
  };
}

test('background audio defaults to continuing and normalizes old saves', () => {
  assert.equal(normalizeBackgroundAudioMode(), 'continue');
  assert.equal(normalizeBackgroundAudioMode('pause'), 'pause');
  assert.equal(normalizeBackgroundAudioMode('invalid'), 'continue');
  assert.equal(normalizeSettings({}).backgroundAudio, 'continue');
  assert.equal(normalizeSettings({ backgroundAudio: 'pause' }).backgroundAudio, 'pause');
  assert.equal(normalizeSettings({ backgroundAudio: 'invalid' }).backgroundAudio, 'continue');
});

test('focus policy keeps default audio running and honors the opt-in pause mode', async () => {
  const context = fakeContext();
  const doc = { hidden: false, visibilityState: 'visible', hasFocus: () => false };
  let mode = 'continue';
  const recoveries = [];
  const policy = createBackgroundAudioFocusPolicy({
    getContext: () => context,
    getMode: () => mode,
    getDocument: () => doc,
    recover: (reason) => { recoveries.push(reason); context.state = 'running'; return true; },
  });

  assert.equal(documentIsUnfocused(doc), true);
  assert.equal(await policy.sync('window-blur'), true);
  assert.equal(context.suspends, 0);
  assert.equal(policy.shouldRecover(), true);

  mode = 'pause';
  assert.equal(await policy.sync('window-blur'), true);
  assert.equal(context.suspends, 1);
  assert.equal(policy.shouldRecover(), false);

  doc.hasFocus = () => true;
  assert.equal(await policy.sync('window-focus'), true);
  assert.equal(policy.shouldRecover(), true);
  assert.deepEqual(recoveries, ['window-blur', 'window-focus']);
});

test('desktop and settings surfaces expose the background audio policy', () => {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  assert.equal(config.app.windows[0].backgroundThrottling, 'disabled');

  const settings = readFileSync('src/game/settings.js', 'utf8');
  assert.match(settings, /id: 'backgroundAudio', label: 'BACKGROUND AUDIO'/);
  assert.match(settings, /PAUSE WHEN UNFOCUSED/);

  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /createBackgroundAudioFocusPolicy/);
  assert.match(main, /shouldRecover:\(\)=>backgroundAudioPolicy/);
  assert.match(main, /onBackgroundAudioChange/);
});
