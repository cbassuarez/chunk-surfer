// Runtime-only identity for battle-bound personalized interference.
//
// Exact values may be rendered during an opted-in battle, and the separately
// consented persona may be synthesized locally for the booth name exchange.
// They must never enter settings, saves, diagnostics, logs, filenames,
// telemetry, captions, transcripts, tapes, or exported artifacts.

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
  sourceOs: false,
  sourceHost: true,
  sourceMic: true,
  vfdText: true,
  // Retained only as a migration sink. Booth synthesis is authorized by the
  // individual Steam/OS modules, never by this legacy blanket switch.
  localSpeech: false,
  intensity: 'standard',
});

export function normalizePersonalInterferenceSettings(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const intensity = PERSONAL_INTERFERENCE_INTENSITIES.includes(source.intensity) ? source.intensity : 'standard';
  return {
    enabled: !!source.enabled,
    sourceSteam: source.sourceSteam !== false,
    sourceOs: source.sourceOs === true,
    sourceHost: source.sourceHost !== false,
    sourceMic: source.sourceMic !== false,
    vfdText: source.vfdText !== false,
    localSpeech: false,
    intensity,
  };
}

const UNSAFE_FORMATTING = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/gu;

function graphemeSlice(value, limit) {
  if (typeof Intl?.Segmenter === 'function') {
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)];
    return segments.slice(0, limit).map((entry) => entry.segment).join('');
  }
  return Array.from(value).slice(0, limit).join('');
}

export function sanitizeInterferenceValue(value, { maxGraphemes = 32, rejectPaths = true } = {}) {
  let text = String(value || '').normalize('NFKC');
  text = text.replace(UNSAFE_FORMATTING, ' ').replace(/[\r\n\t]/gu, ' ');
  text = text.replace(/\s+/gu, ' ').trim();
  if (!text) return null;
  text = graphemeSlice(text, Math.max(2, Math.floor(maxGraphemes))).trim();
  if (!text || [...text].length < 2) return null;
  if (text.includes('@')) return null;
  if (rejectPaths && /[/\\]/u.test(text)) return null;
  if (/^[._-]+$/u.test(text)) return null;
  return text;
}

export function sanitizeInterferenceName(value) {
  return sanitizeInterferenceValue(value, { maxGraphemes: 32, rejectPaths: true });
}

export function sanitizeInterferenceDevice(value) {
  return sanitizeInterferenceValue(value, { maxGraphemes: 48, rejectPaths: true });
}

export function safeInterferenceSettingsForStorage(settings = {}) {
  return normalizePersonalInterferenceSettings(settings.personalInterference || settings);
}

export function normalizeNativeIdentity(result, safe, { micLabel = null, micPermission = false } = {}) {
  const candidates = Array.isArray(result?.names) ? result.names : [];
  let persona = null;
  for (const candidate of candidates) {
    const source = candidate?.source === 'steam' ? 'steam' : candidate?.source === 'os' ? 'os' : null;
    if (!source) continue;
    if (source === 'steam' && !safe.sourceSteam) continue;
    if (source === 'os' && (!safe.sourceOs || persona?.source === 'steam')) continue;
    const value = sanitizeInterferenceName(candidate?.display);
    if (value) persona = { value, source };
    if (source === 'steam' && persona) break;
  }
  const hostname = safe.sourceHost
    ? sanitizeInterferenceDevice(result?.hostname)
    : null;
  const mic = safe.sourceMic && micPermission
    ? sanitizeInterferenceDevice(micLabel)
    : null;
  return {
    schema: 1,
    persona: persona || null,
    hostname: hostname ? { value: hostname, source: 'host' } : null,
    mic: mic ? { value: mic, source: 'mic' } : null,
  };
}

export async function requestIdentitySnapshot(settings, context = {}) {
  const safe = normalizePersonalInterferenceSettings(settings);
  if (!safe.enabled) return { schema: 1, persona: null, hostname: null, mic: null };
  let native = { names: [], hostname: null };
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      native = await invoke('chunk_ephemeral_identity', {
        allowSteam: !!safe.sourceSteam,
        allowOs: !!safe.sourceOs,
        allowHostname: !!safe.sourceHost,
      });
    } catch (_) {
      // Identity failures are an ordinary authored fallback. Do not log an
      // exception whose lower layers may contain user or device data.
    }
  }
  return normalizeNativeIdentity(native, safe, context);
}

export function createEphemeralIdentityCache({ provider = requestIdentitySnapshot, now = () => Date.now() } = {}) {
  let snapshot = null;
  let expiresAt = 0;
  let pending = null;
  return {
    async request(settings, context = {}) {
      const safe = normalizePersonalInterferenceSettings(settings);
      if (!safe.enabled) { snapshot = null; expiresAt = 0; return null; }
      if (snapshot && expiresAt > now()) return snapshot;
      if (!pending) {
        pending = Promise.resolve(provider(safe, context)).then((resolved) => {
          snapshot = resolved || { schema: 1, persona: null, hostname: null, mic: null };
          expiresAt = now() + 30_000;
          return snapshot;
        }).finally(() => { pending = null; });
      }
      return pending;
    },
    peek() { return snapshot && expiresAt > now() ? snapshot : null; },
    clear() { snapshot = null; expiresAt = 0; pending = null; },
    debug() {
      return {
        cached: !!(snapshot && expiresAt > now()),
        sources: snapshot ? {
          persona: snapshot.persona?.source || null,
          hostname: !!snapshot.hostname,
          mic: !!snapshot.mic,
        } : null,
        pending: !!pending,
      };
    },
  };
}
