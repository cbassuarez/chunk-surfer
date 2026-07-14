export const AUDIO_RECOVERY_DELAYS_MS = Object.freeze([0, 80, 240, 720, 1600]);

// WebKit can suspend an AudioContext after the focus event that brought the app
// back has already fired. Keep recovery stateful: listen for the context state
// transition itself and retry briefly instead of betting the mix on one resume.
export function createAudioContextRecovery({
  getContext,
  ensureContext = () => {},
  onRunning = () => {},
  onError = () => {},
  delays = AUDIO_RECOVERY_DELAYS_MS,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (id) => globalThis.clearTimeout(id),
} = {}) {
  let boundContext = null;
  let retryTimer = null;
  let retryIndex = 0;
  let inFlight = null;
  let disposed = false;
  let lastReason = 'boot';
  let lastError = null;

  function clearRetry() {
    if (retryTimer != null) clearTimer(retryTimer);
    retryTimer = null;
  }

  function markRunning(context, reason) {
    clearRetry();
    retryIndex = 0;
    lastError = null;
    onRunning(context, reason);
  }

  function scheduleRetry(reason) {
    if (disposed || retryTimer != null || retryIndex >= delays.length) return;
    const delay = Math.max(0, Number(delays[retryIndex++]) || 0);
    retryTimer = setTimer(() => {
      retryTimer = null;
      void attempt(`${reason}:retry`, false);
    }, delay);
  }

  function onStateChange() {
    const context = getContext?.();
    if (!context || context !== boundContext) return;
    if (context.state === 'running') {
      markRunning(context, 'statechange');
    } else if (context.state !== 'closed') {
      scheduleRetry('statechange');
    }
  }

  function bind(context = getContext?.()) {
    if (context === boundContext) return context;
    boundContext?.removeEventListener?.('statechange', onStateChange);
    boundContext = context || null;
    boundContext?.addEventListener?.('statechange', onStateChange);
    return boundContext;
  }

  async function attempt(reason, resetRetries) {
    if (disposed) return false;
    lastReason = String(reason || 'audio-recovery');
    if (resetRetries) {
      clearRetry();
      retryIndex = 0;
    }

    try {
      ensureContext?.();
    } catch (error) {
      lastError = error;
      onError(error, lastReason);
      scheduleRetry(lastReason);
      return false;
    }

    const context = bind(getContext?.());
    if (!context || context.state === 'closed') return false;
    if (context.state === 'running') {
      markRunning(context, lastReason);
      return true;
    }
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        await context.resume?.();
      } catch (error) {
        lastError = error;
        onError(error, lastReason);
      }

      if (context === getContext?.() && context.state === 'running') {
        markRunning(context, lastReason);
        return true;
      }
      scheduleRetry(lastReason);
      return false;
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  }

  function recover(reason = 'audio-recovery') {
    return attempt(reason, true);
  }

  function watchdog(reason = 'audio-watchdog') {
    const context = bind(getContext?.());
    if (!context || context.state === 'closed') return false;
    if (context.state === 'running') return true;
    if (!retryTimer && !inFlight) void attempt(reason, false);
    return false;
  }

  function snapshot() {
    return {
      state: getContext?.()?.state || 'none',
      retryIndex,
      retryPending: retryTimer != null,
      resuming: !!inFlight,
      lastReason,
      lastError: lastError ? String(lastError.message || lastError) : null,
    };
  }

  function dispose() {
    disposed = true;
    clearRetry();
    boundContext?.removeEventListener?.('statechange', onStateChange);
    boundContext = null;
  }

  return { bind, recover, watchdog, snapshot, dispose };
}
