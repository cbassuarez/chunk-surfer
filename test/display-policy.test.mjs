import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESIGNED_VIEWPORT,
  cycleDisplayOption,
  findWindowPreset,
  labelDisplayOption,
  normalizeDisplaySettings,
  isViewportTooSmall,
  resolveRenderScale,
  computeStageLayout,
} from '../src/platform/display-policy.js';

test('designed viewport is at least 1280x800', () => {
  assert.ok(DESIGNED_VIEWPORT.width >= 1280);
  assert.ok(DESIGNED_VIEWPORT.height >= 800);
});

test('normalizes invalid display settings', () => {
  assert.deepEqual(normalizeDisplaySettings({
    displayMode: 'garbage',
    windowPreset: '1x1',
    uiScale: 99,
    renderScale: 'potato',
  }), {
    displayMode: 'windowed',
    windowPreset: '1280x800',
    uiScale: 1,
    renderScale: 'auto',
  });
});

test('cycles display options by id or value', () => {
  assert.equal(cycleDisplayOption('windowPresets', '1280x800', 1), '1440x900');
  assert.equal(cycleDisplayOption('uiScalePresets', 1, 1), 1.1);
  assert.equal(cycleDisplayOption('renderScalePresets', 'auto', 1), 0.5);
});

test('labels display options', () => {
  assert.equal(labelDisplayOption('windowPresets', '1920x1080'), '1920×1080 · 16:9');
  assert.equal(labelDisplayOption('renderScalePresets', 0.75), '75%');
});

test('detects too-small viewport', () => {
  assert.equal(isViewportTooSmall(1279, 800), true);
  assert.equal(isViewportTooSmall(1280, 799), true);
  assert.equal(isViewportTooSmall(1280, 800), false);
});

test('finds known window preset', () => {
  assert.equal(findWindowPreset('1920x1080').width, 1920);
});

test('auto render scale resolves conservatively', () => {
  assert.equal(resolveRenderScale('auto', { devicePixelRatio: 3 }), 0.75);
  assert.equal(resolveRenderScale(1), 1);
});

test('the stage takes the window\'s shape instead of barring it', () => {
  const D = DESIGNED_VIEWPORT;
  const covers = (layout, w, h) => {
    assert.ok(layout.left <= 0 && layout.top <= 0, `no bar at ${w}x${h}`);
    assert.ok(layout.renderedWidth >= w - 0.5 && layout.renderedHeight >= h - 0.5, `stage reaches the edges at ${w}x${h}`);
    assert.ok(layout.stageWidth >= D.width && layout.stageHeight >= D.height, 'the design box is still inside it');
  };
  // Exactly 16:10 is the design box, unchanged.
  const exact = computeStageLayout(D.width, D.height);
  assert.equal(exact.stageWidth, D.width); assert.equal(exact.stageHeight, D.height); assert.equal(exact.left, 0);
  // A window with a title bar taken out of 16:10, a 16:9 fullscreen, a Mac's ~14:9 fullscreen.
  for (const [w, h] of [[1000, 603], [1920, 1080], [1728, 1117]]) {
    const layout = computeStageLayout(w, h);
    assert.equal(layout.scale, Math.min(w / D.width, h / D.height), 'the design box still fits exactly as it did');
    covers(layout, w, h);
  }
  // Past 12:5 it stops growing and bars, rather than becoming another camera.
  const ultra = computeStageLayout(3200, 800);
  assert.equal(ultra.stageWidth, Math.ceil(800 * 12 / 5));
  assert.ok(ultra.left > 0);
  // And the old fitted box is still there to ask for.
  const fitted = computeStageLayout(1920, 1080, { fill: false });
  assert.equal(fitted.stageWidth, D.width); assert.ok(fitted.left > 0);
});
