// Pure deterministic state for the signal-combat encounters.
//
// Rendering, audio, persistence, and the physical torch battery live outside
// this module. Given the same definition, state, and action, resolution is
// byte-for-byte repeatable.

export const COMBAT_SCHEMA = 2;

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
  RADIO_DECOY: 'radio-decoy',
  STEADY_HANDS: 'steady-hands',
});

export const COMBAT_TOOL = Object.freeze({
  SELF: 'self',
  TORCH: 'torch',
  RECORDER: 'recorder',
  RIG: 'rig',
  FORK: 'fork',
  RADIO: 'radio',
  COFFEE: 'coffee',
});

export const SNR_STATE = Object.freeze({
  SIGNAL: 'signal',
  NOISE: 'noise',
  SILENCE: 'silence',
});

export const SNR_PROFILE = Object.freeze({
  [SNR_STATE.SIGNAL]: Object.freeze({
    label: 'SIGNAL',
    description: 'Clean captures and stronger monitoring. A missed read lands harder.',
  }),
  [SNR_STATE.NOISE]: Object.freeze({
    label: 'NOISE',
    description: 'Attacks bite harder. Monitoring and defense lose definition.',
  }),
  [SNR_STATE.SILENCE]: Object.freeze({
    label: 'SILENCE',
    description: 'Defense tightens. Outgoing damage loses one point.',
  }),
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
  [COMBAT_ACTION.RADIO_DECOY]: INTENT_KIND.BROADCAST,
});

const ACTION_TOOL = Object.freeze({
  [COMBAT_ACTION.HOLD]: COMBAT_TOOL.SELF,
  [COMBAT_ACTION.END_TEMPO]: COMBAT_TOOL.SELF,
  [COMBAT_ACTION.EXPOSE]: COMBAT_TOOL.TORCH,
  [COMBAT_ACTION.WHITEOUT]: COMBAT_TOOL.TORCH,
  [COMBAT_ACTION.MONITOR]: COMBAT_TOOL.RECORDER,
  [COMBAT_ACTION.PLAYBACK]: COMBAT_TOOL.RECORDER,
  [COMBAT_ACTION.INVERT]: COMBAT_TOOL.RIG,
  [COMBAT_ACTION.TUNE]: COMBAT_TOOL.FORK,
  [COMBAT_ACTION.RADIO_DECOY]: COMBAT_TOOL.RADIO,
  [COMBAT_ACTION.STEADY_HANDS]: COMBAT_TOOL.COFFEE,
});

const ACTION_SNR = Object.freeze({
  [COMBAT_ACTION.MONITOR]: SNR_STATE.SIGNAL,
  [COMBAT_ACTION.TUNE]: SNR_STATE.SIGNAL,
  [COMBAT_ACTION.STEADY_HANDS]: SNR_STATE.SIGNAL,
  [COMBAT_ACTION.EXPOSE]: SNR_STATE.NOISE,
  [COMBAT_ACTION.WHITEOUT]: SNR_STATE.NOISE,
  [COMBAT_ACTION.PLAYBACK]: SNR_STATE.NOISE,
  [COMBAT_ACTION.RADIO_DECOY]: SNR_STATE.NOISE,
  [COMBAT_ACTION.HOLD]: SNR_STATE.SILENCE,
  [COMBAT_ACTION.INVERT]: SNR_STATE.SILENCE,
});

// The stance triangle, restated as data for the UI. Every number here must
// agree with outgoingDamage / defensivePrevention / captureDamage and the
// fragile-signal penalty in applyEnemyIntent.
export const SNR_TRIANGLE = Object.freeze({
  [SNR_STATE.SIGNAL]: Object.freeze({
    dmgMod: 0, guardMod: 1, captureMod: 0, fragile: true,
    blurb: '+1 GUARD · CLEAN CAPTURE · +1 DMG WHEN HIT',
  }),
  [SNR_STATE.NOISE]: Object.freeze({
    dmgMod: 1, guardMod: -1, captureMod: -1, fragile: false,
    blurb: '+1 DMG DEALT · -1 GUARD · -1 CAPTURE',
  }),
  [SNR_STATE.SILENCE]: Object.freeze({
    dmgMod: -1, guardMod: 1, captureMod: 0, fragile: false,
    blurb: '+1 GUARD · -1 DMG DEALT',
  }),
});

export function actionCounterKinds(actionId) {
  const kinds = [];
  if (ACTION_COUNTER[actionId]) kinds.push(ACTION_COUNTER[actionId]);
  if (actionId === COMBAT_ACTION.WHITEOUT) kinds.push(INTENT_KIND.SILENCE);
  return kinds;
}

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
  if (definition?.signature && !['echo', 'feedback', 'ensemble', 'contract', 'routing'].includes(definition.signature.id)) {
    errors.push(`${definition?.id || 'combat'} has invalid encounter signature`);
  }
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
      radio: !!tools.radio,
      coffee: !!tools.coffee,
      order: unique(tools.order).filter((id) => Object.values(COMBAT_TOOL).includes(id) && id !== COMBAT_TOOL.SELF),
    },
    injuries: Math.max(0, integer(injuries, 0)),
    techniques: normalizedTechniques,
    take: roomTone,
    exposedBonus: 0,
    ringing: false,
    snr: SNR_STATE.SIGNAL,
    tempo: false,
    tuneUsedMovement: null,
    tuneBonus: 0,
    whiteoutUsed: false,
    feedbackLoopUsed: false,
    feedbackMovements: [],
    radioUsed: false,
    coffeeUsed: false,
    signaturePressure: 0,
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
    snr: state.snr,
    injuries: state.injuries,
    signature: state.definition.signature || null,
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
  state.signaturePressure = 0;
  state.tuneBonus = 0;
  state.last.transition = { from: finishedIndex, to: state.movementIndex };
}

function applyDamageToEnemy(state, amount) {
  const damage = Math.max(0, integer(amount, 0));
  state.movementCoherence = Math.max(0, state.movementCoherence - damage);
  return damage;
}

function shiftSnr(state, actionId) {
  const next = ACTION_SNR[actionId] || state.snr;
  const previous = state.snr;
  state.snr = next;
  return { from: previous, to: next, changed: previous !== next };
}

function outgoingDamage(state, amount) {
  const base = Math.max(0, integer(amount, 0));
  if (!base) return 0;
  if (state.snr === SNR_STATE.NOISE) return base + 1;
  if (state.snr === SNR_STATE.SILENCE) return Math.max(1, base - 1);
  return base;
}

function defensivePrevention(state, amount) {
  const base = Math.max(0, integer(amount, 0));
  if (state.snr === SNR_STATE.SIGNAL) return base + 1;
  if (state.snr === SNR_STATE.NOISE) return Math.max(0, base - 1);
  if (state.snr === SNR_STATE.SILENCE) return base + 1;
  return base;
}

function captureDamage(state, amount) {
  const base = clamp(integer(amount, 1), 1, 4);
  if (state.snr === SNR_STATE.NOISE) return Math.max(1, base - 1);
  return base;
}

function applyEnemyIntent(state, intent, prevention) {
  const signature = state.definition.signature?.id;
  const echo = Math.max(0, integer(state.signaturePressure, 0));
  state.signaturePressure = 0;
  const ensemble = signature === 'ensemble'
    && (state.turnsInMovement + 1) % 3 === 0
    && state.tuneUsedMovement !== state.movementIndex ? 1 : 0;
  const fragileSignal = state.snr === SNR_STATE.SIGNAL ? 1 : 0;
  const damage = Math.max(0,
    integer(intent?.damage, 0) + echo + ensemble + fragileSignal
    - Math.max(0, integer(prevention, 0)),
  );
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
  if (signature === 'echo') state.signaturePressure = 1;
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
  if (actionId === COMBAT_ACTION.RADIO_DECOY) {
    if (!state.tools.radio) return { enabled: false, reason: 'NO RADIO' };
    if (state.radioUsed) return { enabled: false, reason: 'FREQUENCY BURNED' };
  }
  if (actionId === COMBAT_ACTION.STEADY_HANDS) {
    if (!state.tools.coffee) return { enabled: false, reason: 'NO COFFEE' };
    if (state.coffeeUsed) return { enabled: false, reason: 'CUP EMPTY' };
    if (state.composure >= state.maxComposure) return { enabled: false, reason: 'COMPOSURE STEADY' };
  }
  if (actionId === COMBAT_ACTION.END_TEMPO && !state.tempo) return { enabled: false, reason: 'NO TEMPO' };
  return { enabled: true };
}

export function availableCombatActions(state) {
  const intent = currentCombatIntent(state);
  const actions = [
    {
      id: COMBAT_ACTION.HOLD, tool: COMBAT_TOOL.SELF, label: 'HOLD',
      detail: `PREVENT ${defensivePrevention({ ...state, snr: SNR_STATE.SILENCE }, state.difficulty.holdPrevention)} · ENTER SILENCE`,
      prevents: defensivePrevention({ ...state, snr: SNR_STATE.SILENCE }, state.difficulty.holdPrevention),
    },
    {
      id: COMBAT_ACTION.EXPOSE, tool: COMBAT_TOOL.TORCH, label: 'EXPOSE',
      detail: `${outgoingDamage({ ...state, snr: SNR_STATE.NOISE }, 2)} COHERENCE · ENTER NOISE`,
      damage: outgoingDamage({ ...state, snr: SNR_STATE.NOISE }, 2),
    },
    {
      id: COMBAT_ACTION.MONITOR, tool: COMBAT_TOOL.RECORDER, label: 'MONITOR',
      detail: 'CAPTURE BROADCAST · ENTER SIGNAL',
      prevents: defensivePrevention({ ...state, snr: SNR_STATE.SIGNAL }, 1),
      captures: true,
    },
    {
      id: COMBAT_ACTION.PLAYBACK, tool: COMBAT_TOOL.RECORDER, label: 'PLAYBACK',
      detail: state.take ? `${state.take.damage}+ COHERENCE · CONSUME ${state.take.label}` : 'NO TAKE LOADED',
      damage: state.take ? outgoingDamage({ ...state, snr: SNR_STATE.NOISE }, integer(state.take.damage, 0) + state.exposedBonus) : 0,
      consumesTake: true,
    },
    {
      id: COMBAT_ACTION.INVERT, tool: COMBAT_TOOL.RIG, label: 'INVERT',
      detail: 'CONSUME TAKE · RETURN LOOP · ENTER SILENCE',
      damage: intent?.invertible ? outgoingDamage({ ...state, snr: SNR_STATE.SILENCE }, integer(intent?.damage, 0)) : 0,
      consumesTake: true,
    },
    ...(hasTechnique(state, TECHNIQUE.WHITEOUT) ? [{
      id: COMBAT_ACTION.WHITEOUT, tool: COMBAT_TOOL.TORCH, label: 'WHITEOUT',
      detail: '5 COHERENCE · ONCE / ENCOUNTER',
      damage: outgoingDamage({ ...state, snr: SNR_STATE.NOISE }, 4),
      once: true,
    }] : []),
    ...(state.tools.fork ? [{
      id: COMBAT_ACTION.TUNE, tool: COMBAT_TOOL.FORK, label: 'TUNE',
      detail: 'FREE · REVEAL TWO INTENTS · ENTER SIGNAL',
      reveals: 2, free: true,
    }] : []),
    ...(state.tools.radio ? [{
      id: COMBAT_ACTION.RADIO_DECOY, tool: COMBAT_TOOL.RADIO, label: 'THROW VOICE',
      detail: 'PREVENT 2 · BURN FREQUENCY · ENTER NOISE',
      prevents: 2, once: true,
    }] : []),
    ...(state.tools.coffee ? [{
      id: COMBAT_ACTION.STEADY_HANDS, tool: COMBAT_TOOL.COFFEE, label: 'STEADY HANDS',
      detail: 'RESTORE 3 COMPOSURE · CONSUME · ENTER SIGNAL',
      heals: 3, once: true,
    }] : []),
    ...(state.tempo ? [{
      id: COMBAT_ACTION.END_TEMPO, tool: COMBAT_TOOL.SELF, label: 'CLOSE CHANNEL',
      detail: 'END BONUS ACTION',
      free: true,
    }] : []),
  ];
  return actions.map((action) => {
    const availability = actionAvailability(state, action.id);
    const countersKinds = actionCounterKinds(action.id);
    return {
      damage: 0,
      prevents: 0,
      heals: 0,
      ...action,
      ...availability,
      countersKinds,
      stanceShift: ACTION_SNR[action.id] || null,
      perfect: countersKinds.includes(intent?.kind),
    };
  });
}

// One-line mechanical readouts, assembled from the same structured fields the
// reducer runs on so the UI copy can never drift from the rules.
export function combatMoveSubtext(state, move) {
  if (!move) return { short: '', long: '' };
  const bits = [];
  if (move.damage) bits.push(`${move.damage} DMG`);
  if (move.prevents) bits.push(`GUARD ${move.prevents}`);
  if (move.heals) bits.push(`+${move.heals} COMPOSURE`);
  if (move.captures) bits.push('CAPTURE TAKE');
  if (move.consumesTake) bits.push('SPEND TAKE');
  if (move.reveals) bits.push(`SEE ${move.reveals} AHEAD`);
  if (move.free) bits.push('FREE');
  if (move.once) bits.push('ONCE');
  if (move.stanceShift) bits.push(`→${String(move.stanceShift).toUpperCase()}`);
  if (move.countersKinds?.length) bits.push(`CTR ${move.countersKinds.map((kind) => kind.toUpperCase()).join('/')}`);
  const short = bits.join(' · ');
  const sentences = [];
  if (move.damage) sentences.push(`${move.damage} coherence damage`);
  if (move.prevents) sentences.push(`guards ${move.prevents} incoming`);
  if (move.heals) sentences.push(`restores ${move.heals} composure`);
  if (move.captures) sentences.push('captures a recordable broadcast as a take');
  if (move.consumesTake) sentences.push('spends the loaded take');
  if (move.reveals) sentences.push(`reveals the next ${move.reveals} intents`);
  if (move.free) sentences.push('does not spend the beat');
  if (move.once) sentences.push('once per encounter');
  if (move.stanceShift) sentences.push(`shifts stance to ${String(move.stanceShift).toUpperCase()}`);
  if (move.countersKinds?.length) {
    sentences.push(`counters ${move.countersKinds.map((kind) => kind.toUpperCase()).join('/')} — hit negated, TEMPO opens`);
  }
  const long = `${move.label} — ${sentences.join(' · ') || move.detail || ''}`;
  return { short, long };
}

export function counterMovesForIntent(state, intent) {
  if (!intent) return [];
  return availableCombatActions(state).filter((move) => (
    move.countersKinds.includes(intent.kind) && move.enabled
  ));
}

const TOOL_LABEL = Object.freeze({
  [COMBAT_TOOL.SELF]: 'HANDS',
  [COMBAT_TOOL.TORCH]: 'FIELD TORCH',
  [COMBAT_TOOL.RECORDER]: 'RECORDER',
  [COMBAT_TOOL.RIG]: 'BENT RIG',
  [COMBAT_TOOL.FORK]: 'TUNING FORK',
  [COMBAT_TOOL.RADIO]: 'RADIO',
  [COMBAT_TOOL.COFFEE]: 'COFFEE',
});

export function availableCombatTools(state) {
  const available = [COMBAT_TOOL.TORCH, COMBAT_TOOL.RECORDER, COMBAT_TOOL.RIG, COMBAT_TOOL.FORK, COMBAT_TOOL.RADIO, COMBAT_TOOL.COFFEE]
    .filter((id) => !!state.tools[id]);
  const ordered = unique([...(state.tools.order || []), ...available]).filter((id) => available.includes(id));
  const equipped = [COMBAT_TOOL.SELF, ...ordered];
  return equipped.map((id) => {
    const moves = combatMovesForTool(state, id);
    return {
      id,
      label: TOOL_LABEL[id],
      moves: moves.map((move) => move.id),
      ready: moves.some((move) => move.enabled),
    };
  });
}

export function combatMovesForTool(state, toolId) {
  return availableCombatActions(state).filter((action) => action.tool === toolId);
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
    const snrShift = shiftSnr(state, actionId);
    state.tuneUsedMovement = state.movementIndex;
    state.tuneBonus = 1;
    toolCount(state, 'fork');
    state.last = {
      notice: 'FORK CALIBRATED · SIGNAL CLEAN · NEXT TWO INTENTS REVEALED',
      transition: null, action: actionId, perfect: false,
      snrFrom: snrShift.from, snrTo: snrShift.to, dealt: 0, received: 0,
    };
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
  const composureBefore = state.composure;
  const coherenceBefore = state.movementCoherence;
  const snrShift = shiftSnr(state, actionId);
  let prevention = 0;
  let enemyDamage = 0;
  let dealt = 0;
  let notice = '';

  state.last = { notice: '', transition: null, action: actionId, perfect, snrFrom: snrShift.from, snrTo: snrShift.to };
  toolCount(state, ACTION_TOOL[actionId] || actionId);

  if (actionId === COMBAT_ACTION.EXPOSE || actionId === COMBAT_ACTION.WHITEOUT) {
    const whiteout = actionId === COMBAT_ACTION.WHITEOUT;
    const cost = availability.cost || 0;
    state.battery = Math.max(0, state.battery - cost);
    state.torchSpent += cost;
    state.whiteoutUsed ||= whiteout;
    dealt = applyDamageToEnemy(state, outgoingDamage(state, whiteout ? 4 : 2));
    state.exposedBonus = whiteout ? 0 : hasTechnique(state, TECHNIQUE.AFTERIMAGE) ? 2 : 1;
    notice = `${whiteout ? 'WHITEOUT' : 'EXPOSE'} · ${dealt} COHERENCE`;
  } else if (actionId === COMBAT_ACTION.MONITOR) {
    prevention = defensivePrevention(state, 1);
    if (intent?.recordable) {
      if (state.take && !action.replaceTake) {
        state.last = { notice: 'TAKE SLOT OCCUPIED · CONFIRM REPLACEMENT', transition: null, action: actionId, perfect: false, needsTakeConfirmation: true };
        return state;
      }
      state.take = {
        id: intent.id,
        label: intent.takeLabel || intent.label,
        damage: captureDamage(state, intent.playbackDamage ?? intent.damage ?? 2),
        tag: intent.takeTag || null,
      };
      notice = `CAPTURED · ${state.take.label}`;
    } else notice = 'MONITORING · NO STABLE TAKE';
  } else if (actionId === COMBAT_ACTION.PLAYBACK) {
    dealt = applyDamageToEnemy(state, outgoingDamage(state, integer(state.take?.damage, 0) + state.exposedBonus));
    const retained = hasTechnique(state, TECHNIQUE.OVERDUB) && state.tools.rig && !state.overdubMovements.includes(state.movementIndex);
    if (retained) {
      state.take = { id: `${takeBefore.id}:overdub`, label: `${takeBefore.label} / OVERDUB`, damage: 1, tag: takeBefore.tag };
      state.overdubMovements.push(state.movementIndex);
    } else state.take = null;
    state.exposedBonus = 0;
    notice = `PLAYBACK · ${dealt} COHERENCE${retained ? ' · RESIDUAL TAKE' : ''}`;
  } else if (actionId === COMBAT_ACTION.HOLD) {
    prevention = defensivePrevention(state, state.difficulty.holdPrevention);
    state.ringing = false;
    notice = `HOLD · PREVENT ${prevention}`;
  } else if (actionId === COMBAT_ACTION.INVERT) {
    const retain = hasTechnique(state, TECHNIQUE.FEEDBACK_LOOP) && !state.feedbackLoopUsed;
    dealt = applyDamageToEnemy(state, outgoingDamage(state, integer(intent?.damage, 0) + (retain ? 1 : 0)));
    if (retain) state.feedbackLoopUsed = true;
    else state.take = null;
    notice = `INVERT · ${dealt} RETURNED${retain ? ' · TAKE RETAINED' : ''}`;
  } else if (actionId === COMBAT_ACTION.RADIO_DECOY) {
    state.radioUsed = true;
    prevention = defensivePrevention(state, 2);
    if (intent?.kind === INTENT_KIND.BROADCAST || intent?.kind === INTENT_KIND.LOOP) {
      dealt = applyDamageToEnemy(state, outgoingDamage(state, 1));
    }
    notice = `THROW VOICE · PREVENT ${prevention} · FREQUENCY BURNED${dealt ? ` · ${dealt} COHERENCE` : ''}`;
  } else if (actionId === COMBAT_ACTION.STEADY_HANDS) {
    state.coffeeUsed = true;
    const restored = Math.min(3, state.maxComposure - state.composure);
    state.composure += restored;
    notice = `STEADY HANDS · ${restored} COMPOSURE RESTORED · CUP EMPTY`;
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

  if (state.definition.signature?.id === 'feedback'
      && actionId === COMBAT_ACTION.PLAYBACK
      && state.snr === SNR_STATE.NOISE
      && !state.feedbackMovements.includes(state.movementIndex)) {
    state.feedbackMovements.push(state.movementIndex);
    state.composure = Math.max(0, state.composure - 1);
    state.damageTaken += 1;
    enemyDamage += 1;
    notice += ' · HOUSE RETURN -1 COMPOSURE';
  }

  if (state.composure <= 0) {
    state.last.notice = `${notice} · COMPOSURE LOST`;
    advanceIntent(state);
    finishCombat(state, 'lose');
  } else if (state.movementCoherence <= 0) {
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
    snrFrom: snrShift.from,
    snrTo: snrShift.to,
  });
  Object.assign(state.last, {
    dealt,
    received: enemyDamage,
    composureFrom: composureBefore,
    composureTo: state.composure,
    coherenceFrom: coherenceBefore,
    coherenceTo: state.movementCoherence,
    snrFrom: snrShift.from,
    snrTo: snrShift.to,
    consumed: actionId === COMBAT_ACTION.STEADY_HANDS ? COMBAT_TOOL.COFFEE : null,
  });
  return state;
}

export function combatResult(state) {
  return state?.result ? clone(state.result) : null;
}
