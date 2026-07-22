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

export function createPointerModeController({
  documentRef = globalThis.document || null,
  getTargetElement = () => null,
  getState = () => ({}),
  input = null,
  onUnexpectedUnlock = () => {},
  allowSoftCaptureFallback = true,
} = {}) {
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
    recenterPending: false,
    recenterGeneration: 0,
    recenterAt: 0,
    recenterCount: 0,
    ignoredRecenters: 0,
    moves: 0,
    addedDeltas: 0,
    lastMoveAt: 0,
    lastClient: { x: 0, y: 0 },
    lastOffset: { dx: 0, dy: 0 },
    lastAppliedDelta: { dx: 0, dy: 0 },
    lastDeltaReason: '',
    gain: 4.8,
    deadzone: 0.10,
    calibrationAbortPx: 36,
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

  function state() { return getState?.() || {}; }

  function wantsCapture() {
    const s = state();
    return s.renderer === '3d'
      && !!s.storyMode
      && !!s.inRogue
      && !s.paused
      && !s.blocksInput;
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
    backend.lastErrorAt = nowMs();
    backend.lastResult = 'error';
  }

  function markNativeError(err, reason = 'native-capture') {
    native.error = errorName(err) || reason;
    native.errorAt = nowMs();
    native.fatalReason = reason;
    native.permissionHint = /not allowed|Permissions associated/i.test(native.error)
      ? `Grant ${REQUIRED_TAURI_CURSOR_PERMISSIONS.join(', ')} in src-tauri/capabilities for the gameplay window.`
      : '';
  }

  function updateCenter(force = false) {
    const now = nowMs();
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

  async function loadTauriWindow() {
    if (!tauriRuntime()) {
      native.available = false;
      native.fatalReason = 'not-tauri-runtime';
      return false;
    }
    if (native.win) return true;

    native.attempted = true;
    try {
      const mod = await import('@tauri-apps/api/window');
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
    native.calibrationPending = false;
    native.recenterPending = false;
    native.generation = gen;
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
      native.recenterAt = nowMs();
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
      await native.win.setCursorVisible(false);
      await native.win.setCursorGrab(true);

      native.active = true;
      native.pending = false;
      native.calibrated = false;
      native.calibrationPending = false;
      native.coordinateSpace = 'pending-calibration';
      native.generation = generation;
      const ok = await recenterNativeCursor({ force: true, generation, expectCalibration: true });
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

  function release(reason = 'release') {
    expectedUnlockReason = reason;
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
      if (native.active || native.pending) void stopNativeCapture(`${reason}:true-lock`);
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
      sync(`${reason}:verified`);
      return;
    }
    if (!wantsCapture()) return;
    backend.lastResult = 'not-locked';
    backend.fallbackReason = backend.lastError || 'request did not lock target';
    void startNativeCapture(`${reason}:native-fallback`, generation);
  }

  async function requestCaptureFromGesture(reason = 'gesture') {
    const current = sync(reason);
    if (!current.wantsCapture) return false;
    if (current.locked || current.nativeCaptured) return true;

    const generation = ++captureGeneration;
    const el = target();
    const request = el?.requestPointerLock;
    backend.lastRequestAt = nowMs();
    backend.lastRequestReason = reason;
    backend.requests += 1;
    backend.lastError = null;
    backend.lastResult = 'requesting';

    if (!request) {
      markError('requestPointerLock unavailable', reason);
      void startNativeCapture(`${reason}:native-fallback`, generation);
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
                      if (generation === captureGeneration) void startNativeCapture(`${reason}:native-fallback`, generation);
                    },
                  );
                } else setTimeout(() => verifyLockOrNativeFallback(`${reason}:retry`, generation), 25);
              } catch (retryErr) {
                markError(retryErr, `${reason}:retry`);
                void startNativeCapture(`${reason}:native-fallback`, generation);
              }
            } else void startNativeCapture(`${reason}:native-fallback`, generation);
          },
        );
      } else {
        setTimeout(() => verifyLockOrNativeFallback(reason, generation), 50);
      }
      return true;
    } catch (err) {
      markError(err, reason);
      void startNativeCapture(`${reason}:native-fallback`, generation);
      return false;
    }
  }

  function handlePointerLockChange() {
    const locked = lockedToTarget();
    if (locked) {
      captureGeneration += 1;
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
    if (lostUnexpectedly) onUnexpectedUnlock(reason);
  }

  function handlePointerLockError(err = null) {
    markError(err || 'pointerlockerror', backend.lastRequestReason || 'pointerlockerror');
    const generation = captureGeneration;
    if (wantsCapture()) void startNativeCapture(`${backend.lastRequestReason || 'pointerlockerror'}:native-fallback`, generation);
  }

  function handleNativePointerMove(e = {}) {
    if (!nativeCaptured() || !wantsCapture()) return false;
    native.moves += 1;
    native.lastMoveAt = nowMs();
    native.lastClient = pointFromEvent(e);

    const c = updateCenter(false);
    const ox = native.lastClient.x - c.x;
    const oy = native.lastClient.y - c.y;
    native.lastOffset = { dx: ox, dy: oy };

    const now = nowMs();
    const recentRecenter = native.recenterPending
      && native.recenterGeneration === native.generation
      && now - native.recenterAt < 220;
    const nearCenter = Math.abs(ox) <= 2.5 && Math.abs(oy) <= 2.5;

    if (native.calibrationPending) {
      if (nearCenter) {
        native.calibrationPending = false;
        native.calibrated = true;
        native.coordinateSpace = 'client-calibrated';
        native.recenterPending = false;
        native.ignoredRecenters += 1;
        native.lastAppliedDelta = { dx: 0, dy: 0 };
        native.lastDeltaReason = 'native-calibration-recenter-ignored';
        return true;
      }
      if (recentRecenter && (Math.abs(ox) > native.calibrationAbortPx || Math.abs(oy) > native.calibrationAbortPx)) {
        native.calibrationFailed = true;
        native.coordinateSpace = 'mismatch-rejected';
        native.lastAppliedDelta = { dx: 0, dy: 0 };
        native.lastDeltaReason = 'native-coordinate-mismatch';
        void failNativeCapture('native-coordinate-calibration-failed');
        return false;
      }
      // Small immediate offset is probably real hand movement before the first
      // synthetic recenter event arrived. Accept it and continue.
      native.calibrationPending = false;
      native.calibrated = true;
      native.coordinateSpace = 'client-calibrated-with-initial-motion';
    }

    if (recentRecenter && nearCenter) {
      native.recenterPending = false;
      native.ignoredRecenters += 1;
      native.lastAppliedDelta = { dx: 0, dy: 0 };
      native.lastDeltaReason = 'native-recenter-ignored';
      return true;
    }
    native.recenterPending = false;

    let dx = Math.abs(ox) >= native.deadzone ? ox * native.gain : 0;
    let dy = Math.abs(oy) >= native.deadzone ? oy * native.gain : 0;
    dx = clampDelta(dx);
    dy = clampDelta(dy);
    native.lastAppliedDelta = { dx, dy };
    native.lastDeltaReason = 'tauri-native-capture';

    if (dx || dy) {
      if (input?.addPointerDelta?.(dx, dy, 'tauri-native-capture')) native.addedDeltas += 1;
    }
    void recenterNativeCursor({ generation: native.generation });
    return true;
  }

  function handlePointerMove(e = {}) {
    if (nativeCaptured()) return handleNativePointerMove(e);
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
        blocksInput: !!s.blocksInput,
      },
      backend: {
        kind: backend.kind,
        supported: pointerLockSupported(),
        requestPointerLockType: typeof requestPointerLockFn(),
        lastRequestAt: backend.lastRequestAt,
        lastRequestReason: backend.lastRequestReason,
        lastError: backend.lastError,
        lastErrorAt: backend.lastErrorAt,
        lastResult: backend.lastResult,
        fallbackReason: backend.fallbackReason,
        requests: backend.requests,
        errors: backend.errors,
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

  return {
    sync,
    release,
    requestCaptureFromGesture,
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
