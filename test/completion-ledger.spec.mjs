import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGES, TARGETS } from '../src/data/conservatory-script.js';
import { PIN_SOURCES } from '../src/game/combat-progression.js';
import { STUDENT_STRIKE_DOCUMENTS } from '../src/data/student-strike-evidence.js';
import { freshMeta, normalizeMeta, freshRunRecord, normalizeRun } from '../src/progression/schema.js';
import { exportProfile, mergeImportedProfile } from '../src/progression/profile.js';
import { COMPLETION_PAPERS, COMPLETION_ROOMS, COMPLETION_LEADS, SECRET_DEFS,
  normalizeCompletion, reduceCompletion, completionCollections, completionLedgerFromSave,
  mergeCompletionLedgers } from '../src/progression/completion.js';
import { withTransientGameState, getMeta, getSave } from '../src/game/save.js';
import { recordCompletionEvent, captureCompletionFromSave } from '../src/progression/completion-runtime.js';

const event = (type, payload, at = 100, runId = 'night-a') => ({ type, payload, at, runId });
const sorted = values => [...values].sort();

test('finite collection denominators match production recording, paper and collectible owners', () => {
  assert.deepEqual(sorted(COMPLETION_ROOMS.map(row => row.id)), sorted(TARGETS));
  // The retained incident receipts are readable documents, outside the finite
  // sixteen-paper collection. Keep every production page accounted for.
  assert.deepEqual(sorted([...COMPLETION_PAPERS, ...STUDENT_STRIKE_DOCUMENTS.map(row => row.id)]), sorted(PAGES.map(row => row.id)));
  assert.deepEqual(sorted(COMPLETION_LEADS.map(row => row.id)), sorted(PIN_SOURCES.flags));
  assert.equal(new Set(SECRET_DEFS.map(row => row.id)).size, 2);
  assert.deepEqual(completionCollections(freshMeta()).map(row => [row.id, row.current, row.target]),
    [['rooms', 0, 5], ['papers', 0, 16], ['disclosures', 0, 3], ['leads', 0, 4], ['secrets', 0, 2]]);
});

test('completion receipts are known, bounded, idempotent and retain the first earned run', () => {
  const first = reduceCompletion(null, event('take.completed', { roomId: 'main_b3' }));
  assert.equal(first.changed, true);
  assert.deepEqual(first.completion.rooms.main_b3, { firstSeenAt: 100, runId: 'night-a' });
  const again = reduceCompletion(first.completion, event('take.completed', { roomId: 'main_b3' }, 200, 'night-b'));
  assert.equal(again.changed, false); assert.deepEqual(again.completion, first.completion);
  assert.equal(reduceCompletion(first.completion, event('take.completed', { roomId: 'invented-room' })).changed, false);
  assert.deepEqual(normalizeCompletion({ rooms: { invented: true }, secrets: { unknown: {} }, leads: { 'pin.foyer': {} } }), normalizeCompletion(null));
});

test('the Chapel files its own manifest receipt without inventing a room-tone recording', async () => {
  const first = reduceCompletion(null, event('manifest-slot.completed', { roomId: 'lux_nova' }));
  assert.equal(first.changed, true);
  assert.deepEqual(first.completion.rooms.lux_nova, { firstSeenAt: 100, runId: 'night-a' });
  for (const roomId of ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic', 'invented'])
    assert.equal(reduceCompletion(null, event('manifest-slot.completed', { roomId })).changed, false);
  await withTransientGameState({ meta: freshMeta() }, async () => {
    const before = structuredClone(getSave());
    assert.equal(recordCompletionEvent(event('manifest-slot.completed', { roomId: 'lux_nova' })).changed, true);
    assert.deepEqual(getSave(), before, 'collection receipt must not insert a playback tape or inflate recording statistics');
    const row = completionCollections(getMeta()).find(row => row.id === 'rooms');
    assert.equal(row.label, 'Recording manifest');
    assert.equal(row.current, 1); assert.equal(row.entries.find(row => row.id === 'lux_nova').name, 'Chapel');
  });
});

test('opening or starting a playback and old start flags cannot imply completed discoveries', () => {
  let completion = normalizeCompletion(null);
  for (const e of [event('playback.discovered', { id: 'the_tub' }), event('secret.started', { id: 'off-air' }),
    event('secret.cancelled', { id: 'off-air' })]) {
    const result = reduceCompletion(completion, e); assert.equal(result.changed, false); completion = result.completion;
  }
  const old = completionLedgerFromSave(completion, { flags: { 'radio.hidden-channel.heard': true, 'phone.van.offhook': true } });
  assert.equal(old.changed, false);
  assert.equal(reduceCompletion(completion, event('disclosure.heard', { id: 'the_tub' })).changed, true);
  assert.equal(reduceCompletion(completion, event('secret.discovered', { id: 'off-air' })).changed, true);
});

test('explicit active-save capture carries accepted takes and actual field leads across a new night', () => {
  const save = { run: { id: 'night-a', ledger: { takes: { rooms: ['main_b3', 'main_b3', 'unwired'] } } },
    flags: { 'pin.yard': true, 'pin.foyer': true, 'pin.gallery': false }, rec: { takes: ['lux_nova'] } };
  const result = completionLedgerFromSave(null, save, { at: 555 });
  assert.equal(result.changed, true);
  assert.deepEqual(Object.keys(result.completion.rooms), ['main_b3']);
  assert.deepEqual(Object.keys(result.completion.leads), ['pin.yard']);
  assert.deepEqual(completionLedgerFromSave(result.completion, { run: { id: 'night-b' }, flags: {} }).completion, result.completion);
});

test('collection counts derive exact authored identities and hide unearned Easter egg names', () => {
  const meta = freshMeta();
  meta.knowledge.documents = Object.fromEntries([...COMPLETION_PAPERS, 'ambient-paper'].map(id => [id, { count: 1 }]));
  meta.knowledge.playbacks.the_tub = { count: 50 }; // discovery start is not hearing completion
  meta.completion = reduceCompletion(null, event('secret.discovered', { id: 'call-yourself' })).completion;
  meta.completion = reduceCompletion(meta.completion, event('disclosure.heard', { id: 'the_tub' })).completion;
  const rows = Object.fromEntries(completionCollections(meta).map(row => [row.id, row]));
  assert.equal(rows.papers.current, 16); assert.equal(rows.disclosures.current, 1); assert.equal(rows.secrets.current, 1);
  assert.equal(rows.secrets.entries.find(row => row.id === 'off-air').name, 'Undiscovered Easter egg');
  assert.equal(rows.secrets.entries.find(row => row.id === 'call-yourself').name, 'Nobody in the Van');
});

test('profile normalization and portable merge preserve the union and earliest real receipt', () => {
  const local = freshMeta(), other = freshMeta();
  local.completion = reduceCompletion(null, event('take.completed', { roomId: 'main_b3' }, 200, 'local')).completion;
  other.completion = reduceCompletion(null, event('take.completed', { roomId: 'main_b3' }, 100, 'remote')).completion;
  other.completion = reduceCompletion(other.completion, event('secret.discovered', { id: 'off-air' }, 300, 'remote')).completion;
  other.completion.secrets.fake = { firstSeenAt: 1 };
  assert.deepEqual(normalizeMeta(local).completion, local.completion);
  const portable = exportProfile(other, {}, { now: 1000 });
  const merged = mergeImportedProfile(local, {}, portable);
  assert.equal(merged.ok, true);
  assert.equal(merged.meta.completion.rooms.main_b3.runId, 'remote');
  assert.equal(merged.meta.completion.secrets['off-air'].firstSeenAt, 300);
  assert.equal(merged.meta.completion.secrets.fake, undefined);
  assert.deepEqual(mergeCompletionLedgers(merged.meta.completion, local.completion), merged.meta.completion);
  assert.deepEqual(local.completion.secrets, {}, 'merge mutated the local profile');
});

test('runtime adapters persist to the current scoped profile without touching run state', async () => {
  await withTransientGameState({ meta: freshMeta() }, async scope => {
    const before = structuredClone(getSave());
    const result = recordCompletionEvent(event('secret.discovered', { id: 'off-air' }, 900, 'current'));
    assert.equal(result.changed, true); assert.ok(getMeta().completion.secrets['off-air']);
    assert.deepEqual(getSave(), before);
    assert.equal(recordCompletionEvent(event('secret.discovered', { id: 'off-air' }, 1000)).changed, false);
    const saved = { run: { id: 'past', ledger: { takes: { rooms: ['main_b3'] } } }, flags: { 'pin.gallery': true } };
    assert.equal(captureCompletionFromSave(saved, { at: 1200 }).changed, true);
    assert.ok(getMeta().completion.rooms.main_b3); assert.ok(getMeta().completion.leads['pin.gallery']);
    assert.equal(scope.writes.every(write => write.type === 'meta'), true);
  });
});

test('unranked review runs preserve their disqualification and cannot add permanent collection receipts', async () => {
  const run = freshRunRecord({ id: 'review', now: 100 });
  assert.deepEqual(run.integrity.achievements, { eligible: true, reason: null });
  run.integrity.achievements = { eligible: false, reason: 'DEVELOPER_REVIEW' };
  run.ledger.takes.rooms = ['main_b3'];
  assert.deepEqual(normalizeRun(run).integrity.achievements, run.integrity.achievements);
  const attempted = { run, flags: { 'pin.gallery': true } };
  assert.equal(completionLedgerFromSave(null, attempted).changed, false);
  await withTransientGameState({ meta: freshMeta(), save: attempted }, async () => {
    assert.equal(recordCompletionEvent(event('secret.discovered', { id: 'off-air' })).reason, 'UNRANKED_RUN');
    assert.equal(captureCompletionFromSave().changed, false);
    assert.deepEqual(getMeta().completion, normalizeCompletion(null));
  });
});
