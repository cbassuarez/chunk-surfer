import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  APPARITION_POSE_IDS,
  createApparitionDirector,
} from '../src/game/apparition-director.js';
import {
  APPARITION_POSE_MESH,
  buildEmergencyShadowFrame,
  meshForApparitionPose,
} from '../src/game/emergency-light-runtime.js';
import { PROP_BOUNDS } from '../src/data/generated/prop-geometry.js';

const input = (pulseIndex, effectsMode = 'full', timeSec = pulseIndex * 2.422) => ({
  stageKey: 'hall:stage-door',
  pulseIndex,
  timeSec,
  effectsMode,
  wanderClock: timeSec,
});

// PHASE D — semantic identity, generated geometry and a legacy-safe boundary.
assert.deepEqual(Object.keys(APPARITION_POSE_MESH).sort(), [...APPARITION_POSE_IDS].sort());
assert.equal(meshForApparitionPose('missing-pose'), 'player_shadow_figure');
assert.ok(PROP_BOUNDS.player_shadow_figure, 'the shared HUSH/player-shadow mesh remains in the generated pack');
for (const poseId of APPARITION_POSE_IDS) {
  const mesh = APPARITION_POSE_MESH[poseId];
  const bounds = PROP_BOUNDS[mesh];
  assert.ok(bounds, `${poseId} resolves to generated mesh ${mesh}`);
  assert.ok([...bounds.min, ...bounds.max].every(Number.isFinite), `${poseId} has finite generated bounds`);
  const width = bounds.max[0] - bounds.min[0];
  const height = bounds.max[1] - bounds.min[1];
  const depth = bounds.max[2] - bounds.min[2];
  assert.ok(bounds.min[1] >= -.05 && bounds.min[1] <= .06, `${poseId} shares the floor/foot pivot`);
  assert.ok(height >= 1.55 && height <= 1.82, `${poseId} remains ordinary adult height (${height.toFixed(2)}m)`);
  assert.ok(width >= .25 && width <= 1.25, `${poseId} remains human-width (${width.toFixed(2)}m)`);
  assert.ok(depth >= .15 && depth <= .62, `${poseId} remains human-depth (${depth.toFixed(2)}m)`);
}

const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(mainSource, /id:'hush-player-shadow',mesh:'player_shadow_figure'/,
  'the HUSH/player-shadow path still resolves the unchanged shared mesh');

const a = createApparitionDirector({ seed: 'phase-d-determinism' });
const b = createApparitionDirector({ seed: 'phase-d-determinism' });
const firstA = a.resolve(input(0));
const firstB = b.resolve(input(0));
assert.deepEqual(firstA.poseIds, firstB.poseIds, 'initial semantic pose assignment is deterministic');
assert.equal(firstA.poseIds.length, 3);
assert.ok(firstA.poseIds.every((poseId) => APPARITION_POSE_IDS.includes(poseId)));
assert.equal(new Set(firstA.poseIds).size, 3, 'the first crowd does not repeat one pose three times');
const escaped = firstA.poseIds;
escaped[0] = 'mutated-outside';
assert.notEqual(a.inspect('hall:stage-door').poseIds[0], 'mutated-outside', 'snapshots do not expose mutable pose state');

const substitution = createApparitionDirector({ seed: 'phase-d-substitution' });
const before = substitution.resolve(input(0));
assert.equal(substitution.forceNext({ card: 'substitution', index: 1 }), true);
const changed = substitution.resolve(input(1));
assert.equal(changed.card?.kind, 'substitution');
assert.equal(changed.card?.index, 1);
assert.equal(changed.hiddenIndex, null, 'substitution never becomes absence');
assert.deepEqual(changed.motionClocks, [input(1).wanderClock, input(1).wanderClock, input(1).wanderClock],
  'substitution does not alter motion clocks');
const changedEntries = changed.poseIds.filter((poseId, index) => poseId !== before.poseIds[index]);
assert.equal(changedEntries.length, 1, 'substitution changes exactly one semantic pose');
assert.notEqual(changed.poseIds[1], before.poseIds[1]);
const after = substitution.resolve(input(2));
assert.equal(after.card, null, 'substitution metadata lasts one illuminated beat');
assert.deepEqual(after.poseIds, changed.poseIds, 'the substituted pose persists after card metadata expires');

const reduced = createApparitionDirector({ seed: 'phase-d-reduced' });
reduced.resolve(input(0, 'reduced', 0));
reduced.forceNext({ card: 'substitution', index: 2 });
for (let timeSec = .25; timeSec <= 40; timeSec += .25) {
  const frame = reduced.resolve(input(Math.floor(timeSec / 2.422), 'reduced', timeSec));
  assert.notEqual(frame.card?.kind, 'substitution', 'Reduced never performs substitution');
}

const fallbackFrame = buildEmergencyShadowFrame(
  [{ id: 'pose-fallback', x: 4, y: 2, z: 1, floorY: 0, intensity: .5, shadowReveal: 1, pulseIndex: 1 }],
  {
    listener: { x: 0, z: 1 },
    director: { resolve: () => ({
      hiddenIndex: null,
      poseIds: ['invalid', null, 'neutral'],
      yawOffsets: [0, 0, 0],
      motionClocks: [0, 0, 0],
      hardRevealIndex: null,
    }) },
  },
);
assert.equal(fallbackFrame.instances.length, 3);
assert.equal(fallbackFrame.instances[0].mesh, 'player_shadow_figure');
assert.equal(fallbackFrame.instances[1].mesh, 'player_shadow_figure');
assert.equal(fallbackFrame.instances[2].mesh, APPARITION_POSE_MESH.neutral);

console.log('apparition director and pose contracts passed');
