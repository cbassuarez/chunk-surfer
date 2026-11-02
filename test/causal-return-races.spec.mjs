import test from 'node:test';
import { causalFixtureReturnEvent, finalizeCausalFixture } from './helpers/causal-fixture.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CausalRecorder, causalRecorder } from '../src/causal/recorder.js';
import { CAUSAL_SPINE_IDS, CAUSAL_INJURY_CEILING, sealCausalTape, packShadowFrames } from '../src/causal/tape.js';
import { MemoryFileAdapter } from '../src/platform/storage/desktopStorage.js';
import { initGameStorage } from '../src/platform/storage/storageService.js';
import { freshMeta, freshRunRecord } from '../src/progression/schema.js';
import { ACHIEVEMENT_DEFS } from '../src/progression/achievement-defs.js';
import { achievementCompletion } from '../src/progression/achievements.js';
import { unlockCausalTapeAchievement, markDeveloperRun, commitReturn, progressionEvents } from '../src/progression/runtime.js';
import { finalizeCausalReturn, reconcileSealedCausalDraft } from '../src/progression/causal-progression.js';
import { withTransientGameState, getMeta, getSave, saveCommit } from '../src/game/save.js';

// These are storage/progression fixtures, not earned ordinary-play witnesses.
const spine = recorder => CAUSAL_SPINE_IDS.forEach((id, index) => recorder.recordAnchor({
  id, verb: id.endsWith('contact') ? 'contact' : 'haunt', required: true,
  locus: { x: index, y: index, spaceId: 'conservatory' },
}));
const frame = x => ({ x, y: 1, yaw: 0, pitch: 0, roomId: 'main_b3', renderGroup: 'basement', spaceId: 'conservatory' });
function qualifyingTape(runId = 'earned-A', extra = {}) {
  return sealCausalTape({ runId, returnSummaryId: `return:${runId}`, endingId: 'sacrifice', durationMs: 1000,
    qualification: { injuries: 0, difficulty: 'contract', completedAt: 2000 },
    shadowFrames: [{ t: 0, ...frame(1) }, { t: 1000, ...frame(2) }],
    events: [causalFixtureReturnEvent(runId, 'sacrifice', { at: 1000 })],
    anchors: CAUSAL_SPINE_IDS.map((id, index) => ({ id, at: index * 100, verb: 'haunt', required: true,
      locus: { x: index, y: index, spaceId: 'conservatory' } })), ...extra });
}
function filedMeta(tape = qualifyingTape()) {
  const meta = freshMeta();
  meta.returns.records[tape.returnSummaryId] = { id: tape.returnSummaryId, runId: tape.runId, endingId: tape.endingId,
    injuries: tape.qualification.injuries, integrity: { achievements: { eligible: true } }, unlockedAchievements: [] };
  return meta;
}

test('a recorder reserves seal and promotion before a new night can replace its draft', async () => {
  const adapter = new MemoryFileAdapter();
  const storage = await initGameStorage({ kind: 'desktop', adapter, gameVersion: 'CAUSAL-RACE-TEST' });
  const recorder = new CausalRecorder();
  recorder.begin({ runId: 'earned-A', difficulty: 'dead-air' });
  recorder.tick(.1, frame(1)); spine(recorder);
  const filingA = finalizeCausalFixture(recorder, { summary: { id: 'return:earned-A', runId: 'earned-A' }, endingId: 'sacrifice', completedAt: 2000 });
  // Deliberately do not await filing. This is the actual New Game race.
  recorder.begin({ runId: 'next-B', difficulty: 'guided' });
  recorder.tick(.1, frame(50)); recorder.flushSegment();
  const result = await filingA;
  await recorder.pendingWrites;
  assert.equal(result.ok, true);
  assert.equal(result.tape.runId, 'earned-A');
  assert.equal(result.tape.qualification.difficulty, 'dead-air');
  assert.equal((await storage.loadLatestCausalTape()).runId, 'earned-A');
  const nextDraft = await storage.loadCausalDraft();
  assert.equal(nextDraft.runId, 'next-B');
  assert.equal(nextDraft.difficulty, 'guided');
  assert.equal(nextDraft.segments[0].base.x, 50, 'new-night frames belong only to the new draft');
  assert.equal(result.tape.shadowFrames[0].base.x, 1, 'the promoted tape retains only the sealed night');
});

test('queued segment headers retain their originating run and failed-night discard cannot erase the next draft', async () => {
  const storage = await initGameStorage({ kind: 'desktop', adapter: new MemoryFileAdapter(), gameVersion: 'CAUSAL-RACE-TEST' });
  const recorder = new CausalRecorder();
  recorder.begin({ runId: 'rejected-A', difficulty: 'dead-air' });
  recorder.tick(.1, frame(1)); recorder.flushSegment();
  recorder.noteInjuries(CAUSAL_INJURY_CEILING + 1);
  recorder.begin({ runId: 'next-B', difficulty: 'guided' });
  recorder.tick(.1, frame(50)); recorder.flushSegment();
  await recorder.pendingWrites;
  const draft = await storage.loadCausalDraft();
  assert.equal(draft.runId, 'next-B');
  assert.equal(draft.difficulty, 'guided');
  assert.equal(draft.segments.length, 1);
  assert.equal(draft.segments[0].base.x, 50);
  assert.equal(await storage.loadLatestCausalTape(), null, 'an unfinished draft never becomes a qualifying tape');
});

test('the actual main capture gate starts the new run even when an unfinished old run is still active', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function ensureCausalCapture(){');
  const end = source.indexOf('\nfunction tickCausalCapture(', start);
  const functionSource = source.slice(start, end).trim();
  for (const scenario of [
    { owner: 'old-A', active: true, discarded: false, expected: 1 },
    { owner: 'live-B', active: true, discarded: false, expected: 0 },
    { owner: 'live-B', active: false, discarded: true, expected: 0 },
    { owner: 'old-A', active: false, discarded: true, expected: 1 },
  ]) {
    const starts = [], run = freshRunRecord({ id: 'live-B', now: 1000 });
    const recorder = { runId: scenario.owner, active: scenario.active, discarded: scenario.discarded,
      begin(options) { starts.push(options); this.runId = options.runId; this.active = true; this.discarded = false; }, recordEvent() {} };
    const gate = vm.runInNewContext(`(${functionSource})`, {
      getSave: () => ({ run, power: {} }), storyMode: true, inRogue: true, planName: 'conservatory',
      flagTest: () => true, scenes: { has: () => false }, causalRecorder: recorder,
      FP: { saveDoorState: () => [] }, normalizePowerState: value => value,
    });
    gate();
    assert.equal(starts.length, scenario.expected, JSON.stringify(scenario));
    if (scenario.expected) assert.equal(starts[0].resume, true);
  }
});

test('abandoning an unfinished night starts a clean matching draft without borrowing its capture', async () => {
  const storage = await initGameStorage({ kind: 'desktop', adapter: new MemoryFileAdapter(), gameVersion: 'CAUSAL-NEW-RUN-TEST' });
  const recorder = new CausalRecorder(); recorder.begin({ runId: 'unfinished-A' });
  recorder.tick(.1, frame(1)); spine(recorder);
  recorder.begin({ runId: 'next-B', difficulty: 'guided', resume: true });
  recorder.tick(.1, frame(50)); await recorder.hydration; await recorder.pendingWrites;
  assert.equal(recorder.runId, 'next-B');
  assert.equal(recorder.frames.length, 1);
  assert.equal(recorder.frames[0].x, 50);
  assert.deepEqual(recorder.anchors, []);
  const draft = await storage.loadCausalDraft();
  assert.equal(draft.runId, 'next-B');
  assert.equal(draft.difficulty, 'guided');
  assert.equal(await storage.loadLatestCausalTape(), null);
});

test('normal reload restores only the matching capture and buffers real input without losing its first milestone', async () => {
  const storage = await initGameStorage({ kind: 'desktop', adapter: new MemoryFileAdapter(), gameVersion: 'CAUSAL-RELOAD-TEST' });
  const previous = new CausalRecorder(); previous.begin({ runId: 'reloaded-A', difficulty: 'contract' });
  previous.tick(.1, frame(1));
  previous.recordEvent({ type: 'actual-before-reload', payload: { value: 1 } });
  previous.recordAnchor({ id: CAUSAL_SPINE_IDS[0], verb: 'haunt', required: true, locus: { x: 1, y: 1, spaceId: 'conservatory' } });
  for (let i = 0; i < 6; i++) previous.tick(1, frame(i + 2));
  previous.checkpoint({ force: true }); await previous.pendingWrites;
  const persisted = await storage.loadCausalDraft();
  const resumed = new CausalRecorder(); resumed.begin({ runId: 'reloaded-A', difficulty: 'contract', resume: true });
  const payload = { value: 2 };
  resumed.tick(.2, frame(20));
  resumed.recordEvent({ type: 'actual-during-hydration', payload }); payload.value = 999;
  // Re-entering a trigger cannot duplicate an already captured cause.
  resumed.recordAnchor({ id: CAUSAL_SPINE_IDS[0], verb: 'haunt', required: true, locus: { x: 1, y: 1, spaceId: 'conservatory' } });
  resumed.recordAnchor({ id: CAUSAL_SPINE_IDS[1], verb: 'taunt', required: true, locus: { x: 20, y: 1, spaceId: 'conservatory' } });
  await resumed.hydration; await resumed.pendingWrites;
  assert.equal(resumed.elapsedMs, persisted.checkpoint.elapsedMs + 200);
  assert.equal(resumed.frames[0].x, 1);
  assert.equal(resumed.frames.at(-1).x, 20);
  assert.deepEqual(resumed.anchors.map(row => row.id), CAUSAL_SPINE_IDS.slice(0, 2));
  assert.equal(resumed.events.find(row => row.type === 'actual-during-hydration').payload.value, 2);
  assert.equal(new Set(resumed.events.map(row => row.id)).size, resumed.events.length);
  assert.ok(resumed.events.find(row => row.type === 'actual-during-hydration').at > resumed.events.find(row => row.type === 'actual-before-reload').at);
  const durable = await storage.loadCausalDraft();
  assert.equal(durable.checkpoint.anchors.length, 2);
  assert.equal(durable.checkpoint.elapsedMs, resumed.elapsedMs);
});

test('a return filed during hydration stays reserved ahead of the next night and keeps buffered observations', async () => {
  const adapter = new MemoryFileAdapter();
  const storage = await initGameStorage({ kind: 'desktop', adapter, gameVersion: 'CAUSAL-RELOAD-TEST' });
  const previous = new CausalRecorder(); previous.begin({ runId: 'reloaded-A' });
  previous.tick(.1, frame(1)); spine(previous); await previous.pendingWrites;
  let releaseRead;
  const gate = new Promise(resolve => { releaseRead = resolve; });
  const originalRead = adapter.readText.bind(adapter);
  let gateOnce = true;
  adapter.readText = async (...args) => {
    if (gateOnce && args[0] === 'causal/draft.json') { gateOnce = false; await gate; }
    return originalRead(...args);
  };
  const resumed = new CausalRecorder(); resumed.begin({ runId: 'reloaded-A', resume: true });
  resumed.tick(.2, frame(20)); resumed.recordEvent({ type: 'actual-final-action', payload: { accepted: true } });
  const filing = finalizeCausalFixture(resumed, { summary: { id: 'return:reloaded-A', runId: 'reloaded-A' }, endingId: 'sacrifice', completedAt: 2000 });
  resumed.begin({ runId: 'next-B', difficulty: 'guided' }); resumed.tick(.1, frame(50)); resumed.flushSegment();
  releaseRead();
  const result = await filing; await resumed.pendingWrites;
  assert.equal(result.ok, true);
  assert.equal(result.tape.runId, 'reloaded-A');
  assert.equal(result.tape.durationMs, 300);
  assert.deepEqual(result.tape.events.find(row => row.type === 'actual-final-action').payload, { accepted: true });
  assert.equal(result.tape.anchors.length, CAUSAL_SPINE_IDS.length);
  assert.equal((await storage.loadLatestCausalTape()).runId, 'reloaded-A');
  assert.equal((await storage.loadCausalDraft()).runId, 'next-B');
});

test('hydration never borrows another run’s milestones or repairs incompatible historic capture', async () => {
  const storage = await initGameStorage({ kind: 'desktop', adapter: new MemoryFileAdapter(), gameVersion: 'CAUSAL-RELOAD-TEST' });
  const previous = new CausalRecorder(); previous.begin({ runId: 'old-A' }); previous.tick(.1, frame(1)); spine(previous);
  await previous.pendingWrites;
  const resumed = new CausalRecorder(); resumed.begin({ runId: 'fresh-B', resume: true });
  resumed.tick(.1, frame(50)); await resumed.hydration; await resumed.pendingWrites;
  assert.deepEqual(resumed.anchors, []);
  assert.equal(resumed.frames.length, 1);
  assert.equal(resumed.frames[0].x, 50);
  assert.equal((await storage.loadCausalDraft()).runId, 'fresh-B');
});

test('an interrupted segment append cannot leak uncommitted future movement across a reload', async () => {
  const storage = await initGameStorage({ kind: 'desktop', adapter: new MemoryFileAdapter(), gameVersion: 'CAUSAL-RELOAD-TEST' });
  const previous = new CausalRecorder(); previous.begin({ runId: 'interrupted-A' });
  previous.tick(.1, frame(1)); previous.recordAnchor({ id: CAUSAL_SPINE_IDS[0], verb: 'haunt', required: true,
    locus: { x: 1, y: 1, spaceId: 'conservatory' } }); await previous.pendingWrites;
  // The application can stop between a pose-segment write and the checkpoint
  // which accepts it. That segment is outside the checkpoint's committed count.
  await storage.appendCausalDraftSegment('interrupted-A', packShadowFrames([{ t: 100, ...frame(1) }, { t: 5000, ...frame(999) }])[0]);
  const resumed = new CausalRecorder(); resumed.begin({ runId: 'interrupted-A', resume: true });
  resumed.tick(.2, frame(2)); await resumed.hydration; await resumed.pendingWrites;
  assert.deepEqual(resumed.frames.map(row => row.x), [1, 2]);
  assert.equal(resumed.elapsedMs, 300);
  assert.equal((await storage.loadCausalDraft()).segments.length, 0, 'the unaccepted segment is trimmed before later appends');
  assert.equal(resumed.anchors.length, 1);
});

test('a delayed legitimate tape earns only its sealed-night award after the live run changes', async () => {
  const tape = qualifyingTape(), meta = filedMeta(tape);
  await withTransientGameState({ meta, save: { run: freshRunRecord({ id: 'next-B', now: 3000 }) } }, async () => {
    markDeveloperRun('TEST-LIVE-B');
    const before = structuredClone(getSave().run);
    const result = unlockCausalTapeAchievement(tape, { notify: false, at: 4000 });
    assert.equal(result.ok, true);
    assert.deepEqual(result.unlocked, ['ACH_SECOND_TRACK']);
    assert.equal(getMeta().achievements.ACH_SECOND_TRACK.runId, 'earned-A');
    assert.deepEqual(getSave().run, before, 'delayed filing cannot mutate the live run or its eligibility');
    assert.deepEqual(unlockCausalTapeAchievement(tape, { notify: false }).unlocked, []);
  });
});

test('a delayed final qualifying award and Master Copy complete 100 percent together across runs', async () => {
  const tape = qualifyingTape(), meta = filedMeta(tape);
  meta.achievements = Object.fromEntries(ACHIEVEMENT_DEFS
    .filter(row => !['ACH_SECOND_TRACK', 'ACH_COMPLETE_ARCHIVE'].includes(row.id))
    .map(row => [row.id, { unlockedAt: 100, runId: 'earlier-runs', build: 'TEST' }]));
  await withTransientGameState({ meta, save: { run: freshRunRecord({ id: 'next-B', now: 3000 }) } }, async () => {
    markDeveloperRun('TEST-LIVE-B');
    const result = unlockCausalTapeAchievement(tape, { notify: false, at: 4000 });
    assert.deepEqual(result.unlocked, ['ACH_SECOND_TRACK', 'ACH_COMPLETE_ARCHIVE']);
    assert.deepEqual(achievementCompletion(getMeta()).completed, 38);
    assert.equal(achievementCompletion(getMeta()).percent, 100);
    assert.equal(getMeta().achievements.ACH_COMPLETE_ARCHIVE.runId, 'earned-A');
    assert.equal(getMeta().platform.pendingAchievements.filter(id => id === 'ACH_COMPLETE_ARCHIVE').length, 1);
  });
});

test('the real asynchronous filing path preserves both delayed awards in the old night’s report', async () => {
  const storage = await initGameStorage({ kind: 'desktop', adapter: new MemoryFileAdapter(), gameVersion: 'CAUSAL-RACE-TEST' });
  const meta = freshMeta();
  meta.achievements = Object.fromEntries(ACHIEVEMENT_DEFS
    .filter(row => !['ACH_SECOND_TRACK', 'ACH_COMPLETE_ARCHIVE'].includes(row.id))
    .map(row => [row.id, { unlockedAt: 100, runId: 'earlier-runs', build: 'TEST' }]));
  await withTransientGameState({ meta, save: { run: freshRunRecord({ id: 'filing-A', now: 1000 }) } }, async () => {
    causalRecorder.begin({ runId: 'filing-A' });
    causalRecorder.tick(.1, frame(1)); spine(causalRecorder);
    const unsubscribe = progressionEvents.on('*', event => causalRecorder.recordEvent({ actor: 'system', type: event.type, payload: event.payload }));
    try {
      const summary = commitReturn('sacrifice', { rec: { takes: [], injuries: 0 } }, 2000);
      const filing = finalizeCausalReturn(summary);
      saveCommit({ run: freshRunRecord({ id: 'next-B', now: 3000 }) });
      markDeveloperRun('TEST-LIVE-B');
      causalRecorder.begin({ runId: 'next-B' });
      causalRecorder.tick(.1, frame(50)); causalRecorder.flushSegment();
      const result = await filing;
      await causalRecorder.pendingWrites;
      assert.equal(result.ok, true);
      assert.equal((await storage.loadLatestCausalTape()).runId, 'filing-A');
      assert.equal((await storage.loadCausalDraft()).runId, 'next-B');
      assert.equal(getSave().run.id, 'next-B');
      assert.equal(getSave().run.integrity.achievements.eligible, false);
      assert.equal(achievementCompletion(getMeta()).percent, 100);
      const report = getMeta().returns.records[summary.id];
      assert.ok(report.unlockedAchievements.includes('ACH_SECOND_TRACK'));
      assert.ok(report.unlockedAchievements.includes('ACH_COMPLETE_ARCHIVE'));
      assert.equal(report.causalTape.status, 'ready');
    } finally { unsubscribe(); }
  });
});

test('delayed filing rejects missing, mismatched, unranked, excessive-injury and altered evidence', async () => {
  for (const failure of ['missing-summary', 'wrong-run', 'wrong-ending', 'developer-summary', 'unranked-summary', 'injury-mismatch', 'over-ceiling', 'checksum']) {
    const tape = qualifyingTape('earned-A', failure === 'over-ceiling'
      ? { qualification: { injuries: CAUSAL_INJURY_CEILING + 1, difficulty: 'contract', completedAt: 2000 } } : {});
    const meta = filedMeta(tape), summary = meta.returns.records[tape.returnSummaryId];
    if (failure === 'missing-summary') delete meta.returns.records[tape.returnSummaryId];
    if (failure === 'wrong-run') summary.runId = 'not-A';
    if (failure === 'wrong-ending') summary.endingId = 'helped';
    if (failure === 'developer-summary') summary.developerRun = true;
    if (failure === 'unranked-summary') summary.integrity.achievements.eligible = false;
    if (failure === 'injury-mismatch') summary.injuries = 1;
    const incoming = failure === 'checksum' ? { ...tape, durationMs: tape.durationMs + 1 } : tape;
    await withTransientGameState({ meta, save: { run: freshRunRecord({ id: 'normal-B', now: 3000 }) } }, async () => {
      const result = unlockCausalTapeAchievement(incoming, { notify: false });
      assert.equal(result.ok, false, failure);
      assert.equal(!!getMeta().achievements.ACH_SECOND_TRACK, false, failure);
      assert.equal(!!getMeta().achievements.ACH_COMPLETE_ARCHIVE, false, failure);
    });
  }
});

test('rejected unranked and excessive-injury returns do not remain stuck filing', async () => {
  for (const reason of ['unranked', 'injury']) {
    const tape = qualifyingTape(), meta = filedMeta(tape), summary = meta.returns.records[tape.returnSummaryId];
    summary.causalTape = { status: 'filing' }; meta.causalTape.status = 'filing';
    if (reason === 'unranked') { summary.developerRun = true; summary.integrity.achievements.eligible = false; }
    else summary.injuries = CAUSAL_INJURY_CEILING + 1;
    await withTransientGameState({ meta, save: { run: freshRunRecord({ id: 'next-B', now: 3000 }) } }, async () => {
      const result = await finalizeCausalReturn(summary);
      assert.equal(result.ok, false);
      assert.equal(getMeta().returns.records[summary.id].causalTape.status, reason === 'unranked' ? 'failed' : 'not-qualified');
      assert.notEqual(getMeta().causalTape.status, 'filing');
      assert.equal(!!getMeta().achievements.ACH_SECOND_TRACK, false);
    });
  }
});

test('startup reconciliation ends orphaned filing without replacing an already ready earlier tape', async () => {
  await initGameStorage({ kind: 'desktop', adapter: new MemoryFileAdapter(), gameVersion: 'CAUSAL-STATUS-TEST' });
  const tape = qualifyingTape(), meta = filedMeta(tape);
  meta.returns.records[tape.returnSummaryId].causalTape = { status: 'filing' };
  meta.causalTape = { ...meta.causalTape, status: 'ready', latestId: 'return:earlier-valid', contentHash: 'earlier-valid' };
  await withTransientGameState({ meta, save: { run: freshRunRecord({ id: 'next-B', now: 3000 }) } }, async () => {
    assert.equal((await reconcileSealedCausalDraft()).reason, 'NO_SEALED_DRAFT');
    assert.equal(getMeta().returns.records[tape.returnSummaryId].causalTape.status, 'failed');
    assert.equal(getMeta().causalTape.status, 'ready');
    assert.equal(getMeta().causalTape.contentHash, 'earlier-valid');
    assert.equal(!!getMeta().achievements.ACH_SECOND_TRACK, false);
  });
});

test('a genuine sealed return retries promotion after storage recovers and leaves no filing trap', async () => {
  const storage = await initGameStorage({ kind: 'desktop', adapter: new MemoryFileAdapter(), gameVersion: 'CAUSAL-STATUS-TEST' });
  const originalPromote = storage.promoteCausalDraft.bind(storage);
  storage.promoteCausalDraft = async () => { throw new Error('temporary storage interruption'); };
  await withTransientGameState({ meta: freshMeta(), save: { run: freshRunRecord({ id: 'retry-A', now: 1000 }) } }, async () => {
    causalRecorder.begin({ runId: 'retry-A' }); causalRecorder.tick(.1, frame(1)); spine(causalRecorder);
    const unsubscribe = progressionEvents.on('*', event => causalRecorder.recordEvent({ actor: 'system', type: event.type, payload: event.payload }));
    try {
      const summary = commitReturn('sacrifice', { rec: { takes: [], injuries: 0 } }, 2000);
      assert.equal((await finalizeCausalReturn(summary)).reason, 'TAPE_FILING_FAILED');
      assert.equal(getMeta().returns.records[summary.id].causalTape.status, 'failed');
      assert.equal(getMeta().causalTape.status, 'failed');
      assert.ok(await storage.loadSealedCausalDraft(), 'the already sealed evidence remains available for a real retry');
      assert.equal(!!getMeta().achievements.ACH_SECOND_TRACK, false);
      storage.promoteCausalDraft = originalPromote;
      assert.equal((await reconcileSealedCausalDraft()).ok, true);
      assert.equal(getMeta().returns.records[summary.id].causalTape.status, 'ready');
      assert.equal(getMeta().causalTape.status, 'ready');
      assert.equal(getMeta().achievements.ACH_SECOND_TRACK.runId, 'retry-A');
    } finally { unsubscribe(); storage.promoteCausalDraft = originalPromote; }
  });
});
