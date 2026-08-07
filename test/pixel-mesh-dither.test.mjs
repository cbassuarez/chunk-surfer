import test from 'node:test';
import assert from 'node:assert/strict';
import { BAYER_4, ditherCoverage, orderedDither } from '../src/render/pixel-mesh/dither.js';
import {
  SCREEN_IDS, getScreen, isScreen, screenThreshold, screenUniforms, strokeDistance,
} from '../src/render/pixel-mesh/screens.js';

test('ordered dither is deterministic', () => {
  assert.equal(orderedDither(3, 7, 0.5), orderedDither(3, 7, 0.5));
});

test('ordered dither coverage increases with value', () => {
  assert.ok(ditherCoverage(0.75, BAYER_4) > ditherCoverage(0.25, BAYER_4));
});

test('half value lights roughly half the bayer cells', () => {
  const c = ditherCoverage(0.5, BAYER_4);
  assert.ok(c >= 0.43 && c <= 0.57);
});

// ── the screens ──────────────────────────────────────────────────────────────
//
// A dot and a stroke are separated by ONE measurable property: how far a run of
// lit pixels reaches along its own direction versus across it. These assert that
// property directly, because "it still looks pointillistic" was the bug that
// survived several rounds of tuning by not being measured.

// Rasterise a patch and return the mean length of a maximal run of lit pixels
// when walking along (dx,dy).
function meanRun(id, tone, dirRadians, dx, dy, size = 96) {
  const lit = (x, y) => x >= 0 && y >= 0 && x < size && y < size
    && tone >= screenThreshold(id, x, y, dirRadians, tone, 0.5);
  let runs = 0, total = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!lit(x, y) || lit(x - dx, y - dy)) continue;
      let n = 0, cx = x, cy = y;
      while (lit(cx, cy) && n < size) { n++; cx += dx; cy += dy; }
      runs++; total += n;
    }
  }
  return runs ? total / runs : 0;
}

const coverage = (id, tone, dirRadians = 0, size = 96) => {
  let on = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (tone >= screenThreshold(id, x, y, dirRadians, tone, 0.5)) on++;
  }
  return on / (size * size);
};

test('every declared screen is retrievable and unknown ids fall back to stochastic', () => {
  for (const id of SCREEN_IDS) assert.equal(getScreen(id).id, id);
  assert.equal(getScreen('nonsense').id, 'stochastic');
  assert.equal(isScreen('hatch'), true);
  assert.equal(isScreen('nonsense'), false);
});

test('screen uniforms are complete and flat for every screen', () => {
  for (const id of SCREEN_IDS) {
    const u = screenUniforms(id);
    assert.equal(u.angles.length, 3);
    assert.equal(u.bands.length, 2);
    for (const v of [u.kind, u.periodPx, u.sharpness, u.grainFollow, u.jitter, ...u.angles, ...u.bands]) {
      assert.ok(Number.isFinite(v), `${id} produced a non-finite uniform`);
    }
  }
});

test('coverage still rises with tone on every screen', () => {
  for (const id of SCREEN_IDS) {
    assert.ok(coverage(id, 0.7) > coverage(id, 0.25), `${id} did not get lighter with tone`);
  }
});

test('the stochastic screen is isotropic — this is the pointillism, stated as a number', () => {
  const along = meanRun('stochastic', 0.5, 0, 1, 0);
  const across = meanRun('stochastic', 0.5, 0, 0, 1);
  assert.ok(Math.max(along, across) / Math.min(along, across) < 1.6);
});

test('hatch runs along its direction and not across it', () => {
  // Strokes along +x: long runs walking east, short runs walking south.
  const along = meanRun('hatch', 0.5, 0, 1, 0);
  const across = meanRun('hatch', 0.5, 0, 0, 1);
  assert.ok(along / across >= 3, `expected a stroke, got anisotropy ${(along / across).toFixed(2)}`);
});

test('hatch direction follows the grain it is handed', () => {
  // Rotating the grain a quarter turn must rotate the strokes with it.
  const along = meanRun('hatch', 0.5, Math.PI / 2, 0, 1);
  const across = meanRun('hatch', 0.5, Math.PI / 2, 1, 0);
  assert.ok(along / across >= 3, `grain was ignored: anisotropy ${(along / across).toFixed(2)}`);
});

test('cross-hatch adds directions as the surface gets brighter, not darker', () => {
  // White line on a black ground: extra layers are extra light, so they arrive
  // with tone. Below the first band it is a single-direction hatch.
  const { bands } = getScreen('crosshatch');
  const dark = bands[0] - 0.06;
  const lit = bands[1] + 0.12;
  const anis = (tone) => meanRun('crosshatch', tone, 0, 1, 0) / meanRun('crosshatch', tone, 0, 0, 1);
  assert.ok(anis(dark) > anis(lit), 'the second and third passes never arrived');
  assert.ok(coverage('crosshatch', lit) > coverage('crosshatch', dark));
});

test('stroke distance is sign-invariant, because the grain is a line field', () => {
  // markGrainWorld decodes direction only up to a flip; a screen that cared
  // about the sign would seam wherever the decoded angle crossed.
  for (const t of [0.13, 0.5, 0.87]) {
    assert.ok(Math.abs(strokeDistance(7, 11, t, 6) - strokeDistance(7, 11, t + Math.PI, 6)) < 1e-9);
  }
});
