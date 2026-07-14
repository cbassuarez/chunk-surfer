// Personalized Interference.
//
// This module is intentionally paranoid about data shape. The game may read a
// local display name at runtime, but the value must never become settings,
// save data, profile data, diagnostics, logs, filenames, or telemetry.

import { isTauriRuntime } from '../platform/detect.js';

export const PERSONAL_INTERFERENCE_INTENSITIES = Object.freeze(['low', 'standard', 'hostile']);
export const PERSONAL_INTERFERENCE_LABEL = Object.freeze({
  low: 'LOW',
  standard: 'STANDARD',
  hostile: 'HOSTILE',
});

export const DEFAULT_PERSONAL_INTERFERENCE = Object.freeze({
  enabled: false,
  sourceSteam: true,
  sourceOs: true,
  vfdText: true,
  localSpeech: false,
  intensity: 'standard',
});

export function normalizePersonalInterferenceSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const intensity = PERSONAL_INTERFERENCE_INTENSITIES.includes(source.intensity) ? source.intensity : 'standard';
  return {
    enabled: !!source.enabled,
    sourceSteam: source.sourceSteam !== false,
    sourceOs: source.sourceOs !== false,
    vfdText: source.vfdText !== false,
    localSpeech: !!source.localSpeech,
    intensity,
  };
}

export function sanitizeInterferenceName(value) {
  let text = String(value || '').normalize('NFKC');
  text = text.replace(/[\u0000-\u001f\u007f]/g, ' ');
  text = text.replace(/[\r\n\t]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length > 32) text = text.slice(0, 32).trim();
  if (!text || text.length < 2) return null;
  if (text.includes('@')) return null;
  if (/[/\\]/.test(text)) return null;
  if (/^[._-]+$/.test(text)) return null;
  return text;
}

export function safeInterferenceSettingsForStorage(settings = {}) {
  return normalizePersonalInterferenceSettings(settings.personalInterference || settings);
}

async function defaultIdentityProvider(settings) {
  const safe = normalizePersonalInterferenceSettings(settings);
  if (!safe.enabled) return null;
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke('chunk_ephemeral_display_names', {
      allowSteam: !!safe.sourceSteam,
      allowOs: !!safe.sourceOs,
    });
    const candidates = Array.isArray(result?.names) ? result.names : [];
    for (const candidate of candidates) {
      const display = sanitizeInterferenceName(candidate?.display);
      const source = candidate?.source === 'steam' ? 'steam' : candidate?.source === 'os' ? 'os' : null;
      if (display && source) return { source, display };
    }
  } catch (_) {
    // No log: failures in this path can include platform-specific user data in
    // lower layers. Treat unavailable identity as a normal, silent fallback.
  }
  return null;
}

function createSpeechDriver() {
  let lastSpokenId = null;
  return {
    speak(event) {
      if (!event?.id || event.id === lastSpokenId) return false;
      if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return false;
      lastSpokenId = event.id;
      try {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(event.voiceText || event.text || '');
        utterance.rate = 0.78;
        utterance.pitch = 0.55;
        utterance.volume = event.kind === 'direct' ? 0.55 : 0.34;
        speechSynthesis.speak(utterance);
        return true;
      } catch (_) {
        return false;
      }
    },
    cancel() {
      lastSpokenId = null;
      try { speechSynthesis?.cancel?.(); } catch (_) {}
    },
  };
}

function intensityGate(intensity) {
  if (intensity === 'hostile') return { first: 420, diagnostic: 0.50, whisper: 0.66, direct: 0.84 };
  if (intensity === 'low') return { first: 780, diagnostic: 0.70, whisper: 0.82, direct: 0.94 };
  return { first: 600, diagnostic: 0.62, whisper: 0.76, direct: 0.88 };
}

function lineFor(kind, name, source) {
  const tag = source === 'steam' ? 'STEAM PERSONA' : 'LOCAL OPERATOR';
  if (kind === 'diagnostic') {
    return {
      text: `OPERATOR TAG RESOLVED: ${String(name).toUpperCase()}`,
      voiceText: 'Operator tag resolved.',
      tone: 'ui-blue',
    };
  }
  if (kind === 'whisper') {
    return {
      text: `${tag} DOES NOT MATCH INCIDENT REPORT`,
      voiceText: `${name}. Do not lean away from the signal.`,
      tone: 'ui-secondary',
    };
  }
  return {
    text: `${name}. DO NOT LEAN AWAY FROM THE SIGNAL.`,
    voiceText: `${name}. Do not lean away from the signal.`,
    tone: 'ui-danger',
  };
}

export function createPersonalizedInterference({
  identityProvider = defaultIdentityProvider,
  speech = createSpeechDriver(),
  now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()),
} = {}) {
  let identity = null;
  let identityExpiresAt = 0;
  let identityPending = false;
  let active = null;
  let currentTakeKey = null;
  const fired = new Set();

  function clearIdentity() {
    identity = null;
    identityExpiresAt = 0;
    identityPending = false;
  }

  function resetTake(takeKey = null) {
    if (takeKey !== currentTakeKey) {
      currentTakeKey = takeKey;
      active = null;
    }
  }

  async function requestIdentity(settings) {
    const safe = normalizePersonalInterferenceSettings(settings);
    if (!safe.enabled || identityPending) return null;
    if (identity && identityExpiresAt > now()) return identity;
    identityPending = true;
    try {
      const resolved = await identityProvider(safe);
      const display = sanitizeInterferenceName(resolved?.display);
      const source = resolved?.source === 'steam' ? 'steam' : resolved?.source === 'os' ? 'os' : null;
      identity = display && source ? { display, source } : null;
      identityExpiresAt = identity ? now() + 30000 : 0;
      return identity;
    } finally {
      identityPending = false;
    }
  }

  function tick({
    settings,
    recording = false,
    takeSlot = 0,
    takeProgress = 0,
    runSeconds = 0,
    stalled = false,
    spoiled = false,
    roomId = '',
  } = {}) {
    const safe = normalizePersonalInterferenceSettings(settings);
    if (!safe.enabled || !recording || stalled || spoiled) {
      active = null;
      if (!safe.enabled) {
        clearIdentity();
        speech.cancel?.();
      }
      return null;
    }
    const takeKey = `${takeSlot}:${roomId}`;
    resetTake(takeKey);
    const gate = intensityGate(safe.intensity);
    const progress = Math.max(0, Math.min(1, Number(takeProgress) || 0));

    if (runSeconds < gate.first || takeSlot < 2) {
      active = null;
      return null;
    }

    if ((!identity || identityExpiresAt <= now()) && !identityPending) {
      requestIdentity(safe);
    }
    if (!identity || identityExpiresAt <= now()) {
      active = null;
      return null;
    }

    const candidates = [
      ['direct', gate.direct],
      ['whisper', gate.whisper],
      ['diagnostic', gate.diagnostic],
    ];
    for (const [kind, threshold] of candidates) {
      const id = `${takeKey}:${kind}`;
      if (progress >= threshold && !fired.has(id)) {
        fired.add(id);
        const line = lineFor(kind, identity.display, identity.source);
        active = {
          id,
          kind,
          source: identity.source,
          text: line.text,
          voiceText: line.voiceText,
          tone: line.tone,
          until: now() + (kind === 'direct' ? 5400 : 3800),
        };
        if (safe.localSpeech && safe.vfdText) speech.speak?.(active);
        return active;
      }
    }

    if (active && active.until > now()) return active;
    active = null;
    return null;
  }

  return {
    tick,
    active: () => (active && active.until > now() ? active : null),
    clear: () => { active = null; speech.cancel?.(); },
    clearIdentity,
    requestIdentity,
    debug: () => ({
      active: active ? { id: active.id, kind: active.kind, source: active.source, expiresInMs: Math.max(0, Math.round(active.until - now())) } : null,
      identitySource: identity?.source || null,
      identityCached: !!identity,
      identityPending,
      firedCount: fired.size,
    }),
  };
}
