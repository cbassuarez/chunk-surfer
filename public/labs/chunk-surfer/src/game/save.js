// Persistence, in two files with different lifetimes.
//
// SAVE v3 — the current night. NEW GAME replaces this record.
// META v2 — knowledge, returns, achievements, and platform sync state. NEW
// GAME never clears it.
//
// Every read is defensive. Unknown/corrupt data falls back to a usable state;
// a bad localStorage value must never brick the game.

import { PLAN_SCALE } from '../data/floorplan/legend.js';
import {
  SAVE_VERSION,
  META_VERSION,
  DEFAULT_SETTINGS,
  freshMeta,
  freshRunRecord,
  normalizeMeta,
  normalizeRun,
  normalizeSettings,
} from '../progression/schema.js';
import { normalizeRuleValues } from '../progression/difficulty.js';
import { DIFFICULTY_PRESETS } from '../progression/difficulty-defs.js';
import { ACHIEVEMENT_BY_ID } from '../progression/achievement-defs.js';
import { queueChangedStats } from '../progression/stat-defs.js';

const SAVE_KEY = 'chunk-surfer:save:v3';
const LEGACY_SAVE_KEYS = ['chunk-surfer:save:v2', 'chunk-surfer:save:v1'];
const META_KEY = 'chunk-surfer:meta:v2';
const LEGACY_META_KEYS = ['chunk-surfer:meta:v1'];

export const freshSave = ({ settings = DEFAULT_SETTINGS, run = null } = {}) => ({
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
  settings: normalizeSettings(settings),
  run,
});

const scaleCoord = (v) => Number.isFinite(Number(v))
  ? Math.round(Number(v) * PLAN_SCALE) + Math.floor(PLAN_SCALE / 2)
  : v;

const scalePoint = (p) => (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
  ? { ...p, x: scaleCoord(p.x), y: scaleCoord(p.y) }
  : p;

function migrateSaveV1ToV2(data) {
  const next = { ...freshSave(), ...data, version: 2 };
  next.px = scaleCoord(data.px);
  next.py = scaleCoord(data.py);
  if (next.obj) {
    next.obj = { ...next.obj };
    next.obj.waypoint = scalePoint(next.obj.waypoint);
    if (Array.isArray(next.obj.pages)) next.obj.pages = next.obj.pages.map(scalePoint);
  }
  return next;
}

function migrateSaveToV3(data, meta) {
  let old = data;
  if (old?.version === 1) old = migrateSaveV1ToV2(old);
  if (old?.version !== 2) return null;

  const settings = normalizeSettings(old.settings);
  return normalizeSaveV3({
    ...old,
    version: SAVE_VERSION,
    settings,
    run: freshRunRecord({
      preset: settings.lastDifficulty || 'contract',
      meta,
      settings,
      now: Date.now(),
    }),
  }, meta);
}

function normalizeSaveV3(data, meta = null) {
  const base = freshSave();
  const source = data && typeof data === 'object' ? data : {};
  const settings = normalizeSettings(source.settings);
  const hasOldRunState = source.version < SAVE_VERSION && (
    Number(source.steps) > 0 || Object.keys(source.flags || {}).length > 0 || (source.takes || []).length > 0
  );

  return {
    ...base,
    ...source,
    version: SAVE_VERSION,
    flags: source.flags && typeof source.flags === 'object' ? source.flags : {},
    takes: Array.isArray(source.takes) ? source.takes : [],
    items: Array.isArray(source.items) ? source.items : [],
    props: { ...base.props, ...(source.props && typeof source.props === 'object' ? source.props : {}) },
    encounters: { ...base.encounters, ...(source.encounters && typeof source.encounters === 'object' ? source.encounters : {}) },
    doors: { ...base.doors, ...(source.doors && typeof source.doors === 'object' ? source.doors : {}) },
    settings,
    run: sanitizeRun(normalizeRun(source.run, {
      meta,
      settings,
      activeFallback: hasOldRunState,
    })),
  };
}

function sanitizeRun(run) {
  if (!run) return null;
  const knownPreset = run.rules?.startedPreset === 'custom' || !!DIFFICULTY_PRESETS[run.rules?.startedPreset];
  if (!knownPreset) {
    run.rules.startedPreset = 'contract';
    if (!run.rules.custom) run.rules.currentPreset = 'contract';
  }
  if (run.rules.currentPreset !== 'custom' && !DIFFICULTY_PRESETS[run.rules.currentPreset]) {
    run.rules.currentPreset = run.rules.startedPreset;
  }
  run.rules.values = normalizeRuleValues(run.rules.values);
  if (run.integrity?.deadAir?.eligible && run.rules.startedPreset !== 'dead-air') {
    run.integrity.deadAir.eligible = false;
    run.integrity.deadAir.invalidations.push({
      at: Date.now(),
      reason: 'REPAIRED_INVALID_CERTIFICATION',
    });
  }
  return run;
}

function sanitizeMeta(metaValue) {
  const clean = normalizeMeta(metaValue);
  clean.achievements = Object.fromEntries(
    Object.entries(clean.achievements || {}).filter(([id, record]) => (
      !!ACHIEVEMENT_BY_ID[id] && record && typeof record === 'object'
    )),
  );
  clean.platform.pendingAchievements = (clean.platform.pendingAchievements || [])
    .filter((id) => !!ACHIEVEMENT_BY_ID[id]);
  return clean;
}

function migrateMetaToV2(data) {
  if (data?.version !== 1) return null;
  return sanitizeMeta({
    ...freshMeta(),
    ...data,
    version: META_VERSION,
    achievements: {},
    knowledge: {},
    challengeCompletions: { deadAir: false },
    stats: {
      runsStarted: Number(data.runs) || 0,
      endingsSeen: Array.isArray(data.endingsSeen) ? data.endingsSeen.length : 0,
    },
  });
}

function safeParse(raw) {
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function firstStored(keys) {
  try {
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw != null) return { key, raw };
    }
  } catch (_) {}
  return null;
}

function write(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) { /* private mode */ }
}

let save = freshSave();
let meta = freshMeta();

export function saveLoad() {
  const metaStored = firstStored([META_KEY, ...LEGACY_META_KEYS]);
  if (!metaStored) {
    meta = freshMeta();
  } else {
    const raw = safeParse(metaStored.raw);
    if (raw?.version === META_VERSION) meta = sanitizeMeta(raw);
    else meta = migrateMetaToV2(raw) || freshMeta();
    if (metaStored.key !== META_KEY) write(META_KEY, meta);
  }

  const saveStored = firstStored([SAVE_KEY, ...LEGACY_SAVE_KEYS]);
  if (!saveStored) {
    save = freshSave();
  } else {
    const raw = safeParse(saveStored.raw);
    if (raw?.version === SAVE_VERSION) save = normalizeSaveV3(raw, meta);
    else save = migrateSaveToV3(raw, meta) || freshSave();
    if (saveStored.key !== SAVE_KEY) write(SAVE_KEY, save);
  }

  return { save, meta };
}

export function getSave() { return save; }
export function getMeta() { return meta; }

export function hasSave() {
  return !!firstStored([SAVE_KEY, ...LEGACY_SAVE_KEYS]);
}

export function hasActiveRun() {
  // The in-memory run remains authoritative when storage is unavailable (for
  // example private browsing with a blocked localStorage write).
  return save?.run?.status === 'active';
}

export function saveCommit(patch = {}) {
  Object.assign(save, patch);
  save = normalizeSaveV3(save, meta);
  write(SAVE_KEY, save);
  return save;
}

export function metaCommit(patch = {}) {
  Object.assign(meta, patch);
  meta = sanitizeMeta(meta);
  write(META_KEY, meta);
  return meta;
}

export function newGame({ preset = null, values = null, now = Date.now() } = {}) {
  const settings = normalizeSettings(save?.settings);
  const selectedPreset = preset || settings.lastDifficulty || 'contract';
  settings.lastDifficulty = selectedPreset;
  if (selectedPreset === 'custom') settings.customShiftRules = normalizeRuleValues(values || settings.customShiftRules || {});

  save = freshSave({
    settings,
    run: freshRunRecord({
      preset: selectedPreset,
      values: values || undefined,
      meta,
      settings,
      now,
    }),
  });

  write(SAVE_KEY, save);
  const nextStats = {
    ...meta.stats,
    runsStarted: (meta.stats?.runsStarted || 0) + 1,
  };
  metaCommit({
    runs: meta.runs + 1,
    stats: nextStats,
    platform: {
      ...meta.platform,
      pendingStats: queueChangedStats(meta.stats, nextStats, meta.platform?.pendingStats),
    },
  });
  return save;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    for (const key of LEGACY_SAVE_KEYS) localStorage.removeItem(key);
  } catch (_) {}
  save = freshSave({ settings: save?.settings });
}

export function clearMeta() {
  try {
    localStorage.removeItem(META_KEY);
    for (const key of LEGACY_META_KEYS) localStorage.removeItem(key);
  } catch (_) {}
  meta = freshMeta();
}

export function clearAllData() {
  clearSave();
  clearMeta();
}
