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
//
// `concealed` is the player behind cover. IT IS NOT A FACT ABOUT THE HUSH, and
// it must never become one: the law at presence.js:5-9 is that the HUSH never
// knows the player transform, only a belief about where a sound was. So being
// behind something does not hide a noise — the noise still happened and it is
// still heard. What concealment does is WITHHOLD THE UPGRADE. A loud sound from
// a man it cannot see stays a `clue`, which is a room; it never sharpens into a
// `pinpoint`, which is a point, or a `contact`, which is a hand on you.
//
// This is also why nothing new has to be drawn. hushNoiseMapConfirmation already
// reads out HEARD/LAST POSITION against PINPOINT/YOU, so the player watches the
// fix fail to sharpen and that IS the feedback.
export function updateHushNoisePerception(value, {
  now = 0,
  dt = 0,
  db = -96,
  active = false,
  enabled = true,
  concealed = false,
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
  // Sustained hot noise banks toward a contact because the thing can walk up to
  // an obvious, continuous source. It cannot do that to a source it has not
  // localised, so behind cover the clock does not run. Holding the bank instead
  // of clearing it would mean stepping out of cover after a loud minute gets you
  // grabbed instantly, for a reason the player cannot see.
  if (band === MONITOR_BAND.HOT && !concealed) {
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

  // Concealed, a HOT reading is heard as loudly as ever and localised no better
  // than a MID_HOT one: it falls back to the clue rung rather than going silent.
  const heardBand = concealed && band === MONITOR_BAND.HOT ? MONITOR_BAND.MID_HOT : band;

  if (heardBand === MONITOR_BAND.MID_HOT && at >= state.nextSignalAt) {
    action = { kind: 'clue', priority: .68, expiresAt: at + HUSH_NOISE_PERCEPTION.clueMemoryMs };
    state.nextSignalAt = at + HUSH_NOISE_PERCEPTION.clueCadenceMs;
    state.perceptionMode = 'clue';
    state.perceptionUntil = action.expiresAt;
  } else if (heardBand === MONITOR_BAND.HOT && at >= state.nextSignalAt) {
    action = { kind: 'pinpoint', priority: .96, expiresAt: at + HUSH_NOISE_PERCEPTION.pinpointMemoryMs };
    state.nextSignalAt = at + HUSH_NOISE_PERCEPTION.pinpointCadenceMs;
    state.perceptionMode = 'pinpoint';
    state.perceptionUntil = action.expiresAt;
  }

  if (band === MONITOR_BAND.HOT
      && !concealed
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
