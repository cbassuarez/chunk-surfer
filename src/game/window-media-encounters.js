import { STUDY_EVENTS } from '../platform/window-media-studies.js';

export const WINDOW_MEDIA_ENCOUNTER_STUDIES = Object.freeze({
  QUORUM: 'quorum', RETAINED: 'retained', ROOM: 'room', WEIGHT: 'weight',
});
export const WINDOW_MEDIA_ENCOUNTER_TIMING = Object.freeze({
  quorumMinimum: 10, quorumDuration: 18, retainedOccupy: 3.5, retainedDuration: 7,
  roomDuration: 16, weightDuration: 16,
});
const finite = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const endingPhases = new Set(['ending', 'returned', 'completed']);
const endingTypes = new Set(['ending-start', 'restore', 'restore-start', 'restore-ready', 'return-ready',
  'handoff', 'handoff-begin', 'handoff-dispatch', 'return', 'complete', 'exit', 'error']);
const studies = WINDOW_MEDIA_ENCOUNTER_STUDIES, timing = WINDOW_MEDIA_ENCOUNTER_TIMING;

// Passive presentation only. This controller consumes observed world facts;
// it cannot move a body, stop a threat, perform a release or consent to Contact.
// Its clock is supplied active dt, never scene timestamps or wall timers.
export function createWindowMediaEncounters({ onCommand = () => {}, onTrace = () => {} } = {}) {
  let state = null, serial = 0;
  function trace(action, detail = {}) {
    try { onTrace({ type: 'window-media-encounter', action, owner: state?.owner ?? null,
      clock: state?.clock ?? 0, ...detail }); } catch (_) {}
  }
  function command(value) {
    trace('command', { command: { ...value } });
    try {
      const pending = onCommand(value);
      // Presentation is host-owned. A failed passive delivery cannot break
      // the scene's controller or become an unhandled async rejection.
      pending?.catch?.(error => trace('delivery-error', { key: value.key, error: String(error?.message || error) }));
    } catch (error) { trace('delivery-error', { key: value.key, error: String(error?.message || error) }); }
  }
  function finishStudy(reason) {
    if (!state?.active) return false;
    const active = state.active;
    state.active = null;
    command({ type: 'end', study: active.study, owner: state.owner, key: active.key, reason });
    return true;
  }
  function show(study, reason) {
    if (!state || state.shown[study] || state.showCount >= 4) return false;
    finishStudy('replaced');
    state.shown[study] = true; state.showCount++;
    state.active = { study, key: ++serial, startedAt: state.clock };
    if (study === studies.QUORUM) state.quorumStartedAt = state.clock;
    command({ type: 'show', study, owner: state.owner, key: state.active.key, reason });
    return true;
  }
  function event(name) {
    if (!state?.active) return;
    command({ type: 'event', study: state.active.study, event: name, owner: state.owner, key: state.active.key });
  }
  function maybeRetained() {
    if (!state || state.shown[studies.RETAINED] || !state.shown[studies.QUORUM]
      || state.quorumStartedAt === null || state.clock - state.quorumStartedAt < timing.quorumMinimum
      || !state.live || !state.liveWitnessed) return false;
    return show(studies.RETAINED, 'performed-action-still-live');
  }
  function end(owner, reason = 'owner-ended') {
    if (!state || state.owner !== owner) return false;
    finishStudy(reason); trace('owner-ended', { reason }); state = null;
    return true;
  }
  function begin(owner, { elapsed = 0, referenceStarted = false } = {}) {
    if (owner == null || owner === '') return false;
    if (state?.owner === owner) return snapshot();
    if (state) end(state.owner, 'owner-preempted');
    state = { owner, clock: 0, hostElapsed: finite(elapsed), active: null, showCount: 0,
      shown: { quorum: false, retained: false, room: false, weight: false }, quorumStartedAt: null,
      live: false, liveWitnessed: false, liveId: null, retainedReleasedAt: null, retainedOccupied: false,
      phase: null, weightPending: false, falling: false, recovering: false, revealing: false, inRefuge: false,
      liveSafety: null };
    trace('owner-began', { hostElapsed: state.hostElapsed, referenceStarted: !!referenceStarted });
    // A resumed awake world is an observed source, not permission to jump to
    // a later unseen media beat. Its fresh passive presentation starts at zero.
    if (referenceStarted) show(studies.QUORUM, 'reference-already-awake');
    return snapshot();
  }
  function observeSafety(owner, value = {}) {
    if (!state || state.owner !== owner || !value || typeof value !== 'object') return false;
    // Actual current-frame safety is an independent veto. A queued 10 Hz pose
    // can omit fall, or describe a safe instant immediately before a new fall.
    // It must not erase this guard. Only genuine trace telemetry grants refuge.
    state.liveSafety = { phase: value.phase ?? null, falling: !!value.fall,
      recovering: !!value.recovery, revealing: !!value.reveal };
    const unsafe = state.liveSafety.falling || state.liveSafety.recovering || state.liveSafety.revealing
      || state.liveSafety.phase !== null && state.liveSafety.phase !== 'catch';
    if (unsafe) {
      state.inRefuge = false;
      if (state.active?.study === studies.WEIGHT) finishStudy('live-frame-unsafe');
    }
    return true;
  }
  function observe(owner, value = {}) {
    if (!state || state.owner !== owner || !value || typeof value !== 'object') return false;
    if (Number.isFinite(Number(value.elapsed))) state.hostElapsed = Math.max(state.hostElapsed, finite(value.elapsed));
    const observed = value.type === 'event' && value.event && typeof value.event === 'object' ? value.event : value;
    const phase = observed.phase ?? value.phase;
    if (phase != null) state.phase = phase;
    if (endingPhases.has(state.phase) || endingTypes.has(value.type) || endingTypes.has(observed.type)) {
      return end(owner, `world-${observed.type || value.type || state.phase}`);
    }
    // The doorway relationship belongs to Wrong Return; it must yield before
    // any overhead pursuit decision, including on a repeated reverse crossing.
    if (state.phase === 'catch' && state.active?.study === studies.ROOM) finishStudy('entered-catch');
    if (observed.type === 'memory-awake' || observed.type === 'reference-start') show(studies.QUORUM, 'memory-awake');
    if (observed.type === 'live-start') {
      state.live = true; state.liveWitnessed = true; state.liveId = observed.id ?? null;
      maybeRetained();
    } else if (observed.type === 'live-stop') {
      const matching = observed.id == null || state.liveId == null || observed.id === state.liveId;
      const released = matching && state.live && state.liveWitnessed && observed.reason === 'release'
        && state.active?.study === studies.RETAINED && state.retainedReleasedAt === null;
      if (matching) { state.live = false; state.liveWitnessed = false; state.liveId = null; }
      if (released) {
        state.retainedReleasedAt = state.clock;
        event(STUDY_EVENTS.RETAINED_RELEASE);
      }
    }
    if (observed.type === 'return-recognized' && state.phase !== 'catch') show(studies.ROOM, 'altered-return-already-recognized');
    if (observed.type === 'counterweight-release' || (observed.type === 'recovered' && observed.reason === 'counterweight')) {
      if (!state.shown[studies.WEIGHT]) state.weightPending = true;
    }
    const boundary = value.type === 'control-boundary' ? value.reason : observed.type;
    if (boundary === 'drop' || boundary === 'fall' || boundary === 'fall-start') {
      state.falling = true; state.inRefuge = false;
      if (state.active?.study === studies.WEIGHT) finishStudy('player-falling');
    } else if (boundary === 'capture' || boundary === 'recovery-start') {
      state.recovering = true; state.inRefuge = false;
      if (state.active?.study === studies.WEIGHT) finishStudy('player-recovery');
    } else if (boundary === 'land' || boundary === 'recovered') {
      state.falling = false; if (boundary === 'recovered') state.recovering = false;
    }
    if (value.type === 'pose') {
      if (Array.isArray(value.memories)) {
        // A pose corroborates current performance but cannot invent the
        // live-start event needed to stage a meaningful retained reference.
        state.live = state.liveWitnessed && value.memories.some(memory => memory?.live === true);
        if (!state.live) { state.liveId = null; state.liveWitnessed = false; }
        maybeRetained();
      }
      if (Object.hasOwn(value, 'fall')) state.falling = !!value.fall;
      if (Object.hasOwn(value, 'recovery')) state.recovering = !!value.recovery;
      if (Object.hasOwn(value, 'reveal')) state.revealing = !!value.reveal;
      const liveSafe = !state.liveSafety || (!state.liveSafety.falling && !state.liveSafety.recovering
        && !state.liveSafety.revealing && (state.liveSafety.phase === null || state.liveSafety.phase === 'catch'));
      const safe = liveSafe && state.phase === 'catch' && value.threat?.refuge === true
        && !state.falling && !state.recovering && !state.revealing;
      state.inRefuge = safe;
      if (state.active?.study === studies.WEIGHT && !safe) finishStudy('refuge-no-longer-safe');
      if (state.weightPending && safe && !state.shown[studies.WEIGHT]) {
        state.weightPending = false; show(studies.WEIGHT, 'counterweight-witnessed-from-refuge');
      }
    }
    return true;
  }
  function tick(dt, { paused = false, hidden = false } = {}) {
    if (!state || paused || hidden) return snapshot();
    state.clock += finite(dt);
    maybeRetained();
    const active = state.active;
    if (!active) return snapshot();
    const elapsed = state.clock - active.startedAt;
    if (active.study === studies.RETAINED && state.retainedReleasedAt !== null) {
      const releasedFor = state.clock - state.retainedReleasedAt;
      if (releasedFor >= timing.retainedOccupy && !state.retainedOccupied) {
        state.retainedOccupied = true; event(STUDY_EVENTS.RETAINED_OCCUPY);
      }
      if (releasedFor >= timing.retainedDuration) finishStudy('retained-complete');
    } else if ((active.study === studies.QUORUM && elapsed >= timing.quorumDuration)
      || (active.study === studies.ROOM && elapsed >= timing.roomDuration)
      || (active.study === studies.WEIGHT && elapsed >= timing.weightDuration)) finishStudy('study-complete');
    return snapshot();
  }
  function snapshot() {
    if (!state) return { owner: null, clock: 0, active: null, showCount: 0, shown: {}, keySerial: serial };
    return { owner: state.owner, clock: state.clock, hostElapsed: state.hostElapsed, phase: state.phase,
      active: state.active ? { study: state.active.study, key: state.active.key, elapsed: state.clock - state.active.startedAt } : null,
      showCount: state.showCount, shown: { ...state.shown }, keySerial: serial,
      live: state.live, liveWitnessed: state.liveWitnessed, retainedReleased: state.retainedReleasedAt !== null,
      retainedOccupied: state.retainedOccupied, weightPending: state.weightPending, inRefuge: state.inRefuge,
      liveSafety: state.liveSafety ? { ...state.liveSafety } : null };
  }
  return { begin, observe, observeSafety, tick, end, snapshot };
}
