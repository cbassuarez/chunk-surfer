import test from 'node:test';
import assert from 'node:assert/strict';
import { locomotionSandbox } from './helpers/locomotion-sandbox.mjs';
import {
  GAIT_ORDER, GAIT_SPEED, GAIT_NOISE, PLACE_GAITS, BREATH,
  chooseGait, gaitsForPlace, gaitSpeed, gaitNoise, applySpeedFactors,
  cellIntervalMs, stepIntervalMs, sprintSeconds, freshBreath, stepBreath, breathExertion,
} from '../src/game/locomotion.js';

test('the ladder is ordered, human and priced', () => {
  assert.deepEqual(GAIT_ORDER, ['crawl', 'walk', 'jog', 'run', 'sprint']);
  assert.deepEqual(GAIT_ORDER.map(g => GAIT_SPEED[g]), [0.7, 2.0, 2.6, 4.0, 6.0]);
  assert.deepEqual(GAIT_ORDER.map(g => GAIT_NOISE[g]), [0.06, 0.12, 0.22, 0.32, 0.45]);
  for (let i = 1; i < GAIT_ORDER.length; i++) {
    assert.ok(GAIT_SPEED[GAIT_ORDER[i]] > GAIT_SPEED[GAIT_ORDER[i - 1]]);
    assert.ok(GAIT_NOISE[GAIT_ORDER[i]] > GAIT_NOISE[GAIT_ORDER[i - 1]]);
  }
  // A comfortable human walk, and the walk-to-run transition between walk and jog.
  assert.ok(GAIT_SPEED.walk >= 1.9 && GAIT_SPEED.walk <= 2.1);
  assert.ok(GAIT_SPEED.walk < 2.6 && GAIT_SPEED.jog > 2.0);
});

test('every place offers exactly two speeds, and all five gaits appear somewhere', () => {
  const seen = new Set();
  for (const pair of Object.values(PLACE_GAITS)) {
    assert.equal(pair.length, 2);
    assert.ok(GAIT_SPEED[pair[1]] > GAIT_SPEED[pair[0]]);
    pair.forEach(g => seen.add(g));
  }
  assert.deepEqual([...seen].sort(), [...GAIT_ORDER].sort());
  assert.deepEqual(gaitsForPlace('tight'), ['crawl', 'walk']);
  assert.deepEqual(gaitsForPlace('interior'), ['walk', 'jog']);
  assert.deepEqual(gaitsForPlace('exterior'), ['walk', 'run']);
  assert.deepEqual(gaitsForPlace('interior', { chase: true }), ['walk', 'sprint']);
  assert.deepEqual(gaitsForPlace('exterior', { chase: true }), ['walk', 'sprint']);
  // Water stays water in a chase.
  assert.deepEqual(gaitsForPlace('tight', { chase: true }), ['crawl', 'walk']);
  assert.equal(gaitsForPlace('authored'), null);
});

test('the run key moves one rung; a winded sprint is a run', () => {
  assert.equal(chooseGait({ place: 'interior' }), 'walk');
  assert.equal(chooseGait({ place: 'interior', run: true }), 'jog');
  assert.equal(chooseGait({ place: 'exterior', run: true }), 'run');
  assert.equal(chooseGait({ place: 'tight' }), 'crawl');
  assert.equal(chooseGait({ place: 'tight', run: true }), 'walk');
  assert.equal(chooseGait({ place: 'interior', run: true, chase: true }), 'sprint');
  assert.equal(chooseGait({ place: 'interior', run: true, chase: true, winded: true }), 'run');
  assert.equal(chooseGait({ place: 'interior', run: false, chase: true }), 'walk');
  assert.equal(chooseGait({ place: 'bogus' }), 'walk');
  assert.equal(gaitSpeed('nope'), GAIT_SPEED.walk);
  assert.equal(gaitNoise('nope'), GAIT_NOISE.walk);
});

test('speed factors only slow, and nothing escapes the floor or the sprint', () => {
  assert.equal(applySpeedFactors(1.4, [0.5]), 0.7);
  assert.equal(applySpeedFactors(1.4, [0.01]), 0.25);
  assert.equal(applySpeedFactors(9, []), 6);
  assert.equal(applySpeedFactors(1.4, [0, NaN, -1]), 1.4);
});

test('cell timing is metres per second, and a diagonal is its real length', () => {
  assert.equal(Math.round(cellIntervalMs(1.4)), 357);
  assert.equal(Math.round(cellIntervalMs(6)), 83);
  // An authored walk older than the ladder is not cut down to a sprint.
  assert.equal(Math.round(cellIntervalMs(1000 * 0.5 / 45)), 45);
  assert.ok(Math.abs(stepIntervalMs(1.4, 1, 1) - cellIntervalMs(1.4) * Math.SQRT2) < 1e-9);
  assert.equal(stepIntervalMs(1.4, 0, -1), cellIntervalMs(1.4));
  // Metres per second along a diagonal equal metres per second along an axis.
  const diag = (Math.SQRT2 * 0.5) / (stepIntervalMs(2.6, 1, 1) / 1000);
  assert.ok(Math.abs(diag - 2.6) < 1e-9);
});

test('a walk stays a walk however far he goes: the procedural world never slows the story', () => {
  // Story mode is never "on terrain". The void trudge and the world seam belong to the old
  // procedural walk; let them through and 1.4 m/s sinks to .69 over a few dozen steps.
  const tired = { curPlayerCtx: { onTerrain: false }, voidFatigue: 1, worldBoundaryFriction: 1 };
  const sandbox = locomotionSandbox(tired);
  assert.equal(sandbox.locomotion().speed, GAIT_SPEED.walk);
  assert.equal(sandbox.interval(), Math.round(1000 * 0.5 / GAIT_SPEED.walk));
  sandbox.setRun(true);
  assert.equal(sandbox.locomotion().speed, GAIT_SPEED.jog);
  const outside = locomotionSandbox({ ...tired, isOutdoorZone: () => true });
  outside.setRun(true);
  assert.equal(outside.locomotion().speed, GAIT_SPEED.run);
  // The real slow-downs still ride on top.
  const wrench = locomotionSandbox({ ...tired, PLANT: { heavyWrenchDragging: () => true } });
  assert.ok(Math.abs(wrench.locomotion().speed - GAIT_SPEED.walk * 0.65) < 1e-9);
});

test('a sprint lasts six to eight seconds, fear spends it faster, the run is free', () => {
  assert.ok(Math.abs(sprintSeconds({ fear: 0, seed: 0 }) - 8) <= BREATH.spreadSeconds);
  assert.ok(Math.abs(sprintSeconds({ fear: 1, seed: 0 }) - 6) <= BREATH.spreadSeconds);
  for (const seed of [1, 2, 3, 99, 4417]) {
    assert.ok(sprintSeconds({ fear: 1, seed }) < sprintSeconds({ fear: 0, seed }));
  }
  let breath = freshBreath(), t = 0;
  while (!breath.winded && t < 20) { breath = stepBreath(breath, 1 / 60, { gait: 'sprint', seed: 7 }); t += 1 / 60; }
  assert.ok(t >= 7.4 && t <= 8.6, `calm sprint lasted ${t.toFixed(2)}s`);
  // Running on a winded body neither spends nor returns breath.
  const before = breath.reserve;
  for (let i = 0; i < 120; i++) breath = stepBreath(breath, 1 / 60, { gait: 'run' });
  assert.equal(breath.reserve, before);
  assert.equal(breath.winded, true);
});

test('walking gives the sprint back in about ten seconds, and only past half', () => {
  let breath = { reserve: 0, winded: true };
  let t = 0;
  while (breath.winded) { breath = stepBreath(breath, 1 / 60, { gait: 'walk' }); t += 1 / 60; }
  assert.ok(Math.abs(t - BREATH.sprintAgainAt * BREATH.restRecoverSeconds) < 0.05, `freed after ${t.toFixed(2)}s`);
  while (breath.reserve < 1) { breath = stepBreath(breath, 1 / 60, { gait: null }); t += 1 / 60; }
  assert.ok(Math.abs(t - BREATH.restRecoverSeconds) < 0.05, `full after ${t.toFixed(2)}s`);
  // Jogging recovers, but slowly.
  let jog = { reserve: 0.2, winded: true };
  for (let i = 0; i < 600; i++) jog = stepBreath(jog, 1 / 60, { gait: 'jog' });
  assert.ok(jog.reserve > 0.2 && jog.reserve < 0.6);
});

test('the breath is heard only once it is being spent, and loudest winded', () => {
  assert.equal(breathExertion(freshBreath()), 0);
  assert.ok(breathExertion({ reserve: 0.5 }) > 0);
  assert.ok(breathExertion({ reserve: 0.1, winded: true }) >= 0.65);
  assert.ok(breathExertion({ reserve: 0.9, winded: true }) >= 0.65);
  // A huge frame cannot spend a whole sprint at once.
  const lurch = stepBreath(freshBreath(), 10, { gait: 'sprint' });
  assert.ok(lurch.reserve > 0.9);
});
