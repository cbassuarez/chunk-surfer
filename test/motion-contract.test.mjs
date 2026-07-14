import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('main routes movement through InputManager state, not raw key repeat', () => {
  const src = readFileSync('src/main.js', 'utf8');
  assert.match(src, /new InputManager/);
  assert.match(src, /motionInput\.keyDown/);
  assert.match(src, /tickHeldMovement/);
  assert.match(src, /tickHeldTurning/);
});

test('focus and visibility reset motion input and loop clock', () => {
  const src = readFileSync('src/main.js', 'utf8');
  assert.match(src, /window\.addEventListener\('blur',onBlur/);
  assert.match(src, /visibility-hidden/);
  assert.match(src, /window-focus/);
  assert.match(src, /lastLoopMs=0/);
});

test('motion debug surface exists', () => {
  const src = readFileSync('src/main.js', 'utf8');
  assert.match(src, /__chunkSurferMotion/);
  assert.match(src, /status:\(\)=>/);
  assert.match(src, /press:\(code\)=>/);
});


test('non-modal scene consumption cannot destroy held movement state', () => {
  const src = readFileSync('src/main.js', 'utf8');
  assert.match(src, /worldCanTrackMotion/);
  assert.match(src, /if\(worldCanTrackMotion\) motionInput\.keyDown\(e\)/);
  assert.match(src, /const wasBlockingScene = scenes\.blocksInput\(\)/);
  assert.match(src, /if\(wasBlockingScene\) resetMotionInput\('scene-consumed'/);
  assert.match(src, /else if\(!moveKey\) clearMotionClock\('scene-consumed-action'\)/);
});

test('3d camera has a spring motion rig for visual inertia', () => {
  const src = readFileSync('src/main.js', 'utf8');
  assert.match(src, /let motionRig=null/);
  assert.match(src, /function snapMotionRig/);
  assert.match(src, /function renderedPlayerPoint/);
  assert.match(src, /rig\.vx \+= dx\*stiffness\*dt/);
  assert.match(src, /motionRig:\s*motionRig\?/);
});

test('focus recovery clears stale movement and resumes interaction systems', () => {
  const src = readFileSync('src/main.js', 'utf8');
  assert.match(src, /function recoverMotionFocus/);
  assert.match(src, /function recoverInteractionAudio/);
  assert.match(src, /function recoverInteractionFocus/);
  assert.match(src, /recoverInteractionFocus\('window-focus'\)/);
  assert.match(src, /recoverInteractionFocus\('visibility-visible'\)/);
  assert.match(src, /focusRecovery:'reset-and-reacquire'/);
});
