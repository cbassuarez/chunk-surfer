// Pure deterministic state for the signal-combat encounters.
//
// Rendering, audio, persistence, and the physical torch battery live outside
// this module. Given the same definition, state, and action, resolution is
// byte-for-byte repeatable.

export const COMBAT_SCHEMA = 1;

export const COMBAT_ACTION = Object.freeze({
  EXPOSE: 'expose',
  MONITOR: 'monitor',
  PLAYBACK: 'playback',
  HOLD: 'hold',
  INVERT: 'invert',
  TUNE: 'tune',
  CHANNEL: 'channel',
  END_TEMPO: 'end-tempo',
  WHITEOUT: 'whiteout',
});

export const INTENT_KIND = Object.freeze({
  BROADCAST: 'broadcast',
  CONCEAL: 'conceal',
  OVERLOAD: 'overload',
  LOOP: 'loop',
  SILENCE: 'silence',
});

export const SOURCE_CHANNEL = Object.freeze({
  RESCUE: 'rescue',
  CONTAIN: 'contain',
  SUBMIT: 'submit',
});

export const TECHNIQUE = Object.freeze({
  AFTERIMAGE: 'torch.afterimage',
  WHITEOUT: 'torch.whiteout',
  ROOM_TONE: 'recorder.room-tone',
  PUNCH_IN: 'recorder.punch-in',
  OVERDUB: 'rig.overdub',
  FEEDBACK_LOOP: 'rig.feedback-loop',
});

const ACTION_COUNTER = Object.freeze({
  [COMBAT_ACTION.EXPOSE]: INTENT_KIND.CONCEAL,
  [COMBAT_ACTION.WHITEOUT]: INTENT_KIND.CONCEAL,
  [COMBAT_ACTION.MONITOR]: INTENT_KIND.BROADCAST,
  [COMBAT_ACTION.HOLD]: INTENT_KIND.OVERLOAD,
  [COMBAT_ACTION.INVERT]: INTENT_KIND.LOOP,
});

const SOURCE_READING = Object.freeze({
  [SOURCE_CHANNEL.RESCUE]: 'BODY BORROWED RETURN',
  [SOURCE_CHANNEL.CONTAIN]: 'RETURN STILL INSIDE',
  [SOURCE_CHANNEL.SUBMIT]: 'SOURCE SURFER',
});

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(finite(value, fallback));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value))];
const clone = (value) => JSON.parse(JSON.stringify(value));
const hasTechnique = (state, id) => state.techniques.includes(id);
const currentMovement = (state) => state.definition.movements[state.movementIndex] || null;

function intentsFor(movement, variant) {
  if (!movement) return [];
  if (variant === 'dead-air' && movement.deadAirIntents?.length) return movement.deadAirIntents;
  if (variant === 'severe' && movement.severeIntents?.length) return movement.severeIntents;
  return movement.intents || [];
}

export function currentCombatIntent(state) {
  const intents = intentsFor(currentMovement(state), state.difficulty.variant);
  if (!intents.length) return null;
  return intents[state.intentIndex % intents.length];
}

export function combatIntentLookahead(state) {
  const movement = currentMovement(state);
  const intents = intentsFor(movement, state.difficulty.variant);
  const tuned = state.tuneUsedMovement === state.movementIndex;
  const count = Math.max(tuned ? 2 : 1, integer(state.difficulty.intentLookahead, 1));
  return Array.from({ length: Math.min(count, intents.length) }, (_, offset) => (
    intents[(state.intentIndex + offset) % intents.length]
  ));
}

function combatDifficulty(raw = {}) {
  return {
    id: typeof raw.id === 'string' ? raw.id : 'standard',
    composureBonus: integer(raw.composureBonus, 0),
    holdPrevention: Math.max(0, integer(raw.holdPrevention, 2)),
    intentLookahead: Math.max(1, integer(raw.intentLookahead, 1)),
    recommended: raw.recommended !== false,
    safetyRelay: !!raw.safetyRelay,
    variant: ['standard', 'severe', 'dead-air'].includes(raw.variant) ? raw.variant : 'standard',
  };
}

export function validateCombatDefinition(definition) {
  const errors = [];
  if (!definition?.id) errors.push('combat has no id');
  if (!definition?.enemy) errors.push(`${definition?.id || 'combat'} has no enemy`);
  if (!Array.isArray(definition?.movements) || !definition.movements.length) errors.push(`${definition?.id || 'combat'} has no movements`);
  const music = definition?.music;
  if (music) {
    const validLead = (id) => ['lead-1', 'lead-2', 'lead-3'].includes(id);
    if (!['fixed', 'movement'].includes(music.mode)) errors.push(`${definition?.id || 'combat'} has invalid music mode`);
    if (music.mode === 'fixed' && !validLead(music.lead)) errors.push(`${definition?.id || 'combat'} has invalid fixed music lead`);
    if (music.mode === 'movement') {
      if (!Array.isArray(music.movementLeads) || music.movementLeads.length !== (definition?.movements?.length || 0)) {
        errors.push(`${definition?.id || 'combat'} music must name one lead per movement`);
      } else if (music.movementLeads.some((id) => !validLead(id))) {
        errors.push(`${definition?.id || 'combat'} has invalid movement music lead`);
      }
    }
  }
  const movementIds = new Set();
  for (const movement of definition?.movements || []) {
    if (!movement?.id) errors.push(`${definition.id} has a movement without an id`);
    else if (movementIds.has(movement.id)) errors.push(`${definition.id} repeats movement ${movement.id}`);
    else movementIds.add(movement.id);
    if (integer(movement?.coherence, 0) <= 0) errors.push(`${definition.id}:${movement?.id || '?'} coherence must be positive`);
    for (const [variant, intents] of [
      ['standard', movement?.intents],
      ['severe', movement?.severeIntents],
      ['dead-air', movement?.deadAirIntents],
    ]) {
      if (variant === 'standard' && (!Array.isArray(intents) || !intents.length)) errors.push(`${definition.id}:${movement?.id || '?'} has no intents`);
      for (const intent of intents || []) {
        if (!intent?.id || !intent?.label) errors.push(`${definition.id}:${movement?.id || '?'}:${variant} has an unnamed intent`);
        if (!Object.values(INTENT_KIND).includes(intent?.kind)) errors.push(`${definition.id}:${movement?.id || '?'}:${intent?.id || '?'} has invalid kind`);
        if (finite(intent?.damage, -1) < 0) errors.push(`${definition.id}:${movement?.id || '?'}:${intent?.id || '?'} has negative damage`);
        if (intent?.kind === INTENT_KIND.BROADCAST && !intent.recordable) errors.push(`${definition.id}:${movement?.id || '?'}:${intent?.id || '?'} broadcast is not recordable`);
        if (intent?.kind === INTENT_KIND.LOOP && !intent.invertible) errors.push(`${definition.id}:${movement?.id || '?'}:${intent?.id || '?'} loop is not invertible`);
      }
    }
    // A flat torch and missing rig must never make progress impossible in any
    // selected difficulty script. Missing variants deliberately inherit the
    // standard script.
    for (const [variant, intents] of [
      ['standard', movement?.intents || []],
      ['severe', movement?.severeIntents?.length ? movement.severeIntents : movement?.intents || []],
      ['dead-air', movement?.deadAirIntents?.length ? movement.deadAirIntents : movement?.intents || []],
    ]) {
      if (!intents.some((intent) => intent.kind === INTENT_KIND.BROADCAST && intent.recordable)) {
        errors.push(`${definition.id}:${movement?.id || '?'}:${variant} has no recorder-only damage path`);
        continue;
      }
      const recorderDamage = intents
        .filter((intent) => intent.kind === INTENT_KIND.BROADCAST && intent.recordable)
        .reduce((total, intent) => total + clamp(integer(intent.playbackDamage, intent.damage || 2), 1, 3), 0);
      const recovery = intents
        .filter((intent) => intent.effect === 'recover')
        .reduce((total, intent) => total + Math.max(1, integer(intent.recover, 1)), 0);
      if (recorderDamage <= recovery) {
        errors.push(`${definition.id}:${movement?.id || '?'}:${variant} recovery can lock the recorder-only path`);
      }
    }
  }
  return errors;
}

export function createCombatState(definition, {
  difficulty = {},
  injuries = 0,
  battery = 1,
  torchDrainScale = 1,
  tools = {},
  techniques = [],
  source = null,
} = {}) {
  const errors = validateCombatDefinition(definition);
  if (errors.length) throw new Error(`invalid signal combat: ${errors.join('; ')}`);
  const rules = combatDifficulty(difficulty);
  const baseComposure = Math.max(1, integer(definition.baseComposure, 8) + rules.composureBonus);
  const maxComposure = Math.max(4, baseComposure - Math.max(0, integer(injuries, 0)));
  const normalizedTechniques = unique(techniques).filter((id) => Object.values(TECHNIQUE).includes(id));
  const roomTone = normalizedTechniques.includes(TECHNIQUE.ROOM_TONE)
    ? { id: 'room-tone', label: 'ROOM TONE', damage: 2, tag: 'room' }
    : null;
  const first = definition.movements[0];
  const sourceEnabled = definition.kind === 'source' || !!source;
  return {
    schema: COMBAT_SCHEMA,
    definition: clone(definition),
    phase: 'select',
    result: null,
    movementIndex: 0,
    movementCoherence: integer(first.coherence, 1),
    movementMaxCoherence: integer(first.coherence, 1),
    intentIndex: 0,
    turns: 0,
    turnsInMovement: 0,
    composure: maxComposure,
    maxComposure,
    battery: clamp(finite(battery, 1), 0, 1),
    torchDrainScale: Math.max(0, finite(torchDrainScale, 1)),
    torchSpent: 0,
    tools: {
      torch: tools.torch !== false,
      recorder: tools.recorder !== false,
      rig: !!tools.rig,
      fork: !!tools.fork,
    },
    techniques: normalizedTechniques,
    take: roomTone,
    exposedBonus: 0,
    ringing: false,
    tempo: false,
    tuneUsedMovement: null,
    tuneBonus: 0,
    whiteoutUsed: false,
    feedbackLoopUsed: false,
    punchInMovements: [],
    overdubMovements: [],
    perfectCounters: 0,
    missedCounters: 0,
    damageTaken: 0,
    safetyRelayUsed: false,
    toolsUsed: {},
    proofs: [],
    actionLog: [],
    last: { notice: first.title || first.id, transition: null, action: null, perfect: false },
    difficulty: rules,
    source: sourceEnabled ? {
      enabled: true,
      armed: Object.values(SOURCE_CHANNEL).includes(source?.armed) ? source.armed : SOURCE_CHANNEL.RESCUE,
      channels: {
        [SOURCE_CHANNEL.RESCUE]: Math.max(0, integer(source?.channels?.rescue, 0)),
        [SOURCE_CHANNEL.CONTAIN]: Math.max(0, integer(source?.channels?.contain, 0)),
        [SOURCE_CHANNEL.SUBMIT]: Math.max(0, integer(source?.channels?.submit, 0)),
      },
      rescueEligible: !!source?.rescueEligible,
    } : null,
  };
}

function predictedSourceOutcome(source) {
  if (!source) return null;
  const high = Math.max(...Object.values(source.channels));
  const tied = Object.values(SOURCE_CHANNEL).filter((id) => source.channels[id] === high);
  return tied.includes(source.armed) ? source.armed : tied[0];
}

export function combatPrediction(state) {
  return {
    outcome: predictedSourceOutcome(state.source),
    sourceReading: state.source ? SOURCE_READING[predictedSourceOutcome(state.source)] : null,
  };
}

function toolCount(state, id) {
  state.toolsUsed[id] = Math.max(0, integer(state.toolsUsed[id], 0)) + 1;
}

function addProof(state, id) {
  if (id && !state.proofs.includes(id)) state.proofs.push(id);
}

function addSourcePoint(state, amount = 1) {
  if (!state.source) return;
  state.source.channels[state.source.armed] += Math.max(0, integer(amount, 0));
}

function advanceIntent(state) {
  state.intentIndex += 1;
  state.turns += 1;
  state.turnsInMovement += 1;
  state.tempo = false;
}

function finishCombat(state, result) {
  state.phase = 'done';
  const sourceOutcome = state.source ? predictedSourceOutcome(state.source) : null;
  const returnProof = state.proofs.includes('return.recordist') && state.proofs.includes('return.source');
  const inversionProof = state.tools.rig && state.proofs.includes('invert.contract') && state.proofs.includes('invert.source');
  const grants = [
    ...(returnProof ? ['route.surfaced'] : []),
    ...(inversionProof ? ['route.inversion'] : []),
    ...(state.proofs.includes('return.recordist') ? ['finale.knowsConsent'] : []),
    ...(state.proofs.includes('invert.contract') ? ['finale.knowsContract'] : []),
  ];
  const locks = [
    ...(!returnProof ? ['route.surfaced'] : []),
    ...(!inversionProof ? ['route.inversion'] : []),
  ];
  const sourceReading = state.proofs.includes('return.source')
    ? { readingId: 'combat:return-source', meaning: 'The borrowed body remains returnable.', text: 'BODY BORROWED RETURN' }
    : state.proofs.includes('invert.source')
      ? { readingId: 'combat:invert-source', meaning: 'The signal can be run backwards.', text: 'SIGNAL PROCESS RELEASE' }
      : { readingId: 'combat:source-you', meaning: 'You leave yourself as the source.', text: 'SOURCE IS YOU' };
  state.result = {
    result,
    won: result === 'win',
    turns: state.turns,
    composure: state.composure,
    maxComposure: state.maxComposure,
    perfectCounters: state.perfectCounters,
    missedCounters: state.missedCounters,
    damageTaken: state.damageTaken,
    torchSpent: state.torchSpent,
    techniques: [...state.techniques],
    toolsUsed: { ...state.toolsUsed },
    proofs: [...state.proofs],
    source: state.source ? {
      outcome: sourceOutcome,
      channels: { ...state.source.channels },
      rescuedRecordist: result === 'win' && sourceOutcome === SOURCE_CHANNEL.RESCUE && state.source.rescueEligible,
      sourceReading: SOURCE_READING[sourceOutcome],
    } : null,
    finale: {
      readings: state.definition.kind === 'chapel' ? state.proofs.map((id) => ({ readingId: id, meaning: id.replaceAll('.', ' '), text: id.toUpperCase().replaceAll('.', ' ') })) : [],
      grants,
      locks,
      routeBiases: [
        ...(returnProof ? ['surfaced'] : []),
        ...(inversionProof ? ['inversion'] : []),
      ],
      composure: state.composure,
      sourceReading,
      pressure: state.damageTaken + state.missedCounters,
      proofs: [...state.proofs],
    },
  };
}

function completeMovement(state) {
  const finishedIndex = state.movementIndex;
  if (state.source) addSourcePoint(state, 1);
  if (finishedIndex >= state.definition.movements.length - 1) {
    advanceIntent(state);
    finishCombat(state, 'win');
    state.last.transition = { from: finishedIndex, to: null };
    return;
  }
  state.movementIndex += 1;
  const movement = currentMovement(state);
  state.movementCoherence = integer(movement.coherence, 1);
  state.movementMaxCoherence = integer(movement.coherence, 1);
  state.intentIndex = 0;
  state.turns += 1;
  state.turnsInMovement = 0;
  state.tempo = false;
  state.exposedBonus = 0;
  state.ringing = false;
  state.tuneBonus = 0;
  state.last.transition = { from: finishedIndex, to: state.movementIndex };
}

function applyDamageToEnemy(state, amount) {
  const damage = Math.max(0, integer(amount, 0));
  state.movementCoherence = Math.max(0, state.movementCoherence - damage);
  return damage;
}

function applyEnemyIntent(state, intent, prevention) {
  const damage = Math.max(0, integer(intent?.damage, 0) - Math.max(0, integer(prevention, 0)));
  if (damage > 0) {
    if (state.difficulty.safetyRelay && !state.safetyRelayUsed && damage >= state.composure) {
      state.damageTaken += Math.max(0, state.composure - 1);
      state.composure = 1;
      state.safetyRelayUsed = true;
      state.last.notice += ' · SAFETY RELAY HELD AT 1';
    } else {
      state.composure = Math.max(0, state.composure - damage);
      state.damageTaken += damage;
    }
  }
  if (intent?.effect === 'ringing') state.ringing = true;
  if (intent?.effect === 'corrupt-take') state.take = null;
  if (intent?.effect === 'recover') {
    state.movementCoherence = Math.min(state.movementMaxCoherence, state.movementCoherence + Math.max(1, integer(intent.recover, 1)));
  }
  return damage;
}

function actionAvailability(state, actionId) {
  const intent = currentCombatIntent(state);
  if (state.phase !== 'select') return { enabled: false, reason: 'NOT SELECTING' };
  if (actionId === COMBAT_ACTION.TUNE) {
    if (!state.tools.fork) return { enabled: false, reason: 'NO FORK' };
    if (state.tuneUsedMovement === state.movementIndex) return { enabled: false, reason: 'USED THIS MOVEMENT' };
    return { enabled: true };
  }
  if (actionId === COMBAT_ACTION.EXPOSE || actionId === COMBAT_ACTION.WHITEOUT) {
    if (!state.tools.torch) return { enabled: false, reason: 'NO TORCH' };
    const whiteout = actionId === COMBAT_ACTION.WHITEOUT;
    if (whiteout && !hasTechnique(state, TECHNIQUE.WHITEOUT)) return { enabled: false, reason: 'TECHNIQUE LOCKED' };
    if (whiteout && state.whiteoutUsed) return { enabled: false, reason: 'USED THIS ENCOUNTER' };
    const cost = .025 * state.torchDrainScale * (whiteout ? 2 : 1);
    if (state.battery + 1e-9 < cost) return { enabled: false, reason: 'BATTERY FLAT', cost };
    return { enabled: true, cost };
  }
  if (actionId === COMBAT_ACTION.MONITOR && !state.tools.recorder) return { enabled: false, reason: 'NO RECORDER' };
  if (actionId === COMBAT_ACTION.PLAYBACK) {
    if (!state.tools.recorder) return { enabled: false, reason: 'NO RECORDER' };
    if (!state.take) return { enabled: false, reason: 'NO TAKE' };
  }
  if (actionId === COMBAT_ACTION.INVERT) {
    if (!state.tools.rig) return { enabled: false, reason: 'NO BENT RIG' };
    if (!state.take) return { enabled: false, reason: 'NO TAKE' };
    if (!intent?.invertible) return { enabled: false, reason: 'INTENT CANNOT INVERT' };
  }
  if (actionId === COMBAT_ACTION.END_TEMPO && !state.tempo) return { enabled: false, reason: 'NO TEMPO' };
  return { enabled: true };
}

export function availableCombatActions(state) {
  const intent = currentCombatIntent(state);
  const actions = [
    { id: COMBAT_ACTION.EXPOSE, label: 'EXPOSE', detail: 'TORCH · 2 COHERENCE · APPLY EXPOSED' },
    { id: COMBAT_ACTION.MONITOR, label: 'MONITOR', detail: 'RECORDER · PREVENT 1 · CAPTURE BROADCAST' },
    { id: COMBAT_ACTION.PLAYBACK, label: 'PLAYBACK', detail: state.take ? `RECORDER · ${state.take.damage} COHERENCE · CONSUME ${state.take.label}` : 'RECORDER · NO TAKE LOADED' },
    { id: COMBAT_ACTION.HOLD, label: 'HOLD', detail: `DEFEND · PREVENT ${state.difficulty.holdPrevention} · CLEAR RINGING` },
    { id: COMBAT_ACTION.INVERT, label: 'INVERT', detail: 'BENT RIG · CONSUME TAKE · REFLECT LOOP' },
    ...(hasTechnique(state, TECHNIQUE.WHITEOUT) ? [{ id: COMBAT_ACTION.WHITEOUT, label: 'WHITEOUT', detail: 'TORCH · 4 COHERENCE · ONCE / ENCOUNTER' }] : []),
    ...(state.tools.fork ? [{ id: COMBAT_ACTION.TUNE, label: 'TUNE', detail: 'FORK · FREE · REVEAL NEXT TWO INTENTS' }] : []),
    ...(state.tempo ? [{ id: COMBAT_ACTION.END_TEMPO, label: 'CLOSE CHANNEL', detail: 'END THE BONUS ACTION WITHOUT ACTING' }] : []),
  ];
  return actions.map((action) => {
    const availability = actionAvailability(state, action.id);
    return {
      ...action,
      ...availability,
      perfect: ACTION_COUNTER[action.id] === intent?.kind || (action.id === COMBAT_ACTION.WHITEOUT && intent?.kind === INTENT_KIND.SILENCE),
    };
  });
}

function maybeEarnProof(state, movement, actionId, perfect, takeBefore) {
  if (state.definition.kind !== 'chapel') return;
  if (movement.id === 'recordist' && actionId === COMBAT_ACTION.MONITOR && perfect) addProof(state, 'return.recordist');
  if (movement.id === 'contract' && actionId === COMBAT_ACTION.INVERT && perfect) addProof(state, 'invert.contract');
  if (movement.id === 'source' && actionId === COMBAT_ACTION.PLAYBACK && takeBefore?.tag === 'body') addProof(state, 'return.source');
  if (movement.id === 'source' && actionId === COMBAT_ACTION.INVERT && perfect) addProof(state, 'invert.source');
}

export function reduceCombat(input, action = {}) {
  const state = clone(input);
  if (state.phase !== 'select' || state.result) return state;
  const actionId = action.type || action.id;

  if (actionId === COMBAT_ACTION.CHANNEL) {
    if (state.source && Object.values(SOURCE_CHANNEL).includes(action.channel)) {
      state.source.armed = action.channel;
      state.last = { notice: `${action.channel.toUpperCase()} CHANNEL ARMED`, transition: null, action: actionId, perfect: false };
    }
    return state;
  }

  const availability = actionAvailability(state, actionId);
  if (!availability.enabled) {
    state.last = { notice: availability.reason || 'ACTION UNAVAILABLE', transition: null, action: actionId, perfect: false };
    return state;
  }

  if (actionId === COMBAT_ACTION.TUNE) {
    state.tuneUsedMovement = state.movementIndex;
    state.tuneBonus = 1;
    toolCount(state, 'fork');
    state.last = { notice: 'FORK CALIBRATED · NEXT TWO INTENTS REVEALED', transition: null, action: actionId, perfect: false };
    return state;
  }

  if (actionId === COMBAT_ACTION.END_TEMPO) {
    state.last = { notice: 'OPEN CHANNEL CLOSED', transition: null, action: actionId, perfect: false };
    advanceIntent(state);
    return state;
  }

  const movement = currentMovement(state);
  const intent = currentCombatIntent(state);
  const bonusAction = !!state.tempo;
  const perfect = !bonusAction && (
    ACTION_COUNTER[actionId] === intent?.kind
    || (actionId === COMBAT_ACTION.WHITEOUT && intent?.kind === INTENT_KIND.SILENCE)
  );
  const takeBefore = state.take ? { ...state.take } : null;
  let prevention = 0;
  let enemyDamage = 0;
  let dealt = 0;
  let notice = '';

  state.last = { notice: '', transition: null, action: actionId, perfect };
  toolCount(state, actionId);

  if (actionId === COMBAT_ACTION.EXPOSE || actionId === COMBAT_ACTION.WHITEOUT) {
    const whiteout = actionId === COMBAT_ACTION.WHITEOUT;
    const cost = availability.cost || 0;
    state.battery = Math.max(0, state.battery - cost);
    state.torchSpent += cost;
    state.whiteoutUsed ||= whiteout;
    dealt = applyDamageToEnemy(state, whiteout ? 4 : 2);
    state.exposedBonus = whiteout ? 0 : hasTechnique(state, TECHNIQUE.AFTERIMAGE) ? 2 : 1;
    notice = `${whiteout ? 'WHITEOUT' : 'EXPOSE'} · ${dealt} COHERENCE`;
  } else if (actionId === COMBAT_ACTION.MONITOR) {
    prevention = 1;
    if (intent?.recordable) {
      if (state.take && !action.replaceTake) {
        state.last = { notice: 'TAKE SLOT OCCUPIED · CONFIRM REPLACEMENT', transition: null, action: actionId, perfect: false, needsTakeConfirmation: true };
        return state;
      }
      state.take = {
        id: intent.id,
        label: intent.takeLabel || intent.label,
        damage: clamp(integer(intent.playbackDamage, intent.damage || 2), 1, 3),
        tag: intent.takeTag || null,
      };
      notice = `CAPTURED · ${state.take.label}`;
    } else notice = 'MONITORING · NO STABLE TAKE';
  } else if (actionId === COMBAT_ACTION.PLAYBACK) {
    dealt = applyDamageToEnemy(state, integer(state.take?.damage, 0) + state.exposedBonus);
    const retained = hasTechnique(state, TECHNIQUE.OVERDUB) && state.tools.rig && !state.overdubMovements.includes(state.movementIndex);
    if (retained) {
      state.take = { id: `${takeBefore.id}:overdub`, label: `${takeBefore.label} / OVERDUB`, damage: 1, tag: takeBefore.tag };
      state.overdubMovements.push(state.movementIndex);
    } else state.take = null;
    state.exposedBonus = 0;
    notice = `PLAYBACK · ${dealt} COHERENCE${retained ? ' · RESIDUAL TAKE' : ''}`;
  } else if (actionId === COMBAT_ACTION.HOLD) {
    prevention = state.difficulty.holdPrevention;
    state.ringing = false;
    notice = `HOLD · PREVENT ${prevention}`;
  } else if (actionId === COMBAT_ACTION.INVERT) {
    const retain = hasTechnique(state, TECHNIQUE.FEEDBACK_LOOP) && !state.feedbackLoopUsed;
    dealt = applyDamageToEnemy(state, integer(intent?.damage, 0) + (retain ? 1 : 0));
    if (retain) state.feedbackLoopUsed = true;
    else state.take = null;
    notice = `INVERT · ${dealt} RETURNED${retain ? ' · TAKE RETAINED' : ''}`;
  }

  if (perfect) {
    state.perfectCounters += 1;
    if (state.source) addSourcePoint(state, 1);
    if (state.tuneBonus > 0) {
      dealt += applyDamageToEnemy(state, state.tuneBonus);
      state.tuneBonus = 0;
      notice += ' · RESONANT +1';
    }
    if (actionId === COMBAT_ACTION.MONITOR && hasTechnique(state, TECHNIQUE.PUNCH_IN) && !state.punchInMovements.includes(state.movementIndex)) {
      dealt += applyDamageToEnemy(state, 1);
      state.punchInMovements.push(state.movementIndex);
      notice += ' · PUNCH IN +1';
    }
    notice += ' · PERFECT RESPONSE';
  } else if (!bonusAction) {
    state.missedCounters += 1;
  }

  maybeEarnProof(state, movement, actionId, perfect, takeBefore);

  if (state.movementCoherence <= 0) {
    state.last.notice = notice;
    completeMovement(state);
  } else if (bonusAction) {
    state.last.notice = notice;
    advanceIntent(state);
  } else if (perfect) {
    state.tempo = true;
    state.last.notice = `${notice} · TEMPO OPEN`;
  } else {
    enemyDamage = applyEnemyIntent(state, intent, prevention);
    state.last.notice = `${notice}${enemyDamage ? ` · ${enemyDamage} COMPOSURE LOST` : ' · INTENT HELD'}`;
    if (state.composure <= 0) {
      advanceIntent(state);
      finishCombat(state, 'lose');
    } else advanceIntent(state);
  }

  state.actionLog.push({
    turn: state.turns,
    movement: movement.id,
    action: actionId,
    intent: intent?.id || null,
    perfect,
    bonus: bonusAction,
    dealt,
    received: enemyDamage,
  });
  return state;
}

export function combatResult(state) {
  return state?.result ? clone(state.result) : null;
}
