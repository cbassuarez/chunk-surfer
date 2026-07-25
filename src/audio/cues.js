import { assetUrl } from '../platform/paths.js';
// One-shot cue bus.
//
// The engine only ever knew how to loop voices. A game needs sounds that
// happen once and are gone: a switch, a machine starting, and — later — the
// stabs the dread director fires into a silence the player has learned to
// trust.
//
// Cues are decoded once and cached. They are deliberately routed BEFORE the
// master compressor's proximity ducking so a switch is always exactly as loud
// as a switch, no matter what the room is doing.

let ctx = null, bus = null;
const buffers = new Map();      // url -> AudioBuffer
const pending = new Map();      // url -> Promise

// Some cues belong to a moment rather than to themselves. A battle stem is the
// adversary striking on THIS beat: when the beat is over, so is the sound, and
// when the fight is over the room must be silent — a stem that outlives its
// turn is the surfer still playing at a fight nobody is having. Naming a group
// on the way in is how a caller earns the right to cut it off.
const groups = new Map();       // name -> Set of { src, gain }
// Every live one-shot, grouped or not. A run that ends has to be able to leave
// the room silent: a thirty-second stem, a scream, a page turn still decaying —
// none of them belong to the next run, and several of them are long enough to
// still be going when it starts.
const live = new Set();

function joinGroup(name, voice) {
  live.add(voice);
  if (!name) return;
  if (!groups.has(name)) groups.set(name, new Set());
  groups.get(name).add(voice);
}

function leaveGroup(name, voice) {
  live.delete(voice);
  const set = name && groups.get(name);
  if (!set) return;
  set.delete(voice);
  if (!set.size) groups.delete(name);
}

function silence(voice, fade, now) {
  try {
    if (fade > 0 && voice.gain) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      voice.src.stop(now + fade + 0.02);
    } else {
      voice.src.stop();
    }
  } catch (_) { /* already ended */ }
}

// Everything, gone. Called when a run ends or restarts.
export function stopAllCues(fade = 0.08) {
  const now = ctx ? ctx.currentTime : 0;
  const count = live.size;
  for (const voice of [...live]) silence(voice, fade, now);
  live.clear();
  groups.clear();
  return count;
}

export function liveCueCount() { return live.size; }

// Fade the group out and drop it. Silent no-op for a group nobody joined.
export function stopCueGroup(name, fade = 0.12) {
  const set = groups.get(name);
  if (!set) return 0;
  const now = ctx ? ctx.currentTime : 0;
  let stopped = 0;
  for (const voice of [...set]) {
    stopped += 1;
    silence(voice, fade, now);
    set.delete(voice);
    live.delete(voice);
  }
  groups.delete(name);
  return stopped;
}

export function cueGroupSize(name) { return groups.get(name)?.size || 0; }

export function cuesInit(audioCtx, destination) {
  ctx = audioCtx; bus = destination;
}

export async function preload(url) {
  if (!ctx) return null;
  if (buffers.has(url)) return buffers.get(url);
  if (pending.has(url)) return pending.get(url);
  const job = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.arrayBuffer(); })
    .then((ab) => ctx.decodeAudioData(ab))
    .then((buf) => { buffers.set(url, buf); pending.delete(url); return buf; })
    .catch((err) => { console.warn('cue load failed', url, err); pending.delete(url); return null; });
  pending.set(url, job);
  return job;
}

export function preloadAll(urls) {
  return Promise.all(urls.flat().map(preload));
}
// gain: linear. rate: playbackRate (a tired switch is a slower switch).
// pan: -1..1. Returns the source, so a caller can stop a long cue early.
export function playCue(url, { gain = 1, rate = 1, pan = 0, delay = 0,
  trimStart = 0, trimEnd = null, fadeIn = 0, fadeOut = 0, loop = false, group = null,
  lowpassHz = null, sliceSeconds = null, wrapStart = false } = {}) {
  if (!ctx || !bus) return null;
  const buf = buffers.get(url);
  if (!buf) { preload(url); return null; }   // first press may be silent; warm it
  const now = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.setValueAtTime(rate, now);
  const g = ctx.createGain();
  const targetGain = Math.max(0, gain);
  g.gain.setValueAtTime(fadeIn > 0 ? 0 : targetGain, now);
  if (fadeIn > 0) g.gain.linearRampToValueAtTime(targetGain, now + fadeIn);
  let node = g;
  const chain = [src, g];
  // Distance and wall, in one knob: a thing heard from another room has no top
  // end. Placed after the gain so a fade still fades the filtered signal.
  if (lowpassHz && ctx.createBiquadFilter) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.max(120, lowpassHz), now);
    node.connect(lp); node = lp; chain.push(lp);
  }
  if (pan !== 0 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
    node.connect(p); node = p; chain.push(p);
  }
  src.connect(g);
  node.connect(bus);
  // A chop: `wrapStart` walks an offset around a long take instead of running
  // off the end of it, and `sliceSeconds` says how much of it to bite out. This
  // is how a minute-long performance becomes a one-shot the length of a beat.
  const rawStart = Number(trimStart) || 0;
  const start = wrapStart && buf.duration > 0
    ? ((rawStart % buf.duration) + buf.duration) % buf.duration
    : Math.max(0, Math.min(buf.duration, rawStart));
  const remaining = buf.duration - start;
  const duration = sliceSeconds != null
    ? Math.max(0, Math.min(remaining, Number(sliceSeconds) || 0))
    : Math.max(0, Math.min(remaining, trimEnd == null ? remaining : Number(trimEnd) - start));
  src.loop = !!loop;
  if (loop) {
    src.loopStart = start;
    src.loopEnd = trimEnd == null ? buf.duration : Math.max(start, Math.min(buf.duration, Number(trimEnd)));
    src.start(now, start);
  } else {
    if (fadeOut > 0 && duration > fadeOut) {
      g.gain.setValueAtTime(targetGain, now + duration - fadeOut);
      g.gain.linearRampToValueAtTime(0, now + duration);
    }
    src.start(now, start, duration);
  }
  const voice = { src, gain: g };
  joinGroup(group, voice);
  src.onended = () => {
    leaveGroup(group, voice);
    for (const n of chain) { try { n.disconnect(); } catch (_) {} }
  };
  return src;
}

export function isLoaded(url) { return buffers.has(url); }
export function bufferSeconds(url) { return buffers.get(url)?.duration ?? null; }

// A managed looping voice: it owns its own gain node so the caller can drop it on
// a scheduled downbeat (`when`) and fade it out on stop. Returns a handle, or null
// if the buffer is not warm yet. Used for the surfer's grid-locked backing (the
// breakbeat needle dropped under a whole movement — see startCombatBacking).
export function playCueLoop(url, { gain = 1, rate = 1, pan = 0, when = null, fadeIn = 0.05 } = {}) {
  if (!ctx || !bus) return null;
  const buf = buffers.get(url);
  if (!buf) { preload(url); return null; }
  const startAt = Math.max(ctx.currentTime, Number(when) || ctx.currentTime);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true; src.loopStart = 0; src.loopEnd = buf.duration;
  src.playbackRate.setValueAtTime(rate, startAt);
  const g = ctx.createGain();
  const target = Math.max(0, gain);
  g.gain.setValueAtTime(fadeIn > 0 ? 0 : target, startAt);
  if (fadeIn > 0) g.gain.linearRampToValueAtTime(target, startAt + fadeIn);
  let node = g;
  if (pan !== 0 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startAt);
    g.connect(p); node = p;
  }
  src.connect(g); node.connect(bus);
  src.start(startAt);
  src.onended = () => { try { src.disconnect(); g.disconnect(); node.disconnect(); } catch (_) {} };
  let stopped = false;
  return {
    stop(fade = 0.3) {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime, f = Math.max(0.01, Number(fade) || 0.01);
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0.0001, t + f);
        src.stop(t + f + 0.02);
      } catch (_) { try { src.stop(); } catch (_) {} }
    },
  };
}

// A cue is a sound that a LINE makes. Most of these are named after the line
// they belong to, and the name is the contract: `data/conservatory-script.js`
// carries `cue: 'pens'` on the line about the pens, and the conversation
// machine fires it. Nothing else decides when a pen is heard.
const A = assetUrl('audio/game/');
export const CUE = {
  light: `${A}light.mp3`,
  recorder: `${A}recorder.mp3`,
  door: `${A}door_close.mp3`,
  bag: `${A}bag_rummage.mp3`,

  pens: `${A}pens.mp3`,                       // "He finds a pen. It doesn't work."
  signature: `${A}signature.mp3`,             // "You sign the first box."
  slides: `${A}slides_keys_and_radio.mp3`,    // keys, a radio, and the form back
  keyturn: `${A}the_key_turns.mp3`,           // the grey door, from the yard
  keys: `${A}keys.mp3`,                       // the keyring, on a door, in the dark
  kit: `${A}torch-recorder-headphones-radio-keys-the-order.mp3`,
  rewind: `${A}tape_rewind.mp3`,              // "Back forty seconds."

  // The loudest authored moment in the game. It is not a jump scare: it arrives
  // at the end of eight seconds of a man realising what is on the other end.
  scream: `${A}radio_breaks-scream.mp3`,
};
export const PAGE_TURNS = Object.freeze([
  `${A}pageturn.mp3`,
  `${A}pageturn1.mp3`,
  `${A}pageturn2.mp3`,
  `${A}pageturn3.mp3`,
  `${A}pageturn4.mp3`,
  `${A}pageturn5.mp3`,
]);

let lastPageTurn = -1;
let lastPageTurnAt = 0;

export function playPageTurn({ dir = 1, gain = null, pan = null } = {}) {
  const now = (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now();

  // Prevent key-repeat from stacking six 2.8s paper sounds into a wash.
  if (now - lastPageTurnAt < 85) return null;
  lastPageTurnAt = now;

  let i = Math.floor(Math.random() * PAGE_TURNS.length);
  if (PAGE_TURNS.length > 1 && i === lastPageTurn) {
    i = (i + 1 + Math.floor(Math.random() * (PAGE_TURNS.length - 1))) % PAGE_TURNS.length;
  }
  lastPageTurn = i;

  const forward = dir >= 0;
  return playCue(PAGE_TURNS[i], {
    gain: gain == null ? 0.16 + Math.random() * 0.06 : Math.max(0,Number(gain)||0),
    rate: (forward ? 0.98 : 0.94) + Math.random() * 0.08,
    pan: pan == null ? (Math.random() * 2 - 1) * 0.10 : Math.max(-1,Math.min(1,Number(pan)||0)),
  });
}
