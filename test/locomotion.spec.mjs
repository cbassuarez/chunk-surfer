import test from 'node:test';
import assert from 'node:assert/strict';
import { locomotionSandbox } from './helpers/locomotion-sandbox.mjs';
import {
  GAIT_ORDER, GAIT_SPEED, GAIT_NOISE, PLACE_GAITS, BREATH,
  chooseGait, gaitsForPlace, gaitSpeed, gaitNoise, applySpeedFactors,
  cellIntervalMs, stepIntervalMs, sprintSeconds, freshBreath, stepBreath, breathExertion,
  sceneWalkSpeed, createSceneRunKey,
} from '../src/game/locomotion.js';
import { SOURCE_IV } from '../src/data/source-iv.js';
import { freshSourceIV, stepSourceIV } from '../src/game/source-iv.js';
import { SOURCE_PUB } from '../src/data/source-pub.js';
import { sourcePubEntry, stepSourcePub } from '../src/game/source-pub.js';
import { SOURCE_CONTINUATION } from '../src/data/source-continuation.js';
import { FIRST_STRIKE } from '../src/data/first-strike.js';
import { packFirstStrikeConstruction, restoreFirstStrikeConstruction } from '../src/game/first-strike-entry.js';
import { walkCoastalMemoryPose } from '../src/game/coastal-memory-scene.js';
import { COASTAL_MEMORY_LAYOUT } from '../src/data/coastal-memory.js';
import { freshSourceContinuation, resumeSourceContinuation, stepSourceContinuation } from '../src/game/source-continuation.js';
import { sourceTideField } from '../src/game/source-continuation-tides.js';
import { freshFirstStrike, stepFirstStrike } from '../src/game/first-strike-scene.js';

test('the faster exploration ladder is ordered and priced', () => {
  assert.deepEqual(GAIT_ORDER, ['crawl', 'walk', 'jog', 'run', 'sprint']);
  assert.deepEqual(GAIT_ORDER.map(g => GAIT_SPEED[g]), [0.7, 2.6, 3.6, 5.2, 7.5]);
  assert.deepEqual(GAIT_ORDER.map(g => GAIT_NOISE[g]), [0.06, 0.12, 0.22, 0.32, 0.45]);
  for (let i = 1; i < GAIT_ORDER.length; i++) {
    assert.ok(GAIT_SPEED[GAIT_ORDER[i]] > GAIT_SPEED[GAIT_ORDER[i - 1]]);
    assert.ok(GAIT_NOISE[GAIT_ORDER[i]] > GAIT_NOISE[GAIT_ORDER[i - 1]]);
  }
  // Deliberate footing keeps its old pace; exploration and pursuit are faster.
  assert.equal(GAIT_SPEED.crawl, 0.7);
  assert.ok(GAIT_SPEED.walk / 2.0 >= 1.3);
  assert.ok(GAIT_SPEED.jog / 2.6 > 1.3);
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
  assert.equal(applySpeedFactors(9, []), 7.5);
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

test('the live world uses faster floor paces and chase sprint without a legacy timing cap', () => {
  const hunting = { publicSnapshot: () => ({ active: true, x: 12, y: 10, behaviorMode: 'chase' }) };
  for (const exterior of [false, true]) {
    const world = locomotionSandbox({ isOutdoorZone: () => exterior });
    assert.equal(world.locomotion().speed, 2.6);
    assert.equal(world.interval(), 192);
    world.setRun(true);
    assert.equal(world.locomotion().speed, exterior ? 5.2 : 3.6);
    assert.equal(world.interval(), exterior ? 96 : 139);

    const chase = locomotionSandbox({ PRES: hunting, isOutdoorZone: () => exterior }, {
      extra: '\nglobalThis.windPlayer=()=>{playerBreath={reserve:0,winded:true,sprinting:false};};',
    });
    chase.setRun(true);
    assert.equal(chase.locomotion().gait, 'sprint');
    assert.equal(chase.locomotion().speed, 7.5);
    assert.equal(chase.interval(), 67);
    chase.windPlayer();
    assert.equal(chase.locomotion().gait, 'run');
    assert.equal(chase.locomotion().speed, 5.2);
    assert.equal(chase.interval(), 96);
  }
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

test('self-contained scenes use their actual place pair unless their pursuit opts into sprint', () => {
  for (const [place, slow, fast] of [
    ['tight', 'crawl', 'walk'], ['interior', 'walk', 'jog'],
    ['exterior', 'walk', 'run'], ['authored', 'walk', 'walk'],
  ]) {
    assert.equal(sceneWalkSpeed(place, false), GAIT_SPEED[slow]);
    assert.equal(sceneWalkSpeed(place, true), GAIT_SPEED[fast]);
  }
  assert.equal(SOURCE_IV.place, 'exterior');
  assert.equal(SOURCE_PUB.place, 'interior');
  assert.equal(SOURCE_CONTINUATION.place, 'interior');
  assert.equal(SOURCE_CONTINUATION.hush.speed, GAIT_SPEED.jog);
  assert.equal(SOURCE_CONTINUATION.hush.teachingSpeed, GAIT_SPEED.walk * .9);
  assert.equal(FIRST_STRIKE.clearanceSpeed, GAIT_SPEED.run);
  assert.ok(Math.abs(SOURCE_PUB.barrelSpeed / SOURCE_PUB.walkSpeed - 1.30 / 2.35) < 1e-12);
});

test('self-contained pursuits share sprint, winded fallback and tight-space restrictions', () => {
  for (const place of ['interior', 'exterior']) {
    assert.equal(sceneWalkSpeed(place, false, { chase: true }), GAIT_SPEED.walk);
    assert.equal(sceneWalkSpeed(place, true, { chase: true }), GAIT_SPEED.sprint);
    assert.equal(sceneWalkSpeed(place, true, { chase: true, winded: true }), GAIT_SPEED.run);
    assert.equal(sceneWalkSpeed(place, true, { winded: true }), sceneWalkSpeed(place, true));
  }
  assert.equal(sceneWalkSpeed('tight', true, { chase: true }), GAIT_SPEED.walk);
  assert.equal(sceneWalkSpeed('tight', false, { chase: true }), GAIT_SPEED.crawl);
  assert.equal(sceneWalkSpeed('authored', true, { chase: true }), GAIT_SPEED.walk);
});

test('scene Shift keys remain independent and release without changing the pad latch', () => {
  const key = createSceneRunKey();
  assert.equal(key.key({ key: 'w' }), false);
  assert.equal(key.active(), false);
  assert.equal(key.key({ key: 'Shift', code: 'ShiftLeft' }), true);
  assert.equal(key.key({ key: 'Shift', code: 'ShiftRight' }), true);
  key.keyup({ key: 'Shift', code: 'ShiftLeft' });
  assert.equal(key.active(), true);
  key.keyup({ key: 'Shift', code: 'ShiftRight' });
  assert.equal(key.active(), false);
  key.key({ controllerAction: 'run' });
  key.key({ key: 'Shift', code: 'ShiftLeft' });
  key.keyup({ key: 'Shift', code: 'ShiftLeft' });
  assert.equal(key.active(), true);
});

test('scene pad run toggles once, ignores repeats, rests, and clears on interruption', () => {
  const key = createSceneRunKey();
  key.key({ controllerAction: 'run' });
  key.key({ controllerAction: 'run', repeat: true });
  assert.equal(key.active(), true);
  assert.equal(key.update(2, true), true);
  assert.equal(key.update(.21, false), true);
  assert.equal(key.update(.02, false), false);
  key.key({ controllerAction: 'run' });
  key.key({ controllerAction: 'run' });
  assert.equal(key.active(), false);
  key.key({ controllerAction: 'run' });
  key.key({ key: 'Shift', code: 'ShiftLeft' });
  key.clear();
  assert.equal(key.active(), false);
  assert.equal(key.update(.1, true), false);
});

test('Source IV, pub and coast actually travel farther on their faster gait', () => {
  const iv = freshSourceIV({ runId: 'gait' });
  const ivWalk = stepSourceIV(iv, { dt: .25, forward: 1 }).state;
  const ivRun = stepSourceIV(iv, { dt: .25, forward: 1, run: true }).state;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(Math.abs(distance(iv, ivWalk) - GAIT_SPEED.walk * .25) < 1e-9);
  assert.ok(Math.abs(distance(iv, ivRun) - GAIT_SPEED.run * .25) < 1e-9);
  const pub = sourcePubEntry({ flags: { [SOURCE_PUB.unlockFlag]: true }, runId: 'gait', returnPose: { x: 1, y: 2 } });
  const pubWalk = stepSourcePub(pub, { dt: .25, side: 1 }).state;
  const pubRun = stepSourcePub(pub, { dt: .25, side: 1, run: true }).state;
  assert.ok(distance(pub, pubRun) > distance(pub, pubWalk));
  assert.ok(Math.abs(distance(pub, pubRun) / distance(pub, pubWalk) - GAIT_SPEED.jog / GAIT_SPEED.walk) < 1e-9);
  const pose = { ...COASTAL_MEMORY_LAYOUT.spawn };
  const coastWalk = walkCoastalMemoryPose(pose, { dt: .25, forward: 1 });
  const coastRun = walkCoastalMemoryPose(pose, { dt: .25, forward: 1, run: true });
  assert.ok(distance(pose, coastRun) > distance(pose, coastWalk));
});

test('first strike construction preserves its place when resuming', () => {
  const entry = { origin: { x: 0, y: 0, z: 0 }, place: 'exterior', walkCells: [], route: [] };
  const saved = packFirstStrikeConstruction(entry);
  assert.equal(saved.place, 'exterior');
  assert.equal(restoreFirstStrikeConstruction(entry, JSON.parse(JSON.stringify(saved))).place, 'exterior');
});

test('first strike actually uses the exterior or interior faster gait of its entry', () => {
  for (const [place, gait] of [['interior', 'jog'], ['exterior', 'run']]) {
    const entry = { origin: { x: 0, y: 0, z: 0 }, place,
      walkCells: [{ x: 0, z: 0, floor: 0, ceil: 20, cellSize: 40 }],
      route: [{ x: 0, z: 0 }, { x: 15, z: 0 }] };
    const result = stepFirstStrike(freshFirstStrike(entry), entry, { dt: .25, side: 1, run: true });
    assert.ok(Math.abs(result.state.x - GAIT_SPEED[gait] * .25) < 1e-9);
    assert.ok(Math.abs(result.travel - GAIT_SPEED[gait] * .25) < 1e-9);
  }
});

test('both continuation gaits cross the existing half-metre split on a real jump', () => {
  for (const run of [false, true]) {
    const fresh = resumeSourceContinuation(freshSourceContinuation({ runId: 'gait-jump' }));
    let state = { ...fresh, phase: 'wrong-return', x: 4.05, z: -12, feet: 8.4, yaw: Math.PI / 2,
      hush: { ...fresh.hush, active: false }, lastSafe: { x: 4.05, z: -12, feet: 8.4, phase: 'wrong-return' } };
    state = stepSourceContinuation(state, { jump: true, forward: 1, run }).state;
    assert.ok(state.fall);
    for (let i = 0; i < 240 && state.fall; i++) state = stepSourceContinuation(state, { dt: 1 / 120 }).state;
    assert.equal(state.fall, null);
    assert.ok(state.x > 5 && Math.abs(state.feet - 8.4) < 1e-8);
    assert.equal(state.recovery, null);
  }
});

test('walking can oppose the combined moving tide and gust in either Source', () => {
  for (const phase of ['wrong-return', 'catch']) {
    let strongest = 0;
    for (let t = 0; t <= 600; t += .5) {
      const field = sourceTideField({ phase, chartId: 0, x: 0, z: 0, elapsed: t }, { moving: true, time: t });
      strongest = Math.max(strongest, Math.hypot(field.x, field.z));
    }
    assert.ok(strongest < sceneWalkSpeed('interior', false), `${phase}: ${strongest}`);
  }
});
