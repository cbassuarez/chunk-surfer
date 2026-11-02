import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ACHIEVEMENT_DEFS } from '../src/progression/achievement-defs.js';
import { achievementCompletion } from '../src/progression/achievements.js';
import { freshMeta, freshRunRecord, normalizeRun, ENDING_IDS } from '../src/progression/schema.js';
import { withTransientGameState, getMeta, getSave, saveCommit } from '../src/game/save.js';
import { emitProgress, commitReturn, reconcileProfileAchievements, markDeveloperRun, unlockAchievement } from '../src/progression/runtime.js';
import { EVENT_TYPES as E } from '../src/progression/events.js';
import { COMPLETION_PAPERS, COMPLETION_LEADS, COMPLETION_ROOMS, normalizeCompletion, reduceCompletion } from '../src/progression/completion.js';

const metaId = 'ACH_COMPLETE_ARCHIVE';
const normalIds = ACHIEVEMENT_DEFS.map(row => row.id).filter(id => id !== metaId);
const award = { unlockedAt: 100, runId: 'earlier', build: 'TEST' };
const scoped = (fn, { meta = freshMeta(), run = freshRunRecord({ id: 'v1-test', now: 100 }) } = {}) =>
  withTransientGameState({ meta, save: { run } }, fn);
const emit = (type, payload = {}) => emitProgress(type, payload, 'test.achievement-v1', { at: 200, notifyAchievements: false });

test('100 percent counts every one of the 38 known awards, including mastery, and ignores foreign IDs', () => {
  assert.equal(ACHIEVEMENT_DEFS.length, 38);
  const meta = freshMeta();
  meta.achievements = Object.fromEntries(normalIds.map(id => [id, award]));
  const pending = achievementCompletion(meta);
  assert.equal(pending.completed, 37); assert.equal(pending.total, 38); assert.equal(pending.complete, false);
  meta.achievements.ACH_NOT_IN_THIS_GAME = award;
  assert.deepEqual(achievementCompletion(meta), pending);
  meta.achievements[metaId] = award;
  assert.equal(achievementCompletion(meta).percent, 100); assert.equal(achievementCompletion(meta).complete, true);
  delete meta.achievements.ACH_DEAD_AIR;
  assert.equal(achievementCompletion(meta).complete, false, 'a mastery award is required even when Master Copy is already filed');
});

test('the final ordinary award and Master Copy unlock on the same accepted event, exactly once', async () => {
  const meta = freshMeta();
  meta.achievements = Object.fromEntries(normalIds.filter(id => id !== 'ACH_CALL_YOURSELF').map(id => [id, award]));
  await scoped(async () => {
    const result = emit(E.SECRET_DISCOVERED, { id: 'call-yourself' });
    assert.ok(result.unlocked.includes('ACH_CALL_YOURSELF'));
    assert.ok(result.unlocked.includes(metaId));
    assert.equal(achievementCompletion(getMeta()).percent, 100);
    assert.deepEqual(emit(E.SECRET_DISCOVERED, { id: 'call-yourself' }).unlocked, []);
    assert.equal(getMeta().platform.pendingAchievements.filter(id => id === metaId).length, 1);
  }, { meta });
});

test('a union of 37 legitimate platform awards completes the catalogue without requiring another gameplay action', async () => {
  const meta = freshMeta(); meta.achievements = Object.fromEntries(normalIds.map(id => [id, award]));
  await scoped(async () => {
    assert.deepEqual(reconcileProfileAchievements({ at: 300 }), [metaId]);
    assert.equal(achievementCompletion(getMeta()).complete, true);
    assert.deepEqual(reconcileProfileAchievements({ at: 400 }), []);
  }, { meta });
});

test('reconciled durable collections award their own entries without inventing run mastery', async () => {
  const meta = freshMeta();
  meta.endingsSeen = [...ENDING_IDS];
  meta.knowledge.documents = Object.fromEntries(COMPLETION_PAPERS.map(id => [id, { firstSeenAt: 100, count: 1 }]));
  let completion = normalizeCompletion(null);
  for (const id of COMPLETION_LEADS.map(row => row.id)) completion = reduceCompletion(completion, { type: E.ITEM_OBTAINED, payload: { id }, at: 100 }).completion;
  for (const id of ['the_tub', 'amplifications', 'soundnoisemusic']) completion = reduceCompletion(completion, { type: E.DISCLOSURE_HEARD, payload: { id }, at: 100 }).completion;
  for (const id of ['off-air', 'call-yourself']) completion = reduceCompletion(completion, { type: E.SECRET_DISCOVERED, payload: { id }, at: 100 }).completion;
  meta.completion = completion;
  await scoped(async () => {
    const result = reconcileProfileAchievements({ at: 300 });
    for (const id of ['ACH_FIELD_NOTES', 'ACH_FIELD_LEADS', 'ACH_ALL_PLAYBACK', 'ACH_OFF_AIR', 'ACH_CALL_YOURSELF', 'ACH_HIDDEN_EXCHANGES', 'ACH_ALL_ENDINGS']) assert.ok(result.includes(id), id);
    for (const id of ['ACH_FIVE_ROOMS', 'ACH_UNBROKEN', 'ACH_FIRST_PASS', 'ACH_DEAD_AIR', metaId]) assert.equal(!!getMeta().achievements[id], false, id);
  }, { meta });
});

test('the manifest needs all five real room identities in this run; duplicates and other room IDs cannot fill it', async () => {
  await scoped(async () => {
    for (const roomId of ['main_b3', 'main_b3', 'invented-1', 'invented-2', 'invented-3', 'invented-4']) emit(E.TAKE_COMPLETED, { roomId, elapsed: 45 });
    assert.equal(!!getMeta().achievements.ACH_FIVE_ROOMS, false);
    for (const row of COMPLETION_ROOMS.slice(1)) emit(E.TAKE_COMPLETED, { roomId: row.id, elapsed: 45 });
    assert.ok(getMeta().achievements.ACH_FIVE_ROOMS);
    assert.equal(Object.keys(getMeta().completion.rooms).length, 5);
  });
});

test('the authored Chapel completes the manifest without inventing a fifth recorded take or lifetime statistic', async () => {
  await scoped(async () => {
    for (const roomId of ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic']) emit(E.TAKE_COMPLETED, { roomId, elapsed: 45 });
    const count = getMeta().stats.takesCompleted;
    assert.equal(!!getMeta().achievements.ACH_FIVE_ROOMS, false);
    assert.equal(emit(E.MANIFEST_SLOT_COMPLETED, { roomId: 'main_b3' }).ok, false);
    const completed = emit(E.MANIFEST_SLOT_COMPLETED, { roomId: 'lux_nova' });
    assert.ok(completed.unlocked.includes('ACH_FIVE_ROOMS'));
    assert.equal(getSave().run.ledger.takes.completed, 4);
    assert.equal(getMeta().stats.takesCompleted, count);
    assert.deepEqual(getSave().run.ledger.takes.rooms, ['main_b3', 'the_tub', 'amplifications', 'soundnoisemusic', 'lux_nova']);
    emit(E.MANIFEST_SLOT_COMPLETED, { roomId: 'lux_nova' });
    assert.equal(getSave().run.ledger.takes.completed, 4);
    const summary = commitReturn('sacrifice', {}, 500);
    assert.ok(summary.unlockedAchievements.includes('ACH_UNBROKEN'));
    assert.equal(getMeta().stats.takesCompleted, count);
  });
});

test('first-pass certification needs three different first-attempt victories and zero actual defeats', async () => {
  for (const scenario of [
    { id: 'repeat', battles: [['a', 'win', 5], ['a', 'win', 5], ['a', 'win', 5]], expected: false },
    { id: 'abort-reopen', battles: [['a', 'win', 5], ['b', 'abort', 1], ['b', 'win', 1], ['c', 'win', 7]], expected: false },
    // Production deliverResult passes turns as legacyMetrics.attempts. These
    // five-to-twelve-turn wins are three first entries, not repeated attempts.
    { id: 'multi-turn-clear', battles: [['natatorium-approach', 'win', 5], ['recording-2', 'win', 12], ['pre-recording-4', 'win', 7]], expected: true },
    { id: 'defeat', battles: [['a', 'lose', 5], ['a', 'win', 1], ['b', 'win', 5], ['c', 'win', 7]], expected: false },
  ]) await scoped(async () => {
    for (const [id, result, turns] of scenario.battles) {
      emit(E.BATTLE_STARTED, { id }); emit(E.BATTLE_FINISHED, { id, result, attempts: turns, turns, firstPass: result === 'win' });
    }
    commitReturn('sacrifice', {}, 500);
    assert.equal(!!getMeta().achievements.ACH_FIRST_PASS, scenario.expected, scenario.id);
  }, { run: freshRunRecord({ id: scenario.id, now: 100 }) });
});

test('legacy victory rows without an encounter entry receipt do not invent first-attempt proof', async () => {
  await scoped(async () => {
    for (const id of ['natatorium-approach', 'recording-2', 'pre-recording-4']) emit(E.BATTLE_FINISHED, { id, result: 'win', attempts: 1 });
    commitReturn('sacrifice', {}, 500);
    assert.equal(!!getMeta().achievements.ACH_FIRST_PASS, false);
  });
});

test('completed disclosure and secret receipts accumulate across nights; discovery starts do not count', async () => {
  let meta = await scoped(async () => {
    emit(E.PLAYBACK_DISCOVERED, { id: 'the_tub' });
    assert.deepEqual(getMeta().completion.disclosures, {});
    assert.equal(!!getMeta().achievements.ACH_PLAYBACK, false);
    emit(E.DISCLOSURE_HEARD, { id: 'the_tub' });
    emit(E.SECRET_DISCOVERED, { id: 'off-air' });
    assert.equal(!!getMeta().achievements.ACH_HIDDEN_EXCHANGES, false);
    return structuredClone(getMeta());
  });
  await scoped(async () => {
    for (const id of ['amplifications', 'soundnoisemusic']) emit(E.DISCLOSURE_HEARD, { id });
    emit(E.SECRET_DISCOVERED, { id: 'call-yourself' });
    assert.ok(getMeta().achievements.ACH_ALL_PLAYBACK);
    assert.ok(getMeta().achievements.ACH_HIDDEN_EXCHANGES);
    assert.equal(Object.keys(getMeta().completion.disclosures).length, 3);
    assert.equal(Object.keys(getMeta().completion.secrets).length, 2);
  }, { meta, run: freshRunRecord({ id: 'second-night', now: 300 }) });
});

test('developer intervention is sticky through normalization and blocks profile facts, awards and ending certification', async () => {
  await scoped(async () => {
    const before = structuredClone(getMeta());
    assert.equal(markDeveloperRun('GOD_WARP'), true);
    assert.equal(markDeveloperRun('ANOTHER_WARP'), false);
    saveCommit({ run: normalizeRun(getSave().run) });
    assert.equal(getSave().run.integrity.achievements.eligible, false);
    assert.equal(getSave().run.integrity.achievements.reason, 'GOD_WARP');
    emit(E.DOCUMENT_READ, { id: COMPLETION_PAPERS[0] });
    emit(E.PROP_INSPECTED, { id: 'actual-prop' }); emit(E.TAKE_COMPLETED, { roomId: 'main_b3', elapsed: 45 });
    emit(E.DISCLOSURE_HEARD, { id: 'the_tub' }); emit(E.SECRET_DISCOVERED, { id: 'off-air' });
    emit(E.ITEM_OBTAINED, { id: 'pin.gallery' }); emit(E.HUSH_MET);
    assert.equal(unlockAchievement('ACH_COFFEE'), false);
    commitReturn('sacrifice', {}, 500);
    const after = getMeta();
    for (const key of ['knowledge', 'stats', 'completion', 'achievements', 'endingsSeen', 'challengeCompletions']) assert.deepEqual(after[key], before[key], key);
    assert.equal(after.hushMet, before.hushMet);
    assert.equal(getSave().run.integrity.deadAir.eligible, false);
  }, { run: freshRunRecord({ preset: 'dead-air', id: 'developer-review', now: 100 }) });
});

test('accessibility settings do not disqualify ordinary achievements', async () => {
  await scoped(async () => {
    saveCommit({ settings: { ...getSave().settings, reduceDread: true, fx: false, flash: 'off', shake: 'off', mic: 'off', volume: 0 } });
    assert.equal(getSave().run.integrity.achievements.eligible, true);
    emit(E.WORK_ORDER_ACCEPTED);
    assert.ok(getMeta().achievements.ACH_WORK_ORDER);
  });
});

test('actual New Game captures earned active-run collections before resetting the night', () => {
  // newGame is a root save operation, deliberately tested in a separate Node
  // process with memory-only browser storage. It never accesses this user's
  // local profile, native backend or the parent's transient state.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    globalThis.localStorage={map:new Map(),getItem(k){return this.map.get(k)??null},setItem(k,v){this.map.set(k,String(v))},removeItem(k){this.map.delete(k)}};
    globalThis.window=undefined;
    const S=await import('./src/game/save.js');
    const C=await import('./src/progression/completion.js');
    S.saveLoad();S.newGame({now:100});
    const oldId=S.getSave().run.id,run=structuredClone(S.getSave().run);run.ledger.takes.rooms=['main_b3'];
    S.saveCommit({run,flags:{...S.getSave().flags,'pin.gallery':true,'phone.van.offhook':true,
      'radio.hidden-channel.heard':true,'playback.disclosure.complete.the_tub':true},thoughts:{had:['playback-the_tub']}});
    let completion=C.reduceCompletion(null,{type:'secret.discovered',payload:{id:'off-air'},at:150,runId:oldId}).completion;
    completion=C.reduceCompletion(completion,{type:'disclosure.heard',payload:{id:'the_tub'},at:160,runId:oldId}).completion;
    S.metaCommit({completion});
    S.newGame({now:200});
    assert.ok(S.getMeta().completion.rooms.main_b3);assert.ok(S.getMeta().completion.leads['pin.gallery']);assert.ok(S.getMeta().completion.secrets['off-air']);
    assert.ok(S.getMeta().completion.disclosures.the_tub);
    assert.equal(S.getMeta().completion.secrets['call-yourself'],undefined,'old off-hook state must not invent a finished exchange');
    assert.notEqual(S.getSave().run.id,oldId);assert.deepEqual(S.getSave().run.ledger.takes.rooms,[]);assert.equal(!!S.getSave().flags['pin.gallery'],false);
    for(const flag of ['phone.van.offhook','radio.hidden-channel.heard','playback.disclosure.complete.the_tub'])assert.equal(S.getSave().flags[flag],undefined,'attempt and narrative flags reset on a new night');
    assert.equal(S.getSave().thoughts?.had?.includes('playback-the_tub')||false,false);
    assert.equal(S.getSave().run.integrity.achievements.eligible,true);
    S.saveLoad();
    assert.ok(S.getMeta().completion.secrets['off-air']);assert.ok(S.getMeta().completion.disclosures.the_tub);
    assert.equal(S.getMeta().completion.secrets['call-yourself'],undefined);
    assert.equal(S.getSave().flags['phone.van.offhook'],undefined);
  `], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
