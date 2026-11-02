import test from 'node:test';
import assert from 'node:assert/strict';
import { claimSourceRecording, freshSourceRecordingCustody, normalizeSourceRecordingCustody,
  recoverSourceRecording, sourceRecordingHeld, sourceRecordingTakeKey } from '../src/game/source-recording-custody.js';

const target = { chapter: 'II', locationId: 'source-ii-recording-return', chartId: 0, x: 3, z: -20, feet: 4.2 };
const take = (ordinal, extra = {}) => ({ id: `take:${ordinal}`, ordinal, roomId: `room-${ordinal}`, place: 'floor',
  startSeconds: (ordinal - 1) * 60, endSeconds: ordinal * 60, durationSeconds: 60,
  status: 'accepted', counted: true, audible: [['original', .2]], slate: { key: `slate-${ordinal}` }, ...extra });
const claim = (state, contactId, takes, extra = {}) => claimSourceRecording(state, {
  runId: 'night-a', chapter: 'I', contactId, takes, destination: target, ...extra });

test('a warned contact withholds exactly one actual interval without modifying tape, media, slate, work credit or ordering', () => {
  const takes = [take(1), take(2), take(3, { status: 'abandoned', counted: false })];
  const original = structuredClone(takes), result = claim(null, 'hand-1', takes);
  assert.equal(result.reason, 'taken');
  assert.equal(result.recording.takeId, 'take:2');
  assert.deepEqual(takes, original);
  assert.equal(result.state.recordings.length, 1);
  assert.equal(sourceRecordingHeld(result.state, takes[1], { runId: 'night-a' }), true);
  assert.equal(sourceRecordingHeld(result.state, takes[0]), false);
  const loaded = normalizeSourceRecordingCustody(JSON.parse(JSON.stringify(result.state)), { runId: 'night-a' });
  assert.deepEqual(loaded, result.state);
  assert.equal(sourceRecordingHeld(loaded, takes[1]), true);
  const replay = claim(loaded, 'hand-1', takes);
  assert.equal(replay.duplicate, true);
  assert.deepEqual(replay.state, loaded, 'a stale callback cannot withhold a second take');
});

test('further confirmed contacts take another available interval; zero remaining recordings stays honest', () => {
  const takes = [take(1), take(2)];
  const a = claim(null, 'hand-1', takes), b = claim(a.state, 'hand-2', takes), c = claim(b.state, 'hand-3', takes);
  assert.equal(a.recording.takeId, 'take:2');
  assert.equal(b.recording.takeId, 'take:1');
  assert.equal(c.reason, 'no-recording');
  assert.equal(c.recording, null);
  assert.equal(c.state.contacts.length, 3);
  assert.equal(c.state.recordings.length, 2);
  assert.equal(claim(c.state, 'hand-3', takes).duplicate, true);
});

test('recovery requires the saved physical destination, is idempotent, and makes exactly that interval available again', () => {
  const takes = [take(1), take(2)], a = claim(null, 'hand-1', takes), row = a.recording;
  for (const where of [{ chapter: 'I', locationId: target.locationId }, { chapter: 'II', locationId: 'wrong-place' }]) {
    const wrong = recoverSourceRecording(a.state, { receiptId: row.id, ...where });
    assert.equal(wrong.handled, false);
    assert.deepEqual(wrong.state, a.state);
  }
  const recovered = recoverSourceRecording(a.state, { receiptId: row.id, chapter: 'II', locationId: target.locationId });
  assert.equal(recovered.recording.status, 'recovered');
  assert.equal(sourceRecordingHeld(recovered.state, takes[1]), false);
  const twice = recoverSourceRecording(recovered.state, { receiptId: row.id, chapter: 'II', locationId: target.locationId });
  assert.equal(twice.duplicate, true);
  assert.deepEqual(twice.state, recovered.state);
  assert.equal(claim(recovered.state, 'hand-2', takes).recording.takeId, 'take:2', 'the same actual recording may be risked again only after recovery');
});

test('a continuous captured recording retains exact media identity; unavailable/authored/debug/voided/damaged rows cannot be invented into a loss', () => {
  const media = { durable: true, key: 'media:a', captureId: 'capture:a', runId: 'night-a' };
  const continuous = take(1, { status: 'archived', counted: false, continuous: media });
  const invalid = [take(2, { authored: true }), take(3, { debug: true }), take(4, { voided: true }),
    take(5, { damage: { id: 'existing-loss' } }), take(6, { status: 'archived', continuous: { ...media, pending: true } })];
  const result = claim(null, 'hand-1', [continuous, ...invalid]);
  assert.equal(result.recording.takeId, continuous.id);
  assert.equal(result.recording.takeKey, sourceRecordingTakeKey(continuous));
  assert.deepEqual(continuous.continuous, media);
  assert.equal(sourceRecordingHeld(result.state, { ...continuous, continuous: { ...media, captureId: 'different' } }), false);
  assert.equal(claim(null, 'hand-2', invalid).reason, 'no-recording');
});

test('custody belongs to one run and cannot teleport a recording back to an earlier chapter or past the next chapter', () => {
  const result = claim(null, 'hand-1', [take(1)]);
  assert.equal(sourceRecordingHeld(result.state, take(1), { runId: 'night-b' }), false);
  assert.deepEqual(normalizeSourceRecordingCustody(result.state, { runId: 'night-b' }), freshSourceRecordingCustody('night-b'));
  assert.equal(claim(null, 'hand-2', [take(1)], { destination: { ...target, chapter: 'III' } }).handled, false);
  assert.equal(claim(null, 'hand-2', [take(1)], { chapter: 'II', destination: { ...target, chapter: 'I' } }).handled, false);
  assert.equal(claim(null, 'hand-2', [take(1)], { runId: '' }).handled, false);
});
