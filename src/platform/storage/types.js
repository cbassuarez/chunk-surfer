export const STORAGE_SCHEMA_VERSION = 1;
export const SETTINGS_SCHEMA_VERSION = 1;
export const PROFILE_SCHEMA_VERSION = 1;
export const SAVE_SCHEMA_VERSION = 1;

export const SETTINGS_KEY = 'chunk-surfer:settings:v1';
export const PROFILE_KEY = 'chunk-surfer:profile:v1';
export const AUTOSAVE_KEY = 'chunk-surfer:save:autosave:v1';
export const MIGRATION_KEY = 'chunk-surfer:migration:v1';

export const LEGACY_SAVE_KEYS = ['chunk-surfer:save:v3', 'chunk-surfer:save:v2', 'chunk-surfer:save:v1'];
export const LEGACY_PROFILE_KEYS = ['chunk-surfer:meta:v2', 'chunk-surfer:meta:v1'];

export const SAVE_SLOT_AUTOSAVE = 'autosave';
export const SAVE_SLOTS = Object.freeze(['autosave', 'slot-1', 'slot-2']);

export const STORAGE_FILE_LAYOUT = Object.freeze({
  settings: 'settings.json',
  profile: 'profile.json',
  savesDir: 'saves',
  migrationDir: 'migration',
  logFile: 'chunksurfer.log',
});

export function saveSlotFile(slot = SAVE_SLOT_AUTOSAVE) {
  return slot === SAVE_SLOT_AUTOSAVE ? 'saves/autosave.json' : `saves/${slot}.json`;
}

export function saveSlotBackupFile(slot = SAVE_SLOT_AUTOSAVE) {
  const name = slot === SAVE_SLOT_AUTOSAVE ? 'autosave' : slot;
  return `saves/backup/${name}.previous.json`;
}
