// Source can withhold access to an interval on the one physical tape. Nothing
// here edits its samples, slate, room-job credit, transport position or media.
import { SOURCE_CONTACT_CHAPTERS, sourceContactChapter } from './source-contact-chapters.js';

const text = value => typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : null;
const takeKey = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 ? value : null;
const whole = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const copy = value => JSON.parse(JSON.stringify(value));

export function freshSourceRecordingCustody(runId = '') {
  return { schema: 1, runId: text(runId) || '', serial: 0, contacts: [], recordings: [] };
}

export function sourceRecordingDestination(value, fromChapter = null) {
  const chapter = sourceContactChapter(value?.chapter), from = SOURCE_CONTACT_CHAPTERS.indexOf(fromChapter);
  const index = SOURCE_CONTACT_CHAPTERS.indexOf(chapter);
  if (!chapter || !text(value?.locationId) || from >= 0 && (index < from || index > from + 1)
    || !['x', 'z', 'feet'].every(key => number(value[key]) !== null)) return null;
  return { chapter, locationId: value.locationId, chartId: Math.max(0, Math.floor(number(value.chartId) ?? 0)),
    x: value.x, z: value.z, feet: value.feet };
}

// Stable across the tape's ordinary serialization/reload. The media key and
// capture id distinguish actual continuous recordings; no blob is copied here.
export function sourceRecordingTakeKey(take) {
  if (!text(take?.id) || !whole(take?.ordinal) || !text(take?.roomId)) return null;
  const start = number(take.startSeconds), end = number(take.endSeconds);
  if (start === null || end === null || start < 0 || end <= start) return null;
  return JSON.stringify([take.id, take.ordinal, take.roomId, start, end,
    take.continuous?.key || '', take.continuous?.captureId || '']);
}

function eligible(take) {
  if (!sourceRecordingTakeKey(take) || take.authored || take.debug || take.voided || take.damage) return false;
  if (take.continuous) return take.status === 'archived' && take.continuous.durable === true
    && !take.continuous.pending && !take.mediaUnavailable;
  return take.status === 'accepted' && take.counted !== false;
}

export function normalizeSourceRecordingCustody(value, { runId = '' } = {}) {
  const savedRun = text(value?.runId) || '', requestedRun = text(runId) || '';
  if (savedRun && requestedRun && savedRun !== requestedRun) return freshSourceRecordingCustody(requestedRun);
  const base = freshSourceRecordingCustody(savedRun || requestedRun), ids = new Set(), contactIds = new Set();
  const recordings = [];
  for (const row of Array.isArray(value?.recordings) ? value.recordings : []) {
    const destination = sourceRecordingDestination(row?.destination, row?.chapter);
    if (!text(row?.id) || ids.has(row.id) || !text(row.contactId) || !takeKey(row.takeKey)
      || !text(row.takeId) || !whole(row.takeOrdinal) || !text(row.roomId)
      || !sourceContactChapter(row.chapter) || !destination || !['held', 'recovered'].includes(row.status)) continue;
    ids.add(row.id);
    recordings.push({ id: row.id, chapter: row.chapter, contactId: row.contactId, takeKey: row.takeKey,
      takeId: row.takeId, takeOrdinal: row.takeOrdinal, roomId: row.roomId, place: text(row.place) || '',
      durationSeconds: Math.max(.01, number(row.durationSeconds) ?? .01), destination,
      status: row.status, recoveryId: row.status === 'recovered' ? text(row.recoveryId) : null });
  }
  const contacts = [];
  for (const row of Array.isArray(value?.contacts) ? value.contacts : []) {
    if (!text(row?.id) || contactIds.has(row.id) || !sourceContactChapter(row.chapter)) continue;
    contactIds.add(row.id);
    contacts.push({ id: row.id, chapter: row.chapter, recordingId: ids.has(row.recordingId) ? row.recordingId : null,
      reason: row.reason === 'taken' && ids.has(row.recordingId) ? 'taken' : 'no-recording' });
  }
  // A malformed orphan cannot become a duplicate loss on the next load.
  for (const row of recordings) if (!contactIds.has(row.contactId)) {
    contacts.push({ id: row.contactId, chapter: row.chapter, recordingId: row.id, reason: 'taken' });
    contactIds.add(row.contactId);
  }
  return { ...base, serial: Math.max(whole(value?.serial), contacts.length), contacts, recordings };
}

export function sourceRecordingHeld(value, take, { runId = '' } = {}) {
  const state = normalizeSourceRecordingCustody(value, { runId }), key = sourceRecordingTakeKey(take);
  return !!key && state.recordings.some(row => row.status === 'held' && row.takeKey === key);
}

export function claimSourceRecording(value, { runId, chapter, contactId, takes = [], destination } = {}) {
  const state = normalizeSourceRecordingCustody(value, { runId });
  if (!text(runId) || !sourceContactChapter(chapter) || !text(contactId)) return { handled: false, reason: 'invalid-contact', state };
  const prior = state.contacts.find(row => row.id === contactId);
  if (prior) return { handled: true, duplicate: true, reason: prior.reason, state,
    recording: copy(state.recordings.find(row => row.id === prior.recordingId) || null) };
  const target = sourceRecordingDestination(destination, chapter);
  if (!target) return { handled: false, reason: 'destination-required', state };
  const held = new Set(state.recordings.filter(row => row.status === 'held').map(row => row.takeKey));
  // Most recent real, available recording. Aborted/fictional/missing media is
  // not invented into something HUSH can take, and a held interval cannot be
  // taken twice by separate contacts.
  const take = [...(Array.isArray(takes) ? takes : [])].reverse().find(row => eligible(row) && !held.has(sourceRecordingTakeKey(row)));
  const serial = state.serial + 1, id = take ? `source-custody:${runId}:${serial}` : null;
  if (id && !text(id)) return { handled: false, reason: 'invalid-contact', state };
  const recording = take ? { id, chapter, contactId, takeKey: sourceRecordingTakeKey(take), takeId: take.id,
    takeOrdinal: take.ordinal, roomId: take.roomId, place: take.place || '',
    durationSeconds: number(take.durationSeconds) > 0 ? take.durationSeconds : take.endSeconds - take.startSeconds,
    destination: target, status: 'held', recoveryId: null } : null;
  return { handled: true, duplicate: false, reason: take ? 'taken' : 'no-recording', recording: copy(recording),
    state: { ...state, serial, contacts: [...state.contacts, { id: contactId, chapter, recordingId: id,
      reason: take ? 'taken' : 'no-recording' }], recordings: recording ? [...state.recordings, recording] : state.recordings } };
}

export function recoverSourceRecording(value, { receiptId, chapter, locationId } = {}) {
  const state = normalizeSourceRecordingCustody(value), row = state.recordings.find(entry => entry.id === receiptId);
  if (!row || row.destination.chapter !== chapter || row.destination.locationId !== locationId)
    return { handled: false, reason: 'wrong-location', state };
  if (row.status === 'recovered') return { handled: true, duplicate: true, recording: copy(row), state };
  const recovered = { ...row, status: 'recovered', recoveryId: `recovered:${row.id}` };
  return { handled: true, duplicate: false, recording: copy(recovered),
    state: { ...state, recordings: state.recordings.map(entry => entry.id === receiptId ? recovered : entry) } };
}
