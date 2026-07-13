import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../src/input/input-manager.js';
import { createMotionState, updateMovement } from '../src/player/movement-controller.js';
import { runMotionReplay } from '../src/debug/motion-replay.js';

function step(input, state, dt) {
  updateMovement(state, input.snapshot(), dt);
}

test('alt-tab while holding forward cannot leave ghost movement intent', () => {
  const input = new InputManager();
  const state = createMotionState();
  input.keyDown({ code: 'ArrowUp', target: {} });
  for (let i = 0; i < 30; i += 1) { step(input, state, 1 / 60); input.endFrame(); }
  input.reset('test-blur');
  const afterBlur = input.snapshot();
  assert.equal(afterBlur.moveY, 0);
  assert.equal(input.isHeld('ArrowUp'), false);
});

test('input replay handles missing keyup after blur and allows fresh press', () => {
  const input = new InputManager();
  const motion = createMotionState();
  const out = runMotionReplay({
    input,
    motion,
    loopStep: (dt) => updateMovement(motion, input.snapshot(), dt),
    events: [
      { type: 'keydown', code: 'ArrowUp', steps: 30, target: {} },
      { type: 'blur', steps: 20 },
      { type: 'focus', steps: 5 },
      { type: 'keydown', code: 'ArrowUp', steps: 30, target: {} },
      { type: 'keyup', code: 'ArrowUp', steps: 20, target: {} },
    ],
  });
  assert.deepEqual(out[35].held, []);
  assert.ok(out.at(-1).z > out[0].z);
});
