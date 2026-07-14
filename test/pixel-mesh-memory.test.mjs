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

function decayAt(rate, halfLifeMs, seconds = 1) {
  let value = 1;
  for (let i = 0; i < rate * seconds; i += 1) {
    value = updateMemory(value, 0, 1 / rate, { halfLifeMs });
  }
  return value;
}

test('persistence half-life is frame-rate independent at 30/60/120 Hz', () => {
  for (const halfLifeMs of [90, 220, 480, 900]) {
    const samples = [30, 60, 120].map((rate) => decayAt(rate, halfLifeMs));
    const spread = Math.max(...samples) - Math.min(...samples);
    assert.ok(spread < Math.max(...samples) * 0.05, `${halfLifeMs}ms spread ${spread}`);
  }
});
