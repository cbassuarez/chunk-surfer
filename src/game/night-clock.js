// One fictional night, advanced by presented foreground time and explicit
// lost-time consequences. Real play duration and encounter deadlines stay separate.
import { START_MIN, PER_TAKE_MIN, clockString } from './clock.js';
import { TARGETS } from '../data/conservatory-script.js';

export const NIGHT_CLOCK_DEFAULT_RATE = 1;
const MAX_SECONDS = Number.MAX_SAFE_INTEGER;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const seconds = value => finite(value) ? Math.max(0, Math.min(MAX_SECONDS, value)) : 0;
const rate = value => finite(value) && value > 0 && value <= 60 ? value : NIGHT_CLOCK_DEFAULT_RATE;
const receiptId = value => typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : null;

export function freshNightClock({ rate: pace = NIGHT_CLOCK_DEFAULT_RATE, elapsedSeconds = 0 } = {}) {
  return { schema: 1, elapsedSeconds: seconds(elapsedSeconds), rate: rate(pace), priorUnmeasured: false, lossEvents: [] };
}

function legacyTakeCount(save) {
  const rec = save?.rec || {};
  const rows = Array.isArray(rec.tapes) ? rec.tapes.filter(t => t && !t.voided && !t.damage
    && t.counted !== false && !t.authored && !t.debug && !t.continuous && (!t.status || t.status === 'accepted')).map(t => t.roomId)
    : Array.isArray(rec.takes) ? rec.takes : Array.isArray(save?.takes) ? save.takes : [];
  return new Set(rows.filter(id => TARGETS.includes(id))).size;
}

export function normalizeNightClock(value, { legacySave = null } = {}) {
  if (value?.schema === 1 && finite(value.elapsedSeconds) && value.elapsedSeconds >= 0) {
    const seen = new Set();
    const lossEvents = (Array.isArray(value.lossEvents) ? value.lossEvents : []).filter(entry => {
      const id = receiptId(entry?.id);
      if (!id || seen.has(id) || !finite(entry.seconds) || entry.seconds <= 0) return false;
      seen.add(id); return true;
    }).map(entry => ({ id: entry.id, seconds: seconds(entry.seconds) }));
    return { schema: 1, elapsedSeconds: seconds(value.elapsedSeconds), rate: rate(value.rate),
      priorUnmeasured: value.priorUnmeasured !== false, lossEvents };
  }
  const count = legacyTakeCount(legacySave);
  // Old stamps were authored by take order, not measured. Keep their latest
  // known night position and any accumulated loss counter as lower-bound
  // evidence. Never use Date.now or invent a historical start/finish second.
  const authoredSeconds = count ? ((count * PER_TAKE_MIN) + (((count - 1) * 7) % 13)) * 60 : 0;
  const legacySeconds = seconds(legacySave?.playSeconds);
  const elapsedSeconds = Math.floor(Math.max(authoredSeconds, legacySeconds) / 60) * 60;
  return { ...freshNightClock(), elapsedSeconds, priorUnmeasured: true };
}

export function advanceNightClock(value, foregroundSeconds, { rate: pace } = {}) {
  const clock = normalizeNightClock(value);
  const selectedRate = pace === undefined ? clock.rate : rate(pace);
  return { ...clock, rate: selectedRate,
    elapsedSeconds: Math.min(MAX_SECONDS, clock.elapsedSeconds + seconds(foregroundSeconds) * selectedRate) };
}

export function applyNightClockLoss(value, lostSeconds, eventId) {
  const clock = normalizeNightClock(value), id = receiptId(eventId), amount = seconds(lostSeconds);
  if (!id || amount <= 0 || clock.lossEvents.some(entry => entry.id === id)) return { clock, applied: false };
  return { clock: { ...clock, elapsedSeconds: Math.min(MAX_SECONDS, clock.elapsedSeconds + amount),
    lossEvents: [...clock.lossEvents, { id, seconds: amount }] }, applied: true };
}

export function nightClockReadout(save) {
  const clock = normalizeNightClock(save?.nightClock, { legacySave: save });
  return { label: 'TIME', value: clockString(START_MIN + Math.floor(clock.elapsedSeconds / 60)),
    approximate: clock.priorUnmeasured, qualifier: clock.priorUnmeasured ? 'ESTIMATED' : '' };
}

export function captureNightClock(value) {
  if (value?.schema !== 1 || !finite(value.elapsedSeconds) || value.elapsedSeconds < 0) return null;
  const clock = normalizeNightClock(value);
  return { schema: 1, elapsedSeconds: clock.elapsedSeconds, priorUnmeasured: clock.priorUnmeasured };
}

export const normalizeNightCapture = captureNightClock;

export const NIGHT_CLOCK_PACE_POLICY = Object.freeze({
  id: 'accepted-travel-v1', restRate: 1, travelRate: 3,
  travelHoldSeconds: .24, attackSeconds: .35, settleSeconds: .85,
});

// No keys, camera pose or guessed movement enter this policy. Receipts have
// already survived collision and excluded platform carry / spatial transfers.
export function createNightClockPace(policy = NIGHT_CLOCK_PACE_POLICY) {
  let identity = null, hold = 0;
  const reset = () => { identity = null; hold = 0; };
  return {
    reset,
    update({ runId, foregroundSeconds = 0, active = false, currentRate = 1,
      acceptedTravelMetres = 0, slow = false } = {}) {
      if (identity !== runId) { identity = runId; hold = 0; }
      const dt = seconds(foregroundSeconds), from = Math.max(policy.restRate, Math.min(policy.travelRate, rate(currentRate)));
      if (!active || !dt) { hold = 0; return { rate: slow ? policy.restRate : from, averageRate: 0, policy: policy.id }; }
      if (slow) { hold = 0; return { rate: policy.restRate, averageRate: policy.restRate, policy: policy.id }; }
      if (finite(acceptedTravelMetres) && acceptedTravelMetres > .00001) hold = policy.travelHoldSeconds;
      let value = from, integral = 0;
      const integrate = (span, target, tau) => {
        if (!span) return;
        const decay = Math.exp(-span / tau);
        integral += target * span + (value - target) * tau * (1 - decay);
        value = target + (value - target) * decay;
      };
      const moving = Math.min(dt, hold);
      integrate(moving, policy.travelRate, policy.attackSeconds);
      hold = Math.max(0, hold - dt);
      integrate(dt - moving, policy.restRate, policy.settleSeconds);
      return { rate: value, averageRate: integral / dt, policy: policy.id };
    },
  };
}
