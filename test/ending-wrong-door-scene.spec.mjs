import test from 'node:test';
import assert from 'node:assert/strict';
import { createEndingWrongDoorScene } from '../src/game/ending-wrong-door-scene.js';
import {
  freshEndingWrongDoorDemolition as fresh, stepEndingWrongDoorDemolition as step,
} from '../src/game/ending-wrong-door.js';
import { SOURCE_EARTHFALL as C } from '../src/data/source-earthfall.js';
import { freshSourceEarthfall } from '../src/game/source-earthfall.js';
import { freshSave, getSave, saveCommit, withTransientGameState } from '../src/game/save.js';
import { freshRunRecord } from '../src/progression/schema.js';

const copy = value => JSON.parse(JSON.stringify(value));
const runId = 'wrong-door-scene-test';
const initial = () => fresh({ runId, returnPose: { x: 254, y: 367, yaw: .2, pitch: -.1 } });
const flush = async () => { for (let n = 0; n < 5; n++) await Promise.resolve(); };
function advance(state, seconds, input = {}) {
  for (let time = 0; time + 1e-9 < seconds;) {
    const dt = Math.min(1 / 60, seconds - time);
    state = step(state, { ...input, dt }).state; time += dt;
  }
  return state;
}
function completed() {
  let state = advance(initial(), .25, { forward: 1 });
  state = advance(state, 10);
  assert.equal(state.physical.phase, 'landed');
  state = advance(state, (C.passage.exitZ + 1.4 - state.physical.z) / -C.walkSpeed, { forward: 1 });
  state = step(state, { interact: true }).state;
  state = advance(state, C.door.openSeconds);
  state = advance(state, .6, { forward: 1 });
  assert.equal(state.status, 'ready-for-source-IV');
  return state;
}
function harness(options = {}) {
  const checkpoints = [], errors = [], trace = [], returns = [], completes = [], exits = [], draws = [];
  const presentation = { protected: false };
  let renderReady = true, initCount = 0, disposals = 0, clears = 0;
  let audioStops = 0, audioReadyCount = 0, sounding = false;
  const updates = [];
  const audio = {
    ready() { audioReadyCount++; return options.audioReady?.() ?? true; },
    stop() { audioStops++; sounding = false; },
    update(frame, state) {
      updates.push({ frame: copy(frame), options: copy(state) });
      // Match the production audio's protected/focus gate without an AudioContext.
      sounding = frame.active && !state.protected && !state.suspended;
    },
  };
  const renderer = {
    initialize() { initCount++; return options.initialize?.() ?? true; },
    ready: () => renderReady,
    render(physical, state) { draws.push({ physical: copy(physical), presentation: copy(state) }); return options.render?.() ?? true; },
    clear() { clears++; },
    dispose() { disposals++; },
  };
  const scene = createEndingWrongDoorScene({
    checkpoint: options.checkpoint || initial(), renderer, audio, presentation: () => presentation,
    onCheckpoint(value, metadata) { checkpoints.push({ value: copy(value), metadata: copy(metadata) }); options.onCheckpoint?.(value, metadata); },
    onReturn(value) { returns.push(copy(value)); return options.onReturn?.(value) ?? true; },
    onComplete(value) { completes.push(copy(value)); return options.onComplete?.(value) ?? true; },
    onExit(value) { exits.push(copy(value)); },
    onError(error) { errors.push(String(error?.message || error)); }, onTrace: value => trace.push(copy(value)),
  });
  return { scene, checkpoints, errors, trace, returns, completes, exits, draws, updates, presentation,
    ready: value => { renderReady = value; },
    stats: () => ({ initCount, disposals, clears, audioStops, audioReadyCount, sounding }),
  };
}

test('unavailable assets block body, look and sound; initialization occurs once and does not retain early movement', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; }), h = harness({ initialize: () => pending });
  const before = h.scene.serialize(), loading = h.scene.initialize();
  assert.equal(h.scene.initialize(), loading);
  h.scene.key({ key: 'w' }); h.scene.update(9); h.scene.setLook({ yaw: 2 });
  assert.deepEqual(h.scene.serialize(), before); assert.deepEqual(h.updates, []);
  release(true); assert.equal(await loading, true);
  h.scene.update(.1); assert.equal(h.scene.serialize().physical.z, before.physical.z);
  assert.equal(h.stats().initCount, 1); assert.equal(h.stats().audioReadyCount, 1);
  h.scene.key({ key: 'w' }); h.ready(false); h.scene.update(.2);
  assert.equal(h.stats().sounding, false);
  const stopped = h.scene.serialize(); h.ready(true); h.scene.update(.1);
  assert.equal(h.scene.serialize().physical.z, stopped.physical.z, 'a renderer outage clears previously held W');
  assert.equal(h.completes.length, 0); assert.equal(h.returns.length, 0);
  h.scene.exit();
});

test('pause and Escape clear movement and drag, cut sound, and require fresh input after resuming', async () => {
  const h = harness(); await h.scene.initialize();
  h.scene.key({ key: 'w' }); h.scene.update(.1);
  assert.equal(h.stats().sounding, true);
  h.scene.pointer({ type: 'pointerdown', button: 2, clientX: 10, clientY: 10 });
  assert.equal(h.scene.pause(), true);
  const frozen = h.scene.serialize(); assert.equal(h.stats().sounding, false);
  h.scene.key({ key: 'd' }); h.scene.update(10); h.scene.setLook({ yaw: 2 });
  h.scene.pointer({ type: 'pointermove', clientX: 100, clientY: 60 });
  assert.deepEqual(h.scene.serialize(), frozen);
  h.scene.resume(); h.scene.update(.1);
  assert.equal(h.scene.serialize().physical.x, frozen.physical.x);
  assert.equal(h.scene.serialize().physical.z, frozen.physical.z);
  assert.equal(h.scene.serialize().physical.yaw, frozen.physical.yaw);
  h.scene.key({ key: 'w' }); assert.equal(h.scene.key({ key: 'Escape' }), false);
  const escaped = h.scene.serialize(); h.scene.update(.1);
  assert.equal(h.scene.serialize().physical.z, escaped.physical.z);
  assert.ok(h.checkpoints.some(save => save.metadata.reason === 'pause-request'));
  h.scene.exit();
});

test('recording, focus and presentation protection clear offered input and sound before their guards release', async () => {
  for (const guard of [{ protected: true }, { suspended: true }, { hidden: true }, { focused: false }]) {
    const h = harness(); await h.scene.initialize();
    h.scene.key({ key: 'w' }); h.scene.update(.1);
    h.scene.pointer({ type: 'pointerdown', button: 2, clientX: 10, clientY: 10 });
    Object.assign(h.presentation, guard);
    const protectedPose = h.scene.serialize();
    h.scene.key({ key: 'd' }); h.scene.update(.25); h.scene.setLook({ yaw: 1.3 });
    h.scene.pointer({ type: 'pointermove', clientX: 100, clientY: 60 });
    assert.deepEqual(h.scene.serialize(), protectedPose);
    assert.equal(h.stats().sounding, false);
    for (const key of Object.keys(guard)) delete h.presentation[key];
    h.scene.update(.1);
    assert.equal(h.scene.serialize().physical.x, protectedPose.physical.x, 'guarded D cannot resume later');
    assert.equal(h.scene.serialize().physical.z, protectedPose.physical.z, 'held W cannot resume later');
    assert.equal(h.scene.serialize().physical.yaw, protectedPose.physical.yaw);
    h.scene.key({ key: 'd' }); h.scene.update(.1);
    assert.ok(h.scene.serialize().physical.x > protectedPose.physical.x, 'fresh unprotected input remains live');
    h.scene.exit();
  }
});

test('the real upper-door retreat owns one checkpoint and cannot double-dispatch while the host callback waits', async () => {
  let release;
  const wait = new Promise(resolve => { release = resolve; }), h = harness({ onReturn: () => wait });
  await h.scene.initialize(); h.scene.key({ key: 's' });
  for (let n = 0; n < 15; n++) h.scene.update(.1);
  assert.equal(h.returns.length, 1); assert.equal(h.completes.length, 0);
  assert.equal(h.returns[0].checkpoint.status, 'returned');
  assert.deepEqual(h.returns[0].checkpoint.returnPose, initial().returnPose);
  assert.equal(h.scene.view().leaving, true); assert.equal(h.stats().sounding, false);
  const checkpoint = h.scene.serialize();
  h.scene.key({ key: 'w' }); h.scene.update(9); h.scene.key({ key: 'e' });
  assert.deepEqual(h.scene.serialize(), checkpoint); assert.equal(h.returns.length, 1);
  assert.equal(h.checkpoints.filter(save => save.metadata.reason === 'return').length, 1);
  release(true); await flush();
  assert.equal(h.scene.exit(), true); assert.equal(h.scene.exit(), false);
  assert.equal(h.stats().disposals, 1); assert.equal(h.exits.length, 1);
  assert.equal(h.checkpoints.filter(save => save.metadata.reason === 'interrupted').length, 0);
});

test('a saved returned checkpoint retries the interrupted host return without releasing demolition cues', async () => {
  const returned = advance(initial(), .7, { forward: -1 });
  assert.equal(returned.status, 'returned');
  const h = harness({ checkpoint: returned });
  await h.scene.initialize(); await flush();
  assert.equal(h.returns.length, 1); assert.equal(h.completes.length, 0);
  assert.equal(h.returns[0].checkpoint.status, 'returned');
  assert.deepEqual(h.trace, []); h.scene.exit();
});

test('completed pending handoff resumes without replay and E retries a failed destination exactly once per attempt', async () => {
  let attempts = 0;
  const checkpoint = completed(), h = harness({ checkpoint, onComplete: () => ++attempts > 1 });
  await h.scene.initialize(); await flush();
  assert.equal(h.completes.length, 1); assert.equal(h.returns.length, 0);
  assert.equal(h.scene.view().leaving, false); assert.ok(h.scene.view().error);
  assert.equal(h.stats().sounding, false); assert.deepEqual(h.trace, []);
  const frozen = h.scene.serialize(); h.scene.key({ key: 'w' }); h.scene.update(20);
  assert.deepEqual(h.scene.serialize(), frozen);
  h.scene.key({ key: 'e', repeat: true }); assert.equal(h.completes.length, 1);
  h.scene.key({ key: 'e' }); h.scene.key({ key: 'e' }); await flush();
  assert.equal(h.completes.length, 2); assert.equal(h.scene.view().leaving, true);
  assert.equal(h.completes[1].checkpoint.exitReceipt.id, checkpoint.exitReceipt.id);
  assert.equal(h.checkpoints.filter(save => save.metadata.reason === 'complete').length, 2);
  h.scene.exit(); assert.equal(h.stats().disposals, 1);
  const delivered = copy(checkpoint); delivered.exitReceipt.delivered = true;
  const already = harness({ checkpoint: delivered });
  await already.scene.initialize(); await flush();
  assert.equal(already.completes.length, 0, 'an acknowledged receipt cannot dispatch the host again');
  already.scene.exit();
});

test('failed assets offer a saved return and teardown remains idempotent across pending initialization', async () => {
  const failed = harness({ initialize: () => false });
  assert.equal(await failed.scene.initialize(), false); assert.equal(failed.errors.length, 1);
  failed.scene.key({ key: 'w' }); failed.scene.update(10);
  assert.deepEqual(failed.scene.serialize(), initial());
  failed.scene.key({ key: 'x' }); await flush(); assert.equal(failed.returns.length, 1);
  assert.equal(failed.returns[0].checkpoint.sequenceId, 'ending-wrong-door');
  failed.scene.exit(); failed.scene.exit(); assert.equal(failed.stats().disposals, 1);
  let release;
  const pending = harness({ initialize: () => new Promise(resolve => { release = resolve; }) });
  const initialization = pending.scene.initialize(); await flush();
  pending.scene.exit(); const saves = pending.checkpoints.length;
  release(true); assert.equal(await initialization, false);
  pending.scene.update(1); pending.scene.key({ key: 'w' }); pending.scene.key({ key: 'Escape' });
  pending.scene.key({ controllerAction: 'back' }); pending.scene.render();
  assert.equal(pending.checkpoints.length, saves);
  assert.equal(pending.stats().disposals, 1); assert.equal(pending.exits.length, 1);
  assert.equal(pending.stats().sounding, false);
});

test('the physical renderer receives borrowed ending body state and no input can write after scene teardown', async () => {
  const h = harness({ onCheckpoint: () => {} }); await h.scene.initialize();
  h.scene.key({ key: 'w' }); h.scene.update(.25); h.scene.render();
  assert.equal(h.draws.length, 1);
  assert.equal(h.draws[0].physical.runId, `ending-wrong-door:${runId}:physical`);
  assert.equal(h.draws[0].physical.committed, true);
  assert.ok(h.trace.some(event => event.event.type === 'strain'));
  assert.ok(h.trace.every(event => event.event.id.startsWith(`ending-wrong-door:${runId}:`)));
  h.scene.exit(); const stopped = h.stats().audioStops;
  const saved = h.checkpoints.length;
  assert.equal(h.scene.exit(), false); h.scene.update(1); h.scene.render();
  h.scene.key({ key: 'Escape' }); h.scene.key({ controllerAction: 'back' });
  h.scene.key({ key: 'w' }); h.scene.keyup({ key: 'w' }); h.scene.pause(); h.scene.resume();
  assert.equal(h.checkpoints.length, saved);
  assert.equal(h.stats().audioStops, stopped); assert.equal(h.stats().disposals, 1);
});

test('scene checkpoints pass through the real save boundary without changing either ordinary Source omen', async () => {
  const base = freshSave({ run: freshRunRecord({ id: runId, now: 1000 }) });
  base.chunkSurf.sourceEarthfall = freshSourceEarthfall({ runId });
  base.chunkSurf.sourceDemolition = { ...base.chunkSurf.sourceDemolition, committed: true, status: 'active', elapsed: 4, clock: 4 };
  await withTransientGameState({ save: base }, async scope => {
    const ordinary = copy(getSave().chunkSurf);
    const h = harness({ onCheckpoint: value => saveCommit({ endingWrongDoor: value }) });
    await h.scene.initialize(); h.scene.key({ key: 'w' }); h.scene.update(.25);
    assert.equal(getSave().endingWrongDoor.physical.committed, true);
    h.scene.update(.25); h.scene.update(.25); h.scene.pause(); h.scene.exit();
    assert.deepEqual(getSave().endingWrongDoor, h.scene.serialize());
    assert.deepEqual(getSave().chunkSurf, ordinary);
    assert.ok(scope.writes.every(write => Object.keys(write.patch).every(key => key === 'endingWrongDoor')));
    assert.equal(getSave().run.status, 'active');
    assert.equal(getSave().endingCutscene, null);
  });
});

test('save persistence admits matching ending checkpoints and leaves ordinary Source progress and host resources intact', async () => {
  const base = freshSave({ run: freshRunRecord({ id: runId, now: 1000 }) });
  base.flags['audit-preserved'] = true; base.items = ['recorder']; base.takes = [{ room: 'amplifications', clean: true }];
  base.chunkSurf.sourceEarthfall = freshSourceEarthfall({ runId });
  base.chunkSurf.sourceDemolition = { ...base.chunkSurf.sourceDemolition, committed: true, status: 'active', elapsed: 4, clock: 4 };
  await withTransientGameState({ save: base }, async scope => {
    assert.equal(getSave().endingWrongDoor, null);
    const before = copy({ chunkSurf: getSave().chunkSurf, flags: getSave().flags,
      items: getSave().items, takes: getSave().takes, run: getSave().run });
    for (const checkpoint of [initial(), advance(advance(initial(), .25, { forward: 1 }), 4), completed()]) {
      saveCommit({ endingWrongDoor: checkpoint });
      assert.deepEqual(getSave().endingWrongDoor, checkpoint);
      assert.deepEqual({ chunkSurf: getSave().chunkSurf, flags: getSave().flags,
        items: getSave().items, takes: getSave().takes, run: getSave().run }, before);
    }
    const saved = copy(getSave());
    await withTransientGameState({ save: saved }, () => assert.deepEqual(getSave().endingWrongDoor, saved.endingWrongDoor));
    for (const checkpoint of [fresh({ runId: 'other-run' }), freshSourceEarthfall({ runId }),
      { ...initial(), sequenceId: 'ordinary-source-II' }, null]) {
      saveCommit({ endingWrongDoor: checkpoint }); assert.equal(getSave().endingWrongDoor, null);
      assert.deepEqual(getSave().chunkSurf, before.chunkSurf);
    }
    assert.ok(scope.writes.every(write => Object.keys(write.patch).every(key => key === 'endingWrongDoor')));
  });
});
