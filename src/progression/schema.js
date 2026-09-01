// Versioned progression schemas. This module is deliberately pure: it owns
// defaults and normalization, but never touches localStorage or game systems.

import { DEFAULT_CONTROLLER_SETTINGS, normalizeControllerSettings } from '../game/bindings.js';
import { normalizeControlMode } from '../input/input-manager.js';
import { normalizeBackgroundAudioMode } from '../audio/background-audio.js';
import {
  DEFAULT_NATATORIUM_WATER_ENVIRONMENT,
  DEFAULT_NATATORIUM_WATER_LEDGER,
  decideNatatoriumWaterEnvironment,
  normalizeNatatoriumWaterEnvironment,
  normalizeNatatoriumWaterLedger,
} from '../game/natatorium-water.js';
import {
  DEFAULT_STAIR_ANOMALY_ENVIRONMENT,
  decideStairAnomalyEnvironment,
  freshStairAnomalyLedger,
  normalizeStairAnomalyEnvironment,
  normalizeStairAnomalyLedger,
} from '../game/stair-anomaly.js';
import { normalizeReturnHistory } from './return-history.js';
import { normalizeInterferenceRecord } from '../game/interference-case.js';
import { carriedRead, readFromCarried } from '../game/enemy-mind.js';
import { freshReferenceExposure, normalizeReferenceExposure } from '../game/reference-exposure.js';
import { POWER_CIRCUIT_IDS } from '../game/conservatory-power.js';
export { POWER_CIRCUIT_IDS } from '../game/conservatory-power.js';
import {
  DEFAULT_PSYCH_PROFILE_SETTINGS,
  freshPsychProfileState,
  normalizePsychProfileSettings,
  normalizePsychProfileState,
} from '../game/psychological-profile.js';

export const SAVE_VERSION = 4;
export const META_VERSION = 2;
export const RUN_SCHEMA_VERSION = 3;
export const EVENT_SCHEMA_VERSION = 1;
export const PROFILE_EXPORT_VERSION = 1;

export const ENDING_IDS = Object.freeze([
  'sacrifice',
  'helped',
  'inversion',
  'drugged',
  'surfaced',
  'contact-won',
  'contact-lost',
  'tower-won',
  'tower-lost',
]);

export const DEFAULT_SETTINGS = Object.freeze({
  volume: 1,
  dialog: 1,
  sfx: 1,
  music: 1,
  monitorGain: 1,
  backgroundAudio: 'continue',
  textCps: 42,
  instantText: false,
  fx: true,
  flash: 'full',
  shake: 'full',
  haptics: 'full',
  towerPealAssist: 'standard',
  rhythmTimingOffsetMs: 0,
  reduceDread: false,
  hushAudioDistortion: 'full',
  hushSilence: 'full',
  hushHiss: 'full',
  hushWhispers: 'full',
  hushSuddenCuts: 'full',
  hushLightFlicker: 'full',
  hushCueCaptions: false,
  tutorialPrompts: true,
  objectiveHints: 'full',
  controlHud: 'smart',
  pauseOnBlur: true,
  controlMode: 'direct',
  mouseSensitivity: 1,
  mouseInvertY: false,
  mic: 'ask',
  micInput: {
    deviceId: 'default',
    channelMode: 'mono',
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: false,
    lastDeviceLabel: '',
  },
  lastDifficulty: 'contract',
  seenTextMode: 'fast',
  archiveSignals: 'subtle',
  condensedCheckIn: false,
  personalInterference: {
    enabled: false,
    sourceSteam: true,
    sourceOs: false,
    sourceHost: true,
    sourceMic: true,
    vfdText: true,
    localSpeech: false,
    intensity: 'standard',
  },
  psychProfile: DEFAULT_PSYCH_PROFILE_SETTINGS,
  controller: DEFAULT_CONTROLLER_SETTINGS,
  customShiftRules: null,
});

export const DEFAULT_RULE_VALUES = Object.freeze({
  presencePressure: 'standard',
  recordingForgiveness: 'standard',
  combatAssistance: 'standard',
  navigationSignal: 'directional',
  escapeTimer: 'standard',
  torchDrain: 'standard',
  involuntaryBreath: 'standard',
});

const uniqueStrings = (value) => [
  ...new Set((Array.isArray(value) ? value : []).filter((v) => typeof v === 'string')),
];
const HUSH_SYNC_LABELS = new Set(['UNISON', 'COHERENT', 'DRIFT', 'CORRECTED']);

const objectOr = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

const finiteOr = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function normalizeMicInputSettings(value) {
  const source = objectOr(value);
  const deviceId = typeof source.deviceId === 'string' && source.deviceId.trim()
    ? source.deviceId.slice(0, 256)
    : 'default';
  const channelMode = ['mono', 'left', 'right'].includes(source.channelMode)
    ? source.channelMode
    : 'mono';
  return {
    deviceId,
    channelMode,
    echoCancellation: source.echoCancellation !== false,
    noiseSuppression: !!source.noiseSuppression,
    autoGainControl: !!source.autoGainControl,
    lastDeviceLabel: typeof source.lastDeviceLabel === 'string' ? source.lastDeviceLabel.slice(0, 96) : '',
  };
}

export function makeRunId(now = Date.now(), random = Math.random) {
  const suffix = Math.floor(random() * 0xffffff).toString(36).padStart(5, '0');
  return `run_${Math.floor(now)}_${suffix}`;
}

export function freshLedger() {
  return {
    seq: 0,
    takes: { completed: 0, spoiled: 0, aborted: 0, rooms: [], contaminated: [] },
    injuries: 0,
    battles: { started: 0, won: 0, lost: 0, firstPassWon: 0, results: {} },
    disclosures: [],
    documentsRead: [],
    propsInspected: [],
    propsAuditioned: [],
    itemsObtained: [],
    choices: { drankCoffee: false, namedSarah: false },
    equipment: { dropped: [], recovered: [] },
    natatoriumWater: { ...DEFAULT_NATATORIUM_WATER_LEDGER },
    stairAnomaly: freshStairAnomalyLedger(),
    power: { live: [], everRestored: [] },
    reference: freshReferenceExposure(),
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
  const runId = id || makeRunId(now);
  const waterEnvironment = decideNatatoriumWaterEnvironment({ meta, runId, now });
  const environment = {
    ...waterEnvironment,
    stairAnomaly: Object.freeze(decideStairAnomalyEnvironment({ routeTrunk: waterEnvironment.routeTrunk, runId, now })),
  };

  return {
    schema: RUN_SCHEMA_VERSION,
    id: runId,
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
    environment,
    ledger: freshLedger(),
    interference: null,
    // What the thing in the building has worked out about how this recordist
    // plays: which verbs they reach for and which they land. Carried between
    // encounters so the chapel opens already knowing you.
    //
    // Deliberately NOT part of the psychological profile. That module is
    // consent-gated and its own header promises it never receives input
    // histories, which is exactly what this is. This is in-fiction memory —
    // the opponent has been listening all night — not measurement of a person.
    enemyRead: null,
    pendingReturn: null,
    finalizedReturn: null,
  };
}

export function freshMeta() {
  return {
    version: META_VERSION,
    endingsSeen: [],
    hushMet: false,
    // The first actual Natatorium fireball introduces authored desktop space.
    // First-launch title remains sealed until this durable mark exists.
    windowChoreographyIntroduced: false,
    leftMidRun: false,
    // The EULA version this installation accepted. The bundled model licences
    // are OpenRAIL-M: their use restrictions have to reach the person running
    // the model, not just ship in a file beside it. Empty means never accepted,
    // and a version bump means accept again.
    eulaAccepted: '',
    eulaAcceptedAt: 0,
    psychProfile: freshPsychProfileState(),
    // A semantic payload marker, bumped only when the offline PyTorch/model
    // bundle changes. This drives the one-time preparation explanation without
    // repeating it for ordinary saves or every application launch.
    lensRuntimeReady: '',
    lensRuntimeReadyAt: 0,
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
    causalTape: {
      status: 'none',
      latestId: null,
      contentHash: null,
      topologyHash: null,
      endingId: null,
      durationMs: 0,
      recordedAt: 0,
      injuries: null,
      failure: null,
    },
    hushRun: { completed: 0, bestSync: 0, bestGrade: null },
    legacyTerminal: { opened: [], cursors: {}, lastFileId: null },
    cosmetics: { unlocked: [], selected: null },
    platform: { pendingAchievements: [], pendingStats: {}, lastSyncAt: 0 },
    // lastBootWeather is which of rain/leaves/sheets the last launch drew, so
    // the next one can be something else. `presentation` is deliberately local
    // only — it is stripped from profile exports — which is right for a fact
    // about this machine's last boot rather than about the player.
    presentation: { pendingReports: [], pendingNotices: [], lastBootWeather: '' },
  };
}

export function normalizeSettings(value) {
  const source = objectOr(value);
  const personalSource = objectOr(source.personalInterference);
  const personalDefault = DEFAULT_SETTINGS.personalInterference;
  const controller = normalizeControllerSettings(source.controller, source.controllerBindings);
  const intensity = ['low', 'standard', 'hostile'].includes(personalSource.intensity)
    ? personalSource.intensity
    : personalDefault.intensity;
  return {
    ...DEFAULT_SETTINGS,
    ...source,
    controlMode: normalizeControlMode(source.controlMode),
    mouseSensitivity: Math.max(0.2, Math.min(3, finiteOr(source.mouseSensitivity, 1))),
    mouseInvertY: !!source.mouseInvertY,
    haptics: ['off','reduced','full'].includes(source.haptics) ? source.haptics : DEFAULT_SETTINGS.haptics,
    controlHud: ['smart','persistent'].includes(source.controlHud) ? source.controlHud : DEFAULT_SETTINGS.controlHud,
    towerPealAssist: ['standard','guided','wide'].includes(source.towerPealAssist) ? source.towerPealAssist : DEFAULT_SETTINGS.towerPealAssist,
    rhythmTimingOffsetMs: Math.round(Math.max(-250, Math.min(250, finiteOr(source.rhythmTimingOffsetMs, 0))) / 5) * 5,
    backgroundAudio: normalizeBackgroundAudioMode(source.backgroundAudio),
    personalInterference: {
      enabled: !!personalSource.enabled,
      sourceSteam: personalSource.sourceSteam !== false,
      sourceOs: personalSource.sourceOs === true,
      sourceHost: personalSource.sourceHost !== false,
      sourceMic: personalSource.sourceMic !== false,
      vfdText: personalSource.vfdText !== false,
      localSpeech: false,
      intensity,
    },
    psychProfile: normalizePsychProfileSettings(source.psychProfile, source),
    controller,
    micInput: normalizeMicInputSettings(source.micInput),
  };
}

// `stairMissing` decides what a ledger with no stair record means. See the note
// on the call in normalizeRun: for a run at the current schema it means "not met
// yet", and for an older one it means "leave that run alone".
export function normalizeLedger(value, { legacyFlags = null, stairMissing = 'completed' } = {}) {
  const source = objectOr(value);
  const takes = objectOr(source.takes);
  const battles = objectOr(source.battles);
  const choices = objectOr(source.choices);
  const equipment = objectOr(source.equipment);
  const power = objectOr(source.power);

  return {
    seq: Math.max(0, Math.floor(finiteOr(source.seq, 0))),
    takes: {
      completed: Math.max(0, Math.floor(finiteOr(takes.completed, 0))),
      spoiled: Math.max(0, Math.floor(finiteOr(takes.spoiled, 0))),
      aborted: Math.max(0, Math.floor(finiteOr(takes.aborted, 0))),
      rooms: uniqueStrings(takes.rooms),
      contaminated: uniqueStrings(takes.contaminated).filter((id) => uniqueStrings(takes.rooms).includes(id)),
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
    natatoriumWater: normalizeNatatoriumWaterLedger(source.natatoriumWater),
    stairAnomaly: normalizeStairAnomalyLedger(source.stairAnomaly, { missing: stairMissing }),
    power: {
      live: uniqueStrings(power.live).filter((id) => POWER_CIRCUIT_IDS.includes(id)),
      everRestored: uniqueStrings(power.everRestored).filter((id) => POWER_CIRCUIT_IDS.includes(id)),
    },
    reference: normalizeReferenceExposure(source.reference, { legacyFlags }),
  };
}

export function normalizeRun(value, { meta = null, settings = null, activeFallback = false, legacyFlags = null } = {}) {
  if (!value || typeof value !== 'object') {
    return activeFallback ? freshRunRecord({ meta, settings }) : null;
  }
  const source = value;
  const rules = objectOr(source.rules);
  const rawRuleValues = objectOr(rules.values);
  const migratedRuleValues = rawRuleValues.combatAssistance == null && typeof rawRuleValues.redactionAssistance === 'string'
    ? { ...rawRuleValues, combatAssistance: rawRuleValues.redactionAssistance }
    : rawRuleValues;
  const integrity = objectOr(source.integrity);
  const deadAir = objectOr(integrity.deadAir);
  const replay = objectOr(source.replay);
  const startedPreset = typeof rules.startedPreset === 'string' ? rules.startedPreset : 'contract';
  const runId = typeof source.id === 'string' && source.id ? source.id : makeRunId(source.startedAt || Date.now());
  const fallbackEnvironment = DEFAULT_NATATORIUM_WATER_ENVIRONMENT;
  const waterEnvironment = normalizeNatatoriumWaterEnvironment(source.environment, fallbackEnvironment);
  const fallbackStairEnvironment = decideStairAnomalyEnvironment({
    routeTrunk: waterEnvironment.routeTrunk,
    runId,
    now: source.startedAt || 0,
  });

  return {
    schema: RUN_SCHEMA_VERSION,
    id: runId,
    status: ['active', 'return-committed', 'complete'].includes(source.status) ? source.status : 'active',
    startedAt: finiteOr(source.startedAt, Date.now()),
    completedAt: source.completedAt == null ? null : finiteOr(source.completedAt, null),
    rules: {
      startedPreset,
      currentPreset: typeof rules.currentPreset === 'string' ? rules.currentPreset : startedPreset,
      custom: !!rules.custom,
      values: { ...DEFAULT_RULE_VALUES, ...migratedRuleValues },
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
      // Cross-run assists default OFF: a fresh run should read the same whether
      // or not you have played before. Previously-seen text played at normal
      // speed, and the ◆ "never chosen" hint stays hidden until the player opts
      // in from Settings. Only an explicit stored value turns them on.
      seenTextMode: ['normal', 'fast', 'instant'].includes(replay.seenTextMode) ? replay.seenTextMode : 'normal',
      // Off unless explicitly enabled; the settings toggle stores 'subtle' for on.
      archiveSignals: replay.archiveSignals === true || replay.archiveSignals === 'subtle',
      condensedCheckIn: !!replay.condensedCheckIn,
      seenTextAssistUsed: !!replay.seenTextAssistUsed,
      condensedCheckInUsed: !!replay.condensedCheckInUsed,
    },
    environment: {
      ...waterEnvironment,
      stairAnomaly: Object.freeze(normalizeStairAnomalyEnvironment(
        objectOr(source.environment).stairAnomaly,
        fallbackStairEnvironment || DEFAULT_STAIR_ANOMALY_ENVIRONMENT,
      )),
    },
    // THE IMPOSSIBLE STAIR IS ARMED UNLESS THIS RUN PREDATES IT.
    //
    // `normalizeStairAnomalyLedger` defaults a missing record to COMPLETED so an
    // old save cannot surprise-trigger the event mid-run. That is right for an
    // old save and wrong for every other one: a run at the current schema whose
    // ledger has no stair record has simply not met the stair yet, and reading
    // that as "already done" disarmed the feature permanently — the trigger
    // returns false on the first line of stairTriggerCrossed and no amount of
    // walking the main open well will ever fire it. Which is why the god menu
    // grew a RE-ARM STAIR item.
    //
    // So the legacy protection keys on the schema version it was actually about.
    ledger: normalizeLedger(source.ledger, {
      legacyFlags,
      stairMissing: finiteOr(source.schema, 0) >= RUN_SCHEMA_VERSION ? 'armed' : 'completed',
    }),
    interference: normalizeInterferenceRecord(source.interference),
    // Absent on saves written before the opponent could remember anything, in
    // which case the night simply starts with it knowing nothing about you.
    enemyRead: source.enemyRead ? carriedRead(readFromCarried(source.enemyRead)) : null,
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
  const causalTape = objectOr(source.causalTape);
  const hushRun = objectOr(source.hushRun);
  const legacyTerminal = objectOr(source.legacyTerminal);
  const endingsSeen = uniqueStrings(source.endingsSeen).filter((id) => ENDING_IDS.includes(id));

  return {
    ...base,
    version: META_VERSION,
    endingsSeen,
    hushMet: !!source.hushMet,
    windowChoreographyIntroduced: !!source.windowChoreographyIntroduced,
    leftMidRun: !!source.leftMidRun,
    eulaAccepted: typeof source.eulaAccepted === 'string' ? source.eulaAccepted.slice(0, 40) : '',
    eulaAcceptedAt: Math.max(0, Math.floor(finiteOr(source.eulaAcceptedAt, 0))),
    psychProfile: normalizePsychProfileState(source.psychProfile),
    lensRuntimeReady: typeof source.lensRuntimeReady === 'string' ? source.lensRuntimeReady.slice(0, 80) : '',
    lensRuntimeReadyAt: Math.max(0, Math.floor(finiteOr(source.lensRuntimeReadyAt, 0))),
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
      history: normalizeReturnHistory(returns.history),
    },
    causalTape: {
      status: ['none', 'ready', 'failed', 'incompatible', 'filing'].includes(causalTape.status) ? causalTape.status : 'none',
      latestId: typeof causalTape.latestId === 'string' ? causalTape.latestId : null,
      contentHash: typeof causalTape.contentHash === 'string' ? causalTape.contentHash : null,
      topologyHash: typeof causalTape.topologyHash === 'string' ? causalTape.topologyHash : null,
      endingId: ENDING_IDS.includes(causalTape.endingId) ? causalTape.endingId : null,
      durationMs: Math.max(0, Math.round(finiteOr(causalTape.durationMs, 0))),
      recordedAt: Math.max(0, Math.round(finiteOr(causalTape.recordedAt, 0))),
      injuries: causalTape.injuries == null ? null : Math.max(0, Math.floor(finiteOr(causalTape.injuries, 0))),
      failure: typeof causalTape.failure === 'string' ? causalTape.failure.slice(0, 96) : null,
    },
    hushRun: {
      completed: Math.max(0, Math.floor(finiteOr(hushRun.completed, 0))),
      bestSync: Math.max(0, Math.min(100, Math.round(finiteOr(hushRun.bestSync, 0)))),
      bestGrade: HUSH_SYNC_LABELS.has(hushRun.bestGrade) ? hushRun.bestGrade : null,
    },
    legacyTerminal: {
      opened: uniqueStrings(legacyTerminal.opened).slice(0, 32),
      cursors: Object.fromEntries(Object.entries(objectOr(legacyTerminal.cursors)).slice(0, 32).map(([id, cursor]) => [id, Math.max(0, Math.floor(finiteOr(cursor, 0)))])),
      lastFileId: typeof legacyTerminal.lastFileId === 'string' ? legacyTerminal.lastFileId.slice(0, 96) : null,
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
      lastBootWeather: typeof presentation.lastBootWeather === 'string'
        ? presentation.lastBootWeather.slice(0, 12)
        : '',
    },
  };
}
