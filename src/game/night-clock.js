// One fictional night, advanced by presented foreground time and explicit
// lost-time consequences. Real play duration and encounter deadlines stay separate.
import { START_MIN, PER_TAKE_MIN, clockString } from './clock.js';
import { TARGETS } from '../data/conservatory-script.js';

export const NIGHT_CLOCK_DEFAULT_RATE = 1;
// Source keeps no time. While it holds the night the readout has no digits, and
// leaving it for the chapel or the tower sets the night to one hour, whatever it
// read on the way in. From there it runs at one fixed pace, walking or not.
export const NIGHT_CLOCK_SOURCE_BLANK = '  :  ';
export const NIGHT_CLOCK_SOURCE_EXIT_SECONDS = 8 * 3600; // 05:38
// Clock seconds, so a pause holds it. The digits blink back the way a clock does
// after a power cut, for six seconds of play at the final pace.
export const NIGHT_CLOCK_SOURCE_SETTLE_SECONDS = 9;
const MAX_SECONDS = Number.MAX_SAFE_INTEGER;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const seconds = value => finite(value) ? Math.max(0, Math.min(MAX_SECONDS, value)) : 0;
const rate = value => finite(value) && value > 0 && value <= 60 ? value : NIGHT_CLOCK_DEFAULT_RATE;
const receiptId = value => typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : null;
const sourceMarks = value => ({ ...(value?.sourceHeld === true ? { sourceHeld: true } : {}),
  ...(value?.sourceExited === true ? { sourceExited: true } : {}) });

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
      priorUnmeasured: value.priorUnmeasured !== false, lossEvents, ...sourceMarks(value) };
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

export function advanceNightClock(value, foregroundSeconds, { rate: pace, limit } = {}) {
  const clock = normalizeNightClock(value);
  const selectedRate = pace === undefined ? clock.rate : rate(pace);
  const elapsedSeconds = Math.min(MAX_SECONDS, clock.elapsedSeconds + seconds(foregroundSeconds) * selectedRate);
  return { ...clock, rate: selectedRate, elapsedSeconds: finite(limit) ? Math.min(elapsedSeconds, seconds(limit)) : elapsedSeconds };
}

export function holdNightClockForSource(value, held) {
  const { sourceHeld, ...clock } = normalizeNightClock(value);
  return held ? { ...clock, sourceHeld: true } : clock;
}

// Once per run, so a reload on the far side of the door cannot wind the night back.
export function leaveSourceNightClock(value) {
  const clock = normalizeNightClock(value);
  if (clock.sourceExited) return { clock, applied: false };
  return { clock: { ...clock, elapsedSeconds: NIGHT_CLOCK_SOURCE_EXIT_SECONDS, priorUnmeasured: false, sourceExited: true }, applied: true };
}

export function applyNightClockLoss(value, lostSeconds, eventId) {
  const clock = normalizeNightClock(value), id = receiptId(eventId), amount = seconds(lostSeconds);
  if (!id || amount <= 0 || clock.lossEvents.some(entry => entry.id === id)) return { clock, applied: false };
  return { clock: { ...clock, elapsedSeconds: Math.min(MAX_SECONDS, clock.elapsedSeconds + amount),
    lossEvents: [...clock.lossEvents, { id, seconds: amount }] }, applied: true };
}

export function nightClockReadout(save) {
  const clock = normalizeNightClock(save?.nightClock, { legacySave: save });
  if (clock.sourceHeld) return { label: 'TIME', value: NIGHT_CLOCK_SOURCE_BLANK, blank: true, approximate: false, qualifier: '' };
  const settling = clock.sourceExited === true && clock.elapsedSeconds < NIGHT_CLOCK_SOURCE_EXIT_SECONDS + NIGHT_CLOCK_SOURCE_SETTLE_SECONDS;
  return { label: 'TIME', value: clockString(START_MIN + Math.floor(clock.elapsedSeconds / 60)),
    approximate: clock.priorUnmeasured, qualifier: clock.priorUnmeasured ? 'ESTIMATED' : '', ...(settling ? { settling: true } : {}) };
}

export function captureNightClock(value) {
  if (value?.schema !== 1 || !finite(value.elapsedSeconds) || value.elapsedSeconds < 0) return null;
  const clock = normalizeNightClock(value);
  return { schema: 1, elapsedSeconds: clock.elapsedSeconds, priorUnmeasured: clock.priorUnmeasured,
    ...(clock.sourceHeld ? { sourceHeld: true } : {}) };
}

export const normalizeNightCapture = captureNightClock;

export const NIGHT_CLOCK_PACE_POLICY = Object.freeze({
  id: 'accepted-travel-v1', restRate: 1, travelRate: 3,
  travelHoldSeconds: .24, attackSeconds: .35, settleSeconds: .85,
  // After Source: 05:38 to 06:01 is always 15:20 of play, walking or not, so the
  // last stretch can't be run away or waited out at different speeds.
  finalStretchRate: 1.5,
});

// No keys, camera pose or guessed movement enter this policy. Receipts have
// already survived collision and excluded platform carry / spatial transfers.
export function createNightClockPace(policy = NIGHT_CLOCK_PACE_POLICY) {
  let identity = null, hold = 0;
  const reset = () => { identity = null; hold = 0; };
  return {
    reset,
    update({ runId, foregroundSeconds = 0, active = false, currentRate = 1,
      acceptedTravelMetres = 0, slow = false, fixedRate = null } = {}) {
      if (identity !== runId) { identity = runId; hold = 0; }
      if (finite(fixedRate) && fixedRate > 0) { hold = 0; return { rate: fixedRate, averageRate: active ? fixedRate : 0, policy: policy.id }; }
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
