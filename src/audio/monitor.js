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
  hysteresisDb: 2,
});

export const MONITOR_BAND = Object.freeze({
  NORMAL: 'normal',
  MID_HOT: 'mid-hot',
  HOT: 'hot',
});

const PEAK_HOLD_SEC = 0.650;
const CLIP_HOLD_SEC = 0.650;
const CLIP_PEAK = 0.985;

let ctx = null;
let analyser = null;
let peak = 0;
let peakUntil = 0;
let clipUntil = 0;
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
  peak = 0;
  peakUntil = clipUntil = 0;
  if (destination) analyser.connect(destination);
  return analyser;
}

const dbFor = (rms) => rms > 0 ? Math.max(-96, 20 * Math.log10(rms)) : -96;
const segmentsFor = (db) => MONITOR_THRESHOLDS.reduce((n, t) => n + (db >= t ? 1 : 0), 0);
const rmsForDb = (db) => Math.max(0, Math.min(1, Math.pow(10, (Number(db) || -96) / 20)));

export function monitorBandForDb(db, { previousBand = null, hysteresisDb = 0 } = {}) {
  const level = Number.isFinite(Number(db)) ? Number(db) : -96;
  const hysteresis = Math.max(0, Number(hysteresisDb) || 0);
  if (previousBand === MONITOR_BAND.HOT && level >= MONITOR_DANGER_THRESHOLDS.hotDb - hysteresis) return MONITOR_BAND.HOT;
  if (level >= MONITOR_DANGER_THRESHOLDS.hotDb) return MONITOR_BAND.HOT;
  if (previousBand === MONITOR_BAND.MID_HOT && level >= MONITOR_DANGER_THRESHOLDS.midHotDb - hysteresis) return MONITOR_BAND.MID_HOT;
  if (level >= MONITOR_DANGER_THRESHOLDS.midHotDb) return MONITOR_BAND.MID_HOT;
  return MONITOR_BAND.NORMAL;
}

export function monitorSnapshotForRms(rms, { peak = rms, clipped = false } = {}) {
  const level = Math.max(0, Math.min(1, Number(rms) || 0));
  const peakLevel = Math.max(level, Math.min(1, Number(peak) || 0));
  const db = dbFor(level);
  const band = monitorBandForDb(db);
  const clip = !!clipped || peakLevel >= CLIP_PEAK;
  return {
    rms: level, db, segments: clip ? MONITOR_THRESHOLDS.length : segmentsFor(db),
    peak: peakLevel, peakDb: clip ? 0 : dbFor(peakLevel), clipped: clip,
    band, hushRms: level, hushDb: db, hushBand: band,
  };
}

// Feed one semantic world sound into the operator meter. Player-generated
// equipment sounds count (a door, keys, the field case); system-authored sounds
// do not. Sounds explicitly hidden from HUSH are also hidden from the exposure
// display: the bar and warning are a promise about what the AI can use.
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

function normalizeMeasurement(value) {
  if (value && typeof value === 'object') {
    const rms = Math.max(0, Math.min(1, Number(value.rms) || 0));
    const peakValue = Math.max(rms, Math.min(1, Number(value.peak) || 0));
    return { rms, peak: peakValue, clipped: !!value.clipped || peakValue >= CLIP_PEAK };
  }
  const rms = Math.max(0, Math.min(1, Number(value) || 0));
  return { rms, peak: rms, clipped: rms >= CLIP_PEAK };
}

export function monitorSnapshot(nowMs = performance.now()) {
  const injectedMeasurement = injected != null ? normalizeMeasurement(injected) : null;
  const programRms = injectedMeasurement?.rms ?? semanticRmsAt(nowMs, { hushOnly: true });
  let auxiliary = { rms: 0, peak: 0, clipped: false };
  try { auxiliary = normalizeMeasurement(auxiliaryInput?.()); } catch (_) {}
  // The room microphone never connects to this AudioNode or to the speakers.
  // It is nevertheless HUSH evidence whenever permission has made it active.
  const rms = Math.min(1, Math.hypot(programRms, auxiliary.rms));
  const instantPeak = Math.max(injectedMeasurement?.peak || programRms, auxiliary.peak);
  const clipping = !!injectedMeasurement?.clipped || auxiliary.clipped || instantPeak >= CLIP_PEAK;

  if (instantPeak >= peak || nowMs >= peakUntil) {
    peak = instantPeak;
    peakUntil = nowMs + PEAK_HOLD_SEC * 1000;
  }
  if (clipping) clipUntil = nowMs + CLIP_HOLD_SEC * 1000;

  const db = dbFor(rms);
  const clipHeld = nowMs < clipUntil;
  const peakDb = clipHeld ? 0 : dbFor(peak);
  const band = monitorBandForDb(db);
  return {
    rms,
    db,
    segments: clipHeld ? MONITOR_THRESHOLDS.length : segmentsFor(db),
    peak,
    peakDb,
    clipped: clipHeld,
    band,
    hushRms: rms,
    hushDb: db,
    hushBand: band,
    inputKind: auxiliary.rms > 0 ? 'room-mic' : lastPlayerInput?.until > nowMs ? lastPlayerInput.kind : null,
    inputPosition: auxiliary.rms <= 0 && lastPlayerInput?.audibleToHush && lastPlayerInput?.until > nowMs && lastPlayerInput.position
      ? { ...lastPlayerInput.position }
      : null,
  };
}

// Test-only injection. `null` reconnects the readout to semantic events + mic.
export function monitorInject(level = null) { injected = level == null ? null : level; }
export function monitorSetAuxInput(provider = null) { auxiliaryInput = typeof provider === 'function' ? provider : null; }

export function monitorReset() {
  ctx = analyser = null;
  peak = 0;
  peakUntil = clipUntil = 0;
  injected = null;
  auxiliaryInput = null;
  acousticInputs = [];
  lastPlayerInput = null;
}
