// Run from the repository root:
// node --experimental-vm-modules --test test/microphone-consent-vfd.test.mjs
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
  throw new Error('Run this test with node --experimental-vm-modules --test test/microphone-consent-vfd.test.mjs');
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

function inside(rectangle, aperture, message) {
  assert.ok(rectangle.x >= aperture.x - EPSILON, `${message}: left edge`);
  assert.ok(rectangle.y >= aperture.y - EPSILON, `${message}: top edge`);
  assert.ok(rectangle.x + rectangle.w <= aperture.x + aperture.w + EPSILON, `${message}: right edge`);
  assert.ok(rectangle.y + rectangle.h <= aperture.y + aperture.h + EPSILON, `${message}: bottom edge`);
}

const cardOptions = {
  warning: { showWarning: true, askProfile: false, askMic: false },
  profile: { showWarning: false, askProfile: true, askMic: false },
  microphone: { showWarning: false, askProfile: false, askMic: true },
};
const cardLabels = {
  warning: ['CONTINUE'],
  profile: ['PROFILE ON', 'PROFILE OFF'],
  microphone: ['ALLOW MICROPHONE', 'PLAY WITHOUT MIC'],
};

function release(scene, value, options = {}) {
  scene.keyup?.({ key: value, code: value, preventDefault: nothing, ...options });
}
function tap(f, scene, value, options = {}) {
  f.key(scene, value, options);
  release(scene, value, options);
}
function click(f, scene, label, options = {}) {
  f.pointer(scene, label, 'pointerdown', options);
  f.pointer(scene, label, 'pointerup', options);
}
function drawn(f, label) {
  const entry = f.state.text.find((item) => item.text === label);
  assert.ok(entry, `drawn label ${label}`);
  return entry;
}
function selectedLabel(f) {
  return f.state.regions.flatMap((regions) => regions.list()).find((region) => region.selected)?.label;
}

for (const dimensions of [{ cols: 75, rows: 20 }, { cols: 113, rows: 30 }, { cols: 227, rows: 67 }]) {
  for (const card of Object.keys(cardOptions)) {
    test(`${card} actions occupy the glass at ${dimensions.cols} × ${dimensions.rows}`, async () => {
      const f = await fixture(dimensions);
      const scene = f.makeScene(cardOptions[card]);
      const layout = f.warning.warningCardLayout(card, { ...dimensions, aspect: f.state.aspect });
      assert.ok(layout.x >= 0 && layout.y >= 0);
      assert.ok(layout.x + layout.w <= dimensions.cols);
      assert.ok(layout.y + layout.h <= dimensions.rows);
      for (const label of cardLabels[card]) {
        const text = drawn(f, label);
        assert.equal(text.plane, 'vfd');
        assert.ok(text.alpha >= 0.75, `${label} remains readable when unselected`);
        inside(f.region(label), layout.aperture, label);
        assert.ok(!f.state.printed.some((entry) => entry.text.includes(label)), `${label} is not etched on the faceplate`);
      }
      for (const sprite of f.state.sprites) {
        inside(sprite, layout.aperture, 'microphone illustration');
        assert.ok(sprite.y + sprite.h <= Math.min(...layout.actions.map((action) => action.y)), 'art cannot cover the actions');
      }
      assert.ok(layout.visible >= 1, 'copy has a scrollable viewport');
      assert.equal(scene.blocksInput, true);
      assert.equal(scene.blocksWorld, true);
      assert.equal(scene.handlesEscape, true);
    });
  }
}

test('copy scrolls independently of the profile choices and the etched legends', async () => {
  const f = await fixture({ cols: 75, rows: 20 });
  const scene = f.makeScene(cardOptions.profile);
  const beforeText = f.state.text.map((entry) => entry.text).join('\n');
  const beforeActions = cardLabels.profile.map((label) => ({ ...f.region(label) }));
  const beforePrinted = f.state.printed.map(({ text }) => text);
  assert.equal(selectedLabel(f), 'PROFILE OFF');
  for (let i = 0; i < 100; i++) tap(f, scene, 'ArrowDown', { repeat: true });
  f.render(scene);
  assert.notEqual(f.state.text.map((entry) => entry.text).join('\n'), beforeText);
  assert.ok(f.state.text.some(({ text }) => text.includes('Choose PROFILE ON')), 'final explanation remains reachable');
  assert.deepEqual(f.state.printed.map(({ text }) => text), beforePrinted);
  for (const [index, label] of cardLabels.profile.entries()) {
    const after = f.region(label);
    for (const coordinate of ['x', 'y', 'w', 'h']) assert.equal(after[coordinate], beforeActions[index][coordinate]);
  }
  tap(f, scene, 'ArrowLeft');
  f.render(scene);
  assert.equal(selectedLabel(f), 'PROFILE ON');
  assert.deepEqual(f.state.printed.map(({ text }) => text), beforePrinted, 'selection does not change metal lettering');
});

test('microphone artwork stays neutral while Allow is merely selected', async () => {
  const f = await fixture();
  const scene = f.makeScene();
  tap(f, scene, 'ArrowLeft');
  f.render(scene);
  assert.equal(selectedLabel(f), 'ALLOW MICROPHONE');
  assert.ok(f.state.microphoneFrames.length > 0);
  assert.ok(f.state.microphoneFrames.every((frame) => frame.live === false));
});

test('mouse hover shares the keyboard cursor, and a completed primary click submits once', async () => {
  const f = await fixture();
  const pending = deferred();
  let allow = 0, done = 0;
  const scene = f.makeScene({ onMicAllow: () => { allow++; return pending.promise; }, onDone: () => done++ });
  f.pointer(scene, 'ALLOW MICROPHONE', 'pointermove');
  f.render(scene);
  assert.equal(selectedLabel(f), 'ALLOW MICROPHONE');
  f.pointer(scene, 'ALLOW MICROPHONE', 'pointerdown');
  assert.equal(allow, 0, 'press alone must not commit consent');
  f.pointer(scene, 'ALLOW MICROPHONE', 'pointerup');
  assert.equal(allow, 1);
  assert.equal(done, 0);
  f.render(scene);
  assert.equal(selectedLabel(f), 'PLAY WITHOUT MIC');
  pending.resolve({ state: 'on', active: true });
  await flush();
  assert.equal(done, 1);
  assert.equal(f.state.removed.length, 1);
});

test('right clicks, canceled presses, mismatched pointers and dragging off a choice do not consent', async () => {
  const f = await fixture();
  let allow = 0, deny = 0;
  const scene = f.makeScene({ onMicAllow: () => { allow++; return { state: 'on', active: true }; }, onMicDeny: () => deny++ });
  click(f, scene, 'ALLOW MICROPHONE', { button: 2 });
  f.pointer(scene, 'ALLOW MICROPHONE', 'pointerdown');
  scene.pointer({ type: 'pointercancel', pointerId: 1 });
  f.pointer(scene, 'ALLOW MICROPHONE', 'pointerup');
  f.pointer(scene, 'ALLOW MICROPHONE', 'pointerdown', { pointerId: 10 });
  f.pointer(scene, 'ALLOW MICROPHONE', 'pointerup', { pointerId: 11 });
  scene.pointer({ type: 'pointercancel', pointerId: 10 });
  f.pointer(scene, 'ALLOW MICROPHONE', 'pointerdown');
  scene.pointer({ type: 'pointermove', pointerId: 1, cellX: -1, cellY: -1, button: 0 });
  scene.pointer({ type: 'pointerup', pointerId: 1, cellX: -1, cellY: -1, button: 0 });
  assert.equal(allow, 0);
  assert.equal(deny, 0);
});

test('a held confirm cannot advance the advisory and also answer profile consent', async () => {
  const f = await fixture();
  let on = 0, off = 0;
  const scene = f.makeScene({ showWarning: true, askProfile: true, askMic: true,
    onProfileOn: () => on++, onProfileOff: () => off++ });
  f.key(scene, 'Enter');
  f.render(scene);
  drawn(f, 'PROFILE OFF');
  f.key(scene, 'Enter', { repeat: true });
  f.key(scene, 'Enter');
  assert.equal(on + off, 0);
  release(scene, 'Enter');
  tap(f, scene, 'Enter');
  assert.equal(off, 1);
  f.render(scene);
  drawn(f, 'ALLOW MICROPHONE');
});

test('mouse events from a previous card cannot answer the next card', async () => {
  const f = await fixture();
  let on = 0, off = 0;
  const scene = f.makeScene({ showWarning: true, askProfile: true, askMic: true,
    onProfileOn: () => on++, onProfileOff: () => off++ });
  const old = { ...f.region('CONTINUE') };
  click(f, scene, 'CONTINUE');
  scene.pointer({ type: 'pointerup', pointerId: 1, button: 0,
    cellX: old.x + old.w / 2, cellY: old.y + old.h / 2 });
  assert.equal(on + off, 0);
  f.render(scene);
  drawn(f, 'PROFILE OFF');
});

for (const input of [
  { label: 'Enter on the default choice', key: 'Enter' },
  { label: 'N shortcut', key: 'n', code: 'KeyN' },
  { label: 'Escape', key: 'Escape' },
  { label: 'controller back', key: 'Escape', controllerAction: 'back', controller: true },
]) {
  test(`${input.label} continues without requesting the microphone`, async () => {
    const f = await fixture();
    let allow = 0, deny = 0, done = 0;
    const scene = f.makeScene({ onMicAllow: () => allow++, onMicDeny: () => deny++, onDone: () => done++ });
    tap(f, scene, input.key, input);
    assert.deepEqual({ allow, deny, done }, { allow: 0, deny: 1, done: 1 });
  });
}

test('controller selection and confirmation use the same visible choices and controller hints', async () => {
  const f = await fixture();
  f.bindings.setActiveInputDevice('controller', { viable: true, controllerFamily: 'playstation' });
  let allow = 0, done = 0;
  const scene = f.makeScene({ onMicAllow: () => { allow++; return { state: 'on', active: true }; }, onDone: () => done++ });
  assert.ok(f.state.text.some(({ text }) => text.includes('CROSS')), 'confirm hint follows the active controller');
  tap(f, scene, 'ArrowLeft', { controller: true, controllerAction: 'move_left' });
  f.render(scene);
  assert.equal(selectedLabel(f), 'ALLOW MICROPHONE');
  tap(f, scene, 'Enter', { controller: true, controllerAction: 'confirm' });
  await flush();
  assert.deepEqual({ allow, done }, { allow: 1, done: 1 });
});

test('an unresolved permission request always offers a working opt-out and ignores late success', async () => {
  const f = await fixture();
  const pending = deferred();
  let allow = 0, deny = 0, done = 0;
  const scene = f.makeScene({ onMicAllow: () => { allow++; return pending.promise; },
    onMicDeny: () => deny++, onDone: () => done++ });
  tap(f, scene, 'y', { code: 'KeyY' });
  f.render(scene);
  assert.equal(allow, 1);
  assert.equal(done, 0);
  drawn(f, 'PLAY WITHOUT MIC');
  assert.ok(f.state.text.some(({ text }) => /REQUESTING|WAITING/.test(text)));
  click(f, scene, 'PLAY WITHOUT MIC');
  assert.deepEqual({ allow, deny, done }, { allow: 1, deny: 1, done: 1 });
  pending.resolve({ state: 'on', active: true });
  await flush();
  scene.update?.(0.016);
  assert.deepEqual({ allow, deny, done }, { allow: 1, deny: 1, done: 1 });
});

for (const state of ['denied', 'unavailable', 'error']) {
  test(`${state} permission result leaves an explicit, usable fallback`, async () => {
    const f = await fixture({ cols: 75, rows: 20 });
    let deny = 0, done = 0;
    const scene = f.makeScene({ onMicAllow: () => Promise.resolve({ state, active: false }),
      onMicDeny: () => deny++, onDone: () => done++ });
    tap(f, scene, 'y', { code: 'KeyY' });
    await flush();
    f.render(scene);
    drawn(f, 'TRY AGAIN');
    drawn(f, 'PLAY WITHOUT MIC');
    assert.equal(selectedLabel(f), 'PLAY WITHOUT MIC');
    assert.equal(done, 0);
    click(f, scene, 'PLAY WITHOUT MIC');
    assert.deepEqual({ deny, done }, { deny: 1, done: 1 });
  });
}

test('retry is explicit and succeeds without duplicate requests', async () => {
  const f = await fixture();
  let allow = 0, done = 0;
  const scene = f.makeScene({ onMicAllow: () => {
    allow++;
    return Promise.resolve(allow === 1 ? { state: 'denied', active: false } : { state: 'on', active: true });
  }, onDone: () => done++ });
  tap(f, scene, 'y', { code: 'KeyY' });
  await flush();
  f.render(scene);
  click(f, scene, 'TRY AGAIN');
  await flush();
  assert.deepEqual({ allow, done }, { allow: 2, done: 1 });
});

test('external scene removal cancels pending capture and cannot launch the game later', async () => {
  const f = await fixture();
  const pending = deferred();
  let deny = 0, done = 0;
  const scene = f.makeScene({ onMicAllow: () => pending.promise, onMicDeny: () => deny++, onDone: () => done++ });
  tap(f, scene, 'y', { code: 'KeyY' });
  scene.exit();
  pending.resolve({ state: 'on', active: true });
  await flush();
  scene.update?.(0.016);
  assert.equal(deny, 1);
  assert.equal(done, 0);
  assert.equal(f.state.removed.length, 0);
});

test('an already-pending native request can settle through the snapshot hook', async () => {
  const f = await fixture();
  let snapshot = { state: 'asking', active: false }, done = 0;
  const scene = f.makeScene({ onMicAllow: () => snapshot, getMicSnapshot: () => snapshot, onDone: () => done++ });
  tap(f, scene, 'y', { code: 'KeyY' });
  f.render(scene);
  assert.equal(done, 0);
  drawn(f, 'PLAY WITHOUT MIC');
  snapshot = { state: 'on', active: true };
  scene.update(0.016);
  assert.equal(done, 1);
});

test('synchronous and asynchronous callback errors are recoverable', async () => {
  for (const onMicAllow of [
    () => { throw new Error('device failed'); },
    () => Promise.reject(new Error('device failed')),
  ]) {
    const f = await fixture();
    let done = 0;
    const scene = f.makeScene({ onMicAllow, onDone: () => done++ });
    tap(f, scene, 'y', { code: 'KeyY' });
    await flush();
    f.render(scene);
    drawn(f, 'TRY AGAIN');
    drawn(f, 'PLAY WITHOUT MIC');
    assert.equal(done, 0);
  }
});

test('scroll wheel moves only the explanatory text and keeps permission actions reachable', async () => {
  const f = await fixture({ cols: 75, rows: 20 });
  const scene = f.makeScene(cardOptions.profile);
  const layout = f.warning.warningCardLayout('profile', { cols: 75, rows: 20, aspect: f.state.aspect });
  const before = f.state.text.map(({ text }) => text).join('\n');
  const action = { ...f.region('PROFILE OFF') };
  let prevented = 0;
  scene.pointer({ type: 'wheel', cellX: layout.textRect.x + 1, cellY: layout.textRect.y + 1,
    deltaY: 120, deltaMode: 0, preventDefault: () => prevented++ });
  f.render(scene);
  assert.notEqual(f.state.text.map(({ text }) => text).join('\n'), before);
  assert.ok(prevented > 0);
  assert.equal(f.region('PROFILE OFF').y, action.y);
});

test('opting out while native access is pending stops a late MediaStream', async () => {
  const native = deferred();
  let requests = 0, stopped = 0, done = 0;
  const f = await fixture({ mediaDevices: { getUserMedia: () => { requests++; return native.promise; } } });
  const mic = await f.evaluate('game/mic.js');
  const scene = f.makeScene({ onMicAllow: () => mic.micInit({}, { force: true }),
    onMicDeny: () => mic.micStop(), getMicSnapshot: () => mic.micSnapshot(), onDone: () => done++ });
  tap(f, scene, 'y', { code: 'KeyY' });
  assert.equal(requests, 1);
  assert.equal(mic.micState(), 'asking');
  f.render(scene);
  click(f, scene, 'PLAY WITHOUT MIC');
  native.resolve({ getTracks: () => [{ stop: () => stopped++ }] });
  await flush();
  assert.equal(stopped, 1);
  assert.equal(mic.micActive(), false);
  assert.equal(mic.micStream(), null);
  assert.equal(done, 1);
});

test('a real native permission rejection reaches the VFD fallback without an unhandled rejection', async () => {
  const failure = Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
  const f = await fixture({ mediaDevices: { getUserMedia: () => Promise.reject(failure) } });
  const mic = await f.evaluate('game/mic.js');
  let done = 0;
  const scene = f.makeScene({ onMicAllow: () => mic.micInit({}, { force: true }),
    onMicDeny: () => mic.micStop(), getMicSnapshot: () => mic.micSnapshot(), onDone: () => done++ });
  tap(f, scene, 'y', { code: 'KeyY' });
  await flush();
  f.render(scene);
  assert.equal(mic.micState(), 'denied');
  assert.equal(mic.micActive(), false);
  drawn(f, 'TRY AGAIN');
  drawn(f, 'PLAY WITHOUT MIC');
  assert.equal(done, 0);
});

test('native focus loss releases a held confirm even when its keyup never arrives', async () => {
  const f = await fixture();
  let on = 0, off = 0;
  const scene = f.makeScene({ showWarning: true, askProfile: true, askMic: true,
    onProfileOn: () => on++, onProfileOff: () => off++ });
  f.key(scene, 'Enter');
  f.render(scene);
  drawn(f, 'PROFILE OFF');
  scene.blur();
  // The OS can consume the keyup while another native window owns focus.
  f.key(scene, 'Enter');
  release(scene, 'Enter');
  assert.deepEqual({ on, off }, { on: 0, off: 1 });
  f.render(scene);
  drawn(f, 'ALLOW MICROPHONE');
});

test('clicking a VFD scroll arrow scrolls copy without submitting consent', async () => {
  const f = await fixture({ cols: 75, rows: 20 });
  let on = 0, off = 0, done = 0;
  const scene = f.makeScene({ ...cardOptions.profile,
    onProfileOn: () => on++, onProfileOff: () => off++, onDone: () => done++ });
  const before = f.state.text.map(({ text }) => text).join('\n');
  const action = { ...f.region('PROFILE OFF') };
  const arrow = drawn(f, '▼');
  const target = f.state.regions.flatMap((regions) => regions.list()).find((region) => (
    region.kind === 'warning-scroll' && arrow.x >= region.x && arrow.x < region.x + region.w
      && arrow.y >= region.y && arrow.y < region.y + region.h
  ));
  assert.ok(target, 'the visible down arrow has a pointer target');
  const event = { pointerId: 1, button: 0, cellX: target.x + target.w / 2, cellY: target.y + target.h / 2 };
  scene.pointer({ ...event, type: 'pointerdown' });
  scene.pointer({ ...event, type: 'pointerup' });
  f.render(scene);
  assert.notEqual(f.state.text.map(({ text }) => text).join('\n'), before);
  assert.equal(f.region('PROFILE OFF').y, action.y);
  assert.deepEqual({ on, off, done }, { on: 0, off: 0, done: 0 });
});

test('the minimum-size microphone card shows the complete original disclosure without scrolling', async () => {
  const f = await fixture({ cols: 75, rows: 20 });
  const scene = f.makeScene();
  const compact = f.warning.warningCardLayout('microphone', { cols: 75, rows: 20, aspect: f.state.aspect });
  const normal = f.warning.warningCardLayout('microphone', { cols: 113, rows: 30, aspect: f.state.aspect });
  const words = (layout) => layout.out.map(({ text }) => text).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  assert.equal(compact.scrollMax, 0);
  assert.ok(compact.out.length <= compact.visible);
  assert.equal(words(compact), words(normal), 'compacting preserves every disclosure word');
  f.render(scene);
  for (const { text } of compact.out) {
    if (text) assert.ok(f.state.text.some((entry) => entry.text === text), `disclosure line is fully drawn: ${text}`);
  }
});

test('permission phase changes preserve the coordinates of the player choices', async () => {
  for (const dimensions of [{ cols: 75, rows: 20 }, { cols: 113, rows: 30 }]) {
    const f = await fixture(dimensions);
    const pending = deferred();
    const scene = f.makeScene({ onMicAllow: () => pending.promise });
    const geometry = (label) => {
      const region = f.region(label);
      return { x: region.x, y: region.y, w: region.w, h: region.h };
    };
    const initialAllow = geometry('ALLOW MICROPHONE');
    const initialDecline = geometry('PLAY WITHOUT MIC');
    tap(f, scene, 'y', { code: 'KeyY' });
    f.render(scene);
    assert.deepEqual(geometry('PLAY WITHOUT MIC'), initialDecline, 'pending opt-out stays in place');
    pending.resolve({ state: 'denied', active: false });
    await flush();
    f.render(scene);
    assert.deepEqual(geometry('TRY AGAIN'), initialAllow, 'retry occupies the original affirmative slot');
    assert.deepEqual(geometry('PLAY WITHOUT MIC'), initialDecline, 'failure opt-out stays in place');
  }
});
