import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  CHUNK_SURF_PHASE, SOURCE_FINALE_ROUTE, SOURCE_FINALE_STAGE,
  normalizeChunkSurfState, reduceChunkSurf,
} from '../src/game/chunk-surf-state.js';
import { cathedralBellCombatBattle } from '../src/data/combat-definitions.js';
import {freshChapelTapeDemand,chapelTapeDemandBlocksProgress} from '../src/game/chapel-tape-demand.js';
import { TOWER_PERSONAL_TAKE, TOWER_PERSONAL_CUE, TOWER_PERSONAL_SECONDS } from '../src/audio/tower-personal-recording.js';
import { MOVE_MS, WORLD_BOUNDARY_FRICTION } from '../src/config.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { createTowerPersonalMonitor } from '../src/audio/tower-personal-monitor.js';
import { ordinaryTakeCount } from '../src/game/chapel-tower-state.js';
import * as REAL_REC from '../src/game/recordist.js';
import * as REAL_PB from '../src/game/playback.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const copy = (value) => JSON.parse(JSON.stringify(value));
function section(from, to) {
  const begin = main.indexOf(from), end = main.indexOf(to, begin);
  assert.ok(begin >= 0 && end > begin, `production function section exists: ${from}`);
  return main.slice(begin, end);
}
const personalFunctions = [
  section('var towerPersonalRecorderHeld=false', '\nlet homeWindowCanvas=null;'),
  section('function enterTowerLandNow(', '\nfunction finishHomeWalk('),
  section('function openRecorder(){', '\nfunction recorderMachineState(){'),
  section('function playTakeFrom(', '\nfunction maskGameOutput('),
].join('\n');

function personalHarness() {
  // This fixture exercises a visit to the school-hall *after* the coastal
  // memory handoff. An unfinished route goes to the coast instead of this room.
  const saved = { px: 10, py: 20, flags: {}, chunkSurf: { station: { personal: { active: false, completed: true, recordingHeard: false } } } };
  const snapshots = [], poses = [], ticks = [], playback = [], scenePushes = [], spoken = [], events = [], renders = [], audioOrder = [];
  let current = copy(saved.chunkSurf), canListen = true, paused = false, hidden = false, blocked = false, heldAudio = null, archived = null, recorderLost = false;
  let recording = false, tapePlaying = false, knownTake = false;
  const returnPose = { x: 10, y: 20, facing: .8, yaw: .8, pitch: .15, completed: true };
  const noOp = () => {};
  const sandbox = {
    px: 10, py: 20, stepCount: 2, CELL: .5, renderMove: {}, motionRig: {}, trail: [{ x: 9, y: 20 }], storyMode: true, paused: false,
    playbackRoom: null, pendingTapeRoll: false,
    actx: { currentTime: 5, state: 'running', destination: {},
      createChannelSplitter: () => ({ connect: noOp, disconnect: noOp }),
      createAnalyser: () => ({ fftSize: 512, getFloatTimeDomainData: (samples) => samples.fill(.02), disconnect: noOp }) }, sfxGain: {}, master: null, sourceFearFloor: 1,
    stationWay: { crossingId: 'stale-crossing', wrong: true, walk: { kind: 'lock-in' } },
    stationTime: () => 5, ensureCtx: noOp, runtimeTree: () => ({}),
    chunkSurfRuntime: {
      state: () => copy(current),
      towerLandFrame: () => ({ ...current.station.personal, active: current.station.personal.active, canListen }),
      towerLandState: () => current.station.personal.active ? 'school-hall' : null,
      enterTowerLand(id, options) {
        assert.equal(id, 'school-hall');
        current.station.personal = { ...current.station.personal, active: true, returnPose: copy(options.returnPose) };
        return { x: 200, y: -1000, facing: 0 };
      },
      leaveTowerLand() {
        current.station.personal = { ...current.station.personal, active: false, completed: true, recordingHeard: true };
        return copy(returnPose);
      },
      setPlayerPosition: (pose) => poses.push(copy(pose)),
      tickTowerLand(dt, options) {
        ticks.push({ dt, ...copy(options) });
        const personal = current.station.personal;
        if (!options.paused && options.recorderHeld && canListen) {
          personal.listenedSeconds = (personal.listenedSeconds || 0) + options.audibleSeconds;
          personal.recordingOffset = options.recordingOffset;
        }
        return { events: [], frame: copy(personal) };
      },
    },
    R3: { r3dFacing: () => sandbox.look.yaw, r3dLookAngles: () => copy(sandbox.look),
      r3dSetFacing(value) { sandbox.look.yaw = value; },
      r3dSetLookAngles(value) { sandbox.look = { ...sandbox.look, ...value }; } },
    look: { yaw: .8, pitch: .15 },
    scenes: { push: (scene) => scenePushes.push(scene), has: () => false, blocksWorld: () => blocked },
    RECORDER_SCENE_ID: 'recorder', itemLost: () => recorderLost, dreamFigure: null,
    document: { get hidden() { return hidden; } },
    playTowerPersonalRecording(options) {
      assert.equal(tapePlaying, false, 'the authored monitor must stop tape playback before sounding');
      audioOrder.push('monitor-start');
      const handle = { out: { connect: noOp }, stops: 0, stop() { this.stops += 1; audioOrder.push('monitor-stop'); } };
      playback.push({ options, handle }); heldAudio = handle; return handle;
    },
    createTowerPersonalMonitor: (options) => createTowerPersonalMonitor({ ...options, play: sandbox.playTowerPersonalRecording }),
    createTowerPersonalWorldSignal: () => null, playTowerPersonalContact: () => null,
    sourceCameraPatch: () => ({}),
    // This personal-room fixture has no exterior rig inspection, Chapel demand,
    // native lifecycle hold, or coastal recording transport to reconcile.
    tryRigCheck: () => false,
    chapelTapeDemandBlocksProgress: () => false,
    holdUnavailableGameplayInput: () => false,
    reconcileCoastalMemoryTake: () => false,
    beginCoastalMemoryJourney: () => false, // This fixture has no optional coastal visit.

    CUES: { CUE: { recorder: 'recorder', door: 'door' }, playCue: noOp },
    SPEECH: { say: (line) => spoken.push(copy(line)) },
    PB: {
      hasTake: () => !!archived || knownTake,
      archiveAuthoredTake(descriptor) { archived ||= copy(descriptor); return archived; },
      isPlaying: () => tapePlaying,
      stopPlayback() { tapePlaying = false; audioOrder.push('tape-stop'); },
      tapeTake: (roomId) => ({ roomId, status: 'archived' }),
      playTake() {
        assert.ok(!heldAudio || heldAudio.stops > 0, 'tape playback must lower the audible monitor first');
        tapePlaying = true; audioOrder.push('tape-start'); return true;
      },
    },
    TOWER_PERSONAL_TAKE, TOWER_PERSONAL_CUE, TOWER_PERSONAL_SECONDS,
    REC: { isRecording: () => recording, saveRecState: () => ({ takes: ['main_b3'] }) },
    currentWorld: () => 'main_b3', ensureTapeAudio: noOp, roomToneCharacter: () => 1,
    framedLine: (_id, line) => line, LINES: { playback: { text: 'Playback.' }, playbackNone: { text: 'No take.' } },
    getSave: () => saved, flagTest: name=>!!saved.flags[name],
    saveCommit(patch) { Object.assign(saved, copy(patch)); snapshots.push(copy(saved)); },
    pushEvent: (text) => events.push(text), shakeMode: () => 'reduced',
    PRES: { isActive: () => false, despawn: noOp },
    endSourceHaystackMosh: noOp, endSourceBracketPresence: noOp, syncSourceCorridorRain: noOp,
    syncSourceRender: (options) => renders.push(options), revealAround: noOp,
  };
  vm.createContext(sandbox);
  vm.runInContext(personalFunctions + '\nglobalThis.api={openRecorder,toggleTowerPersonalRecorder,playTakeFrom,tickTowerPersonal,enterTowerLandNow,leaveTowerLandNow,lowerTowerPersonalRecorder,reconcileTowerPersonalTake,applyTowerPersonalTraversal,drawTowerPersonalQuiet,towerPersonalEvent,towerPersonalFocusLabel,tickTowerPersonalWorldSignal,stopTowerPersonalWorldSignal,held:()=>towerPersonalRecorderHeld};', sandbox);
  return { sandbox, saved, snapshots, poses, ticks, playback, scenePushes, spoken, events, renders, returnPose, audioOrder,
    get audio() { return heldAudio; },
    get tapePlaying() { return tapePlaying; },
    setCanListen(value) { canListen = value; },
    setPaused(value) { paused = value; sandbox.paused = paused; },
    setHidden(value) { hidden = value; }, setBlocked(value) { blocked = value; },
    setActive(value) { current.station.personal.active = value; },
    current: () => current,
    setFrame(patch) { Object.assign(current.station.personal, copy(patch)); },
    setListening(seconds, heard = false) { current.station.personal.listenedSeconds = seconds; current.station.personal.recordingHeard = heard; delete current.station.personal.recordingOffset; },
    setRecorderLost(value) { recorderLost = value; },
    setRecording(value) { recording = value; }, setTapePlaying(value) { tapePlaying = value; }, setKnownTake(value) { knownTake = value; },
    api: sandbox.api };
}

test('the recorder verb raises and lowers the real audition while keeping the personal world nonmodal', () => {
  const h = personalHarness();
  h.api.enterTowerLandNow();
  const position = { x: h.sandbox.px, y: h.sandbox.py };
  assert.equal(h.api.openRecorder(), true);
  assert.equal(h.api.held(), true);
  assert.equal(h.playback.length, 1);
  assert.equal(h.playback[0].options.loop, true);
  assert.equal(h.playback[0].options.destination, h.sandbox.sfxGain);
  assert.equal(h.scenePushes.length, 0, 'raising the machine does not put a recorder menu over the walk');
  assert.deepEqual({ x: h.sandbox.px, y: h.sandbox.py }, position);
  h.sandbox.actx.currentTime += .125;
  assert.equal(h.api.tickTowerPersonal(.1), true);
  assert.deepEqual(h.ticks.at(-1), { dt: .1, recorderHeld: true, audibleSeconds: .125, recordingOffset: .125, paused: false, reducedMotion: true, sourceRecordingFinished: false, sourceRecordingActive: false });
  assert.equal(h.api.openRecorder(), true);
  assert.equal(h.api.held(), false);
  assert.equal(h.audio.stops, 1);
  assert.equal(h.scenePushes.length, 0);
  assert.equal(h.api.tickTowerPersonal(.1), true);
  assert.equal(h.ticks.at(-1).recorderHeld, false);
});

test('monitor and saved tape replace each other in both directions without overlapping audio', () => {
  const h = personalHarness(); h.api.enterTowerLandNow(); h.setKnownTake(true);
  h.setTapePlaying(true); h.sandbox.playbackRoom = 'old-take'; h.sandbox.pendingTapeRoll = true;
  assert.equal(h.api.toggleTowerPersonalRecorder(), true);
  assert.deepEqual(h.audioOrder, ['tape-stop', 'monitor-start']);
  assert.equal(h.tapePlaying, false);
  assert.equal(h.api.held(), true);
  assert.equal(h.sandbox.playbackRoom, null);
  assert.equal(h.sandbox.pendingTapeRoll, false);
  assert.equal(h.api.playTakeFrom(TOWER_PERSONAL_TAKE), true);
  assert.deepEqual(h.audioOrder, ['tape-stop', 'monitor-start', 'monitor-stop', 'tape-start']);
  assert.equal(h.api.held(), false);
  assert.equal(h.tapePlaying, true);
  assert.equal(h.api.toggleTowerPersonalRecorder(), true);
  assert.deepEqual(h.audioOrder.slice(-2), ['tape-stop', 'monitor-start']);
  assert.equal(h.tapePlaying, false);
  assert.equal(h.api.held(), true);
});

test('a rolling take refuses both monitor audition and saved playback before touching either transport', () => {
  const h = personalHarness(); h.api.enterTowerLandNow(); h.setKnownTake(true); h.setRecording(true);
  h.sandbox.pendingTapeRoll = true; h.sandbox.playbackRoom = 'untouched';
  assert.equal(h.api.toggleTowerPersonalRecorder(), false);
  assert.equal(h.api.playTakeFrom(TOWER_PERSONAL_TAKE), false);
  assert.equal(h.api.held(), false);
  assert.equal(h.sandbox.pendingTapeRoll, true);
  assert.equal(h.sandbox.playbackRoom, 'untouched');
  assert.deepEqual(h.audioOrder, []);
});

test('raising the machine resumes an unfinished audition but still requires the owned recorder', () => {
  const h = personalHarness(); h.api.enterTowerLandNow();
  h.setListening(6.25);
  assert.equal(h.api.openRecorder(), true);
  assert.equal(h.playback.at(-1).options.offset, 6.25, 'the sound resumes with the saved listening progress');
  h.api.openRecorder(); h.setListening(TOWER_PERSONAL_SECONDS, true);
  h.api.openRecorder();
  assert.equal(h.playback.at(-1).options.offset, 0, 'a fully heard recording can be listened to from the beginning');
  h.api.openRecorder(); h.setRecorderLost(true);
  assert.equal(h.api.openRecorder(), false);
  assert.equal(h.api.held(), false);
  assert.equal(h.playback.length, 2, 'a missing recorder cannot create an audition');
  assert.equal(h.scenePushes.length, 0);
});

test('world suspension freezes the journey and leaving audition range or the world stops the held sound', () => {
  const h = personalHarness(); h.api.enterTowerLandNow(); h.api.openRecorder();
  for (const [set, clear] of [
    [() => h.setPaused(true), () => h.setPaused(false)],
    [() => h.setHidden(true), () => h.setHidden(false)],
    [() => h.setBlocked(true), () => h.setBlocked(false)],
  ]) {
    set(); h.api.tickTowerPersonal(.1);
    assert.equal(h.ticks.at(-1).paused, true);
    clear();
  }
  h.setCanListen(false); h.api.tickTowerPersonal(.1);
  assert.equal(h.api.held(), false);
  assert.equal(h.audio.stops, 1);
  h.setCanListen(true); h.api.openRecorder();
  const second = h.audio; h.setActive(false);
  assert.equal(h.api.tickTowerPersonal(.1), false);
  assert.equal(h.api.held(), false);
  assert.equal(second.stops, 1);
});

test('entry clears the obsolete return job and completed exit saves the exact road pose with its inactive state', () => {
  const h = personalHarness();
  assert.equal(h.api.enterTowerLandNow(), true);
  assert.equal(h.sandbox.stationWay.crossingId, null);
  assert.equal(h.sandbox.stationWay.walk, null);
  assert.equal(h.sandbox.stationWay.wrong, false);
  assert.equal(h.snapshots.at(-1).chunkSurf.station.personal.active, true);
  assert.equal(h.snapshots.at(-1).px, 200);
  assert.equal(h.snapshots.at(-1).py, -1000);
  h.api.openRecorder();
  assert.equal(h.api.leaveTowerLandNow(), true);
  assert.equal(h.audio.stops, 1);
  assert.equal(h.sandbox.px, h.returnPose.x);
  assert.equal(h.sandbox.py, h.returnPose.y);
  assert.equal(h.sandbox.look.yaw, h.returnPose.yaw);
  assert.equal(h.sandbox.look.pitch, h.returnPose.pitch);
  // A completed personal route may have an active in-room checkpoint.
  // The *exit* contract requires that inactive checkpoints carry road pose.
  const completedSaves = h.snapshots.filter((save) => save.chunkSurf.station.personal.completed && !save.chunkSurf.station.personal.active);
  assert.ok(completedSaves.length > 0);
  for (const save of completedSaves) {
    assert.equal(save.chunkSurf.station.personal.active, false);
    assert.equal(save.px, h.returnPose.x, 'no completed save may retain the pocket’s old X');
    assert.equal(save.py, h.returnPose.y, 'no completed save may retain the pocket’s old Y');
  }
  assert.equal(h.saved.flags['station.recordist.complete'], true);
  assert.equal(h.saved.flags['chunkSurf.optional.recordist'], true);
  assert.equal(h.events.length, 1, 'the received tape is announced once despite completion reconciliation');
});

test('lowering flushes only the actual audible fraction and resumes that tape position', () => {
  const h = personalHarness(); h.api.enterTowerLandNow(); h.api.openRecorder();
  h.sandbox.actx.currentTime += .375;
  h.api.lowerTowerPersonalRecorder();
  assert.equal(h.ticks.at(-1).dt, 0, 'lowering cannot advance choreography');
  assert.equal(h.ticks.at(-1).audibleSeconds, .375);
  assert.equal(h.current().station.personal.listenedSeconds, .375);
  assert.equal(h.saved.chunkSurf.station.personal.recordingOffset, .375);
  h.sandbox.actx.currentTime += 100;
  h.api.tickTowerPersonal(.1);
  assert.equal(h.ticks.at(-1).audibleSeconds, 0, 'lowered real time is never evidence');
  h.api.openRecorder();
  assert.equal(h.playback.at(-1).options.offset, .375);
  h.sandbox.actx.state = 'suspended'; h.sandbox.actx.currentTime += 2;
  h.api.tickTowerPersonal(.1);
  assert.equal(h.ticks.at(-1).audibleSeconds, 0, 'a suspended audio context cannot earn a recording');
});

test('physical personal crossings apply the runtime pose and never invoke a second exit', () => {
  const h = personalHarness(); h.api.enterTowerLandNow();
  let forbiddenLeaves = 0;
  h.sandbox.chunkSurfRuntime.leaveTowerLand = () => { forbiddenLeaves++; throw new Error('already left'); };
  const pose = { x: 800, y: -1600, yaw: 2.4, pitch: -.2 };
  h.setFrame({ stage: 'tape-field', pose, transition: { serial: 1 } });
  assert.equal(h.api.applyTowerPersonalTraversal({ event: 'personal-transition', position: pose, events: ['tape-field-entered'] }), true);
  assert.deepEqual({ x: h.sandbox.px, y: h.sandbox.py }, { x: pose.x, y: pose.y });
  assert.equal(h.sandbox.renderMove, null); assert.equal(h.sandbox.motionRig, null);
  assert.deepEqual(copy(h.sandbox.trail), []);
  assert.equal(h.saved.px, pose.x); assert.equal(h.saved.py, pose.y);
  assert.equal(h.saved.chunkSurf.station.personal.transition.serial, 1);
  h.setFrame({ active: false, completed: true, recordingHeard: true });
  assert.equal(h.api.applyTowerPersonalTraversal({ event: 'personal-exit', position: h.returnPose, events: ['completed'] }), true);
  assert.equal(forbiddenLeaves, 0);
  assert.equal(h.saved.px, h.returnPose.x); assert.equal(h.saved.py, h.returnPose.y);
  assert.equal(h.sandbox.look.yaw, h.returnPose.yaw); assert.equal(h.sandbox.look.pitch, h.returnPose.pitch);
  assert.equal(h.saved.flags['station.recordist.complete'], true);
  assert.equal(h.events.length, 1, 'receipt reconciliation remains exactly once');
});

test('the immediate Source save relocates active-to-active transitions atomically', () => {
  const body = section('      const oldPersonal=getSave().chunkSurf?.station?.personal,personal=next.station?.personal;', '\n      if(recordCausal)');
  const saved = { chunkSurf: { station: { personal: { active: true, transition: { serial: 4 } } } } };
  const pose = { x: 1234, y: -4321 };
  const sandbox = { px: 2, py: 3, renderMove: {}, motionRig: {}, trail: [1],
    next: { station: { personal: { active: true, transition: { serial: 5 } } } },
    getSave: () => saved, chunkSurfRuntime: { towerLandFrame: () => ({ pose }) } };
  vm.createContext(sandbox); vm.runInContext(body, sandbox);
  assert.equal(sandbox.px, pose.x); assert.equal(sandbox.py, pose.y);
  assert.equal(sandbox.renderMove, null); assert.equal(sandbox.motionRig, null);
  assert.deepEqual(copy(sandbox.trail), []);
});

test('Quiet Threshold shows remapped contextual buttons, live levels and optional captions without a transport counter', () => {
  const h = personalHarness(), elements = new Map();
  const element = () => ({ hidden: false, textContent: '', style: { setProperty() {} }, listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; }, setAttribute(name) { if (name === 'hidden') this.hidden = true; } });
  for (const selector of ['.personal-quiet-recorder', '.personal-quiet-inspect', '.personal-quiet-focus',
    '.personal-quiet-object', '.personal-quiet-machine', '.personal-quiet-state', '.personal-quiet-caption',
    '[data-channel="left"]', '[data-channel="right"]']) elements.set(selector, element());
  const hud = element(); hud.querySelector = (selector) => elements.get(selector);
  h.sandbox.document.createElement = () => hud;
  h.sandbox.document.getElementById = () => ({ clientHeight: 600, appendChild() {} });
  h.sandbox.BINDINGS = { inputPrompt: (action) => action === 'interact' ? '[X]' : '[RT]' };
  h.sandbox.SPEECH.speechPanelRows = () => 0;
  h.sandbox.PRES.publicSnapshot = () => ({});
  h.sandbox.chunkSurfRuntime.focusAt = () => ({ id: 'land-recordist', kind: 'land-piece' });
  h.saved.settings = { hushCueCaptions: true };
  h.api.enterTowerLandNow(); h.api.drawTowerPersonalQuiet(h.sandbox.chunkSurfRuntime.towerLandFrame(), 100, 45);
  assert.equal(elements.get('.personal-quiet-object').textContent, 'RECORDIST');
  assert.equal(elements.get('.personal-quiet-inspect').textContent, '[X] INSPECT');
  assert.equal(elements.get('.personal-quiet-recorder').textContent, '[RT] RAISE RECORDER');
  assert.equal(elements.get('.personal-quiet-machine').hidden, true);
  elements.get('.personal-quiet-recorder').listeners.click();
  h.sandbox.actx.currentTime += 3.2; h.api.tickTowerPersonal(.1);
  h.api.drawTowerPersonalQuiet(h.sandbox.chunkSurfRuntime.towerLandFrame(), 100, 45);
  assert.equal(elements.get('.personal-quiet-machine').hidden, false);
  assert.equal(elements.get('[data-channel="left"]').style.width, '36%');
  assert.equal(elements.get('.personal-quiet-recorder').textContent, '[RT] LOWER RECORDER');
  assert.equal(elements.get('.personal-quiet-caption').textContent, '[A bell note carries through the room.]');
  h.saved.settings.hushCueCaptions = false;
  h.api.drawTowerPersonalQuiet(h.sandbox.chunkSurfRuntime.towerLandFrame(), 100, 45);
  assert.equal(elements.get('.personal-quiet-caption').hidden, true);
  assert.doesNotMatch(hud.innerHTML, /counter|progress|elapsed|objective|timer/i);
  h.setPaused(true); h.api.drawTowerPersonalQuiet(h.sandbox.chunkSurfRuntime.towerLandFrame(), 100, 45);
  assert.equal(hud.hidden, true);
});

test('world sources wait for audible approach, preserve partial offsets, and do not repeat a finished world', () => {
  const h = personalHarness(), sources = [];
  h.api.enterTowerLandNow();
  h.setFrame({ world: 'broadcast', stage: 'dead-broadcast', ambientRecordings: { broadcast: { offset: 2.75, finished: false } }, targets: { source: { x: 200, y: -1300 } } });
  h.sandbox.createTowerPersonalWorldSignal = (options) => {
    const source = { options, elapsed: 0, stopped: 0, position() {}, sample() { return { offset: options.offset + this.elapsed, finished: options.offset + this.elapsed >= 14 }; }, stop() { this.stopped++; } };
    sources.push(source); return source;
  };
  h.api.tickTowerPersonalWorldSignal(h.sandbox.chunkSurfRuntime.towerLandFrame());
  assert.equal(sources.length, 0, '150 metres away cannot spend the finite source');
  h.sandbox.py = -1270;
  h.api.tickTowerPersonalWorldSignal(h.sandbox.chunkSurfRuntime.towerLandFrame());
  assert.equal(sources.length, 1); assert.equal(sources[0].options.offset, 2.75);
  sources[0].elapsed = 1.5;
  h.api.stopTowerPersonalWorldSignal();
  assert.equal(sources[0].stopped, 1);
  assert.equal(h.ticks.at(-1).dt, 0); assert.equal(h.ticks.at(-1).sourceRecordingOffset, 4.25);
  assert.equal(h.ticks.at(-1).sourceRecordingActive, false);
  h.api.tickTowerPersonalWorldSignal(h.sandbox.chunkSurfRuntime.towerLandFrame());
  assert.equal(sources.length, 2); assert.equal(sources[1].options.offset, 4.25);
  sources[1].elapsed = 9.75;
  h.api.tickTowerPersonalWorldSignal(h.sandbox.chunkSurfRuntime.towerLandFrame());
  assert.equal(h.ticks.at(-1).sourceRecordingFinished, true);
  h.api.tickTowerPersonalWorldSignal(h.sandbox.chunkSurfRuntime.towerLandFrame());
  assert.equal(sources.length, 2, 'finished source survives a later approach');
  assert.equal(h.current().station.personal.listenedSeconds || 0, 0, 'world sound never earns ash listening credit');
});

test('focused labels use authored object names and only name the final available doorway an exit', () => {
  const h = personalHarness();
  h.sandbox.runtimeTree = () => ({ 'land.school-hall.chairs': { speaker: 'THE CHAIRS' }, 'land.tape-field.reel': { speaker: 'THE REEL' } });
  assert.equal(h.api.towerPersonalFocusLabel({ id: 'land-chairs-0--1', look: 'land.school-hall.chairs' }, {}), 'CHAIRS');
  assert.equal(h.api.towerPersonalFocusLabel({ id: 'land-tape-reel-7', look: 'land.tape-field.reel' }, {}), 'REEL');
  const door = { id: 'land-return-door', kind: 'land-door' };
  assert.equal(h.api.towerPersonalFocusLabel(door, { stage: 'school-hall', exitAvailable: false }), 'SERVICE DOOR');
  assert.equal(h.api.towerPersonalFocusLabel(door, { stage: 'return-hall', exitAvailable: false }), 'SERVICE DOOR');
  assert.equal(h.api.towerPersonalFocusLabel(door, { stage: 'return-hall', exitAvailable: true }), 'EXIT DOOR');
});

test('handover captions remain available when audio cannot sound', () => {
  const h = personalHarness(), elements = new Map();
  const node = () => ({ hidden: false, textContent: '', style: { setProperty() {} }, addEventListener() {} });
  const hud = node();
  hud.querySelector = (selector) => { if (!elements.has(selector)) elements.set(selector, node()); return elements.get(selector); };
  h.sandbox.document.createElement = () => hud;
  h.sandbox.document.getElementById = () => ({ clientHeight: 600, appendChild() {} });
  h.sandbox.BINDINGS = { inputPrompt: () => '[R]' };
  h.sandbox.PRES.publicSnapshot = () => ({});
  h.sandbox.chunkSurfRuntime.focusAt = () => null;
  h.saved.settings = { hushCueCaptions: true };
  h.api.enterTowerLandNow(); h.api.towerPersonalEvent('handover-finished');
  h.api.drawTowerPersonalQuiet(h.sandbox.chunkSurfRuntime.towerLandFrame(), 80, 40);
  assert.equal(elements.get('.personal-quiet-caption').hidden, false);
  assert.equal(elements.get('.personal-quiet-caption').textContent, '[The recorder settles into his hands.]');
});

test('the personal cadence walks the actual cell size at 1.35 metres per second and retains quiet movement', () => {
  let slow = false;
  const sandbox = { MOVE_MS, CELL, WORLD_BOUNDARY_FRICTION, storyMode: true,
    usingStairAnomaly: () => false, isIntroActive: () => false, usingSourceSpace: () => true,
    outskirtsStepIndex: 0, PLANT: { heavyWrenchDragging: () => false }, worldBoundaryFriction: 0,
    REC: { recState: () => ({ slow }) }, chunkSurfRuntime: { towerLandFrame: () => ({ active: true, walkMetresPerSecond: 1.35 }) },
    clamp: (value, low, high) => Math.max(low, Math.min(high, value)) };
  vm.createContext(sandbox);
  vm.runInContext(section('function storyMoveScale(){', '\nfunction currentTurnIntervalMs(') + '\nglobalThis.interval=currentMoveIntervalMs;', sandbox);
  const interval = sandbox.interval();
  assert.ok(Math.abs(CELL / (interval / 1000) - 1.35) < .005);
  assert.equal(interval, Math.round(1000 * CELL / 1.35), 'grid scaling must not silently halve the intended walk pace');
  slow = true;
  assert.equal(sandbox.interval(), Math.round(1000 * CELL / 1.35 * 1.9));
});

test('blocking scene entry flushes its prior audible fraction and cannot earn evidence while the world loop is stopped', () => {
  const h = personalHarness(); let subscribed;
  h.sandbox.scenes.subscribe = (callback) => { subscribed = callback; };
  h.sandbox.syncPointerMode = () => {};
  h.sandbox.gameplayWantsPointerCapture = () => false;
  vm.runInContext(section('  scenes.subscribe(({reason,scene})=>{', "\n  syncPointerMode('boot');"), h.sandbox);
  h.api.enterTowerLandNow(); h.api.openRecorder();
  h.sandbox.actx.currentTime += .375;
  h.setBlocked(true); subscribed({ reason: 'push', scene: { id: 'inspection' } });
  assert.equal(h.api.held(), false); assert.equal(h.audio.stops, 1);
  assert.equal(h.ticks.at(-1).dt, 0); assert.equal(h.ticks.at(-1).audibleSeconds, .375);
  assert.equal(h.current().station.personal.listenedSeconds, .375);
  h.sandbox.actx.currentTime += 60;
  h.setBlocked(false); subscribed({ reason: 'pop', scene: { id: 'inspection' } });
  h.api.tickTowerPersonal(.1);
  assert.equal(h.ticks.at(-1).audibleSeconds, 0);
  assert.equal(h.current().station.personal.listenedSeconds, .375);
  assert.equal(h.api.held(), false, 'closing the modal never raises the recorder automatically');
});

test('the gameplay focus watchdog preserves a visible Quiet Threshold native button', () => {
  let focusedMap = 0;
  const sandbox = { towerPersonalHud: { hidden: false },
    document: { activeElement: { closest: () => ({}) } }, MAP_EL: { focus() { focusedMap++; } } };
  vm.createContext(sandbox);
  vm.runInContext(section('function ensureInteractionFocus(){', '\nfunction pointerEventHitsGameplaySurface(') + '\nglobalThis.ensure=ensureInteractionFocus;', sandbox);
  sandbox.ensure(); assert.equal(focusedMap, 0, 'keyboard focus remains on the native control');
  sandbox.towerPersonalHud.hidden = true;
  sandbox.ensure(); assert.equal(focusedMap, 1, 'the ordinary play-surface recovery still works after the HUD is hidden');
});

test('personal ambience follows the discrete physical world in both directions', () => {
  const updates = [], created = [];
  let frame = { active: true, localPose: { z: 17 }, stage: 'school-hall' };
  const sandbox = {
    px: 10, py: 20, CELL: .5, actx: {}, sfxGain: {}, master: null,
    chunkSurfRuntime: { towerLandFrame: () => frame },
    R3: { r3dLookAngles: () => ({ yaw: .7 }) },
    createElsewhereBeds(options) { created.push(options); return { update: (value) => updates.push(copy(value)) }; },
  };
  vm.createContext(sandbox);
  vm.runInContext('let elsewhereBeds=null;\n' + section('function syncElsewhereBeds(', '\n// ── THE STATION\'S ERRAND')
    + '\nglobalThis.sync=syncElsewhereBeds;', sandbox);
  const leaks = [{ id: 'road-leak', variant: 1 }], crossing = { id: 'road-crossing', variant: 2, reveal: .4 };
  for (const [world, stage, variant] of [['hall', 'school-hall', 6], ['tape', 'tape-field', 7],
    ['broadcast', 'dead-broadcast', 9], ['ash', 'ash-room', 8], ['tape', 'tape-field', 7], ['hall', 'return-hall', 6]]) {
    frame = { active: true, localPose: { z: -24 }, world, stage };
    sandbox.sync(leaks, crossing);
    const update = updates.at(-1);
    assert.equal(update.crossing.variant, variant, `${stage} in ${world}`);
    assert.equal(update.crossing.id, 'tower-personal-world');
    assert.equal(update.crossing.reveal, 1);
    assert.deepEqual(update.leaks, [], 'road leakage cannot bleed through the physical room');
    assert.deepEqual(update.listener, { x: 5, z: 10, yaw: .7 });
  }
  assert.equal(created.length, 1, 'moving between rooms updates one world bed rather than creating overlapping graphs');
  frame = { active: false, localPose: { z: -48 }, stage: 'return-hall' };
  sandbox.sync(leaks, crossing);
  assert.deepEqual(updates.at(-1).leaks, leaks);
  assert.deepEqual(updates.at(-1).crossing, crossing, 'ordinary road crossings retain their original ambience');
  sandbox.sync([], null);
  assert.deepEqual(updates.at(-1), { leaks: [], crossing: null });
});

test('the real renderer option excludes personal rooms from the physical Source void', () => {
  const expression = main.match(/sourceVoidPhysical:(usingSourceSpace\(\)[\s\S]*?),\n\s*sourceVoidDawn:/)?.[1];
  assert.ok(expression, 'the live renderer option expression is present');
  let active = true, personal = true, shore = true, phase = CHUNK_SURF_PHASE.BELLS, preTape = true;
  const sandbox = {
    CHUNK_SURF_PHASE, usingSourceSpace: () => active, sourceShoreOutside: () => shore,
    chunkSurfRuntime: { towerLandFrame: () => ({ active: personal }), sourceShoreFrame: () => ({}),
      state: () => ({ phase }), horizonFrame: () => ({ preTape }) },
  };
  const physical = () => vm.runInNewContext(expression, sandbox);
  for (const value of [CHUNK_SURF_PHASE.BELLS, CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS, CHUNK_SURF_PHASE.HORIZON]) {
    phase = value; assert.equal(physical(), false, 'personal ground cannot inherit the Source void treatment');
  }
  personal = false;
  assert.equal(physical(), true, 'the ordinary shore keeps its physical treatment');
  shore = false; preTape = false;
  for (const value of [CHUNK_SURF_PHASE.BELLS, CHUNK_SURF_PHASE.CHAPEL_OUTSKIRTS]) {
    phase = value; assert.equal(physical(), true, 'ordinary road physical rendering is preserved');
  }
  phase = CHUNK_SURF_PHASE.HORIZON; preTape = true; assert.equal(physical(), true);
  preTape = false; assert.equal(physical(), false);
  active = false; assert.equal(physical(), false);
});

test('personal rain suppression is a frame override and returning restores the global amount including zero', () => {
  const option = main.match(/^\s*rainAmount:(usingSourceSpace\(\)[^\n]*),$/m)?.[1];
  const renderer = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const uniform = renderer.match(/gl\.uniform1f\(U\('uRainAmount'\),([^\n]+)\);/)?.[1];
  assert.ok(option, 'the live frame rain option is present');
  assert.ok(uniform, 'the real rain uniform resolves the frame override');
  let source = true, personal = true;
  const sandbox = { usingSourceSpace: () => source,
    chunkSurfRuntime: { towerLandFrame: () => ({ active: personal }) } };
  const frameRain = () => vm.runInNewContext(option, sandbox);
  const renderedRain = (override, global) => vm.runInNewContext(uniform, { state: { rainAmount: override }, rainAmount: global });
  assert.equal(frameRain(), 0);
  assert.equal(renderedRain(frameRain(), 1.7), 0, 'active personal ground suppresses the live global rain');
  personal = false;
  assert.equal(frameRain(), undefined, 'returning leaves global rain ownership intact');
  assert.equal(renderedRain(frameRain(), 1.7), 1.7);
  assert.equal(renderedRain(frameRain(), 0), 0, 'a deliberately dry global scene stays dry on return');
  source = false; personal = true;
  assert.equal(frameRain(), undefined, 'an inactive Source runtime cannot suppress another scene’s weather');
  assert.equal(renderedRain(frameRain(), .4), .4);
  assert.equal(renderedRain(0, .4), 0, 'an explicit zero is a valid override');
});

function coldTapeStores() {
  REAL_REC.stopRecording(); REAL_REC.stopListening(); REAL_REC.setTakeSink(null);
  REAL_PB.loadTakes([]); REAL_REC.loadRecState({});
}

function ordinaryTapeFixture() {
  coldTapeStores();
  REAL_PB.playbackInit({
    pickGuest: () => ({ idx: 21, name: 'original-witness' }),
    chunkById: (index) => ({ idx: index, name: `recorded-sample-${index}` }),
    keyOf: (chunk) => chunk.name,
  });
  for (const [index, roomId, duration] of [[0, 'main_b3', 52], [1, 'studio_a1', 63]]) {
    REAL_PB.beginTake(roomId, { x: 11 + index, y: 22 + index }, { durationSeconds: duration });
    REAL_PB.startTapeTake(roomId, { text: `Original take ${index + 1}`, mode: 'fallback' });
    REAL_PB.noteAudible(roomId, 7 + index, .27 + index * .1);
    REAL_PB.notePresence(roomId, .61 + index * .05, 17 + index);
    REAL_PB.noteDiscrete(roomId, { cueId: 'bell.tenor.clock', atSec: 8 + index,
      gain: .42, pan: -.2, provenance: { system: 'original-take', sourceId: `clock-${index}` } });
    REAL_PB.markTake(roomId, { contaminated: index === 1, place: { floor: 'ground', label: `Original room ${index + 1}` } });
    REAL_PB.finishTapeTake(roomId, { elapsed: 45 + index, tapeElapsed: duration, completed: true });
  }
  REAL_PB.advanceHeadTo(7);
  return { tapes: copy(REAL_PB.serializeTakes()), tapeTransport: copy(REAL_PB.tapeTransport()),
    injuries: 1, composure: 3, battery: .62, sheets: ['old-sheet'], sheetsTaken: ['old-sheet'] };
}

const tapeRestoreBlock = section('  REC.setTakeSink({', '\n  PRES.loadPresenceState(getSave().presence);');
const tapeReconciliation = section('function reconcileTowerPersonalTake(){', '\nfunction towerPersonalEvent(');

for (const completed of [false, true]) {
  test(`cold story restore preserves recorded audio while recovering a missing authored tape (${completed ? 'completed road save' : 'active heard journey'})`, () => {
    const rec = ordinaryTapeFixture(), originals = copy(rec.tapes), ordinaryEnd = rec.tapeTransport.endSeconds;
    const save = { px: 10, py: 20, flags: {}, rec, chunkSurf: normalizeChunkSurfState({ phase: CHUNK_SURF_PHASE.BELLS,
      station: { personal: { active: !completed, completed, recordingHeard: true, stage: 'ash-room',
        returnPose: { x: 10, y: 20, yaw: .4, pitch: .1 }, pose: { x: 5, z: -52 } } } }) };
    const events = [], commits = [];
    const sandbox = {
      REC: REAL_REC, PB: REAL_PB, TOWER_PERSONAL_TAKE, TOWER_PERSONAL_CUE, TOWER_PERSONAL_SECONDS,
      px: save.px, py: save.py, getSave: () => save,
      // A completed journey may resume in the Cathedral with no Source runtime.
      chunkSurfRuntime: completed ? null : { state: () => save.chunkSurf },
      saveCommit(patch) { Object.assign(save, copy(patch)); commits.push(copy(save)); },
      pushEvent: (line) => events.push(line),
      // The fixture has no coastal take; the real personal-tape recovery
      // and ordinary recorder stores remain under test.
      reconcileCoastalMemoryTake:()=>false,
      reconcileChapelTowerTakes() {
        assert.equal(ordinaryTakeCount(REAL_PB.takeRoomIds()), 2, 'ordinary takes are restored before any personal reconciliation');
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(tapeReconciliation + '\nglobalThis.restore=()=>{\n' + tapeRestoreBlock + '\n};', sandbox);
    try {
      coldTapeStores();
      assert.deepEqual(REAL_REC.recState().takes, []);
      assert.deepEqual(REAL_PB.serializeTakes(), []);
      sandbox.restore();
      assert.deepEqual(REAL_PB.serializeTakes().slice(0, 2), originals, 'original samples, guests, slate, presence, and discrete audio survive cold restore');
      assert.deepEqual(save.rec.tapes.slice(0, 2), originals, 'reconciliation never overwrites saved audio with empty fallback takes');
      assert.equal(ordinaryTakeCount(REAL_PB.takeRoomIds()), 2);
      assert.deepEqual(REAL_REC.recState().takes, ['main_b3', 'studio_a1']);
      assert.equal(REAL_PB.tapeTakes().length, 3);
      const authored = REAL_PB.takeFor(TOWER_PERSONAL_TAKE);
      assert.ok(authored?.authored);
      assert.equal(authored.counted, false);
      assert.equal(authored.startSeconds, ordinaryEnd);
      assert.equal(authored.endSeconds, ordinaryEnd + TOWER_PERSONAL_SECONDS);
      assert.equal(authored.discrete[0].cueId, TOWER_PERSONAL_CUE);
      assert.equal(events.length, 1);
      assert.equal(save.flags['station.recordist.heard'], true);
      assert.equal(!!save.flags['station.recordist.complete'], completed);
      // A later quit can happen with the head anywhere on the tape. Another
      // cold restore must find the receipt without appending or seeking it.
      REAL_PB.advanceHeadTo(11);
      save.rec = copy(REAL_REC.saveRecState());
      const received = copy(save.rec.tapes), transport = copy(save.rec.tapeTransport);
      coldTapeStores(); sandbox.restore();
      assert.deepEqual(REAL_PB.serializeTakes(), received);
      assert.deepEqual(save.rec.tapes, received);
      assert.deepEqual(REAL_PB.tapeTransport(), transport, 'repeat restore preserves tape spans, head, and end');
      assert.equal(REAL_PB.tapeTakes().length, 3);
      assert.equal(ordinaryTakeCount(REAL_PB.takeRoomIds()), 2);
      assert.equal(events.length, 1, 'restoring the same receipt cannot announce or append it twice');
      assert.equal(commits.length, 2);
    } finally { coldTapeStores(); }
  });
}

test('Source activation cannot reconcile the authored tape before story restores the recorder stores', () => {
  const activation = section('function activateSourceSpace(', '\nfunction resumeSourceSpaceFromSave(');
  assert.doesNotMatch(activation, /\breconcileTowerPersonalTake\s*\(/,
    'geometry activation happens before REC/PB restoration and must not save their cold fallback store');
  assert.match(tapeRestoreBlock, /PB\.loadTakes\([\s\S]*PB\.loadTapeTransport\([\s\S]*REC\.syncTakes\([\s\S]*reconcileTowerPersonalTake\(/,
    'the recovery receipt is reconciled only after the saved audio and transport have returned');
});

const cathedralFunctions = [
  section('function cathedralFightReady(){', '\nfunction tickFinale(){'),
  section('function openCathedralFirstPhase(){', "\n// ── ST BRENDAN'S TOWER"),
  section('function openBattle(', '\n// The run\'s own number'),
  section('function interact(){', '\nfunction markRoom('),
].join('\n');

test('arriving and waiting under the lantern preserves the reward until the player starts the fight', () => {
  const save = { chunkSurf: normalizeChunkSurfState({ phase: CHUNK_SURF_PHASE.BELLS,
    station: { personal: { completed: true } },
    finale: { route: SOURCE_FINALE_ROUTE.TOWER, stage: SOURCE_FINALE_STAGE.CATHEDRAL, cathedral: { alarm: 4 } } }) };
  const scenes = [], combats = [], commits = [];
  const noOp = () => {};
  const sandbox = {
    storyMode: true, finaleActive: false, px: 1, py: 2, cathedralFinalCombatOpen: false, escape: null,
    SOURCE_FINALE_ROUTE, SOURCE_FINALE_STAGE, normalizeChunkSurfState, reduceChunkSurf, cathedralBellCombatBattle,
    usingSpecialSpace: () => false, usingSourceSpace: () => false,
    getSave: () => save, saveCommit(patch) { Object.assign(save, copy(patch)); commits.push(copy(save)); },
    brendanAuthoredAt: () => ({ level: 'ground', x: 1, y: 2 }), churchCrossingAt: () => true,
    GOD_LOCATION_HOOKS: { 'cathedral-crossing': 'crossing' }, godHookPoint: () => ({ x: 1, y: 2 }),
    scenes: { blocksWorld: () => false, push(scene) { scenes.push(scene); return scene; } },
    makeEncounterStartScene: (options) => options,
    pushCombat: (battle, options) => combats.push({ battle, options }),
    ensureCtx: noOp, CR: { fx: {} }, STORY: {},
    cathedralStaging: noOp, stageCathedral: noOp, presentFinale: noOp,
    openCathedralLesson: () => false, prepareCathedralRetry: () => null, cathedralFightCheckpoint: noOp,
    chapelTapeDemandBlocksProgress,
    chapelTapeDemandState:()=>freshChapelTapeDemand('personal-cathedral-test'),
    // The belfry reward fixture has no Tower warning or academic encounter.
    interactTowerWarning:()=>false, talkToAcademicBouncers:()=>false,
    resolveCathedralLoss: noOp, openCathedralSecondPhase: noOp, cancelApparitionApplause: noOp,
    PB: { isPlaying: () => false },
  };
  vm.createContext(sandbox);
  vm.runInContext(cathedralFunctions + '\nglobalThis.api={cathedralFightReady,tickCathedralFinale,interact,openCathedralFirstPhase};', sandbox);
  assert.equal(sandbox.api.cathedralFightReady(), true);
  for (let index = 0; index < 60; index += 1) sandbox.api.tickCathedralFinale();
  assert.equal(scenes.length, 0);
  assert.equal(combats.length, 0);
  assert.equal(commits.length, 0);
  assert.equal(save.chunkSurf.station.personal.rewardConsumed, false, 'time and arrival cannot spend the opening');
  sandbox.api.interact();
  assert.equal(scenes.length, 1, 'the interaction presents the player’s fight start');
  assert.equal(combats.length, 0, 'the READY confirmation still belongs to the player');
  scenes[0].onConfirm();
  assert.equal(combats.length, 1);
  assert.equal(save.chunkSurf.finale.stage, SOURCE_FINALE_STAGE.CATHEDRAL_FIGHT);
  assert.equal(save.chunkSurf.station.personal.rewardConsumed, true);
  assert.equal(save.chunkSurf.finale.cathedral.alarm, 0);
  assert.equal(combats[0].battle.combat.personalOpening, true);
  assert.equal(combats[0].battle.combat.openingCharge, 2);
  sandbox.api.tickCathedralFinale();
  assert.equal(combats.length, 1);
  assert.equal(scenes.length, 1, 'the active encounter is not opened again by the world tick');
});

test('an active ending presenter cannot be replaced by a saved extraction checkpoint',()=>{
  let carries=0;
  const sandbox={storyMode:true,finaleActive:true,cathedralFinalCombatOpen:false,escape:null,
    usingSpecialSpace:()=>false,scenes:{blocksWorld:()=>false},SOURCE_FINALE_ROUTE,SOURCE_FINALE_STAGE,
    normalizeChunkSurfState,getSave:()=>({chunkSurf:{finale:{route:SOURCE_FINALE_ROUTE.TOWER,stage:SOURCE_FINALE_STAGE.TOWER_ESCAPE}}}),
    startCathedralCarry:()=>{carries++;}};
  vm.createContext(sandbox);vm.runInContext(cathedralFunctions+'\nglobalThis.tick=tickCathedralFinale;',sandbox);
  sandbox.tick();assert.equal(carries,0);
});


test('held personal movement uses the authored cadence in cardinal and diagonal directions without catch-up bursts', () => {
  for (const direction of [[0, -1], [1, -1]]) {
    const steps = [];
    const sandbox = { MOVE_MS, CELL, WORLD_BOUNDARY_FRICTION, storyMode: true,
      usingStairAnomaly: () => false, isIntroActive: () => false, usingSourceSpace: () => true,
      outskirtsStepIndex: 0, PLANT: { heavyWrenchDragging: () => false }, worldBoundaryFriction: 0,
      REC: { recState: () => ({ slow: false }) }, chunkSurfRuntime: {
        towerLandFrame: () => ({ active: true, walkMetresPerSecond: 1.35 }), sourceVoidFrame: () => ({}) },
      sourceShoreOutside: () => false, clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
      setupHandoffBlocksMovement: () => false, paused: false, scenes: { blocksInput: () => false },
      inCover: () => false, holdUnavailableGameplayInput:()=>false,
      arrowDelta: () => direction, renderMove: null, nextMoveAtMs: 0,
      maybeLockHushFromInputDelta: () => {}, step: (dx, dy) => steps.push([dx, dy]) };
    vm.createContext(sandbox);
    vm.runInContext(section('function storyMoveScale(){', '\nfunction currentTurnIntervalMs(')
      + section('function currentStepIntervalMs(', '\nfunction setGameplayPaused(')
      + '\nglobalThis.tick=tickHeldMovement;globalThis.interval=currentStepIntervalMs;', sandbox);
    const interval = sandbox.interval(...direction);
    assert.ok(Math.abs(Math.hypot(...direction) * CELL / (interval / 1000) - 1.35) < .005);
    for (let now = 1; now <= 4001; now += 10) sandbox.tick(now);
    assert.equal(steps.length, 1 + Math.floor(4000 / interval), 'one responsive first step, then one step per interval');
    const before = steps.length;
    sandbox.tick(20000);
    assert.equal(steps.length, before + 1, 'a stalled frame cannot burst through the route');
  }
});
