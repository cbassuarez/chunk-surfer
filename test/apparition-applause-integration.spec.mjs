import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { APPARITION_APPLAUSE, createApparitionApplauseDirector } from '../src/game/apparition-applause.js';
import { APPARITION_APPLAUSE_MIX, makeApparitionApplauseScore } from '../src/data/apparition-applause-score.js';
import { createSelfAudioMask } from '../src/audio/self-audio-mask.js';
import { createHallChandelierRuntime } from '../src/game/hall-chandelier-runtime.js';
import { eulaAccepted, eulaVersion } from '../src/game/eula.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function source(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} remains a production integration function`);
  const end = main.indexOf('\n}', start);
  assert.ok(end > start);
  return `${main.slice(Math.max(0, start - 6), start).endsWith('async ') ? 'async ' : ''}${main.slice(start, end + 2)}`;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
function harness(condition = 'treatment') {
  const calls = { played: [], reserves: [], saved: [], cancelled: [], updates: [], warps: [], pauses: [], visualResets: [], prepared: [], acceptanceReads: 0 };
  const storage = new Map();
  const context = {
    APPARITION_APPLAUSE, APPARITION_APPLAUSE_MIX, makeApparitionApplauseScore, crypto: webcrypto, TextEncoder, Uint8Array,
    CELL: .5, D: (value) => value, ZONE: { hall: 5 }, now: 0, pressure: 0, accepted: true, externalReady: true,
    worldYaw: Math.atan2(-38, -11), motion: { moveX: 0, moveY: 0, turnX: 0 }, zone: 5,
    storyMode: true, inRogue: true, paused: false, activeBattleId: null, activeEndingCutscene: null,
    save: { run: { id: 'run-1', difficulty: 'contract' }, settings: { flash: 'full', reduceDread: false, volume: 1, sfx: 1, mic: 'off' },
      power: { schema: 2, live: [] }, flags: {} },
    recorder: { phase: 'idle', light: false, battery: 1, injuries: 0, takes: [], sheets: [], hidden: false },
    doors: [{ id: 'hall-door', state: 'closed', openFraction: 0, wedge: false, closerArmed: false }],
    presence: { active: false, position: { x: 0, y: 0 }, hasTarget: false, awareness: 0, motionMode: 'idle', behaviorMode: 'stand', tableau: false },
    px: 100, py: 20,
    apparitionApplause: createApparitionApplauseDirector({ runId: 'run-1', condition }),
    apparitionApplauseRun: 'run-1', apparitionApplauseStudy: null, apparitionApplauseLastTraceAt: 0,
    apparitionApplauseLastSeenAt: -Infinity, apparitionApplauseOpportunityUntil: 0,
    apparitionApplauseOpportunityUsed: false, apparitionApplauseTrace: [],
    lastEmergencyShadowFrame: null, chunkSurfRuntime: null, roofCitySeatScene: null,
    usingPlan: () => true, usingSpecialSpace: () => false,
    sourceShoreOutside: () => false, pointInSight: () => true, sightCrossesClosedDoor: () => false,
    acousticSpatialAt: (x, y) => ({ position: { x, y }, roomId: 'hall' }),
    prepareApparitionApplause: async () => { calls.prepared.push('applause'); return { ready: true }; }, ensureCtx() {}, playStab() {},
    APPLAUSE_ASSETS: {}, EULA_TEXT: {},
  };
  context.performance = { now: () => context.now };
  context.selfAudioMask = createSelfAudioMask({ latencyMs: 0 });
  context.document = { hidden: false, hasFocus: () => true };
  context.scenes = { blocksInput: () => false };
  context.REC = { isRecording: () => context.recorder.phase === 'recording', isListening: () => context.recorder.phase === 'listening',
    recState: () => context.recorder, composure: () => 6 };
  context.PB = { isPlaying: () => false };
  context.PRES = { publicSnapshot: () => context.presence };
  context.R3 = { r3dProjectWorld: () => ({ visible: true, x: .5, y: .5 }), r3dWorldYaw: () => context.worldYaw,
    r3dLookAngles: () => ({ yaw: 0, pitch: 0, facing: 0 }) };
  context.FP = { logicalAtPhysical: (x, y) => ({ x, y }), logicalToPhysical: (x, y) => ({ x, z: y, y: 0, renderGroup: 'hall' }),
    doorState: () => context.doors, zoneAt: () => context.zone };
  context.motionInput = { snapshot: () => context.motion, lastPointerDeltaAt: -Infinity, lastPointerDeltaSource: { dx: 0, dy: 0 } };
  context.getSave = () => context.save;
  context.getMeta = () => ({ accepted: context.accepted });
  context.eulaAccepted = (meta) => { calls.acceptanceReads++; return meta.accepted; };
  context.flagTest = (id) => !!context.save.flags[id];
  context.flagSet = (id, value) => { context.save.flags[id] = value; };
  context.saveCommit = (value) => calls.saved.push(value);
  context.hushPressureAt = () => context.pressure;
  context.STAB = { STABS: { quietMinutes: 4 }, poolSize: () => 1,
    externalScareBudgetReady: () => context.externalReady,
    reserveExternalScare: (options) => {
      if (!context.externalReady) return false;
      calls.reserves.push(options); context.externalReady = false; return true;
    },
    updateStabs: (dt, pressure) => calls.updates.push({ dt, pressure }),
    stabsInit: ({ onStab }) => { assert.equal(onStab, context.playStab); }, enteredRoom() {},
  };
  context.hallChandelierRuntime = createHallChandelierRuntime({
    readContext: () => ({
      runId: context.save.run.id, consumedCount: context.save.flags['hall.chandelier.flicker.count'] || 0,
      eligible: context.storyMode && context.zone === context.ZONE.hall, paused: context.paused,
      recording: context.REC.isRecording(), listening: context.REC.isListening(),
      effectsMode: context.save.settings.flash, reduceDread: context.save.settings.reduceDread,
      applausePriority: !!context.apparitionApplause.inspect().pending
        || !!context.apparitionApplauseAudio?.inspect().activeVoices || context.now < context.apparitionApplauseOpportunityUntil,
    }),
    budgetReady: () => context.STAB.externalScareBudgetReady(),
    reserveBudget: () => context.STAB.reserveExternalScare(),
    persistConsumed: count => { context.flagSet('hall.chandelier.flicker.count', count); return context.save.flags['hall.chandelier.flicker.count'] === count; },
  });
  context.apparitionApplauseAudio = { inspect: () => ({ ready: true, activeVoices: 1 }),
    updateListener: (value) => { calls.listener = value; },
    play: (event, options) => { calls.played.push({ event, options }); return true; },
    cancel: (reason) => calls.cancelled.push(reason) };
  context.actx = { state: 'running', currentTime: 4 };
  context.godWarpToHook = async (id) => { calls.warps.push(id); return true; };
  context.setGameplayPaused = (value) => { context.paused = value; calls.pauses.push(value); };
  context.apparitionDirector = { reset: (value) => calls.visualResets.push(value) };
  context.sessionStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  createContext(context);
  for (const name of ['cancelApparitionApplause', 'apparitionApplauseBlocked', 'apparitionApplausePointVisible', 'observedApparitionStation',
    'syncApparitionApplause', 'tickStabs', 'apparitionApplauseStudyBaseline', 'startApparitionApplauseStudy']) {
    runInContext(source(name), context);
  }
  return { context, calls, storage };
}

const PERIOD = 2422, HOLD = 1750, ARM = PERIOD * 3, RESPONSE = ARM + 160, DUE = RESPONSE + 65;
const lightId = 'hall-stage-door-maintained';
function frame(now, cause = null) {
  return { lightId, lightingState: now % PERIOD < HOLD ? 'emergency-on' : 'emergency-off',
    composition: { id: APPARITION_APPLAUSE.compositionId, stageYaw: .8 },
    director: { stageKey: `hall:hall:${lightId}`, card: cause ? { kind: cause, index: 1 } : null },
    contract: { effectsMode: 'full', pulseIndex: Math.floor(now / PERIOD) },
    instances: [0, 1, 2].filter((index) => cause !== 'absence' || index !== 1).map((index) => ({
      apparitionIndex: index, x: 10 + index * 2, y: -.5, z: 30 + index, scaleY: 1, poseId: 'neutral', shadowOnly: false,
    })) };
}
function expose(context, { response = true, changeFrame, beforeArm } = {}) {
  const physical = { x: 100, z: 40, y: -.5, renderGroup: 'hall' };
  for (let now = 0; now < ARM; now += 100) { context.now = now; context.syncApparitionApplause(frame(now), physical, now); }
  beforeArm?.();
  context.now = ARM;
  context.syncApparitionApplause(frame(ARM, 'absence'), physical, ARM);
  if(response){context.worldYaw += Math.PI / 2;context.motion.turnX = 1;}
  for(const now of [ARM + 100, RESPONSE, DUE]) {
    const value = frame(now, 'absence'); changeFrame?.(value);
    context.now = now;
    context.syncApparitionApplause(value, physical, now);
  }
}

test('main only witnesses individual bodies inside the rendered image and unoccluded plan ray', () => {
  const { context } = harness();
  const value = frame(0), physical = { renderGroup: 'hall' };
  context.R3.r3dProjectWorld = (point) => ({ visible: point.x !== 12, x: point.x === 14 ? .02 : .5, y: .5 });
  assert.deepEqual(plain(context.observedApparitionStation(value, physical)), [0]);
  context.R3.r3dProjectWorld = () => ({ visible: true, x: .5, y: .5 });
  context.pointInSight = (x) => x !== 24;
  context.sightCrossesClosedDoor = (x) => x === 28;
  assert.deepEqual(plain(context.observedApparitionStation(value, physical)), [0]);
  value.instances[0].shadowOnly = true;
  assert.deepEqual(plain(context.observedApparitionStation(value, physical)), []);
});

test('the real main observer earns one cue, reserves once, maps world sound separately from logical acoustics and persists consumption', () => {
  for (const condition of ['silent', 'ordinary', 'treatment']) {
    const { context, calls } = harness(condition);
    expose(context);
    assert.equal(calls.reserves.length, 1);
    assert.equal(calls.played.length, 1);
    const { event, options } = calls.played[0];
    assert.equal(options.condition, condition);
    assert.equal(options.leadTime, .065, 'the existing audio engine owns the intended65ms response delay');
    assert.deepEqual(plain(event.origin), { x: 12, y: -.5, z: 31 });
    assert.deepEqual(plain(event.spatial.position), { x: 24, y: 62 });
    assert.deepEqual(plain(options.listener), { x: 50, y: 20, yaw: Math.atan2(-38, -11) + Math.PI / 2 });
    assert.equal(event.reaction.kind, 'look-away');
    if (condition === 'silent') assert.equal(options.score.events.length, 0);
    else assert.deepEqual(plain(options.score.events[0].position), { x: 12, y: 31 });
    assert.equal(context.save.flags['hall.apparition-applause.heard'], true);
    assert.equal(calls.saved.length, 1);
    context.apparitionApplause.reset({ runId: 'run-1', condition });
    context.externalReady = true; context.worldYaw = Math.atan2(-38, -11); context.motion.turnX = 0;
    expose(context);
    assert.equal(calls.reserves.length, 1, 'saved consumption survives a fresh director');
  }
});

test('main hands the observed retreat to audio immediately and a212ms following visual frame cannot revoke it', () => {
  const { context, calls } = harness();
  expose(context, { response: false });
  const sync = (now, x) => { context.now = now; context.syncApparitionApplause(frame(now, 'absence'),
    { x, z: 40, y: -.5, renderGroup: 'hall' }, now); };
  context.motion.moveY = 1;
  sync(DUE + 100, 101);
  assert.equal(calls.played.length, 0, 'the first half-metre step is below the retreat threshold');
  const responseAt = DUE + 190;
  sync(responseAt, 102);
  assert.equal(calls.played.length, 1); assert.equal(calls.reserves.length, 1);
  assert.equal(calls.played[0].event.reaction.kind, 'retreat');
  assert.equal(calls.played[0].event.emittedAtMs, responseAt);
  assert.equal(calls.played[0].event.dueAtMs, responseAt + 65);
  assert.equal(calls.played[0].options.leadTime, .065);
  sync(responseAt + 212, 102);
  assert.equal(calls.played.length, 1); assert.equal(calls.cancelled.length, 0);
  const receipt = context.apparitionApplauseTrace.find(entry => entry.type === 'cue');
  assert.equal(receipt.handoffAtMs, responseAt); assert.equal(receipt.leadTime, .065);
  assert.equal(typeof context.apparitionApplauseTrace.at(-1).lastCancellation, 'string');
});

test('production handoff keeps the120ms late limit and rechecks the shared reservation at the actual handoff clock', () => {
  for (const delay of [185, 186]) {
    const { context, calls } = harness();
    context.performance.now = () => context.now + delay;
    expose(context);
    assert.equal(context.apparitionApplause.inspect().emitted, 1);
    if(delay === 185){
      assert.equal(calls.played.length, 1); assert.equal(calls.played[0].options.leadTime, 0);
      assert.equal(calls.reserves[0].nowMs, RESPONSE + delay);
    }else{
      assert.equal(calls.played.length, 0); assert.equal(calls.reserves.length, 0);
      const rejected = context.apparitionApplauseTrace.find(entry => entry.type === 'handoff-rejected');
      assert.equal(rejected.reason, 'late'); assert.equal(rejected.handoffAtMs - rejected.event.dueAtMs, 121);
      const rejectedFrame = context.apparitionApplauseTrace.find(entry => entry.type === 'frame' && entry.nowMs === RESPONSE);
      assert.equal(rejectedFrame.lastCancellation, 'handoff-late');
    }
  }
  const { context, calls } = harness(); context.STAB.reserveExternalScare = () => false;
  expose(context); assert.equal(calls.played.length, 0); assert.equal(calls.saved.length, 0);
  assert.equal(context.apparitionApplause.inspect().emitted, 1, 'a declined atomic reservation cannot queue the answer for later');
});

test('recording, listening, modal, battle, background, reduced effects and pressure cannot release a main cue', () => {
  for (const block of [
    (c) => { c.recorder.phase = 'recording'; }, (c) => { c.recorder.phase = 'listening'; },
    (c) => { c.scenes.blocksInput = () => true; }, (c) => { c.activeBattleId = 'hall'; },
    (c) => { c.document.hidden = true; }, (c) => { c.document.hasFocus = () => false; },
    (c) => { c.save.settings.flash = 'reduced'; }, (c) => { c.save.settings.reduceDread = true; },
    (c) => { c.pressure = .3; },
  ]) {
    const { context, calls } = harness(); block(context); expose(context);
    assert.equal(calls.played.length, 0); assert.equal(calls.reserves.length, 0);
  }
});

test('actual main stays silent without voluntary action, including scripted or stale-input camera turns', () => {
  for (const setup of [
    () => ({ response: false }),
    (c) => { c.motionInput.snapshot = () => ({ moveX: 0, moveY: 0, turnX: 0 }); return {}; },
    (c) => { c.motionInput.snapshot = () => ({ moveX: 0, moveY: 0, turnX: 0 });
      c.motionInput.lastPointerDeltaAt = ARM - 300; c.motionInput.lastPointerDeltaSource.dx = 4; return {}; },
  ]) {
    const { context, calls } = harness(); expose(context, setup(context));
    assert.equal(calls.reserves.length, 0); assert.equal(calls.played.length, 0);
  }
  const { context, calls } = harness();
  context.motionInput.snapshot = () => ({ moveX: 0, moveY: 0, turnX: 0 });
  context.motionInput.lastPointerDeltaAt = ARM + 100; context.motionInput.lastPointerDeltaSource.dx = 4;
  expose(context);
  assert.equal(calls.played.length, 1, 'recent actual pointer movement may supply the same voluntary response as a stick');
});

test('main must see the missing old station on the changed red beat, not merely its neighbours', () => {
  const { context, calls } = harness();
  expose(context, { beforeArm: () => {
    context.R3.r3dProjectWorld = (point) => ({ visible: point.x !== 12, x: .5, y: .5 });
  } });
  assert.equal(calls.played.length, 0); assert.equal(context.apparitionApplause.inspect().pending, null);
});

test('main keeps a pending answer and audible tail inside the Hall after a hero lamp switch; room exit cancels', () => {
  const { context, calls } = harness();
  expose(context, { changeFrame: (value) => {
    value.composition.id = 'procedural'; value.lightId = 'hall-galleria-east-foot';
    value.director.stageKey = 'hall:hall:other'; value.instances = [];
  } });
  assert.equal(calls.played.length, 1);
  assert.equal(calls.played[0].event.lightId, lightId);
  assert.deepEqual(plain(calls.played[0].event.origin), { x: 12, y: -.5, z: 31 });
  assert.equal(calls.cancelled.length, 0, 'a different selected lamp cannot cancel the short phrase');
  context.syncApparitionApplause(null, { x: 100, z: 40, y: -.5, renderGroup: 'hall' }, DUE + 20);
  assert.equal(calls.cancelled.length, 0, 'the Hall tail may continue without a selected body frame');
  context.zone = 6;
  context.syncApparitionApplause(null, { x: 100, z: 40, y: -.5, renderGroup: 'hall' }, DUE + 30);
  assert.deepEqual(calls.cancelled, ['other-encounter']);
});

test('Hall arbitration yields one bounded opportunity and never repeatedly postpones ordinary stabs', () => {
  const { context, calls } = harness();
  context.apparitionApplause.inspect = () => ({ emitted: 0, observedPulses: 3, observedLitMs: 3500 });
  context.lastEmergencyShadowFrame = frame(0);
  context.now = 240000; context.apparitionApplauseLastSeenAt = context.now;
  context.tickStabs(.016);
  assert.equal(calls.updates.length, 0);
  assert.equal(context.apparitionApplauseOpportunityUntil, 330000);
  context.now = 329999; context.apparitionApplauseLastSeenAt = context.now;
  context.tickStabs(.016); assert.equal(calls.updates.length, 0);
  context.now = 330000; context.apparitionApplauseLastSeenAt = context.now;
  context.tickStabs(.016); assert.equal(calls.updates.length, 1);
  context.now += 1000; context.apparitionApplauseLastSeenAt = context.now;
  context.tickStabs(.016); assert.equal(calls.updates.length, 2, 'no second 90-second extension');
  context.save.flags['hall.apparition-applause.heard'] = true;
  context.tickStabs(.016); assert.equal(calls.updates.length, 3);
});

test('the actual stab boundary advances a silent fixture without a sample pool and cancels it before a recording hold returns', () => {
  const { context, calls } = harness();
  context.apparitionApplauseAudio.inspect = () => ({ ready: true, activeVoices: 0 });
  context.STAB.poolSize = () => 0;
  context.hallChandelierRuntime.configureReview({ firstQuietSeconds: [.01, .01] });
  context.tickStabs(.02); context.tickStabs(.2);
  assert.ok(context.hallChandelierRuntime.view().active && context.hallChandelierRuntime.view().power > 0);
  assert.equal(context.save.flags['hall.chandelier.flicker.count'], 1);
  assert.equal(calls.reserves.length, 1, 'the fixture spends the existing shared scare budget once');
  assert.equal(calls.updates.length, 0, 'no generic sample update is needed to host the silent episode');
  context.recorder.phase = 'recording';
  context.tickStabs(.016);
  assert.equal(context.hallChandelierRuntime.view().active, false);
  assert.equal(context.hallChandelierRuntime.view().reason, 'recorder');
  assert.equal(calls.reserves.length, 1, 'the early recording return cannot reserve a second episode');
});

test('explicit cancellation releases audio and the priority window while retaining the consumed identity', () => {
  const { context, calls } = harness();
  const reference = (id, sourceId) => ({ id, emittedAt: 1000,
    source: { kind: 'environment', id: sourceId }, acoustic: { durationMs: 8000, levelDb: -24 },
    semantics: { audibleInWorld: true } });
  context.selfAudioMask.observe(reference('applause', 'hall-apparition-audience'), 1000);
  context.selfAudioMask.observe(reference('other', 'hall-apparition-audience-extra'), 1000);
  assert.equal(context.selfAudioMask.sample(1100).count, 2);
  context.apparitionApplauseOpportunityUntil = 99999;
  context.cancelApparitionApplause('paused');
  assert.equal(context.apparitionApplauseOpportunityUntil, 0);
  assert.equal(context.apparitionApplause.inspect().lastCancellation, 'paused');
  assert.deepEqual(calls.cancelled, ['paused']);
  assert.equal(context.selfAudioMask.sample(1100).count, 1, 'production cancellation removes only the cancelled source envelope');
  context.apparitionApplauseAudio.inspect = () => ({ activeVoices: 0 });
  context.selfAudioMask.observe(reference('already-cleared-graph', 'hall-apparition-audience'), 1000);
  assert.equal(context.selfAudioMask.sample(1100).count, 2);
  context.cancelApparitionApplause('already-quiet');
  assert.deepEqual(calls.cancelled, ['paused'], 'an empty graph needs no second audio cancellation');
  assert.equal(context.selfAudioMask.sample(1100).count, 1, 'an internally cleared graph still loses only its exact-source envelope');
});

test('standard apparition study setup does not require the retired no-SD startup acceptance', async () => {
  const { context, calls } = harness(); context.accepted = false;
  const result = await context.startApparitionApplauseStudy({ condition: 'ordinary' });
  assert.equal(result.ready, true);
  assert.equal(calls.acceptanceReads, 0, 'study setup does not read or fabricate licence acceptance');
  assert.equal(context.accepted, false);
  assert.deepEqual(calls.warps, ['concert-hall']);
  assert.deepEqual(calls.prepared, ['applause']);
  assert.deepEqual(calls.pauses, [true, false]);
  assert.equal(calls.visualResets.length, 1);
});

test('invalid apparition study conditions are rejected before any warp, sound preparation or exposure', async () => {
  const { context, calls } = harness(); context.accepted = false;
  await assert.rejects(context.startApparitionApplauseStudy({ condition: 'not-a-study-condition' }), /Unknown study condition/);
  assert.equal(calls.warps.length, 0); assert.equal(calls.visualResets.length, 0);
  assert.equal(calls.pauses.length, 0); assert.equal(calls.prepared.length, 0);
});

test('the explicitly used developer lens retains its separate actual licence-version gate', () => {
  const agreement = readFileSync(new URL('../LEGAL/EULA.md', import.meta.url), 'utf8');
  for (const [meta, blocked] of [[{}, true], [{ eulaAccepted: '1999-01-01' }, true], [{ eulaAccepted: eulaVersion(agreement) }, false]]) {
    const before = plain(meta), context = { eulaAccepted, getMeta: () => meta, EULA_TEXT: agreement };
    createContext(context);
    runInContext(source('lensEulaAccepted'), context);
    runInContext(source('lensStartBlockedByEula'), context);
    assert.equal(context.lensStartBlockedByEula(), blocked);
    assert.deepEqual(meta, before, 'checking optional model consent cannot alter the profile');
  }
});

test('baseline excludes arm/identity/time and private mic labels while rejecting changed context without modifying the save', async () => {
  const { context, storage } = harness();
  context.save.settings.micInput = { deviceId: 'private-device', lastDeviceLabel: 'private label' };
  context.save.settings.psychProfile = { private: true };
  const original = plain(context.save);
  const first = await context.apparitionApplauseStudyBaseline();
  assert.match(first.baselineHash, /^[a-f0-9]{64}$/);
  assert.equal(storage.size, 1);
  context.now = 900000; context.save.run.id = 'different-run';
  context.apparitionApplauseStudy = { condition: 'ordinary', participantId: 'different-person' };
  const second = await context.apparitionApplauseStudyBaseline();
  assert.equal(first.baselineHash, second.baselineHash);
  const snapshotText = JSON.stringify(first.baseline);
  assert.doesNotMatch(snapshotText, /private-device|private label|psychProfile|different-person/);
  context.save.run.id = original.run.id;
  assert.deepEqual(plain(context.save), original, 'capture is read-only');
  context.save.power.live.push('sp03');
  await assert.rejects(context.apparitionApplauseStudyBaseline(), /differs/);
  context.save.power.live.pop(); context.doors[0].state = 'open';
  await assert.rejects(context.apparitionApplauseStudyBaseline(), /differs/);
  context.doors[0].state = 'closed'; context.pressure = .2;
  await assert.rejects(context.apparitionApplauseStudyBaseline(), /differs/);
});

test('the study baseline isolates the audio-clock trigger from the superseded frame-clock fixture', async () => {
  const { context, storage } = harness();
  storage.set('chunk-surfer:hall-study-baseline:v3', JSON.stringify({ baselineHash: 'frame-clock-fixture' }));
  const fixture = await context.apparitionApplauseStudyBaseline();
  assert.equal(fixture.baseline.schema, 3);
  assert.equal(fixture.baseline.triggerSchedulingVersion, 'audio-clock-v1');
  assert.ok(storage.has('chunk-surfer:hall-study-baseline:v3:audio-clock-v1'));
  assert.equal(storage.size, 2, 'the old local baseline is preserved, never mistaken for the new scheduling fixture');
});

test('study setup pauses before fixture work, resets only the visual seed, retains four-minute budget and fails mismatches before unpausing', async () => {
  const { context, calls } = harness();
  const result = await context.startApparitionApplauseStudy({ condition: 'silent', seed: 'same-seed', participantId: 'anonymous' });
  assert.equal(result.quietPeriodMs, 240000);
  assert.match(result.baselineHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(calls.warps, ['concert-hall']);
  assert.deepEqual(calls.pauses, [true, false]);
  assert.deepEqual(plain(calls.visualResets), [{ seed: 'same-seed' }]);
  context.apparitionApplauseStudy.finished = true;
  await assert.rejects(context.startApparitionApplauseStudy({ expectedBaselineHash: 'mismatch' }), /prepared game baseline/);
  assert.equal(context.paused, true, 'a failed comparison never resumes the encounter');
  assert.equal(calls.visualResets.length, 1);
});

test('audio integration cannot supply a pose, camera, light, forced card or gameplay noise', () => {
  const integration = source('syncApparitionApplause');
  assert.doesNotMatch(integration, /forceNext|r3dSetLook|r3dSetFacing|r3dSetLocalLights|setPoses|REC\.(?:emitNoise|addNoise)|bumpFear|CR\.fx/);
  assert.match(main, /r3dSetEmergencyShadows\?\.\(shadow\?shadow\.instances:\[\]\);\s*syncApparitionApplause\(shadow,physical,timeSec\*1000\)/);
  for (const reason of ['paused', 'recorder-control', 'recorder', 'battle', 'focus-loss', 'hidden', 'pagehide']) {
    assert.ok(main.includes(`cancelApparitionApplause('${reason}')`), `${reason} cancels scheduled voices`);
  }
});
