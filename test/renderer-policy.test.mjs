import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveRenderer } from '../src/render/renderer-policy.js';

test('3D is the default and only production renderer', () => {
  assert.equal(resolveRenderer(null), '3d');
  assert.equal(resolveRenderer('canvas'), '3d');
  assert.equal(resolveRenderer('dom'), '3d');
  assert.equal(resolveRenderer('3d'), '3d');
});

test('legacy renderers require an explicit development diagnostic', () => {
  assert.equal(resolveRenderer('canvas', { development: true }), 'canvas');
  assert.equal(resolveRenderer('dom', { development: true }), 'dom');
  assert.equal(resolveRenderer(null, { development: true }), '3d');
});

test('authored 3D architecture does not expose legacy zone navigation colors', () => {
  const world = readFileSync('src/render/r3d.js', 'utf8');
  const props = readFileSync('src/render/props3d.js', 'utf8');
  assert.doesNotMatch(world, /uUsePlan\s*>\s*0\.5\)\s*\?\s*uZoneTint/);
  assert.doesNotMatch(props, /texel\.rgb\s*\*\s*uZoneTint/);
});

test('floorplan loading is allowlisted instead of importing arbitrary query paths', () => {
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /const BUILDING_LOADERS=Object\.freeze/);
  assert.match(main, /Object\.hasOwn\(BUILDING_LOADERS,requested\)/);
  assert.doesNotMatch(main, /import\(`\.\/data\/floorplan\/\$\{which\}\.js`\)/);
});
