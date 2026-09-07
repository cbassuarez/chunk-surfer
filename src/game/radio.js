import * as REC from './recordist.js';
import { dreadAllowed } from './terror.js';
import { RADIO_CUES } from '../data/radio-cues.js';
import {
  freshRadioGuidanceState,
  normalizeRadioGuidanceState,
  resolveRadioCall,
  radioRuntimeReadiness,
  radioTargetReadiness,
  RADIO_TRAVERSAL_GAP_MS,
} from './radio-guidance.js';

export { RADIO_CUES } from '../data/radio-cues.js';
export { RADIO_CALL_KIND } from './radio-guidance.js';
export { radioRuntimeReadiness, radioTargetReadiness } from './radio-guidance.js';

export const RADIO_PHASE = Object.freeze({ LIVE:'live', FAILING:'failing', DEAD:'dead' });
export const RADIO_CALL = Object.freeze({ IDLE:'idle', CALLING:'calling' });
export const RADIO = Object.freeze({
  callTimeoutMs: 24000,
  deploymentDelayMs: 2500,
  deploymentCooldownMs: 35000,
  breakdownFallbackMs: 12000,
  recentIncidentMs: 30000,
  pulseOffsetsMs: [0, 1400, 3200],
  failingFaultRangeMs: [35000, 55000],
  deadFaultRangeMs: [22000, 38000],
  noiseLevel: { live:.38, failing:.31, dead:.24 },
  approachMeters: 8,
  warningBreathingMs: RADIO_TRAVERSAL_GAP_MS,
  cancelledRetryMs: 5000,
});

const milestoneDefaults = () => Object.fromEntries(Object.values(RADIO_CUES).map((id) => [id, false]));
const fresh = () => ({
  schema: 4,
  transmissions: 0,
  phase: RADIO_PHASE.LIVE,
  diedAt: 0,
  deathCause: null,
  squelches: 0,
  dropped: null,
  milestones: milestoneDefaults(),
  pendingCue: null,
  activeCue: null,
  candidateRoom: null,
  missed: [],
  guidance: freshRadioGuidanceState(),
  runtimeContext: {},
  call: { status:RADIO_CALL.IDLE, deadlineAt:0, nextPulseAt:0 },
  scheduler: { deployCooldownUntil:0, nextFaultAt:0, pulses:[] },
  lastCarrierPosition: { x:0, y:0 },
  onSquelch: null,
  onLine: null,
  onMissed: null,
});

let state = fresh();

const nowMs = () => performance.now();
const knownCue = (id) => Object.values(RADIO_CUES).includes(id);
const milestoneDone = (id) => !!state.milestones[id];
const remaining = (value) => Math.max(0, Math.min(120000, Number(value) || 0));
const cueCopy = (cue) => {
  if (!cue) return null;
  const copy = { ...cue };
  if (!copy.entry) delete copy.entry;
  if (!copy.context) delete copy.context;
  else copy.context = { ...copy.context };
  return copy;
};
const locationCopy = (at) => at ? { ...at } : null;

export function radioInit({ squelch, line, missed } = {}) {
  state.onSquelch = squelch || null;
  state.onLine = line || null;
  state.onMissed = missed || null;
}

export function radioState() {
  return {
    ...state,
    dead: isDead(),
    dropped: locationCopy(state.dropped),
    milestones: { ...state.milestones },
    pendingCue: cueCopy(state.pendingCue),
    activeCue: cueCopy(state.activeCue),
    missed: [...state.missed],
    guidance: normalizeRadioGuidanceState(state.guidance),
    call: { ...state.call },
    scheduler: { ...state.scheduler, pulses:[...state.scheduler.pulses] },
    lastCarrierPosition: { ...state.lastCarrierPosition },
    onSquelch: undefined,
    onLine: undefined,
    onMissed: undefined,
    runtimeContext: undefined,
  };
}

export const radioPhase = () => state.phase;
export const isDead = () => state.phase === RADIO_PHASE.DEAD;
export const isFailing = () => state.phase === RADIO_PHASE.FAILING;
export const squelchCount = () => state.squelches;
export const isDropped = () => !!state.dropped;
export const radioLocation = () => locationCopy(state.dropped);
export const radioMilestones = () => ({ ...state.milestones });
export const pendingRadioCue = () => cueCopy(state.pendingCue);
export const activeRadioCue = () => cueCopy(state.activeCue);
export const missedRadioCues = () => [...state.missed];
export const radioCallState = () => ({ ...state.call });
export const radioCalling = () => state.call.status === RADIO_CALL.CALLING;
export const radioCarrierOpen = () => radioCalling() || state.scheduler.pulses.length > 0;
export const radioGuidanceState = () => normalizeRadioGuidanceState(state.guidance);
export const radioDeathCause = () => state.deathCause;
export const originalBreakdownArmed = () => !!state.guidance.originalBreakdown.armed;
export const originalBreakdownStarted = () =>
  milestoneDone(RADIO_CUES.PRE_THIRD)
  || state.pendingCue?.id === RADIO_CUES.PRE_THIRD
  || state.activeCue?.id === RADIO_CUES.PRE_THIRD;

export function radioPresentation() {
  const phase = state.phase === RADIO_PHASE.LIVE ? 'LIVE' : state.phase === RADIO_PHASE.FAILING ? 'CARRIER UNSTABLE' : 'DEAD';
  return {
    phase,
    activity: radioCalling() ? 'CALLING' : state.scheduler.pulses.length ? 'FAULT' : 'QUIET',
    location: state.dropped ? 'DEPLOYED' : 'CARRIED',
    dropped: locationCopy(state.dropped),
    deathCause: state.deathCause,
  };
}

export function queueRadioCue(id, {
  roomId = null,
  reason = '',
  entry = null,
  context = null,
  now = nowMs(),
} = {}) {
  if (!knownCue(id) || isDead() || milestoneDone(id) || state.activeCue || state.pendingCue) return false;
  state.pendingCue = {
    id,
    roomId: roomId || null,
    reason: reason || '',
    entry: entry || null,
    context: context ? { ...context } : null,
    queuedAt: now,
  };
  if (roomId) state.candidateRoom = roomId;
  if (state.dropped) armDroppedRadioCall(now);
  return true;
}

export function armDroppedRadioCall(now = nowMs()) {
  if (!state.dropped || !state.pendingCue || state.pendingCue.deferredUntilPickup
    || state.pendingCue.resumeAfterTraversalMs > 0 || radioCalling()) return false;
  state.call = { status:RADIO_CALL.CALLING, deadlineAt:now + RADIO.callTimeoutMs, nextPulseAt:now };
  return true;
}

export function consumeRadioCue(context = state.runtimeContext) {
  if (!state.pendingCue || state.dropped || isDead() || state.activeCue
    || state.pendingCue.deferredUntilPickup || state.pendingCue.resumeAfterTraversalMs > 0
    || !radioRuntimeReadiness(context).ready) return null;
  if (state.pendingCue.id === RADIO_CUES.POST_SECOND
    && (Number(context.completedJobTakes) < 2 || !Number.isFinite(Number(context.completedJobTakes))
      || !milestoneDone(RADIO_CUES.INITIAL)
      || state.guidance.traversal.sinceInitialMs < RADIO.warningBreathingMs)) return null;
  if (state.pendingCue.id === RADIO_CUES.PRE_THIRD) {
    if (!(Number(context.completedJobTakes) >= 2) || !milestoneDone(RADIO_CUES.POST_SECOND)
      || state.guidance.traversal.sinceWarningMs < RADIO.warningBreathingMs
      || !radioTargetReadiness(context.target, context).ready
      || context.target.roomId !== state.pendingCue.roomId
      || context.target.distanceMeters > RADIO.approachMeters) return null;
  }
  const cue = state.pendingCue;
  state.pendingCue = null;
  state.call = { status:RADIO_CALL.IDLE, deadlineAt:0, nextPulseAt:0 };
  state.activeCue = { ...cue, startedAt:nowMs() };
  return cueCopy(state.activeCue);
}

function rangeForPhase() {
  return state.phase === RADIO_PHASE.DEAD ? RADIO.deadFaultRangeMs : RADIO.failingFaultRangeMs;
}

function scheduleNextFault(now, random = .5) {
  if (state.phase === RADIO_PHASE.LIVE) {
    state.scheduler.nextFaultAt = 0;
    return 0;
  }
  const [lo, hi] = rangeForPhase();
  const r = Math.max(0, Math.min(.999999, Number(random) || 0));
  state.scheduler.nextFaultAt = now + lo + (hi - lo) * r;
  return state.scheduler.nextFaultAt;
}

function applyCueOutcome(id, now) {
  state.milestones[id] = true;
  if (id === RADIO_CUES.INITIAL) state.guidance.traversal.sinceInitialMs = 0;
  if (id === RADIO_CUES.POST_SECOND && state.phase === RADIO_PHASE.LIVE) {
    state.guidance.traversal.sinceWarningMs = 0;
    state.phase = RADIO_PHASE.FAILING;
    scheduleNextFault(now, .5);
  }
  if (id === RADIO_CUES.PRE_THIRD) killRadio({ now, cause:'original-breakdown' });
  if (id === RADIO_CUES.HUSH_RUPTURE) killRadio({ now, cause:'second-danger-call' });
}

export function resolveRadioCue(id, { now = nowMs() } = {}) {
  if (!knownCue(id) || milestoneDone(id) || state.activeCue?.id !== id) return false;
  applyCueOutcome(id, now);
  if (state.activeCue?.id === id) state.activeCue = null;
  if (state.pendingCue?.id === id) state.pendingCue = null;
  state.call = { status:RADIO_CALL.IDLE, deadlineAt:0, nextPulseAt:0 };
  return true;
}

// Closing prose is not hearing its last line. Requeue it with a traversal-only
// quiet interval; a failed scene allocation also uses this path.
export function cancelRadioCue(id, { now = nowMs(), reason = 'cancelled', retryAfterMs = RADIO.cancelledRetryMs } = {}) {
  if (!knownCue(id) || milestoneDone(id) || state.activeCue?.id !== id) return false;
  const { startedAt, ...cue } = state.activeCue;
  state.activeCue = null;
  state.pendingCue = {
    ...cue, cancelledAt:now, cancelReason:reason,
    resumeAfterTraversalMs:remaining(retryAfterMs),
  };
  state.call = { status:RADIO_CALL.IDLE, deadlineAt:0, nextPulseAt:0 };
  return true;
}

export function missPendingRadioCue({ now = nowMs() } = {}) {
  const cue = state.pendingCue;
  if (!cue || cue.deferredUntilPickup) return null;
  // The radio may stop ringing, but its unheard scene cannot resolve offstage.
  // Pickup is the only rearm: tick cannot create an endless ring/miss loop.
  state.pendingCue = { ...cue, deferredUntilPickup:true };
  state.call = { status:RADIO_CALL.IDLE, deadlineAt:0, nextPulseAt:0 };
  if (!state.missed.includes(cue.id)) state.missed.push(cue.id);
  const event = { ...cue, missedAt:now };
  state.onMissed?.(event);
  return event;
}

export function shouldQueuePostSecondTake(context = state.runtimeContext) {
  return state.phase === RADIO_PHASE.LIVE
    && radioRuntimeReadiness(context).ready
    && Number(context.completedJobTakes) >= 2
    && milestoneDone(RADIO_CUES.INITIAL)
    && state.guidance.traversal.sinceInitialMs >= RADIO.warningBreathingMs
    && !state.activeCue && !state.pendingCue
    && !milestoneDone(RADIO_CUES.POST_SECOND);
}

export function shouldQueuePreThirdBreakdown(context = state.runtimeContext) {
  return state.phase === RADIO_PHASE.FAILING
    && radioRuntimeReadiness(context).ready
    && Number(context.completedJobTakes) >= 2
    && radioTargetReadiness(context.target, context).ready
    && state.guidance.traversal.sinceWarningMs >= RADIO.warningBreathingMs
    && !state.activeCue && !state.pendingCue
    && milestoneDone(RADIO_CUES.POST_SECOND)
    && !milestoneDone(RADIO_CUES.PRE_THIRD)
    && !milestoneDone(RADIO_CUES.HUSH_RUPTURE)
    && !originalBreakdownStarted()
    && context.target.distanceMeters <= RADIO.approachMeters;
}

export function armOriginalBreakdown({ now = nowMs(), delayMs = RADIO.breakdownFallbackMs, ...context } = state.runtimeContext) {
  if (isDead() || milestoneDone(RADIO_CUES.PRE_THIRD) || originalBreakdownStarted()) return false;
  if (state.guidance.originalBreakdown.armed) return false;
  if (!shouldQueuePreThirdBreakdown(context)) return false;
  state.guidance = {
    ...state.guidance,
    originalBreakdown: {
      armed: true,
      roomId: context.target.roomId,
      floorId: context.target.floorId,
      armedAt: now,
      activeMs: 0,
      delayMs: remaining(delayMs),
      // Kept for diagnostics/old saves, never used to advance the beat.
      fallbackAt: now + Math.max(0, Number(delayMs) || 0),
    },
  };
  return true;
}

export function originalBreakdownFallbackReady(context = state.runtimeContext) {
  const breakdown = state.guidance.originalBreakdown;
  return !!breakdown.armed && !originalBreakdownStarted()
    && radioRuntimeReadiness(context).ready
    && radioTargetReadiness(context.target, context).ready
    && context.target.roomId === breakdown.roomId
    && context.target.floorId === breakdown.floorId
    && context.target.distanceMeters <= RADIO.approachMeters
    && Number(context.completedJobTakes) >= 2
    && breakdown.activeMs >= breakdown.delayMs;
}

/** Feed simulation delta, not elapsed wall-clock time. Modal frames earn no credit. */
export function updateRadioProgression(dt, context = {}) {
  state.runtimeContext = { ...context, target:context.target ? { ...context.target } : null };
  const ready = radioRuntimeReadiness(context).ready;
  const elapsedMs = ready && !state.activeCue ? Math.min(.25, Math.max(0, Number(dt) || 0)) * 1000 : 0;
  let changed = false;
  let breakdownReset = false;
  const traversal = state.guidance.traversal;
  for (const [cue, key] of [[RADIO_CUES.INITIAL, 'sinceInitialMs'], [RADIO_CUES.POST_SECOND, 'sinceWarningMs']]) {
    if (milestoneDone(cue) && elapsedMs && traversal[key] < 120000) {
      traversal[key] = Math.min(120000, traversal[key] + elapsedMs);
      changed = true;
    }
  }
  if (state.pendingCue?.resumeAfterTraversalMs > 0 && elapsedMs) {
    state.pendingCue.resumeAfterTraversalMs = Math.max(0, state.pendingCue.resumeAfterTraversalMs - elapsedMs);
    changed = true;
  }
  const breakdown = state.guidance.originalBreakdown;
  if (!state.activeCue && state.pendingCue?.id === RADIO_CUES.PRE_THIRD
    && (!radioTargetReadiness(context.target, context).ready
      || context.target.roomId !== state.pendingCue.roomId
      || context.target.distanceMeters > RADIO.approachMeters)) {
    state.pendingCue = null;
    state.call = { status:RADIO_CALL.IDLE, deadlineAt:0, nextPulseAt:0 };
    changed = true;
  }
  if (breakdown.armed && !state.activeCue) {
    const valid = radioTargetReadiness(context.target, context).ready
      && context.target.roomId === breakdown.roomId
      && context.target.floorId === breakdown.floorId
      && context.target.distanceMeters <= RADIO.approachMeters
      && Number(context.completedJobTakes) >= 2;
    if (!valid) {
      state.guidance.originalBreakdown = { ...freshRadioGuidanceState().originalBreakdown };
      // An inbound target was left or recorded while its radio was deployed.
      // Rebuild the cue at the next real eligible target, not at stale geometry.
      if (state.pendingCue?.id === RADIO_CUES.PRE_THIRD) {
        state.pendingCue = null;
        state.call = { status:RADIO_CALL.IDLE, deadlineAt:0, nextPulseAt:0 };
      }
      breakdownReset = changed = true;
    } else if (elapsedMs && !state.pendingCue && breakdown.activeMs < breakdown.delayMs) {
      breakdown.activeMs = Math.min(breakdown.delayMs, breakdown.activeMs + elapsedMs);
      changed = true;
    }
  }
  return { ready, changed, breakdownReset };
}

export function noteRadioDangerIncident({ now = nowMs(), durationMs = RADIO.recentIncidentMs, kind = 'contact' } = {}) {
  state.guidance = {
    ...state.guidance,
    recentIncidentUntil: Math.max(state.guidance.recentIncidentUntil, now + Math.max(0, Number(durationMs) || 0)),
    recentIncidentKind: kind || 'contact',
  };
  return state.guidance.recentIncidentUntil;
}

export function radioDangerContext({ now = nowMs() } = {}) {
  return state.guidance.recentIncidentUntil > 0 && now <= state.guidance.recentIncidentUntil;
}

export function radioDangerIncidentKind({ now = nowMs() } = {}) {
  return radioDangerContext({ now }) ? (state.guidance.recentIncidentKind || 'contact') : null;
}

export function resolveManualRadioCall(options = {}) {
  if (isDead() || isDropped()) return null;
  const resolved = resolveRadioCall({
    ...options,
    state: state.guidance,
    originalBreakdownStarted: options.originalBreakdownStarted ?? originalBreakdownStarted(),
  });
  state.guidance = resolved.state;
  return { ...resolved, state:radioGuidanceState() };
}

function queueCluster(at) {
  for (const offset of RADIO.pulseOffsetsMs) state.scheduler.pulses.push(at + offset);
  state.scheduler.pulses.sort((a, b) => a - b);
}

export function dropRadio(x, y, { roomId = null, floorId = null, now = nowMs() } = {}) {
  if (state.dropped) return false;
  state.dropped = { x:Math.round(x), y:Math.round(y), roomId:roomId || null, floorId:floorId || null };
  if (now >= state.scheduler.deployCooldownUntil) {
    queueCluster(now + RADIO.deploymentDelayMs);
    state.scheduler.deployCooldownUntil = now + RADIO.deploymentCooldownMs;
  }
  if (state.pendingCue) armDroppedRadioCall(now);
  return true;
}

export function pickUpRadio(x, y, maxCells = 4) {
  if (!state.dropped || Math.hypot(state.dropped.x - x, state.dropped.y - y) > maxCells) return false;
  state.dropped = null;
  if (state.pendingCue?.deferredUntilPickup) delete state.pendingCue.deferredUntilPickup;
  state.call = { status:RADIO_CALL.IDLE, deadlineAt:0, nextPulseAt:0 };
  return true;
}

export function transmit(lines) {
  if (isDead()) return false;
  state.transmissions++;
  state.onLine?.(lines, state.transmissions);
  return true;
}

export function killRadio({ now = nowMs(), cause = 'unknown' } = {}) {
  if (isDead()) return false;
  state.phase = RADIO_PHASE.DEAD;
  state.diedAt = now;
  state.deathCause = cause || 'unknown';
  state.guidance = {
    ...state.guidance,
    originalBreakdown: { ...freshRadioGuidanceState().originalBreakdown },
  };
  scheduleNextFault(now, .5);
  return true;
}

function emitPulse(now, { kind = 'fault' } = {}) {
  const at = state.dropped || state.lastCarrierPosition;
  REC.emitNoise(RADIO.noiseLevel[state.phase] || .24, at.x, at.y, 'the radio squelches', {
    spoils: !state.dropped,
    kind: 'radio_squelch',
    sourceKind: 'equipment',
    sourceId: 'radio',
    playerGenerated: false,
    deliberate: kind === 'deployment',
    audibleToHush: true,
  });
  state.squelches++;
  const event = { at:now, index:state.squelches, x:at.x, y:at.y, dropped:!!state.dropped, phase:state.phase, kind };
  state.onSquelch?.(event);
  return event;
}

export function tickRadio(dt, { px = 0, py = 0, now = nowMs(), random = Math.random } = {}) {
  void dt;
  state.lastCarrierPosition = { x:px, y:py };
  const events = [];
  if (state.dropped && state.pendingCue && !radioCalling()) armDroppedRadioCall(now);
  if (radioCalling()) {
    if (now >= state.call.deadlineAt) {
      const missed = missPendingRadioCue({ now });
      if (missed) events.push({ type:'missed', cue:missed });
    } else if (now >= state.call.nextPulseAt) {
      events.push({ type:'pulse', event:emitPulse(now, { kind:'call' }) });
      state.call.nextPulseAt = now + 4200;
    }
  }
  if (dreadAllowed() && state.scheduler.pulses.length && now >= state.scheduler.pulses[0]) {
    state.scheduler.pulses.shift();
    events.push({ type:'pulse', event:emitPulse(now, { kind:'deployment' }) });
  }
  if (dreadAllowed() && state.phase !== RADIO_PHASE.LIVE && state.scheduler.nextFaultAt && now >= state.scheduler.nextFaultAt) {
    queueCluster(now);
    scheduleNextFault(now, random());
  }
  if (dreadAllowed() && state.scheduler.pulses.length && now >= state.scheduler.pulses[0]) {
    state.scheduler.pulses.shift();
    events.push({ type:'pulse', event:emitPulse(now, { kind:'fault' }) });
  }
  return events;
}

export function saveRadioState(now = nowMs()) {
  const guidance = radioGuidanceState();
  return {
    schema: 4,
    transmissions: state.transmissions,
    phase: state.phase,
    dead: isDead(),
    deathCause: state.deathCause,
    squelches: state.squelches,
    dropped: locationCopy(state.dropped),
    milestones: { ...state.milestones },
    pendingCue: cueCopy(state.pendingCue),
    activeCue: cueCopy(state.activeCue),
    candidateRoom: state.candidateRoom || null,
    missed: [...state.missed],
    guidance: {
      assignedRoomId: guidance.assignedRoomId,
      repeatCounts: { ...guidance.repeatCounts },
      dangerCallCount: guidance.dangerCallCount,
      recentIncidentRemainingMs: remaining(guidance.recentIncidentUntil - now),
      recentIncidentKind: guidance.recentIncidentKind,
      traversal: { ...guidance.traversal },
      originalBreakdown: {
        armed: guidance.originalBreakdown.armed,
        roomId: guidance.originalBreakdown.roomId,
        armedAt: guidance.originalBreakdown.armedAt,
        floorId: guidance.originalBreakdown.floorId,
        activeMs: guidance.originalBreakdown.activeMs,
        delayMs: guidance.originalBreakdown.delayMs,
        fallbackRemainingMs: remaining(guidance.originalBreakdown.delayMs - guidance.originalBreakdown.activeMs),
      },
    },
    call: {
      status: state.call.status,
      deadlineRemainingMs: remaining(state.call.deadlineAt - now),
      nextPulseRemainingMs: remaining(state.call.nextPulseAt - now),
    },
    scheduler: {
      deployCooldownRemainingMs: remaining(state.scheduler.deployCooldownUntil - now),
      nextFaultRemainingMs: remaining(state.scheduler.nextFaultAt - now),
      pulseRemainingMs: state.scheduler.pulses.map((at) => remaining(at - now)),
    },
  };
}

export function loadRadioState(saved = {}, now = nowMs()) {
  const schema = Number(saved.schema || 0);
  const old = schema < 2;
  const milestones = Object.fromEntries(Object.values(RADIO_CUES).map((id) => [id, saved.milestones?.[id] === true]));
  const legacyDead = saved.dead === true;
  const hooks = { onSquelch:state.onSquelch, onLine:state.onLine, onMissed:state.onMissed };
  const savedCue = saved.pendingCue || saved.activeCue;
  const guidanceSaved = schema >= 3 ? (saved.guidance || {}) : {};
  const guidance = normalizeRadioGuidanceState({
    assignedRoomId: guidanceSaved.assignedRoomId,
    repeatCounts: guidanceSaved.repeatCounts,
    dangerCallCount: guidanceSaved.dangerCallCount,
    recentIncidentUntil: guidanceSaved.recentIncidentRemainingMs ? now + remaining(guidanceSaved.recentIncidentRemainingMs) : 0,
    recentIncidentKind: guidanceSaved.recentIncidentKind || null,
    traversal: schema >= 4 ? guidanceSaved.traversal : null,
    originalBreakdown: {
      armed: !!guidanceSaved.originalBreakdown?.armed,
      roomId: guidanceSaved.originalBreakdown?.roomId || null,
      armedAt: Number(guidanceSaved.originalBreakdown?.armedAt) || 0,
      floorId: guidanceSaved.originalBreakdown?.floorId || null,
      activeMs: schema >= 4 ? guidanceSaved.originalBreakdown?.activeMs : 0,
      delayMs: schema >= 4 ? guidanceSaved.originalBreakdown?.delayMs : RADIO.breakdownFallbackMs,
      fallbackAt: guidanceSaved.originalBreakdown?.fallbackRemainingMs
        ? now + remaining(guidanceSaved.originalBreakdown.fallbackRemainingMs)
        : 0,
    },
  });

  state = {
    ...fresh(),
    ...hooks,
    transmissions: Number(saved.transmissions) || 0,
    phase: legacyDead ? RADIO_PHASE.DEAD : Object.values(RADIO_PHASE).includes(saved.phase) ? saved.phase
      : old && milestones[RADIO_CUES.POST_SECOND] ? RADIO_PHASE.FAILING : RADIO_PHASE.LIVE,
    deathCause: legacyDead || saved.phase === RADIO_PHASE.DEAD ? (saved.deathCause || 'legacy') : null,
    squelches: Number(saved.squelches) || 0,
    dropped: saved.dropped && Number.isFinite(saved.dropped.x) && Number.isFinite(saved.dropped.y)
      ? { x:Math.round(saved.dropped.x), y:Math.round(saved.dropped.y), roomId:saved.dropped.roomId || null, floorId:saved.dropped.floorId || null }
      : null,
    milestones,
    pendingCue: savedCue && knownCue(savedCue.id) && !milestones[savedCue.id]
      ? {
          id: savedCue.id,
          roomId: savedCue.roomId || null,
          reason: savedCue.reason || '',
          entry: savedCue.entry || null,
          context: savedCue.context ? { ...savedCue.context } : null,
          queuedAt: Number(savedCue.queuedAt) || now,
          ...(savedCue.deferredUntilPickup === true && saved.dropped ? { deferredUntilPickup:true } : {}),
          ...(savedCue.resumeAfterTraversalMs > 0 ? { resumeAfterTraversalMs:remaining(savedCue.resumeAfterTraversalMs) } : {}),
        }
      : null,
    candidateRoom: saved.candidateRoom || null,
    missed: Array.isArray(saved.missed) ? saved.missed.filter(knownCue) : [],
    guidance,
  };

  const call = saved.call || {};
  const scheduler = saved.scheduler || {};
  state.call = {
    status: state.dropped && state.pendingCue && !state.pendingCue.deferredUntilPickup
      && call.status === RADIO_CALL.CALLING ? RADIO_CALL.CALLING : RADIO_CALL.IDLE,
    deadlineAt: now + remaining(call.deadlineRemainingMs),
    nextPulseAt: now + remaining(call.nextPulseRemainingMs),
  };
  state.scheduler = {
    deployCooldownUntil: now + remaining(scheduler.deployCooldownRemainingMs),
    nextFaultAt: scheduler.nextFaultRemainingMs ? now + remaining(scheduler.nextFaultRemainingMs) : 0,
    pulses: (scheduler.pulseRemainingMs || []).map((value) => now + remaining(value)).sort((a, b) => a - b),
  };
  if (state.phase !== RADIO_PHASE.LIVE && !state.scheduler.nextFaultAt) scheduleNextFault(now, .5);
  return radioState();
}

export function resetRadioState() {
  const hooks = { onSquelch:state.onSquelch, onLine:state.onLine, onMissed:state.onMissed };
  state = { ...fresh(), ...hooks };
  return radioState();
}
