import test from 'node:test';
import assert from 'node:assert/strict';
import { BAYER_4, ditherCoverage, orderedDither } from '../src/render/pixel-mesh/dither.js';

test('ordered dither is deterministic', () => {
  assert.equal(orderedDither(3, 7, 0.5), orderedDither(3, 7, 0.5));
});

test('ordered dither coverage increases with value', () => {
  assert.ok(ditherCoverage(0.75, BAYER_4) > ditherCoverage(0.25, BAYER_4));
});

test('half value lights roughly half the bayer cells', () => {
  const c = ditherCoverage(0.5, BAYER_4);
  assert.ok(c >= 0.43 && c <= 0.57);
});
