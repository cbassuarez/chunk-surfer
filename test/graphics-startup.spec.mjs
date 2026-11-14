import test from 'node:test';
import assert from 'node:assert/strict';
import { graphicsStartupError, verifyGraphicsStartup } from '../src/render/graphics-startup.js';

function context(options = {}) {
  const state = {
    DRAW_FRAMEBUFFER_BINDING: { name: 'existing draw framebuffer' },
    READ_FRAMEBUFFER_BINDING: { name: 'existing read framebuffer' },
    TEXTURE_BINDING_2D: { name: 'existing texture' },
    PIXEL_PACK_BUFFER_BINDING: { name: 'existing pack buffer' },
    COLOR_CLEAR_VALUE: [.15, .25, .35, .45],
    COLOR_WRITEMASK: [false, true, false, true],
    VIEWPORT: [7, 8, 320, 200],
    PACK_ALIGNMENT: 8,
    PACK_ROW_LENGTH: 5,
    PACK_SKIP_PIXELS: 2,
    PACK_SKIP_ROWS: 3,
    SCISSOR_TEST: options.scissor !== false,
  };
  const initial = structuredClone(state);
  const allocations = [], deleted = [], calls = [];
  const constants = [
    ...Object.keys(state), 'EXT_color_buffer_float', 'TEXTURE_2D', 'TEXTURE_MIN_FILTER',
    'TEXTURE_MAG_FILTER', 'NEAREST', 'RGBA8', 'RGBA', 'UNSIGNED_BYTE', 'FRAMEBUFFER',
    'DRAW_FRAMEBUFFER', 'READ_FRAMEBUFFER', 'COLOR_ATTACHMENT0', 'FRAMEBUFFER_COMPLETE',
    'COLOR_BUFFER_BIT', 'PIXEL_PACK_BUFFER',
  ];
  const gl = Object.fromEntries(constants.map(value => [value, value]));
  function allocate(kind) {
    if (options.allocationFailure === kind) return null;
    const resource = { kind, serial: allocations.length };
    allocations.push(resource);
    return resource;
  }
  Object.assign(gl, {
    getExtension(name) { calls.push(['extension', name]); return options.noFloat ? null : {}; },
    getParameter(name) { return Array.isArray(state[name]) ? [...state[name]] : state[name]; },
    isEnabled(name) { return state[name]; },
    isContextLost() { return options.lost === true; },
    createTexture() { return allocate('texture'); },
    createFramebuffer() { return allocate('framebuffer'); },
    bindTexture(target, value) { assert.equal(target, gl.TEXTURE_2D); state.TEXTURE_BINDING_2D = value; },
    bindFramebuffer(target, value) {
      if (target !== gl.READ_FRAMEBUFFER) state.DRAW_FRAMEBUFFER_BINDING = value;
      if (target !== gl.DRAW_FRAMEBUFFER) state.READ_FRAMEBUFFER_BINDING = value;
    },
    bindBuffer(target, value) { assert.equal(target, gl.PIXEL_PACK_BUFFER); state.PIXEL_PACK_BUFFER_BINDING = value; },
    texParameteri() {},
    texImage2D(...args) { calls.push(['texture', ...args]); },
    framebufferTexture2D(...args) { calls.push(['attachment', ...args]); },
    checkFramebufferStatus() { return options.incomplete ? 'FRAMEBUFFER_UNSUPPORTED' : gl.FRAMEBUFFER_COMPLETE; },
    disable(name) { state[name] = false; },
    enable(name) { state[name] = true; },
    colorMask(...value) { state.COLOR_WRITEMASK = value; },
    viewport(...value) { state.VIEWPORT = value; },
    clearColor(...value) { state.COLOR_CLEAR_VALUE = value; },
    clear(value) {
      assert.equal(value, gl.COLOR_BUFFER_BIT);
      assert.equal(state.SCISSOR_TEST, false);
      assert.deepEqual(state.COLOR_WRITEMASK, [true, true, true, true]);
      assert.deepEqual(state.VIEWPORT, [0, 0, 1, 1]);
    },
    pixelStorei(name, value) { state[name] = value; },
    readPixels(x, y, w, h, format, type, target) {
      if (options.readError) throw options.readError;
      assert.deepEqual([x, y, w, h, format, type], [0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE]);
      assert.equal(state.PIXEL_PACK_BUFFER_BINDING, null);
      assert.equal(state.PACK_ALIGNMENT, 1);
      assert.equal(state.PACK_ROW_LENGTH, 0);
      assert.equal(state.PACK_SKIP_PIXELS, 0);
      assert.equal(state.PACK_SKIP_ROWS, 0);
      target.set(options.badReadback ? [0, 0, 0, 0] : state.COLOR_CLEAR_VALUE.map(channel => Math.round(channel * 255)));
    },
    deleteFramebuffer(value) { deleted.push(value); },
    deleteTexture(value) { deleted.push(value); },
  });
  return { gl, state, initial, calls, allocations, deleted };
}

const isGraphicsFailure = error => error.code === 'CHUNK_GRAPHICS_STARTUP';
function assertRestored(fixture) {
  assert.deepEqual(fixture.state, fixture.initial, 'all changed graphics state is restored');
  assert.deepEqual(new Set(fixture.deleted), new Set(fixture.allocations), 'temporary resources are deleted');
}

test('an unavailable WebGL2 context has the explicit recovery code', () => {
  assert.throws(() => verifyGraphicsStartup(null), error => isGraphicsFailure(error) && /webgl2 unavailable/.test(error.message));
});

test('required floating render target support is checked before allocations', () => {
  const f = context({ noFloat: true });
  assert.throws(() => verifyGraphicsStartup(f.gl), error => isGraphicsFailure(error) && /EXT_color_buffer_float/.test(error.message));
  assert.equal(f.allocations.length, 0);
  assertRestored(f);
});

test('successful startup probes only a temporary 1x1 target and restores caller state', () => {
  for (const scissor of [true, false]) {
    const f = context({ scissor });
    assert.equal(verifyGraphicsStartup(f.gl), true);
    const allocation = f.calls.find(call => call[0] === 'texture');
    assert.deepEqual(allocation.slice(1), [f.gl.TEXTURE_2D, 0, f.gl.RGBA8, 1, 1, 0, f.gl.RGBA, f.gl.UNSIGNED_BYTE, null]);
    assertRestored(f);
  }
});

test('an incomplete probe framebuffer fails with cleanup instead of admitting black output', () => {
  const f = context({ incomplete: true });
  assert.throws(() => verifyGraphicsStartup(f.gl), error => isGraphicsFailure(error) && /framebuffer incomplete/.test(error.message));
  assertRestored(f);
});

test('failed readback or a lost context is a bounded graphics failure', () => {
  for (const options of [{ badReadback: true }, { lost: true }]) {
    const f = context(options);
    assert.throws(() => verifyGraphicsStartup(f.gl), error => isGraphicsFailure(error) && /readback failed/.test(error.message));
    assertRestored(f);
  }
});

test('failed temporary allocations clean up any already allocated resource', () => {
  for (const allocationFailure of ['texture', 'framebuffer']) {
    const f = context({ allocationFailure });
    assert.throws(() => verifyGraphicsStartup(f.gl), isGraphicsFailure);
    assertRestored(f);
  }
});

test('ordinary JavaScript errors remain untagged while cleanup still runs', () => {
  const readError = new TypeError('ordinary code fault');
  const f = context({ readError });
  assert.throws(() => verifyGraphicsStartup(f.gl), error => error === readError && error.code === undefined);
  assertRestored(f);
  const tagged = graphicsStartupError('shader compiler failed');
  assert.equal(tagged.code, 'CHUNK_GRAPHICS_STARTUP');
  assert.equal(new Error('asset fetch failed').code, undefined);
});

test('real prop and Source shore shader failures retain the recovery code', async () => {
  const props = await import('../src/render/props3d.js');
  const shore = await import('../src/render/source-shore3d.js');
  for (const phase of ['compile', 'link', 'shader allocation', 'program allocation']) {
    for (const initialize of [props.props3dInit, shore.sourceShoreInit]) {
      const gl = {
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
        createProgram: () => phase === 'program allocation' ? null : ({}), createShader: () => phase === 'shader allocation' ? null : ({}), shaderSource() {},
        compileShader() {}, getShaderParameter: () => phase !== 'compile',
        getShaderInfoLog: () => 'driver rejected the shader', attachShader() {},
        linkProgram() {}, deleteShader() {}, getProgramParameter: () => false,
        getProgramInfoLog: () => 'driver rejected the program',
      };
      assert.throws(() => initialize(gl), error => isGraphicsFailure(error) && /driver rejected|allocation failed/.test(error.message));
    }
  }
});
