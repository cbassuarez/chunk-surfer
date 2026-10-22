import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSourceDriveSession, freshSourceDriveCheckpoint, normalizeSourceDriveCheckpoint, SOURCE_DRIVE_ASSETS } from '../src/game/source-drive-session.js';
import { roadAt } from '../src/game/source-drive/road.js';

const metrics = JSON.parse(await readFile(new URL('../artifacts/source-drive-study/geometry/metrics.json', import.meta.url)));
const returnPose = { x: 203.125, y: -1080.04, facing: 2, yaw: 1.821, pitch: -.087, floorH: 15.2 };
function checkpointAt(distance, extra = {}) {
  const value = freshSourceDriveCheckpoint({ returnPose, runId: 'test-run' });
  const road = roadAt(distance);
  value.status = 'active'; value.started = true;
  Object.assign(value.drive, { x: road.x - 1.35 * Math.cos(road.heading), z: -distance, heading: road.heading, roadHeight: road.height, roadOffset: -1.35, furthest: distance, cutEnabled: true, ...extra });
  return value;
}
function fixture(extra = {}) {
  const calls = [], joints = [], commits = [], statuses = [];
  let recording = false, playing = false, paused = true;
  const refs = [];
  const tape = {
    status: () => ({ recording, playing, paused, elapsedSeconds: recording ? 2 : 0, positionSeconds: playing ? 1.5 : 0, lastTakeId: refs.at(-1)?.id }),
    checkpoint: () => ({ schema: 1, runId: 'test-run', takeRefs: structuredClone(refs), pending: recording ? { takeId: 'take:8', durable: false } : null }),
    hydrate: async value => { refs.push(...value.takeRefs); calls.push('hydrate'); },
    setPaused: async value => { paused = value; },
    tick() {},
    record: async () => { recording = true; return { id: 'take:8', startSeconds: 119 }; },
    seal: async () => { if (!recording) return null; const ref = { id: 'take:8', key: 'run-blob-8', durationSeconds: 2, startSeconds: 119, durable: true }; refs.push(ref); recording = false; return ref; },
    play: async () => { playing = true; return refs.at(-1); },
    stopPlayback: async () => { playing = false; },
    dispose: async () => { calls.push('tape-dispose'); },
  };
  const acoustics = { cabin: { id: 'owned-cabin-bus' }, initialize() { calls.push('audio-initialize'); }, setPaused(v) { calls.push(['audio-pause', v]); }, sync() {}, joint(v) { joints.push(v); }, click() {}, level: () => .125, dispose() { calls.push('audio-dispose'); } };
  const renderer = { async initialize(value) { calls.push(['renderer-initialize', value]); }, render(frame) { calls.push(['render', frame]); }, dispose() { calls.push('renderer-dispose'); } };
  const host = { metrics, returnPose, runId: 'test-run', acoustics, recording: tape, renderer, tapeTransport: () => ({ headSeconds: 119 }), onStatus: v => statuses.push(v), onReturned: async v => { commits.push(v); }, ...extra };
  return { host, tape, acoustics, renderer, calls, joints, commits, statuses, session: createSourceDriveSession(host) };
}

test('the host owns initialization, one frame and one physical tape; no alternate context or renderer is created', async () => {
  const f = fixture();
  await Promise.all([f.session.initialize(), f.session.initialize()]);
  assert.equal(f.calls.filter(c => c[0] === 'renderer-initialize').length, 1);
  assert.deepEqual(f.calls.find(c => c[0] === 'renderer-initialize')[1].assets, SOURCE_DRIVE_ASSETS);
  assert.equal(f.session.render(), true);
  const frame = f.calls.find(c => c[0] === 'render')[1];
  assert.equal(frame.readout.counter, '01:59', 'the counter comes from the existing physical tape');
  assert.equal(frame.readout.levels.left, .125);
  assert.ok(frame.scene.props.some(p => p.mesh === 'drive_cabin'));
  assert.ok(frame.scene.props.some(p => p.mesh === 'drive_right_hand'));
  assert.deepEqual(frame.eye.length, 3);
  assert.deepEqual(f.session.serialize().returnPose, returnPose);
  await f.session.dispose();
});

test('pause freezes vehicle, weather and deformation clocks and releases held driving inputs', async () => {
  const f = fixture(); await f.session.start(); f.session.key({ key: 'w' });
  for (let i = 0; i < 120; i++) f.session.update(1 / 60);
  assert.ok(f.session.status().state.furthest > 1, 'ordinary held controls drive the actual vehicle');
  await f.session.pause(); const before = f.session.serialize();
  for (let i = 0; i < 60; i++) f.session.update(1 / 60);
  const after = f.session.serialize();
  assert.deepEqual(after.drive, before.drive);
  assert.deepEqual(after.weather, before.weather);
  await f.session.start();
  for (let i = 0; i < 30; i++) f.session.update(1 / 60);
  assert.equal(f.session.status().state.throttle, 0, 'pause cleared throttle rather than reapplying a held key; coasting retains physical momentum');
  await f.session.dispose();
});

test('held-brake feedback is immediate and leaves the cabin controls and programme live', async () => {
  const f = fixture({ checkpoint: checkpointAt(358) });
  await f.session.start(); f.session.key({ key: ' ' });
  for (let i = 0; i < 60; i++) f.session.update(1 / 60);
  f.session.keyup({ key: ' ' });
  assert.equal(f.statuses.at(-1).brakeHeld, true, 'the hold transition publishes without waiting for the periodic checkpoint');
  assert.match(f.statuses.at(-1).instruction, /W \/ S TO MOVE/);
  const held = f.session.status(), clock = held.state.programTime;
  for (let i = 0; i < 120; i++) f.session.update(1 / 60);
  assert.equal(f.session.status().state.x, held.state.x);
  assert.equal(f.session.status().state.z, held.state.z);
  assert.ok(f.session.status().state.programTime > clock + 1.9, 'stopping does not pause the encounter');
  assert.equal(f.session.key({ key: 'o' }), true, 'radio operation remains available');
  f.session.key({ key: 'w' });
  for (let i = 0; i < 60; i++) f.session.update(1 / 60);
  assert.equal(f.statuses.at(-1).brakeHeld, false, 'a deliberate pedal releases the support and feedback');
  await f.session.dispose();
});

test('an interrupted start cannot unpause the drive after focus/pause revoked it', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ onStart: () => gate });
  await f.session.initialize(); const starting = f.session.start();
  await Promise.resolve(); await f.session.pause(); release();
  assert.equal(await starting, false);
  assert.equal(f.session.status().paused, true);
  await f.session.dispose();
});

test('releasing the view while packs load cannot allocate late cabin audio or recording nodes', async () => {
  let release; const loading = new Promise(resolve => { release = resolve; });
  let audioInitializations = 0, recordingFactories = 0;
  const f = fixture({ recording: null, renderer: { initialize: () => loading, render() {}, dispose() {} },
    acoustics: { initialize() { audioInitializations++; }, setPaused() {}, dispose() {} },
    createRecording: () => { recordingFactories++; return { dispose() {} }; } });
  const initial = f.session.initialize();
  await Promise.resolve(); await f.session.dispose(); release(false);
  assert.equal(await initial, false);
  assert.equal(audioInitializations, 0);
  assert.equal(recordingFactories, 0);
  assert.equal(f.session.render(), false);
  assert.equal(f.session.status().initialized, false);
});

test('a delayed recording factory is disposed if its owner was released while it awaited', async () => {
  let release, factoryStarted = false, lateDisposals = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture({ recording: null, createRecording: () => { factoryStarted = true; return pending; } });
  const initial = f.session.initialize();
  while (!factoryStarted) await Promise.resolve();
  await f.session.dispose();
  release({ dispose() { lateDisposals++; } });
  assert.equal(await initial, false);
  assert.equal(lateDisposals, 1);
  assert.equal(f.session.status().initialized, false);
});

test('restoring beside the bridge emits no phantom tyre impacts and resubmits the same Cut pose while paused', async () => {
  const f = fixture({ checkpoint: checkpointAt(540, { programTime: 81.25 }) });
  await f.session.initialize(); f.session.render();
  const one = structuredClone(f.session.frame().scene.cut.diagnostics); f.session.update(10); f.session.render();
  assert.equal(f.joints.length, 0);
  assert.equal(f.session.frame().timeSec, 81.25);
  assert.deepEqual(f.session.frame().scene.cut.diagnostics, one);
  await f.session.start(); f.session.update(1 / 60);
  assert.equal(f.joints.length, 0, 'load resets the comparison distance to the restored body');
  await f.session.dispose();
});

test('a missed forecast remains missed with the receiver off and does not leak its first hit', async () => {
  const f = fixture({ checkpoint: checkpointAt(444, { station: 'company', radioOn: false }) });
  await f.session.start(); f.session.input('forward');
  for (let i = 0; i < 210; i++) f.session.update(1 / 60);
  const value = f.session.serialize();
  assert.ok(value.fingerprint, 'the programme continued across the forecast position');
  assert.equal(f.joints.filter(j => j.radio).length, 0);
  assert.ok(value.drive.events.some(e => e.type === 'broadcast-road-joint' && e.audible === false));
  const count = value.drive.events.filter(e => e.type === 'broadcast-road-joint').length;
  await f.session.dispose();
  const restored = fixture({ checkpoint: value }); await restored.session.start(); restored.session.update(1 / 60);
  assert.equal(restored.session.serialize().drive.events.filter(e => e.type === 'broadcast-road-joint').length, count, 'a consumed forecast hit does not replay on load');
  await restored.session.dispose();
});

test('field recording uses the shared adapter and serializes pending versus durable material honestly', async () => {
  const f = fixture(); await f.session.start();
  await f.session.record();
  assert.equal(f.session.serialize().tape.pending.durable, false);
  assert.deepEqual(f.session.serialize().tape.takeRefs, []);
  assert.deepEqual(f.session.serialize().drive.takes, [], 'there is no duplicate field-take inventory');
  await f.session.stop();
  const saved = f.session.serialize();
  assert.equal(saved.tape.pending, null);
  assert.equal(saved.tape.takeRefs[0].id, 'take:8');
  assert.equal(saved.tape.takeRefs[0].startSeconds, 119);
  await f.session.play(); f.session.render();
  assert.equal(f.session.frame().readout.mode, 'play');
  assert.equal(f.session.frame().readout.levels.left, 0, 'microphone activity is not passed off as playback amplitude');
  await f.session.dispose();
});

test('STOP interrupts a record request waiting for the existing tape to seek, rather than starting an unwanted roll', async () => {
  const f = fixture(); await f.session.start();
  let cancel;
  f.tape.record = () => new Promise((_, reject) => { cancel = () => reject(Error('Tape cueing was stopped')); });
  const ordinaryStop = f.tape.stopPlayback;
  f.tape.stopPlayback = async () => { cancel?.(); await ordinaryStop(); };
  const pending = f.session.record();
  while (!cancel) await Promise.resolve();
  const stopped = f.session.stop();
  await assert.rejects(pending, /cueing was stopped/);
  await stopped;
  assert.equal(f.session.status().tape.recording, false);
  assert.deepEqual(f.session.serialize().tape.takeRefs, []);
  await f.session.dispose();
});

test('finish requires an intentional apron stop and does not require a recording or powered radio', async () => {
  const premature = fixture(); await premature.session.start();
  assert.equal(await premature.session.finish(), false);
  assert.equal(premature.commits.length, 0); await premature.session.dispose();
  const f = fixture({ checkpoint: checkpointAt(1200, { arrived: true, inArrivalZone: true, radioOn: false }) });
  await f.session.start();
  assert.equal(await f.session.finish(), true);
  assert.equal(f.commits.length, 1);
  assert.deepEqual(f.commits[0].returnPose, returnPose);
  assert.equal(f.commits[0].checkpoint.status, 'returned');
  assert.deepEqual(f.commits[0].tape.takeRefs, []);
  assert.equal(await f.session.start(), false, 'the completed encounter does not restart');
  assert.equal(f.session.render(), false);
  await f.session.dispose();
});

test('a stale parked checkpoint outside the apron cannot commit the exterior return', async () => {
  for (const value of [checkpointAt(1180, { arrived: true, inArrivalZone: true }), checkpointAt(1200, { arrived: true, inArrivalZone: true, x: 7, roadOffset: 0 })]) {
    const f = fixture({ checkpoint: value });
    await f.session.start();
    assert.equal(await f.session.finish(), false);
    assert.equal(f.commits.length, 0);
    assert.equal(f.statuses.at(-1).canLeave, false);
    await f.session.dispose();
  }
});

test('capture persistence failure keeps the player parked and retryable without committing a false return', async () => {
  const f = fixture({ checkpoint: checkpointAt(1200, { arrived: true, inArrivalZone: true }) });
  await f.session.start(); await f.session.record();
  const seal = f.tape.seal; f.tape.seal = async () => { throw Error('Local media storage is full'); };
  await assert.rejects(f.session.finish(), /storage is full/);
  assert.equal(f.commits.length, 0);
  assert.equal(f.session.serialize().status, 'active');
  assert.equal(f.session.status().paused, true);
  assert.equal(f.session.status().parked, true);
  f.tape.seal = seal;
  assert.equal(await f.session.finish(), true);
  assert.equal(f.commits[0].tape.takeRefs[0].durable, true);
  await f.session.dispose();
});

test('the return owner can release the renderer inside its commit callback without a transport deadlock', async () => {
  let session;
  const f = fixture({ checkpoint: checkpointAt(1200, { arrived: true }), onReturned: async () => { await session.dispose(); } });
  session = f.session; await session.start();
  let timer;
  try { assert.equal(await Promise.race([session.finish(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Return deadlocked')), 1000); })]), true); }
  finally { clearTimeout(timer); }
  assert.ok(f.calls.includes('renderer-dispose'));
});

test('invalid active checkpoints cannot invent an exterior return or escape the finite 1200 m route', () => {
  const malformed = checkpointAt(0); malformed.returnPose.x = null;
  assert.equal(normalizeSourceDriveCheckpoint(malformed).status, 'not-started');
  const otherRoute = checkpointAt(0); otherRoute.drive.length = 6500;
  assert.equal(normalizeSourceDriveCheckpoint(otherRoute).status, 'not-started');
  assert.throws(() => createSourceDriveSession({ renderer: { render() {} }, checkpoint: malformed }), /exact exterior pose/);
});
