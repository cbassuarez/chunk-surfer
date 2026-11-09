// Lyle's CLOSED Sankyo keepsake. The supplied recording owns its sound;
// hypothetical snapped tines, missing pins and reverse rakes are not added.
// Internal dimensions below are a fitted construction study, not a measured
// reconstruction. Retention failure and pin errors are user-confirmed; their
// precise internal locations remain unknown and are not invented here.
import { CLAIR_DE_LUNE_COMB, CLAIR_DE_LUNE_EVENTS, CLAIR_DE_LUNE_SCORE_SECONDS } from '../../data/clair-de-lune-music-box.js';
import { MUSIC_BOX_CONSTRUCTION } from '../../data/music-box-construction.js';
import { MUSIC_BOX_REFERENCE_SECONDS } from '../../data/music-box-reference.js';

const TAU = Math.PI * 2;
const freeze = Object.freeze;
const SCORE = CLAIR_DE_LUNE_SCORE_SECONDS;
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, finite(v, lo)));

export const COASTAL_MUSIC_BOX_TUNE = freeze({ title: 'Clair de lune', composer: 'Claude Debussy', from: 'Lyle',
  construction: 'closed Sankyo wind-up keepsake; exact movement SKU unconfirmed' });

// One continuous captured performance. The legacy name is retained for receipt
// compatibility, but its end is a stop, never an autonomous rewind/restart.
export const COASTAL_MUSIC_BOX_CYCLE = MUSIC_BOX_REFERENCE_SECONDS;
export const COASTAL_MUSIC_BOX_STALL = COASTAL_MUSIC_BOX_CYCLE;
export const COASTAL_MUSIC_BOX_STALL_SCORE = SCORE;
export const COASTAL_MUSIC_BOX_SPRING_RELEASE = COASTAL_MUSIC_BOX_STALL;

// Retained empty exports allow old asset readers to migrate without inventing
// audible defects. They do not schedule clicks, slips, catches or a rewind.
export const COASTAL_MUSIC_BOX_LURCHES = freeze([]);
export const COASTAL_MUSIC_BOX_GEAR_CATCHES = freeze([]);
export const COASTAL_MUSIC_BOX_CLICKS = freeze([]);
export const COASTAL_MUSIC_BOX_WIND_SLIP = 0;

const N = CLAIR_DE_LUNE_COMB.length;
const SPACING = .002;
export const COASTAL_MUSIC_BOX_COMB = freeze(CLAIR_DE_LUNE_COMB.map((pitch, index) => freeze({
  index, pitch, x: SPACING * (index - (N - 1) / 2),
  rootZ: .0135 + .0015 * (1 - index / Math.max(1, N - 1)),
  state: 'whole', cents: 0,
})));
const tineOf = new Map(COASTAL_MUSIC_BOX_COMB.map(t => [t.pitch, t]));

// Arrangement events remain a geometrical pinning study only. The recording
// transport is authoritative: these inferred timings do not prove individual
// pin/audio synchronization with the physical reference.
export const COASTAL_MUSIC_BOX_EVENTS = freeze(CLAIR_DE_LUNE_EVENTS.map((event, index) => freeze({
  ...event, index, pinMissing: false, tine: tineOf.get(event.pitch)?.index ?? -1,
})));
export const COASTAL_MUSIC_BOX_PLUCKS = freeze(COASTAL_MUSIC_BOX_EVENTS.map(event => freeze({
  at: event.at / SCORE * COASTAL_MUSIC_BOX_CYCLE,
  event: event.index, pitch: event.pitch, tine: event.tine, voice: event.voice,
  state: 'whole', cents: 0, direction: 1,
})));
const plucksByTine = COASTAL_MUSIC_BOX_COMB.map(tine => COASTAL_MUSIC_BOX_PLUCKS.filter(p => p.tine === tine.index).map(p => p.at));

export const COASTAL_MUSIC_BOX_MECHANISM = freeze({
  inferred: true, casingClosed: true, manufacturer: 'Sankyo', exactMovement: null,
  shellDimensions: MUSIC_BOX_CONSTRUCTION.dimensions,
  cylinderCenter: freeze([0, .012, .001]), cylinderRadius: .005, pinRadius: .0053,
  cylinderHalfLength: .0165, gearCenter: freeze([.019, .012, .001]),
  contactAngle: 1.9, tineThickness: .00025, tineWidth: .0014,
  // Winding arbor is normal to the rear plate, unlike the retired -X arbor.
  barrelCenter: freeze([MUSIC_BOX_CONSTRUCTION.keyPivot[0], MUSIC_BOX_CONSTRUCTION.keyPivot[1], -.009]),
  barrelRadius: .006, barrelAxis: MUSIC_BOX_CONSTRUCTION.keyAxis,
  keyCenter: MUSIC_BOX_CONSTRUCTION.keyPivot, keyAxis: MUSIC_BOX_CONSTRUCTION.keyAxis,
  fanCenter: freeze([.020, .029, .002]), wormAngle: -Math.PI / 2, gearTeeth: 24,
  liveTines: freeze(COASTAL_MUSIC_BOX_COMB.map(tine => freeze({
    index: tine.index, x: tine.x, pitch: tine.pitch, rootZ: tine.rootZ, state: 'whole', bend: 0,
  }))),
});

// A stopped performance holds its phase. Waiting, negative input or a clock
// passing the old cycle boundary must never wind it, reverse it or restart it.
export function coastalMusicBoxPhase(seconds = 0) { return clamp(seconds, 0, COASTAL_MUSIC_BOX_CYCLE); }
export function coastalMusicBoxScoreAt(seconds = 0) { return coastalMusicBoxPhase(seconds) / COASTAL_MUSIC_BOX_CYCLE * SCORE; }
export function coastalMusicBoxAngle(seconds = 0) { return TAU * coastalMusicBoxScoreAt(seconds) / SCORE; }
export function coastalMusicBoxRateAt(seconds = 0) {
  return Number.isFinite(seconds) && seconds >= 0 && seconds < COASTAL_MUSIC_BOX_CYCLE ? SCORE / COASTAL_MUSIC_BOX_CYCLE : 0;
}
// Passive construction study of the recorded manual performance. This authored
// key motion does not imply a healthy spring; interactive motion uses the actual
// winding state, including release recoil, from winding.js.
export function coastalMusicBoxKeyAngle(seconds = 0) { return -TAU * 3 * coastalMusicBoxPhase(seconds) / COASTAL_MUSIC_BOX_CYCLE; }
export function coastalMusicBoxFanAngle(seconds = 0) { return TAU * 2.6 * coastalMusicBoxScoreAt(seconds); }
export function coastalMusicBoxPinAngle(scoreSeconds = 0) { return TAU * finite(scoreSeconds) / SCORE; }

export function coastalMusicBoxMechanism(seconds = 0) {
  const t = coastalMusicBoxPhase(seconds), m = COASTAL_MUSIC_BOX_MECHANISM;
  const tipY = m.cylinderCenter[1] + Math.cos(m.contactAngle) * m.pinRadius;
  const tipZ = m.cylinderCenter[2] + Math.sin(m.contactAngle) * m.pinRadius;
  const angle = coastalMusicBoxAngle(t);
  return {
    phase: t, cylinderAngle: angle, gearAngle: angle, score: coastalMusicBoxScoreAt(t),
    playbackSeconds: t, keyAngle: coastalMusicBoxKeyAngle(t), fanAngle: coastalMusicBoxFanAngle(t),
    liveTines: m.liveTines.map(tine => {
      let last = null;
      for (const at of plucksByTine[tine.index]) { if (at <= t) last = at; else break; }
      const d = last == null ? -1 : t - last;
      return { ...tine, tipY, tipZ, length: tine.rootZ - tipZ,
        // Angular settling envelope; actual tip displacement stays below .1mm.
        deflection: d >= 0 && d < 1 ? .009 * Math.sin(d * TAU * 32) * Math.exp(-d / .17) : 0 };
    }),
  };
}
