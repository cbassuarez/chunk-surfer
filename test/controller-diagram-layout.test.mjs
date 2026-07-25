import test from 'node:test';
import assert from 'node:assert/strict';
import { BUTTON_POSITIONS, controllerLayoutMode, diagramGlyph } from '../src/game/controller-ui.js';
import { MINIMUM_VIEWPORT } from '../src/platform/display-policy.js';

function isCircle(pos) { return 'r' in pos; }
function rectOf(pos) {
  return { x0: pos.x - pos.w / 2, x1: pos.x + pos.w / 2, y0: pos.y - pos.h / 2, y1: pos.y + pos.h / 2 };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function overlaps(a, b) {
  if (isCircle(a) && isCircle(b)) {
    return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;
  }
  if (!isCircle(a) && !isCircle(b)) {
    const ra = rectOf(a);
    const rb = rectOf(b);
    return ra.x0 < rb.x1 && rb.x0 < ra.x1 && ra.y0 < rb.y1 && rb.y0 < ra.y1;
  }
  const circle = isCircle(a) ? a : b;
  const rect = rectOf(isCircle(a) ? b : a);
  const nearestX = clamp(circle.x, rect.x0, rect.x1);
  const nearestY = clamp(circle.y, rect.y0, rect.y1);
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.r;
}

test('no two elements of the pad diagram overlap', () => {
  // The diagram used to draw the left stick on top of the d-pad and print
  // "D-PAD RIGHT" across both. Geometry is the cheapest thing to assert and the
  // easiest to break by nudging one coordinate.
  const entries = Object.entries(BUTTON_POSITIONS);
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [idA, a] = entries[i];
      const [idB, b] = entries[j];
      assert.ok(!overlaps(a, b), `${idA} overlaps ${idB}`);
    }
  }
});

test('every element stays inside the drawing box', () => {
  for (const [id, pos] of Object.entries(BUTTON_POSITIONS)) {
    const box = isCircle(pos)
      ? { x0: pos.x - pos.r, x1: pos.x + pos.r, y0: pos.y - pos.r, y1: pos.y + pos.r }
      : rectOf(pos);
    assert.ok(box.x0 >= 0 && box.x1 <= 100, `${id} escapes the 100-wide viewBox`);
    assert.ok(box.y0 >= 0 && box.y1 <= 86, `${id} escapes the 86-tall viewBox`);
  }
});

test('diagram legends are short enough to sit inside their element', () => {
  // At font-size 2.9 in this viewBox a character is roughly 1.8 units wide.
  const CHAR = 1.8;
  for (const family of ['xbox', 'nintendo', 'playstation', 'generic']) {
    for (const [id, pos] of Object.entries(BUTTON_POSITIONS)) {
      const width = isCircle(pos) ? pos.r * 2 : pos.w;
      const text = diagramGlyph(id, family);
      assert.ok(
        text.length * CHAR <= width + 0.6,
        `${family}/${id} legend "${text}" is wider than its ${width}-unit element`,
      );
    }
  }
});

test('the stacked layout is reachable at the smallest supported window', () => {
  // The thresholds used to sit below the viewport guard's safe minimum, so the
  // stacked branch could never run on a window the game would actually render.
  assert.equal(controllerLayoutMode(MINIMUM_VIEWPORT), 'stacked');
  assert.equal(controllerLayoutMode({ width: 1280, height: 800 }), 'split');
});
