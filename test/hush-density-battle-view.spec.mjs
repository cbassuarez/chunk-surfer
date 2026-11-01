import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNAL_DENSITY_CELL, signalBeingGeometry, signalBeingCellMaterial } from '../src/render/combat-view.js';

const core = (id, options) => signalBeingGeometry(id, options).points.filter(p => p.core);
const key = p => `${Math.round(p.u / SIGNAL_DENSITY_CELL)},${Math.round(p.v / SIGNAL_DENSITY_CELL)}`;

test('room HUSH projections have one broad connected pressure volume and two large visible separations', () => {
  for (const id of ['natatorium', 'practice', 'hall']) for (const now of [0, 1.125, 6, 17]) {
    const cells = core(id, { now });
    assert.ok(cells.length > 800 && cells.length < 1400, `${id}: bounded broad mass, not a tiny core emblem`);
    const left = Math.min(...cells.map(p => p.u)), right = Math.max(...cells.map(p => p.u));
    const top = Math.min(...cells.map(p => p.v)), bottom = Math.max(...cells.map(p => p.v));
    assert.ok(right - left > .70 && bottom - top > .85);
    assert.equal(cells.some(p => Math.abs(p.u + .16) < .011 && Math.abs(p.v + .10) < .011), false, 'left separation closes');
    assert.equal(cells.some(p => Math.abs(p.u - .18) < .011 && Math.abs(p.v + .10) < .011), false, 'right separation closes');
    const unseen = new Set(cells.map(key)), queue = [key(cells[0])]; unseen.delete(queue[0]);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i].split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = `${x + dx},${y + dy}`;
        if (unseen.delete(next)) queue.push(next);
      }
    }
    assert.equal(unseen.size, 0, 'pressure pieces float apart or detach at a fold');
  }
});

test('pressure coverage remains exact black under coherence loss, concealment and hit flashes', () => {
  const geometry = signalBeingGeometry('hall', { now: 3, coherenceRatio: 0, intentKind: 'conceal', hitFlash: 1 });
  const cells = geometry.points.filter(p => p.core), returns = geometry.points.filter(p => p.pressureReturn);
  assert.ok(cells.length > 800); assert.ok(returns.length > 8 && returns.length < cells.length * .05);
  for (const p of cells) assert.deepEqual(signalBeingCellMaterial(p, { tint: '255,0,0', flash: 1, alphaScale: .01, grain: .01 }),
    { color: '0,0,0', alpha: 1, shadowPixels: 0 });
  for (const p of returns) {
    const material = signalBeingCellMaterial(p, { tint: '0,255,0', flash: 1 });
    assert.equal(material.color, '222,230,222'); assert.equal(material.shadowPixels, 0); assert.ok(material.alpha <= .24);
  }
});

test('battle-owned motion is deterministic and the reduced-motion projection stays fixed', () => {
  assert.deepEqual(signalBeingGeometry('practice', { now: 4.25 }), signalBeingGeometry('practice', { now: 4.25 }));
  assert.deepEqual(core('practice', { now: 0, reducedMotion: true }), core('practice', { now: 999, reducedMotion: true }));
  assert.notDeepEqual(core('practice', { now: 0 }), core('practice', { now: 7 }));
  for (const intentKind of ['broadcast', 'conceal', 'overload', 'loop', 'silence']) {
    const g = signalBeingGeometry('natatorium', { now: 3, intentKind });
    assert.ok(g.points.length < 1600);
    assert.ok(g.points.every(p => Number.isFinite(p.u) && Number.isFinite(p.v)));
  }
});

test('training and intentional Surfer fallbacks retain their own figures without density material', () => {
  for (const [id, figure] of [['training', 'column'], ['chapel', 'seal'], ['source-final', 'lattice'], ['other-face', 'column']]) {
    const g = signalBeingGeometry(id, { now: 2 });
    assert.equal(g.figure, figure);
    assert.equal(g.points.some(p => p.core || p.pressureReturn), false);
  }
});
