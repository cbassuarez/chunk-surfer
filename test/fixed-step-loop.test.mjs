import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop } from '../src/engine/fixed-step-loop.js';

test('fixed loop subdivides frame time into stable updates', () => {
  let updates = 0;
  const loop = new FixedStepLoop({
    update: () => { updates += 1; },
    render: () => {},
    raf: () => 0,
    caf: () => {},
    now: () => 0,
  });
  loop.running = true;
  loop.last = 0;
  loop.frame(1000 / 30);
  assert.equal(updates, 2);
});

test('fixed loop clamps large resume dt and caps catch-up steps', () => {
  let updates = 0;
  const loop = new FixedStepLoop({
    maxFrameDt: 0.1,
    maxSteps: 5,
    update: () => { updates += 1; },
    render: () => {},
    raf: () => 0,
    caf: () => {},
    now: () => 0,
  });
  loop.running = true;
  loop.last = 0;
  loop.frame(2000);
  assert.ok(updates <= 5);
  assert.ok(loop.debugState().lastClampedDt <= 0.1);
});

test('resetClock clears accumulated time', () => {
  const loop = new FixedStepLoop({ raf: () => 0, caf: () => {}, now: () => 1000 });
  loop.accumulator = 5;
  loop.resetClock('test');
  assert.equal(loop.accumulator, 0);
  assert.equal(loop.debugState().lastResetReason, 'test');
});
