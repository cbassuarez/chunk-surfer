import test from 'node:test';
import assert from 'node:assert/strict';
import { freshContinuationHush, normalizeContinuationHush, advanceContinuationHush } from '../src/game/source-continuation-hush.js';
import { JOURNEY_PORTALS } from '../src/data/source-continuation-journey.js';

const clone = v => JSON.parse(JSON.stringify(v));
const player = () => ({ x: 20, z: 20, feet: 0, chartId: 0, phase: 'wrong-return', elapsed: 10,
  doorOpen: {}, doorMotion: {} });
const walker = () => normalizeContinuationHush({ ...freshContinuationHush({ x: 0, z: 2, feet: 0 }), mode: 'follow', armed: true,
  warningAnnounced: true, elapsed: 10, trail: [{ kind: 'walk', x: 0, z: -4, feet: 0, chartId: 0 }] });

test('continuation captures normalized density while old checkpoints receive a bounded static state', () => {
  const actor = walker();
  for (let n = 0; n < 12; n++) advanceContinuationHush(actor, { dt: .02, player: player() });
  assert.deepEqual(normalizeContinuationHush(clone(actor)), actor);
  const old = clone(actor); delete old.density;
  assert.equal(normalizeContinuationHush(old).density.phase, 0);
  actor.density.privateTarget = [8, 9];
  assert.equal(normalizeContinuationHush(actor).density.privateTarget, undefined);
});

test('accepted supported metres drive one density tick and leave route position and speed unchanged', () => {
  const actor = walker(); let previousPhase = 0;
  for (let n = 0; n < 10; n++) {
    advanceContinuationHush(actor, { dt: .02, player: player() });
    assert.ok(Math.abs(actor.animationClock - .064 * (n + 1)) < 1e-9);
    assert.ok(Math.abs(actor.z - (2 - .064 * (n + 1))) < 1e-9);
    assert.ok(actor.density.phase - previousPhase <= .04 + 1e-10);
    assert.ok(Math.abs(actor.density.residualDragMps - 2.2) < 1e-9);
    previousPhase = actor.density.phase;
  }
  const restored = normalizeContinuationHush(clone(actor)), p = player();
  advanceContinuationHush(restored, { dt: .02, player: p });
  advanceContinuationHush(actor, { dt: .02, player: clone(p) });
  assert.deepEqual(restored, actor);
});

test('zero time, inactive and frozen continuation updates do not advance captured material', () => {
  const actor = walker(); advanceContinuationHush(actor, { dt: .02, player: player() });
  const before = clone(actor.density);
  advanceContinuationHush(actor, { dt: 0, player: player() }); assert.deepEqual(actor.density, before);
  advanceContinuationHush(actor, { dt: .2, player: player(), frozen: true }); assert.deepEqual(actor.density, before);
  actor.active = false; advanceContinuationHush(actor, { dt: .2, player: player() }); assert.deepEqual(actor.density, before);
});

test('held route compresses once and a deliberate notice uses the actual mode without inventing a bearing', () => {
  const actor = walker(); actor.trail[0].chartId = 1;
  for (let n = 0; n < 60; n++) advanceContinuationHush(actor, { dt: .02, player: player() });
  assert.equal(actor.z, 2); assert.equal(actor.density.phase, 0);
  assert.ok(actor.density.compression > .9); assert.ok(actor.density.retained >= .86);
  actor.mode = 'notice'; actor.notice = .8; actor.trail = [];
  advanceContinuationHush(actor, { dt: .02, player: player() });
  assert.equal(actor.density.event, 'notice'); assert.equal(actor.density.attention, 0);
});

test('real portal coordinate jumps are not counted as travel and receiving falls do not run traction in place', () => {
  const portal = JOURNEY_PORTALS[0], a = portal.a;
  const actor = { ...freshContinuationHush(a.approach), armed: true, mode: 'follow', elapsed: 10,
    heading: a.approach.yaw, warningAnnounced: true,
    trail: [{ kind: 'fold', x: a.x - a.normal[0] * .04, z: a.z - a.normal[2] * .04,
      feet: a.feet, chartId: portal.fromChart, foldId: portal.id, foldSide: 'a', matrix: portal.matrix, inverseMatrix: portal.inverseMatrix }] };
  const p = { ...player(), chartId: 99 }, events = [];
  let crossed = false;
  for (let n = 0; n < 500 && !crossed; n++) {
    const before = actor.density.phase, chart = actor.chartId;
    advanceContinuationHush(actor, { dt: 1 / 120, player: p, events });
    assert.ok(actor.density.phase - before <= 2 / 120 + 1e-10);
    crossed = chart !== actor.chartId;
  }
  assert.equal(crossed, true); assert.ok(actor.fall);
  const before = actor.density.phase;
  advanceContinuationHush(actor, { dt: 1 / 120, player: p, events });
  assert.equal(actor.density.phase, before);
  assert.ok(events.some(e => e.type === 'hush-fold'));
});
