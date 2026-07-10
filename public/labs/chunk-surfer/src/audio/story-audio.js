// Story-only beds.
//
// Cues are loud by design. These are not cues: the title song is a low bed
// under the existing sound world, and the typing sound is a granular texture
// that is active only while text is actually being revealed.

export const STORY_AUDIO = {
  title: '/labs/chunk-surfer/audio/title_song.mp3',
  typing: '/labs/chunk-surfer/audio/typing.mp3',
};

// The mix, top to bottom, so this is decided in one place and never again:
//
//   0.95   the service door                (the loudest thing that happens)
//   0.26   a voice                         (sam-voice.js)
//   0.18   TYPE_GAIN — the typewriter      (a mind, at work)
//   0.105  the title song                  (SOUNDTRACK_GAIN)
//   0.055  the booth
//   0.010  room tone                       (the floor of an empty room)
//
// Each typing slice peaks around 0.3 into this bus, so TYPE_GAIN is the height
// of the loudest keystroke. It sat at 0.034 for a while, which put the whole
// typewriter thirty decibels under the song and made it look broken.
export const TYPE_GAIN = 0.18;
export const TYPE_LEVEL = { thought: 1.0, direction: 1.15 };   // narration types harder
export const SOUNDTRACK_GAIN = 0.105;
export const SOUNDTRACK_DUCK = 0.045;                          // while anyone speaks

let ctx = null;
let bus = null;
const buffers = new Map();
const pending = new Map();

let soundtrack = null; // { src, gain, startedAt, stopping }
let typing = null;     // { gain, hp, lp, active, timer, targetGain }

export function storyAudioInit(audioCtx, destination) {
  ctx = audioCtx;
  bus = destination;
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
  return Promise.all(Object.values(STORY_AUDIO).map(preload));
}

function setGain(gainNode, value, rampSec = 0.5) {
  if (!ctx || !gainNode) return;
  const now = ctx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(Math.max(0, value), now + Math.max(0.02, rampSec));
}

export function startSoundtrack({ gain = SOUNDTRACK_GAIN, fade = 2.8 } = {}) {
  if (!ctx || !bus) return null;
  const buf = buffers.get(STORY_AUDIO.title);
  if (!buf) { preload(STORY_AUDIO.title).then(() => startSoundtrack({ gain, fade })); return null; }
  if (soundtrack && !soundtrack.stopping) {
    setGain(soundtrack.gain, gain, fade);
    return soundtrack;
  }

  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  src.connect(g);
  g.connect(bus);
  try { src.start(now); } catch (_) { return null; }
  soundtrack = { src, gain: g, startedAt: now, stopping: false };
  setGain(g, gain, fade);
  src.onended = () => {
    try { src.disconnect(); g.disconnect(); } catch (_) {}
    if (soundtrack?.src === src) soundtrack = null;
  };
  return soundtrack;
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
  gain.connect(bus);
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
  const peak = 0.20 + Math.random() * 0.16;
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

export function stopTyping({ fade = 0.12 } = {}) {
  if (!typing) return;
  typing.active = false;
  if (typing.timer) {
    window.clearTimeout(typing.timer);
    typing.timer = null;
  }
  setGain(typing.gain, 0, fade);
}

// ── the booth, and the tape ─────────────────────────────────────────────────
// Two beds the cold open owns. The booth is a lit room at one in the morning:
// a fluorescent tube, a fridge somewhere, the street. The tape is what you
// hear instead of the booth when you press play on a file with no slate — the
// room goes away, and a different, smaller room is around your head.
//
// Both are synthesised. They cost nothing and they are exactly as long as the
// scene that needs them.

let booth = null;   // { nodes:[], gain }
let tape = null;

function noiseLoop(seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.0;
  }
  return buf;
}

export function startBoothTone({ gain = 0.055, fade = 1.6 } = {}) {
  if (!ctx || !bus || booth) return;
  const now = ctx.currentTime;
  const nodes = [];
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, now);
  out.connect(bus);
  nodes.push(out);

  // the room: low, brown, unremarkable
  const air = ctx.createBufferSource();
  air.buffer = noiseLoop(3); air.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
  const ag = ctx.createGain(); ag.gain.value = 0.9;
  air.connect(lp); lp.connect(ag); ag.connect(out);
  try { air.start(now); } catch (_) {}
  nodes.push(air, lp, ag);

  // the tube: a hum with its own third harmonic, because tubes are not sine waves
  for (const [f, g] of [[100, 0.020], [300, 0.008], [500, 0.003]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const og = ctx.createGain(); og.gain.value = g;
    o.connect(og); og.connect(out);
    try { o.start(now); } catch (_) {}
    nodes.push(o, og);
  }

  booth = { nodes, gain: out };
  setGain(out, gain, fade);
}

export function stopBoothTone({ fade = 1.2 } = {}) {
  if (!booth) return;
  const b = booth; booth = null;
  setGain(b.gain, 0, fade);
  window.setTimeout(() => {
    for (const n of b.nodes) { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
  }, Math.max(60, fade * 1000 + 80));
}

// Ducks whatever else is playing and puts a small room around your head.
export function startTapeHiss({ gain = 0.030, fade = 0.5 } = {}) {
  if (!ctx || !bus || tape) return;
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseLoop(2); src.loop = true;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, now);
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(bus);
  try { src.start(now); } catch (_) { return; }
  tape = { nodes: [src, hp, lp, g], gain: g };
  setGain(g, gain, fade);
  if (booth) setGain(booth.gain, 0.010, fade);      // the room recedes
}

export function stopTapeHiss({ fade = 0.6 } = {}) {
  if (!tape) return;
  const t = tape; tape = null;
  setGain(t.gain, 0, fade);
  if (booth) setGain(booth.gain, 0.055, fade);      // and comes back
  window.setTimeout(() => {
    for (const n of t.nodes) { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
  }, Math.max(60, fade * 1000 + 80));
}

// The two clicks of choosing. Not cues: they are UI, and UI should be felt
// rather than heard.
export function click({ freq = 1800, gain = 0.05, dur = 0.018 } = {}) {
  if (!ctx || !bus) return;
  const now = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
  o.connect(g); g.connect(bus);
  o.start(now); o.stop(now + dur + 0.01);
  o.onended = () => { try { o.disconnect(); g.disconnect(); } catch (_) {} };
}
export const tick = () => click({ freq: 2100, gain: 0.035, dur: 0.012 });
export const confirm = () => { click({ freq: 900, gain: 0.055, dur: 0.03 }); click({ freq: 1400, gain: 0.03, dur: 0.02 }); };

export function stopAll() {
  stopTyping({ fade: 0.04 });
  stopTapeHiss({ fade: 0.2 });
  stopBoothTone({ fade: 0.4 });
  fadeSoundtrack({ fade: 0.5 });
}
