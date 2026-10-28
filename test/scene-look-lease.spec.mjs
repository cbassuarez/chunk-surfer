import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import { makeThoughtScene } from '../src/game/thoughts.js';
import { InputManager } from '../src/input/input-manager.js';
import { createPointerModeController } from '../src/input/pointer-mode.js';
import {
  YARD_BENCH_ACTION, yardBenchSeatPose, yardBenchSitFrame,
  yardBenchStandFrame, yardBenchTracksMotion,
} from '../src/game/yard-bench-action.js';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
test.afterEach(() => scenes.clear());

function capturedWorld() {
  const input = new InputManager();
  const target = { id: 'map' };
  let releases = 0;
  const documentRef = {
    pointerLockElement: target, visibilityState: 'visible', hasFocus: () => true,
    exitPointerLock() { this.pointerLockElement = null; releases += 1; },
  };
  const controller = createPointerModeController({
    input, documentRef, getTargetElement: () => target,
    getState: () => ({ renderer: '3d', storyMode: true, inRogue: true,
      blocksInput: scenes.blocksInput(), blocksLook: scenes.blocksInput() && !scenes.allowsLook() }),
  });
  controller.sync('initial-play');
  const unsubscribe = scenes.subscribe(() => controller.sync('scene-change'));
  return { input, documentRef, controller, get releases() { return releases; }, unsubscribe };
}

test('a timed passive notice preserves a body-holding scene and its pointer lease', () => {
  const world = capturedWorld();
  try {
    scenes.push({ id: 'thought', blocksInput: true, allowsLook: true });
    const notice = { id: 'achievement-notice', overlay: true, blocksInput: false,
      update(dt) { if (dt >= 3.8) scenes.remove(notice); } };
    scenes.push(notice);
    assert.equal(scenes.blocksInput(), true, 'the thought still holds locomotion');
    assert.equal(scenes.allowsLook(), true, 'a passive notice does not become a look blocker');
    assert.equal(world.input.addPointerDelta(16, -7), true);
    assert.equal(world.input.pointerDx, 16);
    scenes.update(3.8);
    assert.equal(scenes.top().id, 'thought');
    assert.equal(world.releases, 0, 'expiry never requires a new capture gesture');
    assert.equal(world.input.pointerLocked, true);
  } finally { world.unsubscribe(); }
});

test('a true modal or explicit look blocker still releases the lease above passive overlays', () => {
  const world = capturedWorld();
  try {
    scenes.push({ id: 'thought', blocksInput: true, allowsLook: true });
    scenes.push({ id: 'pause', blocksInput: true });
    scenes.push({ id: 'notice', overlay: true, blocksInput: false, allowsLook: true });
    assert.equal(scenes.allowsLook(), false, 'a notice cannot lend look to a menu below');
    assert.equal(world.releases, 1);
    assert.equal(world.input.pointerLocked, false);
    scenes.clear();
    scenes.push({ id: 'thought', blocksInput: true, allowsLook: true });
    scenes.push({ id: 'explicit-look-hold', overlay: true, blocksInput: false, allowsLook: false });
    assert.equal(scenes.allowsLook(), false, 'explicit false is an authored look hold');
  } finally { world.unsubscribe(); }
});

test('the actual yard bench keeps capture across timed sitting and standing without freeing the body', () => {
  const world = capturedWorld();
  try {
    const start = main.indexOf('function sitAtYardLookBench(){');
    const end = main.indexOf('// The optional lead moved', start);
    assert.ok(start >= 0 && end > start);
    let look = { yaw: .6, pitch: .1 };
    const context = {
      scenes, YARD_BENCH_ACTION, yardBenchSeatPose, yardBenchSitFrame, yardBenchStandFrame, yardBenchTracksMotion,
      PROPS: { propById: () => ({ rx: 105, ry: 410, interactionRx: 107, interactionRy: 410, seatYaw: 1.7 }) },
      R3: { r3dLookAngles: () => look, r3dSetLookAngles: next => { look = { ...look, ...next }; } },
      FP: { floorAt: () => 0 }, SPEECH: { say() {} },
      px: 107, py: 410, trail: [], renderMove: null, motionRig: null, yardLookBenchScene: null,
      resetMotionInput() {}, revealAround() {}, flagTest: () => true,
    };
    vm.runInNewContext(`${main.slice(start, end)}\nsitAtYardLookBench();`, context);
    const bench = scenes.top();
    assert.equal(bench.view().phase, 'sitting');
    assert.equal(scenes.blocksInput(), true);
    assert.equal(scenes.tracksMotion(), false);
    assert.equal(Number.isFinite(bench.worldView().yaw), true, 'authored turn still owns the rendered view');
    assert.equal(world.input.pointerLocked, true, 'sitting must not surrender a lease the timer cannot reacquire');
    scenes.update(YARD_BENCH_ACTION.sitDuration);
    assert.equal(bench.view().phase, 'seated');
    assert.equal(bench.worldView().yaw, undefined, 'seated head control returns to ordinary look');
    assert.equal(scenes.blocksInput(), true);
    assert.equal(world.input.addPointerDelta(21, 4), true, 'mouse is live with no intervening click or key');
    assert.equal(bench.stand(), true);
    assert.equal(scenes.tracksMotion(), true, 'a fresh walk intent can survive the authored stand');
    assert.equal(scenes.blocksInput(), true);
    scenes.update(YARD_BENCH_ACTION.standDuration);
    assert.equal(scenes.blocksInput(), false);
    assert.equal(world.releases, 0);
    assert.equal(world.input.pointerLocked, true);
  } finally { world.unsubscribe(); }
});

test('actual hide/show and page lifecycle handlers release stale native ownership even without blur', () => {
  const start = main.indexOf("  document.addEventListener('visibilitychange', ()=>{");
  const end = main.indexOf("  window.addEventListener('blur',onBlur);", start);
  assert.ok(start >= 0 && end > start);
  const callbacks = new Map(), releases = [], attempts = [], recoveries = [], resets = [];
  const document = { hidden: false, hasFocus: () => true,
    addEventListener: (name, fn) => callbacks.set(name, fn) };
  const context = {
    document, window: { addEventListener: (name, fn) => callbacks.set(name, fn) },
    runPlayDurationClock: { suspend() {} },
    pointerMode: { release: reason => releases.push(reason), attemptCapture: reason => attempts.push(reason) },
    scenes: { top: () => null, pointer() {} },
    setUiCueFocused() {}, cancelLastExposure() {}, cancelApparitionApplause() {}, cancelOutskirtDoorAnswer() {}, stopTowerPersonalWorldSignal() {},
    lowerTowerPersonalRecorder() {}, cancelControlScope() {}, saveSourceView() {},
    resetMotionInput: reason => resets.push(reason), recoverInteractionFocus: reason => recoveries.push(reason),
    recoverInteractionAudio() {}, gameplayWantsPointerCapture: () => true,
    outskirtDoorAnswer: { cancel() {} }, cancelOutskirtDoorAnswer() {},
    towerPersonalHud: null, sourceShoreAudio: null, activeRecordingSlate: null, bellPealPerformance: null,
    pubRoomAudio: null, sourcePubAudio: null, sourceContinuationAudio: null, architectureDoorAudio: null,
  };
  vm.runInNewContext(main.slice(start, end), context);
  document.hidden = true;
  callbacks.get('visibilitychange')();
  assert.deepEqual(releases, ['visibility-hidden']);
  document.hidden = false;
  callbacks.get('visibilitychange')();
  callbacks.get('pagehide')();
  callbacks.get('pageshow')();
  assert.deepEqual(releases, ['visibility-hidden', 'pagehide']);
  assert.deepEqual(resets, ['visibility-hidden', 'pagehide']);
  assert.deepEqual(recoveries, ['visibility-visible', 'pageshow']);
  assert.deepEqual(attempts, ['visibility-visible', 'pageshow']);
});


test('real thought choices keep look through repeated internal branches and terminal completion', () => {
  const world = capturedWorld();
  try {
    const nodes = {
      start: { lines: [], choices: [{ text: 'Continue', goto: 'answer' }] },
      answer: { lines: [], choices: [{ text: 'Ask again', goto: 'start' }, { text: 'Finish', goto: 'done' }] },
      done: { lines: [] },
    };
    let completed = 0;
    const thought = makeThoughtScene({ id: 'lease-choice', nodes, onDone: () => completed++ });
    scenes.push(thought);
    for (let i = 0; i < 12; i++) {
      assert.equal(thought.view().nodeId, 'start');
      scenes.key({ key: 'Enter' });
      world.input.reset('scene-consumed');
      assert.equal(thought.view().nodeId, 'answer');
      assert.equal(world.input.addPointerDelta(8, -3), true, `branch ${i} preserves mouse look`);
      scenes.key({ key: '1' });
      world.input.reset('scene-consumed');
      assert.equal(world.releases, 0, 'an internal answer cannot churn pointer ownership');
      assert.equal(world.input.pointerLocked, true);
    }
    scenes.key({ key: 'Enter' });
    scenes.key({ key: '2' });
    world.input.reset('scene-consumed');
    assert.equal(completed, 1);
    assert.equal(scenes.depth(), 0);
    assert.equal(world.releases, 0);
    assert.equal(world.input.addPointerDelta(6, 2), true, 'terminal selection leaves ordinary look live');
  } finally { world.unsubscribe(); }
});

test('a terminal thought choice can open a modal child without removing the child or granting it look', () => {
  const world = capturedWorld();
  try {
    const child = { id: 'actual-modal-child', blocksInput: true };
    const thought = makeThoughtScene({ id: 'lease-child',
      nodes: { start: { lines: [], choices: [{ text: 'Read', goto: 'done' }] }, done: { lines: [] } },
      onChoice: () => scenes.push(child),
    });
    scenes.push(thought);
    scenes.key({ key: 'Enter' });
    assert.equal(scenes.top(), child);
    assert.equal(scenes.depth(), 1, 'the completed conversation removes its own scene');
    assert.equal(scenes.allowsLook(), false, 'the modal child now owns the pointer');
    assert.equal(world.releases, 1);
    assert.equal(world.input.pointerLocked, false);
  } finally { world.unsubscribe(); }
});
