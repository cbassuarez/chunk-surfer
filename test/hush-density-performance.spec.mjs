import test from 'node:test';
import assert from 'node:assert/strict';
import { createPressurePerformance, normalizePressurePresentation, interpolatePressurePresentation } from '../src/game/pressure-performance.js';
import { freshPressureGait } from '../src/game/pressure-gait.js';
import { freshSave, getSave, saveCommit, withTransientGameState } from '../src/game/save.js';
import { HUSH_DENSITY_LIMITS, freshHushDensityPose, normalizeHushDensityPose,
  stepHushDensityPose, hushDensityCharacter, hushDensityFromCaptured } from '../src/game/hush-density-performance.js';

const actor = (extra = {}) => ({ id: 'density:one', role: 'live-pressure', x: 0, y: 0,
  heading: 0, motion: 'idle', strength: .96, ...extra });
const json = value => JSON.parse(JSON.stringify(value));

test('Source-speed posture caps anatomical gathering and explicitly releases support for the remaining travel', () => {
  const driver = createPressurePerformance();
  driver.tick(.02, { primary: actor({ role: 'court-trace', motion: 'hunt' }) });
  let old = driver.snapshot(), total = 0;
  for (let n = 1; n <= 200; n++) {
    const incoming = actor({ role: 'court-trace', x: 19.7 * n * .02 / .5, motion: 'hunt', velocityX: 39.4, heading: Math.PI / 2 });
    const next = driver.tick(.02, { primary: incoming });
    assert.equal(next.primary.x, incoming.x);
    assert.equal(next.primary.y, incoming.y);
    assert.equal(next.primary.performance.heading, incoming.heading);
    const d = next.primary.performance.density, before = old.primary.performance.density;
    assert.ok(d.phase - before.phase <= HUSH_DENSITY_LIMITS.maxCyclesPerSecond * .02 + 1e-10);
    assert.ok(Math.abs(d.residualDragMps - (19.7 - HUSH_DENSITY_LIMITS.cycleMetres * HUSH_DENSITY_LIMITS.maxCyclesPerSecond)) < 1e-8);
    assert.ok(d.rate <= HUSH_DENSITY_LIMITS.maxCyclesPerSecond);
    total += d.phase - before.phase; old = next;
  }
  assert.ok(Math.abs(total - 4 * HUSH_DENSITY_LIMITS.maxCyclesPerSecond) < 1e-8);
  assert.equal(old.primary.performance.density.release, 1);
  const support = hushDensityCharacter(old.primary.performance).support;
  assert.equal(support.mode, 'released');
  assert.ok(support.contacts.every(c => !c.planted && c.offset[1] > .05));
  assert.ok(old.primary.performance.time > old.primary.performance.density.phase * 2.4,
    'the compatibility human clip must not dictate the density travel frequency');
});

test('blocked recovery retains visible density and compression across the obsolete human reset seam', () => {
  const driver = createPressurePerformance();
  for (let n = 0; n < 8; n++) driver.tick(.25, { primary: actor() });
  const gait = { ...freshPressureGait({ seed: 8 }), phase: 'recover', blocked: true, progress: .4,
    recoveryClip: 'pressure_advance', recoveryTime: .288 };
  const before = driver.snapshot().primary.performance;
  for (let n = 0; n < 45; n++) {
    const next = driver.tick(.02, { primary: actor({ motion: 'hunt', gait: { ...gait, elapsed: n * .02,
      recoveryReset: n >= 20, blocked: n < 20 } }) }).primary.performance;
    assert.equal(next.density.phase, before.density.phase);
    assert.ok(next.manifestation >= before.manifestation, 'a legacy leg-support reset hides the terminal body');
  }
  const p = driver.snapshot().primary.performance;
  assert.ok(p.density.compression > .9);
  assert.ok(p.density.retained >= .86);
  const c = hushDensityCharacter(p);
  assert.equal(c.support.clip, 'pressure_hold'); assert.equal(c.morphs, undefined);
  assert.deepEqual(c.support.contacts.map(c => c.side), ['L', 'R']);
  assert.ok(Object.keys(c.joints).every(name => !name.startsWith('fold_')));
  assert.ok(c.joints.chest && c.joints.head);
});

test('zero time and suspension do not consume roots, queued cues, role switches or material phase', () => {
  const driver = createPressurePerformance(); driver.tick(.1, { primary: actor() });
  const before = driver.snapshot(); driver.cue('lean', 'live-pressure');
  assert.deepEqual(driver.tick(0, { primary: actor({ x: 999, role: 'source-rear' }) }), before);
  assert.deepEqual(driver.tick(.2, { primary: null, suspended: true }), before);
  const next = driver.tick(.1, { primary: actor() });
  assert.equal(next.primary.performance.cue.name, 'lean');
  assert.equal(next.primary.performance.density.phase, before.primary.performance.density.phase);
});

test('density responds to accepted listening bearing, never observer fields or private targets', () => {
  const driver = createPressurePerformance(), other = createPressurePerformance();
  let gait = { ...freshPressureGait({ seed: 4 }), phase: 'listen', listenTurn: .5 };
  for (let n = 0; n < 60; n++) {
    const input = actor({ motion: 'listen', gait, cameraYaw: n, targetX: 999, targetY: -999 });
    const a = driver.tick(.02, { primary: input, cameraYaw: n });
    const b = other.tick(.02, { primary: actor({ motion: 'listen', gait }), cameraYaw: -n });
    assert.deepEqual(a, b);
  }
  const p = driver.snapshot().primary.performance;
  assert.ok(p.density.attention > .45); assert.equal(p.density.event, 'notice');
  assert.equal(p.density.phase, 0);
  const saved = driver.snapshot();
  assert.equal(saved.primary.targetX, undefined); assert.equal(saved.primary.performance.density.targetX, undefined);
  assert.equal(saved.primary.cameraYaw, undefined);
});

test('JSON save, constructor restore and recorded replay preserve the complete deterministic density state', () => {
  const driver = createPressurePerformance(); driver.reset({ seed: 982 });
  for (let n = 0; n < 20; n++) driver.tick(.05, { primary: actor({ x: n * .2, motion: 'hunt', clearanceM: .7 }) });
  const saved = json(driver.snapshot()), restored = createPressurePerformance(saved);
  assert.deepEqual(restored.snapshot(), saved);
  const incoming = actor({ x: 4.2, motion: 'hunt', clearanceM: .72 });
  assert.deepEqual(restored.tick(.05, { primary: incoming }), driver.tick(.05, { primary: incoming }));
  const live = driver.snapshot(); driver.applyFrame(saved);
  assert.deepEqual(driver.tick(.25, { primary: actor({ x: 100 }), suspended: true }), saved);
  driver.clearReplay(); assert.deepEqual(driver.snapshot(), live);
  assert.deepEqual(hushDensityCharacter(restored.snapshot().primary.performance), hushDensityCharacter(driver.snapshot().primary.performance));
});

test('same-id authority switches reset density while Source court following remains nonhuman', () => {
  const driver = createPressurePerformance();
  driver.tick(.1, { primary: actor() });
  driver.tick(.1, { primary: actor({ x: 2, motion: 'hunt' }) });
  assert.ok(driver.snapshot().primary.performance.density.phase > 0);
  const source = driver.tick(.1, { primary: actor({ role: 'court-trace', x: 100, referenceTrace: true, clearanceM: .1 }) }).primary;
  assert.equal(source.performance.density.phase, 0);
  assert.equal(source.referenceTrace, true); assert.equal(source.clearanceM, .18);
  const followed = driver.tick(.1, { primary: actor({ role: 'court-trace', x: 102, referenceTrace: false }) }).primary;
  assert.ok(followed.performance.density.phase > 0); assert.equal(followed.referenceTrace, undefined);
  const tenant = driver.tick(.1, { primary: actor({ role: 'tenant' }) }).primary;
  assert.equal(tenant.performance.density, undefined);
  for (const role of ['plant-hallucination', 'recording-hallucination']) {
    assert.ok(driver.tick(.1, { primary: actor({ role }) }).primary.performance.density);
  }
});

test('interpolation retains density phase and measured clearance without blending unrelated event authorities', () => {
  const driver = createPressurePerformance(); driver.tick(.1, { primary: actor({ motion: 'hunt' }) });
  const a = driver.tick(.1, { primary: actor({ motion: 'hunt', x: 1, clearanceM: .5 }) });
  const b = driver.tick(.1, { primary: actor({ motion: 'hunt', x: 2, clearanceM: .9 }) });
  const middle = interpolatePressurePresentation(a, b, .5);
  assert.ok(Math.abs(middle.primary.clearanceM - .7) < 1e-9);
  assert.equal(middle.primary.performance.density.phase, (a.primary.performance.density.phase + b.primary.performance.density.phase) / 2);
  const noticed = json(b); noticed.primary.performance.density.event = 'notice'; noticed.primary.performance.density.eventTime = 0;
  assert.deepEqual(interpolatePressurePresentation(a, noticed, .75).primary.performance.density, noticed.primary.performance.density);
});

test('captured fallback and comfort need no new clock, and old snapshots remain readable', () => {
  const legacy = { version: 1, role: 'source-rear', clip: 'pressure_approach', time: 32, seed: 9 };
  const a = hushDensityCharacter(legacy), b = hushDensityCharacter(json(legacy));
  assert.deepEqual(a, b); assert.equal(a.time, 0); assert.equal(a.clip, 'pressure_hold'); assert.equal(a.blend, undefined);
  assert.equal(hushDensityFromCaptured(legacy).eventTime, 2);
  const old = normalizePressurePresentation({ version: 1, primary: { x: 4, y: 2, performance: legacy } });
  assert.ok(old.primary); assert.equal(old.primary.performance.density, undefined);
  const d = stepHushDensityPose(freshHushDensityPose(9), { dt: .2, acceptedMetres: 4 });
  const held = stepHushDensityPose(d, { dt: .2, acceptedMetres: 4, reducedMotion: true });
  assert.equal(held.phase, d.phase); assert.equal(held.compression, d.compression);
  assert.deepEqual(hushDensityCharacter({ density: held, reducedMotion: true }), hushDensityCharacter({ density: json(held), reducedMotion: true }));
});

test('one finite stop packet finishes in exact material stillness instead of perpetual idle jitter', () => {
  let d = stepHushDensityPose(freshHushDensityPose(37), { dt: .1, acceptedMetres: .1 });
  for (let n = 0; n < 600; n++) d = stepHushDensityPose(d, { dt: .02 });
  assert.equal(d.event, 'still'); assert.equal(d.eventTime, 0); assert.equal(d.traction, 0); assert.equal(d.attention, 0);
  const c = hushDensityCharacter({ density: d });
  for (let n = 0; n < 100; n++) d = stepHushDensityPose(d, { dt: .02 });
  assert.deepEqual(hushDensityCharacter({ density: d }), c);
});

test('support resets do not claim an instant plant and interrupted pivots reground finitely without snapping', () => {
  const reset = stepHushDensityPose(freshHushDensityPose(4), { dt: .02, resetSupport: true });
  assert.ok(hushDensityCharacter({ density: reset }).support.contacts.every(c => !c.planted && c.weight === 0));
  const pivot = stepHushDensityPose(freshHushDensityPose(4), {
    dt: .02, pivot: { progress: .2, turn: -.5, startHeadingDelta: 0 } });
  assert.ok(pivot.feet.L.height > .04);
  let stopped = stepHushDensityPose(pivot, { dt: .02 });
  assert.deepEqual(stopped.feet.L, pivot.feet.L, 'cancelling a pivot teleports the raised sole onto the floor');
  assert.equal(stopped.settlingFeet, true);
  assert.equal(hushDensityCharacter({ density: stopped }).support.contacts.find(c => c.side === 'L').planted, false);
  for (let n = 0; n < 500; n++) stopped = stepHushDensityPose(stopped, { dt: .02 });
  assert.equal(stopped.settlingFeet, false); assert.equal(stopped.feet.L.height, 0);
  assert.ok(hushDensityCharacter({ density: stopped }).support.contacts.every(c => c.planted));
});

test('density normalization bounds untrusted snapshots and strips undeclared state', () => {
  assert.equal(freshHushDensityPose(7).attention, 0, 'a fresh mass invents a leftward sound bearing');
  const d = normalizeHushDensityPose({ version: 1, phase: 1e99, rate: 500, compression: -4, attention: 100,
    seed: 10, event: 'omniscient', privateTarget: [1, 2], residualDragMps: Infinity });
  assert.equal(d.phase, HUSH_DENSITY_LIMITS.maxPhase); assert.equal(d.rate, HUSH_DENSITY_LIMITS.maxCyclesPerSecond); assert.equal(d.compression, 0);
  assert.equal(d.attention, .65); assert.equal(d.event, 'still'); assert.equal(d.privateTarget, undefined);
  assert.equal(normalizeHushDensityPose({ version: 99 }), null);
});

test('live restore cannot retain replay authority, pending cues or an older live return state', () => {
  const driver = createPressurePerformance(); driver.reset({ seed: 44 });
  driver.tick(.1, { primary: actor() });
  const checkpoint = driver.tick(.1, { primary: actor({ x: .5, motion: 'hunt' }) });
  driver.applyFrame({ ...checkpoint, clock: 99 });
  driver.restore(json(checkpoint));
  assert.equal(driver.isReplay(), false); assert.deepEqual(driver.snapshot(), checkpoint);
  driver.clearReplay(); assert.deepEqual(driver.snapshot(), checkpoint);
  driver.cue('recoil', 'live-pressure'); driver.restore(checkpoint);
  const next = driver.tick(.1, { primary: actor({ x: 1, motion: 'hunt' }) });
  assert.equal(next.primary.performance.cue, null);
  assert.ok(next.primary.performance.density.phase > checkpoint.primary.performance.density.phase);
  assert.equal(next.primary.performance.seed, 44);
  driver.restore(null);
  assert.deepEqual(driver.snapshot(), { version: 1, clock: 0, primary: null, secondary: null });
  assert.equal(driver.isReplay(), false);
});

test('normal save boundary stores a normalized detached density checkpoint and accepts old saves without one', async () => {
  assert.equal(freshSave().pressurePresentation, null);
  const driver = createPressurePerformance(); driver.tick(.1, { primary: actor({ clearanceM: .6, referenceTrace: true }) });
  const p = driver.snapshot(); p.primary.performance.density.privateTarget = [77, 88];
  await withTransientGameState({ save: freshSave() }, async () => {
    assert.equal(getSave().pressurePresentation, null);
    saveCommit({ pressurePresentation: p });
    assert.equal(getSave().pressurePresentation.primary.performance.density.privateTarget, undefined);
    assert.equal(getSave().pressurePresentation.primary.clearanceM, .6);
    p.primary.x = 999;
    assert.equal(getSave().pressurePresentation.primary.x, 0, 'save retains a live caller-owned actor');
    const restored = createPressurePerformance(); restored.restore(json(getSave().pressurePresentation));
    assert.equal(restored.isReplay(), false);
    assert.deepEqual(restored.snapshot(), getSave().pressurePresentation);
  });
  const old = freshSave(); delete old.pressurePresentation;
  await withTransientGameState({ save: old }, async () => assert.equal(getSave().pressurePresentation, null));
});
