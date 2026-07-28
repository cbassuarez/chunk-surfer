import { MONITOR_BAND, monitorBandForDb } from '../audio/monitor.js';

export const HUSH_NOISE_PERCEPTION = Object.freeze({
  clueCadenceMs: 720,
  pinpointCadenceMs: 180,
  clueMemoryMs: 4_800,
  pinpointMemoryMs: 9_000,
  sustainedHotMs: 1_750,
  directContactMemoryMs: 12_000,
});

export function freshHushNoisePerception() {
  return {
    schema: 1,
    band: MONITOR_BAND.NORMAL,
    hotHeldMs: 0,
    nextSignalAt: 0,
    perceptionMode: 'none',
    perceptionUntil: 0,
    directContactUntil: 0,
  };
}

export function normalizeHushNoisePerception(value = {}) {
  const base = freshHushNoisePerception();
  if (!value || typeof value !== 'object') return base;
  return {
    ...base,
    band: Object.values(MONITOR_BAND).includes(value.band) ? value.band : base.band,
    hotHeldMs: Math.max(0, Number(value.hotHeldMs) || 0),
    nextSignalAt: Math.max(0, Number(value.nextSignalAt) || 0),
    perceptionMode: ['none', 'clue', 'pinpoint', 'locked'].includes(value.perceptionMode) ? value.perceptionMode : 'none',
    perceptionUntil: Math.max(0, Number(value.perceptionUntil) || 0),
    directContactUntil: Math.max(0, Number(value.directContactUntil) || 0),
  };
}

export function hushNoiseForcesDirectContact(state, now = 0) {
  return Number(now) < Number(state?.directContactUntil || 0);
}

export function hushNoiseMapConfirmation(state, now = 0) {
  const current = normalizeHushNoisePerception(state);
  if (hushNoiseForcesDirectContact(current, now)) {
    return { mode: 'locked', label: 'LOCKED', detail: 'YOU', cls: 'ui-danger' };
  }
  if (Number(now) >= current.perceptionUntil) return { mode: 'none', label: 'ACTIVE', detail: 'NO FIX', cls: 'ui-secondary' };
  if (current.perceptionMode === 'pinpoint') return { mode: 'pinpoint', label: 'PINPOINT', detail: 'YOU', cls: 'ui-danger' };
  if (current.perceptionMode === 'clue') return { mode: 'clue', label: 'HEARD', detail: 'LAST POSITION', cls: 'ui-amber' };
  return { mode: 'none', label: 'ACTIVE', detail: 'NO FIX', cls: 'ui-secondary' };
}

// Pure reducer for the player-noise/HUSH loop. It never spawns, despawns, moves,
// or catches the HUSH itself; main applies the returned clue/pinpoint offer to
// the already-active presence authority.
export function updateHushNoisePerception(value, {
  now = 0,
  dt = 0,
  db = -96,
  active = false,
  enabled = true,
} = {}) {
  const state = normalizeHushNoisePerception(value);
  const at = Math.max(0, Number(now) || 0);
  const elapsedMs = Math.max(0, Math.min(250, (Number(dt) || 0) * 1000));
  const band = monitorBandForDb(db);

  if (!active || !enabled) {
    return { state: freshHushNoisePerception(), action: null, confirmation: hushNoiseMapConfirmation(null, at) };
  }

  state.band = band;
  state.hotHeldMs = band === MONITOR_BAND.HOT ? state.hotHeldMs + elapsedMs : 0;
  let action = null;

  if (band === MONITOR_BAND.MID_HOT && at >= state.nextSignalAt) {
    action = { kind: 'clue', priority: .68, expiresAt: at + HUSH_NOISE_PERCEPTION.clueMemoryMs };
    state.nextSignalAt = at + HUSH_NOISE_PERCEPTION.clueCadenceMs;
    state.perceptionMode = 'clue';
    state.perceptionUntil = action.expiresAt;
  } else if (band === MONITOR_BAND.HOT && at >= state.nextSignalAt) {
    action = { kind: 'pinpoint', priority: .96, expiresAt: at + HUSH_NOISE_PERCEPTION.pinpointMemoryMs };
    state.nextSignalAt = at + HUSH_NOISE_PERCEPTION.pinpointCadenceMs;
    state.perceptionMode = 'pinpoint';
    state.perceptionUntil = action.expiresAt;
  }

  if (band === MONITOR_BAND.HOT && state.hotHeldMs >= HUSH_NOISE_PERCEPTION.sustainedHotMs) {
    state.directContactUntil = at + HUSH_NOISE_PERCEPTION.directContactMemoryMs;
    state.perceptionMode = 'locked';
    state.perceptionUntil = state.directContactUntil;
    if (action) action.forceDirectContact = true;
  }

  if (state.perceptionUntil && at >= state.perceptionUntil) {
    state.perceptionMode = 'none';
    state.perceptionUntil = 0;
  }

  return { state, action, confirmation: hushNoiseMapConfirmation(state, at) };
}
