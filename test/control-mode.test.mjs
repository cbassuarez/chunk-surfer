import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/progression/schema.js';

test('control mode is backward-compatible and corrupt values repair to classic', () => {
  assert.equal(DEFAULT_SETTINGS.controlMode, 'classic');
  assert.equal(normalizeSettings({}).controlMode, 'classic');
  assert.equal(normalizeSettings({ controlMode: 'independent-wasd' }).controlMode, 'independent-wasd');
  assert.equal(normalizeSettings({ controlMode: 'independent-arrows' }).controlMode, 'independent-arrows');
  assert.equal(normalizeSettings({ controlMode: 'free-flight' }).controlMode, 'classic');
});
