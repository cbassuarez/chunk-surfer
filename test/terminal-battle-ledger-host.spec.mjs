import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { freshRunRecord } from '../src/progression/schema.js';
import { EVENT_TYPES } from '../src/progression/events.js';
import { reduceRunLedger } from '../src/progression/run-ledger.js';
import { evaluateAchievements } from '../src/progression/achievements.js';
import { beginSourceContactBattle, freshSourceReplayManifest } from '../src/game/source-replay-manifest.js';
import {
  CHUNK_SURF_PHASE, SOURCE_FINALE_ROUTE, SOURCE_FINALE_STAGE,
  normalizeChunkSurfState, reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import { cathedralBellCombatBattle, cathedralBellCombatDefinition } from '../src/data/combat-definitions.js';
import { createCombatState } from '../src/game/combat-state.js';
import { combatCheckpointSnapshot, cathedralRetryCheckpoint } from '../src/game/combat-checkpoint.js';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
function block(from, to) {
  const start = main.indexOf(from), end = main.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `missing production host ${from}`);
  return main.slice(start, end);
}
const tracker = block('function trackFinalBattleProgress(', '\nfunction tickSourceFinalEncounter(){');
const sourceHost = block('function tickSourceFinalEncounter(){', '\nlet stairAnomalyEnteredAt=');
const cathedralHost = block('function saveCathedralFight(', '\n// ── ST BRENDAN');
const cathedralLoss = block('function resolveCathedralLoss(){', '\nfunction openHorizonBustReturn(');
const clone = value => JSON.parse(JSON.stringify(value));

function progressHost(save = { run: freshRunRecord({ now: 1, id: 'ordinary-terminal-host' }) }) {
  const events = [], order = [];
  const emitProgress = (type, payload, source) => {
    const event = { type, payload, source, seq: save.run.ledger.seq + 1, at: events.length + 1 };
    save.run.ledger = reduceRunLedger(save.run.ledger, event);
    events.push(clone(event)); order.push(type);
  };
  return { save, events, order, emitProgress };
}

function threePriorVictories(host) {
  for (const id of ['natatorium-approach', 'recording-2', 'pre-recording-4']) {
    host.emitProgress(EVENT_TYPES.BATTLE_STARTED, { id }, 'test-prior-real-entry');
    host.emitProgress(EVENT_TYPES.BATTLE_FINISHED, { id, result: 'win', firstPass: true }, 'test-prior-real-result');
  }
  return host;
}

function sourceHarness({ chapter = 'I', host = progressHost(), continuation = null, attempt = 'first' } = {}) {
  const { save, events, order, emitProgress } = host;
  const captures = [];
  let now = 5000;
  let request = { adapter: 'combat-v1', chapter, battleAttemptId: `${chapter}:${attempt}`, victories: 0 };
  let manifest = freshSourceReplayManifest({ runId: save.run.id });
  if (continuation) manifest = { ...manifest, encounter: {
    ...manifest.encounter, battleAttemptId: request.battleAttemptId, continuation,
  } };
  const runtime = {
    state: () => ({ finalEncounter: { activeBattleId: request?.battleAttemptId || null } }),
    finalEncounterRequest: () => request,
    resolveFinalEncounter: value => {
      order.push('source-resolve');
      assert.equal(save.run.ledger.battles.results[`source-contact-${chapter}`].result, 'win');
      request = null;
      return { handled: true, completed: chapter === 'III' };
    },
    failFinalEncounter: () => {
      order.push('source-terminal-ending');
      assert.equal(save.run.ledger.battles.lost, 1, 'defeat must be present before an ending can commit');
      request = null;
    },
    cancelFinalEncounter: () => { order.push('source-cancel'); request = null; return { handled: true }; },
  };
  const capture = kind => (battle, options) => captures.push({ kind, battle, options });
  const context = {
    getSave: () => save, emitProgress, EVENT_TYPES,
    sourceContinuationScene: null, chunkSurfRuntime: runtime,
    sourceFinalCombatOpen: false, sourceFinalCombatRetryAt: 0,
    scenes: { blocksInput: () => false }, performance: { now: () => now },
    pressurePresentationSnapshot: () => ({ pressure: 0 }), PRES: { despawn() {} },
    beginSourceContactBattle,
    currentSourceReplayManifest: () => manifest,
    commitSourceReplayManifest: next => { manifest = next; },
    sourceCombatBattle: () => ({ combat: { id: 'source' } }), applyRigAdvantage: value => value,
    godSendBackPreviewAt: null, openBattle: capture('opening'), pushCombat: capture('resume'),
    saveCommit: patch => Object.assign(save, patch), px: 1, py: 2,
    SPEECH: { say() {} }, renderMove: {}, motionRig: {}, trail: [1],
  };
  vm.createContext(context);
  vm.runInContext(`${tracker}\n${sourceHost}`, context);
  return {
    ...host, context, runtime, captures,
    tick: () => vm.runInContext('tickSourceFinalEncounter()', context),
    retry: nextAttempt => {
      now += 1100;
      request = { adapter: 'combat-v1', chapter, battleAttemptId: `${chapter}:${nextAttempt}`, victories: 0 };
      context.sourceFinalCombatOpen = false;
    },
  };
}

test('actual CONTACT I/II/III hosts file three distinct stable victories and their metrics', () => {
  const host = progressHost();
  for (const chapter of ['I', 'II', 'III']) {
    const h = sourceHarness({ chapter, host }); h.tick();
    h.captures.at(-1).options.onWin({ attempts: 9, turns: 9, damageTaken: 3,
      perfectCounters: 2, torchSpent: .1, toolsUsed: { radio: 1 }, missedCounters: 0,
      source: { outcome: 'inversion', channels: { memory: true } } });
  }
  assert.deepEqual(host.events.filter(row => row.type === EVENT_TYPES.BATTLE_STARTED).map(row => row.payload.id),
    ['source-contact-I', 'source-contact-II', 'source-contact-III']);
  assert.equal(host.save.run.ledger.battles.started, 3);
  assert.equal(host.save.run.ledger.battles.won, 3);
  assert.equal(host.save.run.ledger.battles.results['source-contact-II'].started, 1);
  assert.equal(host.save.run.ledger.battles.results['source-contact-II'].turns, 9);
  assert.equal(host.save.run.ledger.battles.results['source-contact-II'].toolsUsed.radio, 1);
  assert.equal(host.save.run.ledger.battles.results['source-contact-II'].source.outcome, 'inversion');
  assert.equal(host.save.run.ledger.battles.results['source-contact-III'].active, false);
  const awards = evaluateAchievements({ event: { type: EVENT_TYPES.RUN_FINISHED }, profile: {},
    run: host.save.run, summary: { battles: { lost: 0 } } });
  assert.ok(awards.includes('ACH_FIRST_PASS'), 'actual first-attempt contacts qualify even when they take multiple turns');
});

test('actual CONTACT continuation reload resumes one entry, while abort/retry remains a second attempt', () => {
  const host = progressHost();
  const first = sourceHarness({ host }); first.tick();
  assert.equal(host.save.run.ledger.battles.started, 1);
  // A page reload restores the accepted ledger and opaque combat continuation.
  const resumed = sourceHarness({ host, continuation: { source: { armed: true, channels: {} } } });
  resumed.tick();
  assert.equal(resumed.captures.at(-1).kind, 'resume');
  assert.equal(host.save.run.ledger.battles.started, 1);
  resumed.captures.at(-1).options.onAbort();
  assert.equal(host.save.run.ledger.battles.results['source-contact-I'].active, false);
  resumed.retry('second'); resumed.tick();
  resumed.captures.at(-1).options.onWin({ turns: 4 });
  assert.equal(host.save.run.ledger.battles.results['source-contact-I'].started, 2);
  assert.equal(host.save.run.ledger.battles.lost, 0, 'aborting does not invent a defeat');
  assert.equal(host.save.run.ledger.battles.won, 1);
  assert.equal(host.events.filter(row => row.type === EVENT_TYPES.BATTLE_FINISHED).length, 2);
});

test('actual CONTACT reload before its first checkpoint does not increment the active attempt', () => {
  const host = progressHost();
  sourceHarness({ host }).tick();
  const reloaded = sourceHarness({ host }); reloaded.tick();
  assert.equal(host.save.run.ledger.battles.started, 1);
  reloaded.captures.at(-1).options.onLose({ turns: 5, damageTaken: 12 });
  assert.equal(host.save.run.ledger.battles.results['source-contact-I'].damageTaken, 12);
  assert.deepEqual(host.order.slice(-2), [EVENT_TYPES.BATTLE_FINISHED, 'source-terminal-ending']);
});

test('actual CONTACT stale-owner and repeated callbacks cannot double-file a result', () => {
  const h = sourceHarness(); h.tick();
  const options = h.captures.at(-1).options;
  h.context.chunkSurfRuntime = { state: () => ({}) };
  options.onWin({ turns: 1 });
  assert.equal(h.save.run.ledger.battles.won, 0);
  h.context.chunkSurfRuntime = h.runtime;
  options.onWin({ turns: 1 }); options.onWin({ turns: 1 }); options.onAbort();
  assert.equal(h.save.run.ledger.battles.won, 1);
  assert.equal(h.events.filter(row => row.type === EVENT_TYPES.BATTLE_FINISHED).length, 1);
});

test('a CONTACT defeat disqualifies three earlier first-attempt victories before terminal commitment', () => {
  const host = threePriorVictories(progressHost()), h = sourceHarness({ host });
  const finishing = () => evaluateAchievements({ event: { type: EVENT_TYPES.RUN_FINISHED }, profile: {},
    run: host.save.run, summary: { battles: host.save.run.ledger.battles } });
  assert.ok(finishing().includes('ACH_FIRST_PASS'));
  h.tick(); h.captures.at(-1).options.onLose({ turns: 5 });
  assert.equal(finishing().includes('ACH_FIRST_PASS'), false);
});

function checkpoint(phase) {
  return combatCheckpointSnapshot(createCombatState(cathedralBellCombatDefinition({ phase })), { phase: 'tool' });
}
function cathedralHarness({ host = progressHost(), phase = 1, savedCheckpoint = null, retry = false,
  continuation = null, defeats = 0 } = {}) {
  const { save, order, emitProgress } = host, captures = [], dialogues = [];
  save.chunkSurf = normalizeChunkSurfState({
    phase: CHUNK_SURF_PHASE.BELLS,
    finale: { route: SOURCE_FINALE_ROUTE.TOWER,
      stage: retry ? SOURCE_FINALE_STAGE.CATHEDRAL : SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT,
      bust: { defeats }, cathedral: { fight: { phase, checkpoint: savedCheckpoint, continuation, retry } } },
  });
  const capture = kind => (battle, options) => captures.push({ kind, battle, options });
  const context = {
    getSave: () => save, emitProgress, EVENT_TYPES,
    saveCommit: patch => Object.assign(save, patch), px: 1, py: 2,
    normalizeChunkSurfState, reduceChunkSurf, SOURCE_FINALE_ROUTE, SOURCE_FINALE_STAGE,
    cathedralFinalCombatOpen: false, cathedralRetryCheckpoint, cathedralBellCombatBattle,
    REC: { saveRecState: () => ({}), setComposure() {}, composureCeiling: () => 100,
      composure: () => 100, addBattery() {}, batteryLevel: () => .8 },
    openBattle: capture('opening'), pushCombat: capture('resume'),
    cathedralStaging() {}, stageCathedral() {},
    presentFinale: (lines, options) => { dialogues.push(options); order.push('phase-dialogue'); },
    startCathedralCarry: () => {
      order.push('cathedral-carry');
      assert.equal(save.run.ledger.battles.results['cathedral-phase-2'].result, 'win');
    },
    openHorizonBustReturn: () => order.push('bust-return'),
    playEnding: () => {
      order.push('cathedral-terminal-ending');
      assert.ok(save.run.ledger.battles.lost > 0, 'defeat must be filed before tower-lost can commit');
    },
    ENDING_ARRIVAL: { DEFEATED: 'defeated' },
  };
  vm.createContext(context);
  vm.runInContext(`${tracker}\n${cathedralLoss}\n${cathedralHost}`, context);
  return { ...host, context, captures, dialogues,
    open: () => vm.runInContext('openCathedralFirstPhase()', context) };
}

test('actual cathedral hosts file phase one before the handoff and phase two before carry', () => {
  const h = cathedralHarness();
  assert.equal(h.open(), true);
  h.captures.at(-1).options.onWin({ turns: 6, continuation: { charge: 3, damageTaken: 4 } });
  assert.equal(h.save.run.ledger.battles.results['cathedral-phase-1'].result, 'win');
  assert.equal(h.save.chunkSurf.finale.cathedral.fight.phase, 2);
  assert.equal(h.save.run.ledger.battles.started, 1);
  h.dialogues.at(-1).onDone();
  assert.equal(h.save.run.ledger.battles.started, 2);
  h.captures.at(-1).options.onWin({ turns: 5, damageTaken: 4 });
  assert.equal(h.save.run.ledger.battles.won, 2);
  assert.equal(h.save.run.ledger.battles.results['cathedral-phase-2'].turns, 5);
  assert.equal(h.save.chunkSurf.finale.stage, SOURCE_FINALE_STAGE.TOWER_ESCAPE);
  assert.deepEqual(h.order.slice(-2), [EVENT_TYPES.BATTLE_FINISHED, 'cathedral-carry']);
});

test('actual cathedral checkpoint resume, abort and reload count only real attempts in either phase', () => {
  for (const phase of [1, 2]) {
    const host = progressHost(), id = `cathedral-phase-${phase}`;
    host.emitProgress(EVENT_TYPES.BATTLE_STARTED, { id }, 'test-existing-attempt');
    const h = cathedralHarness({ host, phase, savedCheckpoint: checkpoint(phase) });
    h.open();
    assert.equal(host.save.run.ledger.battles.results[id].started, 1);
    h.captures.at(-1).options.onAbort();
    assert.equal(host.save.run.ledger.battles.results[id].active, false);
    h.open();
    assert.equal(host.save.run.ledger.battles.results[id].started, 2, 'abort then reentry is a real second attempt');
    const reloaded = cathedralHarness({ host, phase, savedCheckpoint: checkpoint(phase) });
    reloaded.open();
    assert.equal(host.save.run.ledger.battles.results[id].started, 2, 'reload does not turn the resumed retry into a third entry');
    const options = reloaded.captures.at(-1).options;
    options.onWin({ turns: 7 }); options.onWin({ turns: 7 }); options.onAbort();
    assert.equal(host.save.run.ledger.battles.won, 1);
  }
});

test('actual cathedral retry after a defeat adds one entry without replaying completed phase one', () => {
  const host = progressHost(), id = 'cathedral-phase-2';
  host.emitProgress(EVENT_TYPES.BATTLE_STARTED, { id }, 'test-existing-attempt');
  host.emitProgress(EVENT_TYPES.BATTLE_FINISHED, { id, result: 'lose' }, 'test-existing-defeat');
  const h = cathedralHarness({ host, phase: 2, savedCheckpoint: checkpoint(2), retry: true, defeats: 1 });
  h.open();
  assert.equal(h.save.run.ledger.battles.results[id].started, 2);
  assert.equal(h.save.chunkSurf.finale.cathedral.fight.retry, false);
  assert.equal(h.captures.at(-1).battle.combat.cathedralPhase, 2);
  assert.equal(h.save.run.ledger.battles.results['cathedral-phase-1'], undefined);
});

test('actual cathedral defeat is filed before bust return or terminal ending in either phase', () => {
  for (const phase of [1, 2]) for (const defeats of [0, 2]) {
    const host = threePriorVictories(progressHost());
    const h = cathedralHarness({ host, phase, defeats, savedCheckpoint: phase === 2 ? checkpoint(2) : null });
    h.open();
    h.captures.at(-1).options.onLose({ turns: 8, damageTaken: 30, toolsUsed: { torch: 2 } });
    assert.equal(h.save.run.ledger.battles.lost, 1);
    assert.equal(h.save.run.ledger.battles.results[`cathedral-phase-${phase}`].toolsUsed.torch, 2);
    assert.deepEqual(h.order.slice(-2), [EVENT_TYPES.BATTLE_FINISHED,
      defeats === 2 ? 'cathedral-terminal-ending' : 'bust-return']);
    const awards = evaluateAchievements({ event: { type: EVENT_TYPES.RUN_FINISHED }, profile: {},
      run: h.save.run, summary: { battles: h.save.run.ledger.battles } });
    assert.equal(awards.includes('ACH_FIRST_PASS'), false);
  }
});

test('an old cathedral callback cannot file a result or transition a replacement run', () => {
  const h = cathedralHarness(); h.open();
  const options = h.captures.at(-1).options;
  h.save.run = freshRunRecord({ now: 2, id: 'replacement-ordinary-run' });
  options.onWin({ turns: 1 }); options.onLose({ turns: 1 }); options.onAbort();
  assert.equal(h.save.run.ledger.battles.won, 0);
  assert.equal(h.save.run.ledger.battles.lost, 0);
  assert.equal(h.dialogues.length, 0);
  assert.equal(h.save.chunkSurf.finale.stage, SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT);
});

test('attempt marker survives normalization and retains the last result used by injury policy', () => {
  const h = progressHost(), id = 'recording-2';
  h.emitProgress(EVENT_TYPES.BATTLE_STARTED, { id }, 'test');
  h.emitProgress(EVENT_TYPES.BATTLE_FINISHED, { id, result: 'lose' }, 'test');
  h.emitProgress(EVENT_TYPES.BATTLE_STARTED, { id }, 'test');
  assert.equal(h.save.run.ledger.battles.results[id].active, true);
  assert.equal(h.save.run.ledger.battles.results[id].result, 'lose');
  assert.equal(h.save.run.ledger.battles.results[id].started, 2);
  assert.equal(h.save.run.ledger.battles.lost, 1);
});
