import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/progression/schema.js';
import {
  CONTROL_MODES, normalizeControlMode, keyboardMotionAxes, keyboardLookAxes, keyboardCodeRole,
} from '../src/input/input-manager.js';

test('there is exactly one control scheme, and old saved modes collapse into it', () => {
  assert.deepEqual(CONTROL_MODES, ['direct']);
  assert.equal(DEFAULT_SETTINGS.controlMode, 'direct');
  assert.equal(normalizeSettings({}).controlMode, 'direct');
  // Every retired mode repairs forward rather than stranding an old save in a
  // scheme the game no longer implements.
  for (const legacy of ['classic', 'independent-wasd', 'independent-arrows', 'free-flight']) {
    assert.equal(normalizeSettings({ controlMode: legacy }).controlMode, 'direct');
    assert.equal(normalizeControlMode(legacy), 'direct');
  }
});

test('both key sets walk, and A/D strafe instead of turning', () => {
  const held = (...codes) => new Set(codes);
  assert.deepEqual(keyboardMotionAxes(held('KeyW')), { moveX: 0, moveY: 1 });
  assert.deepEqual(keyboardMotionAxes(held('ArrowUp')), { moveX: 0, moveY: 1 });
  assert.deepEqual(keyboardMotionAxes(held('KeyS')), { moveX: 0, moveY: -1 });
  assert.deepEqual(keyboardMotionAxes(held('ArrowDown')), { moveX: 0, moveY: -1 });
  // Strafe, on both bindings, with no turn component anywhere.
  assert.deepEqual(keyboardMotionAxes(held('KeyD')), { moveX: 1, moveY: 0 });
  assert.deepEqual(keyboardMotionAxes(held('ArrowRight')), { moveX: 1, moveY: 0 });
  assert.deepEqual(keyboardMotionAxes(held('KeyA')), { moveX: -1, moveY: 0 });
  assert.deepEqual(keyboardMotionAxes(held('ArrowLeft')), { moveX: -1, moveY: 0 });
  // Opposed keys cancel; diagonals hold both axes.
  assert.deepEqual(keyboardMotionAxes(held('KeyA', 'KeyD')), { moveX: 0, moveY: 0 });
  assert.deepEqual(keyboardMotionAxes(held('KeyW', 'KeyD')), { moveX: 1, moveY: 1 });
});

test('the keyboard never aims: looking belongs to the mouse and the right stick', () => {
  for (const code of ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyW', 'ArrowUp']) {
    assert.equal(keyboardCodeRole(code), 'move', `${code} must move, never turn or look`);
  }
  assert.equal(keyboardCodeRole('KeyQ'), null);
  assert.deepEqual(keyboardLookAxes(new Set(['ArrowLeft', 'KeyD'])), { turnX: 0, lookY: 0 });
});

test('mouse look settings are bounded and persist', () => {
  assert.equal(DEFAULT_SETTINGS.mouseSensitivity, 1);
  assert.equal(DEFAULT_SETTINGS.mouseInvertY, false);
  assert.equal(normalizeSettings({ mouseSensitivity: 9 }).mouseSensitivity, 3);
  assert.equal(normalizeSettings({ mouseSensitivity: 0 }).mouseSensitivity, 0.2);
  assert.equal(normalizeSettings({ mouseSensitivity: 'x' }).mouseSensitivity, 1);
  assert.equal(normalizeSettings({ mouseInvertY: true }).mouseInvertY, true);
});
