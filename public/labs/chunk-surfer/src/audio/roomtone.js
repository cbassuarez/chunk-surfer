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
  loadFootsteps();      // so the first step of a run is not the silent one
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

// ── footsteps ───────────────────────────────────────────────────────────────
// One long recording of a man walking, sliced at random. The noise MODEL is
// unchanged — `level` is exactly the number `recordist.js` just emitted, so a
// slow step is almost nothing and an injured step is still an announcement.
// Only the timbre changed: a filtered noise burst never sounded like a shoe.
const STEPS_URL = '/labs/chunk-surfer/audio/bunch-of-footsteps-sounds.mp3';
let stepsBuf = null;
let stepsPending = null;

export function loadFootsteps() {
  if (!ctx || stepsBuf || stepsPending) return stepsPending;
  stepsPending = fetch(STEPS_URL)
    .then((r) => { if (!r.ok) throw new Error(`${r.status} ${STEPS_URL}`); return r.arrayBuffer(); })
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => { stepsBuf = buf; stepsPending = null; return buf; })
    .catch((err) => { console.warn('footsteps failed to load', err); stepsPending = null; return null; });
  return stepsPending;
}

export function footstep(level = 0.22) {
  if (!ctx || !bus || level <= 0.001) return;
  if (!stepsBuf) { loadFootsteps(); return; }       // the first step of a run is silent
  const now = ctx.currentTime;

  // A window somewhere in the file, long enough to contain one footfall.
  const dur = 0.16 + Math.random() * 0.14;
  const startMax = Math.max(0, stepsBuf.duration - dur - 0.02);
  const offset = startMax > 0 ? Math.random() * startMax : 0;

  const src = ctx.createBufferSource();
  src.buffer = stepsBuf;
  src.playbackRate.setValueAtTime(0.90 + Math.random() * 0.20, now);

  // A hard gate on both ends: we are cutting into the middle of a recording and
  // must not bring its edges with us.
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(Math.min(0.85, level * 1.4), now + 0.004);
  env.gain.setValueAtTime(Math.min(0.85, level * 1.4), now + dur - 0.03);
  env.gain.exponentialRampToValueAtTime(0.0006, now + dur);

  let out = env;
  let pan = null;
  if (ctx.createStereoPanner) {
    pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime((Math.random() * 2 - 1) * 0.22, now);
    env.connect(pan);
    out = pan;
  }
  src.connect(env);
  out.connect(bus);
  try { src.start(now, offset, dur); src.stop(now + dur + 0.02); } catch (_) { return; }
  src.onended = () => { try { src.disconnect(); env.disconnect(); pan?.disconnect(); } catch (_) {} };
}
