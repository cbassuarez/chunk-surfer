export const BACKGROUND_AUDIO_MODES = Object.freeze(['continue', 'pause']);

export function normalizeBackgroundAudioMode(value) {
  return value === 'pause' ? 'pause' : 'continue';
}

export function documentIsUnfocused(doc = globalThis.document) {
  if (!doc) return false;
  if (doc.hidden === true || doc.visibilityState === 'hidden') return true;
  return typeof doc.hasFocus === 'function' ? !doc.hasFocus() : false;
}

// The desktop webview is configured not to suspend itself in the background.
// This policy owns the player-facing exception: people who prefer silence when
// switching apps can intentionally suspend just the AudioContext.
export function createBackgroundAudioFocusPolicy({
  getContext = () => null,
  getMode = () => 'continue',
  getDocument = () => globalThis.document,
  recover = () => false,
  onError = () => {},
} = {}) {
  let intentionallySuspended = false;
  let lastReason = 'boot';

  async function sync(reason = 'focus-policy') {
    lastReason = String(reason || 'focus-policy');
    const mode = normalizeBackgroundAudioMode(getMode?.());
    const shouldPause = mode === 'pause' && documentIsUnfocused(getDocument?.());
    intentionallySuspended = shouldPause;

    const context = getContext?.();
    if (shouldPause) {
      if (!context || context.state === 'closed' || context.state === 'suspended') return false;
      try {
        await context.suspend?.();
        return true;
      } catch (error) {
        onError(error, lastReason);
        return false;
      }
    }

    return recover?.(lastReason) ?? false;
  }

  function shouldRecover() {
    return !intentionallySuspended;
  }

  function snapshot() {
    return {
      mode: normalizeBackgroundAudioMode(getMode?.()),
      intentionallySuspended,
      lastReason,
    };
  }

  return { sync, shouldRecover, snapshot };
}
