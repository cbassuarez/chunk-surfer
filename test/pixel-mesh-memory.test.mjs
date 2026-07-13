import test from 'node:test';
import assert from 'node:assert/strict';
import { updateMemory } from '../src/render/pixel-mesh/memory.js';

test('memory attacks fast and decays slowly', () => {
  const a = updateMemory(0, 1, 1 / 60);
  assert.ok(a > 0);
  const b = updateMemory(a, 0, 1 / 60);
  assert.ok(b < a);
  assert.ok(b > 0);
});

test('memory remains normalized', () => {
  assert.equal(updateMemory(99, 99, 1), 1);
  assert.equal(updateMemory(-99, -99, 1), 0);
});
