import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePixelMeshSettings, cyclePixelMeshMode, labelPixelMeshMode } from '../src/render/pixel-mesh/settings.js';

test('pixel mesh settings normalize unsafe input', () => {
  assert.deepEqual(normalizePixelMeshSettings({ mode: 'garbage', cellSize: '1000', debugSource: 'bad' }), {
    mode: 'off',
    cellSize: 'auto',
    debugSource: 'final',
    reduceFlash: false,
    reduceMotion: false,
    memory: true,
  });
});

test('pixel mesh modes cycle and label plainly', () => {
  assert.equal(cyclePixelMeshMode('off', 1), 'subtle');
  assert.equal(cyclePixelMeshMode('severe', 1), 'off');
  assert.equal(labelPixelMeshMode('standard'), 'Standard');
});

test('pixel mesh shader is world-only and keeps UI separate', () => {
  const shader = readFileSync('src/render/pixel-mesh/shader.js', 'utf8');
  assert.doesNotMatch(shader, /drawUI|uiText|settings|dialogue/i);
});

test('r3d keeps scene depth texture separate from mesh output', () => {
  const r3d = readFileSync('src/render/r3d.js', 'utf8');
  assert.match(r3d, /sceneTex/);
  assert.match(r3d, /meshTexA/);
  assert.match(r3d, /r3dDepthCanvas/);
  assert.match(r3d, /runPixelMeshPass/);
});


test('r3d exposes pixel mesh status and pulse diagnostics', () => {
  const r3d = readFileSync('src/render/r3d.js', 'utf8');
  assert.match(r3d, /r3dPixelMeshStatus/);
  assert.match(r3d, /r3dPulsePixelMesh/);
  assert.match(r3d, /forceSignalUntil/);
  assert.match(r3d, /uForceSignal/);
});

test('main exposes a focused pixel mesh debug harness', () => {
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /__chunkSurferPixelMesh/);
  assert.match(main, /setMode/);
  assert.match(main, /pulsePixelMesh/);
  assert.match(main, /r3dPixelMeshStatus/);
});
