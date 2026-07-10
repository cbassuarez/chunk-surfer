// Persistence, in two files with very different jobs.
//
// SAVE  (chunk-surfer:save:v1) — the run. Cleared by NEW GAME.
// META  (chunk-surfer:meta:v1) — what the game remembers about *you*, across
//        runs and deletions: endings seen, whether you have met the hush,
//        whether you once quit in the middle. NEW GAME does not clear this.
//        The horror of the meta file is that it survives the reset offered
//        as mercy.
//
// Unknown/corrupt version → fall back to a fresh state and never throw. A
// broken save must never brick the lab.

const SAVE_KEY = 'chunk-surfer:save:v1';
const META_KEY = 'chunk-surfer:meta:v1';
const SAVE_VERSION = 1;

const freshSave = () => ({
  version: SAVE_VERSION,
  flags: {},
  area: 'prologue',
  px: 0, py: 0,
  takes: [], items: [],
  playSeconds: 0,
  steps: 0,
  settings: { volume: 1, textCps: 42, fx: true, reduceDread: false },
});

const freshMeta = () => ({
  version: SAVE_VERSION,
  endingsSeen: [],
  hushMet: false,
  leftMidRun: false,
  runs: 0,
  lastSeenAt: 0,
});

function read(key, fresh) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fresh();
    const data = JSON.parse(raw);
    if (data?.version !== SAVE_VERSION) return fresh();
    return { ...fresh(), ...data };
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
  save = read(SAVE_KEY, freshSave);
  meta = read(META_KEY, freshMeta);
  return { save, meta };
}
export function getSave() { return save; }
export function getMeta() { return meta; }
export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (_) { return false; }
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
  try { localStorage.removeItem(SAVE_KEY); } catch (_) {}
  save = freshSave();
}
