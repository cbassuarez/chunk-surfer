// Read-only preparation for a physical returned cassette. Inspecting its case,
// rotating a reel and auditioning the original never commits custody recovery.
import { normalizeSourceRecordingCustody, sourceRecordingTakeKey } from './source-recording-custody.js';
import { normalizeSourceDriveMedia } from '../audio/source-drive-recording.js';

const clone = value => JSON.parse(JSON.stringify(value));
const validText = value => typeof value === 'string' && value.length > 0;

export function resolveSourceRecordingAccess(custody, takes, { runId, receiptId, chapter, locationId } = {}) {
  const denied = reason => ({ ok: false, reason, recording: null, take: null, previewAvailable: false, token: null });
  if (!validText(runId) || custody?.runId !== runId) return denied('wrong-run');
  const ledger = normalizeSourceRecordingCustody(custody, { runId });
  const recording = ledger.recordings.find(row => row.id === receiptId);
  if (!recording) return denied('missing-receipt');
  if (recording.status !== 'held') return denied('already-recovered');
  if (recording.destination.chapter !== chapter || recording.destination.locationId !== locationId) return denied('wrong-location');
  const matches = (Array.isArray(takes) ? takes : []).filter(row => sourceRecordingTakeKey(row) === recording.takeKey
    && row.id === recording.takeId && row.ordinal === recording.takeOrdinal && row.roomId === recording.roomId);
  const take = matches.length === 1 ? clone(matches[0]) : null;
  let previewReason = matches.length > 1 ? 'ambiguous-source' : take ? null : 'source-unavailable';
  if (take?.voided) previewReason = 'source-erased';
  if (take?.continuous && (take.mediaUnavailable || !normalizeSourceDriveMedia(take.continuous)?.durable || take.continuous.pending))
    previewReason = 'media-unavailable';
  return { ok: true, reason: null, recording: clone(recording), take,
    previewAvailable: !!take && !previewReason, previewReason,
    // Exact source identity/signature is rechecked after asynchronous preview
    // preparation. This is not a capability to recover or move a recording.
    token: { runId, receiptId, contactId: recording.contactId, takeKey: recording.takeKey, chapter, locationId,
      sourceSignature: take ? JSON.stringify(take) : null } };
}

export function sourceRecordingAccessCurrent(custody, takes, token, options = {}) {
  if (!token || options.runId !== token.runId || options.chapter !== token.chapter || options.locationId !== token.locationId) return false;
  const current = resolveSourceRecordingAccess(custody, takes, { ...options, receiptId: token.receiptId });
  return current.ok && current.token.contactId === token.contactId && current.token.takeKey === token.takeKey
    && current.token.sourceSignature === token.sourceSignature;
}
