import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindowMediaEncounterPresentation } from '../src/platform/window-media-encounter-presentation.js';
import { STUDY_EVENTS } from '../src/platform/window-media-studies.js';

const image = id => `data:image/png;base64,${id}`;
const event = (type, detail = {}, outer = {}) => ({ type: 'event', event: { type, ...detail }, ...outer });
const safePose = { type: 'pose', phase: 'catch', threat: { refuge: true }, recovery: null, reveal: null };
const roomFrames = () => ({ snapshotFrames: ['left', 'middle', 'right'].map(image), contradictionFrame: image('wrong-middle') });
const weightFrames = () => [
  ['top-held', 'support-empty', 'receiver-empty'],
  ['top-leaving', 'support-empty', 'receiver-empty'],
  ['top-empty', 'support-crossing', 'receiver-empty'],
  ['top-empty', 'support-empty', 'receiver-empty'],
  ['top-empty', 'support-empty', 'receiver-empty'],
].map(row => row.map(image));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function until(predicate) {
  for (let index = 0; index < 40 && !predicate(); index++) await Promise.resolve();
  assert.ok(predicate(), 'the expected asynchronous boundary was reached');
}
function fixture({ pending = false, endFails = false, makeRoomFrames = roomFrames, makeWeightFrames = weightFrames } = {}) {
  const begins = [], ends = [], events = [], shown = [], released = [], registrations = [], holds = [];
  const owned = new Set(); let visible = null, serial = 0;
  const effects = {
    registerSnapshot(data) { const token = `snapshot-test-${++serial}`; registrations.push({ token, data }); owned.add(token); return token; },
    releaseSnapshots(tokens = []) { for (const token of tokens) { released.push(token); owned.delete(token); } },
  };
  const director = {
    async beginStudy(plan, { key, isCurrent }) {
      const wait = deferred(), call = { plan, key, isCurrent, wait }; begins.push(call);
      const result = pending ? await wait.promise : { native: false };
      if (!isCurrent() || !result) return null;
      visible = { key, plan }; shown.push(key); return result;
    },
    async endStudy(key) {
      ends.push(key);
      if (endFails) throw Error('presentation teardown unavailable');
      if (visible?.key !== key) return false;
      visible = null; return true;
    },
    compositionEvent(value) { events.push({ event: value, key: visible?.key }); },
    holdComposition(value) { holds.push(value); },
  };
  const documentApi = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) };
  const presenter = createWindowMediaEncounterPresentation({ director, effects, documentApi,
    getCanvas: () => ({ width: 640, height: 360 }), makeRoomFrames, makeWeightFrames });
  const update = (owner, traces = [], extra = {}) => presenter.update({ owner, traces, frame: {}, ...extra });
  return { presenter, director, effects, begins, ends, events, shown, released, registrations, owned, holds,
    update, visible: () => visible };
}

test('a late begin cannot install an old owner or end the new owner presentation', async () => {
  const f = fixture({ pending: true });
  f.update('tear:old', [event('memory-awake')]);
  await until(() => f.begins.length === 1);
  const first = f.begins[0];
  f.update('tear:new', [event('memory-awake')]);
  assert.equal(first.isCurrent(), false, 'the ownership predicate invalidates synchronously');
  first.wait.resolve({ native: true });
  await until(() => f.begins.length === 2);
  const next = f.begins[1]; assert.ok(next.key > first.key);
  next.wait.resolve({ native: false }); await f.presenter.whenIdle();
  assert.deepEqual(f.shown, [next.key], 'the old request never becomes visible');
  assert.equal(f.visible().key, next.key);
  assert.ok(f.ends.every(key => key === first.key), 'old retirement never targets the new key');
  await f.presenter.stop(); assert.equal(f.visible(), null);
});

test('preparation, including the queued first microtask, never consumes minimum Quorum reading time', async () => {
  const f = fixture({ pending: true });
  f.update('standing-tear', [event('memory-awake'), event('live-start', { id: 'solo' })], { dt: .1 });
  assert.equal(f.presenter.snapshot().model.clock, 0, 'the show request is already preparing before its async body starts');
  await until(() => f.begins.length === 1);
  for (let index = 0; index < 140; index++) f.update('standing-tear', [], { dt: .1 });
  assert.equal(f.presenter.snapshot().model.clock, 0);
  f.begins[0].wait.resolve({ native: false }); await f.presenter.whenIdle();
  for (let index = 0; index < 99; index++) f.update('standing-tear', [], { dt: .1 });
  assert.equal(f.presenter.snapshot().model.active.study, 'quorum');
  f.update('standing-tear', [], { dt: .1 }); f.update('standing-tear', [], { dt: .1 });
  await until(() => f.begins.length === 2);
  assert.equal(f.begins[1].plan.compositionId, 'study:retained');
  f.begins[1].wait.resolve({ native: false }); await f.presenter.whenIdle(); await f.presenter.stop();
});

test('a real release during current Retained preparation queues against that presentation key', async () => {
  const f = fixture({ pending: true });
  f.update('standing-tear', [event('memory-awake'), event('live-start', { id: 'solo' })]);
  await until(() => f.begins.length === 1);
  f.begins[0].wait.resolve({ native: false }); await f.presenter.whenIdle();
  for (let index = 0; index < 102; index++) f.update('standing-tear', [], { dt: .1 });
  await until(() => f.begins.length === 2);
  const retained = f.begins[1];
  f.update('standing-tear', [event('live-stop', { id: 'solo', reason: 'release' })]);
  assert.equal(f.events.length, 0, 'a preparing pane cannot consume its release early');
  retained.wait.resolve({ native: true }); await f.presenter.whenIdle();
  assert.deepEqual(f.events, [{ event: STUDY_EVENTS.RETAINED_RELEASE, key: retained.key }]);
  await f.presenter.stop();
});

test('Weight packages deduplicate repeated frames and preserve one empty receiver token in all five samples', async () => {
  const f = fixture();
  f.update('source-continuation', [event('counterweight-release'), safePose], { frame: { phase: 'catch' } });
  await f.presenter.whenIdle();
  assert.equal(f.begins.length, 1); assert.equal(f.begins[0].plan.compositionId, 'study:weight');
  assert.equal(f.registrations.length, new Set(weightFrames().flat()).size);
  const receiver = f.registrations.find(item => item.data === image('receiver-empty')).token;
  const plan = f.begins[0].plan;
  assert.equal(plan.surfaces.find(pane => pane.id === 'weight:below').content.token, receiver);
  const assignments = plan.score.cues.flatMap(cue => cue.operations.flatMap(operation => Object.values(operation.assignments || {})));
  assert.ok(assignments.every(value => value.content?.token !== undefined));
  assert.equal(f.registrations.filter(item => item.data === image('receiver-empty')).length, 1);
  await f.presenter.stop();
  assert.equal(f.owned.size, 0); assert.equal(new Set(f.released).size, f.registrations.length);
});

test('Room stays absent when the changed middle is identical or the owned frames are unavailable', async () => {
  for (const frames of [null, { snapshotFrames: ['left', 'middle', 'right'].map(image), contradictionFrame: image('middle') }]) {
    const f = fixture({ makeRoomFrames: () => frames });
    f.update('source-continuation', [], { frame: { phase: 'wrong-return' } });
    f.update('source-continuation', [event('return-recognized')], { frame: { phase: 'wrong-return' } });
    await f.presenter.whenIdle();
    assert.equal(f.begins.length, 0); assert.equal(f.registrations.length, 0); assert.equal(f.owned.size, 0);
    assert.equal(f.presenter.snapshot().preparing, false, 'unavailable work must release its preparation hold');
    await f.presenter.stop();
  }
});

test('plan validation failure releases every snapshot registered before the malformed package was rejected', async () => {
  const f = fixture({ makeWeightFrames: () => weightFrames().slice(0, 4) });
  f.update('source-continuation', [event('counterweight-release'), safePose]);
  await f.presenter.whenIdle();
  assert.equal(f.begins.length, 0); assert.ok(f.registrations.length > 0);
  assert.equal(f.owned.size, 0, 'a builder rejection cannot strand an otherwise successfully registered snapshot package');
  assert.equal(new Set(f.released).size, f.registrations.length);
  await f.presenter.stop();
});

test('a current begin that fails to present releases its owned snapshots immediately', async () => {
  const f = fixture({ pending: true });
  f.update('source-continuation', [event('counterweight-release'), safePose]);
  await until(() => f.begins.length === 1);
  assert.ok(f.owned.size > 0);
  f.begins[0].wait.resolve(null); await f.presenter.whenIdle();
  assert.equal(f.owned.size, 0); assert.equal(f.presenter.snapshot().presentation, null);
  assert.equal(f.presenter.snapshot().preparing, false);
  await f.presenter.stop();
});

test('explicit stop invalidates pending work and releases owned tokens even when director teardown rejects', async () => {
  const f = fixture({ pending: true, endFails: true });
  f.update('source-continuation', [event('counterweight-release'), safePose]);
  await until(() => f.begins.length === 1);
  const pending = f.begins[0], stopped = f.presenter.stop();
  assert.equal(pending.isCurrent(), false, 'stop invalidates without awaiting native work');
  pending.wait.resolve({ native: true });
  await stopped.catch(() => {});
  assert.equal(f.shown.length, 0); assert.equal(f.owned.size, 0);
  assert.equal(f.presenter.snapshot().presentation, null);
});

test('switching from an owned Room package to Weight then stopping releases both packages exactly once', async () => {
  const f = fixture();
  f.update('source-continuation', [], { frame: { phase: 'wrong-return' } });
  f.update('source-continuation', [event('return-recognized')], { frame: { phase: 'wrong-return' } });
  await f.presenter.whenIdle(); assert.equal(f.begins[0].plan.compositionId, 'study:room');
  const firstKey = f.begins[0].key, firstTokens = [...f.owned];
  f.update('source-continuation', [event('phase', { phase: 'catch' }), event('counterweight-release'), safePose], { frame: { phase: 'catch' } });
  await f.presenter.whenIdle(); assert.equal(f.begins[1].plan.compositionId, 'study:weight');
  assert.ok(f.begins[1].key > firstKey); assert.ok(firstTokens.every(token => !f.owned.has(token)));
  await f.presenter.stop(); assert.equal(f.owned.size, 0);
  assert.equal(f.released.length, new Set(f.released).size, 'shared receiver frames and repeated cleanup are not double-released');
});
