// THE CLICK IN THE PRACTICE WING, AND THE ONE THAT COMES BACK.
//
// Leila Hart practised in P-3 for three years and this is what she remembers of
// it: "Practice room P-3. Marimba if you booked early, snare drum if you did
// not, and a click coming back through the partition." And, when pushed on how
// far behind it was: "Not enough to count cleanly. Enough to pull the stick out
// of your hand if you listened to it."
//
// That is two signals, not one. The metronome, and the same metronome arriving
// late off the partition wall — close enough to smear the beat, far enough to
// ruin your time if you follow it. Maintenance packed the grille twice and it
// did not stop.
//
// WHY THIS IS SYNTHESISED. There is no click in the sample bank and the
// `procedural.ui-click` asset is a placeholder the cue player skips outright
// (see cue-player.js). A metronome is two hundred milliseconds of filtered tone
// with a hard envelope, so it is built here rather than waited for — and built
// means every parameter is a number somebody chose, which a sample would not be.
//
// THE CLICK IS THE ROOM'S CLOCK. Tempo lives here, and everything that wants to
// stay in sync with the wing reads it from here rather than keeping its own.
// `BATTLE_BPM` remains the authored grid; this is the one place allowed to move
// off it, and only for the encounter that owns a metronome.

import { BATTLE_BEATS_PER_BAR, BATTLE_BPM } from './battle-music.js';

// How far behind the partition puts it. Measured from Leila's account rather
// than chosen for feel: "not enough to count cleanly" is the band between a
// flam you hear as one event and an echo you hear as two, which is roughly
// 50-100ms. Past that it stops smearing the beat and starts being a second beat.
export const PRACTICE_RETURN_LAG_MS = 85;

// A tick is short, and the return is shorter and duller — it has been through a
// partition. These are the whole voice of the room.
export const PRACTICE_CLICK = Object.freeze({
  hz: 1_180,          // a hard woodblock-ish tick, well clear of the marimba
  returnHz: 640,      // the partition takes the top off it
  attack: .001,
  decay: .045,
  returnDecay: .075,  // and smears what is left
  gain: .16,
  returnGain: .34,    // relative to the click, before attenuation
});

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

// HE IS RUSHING IT.
//
// The one tempo change in the wing, and it is his. A player who cannot get
// through a bar plays it faster every time — it is the most common failure in a
// practice room and it is the opposite of the technique, which is to slow down.
// Nothing in the building is speeding up; his time is going.
//
// Capped, because past a point it stops reading as rushing and starts reading as
// a different piece of music.
export const PRACTICE_RUSH_PER_LAP = 4;
export const PRACTICE_RUSH_CAP = 24;
export function practiceTempo(retakes, base = BATTLE_BPM) {
  const rush = Math.min(PRACTICE_RUSH_CAP, Math.max(0, Math.trunc(Number(retakes) || 0)) * PRACTICE_RUSH_PER_LAP);
  return base + rush;
}

// The ratio everything else stretches by, so the wing stays in one piece: one
// number, read by the click, the bed and anything else that has to agree with
// them. 1 at the authored grid and never below it — he does not slow down.
export const practiceTimeStretch = (retakes, base = BATTLE_BPM) => base / practiceTempo(retakes, base);

// Tick times for one bar at a given tempo, as offsets from the downbeat. Pure,
// so the schedule can be checked without an audio context — and so the visible
// click and the audible one cannot disagree about where the beat is.
export function practiceClickSchedule({ retakes = 0, bars = 1, bpm = BATTLE_BPM, returnLagMs = PRACTICE_RETURN_LAG_MS } = {}) {
  const tempo = practiceTempo(retakes, bpm);
  const beat = 60 / tempo;
  const lag = Math.max(0, Number(returnLagMs) || 0) / 1000;
  const ticks = [];
  const count = Math.max(1, Math.trunc(bars)) * BATTLE_BEATS_PER_BAR;
  for (let index = 0; index < count; index += 1) {
    const at = index * beat;
    ticks.push({
      at,
      // The first beat of the bar is the one he counts. Everything else is
      // subdivision and sits back in the mix.
      downbeat: index % BATTLE_BEATS_PER_BAR === 0,
      returnAt: at + lag,
    });
  }
  return { tempo, beat, bar: beat * BATTLE_BEATS_PER_BAR, lag, ticks };
}

function tick(context, destination, at, { hz, decay, gain }) {
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(hz, at);
  // A metronome has no pitch envelope worth speaking of, but a completely flat
  // one reads as a beep. A hair of downward drift is what makes it a knock.
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, hz * .82), at + decay);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + PRACTICE_CLICK.attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(env);
  env.connect(destination);
  osc.start(at);
  osc.stop(at + decay + .02);
  return { osc, env };
}

// The room's metronome, running. `returnLevel` is how much of the partition is
// still coming back — 1 while he has understood nothing, 0 once he has played
// the bar back enough times to know what is on it, which is the same curve the
// transport draws.
export function createPracticeClick({
  context = null,
  destination = null,
  bpm = BATTLE_BPM,
  lookaheadSeconds = .35,
} = {}) {
  let running = false;
  let retakes = 0;
  let returnLevel = 1;
  let nextAt = 0;
  let index = 0;
  const live = new Set();

  const usable = !!(context && destination && context.createOscillator && context.createGain);

  function schedule() {
    if (!usable || !running) return;
    const horizon = context.currentTime + lookaheadSeconds;
    const beat = 60 / practiceTempo(retakes, bpm);
    while (nextAt < horizon) {
      const downbeat = index % BATTLE_BEATS_PER_BAR === 0;
      const level = PRACTICE_CLICK.gain * (downbeat ? 1 : .55);
      live.add(tick(context, destination, nextAt, {
        hz: PRACTICE_CLICK.hz, decay: PRACTICE_CLICK.decay, gain: level,
      }));
      // The partition. Never louder than the thing it is a reflection of, and it
      // does not exist at all once he has stopped listening for it.
      if (returnLevel > .001) {
        live.add(tick(context, destination, nextAt + PRACTICE_RETURN_LAG_MS / 1000, {
          hz: PRACTICE_CLICK.returnHz,
          decay: PRACTICE_CLICK.returnDecay,
          gain: level * PRACTICE_CLICK.returnGain * clamp(returnLevel, 0, 1),
        }));
      }
      nextAt += beat;
      index += 1;
    }
  }

  return {
    get running() { return running; },
    get tempo() { return practiceTempo(retakes, bpm); },
    get available() { return usable; },
    start(at = null) {
      if (running || !usable) { running = usable && running; return usable; }
      running = true;
      index = 0;
      nextAt = Math.max(context.currentTime + .06, Number(at) || 0);
      schedule();
      return true;
    },
    // Called every frame; cheap, and the only thing keeping the click alive.
    tick() { schedule(); },
    // He is rushing it. One number, and the whole room moves with it.
    setRetakes(value) { retakes = Math.max(0, Math.trunc(Number(value) || 0)); },
    setReturnLevel(value) { returnLevel = clamp(value, 0, 1); },
    stop() {
      running = false;
      for (const node of live) {
        try { node.osc.stop(); } catch (_) { /* already stopped */ }
        try { node.env.disconnect(); } catch (_) { /* already gone */ }
      }
      live.clear();
    },
  };
}
