import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const renderer = await readFile(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
const source = renderer.slice(renderer.indexOf('export function r3dCaptureStageCanvas'), renderer.indexOf('// ── The depth the lens gets'))
  .replace('export function', 'function');

function fixture({ complete = true } = {}) {
  const calls = [], previous = { existing: true };
  const context = {
    uniforms: { sceneW: 1, sceneH: 2 }, sceneTex: 'scene', meshFlip: true, meshTexA: 'a', meshTexB: 'b',
    P3: { propTargets: () => ({ color: 'props' }) },
    gl: {
      READ_FRAMEBUFFER_BINDING: 'read-binding', READ_FRAMEBUFFER: 'read', COLOR_ATTACHMENT0: 'color',
      TEXTURE_2D: 'texture', FRAMEBUFFER_COMPLETE: 'complete', FLOAT: 'float', UNSIGNED_BYTE: 'byte', RGBA: 'rgba',
      getParameter: () => previous, createFramebuffer: () => 'temporary',
      bindFramebuffer: (...args) => calls.push(['bind', ...args]),
      framebufferTexture2D: (...args) => calls.push(['attach', ...args]),
      checkFramebufferStatus: () => complete ? 'complete' : 'incomplete',
      readPixels: (x, y, w, h, format, type, pixels) => {
        calls.push(['read', type, pixels.constructor.name]);
        pixels.set(type === 'float' ? [0, .5, 1, .1, 1, .25, 0, .8] : [1, 2, 3, 4, 5, 6, 7, 8]);
      },
      deleteFramebuffer: value => calls.push(['delete', value]),
    },
    document: { createElement: () => {
      const canvas = {};
      canvas.getContext = () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: frame => { canvas.frame = frame; },
      });
      return canvas;
    } },
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.capture = r3dCaptureStageCanvas;`, context);
  return { capture: context.capture, calls, previous };
}

test('scene capture reads half-float storage as float and does not mistake depth alpha for transparency', () => {
  const { capture, calls, previous } = fixture();
  const result = capture('scene');
  assert.deepEqual([...result.frame.data], [255, 64, 0, 255, 0, 128, 255, 255]);
  assert.ok(calls.some(call => call[0] === 'read' && call[1] === 'float' && call[2] === 'Float32Array'));
  assert.deepEqual(calls.at(-2), ['bind', 'read', previous]);
  assert.deepEqual(calls.at(-1), ['delete', 'temporary']);
});

test('prop capture keeps alpha, flips rows, and never modifies the draw framebuffer', () => {
  const { capture, calls } = fixture();
  assert.deepEqual([...capture('props').frame.data], [5, 6, 7, 8, 1, 2, 3, 4]);
  assert.ok(calls.filter(call => call[0] === 'bind').every(call => call[1] === 'read'));
});

test('invalid or incomplete stage cannot leak a framebuffer binding', () => {
  const { capture, calls, previous } = fixture({ complete: false });
  assert.equal(capture('unknown'), null);
  assert.equal(calls.length, 0);
  assert.equal(capture('scene'), null);
  assert.deepEqual(calls.at(-2), ['bind', 'read', previous]);
  assert.deepEqual(calls.at(-1), ['delete', 'temporary']);
});
