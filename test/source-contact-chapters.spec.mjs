import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { normalizeChunkSurfState, sourceBossAvailable } from '../src/game/chunk-surf-state.js';
import { freshSourceContinuation } from '../src/game/source-continuation.js';

const destination = { chapter: 'II', locationId: 'source-ii-recording-return', chartId: 0, x: 3, z: -20, feet: 4.2 };
const takes = [{ id: 'take:1', ordinal: 1, roomId: 'b3', startSeconds: 0, endSeconds: 60, durationSeconds: 60,
  status: 'accepted', counted: true, audible: [['original-source', .3]], slate: { key: 'actual-slate' } }];
function runtime(state = null) {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_CONTACT, { seed: 4417 });
  const initial = state || { ...built.state, sourceHushFollow: { active: true, x: -12, z: -463.5, floor: 4.2, heading: 0 } };
  const r = createSourceSpaceRuntime({ initialState: initial });
  r.setPlayerPosition({ x: initial.landscapeOrigin.x - 24, y: initial.landscapeOrigin.y - 922, facing: 0 });
  return r;
}
function begin(r, chapter = 'I') {
  if (chapter !== 'I') r.setContinuationCheckpoint({ ...freshSourceContinuation({ runId: 'night-contacts' }),
    status: 'active', phase: chapter === 'III' ? 'catch' : 'wrong-return' });
  return r.beginHushContact(null, { chapter, locallyAvailable: chapter !== 'I', runId: 'night-contacts' });
}
function win(r, chapter = 'I') {
  assert.ok(begin(r, chapter));
  r.resolveHushContactChoice('contact.warning');
  assert.equal(r.resolveHushContactChoice('contact.confirm').combat, true);
  const request = r.finalEncounterRequest();
  assert.equal(request.chapter, chapter);
  assert.equal(r.resolveFinalEncounter({ battleAttemptId: request.battleAttemptId, won: true, outcome: 'contain' }).handled, true);
  return request;
}

test('one chapter win is actual progress; returning to its hand offers warned custody, never another battle', () => {
  const r = runtime(), beforeTape = structuredClone(takes);
  const first = win(r);
  assert.deepEqual(r.state().finalEncounter.chapterWins, ['I']);
  assert.equal(sourceBossAvailable(r.state()), false);
  assert.equal(sourceBossAvailable(r.state(), { chapter: 'II' }), true);
  assert.equal(r.sourceContactStatus('I').repeatAvailable, true);
  assert.ok(begin(r).repeatContact);
  assert.equal(r.resolveHushContactChoice('contact.confirm', { takes, destination }).handled, false, 'old warning cannot pay a new contact');
  r.resolveHushContactChoice('contact.identity');
  assert.equal(r.sourceRecordingCustody().recordings.length, 0);
  r.resolveHushContactChoice('contact.warning');
  const repeat = r.resolveHushContactChoice('contact.confirm', { takes, destination });
  assert.equal(repeat.combat, false);
  assert.equal(repeat.repeatContact, true);
  assert.equal(repeat.recordingContact.reason, 'taken');
  assert.equal(r.finalEncounterRequest(), null);
  assert.equal(r.state().finalEncounter.victories, 1);
  assert.deepEqual(takes, beforeTape, 'victory and repeat Contact preserve physical tape content and room work');
  assert.equal(r.resolveFinalEncounter({ battleAttemptId: first.battleAttemptId, won: true, outcome: 'contain' }).handled, false);
  assert.equal(r.resolveHushContactChoice('contact.confirm', { takes, destination }).handled, false);
  assert.equal(r.sourceRecordingCustody().recordings.length, 1);
  const loaded = runtime(JSON.parse(JSON.stringify(r.state())));
  assert.deepEqual(loaded.sourceRecordingCustody(), r.sourceRecordingCustody());
  assert.equal(loaded.sourceContactStatus('I').battleAvailable, false);
  assert.equal(loaded.recoverSourceRecording({ receiptId: repeat.recordingContact.recording.id, chapter: 'II', locationId: 'wrong' }).handled, false);
  assert.equal(loaded.recoverSourceRecording({ receiptId: repeat.recordingContact.recording.id, chapter: 'II', locationId: destination.locationId }).handled, true);
  assert.equal(loaded.sourceRecordingCustody().recordings[0].status, 'recovered');
});

test('a confirmed empty repeat contact creates no fictional recording, no second win and no penalty', () => {
  const r = runtime(); win(r); begin(r); r.resolveHushContactChoice('contact.warning');
  const before = r.state(), result = r.resolveHushContactChoice('contact.confirm', { takes: [], destination });
  assert.equal(result.recordingContact.reason, 'no-recording');
  assert.equal(result.recordingContact.recording, null);
  assert.equal(r.sourceRecordingCustody().recordings.length, 0);
  assert.equal(r.state().attempts, before.attempts);
  assert.equal(r.state().finalEncounter.victories, before.finalEncounter.victories);
  assert.equal(r.state().completed, false);
});

test('continuation Contact needs its actual active chapter, a local host proof and a stable body', () => {
  const r = runtime();
  const external = { chapter: 'II', locallyAvailable: true, runId: 'night-contacts' };
  assert.equal(r.beginHushContact(null, external), null, 'Source I body cannot remotely open II');
  r.setContinuationCheckpoint({ ...freshSourceContinuation({ runId: 'night-contacts' }), status: 'active' });
  assert.equal(r.beginHushContact(null, { ...external, locallyAvailable: false }), null);
  assert.equal(r.beginHushContact(null, { ...external, chapter: 'III' }), null);
  const encounter = r.beginHushContact(null, external);
  assert.equal(encounter.chapter, 'II');
  r.cancelHushContact();
  r.setContinuationCheckpoint({ ...r.state().sourceContinuation, recovery: {
    reason: 'void', elapsed: .1, duration: 2, from: { x: 0, z: 0, feet: 0 }, target: { x: 0, z: 2, feet: 0 }, path: [{ x: 0, z: 0, feet: 0 }, { x: 0, z: 2, feet: 0 }] } });
  assert.equal(r.beginHushContact(null, external), null);
});

test('legacy wins are assigned in order, active attempts retain identity, and completed endings stay complete', () => {
  const r = runtime(), saved = r.state();
  for (const victories of [0, 1, 2]) {
    const old = structuredClone(saved); old.finalEncounter.victories = victories;
    delete old.finalEncounter.chapterWins;
    const loaded = normalizeChunkSurfState(old);
    assert.deepEqual(loaded.finalEncounter.chapterWins, ['I', 'II', 'III'].slice(0, victories));
    assert.equal(loaded.finalEncounter.victories, victories);
  }
  win(r, 'II');
  const outOfOrder = JSON.parse(JSON.stringify(r.state()));
  assert.deepEqual(normalizeChunkSurfState(outOfOrder).finalEncounter.chapterWins, ['II']);
  assert.equal(normalizeChunkSurfState(outOfOrder).finalEncounter.victories, 1);
  const completed = normalizeChunkSurfState({ ...saved, active: false, completed: true, phase: 'completed',
    finalEncounter: { status: 'resolved', outcome: 'contain', won: true },
    finale: { ...saved.finale, route: 'contact', stage: 'resolved', result: 'won' } });
  assert.equal(completed.completed, true);
  assert.equal(completed.finalEncounter.victories, 3);
  assert.deepEqual(completed.finalEncounter.chapterWins, ['I', 'II', 'III']);
});
