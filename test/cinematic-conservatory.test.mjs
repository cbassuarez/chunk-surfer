import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cinematicConservatoryFrame,
  cinematicConservatoryLayout,
} from '../src/game/cinematic-conservatory.js';

function assertFiniteTree(value, label = 'value') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${label} is finite`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) assertFiniteTree(child, `${label}.${key}`);
}

test('cinematic conservatory frame exposes finite authored motion layers', () => {
  const frame = cinematicConservatoryFrame(8, { duration: 22, intensity: 0.8, variant: 'opening' });
  assert.equal(frame.id, 'cinematic-conservatory');
  assert.equal(frame.variant, 'opening');
  assert.ok(frame.camera.push > 0);
  assert.ok(frame.light.alpha > 0);
  assert.ok(frame.atmosphere.fog > 0);
  assertFiniteTree(frame, 'frame');
});

test('reduced motion damps camera travel, dust, and grain', () => {
  const normal = cinematicConservatoryFrame(11, { duration: 22 });
  const reduced = cinematicConservatoryFrame(11, { duration: 22, reduceMotion: true });
  assert.ok(Math.abs(reduced.camera.x) < Math.abs(normal.camera.x));
  assert.ok(Math.abs(reduced.camera.y) < Math.abs(normal.camera.y));
  assert.ok(reduced.atmosphere.dust < normal.atmosphere.dust);
  assert.ok(reduced.atmosphere.grain < normal.atmosphere.grain);
});

test('cinematic conservatory layout stays inside small and large viewports', () => {
  for (const size of [{ cols: 34, rows: 16 }, { cols: 144, rows: 64 }]) {
    const frame = cinematicConservatoryFrame(4.5);
    const layout = cinematicConservatoryLayout({ ...size, frame });
    assert.ok(layout.horizon >= 0 && layout.horizon < size.rows);
    assert.ok(layout.lowerBand.y >= 0);
    assert.ok(layout.lowerBand.y + layout.lowerBand.h <= size.rows);
    assert.ok(layout.titleBand.y >= 0 && layout.titleBand.y < size.rows);
  }
});
