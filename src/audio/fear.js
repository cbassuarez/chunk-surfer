// Fear: the heartbeat you cannot slow, and the hush you keep almost hearing.
//
// One 0..1 level drives both. The heartbeat is a real loop whose RATE and gain
// ride the level, so a frightened man's pulse is literally faster — you hear your
// own body before you admit to yourself that you are afraid.
//
// The hush stinger is ONE short file, varied procedurally every time: panned
// somewhere you are not looking, pitched a little, and sometimes played
// backwards. A sound you have heard before is a sound you can dismiss, so it is
// never twice the same sound.

const FILES = {
  heart: '/labs/chunk-surfer/audio/heartbeat.mp3',
  hush: '/labs/chunk-surfer/audio/hush.mp3',
};

let ctx = null, bus = null;
const buffers = new Map();          // url → AudioBuffer
let hushRev = null;                 // the hush, backwards (built once)
let heart = null;                   // { src, gain, rate }

export function fearAudioInit(audioCtx, destination) {
  ctx = audioCtx; bus = destination;
  preloadAll();
}

async function load(url) {
  if (!ctx || buffers.has(url)) return buffers.get(url) || null;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    const buf = await ctx.decodeAudioData(await r.arrayBuffer());
    buffers.set(url, buf);
    if (url === FILES.hush) hushRev = reversed(buf);
    return buf;
  } catch (err) { console.warn('fear audio load failed', url, err); return null; }
}
export function preloadAll() { return Promise.all(Object.values(FILES).map(load)); }

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

// ── the heartbeat ────────────────────────────────────────────────────────────
// Loops forever once started; silent at fear 0, and it never fully stops, because
// a heart does not.
export function startHeartbeat() {
  if (!ctx || !bus || heart) return;
  const buf = buffers.get(FILES.heart);
  if (!buf) { load(FILES.heart).then(() => { if (!heart) startHeartbeat(); }); return; }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  const lp = ctx.createBiquadFilter();          // a pulse felt in the chest, not the ears
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(220, ctx.currentTime);
  src.connect(lp); lp.connect(gain); gain.connect(bus);
  try { src.start(ctx.currentTime); } catch (_) { return; }
  heart = { src, gain, lp };
}

// Fear 0..1 → pulse rate and level. Squared gain so it stays out of the way until
// you are actually frightened, then arrives all at once.
export function setFear(v) {
  if (!ctx || !heart) return;
  const f = Math.max(0, Math.min(1, v));
  const now = ctx.currentTime;
  heart.src.playbackRate.setTargetAtTime(0.72 + f * 1.15, now, 0.5);
  heart.gain.gain.setTargetAtTime(f * f * 0.42, now, 0.35);
  heart.lp.frequency.setTargetAtTime(190 + f * 320, now, 0.5);
}

export function stopHeartbeat({ fade = 0.6 } = {}) {
  if (!ctx || !heart) return;
  const h = heart; heart = null;
  h.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
  setTimeout(() => { try { h.src.stop(); } catch (_) {} try { h.src.disconnect(); h.gain.disconnect(); h.lp.disconnect(); } catch (_) {} }, fade * 1000 + 120);
}

// ── the hush ─────────────────────────────────────────────────────────────────
// One file, never twice the same. `intensity` 0..1 sets how loud and how close.
export function hushStinger(intensity = 0.5) {
  if (!ctx || !bus) return;
  const fwd = buffers.get(FILES.hush);
  if (!fwd) { load(FILES.hush); return; }
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
