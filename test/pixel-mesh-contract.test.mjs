import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePixelMeshSettings } from '../src/render/pixel-mesh/settings.js';
import { r3dLookStatus, r3dSetLookProfile } from '../src/render/r3d.js';

test('pixel mesh ignores legacy player mode values', () => {
  assert.deepEqual(normalizePixelMeshSettings({ mode: 'severe', cellSize: '1000', debugSource: 'bad' }), {
    cellSize: 'auto', debugSource: 'final', reduceFlash: false, reduceMotion: false, memory: true,
  });
});

test('VFD compositor combines the strong block palette with selective phosphor', () => {
  const shader = readFileSync('src/render/pixel-mesh/shader.js', 'utf8');
  assert.match(shader, /texture\(uSrc,\s*fullUv\)/);
  assert.match(shader, /texture\(uSrc,\s*cellUv\)/);
  assert.match(shader, /vec3\s+paletted/);
  assert.match(shader, /mix\(c,\s*paletted,\s*clamp\(uPaletteAmount/);
  assert.match(shader, /mix\(encodedScene,\s*phosphor,\s*replaceAmount\)/);
  assert.match(shader, /uBaseRetention/);
  assert.doesNotMatch(shader, /uLocalDiffusion|localDiffusion/);
  assert.doesNotMatch(shader, /drawUI|uiText|settings|dialogue/i);
});

test('VFD persistence is time-based and accessibility retains the authored look', () => {
  const shader = readFileSync('src/render/pixel-mesh/shader.js', 'utf8');
  assert.match(shader, /uDt/);
  assert.match(shader, /0\.69314718056/);
  assert.match(shader, /uPersistenceMs/);
  assert.match(shader, /uReduceFlash/);
  assert.match(shader, /uReduceMotion/);
  assert.doesNotMatch(shader, /uReduceFlash[^;]*\?\s*0\.0/);
});

test('renderer keeps UI outside the world-only VFD pass and exposes authored profile diagnostics', () => {
  const r3d = readFileSync('src/render/r3d.js', 'utf8');
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(r3d, /const\s+postSourceTex\s*=\s*runPixelMeshPass\(state,\s*now\)/);
  assert.match(r3d, /r3dResetVfdMemory/);
  assert.match(r3d, /r3dSetLookProfile/);
  assert.match(main, /__chunkSurferPixelMesh/);
  assert.match(main, /setProfile/);
  assert.doesNotMatch(main, /__chunkSurferPixelMesh\s*=\s*\{[\s\S]{0,500}setMode/);
});

test('player settings contain no VFD intensity control', () => {
  const settings = readFileSync('src/game/settings.js', 'utf8');
  assert.doesNotMatch(settings, /VFD PIXEL MESH|pixelMeshMode/);
});

test('reaffirming a look profile does not restart its transition', () => {
  r3dSetLookProfile('explore', { transitionMs: 0, nowMs: 0 });
  r3dSetLookProfile('calm', { transitionMs: 600, nowMs: 100 });

  const halfway = r3dLookStatus(400);
  assert.equal(halfway.transitioning, true);
  assert.ok(halfway.profile.vfd.baseRetention > 0.78);
  assert.ok(halfway.profile.vfd.baseRetention < 0.90);

  r3dSetLookProfile('calm', { transitionMs: 600, nowMs: 400 });
  const complete = r3dLookStatus(700);
  assert.equal(complete.transitioning, false);
  assert.equal(complete.profile.vfd.baseRetention, 0.90);
  assert.equal(complete.profile.vfd.persistenceMs, 90);
});
