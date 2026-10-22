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

async function withTauriWindow(fn) {
  const prior = globalThis.window;
  globalThis.window = { __TAURI_INTERNALS__: {}, innerWidth: 1280, innerHeight: 800 };
  try { return await fn(); } finally {
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

test('body-blocking dialogue can keep the first-person look lease', () => {
  const input = new InputManager();
  const documentRef = documentStub();
  let state = { ...playing(), blocksInput: true, blocksLook: false };
  const controller = createPointerModeController({
    documentRef,
    getTargetElement: () => targetStub(),
    getState: () => state,
    input,
  });
  assert.equal(controller.wantsCapture(), true, 'dialogue holds the body, not the camera');
  state = { ...state, blocksLook: true };
  assert.equal(controller.wantsCapture(), false, 'pointer-driven menus still own the cursor');
});

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

// Model Tao's actual macOS side effect: positioning reconnects the OS cursor.
// A stub that only logs a warp cannot catch the regression that broke windowed look.
function taoWindow() {
  let grabbed=false, visible=true;
  const operations=[];
  const win={
    setCursorVisible:async value=>{visible=value;operations.push(`visible:${value}`);},
    setCursorPosition:async ()=>{grabbed=false;operations.push('position:ungrabs');},
    setCursorGrab:async value=>{grabbed=value;operations.push(`grab:${value}`);},
    isFocused:async ()=>true,
  };
  return {win,operations,get grabbed(){return grabbed;},get visible(){return visible;},
    api:{getCurrentWindow:()=>win,LogicalPosition:class {constructor(x,y){this.x=x;this.y=y;}}}};
}

test('Tao recenter is always followed by grab, including repeated edge recovery',async()=>{
  await withTauriWindow(async()=>{
    const native=taoWindow(),input=new InputManager(),clock=manualClock();
    const controller=createPointerModeController({documentRef:documentStub(),getTargetElement:()=>targetStub(),
      getState:playing,input,loadNativeWindowApi:async()=>native.api,nowFn:clock.now});
    await controller.requestCaptureFromGesture();await settle(60);
    assert.equal(native.grabbed,true);assert.equal(native.visible,false);
    assert.deepEqual(native.operations.slice(-2),['position:ungrabs','grab:true']);
    for(let i=0;i<30;i++){
      clock.advance(400);move(controller,1279,400,800,0);await settle(30);
      assert.equal(native.grabbed,true,`edge ${i} keeps OS confinement`);
      assert.equal(input.pointerDx,800*(i+1),'fast movements are neither capped nor discarded while recentering');
    }
    controller.release('pause');await settle(30);
    assert.equal(native.grabbed,false);assert.equal(native.visible,true);
    assert.equal(input.pointerDx,0);
  });
});

test('DOM lock acquisition keeps the native grab and consumes exactly one motion stream',async()=>{
  await withTauriWindow(async()=>{
    const native=taoWindow(),input=new InputManager(),doc=documentStub(),el=targetStub();
    let unlocks=0;
    const controller=createPointerModeController({documentRef:doc,getTargetElement:()=>el,getState:playing,input,
      loadNativeWindowApi:async()=>native.api,onUnexpectedUnlock:()=>unlocks++});
    await controller.requestCaptureFromGesture();await settle(60);
    const before=native.operations.length;
    doc.pointerLockElement=el;controller.handlePointerLockChange();await settle(30);
    assert.equal(native.grabbed,true);assert.equal(native.operations.length,before,'lock notification does not release and reacquire');
    const event={clientX:640,clientY:400,movementX:23,movementY:11};
    controller.handlePointerMove(event);controller.handleMouseMove(event);
    assert.equal(input.pointerDx,23);assert.equal(input.pointerDy,11);
    doc.pointerLockElement=null;controller.handlePointerLockChange();await settle(30);
    assert.equal(unlocks,1);assert.equal(native.grabbed,false);assert.equal(input.pointerLocked,false,'Escape releases both owners');
  });
});

test('a release during acquisition cannot be followed by a stale grab',async()=>{
  await withTauriWindow(async()=>{
    const native=taoWindow(),input=new InputManager();let finishHide;
    native.win.setCursorVisible=value=>value?Promise.resolve():new Promise(resolve=>{finishHide=resolve;});
    const controller=createPointerModeController({documentRef:documentStub(),getTargetElement:()=>targetStub(),getState:playing,input,
      loadNativeWindowApi:async()=>native.api});
    await controller.requestCaptureFromGesture();await settle();assert.ok(finishHide);
    controller.release('blur');finishHide();await settle(60);
    assert.equal(native.grabbed,false);assert.ok(!native.operations.includes('grab:true'));
    assert.equal(controller.isNativeCaptured(),false);assert.equal(input.pointerLocked,false);
  });
});

test('old release completes before a new capture, and idle sync does not flood IPC',async()=>{
  await withTauriWindow(async()=>{
    const native=taoWindow(),input=new InputManager();let state=playing();
    const controller=createPointerModeController({documentRef:documentStub(),getTargetElement:()=>targetStub(),getState:()=>state,input,
      loadNativeWindowApi:async()=>native.api});
    await controller.requestCaptureFromGesture();await settle(60);
    const setGrab=native.win.setCursorGrab;let finishRelease;
    native.win.setCursorGrab=value=>value?setGrab(value):new Promise(resolve=>{finishRelease=()=>{setGrab(false);resolve();};});
    controller.release('menu');await settle();assert.ok(finishRelease);
    await controller.requestCaptureFromGesture('resume');await settle();
    assert.equal(controller.isNativeCaptured(),false,'new acquisition waits for release');
    finishRelease();await settle(60);
    assert.equal(controller.isNativeCaptured(),true);assert.equal(native.grabbed,true);
    native.win.setCursorGrab=setGrab;state={...state,paused:true};
    for(let i=0;i<50;i++)controller.sync('paused-frame');
    await settle(60);const count=native.operations.length;
    for(let i=0;i<50;i++)controller.sync('paused-frame');
    await settle(30);assert.equal(native.operations.length,count);
  });
});

test('background or UI-owned windows cannot acquire native look',async()=>{
  await withTauriWindow(async()=>{
    const native=taoWindow(),doc=documentStub();doc.hasFocus=()=>false;
    const controller=createPointerModeController({documentRef:doc,getTargetElement:()=>targetStub(),getState:playing,
      input:new InputManager(),loadNativeWindowApi:async()=>native.api});
    await controller.requestCaptureFromGesture();await settle();assert.deepEqual(native.operations,[]);
    doc.hasFocus=()=>true;native.win.isFocused=async()=>false;
    await controller.requestCaptureFromGesture();await settle(60);
    assert.ok(!native.operations.includes('grab:true'));assert.equal(controller.isNativeCaptured(),false);
  });
});

function nativeFocusWindow() {
  const native = taoWindow();
  let focused = true;
  let focusHandler = null;
  let unlistened = 0;
  native.win.isFocused = async () => focused;
  native.win.onFocusChanged = async handler => {
    focusHandler = handler;
    return () => { focusHandler = null; unlistened += 1; };
  };
  return {
    ...native,
    get grabbed() { return native.grabbed; },
    get visible() { return native.visible; },
    get unlistened() { return unlistened; },
    async focus(value) {
      focused = value;
      // Rust releases the physical grab even if WebKit misses its blur event.
      if (!value) { await native.win.setCursorGrab(false); await native.win.setCursorVisible(true); }
      focusHandler?.({ payload: value });
    },
  };
}

test('native focus events retire a stale OS grab without relying on WebView blur', async () => {
  await withTauriWindow(async () => {
    const native = nativeFocusWindow(), input = new InputManager(), doc = documentStub();
    const focusChanges = [];
    const controller = createPointerModeController({ documentRef: doc, getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api,
      onNativeFocusChanged: focused => focusChanges.push(focused) });
    await controller.requestCaptureFromGesture(); await settle(60);
    assert.equal(native.grabbed, true);
    await native.focus(false); await settle(60);
    assert.equal(doc.hasFocus(), true, 'the stale WebView focus is deliberately unchanged');
    assert.equal(controller.isNativeCaptured(), false, 'JS ownership must follow the native loss');
    assert.equal(input.pointerLocked, false);
    await controller.requestCaptureFromGesture('background-key'); await settle(30);
    assert.equal(native.grabbed, false, 'a stale DOM focus cannot steal the OS cursor');
    await native.focus(true); await settle(90);
    assert.equal(controller.isNativeCaptured(), true, 'native app return restores look without a new click');
    assert.equal(native.grabbed, true);
    assert.deepEqual(focusChanges, [false, true]);
    controller.dispose(); await settle(30);
    assert.equal(native.unlistened, 1, 'disposing releases the native focus listener');
  });
});

test('native app return can restore look before WebKit reports document focus', async () => {
  await withTauriWindow(async () => {
    const native = nativeFocusWindow(), input = new InputManager(), doc = documentStub();
    let domFocused = true; doc.hasFocus = () => domFocused;
    const controller = createPointerModeController({ documentRef: doc, getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api });
    await controller.requestCaptureFromGesture(); await settle(60);
    await native.focus(false); await settle(60); domFocused = false;
    await native.focus(true); await settle(90);
    assert.equal(domFocused, false, 'native focus arrives before delayed WebView focus');
    assert.equal(native.grabbed, true); assert.equal(input.pointerLocked, true);
    controller.dispose();
  });
});

test('a transient native edge-recenter failure retries look while gameplay still owns it', async () => {
  await withTauriWindow(async () => {
    const native = taoWindow(), input = new InputManager(), timers = manualTimers(), clock = manualClock();
    const original = native.win.setCursorPosition; let failed = false;
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api,
      setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn, nowFn: clock.now });
    await controller.requestCaptureFromGesture(); await settle(60);
    native.win.setCursorPosition = async p => {
      if (!failed) { failed = true; throw new Error('temporary native IPC refusal'); }
      return original(p);
    };
    clock.advance(400); move(controller, 1279, 400, 800, 0); await settle(60);
    assert.equal(controller.isNativeCaptured(), false);
    assert.ok(timers.pending() > 0, 'a failed recenter must not leave look permanently dead');
    timers.flush(); await settle(90);
    assert.equal(controller.isNativeCaptured(), true); assert.equal(native.grabbed, true);
    controller.release('end');
  });
});

test('sync arms bounded native recovery when live gameplay has no look backend', async () => {
  await withTauriWindow(async () => {
    const native = taoWindow(), input = new InputManager(), timers = manualTimers();
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api,
      setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn });
    controller.sync('scene-cleared');
    assert.ok(timers.pending() > 0, 'live unowned look needs recovery even without another gesture');
    timers.flush(); await settle(90);
    assert.equal(controller.isNativeCaptured(), true); assert.equal(native.grabbed, true);
    controller.release('end');
  });
});

test('native focus loss during acquisition cannot finish a stale grab', async () => {
  await withTauriWindow(async () => {
    const native = nativeFocusWindow(), input = new InputManager(); let finishHide;
    native.win.setCursorVisible = value => value ? Promise.resolve() : new Promise(resolve => { finishHide = resolve; });
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api });
    await controller.requestCaptureFromGesture(); await settle(60); assert.ok(finishHide);
    await native.focus(false); finishHide(); await settle(90);
    assert.equal(native.grabbed, false); assert.equal(controller.isNativeCaptured(), false);
    assert.equal(input.pointerLocked, false); controller.dispose();
  });
});

test('native focus return beneath a menu does not steal the cursor', async () => {
  await withTauriWindow(async () => {
    const native = nativeFocusWindow(), input = new InputManager(), timers = manualTimers(); let state = playing();
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: () => state, input, loadNativeWindowApi: async () => native.api,
      setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn });
    await controller.requestCaptureFromGesture(); await settle(60);
    await native.focus(false); await settle(60); state = { ...state, paused: true };
    await native.focus(true); await settle(60);
    assert.equal(native.grabbed, false); assert.equal(timers.pending(), 0);
    state = playing(); controller.sync('menu-closed'); timers.flush(); await settle(90);
    assert.equal(native.grabbed, true); controller.dispose();
  });
});

test('native recovery stops after its bounded refusal ladder', async () => {
  await withTauriWindow(async () => {
    const native = taoWindow(), input = new InputManager(), timers = manualTimers(); let attempts = 0;
    native.win.setCursorGrab = async value => { if (value) { attempts += 1; throw new Error('temporary refusal'); } };
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api,
      setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn });
    await controller.requestCaptureFromGesture(); await settle(60);
    for (let i = 0; i < 10; i += 1) { timers.flush(); await settle(60); }
    assert.equal(attempts, 3, 'one gesture and exactly two unattended retries');
    assert.equal(timers.pending(), 0); assert.equal(input.pointerLocked, false); controller.dispose();
  });
});

test('disposing while native focus subscription loads retires the eventual listener', async () => {
  await withTauriWindow(async () => {
    const native = taoWindow(), input = new InputManager(); let finishSubscription, unlistened = 0;
    native.win.onFocusChanged = () => new Promise(resolve => { finishSubscription = () => resolve(() => { unlistened += 1; }); });
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api });
    await controller.requestCaptureFromGesture(); await settle(60); assert.ok(finishSubscription);
    controller.dispose(); finishSubscription(); await settle(90);
    assert.equal(unlistened, 1); assert.equal(native.grabbed, false);
    assert.equal(controller.isNativeCaptured(), false); assert.equal(controller.wantsCapture(), false);
  });
});

test('a failed optional native focus subscription does not disable confirmed cursor capture', async () => {
  await withTauriWindow(async () => {
    const native = taoWindow(), input = new InputManager();
    native.win.onFocusChanged = async () => { throw new Error('event registration unavailable'); };
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api });
    await controller.requestCaptureFromGesture(); await settle(90);
    assert.equal(controller.isNativeCaptured(), true); assert.equal(native.grabbed, true);
    assert.equal(controller.status().nativeBackend.focusListening, false); controller.dispose();
  });
});

test('repeated native focus cycles restore actual motion without duplicate focus callbacks', async () => {
  await withTauriWindow(async () => {
    const native = nativeFocusWindow(), input = new InputManager(); let changes = 0;
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api,
      onNativeFocusChanged: () => { changes += 1; } });
    await controller.requestCaptureFromGesture(); await settle(60);
    for (let i = 0; i < 20; i += 1) {
      await native.focus(false); await settle(60);
      await native.focus(true); await settle(90);
      await native.focus(true); await settle(30);
      input.clearPointerDeltas(); move(controller, 650, 400, 10, 0);
      assert.equal(input.pointerDx, 10, `cycle ${i} restores real camera input`);
      assert.equal(native.grabbed, true);
    }
    assert.equal(changes, 40, 'duplicate native focus notifications have no side effects'); controller.dispose();
  });
});

test('native capture watchdog replaces a DOM request that never settles', async () => {
  await withTauriWindow(async () => {
    const native = taoWindow(), input = new InputManager(), timers = manualTimers(), clock = manualClock();
    let finishRequest;
    const el = targetStub({ requestPointerLock: () => new Promise(resolve => { finishRequest = resolve; }) });
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => el,
      getState: playing, input, loadNativeWindowApi: async () => native.api,
      setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn, nowFn: clock.now });
    await controller.requestCaptureFromGesture('native-stalled-dom-request'); await settle(30);
    assert.equal(controller.isNativeCaptured(), false);
    assert.ok(timers.pending() > 0, 'an unsettled DOM Promise must have a native fallback deadline');
    clock.advance(500); timers.flush(); await settle(90);
    assert.equal(controller.isNativeCaptured(), true); assert.equal(native.grabbed, true);
    assert.equal(native.operations.filter(op => op === 'grab:true').length, 1);
    finishRequest(); await settle(60); await new Promise(resolve => setTimeout(resolve, 5)); await settle(30);
    assert.equal(controller.isNativeCaptured(), true);
    assert.equal(native.operations.filter(op => op === 'grab:true').length, 1, 'late DOM completion cannot overlap another native grab');
    controller.dispose();
  });
});

test('a stale DOM Promise cannot alter or revive a newer native capture generation', async () => {
  await withTauriWindow(async () => {
    const native = taoWindow(), input = new InputManager(), timers = manualTimers();
    let finishOldRequest, attempts = 0, state = playing();
    const el = targetStub({ requestPointerLock: () => {
      attempts += 1;
      return attempts === 1 ? new Promise(resolve => { finishOldRequest = resolve; })
        : Promise.reject(new Error('DOM unavailable; use native'));
    } });
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => el,
      getState: () => state, input, loadNativeWindowApi: async () => native.api,
      setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn });
    await controller.requestCaptureFromGesture('old-request'); await settle(30);
    state = { ...state, paused: true }; controller.release('pause'); await settle(60);
    state = playing(); await controller.requestCaptureFromGesture('new-request'); await settle(90);
    assert.equal(controller.isNativeCaptured(), true);
    const result = controller.status().backend.lastResult, count = native.operations.length;
    finishOldRequest(); await settle(60); await new Promise(resolve => setTimeout(resolve, 5)); await settle(30);
    assert.equal(controller.status().backend.lastResult, result, 'stale resolution cannot mutate the new request result');
    assert.equal(native.operations.length, count, 'stale resolution cannot issue native IPC');
    state = { ...state, paused: true }; controller.release('pause'); timers.flush(); await settle(60);
    assert.equal(native.grabbed, false); assert.equal(controller.isNativeCaptured(), false); controller.dispose();
  });
});

function nativeInvalidationWindow() {
  const native = taoWindow(); let listener = null, unlistened = 0;
  native.win.listen = async (eventName, handler) => {
    assert.equal(eventName, 'chunk-native-capture-invalidated');
    listener = handler;
    return () => { listener = null; unlistened += 1; };
  };
  return { ...native, get grabbed() { return native.grabbed; }, get unlistened() { return unlistened; },
    async invalidate(reason) {
      await native.win.setCursorGrab(false); await native.win.setCursorVisible(true);
      listener?.({ payload: { reason } });
    } };
}

test('a delayed native Source cleanup invalidates and recovers the live gameplay grab', async () => {
  await withTauriWindow(async () => {
    const native = nativeInvalidationWindow(), input = new InputManager(), timers = manualTimers();
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api,
      setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn });
    await controller.requestCaptureFromGesture(); await settle(60);
    assert.equal(native.grabbed, true);
    await native.invalidate('source-desktop-end'); await settle(60);
    assert.equal(controller.isNativeCaptured(), false, 'Rust ungrab retires the stale JS lease even without focus loss');
    assert.equal(input.pointerLocked, false); assert.ok(timers.pending() > 0);
    timers.flush(); await settle(90);
    assert.equal(native.grabbed, true); assert.equal(controller.isNativeCaptured(), true);
    const status = controller.status().nativeBackend;
    assert.equal(status.captureInvalidationListening, true); assert.equal(status.captureInvalidations, 1);
    assert.equal(status.lastCaptureInvalidationReason, 'source-desktop-end');
    controller.dispose(); await settle(30); assert.equal(native.unlistened, 1);
  });
});

test('native Source cleanup beneath a modal retires capture without reacquiring it', async () => {
  await withTauriWindow(async () => {
    const native = nativeInvalidationWindow(), input = new InputManager(), timers = manualTimers(); let state = playing();
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: () => state, input, loadNativeWindowApi: async () => native.api,
      setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn });
    await controller.requestCaptureFromGesture(); await settle(60);
    state = { ...state, blocksLook: true }; await native.invalidate('source-desktop-begin'); await settle(60);
    assert.equal(native.grabbed, false); assert.equal(controller.isNativeCaptured(), false);
    assert.equal(timers.pending(), 0, 'a native presentation still owns its UI cursor');
    controller.dispose();
  });
});

test('disposing while native invalidation listener loads retires the eventual subscription', async () => {
  await withTauriWindow(async () => {
    const native = taoWindow(), input = new InputManager(); let finishSubscription, unlistened = 0;
    native.win.listen = () => new Promise(resolve => { finishSubscription = () => resolve(() => { unlistened += 1; }); });
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api });
    await controller.requestCaptureFromGesture(); await settle(60); assert.ok(finishSubscription);
    controller.dispose(); finishSubscription(); await settle(90);
    assert.equal(unlistened, 1); assert.equal(native.grabbed, false);
    assert.equal(controller.isNativeCaptured(), false); assert.equal(controller.wantsCapture(), false);
  });
});

test('initial confirmed native focus survives delayed WebKit blur until a native focus loss', async () => {
  await withTauriWindow(async () => {
    const native = nativeFocusWindow(), input = new InputManager(), doc = documentStub();
    let domFocused = true; doc.hasFocus = () => domFocused;
    const controller = createPointerModeController({ documentRef: doc, getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api });
    await controller.requestCaptureFromGesture(); await settle(90);
    assert.equal(controller.status().nativeBackend.focused, true, 'successful native isFocused seeds initial ownership');
    domFocused = false; controller.sync('dialogue-WebKit-focus-delay'); await settle(30);
    assert.equal(controller.isNativeCaptured(), true, 'a stale DOM blur cannot revoke confirmed OS ownership');
    input.clearPointerDeltas(); move(controller, 650, 400, 10, 0);
    assert.equal(input.pointerDx, 10);
    await native.focus(false); await settle(60);
    assert.equal(controller.isNativeCaptured(), false, 'a delivered native blur still releases immediately');
    assert.equal(native.grabbed, false); controller.dispose();
  });
});

test('an initial native focus query cannot overwrite a delivered native blur', async () => {
  await withTauriWindow(async () => {
    const native = nativeFocusWindow(), input = new InputManager(); let finishFocus;
    native.win.isFocused = () => new Promise(resolve => { finishFocus = () => resolve(true); });
    const controller = createPointerModeController({ documentRef: documentStub(), getTargetElement: () => targetStub(),
      getState: playing, input, loadNativeWindowApi: async () => native.api });
    await controller.requestCaptureFromGesture(); await settle(60); assert.ok(finishFocus);
    await native.focus(false); finishFocus(); await settle(90);
    assert.equal(controller.status().nativeBackend.focused, false);
    assert.equal(controller.isNativeCaptured(), false); assert.equal(native.grabbed, false); controller.dispose();
  });
});
