import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISPLAY_CONTRACT } from '../src/platform/display-policy.js';

const contract = JSON.parse(readFileSync('src/shared/display-contract.json', 'utf8'));

test('JS display contract matches JSON contract', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(DISPLAY_CONTRACT)), contract);
});

test('tauri config min size matches display contract', () => {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const main = config.app.windows.find((win) => win.label === 'main');

  assert.equal(main.width, contract.defaultWindow.width);
  assert.equal(main.height, contract.defaultWindow.height);
  assert.equal(main.minWidth, contract.minimum.width);
  assert.equal(main.minHeight, contract.minimum.height);
});

test('all window presets satisfy minimum viewport', () => {
  for (const preset of contract.windowPresets) {
    assert.ok(preset.width >= contract.minimum.width, preset.id);
    assert.ok(preset.height >= contract.minimum.height, preset.id);
  }
});

test('display contract ids are unique', () => {
  for (const key of ['windowPresets', 'uiScalePresets', 'renderScalePresets', 'displayModes']) {
    const ids = contract[key].map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length, key);
  }
});
