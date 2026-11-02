import { causalRecorder } from '../causal/recorder.js';
import { CAUSAL_REQUIREMENT, CAUSAL_TOPOLOGY_HASH, tapeQualifies, validateCausalTape } from '../causal/tape.js';
import {
  loadLatestCausalTape,
  loadSealedCausalDraft,
  promoteCausalDraft,
} from '../platform/storage/storageService.js';
import { getMeta, metaCommit } from '../game/save.js';
import { unlockCausalTapeAchievement } from './runtime.js';

const pending = new Map();

function tapeDescriptor(tape) {
  return {
    status: 'ready',
    latestId: tape.returnSummaryId,
    contentHash: tape.contentHash,
    topologyHash: tape.topologyHash,
    endingId: tape.endingId,
    durationMs: tape.durationMs,
    recordedAt: tape.qualification.completedAt,
    injuries: tape.qualification.injuries,
    failure: null,
  };
}

function patchSummary(summaryId, patch) {
  const meta = getMeta();
  const summary = meta.returns.records?.[summaryId];
  if (!summary) return null;
  const next = { ...summary, ...patch };
  metaCommit({ returns: { ...meta.returns, records: { ...meta.returns.records, [summaryId]: next } } });
  return next;
}

function markFilingFailure(summary, failure) {
  const filed = getMeta().returns.records?.[summary?.id];
  if (filed && filed.runId === summary?.runId) {
    patchSummary(filed.id, { causalTape: { status: 'failed', failure } });
  }
  const meta = getMeta();
  const anotherFiling = [...pending.keys()].some(id => id !== summary?.id);
  if (meta.causalTape?.status !== 'ready' && !anotherFiling) {
    metaCommit({ causalTape: { ...meta.causalTape, status: 'failed', failure } });
  }
}

function markOrphanedFilings(exceptId = null) {
  for (const summary of Object.values(getMeta().returns.records || {})) {
    if (summary?.id !== exceptId && summary?.causalTape?.status === 'filing' && !pending.has(summary.id))
      markFilingFailure(summary, 'CAPTURE_UNAVAILABLE');
  }
}

function markReady(summary, tape) {
  const promotion = unlockCausalTapeAchievement(tape);
  if (!promotion.ok) {
    markFilingFailure(summary, promotion.reason || 'UNVERIFIED_CAUSAL_RETURN');
    return promotion;
  }
  metaCommit({ causalTape: tapeDescriptor(tape) });
  const unlocked = promotion.unlocked.includes('ACH_SECOND_TRACK');
  const current = getMeta().returns.records?.[summary.id] || summary;
  patchSummary(summary.id, {
    causalTape: { status: 'ready', contentHash: tape.contentHash },
    // The last delayed filing can also finish Master Copy. Keep the report's
    // receipts in step with the profile rather than dropping that second award.
    unlockedAchievements: [...new Set([...(current.unlockedAchievements || []), ...promotion.unlocked])],
  });
  return { ok: true, tape, unlocked };
}

export function finalizeCausalReturn(summary) {
  if (!summary || pending.has(summary.id)) return pending.get(summary?.id) || Promise.resolve({ ok: false, reason: 'NO_SUMMARY' });
  const filed = getMeta().returns.records?.[summary.id];
  if (!filed || filed.runId !== summary.runId || filed.developerRun === true
    || filed.integrity?.achievements?.eligible === false) {
    markFilingFailure(summary, 'UNVERIFIED_CAUSAL_RETURN');
    return Promise.resolve({ ok: false, reason: 'UNVERIFIED_CAUSAL_RETURN' });
  }
  summary = filed;
  if (!tapeQualifies(summary.injuries)) {
    patchSummary(summary.id, { causalTape: { status: 'not-qualified', requirement: CAUSAL_REQUIREMENT } });
    const meta = getMeta();
    if (meta.causalTape?.status === 'filing' && !pending.size)
      metaCommit({ causalTape: { ...meta.causalTape, status: 'none', failure: null } });
    return Promise.resolve({ ok: false, reason: 'NOT_QUALIFIED' });
  }

  patchSummary(summary.id, { causalTape: { status: 'filing' } });
  const metaBefore = getMeta();
  if (metaBefore.causalTape?.status !== 'ready') metaCommit({ causalTape: { ...metaBefore.causalTape, status: 'filing', failure: null } });
  const task = causalRecorder.finalize({
    summary,
    endingId: summary.endingId,
    injuries: summary.injuries,
    completedAt: summary.completedAt,
  }).then((result) => {
    if (!result.ok) {
      const failure=result.reason==='NOT_QUALIFIED'?'CAPTURE_UNAVAILABLE':String(result.reason||'WRITE_FAILED');
      markFilingFailure(summary, failure);
      return result;
    }
    return markReady(summary, result.tape);
  }).catch((error) => {
    const failure = String(error?.message || error || 'WRITE_FAILED').slice(0, 96);
    markFilingFailure(summary, failure);
    return { ok: false, reason: 'TAPE_FILING_FAILED', error };
  }).finally(() => pending.delete(summary.id));
  pending.set(summary.id, task);
  return task;
}

export function causalFilingForSummary(summaryId) {
  return pending.get(summaryId) || null;
}

export async function reconcileSealedCausalDraft() {
  const sealed = await loadSealedCausalDraft();
  markOrphanedFilings(sealed?.tape?.returnSummaryId || null);
  if (!sealed?.runId || !sealed?.tape?.returnSummaryId) {
    return { ok: false, reason: 'NO_SEALED_DRAFT' };
  }
  const summary = getMeta().returns.records?.[sealed.tape.returnSummaryId];
  if (!summary || summary.developerRun === true || summary.integrity?.achievements?.eligible === false
    || !tapeQualifies(summary.injuries)) {
    if (summary) markFilingFailure(summary, 'RETURN_NOT_COMMITTED');
    return { ok: false, reason: 'RETURN_NOT_COMMITTED' };
  }
  try {
    const tape = await promoteCausalDraft(sealed.runId);
    return markReady(summary, tape);
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 96);
    markFilingFailure(summary, reason);
    return { ok: false, reason };
  }
}

export async function inspectCausalTapeAvailability(meta = getMeta()) {
  if (!(meta.endingsSeen || []).length) return { visible: false, ready: false, status: 'unfiled' };
  const tape = await loadLatestCausalTape();
  if (!tape) {
    return {
      visible: true,
      ready: false,
      status: meta.causalTape?.status === 'failed' ? 'failed' : 'qualification-required',
      message: meta.causalTape?.status === 'failed' ? 'TAPE FILING FAILED' : `COMPLETE A RETURN WITH ${CAUSAL_REQUIREMENT.toUpperCase()}`,
    };
  }
  const validation = validateCausalTape(tape, { topologyHash: CAUSAL_TOPOLOGY_HASH });
  if (!validation.ok) {
    return { visible: true, ready: false, status: 'incompatible', message: 'SOURCE TAPE INCOMPATIBLE — FILE A NEW RETURN' };
  }
  return { visible: true, ready: true, status: 'ready', tape };
}
