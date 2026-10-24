import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { makeGetInDriveTeaserScene } from '../src/game/get-in-drive-teaser-scene.js';
import { BUMPER_INTRUSION as C } from '../src/game/source-drive/bumper-intrusion.js';

const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 32, 0, -68, 1];
function fixture({ presentation = {}, rejectClosest = false, sealGate = null } = {}) {
  const calls = [], renders = [], inputs = [], controls = [], errors = [];
  const context = { id: 'existing-game-context' }, destination = { id: 'existing-monitor' }, filtered = { id: 'existing-filtered-monitor-and-REC-bus' };
  const state = { time: 4.8, wallMs: 0, distance: 100, speed: 8, held: false, paused: true, returning: false, finished: false,
    presentation, rejectClosest, raw: null, recording: false, effectDisposed: false };
  const counts = { effectPlay: 0, effectDispose: 0, audioDispose: 0, rendererDispose: 0, controllerDispose: 0,
    tapeDispose: 0, seal: 0, restore: 0, done: 0, close: 0, committed: 0, pause: 0 };
  const mark = (type, detail) => calls.push({ type, detail });
  const controller = {
    start() { mark('controller-start'); }, setPaused(value) { state.paused = value; mark('controller-pause', value); },
    update(dt) { if (!state.paused) state.time += dt; },
    frame() {
      const body = identity(); body[14] = 32 - state.distance;
      const look = { yaw: 0, pitch: -.035 }, eye = [31.6, 1.62, body[14] + .15];
      const frame = { timeSec: state.time, phase: state.returning ? 'return' : 'free-drive', controlsEnabled: !state.paused && !state.returning,
        paused: state.paused, worldOwner: state.returning ? 'return' : 'drive', finished: state.finished, coverAlpha: state.returning ? 1 : 0,
        vehiclePose: { distance: state.distance, speed: state.speed, bodyMatrix: body }, look,
        renderFrame: state.returning ? null : { driveState: { speed: state.speed, heading: 0, programTime: state.time }, look,
          scene: { body, eye, colliders: [{ id: 'real-road-edge' }], props: [{ id: 'existing-cabin', matrix: body }],
            lamps: [{ id: 'existing-headlamp', x: 31.4, y: 1.02, z: body[14] - 3.215, intensity: 5, color: [1, .89, .72] }],
            cut: { sources: [] }, predicaments: { sources: [] }, targets: [{ id: 'tune', preset: 1, point: [0, 0, 0] }] }, weather: {}, evolution: {} } };
      state.raw = frame; return frame;
    },
    input(action, down) { inputs.push([action, down]); },
    lookDelta(dx, dy) { mark('look', [dx, dy]); }, setLook(value) { mark('set-look', value); },
    selectStation(value) { mark('station', value); }, power() { mark('power'); },
    toggleWipers() { mark('wipers'); }, toggleHeadlights() { mark('lamps'); },
    operate(kind, callback) { controls.push({ kind, callback }); return true; }, setRecordingView() {},
    dispose() { counts.controllerDispose++; },
  };
  const audio = { cabin: { id: 'dry-cabin' }, initialize: async () => {},
    ensureOpeningBus() { mark('opening-bus'); }, recordingBus: () => filtered,
    setPaused(value) { mark('audio-pause', value); }, sync() {}, level: () => .02,
    dispose() { counts.audioDispose++; }, diagnostics: () => ({}),
  };
  const tape = { status: () => ({ recording: state.recording, headSeconds: 7 }), tick() {},
    setPaused(value) { mark('tape-pause', value); },
    record: async () => { state.recording = true; mark('record'); },
    stopPlayback: async () => { mark('stop-playback'); },
    play: async () => { mark('playback'); },
    seal: async value => { counts.seal++; mark('seal', value); if (sealGate) await sealGate; state.recording = false; },
    dispose: async () => { counts.tapeDispose++; },
  };
  const effect = {
    setPaused(value) { mark('effect-pause', value); },
    play(value) { counts.effectPlay++; mark('effect-play', value); return true; },
    dispose() { if (!state.effectDisposed) { state.effectDisposed = true; counts.effectDispose++; } },
    diagnostics: () => ({ disposed: state.effectDisposed, plays: counts.effectPlay }),
  };
  const scene = makeGetInDriveTeaserScene({ context, destination,
    fetcher: async () => ({ ok: true, json: async () => ({ eye: [-.4, 1.62, .15] }) }),
    createController: () => controller,
    createRenderer: () => ({ initialize: async () => true, setRecorderReadout() {},
      render(frame) {
        const prop = frame.scene.props.find(p => p.id === C.id);
        assert.strictEqual(frame.scene.body, state.raw.renderFrame.scene.body, 'the intrusion cannot move the driven vehicle');
        assert.strictEqual(frame.scene.eye, state.raw.renderFrame.scene.eye, 'the intrusion cannot move the camera');
        assert.strictEqual(frame.look, state.raw.renderFrame.look, 'look remains owned by the controller');
        assert.strictEqual(frame.scene.colliders, state.raw.renderFrame.scene.colliders, 'the intrusion cannot acquire a collider');
        assert.equal(state.raw.renderFrame.scene.props.length, 1, 'the controller frame is immutable');
        assert.strictEqual(frame.scene.props.find(p => p.id === 'existing-cabin'), state.raw.renderFrame.scene.props[0], 'existing cabin props retain their original instance');
        assert.equal(state.raw.renderFrame.scene.lamps.length, 1, 'owned rear lamps cannot mutate the controller light array');
        assert.strictEqual(frame.scene.lamps.find(l => l.id === 'existing-headlamp'), state.raw.renderFrame.scene.lamps[0], 'existing headlamp ownership is preserved');
        assert.deepEqual(state.raw.renderFrame.scene.lamps[0].color, [1, .89, .72]);
        renders.push({ prop: prop ? structuredClone(prop) : null, propIds: frame.scene.props.map(p => p.id), lampIds: frame.scene.lamps.map(l => l.id), cinematicLook: frame.cinematicLook });
        mark('render', prop?.bumperIntrusion?.phase || null);
        return !(state.rejectClosest && prop?.bumperIntrusion.phase === 'closest');
      },
      project: () => ({ visible: true, x: .5, y: .5 }), dispose() { counts.rendererDispose++; } }),
    createAcoustics: () => audio,
    createIntrusionAudio(options) {
      assert.strictEqual(options.context, context); assert.strictEqual(options.destination, filtered);
      assert.equal(calls.at(-1).type, 'opening-bus', 'prepare the impact only after the heard-medium bus exists');
      mark('effect-create'); return effect;
    },
    createRecording: async options => { assert.strictEqual(options.cabinBus, filtered); mark('tape-create'); return tape; },
    getPresentation: () => state.presentation, isHeld: () => state.held, presentationNow: () => state.wallMs,
    getViewport: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    onRestore() { counts.restore++; }, onDoorsClose() { counts.close++; },
    onDone() { counts.done++; mark('done'); }, onTapeChanged() { counts.committed++; mark('commit'); },
    onPause() { counts.pause++; }, onError(error) { errors.push(error); },
  });
  const tick = (dt, wallSeconds = dt) => { state.wallMs += wallSeconds * 1000; scene.update(dt); };
  const advance = (seconds, step = .05) => { for (let left = seconds; left > 1e-8; left -= step) tick(Math.min(step, left)); };
  const until = predicate => { for (let i = 0; i < 120 && !predicate(); i++) tick(.05); assert.ok(predicate(), 'bounded host updates reached the expected state'); };
  const prepare = async () => { advance(.3); assert.ok(await scene.pending()); };
  return { scene, state, counts, calls, renders, inputs, controls, errors, tick, advance, until, prepare };
}

test('the real intrusion reaches the rendered rear bumper before emitting exactly one heard-bus impact', async () => {
  const h = fixture(); await h.prepare();
  h.until(() => h.scene.view().bumperIntrusion.phase === 'approach');
  assert.equal(h.counts.effectPlay, 0); assert.ok(h.renders.some(r => r.prop?.bumperIntrusion.phase === 'approach'));
  h.until(() => h.counts.effectPlay === 1);
  const event = h.calls.findIndex(c => c.type === 'effect-play');
  assert.deepEqual(h.calls[event - 1], { type: 'render', detail: 'closest' }, 'a successful closest draw owns the sound edge');
  assert.equal(h.calls[event].detail.strength, 1); assert.equal(h.calls[event].detail.reducedMotion, false);
  assert.equal(h.renders.at(-1).propIds.filter(id => id.startsWith(C.id + '-powered-')).length, 2, 'the host submits both real rear lenses with the looming body');
  assert.equal(h.renders.at(-1).lampIds.filter(id => id.startsWith(C.id + '-powered-')).length, 2, 'their attached spill lights reach the same submitted frame');
  h.advance(2); assert.equal(h.scene.view().bumperIntrusion.phase, 'spent'); assert.equal(h.renders.at(-1).prop, null);
  assert.deepEqual(h.renders.at(-1).lampIds, ['existing-headlamp'], 'retiring the image removes its lamps while retaining the driven car lights');
  h.advance(3); assert.equal(h.counts.effectPlay, 1); assert.ok(h.renders.every(r => r.cinematicLook === false));
  assert.equal(h.errors.length, 0); h.scene.exit(); await flush();
});

test('pause and blur retire an active flash before or after contact without a delayed slam or replay', async () => {
  for (const lifecycle of ['pause', 'blur']) for (const afterContact of [false, true]) {
    const h = fixture(); await h.prepare(); h.until(() => h.scene.view().bumperIntrusion.phase === 'approach');
    if (afterContact) h.until(() => h.counts.effectPlay === 1);
    const time = h.state.time, renders = h.renders.length, plays = h.counts.effectPlay;
    h.state.held = true; if (lifecycle === 'blur') h.scene.blur(); else h.scene.setPaused(true);
    h.advance(2); for (let i = 0; i < 10; i++) h.scene.render();
    assert.equal(h.state.time, time); assert.equal(h.renders.length, renders); assert.equal(h.counts.effectPlay, plays);
    assert.equal(h.scene.view().bumperIntrusion.phase, 'cancelled');
    assert.ok(h.calls.some(c => c.type === 'effect-pause' && c.detail === true));
    h.state.wallMs += 60000; h.state.held = false;
    if (lifecycle === 'blur') h.scene.focus(); else h.scene.resume();
    h.tick(1/60); assert.equal(h.renders.at(-1).prop, null);
    assert.deepEqual(h.renders.at(-1).lampIds, ['existing-headlamp']);
    h.advance(1); assert.equal(h.counts.effectPlay, plays); h.scene.exit(); await flush();
  }
});

test('the collision uses presentation time at 60, 30 and 10fps and clears on the next submitted frame', async () => {
  assert.ok(C.approachSeconds <= .08, 'the approach itself must remain a split-second intrusion');
  for (const fps of [60, 30, 10]) {
    const h = fixture(); await h.prepare(); h.until(() => h.scene.view().bumperIntrusion.phase === 'approach');
    const start = h.state.wallMs; let frames = 0;
    while (!h.counts.effectPlay && frames++ < 20) h.tick(Math.min(.05, 1/fps), 1/fps);
    assert.equal(h.counts.effectPlay, 1);
    assert.ok((h.state.wallMs-start)/1000 <= C.approachSeconds+1/fps+1e-9, `${fps}fps must not stretch the flash with the simulation cap`);
    assert.equal(h.renders.filter(r => r.prop?.bumperIntrusion.phase === 'closest').length, 1);
    h.tick(Math.min(.05, 1/fps), 1/fps);
    assert.ok((h.state.wallMs-start)/1000 <= .08+2/fps+1e-9, `${fps}fps cannot add a contact hold or recovery image`);
    assert.equal(h.scene.view().bumperIntrusion.phase, 'spent'); assert.equal(h.renders.at(-1).prop, null);
    assert.deepEqual(h.renders.at(-1).propIds, ['existing-cabin']); assert.deepEqual(h.renders.at(-1).lampIds, ['existing-headlamp']);
    assert.equal(h.counts.effectPlay, 1); h.scene.exit(); await flush();
  }
});

test('zero-time refreshes and a bad presentation clock cannot age or rearm the flash', async () => {
  const h = fixture(); await h.prepare(); h.until(() => h.scene.view().bumperIntrusion.phase === 'approach');
  const before = h.scene.view().bumperIntrusion.elapsed;
  h.state.wallMs += 5000; h.scene.update(0); assert.equal(h.scene.view().bumperIntrusion.elapsed, before); assert.equal(h.counts.effectPlay, 0);
  h.state.wallMs = NaN; h.scene.update(.025); assert.equal(h.scene.view().bumperIntrusion.elapsed, before+.025);
  h.state.wallMs = 1; h.scene.update(.025); assert.equal(h.scene.view().bumperIntrusion.elapsed, before+.05);
  h.state.wallMs = -100; h.scene.update(.025); assert.equal(h.counts.effectPlay, 1);
  h.tick(.025, 0); assert.equal(h.scene.view().bumperIntrusion.phase, 'spent'); h.scene.exit(); await flush();
});

test('a rejected closest frame restores once and never plays a collision that was not presented', async () => {
  const h = fixture({ rejectClosest: true }); await h.prepare(); h.until(() => h.errors.length === 1); await flush();
  assert.match(h.errors[0].message, /frame.*presented/); assert.equal(h.counts.effectPlay, 0);
  assert.equal(h.scene.view().bumperIntrusion.phase, 'cancelled'); assert.equal(h.counts.restore, 1); assert.equal(h.counts.done, 1);
  h.advance(4); h.scene.exit(); h.scene.exit(); await flush();
  assert.equal(h.counts.restore, 1); assert.equal(h.counts.rendererDispose, 1); assert.equal(h.counts.effectDispose, 1); assert.equal(h.counts.tapeDispose, 1);
});

test('exit during approach cancels the temporary image and disposes the existing tape and renderer', async () => {
  const h = fixture(); await h.prepare(); h.until(() => h.scene.view().bumperIntrusion.phase === 'approach');
  const renders = h.renders.length; h.scene.exit(); h.scene.exit(); h.advance(4); await flush();
  assert.equal(h.counts.effectPlay, 0); assert.equal(h.scene.view().bumperIntrusion.phase, 'cancelled'); assert.equal(h.renders.length, renders);
  for (const name of ['restore', 'effectDispose', 'controllerDispose', 'rendererDispose', 'audioDispose', 'tapeDispose']) assert.equal(h.counts[name], 1, name);
  assert.equal(h.counts.done, 0); assert.equal(h.errors.length, 0);
});

test('live accessibility changes downgrade or remove an already armed intrusion without upgrading it again', async () => {
  for (const change of [{ reducedMotion: true }, { reducedDread: true }, { effectsMode: 'off' }]) {
    const h = fixture(); await h.prepare(); h.until(() => h.scene.view().bumperIntrusion.phase === 'approach');
    h.state.presentation = change; h.scene.update(0);
    if (change.reducedMotion) {
      assert.equal(h.scene.view().bumperIntrusion.mode, 'still'); assert.equal(h.counts.effectPlay, 1);
      const contact = h.calls.find(c => c.type === 'effect-play').detail; assert.equal(contact.strength, .35); assert.equal(contact.reducedMotion, true);
    } else if (change.reducedDread) {
      assert.equal(h.scene.view().bumperIntrusion.mode, 'quiet'); assert.equal(h.counts.effectPlay, 0);
      assert.equal(h.renders.at(-1).prop.bumperIntrusion.rearDistance, C.quietRearDistance);
    } else {
      assert.equal(h.scene.view().bumperIntrusion.mode, 'disabled'); assert.equal(h.renders.at(-1).prop, null); assert.equal(h.counts.effectPlay, 0);
    }
    const mode = h.scene.view().bumperIntrusion.mode; h.state.presentation = {}; h.scene.update(0); assert.equal(h.scene.view().bumperIntrusion.mode, mode);
    h.scene.exit(); await flush();
  }
});

test('ordinary pedals, mouse look, cabin controls and tape contact remain live after the intrusion', async () => {
  let releaseSeal; const gate = new Promise(resolve => { releaseSeal = resolve; });
  const h = fixture({ sealGate: gate }); await h.prepare(); h.until(() => h.counts.effectPlay === 1); h.advance(1);
  for (const [key, action] of [['w', 'forward'], ['s', 'reverse'], ['a', 'left'], ['d', 'right'], [' ', 'brake']]) {
    h.scene.key({ key }); h.scene.keyup({ key }); assert.deepEqual(h.inputs.slice(-2), [[action, true], [action, false]]);
  }
  h.scene.pointer({ type: 'pointermove', pointerLocked: true, movementX: 15, movementY: -8 });
  assert.deepEqual(h.calls.at(-1), { type: 'look', detail: [15, -8] });
  h.scene.pointer({ type: 'pointerdown', button: 2, clientX: 10, clientY: 10 });
  h.scene.pointer({ type: 'pointermove', clientX: 30, clientY: 15 }); h.scene.pointer({ type: 'pointerup', clientX: 30, clientY: 15 });
  assert.ok(h.calls.some(c => c.type === 'look' && c.detail[0] === 20 && c.detail[1] === 5));
  h.scene.key({ key: '2' }); h.scene.key({ key: 'o' }); h.scene.key({ key: 'v' }); h.scene.key({ key: 'l' });
  assert.ok(h.calls.some(c => c.type === 'station' && c.detail === 'company')); for (const type of ['power', 'wipers', 'lamps']) assert.ok(h.calls.some(c => c.type === type));
  h.scene.key({ key: 'r' }); assert.equal(h.state.recording, false); assert.equal(h.controls.at(-1).kind, 'record');
  h.controls.at(-1).callback(); await flush(); assert.equal(h.state.recording, true, 'only actual hand contact starts the existing physical tape');
  h.state.returning = true; h.state.finished = true; h.scene.update(.05); await flush();
  assert.equal(h.counts.restore, 1); assert.equal(h.counts.close, 1); assert.equal(h.counts.seal, 1); assert.equal(h.counts.done, 0);
  releaseSeal(); await flush(); assert.equal(h.counts.done, 1);
  const commit = h.calls.findLastIndex(c => c.type === 'commit'), done = h.calls.findIndex(c => c.type === 'done'); assert.ok(commit < done);
  h.scene.exit(); await flush(); assert.equal(h.counts.effectDispose, 1); assert.equal(h.counts.audioDispose, 1); assert.equal(h.counts.tapeDispose, 1);
});

test('a pending cabin operation and pointer drag defer the scare instead of competing with the player', async () => {
  const h = fixture(); await h.prepare();
  h.scene.key({ key: '2' }); h.advance(2); assert.equal(h.scene.view().bumperIntrusion.phase, 'waiting');
  h.scene.pointer({ type: 'pointerdown', button: 2, clientX: 0, clientY: 0 }); h.advance(2);
  assert.equal(h.scene.view().bumperIntrusion.phase, 'waiting'); h.scene.pointer({ type: 'pointercancel' });
  h.until(() => h.scene.view().bumperIntrusion.phase === 'approach'); h.scene.exit(); await flush();
});

test('the real opening host reads visual, motion and dread settings at call time', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const owner = main.slice(main.indexOf('function beginGetInDriveTeaser('), main.indexOf('function beginGetInArrivalTitle('));
  const begin = owner.indexOf('getPresentation:') + 'getPresentation:'.length, end = owner.indexOf('createRecording:', begin);
  assert.ok(begin > 0 && end > begin);
  const expression = owner.slice(begin, end).trim().replace(/,$/, '');
  const state = { visual: true, shake: 'full', rendererReduce: false, settings: { reduceDread: false } };
  const getter = vm.runInNewContext('(' + expression + ')', {
    visualEffectsEnabled: () => state.visual, shakeMode: () => state.shake,
    getSave: () => ({ settings: state.settings }), R3: { r3dPixelMeshStatus: () => ({ settings: { reduceMotion: state.rendererReduce } }) },
  });
  const values = () => JSON.parse(JSON.stringify(getter()));
  assert.deepEqual(values(), { effectsMode: 'full', reducedMotion: false, reducedDread: false });
  state.visual = false; state.shake = 'reduced'; state.settings.reduceDread = true;
  assert.deepEqual(values(), { effectsMode: 'off', reducedMotion: true, reducedDread: true });
  state.shake = 'full'; state.rendererReduce = true; assert.equal(values().reducedMotion, true, 'renderer motion accessibility reaches the same host');
});
