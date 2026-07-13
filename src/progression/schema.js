// Versioned progression schemas. This module is deliberately pure: it owns
// defaults and normalization, but never touches localStorage or game systems.

export const SAVE_VERSION = 3;
export const META_VERSION = 2;
export const RUN_SCHEMA_VERSION = 1;
export const EVENT_SCHEMA_VERSION = 1;
export const PROFILE_EXPORT_VERSION = 1;

export const ENDING_IDS = Object.freeze([
  'sacrifice',
  'helped',
  'inversion',
  'drugged',
]);

export const DEFAULT_SETTINGS = Object.freeze({
  volume: 1,
  dialog: 1,
  sfx: 1,
  music: 1,
  monitorGain: 1,
  textCps: 42,
  instantText: false,
  fx: true,
  flash: 'full',
  shake: 'full',
  reduceDread: false,
  hushAudioDistortion: 'full',
  hushSilence: 'full',
  hushHiss: 'full',
  hushSuddenCuts: 'full',
  hushLightFlicker: 'full',
  hushCueCaptions: false,
  tutorialPrompts: true,
  objectiveHints: 'full',
  pauseOnBlur: true,
  mic: 'ask',
  lastDifficulty: 'contract',
  seenTextMode: 'fast',
  archiveSignals: 'subtle',
  condensedCheckIn: false,
  customShiftRules: null,
});

export const DEFAULT_RULE_VALUES = Object.freeze({
  presencePressure: 'standard',
  recordingForgiveness: 'standard',
  redactionAssistance: 'standard',
  navigationSignal: 'directional',
  escapeTimer: 'standard',
  torchDrain: 'standard',
  involuntaryBreath: 'standard',
});

const uniqueStrings = (value) => [
  ...new Set((Array.isArray(value) ? value : []).filter((v) => typeof v === 'string')),
];

const objectOr = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

const finiteOr = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function makeRunId(now = Date.now(), random = Math.random) {
  const suffix = Math.floor(random() * 0xffffff).toString(36).padStart(5, '0');
  return `run_${Math.floor(now)}_${suffix}`;
}

export function freshLedger() {
  return {
    seq: 0,
    takes: { completed: 0, spoiled: 0, aborted: 0, rooms: [] },
    injuries: 0,
    battles: { started: 0, won: 0, lost: 0, firstPassWon: 0, results: {} },
    disclosures: [],
    documentsRead: [],
    propsInspected: [],
    propsAuditioned: [],
    itemsObtained: [],
    choices: { drankCoffee: false, namedSarah: false },
    equipment: { dropped: [], recovered: [] },
  };
}

export function freshRunRecord({
  preset = 'contract',
  values = DEFAULT_RULE_VALUES,
  meta = null,
  settings = null,
  now = Date.now(),
  id = null,
} = {}) {
  const endingsAtStart = uniqueStrings(meta?.endingsSeen).filter((id) => ENDING_IDS.includes(id)).length;
  const deadAir = preset === 'dead-air';
  const s = { ...DEFAULT_SETTINGS, ...objectOr(settings) };

  return {
    schema: RUN_SCHEMA_VERSION,
    id: id || makeRunId(now),
    status: 'active',
    startedAt: now,
    completedAt: null,
    rules: {
      startedPreset: preset,
      currentPreset: preset,
      custom: false,
      values: { ...DEFAULT_RULE_VALUES, ...objectOr(values) },
    },
    integrity: {
      deadAir: {
        startedEligible: deadAir,
        eligible: deadAir,
        invalidations: [],
      },
    },
    replay: {
      isReplay: endingsAtStart > 0,
      endingsAtStart,
      seenTextMode: s.seenTextMode || 'fast',
      archiveSignals: s.archiveSignals !== 'off',
      condensedCheckIn: !!s.condensedCheckIn,
      seenTextAssistUsed: false,
      condensedCheckInUsed: false,
    },
    ledger: freshLedger(),
    pendingReturn: null,
    finalizedReturn: null,
  };
}

export function freshMeta() {
  return {
    version: META_VERSION,
    endingsSeen: [],
    hushMet: false,
    leftMidRun: false,
    runs: 0,
    lastSeenAt: 0,
    achievements: {},
    stats: {
      runsStarted: 0,
      runsCompleted: 0,
      takesCompleted: 0,
      takesSpoiled: 0,
      battlesWon: 0,
      endingsSeen: 0,
      disclosuresFound: 0,
      objectsInspected: 0,
    },
    knowledge: {
      lines: {},
      choices: {},
      documents: {},
      playbacks: {},
      props: {},
    },
    challengeCompletions: { deadAir: false },
    returns: { records: {}, history: [] },
    cosmetics: { unlocked: [], selected: null },
    platform: { pendingAchievements: [], pendingStats: {}, lastSyncAt: 0 },
    presentation: { pendingReports: [], pendingNotices: [] },
  };
}

export function normalizeSettings(value) {
  return { ...DEFAULT_SETTINGS, ...objectOr(value) };
}

export function normalizeLedger(value) {
  const source = objectOr(value);
  const takes = objectOr(source.takes);
  const battles = objectOr(source.battles);
  const choices = objectOr(source.choices);
  const equipment = objectOr(source.equipment);

  return {
    seq: Math.max(0, Math.floor(finiteOr(source.seq, 0))),
    takes: {
      completed: Math.max(0, Math.floor(finiteOr(takes.completed, 0))),
      spoiled: Math.max(0, Math.floor(finiteOr(takes.spoiled, 0))),
      aborted: Math.max(0, Math.floor(finiteOr(takes.aborted, 0))),
      rooms: uniqueStrings(takes.rooms),
    },
    injuries: Math.max(0, Math.floor(finiteOr(source.injuries, 0))),
    battles: {
      started: Math.max(0, Math.floor(finiteOr(battles.started, 0))),
      won: Math.max(0, Math.floor(finiteOr(battles.won, 0))),
      lost: Math.max(0, Math.floor(finiteOr(battles.lost, 0))),
      firstPassWon: Math.max(0, Math.floor(finiteOr(battles.firstPassWon, 0))),
      results: { ...objectOr(battles.results) },
    },
    disclosures: uniqueStrings(source.disclosures),
    documentsRead: uniqueStrings(source.documentsRead),
    propsInspected: uniqueStrings(source.propsInspected),
    propsAuditioned: uniqueStrings(source.propsAuditioned),
    itemsObtained: uniqueStrings(source.itemsObtained),
    choices: {
      drankCoffee: !!choices.drankCoffee,
      namedSarah: !!choices.namedSarah,
    },
    equipment: {
      dropped: uniqueStrings(equipment.dropped),
      recovered: uniqueStrings(equipment.recovered),
    },
  };
}

export function normalizeRun(value, { meta = null, settings = null, activeFallback = false } = {}) {
  if (!value || typeof value !== 'object') {
    return activeFallback ? freshRunRecord({ meta, settings }) : null;
  }
  const source = value;
  const rules = objectOr(source.rules);
  const integrity = objectOr(source.integrity);
  const deadAir = objectOr(integrity.deadAir);
  const replay = objectOr(source.replay);
  const startedPreset = typeof rules.startedPreset === 'string' ? rules.startedPreset : 'contract';

  return {
    schema: RUN_SCHEMA_VERSION,
    id: typeof source.id === 'string' && source.id ? source.id : makeRunId(source.startedAt || Date.now()),
    status: ['active', 'return-committed', 'complete'].includes(source.status) ? source.status : 'active',
    startedAt: finiteOr(source.startedAt, Date.now()),
    completedAt: source.completedAt == null ? null : finiteOr(source.completedAt, null),
    rules: {
      startedPreset,
      currentPreset: typeof rules.currentPreset === 'string' ? rules.currentPreset : startedPreset,
      custom: !!rules.custom,
      values: { ...DEFAULT_RULE_VALUES, ...objectOr(rules.values) },
    },
    integrity: {
      deadAir: {
        startedEligible: !!deadAir.startedEligible,
        eligible: !!deadAir.eligible,
        invalidations: Array.isArray(deadAir.invalidations) ? deadAir.invalidations.filter(Boolean) : [],
      },
    },
    replay: {
      isReplay: !!replay.isReplay,
      endingsAtStart: Math.max(0, Math.floor(finiteOr(replay.endingsAtStart, 0))),
      seenTextMode: ['normal', 'fast', 'instant'].includes(replay.seenTextMode) ? replay.seenTextMode : 'fast',
      archiveSignals: replay.archiveSignals !== false,
      condensedCheckIn: !!replay.condensedCheckIn,
      seenTextAssistUsed: !!replay.seenTextAssistUsed,
      condensedCheckInUsed: !!replay.condensedCheckInUsed,
    },
    ledger: normalizeLedger(source.ledger),
    pendingReturn: source.pendingReturn && typeof source.pendingReturn === 'object' ? source.pendingReturn : null,
    finalizedReturn: source.finalizedReturn && typeof source.finalizedReturn === 'object' ? source.finalizedReturn : null,
  };
}

function normalizeKnowledgeBucket(value) {
  const out = {};
  for (const [id, raw] of Object.entries(objectOr(value))) {
    if (!id || !raw || typeof raw !== 'object') continue;
    out[id] = {
      firstSeenAt: finiteOr(raw.firstSeenAt, 0),
      firstSeenRunId: typeof raw.firstSeenRunId === 'string' ? raw.firstSeenRunId : '',
      lastSeenAt: finiteOr(raw.lastSeenAt, finiteOr(raw.firstSeenAt, 0)),
      count: Math.max(1, Math.floor(finiteOr(raw.count, 1))),
    };
  }
  return out;
}

export function normalizeMeta(value) {
  const source = objectOr(value);
  const base = freshMeta();
  const stats = objectOr(source.stats);
  const knowledge = objectOr(source.knowledge);
  const challenge = objectOr(source.challengeCompletions);
  const returns = objectOr(source.returns);
  const cosmetics = objectOr(source.cosmetics);
  const platform = objectOr(source.platform);
  const presentation = objectOr(source.presentation);
  const endingsSeen = uniqueStrings(source.endingsSeen).filter((id) => ENDING_IDS.includes(id));

  return {
    ...base,
    version: META_VERSION,
    endingsSeen,
    hushMet: !!source.hushMet,
    leftMidRun: !!source.leftMidRun,
    runs: Math.max(0, Math.floor(finiteOr(source.runs, 0))),
    lastSeenAt: finiteOr(source.lastSeenAt, 0),
    achievements: { ...objectOr(source.achievements) },
    stats: {
      runsStarted: Math.max(0, Math.floor(finiteOr(stats.runsStarted, source.runs || 0))),
      runsCompleted: Math.max(0, Math.floor(finiteOr(stats.runsCompleted, returns.history?.length || 0))),
      takesCompleted: Math.max(0, Math.floor(finiteOr(stats.takesCompleted, 0))),
      takesSpoiled: Math.max(0, Math.floor(finiteOr(stats.takesSpoiled, 0))),
      battlesWon: Math.max(0, Math.floor(finiteOr(stats.battlesWon, 0))),
      endingsSeen: endingsSeen.length,
      disclosuresFound: Math.max(0, Math.floor(finiteOr(stats.disclosuresFound, 0))),
      objectsInspected: Math.max(0, Math.floor(finiteOr(stats.objectsInspected, 0))),
    },
    knowledge: {
      lines: normalizeKnowledgeBucket(knowledge.lines),
      choices: normalizeKnowledgeBucket(knowledge.choices),
      documents: normalizeKnowledgeBucket(knowledge.documents),
      playbacks: normalizeKnowledgeBucket(knowledge.playbacks),
      props: normalizeKnowledgeBucket(knowledge.props),
    },
    challengeCompletions: { deadAir: !!challenge.deadAir },
    returns: {
      records: { ...objectOr(returns.records) },
      history: uniqueStrings(returns.history),
    },
    cosmetics: {
      unlocked: uniqueStrings(cosmetics.unlocked),
      selected: typeof cosmetics.selected === 'string' ? cosmetics.selected : null,
    },
    platform: {
      pendingAchievements: uniqueStrings(platform.pendingAchievements),
      pendingStats: { ...objectOr(platform.pendingStats) },
      lastSyncAt: finiteOr(platform.lastSyncAt, 0),
    },
    presentation: {
      pendingReports: uniqueStrings(presentation.pendingReports),
      pendingNotices: Array.isArray(presentation.pendingNotices) ? presentation.pendingNotices.filter(Boolean) : [],
    },
  };
}
