import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('difficulty select uses visible presets so locked Dead Air is shown', () => {
  const src = readFileSync('src/game/difficulty-select.js', 'utf8');
  assert.match(src, /visiblePresets\(meta\)/);
  assert.match(src, /preset\.locked/);
  assert.match(src, /COMPLETE ANY ENDING TO UNLOCK/);
});

test('progression exposes visible presets without changing available presets', () => {
  const src = readFileSync('src/progression/difficulty.js', 'utf8');
  assert.match(src, /export function availablePresets/);
  assert.match(src, /export function visiblePresets/);
  assert.match(src, /locked: !presetUnlocked\(id, meta\)/);
});
