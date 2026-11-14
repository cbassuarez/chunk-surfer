import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createElleryCaughtCheckpoint,
  elleryCaughtMilestone,
  elleryCaughtRestore,
  normalizeElleryCaughtCheckpoint,
  preferElleryCaughtRecoveryMirror,
} from '../src/game/ellery-caught-checkpoint.js';
import {
  commitElleryCaughtCheckpoint,
  freshSave,
  getMeta,
  getSave,
  restoreElleryCaughtCheckpoint,
  retryElleryCaughtPersistence,
  saveCommit,
  saveLoadAsync,
  withTransientGameState,
} from '../src/game/save.js';
import { freshRunRecord } from '../src/progression/schema.js';
import { normalizeDoorSave } from '../src/game/door-runtime.js';
import { MemoryFileAdapter } from '../src/platform/storage/desktopStorage.js';
import { currentStorage, saveGameQueued } from '../src/platform/storage/storageService.js';

const pose = { x: 153.5, y: 43.25, facing: 3, yaw: 1.25, pitch: -.2 };
const b3 = { id: 'b3-first-take', roomId: 'main_b3', ordinal: 2, status: 'accepted', counted: true };
const tub = { id: 'bath-first-take', roomId: 'the_tub', ordinal: 3, status: 'accepted', counted: true };
const milestoneId = 'take:main_b3';

function workOrderSave() {
  const save = freshSave({ run: freshRunRecord({ id: 'test-night', now: 22000 }) });
  return { ...save, area: 'conservatory', steps: 11,
    flags: { 'setup.levels': true, 'b3.speakers.silenced': true },
    rec: { tapes: [b3], injuries: 0, tapeTransport: { head: 60 } },
  };
}

test('legacy milestone inference uses authored Work Order order for setup and committed take order thereafter', () => {
  assert.equal(elleryCaughtMilestone(freshSave()), null);
  assert.equal(elleryCaughtMilestone({ flags: { 'setup.levels': true } }), 'setup:levels');
  assert.equal(elleryCaughtMilestone({ flags: { 'b3.speakers.silenced': true } }), 'b3:investigate');
  assert.equal(elleryCaughtMilestone({ rec: { takes: ['main_b3', 'soundnoisemusic'] } }), 'take:soundnoisemusic');
  const save = workOrderSave();
  save.rec.tapes = [tub, b3, { roomId: 'amplifications', status: 'spoiled', ordinal: 4 },
    { roomId: 'soundnoisemusic', status: 'accepted', ordinal: 5, lost: true },
    { roomId: 'lux_nova', status: 'accepted', ordinal: 6, damage: { kind: 'tear' } }];
  assert.equal(elleryCaughtMilestone(save), 'take:the_tub');
  assert.equal(createElleryCaughtCheckpoint(save, { milestoneId: 'take:amplifications', pose }), null);
  assert.equal(createElleryCaughtCheckpoint(save, { milestoneId: 'take:lux_nova', pose }), null);
});

test('a checkpoint has one exact run, view and earned milestone, with no nested rollback or profile', () => {
  const save = workOrderSave();
  const checkpoint = createElleryCaughtCheckpoint(save, { milestoneId, pose });
  const roundTrip = JSON.parse(JSON.stringify(checkpoint));
  assert.deepEqual(normalizeElleryCaughtCheckpoint(roundTrip, { runId: save.run.id }), roundTrip);
  assert.equal(Object.hasOwn(checkpoint.snapshot, 'settings'), false);
  assert.equal(Object.hasOwn(checkpoint.snapshot, 'elleryCaughtCheckpoint'), false);
  assert.equal(normalizeElleryCaughtCheckpoint(checkpoint, { runId: 'another-night' }), null);
  assert.equal(normalizeElleryCaughtCheckpoint({ ...roundTrip, pose: { ...pose, yaw: 2 } }, { runId: save.run.id }), null);
  assert.equal(normalizeElleryCaughtCheckpoint({ ...roundTrip, evidence: 'made-up-take' }, { runId: save.run.id }), null);
  save.elleryCaughtCheckpoint = checkpoint;
  assert.equal(createElleryCaughtCheckpoint(save, { milestoneId, pose: { ...pose, y: 80 } }), null);
  assert.equal(createElleryCaughtCheckpoint({ ...save, area: 'source-space' }, { milestoneId, pose }), null);
  assert.equal(createElleryCaughtCheckpoint(save, { milestoneId, pose: { ...pose, x: NaN } }), null);
});

test('CAUGHT restores the whole night from the snapshot once, including state added by a live owner', async () => {
  const save = workOrderSave();
  const items = ['master', 'cassette'];
  const flags = { ...save.flags, 'test.before': true };
  const nightClock = { ...save.nightClock, elapsedSeconds: 320 };
  const doors = { schema: 2, states: { 'west-office': { state: 'closed' } } };
  await withTransientGameState({ save }, async () => {
    const profile = getMeta();
    const checkpoint = commitElleryCaughtCheckpoint({ milestoneId, pose, live: { items, flags, doors, nightClock } });
    assert.ok(checkpoint);
    items.push('picked-up-later');
    const changed = getSave();
    saveCommit({
      px: 890, py: 878, cameraRevision: 75, checkpointRevision: 34,
      items: ['wrong-item'],
      flags: { ...flags, 'test.after': true },
      nightClock: { ...changed.nightClock, elapsedSeconds: 593 },
      rec: { tapes: [b3, tub], injuries: 3 },
      doors: { schema: 2, states: {} },
      settings: { ...changed.settings, mic: 'on' },
    });
    assert.equal(restoreElleryCaughtCheckpoint({ eventId: 'old', expectedCheckpointRevision: 999 }), null);
    const committed = restoreElleryCaughtCheckpoint({ eventId: 'catch-1', expectedCheckpointRevision: checkpoint.revision });
    assert.equal(await committed.persisted, true);
    const restored = getSave();
    assert.equal(restored, committed.save);
    assert.equal(restored.run.id, save.run.id);
    assert.equal(restored.px, pose.x);
    assert.equal(restored.py, pose.y);
    assert.deepEqual(restored.view, { yaw: pose.yaw, pitch: pose.pitch });
    assert.equal(restored.cameraRevision, 76);
    assert.equal(restored.checkpointRevision, 35);
    assert.deepEqual(restored.rec, checkpoint.snapshot.rec);
    assert.deepEqual(restored.items, ['master', 'cassette']);
    assert.deepEqual(restored.doors, normalizeDoorSave(checkpoint.snapshot.doors));
    assert.equal(restored.nightClock.elapsedSeconds, 320);
    assert.equal(restored.flags['test.after'], undefined);
    assert.equal(restored.settings.mic, 'on');
    assert.equal(getMeta(), profile);
    assert.equal(restoreElleryCaughtCheckpoint({ eventId: 'catch-1' }), null);
    assert.equal(await retryElleryCaughtPersistence('catch-1'), true);
    assert.equal(await retryElleryCaughtPersistence('other-event'), false);
    assert.equal(restored.elleryCaughtReceipt.sequence, 1);
  });
});

test('a process interruption picks the completed same-run rewind over an older durable autosave', () => {
  const durable = workOrderSave();
  durable.elleryCaughtCheckpoint = createElleryCaughtCheckpoint(durable, { milestoneId, pose });
  const mirror = elleryCaughtRestore(durable, { eventId: 'catch-1' });
  assert.equal(preferElleryCaughtRecoveryMirror(durable, mirror), mirror);
  assert.equal(preferElleryCaughtRecoveryMirror(mirror, durable), mirror);
  assert.equal(preferElleryCaughtRecoveryMirror(durable, { ...mirror, run: { ...mirror.run, id: 'another-night' } }), durable);
  const ending = { ...durable, run: { ...durable.run, status: 'complete' } };
  assert.equal(preferElleryCaughtRecoveryMirror(ending, mirror), ending);
  const postRestoreAutosave = { ...mirror, px: 960, py: 860 };
  assert.equal(preferElleryCaughtRecoveryMirror(postRestoreAutosave, mirror), postRestoreAutosave);
});

test('a failed durable write can retry the same receipt without performing a second rewind', async () => {
  const adapter = new MemoryFileAdapter();
  await saveLoadAsync({ kind: 'desktop', adapter });
  saveCommit(workOrderSave());
  const checkpoint = commitElleryCaughtCheckpoint({ milestoneId, pose });
  saveCommit({ px: 900, py: 500, items: ['post-checkpoint-item'] });
  assert.equal(await saveGameQueued(structuredClone(getSave())), true);
  const store = currentStorage();
  const write = adapter.writeText.bind(adapter);
  adapter.writeText = async (path, ...args) => {
    if (path === 'saves/autosave.json.tmp') throw new Error('injected full disk');
    return write(path, ...args);
  };
  const failed = restoreElleryCaughtCheckpoint({ eventId: 'catch-failed-write', expectedCheckpointRevision: checkpoint.revision });
  assert.equal(await failed.persisted, false);
  assert.equal((await store.loadSave('autosave')).px, 900);
  assert.equal(getSave().px, pose.x);
  assert.equal(getSave().elleryCaughtReceipt.sequence, 1);
  assert.equal(restoreElleryCaughtCheckpoint({ eventId: 'catch-failed-write' }), null);
  adapter.writeText = write;
  assert.equal(await retryElleryCaughtPersistence('catch-failed-write'), true);
  await saveLoadAsync({ kind: 'desktop', adapter });
  assert.equal(getSave().px, pose.x);
  assert.equal(getSave().elleryCaughtReceipt.sequence, 1);
  assert.equal(restoreElleryCaughtCheckpoint({ eventId: 'catch-failed-write' }), null);
});

test('startup honors the synchronous committed rewind when the native queue did not reach disk', async () => {
  const storage = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  try {
    const adapter = new MemoryFileAdapter();
    await saveLoadAsync({ kind: 'desktop', adapter });
    saveCommit(workOrderSave());
    const checkpoint = commitElleryCaughtCheckpoint({ milestoneId, pose });
    saveCommit({ px: 900, py: 500, items: ['post-checkpoint-item'] });
    assert.equal(await saveGameQueued(structuredClone(getSave())), true);
    const write = adapter.writeText.bind(adapter);
    adapter.writeText = async (path, ...args) => {
      if (path === 'saves/autosave.json.tmp') throw new Error('injected incomplete native queue');
      return write(path, ...args);
    };
    const committed = restoreElleryCaughtCheckpoint({ eventId: 'catch-mirrored', expectedCheckpointRevision: checkpoint.revision });
    assert.equal(await committed.persisted, true);
    assert.equal((await currentStorage().loadSave('autosave')).px, 900);
    adapter.writeText = write;
    await saveLoadAsync({ kind: 'desktop', adapter });
    assert.equal(getSave().px, pose.x);
    assert.deepEqual(getSave().items, []);
    assert.equal(getSave().elleryCaughtReceipt.eventId, 'catch-mirrored');
    assert.equal((await currentStorage().loadSave('autosave')).px, pose.x);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
