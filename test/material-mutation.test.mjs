import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIAL } from '../src/data/floorplan/legend.js';
import {
  MUTATION_CROSSFADE_MAX_MS,
  MUTATION_CROSSFADE_MIN_MS,
  MUTATION_INTERVAL_MAX_MS,
  MUTATION_INTERVAL_MIN_MS,
  mutationCanStart,
  mutationCandidateIsSafe,
  mutationCandidateMetrics,
  mutationGeneration,
  mutationTiming,
  visibleSurfaceSlots,
} from '../src/net/material-mutation.js';

test('visible material mapping follows the renderer surface slots and excludes source space', () => {
  assert.deepEqual(visibleSurfaceSlots([MATERIAL.woodVelvet]), [3, 7]);
  assert.deepEqual(visibleSurfaceSlots([MATERIAL.wetTile, MATERIAL.poolTile]), [4, 5]);
  assert.deepEqual(visibleSurfaceSlots([MATERIAL.acousticFoam, MATERIAL.practiceFoam]), [6, 9, 8]);
  assert.deepEqual(visibleSurfaceSlots([MATERIAL.sourceField, MATERIAL.sourceFault]), []);
});

test('mutation timing stays inside the authored five-to-fifteen and six-to-twelve second windows', () => {
  for (const [fps, rtt, random] of [[60, 100, 0], [60, 100, 1], [58, 1500, 0.5], [30, 5000, 1]]) {
    const timing = mutationTiming({ fps, lastRttMs: rtt, random: () => random });
    assert.ok(timing.intervalMs >= MUTATION_INTERVAL_MIN_MS && timing.intervalMs <= MUTATION_INTERVAL_MAX_MS);
    assert.ok(timing.transitionMs >= MUTATION_CROSSFADE_MIN_MS && timing.transitionMs <= MUTATION_CROSSFADE_MAX_MS);
  }
  assert.ok(mutationTiming({ fps: 58, lastRttMs: 1500, random: () => 0 }).intervalMs
    > mutationTiming({ fps: 60, lastRttMs: 100, random: () => 0 }).intervalMs);
});

test('mutation requires a resident bank, visible material, stable renderer, and measured 58fps headroom', () => {
  const ready = { allowed: true, resident: true, activeBank: 'explore', fps: 60, samples: 60, visibleSlots: [2] };
  assert.equal(mutationCanStart(ready), true);
  assert.equal(mutationCanStart({ ...ready, fps: 57.9 }), false);
  assert.equal(mutationCanStart({ ...ready, samples: 59 }), false);
  assert.equal(mutationCanStart({ ...ready, activeWork: true }), false);
  assert.equal(mutationCanStart({ ...ready, transitioning: true }), false);
  assert.equal(mutationCanStart({ ...ready, visibleSlots: [] }), false);
});

test('runtime recipe is one-pass, low-strength, anchored, and changes seed each generation', () => {
  const profile = { generation: { strength: 0.64, guidance: 2.8, mix: 0.90, seedBase: 61_000, prompt: 'rupture', negative: 'clean' } };
  const first = mutationGeneration(profile, 5, 1);
  const second = mutationGeneration(profile, 5, 2);
  assert.equal(first.passes, 1);
  assert.equal(first.strength, 0.32);
  assert.equal(first.feedback, 0.18);
  assert.equal(first.mix, 0.90);
  assert.notEqual(first.seed, second.seed);
});

function pixels(width, height, value) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value; data[i + 1] = value; data[i + 2] = value; data[i + 3] = 255;
  }
  return data;
}

test('candidate admission accepts restrained drift and rejects black or broken-seam outputs', () => {
  const width = 8, height = 8;
  const previous = pixels(width, height, 100);
  const restrained = pixels(width, height, 114);
  assert.equal(mutationCandidateIsSafe(mutationCandidateMetrics(previous, restrained, width, height)), true);

  const black = pixels(width, height, 0);
  assert.equal(mutationCandidateIsSafe(mutationCandidateMetrics(previous, black, width, height)), false);

  const seam = pixels(width, height, 100);
  for (let y = 0; y < height; y += 1) {
    const left = (y * width) * 4;
    const right = (y * width + width - 1) * 4;
    seam[left] = 0; seam[left + 1] = 0; seam[left + 2] = 0;
    seam[right] = 255; seam[right + 1] = 255; seam[right + 2] = 255;
  }
  assert.equal(mutationCandidateIsSafe(mutationCandidateMetrics(previous, seam, width, height)), false);
});
