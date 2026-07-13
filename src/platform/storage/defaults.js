import { DEFAULT_SETTINGS, freshMeta, normalizeSettings, normalizeMeta } from '../../progression/schema.js';
import { SAVE_VERSION } from '../../progression/schema.js';

export function defaultSettings() {
  return normalizeSettings(DEFAULT_SETTINGS);
}

export function defaultProfile() {
  return normalizeMeta(freshMeta());
}

export function defaultSave(settings = defaultSettings()) {
  return {
    version: SAVE_VERSION,
    flags: {},
    area: 'prologue',
    px: 0,
    py: 0,
    takes: [],
    items: [],
    props: { inspected: [], auditioned: [], cycles: {}, hushSeed: 0x43535552, hushCount: 0 },
    encounters: { cleared: [] },
    doors: { open: [] },
    playSeconds: 0,
    steps: 0,
    bagNav: null,
    hushAudio: null,
    settings: normalizeSettings(settings),
    run: null,
  };
}
