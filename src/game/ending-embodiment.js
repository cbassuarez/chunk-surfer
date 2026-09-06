// Pure physical state for the nine terminal ending cutscenes.
//
// Ending prose names a physical beat; this reducer records what the world must
// now be showing. Keeping the vocabulary here makes an unimplemented effect a
// validation error instead of a line of JSON that silently falls back to a
// camera shake.

export const ENDING_EMBODIMENT_EFFECTS = Object.freeze([
  'remote-impact',
  'circuits-fail-toward-chapel',
  'deterministic-debris',
  'blackout',
  'flashback-booth-pour',
  'flashback-handoff',
  'flashback-cut-to-black',
  'sodium-shutdown',
  'wrong-door-reveal',
  'public-doors-open',
  'birds-bus-arrival',
  'staff-behind-heras',
  'source-collapse',
  'restore-return-point',
  'body-control-failure',
  'body-still',
  'camera-detach',
  'threshold-regrip',
  'west-doors-open',
  'sync-breath',
  'sync-hands',
  'sync-posture',
  'take-look',
  'take-movement',
  'final-wide',
]);

export const ENDING_FINAL_ACTION_MODE = Object.freeze({
  WORLD: 'world',
  DIALOGUE: 'dialogue',
  HOLD: 'hold',
});

const EFFECT_SET = new Set(ENDING_EMBODIMENT_EFFECTS);
const SYNC_STAGE = Object.freeze({
  'sync-breath': 1,
  'sync-hands': 2,
  'sync-posture': 3,
  'take-look': 4,
  'take-movement': 5,
  'final-wide': 6,
});

export function createEndingEmbodimentState(endingId = '') {
  return Object.freeze({
    endingId: String(endingId || ''),
    beatIds: Object.freeze([]),
    effects: Object.freeze([]),
    collapseStage: 0,
    memoryStage: 0,
    morningStage: 0,
    sourceStage: 0,
    bodyStage: 0,
    syncStage: 0,
    cameraDetached: false,
    thresholdRegripped: false,
    finalActionId: null,
    finalHold: false,
  });
}

export function reduceEndingEmbodiment(state, event = {}) {
  const previous = state?.endingId ? state : createEndingEmbodimentState(event.endingId);
  if (event.type === 'final-action') {
    return Object.freeze({ ...previous, finalActionId: String(event.id || '') || previous.finalActionId });
  }
  if (event.type === 'final-hold') return Object.freeze({ ...previous, finalHold: !!event.active });
  if (event.type !== 'beat' || !event.beat) return previous;

  const beat = event.beat;
  const beatId = String(beat.id || '');
  const effect = String(beat.effect || '');
  const beatIds = previous.beatIds.includes(beatId) || !beatId
    ? previous.beatIds
    : Object.freeze([...previous.beatIds, beatId]);
  const effects = !effect || previous.effects.includes(effect)
    ? previous.effects
    : Object.freeze([...previous.effects, effect]);
  let collapseStage = previous.collapseStage;
  let memoryStage = previous.memoryStage;
  let morningStage = previous.morningStage;
  let sourceStage = previous.sourceStage;
  let bodyStage = previous.bodyStage;
  let syncStage = previous.syncStage;
  let cameraDetached = previous.cameraDetached;
  let thresholdRegripped = previous.thresholdRegripped;

  if (effect === 'remote-impact') collapseStage = Math.max(collapseStage, 1);
  else if (effect === 'circuits-fail-toward-chapel') collapseStage = Math.max(collapseStage, 2);
  else if (effect === 'deterministic-debris') collapseStage = Math.max(collapseStage, 3);
  else if (effect === 'blackout' || effect === 'flashback-cut-to-black') collapseStage = Math.max(collapseStage, 4);
  else if (effect === 'flashback-booth-pour') memoryStage = Math.max(memoryStage, 1);
  else if (effect === 'flashback-handoff') memoryStage = Math.max(memoryStage, 2);
  else if (effect === 'sodium-shutdown') morningStage = Math.max(morningStage, 1);
  else if (effect === 'birds-bus-arrival') morningStage = Math.max(morningStage, 2);
  else if (effect === 'staff-behind-heras') morningStage = Math.max(morningStage, 3);
  else if (effect === 'source-collapse') sourceStage = Math.max(sourceStage, 1);
  else if (effect === 'restore-return-point') sourceStage = Math.max(sourceStage, 2);
  else if (effect === 'body-control-failure') bodyStage = Math.max(bodyStage, 1);
  else if (effect === 'body-still') bodyStage = Math.max(bodyStage, 2);
  else if (effect === 'camera-detach') cameraDetached = true;
  else if (effect === 'threshold-regrip') thresholdRegripped = true;
  if (SYNC_STAGE[effect]) syncStage = Math.max(syncStage, SYNC_STAGE[effect]);

  return Object.freeze({
    ...previous,
    beatIds,
    effects,
    collapseStage,
    memoryStage,
    morningStage,
    sourceStage,
    bodyStage,
    syncStage,
    cameraDetached,
    thresholdRegripped,
  });
}

export function endingEmbodimentErrors(cutscenes = {}) {
  const errors = [];
  const actionIds = new Set();
  for (const [id, spec] of Object.entries(cutscenes || {})) {
    for (const beat of spec?.beats || []) {
      if (beat.effect && !EFFECT_SET.has(String(beat.effect))) {
        errors.push(`${id} cutscene beat ${beat.id || '?'} uses unimplemented physical effect ${beat.effect}`);
      }
    }
    const action = spec?.finalAction;
    if (!action?.id || !action?.label || !Object.values(ENDING_FINAL_ACTION_MODE).includes(action?.mode)) {
      errors.push(`${id} cutscene has no valid final player action`);
      continue;
    }
    if (actionIds.has(action.id)) errors.push(`${id} repeats final player action ${action.id}`);
    actionIds.add(action.id);
    if (action.mode === ENDING_FINAL_ACTION_MODE.HOLD) {
      if (!String(action.input || '').trim()) errors.push(`${id} hold action ${action.id} has no input`);
      if (!Number.isFinite(Number(action.holdMs)) || Number(action.holdMs) < 500) errors.push(`${id} hold action ${action.id} is not a readable hold`);
    }
  }
  return errors;
}
