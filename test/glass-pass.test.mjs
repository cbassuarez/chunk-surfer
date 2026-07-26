import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlassPass, drawGlassPass } from '../src/render/glass-pass.js';

test('glass pass creation preserves compositor dimensions without a browser DOM', () => {
  const pass = createGlassPass({ width: 1280, height: 800, dpr: 2, seed: 4417 });
  assert.equal(pass.width, 1280);
  assert.equal(pass.height, 800);
  assert.equal(pass.dpr, 2);
  assert.equal(pass.seed, 4417);
});

test('glass pass draw tolerates null and disabled inputs', () => {
  assert.equal(drawGlassPass(null, null), false);
  const calls = [];
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    fillRect: (...args) => calls.push(['fillRect', ...args]),
  };
  const pass = createGlassPass({ width: 320, height: 200 });
  assert.equal(drawGlassPass(ctx, pass, { visualEffects: false }), false);
  assert.equal(calls.length, 0);
  assert.equal(drawGlassPass(ctx, pass, { now: 1000, visualEffects: true }), true);
  assert.equal(calls[0], 'save');
  assert.equal(calls.at(-1), 'restore');
});
