// Run from the repository root:
// node --experimental-vm-modules --test test/microphone-recovery-vfd.test.mjs
//
// The scene, panel geometry/optical scopes, selection rows, hit testing and
// controller bindings are the production modules. Only platform and drawing
// sinks are replaced; assertions inspect what is actually drawn and clicked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

if (typeof vm.SourceTextModule !== 'function') {
  throw new Error('Run this test with node --experimental-vm-modules --test test/microphone-recovery-vfd.test.mjs');
}

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
const nothing = () => {};
const EPSILON = 1e-6;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function fixture({ cols = 120, rows = 40, aspect = 8.45 / 20, reducedMotion = false, mediaDevices = null } = {}) {
  const state = {
    cols, rows, aspect, reducedMotion, now: 1000,
    text: [], printed: [], sprites: [], microphoneFrames: [], clips: [],
    fills: [], removed: [], regions: [], currentClip: null, plane: 'outside',
  };
  const context = vm.createContext({ console, performance: { now: () => state.now }, navigator: { mediaDevices }, setTimeout, clearTimeout });
  const mocks = new Map();
  const synthetic = new Map();
  const actual = new Map();
  const file = (relative) => path.join(sourceRoot, relative);
  const mock = (relative, exports) => mocks.set(file(relative), exports);
  const theme = { phosphor: '#F2A81E', glass: '#09120d', danger: '#FF6655' };
  let surface = 'amber';

  mock('render/palette.js', {
    THEMES: { amber: theme, green: theme }, UI_COLOR: theme,
    vfdSettings: { menuContrast: false },
    activeTheme: () => theme, activeSurface: () => surface,
    setActiveSurface: (value) => { surface = value; },
    uiBrightness: () => 1, themeRoleColor: () => theme.phosphor,
    themeRoleDim: () => 0.1, uiRoleDim: () => 0.1, uiFlickerAlpha: () => 1, uiRoleColor: () => theme.phosphor,
  });
  mock('game/scenes.js', {
    remove(scene) { state.removed.push(scene); scene.exit?.(); return scene; },
  });
  mock('game/access.js', { visualEffectsEnabled: () => true });
  mock('render/atlas.js', {
    UI_CELL_W: 8.45, UI_CELL_H: 20, atlasConfigure: nothing, atlasDpr: () => 1, getTile: nothing,
  });
  mock('render/electronic-text.js', { drawElectronicText: nothing });
  mock('render/vfd-font.js', { drawVfdDots: nothing, drawVfdGlyph: nothing, vfdGlowBleed: () => 0 });
  mock('render/keycap.js', {
    drawCapLegend: nothing,
    drawPrintedText(x, y, text, options = {}) {
      state.printed.push({ x, y, text: String(text), ...options });
    },
  });
  mock('render/hardware-material.js', {
    drawHardwareCap: nothing, hardwareCapGeometry: nothing,
    hardwareMotionReduced: () => state.reducedMotion,
  });
  mock('render/instrument-material.js', {
    drawInstrumentPlate: nothing, drawInstrumentWell: nothing,
    drawInstrumentGlass: nothing, drawVfdGrid: nothing,
  });
  mock('game/control-mechanics.js', { sampleControl: nothing });
  mock('render/prompt-glyphs.js', { drawPromptParts: nothing });
  mock('audio/monitor.js', {
    MONITOR_DANGER_THRESHOLDS: [], MONITOR_THRESHOLDS: [], monitorSnapshot: () => ({}),
  });
  mock('render/meter.js', Object.fromEntries([
    'locationMarks', 'locationScaleFits', 'locationTicks', 'meterGeometry', 'meterMarkBoxes',
    'meterMarks', 'meterScaleFits', 'meterSegmentAt', 'meterSegmentCount', 'meterState',
    'meterTicks', 'unitToDb',
  ].map((name) => [name, nothing]).concat([['METER_MIN_DB', -60]])));

  async function load(filename, { real = false } = {}) {
    if (!real && mocks.has(filename)) {
      if (!synthetic.has(filename)) {
        const exports = mocks.get(filename);
        synthetic.set(filename, new vm.SyntheticModule(Object.keys(exports), function () {
          for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
        }, { context, identifier: filename }));
      }
      return synthetic.get(filename);
    }
    if (actual.has(filename)) return actual.get(filename);
    const module = new vm.SourceTextModule(await readFile(filename, 'utf8'), { context, identifier: filename });
    actual.set(filename, module);
    await module.link((specifier, owner) => load(path.resolve(path.dirname(owner.identifier), specifier)));
    return module;
  }

  async function evaluate(relative) {
    const module = await load(file(relative), { real: true });
    if (module.status !== 'evaluated') await module.evaluate();
    return module.namespace;
  }

  const ui = await evaluate('render/ui.js');
  const fit = await evaluate('render/fit-text.js');
  const recordText = (x, y, text, role = 'ui-primary', alpha = 1, max = null) => {
    state.text.push({ x, y, text: fit.fitText(String(text), max), role, alpha,
      clip: state.currentClip ? { ...state.currentClip } : null, plane: state.plane });
  };
  mock('render/ui.js', {
    ...ui,
    uiSize: () => ({ cols: state.cols, rows: state.rows }),
    uiCellMetrics: () => ({ cellW: 20 * state.aspect, cellH: 20, aspect: state.aspect }),
    uiText: recordText,
    uiFill(x, y, w, h, color) { state.fills.push({ x, y, w, h, color, plane: state.plane }); },
    uiDraw: nothing, uiDrawHardware: nothing,
    uiWithHardwareLayer(draw, after) { draw(); after?.(); },
    uiWithClip(rectangle, draw) {
      const prior = state.currentClip, priorPlane = state.plane;
      state.clips.push({ ...rectangle });
      state.currentClip = rectangle; state.plane = 'vfd';
      try { return draw(); } finally { state.currentClip = prior; state.plane = priorPlane; }
    },
  });

  const presentation = await evaluate('render/presentation.js');
  mock('render/presentation.js', {
    ...presentation,
    drawVfdText(x, y, text, options = {}) {
      recordText(x, y, String(text).toUpperCase(), options.role, options.alpha,
        options.max == null ? null : Math.floor(options.max / (options.scale ?? 2)));
    },
    drawVfdSprite(x, y, w, h, levels) {
      state.sprites.push({ x, y, w, h, levels, clip: state.currentClip });
    },
  });
  const microphone = await evaluate('render/vfd-microphone.js');
  mock('render/vfd-microphone.js', {
    ...microphone,
    vfdMicrophoneFrame(options) {
      state.microphoneFrames.push({ ...options });
      return microphone.vfdMicrophoneFrame(options);
    },
  });
  const hits = await evaluate('render/hit-regions.js');
  mock('render/hit-regions.js', {
    ...hits,
    createHitRegions() {
      const real = hits.createHitRegions();
      state.regions.push(real);
      return real;
    },
  });
  const warning = await evaluate('game/warning.js');
  const bindings = await evaluate('game/bindings.js');

  function render(scene) {
    state.text = []; state.printed = []; state.sprites = []; state.clips = [];
    state.fills = [];
    scene.render();
    return state.text;
  }
  function region(label) {
    const found = state.regions.flatMap((entry) => entry.list()).find((entry) => entry.label === label);
    assert.ok(found, `visible hit target for ${label}`);
    return found;
  }
  function pointer(scene, label, type = 'pointerdown', options = {}) {
    const hit = region(label);
    return scene.pointer({ type, cellX: hit.x + hit.w / 2, cellY: hit.y + hit.h / 2,
      pointerId: 1, button: 0, buttons: type === 'pointerdown' ? 1 : 0, ...options });
  }
  function key(scene, value, options = {}) {
    return scene.key({ key: value, code: value, preventDefault: nothing, ...options });
  }
  function advance(ms = 500) { state.now += ms; }
  function makeScene(options = {}) {
    const scene = warning.makeWarningScene({ showWarning: false, askProfile: false, askMic: true, ...options });
    scene.enter?.(); render(scene);
    return scene;
  }
  return { state, warning, presentation, bindings, makeScene, render, region, pointer, key, advance, evaluate };
}


function tap(f, scene, value) {
  f.key(scene, value);
  scene.keyup({ key: value, code: value });
}
function visibleText(f) { return f.state.text.map(item => item.text).join(' ').toUpperCase(); }

for (const dimensions of [{ cols: 75, rows: 20 }, { cols: 120, rows: 40 }]) {
  test(`missing-device recovery is explicit and remains on VFD glass at ${dimensions.cols} × ${dimensions.rows}`, async () => {
    const f = await fixture(dimensions), requests = [];
    let done = 0;
    const scene = f.makeScene({
      onMicAllow(...args) {
        requests.push(args);
        return args.length ? { state: 'on', active: true, deviceId: 'default' }
          : { state: 'unavailable', reason: 'selected-device-missing', failedConstraint: 'deviceId', deviceId: 'expired' };
      },
      onDone: () => done++,
    });
    tap(f, scene, 'y');
    f.render(scene);
    assert.equal(requests.length, 1, 'a failed selection cannot silently request another microphone');
    const label = f.state.text.find(item => item.text === 'USE DEFAULT MIC');
    assert.equal(label?.plane, 'vfd');
    const hit = f.region('USE DEFAULT MIC');
    const aperture = label.clip;
    assert(hit.x >= aperture.x && hit.y >= aperture.y);
    assert(hit.x + hit.w <= aperture.x + aperture.w + EPSILON);
    assert(hit.y + hit.h <= aperture.y + aperture.h + EPSILON);
    assert.match(visibleText(f), /SAVED MICROPHONE IS NOT AVAILABLE/);
    f.pointer(scene, 'USE DEFAULT MIC', 'pointerdown');
    f.pointer(scene, 'USE DEFAULT MIC', 'pointerup');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].length, 0);
    assert.equal(requests[1][0].deviceId, 'default');
    assert.equal(requests[1][0].lastDeviceLabel, '');
    assert.equal(done, 1);
  });
}

test('Enter after a missing-device failure keeps the explicit opt-out as default', async () => {
  const f = await fixture();
  let requests = 0, denied = 0, done = 0;
  const scene = f.makeScene({
    onMicAllow: () => { requests++; return { state: 'unavailable', reason: 'selected-device-missing' }; },
    onMicDeny: () => denied++, onDone: () => done++,
  });
  tap(f, scene, 'y');
  f.render(scene);
  tap(f, scene, 'Enter');
  assert.equal(requests, 1);
  assert.equal(denied, 1);
  assert.equal(done, 1);
});

for (const result of [
  { state: 'denied', reason: 'permission-denied' },
  { state: 'error', reason: 'bad-audio-constraint', failedConstraint: 'sampleRate' },
  { state: 'error', reason: 'audio-setup-failed' },
]) {
  test(`${result.reason} retries do not replace the selected device`, async () => {
    const f = await fixture(), requests = [];
    const scene = f.makeScene({ onMicAllow: (...args) => { requests.push(args); return result; } });
    tap(f, scene, 'y');
    f.render(scene);
    f.region('TRY AGAIN');
    assert(!f.state.text.some(item => item.text === 'USE DEFAULT MIC'));
    scene.update();
    assert.equal(requests.length, 1);
    tap(f, scene, 'y');
    assert.equal(requests.length, 2);
    assert.equal(requests[1].length, 0);
  });
}

for (const [reason, title] of [
  ['insecure-context', 'MICROPHONE ACCESS NEEDS A SECURE PAGE.'],
  ['microphone-policy-blocked', 'MICROPHONE ACCESS IS BLOCKED IN THIS VIEW.'],
  ['no-media-devices', 'THIS VIEW CANNOT ACCESS A MICROPHONE.'],
  ['no-audio-context', 'GAME AUDIO COULD NOT START.'],
  ['audio-context-closed', 'GAME AUDIO HAS STOPPED.'],
  ['audio-setup-failed', 'MICROPHONE AUDIO COULD NOT START.'],
  ['capture-disabled', 'MICROPHONE ACCESS IS DISABLED.'],
  ['capture-aborted', 'MICROPHONE START WAS INTERRUPTED.'],
  ['inactive-document', 'RETURN TO THE GAME TO USE THE MICROPHONE.'],
  ['no-audio-track', 'THE MICROPHONE DID NOT PROVIDE AUDIO.'],
]) {
  test(`${reason} shows its specific player-facing recovery without raw exception data`, async () => {
    const f = await fixture();
    const scene = f.makeScene({ onMicAllow: () => ({ state: 'error', reason,
      errorName: 'InternalError', failedConstraint: 'internal-constraint', stack: '/private/source/secret' }) });
    tap(f, scene, 'y');
    f.render(scene);
    const text = visibleText(f);
    assert(text.includes(title));
    assert(text.includes('YOU CAN PLAY WITHOUT A MICROPHONE.'));
    assert(!text.includes('INTERNALERROR'));
    assert(!text.includes('/PRIVATE/SOURCE/SECRET'));
    if (reason === 'audio-setup-failed') {
      assert(text.includes('ACCESS WAS GRANTED'));
      assert(!text.includes('ACCESS WAS NOT GRANTED'));
    }
    f.region('PLAY WITHOUT MIC');
  });
}

test('a pending explicit default-input recovery can still be canceled and ignores late success', async () => {
  const f = await fixture(), pending = deferred();
  let requests = 0, denied = 0, done = 0;
  const scene = f.makeScene({
    onMicAllow: () => ++requests === 1
      ? { state: 'unavailable', reason: 'selected-device-missing' } : pending.promise,
    onMicDeny: () => denied++, onDone: () => done++,
  });
  tap(f, scene, 'y'); f.render(scene);
  tap(f, scene, 'y'); f.render(scene);
  f.region('PLAY WITHOUT MIC');
  tap(f, scene, 'Escape');
  pending.resolve({ state: 'on', active: true });
  await flush();
  assert.equal(requests, 2);
  assert.equal(denied, 1);
  assert.equal(done, 1);
});
