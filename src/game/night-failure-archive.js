// A sealed copy of the actual tape ledger, not a replacement recording or a
// completion receipt. The meta archive outlives New Game's active night.
import { normalizeSourceDriveMedia } from '../audio/source-drive-recording.js';
const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));

export function archiveNightRecordings(save) {
  const tapes = (Array.isArray(save?.rec?.tapes) ? save.rec.tapes : []).filter(tape => tape && typeof tape.roomId === 'string').map(copy);
  const mediaRefs = [];
  for (const tape of tapes) {
    if (!tape.continuous) continue;
    const ref = normalizeSourceDriveMedia(tape.continuous);
    if (ref?.durable && !mediaRefs.some(saved => saved.key === ref.key)) mediaRefs.push(ref);
    if (!ref?.durable || tape.mediaUnavailable) tape.mediaUnavailable = true;
  }
  return { schema: 1, tapes, tapeTransport: copy(save?.rec?.tapeTransport || null), mediaRefs };
}

// null means uncertain: storage must preserve the library rather than delete
// potentially archived audio. Pending keys are retained too, never reconstructed.
export function retainedNightMediaKeys(meta) {
  const records = meta?.returns?.records;
  if (!records || typeof records !== 'object' || Array.isArray(records)) return null;
  const keys = new Set();
  for (const record of Object.values(records)) {
    if(!record||typeof record!=='object')return null;
    if(record.classification==='failed-night'&&!record.recordings)return null;
    if (!record?.recordings) continue;
    const archive = record.recordings;
    if (archive.schema !== 1 || !Array.isArray(archive.tapes) || !Array.isArray(archive.mediaRefs)) return null;
    for (const ref of [...archive.mediaRefs, ...archive.tapes.map(row => row?.continuous)]) {
      if (!ref) continue;
      if (typeof ref.key !== 'string' || !ref.key) return null;
      keys.add(ref.key);
    }
  }
  return [...keys];
}

export function archivedRecordingRows(summary) {
  return summary?.recordings?.schema === 1 && Array.isArray(summary.recordings.tapes)
    ? summary.recordings.tapes.map(copy) : [];
}
export function archivedRecordingStatus(row) {
  if (!row) return 'UNAVAILABLE';
  if (row.continuous && (row.mediaUnavailable || !normalizeSourceDriveMedia(row.continuous)?.durable)) return 'UNAVAILABLE';
  if (row.voided) return 'ERASED';
  if (row.damage) return 'DAMAGED';
  return String(row.status || 'accepted').toUpperCase();
}

// Replacement of the active save is also a crash-recovery boundary. Preserve a
// staged failure report if its first SAVE write survived but META did not.
export function pendingNightArchivePatch(save, meta) {
  const pending=save?.run?.pendingReturn,finalized=save?.run?.finalizedReturn,summary=pending?.summary;
  if(pending?.kind!=='failed-night'||finalized?.kind!=='failed-night'||summary?.classification!=='failed-night'
    ||summary.runId!==save.run.id||summary.id!==finalized.summaryId||meta?.returns?.records?.[summary.id])return null;
  return {returns:{records:{...(meta?.returns?.records||{}),[summary.id]:copy(summary)},
    history:[...new Set([...(meta?.returns?.history||[]),summary.id])]},
    presentation:{...meta?.presentation,pendingReports:[...new Set([...(meta?.presentation?.pendingReports||[]),summary.id])]}};
}
