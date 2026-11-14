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
  if (!context || !destination) return { update() {}, sound() { return 0; }, silenceVoice() {}, stop() {} };

  const voices = PRACTICE_METRONOMES.map(() => {
    const gain = context.createGain();
    gain.gain.value = 0;
    const pan = context.createStereoPanner ? context.createStereoPanner() : null;
    if (pan) { gain.connect(pan); pan.connect(destination); } else gain.connect(destination);
    return { gain, pan, live: new Set() };
  });

  let stopped = false;
  function prune(voice, now) {
    for (const node of voice.live) if (node.until <= now) {
      try { node.env.disconnect(); } catch (_) {}
      voice.live.delete(node);
    }
  }
  function silenceVoice(index, now = context.currentTime) {
    const voice = voices[index]; if (!voice) return;
    for (const node of voice.live) {
      try { node.osc.stop(now); } catch (_) {}
      try { node.env.disconnect(); } catch (_) {}
    }
    voice.live.clear();
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(0, now);
  }

  return {
    // Levels only: `{ voices: [{ gain, pan }] }`, one entry per metronome.
    update(frame = {}, now = context.currentTime) {
      if (stopped) return;
      voices.forEach((voice, index) => {
        const target = frame.voices?.[index] || {};
        prune(voice, now);
        if (!frame.active || target.running === false || target.held === true) { silenceVoice(index, now); return; }
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
        if (!(Number(target?.gain) > 0) || target.running === false || target.held === true) continue;
        const voice = voices[tick.index]; if (!voice) continue;
        const at = Math.max(now, Number.isFinite(tick.audioAt) ? tick.audioAt
          : now + METRONOME_FIELD.lookahead - Math.max(0, Number(tick.ago) || 0));
        const out = voice.gain; prune(voice, now);
        const primary = practiceClickTick(context, out, at, { hz: PRACTICE_CLICK.hz, decay: PRACTICE_CLICK.decay, gain: 1 });
        const returned = practiceClickTick(context, out, at + PRACTICE_RETURN_LAG_MS / 1000, {
          hz: PRACTICE_CLICK.returnHz, decay: PRACTICE_CLICK.returnDecay, gain: PRACTICE_CLICK.returnGain,
        });
        voice.live.add({ ...primary, until: at + PRACTICE_CLICK.decay + .02 });
        voice.live.add({ ...returned, until: at + PRACTICE_RETURN_LAG_MS / 1000 + PRACTICE_CLICK.returnDecay + .02 });
        placed += 1;
      }
      return placed;
    },
    silenceVoice,
    stop() {
      if (stopped) return;
      stopped = true;
      for (const [index, voice] of voices.entries()) {
        silenceVoice(index);
        try { voice.gain.disconnect(); } catch (_) {}
        try { voice.pan?.disconnect(); } catch (_) {}
      }
    },
  };
}
