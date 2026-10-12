// THROUGH THE WALL, ONCE THE WING IS QUIET.
//
// What the six metronomes were covering: somebody practising in the room next
// door. It is exactly what Source files under STUDENT FILE, in that order: a
// scale, the correction tone, a faculty voice saying retain the reference, and
// then the same bar again after the room has emptied (chunk-surf-script.js,
// surfer-origin). Heard here first, so it is recognised there.
//
// Everything is synthesised and everything is through a partition: low-passed,
// quiet, and followed a moment later by the same sound coming back duller off
// the wall, the lag the practice fight's click already uses. Pitch is the
// floor's two references (practice-seams.js): the scale and the bar sit on the
// fork's A=440, the correction is the engraving's 444, and a bar played sharp
// is played against 444.
//
// It is NOT a sound event and never enters the HUSH noise envelope.

import { PRACTICE_RETURN_LAG_MS } from './practice-click.js';
import { SEAM } from '../game/practice-seams.js';

export const STUDENT_WALL = Object.freeze({
  gain: 0.06,
  lowpassHz: 1100,
  returnGain: 0.3,
  returnLowpassHz: 520,
  pan: -0.35,
  scaleNoteSeconds: 0.34,
  barNoteSeconds: 0.26,
  correctionSeconds: 0.7,
  knockGapSeconds: 0.22,
});

const semitones = (steps) => 2 ** (steps / 12);

// A major, an octave under the fork: up and back down, every note once.
const SCALE_STEPS = Object.freeze([0, 2, 4, 5, 7, 9, 11, 12]);

// The bar. Played in tune it stops after four notes, every time, in the same
// place. Played sharp it gets two notes further before it stops.
const BAR_STEPS = Object.freeze([0, 4, 7, 9, 7, 4, 2, 4]);
export const STUDENT_BAR_STOPS = Object.freeze({ inTune: 4, sharp: 6 });

export function studentScaleNotes({ start = 0 } = {}) {
  const base = SEAM.referenceHz / 2;
  const steps = [...SCALE_STEPS, ...[...SCALE_STEPS].reverse().slice(1)];
  return steps.map((step, index) => ({
    hz: base * semitones(step),
    at: start + index * STUDENT_WALL.scaleNoteSeconds,
    dur: STUDENT_WALL.scaleNoteSeconds * 0.9,
  }));
}

export function studentBarNotes({ start = 0, sharp = false } = {}) {
  const base = (sharp ? SEAM.pressureHz : SEAM.referenceHz) / 2;
  const count = sharp ? STUDENT_BAR_STOPS.sharp : STUDENT_BAR_STOPS.inTune;
  return BAR_STEPS.slice(0, count).map((step, index) => ({
    hz: base * semitones(step),
    at: start + index * STUDENT_WALL.barNoteSeconds,
    dur: STUDENT_WALL.barNoteSeconds * 0.92,
  }));
}

export function studentCorrectionTone({ start = 0 } = {}) {
  return { hz: SEAM.pressureHz, at: start, dur: STUDENT_WALL.correctionSeconds };
}

export function studentKnockTimes({ start = 0 } = {}) {
  return [start, start + STUDENT_WALL.knockGapSeconds];
}

const SILENT = Object.freeze({ scale: () => 0, correction: () => 0, bar: () => 0, knock: () => 0, stop() {} });

export function createStudentWall({ context, destination } = {}) {
  if (!context || !destination || !context.createOscillator || !context.createGain) return SILENT;

  const out = context.createGain();
  out.gain.value = STUDENT_WALL.gain;
  const pan = context.createStereoPanner ? context.createStereoPanner() : null;
  if (pan) { pan.pan.value = STUDENT_WALL.pan; out.connect(pan); pan.connect(destination); } else out.connect(destination);

  const filter = (hz) => {
    if (!context.createBiquadFilter) return out;
    const node = context.createBiquadFilter();
    node.type = 'lowpass';
    node.frequency.value = hz;
    node.connect(out);
    return node;
  };
  const wall = filter(STUDENT_WALL.lowpassHz);
  const partition = filter(STUDENT_WALL.returnLowpassHz);

  const live = new Set();
  const lag = PRACTICE_RETURN_LAG_MS / 1000;

  function voice(into, { hz, at, dur }, level, type) {
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, at);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(into);
    osc.start(at);
    osc.stop(at + dur + 0.03);
    const node = { osc, env };
    live.add(node);
    if (osc.addEventListener) osc.addEventListener('ended', () => live.delete(node));
  }

  // A note, and the same note back off the partition.
  function note(event, level = 1, type = 'triangle') {
    voice(wall, event, level, type);
    voice(partition, { ...event, at: event.at + lag }, level * STUDENT_WALL.returnGain, type);
  }

  const soon = () => context.currentTime + 0.05;

  return {
    scale() { const notes = studentScaleNotes({ start: soon() }); notes.forEach((n) => note(n)); return notes.length; },
    correction() { note(studentCorrectionTone({ start: soon() }), 0.8, 'sine'); return 1; },
    bar({ sharp = false } = {}) { const notes = studentBarNotes({ start: soon(), sharp }); notes.forEach((n) => note(n)); return notes.length; },
    knock() {
      const times = studentKnockTimes({ start: soon() });
      // Knuckles on plaster: a short, low thump that drops as it goes.
      for (const at of times) voice(out, { hz: 120, at, dur: 0.09 }, 1.4, 'sine');
      return times.length;
    },
    stop() {
      for (const node of live) {
        try { node.osc.stop(); } catch (_) { /* already stopped */ }
        try { node.env.disconnect(); } catch (_) { /* already gone */ }
      }
      live.clear();
    },
  };
}
