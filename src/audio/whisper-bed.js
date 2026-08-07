import { assetUrl } from '../platform/paths.js';
import {
  WHISPER_INFRASOUND,
  WHISPER_TIDE,
  whisperGrainsAt,
  whisperInfrasoundAt,
  whisperTideAt,
} from '../game/whisper-tide.js';
import { createWhisperGrains } from './whisper-grains.js';

// The whisper bed's audio graph.
//
// Thirteen takes of one sentence, scheduled continuously under the whole run.
// game/whisper-tide.js decides what the bed should be doing; this decides how it
// gets made.
//
// THIS NODE IS NOT IN THE WORLD. It has no distance, no occlusion, no world
// panner, and it never touches hushAudioMix — not because it is spared the
// HUSH's absorption but because it was never a sound in the room to absorb. It
// is routed where dialogue is routed, which main.js already describes as the
// path for things that are his own head rather than the building's.
//
// NO ONSETS. The single most important detail in this file is the envelope. The
// game's room tone is brown noise lowpassed at 180 Hz and the bed lives at
// 180 Hz-2.2 kHz, which means there is no masker in this band and nothing is
// hiding these files but their level and their shape. A whisper that STARTS is a
// whisper somebody hears; the same whisper faded up and down under a raised
// cosine over its whole length is a property of the room. Every utterance gets a
// Hann window across its entire duration — there is no steady state, and no
// moment at which anything begins.

const COUNT = 13;
const FILES = Object.freeze(Array.from({ length: COUNT }, (_, i) =>
  assetUrl(`audio/game/whispers/whisper-${String(i + 1).padStart(2, '0')}.mp3`)));

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// A Hann window, sampled once and reused as the gain curve for every utterance.
// setValueCurveAtTime scales it in time for us, so one table serves takes of any
// length. Continuous in its first derivative, unlike a linear ramp pair, so not
// even the turn at the top is an event.
const ENVELOPE_POINTS = 128;
const HANN = new Float32Array(ENVELOPE_POINTS);
for (let i = 0; i < ENVELOPE_POINTS; i++) {
  HANN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (ENVELOPE_POINTS - 1)));
}

export function createWhisperBed(ctx, {
  destination = null,
  infrasoundDestination = null,
  tide = WHISPER_TIDE,
  infrasound = WHISPER_INFRASOUND,
  random = Math.random,
  fetchImpl = null,
} = {}) {
  if (!ctx) return null;

  const output = ctx.createGain();
  output.gain.value = 1;
  if (destination) output.connect(destination);

  let infraOsc = null;
  let infraGain = null;
  if (infrasoundDestination && ctx.createOscillator) {
    infraGain = ctx.createGain();
    infraGain.gain.value = 0;
    infraGain.connect(infrasoundDestination);
    infraOsc = ctx.createOscillator();
    infraOsc.type = 'sine';
    infraOsc.frequency.value = infrasound.hz;
    infraOsc.connect(infraGain);
    try { infraOsc.start(); } catch (_) { infraOsc = null; }
  }

  const buffers = new Array(COUNT).fill(null);
  // The granular peak. It hangs off `output` rather than off `destination`, so
  // the pause-mute, the accessibility scale and stop() all reach it without any
  // of them having to know it exists. It shares this array by reference — there
  // is one set of thirteen decoded takes and both layers are made of it.
  const grains = createWhisperGrains(ctx, { destination: output, buffers, random });
  let loading = null;
  let ready = 0;
  const live = new Set();
  let lastIndex = -1;
  let nextAt = 0;
  let elapsedMs = 0;
  let running = false;
  let frame = null;

  function load() {
    if (loading) return loading;
    const get = fetchImpl || ((url) => fetch(url));
    loading = Promise.all(FILES.map((url, i) => get(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => { buffers[i] = buffer; ready += 1; })
      .catch((err) => { console.warn('whisper unavailable', url, err); })));
    return loading;
  }

  // Never the same take twice running, so no repetition is ever close enough
  // together to be recognised as one.
  function pick() {
    const available = [];
    for (let i = 0; i < COUNT; i++) if (buffers[i] && i !== lastIndex) available.push(i);
    if (!available.length) return -1;
    const index = available[Math.floor(clamp01(random()) * available.length) % available.length];
    lastIndex = index;
    return index;
  }

  function speak(shape, level) {
    const index = pick();
    if (index < 0) return null;
    const buffer = buffers[index];
    const now = ctx.currentTime;
    const rate = 1 + (random() * 2 - 1) * 0.04;
    const duration = buffer.duration / rate;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(rate, now);
    if (source.detune) {
      try { source.detune.setValueAtTime((random() * 2 - 1) * shape.detuneCents, now); } catch (_) {}
    }

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(shape.bandLowHz, now);
    highpass.Q.setValueAtTime(0.7, now);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(shape.bandHighHz, now);
    lowpass.Q.setValueAtTime(0.7, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    const curve = new Float32Array(ENVELOPE_POINTS);
    for (let i = 0; i < ENVELOPE_POINTS; i++) curve[i] = HANN[i] * level;
    if (gain.gain.setValueCurveAtTime) {
      try { gain.gain.setValueCurveAtTime(curve, now, duration); }
      catch (_) { linearEnvelope(gain, now, duration, level); }
    } else linearEnvelope(gain, now, duration, level);

    let tail = gain;
    let panner = null;
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime((random() * 2 - 1) * shape.panSpread, now);
      gain.connect(panner);
      tail = panner;
    }

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(gain);
    tail.connect(output);

    const voice = { source, nodes: [source, highpass, lowpass, gain, panner].filter(Boolean) };
    live.add(voice);
    source.onended = () => release(voice);
    try { source.start(now); } catch (_) { release(voice); return null; }
    return { index, duration, level };
  }

  function linearEnvelope(gain, now, duration, level) {
    gain.gain.linearRampToValueAtTime(level, now + duration * 0.5);
    gain.gain.linearRampToValueAtTime(0, now + duration);
  }

  function release(voice) {
    if (!live.has(voice)) return;
    live.delete(voice);
    for (const node of voice.nodes) { try { node.disconnect(); } catch (_) {} }
  }

  function silence(fadeSec = 0.35) {
    for (const voice of [...live]) {
      try { voice.source.stop(ctx.currentTime + fadeSec); } catch (_) { release(voice); }
    }
  }

  function tick(dtMs, { progress = 0, dreadAllowed = true, scale = 1 } = {}) {
    if (!running) return frame;
    elapsedMs += Math.max(0, finite(dtMs, 0));
    const shape = whisperTideAt({ progress, elapsedMs, tide });
    const settingScale = Math.max(0, finite(scale, 1));
    const level = shape.level * settingScale;

    if (infraGain) {
      const infra = whisperInfrasoundAt({ progress, wave: shape.wave, allowed: dreadAllowed, infrasound });
      rampTo(infraGain.gain, infra.gain * settingScale, ctx, 1.2);
    }

    // A trough starts nothing. Voices already in the air finish their envelope,
    // and the bed goes properly away rather than being cut.
    const now = ctx.currentTime;
    if (!shape.silent && level > 0.00001 && ready > 1 && now >= nextAt && live.size < shape.voices) {
      speak(shape, level);
      nextAt = now + (shape.gapMs / 1000) * (0.7 + random() * 0.6);
    }
    // The peak. Held under the bed's own level so the takes stay the thing you
    // are hearing and the grains are what has happened around them. `level`
    // already carries the accessibility scale — applying it again here would
    // square it, and reduced would be a quarter rather than a half.
    const grainShape = whisperGrainsAt({ progress, wave: shape.wave, tide });
    const grainState = grains
      ? grains.tick(dtMs, grainShape, grainShape.level * level)
      : { active: false, live: 0 };

    frame = { ...shape, level, live: live.size, ready, elapsedMs, grains: { ...grainShape, ...grainState } };
    return frame;
  }

  function start() {
    if (running) return load();
    running = true;
    // Never speak on the frame the bed arms. Arming happens on a step through a
    // door he just decided to walk through, and a sound that arrives on an
    // action is a sound he attributes to the action. Wait out the association.
    nextAt = ctx.currentTime + 8 + random() * 17;
    return load();
  }

  function stop({ fade = 0.35 } = {}) {
    running = false;
    silence(fade);
    grains?.silence?.(Math.min(fade, 0.25));
    if (infraGain) rampTo(infraGain.gain, 0, ctx, 0.4);
    frame = null;
  }

  function dispose() {
    stop({ fade: 0.05 });
    grains?.dispose?.();
    if (infraOsc) { try { infraOsc.stop(); } catch (_) {} try { infraOsc.disconnect(); } catch (_) {} }
    if (infraGain) { try { infraGain.disconnect(); } catch (_) {} }
    try { output.disconnect(); } catch (_) {}
  }

  return {
    output,
    infrasound: infraGain,
    start,
    stop,
    tick,
    dispose,
    isRunning: () => running,
    // The decoded takes, for anything that needs THIS voice rather than the bed.
    // There is one set of thirteen and they are decoded once; the get-in tableau
    // borrows them so the body at the end of the night is audibly the same
    // mouth that has been under the whole run. `warm` loads without arming.
    buffers: () => buffers.filter(Boolean),
    warm: load,
    snapshot: () => (frame ? { ...frame } : { level: 0, live: live.size, ready, running }),
  };
}

function rampTo(param, value, ctx, seconds = 0.5) {
  if (!param || !ctx) return;
  const now = ctx.currentTime;
  const target = Number.isFinite(value) ? value : 0;
  try {
    param.cancelScheduledValues(now);
    param.setValueAtTime(Number.isFinite(param.value) ? param.value : target, now);
    param.linearRampToValueAtTime(target, now + Math.max(0.02, seconds));
  } catch (_) {
    try { param.value = target; } catch (_) {}
  }
}

export const WHISPER_FILES = FILES;
