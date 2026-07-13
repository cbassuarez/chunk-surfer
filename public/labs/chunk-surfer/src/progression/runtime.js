import { getMeta, getSave, metaCommit, saveCommit } from '../game/save.js';
import { ACHIEVEMENT_BY_ID } from './achievement-defs.js';
import { evaluateAchievements } from './achievements.js';
import { resolveDifficulty } from './difficulty.js';
import { EVENT_TYPES, createEventBus, validateEvent } from './events.js';
import { applyRuleChange, previewRuleChange } from './integrity.js';
import { markKnowledge } from './knowledge.js';
import { buildRunSummary } from './report.js';
import { reduceRunLedger } from './run-ledger.js';
import { EVENT_SCHEMA_VERSION } from './schema.js';
import { deriveUnlocks, diffUnlocks } from './unlocks.js';
import { queueChangedStats } from './stat-defs.js';

export const progressionEvents = createEventBus();
let buildId = 'LOCAL';

const unique = (values) => [...new Set(values)];

export function progressionInit({ build = 'LOCAL' } = {}) {
  buildId = String(build || 'LOCAL');
  return progressionSnapshot();
}

function statPatchFor(event, meta) {
  const stats = { ...meta.stats };
  switch (event.type) {
    case EVENT_TYPES.TAKE_COMPLETED: stats.takesCompleted += 1; break;
    case EVENT_TYPES.TAKE_SPOILED: stats.takesSpoiled += 1; break;
    case EVENT_TYPES.BATTLE_FINISHED:
      if (event.payload?.result === 'win') stats.battlesWon += 1;
      break;
    case EVENT_TYPES.PLAYBACK_DISCOVERED:
      stats.disclosuresFound = Math.max(stats.disclosuresFound, getSave().run?.ledger?.disclosures?.length || 0);
      break;
    case EVENT_TYPES.PROP_INSPECTED:
      stats.objectsInspected = Math.max(stats.objectsInspected, getSave().run?.ledger?.propsInspected?.length || 0);
      break;
    default: break;
  }
  return stats;
}

function rememberEvent(event) {
  const p = event.payload || {};
  switch (event.type) {
    case EVENT_TYPES.DOCUMENT_READ: markKnowledge('documents', p.id, event.runId, event.at); break;
    case EVENT_TYPES.PLAYBACK_DISCOVERED: markKnowledge('playbacks', p.id, event.runId, event.at); break;
    case EVENT_TYPES.PROP_INSPECTED:
    case EVENT_TYPES.PROP_AUDITIONED:
      markKnowledge('props', p.id, event.runId, event.at);
      break;
    default: break;
  }
}

export function unlockAchievement(id, { runId = getSave()?.run?.id || null, notify = true, at = Date.now() } = {}) {
  if (!ACHIEVEMENT_BY_ID[id]) return false;
  const meta = getMeta();
  if (meta.achievements[id]) return false;
  const achievements = {
    ...meta.achievements,
    [id]: { unlockedAt: at, runId, build: buildId },
  };
  const pendingAchievements = unique([...(meta.platform.pendingAchievements || []), id]);
  const pendingNotices = notify ? [
    ...(meta.presentation.pendingNotices || []),
    { id: `achievement:${id}:${at}`, type: 'achievement', achievementId: id, createdAt: at },
  ] : [...(meta.presentation.pendingNotices || [])];
  metaCommit({
    achievements,
    platform: { ...meta.platform, pendingAchievements },
    presentation: { ...meta.presentation, pendingNotices },
  });
  return true;
}

export function emitProgress(type, payload = {}, source = 'game', {
  notifyAchievements = true,
  at = Date.now(),
} = {}) {
  const save = getSave();
  const run = save.run;
  if (!run?.id) return { ok: false, reason: 'NO_ACTIVE_RUN', unlocked: [] };
  const seq = (Number(run.ledger?.seq) || 0) + 1;
  const event = {
    schema: EVENT_SCHEMA_VERSION,
    id: `${run.id}:${String(seq).padStart(6, '0')}`,
    runId: run.id,
    seq,
    at,
    type,
    source,
    payload,
  };
  if (!validateEvent(event)) {
    console.warn('[progression] invalid event rejected', type, payload);
    return { ok: false, reason: 'INVALID_EVENT', unlocked: [] };
  }

  run.ledger = reduceRunLedger(run.ledger, event);
  saveCommit({ run });
  rememberEvent(event);

  const meta = getMeta();
  const nextStats = statPatchFor(event, meta);
  const pendingStats = queueChangedStats(
    meta.stats,
    nextStats,
    meta.platform?.pendingStats,
  );
  metaCommit({
    ...(event.type === EVENT_TYPES.HUSH_MET && !meta.hushMet ? { hushMet: true } : {}),
    stats: nextStats,
    platform: { ...meta.platform, pendingStats },
  });

  progressionEvents.emit(event);
  const profile = getMeta();
  const currentRun = getSave().run;
  const summary = event.type === EVENT_TYPES.RUN_FINISHED ? event.payload.summary : null;
  const ids = evaluateAchievements({ event, profile, run: currentRun, summary });
  const unlocked = ids.filter((id) => unlockAchievement(id, {
    runId: currentRun?.id,
    notify: notifyAchievements,
    at,
  }));
  return { ok: true, event, unlocked };
}

export function beginRunProgression() {
  const run = getSave()?.run;
  if (!run) return { ok: false, reason: 'NO_RUN' };
  return emitProgress(EVENT_TYPES.RUN_STARTED, { preset: run.rules.startedPreset }, 'progression.beginRun');
}

export function currentDifficulty() {
  return resolveDifficulty(getSave()?.run?.rules);
}

export function previewCurrentRuleChange(key, nextValue) {
  return previewRuleChange(getSave()?.run, key, nextValue);
}

export function applyCurrentRuleChange(change, now = Date.now()) {
  const save = getSave();
  if (!save.run) return null;
  const run = applyRuleChange(save.run, change, now);
  saveCommit({ run });
  return run;
}

export function commitReturn(endingId, authoritative = {}, now = Date.now()) {
  const save = getSave();
  const run = save.run;
  if (!run) throw new Error('cannot commit a return without an active run');
  const existing = run.finalizedReturn;
  if (existing?.summaryId) {
    return getMeta().returns.records[existing.summaryId] || existing;
  }

  const beforeUnlocks = deriveUnlocks(getMeta());
  let summary = buildRunSummary({ endingId, save, meta: getMeta(), authoritative, now });
  const metaBefore = getMeta();
  const endingsSeen = unique([...(metaBefore.endingsSeen || []), endingId]);

  run.status = 'return-committed';
  run.completedAt = now;
  run.pendingReturn = { endingId, summaryId: summary.id, committedAt: now };
  run.finalizedReturn = { endingId, summaryId: summary.id, committedAt: now };
  saveCommit({ run });

  const returnStats = {
    ...metaBefore.stats,
    runsCompleted: (metaBefore.stats?.runsCompleted || 0) + 1,
    endingsSeen: endingsSeen.length,
  };
  metaCommit({
    endingsSeen,
    stats: returnStats,
    platform: {
      ...metaBefore.platform,
      pendingStats: queueChangedStats(
        metaBefore.stats,
        returnStats,
        metaBefore.platform?.pendingStats,
      ),
    },
  });

  const endingResult = emitProgress(
    EVENT_TYPES.ENDING_COMMITTED,
    { endingId },
    'progression.commitReturn',
    { notifyAchievements: false, at: now },
  );
  const runResult = emitProgress(
    EVENT_TYPES.RUN_FINISHED,
    { summary },
    'progression.commitReturn',
    { notifyAchievements: false, at: now },
  );

  const metaAfterAchievements = getMeta();
  const deadAirComplete = summary.rules.startedPreset === 'dead-air'
    && summary.integrity.deadAir.eligible === true;
  if (deadAirComplete && !metaAfterAchievements.challengeCompletions.deadAir) {
    metaCommit({ challengeCompletions: { ...metaAfterAchievements.challengeCompletions, deadAir: true } });
  }

  const afterUnlocks = deriveUnlocks(getMeta());
  summary = {
    ...summary,
    unlockedAchievements: unique([...(endingResult.unlocked || []), ...(runResult.unlocked || [])]),
    newlyUnlockedFeatures: diffUnlocks(beforeUnlocks, afterUnlocks),
  };

  const meta = getMeta();
  const records = { ...meta.returns.records, [summary.id]: summary };
  const history = unique([...(meta.returns.history || []), summary.id]);
  const pendingReports = unique([...(meta.presentation.pendingReports || []), summary.id]);
  metaCommit({
    returns: { records, history },
    presentation: { ...meta.presentation, pendingReports },
    cosmetics: { ...meta.cosmetics, unlocked: afterUnlocks.cosmetics },
  });
  return summary;
}

export function pendingReturnReport() {
  const meta = getMeta();
  const id = meta.presentation.pendingReports?.[0];
  return id ? meta.returns.records?.[id] || null : null;
}

export function consumeReturnReport(summaryId) {
  const meta = getMeta();
  const pendingReports = (meta.presentation.pendingReports || []).filter((id) => id !== summaryId);
  metaCommit({ presentation: { ...meta.presentation, pendingReports } });
  const run = getSave().run;
  if (run?.finalizedReturn?.summaryId === summaryId) {
    run.status = 'complete';
    run.pendingReturn = null;
    saveCommit({ run });
  }
}

export function progressionSnapshot() {
  return {
    run: getSave()?.run || null,
    meta: getMeta(),
    unlocks: deriveUnlocks(getMeta()),
    difficulty: currentDifficulty(),
  };
}

export function assertProgressionInvariants(save = getSave(), meta = getMeta()) {
  const errors = [];
  if (save?.run?.status === 'active' && !save.run.id) errors.push('active run has no id');
  if (save?.run?.integrity?.deadAir?.eligible && save.run.rules?.startedPreset !== 'dead-air') {
    errors.push('Dead Air eligible without a Dead Air start');
  }
  if (new Set(meta?.endingsSeen || []).size !== (meta?.endingsSeen || []).length) errors.push('duplicate ending ids');
  for (const id of Object.keys(meta?.achievements || {})) {
    if (!ACHIEVEMENT_BY_ID[id]) errors.push(`unknown achievement: ${id}`);
  }
  return { ok: errors.length === 0, errors };
}
