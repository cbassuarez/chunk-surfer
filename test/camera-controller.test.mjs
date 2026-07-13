import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionState } from '../src/player/movement-controller.js';
import { updateCameraVisual, shortestAngle, snapCameraVisual } from '../src/player/camera-controller.js';

test('visual camera approaches target without overshoot', () => {
  const state = createMotionState({ yaw: 0 });
  state.targetYaw = Math.PI / 2;
  let last = state.visualYaw;
  for (let i = 0; i < 60; i += 1) {
    updateCameraVisual(state, 1 / 60);
    assert.ok(state.visualYaw >= last - 1e-9);
    assert.ok(state.visualYaw <= state.targetYaw + 1e-9);
    last = state.visualYaw;
  }
});

test('shortestAngle wraps across the pi boundary', () => {
  assert.ok(Math.abs(shortestAngle(Math.PI * 3) - Math.PI) < 1e-9);
  assert.ok(Math.abs(shortestAngle(-Math.PI * 3) + Math.PI) < 1e-9);
});

test('snapCameraVisual makes render and target equal', () => {
  const state = createMotionState({ yaw: 0 });
  state.targetYaw = 2;
  state.targetPitch = 0.4;
  snapCameraVisual(state);
  assert.equal(state.visualYaw, 2);
  assert.equal(state.visualPitch, 0.4);
});
