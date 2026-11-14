import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Group, Mesh, PerspectiveCamera, PlaneGeometry, Raycaster, Vector2, Vector3 } from 'three';
import * as scenes from '../src/game/scenes.js';
import { makeRecorderScene, recorderControlState, recorderKeys, RECORDER_KEY } from '../src/game/recorder-scene.js';
import { drawRecorderFace, recorderButtons, recorderControlRegions, recorderHitRegions, recorderInstrumentLayout, recorderPanelRect, recorderTranscriptRect, recordingOverlayButtons, playbackOverlayButtons, TRANSPORT } from '../src/render/recorder-view.js';
import { recorderFaceLayout } from '../src/render/recorder-instrument.js';
import { uiInit, uiPhysicalSize, uiPointFromClient, uiSetLayoutSize, uiSize } from '../src/render/ui.js';
import { controlMechanicsSnapshot, cancelControlScope } from '../src/game/control-mechanics.js';
import {nightDeadlineAllowsTransport} from '../src/game/night-deadline.js';
import { createPointerModeController } from '../src/input/pointer-mode.js';

const press = (scene, region, type = 'pointerdown', pointerId = 7) => scene.pointer({
  type, pointerId, cellX: region.x + region.w / 2, cellY: region.y + region.h / 2,
});
const takes = [{ roomId: 'main_b3', label: 'STUDIO B3', playable: true, ordinal: '01', status: 'PLAY' }];

// Give pointer tests a real viewport. The approved face scales uniformly to
// available space; an uninitialized 0×0 UI has no clickable display aperture.
{
  const previous = new Map(['document', 'window', 'getComputedStyle'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    globalThis.document = { createElement: () => ({ style: {}, getContext: () => null,
      getBoundingClientRect: () => ({ left: 17, top: 24, width: 1200, height: 800 }) }) };
    globalThis.window = { devicePixelRatio: 1, addEventListener() {} };
    globalThis.getComputedStyle = () => ({ position: 'relative' });
    uiInit({ clientWidth: 1200, clientHeight: 800, appendChild() {} });
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('every recorder transport returns the same physical body beneath its completed glass cover', () => {
  assert.equal(drawRecorderFace(), null);
  for (const width of [38, 66]) {
    const rect = { x: 4, y: 3, w: width, h: 21, compact: width < 52 };
    const expected = recorderFaceLayout(rect).body;
    for (const mode of Object.values(TRANSPORT)) {
      const view = { rect, mode, counter: '03:24', footer: 'CONTROLS', rows: takes,
        buttons: recordingOverlayButtons({ rolling: mode === TRANSPORT.RECORD }),
        guide: { pending: { kind: 'branch', index: 0, options: [{ text: 'ROLL SOUND' }] } } };
      const hits = recorderHitRegions(view);
      assert.deepEqual(drawRecorderFace(view), expected, `${mode}/${width}: no early transport return skips the panel result`);
      assert.deepEqual(recorderHitRegions(view), hits, `${mode}/${width}: material rendering never moves hit targets`);
    }
  }
});
function harness(extra = {}) {
  const calls = [];
  const scene = makeRecorderScene({
    getState: () => ({ playableHere: true }), getTakes: () => takes,
    onPlay: (id) => calls.push(['play', id]), onRecord: () => calls.push(['record']),
    onStopPlayback: () => calls.push(['stop-playback']),
    onStopRecording: () => calls.push(['stop-recording']),
    ...extra,
  });
  scenes.push(scene);
  scene.render();
  return { scene, calls, regions: () => scene.debugState().hitRegions };
}

test('raising the recorder releases first-person look without pausing the room', () => {
  const { scene } = harness();
  assert.equal(scene.blocksInput, true);
  assert.equal(scene.allowsLook, false, 'the machine needs a free pointer, not captured mouse look');
  assert.equal(scene.blocksWorld, false, 'recording, noise decay and the hunter keep running');
  scenes.remove(scene);
});

test('holding R cannot close the newly raised recorder; a fresh press still closes', () => {
  const { scene } = harness();
  scene.key({ key: 'r', code: 'KeyR', repeat: true });
  assert.equal(scenes.has('recorder'), true, 'the opening key repeat is not a second activation');
  scene.keyup({ key: 'r', code: 'KeyR' });
  scene.key({ key: 'r', code: 'KeyR', repeat: false });
  assert.equal(scenes.has('recorder'), false);
});

test('recorder close never arms the unrelated B-release gate and global R rejects repeat before activation', () => {
  const main = readFileSync('src/main.js', 'utf8');
  const open = main.slice(main.indexOf('function openRecorder(){'), main.indexOf('function recorderMachineState(){'));
  assert.match(open, /onClearInput:\(\)=>\{ resetMotionInput\('recorder-close',\{stopRenderMove:true\}\); \}/);
  assert.doesNotMatch(open, /suppressBagReopenUntilRelease/, 'the first B after recorder close must remain available');
  const start = main.indexOf("if(bare && is('KeyR','r')){");
  const handler = main.slice(start, main.indexOf("if(bare && (e.code==='Space'", start));
  assert.ok(handler.indexOf('if(e.repeat)return;') > 0);
  assert.ok(handler.indexOf('if(e.repeat)return;') < handler.indexOf('recordAction()'));
  assert.ok(handler.indexOf('if(e.repeat)return;') < handler.indexOf('openRecorder()'));
});

test('recorder focus cannot power lamps; actual transport owns lamp and latch', () => {
  for (const id of Object.values(RECORDER_KEY)) {
    assert.equal(recorderControlState(id, { selected: true, focused: true }).lit, false);
  }
  assert.deepEqual(recorderControlState('rec', { recording: true }), {
    controlId: 'recorder:rec', lit: true, latched: true, color: 'red',
  });
  assert.equal(recorderControlState('takes', { browsing: true }).lit, true);
  assert.equal(recorderControlState('stop', { recording: true }).latched, false);
});

test('pointer targets remain on the transport housings as the cap travels', () => {
  const rect = { x: 10, y: 20, w: 66, h: 16 };
  const slots = recorderFaceLayout(rect).buttonSlots;
  const keys = [{ id: 'rec', controlId: 'recorder:rec' }, { id: 'stop', enabled: false }, { id: 'takes' }];
  assert.deepEqual(recorderControlRegions(rect, { keys }), keys.map((key, index) => ({
    kind: 'transport', id: key.id, index, controlId: `recorder:${key.id}`,
    ...slots[index], enabled: key.enabled !== false,
  })));
});

test('visible 3D keys pick correctly with navigator columns reserved', () => {
  const source = readFileSync(new URL('../src/render/recorder-rig.js', import.meta.url), 'utf8');
  const camera = new PerspectiveCamera(70, 1.5, .02, 2);
  camera.updateMatrixWorld(true);
  const recorder = new Group();
  recorder.position.set(0, -.13, -.40);
  recorder.rotation.x = -.31;
  const geometry = new PlaneGeometry(.032, .017);
  const caps = [.0341, .071, .108].map(x => {
    const art = new Mesh(geometry);
    art.position.set(x, -.0555, .0324);
    recorder.add(art);
    return { art };
  });
  recorder.updateMatrixWorld(true);
  const physical = uiPhysicalSize();
  uiSetLayoutSize({ cols: physical.cols - 32, rows: physical.rows });
  try {
    const rect = recorderPanelRect(uiSize());
    const layout = recorderFaceLayout(rect);
    // Run the frame's actual hit snapshot and picker without creating WebGL.
    const saveHit = source.slice(source.indexOf("    if (frame.owner !== 'carry'"), source.indexOf('    rendered = true;'));
    const pick = source.slice(source.indexOf('export function recorderRigPointer'), source.indexOf('export function clearRecorderRigPointer'));
    const rig = { camera, caps };
    const recorderRigPointer = runInNewContext(
      `${saveHit}\n${pick.replace('export function', 'function')}\nrecorderRigPointer;`,
      { r: rig, rig, frame: { owner: 'recorder' }, lastPress: null, view: { rect }, layout,
        ...uiSize(), uiPhysicalSize, Raycaster, Vector2 });
    for (const [index, { art }] of caps.entries()) {
      const p = art.getWorldPosition(new Vector3()).project(camera);
      const event = uiPointFromClient(17 + 600 * (1 + p.x), 24 + 400 * (1 - p.y));
      const result = recorderRigPointer(event, 'recorder');
      const slot = layout.buttonSlots[index];
      assert.equal(result.cellX, slot.x + slot.w / 2, `key ${index + 1}`);
      assert.equal(result.cellY, slot.y + slot.h / 2);
    }
  } finally {
    uiSetLayoutSize(null);
    geometry.dispose();
  }
});

test('uniformly fitted recorder keeps all three bottom housings outside its uninterrupted display', () => {
  for (const size of [{ cols: 48, rows: 26 }, { cols: 75, rows: 20 }, { cols: 120, rows: 40 }]) {
    const rect = recorderPanelRect(size), face = recorderFaceLayout(rect);
    const buttons = recorderButtons(rect, recordingOverlayButtons());
    const layout = recorderInstrumentLayout(face.body);
    const controls = recorderControlRegions(rect, buttons);
    assert.equal(layout.usableW, face.body.w, 'the readout loses no width to an obsolete side bank');
    assert.equal(controls.length, 3);
    assert.equal(buttons.w, 0);
    assert.ok(controls.every(control => control.w > 0 && control.h > 0));
    assert.ok(controls.every(control => control.y > face.displayRect.y + face.displayRect.h));
    assert.ok(controls.every(control => control.y + control.h < rect.y + rect.h));
    assert.ok(controls.every(control => control.x >= rect.x && control.x + control.w <= rect.x + rect.w));
    assert.equal(controls[0].y, controls[1].y);
    assert.equal(controls[1].y, controls[2].y);
    assert.ok(controls[0].x + controls[0].w < controls[1].x);
    assert.ok(controls[1].x + controls[1].w < controls[2].x);
  }
});

test('live recording uses the same transport geometry and stable mechanical identities', () => {
  const config = recordingOverlayButtons({ rolling: true });
  assert.equal(config.keys[0].controlId, 'recording:rec');
  assert.equal(config.keys[0].lit, true);
  assert.equal(config.keys[0].latched, true);
  assert.equal(config.keys[1].id, 'stop');
  assert.deepEqual(config.keys.map(key => key.label), ['REC', 'STOP', 'TAKES']);
  assert.equal(recordingOverlayButtons({ held: true }).keys[0].label, 'REC');
  assert.equal(recordingOverlayButtons({ held: true }).keys[0].lit, false);
  const rect = recorderPanelRect({ cols: 120, rows: 40 });
  const [rec, stop] = recorderControlRegions(rect, config);
  assert.equal(rec.w, recorderFaceLayout(rect).buttonSlots[0].w);
  assert.equal(stop.y, rec.y);
  assert.ok(stop.x > rec.x + rec.w);
});

test('recorder transport is actually clickable with immediate activation and release/cancel cleanup', () => {
  const { scene, calls, regions } = harness({ getState: () => ({ playing: true }) });
  const stop = regions().find((region) => region.id === 'stop');
  press(scene, stop);
  assert.deepEqual(calls, [['stop-playback']], 'pointer down reaches the existing verb without waiting for animation');
  assert.ok(controlMechanicsSnapshot().ids.includes('recorder:stop'));
  press(scene, stop, 'pointerup');
  press(scene, stop, 'pointercancel');
  scenes.remove(scene);
  assert.ok(!controlMechanicsSnapshot().ids.some((id) => id.startsWith('recorder:')));
});

test('pointer hover selects without activating; refused keys preserve the refusal', () => {
  const { scene, calls, regions } = harness({ getState: () => ({ refusal: { reason: 'ROOM ALREADY PRINTED' } }) });
  const rec = regions().find((region) => region.id === 'rec');
  press(scene, rec, 'pointermove');
  assert.deepEqual(calls, []);
  press(scene, rec);
  assert.deepEqual(calls, []);
  assert.equal(scene.debugState().notice, 'ROOM ALREADY PRINTED');
  scenes.remove(scene);
});

test('pointer can browse and play a specific tape with no keyboard detour', () => {
  const { scene, calls, regions } = harness();
  press(scene, regions().find((region) => region.id === 'takes'));
  scene.render();
  const tape = regions().find((region) => region.kind === 'take');
  assert.ok(tape);
  press(scene, tape);
  assert.deepEqual(calls, [['play', 'main_b3']]);
  assert.equal(scene.debugState().browsing, false);
  scenes.remove(scene);
});

test('controller and keyboard transport presses retain the same keyup path', () => {
  const { scene, calls } = harness({ getState: () => ({ playing: true }) });
  scene.key({ key: 'Enter', code: 'Enter', controller: true, controllerAction: 'confirm' });
  assert.deepEqual(calls, [['stop-playback']]);
  assert.equal(scene.keyup({ key: 'Enter', code: 'Enter', controller: true }), true);
  scenes.remove(scene);
});

test('focus-loss cancellation releases both keyboard and pointer holds', () => {
  const { scene, regions } = harness({ getState: () => ({ playing: true }) });
  const stop = regions().find((region) => region.id === 'stop');
  press(scene, stop);
  scene.key({ key: 'Enter', code: 'Enter' });
  scene.pointer({ type: 'pointercancel' });
  assert.ok(!controlMechanicsSnapshot().ids.some((id) => id.startsWith('recorder:')));
  assert.equal(scene.keyup({ key: 'Enter', code: 'Enter' }), false);
  scenes.remove(scene);
});

test('guide choice hit regions use the exact wrapped transcript rows', () => {
  const regions = recorderHitRegions({
    rect: { x: 10, y: 20, w: 66, h: 21 }, mode: TRANSPORT.LISTEN,
    guide: { pending: { kind: 'branch', index: 0, options: [{ text: 'ROLL SOUND' }, { text: 'CHECK THE ROOM' }] } },
  });
  const choices = regions.filter((region) => region.kind === 'choice');
  assert.deepEqual(choices.map((region) => region.index), [0, 1]);
  assert.equal(regions.at(-1).kind, 'guide', 'explicit options take priority over generic advance');
  assert.ok(choices.every((region) => region.h === 1 && region.w > 0));
  cancelControlScope('');
});

test('enlarged pre-roll keeps both choices and controls in frame, below the annunciator rows', () => {
  // 960×600 CSS pixels at UI scale 1.5 is 75×20 cells. The previous 21-row
  // pre-roll began at row3 and lost its second choice and footer offscreen.
  for (const size of [{ cols: 75, rows: 20 }, { cols: 150, rows: 38 }]) {
    const rect = recorderPanelRect({ ...size, rowsNeeded: 15 });
    const view = { rect, mode: TRANSPORT.LISTEN, footer: 'ENTER PRESS · R CLOSE',
      buttons: { keys: [{ id: 'rec' }, { id: 'stop' }, { id: 'takes' }] },
      guide: { pending: { kind: 'branch', index: 0, options: [{ text: 'ROLL SOUND' }, { text: 'CHECK THE ROOM' }] } } };
    const face = recorderFaceLayout(rect), body = face.body;
    const content = recorderTranscriptRect(body);
    const hits = recorderHitRegions(view), choices = hits.filter(hit => hit.kind === 'choice');
    assert.ok(rect.y + rect.h < size.rows, 'complete lower bezel stays inside the viewport');
    assert.ok(content.y > face.displayRect.y, 'the transcript is inset inside the display well');
    assert.equal(choices.length, 2);
    assert.ok(choices[0].y + choices[0].h <= choices[1].y);
    assert.ok(choices.every(hit => hit.y >= content.y && hit.y + hit.h <= content.y + content.h));
    assert.ok(choices.at(-1).y + choices.at(-1).h < face.buttonSlots[0].y, 'bottom keys never cover a choice');
    assert.deepEqual(hits.filter(hit => hit.kind === 'transport'), recorderControlRegions(rect, view.buttons),
      'drawing and hit testing share the exact approved bottom housings');
  }
});

test('pointer pre-roll advances speech and chooses the clicked authored option', () => {
  const chosen = [];
  const { scene, regions } = harness({
    onRecord: ({ beginGuide }) => beginGuide({
      id: 'pointer-pre-roll',
      nodes: { start: { lines: [{ who: 'direction', text: 'Kill the light and roll.' }],
        choices: [{ id: 'wait', text: 'WAIT' }, { id: 'roll', text: 'ROLL SOUND' }] } },
      onChoice: (choice) => chosen.push(choice.id),
    }),
  });
  press(scene, regions().find((region) => region.id === 'rec'));
  assert.equal(scene.debugState().guide?.id, 'pointer-pre-roll');
  scene.update(2);
  scene.render();
  press(scene, regions().find((region) => region.kind === 'guide'));
  scene.render();
  press(scene, regions().find((region) => region.kind === 'choice' && region.index === 1));
  assert.deepEqual(chosen, ['roll']);
  assert.equal(scenes.has('recorder'), false, 'guide completion retains its existing close lifecycle');
});

test('REC / STOP / TAKES identities and labels survive every recording, playback and browse state', () => {
  for (const recording of [false, true]) for (const stalled of [false, true]) {
    for (const playing of [false, true]) for (const browsing of [false, true]) {
      for (const tapes of [0, 1, 12]) {
        const keys = recorderKeys({ recording, stalled, playing, browsing, tapes });
        assert.deepEqual(keys.map(key => key.id), ['rec', 'stop', 'takes']);
        assert.deepEqual(keys.map(key => key.label), ['REC', 'STOP', 'TAKES']);
        assert.equal(keys[1].enabled, recording || playing);
        assert.equal(keys[2].enabled, true, 'an empty list is still inspectable');
      }
    }
  }
});

test('TAKES stays interactive during live recording without stopping, restarting, or auditioning the take', () => {
  const live = { recording: true, stalled: false, playing: false, progress: .2 };
  const { scene, calls, regions } = harness({ getState: () => live });
  assert.equal(scene.debugState().selectedKey, 'stop', 'one confirm remains an immediate stop');
  press(scene, regions().find(region => region.id === 'takes'));
  scene.render();
  assert.equal(scene.debugState().browsing, true);
  assert.equal(scene.blocksWorld, false);
  const row = regions().find(region => region.kind === 'take');
  assert.ok(row, 'the active take does not hide saved rows');
  press(scene, row);
  scene.key({ key: 'Enter', code: 'Enter', controllerAction: 'confirm' });
  scene.key({ key: 'p', code: 'KeyP' });
  scene.key({ key: ' ', code: 'Space' });
  assert.deepEqual(calls, []);
  assert.equal(scene.debugState().notice, 'STOP RECORDING BEFORE PLAYBACK');
  assert.equal(scene.debugState().browsing, true);
  live.progress = .4;
  scene.update(1);
  scene.render();
  assert.equal(live.progress, .4, 'the scene does not substitute or reset a recording clock');
  press(scene, regions().find(region => region.id === 'takes'));
  assert.equal(scene.debugState().browsing, false);
  assert.deepEqual(calls, []);
  assert.equal(live.recording, true);
  scenes.remove(scene);
});

test('STOP stops playback; held REC resumes but held STOP only stops recording', () => {
  for (const input of ['pointer', 'keyboard', 'controller']) {
    const { scene, calls, regions } = harness({ getState: () => ({ playing: true }) });
    if (input === 'pointer') press(scene, regions().find(region => region.id === 'stop'));
    else scene.key({ key: 'Enter', code: 'Enter', ...(input === 'controller' ? { controllerAction: 'confirm' } : {}) });
    assert.deepEqual(calls, [['stop-playback']], input);
    scenes.remove(scene);
  }
  for (const id of ['rec', 'stop']) {
    const { scene, calls, regions } = harness({ getState: () => ({ recording: true, stalled: true }) });
    press(scene, regions().find(region => region.id === id));
    assert.deepEqual(calls, [[id === 'rec' ? 'record' : 'stop-recording']]);
    scenes.remove(scene);
  }
});

test('empty TAKES can close by its own button, Tab, or T and keyboard can reach STOP from the list', () => {
  const { scene, calls, regions } = harness({ getTakes: () => [], getState: () => ({ recording: true }) });
  assert.equal(scene.browseTakes(), true);
  scene.render();
  assert.equal(scene.debugState().browsing, true);
  assert.equal(regions().some(region => region.kind === 'take'), false);
  scene.key({ key: 'Enter', code: 'Enter' });
  assert.deepEqual(calls, []);
  scene.key({ key: 'Tab', code: 'Tab' });
  assert.equal(scene.debugState().browsing, false);
  scene.key({ key: 't', code: 'KeyT' });
  assert.equal(scene.debugState().browsing, true);
  scene.key({ key: 'ArrowLeft', code: 'ArrowLeft', controller: true });
  assert.equal(scene.debugState().focus, 'transport');
  assert.equal(scene.debugState().selectedKey, 'stop');
  scene.key({ key: 'Enter', code: 'Enter', controllerAction: 'confirm' });
  assert.deepEqual(calls, [['stop-recording']]);
  scenes.remove(scene);
});

test('Space and P audition from monitor, while stale tape targets recheck a newly started live take', () => {
  for (const event of [{ key: ' ', code: 'Space' }, { key: 'p', code: 'KeyP' }]) {
    const { scene, calls } = harness();
    scene.key(event);
    assert.deepEqual(calls, [['play', null]]);
    assert.equal(scene.debugState().selectedKey, 'stop');
    scenes.remove(scene);
  }
  const live = { playableHere: true, recording: false };
  const { scene, calls, regions } = harness({ getState: () => live });
  scene.browseTakes(); scene.render();
  const target = regions().find(region => region.kind === 'take');
  live.recording = true;
  press(scene, target);
  assert.deepEqual(calls, []);
  assert.equal(scene.debugState().notice, 'STOP RECORDING BEFORE PLAYBACK');
  scenes.remove(scene);
});

test('secondary clicks and stale closed-scene events never operate transport or resurrect holds', () => {
  const { scene, calls, regions } = harness({ getState: () => ({ playing: true }) });
  const stop = regions().find(region => region.id === 'stop');
  scene.pointer({ type: 'pointerdown', pointerId: 1, button: 2, cellX: stop.x + stop.w / 2, cellY: stop.y + stop.h / 2 });
  assert.deepEqual(calls, []);
  press(scene, stop);
  scenes.remove(scene);
  const before = calls.length;
  press(scene, stop); scene.key({ key: 'Enter', code: 'Enter' });
  scene.key({ key: 'p', code: 'KeyP' }); scene.render();
  assert.equal(scene.browseTakes(), false);
  assert.equal(calls.length, before);
  assert.ok(!controlMechanicsSnapshot().ids.some(id => id.startsWith('recorder:')));
});

function mainFunction(name, globals) {
  const source = readFileSync('src/main.js', 'utf8');
  const start = source.indexOf(`function ${name}(`), end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start);
  const extracted=source.slice(start,end).replaceAll('import.meta.env.DEV','false');
  return runInNewContext(`(${extracted})`, globals);
}

test('lowering the live recorder returns camera look without touching the take, and raising it restores STOP', async () => {
  const state = { recording: false, playing: false, scene: null, slating: false, stalled: false };
  const shortcuts = [];
  const documentRef = { visibilityState: 'visible', pointerLockElement: null,
    exitPointerLock() { this.pointerLockElement = null; } };
  const surface = { requestPointerLock() { documentRef.pointerLockElement = surface; } };
  const globals = {
    storyMode: true, inRogue: true, paused: false, RENDERER: '3d', lastExposureEvent: null,
    REC: { isRecording: () => state.recording, isSlating: () => state.slating, isStalled: () => state.stalled },
    PB: { isPlaying: () => state.playing }, TUT: { tutorialActive: () => false },
    takeRoom: 'main_b3', LEVEL_CHECK_ROOM: 'level-check',
    usingSourceSpace: () => false, towerWarningOwnsMoment: () => false,
    scenes: { depth: () => Number(!!state.scene), blocksInput: () => !!state.scene, allowsLook: () => false },
    startupPresentationHeld: () => false, gameplayInputLifecycleActive: () => true,
    liveRecorderHadCursor: false, liveTakeRecorderIsLowered: false,
    liveRecordingPointerControls: new Map(), R3: {}, cancelControlScope() {}, cancelRecorderRigPress() {},
    recordAction: () => shortcuts.push('transport'), openRecorder: () => shortcuts.push('open'),
  };
  globals.canLowerLiveTakeRecorder = mainFunction('canLowerLiveTakeRecorder', globals);
  globals.liveTakeRecorderLowered = mainFunction('liveTakeRecorderLowered', globals);
  globals.liveRecorderTakesCursor = mainFunction('liveRecorderTakesCursor', globals);
  globals.gameplayWantsPointerCapture = mainFunction('gameplayWantsPointerCapture', globals);
  const pointer = createPointerModeController({ documentRef, getTargetElement: () => surface,
    getState: () => ({ renderer: '3d', storyMode: true, inRogue: true,
      blocksLook: globals.liveRecorderTakesCursor() || globals.scenes.blocksInput() }),
    setTimeoutFn: () => 0,
  });
  globals.syncPointerMode = reason => pointer.sync(reason);
  globals.resumeGameplayInput = reason => pointer.requestCaptureFromGesture(reason);
  const syncRecorder = globals.syncLiveRecorderCursor = mainFunction('syncLiveRecorderCursor', globals);
  globals.toggleLiveTakeRecorder = mainFunction('toggleLiveTakeRecorder', globals);
  const source = readFileSync('src/main.js', 'utf8');
  const rKey = source.slice(source.indexOf("    if(bare && is('KeyR','r')){"), source.indexOf('    // [space]/[enter] hurries'));
  const pressR = runInNewContext(`(e => { const bare = true, is = () => true; ${rKey} })`, globals);

  await pointer.requestCaptureFromGesture('walk');
  assert.equal(pointer.isTrueLocked(), true);
  state.recording = true;
  syncRecorder();
  assert.equal(pointer.isTrueLocked(), false);
  assert.equal(globals.gameplayWantsPointerCapture(), false);
  await pointer.requestCaptureFromGesture('click-away-from-deck');
  assert.equal(pointer.isTrueLocked(), false);

  pressR({ preventDefault() {} });
  assert.equal(globals.liveTakeRecorderLowered(), true);
  assert.equal(pointer.isTrueLocked(), true);
  assert.equal(state.recording, true);
  state.stalled = true;
  syncRecorder();
  assert.equal(globals.liveTakeRecorderLowered(), false, 'an authored hold exposes its transport');
  assert.equal(pointer.isTrueLocked(), false);
  state.stalled = false;
  syncRecorder();
  assert.equal(pointer.isTrueLocked(), true);
  pressR({ repeat: true, preventDefault() {} });
  assert.equal(globals.liveTakeRecorderLowered(), true);
  pressR({ preventDefault() {} });
  assert.equal(globals.liveTakeRecorderLowered(), false);
  assert.equal(pointer.isTrueLocked(), false);
  assert.equal(state.recording, true);
  assert.deepEqual(shortcuts, []);
  pressR({ controller: true, preventDefault() {} });
  state.slating = true;
  pressR({ preventDefault() {} });
  state.slating = false;
  assert.deepEqual(shortcuts, ['transport', 'transport']);

  state.scene = 'short-take-confirmation';
  syncRecorder();
  assert.equal(pointer.isTrueLocked(), false);
  state.scene = null;
  syncRecorder();
  assert.equal(pointer.isTrueLocked(), false, 'keep recording returns to the live controls');

  state.recording = false;
  syncRecorder();
  assert.equal(pointer.isTrueLocked(), true);
  state.playing = true;
  syncRecorder();
  assert.equal(pointer.isTrueLocked(), false);
  state.playing = false;
  syncRecorder();
  assert.equal(pointer.isTrueLocked(), true);
  pointer.dispose();
});

test('the actual playback entry refuses recording and switches an explicit chosen take after stopping the old one', () => {
  const log = [], state = { recording: true, playing: true, hasTake: true, lowerCalls: 0 };
  const play = mainFunction('playTakeFrom', {
    chapelTapeCaseAvailable: () => true,
    nightDeadlineAllowsTransport,getSave:()=>({nightDeadline:null}),firstStrikeAudio:null,
    REC: { isRecording: () => state.recording },
    PB: { hasTake: () => state.hasTake, tapeTake: roomId => ({roomId,status:'accepted'}), isPlaying: () => state.playing,
      stopPlayback: () => { log.push('stop'); state.playing = false; },
      playbackInit: () => log.push('init'), playTake: room => { log.push(['play', room]); state.playing = true; return true; } },
    currentWorld: () => 'main_b3', playbackRoom: 'main_b3',
    ensureTapeAudio: () => { log.push('audio');log.push('init'); }, pendingTapeRoll:false, actx: {}, sfxGain: {}, master: {},
    roomToneCharacter: () => ({}), framedLine: key => key, LINES: {},
    SPEECH: { say: line => log.push(['say', line]) },
    lowerTowerPersonalRecorder: () => { state.lowerCalls++; },
  });
  assert.equal(play('the_tub'), false);
  assert.equal(play(), false);
  assert.deepEqual(log, [], 'a live take does not even stop the other subsystem or emit refusal speech');
  assert.equal(state.lowerCalls, 0, 'refused playback cannot lower the physical recorder');
  state.recording = false;
  assert.equal(play('the_tub'), true);
  assert.deepEqual(log.slice(0, 4), ['stop', 'audio', 'init', ['play', 'the_tub']]);
  assert.equal(state.lowerCalls, 1, 'accepted playback lowers the held recorder once');
  log.length = 0;
  assert.equal(play(), false);
  assert.deepEqual(log, ['stop'], 'monitor audition retains its toggle-to-stop behavior');
  assert.equal(state.lowerCalls, 2, 'the valid monitor toggle also releases the held recorder');
  state.hasTake = false;
  assert.equal(play('missing_room'), false);
  assert.equal(state.lowerCalls, 2, 'a missing take does not lower the recorder');
});

test('the real live-overlay TAKES route opens the list without invoking a record/stop verb', () => {
  const log = [], controls = new Map();
  const handle = mainFunction('onPointerEvent', {
    startupPresentationHeld: () => false, noteRecorderRigPress: () => {},
    scenePointerPayload: event => event,
    pointerEventHitsGameplaySurface: () => true,
    liveRecordingControlHit: () => ({ id: 'takes', controlId: 'recording:takes' }),
    liveRecordingPointerControls: controls,
    BINDINGS: { setActiveInputDevice() {} }, recoverInteractionAudio() {}, ensureInteractionFocus() {},
    gameplayWantsPointerCapture: () => false,
    scenes: { pointer: () => false, top: () => ({ browseTakes: () => log.push('browse') }) },
    openRecorder: () => { log.push('open'); return true; },
    REC: { isRecording: () => true, isStalled: () => false },
    recordAction: () => log.push('record'), stopTake: () => log.push('stop'),
    pressControl: id => log.push(['press', id]), cancelControlScope: scope => log.push(['cancel', scope]),
  });
  handle({ type: 'pointerdown', pointerId: 8, button: 0 });
  assert.deepEqual(log, [['press', 'recording:takes'], 'open', 'browse', ['cancel', 'recording:']]);
  assert.equal(controls.size, 0, 'handoff releases the outgoing overlay control');
  log.length = 0;
  handle({ type: 'pointerdown', pointerId: 8, button: 2 });
  assert.deepEqual(log, []);
});

test('the raised recorder uses the same actual noise reading and recorded event marks as the passive face', () => {
  const live = { recording: false, playing: false, ambient: .2, microphone: false, duration:45, inputScale:1 };
  const snapshot = { roomId: 'the_tub', progress: .3, elapsedSec: 27, durationSec: 90,
    signalLeft: .22, signalRight: .41, markers: [{ id: 'real-event', position: .73 }] };
  const machine = mainFunction('recorderMachineState', {
    recordingStopConfirmation:{notice:()=>''},
    sourceContinuationScene:null,
    chapelTapeRetakeRoom:()=>null,
    HUNTER: { takeHunterTransport: () => ({phase:'normal'}) }, takeHunter: {},
    REC: { recState: () => ({ takeElapsed: 9, spoiled: false }), isRecording: () => live.recording,
      isSlating:()=>false,usableTake:()=>false,minimumTakeDuration:()=>45,isStalled: () => false, isAssistPaused: () => false, isMonitoring: () => live.recording,
      currentNoise: () => .3, ambientNoise: () => live.ambient, takeProgress: () => .2,
      takeDuration: () => live.duration, recordingInputLevel: value => value * live.inputScale,
      takeEvents: () => [{ atSec: 9, kind: 'spoil' }], noiseMarks: () => [{ level: .5, kind: 'spoil' }],
      spoilThreshold: () => .7 },
    PB: { tapeTransport:()=>({headSeconds:99}),isPlaying: () => live.playing, playbackSnapshot: () => snapshot, hasTake: () => true,
      takeMarks: () => [{ at: .1, kind: 'event', id: 'stored' }] },
    MIC: { micActive: () => live.microphone, micLevel: () => .12,micMeterMeasurement:()=>({rms:.12}) },
    MONITOR: { monitorSnapshotForRms: rms => ({ rms, db: 20 * Math.log10(rms) }),monitorSnapshotForMeasurement:value=>value },
    setPieceMeterPinned: false, presenceMeterLevel: () => .4, currentWorld: () => 'main_b3', recorderRefusal: () => null, usingSourceSpace: () => false,
    roomLabel: room => room.toUpperCase(), formatPlaybackTime: seconds => String(seconds),
    recordingDurationLabel: () => String(live.duration),
    ROOM_TONE: { takeSeconds: 45 }, performance: { now: () => 1000 }, SPEECH: { speechPanelRows: () => 0 },
    tickTapeMarkers: () => {}, tapeMarkerNote: () => '',
  });
  let face = machine().face;
  assert.equal(face.levels, null, 'monitor mode invents no stereo signal');
  assert.equal(face.meter, null);
  assert.equal(face.roomMeter, null);
  assert.equal(face.locationSeconds, 45);
  live.microphone = true;
  assert.equal(machine().face.roomMeter.rms, .12);
  live.recording = true;
  face = machine().face;
  assert.equal(face.levels, null);
  assert.equal(face.meter.rms, .5, 'hypot(.3 player, .4 presence) is the physical .5 input, not a normalized/clipped fraction');
  assert.equal(face.locationMarks[0].id, 'stored');
  assert.equal(face.locationMarks[1].at, .2);
  assert.equal(face.locationMarks[1].kind, 'event');
  assert.equal(face.meterMarks[0].db, 20 * Math.log10(.5));
  assert.equal(face.meterThresholdDb, 20 * Math.log10(.7));
  live.ambient = .75;
  assert.equal(machine().face.meter.rms, .75, 'ambient noise can supply the minimum reading');
  live.inputScale = .85; live.duration = 49.5;
  face = machine().face;
  assert.equal(face.meter.rms, .75 * .85, 'the actual fitted input scale is applied once to the display');
  assert.equal(face.locationSeconds, 49.5);
  assert.equal(face.locationMarks[1].at, 9 / 49.5, 'live marks use this take’s real duration');
  live.recording = false; live.playing = true;
  face = machine().face;
  assert.equal(face.meter, null);
  assert.equal(face.roomMeter, null, 'a room microphone must not replace playback output on the return meter');
  assert.equal(face.levels.left, .22); assert.equal(face.levels.right, .41);
  assert.equal(face.locationSeconds, 90);
  assert.equal(face.locationMarks[0].at, .73);
});

test('passive playback hit testing shares the exact drawn bottom housings and rejects disabled REC', () => {
  const state = { modal: false, captured: false };
  const size = { cols: 150, rows: 40 }, clearBottom = 3;
  const rect = recorderPanelRect({ ...size, progress: 0, rowsNeeded: 9, clearBottom });
  const targets = recorderControlRegions(rect, playbackOverlayButtons());
  const hit = mainFunction('liveRecordingControlHit', {
    liveRecorderTakesCursor: () => !state.modal,
    REC: { isRecording: () => false }, PB: { isPlaying: () => true },
    pointerMode: { isTrueLocked: () => state.captured, isNativeCaptured: () => false },
    uiSize: () => size, recorderPanelRect, recorderControlRegions, playbackOverlayButtons,
    recorderRigPointer: event => event,
    SPEECH: { speechPanelRows: () => clearBottom },
    takePanelRect: () => { throw new Error('playback cannot borrow the progressing recording geometry'); },
  });
  const point = target => ({ cellX: target.x + target.w / 2, cellY: target.y + target.h / 2 });
  assert.equal(hit(point(targets[0])), null);
  assert.equal(hit(point(targets[1])).id, 'stop');
  assert.equal(hit(point(targets[2])).id, 'takes');
  state.modal = true;
  assert.equal(hit(point(targets[1])), null);
  state.modal = false; state.captured = true;
  assert.equal(hit(point(targets[1])), null);
});

test('passive playback STOP reaches playback ownership rather than the recording verb', () => {
  const log = [], state = { playing: true };
  const globals = {
    startupPresentationHeld: () => false, noteRecorderRigPress: () => {},
    afterRecorderStopPress: action => action(), paused: false,
    scenePointerPayload: event => event, pointerEventHitsGameplaySurface: () => true,
    liveRecordingControlHit: () => ({ id: 'stop', controlId: 'recording:stop' }),
    liveRecordingPointerControls: new Map(), playbackRoom: 'the_tub', pendingTapeRoll:false, saveCommit:()=>{},
    BINDINGS: { setActiveInputDevice() {} }, recoverInteractionAudio() {}, ensureInteractionFocus() {},
    gameplayWantsPointerCapture: () => false, scenes: { pointer: () => false, blocksInput: () => false },
    REC: { isRecording: () => false, saveRecState:()=>({}) },
    PB: { isPlaying: () => state.playing, takeFor: () => ({id:'test-tape'}),
      stopPlayback: () => { state.playing = false; log.push('stop-playback'); } },
    recordAction: () => log.push('record'), stopTake: () => log.push('stop-take'),
    pressControl: () => {}, cancelControlScope: () => {},
  };
  mainFunction('onPointerEvent', globals)({ type: 'pointerdown', pointerId: 2, button: 0 });
  assert.deepEqual(log, ['stop-playback']);
  assert.equal(globals.playbackRoom, null);
  assert.equal(globals.liveRecordingPointerControls.size, 0);
});

test('long recorder replies page without committing and reset when selection changes',()=>{
  const chosen=[];
  const {scene}=harness();
  scene.beginGuide({id:'long-replies',nodes:{start:{lines:[],choices:[
    {id:'long',text:'A long response '.repeat(180)}, {id:'short',text:'SAY LESS'},
  ]}},onChoice:c=>chosen.push(c.id)});
  scene.render();let guide=scene.debugState().guide;
  assert.ok(guide.scrollMax>0,'selected reply spans more than the recorder display');
  assert.equal(guide.view.choiceScrollOffset,0);
  scene.key({key:'PageDown',code:'PageDown'});scene.render();guide=scene.debugState().guide;
  assert.equal(guide.view.choiceScrollOffset,1);assert.deepEqual(chosen,[]);
  scene.key({key:'Tab',code:'Tab',controllerAction:'tabNext'});scene.render();guide=scene.debugState().guide;
  assert.equal(guide.view.choiceScrollOffset,2,'controller can page a long reply without committing');
  scene.key({key:'ArrowDown',code:'ArrowDown'});scene.render();guide=scene.debugState().guide;
  assert.equal(guide.view.pending.index,1);assert.equal(guide.view.choiceScrollOffset,0);
  scene.key({key:'2',code:'Digit2'});assert.deepEqual(chosen,['short']);
  scenes.clear();
});
