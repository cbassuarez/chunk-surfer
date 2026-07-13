import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager, keyboardAxes, movementCodeForEvent, keyToCode, deadzone } from '../src/input/input-manager.js';

function fakeTarget() {
  const listeners = new Map();
  return {
    visibilityState: 'visible',
    pointerLockElement: null,
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      listeners.set(type, (listeners.get(type) || []).filter((x) => x !== fn));
    },
    dispatch(type, event = {}) {
      for (const fn of listeners.get(type) || []) fn(event);
    },
  };
}

test('normalizes key and code for movement', () => {
  assert.equal(keyToCode('w'), 'KeyW');
  assert.equal(movementCodeForEvent({ key: 'w' }), 'KeyW');
  assert.equal(movementCodeForEvent({ code: 'ArrowUp' }), 'ArrowUp');
});

test('held keys are state, not key-repeat pulses', () => {
  const target = fakeTarget();
  const doc = fakeTarget();
  const input = new InputManager({ target, documentRef: doc, attachEvents: true });

  target.dispatch('keydown', { code: 'ArrowUp', target: {} });
  target.dispatch('keydown', { code: 'ArrowUp', repeat: true, target: {} });

  assert.equal(input.isHeld('ArrowUp'), true);
  assert.deepEqual([...input.justPressed], ['ArrowUp']);
});

test('keyup clears held state and creates a release edge', () => {
  const input = new InputManager();
  input.keyDown({ code: 'KeyW', target: {} });
  input.endFrame();
  input.keyUp({ code: 'KeyW', target: {} });

  assert.equal(input.isHeld('KeyW'), false);
  assert.equal(input.wasReleased('KeyW'), true);
});

test('blur clears held keys and pointer deltas', () => {
  const target = fakeTarget();
  const doc = fakeTarget();
  const input = new InputManager({ target, documentRef: doc, attachEvents: true });

  target.dispatch('keydown', { code: 'ArrowUp', target: {} });
  input.pointerDx = 10;
  input.pointerDy = -4;

  target.dispatch('blur');

  assert.equal(input.isHeld('ArrowUp'), false);
  assert.equal(input.pointerDx, 0);
  assert.equal(input.pointerDy, 0);
  assert.equal(input.lastResetReason, 'window-blur');
});

test('snapshot creates continuous axes from held state after edge frame clears', () => {
  const input = new InputManager();
  input.keyDown({ code: 'ArrowUp', target: {} });
  assert.equal(input.snapshot().moveY, 1);
  input.endFrame();
  assert.equal(input.snapshot().moveY, 1);
  assert.equal(input.justPressed.size, 0);
});

test('keyboard axes support first-person turn and forward contracts', () => {
  const held = new Set(['ArrowRight', 'KeyW']);
  assert.deepEqual(keyboardAxes(held), { moveX: 0, moveY: 1, turnX: 1 });
});

test('deadzone renormalizes analog input', () => {
  assert.equal(deadzone(0.05), 0);
  assert.ok(deadzone(0.5) > 0);
  assert.ok(deadzone(-0.5) < 0);
});

test('reset timestamps allow focus recovery to preserve fresh post-blur keydown', async () => {
  const input = new InputManager();
  input.reset('window-blur');
  const resetAt = input.lastResetAt;
  await new Promise((resolve) => setTimeout(resolve, 1));
  input.keyDown({ code: 'ArrowUp', target: {} });
  assert.ok(input.lastKeyAt > resetAt);
  assert.ok(input.lastKeyAt > input.lastResetAt);
});
