// THE SIX METRONOMES ON THE PRACTICE FLOOR, VOICED.
//
// practice-metronomes.js keeps the time and main.js steps it, once a game frame,
// because the same ticks also land on the take whether or not there is any
// audio at all. This only turns the ticks it is handed into the wing's own click
// (practice-click.js), with the partition coming back late off the wall behind
// each one, exactly as it does in the fight. One gain and one pan per metronome,
// set every frame from where the body is, like the fork tone.
//
// Scheduled a fixed margin ahead of the context clock, so every tick keeps its
// true spacing even though the model is stepped once a frame.
//
// Voicing is not the take. What spoils a take is decided in main.js from where
// the recorder stands; this is only what the man hears.

import { PRACTICE_CLICK, PRACTICE_RETURN_LAG_MS, practiceClickTick } from './practice-click.js';
import { PRACTICE_METRONOMES } from '../game/practice-metronomes.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const METRONOME_FIELD = Object.freeze({
  // Seconds ahead of the context clock a tick is placed.
  lookahead: 0.12,
});

export function createMetronomeFieldRuntime({ context, destination } = {}) {
  if (!context || !destination) return { update() {}, sound() { return 0; }, stop() {} };

  const voices = PRACTICE_METRONOMES.map(() => {
    const gain = context.createGain();
    gain.gain.value = 0;
    const pan = context.createStereoPanner ? context.createStereoPanner() : null;
    if (pan) { gain.connect(pan); pan.connect(destination); } else gain.connect(destination);
    return { gain, pan };
  });

  let stopped = false;

  return {
    // Levels only: `{ voices: [{ gain, pan }] }`, one entry per metronome.
    update(frame = {}, now = context.currentTime) {
      if (stopped) return;
      voices.forEach((voice, index) => {
        const target = frame.voices?.[index] || {};
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.linearRampToValueAtTime(clamp(target.gain, 0, 1), now + 0.2);
        if (voice.pan) {
          voice.pan.pan.cancelScheduledValues(now);
          voice.pan.pan.linearRampToValueAtTime(clamp(target.pan, -1, 1), now + 0.2);
        }
      });
    },
    // Sound the ticks from one step (`[{ index, ago }]`) for the voices that
    // are audible and running. Returns how many were placed.
    sound(ticks = [], frame = {}, now = context.currentTime) {
      if (stopped || !frame.active) return 0;
      let placed = 0;
      for (const tick of ticks) {
        const target = frame.voices?.[tick.index];
        if (!(Number(target?.gain) > 0) || target.running === false) continue;
        const at = now + METRONOME_FIELD.lookahead - Math.max(0, Number(tick.ago) || 0);
        const out = voices[tick.index]?.gain;
        if (!out) continue;
        practiceClickTick(context, out, at, { hz: PRACTICE_CLICK.hz, decay: PRACTICE_CLICK.decay, gain: 1 });
        practiceClickTick(context, out, at + PRACTICE_RETURN_LAG_MS / 1000, {
          hz: PRACTICE_CLICK.returnHz, decay: PRACTICE_CLICK.returnDecay, gain: PRACTICE_CLICK.returnGain,
        });
        placed += 1;
      }
      return placed;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const voice of voices) {
        try { voice.gain.disconnect(); } catch (_) {}
        try { voice.pan?.disconnect(); } catch (_) {}
      }
    },
  };
}
