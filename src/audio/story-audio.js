// Story-only beds.
//
// Cues are loud by design. These are not cues: the title song is a low bed
// under the existing sound world, and the typing sound is a granular texture
// that is active only while text is actually being revealed.

export const STORY_AUDIO = {
  title: '/labs/chunk-surfer/audio/title_song.mp3',
  typing: '/labs/chunk-surfer/audio/typing.mp3',
  booth: '/labs/chunk-surfer/audio/outside_room_tone.mp3',
  rain: '/labs/chunk-surfer/audio/rain.mp3',
  // Tape hiss and the transport running, recorded off a real machine. It plays
  // under the cryptic take, and it is what you hear immediately after a rewind.
  tape: '/labs/chunk-surfer/audio/tape_play.mp3',
};

// THE MIX, top to bottom. Decided in one place, and never again:
//
//   0.95   the radio, breaking             (the loudest thing that happens)
//   0.95   the service door
//   0.55   TYPE_GAIN — the typewriter      (a mind, at work)
//   0.26   a voice                         (sam-voice.js)
//   0.62-0.85  the foley                   (audio/cues.js — pens, keys, signature)
//   0.16   the title song                  (SOUNDTRACK_GAIN)
//   0.085  the title song, while anyone speaks   (SOUNDTRACK_DUCK)
//   0.075  the booth
//   0.060  the rain on the roof of it
//   0.010  room tone                       (the floor of an empty room)
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
    const qp = new URLSearchParams(globalThis.location?.search || '');
    if (!qp.has(name)) return fallback;
    const v = Number(qp.get(name));
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  } catch (_) { return fallback; }
}

export const TYPE_GAIN = queryGain('typegain', 0.55);
export const TYPE_LEVEL = { thought: 1.0, direction: 1.15 };   // narration types harder
// The song is the piece. It is not background: it carries the booth and it
// carries the title, and it is the last thing the player hears before the door.
export const SOUNDTRACK_GAIN = queryGain('songgain', 0.42);
export const SOUNDTRACK_DUCK = SOUNDTRACK_GAIN * 0.55;         // audible, out of the way
export const BOOTH_GAIN = 0.075;
export const RAIN_GAIN = 0.060;
export const TAPE_GAIN = queryGain('tapegain', 0.46);

let ctx = null;
let bus = null;
let audioBuses = { dialog: null, sfx: null, music: null, menu: null };
const buffers = new Map();
const pending = new Map();

let soundtrack = null; // { src, gain, startedAt, stopping }
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
  return Promise.all(Object.values(STORY_AUDIO).map(preload));
}

function setGain(gainNode, value, rampSec = 0.5) {
  if (!ctx || !gainNode) return;
  const now = ctx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(Math.max(0, value), now + Math.max(0.02, rampSec));
}

// The player's music level, a scalar over SOUNDTRACK_GAIN. 1 is the mix as
// authored; 0 is silence. Rides the live soundtrack when changed.
let musicScale = 1;
export function setMusicVolume(v) {
  musicScale = Math.max(0, Math.min(1, Number(v)));
  if (soundtrack && !soundtrack.stopping) setGain(soundtrack.gain, SOUNDTRACK_GAIN * musicScale, 0.15);
}
export function musicVolume() { return musicScale; }

export function startSoundtrack({ gain = SOUNDTRACK_GAIN * musicScale, fade = 2.8 } = {}) {
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
    g.connect(outBus('music'));
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
    songLoaded: buffers.has(STORY_AUDIO.title),
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

export function startBoothTone({ gain = BOOTH_GAIN, fade = 1.6 } = {}) {
  if (!ctx || !bus || booth) return;
  if (!buffers.has(STORY_AUDIO.booth) || !buffers.has(STORY_AUDIO.rain)) {
    // The scene starts before the mp3s land. Come back when they have.
    Promise.all([preload(STORY_AUDIO.booth), preload(STORY_AUDIO.rain)])
      .then(() => { if (!booth) startBoothTone({ gain, fade }); });
    return;
  }
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(1, now);
    out.connect(outBus('sfx'));
    
  const nodes = [out];
  const room = loopFile(STORY_AUDIO.booth, gain, fade, out);
  const rain = loopFile(STORY_AUDIO.rain, RAIN_GAIN, fade, out);
  if (room) nodes.push(room.src, room.g);
  if (rain) nodes.push(rain.src, rain.g);

  booth = { nodes, gain: out, rain: rain?.g || null };
}

// The rain stops at the door, and it stops before the booth does, because he
// is the one who went inside.
export function stopRain({ fade = 0.5 } = {}) {
  if (booth?.rain) setGain(booth.rain, 0, fade);
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
  const g = ctx.createGain(); g.gain.setValueAtTime(0, now);
    src.connect(g); g.connect(outBus('sfx'));
  try { src.start(now); } catch (_) { return; }
  tape = { nodes: [src, g], gain: g };
  setGain(g, gain, fade);
  if (booth) setGain(booth.gain, 0.16, fade);       // the room recedes
}

// Ride the hiss live. A take is forty-five seconds of nothing that gets louder,
// because the longer you hold still in a dead room the more the room is all
// there is, and the hiss is the sound of the tape agreeing with you.
export function setTapeHiss(gain, ramp = 0.25) {
  if (tape) setGain(tape.gain, Math.max(0, gain), ramp);
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
  stopBoothTone({ fade: 0.4 });
  fadeSoundtrack({ fade: 0.5 });
  stopMenuHiss();
}
