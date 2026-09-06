// Pure ending-cutscene state.
//
// The renderer and input layer are intentionally absent from this module. An
// ending beat can be gated by elapsed time, a world position, one semantic
// interaction, or completion of an authored dialogue line. That makes the same
// sequence usable by the 3D renderer, the staged 2D fallback, reload and skip.

export const CUTSCENE_TRIGGER = Object.freeze({
  TIME: 'time',
  POSITION: 'position',
  INTERACTION: 'interaction',
  DIALOGUE: 'dialogue',
});

export const CUTSCENE_INTERACTION_MODE = Object.freeze({
  WALK: 'walk',
  DRAG: 'drag',
  INSPECT: 'inspect',
  CARRY: 'carry',
  DIRECTED: 'directed',
  NONE: 'none',
});

const finite = (value) => Number.isFinite(Number(value));
const clampElapsed = (value) => Math.max(0, finite(value) ? Number(value) : 0);
const stringSet = (value) => new Set(Array.isArray(value) ? value.map(String) : []);

export function endingCutsceneCompletionId(endingId) {
  return `ending-cutscene:${String(endingId || '')}:complete`;
}

export function createEndingCutsceneState(spec, {
  elapsedMs = 0,
  reducedMotion = false,
} = {}) {
  return Object.freeze({
    schema: 1,
    endingId: String(spec?.endingId || ''),
    elapsedMs: clampElapsed(elapsedMs),
    cursor: 0,
    fired: Object.freeze([]),
    interactions: Object.freeze([]),
    paused: false,
    skipped: false,
    complete: false,
    completionId: null,
    completionClaimed: false,
    reducedMotion: !!reducedMotion,
  });
}

export function restartEndingCutscene(state, spec) {
  return createEndingCutsceneState(spec, { reducedMotion: !!state?.reducedMotion });
}

function beatReady(beat, input, elapsedMs, consumedInteraction, rememberedInteractions = new Set()) {
  const trigger = beat?.trigger;
  if (trigger === CUTSCENE_TRIGGER.TIME) return elapsedMs >= clampElapsed(beat.atMs);
  if (trigger === CUTSCENE_TRIGGER.POSITION) {
    const position = input?.position;
    const target = input?.anchors?.[beat.anchor] || input?.target;
    if (!finite(position?.x) || !finite(position?.y) || !finite(target?.x) || !finite(target?.y)) return false;
    return Math.hypot(Number(position.x) - Number(target.x), Number(position.y) - Number(target.y)) <= Math.max(.01, Number(beat.radius) || 1.5);
  }
  if (trigger === CUTSCENE_TRIGGER.INTERACTION) {
    if (consumedInteraction) return false;
    return rememberedInteractions.has(String(beat.action || ''));
  }
  if (trigger === CUTSCENE_TRIGGER.DIALOGUE) {
    return stringSet(input?.dialogueComplete).has(String(beat.dialogueId || ''));
  }
  return false;
}

// Drain every currently satisfiable beat in authored order. Position and
// interaction beats are deliberately sequential: arriving at the gate cannot
// also sign the ledger, and one fresh press cannot satisfy two actions.
export function advanceEndingCutscene(state, spec, input = {}) {
  const previous = state?.endingId ? state : createEndingCutsceneState(spec, input);
  if (previous.complete) return Object.freeze({ state: previous, events: Object.freeze([]) });

  const paused = Object.hasOwn(input, 'paused') ? !!input.paused : !!previous.paused;
  const elapsedMs = paused
    ? previous.elapsedMs
    : Object.hasOwn(input, 'elapsedMs')
      ? clampElapsed(input.elapsedMs)
      : previous.elapsedMs + clampElapsed(input.deltaMs);
  const beats = Array.isArray(spec?.beats) ? spec.beats : [];
  let cursor = previous.cursor;
  const fired = [...previous.fired];
  const interactions = [...(previous.interactions || [])];
  const incomingInteraction = String(input?.interaction || '');
  if (incomingInteraction && !interactions.includes(incomingInteraction)) interactions.push(incomingInteraction);
  const rememberedInteractions = new Set(interactions);
  const events = [];
  let consumedInteraction = false;
  const skip = !!input.skip;

  if (!paused) {
    while (cursor < beats.length) {
      const beat = beats[cursor];
      if (!skip && !beatReady(beat, input, elapsedMs, consumedInteraction, rememberedInteractions)) {
        // Evidence inspection in the van is a hub, not a compulsory menu order.
        // Remember every semantic interaction and let a later required action
        // close over optional earlier inspections without making the player
        // reopen a choice they already visited.
        const laterRemembered = beat?.optional && beats.slice(cursor + 1).some((candidate) =>
          candidate?.trigger === CUTSCENE_TRIGGER.INTERACTION
          && rememberedInteractions.has(String(candidate.action || '')),
        );
        if (!laterRemembered) break;
        fired.push(beat.id);
        events.push(Object.freeze({ type: 'beat', beat, skipped: true, optional: true }));
        cursor += 1;
        continue;
      }
      fired.push(beat.id);
      events.push(Object.freeze({ type: 'beat', beat, skipped: skip }));
      if (beat.trigger === CUTSCENE_TRIGGER.INTERACTION) consumedInteraction = true;
      cursor += 1;
      if (consumedInteraction && !skip) break;
    }
  }

  const complete = cursor >= beats.length;
  const completionId = complete ? endingCutsceneCompletionId(spec?.endingId) : null;
  if (complete && !previous.complete) events.push(Object.freeze({ type: 'complete', id: completionId, skipped: skip }));
  const next = Object.freeze({
    ...previous,
    elapsedMs,
    cursor,
    fired: Object.freeze(fired),
    interactions: Object.freeze(interactions),
    paused,
    skipped: previous.skipped || skip,
    complete,
    completionId,
  });
  return Object.freeze({ state: next, events: Object.freeze(events) });
}

// Completion is a transaction, not a callback. Both normal play and skip claim
// this exact id; a second claim is rejected so rewards cannot duplicate.
export function claimEndingCutsceneCompletion(state, completionId) {
  const expected = state?.completionId;
  if (!state?.complete || !expected || String(completionId || '') !== expected || state.completionClaimed) {
    return Object.freeze({ state, claimed: false });
  }
  return Object.freeze({ state: Object.freeze({ ...state, completionClaimed: true }), claimed: true });
}

export function endingCutsceneErrors(spec) {
  const errors = [];
  const id = String(spec?.endingId || 'cutscene');
  if (!spec || typeof spec !== 'object') return [`${id} has no cutscene specification`];
  if (!spec.worldAnchors || !Object.keys(spec.worldAnchors).length) errors.push(`${id} cutscene has no world anchors`);
  if (!Object.values(CUTSCENE_INTERACTION_MODE).includes(spec.interactionMode)) errors.push(`${id} cutscene has unknown interaction mode ${spec.interactionMode}`);
  if (!spec.actors || typeof spec.actors !== 'object') errors.push(`${id} cutscene has no actor state`);
  if (!spec.camera?.treatment) errors.push(`${id} cutscene has no camera treatment`);
  if (!spec.finalHold?.image || !finite(spec.finalHold?.ms) || Number(spec.finalHold.ms) < 0) errors.push(`${id} cutscene has no valid final hold`);
  if (!spec.reducedMotion?.treatment) errors.push(`${id} cutscene has no reduced-motion treatment`);
  const beats = Array.isArray(spec.beats) ? spec.beats : [];
  if (!beats.length) errors.push(`${id} cutscene has no beats`);
  const beatIds = new Set();
  let previousTime = -1;
  for (const beat of beats) {
    const beatId = String(beat?.id || '');
    if (!beatId) errors.push(`${id} cutscene has a beat with no id`);
    else if (beatIds.has(beatId)) errors.push(`${id} cutscene repeats beat ${beatId}`);
    beatIds.add(beatId);
    if (!Object.values(CUTSCENE_TRIGGER).includes(beat?.trigger)) errors.push(`${id} cutscene beat ${beatId} has unknown trigger ${beat?.trigger}`);
    if (beat?.trigger === CUTSCENE_TRIGGER.TIME) {
      if (!finite(beat.atMs) || Number(beat.atMs) < previousTime) errors.push(`${id} cutscene beat ${beatId} has unordered time`);
      previousTime = Number(beat.atMs);
    }
    if (beat?.trigger === CUTSCENE_TRIGGER.POSITION && !spec.worldAnchors?.[beat.anchor]) errors.push(`${id} cutscene beat ${beatId} names unknown anchor ${beat.anchor}`);
    if (beat?.trigger === CUTSCENE_TRIGGER.INTERACTION && !String(beat.action || '').trim()) errors.push(`${id} cutscene beat ${beatId} has no semantic action`);
    if (beat?.trigger === CUTSCENE_TRIGGER.DIALOGUE && !String(beat.dialogueId || '').trim()) errors.push(`${id} cutscene beat ${beatId} has no dialogue gate`);
    for (const source of beat?.dialogue || []) {
      if (!/^[\w.-]+#[\w.-]+$/.test(String(source))) errors.push(`${id} cutscene beat ${beatId} has invalid dialogue source ${source}`);
    }
  }
  return errors;
}
