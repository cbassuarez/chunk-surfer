import { MONITOR_BAND, monitorBandForDb } from '../audio/monitor.js';

export const HUSH_NOISE_PERCEPTION = Object.freeze({
  clueCadenceMs: 720,
  pinpointCadenceMs: 180,
  clueMemoryMs: 4_800,
  pinpointMemoryMs: 9_000,
  sustainedHotMs: 1_750,
  hotReleaseGraceMs: 260,
  bandHysteresisDb: 2,
  directContactMemoryMs: 12_000,
});

export function freshHushNoisePerception() {
  return {
    schema: 2,
    band: MONITOR_BAND.NORMAL,
    hotHeldMs: 0,
    hotGapMs: 0,
    contactEscalated: false,
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
    hotGapMs: Math.max(0, Number(value.hotGapMs) || 0),
    contactEscalated: !!value.contactEscalated,
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

// Pure reducer for the player-noise/HUSH loop. It never spawns or despawns HUSH.
// Main applies clue/pinpoint targeting and commits the one-shot contact action.
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
  const band = monitorBandForDb(db, {
    previousBand: state.band,
    hysteresisDb: HUSH_NOISE_PERCEPTION.bandHysteresisDb,
  });

  if (!active || !enabled) {
    return { state: freshHushNoisePerception(), action: null, confirmation: hushNoiseMapConfirmation(null, at) };
  }

  state.band = band;
  if (band === MONITOR_BAND.HOT) {
    state.hotHeldMs += elapsedMs;
    state.hotGapMs = 0;
  } else {
    state.hotGapMs += elapsedMs;
    if (state.hotGapMs > HUSH_NOISE_PERCEPTION.hotReleaseGraceMs) {
      state.hotHeldMs = 0;
      state.contactEscalated = false;
    }
  }
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

  if (band === MONITOR_BAND.HOT
      && state.hotHeldMs >= HUSH_NOISE_PERCEPTION.sustainedHotMs
      && !state.contactEscalated) {
    state.directContactUntil = at + HUSH_NOISE_PERCEPTION.directContactMemoryMs;
    state.perceptionMode = 'locked';
    state.perceptionUntil = state.directContactUntil;
    state.contactEscalated = true;
    action = {
      kind: 'contact',
      priority: 1,
      expiresAt: state.directContactUntil,
      forceDirectContact: true,
    };
  }

  if (state.perceptionUntil && at >= state.perceptionUntil) {
    state.perceptionMode = 'none';
    state.perceptionUntil = 0;
  }

  return { state, action, confirmation: hushNoiseMapConfirmation(state, at) };
}
