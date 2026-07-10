// Room tone: what an empty room actually sounds like, and the footsteps you
// put into it.
//
// The lab's proximity engine plays up to 24 chunk voices as you walk. In story
// mode none of them play. What you hear is a filtered noise floor a hair above
// nothing, and your own feet — which are the loudest thing in the building and
// the reason it finds you.
//
// The monitor (see recordist.js) is the only route from the catalog to your
// ears, and it costs you your light and your legs.

import { ROOM_TONE } from '../config.js';

let ctx = null, bus = null;
let bed = null;        // {src, filt, gain}
let bedTarget = 0;

export function roomToneInit(audioCtx, masterBus) {
  ctx = audioCtx; bus = masterBus;
}

function makeNoiseBuffer(seconds = 3) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
  const ch = buf.getChannelData(0);
  // brown-ish: an air-handler hum, not a hiss
  let last = 0;
  for (let i = 0; i < ch.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.018 * white) / 1.018;
    ch[i] = last * 3.2;
  }
  return buf;
}

// A per-room floor. `character` shifts the cutoff so a tiled natatorium and a
// carpeted studio do not share a noise floor.
export function ensureBed(character = 1) {
  if (!ctx || !bus) return null;
  if (bed) return bed;
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer();
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(180 * character, now);
  filt.Q.setValueAtTime(0.4, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  src.connect(filt); filt.connect(gain); gain.connect(bus);
  try { src.start(); } catch (_) { return null; }
  bed = { src, filt, gain };
  return bed;
}

export function setBed(target, rampSec = 1.5) {
  const b = ensureBed();
  if (!b) return;
  const goal = Math.max(0, Math.min(0.05, target));
  if (bedTarget === goal) return;
  bedTarget = goal;
  const now = ctx.currentTime;
  b.gain.gain.cancelScheduledValues(now);
  b.gain.gain.setValueAtTime(b.gain.gain.value, now);
  b.gain.gain.linearRampToValueAtTime(goal, now + rampSec);
}

export function bedOn() { setBed(ROOM_TONE.bedGain); }
export function bedOff() { setBed(0, 0.6); }

// A footstep. Loudness is the noise level the recordist just emitted, so a
// slow step is almost nothing and an injured step is a announcement.
export function footstep(level = 0.22) {
  if (!ctx || !bus || level <= 0.001) return;
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.06);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const env = Math.pow(1 - i / len, 3.2);         // hard scuff, fast decay
    d[i] = (Math.random() * 2 - 1) * env;
  }
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.setValueAtTime(240 + Math.random() * 90, now);
  filt.Q.setValueAtTime(0.8, now);
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.min(0.4, level * 0.5), now);
  src.connect(filt); filt.connect(g); g.connect(bus);
  src.start(now);
  src.stop(now + 0.09);
  setTimeout(() => { try { src.disconnect(); filt.disconnect(); g.disconnect(); } catch (_) {} }, 250);
}
