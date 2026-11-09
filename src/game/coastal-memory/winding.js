// The closed, broken Sankyo keepsake. User-confirmed reference behaviour:
// manual turning coaxes the tune forward; releasing the key lets its winding
// slam down. Only the key recoils here: reverse cylinder motion is unobserved,
// so neither a backwards tune nor a reset to its beginning is fabricated.
// Bent-pin mistakes remain in the actual recording, without an invented mask
// of missing notes or progressively deteriorating parts.
import { CLAIR_DE_LUNE_SCORE_SECONDS } from '../../data/clair-de-lune-music-box.js';
import { MUSIC_BOX_REFERENCE, MUSIC_BOX_REFERENCE_SECONDS } from '../../data/music-box-reference.js';
import { COASTAL_MUSIC_BOX_EVENTS, COASTAL_MUSIC_BOX_MECHANISM } from './mechanism.js';

const SCORE = CLAIR_DE_LUNE_SCORE_SECONDS;
const TAU = Math.PI * 2;
const EPSILON = 1e-9;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, finite(value, lo)));
const duration = value => clamp(value, .01, 3600);

export const WINDING_TUNING = Object.freeze({
  referenceSeconds: MUSIC_BOX_REFERENCE_SECONDS,
  windPerTurn: .32,
  maxTurnRate: 4,
  minTurnRate: .02,
  // Authored visual recoil envelope; not a measured diagnosis of the movement.
  slamSeconds: MUSIC_BOX_REFERENCE.releaseSeconds,
  slamSharpness: 2.4,
  restSeconds: 0,
  // Manual support plays the captured performance at its original pitch. These
  // legacy score-space fields describe the proxy cylinder, not audio varispeed.
  scorePerTurn: SCORE / MUSIC_BOX_REFERENCE_SECONDS,
  governorMax: SCORE / MUSIC_BOX_REFERENCE_SECONDS,
  wearPerScore: 0,
  catchScore: Object.freeze([]),
  catchLurch: 0,
});
export const WINDING_PHASE = Object.freeze({
  REST: 'rest', CRANKING: 'cranking', HELD: 'held', SLAMMING: 'slamming',
});
const PHASES = new Set(Object.values(WINDING_PHASE));

export function freshWinding({ durationSeconds = MUSIC_BOX_REFERENCE_SECONDS } = {}) {
  return {
    version: 3, phase: WINDING_PHASE.REST, wind: 0, score: 0,
    playbackSeconds: 0, durationSeconds: duration(durationSeconds), playbackRate: 0,
    held: false, wear: 0, crankSeconds: 0, keyPhase: 0, attempts: 0,
    playingSecondsThisStep: 0, stopReason: null,
    slamElapsed: 0, recoilFrom: 0, recoilTo: 0, windAtRelease: 0,
  };
}

function normalize(value = {}) {
  const length = duration(finite(value.durationSeconds, MUSIC_BOX_REFERENCE_SECONDS));
  const playbackSeconds = clamp(finite(value.playbackSeconds, clamp(value.score, 0, SCORE) / SCORE * length), 0, length);
  const keyPhase = finite(value.keyPhase);
  const wind = clamp(value.wind, 0, 1);
  const phase = PHASES.has(value.phase) ? value.phase : WINDING_PHASE.REST;
  return {
    version: 3, phase, wind, score: playbackSeconds / length * SCORE,
    playbackSeconds, durationSeconds: length,
    playbackRate: phase === WINDING_PHASE.CRANKING && playbackSeconds < length ? 1 : 0,
    held: value.held === true, wear: clamp(value.wear, 0, 1),
    crankSeconds: Math.max(0, finite(value.crankSeconds)),
    keyPhase, attempts: Math.max(0, Math.floor(finite(value.attempts))),
    playingSecondsThisStep: 0,
    stopReason: typeof value.stopReason === 'string' ? value.stopReason : null,
    slamElapsed: clamp(value.slamElapsed, 0, WINDING_TUNING.slamSeconds),
    recoilFrom: finite(value.recoilFrom, keyPhase),
    recoilTo: finite(value.recoilTo, keyPhase - wind / WINDING_TUNING.windPerTurn * TAU),
    windAtRelease: clamp(finite(value.windAtRelease, wind), 0, 1),
  };
}

// Ordinary attempts do not progressively destroy the instrument or lose notes.
export function windingWearGain() { return 1; }

// Hidden pinning-study events only. The audio owner uses playbackSeconds for
// the actual recording, whose errors are not replaced by these proxy notes.
function collectCrossings(from, to, scoreRate, events) {
  if (!(to > from) || !(scoreRate > 0)) return;
  for (const event of COASTAL_MUSIC_BOX_EVENTS) {
    if (!(from < event.at && event.at <= to)) continue;
    events.push({ type: 'pluck', direction: 1,
      at: clamp((event.at - from) / scoreRate, 0, (to - from) / scoreRate),
      index: event.index, pitch: event.pitch, voice: event.voice, tine: event.tine,
      state: 'whole', cents: 0, proxy: true });
  }
}

function advanceRecoil(state, seconds, events) {
  const finishAfter = Math.max(0, WINDING_TUNING.slamSeconds - state.slamElapsed);
  state.slamElapsed = Math.min(WINDING_TUNING.slamSeconds, state.slamElapsed + seconds);
  const u = state.slamElapsed / WINDING_TUNING.slamSeconds;
  const left = (1 - u) ** WINDING_TUNING.slamSharpness;
  state.keyPhase = state.recoilTo + (state.recoilFrom - state.recoilTo) * left;
  state.wind = state.windAtRelease * left;
  state.playbackRate = 0;
  if (u >= 1) {
    state.phase = WINDING_PHASE.REST;
    state.wind = 0;
    events.push({ type: 'slam-end', at: Math.min(seconds, finishAfter), playbackSeconds: state.playbackSeconds });
  }
}

// input = {held, turn}; `turn` is signed key revolutions per second. Only
// positive manual support advances the tune. Event times are step-relative.
export function stepWinding(value = freshWinding(), input = {}, dt = 0) {
  const seconds = clamp(dt, 0, .25), state = normalize(value), events = [];
  const held = input.held === true;
  const turn = clamp(input.turn, 0, WINDING_TUNING.maxTurnRate);
  const wasHeld = state.held;
  const wasCranking = state.phase === WINDING_PHASE.CRANKING;
  state.held = held;

  if (state.phase === WINDING_PHASE.SLAMMING) {
    if (!held) {
      advanceRecoil(state, seconds, events);
      return { state, events };
    }
    // Catching the key can arrest its recoil; recovery has no hidden input lock.
    state.phase = WINDING_PHASE.HELD;
    events.push({ type: 'slam-end', at: 0, reason: 'caught', playbackSeconds: state.playbackSeconds });
  }

  if (held && turn > WINDING_TUNING.minTurnRate && seconds > 0) {
    if (!wasCranking) {
      state.attempts++;
      events.push({ type: 'wind-start', at: 0 });
      if (state.playbackSeconds < state.durationSeconds - EPSILON)
        events.push({ type: 'play-start', at: 0, playbackSeconds: state.playbackSeconds });
    }
    state.phase = WINDING_PHASE.CRANKING;
    state.stopReason = null;
    state.keyPhase += turn * TAU * seconds;
    state.wind = Math.min(1, state.wind + turn * WINDING_TUNING.windPerTurn * seconds);
    // No guessed ratchet tooth count or synthetic clicks are emitted.
    const played = Math.min(seconds, Math.max(0, state.durationSeconds - state.playbackSeconds));
    const fromScore = state.score;
    state.playbackSeconds = Math.min(state.durationSeconds, state.playbackSeconds + played);
    state.score = state.playbackSeconds / state.durationSeconds * SCORE;
    state.crankSeconds += played;
    state.playingSecondsThisStep = played;
    collectCrossings(fromScore, state.score, SCORE / state.durationSeconds, events);
    if (state.playbackSeconds >= state.durationSeconds - EPSILON) {
      state.playbackSeconds = state.durationSeconds;
      state.score = SCORE;
      state.playbackRate = 0;
      state.stopReason = 'reference-end';
      if (fromScore < SCORE - EPSILON) {
        events.push({ type: 'tune-end', at: played, score: state.score, playbackSeconds: state.playbackSeconds });
        events.push({ type: 'play-stop', at: played, playbackSeconds: state.playbackSeconds, reason: 'reference-end' });
      }
    } else state.playbackRate = 1;
    return { state, events };
  }

  if (held) {
    // A zero-time input edge can stop/catch the key immediately, but cannot
    // manufacture a new manual turn or advance the recorded performance.
    if (seconds === 0 && turn > WINDING_TUNING.minTurnRate && wasCranking) return { state, events };
    state.phase = WINDING_PHASE.HELD;
    state.playbackRate = 0;
    if (wasCranking) events.push({ type: 'play-stop', at: 0,
      playbackSeconds: state.playbackSeconds, reason: 'key-still' });
    return { state, events };
  }

  state.playbackRate = 0;
  if (wasHeld && state.wind > EPSILON) {
    if (wasCranking) events.push({ type: 'play-stop', at: 0,
      playbackSeconds: state.playbackSeconds, reason: 'released' });
    state.phase = WINDING_PHASE.SLAMMING;
    state.slamElapsed = 0;
    state.recoilFrom = state.keyPhase;
    state.recoilTo = state.keyPhase - state.wind / WINDING_TUNING.windPerTurn * TAU;
    state.windAtRelease = state.wind;
    state.stopReason = 'released';
    events.push({ type: 'slam-start', at: 0, wind: state.wind, playbackSeconds: state.playbackSeconds });
    advanceRecoil(state, seconds, events);
    return { state, events };
  }
  state.phase = WINDING_PHASE.REST;
  return { state, events };
}

export function windingKeyAngle(state = freshWinding()) { return -finite(state.keyPhase); }
export function windingCylinderAngle(state = freshWinding()) { return TAU * normalize(state).score / SCORE; }
export function windingSummary(state = freshWinding()) {
  const s = normalize(state);
  return { phase: s.phase, wind: +s.wind.toFixed(3), score: +s.score.toFixed(3),
    playbackSeconds: +s.playbackSeconds.toFixed(3), playbackRate: s.playbackRate,
    wear: +s.wear.toFixed(3), held: s.held, crankSeconds: +s.crankSeconds.toFixed(2), attempts: s.attempts };
}
export function coastalHandsMechanism(winding = freshWinding()) {
  const m = COASTAL_MUSIC_BOX_MECHANISM, state = normalize(winding);
  const tipY = m.cylinderCenter[1] + Math.cos(m.contactAngle) * m.pinRadius;
  const tipZ = m.cylinderCenter[2] + Math.sin(m.contactAngle) * m.pinRadius;
  const angle = windingCylinderAngle(state);
  return {
    phase: state.phase, score: state.score, playbackSeconds: state.playbackSeconds,
    playbackRate: state.playbackRate, cylinderAngle: angle, gearAngle: angle,
    keyAngle: windingKeyAngle(state), fanAngle: TAU * 2.6 * state.score,
    liveTines: m.liveTines.map(tine => ({ ...tine, tipY, tipZ, length: tine.rootZ - tipZ, deflection: 0 })),
  };
}
