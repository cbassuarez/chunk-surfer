import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionState, updateMovement, interpolatePosition } from '../src/player/movement-controller.js';

const forward = Object.freeze({ moveX: 0, moveY: 1, turnX: 0, pointerDx: 0, pointerDy: 0, generation: 0 });
const zero = Object.freeze({ moveX: 0, moveY: 0, turnX: 0, pointerDx: 0, pointerDy: 0, generation: 1 });

function stepFor(seconds, dt, input) {
  const state = createMotionState();
  for (let t = 0; t < seconds - 1e-9; t += dt) updateMovement(state, input, dt);
  return state;
}

test('forward movement distance is frame-rate stable', () => {
  const at60 = stepFor(1, 1 / 60, forward);
  const at30 = stepFor(1, 1 / 30, forward);
  assert.ok(Math.abs(at60.pos.z - at30.pos.z) < 0.08);
});

test('zero input brakes motion predictably', () => {
  const state = createMotionState();
  for (let i = 0; i < 20; i += 1) updateMovement(state, forward, 1 / 60);
  const before = Math.hypot(state.vel.x, state.vel.z);
  for (let i = 0; i < 20; i += 1) updateMovement(state, zero, 1 / 60);
  const after = Math.hypot(state.vel.x, state.vel.z);
  assert.ok(after < before);
});

test('collision hook resolves proposed movement', () => {
  const state = createMotionState();
  updateMovement(state, forward, 1 / 60, { collision: { resolveMove: () => ({ x: 10, z: 12 }) } });
  assert.equal(state.pos.x, 10);
  assert.equal(state.pos.z, 12);
});

test('interpolation reads previous and current positions', () => {
  const state = createMotionState();
  state.prevPos.x = 0;
  state.pos.x = 10;
  assert.equal(interpolatePosition(state, 0.25).x, 2.5);
});
