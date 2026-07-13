// The final-output monitor. Every signal the player can hear converges here;
// the VFD therefore reports the actual mixed waveform rather than a timer or a
// decorative animation. The node is transparent and introduces no gain.

export const MONITOR_THRESHOLDS = Object.freeze([
  -48, -42, -36, -30, -24, -18, -15, -12, -9, -6, -3, 0,
]);

const ATTACK_SEC = 0.035;
const RELEASE_SEC = 0.300;
const PEAK_HOLD_SEC = 0.650;

let ctx = null;
let analyser = null;
let data = null;
let envelope = 0;
let peak = 0;
let peakUntil = 0;
let lastAt = 0;
let injected = null;
let auxiliaryInput = null;

export function monitorInit(audioCtx, destination) {
  if (!audioCtx) return null;
  if (ctx === audioCtx && analyser) return analyser;
  ctx = audioCtx;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  analyser.channelCountMode = 'max';
  data = new Float32Array(analyser.fftSize);
  envelope = peak = 0;
  peakUntil = lastAt = 0;
  if (destination) analyser.connect(destination);
  return analyser;
}

const dbFor = (rms) => rms > 0 ? Math.max(-96, 20 * Math.log10(rms)) : -96;
const segmentsFor = (db) => MONITOR_THRESHOLDS.reduce((n, t) => n + (db >= t ? 1 : 0), 0);

export function monitorSnapshotForRms(rms) {
  const level = Math.max(0, Math.min(1, Number(rms) || 0));
  const db = dbFor(level);
  return { rms: level, db, segments: segmentsFor(db), peakDb: db };
}

export function monitorSnapshot(nowMs = performance.now()) {
  let programRms = 0;
  if (injected != null) programRms = Math.max(0, Math.min(1, injected));
  else if (analyser && data) {
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    programRms = Math.sqrt(sum / data.length);
  }
  let auxiliaryRms = 0;
  try { auxiliaryRms = Math.max(0, Math.min(1, Number(auxiliaryInput?.()) || 0)); } catch (_) {}
  // Auxiliary RMS is display-only. In particular, the room microphone never
  // connects to this AudioNode or to the speakers.
  const rms = Math.min(1, Math.hypot(programRms, auxiliaryRms));

  const dt = lastAt ? Math.min(0.25, Math.max(0, (nowMs - lastAt) / 1000)) : 1 / 60;
  lastAt = nowMs;
  const tau = rms > envelope ? ATTACK_SEC : RELEASE_SEC;
  const k = 1 - Math.exp(-dt / tau);
  envelope += (rms - envelope) * k;

  if (envelope >= peak || nowMs >= peakUntil) {
    peak = envelope;
    peakUntil = nowMs + PEAK_HOLD_SEC * 1000;
  }

  const db = dbFor(envelope);
  const peakDb = dbFor(peak);
  return { rms: envelope, db, segments: segmentsFor(db), peakDb };
}

// Test-only injection. `null` reconnects the readout to the real analyser.
export function monitorInject(level = null) { injected = level == null ? null : Number(level); }
export function monitorSetAuxInput(provider = null) { auxiliaryInput = typeof provider === 'function' ? provider : null; }

export function monitorReset() {
  ctx = analyser = data = null;
  envelope = peak = 0;
  peakUntil = lastAt = 0;
  injected = null;
  auxiliaryInput = null;
}
