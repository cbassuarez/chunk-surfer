// The work order's absolute boundary. This reducer owns no sound, camera,
// transport, microphone, injury or wall-clock access. Hosts persist its state
// before delivering effects or presenting the physical First Strike scene.
export const NIGHT_DEADLINE_SECONDS = 30120;
export const NIGHT_DEADLINE_ID = 'first-strike';
export const NIGHT_DEADLINE_LEGACY_GRACE_SECONDS = 600;
export const NIGHT_DEADLINE_WARNINGS = Object.freeze([
  Object.freeze({ key: 'site-closure', clock: '05:00', elapsedSeconds: 26520 }),
  Object.freeze({ key: 'last-call', clock: '05:30', elapsedSeconds: 28320 }),
  Object.freeze({ key: 'clearance', clock: '05:50', elapsedSeconds: 29520 }),
]);
const phases = ['unarmed', 'warning', 'pending', 'presenting', 'terminal', 'superseded'];
const number = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
const text = value => typeof value === 'string' ? value.slice(0, 512) : '';
const copy = value => value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : null;
const unique = values => [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string'))];

export function freshNightDeadline({ runId = '', legacy = false } = {}) {
  return { schema: 1, system: NIGHT_DEADLINE_ID, runId: text(runId), eventId: runId ? `night-deadline:${runId}` : '',
    phase: 'unarmed', enrolled: false, enrolledAtElapsed: null, legacy: !!legacy, graceRemainingSeconds: legacy ? NIGHT_DEADLINE_LEGACY_GRACE_SECONDS : 0,
    warnings: [], crossedAtElapsed: null, observedAtElapsed: null, region: null, entryPose: null,
    sceneCheckpoint: null, deliveredEffectIds: [], consequenceReceipt: null, summaryId: null };
}

export function normalizeNightDeadline(value, { runId = '', legacy = false } = {}) {
  if (value?.schema !== 1 || value.system !== NIGHT_DEADLINE_ID || (value.runId && runId && value.runId !== runId))
    return freshNightDeadline({ runId, legacy });
  const id = text(runId || value.runId), base = freshNightDeadline({ runId: id, legacy: value.legacy === true });
  return { ...base, phase: phases.includes(value.phase) ? value.phase : base.phase, enrolled: value.enrolled === true,
    enrolledAtElapsed: value.enrolledAtElapsed == null ? null : number(value.enrolledAtElapsed),
    graceRemainingSeconds: value.legacy ? Math.min(NIGHT_DEADLINE_LEGACY_GRACE_SECONDS, number(value.graceRemainingSeconds)) : 0,
    warnings: (Array.isArray(value.warnings) ? value.warnings : []).filter(w => w && text(w.id)).slice(0, 8)
      .map(w => ({ id: text(w.id), key: text(w.key), clock: text(w.clock), elapsedSeconds: number(w.elapsedSeconds), message: text(w.message) })),
    crossedAtElapsed: value.crossedAtElapsed == null ? null : NIGHT_DEADLINE_SECONDS,
    observedAtElapsed: value.observedAtElapsed == null ? null : number(value.observedAtElapsed),
    region: ['ellery', 'source', 'drive', 'outside'].includes(value.region) ? value.region : null,
    entryPose: copy(value.entryPose), sceneCheckpoint: copy(value.sceneCheckpoint),
    deliveredEffectIds: unique(value.deliveredEffectIds), consequenceReceipt: copy(value.consequenceReceipt),
    summaryId: text(value.summaryId) || null };
}

export function nightDeadlinePending(value) {
  return ['pending', 'presenting', 'terminal'].includes(value?.phase);
}
export function nightDeadlineAllowsTransport(value) { return !nightDeadlinePending(value); }
export function nightDeadlinePendingEffects(value) {
  const state = normalizeNightDeadline(value, { runId: value?.runId });
  return state.warnings.filter(w => !state.deliveredEffectIds.includes(w.id)).map(w => ({ type: 'warning', ...w }));
}
export function acknowledgeNightDeadlineEffects(value, ids) {
  const state = normalizeNightDeadline(value, { runId: value?.runId });
  return { ...state, deliveredEffectIds: unique([...state.deliveredEffectIds, ...unique(ids)]) };
}

export function stepNightDeadline(value, input = {}) {
  const state = normalizeNightDeadline(value, { runId: input.runId || value?.runId, legacy: input.legacy === true });
  const before = JSON.stringify(state), events = [];
  const elapsed = number(input.elapsedSeconds), foreground = number(input.foregroundSeconds);
  const eligible = input.runActive === true && input.workOrderAccepted === true && !!state.runId;
  const active = input.active === true;
  const wasPending = state.phase === 'pending';
  const queue = (key, clock, message = '') => {
    const id = `${state.eventId}:warning:${key}`;
    if (state.warnings.some(w => w.id === id)) return;
    const warning = { id, key, clock, elapsedSeconds: elapsed, message };
    state.warnings.push(warning); events.push({ type: 'warning', ...warning });
  };
  if (!nightDeadlinePending(state) && input.committedFinale === true) state.phase = 'superseded';
  if (eligible && active && state.phase !== 'superseded' && !nightDeadlinePending(state)) {
    const newlyEnrolled = !state.enrolled;
    if (newlyEnrolled) {
      state.enrolled = true; state.enrolledAtElapsed = elapsed;
      if (state.legacy) queue('legacy-enrollment', '', 'The clock is estimated. Demolition is due at 06:00. You have at least ten minutes of active play before it can begin.');
    }
    if (state.legacy && !newlyEnrolled) {
      const remaining = state.graceRemainingSeconds;
      state.graceRemainingSeconds = Math.max(0, remaining - foreground);
      if (remaining > 300 && state.graceRemainingSeconds <= 300)
        queue('legacy-five-minutes', '', 'Estimated-clock grace: five minutes of active play remain. Demolition is still due at 06:00.');
    }
    for (const warning of NIGHT_DEADLINE_WARNINGS) if (elapsed >= warning.elapsedSeconds
      && (!state.legacy || warning.elapsedSeconds > state.enrolledAtElapsed))
      queue(warning.key, warning.clock);
    if (state.warnings.length) state.phase = 'warning';
    if (elapsed >= NIGHT_DEADLINE_SECONDS && (!state.legacy || state.graceRemainingSeconds === 0)) {
      state.phase = 'pending'; state.crossedAtElapsed = NIGHT_DEADLINE_SECONDS; state.observedAtElapsed = elapsed;
      state.region = ['ellery', 'source', 'drive', 'outside'].includes(input.region) ? input.region : 'ellery';
      state.entryPose = copy(input.entryPose);
      events.push({ type: 'deadline-pending', id: state.eventId });
    }
  }
  const presentationReady = state.phase === 'pending' && active && input.runActive === true
    && input.safeBoundary === true && input.assetsReady === true && input.protectedTransport !== true && input.competingOwner !== true;
  // Require a distinct saved pending step before a host can claim presentation.
  if (wasPending && presentationReady && input.claimPresentation === true) {
    state.phase = 'presenting'; state.sceneCheckpoint = copy(input.sceneCheckpoint) || { schema: 1, phase: 'recognize', activeSeconds: 0 };
    events.push({ type: 'deadline-presenting', id: state.eventId });
  }
  return { state, events, changed: before !== JSON.stringify(state), denyNewTransports: !nightDeadlineAllowsTransport(state),
    presentationReady, deliverableEffects: active && input.assetsReady === true && input.protectedTransport !== true && input.competingOwner !== true
      ? nightDeadlinePendingEffects(state) : [] };
}

export function checkpointNightDeadline(value, sceneCheckpoint, { deliveredEffectIds = [] } = {}) {
  const state = normalizeNightDeadline(value, { runId: value?.runId });
  if (state.phase !== 'presenting') return state;
  return { ...state, sceneCheckpoint: copy(sceneCheckpoint),
    deliveredEffectIds: unique([...state.deliveredEffectIds, ...unique(deliveredEffectIds)]) };
}
export function completeNightDeadline(value, { outcome, sceneCheckpoint = null } = {}) {
  const state = normalizeNightDeadline(value, { runId: value?.runId });
  if (state.phase === 'terminal') return state;
  if (state.phase !== 'presenting' || !['survived', 'entombed'].includes(outcome)) return null;
  return { ...state, phase: 'terminal', sceneCheckpoint: copy(sceneCheckpoint) || state.sceneCheckpoint,
    consequenceReceipt: { id: `${state.eventId}:terminal`, system: NIGHT_DEADLINE_ID, outcome,
      classification: 'failed-night', addedInjury: 0, equipmentLost: [] } };
}
