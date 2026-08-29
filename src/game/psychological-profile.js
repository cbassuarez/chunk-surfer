// AUDIOCORP's local response profile. This module is deliberately pure: it
// accepts small, bounded observations and never receives audio buffers,
// identity strings, input histories, permission choices, or accessibility
// settings.

export const PSYCH_PROFILE_CONSENT_VERSION = 'psychological-profile-1';
export const PSYCH_PROFILE_SCHEMA = 1;

export const PSYCH_PROFILE_MODULE_KEYS = Object.freeze([
  'microphone',
  'steamName',
  'osUsername',
  'computerName',
  'microphoneLabel',
  'behavioralMeasurement',
  'adaptiveDifficulty',
  'windowChoreography',
  'fieldReturnFiles',
]);

export const PSYCH_DIMENSIONS = Object.freeze([
  'vigilance',
  'composure',
  'exposure',
  'resistance',
]);

const unit = (value, fallback = 0.5) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
};
const whole = (value, max = 1_000_000) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
const objectOr = (value, fallback = {}) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
);

// WINDOW CHOREOGRAPHY IS THE EXPERIENCE, NOT AN EXTRA.
//
// Every other module here reads something real about the person at the desk --
// their account name, their machine, their microphone -- and each of those is
// off until it is asked for. Choreography reads nothing. It is the game drawing
// its own fireball outside its own frame, and it is on unless somebody turns it
// off, which is the one toggle in this list that is an opt-OUT.
export const PSYCH_PROFILE_DEFAULT_ON = Object.freeze(['windowChoreography']);

export const DEFAULT_PSYCH_PROFILE_SETTINGS = Object.freeze({
  schema: PSYCH_PROFILE_SCHEMA,
  consentVersion: '',
  modules: Object.freeze(Object.fromEntries(PSYCH_PROFILE_MODULE_KEYS.map(
    (key) => [key, PSYCH_PROFILE_DEFAULT_ON.includes(key)],
  ))),
  windowIntensity: 'hostile',
});

export function psychProfileChoice(enabled, current = DEFAULT_PSYCH_PROFILE_SETTINGS) {
  const normalized = normalizePsychProfileSettings(current);
  return {
    ...normalized,
    consentVersion: PSYCH_PROFILE_CONSENT_VERSION,
    modules: Object.fromEntries(PSYCH_PROFILE_MODULE_KEYS.map((key) => [key, !!enabled])),
    windowIntensity: 'hostile',
  };
}

export function normalizePsychProfileSettings(value, legacy = {}) {
  const source = objectOr(value);
  const sourceModules = objectOr(source.modules);
  const hasAuthoritativeSchema = Number(source.schema) === PSYCH_PROFILE_SCHEMA
    || typeof source.consentVersion === 'string';
  const legacyInterference = objectOr(legacy.personalInterference);
  const legacyMic = legacy.mic === 'on';
  const legacyModules = {
    microphone: legacyMic,
    steamName: !!legacyInterference.enabled && legacyInterference.sourceSteam !== false,
    osUsername: !!legacyInterference.enabled && legacyInterference.sourceOs === true,
    computerName: !!legacyInterference.enabled && legacyInterference.sourceHost !== false,
    microphoneLabel: !!legacyInterference.enabled && legacyInterference.sourceMic !== false,
    behavioralMeasurement: false,
    adaptiveDifficulty: false,
    // A save with no legacy block at all has not declined choreography, it has
    // never been asked -- which for an opt-out module is a yes.
    windowChoreography: 'enabled' in legacyInterference ? !!legacyInterference.enabled : undefined,
    fieldReturnFiles: !!legacyInterference.enabled,
  };
  const modules = {};
  for (const key of PSYCH_PROFILE_MODULE_KEYS) {
    const stated = hasAuthoritativeSchema ? sourceModules[key] : legacyModules[key];
    // An opt-out module is on unless something explicitly turned it off. Saves
    // written before it existed say nothing about it, and silence there means
    // "never asked", not "declined".
    modules[key] = PSYCH_PROFILE_DEFAULT_ON.includes(key) && stated === undefined
      ? true
      : stated === true;
  }
  return {
    schema: PSYCH_PROFILE_SCHEMA,
    consentVersion: typeof source.consentVersion === 'string' ? source.consentVersion.slice(0, 48) : '',
    modules,
    // ONE INTENSITY. `low` and `standard` were a dial on a beat that only means
    // anything at full strength -- a fireball that stays politely inside the
    // window is the thing not happening. Old saves carrying either are read as
    // hostile rather than migrated, because the setting no longer exists.
    windowIntensity: 'hostile',
  };
}

export function psychProfileStatus(settings) {
  const normalized = normalizePsychProfileSettings(settings);
  const count = PSYCH_PROFILE_MODULE_KEYS.filter((key) => normalized.modules[key]).length;
  if (count === 0) return 'OFF';
  if (count === PSYCH_PROFILE_MODULE_KEYS.length) return 'FULL';
  return 'CUSTOM';
}

export function freshPsychProfileState() {
  return {
    schema: PSYCH_PROFILE_SCHEMA,
    dimensions: Object.fromEntries(PSYCH_DIMENSIONS.map((key) => [key, 0.5])),
    confidence: 0,
    sampleCount: 0,
    adaptiveBand: 0,
    classification: 'UNRESOLVED',
    dominantDimension: null,
    bandEvidence: 0,
    lastUpdatedRun: null,
  };
}

export function normalizePsychProfileState(value) {
  const source = objectOr(value);
  const base = freshPsychProfileState();
  const dimensions = objectOr(source.dimensions);
  const sampleCount = whole(source.sampleCount, 10_000);
  const dominantDimension = PSYCH_DIMENSIONS.includes(source.dominantDimension)
    ? source.dominantDimension
    : null;
  return {
    schema: PSYCH_PROFILE_SCHEMA,
    dimensions: Object.fromEntries(PSYCH_DIMENSIONS.map((key) => [key, unit(dimensions[key])])),
    confidence: unit(source.confidence, Math.min(1, sampleCount / 16)),
    sampleCount,
    adaptiveBand: [-1, 0, 1].includes(source.adaptiveBand) ? source.adaptiveBand : 0,
    classification: typeof source.classification === 'string'
      ? source.classification.replace(/[^A-Z ]/gu, '').slice(0, 32) || base.classification
      : base.classification,
    dominantDimension,
    bandEvidence: Math.max(-3, Math.min(3, Math.floor(Number(source.bandEvidence) || 0))),
    lastUpdatedRun: typeof source.lastUpdatedRun === 'string' ? source.lastUpdatedRun.slice(0, 96) : null,
  };
}

// Only these authored categories can enter the reducer. Their values are
// normalized summaries produced at safe checkpoints, never continuous logs.
export const PSYCH_OBSERVATION_KINDS = Object.freeze([
  'take',
  'hush-contact',
  'practice-haunt',
  'battle',
  'window-emergency',
]);

export function normalizePsychObservation(value) {
  const source = objectOr(value);
  if (!PSYCH_OBSERVATION_KINDS.includes(source.kind)) return null;
  const signals = {};
  for (const key of PSYCH_DIMENSIONS) {
    if (Number.isFinite(Number(objectOr(source.signals)[key]))) signals[key] = unit(source.signals[key]);
  }
  if (!Object.keys(signals).length) return null;
  return Object.freeze({
    kind: source.kind,
    signals: Object.freeze(signals),
    weight: Math.max(0.15, Math.min(1, Number(source.weight) || 1)),
  });
}

function classify(dimensions) {
  const ranked = PSYCH_DIMENSIONS
    .map((key) => [key, Math.abs(dimensions[key] - 0.5)])
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
  if (ranked[0][1] < 0.055) return { classification: 'UNRESOLVED', dominantDimension: null };
  const dominantDimension = ranked[0][0];
  const label = dimensions[dominantDimension] >= 0.5
    ? dominantDimension.toUpperCase()
    : `LOW ${dominantDimension.toUpperCase()}`;
  return { classification: label, dominantDimension };
}

function desiredBand(dimensions) {
  // Resistance and composure represent demonstrated control. Exposure and
  // vigilance represent accumulating pressure. No single sample can move a
  // band because the reducer applies confidence and hysteresis below.
  const control = (dimensions.resistance + dimensions.composure) / 2;
  const pressure = (dimensions.exposure + dimensions.vigilance) / 2;
  const score = control - pressure;
  if (score >= 0.105) return 1;
  if (score <= -0.105) return -1;
  return 0;
}

export function reducePsychProfile(current, observation, { runId = null } = {}) {
  const state = normalizePsychProfileState(current);
  const input = normalizePsychObservation(observation);
  if (!input) return state;
  const alpha = 0.11 * input.weight;
  const dimensions = { ...state.dimensions };
  for (const [key, target] of Object.entries(input.signals)) {
    dimensions[key] = unit(dimensions[key] + ((target - dimensions[key]) * alpha));
  }
  const sampleCount = state.sampleCount + 1;
  const confidence = Math.min(1, sampleCount / 16);
  const wanted = sampleCount >= 8 ? desiredBand(dimensions) : 0;
  let bandEvidence = wanted === 0
    ? Math.sign(state.bandEvidence) * Math.max(0, Math.abs(state.bandEvidence) - 1)
    : (wanted === Math.sign(state.bandEvidence) ? state.bandEvidence + wanted : wanted);
  bandEvidence = Math.max(-3, Math.min(3, bandEvidence));
  let adaptiveBand = state.adaptiveBand;
  if (confidence >= 0.5 && Math.abs(bandEvidence) >= 3) adaptiveBand = Math.sign(bandEvidence);
  if (wanted === 0 && Math.abs(bandEvidence) === 0) adaptiveBand = 0;
  const named = classify(dimensions);
  return normalizePsychProfileState({
    ...state,
    dimensions,
    confidence,
    sampleCount,
    adaptiveBand,
    bandEvidence,
    ...named,
    lastUpdatedRun: typeof runId === 'string' ? runId : state.lastUpdatedRun,
  });
}

const PRESET_RANKS = Object.freeze({ story: -1, contract: 0, severe: 1, 'dead-air': 2 });

export function profileInfluence(state, {
  enabled = true,
  adaptiveDifficulty = true,
  preset = 'contract',
  custom = false,
} = {}) {
  const normalized = normalizePsychProfileState(state);
  let band = enabled && adaptiveDifficulty ? normalized.adaptiveBand : 0;
  if (preset === 'dead-air') band = 0;
  if (preset === 'story' && band > 0) band = 0;
  if (custom) band = Math.max(-1, Math.min(1, band));
  const authoredRank = PRESET_RANKS[preset] ?? 0;
  return Object.freeze({
    schema: PSYCH_PROFILE_SCHEMA,
    adaptiveBand: band,
    presenceBlend: band * 0.5,
    contactWeightShift: band * 0.10,
    battleIntent: band < 0 ? 'relief' : (band > 0 ? 'pressure' : 'baseline'),
    authoredRank,
    classification: normalized.classification,
    dominantDimension: normalized.dominantDimension,
    confidence: normalized.confidence,
  });
}

export function blendAdjacentRule(current, adjacent, amount) {
  const t = Math.max(0, Math.min(0.5, Math.abs(Number(amount) || 0)));
  const base = objectOr(current);
  const next = objectOr(adjacent, base);
  const blended = { ...base };
  for (const [key, value] of Object.entries(base)) {
    if (Number.isFinite(Number(value)) && Number.isFinite(Number(next[key]))) {
      blended[key] = Number(value) + ((Number(next[key]) - Number(value)) * t);
    }
  }
  return Object.freeze(blended);
}

// The profile's read of the player, turned into one number the fight can use.
//
// This used to reach into the definition and re-sort every movement's intent
// array so the harshest blows came first. That worked when the opponent read
// its moves off the array in order. It no longer does — it chooses — so a
// re-sorted array is a no-op dressed as difficulty, and worse, it mutated
// authored content to say something it does not mean.
//
// Now it hands over `pressureBias`, and the mood machine decides what to do
// with it: a pressured player gets leaned on, a struggling one gets a breath.
// The definition is returned untouched.
export function snapshotBattleIntent(definition, influence, { tutorial = false } = {}) {
  const band = tutorial ? 0 : Math.max(-1, Math.min(1, Number(influence?.adaptiveBand) || 0));
  const intent = band < 0 ? 'relief' : band > 0 ? 'pressure' : 'baseline';
  // DEAD AIR's certification run is never leaned on in either direction, and
  // neither is the bench drill.
  return Object.freeze({ definition, intent, adaptiveBand: band, pressureBias: band });
}

export function psychProfilePublicSummary(settings, state, micState = 'off') {
  const normalizedSettings = normalizePsychProfileSettings(settings);
  const normalizedState = normalizePsychProfileState(state);
  return Object.freeze({
    status: psychProfileStatus(normalizedSettings),
    micStatus: normalizedSettings.modules.microphone && ['denied', 'unavailable', 'error'].includes(micState)
      ? 'MIC BLOCKED'
      : (normalizedSettings.modules.microphone ? 'MIC ON' : 'MIC OFF'),
    classification: normalizedState.classification,
    measuredCategories: Object.freeze(['authored takes', 'HUSH contacts', 'practice haunts', 'battle responses', 'window restores']),
  });
}
