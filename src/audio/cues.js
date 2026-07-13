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

export function preloadAll(urls) {
  return Promise.all(urls.flat().map(preload));
}
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

// A cue is a sound that a LINE makes. Most of these are named after the line
// they belong to, and the name is the contract: `data/conservatory-script.js`
// carries `cue: 'pens'` on the line about the pens, and the conversation
// machine fires it. Nothing else decides when a pen is heard.
const A = '/labs/chunk-surfer/audio/';
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

export function playPageTurn({ dir = 1 } = {}) {
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
    gain: 0.16 + Math.random() * 0.06,
    rate: (forward ? 0.98 : 0.94) + Math.random() * 0.08,
    pan: (Math.random() * 2 - 1) * 0.10,
  });
}
