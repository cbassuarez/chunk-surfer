import { isTauriRuntime } from './detect.js';

const HIT = 'chapel-desktop:hit';
const CANCELLED = 'chapel-desktop:cancelled';
const OPEN_TIMEOUT_MS = 2600;

async function loadNativeApi() {
  if (!isTauriRuntime()) return null;
  const [{ invoke }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
  ]);
  return { invoke, listen };
}

function createToken() {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `chapel-${id}`;
}

// The presentation reports a click on one attack. Combat owns parry timing,
// whether the click still applies, and the outcome shown on the desktop.
export function createChapelDesktopPresentation({
  getEnabled = () => false,
  isActive = () => true,
  api,
  onTrace = () => {},
  openTimeoutMs = OPEN_TIMEOUT_MS,
} = {}) {
  let current = null;
  let connection = null;
  let disposed = false;
  const unlisten = new Set();

  const enabled = () => !disposed && (api != null || isTauriRuntime()) && getEnabled() === true && !!isActive();
  const owns = lease => current === lease && enabled();

  function trace(type, lease, outcome) {
    try { onTrace({ type, attackId: lease.attackId, outcome }); } catch { /* Diagnostic only. */ }
  }

  function closeNative(lease, outcome) {
    if (!lease.bridge) return Promise.resolve(false);
    return Promise.resolve().then(() => lease.bridge.invoke('chunk_chapel_desktop_end', {
      token: lease.token,
      outcome,
    })).then(ended => ended === true, () => false);
  }

  function retire(lease, outcome, notify = false) {
    if (current !== lease) return Promise.resolve(false);
    current = null;
    lease.stop();
    const cleanup = closeNative(lease, outcome);
    trace(notify ? 'cancelled' : 'ended', lease, outcome);
    if (notify) lease.onCancel?.({ attackId: lease.attackId });
    return cleanup;
  }

  function acceptHit(lease) {
    if (current !== lease || lease.consumed) return;
    if (!owns(lease)) {
      void retire(lease, 'cancel', true);
      return;
    }
    lease.consumed = true;
    trace('hit', lease);
    lease.onHit?.({ attackId: lease.attackId });
  }

  function handleNative(type, { payload } = {}) {
    const lease = current;
    if (!lease?.bridge || payload?.token !== lease.token || payload.attackId !== lease.attackId) return;
    if (type === CANCELLED || !owns(lease)) {
      void retire(lease, 'cancel', true);
    } else if (lease.ready && !lease.earlyHit) {
      acceptHit(lease);
    } else {
      // A click on the first visible frame can beat the invoke response.
      lease.earlyHit = true;
    }
  }

  function connect() {
    if (connection) return connection;
    connection = Promise.resolve().then(async () => {
      try {
        const bridge = api ?? await loadNativeApi();
        if (!bridge || disposed) return null;
        for (const type of [HIT, CANCELLED]) {
          const release = await bridge.listen(type, event => handleNative(type, event));
          if (disposed) {
            release();
            return null;
          }
          unlisten.add(release);
        }
        return bridge;
      } catch {
        releaseListeners();
        connection = null;
        return null;
      }
    });
    return connection;
  }

  function releaseListeners() {
    for (const release of unlisten) {
      try { release(); } catch { /* The native runtime may already be gone. */ }
    }
    unlisten.clear();
  }

  async function prepare(theme = null) {
    if (!enabled()) return false;
    const bridge = await connect();
    if (!bridge || !enabled()) return false;
    try {
      return await bridge.invoke('chunk_chapel_desktop_prepare', theme ? { theme } : undefined) === true && enabled();
    } catch {
      return false;
    }
  }

  async function show(lease, request) {
    const bridge = await connect();
    if (!bridge || !owns(lease)) return false;
    lease.bridge = bridge;
    try {
      const painted = await bridge.invoke('chunk_chapel_desktop_begin', {
        request: { token: lease.token, attackId: lease.attackId, ...request },
      });
      if (!owns(lease)) {
        if (painted === true) void closeNative(lease, 'cancel');
        return false;
      }
      return painted === true;
    } catch {
      return false;
    }
  }

  async function begin({ attackId, theme, responseSeconds, onHit, onCancel, reducedMotion = false, reduceFlash = false } = {}) {
    if (!enabled() || current || attackId == null || attackId === '') return false;
    let stop;
    const stopped = new Promise(resolve => { stop = () => resolve(false); });
    const lease = { token: createToken(), attackId: String(attackId), onHit, onCancel, stop };
    current = lease;
    const timeout = setTimeout(stop, openTimeoutMs);
    const painted = await Promise.race([show(lease, {
      ...(theme ? { theme } : {}), ...(responseSeconds ? { responseSeconds } : {}),
      reducedMotion: !!reducedMotion, reduceFlash: !!reduceFlash,
    }), stopped]);
    clearTimeout(timeout);
    if (!painted || !owns(lease)) {
      void retire(lease, 'cancel');
      return false;
    }
    lease.ready = true;
    trace('painted', lease);
    if (lease.earlyHit) {
      // Give the owner the resolved begin before delivering the stored click.
      setTimeout(() => acceptHit(lease), 0);
    }
    return true;
  }

  function end(outcome = 'cancel') {
    if (!current) return Promise.resolve(false);
    return retire(current, outcome === 'hit' || outcome === 'miss' ? outcome : 'cancel');
  }

  function dispose() {
    disposed = true;
    releaseListeners();
    return end();
  }

  return { isAvailable: enabled, prepare, begin, end, dispose };
}
