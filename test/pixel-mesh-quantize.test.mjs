import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCell, luminance } from '../src/render/pixel-mesh/quantize.js';

const authored = { worldAmount: 0.82, signalAmount: 1 };

test('signal overrides dark world luminance', () => {
  assert.equal(classifyCell({
    luma: 0.02,
    signal: 0.95,
    memory: 0,
    edge: 0,
    mode: authored,
  }), 'SIGNAL_HOT');
});

test('edges preserve readable architecture', () => {
  assert.equal(classifyCell({
    luma: 0.28,
    signal: 0,
    memory: 0,
    edge: 0.8,
    mode: authored,
  }), 'WORLD_LIGHT');
});

test('luminance weights green most strongly', () => {
  assert.ok(luminance(0, 255, 0) > luminance(255, 0, 0));
});
