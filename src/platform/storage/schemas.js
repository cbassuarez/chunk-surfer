import { SETTINGS_SCHEMA_VERSION, PROFILE_SCHEMA_VERSION, SAVE_SCHEMA_VERSION } from './types.js';
import { normalizeSettings, normalizeMeta, normalizeRun } from '../../progression/schema.js';
import { defaultSettings, defaultProfile, defaultSave } from './defaults.js';

export function normalizePersistedSettings(value) {
  return normalizeSettings(value || defaultSettings());
}

export function normalizePersistedProfile(value) {
  return normalizeMeta(value || defaultProfile());
}

export function normalizePersistedSave(value, { profile = null, settings = null } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : defaultSave(settings);
  const s = normalizePersistedSettings(source.settings || settings);
  return {
    ...defaultSave(s),
    ...source,
    settings: s,
    run: normalizeRun(source.run, { meta: profile, settings: s, activeFallback: false }),
  };
}

export const CURRENT_SCHEMAS = Object.freeze({
  settings: SETTINGS_SCHEMA_VERSION,
  profile: PROFILE_SCHEMA_VERSION,
  save: SAVE_SCHEMA_VERSION,
});
