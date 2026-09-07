import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROL_TIMING, CONTROL_REGISTRY_LIMIT, CONTROL_LATCH_TRAVEL, pressControl, releaseControl,
  cancelControlScope, sampleControl, controlMechanicsSnapshot,
} from '../src/game/control-mechanics.js';

test('lamp heat is independent from mechanical hold and latch', () => {
  cancelControlScope('');
  sampleControl('test:up-lit', { lit: true, now: 0 });
  assert.deepEqual(sampleControl('test:up-lit', { lit: true, now: CONTROL_TIMING.warm }), { travel: 0, lampHeat: 1 });
  pressControl('test:down-dark', { now: 0 });
  assert.deepEqual(sampleControl('test:down-dark', { now: CONTROL_TIMING.press }), { travel: 1, lampHeat: 0 });
  sampleControl('test:latch-lit', { lit: true, latched: true, now: 0 });
  assert.deepEqual(sampleControl('test:latch-lit', { lit: true, latched: true, now: 300 }), { travel: CONTROL_LATCH_TRAVEL, lampHeat: 1 });
  sampleControl('test:latch-lit', { lit: false, latched: true, now: 300 });
  assert.deepEqual(sampleControl('test:latch-lit', { lit: false, latched: true, now: 600 }), { travel: CONTROL_LATCH_TRAVEL, lampHeat: 0 });
});

test('quick taps have a visible minimum plunge without delaying activation', () => {
  pressControl('test:tap', { now: 0 });
  releaseControl('test:tap', { now: 5 });
  assert.equal(sampleControl('test:tap', { now: 70 }).travel, 1);
  assert.equal(sampleControl('test:tap', { now: 90 }).travel, 1);
  assert.ok(sampleControl('test:tap', { now: 140 }).travel > 0);
  assert.equal(sampleControl('test:tap', { now: 210 }).travel, 0);
});

test('a real hold survives frame gaps and repeat, then releases from its current depth', () => {
  pressControl('test:hold', { now: 0 });
  pressControl('test:hold', { now: 20 });
  assert.equal(sampleControl('test:hold', { now: 70 }).travel, 1);
  assert.equal(sampleControl('test:hold', { now: 4000 }).travel, 1);
  releaseControl('test:hold', { now: 4000 });
  assert.equal(sampleControl('test:hold', { now: 4120 }).travel, 0);
});

test('controller pulses and sparse frames have the same analytic endpoint', () => {
  pressControl('test:sparse', { held: false, now: 0 });
  pressControl('test:dense', { held: false, now: 0 });
  for (let now = 0; now < 170; now += 11) sampleControl('test:dense', { now });
  assert.deepEqual(sampleControl('test:sparse', { now: 170 }), sampleControl('test:dense', { now: 170 }));
  assert.equal(sampleControl('test:sparse', { now: 3000 }).travel, 0);
});

test('latching survives key release and disable cannot leave a held control down', () => {
  pressControl('test:latch', { now: 0 });
  sampleControl('test:latch', { latched: true, now: 10 });
  releaseControl('test:latch', { now: 20 });
  assert.equal(sampleControl('test:latch', { latched: true, now: 300 }).travel, CONTROL_LATCH_TRAVEL);
  sampleControl('test:latch', { enabled: false, latched: true, lit: true, now: 300 });
  for (let now = 310; now <= 420; now += 10) sampleControl('test:latch', { enabled: false, now });
  assert.deepEqual(sampleControl('test:latch', { enabled: false, now: 600 }), { travel: 0, lampHeat: 0 });
});

test('a latching key presses to full travel then settles to its shallower latch', () => {
  sampleControl('test:latch-overtravel', { latched: true, now: 0 });
  assert.equal(sampleControl('test:latch-overtravel', { latched: true, now: 70 }).travel, .8);
  pressControl('test:latch-overtravel', { now: 100 });
  assert.equal(sampleControl('test:latch-overtravel', { latched: true, now: 170 }).travel, 1);
  releaseControl('test:latch-overtravel', { now: 190 });
  const rising = sampleControl('test:latch-overtravel', { latched: true, now: 240 }).travel;
  assert.ok(rising < 1 && rising > .8);
  assert.equal(sampleControl('test:latch-overtravel', { latched: true, now: 310 }).travel, .8);
});

test('reduced motion uses immediate mechanical and lamp endpoints', () => {
  pressControl('test:reduced', { held: false, now: 0 });
  assert.deepEqual(sampleControl('test:reduced', { lit: true, reducedMotion: true, now: 0 }), { travel: 1, lampHeat: 1 });
  assert.deepEqual(sampleControl('test:reduced', { reducedMotion: true, now: 100 }), { travel: 0, lampHeat: 0 });
});

test('scope cancellation and bounded registry leave no unbounded control lifetime', () => {
  cancelControlScope('');
  pressControl('recorder:rec', { now: 0 });
  pressControl('combat:hold', { now: 0 });
  assert.equal(cancelControlScope('recorder:'), 1);
  assert.deepEqual(controlMechanicsSnapshot().ids, ['combat:hold']);
  for (let i = 0; i < CONTROL_REGISTRY_LIMIT + 40; i += 1) sampleControl(`test:bounded:${i}`, { now: i });
  assert.equal(controlMechanicsSnapshot().size, CONTROL_REGISTRY_LIMIT);
  assert.equal(releaseControl('test:missing'), false);
  assert.equal(pressControl(''), false);
  cancelControlScope('');
  assert.equal(controlMechanicsSnapshot().size, 0);
});
