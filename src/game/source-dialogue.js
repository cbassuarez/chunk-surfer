// DIALOGUE DIRECTOR FOR THE PAPER FIELD.
//
// Nothing in this file writes prose. `source-pages.js` owns finished, authored
// sheets; this module only decides which already-written sheet a physical piece
// of paper has always been. The selection state is JSON-safe so it can live in
// Chunk Surf save state without Maps, clocks, browser state, or telemetry.

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
const clamp01 = (value) => clamp(value, 0, 1);

function hashString(value = '') {
  let h = 2166136261 >>> 0;
  for (const ch of String(value)) {
    h ^= ch.codePointAt(0) || 0;
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function hash01(seed, key, salt = 0) {
  const h = hashString(`${Number(seed) || 4417}:${key}:${salt}`);
  return h / 4294967295;
}

export const SOURCE_DIALOGUE_FACT = Object.freeze({
  ENTERED_VIA_LOADING_BAY: 'enteredViaLoadingBay',
  RETURNED_TOWARD_VAN: 'returnedTowardVan',
  LINGERED_NEAR_VAN: 'lingeredNearVan',
  RETAKES: 'retakes',
  SPOILED_RECORDING: 'spoiledRecording',
  WRONG_PAGES: 'wrongPages',
  HUSH_SEEN: 'hushSeen',
  HUSH_CONTACT: 'hushContact',
  TURNED_BACK_IN_SEARCH: 'turnedBackInSearch',
  STOOD_STILL_UNDER_PRESSURE: 'stoodStillUnderPressure',
  RAIN_STARTED: 'rainStarted',
  APPROACHED_STILL_PAGE: 'approachedStillPage',
  APPROACHED_THEN_RETREATED: 'approachedThenRetreated',
  RECORDER_CARRIED: 'recorderCarried',
});

export const SOURCE_ADAPTATION_TIER = Object.freeze({
  NONE: 'none',
  PLAUSIBLE: 'plausible',
  CONTINGENT: 'contingent',
  IMPOSSIBLE: 'impossible',
});

export const SOURCE_DIALOGUE_LIMITS = Object.freeze({
  maxHighLoadConsecutive: 2,
  highLoad: 0.50,
  ruptureLoad: 0.75,
  recoveryLoad: 0.25,
  maxVentriloquial: 1,
  maxContingent: 2,
  maxImpossible: 1,
  contingentMinRead: 7,
  impossibleMinRead: 10,
  maxActiveThreads: 2,
  localFactLatencyReads: 3,
});

const FACT_KEYS = new Set(Object.values(SOURCE_DIALOGUE_FACT));
const TIERS = new Set(Object.values(SOURCE_ADAPTATION_TIER));

function normalizedFactEntry(value, readCount = 0) {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    return {
      value: value.value,
      recordedAtRead: Math.max(0, Math.floor(Number(value.recordedAtRead) || 0)),
      eligibleAfterRead: Math.max(0, Math.floor(Number(value.eligibleAfterRead) || 0)),
    };
  }
  return { value, recordedAtRead: 0, eligibleAfterRead: Math.max(0, Math.floor(Number(readCount) || 0)) };
}

function baseFacts(value = {}) {
  const out = {};
  for (const [key, fact] of Object.entries(value || {})) {
    if (!FACT_KEYS.has(key) || fact == null || fact === false || fact === 'none' || fact === 0) continue;
    out[key] = normalizedFactEntry(fact, 0);
  }
  return out;
}

export function freshSourceDialogueState({ seed = 4417, facts = {} } = {}) {
  return {
    schema: 1,
    seed: Number(seed) || 4417,
    readCount: 0,
    assignments: {},
    history: [],
    facts: baseFacts(facts),
    threads: {},
    adaptation: { contingent: 0, impossible: 0 },
    ventriloquialCount: 0,
  };
}

export function normalizeSourceDialogueState(value = null, fallback = {}) {
  const base = freshSourceDialogueState(fallback);
  if (!value || typeof value !== 'object') return base;
  const assignments = value.assignments && typeof value.assignments === 'object' && !Array.isArray(value.assignments)
    ? Object.fromEntries(Object.entries(value.assignments).filter(([key, id]) => key && typeof id === 'string' && id)) : {};
  const history = Array.isArray(value.history) ? value.history.filter((entry) => entry && typeof entry.id === 'string').map((entry) => ({
    id: entry.id,
    family: String(entry.family || ''),
    register: String(entry.register || ''),
    dialogicLoad: clamp01(entry.dialogicLoad),
    voiceState: String(entry.voiceState || 'stable'),
    adaptationTier: TIERS.has(entry.adaptationTier) ? entry.adaptationTier : SOURCE_ADAPTATION_TIER.NONE,
    read: Math.max(1, Math.floor(Number(entry.read) || 1)),
  })) : [];
  const facts = { ...base.facts };
  for (const [key, fact] of Object.entries(value.facts || {})) {
    if (FACT_KEYS.has(key)) facts[key] = normalizedFactEntry(fact, history.length);
  }
  const threads = {};
  for (const [id, thread] of Object.entries(value.threads || {})) {
    if (!id || !thread || typeof thread !== 'object') continue;
    threads[id] = {
      nextStep: Math.max(2, Math.floor(Number(thread.nextStep) || 2)),
      eligibleAfterRead: Math.max(0, Math.floor(Number(thread.eligibleAfterRead) || 0)),
      completed: !!thread.completed,
    };
  }
  return {
    schema: 1,
    seed: Number(value.seed) || base.seed,
    readCount: history.length,
    assignments,
    history,
    facts,
    threads,
    adaptation: {
      contingent: Math.max(0, Math.floor(Number(value.adaptation?.contingent) || history.filter((entry) => entry.adaptationTier === SOURCE_ADAPTATION_TIER.CONTINGENT).length)),
      impossible: Math.max(0, Math.floor(Number(value.adaptation?.impossible) || history.filter((entry) => entry.adaptationTier === SOURCE_ADAPTATION_TIER.IMPOSSIBLE).length)),
    },
    ventriloquialCount: Math.max(0, Math.floor(Number(value.ventriloquialCount) || history.filter((entry) => entry.voiceState === 'ventriloquial').length)),
  };
}

export function sourceDialogueExposureStage(readCount = 0) {
  const n = Math.max(0, Math.floor(Number(readCount) || 0));
  if (n < 2) return 0;
  if (n < 4) return 1;
  if (n < 6) return 2;
  if (n < 10) return 3;
  if (n < 13) return 4;
  return 5;
}

export function sourceWrongPageBucket(readCount = 0) {
  const n = Math.max(0, Math.floor(Number(readCount) || 0));
  if (n >= 10) return 'many';
  if (n >= 5) return 'several';
  return 'few';
}

export function recordSourceDialogueFact(input, key, value = true, { latencyReads = 0 } = {}) {
  const state = normalizeSourceDialogueState(input);
  if (!FACT_KEYS.has(key)) return state;
  const current = state.facts[key];
  // Boolean lived events are monotonic. Do not erase something the character
  // already experienced because a later frame reports false.
  if (current?.value === true && value !== true) return state;
  const recordedAtRead = state.readCount;
  const eligibleAfterRead = recordedAtRead + Math.max(0, Math.floor(Number(latencyReads) || 0));
  return {
    ...state,
    facts: {
      ...state.facts,
      [key]: { value, recordedAtRead, eligibleAfterRead },
    },
  };
}

function factEligibleInState(state, key, expected = true) {
  const fact = state.facts[key];
  if (!fact || state.readCount < fact.eligibleAfterRead) return false;
  if (Array.isArray(expected)) return expected.includes(fact.value);
  return expected === undefined ? !!fact.value : fact.value === expected;
}

export function sourceDialogueFactEligible(input, key, expected = true) {
  return factEligibleInState(normalizeSourceDialogueState(input), key, expected);
}

function factsSatisfied(note, state) {
  for (const requirement of note.requiresFacts || []) {
    const key = typeof requirement === 'string' ? requirement : requirement.key;
    const expected = typeof requirement === 'string' ? true : requirement.value;
    if (!factEligibleInState(state, key, expected)) return false;
  }
  for (const exclusion of note.excludesFacts || []) {
    const key = typeof exclusion === 'string' ? exclusion : exclusion.key;
    const expected = typeof exclusion === 'string' ? true : exclusion.value;
    if (factEligibleInState(state, key, expected)) return false;
  }
  return true;
}

function activeThreadCount(state) {
  return Object.values(state.threads).filter((thread) => !thread.completed).length;
}

function threadAllowed(note, state) {
  if (note.opensThread && activeThreadCount(state) >= SOURCE_DIALOGUE_LIMITS.maxActiveThreads && !state.threads[note.opensThread.id]) return false;
  if (!note.repliesToThread) return true;
  const thread = state.threads[note.repliesToThread];
  return !!thread && !thread.completed && thread.nextStep === note.threadStep && state.readCount >= thread.eligibleAfterRead;
}

function adaptationAllowed(note, state) {
  const tier = note.adaptationTier || SOURCE_ADAPTATION_TIER.NONE;
  if (tier === SOURCE_ADAPTATION_TIER.CONTINGENT) {
    return state.readCount >= SOURCE_DIALOGUE_LIMITS.contingentMinRead
      && state.adaptation.contingent < SOURCE_DIALOGUE_LIMITS.maxContingent;
  }
  if (tier === SOURCE_ADAPTATION_TIER.IMPOSSIBLE) {
    return state.readCount >= SOURCE_DIALOGUE_LIMITS.impossibleMinRead
      && state.adaptation.impossible < SOURCE_DIALOGUE_LIMITS.maxImpossible;
  }
  return true;
}

function highRun(history) {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].dialogicLoad > SOURCE_DIALOGUE_LIMITS.highLoad) count += 1;
    else break;
  }
  return count;
}

function recoveryIsDue(history) {
  let due = false;
  for (let i = history.length - 1; i >= Math.max(0, history.length - 2); i -= 1) {
    if (history[i]?.dialogicLoad < SOURCE_DIALOGUE_LIMITS.ruptureLoad) continue;
    const after = history.slice(i + 1);
    if (after.some((entry) => entry.dialogicLoad <= SOURCE_DIALOGUE_LIMITS.recoveryLoad)) continue;
    if (after.length >= 1) due = true;
  }
  return due;
}

function familyCooldownOk(note, history) {
  const cooldown = Math.max(0, Math.floor(Number(note.familyCooldown) || 0));
  if (!cooldown || !note.family) return true;
  const recent = history.slice(-cooldown);
  return !recent.some((entry) => entry.family === note.family);
}

function desiredLoad(state, sheetId) {
  const stage = sourceDialogueExposureStage(state.readCount);
  const centres = [0.08, 0.20, 0.34, 0.49, 0.61, 0.70];
  const jitter = (hash01(state.seed, sheetId, state.readCount + 17) - 0.5) * 0.34;
  // About one read in four is deliberately ordinary camouflage regardless of
  // depth. This is a statistical envelope, never a scheduled escalation.
  const reset = hash01(state.seed, sheetId, 913 + state.readCount) < 0.24;
  return reset ? 0.08 + hash01(state.seed, sheetId, 77) * 0.14 : clamp01(centres[stage] + jitter);
}

function scoreNote(note, state, target, sheetId) {
  let score = 0.18 + Math.max(0.02, 1 - Math.abs(note.dialogicLoad - target) * 1.45);
  const recent = state.history.slice(-6);
  if (!recent.some((entry) => entry.family === note.family)) score *= 1.45;
  if (!recent.some((entry) => entry.register === note.register)) score *= 1.18;
  if (note.repliesToThread) score *= 2.7;
  if (note.adaptationTier === SOURCE_ADAPTATION_TIER.PLAUSIBLE) score *= 0.78;
  if (note.adaptationTier === SOURCE_ADAPTATION_TIER.CONTINGENT) score *= 0.34;
  if (note.adaptationTier === SOURCE_ADAPTATION_TIER.IMPOSSIBLE) score *= 0.10;
  if (note.voiceState === 'ventriloquial') score *= 0.08;
  return Math.max(0.0001, score * (0.84 + hash01(state.seed, `${sheetId}:${note.id}`, 331) * 0.32));
}

function weightedPick(scored, state, sheetId) {
  const total = scored.reduce((sum, item) => sum + item.score, 0);
  let cursor = hash01(state.seed, sheetId, 1701 + state.readCount) * total;
  for (const item of scored) {
    cursor -= item.score;
    if (cursor <= 0) return item.note;
  }
  return scored[scored.length - 1]?.note || null;
}

function candidatePool(corpus, state, { hallStage = 4 } = {}) {
  const exposure = sourceDialogueExposureStage(state.readCount);
  const forceRecovery = recoveryIsDue(state.history);
  const highCount = highRun(state.history);
  return corpus.filter((note) => {
    if (!note || !note.id) return false;
    if (Number(note.stageMin) > exposure || Number(note.stageMax) < exposure) return false;
    if (Number(note.hallMin) > hallStage || Number(note.hallMax) < hallStage) return false;
    if (!factsSatisfied(note, state) || !threadAllowed(note, state) || !adaptationAllowed(note, state)) return false;
    if (!familyCooldownOk(note, state.history)) return false;
    if (note.voiceState === 'ventriloquial' && state.ventriloquialCount >= SOURCE_DIALOGUE_LIMITS.maxVentriloquial) return false;
    if (highCount >= SOURCE_DIALOGUE_LIMITS.maxHighLoadConsecutive && note.dialogicLoad > SOURCE_DIALOGUE_LIMITS.highLoad) return false;
    if (forceRecovery && note.dialogicLoad > SOURCE_DIALOGUE_LIMITS.recoveryLoad) return false;
    return true;
  });
}

function applyThread(note, state) {
  let threads = state.threads;
  if (note.opensThread?.id && !threads[note.opensThread.id]) {
    threads = {
      ...threads,
      [note.opensThread.id]: {
        nextStep: 2,
        eligibleAfterRead: state.readCount + Math.max(1, Math.floor(Number(note.opensThread.nextEligibleAfterReads) || 4)),
        completed: false,
      },
    };
  }
  if (note.repliesToThread && threads[note.repliesToThread]) {
    const current = threads[note.repliesToThread];
    const nextStep = Math.max(current.nextStep + 1, Number(note.threadStep) + 1);
    const hasMore = Number(note.threadFinalStep || Infinity) >= nextStep;
    threads = {
      ...threads,
      [note.repliesToThread]: {
        nextStep,
        eligibleAfterRead: state.readCount + Math.max(1, Math.floor(Number(note.threadGapAfterReads) || 5)),
        completed: !hasMore,
      },
    };
  }
  return threads;
}

function appendAssignment(state, sheetId, note) {
  const read = state.readCount + 1;
  const tier = note.adaptationTier || SOURCE_ADAPTATION_TIER.NONE;
  let next = {
    ...state,
    readCount: read,
    assignments: { ...state.assignments, [sheetId]: note.id },
    history: [...state.history, {
      id: note.id,
      family: note.family,
      register: note.register,
      dialogicLoad: note.dialogicLoad,
      voiceState: note.voiceState,
      adaptationTier: tier,
      read,
    }],
    threads: applyThread(note, state),
    adaptation: {
      contingent: state.adaptation.contingent + (tier === SOURCE_ADAPTATION_TIER.CONTINGENT ? 1 : 0),
      impossible: state.adaptation.impossible + (tier === SOURCE_ADAPTATION_TIER.IMPOSSIBLE ? 1 : 0),
    },
    ventriloquialCount: state.ventriloquialCount + (note.voiceState === 'ventriloquial' ? 1 : 0),
  };
  next = recordSourceDialogueFact(next, SOURCE_DIALOGUE_FACT.WRONG_PAGES, sourceWrongPageBucket(read));
  return next;
}

export function assignSourceDialoguePage(input, corpus, {
  sheetId,
  hallStage = 4,
} = {}) {
  let state = normalizeSourceDialogueState(input);
  const key = String(sheetId || 'source-sheet-unknown');
  const existingId = state.assignments[key];
  if (existingId) {
    const existing = corpus.find((note) => note.id === existingId) || null;
    if (existing) return { page: existing, state, assigned: false };
  }

  const target = desiredLoad(state, key);
  let pool = candidatePool(corpus, state, { hallStage: clamp(hallStage, 0, 4) });
  // A corpus authoring mistake must never strand interaction. Relax cooldowns,
  // then dramatic load constraints, but never fact gating or hall/exposure gates.
  if (!pool.length) {
    const exposure = sourceDialogueExposureStage(state.readCount);
    pool = corpus.filter((note) => Number(note.stageMin) <= exposure && Number(note.stageMax) >= exposure
      && Number(note.hallMin) <= hallStage && Number(note.hallMax) >= hallStage
      && factsSatisfied(note, state) && threadAllowed(note, state) && adaptationAllowed(note, state)
      && note.voiceState !== 'ventriloquial');
  }
  if (!pool.length) {
    pool = corpus.filter((note) => Number(note.stageMin) === 0 && Number(note.hallMin) <= hallStage && Number(note.hallMax) >= hallStage);
  }
  const scored = pool.map((note) => ({ note, score: scoreNote(note, state, target, key) }));
  const page = weightedPick(scored, state, key) || corpus[0] || null;
  if (!page) return { page: null, state, assigned: false };
  state = appendAssignment(state, key, page);
  return { page, state, assigned: true };
}

export function sourceDialogueMetrics(input) {
  const state = normalizeSourceDialogueState(input);
  return {
    reads: state.readCount,
    contingent: state.adaptation.contingent,
    impossible: state.adaptation.impossible,
    ventriloquial: state.ventriloquialCount,
    activeThreads: activeThreadCount(state),
    maxHighRun: (() => {
      let max = 0, run = 0;
      for (const entry of state.history) {
        run = entry.dialogicLoad > SOURCE_DIALOGUE_LIMITS.highLoad ? run + 1 : 0;
        max = Math.max(max, run);
      }
      return max;
    })(),
  };
}
