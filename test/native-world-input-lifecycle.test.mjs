import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { InputManager, movementCodeForEvent, keyboardCodeRole, keyboardMotionAxes } from '../src/input/input-manager.js';
import { shouldOpenPauseForEvent } from '../src/game/pause.js';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
function productionFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const end = source.indexOf('\n}\n', start);
  assert.ok(end > start, `production function ${name} is complete`);
  return source.slice(start, end + 3);
}
function harness() {
  const h = {
    KEY_DEBUG: false, SUPPRESS_BROWSER_CHROME: false, IS_TAURI: true, RENDERER: '3d',
    storyMode: true, hushRunActive: false, inRogue: true, paused: false,
    domFocused: true, nativeFocused: true, now: 1000, top: null, consumeScene: false,
    motionInput: new InputManager(), motionFocusSuspended: false, renderMove: null,
    nextMoveAtMs: 0, nextTurnAtMs: 0, lastLoopMs: 0, motionResetReason: '',
    lastUnexpectedPointerUnlockAt: 0, suppressBagReopenUntilRelease: false,
    heldPropPlay: null, stationInteractionDown: false, moves: [], looks: [], actions: [], captures: [],
    sceneKeys: [], pauseOpens: 0, pauseCloses: 0, godOpens: 0, reserved: 0, stick: { turnX: 0, lookY: 0 },
  };
  Object.assign(h, {
    document: { hidden: false, visibilityState: 'visible', hasFocus: () => h.domFocused },
    performance: { now: () => h.now },
    pointerMode: { status: () => ({ nativeBackend: { focused: h.nativeFocused } }) },
    scenes: {
      top: () => h.top, depth: () => h.top ? 1 : 0,
      blocksInput: () => !!h.top?.blocksInput, tracksMotion: () => !!h.top?.tracksMotion,
      allowsLook: () => !!h.top?.allowsLook,
      key: e => {
        h.sceneKeys.push(e.code);
        if (h.top?.id === 'pause' && e.code === 'Escape') { h.pauseCloses += 1; h.top = null; return true; }
        return h.consumeScene;
      },
      keyup: () => false,
    },
    BINDINGS: { setActiveInputDevice() {}, isRadioControlEvent: () => false },
    SPEECH: { hasEscapableSpeech: () => false, cancelEscapableSpeech: () => h.actions.push('speech-cancel'),
      isSpeaking: () => false, skipSpeech: () => h.actions.push('speech-skip') },
    REC: { setSlow() {}, isRecording: () => false, isListening: () => false },
    CONTROLLER: { controllerMotionAxes: () => h.stick },
    controllerGameplayAxes: () => h.stick,
    R3: { r3dLook: (x, y) => h.looks.push([x, y]), r3dLookAngles: () => ({yaw:0,pitch:0}) },
    noteExteriorArrivalControl() {},
    costumeInspectionScene: null,
    towerWarningAudio: null,
    isMapShortcut: () => false, // These tests exercise lifecycle holds, not map navigation.

    shouldOpenPauseForEvent, movementKey: movementCodeForEvent, movementRole: keyboardCodeRole,
    hardwarePromptIds: () => [], pressPromptControl() {}, releasePromptControl() {},
    isBrowserChromeShortcut: () => false, isReservedDesktopShortcut: e => e.code === 'F11',
    handleReservedDesktopShortcut: () => { h.reserved += 1; },
    openGodMenu: () => { h.godOpens += 1; },
    openPauseMenu: () => { h.pauseOpens += 1; h.top = { id: 'pause', blocksInput: true }; },
    resumeGameplayInput: reason => h.captures.push(reason), recoverInteractionAudio() {},
    isOnboardingActive: () => false, setupHandoffBlocksMovement: () => false,
    inCover: () => false, coverAvailable: () => true, exitCover() {},
    snapMotionRig() {}, maybeLockHushFromInputDelta() {},
    step: (x, y) => h.moves.push([x, y]),
    arrowDelta: () => { const a = keyboardMotionAxes(h.motionInput.held); return [a.moveX, a.moveY]; },
    armHeldMovement: now => { h.nextMoveAtMs = now + 80; }, currentStepIntervalMs: () => 80,
    turnHeldDir: () => 0, currentTurnIntervalMs: () => 80, performQuarterTurn: () => h.actions.push('turn'),
    stationRealmHomeKey: () => false, interact: () => h.actions.push('interact'),
    toggleTorchAction: () => h.actions.push('torch'), openRadio: () => h.actions.push('radio'),
    openRecorder: () => h.actions.push('recorder'), recordAction: () => h.actions.push('record'),
    openBag: () => h.actions.push('bag'), toggleCoverAction: () => h.actions.push('cover'),
    playCurrentTake: () => h.actions.push('playback'), stopHeldPropPlay() {},
    mouseLookSensitivity: () => 1, mouseInvertY: () => false,
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  });
  h.keysDown = h.motionInput.held;
  vm.createContext(h);
  const names = ['gameplayInputLifecycleActive', 'holdUnavailableGameplayInput', 'resetMotionInput',
    'recoverMotionFocus', 'tickHeldMovement', 'tickHeldTurning', 'tickIndependentLook', 'onKey', 'onKeyUp'];
  vm.runInContext(names.map(productionFunction).join('\n') + '\nglobalThis.api={onKey,onKeyUp,tickHeldMovement,tickHeldTurning,tickIndependentLook,recoverMotionFocus};', h);
  h.key = (code, key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code, extra = {}) => {
    const e = { code, key, target: { tagName: 'DIV' }, repeat: false, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
    h.api.onKey(e); return e;
  };
  h.hidden = value => { h.document.hidden = value; h.document.visibilityState = value ? 'hidden' : 'visible'; };
  return h;
}

test('hidden native gameplay ignores immediate and repeated movement rather than queuing a step', () => {
  const h = harness(); h.hidden(true);
  h.key('KeyW'); h.key('KeyA'); h.key('ArrowDown', 'ArrowDown', { repeat: true });
  h.api.tickHeldMovement(1200);
  assert.deepEqual(h.moves, []);
  assert.equal(h.motionInput.held.size, 0);
  assert.deepEqual(h.captures, [], 'hidden keys cannot ask for first-person ownership');
  h.hidden(false); h.api.recoverMotionFocus('visibility-visible'); h.api.tickHeldMovement(1400);
  assert.deepEqual(h.moves, [], 'discarded hidden keys cannot replay after return');
  h.key('KeyW'); assert.equal(h.moves.length, 1, 'a fresh visible press still walks');
});

test('known native focus loss blocks world actions despite stale positive DOM focus', () => {
  const h = harness(); h.nativeFocused = false;
  for (const code of ['KeyW', 'KeyE', 'KeyF', 'KeyP', 'KeyB']) h.key(code);
  assert.deepEqual(h.moves, []); assert.deepEqual(h.actions, []);
  assert.equal(h.motionInput.held.size, 0); assert.deepEqual(h.captures, []);
});

test('known native focus permits visible input before delayed WebKit document focus', () => {
  const h = harness(); h.domFocused = false;
  h.key('KeyW'); h.key('KeyE');
  assert.equal(h.moves.length, 1); assert.deepEqual(h.actions, ['interact']);
});

test('held movement is retired on hidden frames and never bursts when visibility returns', () => {
  const h = harness(); h.key('KeyW'); assert.equal(h.moves.length, 1);
  h.hidden(true); h.api.tickHeldMovement(2000);
  assert.equal(h.moves.length, 1); assert.equal(h.motionInput.held.size, 0); assert.equal(h.nextMoveAtMs, 0);
  h.hidden(false); h.api.recoverMotionFocus('visibility-visible'); h.api.tickHeldMovement(5000);
  assert.equal(h.moves.length, 1, 'the old hold is not a fresh return gesture');
  h.key('KeyW'); assert.equal(h.moves.length, 2);
});

test('paused hidden dialogue cannot consume E, Space, Enter or a world-local Escape', () => {
  const h = harness(); h.hidden(true); h.top = { id: 'thought:actor', blocksInput: true, handlesEscape: true, allowsLook: true }; h.consumeScene = true;
  for (const [code, key] of [['KeyE', 'e'], ['Space', ' '], ['Enter', 'Enter'], ['Escape', 'Escape']]) h.key(code, key);
  assert.deepEqual(h.sceneKeys, []); assert.deepEqual(h.actions, []);
  h.hidden(false); h.domFocused = false; h.key('Space', ' ');
  assert.deepEqual(h.sceneKeys, ['Space'], 'the same visible native-focused dialogue remains interactive');
});

test('reserved shortcuts, diagnostics and global pause remain available during lifecycle holds', () => {
  const h = harness(); h.hidden(true); h.nativeFocused = false;
  h.key('F11', 'F11'); h.key('F10', 'F10'); h.key('Escape', 'Escape');
  assert.equal(h.reserved, 1); assert.equal(h.godOpens, 1); assert.equal(h.pauseOpens, 1);
  h.key('Escape', 'Escape'); assert.equal(h.pauseCloses, 1, 'Escape still dismisses the run-level pause');
  assert.deepEqual(h.moves, []); assert.equal(h.motionInput.held.size, 0);
});

test('controller and pending mouse look cannot move a hidden or natively unfocused camera', () => {
  const h = harness(); h.stick = { turnX: .6, lookY: .4 }; h.motionInput.pointerDx = 5;
  h.hidden(true); h.api.tickIndependentLook(.05); assert.deepEqual(h.looks, []); assert.equal(h.motionInput.pointerDx, 0);
  h.hidden(false); h.nativeFocused = false; h.api.tickIndependentLook(.05); assert.deepEqual(h.looks, []);
  h.nativeFocused = true; h.domFocused = false; h.api.tickIndependentLook(.05); assert.equal(h.looks.length, 1);
});

test('keyup during a lifecycle hold still retires previously held movement', () => {
  const h = harness(); h.key('KeyW'); h.hidden(true);
  h.api.onKeyUp({ code: 'KeyW', key: 'w', target: {}, preventDefault() {} });
  assert.equal(h.motionInput.held.size, 0);
});
