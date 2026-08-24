// THE ONE MACHINE STILL RUNNING.
//
// Ellery's power was cut when it closed. The fountain in the park was never on
// the building's meter — a corporation paid for that supply in the 1880s and
// nobody has been out to turn it off — so it has gone on playing to an empty
// park every night since. It is the only moving thing outdoors and the only
// continuous sound out there that is not weather.
//
// IT IS HEARD BEFORE IT IS SEEN, which is most of what makes it worth having.
// The park is behind a hedge with one way in, so the walk down the yard gets the
// water a long time before it gets the fountain, and a body that never goes in
// still knows something is running down there.
//
// Modelled on electrical-hum.js: a positional continuous bed with a source, a
// radius and a gain, resolved against the listener each frame. It is not a sound
// EVENT and never enters the HUSH noise envelope — nothing here is something the
// building did, it is something that was already happening.
//
// Synthesised rather than sampled. Falling water is broadband noise shaped by
// what it is falling into: a bandpass around 900Hz for the sheet off the bowls,
// a brighter one near 3kHz for the break at the jet, and a slow wobble between
// them so it never sits still the way a looped sample does.

import { catalogueEntry } from './acoustic-catalogue.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Authored building metres, matching the fountain prop in data/yard-park.js.
// The yard island is parked at logical (50,200) and this is its physical
// address, the same space ELECTRICAL_HUM_SOURCES uses.
export const FOUNTAIN_SOURCE = Object.freeze({
  id: 'park-fountain',
  x: 10.5,
  z: 36.5,
  // Wide. It has to reach up the yard past the hedge, because arriving at the
  // park already hearing it is the entire point.
  radius: 34,
  // BROADBAND IS NOT A HUM. This was 0.34 — above every interior bed in the
  // building (electrical-hum tops out at 0.28) — and those are 50Hz drones,
  // while this is filtered noise sitting in the 900Hz–3kHz band the ear is most
  // sensitive to. At the basin it stopped being ambience and became the mix.
  // Roughly seven decibels off the peak; the reach up the yard is unchanged,
  // because that is the falloff curve's job and the curve has not moved.
  gain: 0.15,
});

export function fountainWaterAt(listener, { active = true } = {}) {
  if (!active) return { audible: false, gain: 0, pan: 0, distance: Infinity };
  const x = Number(listener?.x) || 0;
  const z = Number(listener?.z ?? listener?.y) || 0;
  const distance = Math.hypot(FOUNTAIN_SOURCE.x - x, FOUNTAIN_SOURCE.z - z);
  if (distance >= FOUNTAIN_SOURCE.radius) return { audible: false, gain: 0, pan: 0, distance };
  // Squared falloff, like the hum. Water carries further than ballast does, so
  // the curve is gentler — a square root of the square, in effect.
  const air = (1 - distance / FOUNTAIN_SOURCE.radius) ** 1.6;
  const gain = FOUNTAIN_SOURCE.gain * air;
  // Panned by which side of the listener it is on, flattening as you close so
  // standing in it is not a hard-panned point.
  const dx = FOUNTAIN_SOURCE.x - x;
  const spread = clamp(distance / 8, 0, 1);
  const pan = clamp((dx / Math.max(1, distance)) * spread, -1, 1);
  return { audible: gain > 0.004, gain, pan, distance };
}

// WHAT IT HIDES.
//
// A working fountain is not just something you hear, it is something you are
// harder to hear THROUGH. Standing at the basin, a footstep competes with the
// falls; twenty metres up the yard it does not. That is the same maskingDb hook
// the bells already use (acoustic-propagation.js), and this is the only other
// thing in the building that reaches for it.
//
// The ceiling comes from the catalogue rather than from a number typed here, so
// the fountain's loudness is authored in one place: change fountain_water's
// levelDb and the masking follows. It used to be a bare constant that only
// CLAIMED to follow the entry, and the two came apart the moment the water was
// brought down in level — so it is derived now. The entry's level against the
// hearing threshold is the cover directly over the water, falling off with the
// sound itself.
const HEARING_THRESHOLD_DB = -36;

export function fountainMaskingDb(listener, { active = true } = {}) {
  const frame = fountainWaterAt(listener, { active });
  if (!frame.audible) return 0;
  const entry = catalogueEntry('fountain_water');
  if (!entry) return 0;
  const ceiling = Math.max(0, Number(entry.levelDb) - HEARING_THRESHOLD_DB);
  // The bed's own falloff is the masking curve — one source of truth for how
  // far the water carries, so what you hear and what hides you never disagree.
  const reach = frame.gain / FOUNTAIN_SOURCE.gain;
  return ceiling * clamp(reach, 0, 1);
}

export function createFountainWaterRuntime({ context, destination } = {}) {
  if (!context || !destination) return { update() {}, stop() {} };

  // Two seconds of noise, looped. Long enough that the loop point is not a
  // rhythm and short enough not to be worth streaming.
  const seconds = 2;
  const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const out = context.createGain();
  const pan = context.createStereoPanner();
  out.gain.value = 0;
  pan.connect(out);
  out.connect(destination);

  // The sheet: the mass of it, falling bowl to bowl to basin.
  const sheet = context.createBiquadFilter();
  sheet.type = 'bandpass'; sheet.frequency.value = 900; sheet.Q.value = 0.55;
  const sheetGain = context.createGain(); sheetGain.gain.value = 0.85;
  noise.connect(sheet); sheet.connect(sheetGain); sheetGain.connect(pan);

  // The break at the top of the jet, where it stops being a column.
  const spray = context.createBiquadFilter();
  spray.type = 'bandpass'; spray.frequency.value = 3100; spray.Q.value = 0.9;
  const sprayGain = context.createGain(); sprayGain.gain.value = 0.22;
  noise.connect(spray); spray.connect(sprayGain); sprayGain.connect(pan);

  // The wobble. Falling water is never one steady band — the sheet wanders as
  // the bowls fill and spill, and without this it is a hiss with a filter on it.
  const wobble = context.createOscillator();
  wobble.type = 'sine';
  wobble.frequency.value = 0.09;
  const wobbleDepth = context.createGain();
  wobbleDepth.gain.value = 140;
  wobble.connect(wobbleDepth);
  wobbleDepth.connect(sheet.frequency);

  noise.start();
  wobble.start();

  return {
    update(frame = {}, now = context.currentTime) {
      out.gain.cancelScheduledValues(now);
      out.gain.linearRampToValueAtTime(clamp(Number(frame.gain) || 0, 0, FOUNTAIN_SOURCE.gain), now + 0.15);
      pan.pan.cancelScheduledValues(now);
      pan.pan.linearRampToValueAtTime(clamp(Number(frame.pan) || 0, -1, 1), now + 0.15);
    },
    stop() {
      const now = context.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.linearRampToValueAtTime(0, now + 0.1);
      try { noise.stop(now + 0.12); } catch (_) {}
      try { wobble.stop(now + 0.12); } catch (_) {}
    },
  };
}
