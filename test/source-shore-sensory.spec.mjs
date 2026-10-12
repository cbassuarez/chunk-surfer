import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createSourceShoreAudio } from '../src/audio/source-shore.js';
import { sourceShoreOutside, sourceShoreSensoryFrame } from '../src/game/source-sensory.js';
import { applySourceEmergencyTorch, resolveTorchLook } from '../src/render/lighting-model.js';
import { applyFieldKitTorchLook } from '../src/render/field-kit-torch.js';
import { fieldKitEffects } from '../src/game/field-kit.js';
import { keyboardMotionAxes } from '../src/input/input-manager.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { reduceChunkSurf, normalizeChunkSurfState, CHUNK_SURF_PHASE } from '../src/game/chunk-surf-state.js';
import { freshSave, getSave, saveCommit, withTransientGameState } from '../src/game/save.js';

const shore = (details = {}) => ({ active: true, outside: true, proper: false,
  distanceFromRoomMetres: 100, distanceToBankMetres: 100, distanceToLiftMetres: 100,
  surface: 'void', lift: { phase: 'upper', moving: false, boarded: false }, ...details });
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function mainFunction(name) {
  const start = main.indexOf(`function ${name}(`), end = main.indexOf('\n}', start) + 2;
  assert.ok(start >= 0, `missing ${name}`);
  return main.slice(start, end < 0 ? main.length : end);
}
function fakeAudio({ panner = true } = {}) {
  const nodes = [], destination = { name: 'ordinary-sfx' };
  const param = () => ({ value: 0, calls: [],
    setValueAtTime(value, at) { this.value = value; this.calls.push({ value, at }); },
    linearRampToValueAtTime(value, at) { this.value = value; this.calls.push({ value, at }); },
    exponentialRampToValueAtTime(value, at) { this.value = value; this.calls.push({ value, at }); },
    setTargetAtTime(value, at) { this.value = value; this.calls.push({ value, at }); }, cancelScheduledValues() {},
  });
  const node = (kind) => {
    const value = { kind, connections: [], disconnected: false, gain: param(), frequency: param(), Q: param(), pan: param(),
      connect(to) { this.connections.push(to); }, disconnect() { this.disconnected = true; } };
    if (kind === 'noise' || kind === 'tone') {
      value.starts = []; value.stops = [];
      value.start = (at) => value.starts.push(at);
      value.stop = (at) => { assert.ok(value.starts.length, 'a source stopped before being started'); value.stops.push(at); };
    }
    nodes.push(value); return value;
  };
  const ctx = { currentTime: 10, state: 'running', sampleRate: 8000,
    createGain: () => node('gain'), createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('noise'), createOscillator: () => node('tone'),
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
  };
  if (panner) ctx.createStereoPanner = () => node('pan');
  return { ctx, destination, nodes, getAudio: () => ({ ctx, destination }) };
}

test('edge sounds follow physical distance, with no void bed or elapsed-walk trigger', () => {
  for (const frame of [null, {}, shore({ outside: false }), shore({ active: false }), shore({ proper: true })]) {
    assert.equal(sourceShoreOutside(frame), false);
    assert.equal(sourceShoreSensoryFrame(frame).roomLeak, 0);
  }
  const values = [0, 5, 13, 25, 26, 400].map(distanceFromRoomMetres =>
    sourceShoreSensoryFrame(shore({ distanceFromRoomMetres })).roomLeak);
  assert.equal(values[0], 1); assert.equal(values.at(-1), 0);
  assert.ok(values.every((gain, i) => i === 0 || gain <= values[i - 1]));
  assert.equal(sourceShoreSensoryFrame(shore({ elapsedSeconds: 900, progress: 1 })).metalReturn, 0);
  assert.equal(sourceShoreSensoryFrame(shore({ distanceFromRoomMetres: NaN })).roomLeak, 0);
  const empty = sourceShoreSensoryFrame(shore()), deck = sourceShoreSensoryFrame(shore({ surface: 'lift' }));
  assert.ok(empty.footstepMuffle > deck.footstepMuffle);
  assert.ok(empty.footstepGain > 0 && empty.footstepGain < 1, 'the body must remain audible on the invisible support');
});

test('shore light is soft physical light, preserving off, battery, perception and fitted reach', () => {
  const looks = {};
  for (const flashlight of ['reference', 'throw', 'flood']) {
    const base = applyFieldKitTorchLook(resolveTorchLook({ battery: .32, perception: .45 }), fieldKitEffects({ flashlight }));
    const look = applySourceEmergencyTorch(base, { profile: 'shore', xray: true, active: true });
    assert.equal(look.sourceTorchMode, 'none');
    assert.equal(look.health, base.health); assert.equal(look.band, base.band); assert.equal(look.perception, base.perception);
    assert.equal(look.reach, base.reach); assert.ok(look.power <= base.power);
    assert.ok(look.coneOuter - look.coneInner > base.coneOuter - base.coneInner);
    assert.ok(look.shoulder > 0); assert.ok(look.spill <= base.spill);
    looks[flashlight] = look;
  }
  assert.ok(looks.throw.reach > looks.reference.reach && looks.reference.reach > looks.flood.reach);
  assert.equal(applySourceEmergencyTorch(resolveTorchLook({ on: false }), { profile: 'shore' }).power, 0);
  assert.equal(applySourceEmergencyTorch(resolveTorchLook({ battery: 0 }), { profile: 'shore' }).power, 0);
  assert.equal(applySourceEmergencyTorch(resolveTorchLook(), { xray: true }).sourceTorchMode, 'xray');
});

test('the open volume stays silent; room leakage ends, even when standing still', () => {
  const audio = fakeAudio(), sound = createSourceShoreAudio(audio);
  for (let i = 0; i < 100; i += 1) sound.update(shore());
  assert.equal(audio.nodes.length, 0, 'elapsed time manufactured a bed');
  sound.update(shore({ distanceFromRoomMetres: 1 }), { roomPan: -.8 });
  assert.equal(sound.snapshot().room, true); assert.equal(sound.snapshot().voices, 1);
  const roomSource = audio.nodes.find(node => node.kind === 'noise');
  assert.equal(roomSource.loop, true);
  sound.update(shore({ distanceFromRoomMetres: 27 }));
  assert.equal(sound.snapshot().room, false); assert.equal(roomSource.stops.length, 1);
  roomSource.onended(); assert.equal(sound.snapshot().voices, 0);
  sound.stop();
});

test('lift motion owns one quiet voice and an observed stop, never a loading or upload transient', () => {
  const audio = fakeAudio(), sound = createSourceShoreAudio(audio);
  const near = { distanceToLiftMetres: 2, distanceToBankMetres: 4 };
  sound.update(shore(near)); assert.equal(audio.nodes.length, 0);
  sound.update(shore({ ...near, lift: { phase: 'lowering', moving: true } }), { liftPan: .6 });
  assert.equal(sound.snapshot().motor, true);
  const nodes = audio.nodes.length;
  for (let i = 0; i < 60; i += 1) sound.update(shore({ ...near, lift: { phase: 'lowering', moving: true } }));
  assert.equal(audio.nodes.length, nodes, 'frame uploads duplicated the motor');
  sound.update(shore({ ...near, lift: { phase: 'waiting', moving: false } }));
  assert.equal(sound.snapshot().motor, false);
  const stopped = audio.nodes.length;
  sound.update(shore({ ...near, lift: { phase: 'waiting', moving: false } }));
  assert.equal(audio.nodes.length, stopped, 'the stop catch replayed');
  assert.equal(audio.nodes.filter(node => node.starts && node.loop !== true).length, 2);
  assert.ok(audio.nodes.some(node => node.connections.includes(audio.destination)), 'sound bypassed the supplied SFX bus');
  for (const node of audio.nodes.filter(node => node.kind === 'gain')) {
    assert.ok(node.gain.calls.every(point => point.value <= .018), 'ordinary hardware exceeded its restrained gain');
  }
  sound.stop(); assert.ok(audio.nodes.every(node => node.disconnected));
});

test('metal returns require real nearby steps; suspension cancels scheduled returns and does not replay a stop', () => {
  for (const panner of [false, true]) {
    const audio = fakeAudio({ panner }), sound = createSourceShoreAudio(audio);
    sound.update(shore()); assert.equal(sound.footstep(), false);
    sound.update(shore({ distanceToBankMetres: 4, distanceToLiftMetres: 4, lift: { phase: 'rising', moving: true } }));
    assert.equal(sound.footstep(), true);
    const finite = audio.nodes.find(node => node.kind === 'tone');
    assert.ok(finite.starts[0] > audio.ctx.currentTime, 'metal answer is a physical delayed return');
    audio.ctx.state = 'suspended'; sound.pause();
    assert.equal(sound.snapshot().voices, 0); assert.ok(audio.nodes.every(node => node.disconnected));
    audio.ctx.state = 'running'; const count = audio.nodes.length;
    sound.update(shore({ distanceToBankMetres: 4, distanceToLiftMetres: 4, lift: { phase: 'upper', moving: false } }));
    assert.equal(audio.nodes.length, count, 'focus return replayed a stop');
    sound.update(null); sound.stop(); assert.equal(sound.footstep(), false);
  }
});

test('late audio ownership cannot turn an unobserved lift arrival into a contact', () => {
  const audio = fakeAudio(); let available = false;
  const sound = createSourceShoreAudio({ getAudio: () => available ? audio.getAudio() : null });
  sound.update(shore({ distanceToLiftMetres: 1, lift: { phase: 'rising', moving: true } }));
  available = true;
  sound.update(shore({ distanceToLiftMetres: 1, lift: { phase: 'upper', moving: false } }));
  assert.equal(audio.nodes.length, 0);
  sound.update(shore({ distanceToLiftMetres: 1, lift: { phase: 'lowering', moving: true } }));
  audio.ctx.state = 'suspended'; sound.update(shore({ distanceToLiftMetres: 1, lift: { phase: 'lowering', moving: true } }));
  assert.equal(sound.snapshot().voices, 0);
  audio.ctx.state = 'running'; const count = audio.nodes.length;
  sound.update(shore({ distanceToLiftMetres: 1, lift: { phase: 'waiting', moving: false } }));
  assert.equal(audio.nodes.length, count); sound.stop();
});

test('live main renderer guards keep obsolete Source overlays out of the first void', () => {
  const calls = [], frame = shore(), sentinel = new Error('plan boundary');
  const runtime = { sourceShoreFrame: () => frame, horizonFrame: () => null,
    landingPortalFrame: () => null, sourceEmergencyLightingFrame: () => ({ active: true, strength: 1 }),
    sourceVoidFrame: () => ({ proper: true, whiteout: 1 }), localLights: () => [],
    geometry: { renderPlanFor() { throw sentinel; } } };
  const context = vm.createContext({ usingSourceSpace: () => true, chunkSurfRuntime: runtime,
    px: 4, py: -100, sourceShoreOutside, syncSourceDockDoorAudio() {}, syncSourceShoreAudio() {}, applySourceLighting() {},
    shakeMode: () => 'full', flashMode: () => 'full', liveLightCircuits: () => [], performance: { now: () => 1000 }, sourceFaultTransitionStartedAt: 0,
    sourceFaultFrame: details => details, R3: {
      r3dSetSourceShore(value) { calls.push(['shore', value]); },
      r3dSetSourceWhiteout(value) { calls.push(['white', value]); },
      r3dSetSourceEmergency(value) { calls.push(['red', value]); },
      r3dSetSourceFault(value) { calls.push(['fault', value]); }, r3dSetLocalLights() {}, r3dSetEmergencyShadows() {},
    } });
  vm.runInContext(mainFunction('syncSourceRender'), context);
  assert.throws(() => context.syncSourceRender(), error => error === sentinel);
  assert.equal(calls.find(([kind]) => kind === 'shore')[1], frame);
  assert.equal(calls.find(([kind]) => kind === 'white')[1], 0);
  assert.equal(calls.find(([kind]) => kind === 'red')[1], 0);
  assert.equal(calls.find(([kind]) => kind === 'fault')[1].proper, false);
  frame.proper = true;
  calls.length = 0;
  assert.throws(() => context.syncSourceRender(), error => error === sentinel);
  assert.equal(calls.find(([kind]) => kind === 'white')[1], 1, 'later Source lost its own presentation');
  assert.equal(calls.find(([kind]) => kind === 'red')[1].enabled, true);
});

test('live main selects physical shore torch and retains the later Source mode', () => {
  const frame = shore(), context = vm.createContext({
    chunkSurfRuntime: { sourceShoreFrame: () => frame, sourceFlashlightFrame: () => ({ xray: true, active: true, flicker: .2 }) },
    sourceShoreOutside, performance: { now: () => 1 }, shakeMode: () => 'full', flashMode: () => 'full',
  });
  vm.runInContext(mainFunction('sourceEmergencyTorchFrame'), context);
  const physical = context.sourceEmergencyTorchFrame();
  assert.equal(physical.profile, 'shore'); assert.equal(physical.xray, false); assert.equal(physical.active, false);
  assert.equal(physical.flicker, 1);
  frame.active = false; assert.equal(context.sourceEmergencyTorchFrame().xray, true);
});

test('held W+D can freely cross the void with the same metre speed as a cardinal step', () => {
  const frame = shore(), context = vm.createContext({
    RENDERER: '3d', keysDown: new Set(['KeyW', 'KeyD']), keyboardMotionAxes, sourceShoreOutside,
    CONTROLLER: { controllerMotionAxes: () => ({ moveX: 0, moveY: 0 }) },
    clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
    R3: { r3dStepDelta: () => [0, -1] }, usingSourceSpace: () => true,
    chunkSurfRuntime: { sourceShoreFrame: () => frame, sourceVoidFrame: () => ({ sceneDock: false }) },
    currentMoveIntervalMs: () => 104.166667,
  });
  for (const name of ['independentControls', 'combinedIndependentMotionAxes', 'arrowDelta', 'currentStepIntervalMs']) {
    vm.runInContext(mainFunction(name), context);
  }
  assert.deepEqual(Array.from(context.arrowDelta()), [1, -1]);
  const cardinalSpeed = .5 / context.currentStepIntervalMs(0, -1);
  const diagonalSpeed = Math.hypot(.5, .5) / context.currentStepIntervalMs(1, -1);
  assert.ok(Math.abs(cardinalSpeed - diagonalSpeed) < 1e-10);
  frame.active = false;
  assert.deepEqual(Array.from(context.arrowDelta()), [0, -1], 'later Source input scheme changed');
});

test('a real mid-rise save restores exact yaw and pitch without replacing the ordinary camera save', async () => {
  const preset = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LANDING, { seed: 4417 });
  const riding = createSourceSpaceRuntime({ initialState: reduceChunkSurf(preset.state, { type: 'SOURCE_LANDING_DOOR_OPENED' }) });
  const origin = riding.state().landscapeOrigin;
  const point = (z) => ({ x: origin.x + 8, y: origin.y + z / .5, facing: 0 });
  const from = point(-381.5), body = point(-383);
  riding.setPlayerPosition(from); riding.tick(7, { px: from.x, py: from.y, facing: 0 });
  assert.equal(riding.geometry.canStep(from.x, from.y, body.x, body.y).ok, true);
  riding.onStep(from, body); riding.setPlayerPosition(body);
  riding.tick(2, { px: body.x, py: body.y, facing: 0 });
  const before = riding.sourceShoreFrame(); assert.equal(before.lift.phase, 'rising');
  const desired = { yaw: 1.1734, pitch: -.2387 }, ordinary = { yaw: -.81, pitch: .14 };
  const capture = vm.createContext({ chunkSurfRuntime: riding, sourceShoreOutside, R3: { r3dLookAngles: () => desired } });
  vm.runInContext(mainFunction('sourceShoreCameraPatch'), capture);
  const patch = capture.sourceShoreCameraPatch();
  assert.equal(patch.sourceView.yaw, desired.yaw); assert.equal(patch.view, undefined);
  await withTransientGameState({ save: freshSave() }, async () => {
    saveCommit({ ...patch, view: ordinary, area: 'source-space', px: body.x, py: body.y, chunkSurf: riding.state() });
    assert.deepEqual(getSave().view, ordinary, 'the ordinary camera was overwritten');
    assert.equal(getSave().sourceView.yaw, desired.yaw, 'normalization lost the scoped Source view');
    const restored = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(getSave().chunkSurf)) });
    const look = { yaw: 0, pitch: 0 };
    const context = vm.createContext({
      CHUNK_SURF_PHASE, CHAPEL_TOWER_PHASE: {}, sourceShoreOutside,
      stopOutskirtsStreetAudio() {}, resetOutskirtsLastLight() {}, endSourceHaystackMosh() {}, endSourceBracketPresence() {},
      normalizeChunkSurfState, reduceChunkSurf, chapelTowerState: () => ({ phase: 'none' }), getSave,
      PRES: { isActive: () => false, despawn() {} }, createSourceSpaceRuntime: () => restored,
      R3: { r3dSetIndoorRain() {}, r3dSetFacing(value) { look.yaw = value * Math.PI / 2; },
        r3dFacing: () => Math.round(look.yaw / (Math.PI / 2)), r3dSetSourceSurface() {},
        r3dSetLookAngles(value) { look.yaw = value.yaw; look.pitch = value.pitch; } },
      sourceFearFloor: 0, sourcePresenceWasActive: false, sourceFinalCombatOpen: false, chunkSurfRuntime: null,
      px: 0, py: 0, renderMove: null, motionRig: null, trail: [],
      applyLensPreset() {}, syncSourceRender() {}, restoreFromSourceSpace() {}, windowChoreography: { sourceFrame() {} },
      CR: { fx: { hold() {} } }, saveCommit() {}, SOURCE_ENTRY: { facing: 0 },
    });
    vm.runInContext(mainFunction('activateSourceSpace'), context);
    context.activateSourceSpace(restored.state(), { position: body, resume: true });
    assert.deepEqual(look, desired);
    assert.equal(context.px, body.x); assert.equal(context.py, body.y);
    assert.equal(restored.sourceShoreFrame().lift.floor, before.lift.floor);
    assert.equal(restored.geometry.renderedFloorAt(), before.bodyFloor);
  });
});
