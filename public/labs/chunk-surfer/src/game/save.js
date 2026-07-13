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
  hushAudio: null,
  settings: normalizeSettings(settings),
  run,
});

const scaleCoord = (v) => Number.isFinite(Number(v))
  ? Math.round(Number(v) * PLAN_SCALE) + Math.floor(PLAN_SCALE / 2)
  : v;

const scalePoint = (p) => (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
  ? { ...p, x: scaleCoord(p.x), y: scaleCoord(p.y) }
  : p;

const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unitNumber = (value, fallback = 0) => Math.max(0, Math.min(1, finiteNumber(value, fallback)));
const boundedMs = (value) => Math.max(0, Math.min(7 * 24 * 60 * 60 * 1000, finiteNumber(value, 0)));
const finitePoint = (value) => value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
  ? { x: Number(value.x), y: Number(value.y) }
  : null;

function normalizeHushAudioSave(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const audition = value.audition && typeof value.audition === 'object' ? value.audition : {};
  const mischief = value.mischief && typeof value.mischief === 'object' ? value.mischief : {};
  const sanitizeMap = (source) => Object.fromEntries(
    Object.entries(source && typeof source === 'object' && !Array.isArray(source) ? source : {})
      .filter(([id]) => typeof id === 'string' && id.length <= 96)
      .slice(0, 32)
      .map(([id, amount]) => [id, boundedMs(amount)]),
  );
  const sanitizeCounts = (source) => Object.fromEntries(
    Object.entries(source && typeof source === 'object' && !Array.isArray(source) ? source : {})
      .filter(([id]) => typeof id === 'string' && id.length <= 96)
      .slice(0, 32)
      .map(([id, amount]) => [id, Math.max(0, Math.min(999, Math.floor(finiteNumber(amount, 0))))]),
  );
  const lastHeard = audition.lastHeard && typeof audition.lastHeard === 'object'
    ? {
        eventId: typeof audition.lastHeard.eventId === 'string' ? audition.lastHeard.eventId.slice(0, 128) : null,
        at: finiteNumber(audition.lastHeard.at, 0),
        roomId: typeof audition.lastHeard.roomId === 'string' ? audition.lastHeard.roomId.slice(0, 96) : null,
        floorId: typeof audition.lastHeard.floorId === 'string' ? audition.lastHeard.floorId.slice(0, 96) : null,
        position: finitePoint(audition.lastHeard.position),
        confidence: unitNumber(audition.lastHeard.confidence),
        effectiveLevelDb: finiteNumber(audition.lastHeard.effectiveLevelDb, -96),
      }
    : null;
  return {
    schema: 1,
    audition: {
      interest: unitNumber(audition.interest),
      certainty: unitNumber(audition.certainty),
      agitation: unitNumber(audition.agitation),
      playfulness: unitNumber(audition.playfulness, .48),
      lastHeard,
      hypotheses: (Array.isArray(audition.hypotheses) ? audition.hypotheses : []).slice(0, 4).map((entry) => ({
        roomId: typeof entry?.roomId === 'string' ? entry.roomId.slice(0, 96) : null,
        floorId: typeof entry?.floorId === 'string' ? entry.floorId.slice(0, 96) : null,
        position: finitePoint(entry?.position),
        confidence: unitNumber(entry?.confidence),
        updatedAt: finiteNumber(entry?.updatedAt, 0),
      })).filter((entry) => entry.position),
      pressure: {
        recentEnergy: unitNumber(audition.pressure?.recentEnergy),
        repeatedNoise: unitNumber(audition.pressure?.repeatedNoise),
        impulsiveNoise: unitNumber(audition.pressure?.impulsiveNoise),
      },
      // Semantic identifiers only. Raw microphone/audio data has no accepted
      // field and is discarded during every load.
      noiseMemory: (Array.isArray(audition.noiseMemory) ? audition.noiseMemory : []).slice(-8).map((entry) => ({
        eventId: typeof entry?.eventId === 'string' ? entry.eventId.slice(0, 128) : null,
        kind: typeof entry?.kind === 'string' ? entry.kind.slice(0, 96) : 'handling_noise',
        sampleId: typeof entry?.sampleId === 'string' ? entry.sampleId.slice(0, 128) : null,
        family: typeof entry?.family === 'string' ? entry.family.slice(0, 96) : 'handling',
        heardAt: finiteNumber(entry?.heardAt, 0),
        roomId: typeof entry?.roomId === 'string' ? entry.roomId.slice(0, 96) : null,
        floorId: typeof entry?.floorId === 'string' ? entry.floorId.slice(0, 96) : null,
        position: finitePoint(entry?.position),
        effectiveLevelDb: finiteNumber(entry?.effectiveLevelDb, -96),
        mimic: { allowed: !!entry?.mimic?.allowed },
      })).filter((entry) => entry.position),
    },
    mischief: {
      lastCueAgeMs: boundedMs(mischief.lastCueAgeMs),
      familyRemaining: sanitizeMap(mischief.familyRemaining),
      cueRemaining: sanitizeMap(mischief.cueRemaining),
      cueCounts: sanitizeCounts(mischief.cueCounts),
      history: (Array.isArray(mischief.history) ? mischief.history : []).slice(-16).map((entry) => ({
        id: typeof entry?.id === 'string' ? entry.id.slice(0, 96) : '',
        family: typeof entry?.family === 'string' ? entry.family.slice(0, 96) : '',
        ageMs: boundedMs(entry?.ageMs),
      })).filter((entry) => entry.id),
    },
  };
}

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
    hushAudio: normalizeHushAudioSave(source.hushAudio),
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
