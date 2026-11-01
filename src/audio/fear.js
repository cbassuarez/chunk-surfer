import { assetUrl } from '../platform/paths.js';
import { createContactExposurePlayer } from './contact-exposure.js';
import { createHeartbeatPlayer } from './heartbeat.js';
// Fear uses complete recorded slow/fast pairs. The audio worklet owns timing;
// the recorded timbre stays at its natural pitch and exposes the heard envelope
// to the visual pulse. Source's presentation reducer still owns withdrawal.
//
// The hush stinger is ONE short file, varied procedurally every time: panned
// somewhere you are not looking, pitched a little, and sometimes played
// backwards. A sound you have heard before is a sound you can dismiss, so it is
// never twice the same sound.

const FILES = {
  hush: assetUrl('audio/game/hush.mp3'),
};

let ctx = null, bus = null;
const buffers = new Map();          // url → AudioBuffer
const pendingLoads = new Map();     // one in-flight decode per current context/url
let hushRev = null;                 // the hush, backwards (built once)
const heartbeat = createHeartbeatPlayer();
let generation = 0;
const contactExposure = createContactExposurePlayer({
  getContext: () => ctx,
  getDestination: () => bus,
  getBuffer: () => buffers.get(FILES.hush),
  loadBuffer: () => load(FILES.hush),
});

export function fearAudioInit(audioCtx, destination, { heartbeatDestination = destination } = {}) {
  contactExposure.cancel({ fade: 0 });
  if (ctx !== audioCtx) { generation++; buffers.clear(); pendingLoads.clear(); hushRev = null; }
  ctx = audioCtx; bus = destination;
  heartbeat.init(audioCtx, heartbeatDestination);
  if (ctx) void preloadAll();
}

async function load(url) {
  if (!ctx || buffers.has(url)) return buffers.get(url) || null;
  const context = ctx, pending = pendingLoads.get(url);
  if (pending?.context === context) return pending.promise;
  const entry = { context, promise: null };
  pendingLoads.set(url, entry);
  entry.promise = (async () => {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const buf = await context.decodeAudioData(await r.arrayBuffer());
      if (ctx !== context) return null;
      buffers.set(url, buf);
      if (url === FILES.hush) hushRev = reversed(buf);
      return buf;
    } catch (err) { console.warn('fear audio load failed', url, err); return null; }
    finally { if (pendingLoads.get(url) === entry) pendingLoads.delete(url); }
  })();
  return entry.promise;
}
export function preloadAll() { return Promise.all([heartbeat.prepare(), ...Object.values(FILES).map(load)]); }

// Physical Last Exposure contacts have a specific source and event lifetime.
// Other authored fear cues retain hushStinger's legacy variation below.
export function playContactExposure(options) { return contactExposure.play(options); }
export function cancelContactExposure(options) { contactExposure.cancel(options); }

// A backwards copy, made once. Reversal is the cheapest way to make a familiar
// sound unfamiliar: the envelope runs the wrong way and the ear refuses it.
function reversed(buf) {
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c), dst = out.getChannelData(c);
    for (let i = 0, n = buf.length; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return out;
}

// A stopped or replaced owner cannot be resurrected by pending decode work.
export function startHeartbeat() { return heartbeat.start(); }
export function setFear(value) { heartbeat.setPressure(value); }
export function stopHeartbeat(options) { heartbeat.stop(options); }
export function setHeartbeatPaused(value) { heartbeat.setPaused(value); }
export function heartbeatFrame() { return heartbeat.frame(); }
export function heartbeatState() { return heartbeat.snapshot(); }
export function heartbeatOutput() { return heartbeat.output(); }

// ── the hush ─────────────────────────────────────────────────────────────────
// One file, never twice the same. `intensity` 0..1 sets how loud and how close.
export function hushStinger(intensity = 0.5) {
  if (!ctx || !bus) return;
  const fwd = buffers.get(FILES.hush);
  // The first scare of a run used to be silent: this returned while the file
  // was still loading and never came back for it. Play it the moment it lands.
  if (!fwd) {
    const owner = generation;
    load(FILES.hush)?.then?.(() => {
      if (generation === owner && buffers.get(FILES.hush)) hushStinger(intensity);
    }).catch?.(() => {});
    return;
  }
  const back = Math.random() < 0.35;           // sometimes it runs the wrong way
  const buf = (back && hushRev) ? hushRev : fwd;
  const i = Math.max(0, Math.min(1, intensity));
  const now = ctx.currentTime;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.setValueAtTime(0.78 + Math.random() * 0.5, now);   // never the same pitch
  const g = ctx.createGain();
  const peak = 0.12 + i * 0.5;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now + (back ? 0.18 : 0.01));   // reversed = swells in
  g.gain.exponentialRampToValueAtTime(0.0005, now + buf.duration + 0.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900 + i * 6000, now);                   // far things have no top
  const pan = ctx.createStereoPanner();
  // Behind you, or beside you. Never in front — it is never where you are looking.
  pan.pan.setValueAtTime((Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.5), now);

  src.connect(lp); lp.connect(g); g.connect(pan); pan.connect(bus);
  src.start(now); src.stop(now + buf.duration + 0.3);
  src.onended = () => { try { src.disconnect(); lp.disconnect(); g.disconnect(); pan.disconnect(); } catch (_) {} };
}
