// Lyle's music box, held in the hands. The same damaged cylinder/comb as the
// plinth scene (coastal-memory/mechanism.js), but driven by the player instead
// of an autonomous spring: the winding ratchet is broken, so the spring will
// not hold a wind. Wind the pin and let go and the whole winding slams down —
// the key whips back, the cylinder rakes the comb backwards, and nothing plays.
//
// To make it play at all you must hold the turning pin and crank it by hand.
// Crank slowly and it plays slowly; crank hard and it plays up to the governor's
// limit. Every turn skips against the chipped gear and wears the mechanism down,
// so the notes the box does manage come out duller and further between.
//
// This module is pure and deterministic: one step function advances the box
// given {held, turn} and returns the events an audio owner should voice. No
// clock, no AudioContext, no DOM. Reuse it from the hands UI, the plinth scene
// and the overture renderer so a pin meeting a tine on screen is the same note
// that sounds.
import { CLAIR_DE_LUNE_EVENTS, CLAIR_DE_LUNE_SCORE_SECONDS } from '../../data/clair-de-lune-music-box.js';
import { COASTAL_MUSIC_BOX_COMB, COASTAL_MUSIC_BOX_MECHANISM } from './mechanism.js';

const SCORE = CLAIR_DE_LUNE_SCORE_SECONDS;
const freeze = (value) => Object.freeze(value);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export const WINDING_TUNING = freeze({
  // One full turn of the pin advances the cylinder this many score seconds.
  scorePerTurn: 2.4,
  // The governor caps how fast the cylinder can turn, however hard you crank.
  // Tuned so a hard crank plays the recorded ~15 s phrase at roughly its real
  // speed (the in-game score is 33.6 s, so the phrase runs 2.24x faster).
  governorMax: 2.6,
  // Cranking also winds the spring a little; this much wind per full turn.
  windPerTurn: 0.42,
  // On release the spring lets go: the cylinder whips backwards over this span.
  slamSeconds: 0.85,
  // The slam is violent at first and decays; this shapes the backward rake.
  slamSharpness: 2.4,
  // After a slam the box rests this long before it will answer another crank.
  restSeconds: 2.1,
  // Wear per score second played: notes dull and the train slops.
  wearPerScore: 0.014,
  // The chipped gear binds here (score seconds) and lurches past the notes it
  // could not reach, smearing them into one skip.
  catchScore: freeze([9.6, 17.9]),
  catchLurch: 0.38,
});

export const WINDING_PHASE = freeze({ REST: 'rest', CRANKING: 'cranking', HELD: 'held', SLAMMING: 'slamming' });

// Pins sheared off the cylinder, by event index (mirrors mechanism.js).
const MISSING_PINS = new Set([5, 14, 23, 31, 44, 58]);
const tineOf = new Map(COASTAL_MUSIC_BOX_COMB.map((tine) => [tine.pitch, tine]));
// Score positions of every live event, in order, for crossing detection.
const EVENTS = CLAIR_DE_LUNE_EVENTS.map((event, index) => freeze({
  index, at: event.at, pitch: event.pitch, voice: event.voice,
  tine: tineOf.get(event.pitch) ?? null, pinMissing: MISSING_PINS.has(index),
}));

export function freshWinding() {
  return {
    phase: WINDING_PHASE.REST,
    wind: 0,          // spring tension, 0..1
    score: 0,         // cylinder position in score seconds
    held: false,      // is the pin being held
    wear: 0,          // 0..1, the mechanism wearing down
    slamElapsed: 0,   // seconds into the current slam
    restElapsed: 0,   // seconds of rest since the last slam
    crankSeconds: 0,  // total score seconds played since pickup
    keyPhase: 0,      // accumulated pin rotation (radians), for ratchet clicks
  };
}

// Ratchet teeth per full key revolution (one click per tooth).
const RATCHET_TEETH = 12;
const KEY_TOOTH = (Math.PI * 2) / RATCHET_TEETH;

// How dull a note is at this wear: full at fresh, faint and short when worn out.
export function windingWearGain(wear = 0) {
  return 1 - 0.72 * clamp(wear, 0, 1);
}

// Advance the cylinder from `from` to `to` (signed), emitting plucks for every
// event crossed in that direction. Events are ordered and `at` is step-relative
// (0 = the start of this step); the audio owner schedules them in array order.
function collectCrossings(from, to, events) {
  const direction = to >= from ? 1 : -1;
  const lo = Math.min(from, to), hi = Math.max(from, to);
  for (const event of EVENTS) {
    if (event.at < lo || event.at > hi) continue;
    const crossed = direction > 0 ? (from < event.at && event.at <= to) : (to <= event.at && event.at < from);
    if (!crossed) continue;
    if (event.pinMissing || !event.tine || event.tine.state === 'snapped') {
      events.push({ type: 'tick', direction, at: 0, index: event.index, pitch: event.pitch, tine: event.tine ? event.tine.index : -1 });
      continue;
    }
    events.push({ type: 'pluck', direction, at: 0, index: event.index, pitch: event.pitch,
      voice: event.voice, tine: event.tine.index, state: event.tine.state, cents: event.tine.cents });
  }
}

// One deterministic step. input = { held, turn } where turn is signed pin
// revolutions per second (positive = crank forward, negative = crank back).
export function stepWinding(value, input = {}, dt = 0) {
  const seconds = clamp(dt, 0, 0.25);
  const state = { ...value, wind: clamp(value.wind, 0, 1), score: clamp(value.score, 0, SCORE),
    wear: clamp(value.wear, 0, 1), slamElapsed: clamp(value.slamElapsed, 0, WINDING_TUNING.slamSeconds),
    restElapsed: clamp(value.restElapsed, 0, WINDING_TUNING.restSeconds), keyPhase: finite(value.keyPhase, 0) };
  const held = input.held === true;
  const turn = finite(input.turn, 0);
  const events = [];

  if (state.phase === WINDING_PHASE.SLAMMING) {
    // The spring is already letting go: finish the backward whip.
    state.slamElapsed = Math.min(WINDING_TUNING.slamSeconds, state.slamElapsed + seconds);
    const u = state.slamElapsed / WINDING_TUNING.slamSeconds;
    const speed = WINDING_TUNING.governorMax * 6 * Math.pow(1 - u, WINDING_TUNING.slamSharpness);
    const from = state.score, to = Math.max(0, state.score - speed * seconds);
    collectCrossings(from, to, events);
    state.score = to;
    state.wind = Math.max(0, state.wind - (1 / WINDING_TUNING.slamSeconds) * seconds);
    if (state.slamElapsed >= WINDING_TUNING.slamSeconds || state.score <= 0) {
      state.phase = WINDING_PHASE.REST; state.restElapsed = 0; state.slamElapsed = 0; state.score = 0;
      events.push({ type: 'slam-end', at: 0, score: state.score });
    }
    return { state, events };
  }

  if (state.phase === WINDING_PHASE.REST) {
    if (held && turn !== 0) {
      state.phase = WINDING_PHASE.CRANKING; state.restElapsed = 0;
      events.push({ type: 'wind-start', at: 0 });
    } else {
      state.restElapsed = Math.min(WINDING_TUNING.restSeconds, state.restElapsed + seconds);
      return { state, events };
    }
  }

  if (held && turn !== 0) {
    // Hand cranking: the pin drives the cylinder directly, the governor caps it.
    const rate = clamp(turn * WINDING_TUNING.scorePerTurn, -WINDING_TUNING.governorMax, WINDING_TUNING.governorMax);
    const from = state.score;
    let to = from + rate * seconds;
    // Forward cranking winds the spring a little; it is what slams back on release.
    if (rate > 0) state.wind = clamp(state.wind + Math.abs(turn) * WINDING_TUNING.windPerTurn * seconds, 0, 1);
    // The chipped gear binds at fixed score positions and lurches past them,
    // skipping the notes between (deterministic, like the plinth mechanism).
    for (const catchAt of WINDING_TUNING.catchScore) {
      if (from < catchAt && catchAt <= to) {
        to += WINDING_TUNING.catchLurch;
        events.push({ type: 'lurch', at: 0, score: catchAt });
      }
    }
    to = clamp(to, 0, SCORE);
    collectCrossings(from, to, events);
    state.score = to;
    state.wear = clamp(state.wear + Math.abs(to - from) * WINDING_TUNING.wearPerScore, 0, 1);
    state.crankSeconds += Math.max(0, to - from);
    // Ratchet clicks follow the pin's own rotation (fast cranking clicks fast),
    // independent of the governor, so slow and quick turning sound different.
    const teethBefore = Math.floor(state.keyPhase / KEY_TOOTH);
    state.keyPhase += turn * Math.PI * 2 * seconds;
    const teethAfter = Math.floor(state.keyPhase / KEY_TOOTH);
    for (let tooth = teethBefore + 1; tooth <= teethAfter; tooth++) {
      events.push({ type: 'wind-click', at: 0, rate: Math.abs(turn) });
    }
    if (state.score >= SCORE - 1e-6) events.push({ type: 'tune-end', at: 0, score: state.score });
    return { state, events };
  }

  if (held && turn === 0) {
    // Holding still: the cylinder stays put. Pinched but not turning.
    state.phase = WINDING_PHASE.HELD;
    return { state, events };
  }

  // Not held. If there is tension (or it is mid-crank), the winding slams down.
  if (!held && (state.wind > 0.02 || state.score > 0.02 || state.phase === WINDING_PHASE.CRANKING || state.phase === WINDING_PHASE.HELD)) {
    state.phase = WINDING_PHASE.SLAMMING; state.slamElapsed = 0;
    events.push({ type: 'slam-start', at: 0, wind: state.wind, score: state.score });
    const from = state.score, to = Math.max(0, state.score - WINDING_TUNING.governorMax * 2 * seconds);
    collectCrossings(from, to, events);
    state.score = to;
    state.slamElapsed = Math.min(WINDING_TUNING.slamSeconds, seconds);
    return { state, events };
  }

  return { state, events };
}

// The key's angle for the hands UI: wound forward as it cranks, slamming back
// on release (mirrors the plinth's key angle but player-driven).
export function windingKeyAngle(state = freshWinding()) {
  const tooth = Math.PI * 2 / 12;
  const teeth = Math.round(clamp(state.wind, 0, 1) * 12);
  if (state.phase === WINDING_PHASE.SLAMMING) {
    const u = clamp(state.slamElapsed / WINDING_TUNING.slamSeconds, 0, 1);
    return -teeth * tooth * Math.pow(1 - u, 1.6);
  }
  const engaged = state.phase === WINDING_PHASE.CRANKING || state.phase === WINDING_PHASE.HELD;
  return -teeth * tooth * (engaged ? 1 : 0.12);
}

// The cylinder angle (radians) for rendering, from score position.
export function windingCylinderAngle(state = freshWinding()) {
  return (Math.PI * 2) * clamp(state.score, 0, SCORE) / SCORE;
}

// A concise description for diagnostics / traces.
export function windingSummary(state = freshWinding()) {
  return { phase: state.phase, wind: +state.wind.toFixed(3), score: +state.score.toFixed(3),
    wear: +state.wear.toFixed(3), held: !!state.held, crankSeconds: +state.crankSeconds.toFixed(2) };
}

// The box's mechanism as the renderer draws it, driven by the player instead of
// the autonomous plinth drive. Same shape as coastalMusicBoxMechanism() so the
// scene's cylinder/gear/key/fan/tine placement is unchanged; only the angles and
// the tine deflections come from the winding state. Tine deflection is zero here
// (the live per-pluck animation is voiced by the event stream, not this frame).
export function coastalHandsMechanism(winding = freshWinding()) {
  const m = COASTAL_MUSIC_BOX_MECHANISM;
  const tipY = m.cylinderCenter[1] + Math.cos(m.contactAngle) * m.pinRadius;
  const tipZ = m.cylinderCenter[2] + Math.sin(m.contactAngle) * m.pinRadius;
  const angle = windingCylinderAngle(winding);
  const score = clamp(winding.score, 0, SCORE);
  return {
    phase: winding.phase,
    score,
    cylinderAngle: angle,
    gearAngle: angle,
    keyAngle: windingKeyAngle(winding),
    fanAngle: Math.PI * 2 * 2.6 * score,
    liveTines: m.liveTines.map((tine) => ({ ...tine, tipY, tipZ, length: tine.rootZ - tipZ, deflection: 0 })),
  };
}
