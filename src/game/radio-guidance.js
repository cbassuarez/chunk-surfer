// Pure radio-call routing. The runtime owns positions, map topology and modal
// scenes; this module owns the persistent promises Martin has made so a second
// call can refine the first one instead of silently choosing another room.

export const RADIO_CALL_KIND = Object.freeze({
  OPENING_GUIDANCE: 'opening-guidance',
  ROUTE_GUIDANCE: 'route-guidance',
  DANGER_HELP: 'danger-help',
  HUSH_HELP_RUPTURE: 'hush-help-rupture',
  ORIGINAL_BREAKDOWN: 'original-breakdown',
});

export function freshRadioGuidanceState() {
  return {
    assignedRoomId: null,
    repeatCounts: {},
    dangerCallCount: 0,
    recentIncidentUntil: 0,
    recentIncidentKind: null,
    originalBreakdown: {
      armed: false,
      roomId: null,
      armedAt: 0,
      fallbackAt: 0,
    },
  };
}

const nonNegativeInt = (value) => Math.max(0, Math.floor(Number(value) || 0));

export function normalizeRadioGuidanceState(value = {}) {
  const base = freshRadioGuidanceState();
  const repeats = {};
  for (const [key, count] of Object.entries(value.repeatCounts || {})) {
    if (key) repeats[key] = nonNegativeInt(count);
  }
  return {
    assignedRoomId: value.assignedRoomId || null,
    repeatCounts: repeats,
    dangerCallCount: nonNegativeInt(value.dangerCallCount),
    recentIncidentUntil: Math.max(0, Number(value.recentIncidentUntil) || 0),
    recentIncidentKind: value.recentIncidentKind || null,
    originalBreakdown: {
      ...base.originalBreakdown,
      ...(value.originalBreakdown || {}),
      armed: !!value.originalBreakdown?.armed,
      roomId: value.originalBreakdown?.roomId || null,
      armedAt: Math.max(0, Number(value.originalBreakdown?.armedAt) || 0),
      fallbackAt: Math.max(0, Number(value.originalBreakdown?.fallbackAt) || 0),
    },
  };
}

function hash32(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value || 'radio')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededChoice(values, seed) {
  const candidates = [...new Set(values.filter(Boolean))].sort();
  if (!candidates.length) return null;
  return candidates[hash32(`${seed}:${candidates.join('|')}`) % candidates.length];
}

function withRepeat(state, targetId) {
  const repeatCounts = { ...state.repeatCounts };
  const repeat = nonNegativeInt(repeatCounts[targetId]);
  repeatCounts[targetId] = repeat + 1;
  return { state:{ ...state, repeatCounts }, repeat };
}

/** Resolve one manual call without touching runtime state. */
export function resolveRadioCall({
  state: rawState = {},
  dangerContext = false,
  dangerKind = 'near',
  originalBreakdownStarted = false,
  openingTarget = null,
  markedRoomId = null,
  unfinishedRoomIds = [],
  availableRoomIds = unfinishedRoomIds,
  runSeed = 'radio',
} = {}) {
  let state = normalizeRadioGuidanceState(rawState);

  // Player-caused rupture outranks an armed-but-unstarted inbound hijack.
  if (dangerContext && state.dangerCallCount >= 1 && !originalBreakdownStarted) {
    state = { ...state, dangerCallCount:state.dangerCallCount + 1 };
    return { kind:RADIO_CALL_KIND.HUSH_HELP_RUPTURE, entry:'start', targetId:null, repeat:state.dangerCallCount - 1, state };
  }

  if (state.originalBreakdown.armed) {
    return {
      kind: RADIO_CALL_KIND.ORIGINAL_BREAKDOWN,
      entry: 'manual',
      targetId: state.originalBreakdown.roomId,
      repeat: 0,
      state,
    };
  }

  if (dangerContext) {
    state = { ...state, dangerCallCount:state.dangerCallCount + 1 };
    return {
      kind: RADIO_CALL_KIND.DANGER_HELP,
      entry: dangerKind === 'contact' ? 'post-contact' : 'hush-near',
      targetId: null,
      repeat: state.dangerCallCount - 1,
      state,
    };
  }

  if (openingTarget?.id) {
    const repeated = withRepeat(state, openingTarget.id);
    return {
      kind: RADIO_CALL_KIND.OPENING_GUIDANCE,
      entry: repeated.repeat ? 'route-repeat' : (openingTarget.entry || 'opening'),
      targetId: openingTarget.id,
      repeat: repeated.repeat,
      state: repeated.state,
    };
  }

  const unfinished = new Set(unfinishedRoomIds.filter(Boolean));
  const available = availableRoomIds.filter((id) => unfinished.has(id));
  let targetId = markedRoomId && unfinished.has(markedRoomId) ? markedRoomId : null;
  let assignedRoomId = state.assignedRoomId;

  if (targetId) assignedRoomId = null;
  else if (assignedRoomId && available.includes(assignedRoomId)) targetId = assignedRoomId;
  else {
    targetId = seededChoice(available, runSeed);
    assignedRoomId = targetId;
  }

  state = { ...state, assignedRoomId };
  if (!targetId) {
    return { kind:RADIO_CALL_KIND.ROUTE_GUIDANCE, entry:'route-unresolved', targetId:null, repeat:0, state };
  }

  const repeated = withRepeat(state, targetId);
  return {
    kind: RADIO_CALL_KIND.ROUTE_GUIDANCE,
    entry: repeated.repeat ? 'route-repeat' : 'route-first',
    targetId,
    repeat: repeated.repeat,
    state: repeated.state,
  };
}
