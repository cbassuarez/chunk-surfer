import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceMeter } from '../src/platform/performance-meter.js';

test('performance meter estimates fps from frame deltas', () => {
  const meter = createPerformanceMeter();

  meter.frame(1);
  meter.frame(17.666);
  meter.frame(34.333);

  const snapshot = meter.snapshot();
  assert.ok(snapshot.fps > 55 && snapshot.fps < 65, String(snapshot.fps));
  assert.ok(snapshot.lastFrameMs > 16 && snapshot.lastFrameMs < 17);
  assert.ok(snapshot.maxFrameMs > 16 && snapshot.maxFrameMs < 17);
  assert.equal(snapshot.spikesAbove50, 0);
  assert.equal(snapshot.samples, 2);
});

test('performance meter can reset', () => {
  const meter = createPerformanceMeter();
  meter.frame(1);
  meter.frame(17);
  meter.reset();

  assert.deepEqual(meter.snapshot(), { fps: null, frameMs: null, lastFrameMs: null, maxFrameMs: null, spikesAbove50: 0, samples: 0 });
});
