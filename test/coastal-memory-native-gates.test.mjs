import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { coastalNativeMenuReady } from '../tools/chunk_surfer/source-drive-study/coastal-native-gates.mjs';

const gate = (status, { scene = 'title', probe = true } = {}) => vm.runInNewContext(`(${coastalNativeMenuReady.toString()})()`, {
  window: { __probe: probe ? { testRun() {} } : null, __scenes: { top: () => ({ id: scene }) } },
  document: { getElementById: () => status == null ? null : { textContent: status } },
});
test('natural startup gate accepts both fresh and saved-night accessibility titles', () => {
  assert.equal(gate('new night. START A NEW NIGHT.'), true);
  assert.equal(gate('continue. RESUME THE NIGHT YOU LEFT.'), true);
});
test('the gate still rejects calibration, missing status and unavailable runtime', () => {
  for (const status of [null, '', 'calibrating the signal']) assert.equal(gate(status), false);
  assert.equal(gate('continue. RESUME THE NIGHT YOU LEFT.', { scene: 'lens-calibration' }), false);
  assert.equal(gate('continue. RESUME THE NIGHT YOU LEFT.', { probe: false }), false);
});
