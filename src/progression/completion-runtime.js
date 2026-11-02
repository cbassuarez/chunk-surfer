import { getMeta, getSave, metaCommit } from '../game/save.js';
import { reduceCompletionLedger, completionLedgerFromSave, normalizeCompletionLedger } from './completion-ledger.js';

const unranked = save => save?.run?.integrity?.achievements?.eligible === false;
const skipped = () => ({ changed: false, completion: normalizeCompletionLedger(getMeta()?.completion), reason: 'UNRANKED_RUN' });

// The validated progression event remains the authority. This adapter records
// its receipt before the caller evaluates achievements against the new meta.
export function recordCompletionEvent(event) {
  if (unranked(getSave())) return skipped();
  const result = reduceCompletionLedger(getMeta()?.completion, event);
  if (result.changed) metaCommit({ completion: result.completion });
  return result;
}

export function captureCompletionFromSave(save = getSave(), options = {}) {
  if (unranked(getSave()) || unranked(save)) return skipped();
  const result = completionLedgerFromSave(getMeta()?.completion, save, options);
  if (result.changed) metaCommit({ completion: result.completion });
  return result;
}
