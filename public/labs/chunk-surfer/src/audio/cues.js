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

export function preloadAll(urls) { return Promise.all(urls.map(preload)); }

// gain: linear. rate: playbackRate (a tired switch is a slower switch).
// pan: -1..1. Returns the source, so a caller can stop a long cue early.
export function playCue(url, { gain = 1, rate = 1, pan = 0, delay = 0 } = {}) {
  if (!ctx || !bus) return null;
  const buf = buffers.get(url);
  if (!buf) { preload(url); return null; }   // first press may be silent; warm it
  const now = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.setValueAtTime(rate, now);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, now);
  let node = g;
  if (pan !== 0 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
    g.connect(p); node = p;
  }
  src.connect(g);
  node.connect(bus);
  src.start(now);
  src.onended = () => { try { src.disconnect(); g.disconnect(); node.disconnect(); } catch (_) {} };
  return src;
}

export function isLoaded(url) { return buffers.has(url); }

export const CUE = {
  light: '/labs/chunk-surfer/audio/light.mp3',
  recorder: '/labs/chunk-surfer/audio/recorder.mp3',
};
