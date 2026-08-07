import test from 'node:test';
import assert from 'node:assert/strict';
import { createPointerModeController } from '../src/input/pointer-mode.js';
import { InputManager } from '../src/input/input-manager.js';

// A windowed desktop build is the case every one of these covers: no DOM
// pointer lock, a native cursor grab instead, and a title bar between the two
// coordinate spaces.
const TITLE_BAR_PX = 28;

function classListStub() {
  const set = new Set();
  return {
    toggle(name, on) { if (on) set.add(name); else set.delete(name); },
    contains(name) { return set.has(name); },
    has: (name) => set.has(name),
  };
}

function documentStub({ pointerLockElement = null } = {}) {
  return {
    pointerLockElement,
    body: { classList: classListStub() },
    hasFocus: () => true,
    visibilityState: 'visible',
    exitPointerLock() { this.pointerLockElement = null; },
  };
}

function targetStub({ width = 1280, height = 800, requestPointerLock = null } = {}) {
  const el = {
    id: 'map',
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
  };
  if (requestPointerLock) el.requestPointerLock = requestPointerLock;
  return el;
}

function manualTimers() {
  const queued = [];
  return {
    setTimeoutFn(fn, ms) { queued.push({ fn, ms }); return queued.length; },
    clearTimeoutFn(id) { if (queued[id - 1]) queued[id - 1].fn = null; },
    pending() { return queued.filter((t) => t.fn).length; },
    flush() {
      const due = queued.filter((t) => t.fn);
      for (const t of due) { const fn = t.fn; t.fn = null; fn(); }
      return due.length;
    },
  };
}

function manualClock() {
  let value = 0;
  return {
    now: () => value,
    advance(ms) { value += ms; return value; },
  };
}

// The OS moves the cursor to the requested point measured from the WINDOW
// origin; the web view reports clientY measured from below the title bar. The
// cursor therefore lands `TITLE_BAR_PX` above the point we asked for.
function nativeWindowStub({ titleBar = TITLE_BAR_PX } = {}) {
  const calls = { grab: [], visible: [], positions: [] };
  const win = {
    setCursorGrab(v) { calls.grab.push(v); return Promise.resolve(); },
    setCursorVisible(v) { calls.visible.push(v); return Promise.resolve(); },
    setCursorPosition(p) { calls.positions.push(p); return Promise.resolve(); },
  };
  return {
    calls,
    landingFor(requested) { return { x: requested.x, y: requested.y - titleBar }; },
    api: { getCurrentWindow: () => win, LogicalPosition: function LogicalPosition(x, y) { this.x = x; this.y = y; } },
  };
}

function withTauriWindow(fn) {
  const prior = globalThis.window;
  globalThis.window = { __TAURI_INTERNALS__: {}, innerWidth: 1280, innerHeight: 800 };
  try { return fn(); } finally {
    if (prior === undefined) delete globalThis.window;
    else globalThis.window = prior;
  }
}

// The capture path is a chain of awaited native calls; let it run out.
async function settle(turns = 24) {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

function playing() {
  return { renderer: '3d', storyMode: true, inRogue: true, paused: false, blocksInput: false };
}

async function nativeCaptured({ input, timers, clock = manualClock() }) {
  const native = nativeWindowStub();
  const documentRef = documentStub();
  const controller = createPointerModeController({
    documentRef,
    getTargetElement: () => targetStub(),
    getState: playing,
    input,
    loadNativeWindowApi: async () => native.api,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    nowFn: clock.now,
  });
  // No requestPointerLock on the target: the windowed web view has none, so the
  // controller must fall through to the native cursor backend.
  await controller.requestCaptureFromGesture('test-gesture');
  await settle();
  assert.equal(controller.isNativeCaptured(), true, 'native capture should be established');
  return { controller, native, documentRef, clock };
}

// Feed the move event the OS produces after each recenter, then whatever the
// hand did. `at` is a client-space point.
function move(controller, x, y, movementX, movementY) {
  const event = { clientX: x, clientY: y };
  if (movementX !== undefined) event.movementX = movementX;
  if (movementY !== undefined) event.movementY = movementY;
  return controller.handlePointerMove(event);
}

test('native cursor capture ignores its absolute title-bar offset', async () => {
  await withTauriWindow(async () => {
    const input = new InputManager();
    const timers = manualTimers();
    const { controller, native, clock } = await nativeCaptured({ input, timers });

    assert.equal(controller.isNativeCaptured(), true, 'native backend should be live');
    assert.ok(native.calls.positions.length >= 1, 'capture must recenter the cursor');
    const landing = native.landingFor(native.calls.positions[0]);
    assert.deepEqual(landing, { x: 640, y: 400 - TITLE_BAR_PX });

    // The native setCursorPosition echo is transport, not look intent.
    move(controller, landing.x, landing.y, 0, -TITLE_BAR_PX);
    clock.advance(100);

    const status = controller.status();
    assert.equal(status.nativeBackend.calibrated, true);
    assert.deepEqual(status.nativeBackend.bias, { x: 0, y: -TITLE_BAR_PX });
    assert.equal(input.pointerDy, 0);
  });
});

test('a still hand produces no look drift in windowed or fullscreen coordinates', async () => {
  await withTauriWindow(async () => {
    const input = new InputManager();
    const timers = manualTimers();
    const { controller, native, clock } = await nativeCaptured({ input, timers });
    const landing = native.landingFor(native.calls.positions[0]);
    move(controller, landing.x, landing.y, 0, -TITLE_BAR_PX);
    clock.advance(100);

    for (let i = 0; i < 40; i += 1) move(controller, landing.x, landing.y, 0, 0);
    for (let i = 0; i < 40; i += 1) move(controller, 640, 400, 0, 0);

    assert.equal(input.pointerDy, 0, 'stationary cursor must not pitch the camera');
    assert.equal(input.pointerDx, 0);
  });
});

test('native relative movement reaches look with DOM-pointer-lock parity', async () => {
  await withTauriWindow(async () => {
    const input = new InputManager();
    const timers = manualTimers();
    const { controller, native, clock } = await nativeCaptured({ input, timers });
    const landing = native.landingFor(native.calls.positions[0]);
    move(controller, landing.x, landing.y, 0, -TITLE_BAR_PX);
    clock.advance(100);
    input.clearPointerDeltas();

    move(controller, landing.x + 10, landing.y, 10, 0);
    assert.equal(input.pointerDx, 10, 'moving right must yaw right in CSS-pixel units');
    assert.equal(input.pointerDy, 0, 'moving right must not pitch');

    input.clearPointerDeltas();
    move(controller, landing.x + 10, landing.y + 10, 0, 10);
    assert.equal(input.pointerDy, 10, 'moving down must pitch down');
    assert.equal(controller.status().nativeBackend.relativeEvents, 2);
  });
});

test('a hand that returns to where it started leaves the camera where it started', async () => {
  await withTauriWindow(async () => {
    const input = new InputManager();
    const timers = manualTimers();
    const { controller, native, clock } = await nativeCaptured({ input, timers });
    const landing = native.landingFor(native.calls.positions[0]);
    move(controller, landing.x, landing.y, 0, -TITLE_BAR_PX);
    clock.advance(100);
    input.clearPointerDeltas();

    let pitch = 0;
    let yaw = 0;
    const drain = () => { pitch += input.pointerDy; yaw += input.pointerDx; input.clearPointerDeltas(); };
    for (let i = 0; i < 12; i += 1) { move(controller, landing.x, landing.y, 3, 4); drain(); }
    assert.ok(pitch > 0, 'the camera has to actually move');
    for (let i = 0; i < 12; i += 1) { move(controller, landing.x, landing.y, -3, -4); drain(); }

    assert.ok(Math.abs(pitch) < 1, `pitch returned to level, got ${pitch}`);
    assert.ok(Math.abs(yaw) < 1, `yaw returned to centre, got ${yaw}`);
  });
});

test('absolute-coordinate changes cannot move a relative native camera', async () => {
  await withTauriWindow(async () => {
    const input = new InputManager();
    const timers = manualTimers();
    const { controller, native, clock } = await nativeCaptured({ input, timers });
    const landing = native.landingFor(native.calls.positions[0]);
    move(controller, landing.x, landing.y, 0, -TITLE_BAR_PX);
    clock.advance(100);
    move(controller, 320, 200, 0, 0);

    assert.equal(controller.isNativeCaptured(), true);
    assert.equal(input.pointerDx, 0);
    assert.equal(input.pointerDy, 0);
  });
});

test('old WebViews fall back to event-to-event displacement, never centre offset', async () => {
  await withTauriWindow(async () => {
    const input = new InputManager();
    const timers = manualTimers();
    const { controller, native, clock } = await nativeCaptured({ input, timers });
    const landing = native.landingFor(native.calls.positions[0]);
    move(controller, landing.x, landing.y);
    clock.advance(100);
    move(controller, landing.x, landing.y);
    assert.equal(input.pointerDy, 0, 'the title-bar offset cancels between events');
    move(controller, landing.x + 4, landing.y - 3);
    assert.equal(input.pointerDx, 4);
    assert.equal(input.pointerDy, -3);
  });
});

test('key repeat cannot cancel the capture request already in flight', async () => {
  const input = new InputManager();
  const timers = manualTimers();
  const documentRef = documentStub();
  // A request that never settles is exactly the window in which key repeat used
  // to fire a new one every few milliseconds.
  const controller = createPointerModeController({
    documentRef,
    getTargetElement: () => targetStub({ requestPointerLock: () => new Promise(() => {}) }),
    getState: playing,
    input,
    loadNativeWindowApi: async () => { throw new Error('not tauri'); },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  for (let i = 0; i < 12; i += 1) await controller.requestCaptureFromGesture('keydown-repeat');

  assert.equal(controller.status().backend.requests, 1, 'one attempt owns the lease');
});

test('a real click supersedes a gesture-less capture request', async () => {
  const input = new InputManager();
  const timers = manualTimers();
  const clock = manualClock();
  const documentRef = documentStub();
  let attempts = 0;
  const controller = createPointerModeController({
    documentRef,
    getTargetElement: () => targetStub({
      requestPointerLock: () => { attempts += 1; return new Promise(() => {}); },
    }),
    getState: playing,
    input,
    loadNativeWindowApi: async () => { throw new Error('not tauri'); },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    nowFn: clock.now,
  });

  await controller.attemptCapture('window-focus', { gesture: false });
  await controller.requestCaptureFromGesture('world-pointerdown');

  assert.equal(attempts, 2, 'the click must own a fresh browser request');
  assert.equal(controller.status().backend.lastRequestGesture, true);
});

test('a refused pointer lock retries itself instead of waiting for another click', async () => {
  const input = new InputManager();
  const timers = manualTimers();
  const documentRef = documentStub();
  let attempts = 0;
  const controller = createPointerModeController({
    documentRef,
    getTargetElement: () => targetStub({
      requestPointerLock: () => {
        attempts += 1;
        // What a browser does for about a second after the player pressed
        // Escape to leave the previous lock — which is how long a pause menu
        // takes to dismiss.
        if (attempts === 1) return Promise.reject(Object.assign(new Error('locked out'), { name: 'SecurityError' }));
        documentRef.pointerLockElement = null;
        return Promise.resolve();
      },
    }),
    getState: playing,
    input,
    loadNativeWindowApi: async () => { throw new Error('not tauri'); },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  await controller.requestCaptureFromGesture('pause-exit');
  await settle();

  assert.equal(attempts, 1);
  assert.ok(timers.pending() > 0, 'a refusal must leave a retry armed');

  timers.flush();
  await settle();
  assert.equal(attempts, 2, 'the retry must ask again with no new gesture');
});

test('releasing the lease disarms pending retries', async () => {
  const input = new InputManager();
  const timers = manualTimers();
  const documentRef = documentStub();
  const controller = createPointerModeController({
    documentRef,
    getTargetElement: () => targetStub({
      requestPointerLock: () => Promise.reject(Object.assign(new Error('nope'), { name: 'SecurityError' })),
    }),
    getState: playing,
    input,
    loadNativeWindowApi: async () => { throw new Error('not tauri'); },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  await controller.requestCaptureFromGesture('world-pointerdown');
  await settle();
  assert.ok(timers.pending() > 0);

  controller.release('window-blur');
  assert.equal(timers.pending(), 0, 'blur must not leave the game reaching for the cursor');
});
