// Central pointer/cursor ownership for first-person play.
//
// Pointer ownership is a gameplay lease, not a renderer/window/menu state.
// Valid camera-look backends are:
//   1. DOM Pointer Lock on the gameplay surface.
//   2. Confirmed Tauri native cursor grab + hide + recenter.
//
// There is deliberately no drag-look fallback: in Chunk Surfer, clicking is
// interaction. If DOM pointer lock and confirmed native capture are unavailable,
// the cursor remains UI-owned and mouse-look stays disabled.

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function errorName(err) {
  if (!err) return '';
  return err.name || err.message || String(err);
}

function clampDelta(v, limit = 140) {
  const n = Number(v) || 0;
  if (!Number.isFinite(n)) return 0;
  return Math.max(-limit, Math.min(limit, n));
}

const REQUIRED_TAURI_CURSOR_PERMISSIONS = Object.freeze([
  'core:window:allow-set-cursor-visible',
  'core:window:allow-set-cursor-grab',
  'core:window:allow-set-cursor-position',
]);

function tauriRuntime() {
  const w = globalThis.window;
  return !!(w && ('__TAURI_INTERNALS__' in w || '__TAURI__' in w || w.location?.protocol === 'tauri:' || w.location?.hostname === 'tauri.localhost'));
}

function pointFromEvent(e = {}) {
  return { x: Number(e.clientX) || 0, y: Number(e.clientY) || 0 };
}

// A gesture-driven capture request can be refused for reasons that have nothing
// to do with the gesture: browsers reject requestPointerLock for roughly a
// second after the user pressed Escape to leave a previous lock, which is
// exactly how long it takes to dismiss a pause menu and ask again. Retrying on
// a timer costs nothing and turns "the camera is dead until I click" into a
// pause that nobody notices.
const CAPTURE_RETRY_DELAYS_MS = Object.freeze([420, 1400]);
// A request already in flight owns the attempt. Key repeat fires keydown many
// times per second, and a fresh request per repeat used to invalidate the
// previous one forever: holding W meant never regaining the camera.
const CAPTURE_REQUEST_TTL_MS = 500;

export function createPointerModeController({
  documentRef = globalThis.document || null,
  getTargetElement = () => null,
  getState = () => ({}),
  input = null,
  onUnexpectedUnlock = () => {},
  allowSoftCaptureFallback = true,
  loadNativeWindowApi = () => import('@tauri-apps/api/window'),
  setTimeoutFn = (fn, ms) => globalThis.setTimeout?.(fn, ms),
  clearTimeoutFn = (id) => globalThis.clearTimeout?.(id),
  nowFn = nowMs,
} = {}) {
  const timeNow = () => Number(nowFn?.()) || 0;
  let desiredMode = 'ui';
  let lastMode = 'ui';
  let lastReason = 'init';
  let expectedUnlockReason = null;
  let wasLocked = false;
  let captureGeneration = 0;

  const backend = {
    kind: 'pointer-lock',
    lastRequestAt: 0,
    lastRequestReason: '',
    lastRequestGesture: false,
    lastError: null,
    lastErrorAt: 0,
    lastResult: 'idle',
    fallbackReason: null,
    requests: 0,
    errors: 0,
  };

  const native = {
    kind: 'tauri-native-cursor',
    attempted: false,
    available: null,
    active: false,
    pending: false,
    calibrated: false,
    calibrationPending: false,
    calibrationFailed: false,
    coordinateSpace: 'unverified-client',
    generation: 0,
    windowApi: null,
    win: null,
    error: null,
    errorAt: 0,
    fatalReason: '',
    permissionHint: '',
    center: { x: 0, y: 0 },
    lastCenterAt: 0,
    // Where a native recenter actually landed, retained for diagnostics only.
    // Camera input never derives from this absolute offset.
    bias: { x: 0, y: 0 },
    recenterPending: false,
    recenterGeneration: 0,
    recenterAt: 0,
    recenterCount: 0,
    ignoredRecenters: 0,
    calibrationRecenters: 0,
    calibrationSample: null,
    lastAppliedOffset: null,
    echoesAtLastApply: -1,
    moves: 0,
    addedDeltas: 0,
    lastMoveAt: 0,
    lastClient: { x: 0, y: 0 },
    hasLastClient: false,
    lastOffset: { dx: 0, dy: 0 },
    lastAppliedDelta: { dx: 0, dy: 0 },
    lastDeltaReason: '',
    // Native PointerEvents expose the same CSS-pixel movementX/Y units as DOM
    // pointer lock. Keeping the gain at one makes the two backends feel alike.
    gain: 1,
    deadzone: 0.10,
    suppressMovementUntil: 0,
    relativeEvents: 0,
    absoluteFallbackEvents: 0,
    // A synthetic recenter event may take an IPC round trip to come back.
    echoWindowMs: 350,
    // The jump a pending recenter is about to make, so its echo can be
    // recognised by shape instead of by arrival time. Null when none is owed.
    expectedEcho: null,
    // Retained in the debug snapshot for compatibility with older diagnostics.
    echoRadiusPx: 6,
    // Legacy absolute-calibration counters retained for support snapshots.
    driftStrikes: 0,
    maxDriftStrikes: 6,
    mismatchFloorPx: 64,
    mismatchFraction: 0.25,
    maxCalibrationRecenters: 8,
  };

  const drag = {
    kind: 'degraded-drag-look',
    active: false,
    pointerId: null,
    target: null,
    moves: 0,
    addedDeltas: 0,
    lastMoveAt: 0,
    lastAppliedDelta: { dx: 0, dy: 0 },
    lastDeltaReason: '',
    gain: 3.2,
  };

  const retry = {
    timer: null,
    attempts: 0,
    reason: '',
    scheduledAt: 0,
    fired: 0,
  };

  function state() { return getState?.() || {}; }

  function wantsCapture() {
    const s = state();
    return s.renderer === '3d'
      && !!s.storyMode
      && !!s.inRogue
      && !s.paused
      && !(s.blocksLook ?? s.blocksInput);
  }

  function target() { return getTargetElement?.() || null; }
  function requestPointerLockFn() { return target()?.requestPointerLock || null; }
  function pointerLockSupported() { return !!requestPointerLockFn(); }
  function lockedToTarget() { const el = target(); return !!el && documentRef?.pointerLockElement === el; }
  function anyPointerLocked() { return !!documentRef?.pointerLockElement; }
  function nativeCaptured() { return !!native.active; }
  function dragLookActive() { return false; }
  function lookBackendActive() { return lockedToTarget() || nativeCaptured(); }

  function setBodyClasses(mode) {
    const body = documentRef?.body;
    if (!body?.classList) return;
    const captured = mode === 'captured' || mode === 'native-captured';
    body.classList.toggle('cursor-captured', captured);
    body.classList.toggle('cursor-ui', !captured);
    body.classList.toggle('cursor-soft-captured', false);
    body.classList.toggle('cursor-native-captured', mode === 'native-captured');
    body.classList.toggle('cursor-drag-look', mode === 'drag-look');
  }

  function clearDeltas() { input?.clearPointerDeltas?.(); }

  function setInputLocked(next, reason) {
    input?.setPointerLocked?.(!!next, reason);
    if (!next) clearDeltas();
  }

  function markError(err, reason = 'pointerlock-error') {
    backend.errors += 1;
    backend.lastError = errorName(err) || reason;
    backend.lastErrorAt = timeNow();
    backend.lastResult = 'error';
  }

  function markNativeError(err, reason = 'native-capture') {
    native.error = errorName(err) || reason;
    native.errorAt = timeNow();
    native.fatalReason = reason;
    native.permissionHint = /not allowed|Permissions associated/i.test(native.error)
      ? `Grant ${REQUIRED_TAURI_CURSOR_PERMISSIONS.join(', ')} in src-tauri/capabilities for the gameplay window.`
      : '';
  }

  function updateCenter(force = false) {
    const now = timeNow();
    if (!force && now - native.lastCenterAt < 250) return native.center;

    const el = target();
    const rect = el?.getBoundingClientRect?.();
    const width = globalThis.window?.innerWidth || 0;
    const height = globalThis.window?.innerHeight || 0;
    const cx = rect ? rect.left + rect.width / 2 : width / 2;
    const cy = rect ? rect.top + rect.height / 2 : height / 2;

    native.center = {
      x: Number.isFinite(cx) ? cx : 0,
      y: Number.isFinite(cy) ? cy : 0,
    };
    native.lastCenterAt = now;
    return native.center;
  }

  // The origin look is measured from: the requested centre plus the translation
  // between the cursor API's coordinate space and the web view's client space.
  function nativeAnchor() {
    return {
      x: native.center.x + native.bias.x,
      y: native.center.y + native.bias.y,
    };
  }

  function resetNativeCalibration() {
    native.calibrated = false;
    native.calibrationPending = false;
    // calibrationFailed is diagnostic and deliberately survives: a backend that
    // was refused for a coordinate mismatch should still say so afterwards.
    native.calibrationRecenters = 0;
    native.calibrationSample = null;
    native.driftStrikes = 0;
    native.lastAppliedOffset = null;
    native.echoesAtLastApply = -1;
    native.bias = { x: 0, y: 0 };
    native.hasLastClient = false;
    native.suppressMovementUntil = 0;
    // A recenter owed to a capture that has ended must not swallow the first
    // real movement of the next one.
    native.expectedEcho = null;
  }

  async function loadTauriWindow() {
    if (!tauriRuntime()) {
      native.available = false;
      native.fatalReason = 'not-tauri-runtime';
      return false;
    }
    if (native.win) return true;

    native.attempted = true;
    try {
      const mod = await loadNativeWindowApi();
      const getWin = mod.getCurrentWindow || mod.appWindow || null;
      native.windowApi = mod;
      native.win = typeof getWin === 'function' ? getWin() : getWin;
      native.available = !!native.win;
      if (!native.available) native.fatalReason = 'tauri-window-missing';
      return !!native.win;
    } catch (err) {
      native.available = false;
      markNativeError(err, 'tauri-import');
      return false;
    }
  }

  function makeCursorPosition(x, y) {
    const api = native.windowApi || {};
    // LogicalPosition matches browser CSS pixels in normal Tauri WebView builds.
    // If a platform maps it differently, calibration below rejects the backend.
    if (typeof api.LogicalPosition === 'function') return new api.LogicalPosition(x, y);
    if (typeof api.PhysicalPosition === 'function') return new api.PhysicalPosition(x, y);
    return { x, y };
  }

  async function setNativeCursorPosition(x, y) {
    const win = native.win;
    if (!win?.setCursorPosition) throw new Error('setCursorPosition unavailable');
    await win.setCursorPosition(makeCursorPosition(x, y));
    return true;
  }

  async function stopNativeCapture(reason = 'release') {
    const gen = ++captureGeneration;
    const win = native.win;
    native.active = false;
    native.pending = false;
    native.recenterPending = false;
    native.generation = gen;
    // The next capture may happen in a different window geometry (fullscreen
    // toggled, window moved). Re-learn the anchor rather than inherit one.
    resetNativeCalibration();
    try { await win?.setCursorGrab?.(false); } catch (err) { markNativeError(err, `${reason}:set-cursor-grab:false`); }
    try { await win?.setCursorVisible?.(true); } catch (err) { markNativeError(err, `${reason}:set-cursor-visible:true`); }
  }

  async function failNativeCapture(reason, err = null) {
    if (err) markNativeError(err, reason);
    else markNativeError(reason, reason);
    await stopNativeCapture(reason);
    if (!lockedToTarget()) {
      setInputLocked(false, reason);
      setBodyClasses('ui');
      lastMode = wantsCapture() ? 'gameplay-ready' : 'ui';
    }
    return false;
  }

  async function recenterNativeCursor({ force = false, generation = captureGeneration, expectCalibration = false } = {}) {
    if (generation !== captureGeneration) return false;
    if (!native.active && !native.pending && !force) return false;
    updateCenter(true);
    const { x, y } = native.center;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    try {
      native.recenterPending = true;
      native.recenterGeneration = generation;
      native.recenterAt = timeNow();
      native.recenterCount += 1;
      if (expectCalibration) {
        native.calibrationPending = true;
        native.calibrated = false;
        native.calibrationFailed = false;
      }
      await setNativeCursorPosition(x, y);
      return generation === captureGeneration;
    } catch (err) {
      await failNativeCapture('set-cursor-position', err);
      return false;
    }
  }

  async function startNativeCapture(reason = 'native-capture', generation = captureGeneration) {
    if (!allowSoftCaptureFallback || !wantsCapture()) return false;
    if (native.active) return true;
    if (native.pending) return false;
    native.pending = true;
    native.generation = generation;
    native.error = null;
    native.fatalReason = '';

    if (!await loadTauriWindow()) {
      native.pending = false;
      return false;
    }
    if (generation !== captureGeneration || !wantsCapture()) {
      native.pending = false;
      return false;
    }

    try {
      updateCenter(true);
      // These are required for free-look. If grab or hide fails, do not pretend
      // we have capture; fall back to drag-look instead.
      if (!native.win?.setCursorVisible) throw new Error('setCursorVisible unavailable');
      if (!native.win?.setCursorGrab) throw new Error('setCursorGrab unavailable');
      // TAKE THE OS WINDOW FIRST. main.js already calls window.focus() before
      // asking for capture, but in the Tauri shell that only touches the
      // webview — it cannot raise or focus the native window, so a click on an
      // unfocused window grabbed a cursor for a window that was not receiving
      // input. Not fatal if the running Tauri version lacks it.
      if (typeof native.win.setFocus === 'function') {
        try { await native.win.setFocus(); } catch (_) {}
      }
      await native.win.setCursorVisible(false);
      await native.win.setCursorGrab(true);

      native.active = true;
      native.pending = false;
      resetNativeCalibration();
      // Camera input is relative. Absolute client coordinates are only an
      // emergency fallback for old WebViews; they are never integrated from a
      // fixed window centre, because title bars and DPI transforms turn that
      // fixed offset into permanent look drift.
      native.calibrated = true;
      native.calibrationFailed = false;
      native.coordinateSpace = 'relative-motion';
      native.generation = generation;
      native.suppressMovementUntil = timeNow() + 80;
      const ok = await recenterNativeCursor({ force: true, generation, expectCalibration: false });
      if (!ok || generation !== captureGeneration || !wantsCapture()) return failNativeCapture(`${reason}:stale-after-recenter`);

      lastMode = 'native-captured';
      lastReason = reason;
      backend.fallbackReason = 'native-cursor-capture';
      setBodyClasses('native-captured');
      setInputLocked(true, `native-capture:${reason}`);
      return true;
    } catch (err) {
      native.pending = false;
      await failNativeCapture(reason, err);
      return false;
    }
  }

  function stopDragLook(reason = 'drag-look-disabled') {
    drag.active = false;
    drag.pointerId = null;
    drag.target = null;
    drag.lastDeltaReason = reason;
    return false;
  }

  function beginDragLook(_e = {}, reason = 'drag-look-disabled') {
    drag.active = false;
    drag.pointerId = null;
    drag.target = null;
    drag.lastDeltaReason = reason;
    if (!lockedToTarget() && !nativeCaptured()) setInputLocked(false, reason);
    return false;
  }

  function clearCaptureRetry() {
    if (retry.timer !== null) {
      try { clearTimeoutFn(retry.timer); } catch (_) { /* timer host went away */ }
    }
    retry.timer = null;
    retry.attempts = 0;
  }

  // Schedule one more unattended attempt. Not a poll: a short, bounded ladder
  // that expires as soon as a backend is live or gameplay stops wanting one.
  function scheduleCaptureRetry(reason = 'capture-retry') {
    if (retry.timer !== null) return false;
    if (retry.attempts >= CAPTURE_RETRY_DELAYS_MS.length) return false;
    if (!wantsCapture() || lookBackendActive()) return false;
    const delay = CAPTURE_RETRY_DELAYS_MS[retry.attempts];
    retry.attempts += 1;
    retry.reason = reason;
    retry.scheduledAt = timeNow();
    const attempt = retry.attempts;
    retry.timer = setTimeoutFn(() => {
      retry.timer = null;
      retry.fired += 1;
      if (!wantsCapture() || lookBackendActive()) { clearCaptureRetry(); return; }
      void attemptCapture(`${reason}:retry${attempt}`, { gesture: false });
    }, delay);
    return true;
  }

  function fallbackToNativeOrRetry(reason, generation) {
    const started = startNativeCapture(reason, generation);
    void Promise.resolve(started).then((ok) => {
      if (ok) { clearCaptureRetry(); return; }
      if (generation !== captureGeneration) return;
      if (!wantsCapture() || lookBackendActive()) return;
      scheduleCaptureRetry(reason);
    });
  }

  function release(reason = 'release') {
    expectedUnlockReason = reason;
    clearCaptureRetry();
    stopDragLook(`${reason}:drag`);
    void stopNativeCapture(`${reason}:native`);
    if (anyPointerLocked()) {
      try { documentRef?.exitPointerLock?.(); } catch (err) { markError(err, `${reason}:exit`); }
    } else if (expectedUnlockReason === reason) {
      expectedUnlockReason = null;
    }
    lastMode = 'ui';
    setBodyClasses('ui');
    setInputLocked(false, reason);
    wasLocked = false;
  }

  function sync(reason = 'sync') {
    lastReason = reason;
    const capture = wantsCapture();
    desiredMode = capture ? 'gameplay-ready' : 'ui';

    if (!capture) {
      release(reason);
      return { mode: lastMode, wantsCapture: false, locked: false, softCaptured: false, nativeCaptured: false, dragLook: false };
    }

    if (lockedToTarget()) {
      // DOM POINTER LOCK IS NOT CONFINEMENT IN A WKWEBVIEW.
      //
      // In a browser, a true lock hides the cursor and pins it: movementX/Y keep
      // arriving forever and the pointer cannot reach an edge. In the Tauri
      // shell on macOS the lock is granted — `pointerLockElement` is set, and
      // movementX/Y flow, so look feels perfect — while the OS cursor is never
      // actually captured. It keeps physically travelling, reaches the edge of
      // the window, and is handed back to the desktop mid-turn.
      //
      // So under Tauri the two backends do different jobs and BOTH run: DOM lock
      // supplies the deltas, and the native grab supplies the thing it cannot —
      // hiding and recentring the real cursor so there is no edge to reach.
      // Stopping the native capture here, which is what this did, switched off
      // the only confinement the shell had.
      if (tauriRuntime()) {
        if (!native.active && !native.pending) void startNativeCapture(`${reason}:tauri-confine`, captureGeneration);
      } else if (native.active || native.pending) {
        void stopNativeCapture(`${reason}:true-lock`);
      }
      lastMode = 'captured';
      setBodyClasses('captured');
      setInputLocked(true, reason);
      wasLocked = true;
      return { mode: lastMode, wantsCapture: true, locked: true, softCaptured: false, nativeCaptured: false, dragLook: false };
    }

    if (nativeCaptured()) {
      lastMode = 'native-captured';
      setBodyClasses('native-captured');
      setInputLocked(true, reason);
      return { mode: lastMode, wantsCapture: true, locked: false, softCaptured: true, nativeCaptured: true, dragLook: false };
    }


    if (anyPointerLocked()) release(`${reason}:wrong-target`);
    lastMode = 'gameplay-ready';
    setBodyClasses('ui');
    setInputLocked(false, reason);
    return { mode: lastMode, wantsCapture: true, locked: false, softCaptured: false, nativeCaptured: false, dragLook: false };
  }

  function verifyLockOrNativeFallback(reason, generation) {
    if (generation !== captureGeneration) return;
    if (lockedToTarget()) {
      backend.lastResult = 'locked';
      clearCaptureRetry();
      sync(`${reason}:verified`);
      return;
    }
    if (!wantsCapture()) return;
    backend.lastResult = 'not-locked';
    backend.fallbackReason = backend.lastError || 'request did not lock target';
    fallbackToNativeOrRetry(`${reason}:native-fallback`, generation);
  }

  function captureRequestInFlight() {
    if (native.pending) return true;
    return backend.lastResult === 'requesting' && timeNow() - backend.lastRequestAt < CAPTURE_REQUEST_TTL_MS;
  }

  async function attemptCapture(reason = 'gesture', { gesture = true } = {}) {
    const current = sync(reason);
    if (!current.wantsCapture) { clearCaptureRetry(); return false; }
    if (current.locked || current.nativeCaptured) { clearCaptureRetry(); return true; }
    // Key repeat, a click landing on top of a keypress, and the pause-exit path
    // all fire within milliseconds of each other. Let the attempt already in
    // flight finish instead of bumping the generation out from under it.
    if (captureRequestInFlight() && (!gesture || backend.lastRequestGesture)) {
      if (gesture) retry.attempts = 0;
      return false;
    }
    if (gesture) retry.attempts = 0;

    const generation = ++captureGeneration;
    const el = target();
    const request = el?.requestPointerLock;
    backend.lastRequestAt = timeNow();
    backend.lastRequestReason = reason;
    backend.lastRequestGesture = !!gesture;
    backend.requests += 1;
    backend.lastError = null;
    backend.lastResult = 'requesting';

    if (!request) {
      markError('requestPointerLock unavailable', reason);
      fallbackToNativeOrRetry(`${reason}:native-fallback`, generation);
      return false;
    }

    try {
      let result;
      try {
        result = request.call(el, { unadjustedMovement: true });
      } catch (err) {
        if (err?.name === 'NotSupportedError' || err?.name === 'TypeError') result = request.call(el);
        else throw err;
      }

      if (result && typeof result.then === 'function') {
        result.then(
          () => {
            backend.lastResult = 'resolved';
            setTimeout(() => verifyLockOrNativeFallback(reason, generation), 0);
          },
          (err) => {
            markError(err, reason);
            if (generation !== captureGeneration || !wantsCapture()) return;
            if (err?.name === 'NotSupportedError' || err?.name === 'TypeError') {
              try {
                const fallback = request.call(el);
                if (fallback && typeof fallback.then === 'function') {
                  fallback.then(
                    () => setTimeout(() => verifyLockOrNativeFallback(`${reason}:retry`, generation), 0),
                    (retryErr) => {
                      markError(retryErr, `${reason}:retry`);
                      if (generation === captureGeneration) fallbackToNativeOrRetry(`${reason}:native-fallback`, generation);
                    },
                  );
                } else setTimeout(() => verifyLockOrNativeFallback(`${reason}:retry`, generation), 25);
              } catch (retryErr) {
                markError(retryErr, `${reason}:retry`);
                fallbackToNativeOrRetry(`${reason}:native-fallback`, generation);
              }
            } else fallbackToNativeOrRetry(`${reason}:native-fallback`, generation);
          },
        );
      } else {
        setTimeout(() => verifyLockOrNativeFallback(reason, generation), 50);
      }
      return true;
    } catch (err) {
      markError(err, reason);
      fallbackToNativeOrRetry(`${reason}:native-fallback`, generation);
      return false;
    }
  }

  function handlePointerLockChange() {
    const locked = lockedToTarget();
    if (locked) {
      captureGeneration += 1;
      clearCaptureRetry();
      if (native.active || native.pending) void stopNativeCapture('pointerlock-acquired:native');
    }
    setInputLocked(locked || nativeCaptured(), locked ? 'pointerlock-acquired' : 'pointerlock-lost');

    const docFocused = typeof documentRef?.hasFocus === 'function' ? documentRef.hasFocus() : true;
    const lostUnexpectedly = wasLocked
      && !locked
      && !nativeCaptured()
      && wantsCapture()
      && !expectedUnlockReason
      && documentRef?.visibilityState !== 'hidden'
      && docFocused;

    const reason = expectedUnlockReason || (locked ? 'pointerlock-acquired' : 'browser-pointer-unlock');
    expectedUnlockReason = null;
    wasLocked = locked;

    if (locked) backend.lastResult = 'locked';
    sync(reason);
    if (lostUnexpectedly) {
      onUnexpectedUnlock(reason);
      // The callback may open pause (Escape unlock) and revoke the lease. If it
      // did not—WebView focus churn during dialogue is the common case—recover
      // without making the player alt-tab or donate another click.
      if (wantsCapture()) fallbackToNativeOrRetry(`${reason}:unexpected-unlock`, captureGeneration);
    }
  }

  function handlePointerLockError(err = null) {
    markError(err || 'pointerlockerror', backend.lastRequestReason || 'pointerlockerror');
    const generation = captureGeneration;
    // The most common error here is not a broken request but a refused one:
    // the browser blocks re-locking for about a second after the user pressed
    // Escape. Leaving that as a dead camera until the next click is the bug.
    if (wantsCapture()) fallbackToNativeOrRetry(`${backend.lastRequestReason || 'pointerlockerror'}:native-fallback`, generation);
  }

  function handleNativePointerMove(e = {}, { confineOnly = false } = {}) {
    if (!nativeCaptured() || !wantsCapture()) return false;
    native.moves += 1;
    const now = timeNow();
    native.lastMoveAt = now;
    const previous = native.lastClient;
    const hadPrevious = native.hasLastClient;
    const point = pointFromEvent(e);
    native.lastClient = point;
    native.hasLastClient = true;

    const c = updateCenter(false);
    const landedX = point.x - c.x;
    const landedY = point.y - c.y;
    native.lastOffset = { dx: landedX, dy: landedY };

    // setCursorPosition dispatches a synthetic move in some WebViews. It is a
    // transport echo, never camera intent. Ignore the first event in the short
    // IPC window and remember where the cursor actually landed so diagnostics
    // remain useful across title bars and DPI scaling.
    const recentRecenter = native.recenterPending
      && native.recenterGeneration === native.generation
      && now - native.recenterAt < native.echoWindowMs;
    if (recentRecenter && now <= native.suppressMovementUntil) {
      native.bias = { x: landedX, y: landedY };
      native.recenterPending = false;
      native.ignoredRecenters += 1;
      native.lastAppliedDelta = { dx: 0, dy: 0 };
      native.lastDeltaReason = 'native-recenter-ignored';
      return true;
    }
    if (now < native.suppressMovementUntil) {
      native.lastAppliedDelta = { dx: 0, dy: 0 };
      native.lastDeltaReason = 'native-recenter-settling';
      return true;
    }
    native.recenterPending = false;

    const movementX = Number(e.movementX);
    const movementY = Number(e.movementY);
    const hasRelative = Number.isFinite(movementX) && Number.isFinite(movementY);
    let dx = 0;
    let dy = 0;
    if (hasRelative) {
      dx = movementX * native.gain;
      dy = movementY * native.gain;
      native.relativeEvents += 1;
      native.lastDeltaReason = 'tauri-native-relative';
    } else if (hadPrevious) {
      // Old WebViews omit movementX/Y. Event-to-event displacement is safe:
      // unlike centre-relative displacement, a fixed title-bar offset cancels.
      dx = (point.x - previous.x) * native.gain;
      dy = (point.y - previous.y) * native.gain;
      native.absoluteFallbackEvents += 1;
      native.lastDeltaReason = 'tauri-native-event-delta';
    }
    // THE RECENTER ECHO, CAUGHT BY SHAPE RATHER THAN BY CLOCK.
    //
    // The timing test above needs `now <= suppressMovementUntil`, which is set
    // to now+80ms, so the 350ms echoWindowMs was never actually reachable. When
    // the synthetic event took longer than 80ms to return through IPC it was
    // applied as camera intent — and because recentring always jumps the cursor
    // toward the middle, that error had a direction. Push the mouse down to
    // look down, hit the bottom edge, and the echo kicked the view UP. A
    // handful of those pinned the camera on the ceiling and fought every
    // attempt to look away from it.
    //
    // An echo is recognisable regardless of when it lands: its delta is the
    // jump the recenter just made. Matching that is time-independent, so a slow
    // IPC round trip can no longer be mistaken for a hand movement.
    const echo = native.expectedEcho;
    if (echo && (dx || dy)) {
      const near = Math.abs(dx - echo.dx) <= Math.max(24, Math.abs(echo.dx) * 0.3)
        && Math.abs(dy - echo.dy) <= Math.max(24, Math.abs(echo.dy) * 0.3);
      // A stale expectation must not swallow real movement, so it only lives
      // for as long as an IPC round trip could plausibly take.
      const fresh = now - echo.at < native.echoWindowMs;
      if (fresh && near) {
        native.expectedEcho = null;
        native.ignoredRecenters += 1;
        native.lastAppliedDelta = { dx: 0, dy: 0 };
        native.lastDeltaReason = 'native-recenter-echo-shape';
        return true;
      }
      if (!fresh) native.expectedEcho = null;
    }
    dx = Math.abs(dx) >= native.deadzone ? dx : 0;
    dy = Math.abs(dy) >= native.deadzone ? dy : 0;
    dx = clampDelta(dx);
    dy = clampDelta(dy);
    native.lastAppliedDelta = { dx, dy };

    // confineOnly: DOM pointer lock is already feeding movementX/Y through
    // mousemove, so counting these too would run look at double speed.
    if ((dx || dy) && !confineOnly) {
      if (input?.addPointerDelta?.(dx, dy, native.lastDeltaReason)) native.addedDeltas += 1;
    }

    // Cursor grab confines on WebViews that cannot provide a true relative
    // lock. Recenter only at an edge, not after every motion event; this avoids
    // manufacturing a second stream of camera deltas during ordinary look.
    const rect = target()?.getBoundingClientRect?.();
    const right = rect ? (Number.isFinite(rect.right) ? rect.right : rect.left + rect.width) : 0;
    const bottom = rect ? (Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height) : 0;
    const edge = rect && (point.x <= rect.left + 12 || point.x >= right - 12
      || point.y <= rect.top + 12 || point.y >= bottom - 12);
    if (edge) {
      native.suppressMovementUntil = now + 80;
      // Remember the jump this recenter is about to make. The echo it provokes
      // will carry almost exactly this delta, which identifies it far more
      // reliably than the arrival time does — see expectedEcho in the move
      // handler for why the timing test alone was not enough.
      const centre = updateCenter(false);
      native.expectedEcho = { dx: centre.x - point.x, dy: centre.y - point.y, at: now };
      void recenterNativeCursor({ generation: native.generation });
    }
    return true;
  }

  function handlePointerMove(e = {}) {
    // ONE SOURCE OF DELTAS, BUT THE CONFINEMENT STILL HAS TO RUN.
    //
    // When both backends are live — the Tauri case in sync() above — the DOM
    // lock owns look and the native grab owns confinement. Returning early here
    // was wrong twice over: it stopped the double-counting, and it also skipped
    // the edge recentre at the bottom of handleNativePointerMove, which is the
    // ONLY thing actually holding the cursor inside the window. setCursorGrab
    // does not confine on macOS; warping the pointer back off the edge does. So
    // the native handler still runs, and only its delta feed is suppressed.
    if (nativeCaptured()) return handleNativePointerMove(e, { confineOnly: lockedToTarget() });
    return false;
  }

  // Backwards-compatible name from the previous patches.
  function handleSoftPointerMove(e = {}) { return handlePointerMove(e); }

  function endDragLook(_e = {}, reason = 'drag-look-disabled') {
    drag.lastDeltaReason = reason;
    return false;
  }

  function isSoftCaptured() { return nativeCaptured(); }
  function isTrueLocked() { return lockedToTarget(); }
  function isNativeCaptured() { return nativeCaptured(); }
  function isDragLookActive() { return dragLookActive(); }

  function status() {
    const s = state();
    const el = documentRef?.pointerLockElement || null;
    const tgt = target();
    const softCaptured = isSoftCaptured();
    return {
      desiredMode,
      lastMode,
      lastReason,
      policy: {
        wantsCapture: wantsCapture(),
        renderer: s.renderer,
        storyMode: !!s.storyMode,
        inRogue: !!s.inRogue,
        paused: !!s.paused,
        blocksLook: !!(s.blocksLook ?? s.blocksInput),
      },
      backend: {
        kind: backend.kind,
        supported: pointerLockSupported(),
        requestPointerLockType: typeof requestPointerLockFn(),
        lastRequestAt: backend.lastRequestAt,
        lastRequestReason: backend.lastRequestReason,
        lastRequestGesture: backend.lastRequestGesture,
        lastError: backend.lastError,
        lastErrorAt: backend.lastErrorAt,
        lastResult: backend.lastResult,
        fallbackReason: backend.fallbackReason,
        requests: backend.requests,
        errors: backend.errors,
        retryPending: retry.timer !== null,
        retryAttempts: retry.attempts,
        retriesFired: retry.fired,
        retryReason: retry.reason,
      },
      nativeBackend: {
        kind: native.kind,
        attempted: native.attempted,
        available: native.available,
        active: native.active,
        pending: native.pending,
        calibrated: native.calibrated,
        calibrationPending: native.calibrationPending,
        calibrationFailed: native.calibrationFailed,
        coordinateSpace: native.coordinateSpace,
        bias: native.bias,
        anchor: nativeAnchor(),
        generation: native.generation,
        error: native.error,
        errorAt: native.errorAt,
        fatalReason: native.fatalReason,
        permissionHint: native.permissionHint,
        requiredPermissions: REQUIRED_TAURI_CURSOR_PERMISSIONS,
        center: native.center,
        recenterPending: native.recenterPending,
        recenterCount: native.recenterCount,
        ignoredRecenters: native.ignoredRecenters,
        moves: native.moves,
        addedDeltas: native.addedDeltas,
        lastMoveAt: native.lastMoveAt,
        lastClient: native.lastClient,
        lastOffset: native.lastOffset,
        lastAppliedDelta: native.lastAppliedDelta,
        lastDeltaReason: native.lastDeltaReason,
        gain: native.gain,
        deadzone: native.deadzone,
        relativeEvents: native.relativeEvents,
        absoluteFallbackEvents: native.absoluteFallbackEvents,
      },
      softBackend: {
        // Compatibility name for the v3 debug UI. This is now native-only data;
        // fake free-look has been removed.
        nativeActive: native.active,
        nativeKind: native.kind,
        nativeError: native.error,
        nativeErrorAt: native.errorAt,
        permissionHint: native.permissionHint,
        center: native.center,
        bias: native.bias,
        anchor: nativeAnchor(),
        recenterPending: native.recenterPending,
        recenterCount: native.recenterCount,
        ignoredRecenters: native.ignoredRecenters,
        moves: native.moves,
        addedDeltas: native.addedDeltas,
        lastMoveAt: native.lastMoveAt,
        lastClient: native.lastClient,
        lastRawDelta: native.lastOffset,
        lastAppliedDelta: native.lastAppliedDelta,
        lastDeltaReason: native.lastDeltaReason,
        browserGain: drag.gain,
        nativeGain: native.gain,
        deadzone: native.deadzone,
      },
      dragBackend: {
        active: drag.active,
        pointerId: drag.pointerId,
        moves: drag.moves,
        addedDeltas: drag.addedDeltas,
        lastMoveAt: drag.lastMoveAt,
        lastAppliedDelta: drag.lastAppliedDelta,
        lastDeltaReason: drag.lastDeltaReason,
        gain: drag.gain,
      },
      lock: {
        locked: lockedToTarget(),
        nativeCaptured: nativeCaptured(),
        dragLook: dragLookActive(),
        softCaptured,
        pointerLockElement: el?.id || el?.className || null,
        targetId: tgt?.id || tgt?.className || null,
      },
      input: {
        pointerLocked: !!input?.pointerLocked,
        dx: Number(input?.pointerDx) || 0,
        dy: Number(input?.pointerDy) || 0,
        lastPointerDeltaReason: input?.lastPointerDeltaReason || '',
        lastPointerDeltaSource: input?.lastPointerDeltaSource || null,
      },
      locked: lockedToTarget(),
      softCaptured,
      nativeCaptured: nativeCaptured(),
      dragLook: dragLookActive(),
      wantsCapture: wantsCapture(),
      pointerLockElement: el?.id || el?.className || null,
    };
  }

  function requestCaptureFromGesture(reason = 'gesture') {
    return attemptCapture(reason, { gesture: true });
  }

  return {
    sync,
    release,
    requestCaptureFromGesture,
    attemptCapture,
    beginDragLook,
    endDragLook,
    handlePointerLockChange,
    handlePointerLockError,
    handlePointerMove,
    handleSoftPointerMove,
    isSoftCaptured,
    isTrueLocked,
    isNativeCaptured,
    isDragLookActive,
    status,
    wantsCapture,
  };
}
