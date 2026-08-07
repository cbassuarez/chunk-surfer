import { makeEnvelope, serializeEnvelope } from './jsonEnvelope.js';
import { migrateSettingsEnvelope, migrateProfileEnvelope, migrateSaveEnvelope } from './migrations.js';
import { normalizePersistedSettings, normalizePersistedProfile, normalizePersistedSave } from './schemas.js';
import { defaultSettings, defaultProfile } from './defaults.js';
import { readLocalStorage, firstStored, parseStoredJson } from './browserStorage.js';
import {
  SETTINGS_SCHEMA_VERSION,
  PROFILE_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  LEGACY_SAVE_KEYS,
  LEGACY_PROFILE_KEYS,
  SAVE_SLOTS,
  SAVE_SLOT_AUTOSAVE,
  saveSlotFile,
  saveSlotBackupFile,
} from './types.js';
import { isTauriRuntime } from '../detect.js';
import { resolveDesktopPaths } from '../paths/desktopPaths.js';
import { revealPath } from '../diagnostics/desktopDiagnostics.js';
import { logInfo, logWarn, logError } from '../diagnostics/diagnostics.js';
import { validateCausalTape } from '../../causal/tape.js';

const CAUSAL_PATHS = Object.freeze({
  latest: 'causal/latest.json',
  draft: 'causal/draft.json',
  sealed: 'causal/sealed.json',
  session: 'causal/session.json',
});

function dirname(path) {
  const i = String(path).lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '';
}


function profileLooksEmpty(profile) {
  return !profile
    || ((profile.endingsSeen || []).length === 0
      && Object.keys(profile.achievements || {}).length === 0
      && Number(profile.runs || 0) === 0
      && Number(profile.stats?.runsCompleted || 0) === 0
      && Number(profile.stats?.endingsSeen || 0) === 0);
}

function settingsLookDefault(settings) {
  const defaults = defaultSettings();
  return !settings || JSON.stringify(normalizePersistedSettings(settings)) === JSON.stringify(defaults);
}

async function tauriAdapter() {
  const fs = await import('@tauri-apps/plugin-fs');
  const { BaseDirectory } = fs;
  return {
    baseConfig: BaseDirectory.AppConfig,
    baseData: BaseDirectory.AppData,
    baseLog: BaseDirectory.AppLog,
    async exists(path, baseDir) { return fs.exists(path, { baseDir }); },
    async mkdir(path, baseDir) { if (path) await fs.mkdir(path, { baseDir, recursive: true }); },
    async readText(path, baseDir) { return fs.readTextFile(path, { baseDir }); },
    async writeText(path, data, baseDir) { return fs.writeTextFile(path, data, { baseDir }); },
    async remove(path, baseDir) { if (await fs.exists(path, { baseDir })) await fs.remove(path, { baseDir }); },
    async rename(oldPath, newPath, baseDir) { return fs.rename(oldPath, newPath, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir }); },
  };
}

export class DesktopStorage {
  constructor({ gameVersion = 'LOCAL', adapter = null, paths = null } = {}) {
    this.kind = 'desktop';
    this.gameVersion = gameVersion;
    this.adapter = adapter;
    this.paths = paths;
    this.errors = [];
    this.migration = null;
    this.blockedPaths = new Set();
  }

  async init() {
    if (!this.adapter) this.adapter = await tauriAdapter();
    if (!this.paths && isTauriRuntime()) this.paths = await resolveDesktopPaths();
    await this.ensureDirs();
    await this.migrateLocalStorageOnce();
    await logInfo('storage backend selected', 'desktop');
  }

  baseFor(kind) { return kind === 'settings' ? this.adapter.baseConfig : this.adapter.baseData; }

  async ensureDirs() {
    await this.adapter.mkdir('', this.adapter.baseData).catch(() => {});
    await this.adapter.mkdir('', this.adapter.baseConfig).catch(() => {});
    await this.adapter.mkdir('saves', this.adapter.baseData);
    await this.adapter.mkdir('saves/backup', this.adapter.baseData);
    await this.adapter.mkdir('migration', this.adapter.baseData);
    await this.adapter.mkdir('causal', this.adapter.baseData);
  }

  async readFile(path, baseDir) {
    try {
      if (!(await this.adapter.exists(path, baseDir))) return { ok: false, missing: true, raw: null };
      return { ok: true, raw: await this.adapter.readText(path, baseDir) };
    } catch (error) {
      this.recordError('read', path, error);
      return { ok: false, error, raw: null };
    }
  }

  async writeEnvelopeSafe(path, data, { schemaVersion, baseDir }) {
    if (this.blockedPaths.has(path)) { await logWarn('refusing to overwrite newer storage schema', path); return; }
    const envelope = makeEnvelope(data, { schemaVersion, gameVersion: this.gameVersion });
    const raw = serializeEnvelope(envelope);
    const tmp = `${path}.tmp`;
    const backup = path.endsWith('.json') ? path.replace(/\.json$/, '.previous.json') : `${path}.previous`;
    await this.adapter.mkdir(dirname(path), baseDir);
    await this.adapter.writeText(tmp, raw, baseDir);
    JSON.parse(await this.adapter.readText(tmp, baseDir));
    try {
      if (await this.adapter.exists(path, baseDir)) {
        if (path.startsWith('saves/')) {
          const targetBackup = saveSlotBackupFile(path.includes('slot-1') ? 'slot-1' : path.includes('slot-2') ? 'slot-2' : SAVE_SLOT_AUTOSAVE);
          await this.adapter.mkdir(dirname(targetBackup), baseDir);
          await this.adapter.writeText(targetBackup, await this.adapter.readText(path, baseDir), baseDir);
        } else {
          await this.adapter.writeText(backup, await this.adapter.readText(path, baseDir), baseDir);
        }
      }
    } catch (error) { this.recordError('backup', path, error); }
    // Tauri's fs plugin exposes rename; if a platform backend degrades this in
    // the future, the temp was already verified and a previous backup exists.
    try { await this.adapter.remove(path, baseDir); } catch (_) {}
    await this.adapter.rename(tmp, path, baseDir).catch(async () => {
      await this.adapter.writeText(path, raw, baseDir);
      await this.adapter.remove(tmp, baseDir).catch(() => {});
    });
  }

  async readEnvelopeWithBackup(path, { baseDir, backupPath = null, migrate, fallback }) {
    const primary = await this.readFile(path, baseDir);
    if (primary.ok) {
      const result = migrate(primary.raw, { gameVersion: this.gameVersion });
      if (result.ok) return result.value;
      if (result.reason === 'NEWER_SCHEMA') this.blockedPaths.add(path);
      this.recordError('schema', path, result.reason);
      await logWarn('storage primary invalid', `${path}: ${result.reason}`);
    } else if (!primary.missing) {
      await logWarn('storage primary unreadable', path);
    }
    if (backupPath) {
      const backup = await this.readFile(backupPath, baseDir);
      if (backup.ok) {
        const result = migrate(backup.raw, { gameVersion: this.gameVersion });
        if (result.ok) {
          await logWarn('storage recovered from backup', path);
          try { await this.writeEnvelopeSafe(path, result.value, { schemaVersion: result.envelope?.schemaVersion || 1, baseDir }); } catch (_) {}
          return result.value;
        }
        this.recordError('backup-schema', backupPath, result.reason);
      }
    }
    return fallback;
  }

  recordError(op, path, error) {
    const entry = { at: new Date().toISOString(), op, path, error: String(error?.message || error) };
    this.errors.push(entry);
    while (this.errors.length > 40) this.errors.shift();
    logError(`storage ${op} failed`, `${path}: ${entry.error}`);
  }

  async migrateLocalStorageOnce() {
    const marker = 'migration/localstorage-import-v1.json';
    if (await this.adapter.exists(marker, this.adapter.baseData).catch(() => false)) {
      await this.repairEmptyDesktopStateFromLocalStorage();
      return;
    }
    const found = [...LEGACY_PROFILE_KEYS, ...LEGACY_SAVE_KEYS].filter((key) => readLocalStorage(key) != null);
    const migrated = [];
    const skipped = [];
    const errors = [];
    try {
      const metaStored = firstStored(LEGACY_PROFILE_KEYS);
      const saveStored = firstStored(LEGACY_SAVE_KEYS);
      const legacyMeta = metaStored ? parseStoredJson(metaStored.raw) : null;
      const legacySave = saveStored ? parseStoredJson(saveStored.raw) : null;
      if (legacySave?.settings && !(await this.adapter.exists('settings.json', this.adapter.baseConfig))) {
        await this.saveSettings(legacySave.settings); migrated.push('settings');
      } else skipped.push('settings');
      if (legacyMeta && !(await this.adapter.exists('profile.json', this.adapter.baseData))) {
        await this.saveProfile(legacyMeta); migrated.push('profile');
      } else skipped.push('profile');
      if (legacySave && !(await this.adapter.exists(saveSlotFile(SAVE_SLOT_AUTOSAVE), this.adapter.baseData))) {
        await this.saveGame(SAVE_SLOT_AUTOSAVE, legacySave); migrated.push('autosave');
      } else skipped.push('autosave');
    } catch (error) {
      errors.push(String(error?.message || error));
      await logWarn('desktop localStorage migration failed', errors[0]);
    }
    this.migration = { timestamp: new Date().toISOString(), oldKeysFound: found, keysMigrated: migrated, keysSkipped: skipped, errors };
    await this.writeEnvelopeSafe(marker, this.migration, { schemaVersion: 1, baseDir: this.adapter.baseData });
  }

  async repairEmptyDesktopStateFromLocalStorage() {
    const metaStored = firstStored(LEGACY_PROFILE_KEYS);
    const saveStored = firstStored(LEGACY_SAVE_KEYS);
    if (!metaStored && !saveStored) return;

    const legacyMeta = metaStored ? parseStoredJson(metaStored.raw) : null;
    const legacySave = saveStored ? parseStoredJson(saveStored.raw) : null;
    const repaired = [];

    try {
      if (legacySave?.settings && await this.adapter.exists('settings.json', this.adapter.baseConfig)) {
        const current = await this.readEnvelopeWithBackup('settings.json', {
          baseDir: this.adapter.baseConfig,
          backupPath: 'settings.previous.json',
          migrate: migrateSettingsEnvelope,
          fallback: defaultSettings(),
        });
        if (settingsLookDefault(current)) {
          await this.saveSettings(legacySave.settings);
          repaired.push('settings');
        }
      }
      if (legacyMeta && await this.adapter.exists('profile.json', this.adapter.baseData)) {
        const current = await this.readEnvelopeWithBackup('profile.json', {
          baseDir: this.adapter.baseData,
          backupPath: 'profile.previous.json',
          migrate: migrateProfileEnvelope,
          fallback: defaultProfile(),
        });
        if (profileLooksEmpty(current)) {
          await this.saveProfile(legacyMeta);
          repaired.push('profile');
        }
      }
      if (legacySave && !(await this.adapter.exists(saveSlotFile(SAVE_SLOT_AUTOSAVE), this.adapter.baseData))) {
        await this.saveGame(SAVE_SLOT_AUTOSAVE, legacySave);
        repaired.push('autosave');
      }
      if (repaired.length) await logInfo('desktop localStorage migration repaired empty state', repaired.join(','));
    } catch (error) {
      this.recordError('migration-repair', 'localStorage', error);
    }
  }

  async loadSettings() {
    return this.readEnvelopeWithBackup('settings.json', {
      baseDir: this.adapter.baseConfig,
      backupPath: 'settings.previous.json',
      migrate: migrateSettingsEnvelope,
      fallback: defaultSettings(),
    }).then(normalizePersistedSettings);
  }

  async saveSettings(settings) {
    await this.writeEnvelopeSafe('settings.json', normalizePersistedSettings(settings), { schemaVersion: SETTINGS_SCHEMA_VERSION, baseDir: this.adapter.baseConfig });
  }

  async resetSettings() { const data = defaultSettings(); await this.saveSettings(data); return data; }

  async loadProfile() {
    return this.readEnvelopeWithBackup('profile.json', {
      baseDir: this.adapter.baseData,
      backupPath: 'profile.previous.json',
      migrate: migrateProfileEnvelope,
      fallback: defaultProfile(),
    }).then(normalizePersistedProfile);
  }

  async saveProfile(profile) {
    await this.writeEnvelopeSafe('profile.json', normalizePersistedProfile(profile), { schemaVersion: PROFILE_SCHEMA_VERSION, baseDir: this.adapter.baseData });
  }

  async loadSave(slot = SAVE_SLOT_AUTOSAVE) {
    const profile = await this.loadProfile();
    const settings = await this.loadSettings();
    const value = await this.readEnvelopeWithBackup(saveSlotFile(slot), {
      baseDir: this.adapter.baseData,
      backupPath: saveSlotBackupFile(slot),
      migrate: (raw, options) => migrateSaveEnvelope(raw, { ...options, profile, settings }),
      fallback: null,
    });
    return value ? normalizePersistedSave(value, { profile, settings }) : null;
  }

  async saveGame(slot = SAVE_SLOT_AUTOSAVE, save) {
    const profile = await this.loadProfile();
    const settings = save?.settings || await this.loadSettings();
    await this.writeEnvelopeSafe(saveSlotFile(slot), normalizePersistedSave(save, { profile, settings }), { schemaVersion: SAVE_SCHEMA_VERSION, baseDir: this.adapter.baseData });
  }

  async deleteSave(slot = SAVE_SLOT_AUTOSAVE) {
    // A cleared run must not be reconstructed from the safety copy on the next
    // launch. The backup belongs to the same save slot and therefore shares
    // the slot's deletion lifetime.
    await Promise.all([
      this.adapter.remove(saveSlotFile(slot), this.adapter.baseData).catch(() => {}),
      this.adapter.remove(saveSlotBackupFile(slot), this.adapter.baseData).catch(() => {}),
    ]);
  }

  async listSaves() {
    const out = [];
    for (const slot of SAVE_SLOTS) {
      const save = await this.loadSave(slot);
      if (save) out.push({ slot, updatedAt: null, area: save.area || null, playSeconds: save.playSeconds || 0, hasRun: !!save.run });
    }
    return out;
  }

  async readCausalFile(path, { validateTape = false } = {}) {
    const read = async (target) => {
      const file = await this.readFile(target, this.adapter.baseData);
      if (!file.ok) return null;
      try {
        const parsed = JSON.parse(file.raw);
        const value = parsed && Object.prototype.hasOwnProperty.call(parsed, 'data') ? parsed.data : parsed;
        if (validateTape) {
          const validation = validateCausalTape(value);
          if (!validation.ok) throw new Error(validation.reason);
        }
        return value;
      } catch (error) {
        this.recordError('causal-schema', target, error);
        return null;
      }
    };
    const primary = await read(path);
    if (primary) return primary;
    const backup = path.replace(/\.json$/, '.previous.json');
    const recovered = await read(backup);
    if (recovered) await this.writeEnvelopeSafe(path, recovered, { schemaVersion: 1, baseDir: this.adapter.baseData });
    return recovered;
  }

  async loadLatestCausalTape() { return this.readCausalFile(CAUSAL_PATHS.latest, { validateTape: true }); }
  async loadCausalDraft() { return this.readCausalFile(CAUSAL_PATHS.draft); }

  async appendCausalDraftSegment(runId, segment, header = {}) {
    const draft = await this.loadCausalDraft();
    const next = draft?.runId === runId
      ? { ...draft, segments: [...(draft.segments || []), segment] }
      : { runId, ...header, segments: [segment], sealed: null };
    await this.writeEnvelopeSafe(CAUSAL_PATHS.draft, next, { schemaVersion: 1, baseDir: this.adapter.baseData });
    return next;
  }

  async sealCausalDraft(runId, tape) {
    const draft = await this.loadCausalDraft();
    if (draft?.runId && draft.runId !== runId) throw new Error('causal draft run mismatch');
    const sealed = { runId, tape, sealedAt: Date.now() };
    await this.writeEnvelopeSafe(CAUSAL_PATHS.sealed, sealed, { schemaVersion: 1, baseDir: this.adapter.baseData });
    await this.writeEnvelopeSafe(CAUSAL_PATHS.draft, { ...(draft || {}), runId, sealedAt: sealed.sealedAt }, { schemaVersion: 1, baseDir: this.adapter.baseData });
    return sealed;
  }

  async loadSealedCausalDraft() { return this.readCausalFile(CAUSAL_PATHS.sealed); }

  async promoteCausalDraft(runId) {
    const sealed = await this.loadSealedCausalDraft();
    if (!sealed || sealed.runId !== runId) throw new Error('sealed causal draft unavailable');
    const validation = validateCausalTape(sealed.tape);
    if (!validation.ok) throw new Error(validation.reason);
    await this.writeEnvelopeSafe(CAUSAL_PATHS.latest, sealed.tape, { schemaVersion: 1, baseDir: this.adapter.baseData });
    await Promise.all([
      this.deleteCausalPath(CAUSAL_PATHS.draft),
      this.deleteCausalPath(CAUSAL_PATHS.sealed),
      this.deleteHushRunSession(),
    ]);
    return sealed.tape;
  }

  async deleteCausalPath(path) {
    await Promise.all([
      this.adapter.remove(path, this.adapter.baseData).catch(() => {}),
      this.adapter.remove(path.replace(/\.json$/, '.previous.json'), this.adapter.baseData).catch(() => {}),
      this.adapter.remove(`${path}.tmp`, this.adapter.baseData).catch(() => {}),
    ]);
  }

  async discardCausalDraft(runId = null) {
    const draft = await this.loadCausalDraft();
    const sealed = await this.loadSealedCausalDraft();
    if (!runId || draft?.runId === runId) await this.deleteCausalPath(CAUSAL_PATHS.draft);
    if (!runId || sealed?.runId === runId) await this.deleteCausalPath(CAUSAL_PATHS.sealed);
  }

  async loadHushRunSession() { return this.readCausalFile(CAUSAL_PATHS.session); }
  async saveHushRunSession(session) {
    await this.writeEnvelopeSafe(CAUSAL_PATHS.session, session, { schemaVersion: 1, baseDir: this.adapter.baseData });
    return session;
  }
  async deleteHushRunSession() { await this.deleteCausalPath(CAUSAL_PATHS.session); }
  async deleteLatestCausalTape() { await this.deleteCausalPath(CAUSAL_PATHS.latest); await this.deleteHushRunSession(); }

  async exportAllData() {
    return { format: 'chunk-surfer-export', version: 2, exportedAt: new Date().toISOString(), settings: await this.loadSettings(), profile: await this.loadProfile(), saves: await Promise.all(SAVE_SLOTS.map(async (slot) => [slot, await this.loadSave(slot)])), causal: { latest: await this.loadLatestCausalTape(), session: await this.loadHushRunSession() }, storage: await this.getStorageInfo() };
  }

  async deleteAllUserData() {
    await this.adapter.remove('settings.json', this.adapter.baseConfig).catch(() => {});
    await this.adapter.remove('settings.previous.json', this.adapter.baseConfig).catch(() => {});
    await this.adapter.remove('profile.json', this.adapter.baseData).catch(() => {});
    await this.adapter.remove('profile.previous.json', this.adapter.baseData).catch(() => {});
    for (const slot of SAVE_SLOTS) await this.deleteSave(slot);
    for (const path of Object.values(CAUSAL_PATHS)) await this.deleteCausalPath(path);
  }

  async getStorageInfo() {
    return { kind: this.kind, paths: this.paths, layout: { appData: ['profile.json', 'saves/*.json', 'causal/latest.json', 'causal/draft.json', 'causal/session.json'], appConfig: ['settings.json'], appLog: ['chunksurfer.log'] }, migration: this.migration, recentErrors: [...this.errors] };
  }

  async revealSaveFolder() { return this.paths?.appData ? revealPath(this.paths.appData) : { ok: false, unsupported: true }; }
  async revealLogFolder() { return this.paths?.appLog ? revealPath(this.paths.appLog) : { ok: false, unsupported: true }; }
}

export class MemoryFileAdapter {
  constructor() { this.files = new Map(); this.baseConfig = 'config'; this.baseData = 'data'; this.baseLog = 'log'; }
  key(path, baseDir) { return `${baseDir}:${path}`; }
  async exists(path, baseDir) { return path === '' || this.files.has(this.key(path, baseDir)); }
  async mkdir() {}
  async readText(path, baseDir) { const key = this.key(path, baseDir); if (!this.files.has(key)) throw new Error('not found'); return this.files.get(key); }
  async writeText(path, data, baseDir) { this.files.set(this.key(path, baseDir), String(data)); }
  async remove(path, baseDir) { this.files.delete(this.key(path, baseDir)); }
  async rename(oldPath, newPath, baseDir) { const raw = await this.readText(oldPath, baseDir); this.files.set(this.key(newPath, baseDir), raw); this.files.delete(this.key(oldPath, baseDir)); }
}
