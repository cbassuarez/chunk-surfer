// SIX METRONOMES, AND THE ONE THEY END UP ON.
//
// The wing's clock is the practice fight's metronome at BATTLE_BPM, 168 (see
// audio/practice-click.js). Out on the floor six more are running, one on the
// upright in each of five teaching rooms and one on the ensemble room's marimba,
// each set to a plain ratio of that clock:
//
//   2/3 = 112   3/4 = 126   4/5 = 134.4   1 = 168   4/3 = 224   3/2 = 252
//
// They were all started together, so for a while they are a clatter with a
// shape in it: all six land on the same instant once every sixty beats of 168,
// a little over twenty-one seconds, and nowhere in between.
//
// Then they settle. Metronomes standing on one shared floor really do pull each
// other into step, through the floor, and these do the same: the longer you
// spend in the wing, the closer every tempo draws to 168, and once the tempos
// are close the phases lock, until there is one tick in six places. The service
// room has none, so the fork's beat is never under a tick, and the exam room's
// stays stopped one click before the bar line, as its upright already says.
//
// AND THEY RUIN TAKES. A room-tone recording of a room with a clock ticking in
// it is not a room tone. Each tick reaches the recorder through distance, rooms
// and doors, and ticks that land together add up, so a wing full of running
// metronomes spoils any take in it, and a settled one spoils it on every beat.
// The job is to quiet them: stop a pendulum by hand, or shut its room in.
//
// Pure: no audio nodes, no save, no clocks. main.js steps it and supplies where
// the recorder is; metronome-field.js voices the ticks.

import { BATTLE_BPM } from '../audio/battle-music.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export const PRACTICE_METRONOMES = Object.freeze([
  Object.freeze({ id: 'practice-metronome-lesson', roomId: 'cello-lesson', label: 'the lesson room', ratio: 2 / 3, doors: Object.freeze(['practice-east-1']) }),
  // The claimed room is the one with two ways in: the corridor, and the string
  // room's door to the side passage. Shutting it in means both.
  Object.freeze({ id: 'practice-metronome-claimed', roomId: 'coat-and-bag-drop', label: 'the claimed room', ratio: 3 / 4, doors: Object.freeze(['practice-east-2', 'practice-side']) }),
  Object.freeze({ id: 'practice-metronome-rehearsal', roomId: 'chamber-spillover', label: 'the rehearsal room', ratio: 4 / 5, doors: Object.freeze(['practice-west-3']) }),
  // The reference, in the paper room with the arrows over every A.
  Object.freeze({ id: 'practice-metronome-paper', roomId: 'copied-parts', label: 'the paper room', ratio: 1, doors: Object.freeze(['practice-east-3']) }),
  Object.freeze({ id: 'practice-metronome-emptied', roomId: 'hurried-departure', label: 'the emptied room', ratio: 4 / 3, doors: Object.freeze(['practice-west-4']) }),
  Object.freeze({ id: 'practice-metronome-ensemble', roomId: 'ensemble-rehearsal', label: 'the ensemble room', ratio: 3 / 2, doors: Object.freeze(['practice-east-4']) }),
]);

export const METRONOME_REFERENCE_INDEX = PRACTICE_METRONOMES.findIndex((voice) => voice.ratio === 1);

export function practiceMetronomeById(id) {
  return PRACTICE_METRONOMES.find((voice) => voice.id === String(id || '')) || null;
}

export const METRONOME_SETTLE = Object.freeze({
  // Seconds spent in the wing, in total across the night, before they are one.
  seconds: 180,
  // How hard the floor pulls a phase toward the reference once they have
  // settled, in cycles per second at full strength.
  coupling: 1.2,
});

export const METRONOME_VOICE = Object.freeze({
  // What the player hears. A mechanical metronome carries across a room and a
  // doorway, not a floor.
  radius: 14,
  gain: 0.05,
});

// WHAT A TICK DOES TO A TAKE, in the recorder's noise scale (a take spoils above
// ROOM_TONE.spoilNoise, 0.18; a footstep is 0.22).
//
// Tuned against the wing as it stands. In the same room, a tick spoils outright.
// From the corridor mark, one running metronome in another room lands just
// under the line, so it marks the take without killing it; two that land
// together are over it, and six running unsettled ones collide constantly. A
// settled wing is one tick six times over, and spoils on every beat. A room shut
// in behind its door drops to a tenth, and all six shut in together are under.
export const METRONOME_TAKE = Object.freeze({
  level: 0.45,
  falloff: 0.06,
  otherRoom: 0.6,
  shutIn: 0.1,
  coincidentSeconds: 0.025,
});

// The restart, once he is hurt enough to be worth making it harder for: from
// his fourth injury, the first take rolled in the wing has an even chance of one
// stopped metronome starting again partway through it, and every take after that
// has a one-in-ten.
export const METRONOME_RESTART = Object.freeze({
  injuries: 4,
  firstChance: 0.5,
  laterChance: 0.1,
  // Where in the take it starts, as take progress.
  from: 0.25,
  to: 0.6,
});

/** 0..1, eased, from seconds spent in the wing. */
export function metronomeSettleEase(seconds) {
  const t = clamp01((Number(seconds) || 0) / METRONOME_SETTLE.seconds);
  return t * t * (3 - 2 * t);
}

/**
 * The tempo of a metronome set to `ratio` of the clock, `ease` of the way to
 * settled. Geometric, so a ratio above 1 and one below close at matching rates.
 */
export function metronomeTempo(ratio, ease = 0) {
  return BATTLE_BPM * (Number(ratio) || 1) ** (1 - clamp01(ease));
}

export function freshMetronomeState() {
  // All started together, by the same hand.
  return { phases: PRACTICE_METRONOMES.map(() => 0) };
}

/**
 * Advance every phase by `dt` seconds at settle `ease`. Returns the new state
 * and the ticks that crossed during the step, each as `{ index, ago }` — how
 * many seconds before the end of the step it landed, earliest first.
 */
export function stepMetronomes(state, dt, ease = 0) {
  const step = Math.max(0, Number(dt) || 0);
  const settle = clamp01(ease);
  const before = state?.phases?.length === PRACTICE_METRONOMES.length ? state.phases : freshMetronomeState().phases;
  const reference = before[METRONOME_REFERENCE_INDEX];
  const pull = METRONOME_SETTLE.coupling * settle * settle;
  const ticks = [];
  const phases = before.map((phase, index) => {
    const voice = PRACTICE_METRONOMES[index];
    const cycles = metronomeTempo(voice.ratio, settle) / 60;
    const lean = index === METRONOME_REFERENCE_INDEX
      ? 0
      : pull * Math.sin(2 * Math.PI * (reference - phase)) / (2 * Math.PI);
    const rate = Math.max(0, cycles + lean);
    const next = phase + rate * step;
    for (let crossing = 1; crossing <= Math.floor(next); crossing += 1) {
      const fraction = rate > 0 ? (crossing - phase) / (rate * step) : 1;
      ticks.push({ index, ago: step * (1 - clamp01(fraction)) });
    }
    return next - Math.floor(next);
  });
  ticks.sort((a, b) => b.ago - a.ago);
  return { state: { phases }, ticks };
}

/**
 * A long gap (a paused game, a hidden tab) advanced in small silent steps, so
 * the coupling still integrates and nothing is sounded for time nobody heard.
 */
export function advanceMetronomesSilently(state, dt, ease = 0, { chunk = 0.05, limit = 120 } = {}) {
  let next = state;
  let left = Math.min(Math.max(0, Number(dt) || 0), chunk * limit);
  while (left > 0) {
    const piece = Math.min(left, chunk);
    next = stepMetronomes(next, piece, ease).state;
    left -= piece;
  }
  return next;
}

/**
 * Level and pan for a listener at `{x, z}` and a metronome at `{x, z}`, both in
 * physical metres. What the player hears. Same shape as forkToneAt.
 */
export function metronomeVoiceAt(listener, source) {
  if (!source) return { gain: 0, pan: 0, distance: Infinity };
  const dx = (Number(source.x) || 0) - (Number(listener?.x) || 0);
  const dz = (Number(source.z ?? source.y) || 0) - (Number(listener?.z ?? listener?.y) || 0);
  const distance = Math.hypot(dx, dz);
  if (distance >= METRONOME_VOICE.radius) return { gain: 0, pan: 0, distance };
  const gain = METRONOME_VOICE.gain * (1 - distance / METRONOME_VOICE.radius) ** 1.6;
  const spread = clamp01(distance / 4);
  const pan = Math.max(-1, Math.min(1, (dx / Math.max(1, distance)) * spread));
  return { gain, pan, distance };
}

/**
 * How loud one tick lands at the recorder, in the take's noise scale.
 * `distance` in metres; `sameRoom` when the recorder stands in the metronome's
 * room; `shutIn` when every door of that room is shut.
 */
export function metronomeTickLevel({ distance = 0, sameRoom = false, shutIn = false } = {}) {
  let level = METRONOME_TAKE.level / (1 + METRONOME_TAKE.falloff * Math.max(0, Number(distance) || 0));
  if (!sameRoom) level *= METRONOME_TAKE.otherRoom;
  if (shutIn) level *= METRONOME_TAKE.shutIn;
  return level;
}

/**
 * Ticks that land within `coincidentSeconds` of each other are one louder
 * event: `[{ ago, level, indices }]`, earliest first. Each tick needs `ago` and
 * `level`; ticks with no level are left out.
 */
export function coincidentTicks(ticks = [], windowSeconds = METRONOME_TAKE.coincidentSeconds) {
  const sorted = ticks.filter((tick) => Number(tick?.level) > 0).sort((a, b) => b.ago - a.ago);
  const groups = [];
  for (const tick of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.ago - tick.ago <= windowSeconds) {
      last.level += tick.level;
      last.indices.push(tick.index);
    } else {
      groups.push({ ago: tick.ago, level: tick.level, indices: [tick.index] });
    }
  }
  return groups;
}

/** The chance a take in the wing restarts a stopped metronome, or 0. */
export function metronomeRestartChance({ injuries = 0, rolledBefore = false, anyStopped = false } = {}) {
  if (!anyStopped || (Number(injuries) || 0) < METRONOME_RESTART.injuries) return 0;
  return rolledBefore ? METRONOME_RESTART.laterChance : METRONOME_RESTART.firstChance;
}
