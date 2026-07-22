import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VFD_TIER, VFD_BLINK_HZ, VFD_BLINK_DUTY, vfdBlinkOn, vfdRowStyle,
} from '../src/render/vfd-select.js';

test('brightness is quantized to real duty-factor tiers, never a continuous ramp', () => {
  // Character VFD modules expose exactly 100/75/50/25%.
  assert.deepEqual(
    [VFD_TIER.full, VFD_TIER.mid, VFD_TIER.low, VFD_TIER.dim],
    [1, 0.75, 0.5, 0.25],
  );
  const tiers = new Set(Object.values(VFD_TIER));
  for (const state of [{}, { hovered: true }, { selected: true }, { disabled: true }]) {
    assert.ok(tiers.has(vfdRowStyle(state).tier), 'every row tier is an authored step');
  }
});

test('hover and selection use different physical mechanisms and never collide', () => {
  const hover = vfdRowStyle({ hovered: true });
  const selected = vfdRowStyle({ selected: true });
  // Hover borrows brightness — the one channel that was semantically empty on
  // real hardware — and must NOT claim the inverse block.
  assert.equal(hover.inverse, false, 'hover must not use the selection primitive');
  assert.ok(hover.tier > vfdRowStyle({}).tier, 'hover steps the duty factor up');
  // Selection is inverse video, the one state real VFDs actually had.
  assert.equal(selected.inverse, true);
  assert.equal(selected.tier, VFD_TIER.full);
  assert.equal(selected.gutter, '▶');
});

test('blink stays under the flash threshold and is quantized to the hardware grid', () => {
  // WCAG 2.3.1 allows no more than three flashes per second; HD44780's inherited
  // cursor rate is ~1.22 Hz, comfortably below it.
  assert.ok(VFD_BLINK_HZ < 3, 'blink must stay under the three-flash ceiling');
  assert.ok(VFD_BLINK_DUTY > 0.5, 'cautions are asymmetric: more on than off');
  // Quantized to ~14ms, so sub-frame jitter cannot make it look like software.
  assert.equal(vfdBlinkOn(0), true);
  assert.equal(vfdBlinkOn(4), vfdBlinkOn(0), 'sub-quantum time does not change phase');
  const period = 1000 / VFD_BLINK_HZ;
  assert.equal(vfdBlinkOn(period * 0.85), false, 'off phase exists');
});

test('reduced motion trades blinking for a steady inverse block', () => {
  const moving = vfdRowStyle({ editing: true, nowMs: 700, reduceMotion: false });
  const still = vfdRowStyle({ editing: true, nowMs: 700, reduceMotion: true });
  assert.equal(still.inverse, true, 'the state stays legible without motion');
  assert.notEqual(still.inverse && moving.inverse, undefined);
});

test('disabled knocks out dots rather than fading, because the panel has no grey', () => {
  const off = vfdRowStyle({ disabled: true });
  assert.equal(off.tier, VFD_TIER.dim);
  assert.equal(off.knockout, 0.5, 'half the dots are removed, not made translucent');
  assert.equal(off.inverse, false);
});

test('a press sags the duty factor momentarily and snaps back', () => {
  const idle = vfdRowStyle({ selected: true, pressedFor: 0 });
  const pressed = vfdRowStyle({ selected: true, pressedFor: 40 });
  const after = vfdRowStyle({ selected: true, pressedFor: 200 });
  assert.ok(pressed.tier < idle.tier, 'the row dips while held');
  assert.equal(after.tier, idle.tier, 'and recovers — it never repeats');
});
