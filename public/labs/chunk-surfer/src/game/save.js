// Persistence, in two files with very different jobs.
//
// SAVE  (chunk-surfer:save:v2) — the run. Cleared by NEW GAME.
// META  (chunk-surfer:meta:v1) — what the game remembers about *you*, across
//        runs and deletions: endings seen, whether you have met the hush,
//        whether you once quit in the middle. NEW GAME does not clear this.
//        The horror of the meta file is that it survives the reset offered
//        as mercy.
//
// Unknown/corrupt version → fall back to a fresh state and never throw. A
// broken save must never brick the lab.

import { PLAN_SCALE } from '../data/floorplan/legend.js';

const SAVE_KEY = 'chunk-surfer:save:v2';
const LEGACY_SAVE_KEY = 'chunk-surfer:save:v1';
const META_KEY = 'chunk-surfer:meta:v1';
const SAVE_VERSION = 2;
const META_VERSION = 1;

const freshSave = () => ({
  version: SAVE_VERSION,
  flags: {},
  area: 'prologue',
  px: 0, py: 0,
  takes: [], items: [],
  props: { inspected: [], auditioned: [], cycles: {}, hushSeed: 0x43535552, hushCount: 0 },
  playSeconds: 0,
  steps: 0,
  settings: { volume: 1, music: 1, textCps: 42, fx: true, reduceDread: false, mic: 'on' },
});

const freshMeta = () => ({
  version: META_VERSION,
  endingsSeen: [],
  hushMet: false,
  leftMidRun: false,
  runs: 0,
  lastSeenAt: 0,
});

const scaleCoord = (v) => Number.isFinite(Number(v))
  ? Math.round(Number(v) * PLAN_SCALE) + Math.floor(PLAN_SCALE / 2)
  : v;
const scalePoint = (p) => (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
  ? { ...p, x: scaleCoord(p.x), y: scaleCoord(p.y) }
  : p;

function migrateSave(data) {
  if (data?.version !== 1) return null;
  const next = { ...freshSave(), ...data, version: SAVE_VERSION };
  next.px = scaleCoord(data.px);
  next.py = scaleCoord(data.py);
  if (next.obj) {
    next.obj = { ...next.obj };
    next.obj.waypoint = scalePoint(next.obj.waypoint);
    if (Array.isArray(next.obj.pages)) next.obj.pages = next.obj.pages.map(scalePoint);
  }
  return next;
}

function read(key, fresh, version, migrate = null, legacyKey = null) {
  try {
    let raw = localStorage.getItem(key);
    let fromLegacy = false;
    if (!raw && legacyKey) {
      raw = localStorage.getItem(legacyKey);
      fromLegacy = !!raw;
    }
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    if (data?.version === version) return { ...fresh(), ...data };
    const migrated = migrate?.(data);
    if (!migrated) return fresh();
    if (fromLegacy) write(key, migrated);
    return migrated;
  } catch (_) {
    return fresh();
  }
}
function write(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) { /* private mode */ }
}

let save = freshSave();
let meta = freshMeta();

export function saveLoad() {
  save = read(SAVE_KEY, freshSave, SAVE_VERSION, migrateSave, LEGACY_SAVE_KEY);
  meta = read(META_KEY, freshMeta, META_VERSION);
  return { save, meta };
}
export function getSave() { return save; }
export function getMeta() { return meta; }
export function hasSave() {
  try { return !!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY)); } catch (_) { return false; }
}
export function saveCommit(patch = {}) {
  Object.assign(save, patch);
  write(SAVE_KEY, save);
}
export function metaCommit(patch = {}) {
  Object.assign(meta, patch);
  write(META_KEY, meta);
}
export function newGame() {
  save = freshSave();
  write(SAVE_KEY, save);
  metaCommit({ runs: meta.runs + 1 });
  return save;
}
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch (_) {}
  save = freshSave();
}
