import test from 'node:test';
import assert from 'node:assert/strict';
import { isViewportTooSmall } from '../src/platform/display-policy.js';
import { installViewportGuard } from '../src/platform/viewport-guard.js';

test('viewport guard threshold is exact', () => {
  assert.equal(isViewportTooSmall(960, 600, { width: 960, height: 600 }), false);
  assert.equal(isViewportTooSmall(960, 599, { width: 960, height: 600 }), true);
});

test('viewport guard toggles fault class and overlay', () => {
  const classes = new Set();
  const listeners = new Map();
  const overlay = { hidden: true };
  const doc = {
    head: { appendChild() {} },
    body: {
      appendChild() {},
      classList: {
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      },
    },
    querySelector(selector) { return selector === '[data-viewport-fault]' ? overlay : null; },
    createElement() { return { dataset: {}, className: '', hidden: true, innerHTML: '', textContent: '' }; },
  };
  const win = {
    innerWidth: 900,
    innerHeight: 560,
    addEventListener(name, cb) { listeners.set(name, cb); },
    removeEventListener(name) { listeners.delete(name); },
  };

  const dispose = installViewportGuard({ window: win, document: doc });
  assert.equal(classes.has('viewport-too-small'), true);
  assert.equal(overlay.hidden, false);

  win.innerWidth = 960;
  win.innerHeight = 600;
  listeners.get('resize')();
  assert.equal(classes.has('viewport-too-small'), false);
  assert.equal(overlay.hidden, true);

  dispose();
  assert.equal(listeners.has('resize'), false);
});
