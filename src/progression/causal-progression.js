import { causalRecorder } from '../causal/recorder.js';
import { CAUSAL_REQUIREMENT, CAUSAL_TOPOLOGY_HASH, tapeQualifies, validateCausalTape } from '../causal/tape.js';
import {
  loadLatestCausalTape,
  loadSealedCausalDraft,
  promoteCausalDraft,
} from '../platform/storage/storageService.js';
import { getMeta, metaCommit } from '../game/save.js';
import { emitProgress, unlockAchievement } from './runtime.js';
import { EVENT_TYPES } from './events.js';

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

function markReady(summary, tape) {
  metaCommit({ causalTape: tapeDescriptor(tape) });
  const promotion=emitProgress(EVENT_TYPES.CAUSAL_TAPE_PROMOTED,{contentHash:tape.contentHash,returnSummaryId:tape.returnSummaryId},'causal.promote');
  const unlocked = promotion.unlocked?.includes('ACH_SECOND_TRACK')
    || unlockAchievement('ACH_SECOND_TRACK', { runId: tape.runId, notify: true });
  const current = getMeta().returns.records?.[summary.id] || summary;
  patchSummary(summary.id, {
    causalTape: { status: 'ready', contentHash: tape.contentHash },
    unlockedAchievements: unlocked
      ? [...new Set([...(current.unlockedAchievements || []), 'ACH_SECOND_TRACK'])]
      : current.unlockedAchievements || [],
  });
  return { ok: true, tape, unlocked };
}

export function finalizeCausalReturn(summary) {
  if (!summary || pending.has(summary.id)) return pending.get(summary?.id) || Promise.resolve({ ok: false, reason: 'NO_SUMMARY' });
  if (!tapeQualifies(summary.injuries)) {
    patchSummary(summary.id, { causalTape: { status: 'not-qualified', requirement: CAUSAL_REQUIREMENT } });
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
      const meta=getMeta();
      if(meta.causalTape?.status!=='ready')metaCommit({causalTape:{...meta.causalTape,status:'failed',failure}});
      patchSummary(summary.id,{causalTape:{status:'failed',failure}});
      return result;
    }
    return markReady(summary, result.tape);
  }).catch((error) => {
    const failure = String(error?.message || error || 'WRITE_FAILED').slice(0, 96);
    const meta = getMeta();
    if (meta.causalTape?.status !== 'ready') metaCommit({ causalTape: { ...meta.causalTape, status: 'failed', failure } });
    patchSummary(summary.id, { causalTape: { status: 'failed', failure } });
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
  if (!sealed?.runId || !sealed?.tape?.returnSummaryId) return { ok: false, reason: 'NO_SEALED_DRAFT' };
  const summary = getMeta().returns.records?.[sealed.tape.returnSummaryId];
  if (!summary || !tapeQualifies(summary.injuries)) return { ok: false, reason: 'RETURN_NOT_COMMITTED' };
  try {
    const tape = await promoteCausalDraft(sealed.runId);
    return markReady(summary, tape);
  } catch (error) {
    return { ok: false, reason: String(error?.message || error) };
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
      message: meta.causalTape?.status === 'failed' ? 'TAPE FILING FAILED' : 'COMPLETE A RETURN WITH ≤ 1 INJURY',
    };
  }
  const validation = validateCausalTape(tape, { topologyHash: CAUSAL_TOPOLOGY_HASH });
  if (!validation.ok) {
    return { visible: true, ready: false, status: 'incompatible', message: 'SOURCE TAPE INCOMPATIBLE — FILE A NEW RETURN' };
  }
  return { visible: true, ready: true, status: 'ready', tape };
}
