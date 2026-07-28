// The field monitor is the operator's exposure meter, not an output-volume
// meter. It reports only sounds the player character makes plus the optional
// live room microphone. Score, dialogue, HUSH cues, ambience, and UI sounds may
// all be audible without moving it. The AudioNode remains a transparent output
// pass-through; its waveform is deliberately not sampled.

export const MONITOR_THRESHOLDS = Object.freeze([
  -48, -42, -36, -30, -24, -18, -15, -12, -9, -6, -3, 0,
]);

export const MONITOR_DANGER_THRESHOLDS = Object.freeze({
  midHotDb: -30,
  hotDb: -18,
});

export const MONITOR_BAND = Object.freeze({
  NORMAL: 'normal',
  MID_HOT: 'mid-hot',
  HOT: 'hot',
});

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
let acousticInputs = [];
let lastPlayerInput = null;

export function monitorInit(audioCtx, destination) {
  if (!audioCtx) return null;
  if (ctx === audioCtx && analyser) return analyser;
  ctx = audioCtx;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  analyser.channelCountMode = 'max';
  data = null;
  envelope = peak = 0;
  peakUntil = lastAt = 0;
  if (destination) analyser.connect(destination);
  return analyser;
}

const dbFor = (rms) => rms > 0 ? Math.max(-96, 20 * Math.log10(rms)) : -96;
const segmentsFor = (db) => MONITOR_THRESHOLDS.reduce((n, t) => n + (db >= t ? 1 : 0), 0);
const rmsForDb = (db) => Math.max(0, Math.min(1, Math.pow(10, (Number(db) || -96) / 20)));

export function monitorBandForDb(db) {
  const level = Number.isFinite(Number(db)) ? Number(db) : -96;
  if (level >= MONITOR_DANGER_THRESHOLDS.hotDb) return MONITOR_BAND.HOT;
  if (level >= MONITOR_DANGER_THRESHOLDS.midHotDb) return MONITOR_BAND.MID_HOT;
  return MONITOR_BAND.NORMAL;
}

export function monitorSnapshotForRms(rms) {
  const level = Math.max(0, Math.min(1, Number(rms) || 0));
  const db = dbFor(level);
  const band = monitorBandForDb(db);
  return { rms: level, db, segments: segmentsFor(db), peakDb: db, band, hushRms: level, hushDb: db, hushBand: band };
}

// Feed one semantic world sound into the operator meter. Player-generated
// equipment sounds count (a door, keys, the field case); system-authored sounds
// do not. `audibleToHush` is retained separately so safe authored moments may
// still move the visible meter without becoming AI evidence.
export function monitorObserveAcousticEvent(event, nowMs = null) {
  if (!event?.semantics?.playerGenerated || event.semantics.audibleToMonitor === false) return false;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs)
    : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const durationMs = Math.max(40, Number(event?.acoustic?.durationMs) || 300);
  const input = {
    id: String(event.id || `player-input:${now}`),
    rms: rmsForDb(event?.acoustic?.levelDb),
    audibleToHush: event.semantics.audibleToHush !== false,
    until: now + durationMs,
    position: event?.spatial?.position && Number.isFinite(Number(event.spatial.position.x)) && Number.isFinite(Number(event.spatial.position.y))
      ? { x: Number(event.spatial.position.x), y: Number(event.spatial.position.y) }
      : null,
    kind: String(event.kind || 'player-noise'),
  };
  acousticInputs.push(input);
  if (acousticInputs.length > 24) acousticInputs = acousticInputs.slice(-24);
  lastPlayerInput = input;
  return true;
}

function semanticRmsAt(nowMs, { hushOnly = false } = {}) {
  acousticInputs = acousticInputs.filter((entry) => entry.until > nowMs);
  let sum = 0;
  for (const entry of acousticInputs) {
    if (hushOnly && !entry.audibleToHush) continue;
    sum += entry.rms * entry.rms;
  }
  return Math.min(1, Math.sqrt(sum));
}

export function monitorSnapshot(nowMs = performance.now()) {
  let programRms = injected != null
    ? Math.max(0, Math.min(1, injected))
    : semanticRmsAt(nowMs);
  let hushProgramRms = injected != null
    ? Math.max(0, Math.min(1, injected))
    : semanticRmsAt(nowMs, { hushOnly: true });
  let auxiliaryRms = 0;
  try { auxiliaryRms = Math.max(0, Math.min(1, Number(auxiliaryInput?.()) || 0)); } catch (_) {}
  // The room microphone never connects to this AudioNode or to the speakers.
  // It is nevertheless HUSH evidence whenever permission has made it active.
  const rms = Math.min(1, Math.hypot(programRms, auxiliaryRms));
  const hushRms = Math.min(1, Math.hypot(hushProgramRms, auxiliaryRms));

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
  const hushDb = dbFor(hushRms);
  return {
    rms: envelope,
    db,
    segments: segmentsFor(db),
    peakDb,
    band: monitorBandForDb(db),
    hushRms,
    hushDb,
    hushBand: monitorBandForDb(hushDb),
    inputKind: auxiliaryRms > 0 ? 'room-mic' : lastPlayerInput?.until > nowMs ? lastPlayerInput.kind : null,
    inputPosition: auxiliaryRms <= 0 && lastPlayerInput?.audibleToHush && lastPlayerInput?.until > nowMs && lastPlayerInput.position
      ? { ...lastPlayerInput.position }
      : null,
  };
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
  acousticInputs = [];
  lastPlayerInput = null;
}
