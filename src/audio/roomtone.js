import { createFootstepAudio } from './footsteps.js';
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

let ctx = null, bus = null, footOutput = null;
let bed = null;        // {src, filt, gain}
let bedTarget = 0;

export function roomToneInit(audioCtx, masterBus) {
  if (ctx !== audioCtx || bus !== masterBus) {
    if (bed) {
      try { bed.src.stop(); bed.src.disconnect(); bed.filt.disconnect(); bed.gain.disconnect(); } catch (_) {}
      bed = null; bedTarget = 0;
    }
    footsteps.clear();
    try { footOutput?.disconnect(); } catch (_) {}
    footOutput = audioCtx.createGain();
    footOutput.gain.value = 1;
    footOutput.connect(masterBus);
  }
  ctx = audioCtx; bus = masterBus;
  footsteps.update({ paused: false });
  // The menu/entry interval prepares likely ordinary contacts. Region owners
  // warm their actual material/profile before reaching a new surface.
  void Promise.all(['concrete', 'wood', 'tile'].map(surface => loadFootsteps({ surface })));
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
export function roomToneState() { return { active:bedTarget>0, target:bedTarget }; }

// ── footsteps ───────────────────────────────────────────────────────────────
// The shared player owns whole contacts and finite substrate/Source responses.
// Gameplay noise remains with recordist.js. This bus retains the existing
// glass/HUSH/world mix, including while the recorder is listening.
const footsteps = createFootstepAudio({ getAudio: () => ({ ctx, destination: footOutput || bus }) });

export function loadFootsteps(descriptor = { surface: 'concrete' }) {
  return footsteps.preload(descriptor);
}
export function prepareFootsteps(descriptor = {}) { return footsteps.preload(descriptor); }
export function footstep(level = .22, options = {}) { return footsteps.contact({ ...options, level }); }
export function updateFootsteps(state = {}) { footsteps.update(state); }
export function clearFootContacts(owner) { footsteps.clear(owner); }
export function pauseFootsteps() { footsteps.update({ paused: true }); }
export function footstepState() { return footsteps.snapshot(); }
// Read-only tap for task-local listening evidence. The audible branch continues
// through world SFX, glass, HUSH and the normal output chain.
export function footstepOutput() { return { context: ctx, source: footOutput }; }

// Compatibility for isolated callers: a whole supported water plant, not a
// second effect layered over another semantic/audible footstep.
export function waterFootstep(level = .12, options = {}) {
  return footstep(level, { ...options, surface: 'water', profile: 'physical' });
}
