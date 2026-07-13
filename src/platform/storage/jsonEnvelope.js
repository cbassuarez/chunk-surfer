import { STORAGE_SCHEMA_VERSION } from './types.js';
import { safeJsonParse, stableJsonStringify } from './safeJson.js';

export function makeEnvelope(data, {
  schemaVersion = STORAGE_SCHEMA_VERSION,
  gameVersion = 'LOCAL',
  createdAt = null,
  updatedAt = null,
  now = new Date(),
} = {}) {
  const stamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return {
    schemaVersion,
    gameVersion,
    createdAt: createdAt || stamp,
    updatedAt: updatedAt || stamp,
    data,
  };
}

export function isEnvelope(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Number.isFinite(Number(value.schemaVersion))
    && Object.prototype.hasOwnProperty.call(value, 'data');
}

export function parseEnvelope(raw, { currentVersion = STORAGE_SCHEMA_VERSION, migrate, fallback = null } = {}) {
  const parsed = typeof raw === 'string' ? safeJsonParse(raw) : { ok: true, value: raw };
  if (!parsed.ok) return { ok: false, reason: 'MALFORMED_JSON', error: parsed.error, value: fallback, envelope: null };
  const source = parsed.value;
  if (!isEnvelope(source)) {
    if (!migrate) return { ok: false, reason: 'NOT_ENVELOPE', value: fallback, envelope: null };
    return migrate(source);
  }
  const schemaVersion = Number(source.schemaVersion);
  if (schemaVersion > currentVersion) {
    return { ok: false, reason: 'NEWER_SCHEMA', value: fallback, envelope: source };
  }
  if (schemaVersion < currentVersion) {
    if (!migrate) return { ok: false, reason: 'OLD_SCHEMA', value: fallback, envelope: source };
    return migrate(source);
  }
  return { ok: true, reason: 'OK', value: source.data, envelope: source };
}

export function serializeEnvelope(envelope) {
  return stableJsonStringify(envelope);
}
