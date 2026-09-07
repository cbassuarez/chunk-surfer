import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ENDING_APPROACH_STAGES,
  createEndingApproachState,
  advanceEndingApproach,
  endingApproachSnapshot,
  endingApproachDebris,
} from '../src/game/ending-approach.js';

test('route progress survives backtracking and late callbacks without skipping final action', () => {
  let state = createEndingApproachState('inversion');
  state = advanceEndingApproach(state, { progress: .8, dtMs: 400 });
  state = advanceEndingApproach(state, { stage: 'rescue', progress: .2, dtMs: 400 });
  const reached = state.progress;
  state = advanceEndingApproach(state, { stage: 'door', progress: 1, dtMs: 500 });
  assert.equal(state.stage, 'rescue');
  assert.equal(state.progress, reached);
  state = advanceEndingApproach(state, { progress: .1, dtMs: 500 });
  assert.equal(state.progress, reached);
  state = advanceEndingApproach(state, { progress: 1, dtMs: 60000 });
  assert.equal(state.progress, 1);
  assert.equal(state.complete, false, 'only a real objective completion commits the approach');
});

test('paused time, unknown stage, and malformed progress cannot advance a leg', () => {
  let state = createEndingApproachState('surfaced');
  state = advanceEndingApproach(state, { progress: .3, dtMs: 700 });
  const paused = advanceEndingApproach(state, { paused: true, dtMs: 9000 });
  assert.equal(paused.elapsedMs, state.elapsedMs);
  assert.equal(paused.stageElapsedMs, state.stageElapsedMs);
  const unknown = advanceEndingApproach(paused, { stage: 'not-an-objective', progress: 1, dtMs: NaN });
  assert.equal(unknown.progress, state.progress);
  assert.equal(unknown.elapsedMs, state.elapsedMs);
  assert.equal(createEndingApproachState('not-an-ending'), null);
  assert.equal(createEndingApproachState('surfaced', { stage: 'not-a-stage' }), null);
});

test('every route has bounded physical direction and no audio or ending label output', () => {
  assert.equal(Object.keys(ENDING_APPROACH_STAGES).length, 9);
  for (const [id, stages] of Object.entries(ENDING_APPROACH_STAGES)) {
    let state = createEndingApproachState(id);
    for (const stage of stages) {
      state = advanceEndingApproach(state, { stage, progress: .8, dtMs: 1600 });
      const snapshot = endingApproachSnapshot(state);
      assert.ok(snapshot.active, id);
      if (id === 'tower-won' && stage === 'grip') {
        assert.equal(snapshot.world.payloadWeight, 0, 'the ungripped body stays on the floor');
      } else assert.ok(Object.values(snapshot.world).some((value) => value > 0), id);
      assert.ok(Object.values(snapshot.world).every((value) => value >= 0 && value <= 1), id);
      assert.ok(Math.abs(snapshot.camera.eyeDropM) <= .17, id);
      assert.equal('audio' in snapshot, false);
      assert.equal('title' in snapshot, false);
      assert.equal('label' in snapshot, false);
    }
  }
});

test('payload weight eases only when the carried body reaches the exterior leg', () => {
  let state = createEndingApproachState('tower-won');
  state = advanceEndingApproach(state, { progress: 0, dtMs: 1000 });
  assert.equal(endingApproachSnapshot(state).world.payloadWeight, 0, 'ungripped body stays on the floor');
  state = advanceEndingApproach(state, { stage: 'drag', progress: .5, dtMs: 1000 });
  const underLoad = endingApproachSnapshot(state);
  assert.equal(underLoad.world.payloadWeight, 1);
  assert.equal(underLoad.world.daylight, 0);
  state = advanceEndingApproach(state, { stage: 'outside', progress: 1 });
  const outside = endingApproachSnapshot(state);
  assert.ok(outside.world.payloadWeight < underLoad.world.payloadWeight);
  assert.equal(outside.world.daylight, 1);
  assert.ok(outside.camera.eyeDropM < underLoad.camera.eyeDropM);
});

test('containment and inversion propagate from opposite ends with stable bounded geometry', () => {
  const at = (id) => endingApproachSnapshot(advanceEndingApproach(
    createEndingApproachState(id), { progress: .25, dtMs: 1000 },
  ));
  const seal = endingApproachDebris(at('sacrifice'));
  // Inversion's first leg is weighted, so compare the same physical fraction.
  const reverse = endingApproachDebris({ world: { reverseCollapse: at('sacrifice').world.containment } });
  assert.ok(seal.length > 0 && seal.length <= 16);
  assert.ok(reverse.length > 0 && reverse.length <= 16);
  assert.ok(seal[0].forwardM < reverse[0].forwardM);
  assert.equal(new Set(seal.map(({ id }) => id)).size, seal.length);
  assert.ok(seal.every(({ sideM }) => Math.abs(sideM) >= 1.2), 'debris leaves the walking corridor clear');
  const all = endingApproachDebris({ world: { containment: 1 } });
  assert.equal(all.length, 16);
  assert.ok(all.every(({ elevationM }) => elevationM === 0));
});

test('reduced motion retains the same physical outcome with a stable viewpoint', () => {
  let state = createEndingApproachState('surfaced');
  state = advanceEndingApproach(state, { stage: 'service-road', progress: .5, dtMs: 2000 });
  const full = endingApproachSnapshot(state);
  const reduced = endingApproachSnapshot(state, { reducedMotion: true });
  assert.deepEqual(reduced.world, full.world);
  assert.deepEqual(reduced.camera, { eyeDropM: 0, pitchOffset: 0, rollOffset: 0 });
  const debris = endingApproachDebris({ world: { containment: .3 } }, { reducedMotion: true });
  assert.ok(debris.length > 0);
  assert.ok(debris.every(({ elevationM }) => elevationM === 0));
});
