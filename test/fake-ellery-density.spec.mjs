import test from 'node:test';
import assert from 'node:assert/strict';
import { freshSourceFalseReturn, normalizeSourceFalseReturn, stepSourceFalseReturn } from '../src/game/source-false-return.js';
import { freshSourceEarthfallElleryAside, normalizeSourceEarthfallElleryAside, stepSourceEarthfallElleryAside, sourceEarthfallElleryAsideFrame } from '../src/game/source-earthfall-ellery-aside.js';
import { fakeElleryHushActor } from '../src/render/fake-ellery-hush.js';
import { pressureInstances } from '../src/render/pressure-volume.js';

const copy = value => JSON.parse(JSON.stringify(value));
const fixture = { spawn: { x: 0, z: 0, feet: 4.8, yaw: 0, pitch: 0 },
  bounds: { minX: -12, maxX: 12, minZ: -12, maxZ: 12 }, doors: [], loops: [],
  supportAt: (x, z) => Math.abs(x) <= 12 && Math.abs(z) <= 12 ? { floor: 4.8, ceil: 8.4 } : null,
  canOccupy: () => true };
const tick = (state, input = {}) => stepSourceFalseReturn(state, { dt: 1 / 60, ...input }, fixture).state;
function falseReturn() {
  const state = freshSourceFalseReturn({ runId: 'density-trap', spawn: fixture.spawn });
  state.elapsed = 20; state.noiseTrap.phase = 'armed'; state.noiseTrap.armedUntil = 23;
  return tick(state, { playerNoise: true });
}
function quietAside() {
  const state = freshSourceEarthfallElleryAside({ runId: 'density-aside' });
  state.gag.complete = true; state.gag.elapsed = 20; state.gag.emitted = 31;
  state.chase.phase = 'quiet'; return normalizeSourceEarthfallElleryAside(state);
}

test('the accepted false-return sound starts a material event without treating spawn as travelled distance', () => {
  let state = falseReturn();
  assert.equal(state.localHush.density.phase, 0);
  assert.equal(state.localHush.density.event, 'notice');
  for (let n = 0; n < 30; n++) {
    const before = state.localHush;
    state = tick(state);
    const next = state.localHush;
    assert.ok(Math.hypot(next.x - before.x, next.z - before.z) <= 3.8 / 60 + 1e-8);
    assert.ok(next.density.phase - before.density.phase <= 2 / 60 + 1e-8);
  }
  assert.ok(state.localHush.density.phase > .5);
  assert.ok(state.localHush.density.residualDragMps > 2, 'brisk pursuit becomes bounded material drag, not a racing limb clock');
});

test('false-return density freezes under pause/protection and resumes identically after a JSON checkpoint', () => {
  let state = falseReturn(); for (let n = 0; n < 12; n++) state = tick(state);
  assert.deepEqual(tick(state, { paused: true }), state);
  assert.deepEqual(tick(state, { hushProtected: true }).localHush.density, state.localHush.density);
  let restored = normalizeSourceFalseReturn(copy(state), { spawn: fixture.spawn });
  for (let n = 0; n < 15; n++) { state = tick(state); restored = tick(restored); }
  assert.deepEqual(restored.localHush, state.localHush);
});

test('the shared fake-Ellery renderer consumes saved material phase, never its legacy elapsed clock', () => {
  const state = falseReturn();
  for (let n = 0; n < 8; n++) Object.assign(state, tick(state));
  const actor = fakeElleryHushActor(state.localHush), first = pressureInstances(actor)[0];
  const later = pressureInstances(fakeElleryHushActor({ ...state.localHush, elapsed: state.localHush.elapsed + 100 }))[0];
  assert.equal(first.mesh, 'hush_density_core');
  assert.equal(first.character.time, state.localHush.density.phase * 2.4);
  assert.deepEqual(later.character, first.character);
  assert.deepEqual(actor.performance.density, state.localHush.density);
});

test('Earthfall keeps accepted chase traction, bounded phase and checkpoint identity through the local render actor', () => {
  let state = stepSourceEarthfallElleryAside(quietAside(), { dt: 1 / 60, playerNoise: true }).state;
  assert.equal(state.chase.phase, 'chase'); assert.equal(state.hushDensity.phase, 0);
  for (let n = 0; n < 90; n++) {
    const phase = state.hushDensity.phase;
    state = stepSourceEarthfallElleryAside(state, { dt: 1 / 60 }).state;
    assert.ok(state.hushDensity.phase - phase <= 2 / 60 + 1e-8);
  }
  assert.ok(state.hushDensity.phase > .4);
  const frame = sourceEarthfallElleryAsideFrame(state), actor = fakeElleryHushActor(frame.localHush);
  assert.deepEqual(actor.performance.density, state.hushDensity);
  const restored = normalizeSourceEarthfallElleryAside(copy(state));
  assert.deepEqual(restored.hushDensity, state.hushDensity);
  assert.deepEqual(stepSourceEarthfallElleryAside(state, { dt: .1 }).state,
    stepSourceEarthfallElleryAside(restored, { dt: .1 }).state);
  assert.deepEqual(stepSourceEarthfallElleryAside(state, { dt: 1, paused: true }).state, state);
});

test('Ellery convergence can carry the body without manufacturing material locomotion', () => {
  const state = quietAside(); state.chase.phase = 'collapse'; state.chase.compression = 1;
  state.elapsed = 4.5; state.chase.collapseElapsed = 4.5; state.clock = 30;
  state.hushDensity.phase = .73; state.hushDensity.traction = .9;
  const before = sourceEarthfallElleryAsideFrame(state).localHush;
  const next = stepSourceEarthfallElleryAside(state, { dt: .1 }).state;
  const after = sourceEarthfallElleryAsideFrame(next).localHush;
  assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > .001);
  assert.equal(next.hushDensity.phase, .73, 'world deformation is not an accepted crawling step');
});
