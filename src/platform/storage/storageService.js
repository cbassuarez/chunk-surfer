import { detectStorageBackendKind } from '../detect.js';
import { BrowserStorage } from './browserStorage.js';
import { DesktopStorage } from './desktopStorage.js';
import { defaultSettings, defaultProfile } from './defaults.js';
import { normalizePersistedSave } from './schemas.js';
import { SAVE_SLOT_AUTOSAVE } from './types.js';
import { initDiagnostics, logWarn, collectDiagnostics } from '../diagnostics/diagnostics.js';

let storage = null;
let initialized = false;
let pending = Promise.resolve();

export function createGameStorage({ kind = detectStorageBackendKind(), gameVersion = 'LOCAL', adapter = null } = {}) {
  if (kind === 'desktop') return new DesktopStorage({ gameVersion, adapter });
  return new BrowserStorage({ gameVersion });
}

export function currentStorage() { return storage; }
export function storageReady() { return initialized; }

export async function initGameStorage({ gameVersion = 'LOCAL', kind = null, adapter = null } = {}) {
  await initDiagnostics();
  storage = createGameStorage({ kind: kind || detectStorageBackendKind(), gameVersion, adapter });
  try {
    await storage.init();
    initialized = true;
  } catch (error) {
    await logWarn('storage init failed; falling back to browser', error?.message || error);
    storage = new BrowserStorage({ gameVersion });
    await storage.init().catch(() => {});
    initialized = true;
  }
  return storage;
}

export async function loadGameState({ gameVersion = 'LOCAL' } = {}) {
  if (!storage) await initGameStorage({ gameVersion });
  const settings = await storage.loadSettings().catch(() => defaultSettings());
  const profile = await storage.loadProfile().catch(() => defaultProfile());
  const save = await storage.loadSave(SAVE_SLOT_AUTOSAVE).catch(() => null);
  return { settings, profile, save: save ? normalizePersistedSave({ ...save, settings: save.settings || settings }, { profile, settings }) : null };
}

function enqueue(task) {
  pending = pending.then(task, task).catch((error) => logWarn('storage write failed', error?.message || error));
  return pending;
}

export function saveSettingsQueued(settings) {
  if (!storage) return Promise.resolve(false);
  return enqueue(() => storage.saveSettings(settings).then(() => true));
}

export function saveProfileQueued(profile) {
  if (!storage) return Promise.resolve(false);
  return enqueue(() => storage.saveProfile(profile).then(() => true));
}

export function saveGameQueued(save) {
  if (!storage) return Promise.resolve(false);
  return enqueue(() => storage.saveGame(SAVE_SLOT_AUTOSAVE, save).then(() => true));
}

export function deleteSaveQueued() {
  if (!storage) return Promise.resolve(false);
  return enqueue(() => storage.deleteSave(SAVE_SLOT_AUTOSAVE).then(() => true));
}

export function deleteProfileQueued() {
  if (!storage) return Promise.resolve(false);
  return enqueue(async () => { const profile = defaultProfile(); await storage.saveProfile(profile); return true; });
}

export async function loadLatestCausalTape() { return storage?.loadLatestCausalTape?.() || null; }
export async function loadCausalDraft() { return storage?.loadCausalDraft?.() || null; }
export async function loadSealedCausalDraft() { return storage?.loadSealedCausalDraft?.() || null; }
export async function appendCausalDraftSegment(runId, segment, header = {}) {
  if (!storage?.appendCausalDraftSegment) throw new Error('causal storage unavailable');
  return storage.appendCausalDraftSegment(runId, segment, header);
}
export async function sealCausalDraft(runId, tape) {
  if (!storage?.sealCausalDraft) throw new Error('causal storage unavailable');
  return storage.sealCausalDraft(runId, tape);
}
export async function promoteCausalDraft(runId) {
  if (!storage?.promoteCausalDraft) throw new Error('causal storage unavailable');
  return storage.promoteCausalDraft(runId);
}
export async function discardCausalDraft(runId = null) { return storage?.discardCausalDraft?.(runId); }
export async function loadHushRunSession() { return storage?.loadHushRunSession?.() || null; }
export async function saveHushRunSession(session) {
  if (!storage?.saveHushRunSession) return null;
  return storage.saveHushRunSession(session);
}
export async function deleteHushRunSession() { return storage?.deleteHushRunSession?.(); }
export async function deleteLatestCausalTape() { return storage?.deleteLatestCausalTape?.(); }

export async function exportDiagnosticsForSupport() {
  return collectDiagnostics({ storage });
}

export async function exportAllData() {
  return storage?.exportAllData ? storage.exportAllData() : null;
}

export async function deleteAllUserData() {
  return storage?.deleteAllUserData?.();
}

export async function revealSaveFolder() {
  if (storage?.revealSaveFolder) return storage.revealSaveFolder();
  const mod = await import('../diagnostics/browserDiagnostics.js');
  return mod.revealSaveFolder();
}

export async function revealLogFolder() {
  if (storage?.revealLogFolder) return storage.revealLogFolder();
  const mod = await import('../diagnostics/browserDiagnostics.js');
  return mod.revealLogFolder();
}
