import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESIGNED_VIEWPORT,
  cycleDisplayOption,
  findWindowPreset,
  labelDisplayOption,
  normalizeDisplaySettings,
  isViewportTooSmall,
  resolveRenderScale,
} from '../src/platform/display-policy.js';

test('designed viewport is at least 1280x800', () => {
  assert.ok(DESIGNED_VIEWPORT.width >= 1280);
  assert.ok(DESIGNED_VIEWPORT.height >= 800);
});

test('normalizes invalid display settings', () => {
  assert.deepEqual(normalizeDisplaySettings({
    displayMode: 'garbage',
    windowPreset: '1x1',
    uiScale: 99,
    renderScale: 'potato',
  }), {
    displayMode: 'windowed',
    windowPreset: '1280x800',
    uiScale: 1,
    renderScale: 'auto',
  });
});

test('cycles display options by id or value', () => {
  assert.equal(cycleDisplayOption('windowPresets', '1280x800', 1), '1440x900');
  assert.equal(cycleDisplayOption('uiScalePresets', 1, 1), 1.1);
  assert.equal(cycleDisplayOption('renderScalePresets', 'auto', 1), 0.5);
});

test('labels display options', () => {
  assert.equal(labelDisplayOption('windowPresets', '1920x1080'), '1920×1080 · 16:9');
  assert.equal(labelDisplayOption('renderScalePresets', 0.75), '75%');
});

test('detects too-small viewport', () => {
  assert.equal(isViewportTooSmall(1279, 800), true);
  assert.equal(isViewportTooSmall(1280, 799), true);
  assert.equal(isViewportTooSmall(1280, 800), false);
});

test('finds known window preset', () => {
  assert.equal(findWindowPreset('1920x1080').width, 1920);
});

test('auto render scale resolves conservatively', () => {
  assert.equal(resolveRenderScale('auto', { devicePixelRatio: 3 }), 0.75);
  assert.equal(resolveRenderScale(1), 1);
});
