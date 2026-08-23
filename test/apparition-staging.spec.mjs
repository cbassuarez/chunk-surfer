import assert from 'node:assert/strict';

import {
  APPARITION_COMPOSITIONS,
  resolveApparitionComposition,
  validApparitionComposition,
} from '../src/data/apparition-staging.js';
import { allAuthoredLights } from '../src/data/conservatory-lights.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { buildEmergencyShadowFrame } from '../src/game/emergency-light-runtime.js';

const authoredLightIds = new Set(allAuthoredLights().map((light) => light.id));
assert.equal(APPARITION_COMPOSITIONS.length, 5);
for (const profile of APPARITION_COMPOSITIONS) {
  assert.equal(validApparitionComposition(profile), true, `${profile.id} is structurally valid`);
  for (const lightId of profile.lightIds) assert.ok(authoredLightIds.has(lightId), `${profile.id} light ${lightId} exists`);
}

const representatives = [
  ['hall-entrance-maintained-north', ZONE.foyer, 'ground', 'foyer-threshold-group'],
  ['hall-stage-door-maintained', ZONE.hall, 'hall', 'hall-aisle-breadth'],
  ['natatorium-emergency-west', ZONE.natatorium, 'ground', 'natatorium-pool-edge'],
  ['academic-emergency-west', ZONE.academic, 'academic', 'academic-corridor-termination'],
  ['ringing-pendant', ZONE.bellTower, 'tower', 'tower-landing-severe'],
];
for (const [lightId, zone, group, expected] of representatives) {
  assert.equal(resolveApparitionComposition({ lightId, zone, group })?.id, expected);
}
assert.equal(resolveApparitionComposition({ lightId: 'missing', zone: ZONE.hall, group: 'hall' }), null);

const malformed = { id: 'bad', stageYaw: NaN, nearScale: 50, farScale: 1, stations: [] };
assert.equal(validApparitionComposition(malformed), false);
const baseLight = { id: 'unprofiled', x: 0, y: 2.4, z: 0, floorY: 0, intensity: .6, shadowReveal: 1, pulseIndex: 2 };
const baseOptions = { listener: { x: -7, z: 0 }, viewYaw: Math.PI / 2, timeSec: 4 };
const procedural = buildEmergencyShadowFrame([baseLight], baseOptions);
const badResolver = buildEmergencyShadowFrame([baseLight], { ...baseOptions, compositionResolver: () => malformed });
assert.equal(badResolver.composition.source, 'procedural');
assert.deepEqual(badResolver.instances, procedural.instances, 'malformed staging falls back to the old procedural formation');

// Authored world staging is stable under the camera. The director receives the
// same coordinate-free stage key in every call; only runtime knows these yaws.
for (const [lightId, zone, group, compositionId] of representatives) {
  const light = { ...baseLight, id: lightId, zone };
  const frames = [0, .3, 1.2, 2.8].map((viewYaw) => buildEmergencyShadowFrame([light], {
    ...baseOptions,
    viewYaw,
    renderGroup: group,
  }));
  assert.ok(frames.every((frame) => frame.composition.id === compositionId));
  assert.ok(frames.every((frame) => frame.instances.length <= 3));
  assert.deepEqual(
    frames[0].instances.map(({ x, z }) => [x, z]),
    frames[3].instances.map(({ x, z }) => [x, z]),
    `${compositionId} remains world-authored instead of camera-following`,
  );
}

// Dense safety proof over every authored personality. A profile may alter yaw,
// depth and amplitude, but runtime's radial cap still owns the 2.2m guarantee.
for (const [lightId, zone, group] of representatives) {
  const light = { ...baseLight, id: lightId, zone };
  for (const distance of [.1, .8, 1.6, 2.3, 3.5, 5, 8, 12]) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const listener = { x: Math.sin(angle) * distance, z: -Math.cos(angle) * distance };
      for (let viewYaw = 0; viewYaw < Math.PI * 2; viewYaw += Math.PI / 4) {
        const frame = buildEmergencyShadowFrame([light], { listener, viewYaw, renderGroup: group, timeSec: 9 });
        assert.ok(frame.instances.length <= 3);
        for (const instance of frame.instances) {
          assert.ok(Math.hypot(instance.x - listener.x, instance.z - listener.z) >= 2.2 - 1e-9,
            `${frame.composition.id} preserves the minimum player distance`);
        }
      }
    }
  }
}

const directive = (overrides = {}) => ({
  hiddenIndex: null,
  poseIds: ['neutral', 'side', 'weight_shift'],
  yawOffsets: [0, 0, 0],
  motionClocks: [8, 8, 8],
  hardRevealIndex: null,
  ...overrides,
});
const hallLight = { ...baseLight, id: 'hall-stage-door-maintained', zone: ZONE.hall };
const all = buildEmergencyShadowFrame([hallLight], { ...baseOptions, renderGroup: 'hall', director: { resolve: () => directive() } });
const absent = buildEmergencyShadowFrame([hallLight], { ...baseOptions, renderGroup: 'hall', director: { resolve: () => directive({ hiddenIndex: 1 }) } });
assert.deepEqual(
  absent.instances.map(({ apparitionIndex, x, z }) => [apparitionIndex, x, z]),
  all.instances.filter(({ apparitionIndex }) => apparitionIndex !== 1).map(({ apparitionIndex, x, z }) => [apparitionIndex, x, z]),
  'absence preserves authored station identity',
);
const substituted = buildEmergencyShadowFrame([hallLight], {
  ...baseOptions,
  renderGroup: 'hall',
  director: { resolve: () => directive({ poseIds: ['neutral', 'head_turn', 'weight_shift'] }) },
});
assert.deepEqual(
  substituted.instances.map(({ apparitionIndex, x, z }) => [apparitionIndex, x, z]),
  all.instances.map(({ apparitionIndex, x, z }) => [apparitionIndex, x, z]),
  'substitution changes a pose, never an authored station',
);
const still = buildEmergencyShadowFrame([hallLight], {
  ...baseOptions,
  timeSec: 40,
  renderGroup: 'hall',
  director: { resolve: () => directive({ motionClocks: [40, 8, 40] }) },
});
assert.deepEqual(
  [still.instances[1].x, still.instances[1].z],
  [all.instances[1].x, all.instances[1].z],
  'stillness freezes only its selected authored station motion',
);

assert.equal(buildEmergencyShadowFrame([hallLight], { ...baseOptions, renderGroup: 'hall', effectsMode: 'off' }), null);
assert.equal(buildEmergencyShadowFrame([hallLight], { ...baseOptions, renderGroup: 'hall', enabled: false }), null);

console.log('apparition staging contracts passed');
