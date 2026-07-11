// The room you are actually in.
//
// A game about holding still and making no sound, played through a microphone
// that is listening to the actual room the player is actually sitting in. When
// you roll a take, the recorder is not a metaphor: the browser opens the mic,
// and if the player's real room makes a noise — a cough, a chair, a word — the
// take is spoiled, because the take was never only about the game's room.
//
// And if the player screams, the recordist screams, because at that point the
// two rooms are the same room.
//
// This is entirely optional and fails soft. No permission, an iframe without
// `allow="microphone"`, a headless test — any of these and micActive() stays
// false and the game plays exactly as it did before. It never routes the mic
// to the output; there is no feedback, only an analyser.

let ctx = null;
let analyser = null;
let data = null;
let stream = null;
let state = 'idle';          // 'idle' | 'asking' | 'on' | 'denied'
let testLevel = null;        // headless override

export function micState() { return testLevel != null ? 'test' : state; }
// A headless-injected level is authoritative: it means "on", whatever the real
// getUserMedia is doing (its async rejection must not un-inject the test).
export function micActive() { return testLevel != null || state === 'on'; }

// Must be called from (or shortly after) a user gesture. Fire-and-forget: the
// caller does not wait, and a rejection just leaves the game mic-less.
export function micInit(audioCtx) {
  if (testLevel != null) return;                 // a test has taken the mic
  if (state === 'on' || state === 'asking' || state === 'denied') return;
  if (!audioCtx || !navigator?.mediaDevices?.getUserMedia) { state = 'denied'; return; }
  ctx = audioCtx;
  state = 'asking';
  navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  }).then((s) => {
    stream = s;
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    data = new Float32Array(analyser.fftSize);
    src.connect(analyser);           // to the analyser ONLY. never to output.
    state = 'on';
  }).catch(() => { state = 'denied'; });
}

// Current loudness of the real room, RMS 0..1. A quiet room is ~0.005; talking
// is ~0.05–0.15; a shout is past 0.3.
export function micLevel() {
  if (testLevel != null) return testLevel;
  if (state !== 'on') return 0;
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

// Headless suites cannot grant a mic, so they inject a level instead. It is
// authoritative (see micActive): a real getUserMedia rejection cannot clear it.
export function micTest(level) { testLevel = level; }

export function micStop() {
  try { stream?.getTracks().forEach((t) => t.stop()); } catch (_) {}
  stream = null; analyser = null; state = 'idle';
}
