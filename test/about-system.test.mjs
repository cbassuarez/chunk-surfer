import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDiagnosticReport,
  formatFps,
  formatRuntime,
  normalizeAboutSnapshot,
} from '../src/platform/about-system.js';

test('about snapshot normalizes safe player-facing defaults', () => {
  const snapshot = normalizeAboutSnapshot();

  assert.equal(snapshot.appName, 'Chunk Surfer');
  assert.equal(snapshot.version, '0.1.0');
  assert.equal(snapshot.runtime.mode, 'web');
  assert.equal(snapshot.storage.healthy, true);
});

test('fps labels are readable', () => {
  assert.equal(formatFps(59.6), '60 FPS');
  assert.equal(formatFps(null), 'Measuring…');
});

test('runtime labels stay plain and non-fictional', () => {
  assert.equal(formatRuntime({ runtime: { mode: 'desktop', platform: 'macOS' } }), 'Desktop / macOS');
  assert.equal(formatRuntime({ runtime: { mode: 'web' } }), 'Web');
});

test('diagnostic report includes support essentials and omits spoilers', () => {
  const report = formatDiagnosticReport({
    version: '0.1.0',
    build: 'dev',
    runtime: { mode: 'desktop', platform: 'macOS', renderer: '3D', lens: true },
    performance: { fps: 60 },
    display: { width: 1280, height: 800, dpr: 2 },
    audio: { state: 'running', sampleRate: 48000 },
    storage: { backend: 'desktop', healthy: true },
  }, {
    recent: [{ level: 'info', message: 'app boot' }],
  });

  assert.match(report, /Chunk Surfer Diagnostic Report/);
  assert.match(report, /Version: 0\.1\.0/);
  assert.match(report, /Performance: 60 FPS/);
  assert.match(report, /Recent Diagnostics:/);
  assert.doesNotMatch(report, /ending/i);
  assert.doesNotMatch(report, /unlock/i);
  assert.doesNotMatch(report, /seed/i);
});
