import { makeEnvelope, parseEnvelope } from './jsonEnvelope.js';
import { SETTINGS_SCHEMA_VERSION, PROFILE_SCHEMA_VERSION, SAVE_SCHEMA_VERSION } from './types.js';
import { normalizePersistedSettings, normalizePersistedProfile, normalizePersistedSave } from './schemas.js';

function migrated(value, schemaVersion, normalizer, options = {}) {
  const data = normalizer(value?.data ?? value, options);
  return { ok: true, reason: 'MIGRATED', value: data, envelope: makeEnvelope(data, {
    schemaVersion,
    gameVersion: value?.gameVersion || options.gameVersion || 'LOCAL',
    createdAt: value?.createdAt || null,
  }) };
}

export function migrateSettingsEnvelope(raw, options = {}) {
  return parseEnvelope(raw, {
    currentVersion: SETTINGS_SCHEMA_VERSION,
    fallback: normalizePersistedSettings(null),
    migrate: (value) => migrated(value, SETTINGS_SCHEMA_VERSION, normalizePersistedSettings, options),
  });
}

export function migrateProfileEnvelope(raw, options = {}) {
  return parseEnvelope(raw, {
    currentVersion: PROFILE_SCHEMA_VERSION,
    fallback: normalizePersistedProfile(null),
    migrate: (value) => migrated(value, PROFILE_SCHEMA_VERSION, normalizePersistedProfile, options),
  });
}

export function migrateSaveEnvelope(raw, options = {}) {
  return parseEnvelope(raw, {
    currentVersion: SAVE_SCHEMA_VERSION,
    fallback: null,
    migrate: (value) => migrated(value, SAVE_SCHEMA_VERSION, (v) => normalizePersistedSave(v, options), options),
  });
}
