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
  assert.match(src, /if\(wasBlockingScene&&!scenes\.tracksMotion\(\)\) resetMotionInput\('scene-consumed'/);
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

test('sustained movement does not mistake accumulated spring lag for a teleport', () => {
  const src = readFileSync('src/main.js', 'utf8');
  const start = src.indexOf('function renderedPlayerPoint');
  const end = src.indexOf('function beginRenderStep', start);
  const body = src.slice(start, end);
  const teleportDecision = body.slice(0, body.indexOf('const dt='));
  assert.ok(start >= 0 && end > start);
  assert.match(body, /targetJump=Math\.hypot\(target\.x-rig\.targetX,target\.z-rig\.targetZ\)/);
  assert.match(body, /if\(targetJump>D\(3\.25\)\)/);
  assert.doesNotMatch(teleportDecision, /Math\.hypot\(target\.x-rig\.x,target\.z-rig\.z\)/,
    'camera lag is not a world teleport signal');
});

test('a blocking tableau may retain look without retaining locomotion', () => {
  const main = readFileSync('src/main.js', 'utf8');
  const scenes = readFileSync('src/game/scenes.js', 'utf8');
  assert.match(scenes, /export function allowsLook\(\)/);
  assert.match(main, /scenes\.blocksInput\(\)&&!scenes\.allowsLook\(\)/);
  assert.match(main, /!scenes\.blocksInput\(\)\|\|scenes\.allowsLook\(\)/);
  assert.match(main, /!scenes\.blocksInput\(\)\|\|scenes\.tracksMotion\(\)/, 'movement remains on the separate tracksMotion contract');
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

test('the original world click owns capture before scene routing', () => {
  const src = readFileSync('src/main.js', 'utf8');
  const start = src.indexOf('function onPointerEvent(e)');
  const end = src.indexOf('// ── Boot', start);
  const body = src.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(
    body.indexOf("ensurePointerLock('world-pointerdown')") < body.indexOf('scenes.pointer('),
    'scene handling must not consume the capture gesture first',
  );
});

test('window focus does not start a gesture-less pointer lock request', () => {
  const src = readFileSync('src/main.js', 'utf8');
  const start = src.indexOf("window.addEventListener('focus'");
  const end = src.indexOf("document.addEventListener('visibilitychange'", start);
  const focusHandler = src.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(focusHandler, /ensurePointerLock\(/);
});

test('capture and fullscreen recovery level both current and target pitch', () => {
  const main = readFileSync('src/main.js', 'utf8');
  const render = readFileSync('src/render/r3d.js', 'utf8');
  // The call site asks for pitch; `immediate` became the renderer's default and
  // the explicit argument was dropped. Matching the old literal string was
  // therefore failing on a call that behaves identically — so assert the
  // guarantee instead: recovery recentres pitch, immediacy is the default it
  // relies on, and immediate recentring levels the live value as well as the
  // target. A future change to that default now fails here, which the old
  // string match could not have caught either.
  assert.match(main, /r3dRecenterLook\?\.\(\{\s*pitch:\s*true[^)]*\}\)/);
  assert.match(render, /immediate\s*=\s*true/, 'immediate recentring is the default the call site omits');
  assert.match(render, /if \(resetPitch\) pitch = pitchTarget/);
});
