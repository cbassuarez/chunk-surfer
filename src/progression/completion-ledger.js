import { COMPLETION_CATALOG_VERSION, COMPLETION_ROOMS, COMPLETION_LEADS, COMPLETION_DISCLOSURES, SECRET_DEFS } from './completion-defs.js';

const valid = Object.freeze({
  rooms: new Set(COMPLETION_ROOMS.map(row => row.id)),
  leads: new Set(COMPLETION_LEADS.map(row => row.id)),
  disclosures: new Set(COMPLETION_DISCLOSURES),
  secrets: new Set(SECRET_DEFS.map(row => row.id)),
});
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const time = value => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const receipt = value => ({ firstSeenAt: time(value?.firstSeenAt ?? value?.at),
  runId: typeof value?.runId === 'string' ? value.runId.slice(0, 128) : '' });

export function freshCompletionLedger() {
  return { version: COMPLETION_CATALOG_VERSION, rooms: {}, leads: {}, disclosures: {}, secrets: {} };
}

export function normalizeCompletionLedger(value) {
  const out = freshCompletionLedger();
  for (const bucket of Object.keys(valid)) for (const [id, record] of Object.entries(object(value?.[bucket]))) {
    if (valid[bucket].has(id) && record && typeof record === 'object') out[bucket][id] = receipt(record);
  }
  return out;
}

export function mergeCompletionLedgers(local, incoming) {
  const out = normalizeCompletionLedger(local), other = normalizeCompletionLedger(incoming);
  for (const bucket of Object.keys(valid)) for (const [id, record] of Object.entries(other[bucket])) {
    const old = out[bucket][id];
    if (!old || record.firstSeenAt > 0 && (!old.firstSeenAt || record.firstSeenAt < old.firstSeenAt)) out[bucket][id] = record;
  }
  return out;
}

export function noteCompletionReceipt(ledger, bucket, id, { at = Date.now(), runId = '' } = {}) {
  const out = normalizeCompletionLedger(ledger);
  if (!valid[bucket]?.has(id) || out[bucket][id]) return { changed: false, completion: out };
  out[bucket][id] = receipt({ at, runId });
  return { changed: true, completion: out };
}

export function reduceCompletionLedger(ledger, event) {
  const type = event?.type, p = event?.payload || {}, context = { at: event?.at, runId: event?.runId || '' };
  if (type === 'take.completed') return noteCompletionReceipt(ledger, 'rooms', p.roomId, context);
  // The Chapel's existing manifest entry follows its own completed encounter,
  // not a rolled room-tone tape. Never turn this receipt into a fake take.
  if (type === 'manifest-slot.completed' && p.roomId === 'lux_nova') return noteCompletionReceipt(ledger, 'rooms', p.roomId, context);
  if (type === 'item.obtained') return noteCompletionReceipt(ledger, 'leads', p.id, context);
  if (type === 'disclosure.heard') return noteCompletionReceipt(ledger, 'disclosures', p.id, context);
  if (type === 'secret.discovered') return noteCompletionReceipt(ledger, 'secrets', p.id, context);
  return { changed: false, completion: normalizeCompletionLedger(ledger) };
}

// Existing accepted-event ledger and actual collectible flags are evidence.
// The radio's older 'heard' flag was set at playback START, so neither it nor a
// guessed elapsed time may invent a completed secret here.
export function completionLedgerFromSave(ledger, save, { at = Date.now() } = {}) {
  let completion = normalizeCompletionLedger(ledger), changed = false;
  if (save?.run?.integrity?.achievements?.eligible === false) return { completion, changed, reason: 'UNRANKED_RUN' };
  const context = { at, runId: save?.run?.id || '' };
  const rooms = save?.run?.ledger?.takes?.rooms;
  for (const id of Array.isArray(rooms) ? rooms : []) {
    const result = noteCompletionReceipt(completion, 'rooms', id, context);
    completion = result.completion; changed ||= result.changed;
  }
  for (const row of COMPLETION_LEADS) if (save?.flags?.[row.id] === true) {
    const result = noteCompletionReceipt(completion, 'leads', row.id, context);
    completion = result.completion; changed ||= result.changed;
  }
  return { completion, changed };
}
