import { makeEnvelope, serializeEnvelope } from './jsonEnvelope.js';
import { safeJsonParse } from './safeJson.js';
import { migrateSettingsEnvelope, migrateProfileEnvelope, migrateSaveEnvelope } from './migrations.js';
import { normalizePersistedSettings, normalizePersistedProfile, normalizePersistedSave } from './schemas.js';
import {
  SETTINGS_SCHEMA_VERSION,
  PROFILE_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  SETTINGS_KEY,
  PROFILE_KEY,
  AUTOSAVE_KEY,
  MIGRATION_KEY,
  LEGACY_SAVE_KEYS,
  LEGACY_PROFILE_KEYS,
  SAVE_SLOTS,
  SAVE_SLOT_AUTOSAVE,
} from './types.js';
import { defaultSettings, defaultProfile } from './defaults.js';
import { logInfo, logWarn } from '../diagnostics/diagnostics.js';

const memoryErrors = [];

function storage() {
  try { return globalThis.localStorage || null; } catch (_) { return null; }
}

export function storageErrors() { return [...memoryErrors]; }

export function readLocalStorage(key) {
  try { return storage()?.getItem(key) ?? null; }
  catch (error) { memoryErrors.push({ at: Date.now(), op: 'getItem', key, error: String(error?.message || error) }); return null; }
}

export function writeLocalStorage(key, data) {
  try { storage()?.setItem(key, typeof data === 'string' ? data : JSON.stringify(data)); return true; }
  catch (error) { memoryErrors.push({ at: Date.now(), op: 'setItem', key, error: String(error?.message || error) }); return false; }
}

export function removeLocalStorage(key) {
  try { storage()?.removeItem(key); return true; }
  catch (error) { memoryErrors.push({ at: Date.now(), op: 'removeItem', key, error: String(error?.message || error) }); return false; }
}

export function firstStored(keys) {
  for (const key of keys) {
    const raw = readLocalStorage(key);
    if (raw != null) return { key, raw };
  }
  return null;
}

export function parseStoredJson(raw) {
  return safeJsonParse(raw).value;
}

export function writeJson(key, data) { return writeLocalStorage(key, JSON.stringify(data)); }
export function removeKeys(keys) { for (const key of keys) removeLocalStorage(key); }

function legacySettings() {
  const save = firstStored(LEGACY_SAVE_KEYS);
  if (!save) return null;
  const raw = parseStoredJson(save.raw);
  return raw?.settings || null;
}

function legacyProfile() {
  const meta = firstStored(LEGACY_PROFILE_KEYS);
  if (!meta) return null;
  return parseStoredJson(meta.raw);
}

function legacySave() {
  const save = firstStored(LEGACY_SAVE_KEYS);
  if (!save) return null;
  return parseStoredJson(save.raw);
}

export class BrowserStorage {
  constructor({ gameVersion = 'LOCAL' } = {}) {
    this.kind = 'browser';
    this.gameVersion = gameVersion;
    this.migration = null;
    this.blockedKeys = new Set();
  }

  async init() {
    await this.migrateLegacyLocalStorage();
    await logInfo('storage backend selected', 'browser');
  }

  async migrateLegacyLocalStorage() {
    if (readLocalStorage(MIGRATION_KEY)) return;
    const found = [...LEGACY_PROFILE_KEYS, ...LEGACY_SAVE_KEYS].filter((key) => readLocalStorage(key) != null);
    const migrated = [];
    const skipped = [];
    const errors = [];
    try {
      if (!readLocalStorage(SETTINGS_KEY)) {
        const settings = legacySettings();
        if (settings) { await this.saveSettings(normalizePersistedSettings(settings)); migrated.push('settings'); }
        else skipped.push('settings');
      }
      if (!readLocalStorage(PROFILE_KEY)) {
        const profile = legacyProfile();
        if (profile) { await this.saveProfile(normalizePersistedProfile(profile)); migrated.push('profile'); }
        else skipped.push('profile');
      }
      if (!readLocalStorage(AUTOSAVE_KEY)) {
        const save = legacySave();
        if (save) { await this.saveGame(SAVE_SLOT_AUTOSAVE, normalizePersistedSave(save, { profile: legacyProfile(), settings: legacySettings() })); migrated.push('autosave'); }
        else skipped.push('autosave');
      }
    } catch (error) {
      errors.push(String(error?.message || error));
      await logWarn('browser storage migration failed', errors[0]);
    }
    this.migration = { timestamp: new Date().toISOString(), oldKeysFound: found, keysMigrated: migrated, keysSkipped: skipped, errors };
    writeLocalStorage(MIGRATION_KEY, serializeEnvelope(makeEnvelope(this.migration, { schemaVersion: 1, gameVersion: this.gameVersion })));
  }

  async loadSettings() {
    const raw = readLocalStorage(SETTINGS_KEY);
    if (raw) {
      const result = migrateSettingsEnvelope(raw, { gameVersion: this.gameVersion });
      if (result.ok) return normalizePersistedSettings(result.value);
      if (result.reason === 'NEWER_SCHEMA') this.blockedKeys.add(SETTINGS_KEY);
      await logWarn('settings load fell back', result.reason);
    }
    return normalizePersistedSettings(legacySettings() || defaultSettings());
  }

  async saveSettings(settings) {
    if (this.blockedKeys.has(SETTINGS_KEY)) { await logWarn('refusing to overwrite newer settings schema', SETTINGS_KEY); return; }
    const data = normalizePersistedSettings(settings);
    writeLocalStorage(SETTINGS_KEY, serializeEnvelope(makeEnvelope(data, { schemaVersion: SETTINGS_SCHEMA_VERSION, gameVersion: this.gameVersion })));
  }

  async resetSettings() {
    const data = defaultSettings();
    await this.saveSettings(data);
    return data;
  }

  async loadProfile() {
    const raw = readLocalStorage(PROFILE_KEY);
    if (raw) {
      const result = migrateProfileEnvelope(raw, { gameVersion: this.gameVersion });
      if (result.ok) return normalizePersistedProfile(result.value);
      if (result.reason === 'NEWER_SCHEMA') this.blockedKeys.add(PROFILE_KEY);
      await logWarn('profile load fell back', result.reason);
    }
    return normalizePersistedProfile(legacyProfile() || defaultProfile());
  }

  async saveProfile(profile) {
    if (this.blockedKeys.has(PROFILE_KEY)) { await logWarn('refusing to overwrite newer profile schema', PROFILE_KEY); return; }
    const data = normalizePersistedProfile(profile);
    writeLocalStorage(PROFILE_KEY, serializeEnvelope(makeEnvelope(data, { schemaVersion: PROFILE_SCHEMA_VERSION, gameVersion: this.gameVersion })));
  }

  saveKey(slot) { return slot === SAVE_SLOT_AUTOSAVE ? AUTOSAVE_KEY : `chunk-surfer:save:${slot}:v1`; }

  async loadSave(slot = SAVE_SLOT_AUTOSAVE) {
    const raw = readLocalStorage(this.saveKey(slot));
    if (raw) {
      const result = migrateSaveEnvelope(raw, { gameVersion: this.gameVersion, profile: await this.loadProfile(), settings: await this.loadSettings() });
      if (result.ok) return normalizePersistedSave(result.value, { profile: await this.loadProfile(), settings: await this.loadSettings() });
      if (result.reason === 'NEWER_SCHEMA') this.blockedKeys.add(this.saveKey(slot));
      await logWarn('save load fell back', result.reason);
    }
    if (slot === SAVE_SLOT_AUTOSAVE) {
      const legacy = legacySave();
      return legacy ? normalizePersistedSave(legacy, { profile: legacyProfile(), settings: legacySettings() }) : null;
    }
    return null;
  }

  async saveGame(slot = SAVE_SLOT_AUTOSAVE, save) {
    if (this.blockedKeys.has(this.saveKey(slot))) { await logWarn('refusing to overwrite newer save schema', this.saveKey(slot)); return; }
    const profile = await this.loadProfile();
    const settings = await this.loadSettings();
    const data = normalizePersistedSave(save, { profile, settings: save?.settings || settings });
    writeLocalStorage(this.saveKey(slot), serializeEnvelope(makeEnvelope(data, { schemaVersion: SAVE_SCHEMA_VERSION, gameVersion: this.gameVersion })));
  }

  async deleteSave(slot = SAVE_SLOT_AUTOSAVE) { removeLocalStorage(this.saveKey(slot)); }

  async listSaves() {
    const out = [];
    for (const slot of SAVE_SLOTS) {
      const save = await this.loadSave(slot);
      if (save) out.push({ slot, updatedAt: null, area: save.area || null, playSeconds: save.playSeconds || 0, hasRun: !!save.run });
    }
    return out;
  }

  async exportAllData() {
    return { format: 'chunk-surfer-export', version: 1, exportedAt: new Date().toISOString(), settings: await this.loadSettings(), profile: await this.loadProfile(), saves: await Promise.all(SAVE_SLOTS.map(async (slot) => [slot, await this.loadSave(slot)])) };
  }

  async deleteAllUserData() {
    removeKeys([SETTINGS_KEY, PROFILE_KEY, AUTOSAVE_KEY, MIGRATION_KEY, ...SAVE_SLOTS.map((slot) => this.saveKey(slot))]);
  }

  async getStorageInfo() {
    return { kind: this.kind, keys: { settings: SETTINGS_KEY, profile: PROFILE_KEY, autosave: AUTOSAVE_KEY, migration: MIGRATION_KEY }, recentErrors: storageErrors(), migration: this.migration || null };
  }
}
