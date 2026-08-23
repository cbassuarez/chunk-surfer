// The battle adversary's attacks ARE instruments, and the surfer is FIGHTING you
// with them — the voice is not a playlist on a clock. Each strike sounds like what
// the surfer is actually DOING that beat (its intent, which already reacts to you
// via movement.reactions). Difficulty sharpens that read. A near-broken recordist
// gets the SCREAM.
//
// EVERY voice here is a blow. There used to be a sustained breakbeat as well — a
// backing the surfer "decided to press" with, started off a composure threshold
// and running under the whole fight. It was wrong twice over: it arrived for no
// reason the player could see, and once it was running nothing in the fight ever
// took it away. The breakbeat is now what a LOOP beat sounds like, which is the
// only thing it ever wanted to be: you hear it because you were hit with it, and
// it stops because the turn did.
//
// Cue ids resolve to authored cues in content/audio/audio-project.audio.json and
// fire in combat via `fx.cue()` (see src/game/combat.js). This module owns only
// the mapping, so balance/feel retunes without touching combat or the pipeline.

const pad = (n) => String(n).padStart(2, '0');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
const wrap = (value, length) => (((Math.floor(Number(value) || 0) % length) + length) % length);

export const BREAKBEAT_CUE = 'breakbeat.weapon.loop';

const INSTRUMENT_WEAPON_CUES = {
  piano: Array.from({ length: 11 }, (_, i) => `piano.weapon.${pad(i + 1)}`),
  marimba: Array.from({ length: 3 }, (_, i) => `marimba.weapon.${pad(i + 1)}`),
  violin: Array.from({ length: 7 }, (_, i) => `violin.weapon.${pad(i + 1)}`),
  // One long grid-locked take, and the chop is what makes it a weapon: every
  // LOOP beat bites a different bar out of it (see enemyAttackShape).
  breakbeat: [BREAKBEAT_CUE],
};

// The per-beat voice is chosen by what the surfer is DOING — the kind of the
// intent it is throwing. Announced blows ring tonal (piano); heavy overload
// drives (marimba); a LOOP — the beat that repeats itself at you — is the
// breakbeat; a feint comes in off-key and out of time (the violin stabs).
// Because the intent itself reacts to you, so does the sound.
const INSTRUMENT_BY_INTENT = {
  broadcast: 'piano',
  overload: 'marimba',
  loop: 'breakbeat',
  conceal: 'violin',
  silence: 'violin',
};

export const SCREAM_CUE = 'piano.scream';
// At or below this fraction of max composure the adversary switches to the scream.
export const SCREAM_COMPOSURE_RATIO = 0.3;

// ── the chop ────────────────────────────────────────────────────────────────
// The surfer's weapon stems are not stabs. They are whole takes — the marimba
// is seventy-eight seconds of playing, the piano seven, the scream thirty — and
// the fight throws one every enemy beat, about every second. Played whole they
// stack: eight marimbas at once, all at different points in the same take, none
// of them ever finishing, all of them still going after the fight is over.
//
// So the surfer does what the surfer would actually do. It does not play the
// take at you, it CHOPS it: bites half a bar out of the file, on the grid,
// walking forward through the take one chop per beat, and drops it. The take
// keeps its own tempo because the chop lands on the 168bpm grid; it keeps its
// menace because you only ever get a piece of it.
//
// The scream is the same idea, screwed: dragged down a third and cut before you
// can hear a person in it. That eight-second arrival gets to happen ONCE, in
// its own scene. As a weapon it is a quarter-second of the same tape.
const BEATS_PER_MINUTE = 168;
const BEAT_SECONDS = 60 / BEATS_PER_MINUTE;          // .357
const BAR_SECONDS = BEAT_SECONDS * 4;                // 1.43

// One BAR, not half of one. Half a bar of a drum break is a fragment — you hear
// that something happened without hearing what — and the melodic stems were
// equally clipped. A bar is a phrase, and it is the shortest thing that still
// sounds like playing.
//
// A bar (1.43s) is slightly longer than an ordinary turn (1.2s), which is the
// right way round: the chop is bounded by the TURN, not by its own length. The
// battle voice group is cut when the turn settles (see combat.js settleTurn) and
// `fadeOut` is long enough that the cut is never a click. A chained enemy turn
// runs proportionally longer, so those hear the whole bar.
export const WEAPON_CHOP = Object.freeze({
  slice: BAR_SECONDS,       // one 168bpm bar
  step: BAR_SECONDS,        // successive beats walk a bar forward through the take
  fadeIn: 0.006,            // no click on the way in
  fadeOut: 0.12,            // and the group cut lands inside this, so none on the way out
});

export const SCREAM_CHOP = Object.freeze({
  rate: [0.58, 0.74],       // screwed: down a third or so, never the real pitch
  offset: [0.35, 6.50],     // bitten out of the middle, never the top of the file
  length: [0.22, 0.42],     // a chop, not a phrase
  gain: 0.30,               // scaled against the cue's authored gain
  fadeOut: 0.10,
});

// How this beat's cue should be played: always a chop, never the whole take.
// `beat` walks the chop through the file so successive hits are successive bars
// rather than the same bar over and over.
export function enemyAttackShape(cueId, beat = 0, random = Math.random, aggression = 0.5) {
  const pick = ([lo, hi]) => lo + random() * (hi - lo);
  // How hard it is leaning, 0..1. A cornered or pressing surfer plays louder
  // and holds the chop a little longer; one that is still testing you barely
  // raises its voice. The mood is audible before it is legible.
  const lean = clamp(Number(aggression) || 0.5, 0.2, 0.9);
  if (cueId === SCREAM_CUE) {
    return {
      rate: pick(SCREAM_CHOP.rate),
      trimStart: pick(SCREAM_CHOP.offset),
      sliceSeconds: pick(SCREAM_CHOP.length),
      wrapStart: true,
      fadeIn: 0.004,
      fadeOut: SCREAM_CHOP.fadeOut,
      gainScale: SCREAM_CHOP.gain,
      // The authored scream carries the shake of its own scene with it. A chop
      // is not that scene, and it fires on every low-composure beat.
      skipEffects: true,
    };
  }
  return {
    trimStart: wrap(beat, 64) * WEAPON_CHOP.step,
    sliceSeconds: WEAPON_CHOP.slice * (0.85 + lean * 0.3),
    wrapStart: true,
    fadeIn: WEAPON_CHOP.fadeIn,
    fadeOut: WEAPON_CHOP.fadeOut,
    gainScale: 0.8 + lean * 0.35,
  };
}

// A read of the fight, 0..1, that a meaner difficulty pushes higher — and that
// the opponent's current mood pushes further. Feeds the chop: see
// enemyAttackShape. `pressing` and `cornered` are the two postures where it
// stops pacing and starts hitting, and they should not sound the same as
// `testing` does.
const STANCE_LEAN = Object.freeze({
  testing: -0.15, setting: -0.05, mirroring: 0.05, pressing: 0.18, cornered: 0.25,
});

export function surferAggression(composureBonus = 0, stance = null) {
  const base = 0.5 - (Number(composureBonus) || 0) * 0.15;
  return clamp(base + (STANCE_LEAN[stance] || 0), 0.2, 0.9);
}

// The cue the surfer strikes with on this enemy beat: the instrument of its
// intent (beats rotate through that instrument's stems), or — when the recordist
// is nearly broken — the SCREAM.
export function enemyAttackCue({ intentKind = 'broadcast', beat = 0, composure = Infinity, maxComposure = 0 } = {}) {
  if (maxComposure > 0 && composure <= maxComposure * SCREAM_COMPOSURE_RATIO) return SCREAM_CUE;
  const set = INSTRUMENT_WEAPON_CUES[INSTRUMENT_BY_INTENT[intentKind] || 'piano'] || INSTRUMENT_WEAPON_CUES.piano;
  return set[wrap(beat, set.length)];
}

// What the surfer just hit you with, in words, for the strike banner. The kind is
// the shape of the blow; the instrument is the sound of it. Both are things the
// player can learn to read, so both are said out loud.
const INTENT_VERB = {
  broadcast: 'BROADCASTS',
  overload: 'OVERLOADS',
  loop: 'LOOPS',
  conceal: 'CONCEALS',
  silence: 'SILENCES',
};
export function enemyAttackVoice(intentKind = 'broadcast', cueId = null) {
  if (cueId === SCREAM_CUE) return { verb: 'SCREAMS', instrument: 'SCREAM' };
  return {
    verb: INTENT_VERB[intentKind] || 'PLAYS',
    instrument: String(INSTRUMENT_BY_INTENT[intentKind] || 'piano').toUpperCase(),
  };
}
