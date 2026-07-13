// The terror director.
//
// Its job is *restraint*. Every technique here is a one-shot: a rule the game
// has taught you, broken exactly once, and never again — repetition would only
// teach a new, comfortable rule. The budget lives in data/terror-map.js (M4);
// this module owns the mechanisms and the accounting.
//
// Browser-native fourth wall, all self-contained (no network, no files):
//   · the meta file survives NEW GAME, so the game remembers you
//   · Page Visibility: looking away is an event the game may notice, once
//   · document.title / favicon shift in the finale
//   · real play data (steps, seconds) is quotable in dialogue

import { getMeta, metaCommit, getSave } from './save.js';

const fired = new Set();
let onLookAway = null;
let awayArmed = false;
let originalTitle = document.title;

export function terrorInit() {
  const meta = getMeta();
  // "you left. it stayed." — set on unload, read on the next boot.
  if (meta.leftMidRun) metaCommit({ leftMidRun: false });

  window.addEventListener('beforeunload', () => {
    if (getSave().steps > 0) metaCommit({ leftMidRun: true, lastSeenAt: Date.now() });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { awayArmed = true; return; }
    if (awayArmed && onLookAway) { awayArmed = false; const fn = onLookAway; onLookAway = null; fn(); }
  });
}

// Reduce-dread accessibility setting disables the physical/deceptive layer:
// infrasound, hard flashes, and the fake crash. Dialogue and dread remain.
export function dreadAllowed() { return !getSave().settings.reduceDread; }

// once('id', fn) — the whole discipline of this file in four lines.
export function once(id, fn) {
  if (fired.has(id)) return false;
  fired.add(id);
  fn();
  return true;
}
export function hasFired(id) { return fired.has(id); }

// Arm the next tab-return. Used sparingly: the world changes while you look
// away, and a character mentions it, exactly one time.
export function armLookAway(fn) { onLookAway = fn; }

export function setTitle(t) { document.title = t; }
export function restoreTitle() { document.title = originalTitle; }

// Diegetic use of real play data. "4,213 steps. mostly in circles."
export function playStats() {
  const s = getSave();
  return {
    steps: s.steps || 0,
    seconds: Math.round(s.playSeconds || 0),
    runs: getMeta().runs || 0,
    hushMet: !!getMeta().hushMet,
    leftBefore: !!getMeta().leftMidRun,
  };
}

// Substitute {steps}, {minutes}, {runs} into authored prose.
export function interpolate(text) {
  const st = playStats();
  return String(text)
    .replace(/\{steps\}/g, st.steps.toLocaleString())
    .replace(/\{minutes\}/g, Math.max(1, Math.round(st.seconds / 60)))
    .replace(/\{runs\}/g, st.runs);
}
