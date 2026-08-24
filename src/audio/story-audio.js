import { assetUrl } from '../platform/paths.js';
import { runtimeParams } from '../platform/launch.js';
import { authoredCue } from './authored-cues.js';
import {
  OPENING_BED_LOOP_SECONDS,
  nextOpeningBedDownbeatAt,
} from './opening-bed-transport.js';

// Story-only beds.
//
// Cues are loud by design. These are not cues: the title song is a low bed
// under the existing sound world, and the typing sound is a granular texture
// that is active only while text is actually being revealed.

// ⚠ THE FIVE ENDING BEDS ARE THE TITLE THEME. ⚠
//
// Placeholder, deliberately and visibly. Every ending currently plays the opening
// title song under it, which is the right stand-in — it is the only piece of
// music the player already associates with this building — and the wrong final
// answer, because nine endings that sound identical are eight endings that do not
// land. See ENDING_AUDIO_TODO in data/endings.js for the full outstanding list.
//
// Replacing one is a one-line change: point its key at its own file.
const ENDING_BED_PLACEHOLDER = assetUrl('audio/game/title_song.mp3');

export const STORY_AUDIO = {
  title: assetUrl('audio/game/title_song.mp3'),
  openingBed: assetUrl('audio/game/opening_scene_bed_pre_cold_open.mp3'),
  // The credits roll gets its own piece. It plays through the same soundtrack
  // slot as the title bed, which is what guarantees the two can never overlap.
  credits: assetUrl('audio/game/credits_song.mp3'),
  // The endings. TEMPORARY — all five are the title theme (see above).
  'ending.sacrifice': ENDING_BED_PLACEHOLDER,
  'ending.helped': ENDING_BED_PLACEHOLDER,
  'ending.inversion': ENDING_BED_PLACEHOLDER,
  'ending.drugged': ENDING_BED_PLACEHOLDER,
  'ending.surfaced': ENDING_BED_PLACEHOLDER,
  typing: assetUrl('audio/game/typing.mp3'),
  booth: assetUrl('audio/game/outside_room_tone.mp3'),
  rain: assetUrl('audio/game/rain.mp3'),
  // Tape hiss and the transport running, recorded off a real machine. It plays
  // under the cryptic take, and it is what you hear immediately after a rewind.
  tape: assetUrl('audio/game/tape_play.mp3'),
};

// THE MIX, top to bottom. Decided in one place, and never again:
//
//   0.95   the radio, breaking             (the loudest thing that happens)
//   0.95   the service door
//   authored × bus baseline — title, typing and story beds
//   0.26   a voice                         (sam-voice.js)
//   0.62-0.85  the foley                   (audio/cues.js — pens, keys, signature)
// The baseline is the bus calibration; the editable layer gain lives in the
// audio project and is multiplied into it at runtime. Studio changes therefore
// reach the game without freezing a particular authored value in JS or tests.
//
// TYPE_GAIN is a BUS gain, and each keystroke peaks around 0.4 into it, so the
// loudest key lands near 0.22 — under a voice, over the song. It sat at 0.034
// and then 0.18, and at both it was inaudible, which is why the number is now
// written down next to everything it competes with.
//
// The song is a BED and it must survive: it ducks under speech rather than
// getting out of the way, because a bed that disappears is not a bed. Half its
// level, not a tenth. `?typegain=` and `?songgain=` tune both by ear.
// `Number(null)` is 0, and 0 is a perfectly finite gain, so an absent parameter
// silently muted the entire story bus — the song and the typewriter both — for
// about an hour. Ask whether the parameter is there before believing its value.
function queryGain(name, fallback) {
  try {
    const qp = runtimeParams();
    if (!qp.has(name)) return fallback;
    const v = Number(qp.get(name));
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  } catch (_) { return fallback; }
}

function authoredGain(cueId, fallback = 1) {
  const value = Number(authoredCue(cueId)?.layers?.[0]?.gain);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export const STORY_GAIN_BASELINES = Object.freeze({
  typing: 0.55,
  title: 0.42,
  openingBed: 0.30,
  // Louder than the title bed: nothing competes with it. The credits roll has
  // no dialogue, no foley and no room tone over the top, so the bed IS the
  // scene rather than a floor under one.
  credits: 0.66,
  booth: 0.075,
  rain: 0.060,
  tape: 0.46,
});

export const TYPE_GAIN = queryGain('typegain', STORY_GAIN_BASELINES.typing * authoredGain('story.typing'));
export const TYPE_LEVEL = { thought: 1.0, direction: 1.15 };   // narration types harder
// The song is the piece. It is not background: it carries the booth and it
// carries the title, and it is the last thing the player hears before the door.
export const SOUNDTRACK_GAIN = queryGain('songgain', STORY_GAIN_BASELINES.title * authoredGain('story.title'));
export const OPENING_BED_GAIN = queryGain('openingbedgain', STORY_GAIN_BASELINES.openingBed * authoredGain('story.openingBed', 1));
export const CREDITS_GAIN = queryGain('creditsgain', STORY_GAIN_BASELINES.credits * authoredGain('story.credits'));
export const SOUNDTRACK_DUCK = SOUNDTRACK_GAIN * 0.55;         // audible, out of the way
export const BOOTH_GAIN = STORY_GAIN_BASELINES.booth * authoredGain('story.booth');
export const RAIN_GAIN = STORY_GAIN_BASELINES.rain * authoredGain('story.rain');
export const TAPE_GAIN = queryGain('tapegain', STORY_GAIN_BASELINES.tape * authoredGain('story.tape'));

let ctx = null;
let bus = null;
let audioBuses = { dialog: null, sfx: null, music: null, menu: null };
const buffers = new Map();
const pending = new Map();

let soundtrack = null; // { src, gain, startedAt, stopping, track }
let openingBed = null; // { src, hp, lp, gain, startedAt, downbeatAt, stopping, target }
let typing = null;     // { gain, hp, lp, active, timer, targetGain }
let menuHiss = null;

export function storyAudioInit(audioCtx, destination, buses = {}) {
  ctx = audioCtx;
  bus = destination;
  audioBuses = {
    dialog: buses.dialog || destination,
    sfx: buses.sfx || destination,
    music: buses.music || destination,
    menu: buses.menu || buses.sfx || destination,
  };
}

function outBus(name = 'sfx') {
  return audioBuses[name] || bus;
}

export async function preload(url) {
  if (!ctx) return null;
  if (buffers.has(url)) return buffers.get(url);
  if (pending.has(url)) return pending.get(url);
  const job = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.arrayBuffer(); })
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => { buffers.set(url, buf); pending.delete(url); return buf; })
    .catch((err) => { console.warn('story audio load failed', url, err); pending.delete(url); return null; });
  pending.set(url, job);
  return job;
}

export function preloadAll() {
  // The credits piece is six megabytes and is not needed until the roll, which
  // fetches it lazily on enter. Preloading it at boot would buy nothing and
  // cost the whole download before the first frame.
  return Promise.all(
    Object.entries(STORY_AUDIO).filter(([key]) => key !== 'credits').map(([, url]) => preload(url)),
  );
}

function setGain(gainNode, value, rampSec = 0.5) {
  if (!ctx || !gainNode) return;
  const now = ctx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(Math.max(0, value), now + Math.max(0.02, rampSec));
}

function setGainAt(gainNode, value, at, rampSec = 0.01) {
  if (!ctx || !gainNode) return;
  const now = ctx.currentTime;
  const start = Math.max(now, Number.isFinite(Number(at)) ? Number(at) : now);
  const ramp = Math.max(0.005, Number.isFinite(Number(rampSec)) ? Number(rampSec) : 0.005);
  gainNode.gain.cancelScheduledValues(start);
  gainNode.gain.setValueAtTime(gainNode.gain.value, start);
  gainNode.gain.linearRampToValueAtTime(Math.max(0, value), start + ramp);
}

function rampParam(param, value, rampSec = 0.12) {
  if (!ctx || !param) return;
  const now = ctx.currentTime;
  const target = Number(value);
  if (!Number.isFinite(target)) return;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + Math.max(0.01, rampSec));
}

// The player's music level, a scalar over SOUNDTRACK_GAIN. 1 is the mix as
// authored; 0 is silence. Rides the live soundtrack when changed.
let musicScale = 1;
function trackGain(track) {
  return track === 'credits' ? CREDITS_GAIN : SOUNDTRACK_GAIN;
}
export function setMusicVolume(v) {
  musicScale = Math.max(0, Math.min(1, Number(v)));
  if (soundtrack && !soundtrack.stopping) setGain(soundtrack.gain, trackGain(soundtrack.track) * musicScale, 0.15);
  if (openingBed && !openingBed.stopping) {
    const target = openingBed.target?.gain ?? 1;
    setGain(openingBed.gain, target * OPENING_BED_GAIN * musicScale, 0.15);
  }
}
export function musicVolume() { return musicScale; }

// One soundtrack at a time, whichever track it is. Asking for a different
// track than the one playing swaps it; asking for the same one just re-ramps,
// which is what makes this safe to call from a scene's enter() every time.
export function startSoundtrack({ track = 'title', gain = null, fade = 2.8, at = null, offset = 0 } = {}) {
  if (!ctx || !bus) return null;
  const url = STORY_AUDIO[track] || STORY_AUDIO.title;
  const level = gain == null ? trackGain(track) * musicScale : gain;
  const buf = buffers.get(url);
  if (!buf) {
    preload(url).then(() => startSoundtrack({ track, gain, fade, at, offset }));
    return null;
  }
  if (soundtrack && !soundtrack.stopping) {
    if (soundtrack.track === track) {
      setGain(soundtrack.gain, level, fade);
      return soundtrack;
    }
    fadeSoundtrack({ fade: Math.min(fade, 1.6) });
  }

  const now = ctx.currentTime;
  const startAt = Math.max(now, Number.isFinite(Number(at)) ? Number(at) : now);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, startAt);
  src.connect(g);
  g.connect(outBus('music'));
  try { src.start(startAt, Math.max(0, Number(offset) || 0)); } catch (_) { return null; }
  soundtrack = { src, gain: g, startedAt: startAt, stopping: false, track };
  setGainAt(g, level, startAt, fade);
  src.onended = () => {
    try { src.disconnect(); g.disconnect(); } catch (_) {}
    if (soundtrack?.src === src) soundtrack = null;
  };
  return soundtrack;
}


export function startOpeningSceneBed({ gain = OPENING_BED_GAIN, fade = 1.8 } = {}) {
  if (!ctx || !bus || openingBed) return openingBed;
  const url = STORY_AUDIO.openingBed;
  const buf = buffers.get(url);
  if (!buf) {
    preload(url).then(() => { if (!openingBed) startOpeningSceneBed({ gain, fade }); });
    preload(STORY_AUDIO.title);
    return null;
  }

  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = Math.min(OPENING_BED_LOOP_SECONDS, Math.max(0.25, buf.duration - 0.004));

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(45, now);
  hp.Q.setValueAtTime(0.55, now);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(16000, now);
  lp.Q.setValueAtTime(0.55, now);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  src.connect(hp);
  hp.connect(lp);
  lp.connect(g);
  g.connect(outBus('music'));

  try { src.start(now); } catch (_) {
    try { src.disconnect(); hp.disconnect(); lp.disconnect(); g.disconnect(); } catch (_) {}
    return null;
  }

  openingBed = {
    src,
    hp,
    lp,
    gain: g,
    startedAt: now,
    downbeatAt: now,
    stopping: false,
    target: { gain: 1, hpHz: 45, lpHz: 16000, q: 0.55 },
  };

  setGain(g, gain * musicScale, fade);
  preload(STORY_AUDIO.title);

  src.onended = () => {
    try { src.disconnect(); hp.disconnect(); lp.disconnect(); g.disconnect(); } catch (_) {}
    if (openingBed?.src === src) openingBed = null;
  };
  return openingBed;
}

export function setOpeningSceneBedProximity(profile = {}, { fade = 0.16 } = {}) {
  if (!ctx || !openingBed || openingBed.stopping) return false;
  const next = {
    gain: Math.max(0, Number(profile.gain) || 0),
    hpHz: Math.max(10, Number(profile.hpHz) || 45),
    lpHz: Math.max(100, Number(profile.lpHz) || 16000),
    q: Math.max(0.1, Number(profile.q) || 0.55),
  };
  openingBed.target = next;
  setGain(openingBed.gain, next.gain * OPENING_BED_GAIN * musicScale, fade);
  rampParam(openingBed.hp.frequency, next.hpHz, fade);
  rampParam(openingBed.lp.frequency, next.lpHz, fade);
  rampParam(openingBed.hp.Q, next.q, fade);
  rampParam(openingBed.lp.Q, next.q, fade);
  return true;
}

export function stopOpeningSceneBed({ fade = 0.2 } = {}) {
  if (!openingBed) return;
  const b = openingBed;
  openingBed = null;
  b.stopping = true;
  setGain(b.gain, 0, fade);
  globalThis.setTimeout?.(() => {
    try { b.src.stop(); } catch (_) {}
    for (const n of [b.src, b.hp, b.lp, b.gain]) {
      try { n.disconnect(); } catch (_) {}
    }
  }, Math.max(40, fade * 1000 + 80));
}

function hardStopOpeningSceneBedAt(at) {
  if (!ctx || !openingBed) return false;
  const b = openingBed;
  openingBed = null;
  b.stopping = true;
  const stopAt = Math.max(ctx.currentTime, Number.isFinite(Number(at)) ? Number(at) : ctx.currentTime);
  setGainAt(b.gain, 0, stopAt, 0.008);
  try { b.src.stop(stopAt + 0.012); } catch (_) {}
  globalThis.setTimeout?.(() => {
    for (const n of [b.src, b.hp, b.lp, b.gain]) {
      try { n.disconnect(); } catch (_) {}
    }
  }, Math.max(40, (stopAt - ctx.currentTime) * 1000 + 80));
  return true;
}

export function commitOpeningSceneBedToColdOpenTitle({ fade = 0.012 } = {}) {
  if (!ctx || !bus) {
    startSoundtrack({ track: 'title', fade: 0.04 });
    return { scheduled: false, at: 0, delaySeconds: 0, reason: 'no-context' };
  }

  const titleBuf = buffers.get(STORY_AUDIO.title);
  const missingOpeningBed = !openingBed || openingBed.stopping;
  if (missingOpeningBed || !titleBuf) {
    stopOpeningSceneBed({ fade: 0.04 });
    startSoundtrack({ track: 'title', fade: 0.04 });
    return {
      scheduled: false,
      at: ctx.currentTime,
      delaySeconds: 0,
      reason: missingOpeningBed ? 'no-opening-bed' : 'title-not-loaded',
    };
  }

  const at = nextOpeningBedDownbeatAt(ctx.currentTime, openingBed.downbeatAt);
  hardStopOpeningSceneBedAt(at);
  const title = startSoundtrack({ track: 'title', at, fade, offset: 0 });
  if (!title) {
    startSoundtrack({ track: 'title', fade: 0.04 });
    return { scheduled: false, at: ctx.currentTime, delaySeconds: 0, reason: 'title-start-failed' };
  }
  return { scheduled: true, at, delaySeconds: Math.max(0, at - ctx.currentTime), reason: 'scheduled' };
}

export function fadeSoundtrack({ fade = 7.0 } = {}) {
  if (!ctx || !soundtrack) return;
  const s = soundtrack;
  s.stopping = true;
  setGain(s.gain, 0, fade);
  window.setTimeout(() => {
    try { s.src.stop(); } catch (_) {}
    try { s.src.disconnect(); s.gain.disconnect(); } catch (_) {}
    if (soundtrack === s) soundtrack = null;
  }, Math.max(40, fade * 1000 + 80));
}

function ensureTyping() {
  if (!ctx || !bus) return null;
  if (typing) return typing;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(160, ctx.currentTime);
  hp.Q.setValueAtTime(0.45, ctx.currentTime);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(6200, ctx.currentTime);
  lp.Q.setValueAtTime(0.55, ctx.currentTime);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  hp.connect(lp);
  lp.connect(gain);
    gain.connect(outBus('dialog'));
  typing = { gain, hp, lp, active: false, timer: null, targetGain: 0.034 };
  return typing;
}

function typingSlice() {
  if (!ctx || !typing?.active) return;
  const buf = buffers.get(STORY_AUDIO.typing);
  if (!buf) { preload(STORY_AUDIO.typing); return; }

  const now = ctx.currentTime;
  const dur = Math.min(buf.duration * 0.8, 0.045 + Math.random() * 0.105);
  const startMax = Math.max(0, buf.duration - dur - 0.01);
  const offset = startMax > 0 ? Math.random() * startMax : 0;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.setValueAtTime(0.92 + Math.random() * 0.18, now);

  const env = ctx.createGain();
  const peak = 0.30 + Math.random() * 0.25;
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peak, now + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0006, now + dur);

  let out = env;
  let pan = null;
  if (ctx.createStereoPanner) {
    pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime((Math.random() * 2 - 1) * 0.16, now);
    env.connect(pan);
    out = pan;
  }
  src.connect(env);
  out.connect(typing.hp);
  try { src.start(now, offset, dur); src.stop(now + dur + 0.02); } catch (_) {}
  src.onended = () => {
    try { src.disconnect(); env.disconnect(); pan?.disconnect(); } catch (_) {}
  };
}

function scheduleTyping() {
  if (!typing?.active) { typing.timer = null; return; }
  typingSlice();
  const gap = 42 + Math.random() * 78 + (Math.random() < 0.18 ? 90 + Math.random() * 130 : 0);
  typing.timer = window.setTimeout(scheduleTyping, gap);
}

// Ride the song down under a voice and back up when the room is quiet. The
// soundtrack is a bed, and a bed gets out of the way.
export function duckSoundtrack(level = SOUNDTRACK_DUCK, fade = 0.4) {
  if (!soundtrack || soundtrack.stopping) return;
  setGain(soundtrack.gain, level, fade);
}
export function unduckSoundtrack(fade = 1.2) { duckSoundtrack(SOUNDTRACK_GAIN, fade); }

export function startTyping({ gain = TYPE_GAIN, fade = 0.06 } = {}) {
  if (!ctx || !bus) return;
  const t = ensureTyping();
  if (!t) return;
  t.targetGain = gain;
  if (!buffers.has(STORY_AUDIO.typing)) preload(STORY_AUDIO.typing);
  t.active = true;
  setGain(t.gain, gain, fade);
  if (!t.timer) scheduleTyping();
}

// For the headless suites and for the next time any of this goes quiet.
export function audioState() {
  return {
    ctx: ctx ? ctx.state : 'none',
    time: ctx ? +ctx.currentTime.toFixed(2) : 0,
    busIsCtxDest: !!ctx && bus === ctx.destination,
    song: soundtrack ? +soundtrack.gain.gain.value.toFixed(4) : null,
    songTrack: soundtrack?.track || null,
    songLoaded: buffers.has(STORY_AUDIO.title),
    creditsLoaded: buffers.has(STORY_AUDIO.credits),
    openingBed: openingBed
      ? {
          gain: +openingBed.gain.gain.value.toFixed(4),
          hpHz: +openingBed.hp.frequency.value.toFixed(1),
          lpHz: +openingBed.lp.frequency.value.toFixed(1),
          startedAt: +openingBed.startedAt.toFixed(2),
          downbeatAt: +openingBed.downbeatAt.toFixed(2),
          stopping: !!openingBed.stopping,
        }
      : null,
    openingBedLoaded: buffers.has(STORY_AUDIO.openingBed),
    booth: booth ? +booth.gain.gain.value.toFixed(4) : null,
    tape: +tapeHissGain().toFixed(4),
    tapeLoaded: buffers.has(STORY_AUDIO.tape),
    typing: typingState(),
  };
}

export function typingState() {
  return typing
    ? { active: typing.active, gain: typing.gain.gain.value, scheduled: !!typing.timer,
        loaded: buffers.has(STORY_AUDIO.typing) }
    : { active: false, gain: 0, scheduled: false, loaded: buffers.has(STORY_AUDIO.typing) };
}

export function stopTyping({ fade = 0.12 } = {}) {
  if (!typing) return;
  typing.active = false;
  if (typing.timer) {
    window.clearTimeout(typing.timer);
    typing.timer = null;
  }
  setGain(typing.gain, 0, fade);
}

// ── the booth, the rain, and the tape ───────────────────────────────────────
// The booth is a lit room at twenty to ten, recorded: an air handler, a street,
// a fluorescent tube. The rain is on the roof of it and on the skips out in the
// yard, and it stops when the service door does. The tape is what you hear
// INSTEAD of the booth when you press play on a file with no slate — the room
// goes away, and a smaller one closes around your head.
//
// Only the tape is synthesised, because tape hiss is the one sound in this game
// that has no room in it.

let booth = null;   // { nodes:[], gain }
let rainBed = null; // { nodes:[], gain, surfaceGains } — its own bed, see startRain
let rainSurfaceMix = { slate:0, glass:0, foliage:0, steel:0 };
let tape = null;

// One looping file, one gain, faded in. Returns null (and retries) if the
// buffer has not landed yet.
function loopFile(url, gain, fade, out) {
  const buf = buffers.get(url);
  if (!buf) { preload(url); return null; }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime);
  src.connect(g); g.connect(out);
  try { src.start(ctx.currentTime); } catch (_) { return null; }
  setGain(g, gain, fade);
  return { src, g };
}

// THE RAIN IS NOT THE GUARD'S BOOTH, AND IT USED TO BE.
//
// Both loops hung off one bed here, so the rain could only start when the lodge
// conversation started it and stopped when stopBoothTone tore that bed down —
// which is the moment the conversation ENDS. The player then walked a hundred
// metres of open yard, in visible rain, in silence, and went in through the grey
// door having heard weather only while standing still at a window.
//
// It has its own bed now. It starts when he is outdoors and it stops at the
// door, which is what the comment under stopRain always claimed.
export function startRain({ gain = RAIN_GAIN, fade = 2.4 } = {}) {
  if (!ctx || !bus || rainBed) return;
  if (!buffers.has(STORY_AUDIO.rain)) {
    preload(STORY_AUDIO.rain).then(() => { if (!rainBed) startRain({ gain, fade }); });
    return;
  }
  const out = ctx.createGain();
  out.gain.setValueAtTime(1, ctx.currentTime);
  out.connect(outBus('sfx'));
  const nodes = [out];
  const rain = loopFile(STORY_AUDIO.rain, gain, fade, out);
  const surfaceGains={};
  if (rain) {
    nodes.push(rain.src, rain.g);
    // Four quiet resonances from the same world-space recording: slate's soft
    // body, glass hiss, foliage patter and steel ping. They follow the material
    // around the listener and vanish with the same door fade as the base bed.
    const surfaces={
      slate:{type:'bandpass',frequency:980,Q:.65,max:.095},
      glass:{type:'highpass',frequency:3600,Q:.45,max:.060},
      foliage:{type:'lowpass',frequency:1450,Q:.50,max:.070},
      steel:{type:'bandpass',frequency:2700,Q:1.8,max:.050},
    };
    for(const [id,spec] of Object.entries(surfaces)){
      const filter=ctx.createBiquadFilter(),surface=ctx.createGain();
      filter.type=spec.type;filter.frequency.value=spec.frequency;filter.Q.value=spec.Q;
      surface.gain.value=0;
      rain.g.connect(filter);filter.connect(surface);surface.connect(out);
      surfaceGains[id]={gain:surface,max:spec.max};nodes.push(filter,surface);
    }
  }
  rainBed = { nodes, gain: out, surfaceGains };
  setRainSurfaceMix(rainSurfaceMix,{fade,force:true});
}

export function setRainSurfaceMix(mix={}, {fade=.35,force=false}={}){
  const next={};
  for(const id of['slate','glass','foliage','steel'])next[id]=Math.max(0,Math.min(1,Number(mix[id])||0));
  const changed=Object.keys(next).some((id)=>Math.abs(next[id]-rainSurfaceMix[id])>.015);
  rainSurfaceMix=next;
  if(!rainBed||(!changed&&!force))return;
  for(const [id,surface] of Object.entries(rainBed.surfaceGains||{}))setGain(surface.gain,next[id]*surface.max,fade);
}

export function startBoothTone({ gain = BOOTH_GAIN, fade = 1.6 } = {}) {
  // The weather does not belong to the booth, but a man at the window is
  // certainly standing in it.
  startRain({ fade });
  if (!ctx || !bus || booth) return;
  if (!buffers.has(STORY_AUDIO.booth)) {
    // The scene starts before the mp3s land. Come back when they have.
    preload(STORY_AUDIO.booth).then(() => { if (!booth) startBoothTone({ gain, fade }); });
    return;
  }
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(1, now);
    out.connect(outBus('sfx'));

  const nodes = [out];
  const room = loopFile(STORY_AUDIO.booth, gain, fade, out);
  if (room) nodes.push(room.src, room.g);

  booth = { nodes, gain: out };
}

// The rain stops at the door, because he is the one who went inside.
export function stopRain({ fade = 0.5 } = {}) {
  if (!rainBed) return;
  const b = rainBed; rainBed = null;
  setGain(b.gain, 0, fade);
  window.setTimeout(() => {
    for (const n of b.nodes) { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
  }, Math.ceil(fade * 1000) + 120);
}

export function stopBoothTone({ fade = 1.2 } = {}) {
  if (!booth) return;
  const b = booth; booth = null;
  setGain(b.gain, 0, fade);
  window.setTimeout(() => {
    for (const n of b.nodes) { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
  }, Math.max(60, fade * 1000 + 80));
}

// A real tape file loops with a click: the sample at the end does not match the
// sample at the start, and once per loop that discontinuity reads as a little
// terrace of silence-then-hiss. So we bake a genuinely seamless version once —
// the file's tail cross-faded (equal power) back over its head — and loop that.
// The result is continuous hiss with no seam, which is what a real machine
// idling actually sounds like. Cached per source buffer.
const seamless = new Map();
function seamlessLoop(buf) {
  if (seamless.has(buf)) return seamless.get(buf);
  const sr = buf.sampleRate;
  const X = Math.min(Math.floor(sr * 0.30), Math.floor(buf.length * 0.25));   // crossfade length
  if (X < 32) { seamless.set(buf, buf); return buf; }                         // too short to bother
  const L = buf.length - X;                                                   // looped length
  const out = ctx.createBuffer(buf.numberOfChannels, L, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c);
    const dst = out.getChannelData(c);
    for (let i = 0; i < L; i++) dst[i] = src[i];
    for (let i = 0; i < X; i++) {
      const th = (i / X) * (Math.PI / 2);
      dst[i] = src[i] * Math.sin(th) + src[L + i] * Math.cos(th);            // head fades in over the tail
    }
  }
  seamless.set(buf, out);
  return out;
}

// Ducks whatever else is playing and puts a small room around your head. This
// is a real machine running, not synthesised hiss: it is the sound the file has
// under it, and it is the sound that comes back the instant a rewind stops.
export function startTapeHiss({ gain = TAPE_GAIN, fade = 0.5 } = {}) {
  if (!ctx || !bus || tape) return;
  const raw = buffers.get(STORY_AUDIO.tape);
  if (!raw) { preload(STORY_AUDIO.tape).then(() => { if (!tape) startTapeHiss({ gain, fade }); }); return; }
  const buf = seamlessLoop(raw);
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(90, now);
  hp.Q.setValueAtTime(0.45, now);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(9200, now);
  lp.Q.setValueAtTime(0.52, now);
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '2x';
  shaper.curve = tapeDriveCurve(0);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, now);
    src.connect(hp); hp.connect(lp); lp.connect(shaper); shaper.connect(g); g.connect(outBus('sfx'));
  try { src.start(now); } catch (_) { return; }
  tape = { nodes: [src, hp, lp, shaper, g], gain: g, hp, lp, shaper, driveBucket: 0 };
  setGain(g, gain, fade);
  if (booth) setGain(booth.gain, 0.16, fade);       // the room recedes
}

function tapeDriveCurve(intensity = 0) {
  const p = Math.max(0, Math.min(1, Number(intensity) || 0));
  const amount = 0.6 + p * 4.4;
  const n = 512;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

// Ride the hiss live. A take is forty-five seconds of nothing that gets louder,
// because the longer you hold still in a dead room the more the room is all
// there is, and the hiss is the sound of the tape agreeing with you.
export function setTapeHiss(gain, ramp = 0.25) {
  if (tape) setGain(tape.gain, Math.max(0, gain), ramp);
}
export function setTapeHissPressure(intensity, { min = 0.10, max = 0.60, ramp = 0.25 } = {}) {
  if (!tape || !ctx) return;
  const p = Math.max(0, Math.min(1, Number(intensity) || 0));
  const eased = p * p * (3 - 2 * p);
  setGain(tape.gain, min + (max - min) * eased, ramp);
  const now = ctx.currentTime;
  tape.hp.frequency.cancelScheduledValues(now);
  tape.lp.frequency.cancelScheduledValues(now);
  tape.lp.Q.cancelScheduledValues(now);
  tape.hp.frequency.setValueAtTime(tape.hp.frequency.value, now);
  tape.lp.frequency.setValueAtTime(tape.lp.frequency.value, now);
  tape.lp.Q.setValueAtTime(tape.lp.Q.value, now);
  tape.hp.frequency.linearRampToValueAtTime(90 + eased * 1320, now + Math.max(0.02, ramp));
  tape.lp.frequency.linearRampToValueAtTime(9200 - eased * 5200, now + Math.max(0.02, ramp));
  tape.lp.Q.linearRampToValueAtTime(0.52 + eased * 2.4, now + Math.max(0.02, ramp));
  const bucket = Math.round(eased * 16);
  if (bucket !== tape.driveBucket) {
    tape.driveBucket = bucket;
    tape.shaper.curve = tapeDriveCurve(bucket / 16);
  }
}
export function tapeHissGain() { return tape ? tape.gain.gain.value : 0; }

export function stopTapeHiss({ fade = 0.6 } = {}) {
  if (!tape) return;
  const t = tape; tape = null;
  setGain(t.gain, 0, fade);
  if (booth) setGain(booth.gain, 1, fade);          // and comes back
  window.setTimeout(() => {
    for (const n of t.nodes) { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
  }, Math.max(60, fade * 1000 + 80));
}

// The two clicks of choosing. Not cues: they are UI, and UI should be felt
// rather than heard.
export function click({ freq = 1800, gain = 0.05, dur = 0.018, destination = 'sfx' } = {}) {
  if (!ctx || !bus) return;
  const now = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
    o.connect(g); g.connect(outBus(destination));
  o.start(now); o.stop(now + dur + 0.01);
  o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
}
export const tick = () => click({ freq: 2100, gain: 0.035, dur: 0.012 });
export const confirm = () => { click({ freq: 900, gain: 0.055, dur: 0.03 }); click({ freq: 1400, gain: 0.03, dur: 0.02 }); };

// The menus are a tape machine at idle, not a silent overlay. A filtered noise
// loop supplies the constant transport hiss; selection and confirmation are
// short, mechanical head/relay sounds rather than arcade bleeps.
export function startMenuHiss(){
  if(!ctx||!bus||menuHiss)return;
  const length=Math.max(1,Math.floor(ctx.sampleRate*1.5)),buf=ctx.createBuffer(1,length,ctx.sampleRate),d=buf.getChannelData(0);
  let brown=0;for(let i=0;i<length;i++){brown=(brown*.985)+(Math.random()*2-1)*.06;d[i]=(Math.random()*2-1)*.34+brown*.22;}
  const src=ctx.createBufferSource(),hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=buf;src.loop=true;hp.type='highpass';hp.frequency.value=900;lp.type='lowpass';lp.frequency.value=7800;g.gain.value=.018;
    src.connect(hp);hp.connect(lp);lp.connect(g);g.connect(outBus('menu'));src.start();menuHiss={src,hp,lp,g};
}
export function stopMenuHiss(){
  if(!menuHiss)return;const m=menuHiss;menuHiss=null;setGain(m.g,0,.12);
  globalThis.setTimeout?.(()=>{try{m.src.stop();}catch(_){}for(const n of [m.src,m.hp,m.lp,m.g])try{n.disconnect();}catch(_){}},180);
}
export function menuMove(){click({freq:640,gain:.04,dur:.022,destination:'menu'});click({freq:1120,gain:.018,dur:.011,destination:'menu'});}
export function menuConfirm(){click({freq:380,gain:.055,dur:.045,destination:'menu'});globalThis.setTimeout?.(()=>click({freq:760,gain:.025,dur:.025,destination:'menu'}),32);}

export function stopAll() {
  stopTyping({ fade: 0.04 });
  stopTapeHiss({ fade: 0.2 });
  stopOpeningSceneBed({ fade: 0.2 });
  stopBoothTone({ fade: 0.4 });
  stopRain({ fade: 0.4 });
  fadeSoundtrack({ fade: 0.5 });
  stopMenuHiss();
}
