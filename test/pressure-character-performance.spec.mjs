import test from 'node:test';
import assert from 'node:assert/strict';
import { createPressurePerformance, normalizePressurePresentation, PRESSURE_ROLES } from '../src/game/pressure-performance.js';
import * as PRES from '../src/game/presence.js';

const actor = (extra = {}) => ({ id: 'real-pressure:1', role: 'live-pressure', x: 6, y: -8,
  floorH: .3, strength: .96, radiusM: 6, heightM: 2.18, widthM: .68,
  velocityX: 0, velocityY: 0, motion: 'idle', ...extra });

test('Pressure has a simulation-owned heading and travel-driven gait, including a stationary blocked root', () => {
  const driver = createPressurePerformance(); driver.reset({ seed: 771 });
  const still = driver.tick(.1, { primary: actor({ heading: .7 }) });
  assert.equal(still.primary.performance.clip, 'pressure_idle');
  const moving = actor({ x: 8, velocityX: 2, motion: 'hunt' });
  const walk = driver.tick(.1, { primary: moving, cameraYaw: -2 });
  assert.equal(walk.primary.performance.clip, 'pressure_approach');
  assert.equal(walk.primary.performance.time, 4.8, 'one metre of real root travel must advance two authored half-metre cycles');
  assert.ok(Math.abs(walk.primary.performance.heading - Math.PI / 2) < 1e-6);
  const blocked = driver.tick(.2, { primary: moving, cameraYaw: 2 });
  assert.equal(blocked.primary.performance.time, walk.primary.performance.time, 'a blocked body walks in place despite no root movement');
  assert.equal(blocked.primary.performance.heading, walk.primary.performance.heading, 'camera yaw billboards the body');
  const stopped = driver.tick(.1, { primary: { ...moving, velocityX: 0, motion: 'listen' } });
  assert.equal(stopped.primary.performance.clip, 'pressure_listen');
  assert.equal(stopped.primary.performance.heading, walk.primary.performance.heading, 'stopping turns the body toward the camera');
  assert.ok(stopped.primary.performance.time > 0);
  const limp = driver.tick(.1, { primary: { ...moving, x: 8.75, motion: 'limp' } });
  assert.equal(limp.primary.performance.clip, 'pressure_limp');
  assert.ok(Math.abs(limp.primary.performance.time - 3.4) < 1e-6, 'the authored .375m limp cycle is not driven by actual travel');
});

test('independent Pressure bodies pause, fade in place, and keep immutable snapshots without reading a wall clock', () => {
  const driver = createPressurePerformance(); driver.reset({ seed: 4417 });
  const primary = actor(), secondary = actor({ id: 'front:1', role: 'source-front', x: -6, heading: -.8 });
  driver.tick(.1, { primary, secondary });
  const first = driver.snapshot();
  for (let i = 0; i < 30; i++) driver.tick(.25, { primary: actor({ x: 999 }), secondary: null, suspended: true });
  assert.deepEqual(driver.snapshot(), first, 'pause advanced, despawned or reoriented a performance');
  first.primary.x = 999;
  assert.equal(driver.snapshot().primary.x, 6, 'a caller mutated the live actor through a snapshot');
  primary.x = 333;
  assert.equal(driver.snapshot().primary.x, 6, 'a caller mutated the live actor through its tick input');
  const fading = driver.tick(.1, { primary: null, secondary });
  assert.equal(fading.primary.x, 6, 'despawn fading follows the new observer or origin');
  assert.ok(fading.primary.performance.manifestation < driver.snapshot().secondary.performance.manifestation);
  for (let i = 0; i < 20; i++) driver.tick(.25, { primary: null, secondary });
  assert.equal(driver.snapshot().primary, null);
  assert.equal(driver.snapshot().secondary.id, 'front:1', 'one actor fading erased the other actor');
});

test('a recorded frame is read-only authority and an absent/legacy frame cannot synthesize a live actor', () => {
  const driver = createPressurePerformance();
  driver.tick(.1, { primary: actor() }); driver.cue('lean', 'live-pressure');
  driver.tick(.1, { primary: actor() });
  const saved = driver.snapshot(), copy = JSON.stringify(saved);
  driver.applyFrame(saved);
  assert.equal(driver.isReplay(), true);
  assert.equal(driver.cue('recoil', 'live-pressure'), false, 'replaying a cue enqueues a new live performance');
  for (let i = 0; i < 10; i++) driver.tick(.25, { primary: actor({ x: 200 }), suspended: true });
  assert.deepEqual(driver.snapshot(), saved, 'replay was changed by observer/render ticks');
  assert.equal(JSON.stringify(saved), copy, 'applying a replay mutated the saved tape');
  driver.applyFrame(null);
  assert.equal(driver.snapshot().primary, null);
  assert.equal(driver.snapshot().secondary, null);
  assert.equal(driver.cue('still', 'court-trace'), false);
  driver.clearReplay(); driver.tick(.1, { primary: actor({ id: 'fresh:2' }) });
  assert.equal(driver.isReplay(), false);
  assert.equal(driver.snapshot().primary.id, 'fresh:2');
});

test('Pressure performance never acquires sound beliefs, changes contact physics, or turns render-only roles into Presence actors', () => {
  PRES.loadPresenceState({ awareness: .3, caughtCount: 2 });
  PRES.spawnAtCell(12, 24, { sector: 'audit' });
  const state = PRES.presenceState();
  Object.assign(state, { hasTarget: true, targetX: 20, targetY: 21, targetReason: 'PLAYER_NOISE_CLUE',
    targetLevel: .4, targetConfidence: .5, targetPriority: .5, pendingContact: null });
  const before = structuredClone(state);
  const driver = createPressurePerformance(); driver.reset({ seed: 20 });
  for (const role of PRESSURE_ROLES) {
    driver.tick(.2, { primary: actor({ id: role, role }), secondary: actor({ id: `${role}:second`, role }) });
    driver.cue('step-in', role);
    driver.tick(.2, { primary: actor({ id: role, role }) });
  }
  assert.deepEqual(PRES.presenceState(), before, 'presentation mutated movement, hearing, catch state or awareness');
  PRES.despawn();
  for (const role of ['tenant', 'plant-hallucination', 'recording-hallucination', 'source-front']) {
    driver.tick(.2, { primary: actor({ id: role, role }) });
    assert.equal(PRES.isActive(), false, `${role} became a real hunter`);
  }
});

test('reduced motion holds a real volume while normalization strips unbounded/private gameplay payloads', () => {
  const driver = createPressurePerformance();
  for (let i = 0; i < 10; i++) driver.tick(.1, { primary: actor({ x: 6 + i, velocityX: 2, motion: 'hunt' }), reducedMotion: true });
  const reduced = driver.snapshot();
  assert.equal(reduced.primary.performance.clip, 'pressure_hold');
  assert.equal(reduced.primary.performance.time, 0);
  assert.equal(reduced.primary.performance.reducedMotion, true);
  assert.ok(reduced.primary.performance.manifestation > .9, 'reduced motion makes Pressure disappear');
  const raw = { ...reduced, hiddenBattle: { attack: 'secret' }, garbage: new Array(10000).fill('x') };
  raw.primary.privateBelief = { targetX: 999 };
  raw.primary.performance.future = new Array(10000).fill(1);
  const bounded = normalizePressurePresentation(raw);
  assert.ok(JSON.stringify(bounded).length < 2000, 'capture retains arbitrary unbounded fields');
  assert.equal(Object.hasOwn(bounded, 'hiddenBattle'), false);
  assert.equal(Object.hasOwn(bounded.primary, 'privateBelief'), false);
  assert.equal(normalizePressurePresentation({ primary: { ...raw.primary, x: NaN } }).primary, null);
  for (const role of ['tenant', 'plant-hallucination', 'recording-hallucination']) {
    const frame = driver.tick(.1, { primary: actor({ id: role, role, velocityX: 2, motion: 'hunt' }) });
    assert.equal(frame.primary.performance.clip, 'pressure_hold', `${role} acquired an unrequested pursuit performance`);
  }
});
