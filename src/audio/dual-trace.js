// Shared display metering. This module never changes a gameplay measurement,
// reads a clock, or owns an AudioNode. Supply timestamps in one millisecond
// clock domain (normally performance.now(), including converted audio times).
//
// push() is a NEW measurement; read() only projects the display forward. Reads
// cannot extend holds or change the state against which later audio packets
// are integrated. A delayed packet can therefore follow a newer display read.
export const DUAL_TRACE_CONFIG = Object.freeze({
  floorDb: -96,
  minDb: -48,
  maxDb: 0,
  rmsWindowMs: 100,
  attackPowerTauMs: 30,
  releaseDbPerSec: 14,
  peakHoldMs: 1000,
  peakReleaseDbPerSec: 12,
  clipHoldMs: 2000,
  segmentReleaseDb: 0.6,
  numericIntervalMs: 125,
  staleAfterMs: 250,
});

const C = DUAL_TRACE_CONFIG;
const EPSILON = 1e-7;
const FLOOR_POWER = 10 ** (C.floorDb / 10);
const clampDb = value => Math.max(C.floorDb, Math.min(C.maxDb, value));
const powerDb = power => power > FLOOR_POWER ? clampDb(10 * Math.log10(power)) : C.floorDb;
const amplitudeDb = amplitude => amplitude > 0 ? clampDb(20 * Math.log10(amplitude)) : C.floorDb;

function number(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function time(value, fallback = 0) {
  return number(value) ?? fallback;
}

function identity(measurement) {
  return [measurement.sourceId, measurement.deviceId, measurement.channelMode]
    .map(value => value == null ? '' : String(value)).join('\u0000');
}

function normalize(measurement = {}) {
  if (!measurement || typeof measurement !== 'object') measurement = {};
  const rms = number(measurement.rms);
  const db = number(measurement.db);
  const available = measurement.available !== false && measurement.active !== false && (rms != null || db != null);
  const power = rms != null ? Math.min(1, Math.max(0, rms)) ** 2
    : db != null && db > C.floorDb ? 10 ** (clampDb(db) / 10) : 0;
  // Legacy monitor snapshots already retain their ordinary peak/clip fields.
  // Use instantaneous evidence when supplied, never stack two hold envelopes.
  const instantPeakDb = number(measurement.instantPeakDb);
  const instantPeak = number(measurement.instantPeak);
  const peakDb = number(measurement.peakDb);
  const peak = number(measurement.peak);
  const candidate = instantPeakDb != null ? clampDb(instantPeakDb)
    : instantPeak != null ? amplitudeDb(instantPeak)
      : peakDb != null ? clampDb(peakDb)
        : peak != null ? amplitudeDb(peak) : powerDb(power);
  return {
    available,
    power,
    // A short interval's peak can be below an already-integrated RMS reading.
    // Preserve that independent evidence; only absent peaks fall back to RMS.
    peakDb: candidate,
    clipped: measurement.instantClipped != null ? !!measurement.instantClipped : !!measurement.clipped,
    integrated: measurement.integrated === true,
    peakKind: measurement.peakKind === 'sample' ? 'sample' : 'level',
    identity: identity(measurement),
  };
}

function empty() {
  return {
    at: null, inputAt: null, inputPower: 0, integrated: false,
    available: false, peakKind: 'level', identity: '', history: [],
    power: 0, peakDb: C.floorDb, peakUntil: -Infinity, clipUntil: -Infinity,
    segments48: 0, segments24: 0,
    numericDb: C.floorDb, numericPeakDb: C.floorDb, nextNumericAt: null,
  };
}

// A cell occupies an interval on the -48..0 scale. It lights as the reading
// enters that interval, and releases 0.6 dB below its entry boundary. Silence
// always clears the bank: ceil() and hysteresis cannot leave a cell below -48.
function segmentCount(previous, db, total) {
  if (db <= C.minDb) return 0;
  const step = (C.maxDb - C.minDb) / total;
  const target = Math.min(total, Math.ceil((db - C.minDb) / step));
  if (target >= previous) return target;
  let count = previous;
  while (count > target && db <= C.minDb + (count - 1) * step - C.segmentReleaseDb + EPSILON) count -= 1;
  return count;
}

function updateSegments(state) {
  const db = powerDb(state.power);
  state.segments48 = segmentCount(state.segments48, db, 48);
  state.segments24 = segmentCount(state.segments24, db, 24);
}

function peakAt(state, at) {
  return Math.max(C.floorDb, state.peakDb - Math.max(0, at - state.peakUntil) * C.peakReleaseDbPerSec / 1000);
}

function targetPower(state, at) {
  if (!state.available || state.inputAt == null) return 0;
  if (state.integrated) return at <= state.inputAt + C.staleAfterMs ? state.inputPower : 0;
  const from = at - C.rmsWindowMs;
  let energy = 0;
  for (let i = 0; i < state.history.length; i += 1) {
    const item = state.history[i];
    const start = Math.max(from, item.at);
    const end = Math.min(at, item.at + C.staleAfterMs, state.history[i + 1]?.at ?? at);
    if (end > start) energy += item.power * (end - start);
  }
  // Missing history is silence, rather than a shorter startup RMS window.
  return energy / C.rmsWindowMs;
}

function updateNumeric(state, at) {
  state.numericDb = powerDb(state.power);
  state.numericPeakDb = peakAt(state, at);
}

function stepPower(previous, target, elapsedMs) {
  if (target >= previous) {
    return target + (previous - target) * Math.exp(-elapsedMs / C.attackPowerTauMs);
  }
  return Math.max(target, previous * 10 ** (-C.releaseDbPerSec * elapsedMs / 10000));
}

// Once all input history has expired, release is analytic. This handles even
// multi-minute background stalls without a dt cap or an unbounded step loop.
function advanceSilence(state, to) {
  const from = state.at;
  const startingPower = state.power;
  if (state.nextNumericAt <= to + EPSILON) {
    const tick = state.nextNumericAt + Math.floor((to - state.nextNumericAt + EPSILON) / C.numericIntervalMs) * C.numericIntervalMs;
    state.numericDb = powerDb(startingPower * 10 ** (-C.releaseDbPerSec * (tick - from) / 10000));
    state.numericPeakDb = peakAt(state, tick);
    state.nextNumericAt = tick + C.numericIntervalMs;
  }
  state.power = startingPower * 10 ** (-C.releaseDbPerSec * (to - from) / 10000);
  if (state.power <= FLOOR_POWER) state.power = 0;
  state.at = to;
  updateSegments(state);
}

function advance(state, to) {
  if (state.at == null || to <= state.at + EPSILON) return;
  const silenceAt = state.inputAt + C.staleAfterMs + (state.integrated ? 0 : C.rmsWindowMs);
  while (state.at < to - EPSILON) {
    if (state.at >= silenceAt - EPSILON) {
      advanceSilence(state, to);
      break;
    }
    // Already-integrated measurements are piecewise constant, so their attack
    // has an exact solution. Raw power's rolling window changes continuously;
    // midpoint steps of at most 1 ms keep it independent of display cadence.
    const end = Math.min(to, state.nextNumericAt, silenceAt,
      state.integrated ? state.inputAt + C.staleAfterMs : state.at + 1);
    const dt = end - state.at;
    if (dt > EPSILON) {
      state.power = stepPower(state.power, targetPower(state, state.at + dt / 2), dt);
      state.at = end;
      updateSegments(state);
    }
    if (state.at >= state.nextNumericAt - EPSILON) {
      updateNumeric(state, state.nextNumericAt);
      state.nextNumericAt += C.numericIntervalMs;
    }
  }
}

function snapshot(state, at) {
  return Object.freeze({
    type: 'dual-trace',
    db: powerDb(state.power),
    peakDb: state.available ? peakAt(state, at) : C.floorDb,
    numericDb: state.numericDb,
    numericPeakDb: state.numericPeakDb,
    clipped: state.available && at < state.clipUntil,
    segments48: state.segments48,
    segments24: state.segments24,
    counts: Object.freeze({ 48: state.segments48, 24: state.segments24 }),
    available: state.available && state.inputAt != null && at - state.inputAt <= C.staleAfterMs,
    peakKind: state.peakKind,
  });
}

/**
 * rms/peak are linear amplitudes; db/peakDb are digital or authored levels.
 * integrated:true means rms already covers the full 100 ms energy window.
 * Each raw measurement is held from its timestamp until the next measurement,
 * or for at most staleAfterMs. Missing history before the first push is silent.
 *
 * Explicit availability loss and source/device/channel/peak-kind changes clear
 * every envelope. Out-of-order packets are ignored until an explicit reset.
 */
export function createDualTraceMeter() {
  let state = empty();
  return Object.freeze({
    push(measurement = {}, nowMs) {
      const input = normalize(measurement);
      const now = time(nowMs, state.at ?? 0);
      if (input.identity !== state.identity || input.peakKind !== state.peakKind) state = empty();
      if (!input.available) {
        state = empty();
        state.identity = input.identity;
        state.peakKind = input.peakKind;
        return snapshot(state, now);
      }
      if (state.at != null && now <= state.at + EPSILON) return snapshot(state, state.at);
      if (state.at == null) {
        state.at = now;
        state.nextNumericAt = now + C.numericIntervalMs;
      } else advance(state, now);

      if (state.integrated !== input.integrated) state.history = [];
      state.inputAt = now;
      state.inputPower = input.power;
      state.integrated = input.integrated;
      state.available = true;
      state.identity = input.identity;
      state.peakKind = input.peakKind;
      if (!input.integrated) {
        state.history.push({ at: now, power: input.power });
        const cutoff = now - C.rmsWindowMs;
        while (state.history.length > 1 && state.history[1].at <= cutoff) state.history.shift();
      }

      if (input.peakDb >= peakAt(state, now)) {
        state.peakDb = input.peakDb;
        state.peakUntil = now + C.peakHoldMs;
      }
      if (input.clipped) state.clipUntil = now + C.clipHoldMs;
      if (state.nextNumericAt === now + C.numericIntervalMs) updateNumeric(state, now);
      return snapshot(state, now);
    },
    read(nowMs) {
      const now = Math.max(state.at ?? 0, time(nowMs, state.at ?? 0));
      // history is immutable during a projection; only push() appends/prunes it.
      const projected = { ...state };
      advance(projected, now);
      return snapshot(projected, now);
    },
    reset() {
      state = empty();
    },
  });
}

const METERS = new Map();

/** Shared renderer adapter; an audio-produced trace is already fully filtered. */
export function dualTraceSnapshot(id, measurement = {}, nowMs = 0) {
  if (measurement?.dualTrace?.type === 'dual-trace') return measurement.dualTrace;
  const value = measurement && typeof measurement === 'object' ? measurement : {};
  const key = String(id);
  let entry = METERS.get(key);
  if (!entry) {
    entry = { meter: createDualTraceMeter(), object: null, signature: '', timestamp: null, identity: '' };
    METERS.set(key, entry);
    if (METERS.size > 128) METERS.delete(METERS.keys().next().value);
  }
  const now = time(nowMs);
  const explicitStamp = number(value.timestampMs) ?? number(value.atMs);
  const stamp = explicitStamp ?? now;
  const input = normalize(value);
  const sourceIdentity = `${input.identity}\u0000${input.peakKind}`;
  const signature = [input.power, input.peakDb, input.clipped, input.available, input.integrated, sourceIdentity].join('|');
  const sourceChanged = entry.identity !== sourceIdentity;
  const repeatedObject = explicitStamp == null && entry.object === value && entry.signature === signature;
  if (sourceChanged) entry.meter.reset();
  if (!input.available || sourceChanged || (!repeatedObject && (entry.timestamp == null || stamp > entry.timestamp + EPSILON))) {
    entry.meter.push(value, stamp);
    entry.timestamp = stamp;
    entry.object = value;
    entry.signature = signature;
    entry.identity = sourceIdentity;
  }
  return entry.meter.read(now);
}

/** Drop one renderer source, or all sources when leaving a session. */
export function resetDualTraceMeters(id) {
  if (id == null) METERS.clear();
  else METERS.delete(String(id));
}
