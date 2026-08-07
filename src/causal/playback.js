import { shadowFrameAt, validateCausalTape } from './tape.js';

export const HUSH_SYNC_LABELS = Object.freeze(['UNISON', 'COHERENT', 'DRIFT', 'CORRECTED']);
export const HUSH_DENSITY_COSTS = Object.freeze({ taunt: 10, haunt: 18, seam: 20, manifest: 28 });
export const HUSH_REQUIRED_RESERVE = 25;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, Number(value) || 0));

export function synchronizationResult(anchors, enactedIds) {
  const enacted = enactedIds instanceof Set ? enactedIds : new Set(enactedIds || []);
  const totalWeight = (anchors || []).reduce((sum, anchor) => sum + (Number(anchor.weight) === 2 ? 2 : 1), 0);
  const manualWeight = (anchors || []).reduce((sum, anchor) => sum + (enacted.has(anchor.id) ? (Number(anchor.weight) === 2 ? 2 : 1) : 0), 0);
  const synchronization = totalWeight ? Math.round((manualWeight / totalWeight) * 100) : 100;
  const label = synchronization >= 90 ? 'UNISON'
    : synchronization >= 70 ? 'COHERENT'
      : synchronization >= 40 ? 'DRIFT' : 'CORRECTED';
  return { synchronization, label, manualWeight, totalWeight };
}

export function permittedSpoolRate(nextAnchorMs) {
  const remaining = Number(nextAnchorMs);
  if (!Number.isFinite(remaining) || remaining > 30_000) return 4;
  if (remaining > 12_000) return 2;
  return 1;
}

export function consoleAdvanceAllowance(nextAnchorMs) {
  const remaining = Number(nextAnchorMs);
  if (!Number.isFinite(remaining)) return Infinity;
  return Math.max(0, remaining - 8000);
}

export function consoleAdvanceStep(nextAnchorMs, wallElapsedMs) {
  const allowance = consoleAdvanceAllowance(nextAnchorMs);
  const wall = Math.max(0, Number(wallElapsedMs) || 0);
  return {
    elapsedMs: Math.min(wall, allowance),
    eject: Number.isFinite(allowance) && wall >= allowance,
  };
}

export function makeHushPlayback(tape, { now = 0 } = {}) {
  const valid = validateCausalTape(tape);
  if (!valid.ok) throw new Error(valid.reason);
  return {
    tape,
    timeMs: clamp(now, 0, tape.durationMs),
    density: 100,
    enacted: new Set(),
    corrected: new Set(),
    ornaments: 0,
    seamsCrossed: 0,
    filesOpened: new Set(),
    borrowMs: 0,
    completed: false,
    emittedEvents: new Set(),
    initialized: now > 0,
  };
}

export function nextCausalAnchor(state) {
  return state.tape.anchors.find((anchor) => anchor.at >= state.timeMs && !state.enacted.has(anchor.id) && !state.corrected.has(anchor.id)) || null;
}

// The next event on the recorded clock remains a timing boundary after the
// player arms it. Arming supplies the cause; it does not move the event, remove
// its Borrow window, or permit the transport to spool through its pre-roll.
export function nextTimelineAnchor(state) {
  return state.tape.anchors.find((anchor) => anchor.at >= state.timeMs) || null;
}

export function canEnactAnchor(state, verb, locus, at = state.timeMs) {
  const anchor = state.tape.anchors.find((item) => !state.enacted.has(item.id)
    && !state.corrected.has(item.id)
    && item.verb === verb
    && at >= item.at - item.armingWindowMs
    && at <= item.at);
  if (!anchor) return { ok: false, reason: 'NO_ARMED_ANCHOR' };
  if (String(locus?.spaceId || 'conservatory') !== String(anchor.locus?.spaceId || 'conservatory')) {
    return { ok: false, reason: 'WRONG_SPACE', anchor };
  }
  const dx = (Number(locus?.x) || 0) - anchor.locus.x;
  const dy = (Number(locus?.y) || 0) - anchor.locus.y;
  if (Math.hypot(dx, dy) > anchor.locus.radius) return { ok: false, reason: 'WRONG_LOCUS', anchor };
  return { ok: true, anchor };
}

export function enactCausalAnchor(state, verb, locus) {
  const result = canEnactAnchor(state, verb, locus);
  if (!result.ok) return result;
  state.enacted.add(result.anchor.id);
  return { ok: true, anchor: result.anchor, payload: result.anchor.payload };
}

export function canUseOptionalPower(state, verb, { perceived = false, mutatesRecordedState = false } = {}) {
  if (perceived) return { ok: false, reason: 'PERCEIVED' };
  if (mutatesRecordedState) return { ok: false, reason: 'CAUSAL_MUTATION' };
  const cost = HUSH_DENSITY_COSTS[verb];
  if (!cost) return { ok: false, reason: 'UNKNOWN_POWER' };
  if (state.density - cost < HUSH_REQUIRED_RESERVE) return { ok: false, reason: 'ANCHOR_RESERVE' };
  return { ok: true, cost };
}

export function useOptionalPower(state, verb, context = {}) {
  const allowed = canUseOptionalPower(state, verb, context);
  if (!allowed.ok) return allowed;
  state.density = clamp(state.density - allowed.cost, 0, 100);
  if (verb === 'seam') state.seamsCrossed += 1;
  else state.ornaments += 1;
  return { ok: true, cost: allowed.cost };
}

export function canCrossAcousticSeam(state, { perceived = false } = {}) {
  const next = nextTimelineAnchor(state);
  if (perceived) return { ok: false, reason: 'PERCEIVED' };
  if (next && next.at - state.timeMs <= 8000) return { ok: false, reason: 'ANCHOR_PRE_ROLL' };
  return canUseOptionalPower(state, 'seam', { perceived });
}

export function tickHushPlayback(state, elapsedMs, {
  perceived = false,
  nearRecorder = false,
  requestedSpool = 1,
  borrowing = false,
} = {}) {
  if (state.completed) return { events: [], corrections: [], elapsed: 0 };
  const requested = borrowing ? 1 : Math.max(1, Number(requestedSpool) || 1);
  let wallRemaining = Math.max(0, Number(elapsedMs) || 0);
  let elapsed = 0;
  let rate = 1;
  const before = state.timeMs;
  while (wallRemaining > 0.0001 && state.timeMs < state.tape.durationMs) {
    const activeNext = nextTimelineAnchor(state);
    const remaining = activeNext ? activeNext.at - state.timeMs : Infinity;
    const allowed = borrowing ? 1 : permittedSpoolRate(remaining);
    const stepRate = Math.min(requested, allowed);
    rate = Math.max(rate, stepRate);
    let tapeStep = wallRemaining * stepRate;
    const threshold = stepRate === 4 && activeNext ? activeNext.at - 30_000
      : stepRate === 2 && activeNext ? activeNext.at - 12_000 : Infinity;
    if (Number.isFinite(threshold) && state.timeMs < threshold && state.timeMs + tapeStep > threshold) {
      const toThreshold = threshold - state.timeMs;
      state.timeMs += toThreshold;
      elapsed += toThreshold;
      wallRemaining -= toThreshold / stepRate;
      continue;
    }
    tapeStep = Math.min(tapeStep, state.tape.durationMs - state.timeMs);
    state.timeMs += tapeStep;
    elapsed += tapeStep;
    wallRemaining = 0;
  }

  if (!perceived) {
    const recharge = (nearRecorder ? 12 : 8) * (Math.max(0, Number(elapsedMs) || 0) / 1000);
    state.density = clamp(state.density + recharge, 0, 100);
  }
  state.borrowMs = borrowing ? Math.min(3000, state.borrowMs + Math.max(0, Number(elapsedMs) || 0)) : 0;

  const events = state.tape.events.filter((event) => event.at >= before
    && event.at <= state.timeMs
    && !state.emittedEvents.has(event.id));
  events.forEach((event) => state.emittedEvents.add(event.id));
  state.initialized = true;
  const corrections = state.tape.anchors.filter((anchor) => anchor.at >= before
    && anchor.at <= state.timeMs
    && !state.enacted.has(anchor.id)
    && !state.corrected.has(anchor.id));
  corrections.forEach((anchor) => state.corrected.add(anchor.id));
  if (state.timeMs >= state.tape.durationMs) state.completed = true;
  return { events, corrections, elapsed, rate, completed: state.completed };
}

export function hushPlaybackReport(state) {
  const sync = synchronizationResult(state.tape.anchors, state.enacted);
  return {
    ...sync,
    manualCauses: state.enacted.size,
    totalCauses: state.tape.anchors.length,
    corrections: state.corrected.size,
    ornaments: state.ornaments,
    acousticSeams: state.seamsCrossed,
    terminalFiles: state.filesOpened.size,
  };
}

export function borrowView(state) {
  if (state.borrowMs >= 3000) return null;
  const next = nextTimelineAnchor(state);
  if (!next || next.at - state.timeMs > 8000) return null;
  return shadowFrameAt(state.tape, state.timeMs);
}
