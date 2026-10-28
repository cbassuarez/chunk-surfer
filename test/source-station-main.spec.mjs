import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createElsewhereBeds } from '../src/audio/elsewhere-beds.js';
import { createPayphoneLine } from '../src/audio/payphone-line.js';
import { advanceStationWalk } from '../src/game/station-walk.js';
import { createStationHomeState, updateStationHome } from '../src/game/station-home.js';
import { createStationRealm, normalizeStationRealm, stationRealmFrame, moveStationRealm,
  beginStationRealmReturn, stationRealmAtWindow } from '../src/game/station-realms.js';
import { SOURCE_CHAPEL_OUTSKIRTS } from '../src/data/source-level.js';
import { keyboardMotionAxes } from '../src/input/input-manager.js';

// Run the production functions themselves, with browser/audio boundaries replaced.
// A wiring or lifecycle change in main therefore changes these tests' behaviour.
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function section(from, to) {
  const begin = main.indexOf(from), end = main.indexOf(to, begin);
  assert.ok(begin >= 0 && end > begin, `production section exists: ${from}`);
  return main.slice(begin, end);
}
const production = [
  section('function cancelRecordingPressureAudio(){','\nfunction recordingPressureFrame('),
  section('function clearSourceRuntime(', '\nfunction usingStairAnomaly('),
  section('let elsewhereBeds=null;', '\n// PUT BACK WRONG.'),
  section('var stationEdgeBed=null;', '\n// A DOOR, LOOKED AT'),
  section('function resetRunAudio(', '\nfunction enterStory('),
  section('function tickSourceSpace(dt){', '\nlet stairAnomalyEnteredAt='),
  section('function step(dx,dy){', '\nfunction teleport('),
  section('function currentControlMode(){', '\nfunction physicalPointFor('),
].join('\n');
const homeKeyWiring=section('    const bare = !e.metaKey && !e.ctrlKey;', '    if(BINDINGS.isRadioControlEvent(e))');
const copy = (value) => JSON.parse(JSON.stringify(value));

test('station weather stays outside occupied realms while glass shares the night storm', () => {
  const sandbox={usingSourceSpace:()=>true,sourceDoorArrival:null,
    chunkSurfRuntime:{stationRealmFrame:()=>null,doorFieldWeather:()=>({sky:true})}};
  vm.createContext(sandbox);
  vm.runInContext(section('function sourceDoorFieldSky(){','\nfunction tickStorm(')+'\nglobalThis.sky=sourceDoorFieldSky;',sandbox);
  assert.equal(sandbox.sky(),true);
  for(const world of ['burning','flood','inverted','two-moons','whiteout','glass-storm']){
    sandbox.chunkSurfRuntime.stationRealmFrame=()=>({world});
    assert.equal(sandbox.sky(),world==='glass-storm',world);
  }
  sandbox.chunkSurfRuntime.stationRealmFrame=()=>null;
  sandbox.sourceDoorArrival={};
  assert.equal(sandbox.sky(),false,'the physical chapel threshold ends outdoor weather');
});

function fakeAudio() {
  const nodes = [];
  const param = () => ({ value: 0, setValueAtTime(value) { this.value = value; },
    setTargetAtTime(value) { this.value = value; }, cancelScheduledValues() {} });
  const node = (kind) => {
    const result = { kind, gain: param(), frequency: param(), Q: param(), pan: param(),
      connections: [], disconnected: false,
      connect(to) { this.connections.push(to); }, disconnect() { this.disconnected = true; },
    };
    if (kind === 'noise' || kind === 'tone') {
      result.starts = []; result.stops = [];
      result.start = (...args) => result.starts.push(args);
      result.stop = (...args) => result.stops.push(args);
    }
    nodes.push(result); return result;
  };
  return { nodes, context: { currentTime: 10, sampleRate: 8000,
    createGain: () => node('gain'), createBiquadFilter: () => node('filter'),
    createStereoPanner: () => node('pan'), createOscillator: () => node('tone'),
    createBufferSource: () => node('noise'), createWaveShaper: () => node('shaper'),
    createAnalyser: () => node('analyser'),
    createBuffer: (_channels, length) => ({ getChannelData: () => new Float32Array(length) }),
  } };
}
const relicWorlds = ['burning', 'flood', 'inverted', 'two-moons', 'glass-storm'];
const edge = { sides: [{ side: -1, near: .5, facing: .2 }, { side: 1, near: 1, facing: .9 }] };

function realmVisit({ variant = 5, home = true, z = 67.5 } = {}) {
  const realm = createStationRealm({ variant, home, seed: .4, entryDoorId: 'realm-door',
    returnPose: { x: 10, y: 20, facing: 0, yaw: 0, pitch: 0 } });
  realm.pose.z = z;
  return normalizeStationRealm(realm);
}

function harness({ time = 0, walk = null, frame = null, realm = null, earned = [], flags = {} } = {}) {
  const audio = fakeAudio(), destination = { name: 'world-sfx' };
  const line = createPayphoneLine({ context: audio.context, destination: { name: 'dialog' }, box: destination });
  const stationNodeStart = audio.nodes.length;
  const timers = new Map(), render = {}, rings = [], thoughts = [], commits = [], speech = [], events = [], steps = [], realmMoves = [], cueCalls = [];
  let serial = 0, releases = 0, coastalHandoffs=0, composure = 4, savedWalk = copy(walk), currentFrame = copy(frame), blocksWorld = false, blocksInput = false;
  let localRealm = realm ? normalizeStationRealm(realm) : null, lastReturn = null;
  let look = { yaw: 0, pitch: 0 }, compositorRestores = 0;
  const receipts = [...earned];
  if (localRealm) currentFrame = { id: localRealm.entryDoorId, variant: localRealm.variant,
    world: localRealm.world, home: localRealm.home, released: false, forward: frame?.forward || [0, -1] };
  const currentCrossing = () => currentFrame && { ...copy(currentFrame), ...(localRealm ? {
    realm: stationRealmFrame(localRealm, time), phase: localRealm.stage,
    progress: stationRealmFrame(localRealm, time).decoherence, reveal: 1,
  } : {}) };
  const save = { flags: { ...flags } };
  const runtime = {
    stationTime: () => time, advanceStationTime(dt) {
      time += dt;
      if (localRealm?.returnStartedAt != null && time - localRealm.returnStartedAt >= localRealm.returnDuration) {
        lastReturn = { id: localRealm.entryDoorId, world: localRealm.world, home: localRealm.home,
          windowReached: localRealm.windowReached, reason: localRealm.returnReason, returnPose: { ...localRealm.returnPose } };
        if (!localRealm.home && localRealm.world !== 'whiteout' && !receipts.includes(localRealm.world)) receipts.push(localRealm.world);
        localRealm = null; currentFrame = null;
      }
    },
    stationWalkState: () => copy(savedWalk), setStationWalkState(value) { savedWalk = copy(value); },
    stationRelicWorlds: () => receipts, setStationHomeOpen(value) { this.homeOpen = value; },
    releaseHomeCrossing() {
      releases++;
      if (localRealm) return beginStationRealmReturn(localRealm, time, localRealm.windowReached ? 'home' : 'retreat');
      if (currentFrame) currentFrame.released = true;
      return true;
    },
    doorCrossingFrame: currentCrossing,
    stationRealmFrame: () => stationRealmFrame(localRealm, time),
    stationRealmHomeState: () => copy(localRealm?.homeState || {}),
    setStationRealmHomeState(value) { if (localRealm) localRealm.homeState = copy(value); },
    setStationRealmLook(value) { if (localRealm) Object.assign(localRealm.pose, value); },
    markHomeWindowReached() { if (!stationRealmAtWindow(localRealm)) return false; localRealm.windowReached = true; return true; },
    moveStationRealm(delta) { realmMoves.push(copy(delta)); return { ...moveStationRealm(localRealm, delta, time), frame: stationRealmFrame(localRealm, time) }; },
    stationLastRealmReturn: () => copy(lastReturn),
    traversalFrame: () => ({ active: false }),
    enterTowerLand(id) { this.enteredLand = id; return { x: 5, y: 6, facing: 2 }; },
    state: () => ({ phase: 'chapel-outskirts', landscapeOrigin: { y: 0 },
      station: { time, walk: copy(savedWalk), crossing: currentCrossing(), realm: copy(localRealm), entries: receipts.map((world) => ({ world, returnedAt: time })) } }),
    bellsFrame: () => ({ active: false }), horizonFrame: () => ({ active: true }), setPlayerPosition() {},
  };
  const noOp = () => {};
  const renderer = new Proxy({ r3dFacing: () => 0, r3dLookAngles: () => ({ ...look }),
    r3dStepDelta(sign = 1) {
      const ring = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
      const k = ((Math.round(look.yaw / (Math.PI / 4)) % 8) + 8) % 8;
      return ring[k].map((value) => value * sign);
    },
    r3dSetLookAngles(value) { look = { ...look, ...value }; render.r3dSetLookAngles = value; } }, {
    get(target, key) { return target[key] || ((value) => { render[key] = value; }); },
  });
  const sandbox = {
    chunkSurfRuntime: runtime, actx: audio.context, sfxGain: destination, master: null,
    sourceDemolitionAudio: null, sourceEarthfallAudio:null,
    sourceDriveSession:null,sourcePubScene:null,sourceContinuationScene:null,coastalMemoryScene:null,
    chapelChoirAudio:null,chapelChoirAudioFrame:null,chapelChoirOcclusionKey:'',chapelChoirOcclusion:new Map(),
    chapelServiceAudio:null,chapelServiceAudioFrame:null,chapelMurmurAudio:null,chapelServiceOcclusionKey:'',chapelServiceOcclusion:new Map(),
    brendanBellAudio:null,brendanSoundFrame:null,brendanSoundOcclusionKey:'',brendanSoundOcclusion:new Map(),
    renderMove: null,
    controllerGameplayAxes: () => ({ moveX: 0, moveY: 0, turnX: 0, lookY: 0 }),
    R3: renderer, px: 0, py: 0, CELL: 1, SOURCE_CHAPEL_OUTSKIRTS,
    RENDERER: '3d', keysDown: new Set(), keyboardMotionAxes,
    beginCoastalMemoryJourney:()=>{coastalHandoffs++;return true;},
    CONTROLLER: { controllerMotionAxes: () => ({ moveX: 0, moveY: 0 }) },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    CHUNK_SURF_PHASE: { CHAPEL_OUTSKIRTS: 'chapel-outskirts' }, createElsewhereBeds, advanceStationWalk,
    createStationHomeState, updateStationHome,
    usingSourceSpace: () => !!sandbox.chunkSurfRuntime,
    phoneWorldLine: () => ({ ringBellNearby(options) {
      const before = audio.nodes.length, handle = line.ringBellNearby(options);
      rings.push({ options, handle, nodes: audio.nodes.slice(before) }); return handle;
    } }),
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    releaseChildhoodWindow() { render.windowReleased = true; },
    shakeMode: () => 'reduced', NO_THINK: false,
    runtimeTree: () => Object.fromEntries(['home.walk', 'home.window', 'home.stay', ...relicWorlds.map((world) => `relic.${world}`)]
      .map((id) => [id, { lines: [{ text: id }] }])),
    think(_id, _tree, options) { thoughts.push(options); return true; },
    SPEECH: { say(line) { speech.push(line); }, clearSpeech: noOp, isSpeaking: () => true },
    flagTest: (key) => !!save.flags[key], flagApply(keys) { for (const key of keys) save.flags[key] = true; },
    getSave: () => save, saveCommit(patch) { commits.push(copy(patch)); Object.assign(save, patch); },
    REC: { composure: () => composure, composureCeiling: () => 20, setComposure(value) { composure = value; compositorRestores++; },
      saveRecState: () => ({ composure }), emitStepNoise: noOp, isRecording: () => false },
    fireCue: (id) => cueCalls.push(id), pushEvent: (text) => events.push(text), CUES: { stopAllCues: noOp, playCue: noOp, CUE: {} },
    paused: false, document: { hidden: false, hasFocus: () => true }, hushRunActive: false,
    scenes: { blocksWorld: () => blocksWorld, blocksInput: () => blocksInput }, PRES: { isActive: () => false },
    windowChoreography: null, sourceBellFieldAudio: null, sourceFaultTransitionStartedAt: 0,
    towerBellDirector: null, bellTowerRuntime: null, bellTowerAudio: null,
    electricalHumRuntime: null, fountainWaterRuntime: null, forkToneRuntime: null,
    metronomeFieldRuntime: null, plantPipeRuntime: null, stopListeningGut: null, stopListeningAudioFrame: null, personalWindowEffects: { end: noOp },
    RT: { footstep: (...args) => steps.push(args), setBed: noOp }, STORY: { stopAll: noOp }, STAB: { reportThreat: noOp },
    mischiefNextAtMs: 0, mischiefQuietUntilMs: 0,
    recordingPressureVoices:new Set(),recordingPressurePerformance:{reset:()=>events.push('recording-pressure-reset')},
    setupHandoffBlocksMovement: () => false, sourceDoorArrival: null, storyMode: false,
    stairTriggerCrossed: () => false, performance: { now: () => time * 1000 },
    sourceCameraPatch: () => ({}), lastMoveAtMs: 0, stepCount: 0,
    window: {}, movingTimer: null, trail: [], revealAround: noOp,
  };
  for (const name of ['stopOutskirtsStreetAudio', 'resetOutskirtsLastLight', 'stopSourceDockDoorAudio', 'stopSourceShoreAudio',
    'endHorizonScore', 'stopBellTowerRuntime', 'clearInstrument', 'stopHushAudioRuntime', 'stopAllVoices',
    'stopWorldLayerVoice', 'silenceAmbientDrone', 'silenceSampleField', 'endSourceHaystackMosh',
    'endSourceBracketPresence', 'tickHorizonScore', 'speakHorizonMarker', 'syncOutskirtsNight', 'tickPayphone', 'syncSourceRender',
    'cancelApparitionApplause']) sandbox[name] = noOp;
  vm.createContext(sandbox);
  vm.runInContext(production + `\nglobalThis.api={clearSourceRuntime,resetRunAudio,syncElsewhereBeds,syncStationEdgeSound,
    syncStationErrand,homeWalkStep,tickHomeWalk,tickSourceSpace,stationFootfall,step,arrowDelta,
    stationRealmStep,tickStationRealmHome,stationRealmLook,interactStationRealm,stationRealmActionLabel,
    stationRealmHomeActions,cycleStationRealmAction,stationRealmHomeKey,
    homeKey:(e)=>{${homeKeyWiring}},
    interaction:(down)=>{stationInteractionDown=down;},
    snapshot:()=>({way:stationWay,canvas:homeWindowCanvas,bed:stationEdgeBed,elsewhere:elsewhereBeds})};`, sandbox,
  { filename: 'src/main.js' });
  return { api: sandbox.api, sandbox, audio, stationNodeStart, runtime, render, rings, thoughts, commits, speech, timers, save, events, steps, realmMoves, cueCalls,
    get time() { return time; }, get releases() { return releases; }, get walk() { return savedWalk; }, get composure() { return composure; },
    get restores() { return compositorRestores; }, get coastalHandoffs() { return coastalHandoffs; }, get realm() { return localRealm; },
    setLook(value) { look = { ...look, ...value }; },
    blockWorld(value) { blocksWorld = value; }, blockInput(value) { blocksInput = value; }, line };
}

test('Source teardown cancels the actual station graphs and bell, and clears its renderer attachments', () => {
  const h = harness({ realm: realmVisit() });
  const frame = h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.api.snapshot().way.walk, null, 'a physical realm must not create a virtual painted walk');
  assert.equal(h.render.r3dSetTableau, undefined);
  h.api.syncElsewhereBeds([], frame);
  assert.equal(h.api.snapshot().elsewhere.activeCount(), 2, 'window warmth and snow should exist before teardown');
  h.api.syncStationEdgeSound(edge); h.runtime.advanceStationTime(6); h.api.syncStationEdgeSound(edge);
  const bed = h.api.snapshot().bed, ring = h.rings[0];
  assert.equal(ring.options.destination, bed.wall);
  assert.deepEqual(bed.wall.connections, [bed.out]);
  assert.ok(bed.out.connections.includes(bed.pan));
  assert.equal(bed.pan.connections[0], h.sandbox.sfxGain);
  assert.ok(ring.nodes.some((node) => node.connections.includes(bed.wall)));
  assert.ok(ring.nodes.every((node) => !node.connections.includes(h.sandbox.sfxGain)), 'ring bypassed wall/facing gain');
  assert.equal(h.api.clearSourceRuntime(), true);
  assert.equal(h.sandbox.chunkSurfRuntime, null);
  assert.ok(h.audio.nodes.slice(h.stationNodeStart).every((node) => node.disconnected));
  assert.ok(ring.nodes.filter((node) => node.starts).every((node) => node.stops.length === 2), 'finite bell was not cancelled');
  for (const key of ['r3dSetTableau', 'r3dSetSourceTowerView', 'r3dSetSourceCrossing', 'r3dSetSourceReflection']) assert.equal(h.render[key], null);
  for (const key of ['r3dSetSourcePortals', 'r3dSetSourceOpenings', 'r3dSetSourceDoorLights']) assert.equal(h.render[key].length, 0);
  assert.equal(h.api.snapshot().way.walk, null); assert.equal(h.api.snapshot().canvas, null);
  assert.equal(h.api.clearSourceRuntime(), false, 'teardown also remains safe after the runtime is absent');
  h.line.destroy();
});

test('a run reset immediately stops station beds already fading from a route exit', () => {
  const h = harness();
  h.api.syncStationEdgeSound(edge); h.runtime.advanceStationTime(6); h.api.syncStationEdgeSound(edge);
  h.api.syncStationEdgeSound(null);
  assert.ok(h.timers.size > 0, 'the route exit should first have scheduled its normal tail');
  assert.ok(h.audio.nodes.slice(h.stationNodeStart).some((node) => node.starts && !node.disconnected));
  let pressureStops=0;for(let i=0;i<2;i++)h.sandbox.recordingPressureVoices.add({stop:()=>pressureStops++});
  h.api.resetRunAudio('test-new-run');
  assert.equal(pressureStops,2);assert.equal(h.sandbox.recordingPressureVoices.size,0);
  assert.equal(h.events.filter(e=>e==='recording-pressure-reset').length,1,'new run resets the separate recorder-pressure performance');
  assert.equal(h.timers.size, 0, 'new run must cancel the old cleanup timer');
  assert.ok(h.audio.nodes.slice(h.stationNodeStart).every((node) => node.disconnected), 'the old tail still reaches the new run');
  h.api.resetRunAudio('test-repeat'); h.line.destroy();
});

test('reload reconciles earned relics once without relying on the vanished crossing', () => {
  const h = harness({ earned: relicWorlds });
  h.api.syncStationErrand(null);
  for (const world of relicWorlds) assert.equal(h.save.flags[`station.relic.${world}`], true);
  assert.equal(h.runtime.homeOpen, true); assert.equal(h.commits.length, 2);
  assert.equal(h.commits[0].chunkSurf.station.entries.length, 5);
  assert.equal(h.speech.length, 0, 'full inspections belong in the case rather than compulsory speech');
  assert.equal(h.events.length, 5);
  h.api.syncStationErrand(null);
  assert.equal(h.commits.length, 2); assert.equal(h.events.length, 5, 'reconciliation repeats the reward announcement');
  h.line.destroy();
});

test('receipts can be reconciled during a crossing while their presentation waits for return', () => {
  const h = harness({ earned: ['burning'], frame: { id: 'occupied', variant: 1, world: 'flood' } });
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.save.flags['station.relic.burning'], true);
  assert.equal(h.save.flags['station.relicShown.burning'], undefined);
  assert.equal(h.events.length, 0); assert.equal(h.speech.length, 0); assert.equal(h.thoughts.length, 0);
  h.api.syncStationErrand(null);
  assert.equal(h.events.length, 1);
  assert.equal(h.save.flags['station.relicShown.burning'], true);
  h.api.syncStationErrand(null); assert.equal(h.events.length, 1);
  h.line.destroy();
});

test('production movement routes every direction into real local ground and leaves the Source anchor still', () => {
  const h = harness({ realm: realmVisit({ variant: 0, home: false, z: 1 }) });
  h.api.step(1, 0); h.api.step(0, -1); h.api.step(0, 1);
  assert.equal(h.realmMoves.length, 3);
  assert.ok(h.realmMoves[0].dx > 0);
  assert.ok(h.realmMoves[1].dz > 0);
  assert.ok(h.realmMoves[2].dz < 0);
  assert.equal(h.sandbox.px, 0); assert.equal(h.sandbox.py, 0);
  assert.equal(h.realm.steps, 0, 'movement updates are not completed footfalls');
  for (let i = 0; i < 8; i += 1) h.api.step(1, 0);
  assert.equal(h.realm.steps, 1); assert.equal(h.steps.length, 1);
  assert.equal(h.sandbox.stepCount, 1);
  h.realm.pose.x = 2.77;
  const before = { steps: h.realm.steps, stride: h.realm.strideM, sound: h.steps.length };
  for (let i = 0; i < 5; i += 1) h.api.step(1, 0);
  assert.equal(h.realm.steps, before.steps); assert.equal(h.realm.strideM, before.stride);
  assert.equal(h.steps.length, before.sound, 'blocked motion must not sound or spend walking steps');
  h.blockInput(true); const calls = h.realmMoves.length;
  h.api.step(0, -1); assert.equal(h.realmMoves.length, calls);
  h.blockInput(false);
  for (const gate of ['paused', 'hidden', 'blocked']) {
    if (gate === 'paused') h.sandbox.paused = true;
    if (gate === 'hidden') h.sandbox.document.hidden = true;
    if (gate === 'blocked') h.blockWorld(true);
    h.api.step(0, -1); assert.equal(h.realmMoves.length, calls, `${gate} leaked movement into the realm`);
    h.sandbox.paused = false; h.sandbox.document.hidden = false; h.blockWorld(false);
  }
  h.line.destroy();
});

test('saved local gaze restores through a rotated doorway once and later looking survives repeated renders and reload', () => {
  const realm = realmVisit({ variant: 0, home: false, z: 1 });
  realm.pose.yaw = .9; realm.pose.pitch = .25;
  const frame = { forward: [1, 0] }, entryYaw = Math.PI / 2;
  const h = harness({ realm, frame });
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.ok(Math.abs(h.render.r3dSetLookAngles.yaw - (entryYaw + .9)) < 1e-10);
  assert.equal(h.render.r3dSetLookAngles.pitch, .25);
  assert.ok(Math.abs(h.realm.pose.yaw - .9) < 1e-10);
  h.setLook({ yaw: entryYaw - .7, pitch: -.15 });
  for (let i = 0; i < 5; i += 1) h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.ok(Math.abs(h.realm.pose.yaw + .7) < 1e-10, 'routine rendering must not restore the old entry gaze');
  assert.equal(h.realm.pose.pitch, -.15);
  const saved = copy(h.runtime.state().station.realm);
  const reloaded = harness({ realm: saved, frame });
  reloaded.api.syncStationErrand(reloaded.runtime.doorCrossingFrame());
  assert.ok(Math.abs(reloaded.render.r3dSetLookAngles.yaw - (entryYaw - .7)) < 1e-10);
  assert.equal(reloaded.render.r3dSetLookAngles.pitch, -.15);
  assert.deepEqual(copy(reloaded.realm.pose), saved.pose);
  h.line.destroy(); reloaded.line.destroy();
});

test('held keyboard movement follows continuous realm gaze through an oblique doorway and reaches the home window', () => {
  const entryYaw = -.12802500708305276;
  const forward = [Math.sin(entryYaw), -Math.cos(entryYaw)];
  const h = harness({ realm: realmVisit({ z: 1 }), frame: { forward } });
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  h.sandbox.keysDown.add('KeyW');
  for (let n = 0; n < 780; n += 1) {
    const delta = h.api.arrowDelta();
    h.api.step(...delta);
  }
  assert.ok(Math.abs(h.realm.pose.x) < 1e-8, 'looking straight ahead must not accumulate lateral drift');
  assert.ok(Math.abs(h.realm.pose.z - 67.3) < 1e-8);
  assert.equal(h.runtime.stationRealmFrame().atWindow, true);
  assert.equal(h.realm.homeState.recognized, true);
  assert.equal(h.restores, 1);
  h.sandbox.keysDown.clear(); h.sandbox.keysDown.add('KeyD');
  const before = { ...h.realm.pose };
  h.api.step(...h.api.arrowDelta());
  assert.ok(h.realm.pose.x > before.x);
  assert.ok(Math.abs(h.realm.pose.z - before.z) < 1e-8, 'strafe must use the same continuous local basis');
  h.line.destroy();
});

test('broad window arrival restores once and indefinite viewing has no automatic narration or departure', () => {
  const h = harness({ realm: realmVisit() });
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.composure, 20); assert.equal(h.restores, 1);
  assert.equal(h.save.flags['station.home.restored'], true);
  assert.equal(h.save.flags['station.jumper'], undefined);
  for (let i = 0; i < 10; i += 1) {
    h.api.tickSourceSpace(1000); h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  }
  assert.equal(h.restores, 1); assert.equal(h.releases, 0);
  assert.equal(h.thoughts.length, 0); assert.equal(h.save.flags['station.jumper'], undefined);
  assert.equal(h.api.snapshot().canvas, null);
  h.line.destroy();
});

test('reload reconciles window recognition checkpointed before its composure grant exactly once', () => {
  for (const checkpoint of ['recognized', 'window-reached']) {
    const realm = realmVisit({ z: 60 });
    if (checkpoint === 'recognized') realm.homeState = { recognized: true };
    else realm.windowReached = true;
    const h = harness({ realm });
    assert.equal(h.save.flags['station.home.restored'], undefined);
    h.api.syncStationErrand(h.runtime.doorCrossingFrame());
    assert.equal(h.composure, 20, `${checkpoint} must recover the interrupted grant even away from the sill`);
    assert.equal(h.restores, 1);
    assert.equal(h.save.flags['station.home.restored'], true);
    const grant = h.commits.find((commit) => commit.flags?.['station.home.restored']);
    assert.equal(grant?.rec?.composure, 20, 'the once-only marker and restored body must share a save commit');
    assert.ok(grant.chunkSurf.station.realm, 'the same commit retains the durable physical visit');
    assert.equal(h.save.flags['station.jumper'], undefined);
    h.api.syncStationErrand(h.runtime.doorCrossingFrame());
    assert.equal(h.restores, 1, 'reconciliation cannot repeatedly refill composure');
    h.line.destroy();
  }
});

test('a durable home return recovers a missing composure grant before awarding its jumper', () => {
  const realm = realmVisit();
  realm.windowReached = true;
  realm.homeState = { recognized: true, departed: true };
  beginStationRealmReturn(realm, 0, 'home');
  const h = harness({ realm });
  h.runtime.advanceStationTime(.5);
  assert.equal(h.runtime.stationRealmFrame(), null);
  h.api.syncStationErrand(null);
  assert.equal(h.restores, 1);
  assert.equal(h.save.flags['station.home.restored'], true);
  assert.equal(h.save.flags['station.jumper'], true);
  assert.equal(h.commits.at(-1).rec.composure, 20);
  h.api.syncStationErrand(null);
  assert.equal(h.restores, 1);
  assert.equal(h.events.filter((text) => text.includes("LYLE'S JUMPER")).length, 1);
  h.line.destroy();
});

test('reload completes a checkpointed departure decision before its release and jumper grants', () => {
  const realm = realmVisit();
  realm.windowReached = true;
  realm.homeState = { recognized: true, departed: true };
  const h = harness({ realm });
  assert.equal(h.realm.stage, 'inside');
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.realm.stage, 'returning', 'the durable choice cannot leave a departed helper trapped inside');
  assert.equal(h.releases, 1);
  assert.equal(h.save.flags['station.home.departed'], true);
  assert.equal(h.save.flags['station.jumper'], undefined);
  assert.ok(Math.abs(Math.abs(h.realm.pose.yaw) - Math.PI) < 1e-10, 'the interrupted turn finishes before reassembly');
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.releases, 1, 'repeated renders cannot restart the departure');
  h.runtime.advanceStationTime(.5);
  h.api.syncStationErrand(null);
  assert.equal(h.save.flags['station.jumper'], true);
  h.api.syncStationErrand(null);
  assert.equal(h.events.filter((text) => text.includes("LYLE'S JUMPER")).length, 1);
  assert.equal(h.restores, 1);
  h.line.destroy();
});

test('LOOK remains repeatable, STAY is optional, and selected TURN AWAY grants the jumper after reassembly', () => {
  const h = harness({ realm: realmVisit() });
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.api.stationRealmActionLabel(), 'LOOK');
  assert.equal(h.api.interactStationRealm(), true);
  assert.equal(h.thoughts.length, 1); assert.equal(h.thoughts[0].onDone, undefined);
  assert.equal(h.releases, 0); assert.equal(h.api.stationRealmActionLabel(), 'LOOK');
  h.api.interactStationRealm(); assert.equal(h.releases, 0, 'held LOOK must not become departure');
  h.api.interaction(false); h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  h.api.interactStationRealm();
  assert.equal(h.thoughts.length,2,'a fresh LOOK remains LOOK');
  h.api.interaction(false);h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  h.api.cycleStationRealmAction(1);assert.equal(h.api.stationRealmActionLabel(),'STAY');
  const before={...h.realm.pose};
  h.api.interactStationRealm();
  assert.equal(h.realm.homeState.settled,true);assert.equal(h.realm.homeState.attention,1);
  assert.deepEqual(h.realm.pose,before,'LOOK and STAY do not transform the camera or move the body');
  assert.equal(h.releases,0);assert.equal(h.speech.at(-1).text,'home.stay');
  h.api.interaction(false);h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  h.api.cycleStationRealmAction(1);assert.equal(h.api.stationRealmActionLabel(),'TURN AWAY');
  h.api.interactStationRealm();
  assert.equal(h.releases, 1); assert.equal(h.save.flags['station.home.departed'], true);
  assert.equal(h.save.flags['station.jumper'], undefined, 'the cloth must stay behind glass until the unseen fold');
  h.runtime.advanceStationTime(1); h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.save.flags['station.jumper'], true); assert.equal(h.save.flags['station.home.seen'], true);
  assert.equal(h.commits.at(-1).rec.composure, 20);
  assert.equal(h.commits.at(-1).chunkSurf.station.realm, null);
  h.api.syncStationErrand(null); assert.equal(h.events.filter((text) => text.includes("LYLE'S JUMPER")).length, 1);
  h.line.destroy();
});

test('side glances and tiny steps are harmless; measured outward travel while facing snow departs', () => {
  const h = harness({ realm: realmVisit() });
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  h.setLook({ yaw: Math.PI / 2 }); h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  h.api.step(1, 0); assert.equal(h.releases, 0);
  h.setLook({ yaw: Math.PI }); h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.releases, 0, 'merely facing snow should restore clarity without expelling him');
  for(let n=0;n<4;n++){h.api.step(0,1);assert.equal(h.releases,0,'one 0.085m tick cannot end the encounter');}
  h.api.step(0, 1); assert.equal(h.releases, 1);
  assert.equal(h.save.flags['station.home.departed'], true);
  assert.equal(h.save.flags['station.jumper'], undefined);
  h.line.destroy();
});

test('keyboard and controller can select leave immediately without LOOK or STAY, without blocking locomotion',()=>{
  for(const keys of [
    [{code:'KeyQ',key:'q'}],
    [{controller:true,controllerAction:'quiet',code:'ShiftLeft',key:'Shift'}],
    [{code:'Tab',key:'Tab'},{code:'Tab',key:'Tab'}],
    [{controller:true,controllerAction:'radio',code:'KeyV',key:'v'},{controller:true,controllerAction:'radio',code:'KeyV',key:'v'}],
  ]){
    const h=harness({realm:realmVisit()});
    h.api.syncStationErrand(h.runtime.doorCrossingFrame());
    let prevented=0;
    for(const key of keys)h.api.homeKey({...key,preventDefault(){prevented++;}});
    assert.equal(prevented,keys.length,'production story key wiring must consume contextual selector before world radio/quiet');
    assert.equal(h.api.stationRealmActionLabel(),'TURN AWAY');
    assert.equal(h.thoughts.length,0);assert.equal(h.releases,0);
    const before={...h.realm.pose};h.api.step(1,0);
    assert.ok(h.realm.pose.x>before.x,'the action rail is not a modal movement gate');
    h.api.interactStationRealm();assert.equal(h.releases,1);assert.equal(h.save.flags['station.jumper'],undefined);
    h.runtime.advanceStationTime(.5);h.api.syncStationErrand(null);
    assert.equal(h.save.flags['station.jumper'],true);
    h.line.destroy();
  }
});

test('close lateral inspection follows the facade without arming departure',()=>{
  const h=harness({realm:realmVisit({z:69.2})});
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.realm.homeState.recognized,true);
  h.setLook({yaw:Math.PI/2});
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  for(let n=0;n<12;n++){
    h.api.step(1,0);
    assert.equal(h.releases,0,'looking along the facade is still inspection, even when the pane is behind his shoulder');
  }
  assert.ok(h.realm.pose.x>1);
  assert.equal(h.realm.homeState.awayArmed,false);
  h.setLook({yaw:Math.PI});
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  for(let n=0;n<8&&h.releases===0;n++)h.api.step(0,1);
  assert.equal(h.releases,1,'walking back into snow still permits a voluntary departure');
  h.line.destroy();
});

test('partial outward travel survives reload and looking back cancels it before a deliberate new departure',()=>{
  const first=harness({realm:realmVisit()});
  first.api.syncStationErrand(first.runtime.doorCrossingFrame());
  first.setLook({yaw:Math.PI});first.api.syncStationErrand(first.runtime.doorCrossingFrame());
  for(let n=0;n<3;n++)first.api.step(0,1);
  assert.equal(first.releases,0);assert.ok(first.realm.homeState.outwardDistance>.25);
  const restored=harness({realm:copy(first.realm),flags:copy(first.save.flags)});
  restored.api.syncStationErrand(restored.runtime.doorCrossingFrame());
  assert.ok(restored.realm.homeState.outwardDistance>.25,'restoring the saved gaze must retain partial actual travel');
  restored.api.step(0,1);assert.equal(restored.releases,0);
  restored.setLook({yaw:0});restored.api.syncStationErrand(restored.runtime.doorCrossingFrame());
  assert.equal(restored.realm.homeState.outwardDistance,0);assert.equal(restored.releases,0);
  restored.setLook({yaw:Math.PI});restored.api.syncStationErrand(restored.runtime.doorCrossingFrame());
  for(let n=0;n<4;n++){restored.api.step(0,1);assert.equal(restored.releases,0);}
  restored.api.step(0,1);assert.equal(restored.releases,1);
  assert.equal(restored.restores,0,'recognized saves must not refill composure again');
  first.line.destroy();restored.line.destroy();
});

test('the local home audio receives saved realm time and canonical listener/window coordinates',()=>{
  const h=harness({time:23.4,realm:realmVisit()});
  const updates=[];
  h.sandbox.createElsewhereBeds=()=>({update:(frame)=>updates.push(copy(frame)),stop(){}});
  const frame=h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  h.api.syncElsewhereBeds([],frame,100,200);
  const home=updates.at(-1).home;
  assert.equal(home.listener.x,h.realm.pose.x);assert.equal(home.listener.z,h.realm.pose.z);
  assert.equal(home.listener.yaw,h.realm.pose.yaw);assert.equal(home.listener.y,1.62);
  assert.equal(home.window.x,frame.realm.window.x);assert.equal(home.window.z,frame.realm.window.z);
  assert.equal(home.window.y,(frame.realm.window.bottom+frame.realm.window.top)/2);
  assert.equal(home.time,23.4);assert.equal(home.paused,false);
  h.sandbox.paused=true;h.api.syncElsewhereBeds([],frame);
  assert.equal(updates.at(-1).home.paused,true);assert.equal(updates.at(-1).home.time,23.4);
  h.line.destroy();
});

test('a saved departure waits through pause before its once-only release is reconciled',()=>{
  const realm=realmVisit();realm.windowReached=true;realm.homeState={recognized:true,departed:true};
  const h=harness({realm});h.sandbox.paused=true;
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.releases,0);assert.equal(h.realm.stage,'inside');assert.equal(h.restores,0);
  h.sandbox.paused=false;h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.releases,1);assert.equal(h.restores,1);assert.equal(h.realm.stage,'returning');
  h.line.destroy();
});

test('local attention reaches the real audio mix and pause, hidden and blocked scenes freeze home decisions', () => {
  const h = harness({ realm: realmVisit({ z: 68.5 }) });
  const frame = h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  const quietFootfall = h.api.stationFootfall().gain;
  h.api.syncElsewhereBeds([], frame);
  const outputs = h.audio.nodes.filter((node) => !node.disconnected && node.connections.includes(h.sandbox.sfxGain));
  assert.equal(outputs.length, 2);
  const wind = h.audio.nodes.find((node) => node.connections.includes(outputs[0]));
  assert.ok(wind.gain.value < .42);
  const saved = copy(h.realm.homeState), time = h.time;
  for (const gate of ['paused', 'hidden', 'blocked']) {
    if (gate === 'paused') h.sandbox.paused = true;
    if (gate === 'hidden') h.sandbox.document.hidden = true;
    if (gate === 'blocked') h.blockWorld(true);
    h.api.tickSourceSpace(1000);
    h.api.interaction(true); h.api.tickStationRealmHome(h.runtime.doorCrossingFrame(), { action: 'turn-away', outwardDistance: 1 });
    assert.deepEqual(copy(h.realm.homeState), saved);
    assert.equal(h.time, time); assert.equal(h.releases, 0);
    h.sandbox.paused = false; h.sandbox.document.hidden = false; h.blockWorld(false);
  }
  h.api.interaction(false); h.setLook({ yaw: Math.PI });
  const restored = h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  h.api.syncElsewhereBeds([], restored);
  assert.equal(wind.gain.value, .42);
  assert.ok(h.api.stationFootfall().gain > quietFootfall);
  h.api.resetRunAudio('after-window');
  assert.ok(h.audio.nodes.slice(h.stationNodeStart).every((node) => node.disconnected));
  h.line.destroy();
});

test('the old tower lock-in now hands off to coastal memory before the unfinished personal route', () => {
  const h = harness({ walk: { kind: 'lock-in', progress: .999, windowAt: null, done: false, forward: [0, -1] },
    frame: { id: 'tower-lock-in', lockIn: true, forward: [0, -1] } });
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  h.api.step(0, -1); h.api.tickHomeWalk();
  assert.equal(h.coastalHandoffs,1,'the coast handoff is requested exactly once');
  assert.equal(h.runtime.enteredLand,undefined,'the unfinished personal route cannot teleport directly to the school hall');
  assert.equal(h.save.flags['station.lockIn.seen'],true);
  assert.equal(h.walk,null);
  assert.equal(h.sandbox.px,0);assert.equal(h.sandbox.py,0,'a scene owns the transition, not the old coordinate setter');
  h.api.syncStationErrand(h.runtime.doorCrossingFrame());
  assert.equal(h.coastalHandoffs,1,'ordinary station synchronization cannot replay the coast handoff');
  h.line.destroy();
});
