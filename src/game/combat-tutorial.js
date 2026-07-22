// The combat drill director. Pure: it never touches rendering, audio, or the
// reducer — the combat scene pipes moves through filterMoves, reports each
// resolved turn to advance, and draws prompt/spotlight wherever it likes.
//
// The step order is written against the `training` profile's intent script in
// src/data/combat-definitions.js (tone → print → mask → swell). Changing one
// without the other breaks the drill.

import { COMBAT_ACTION } from './combat-state.js';

export const COMBAT_TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    id: 'hold',
    allow: Object.freeze([COMBAT_ACTION.HOLD]),
    spotlight: 'moves',
    say: 'DRILL · HOLD GUARDS THE HIT AND SETTLES YOU INTO SILENCE. TAKE THE TONE ON YOUR HANDS.',
    until: (last) => last.action === COMBAT_ACTION.HOLD,
  }),
  Object.freeze({
    id: 'monitor',
    allow: Object.freeze([COMBAT_ACTION.MONITOR]),
    spotlight: 'intent',
    say: 'DRILL · A BROADCAST TELEGRAPHS ITSELF. MONITOR COUNTERS IT — HIT NEGATED, TAKE CAPTURED.',
    until: (last) => last.action === COMBAT_ACTION.MONITOR && last.perfect === true,
  }),
  Object.freeze({
    id: 'tempo',
    allow: Object.freeze([COMBAT_ACTION.PLAYBACK]),
    spotlight: 'tempo',
    say: 'DRILL · PERFECT RESPONSE OPENED TEMPO: ONE FREE ACTION. SPEND THE TAKE — PLAYBACK.',
    until: (last) => last.action === COMBAT_ACTION.PLAYBACK,
  }),
  Object.freeze({
    id: 'expose',
    allow: Object.freeze([COMBAT_ACTION.EXPOSE]),
    spotlight: 'stance',
    say: 'DRILL · IT CONCEALS. EXPOSE COUNTERS — AND SHOVES YOUR STANCE TO NOISE. WATCH THE TRIANGLE.',
    until: (last) => last.action === COMBAT_ACTION.EXPOSE && last.perfect === true,
  }),
  Object.freeze({
    id: 'stance',
    allow: Object.freeze([COMBAT_ACTION.HOLD, COMBAT_ACTION.MONITOR, COMBAT_ACTION.END_TEMPO]),
    spotlight: 'stance',
    say: 'DRILL · NOISE HITS HARDER BUT GUARDS WORSE. USE THE OPEN CHANNEL TO SETTLE BACK OUT OF IT.',
    until: (last) => [COMBAT_ACTION.HOLD, COMBAT_ACTION.MONITOR, COMBAT_ACTION.END_TEMPO].includes(last.action),
  }),
  Object.freeze({
    id: 'free',
    allow: null,
    spotlight: null,
    say: 'DRILL · CALIBRATION READS TRUE. FINISH THE BENCH SIGNAL YOUR WAY.',
    until: () => false,
  }),
]);

export function createCombatTutorialDirector(steps = COMBAT_TUTORIAL_STEPS) {
  let index = 0;
  let skipped = false;
  const current = () => (skipped || index >= steps.length ? null : steps[index]);
  return {
    active: () => !!current(),
    step: () => current(),
    prompt: () => current()?.say || '',
    spotlight: () => current()?.spotlight || null,
    filterMoves(moves) {
      const step = current();
      if (!step?.allow) return moves;
      return moves.map((move) => (step.allow.includes(move.id)
        ? move
        : { ...move, enabled: false, reason: 'FOLLOW THE DRILL' }));
    },
    advance(before, after) {
      const step = current();
      if (!step) return false;
      if (!step.until(after?.last || {}, after)) return false;
      index += 1;
      return true;
    },
    skip() { skipped = true; },
    snapshot: () => ({ id: current()?.id || null, index, total: steps.length, skipped }),
  };
}
