import test from 'node:test';
import assert from 'node:assert/strict';
import { LOOK_PROFILES, LOOK_PROFILE_IDS, getLookProfile, validateLookProfile } from '../src/render/look-profiles.js';

const TARGETS = {
  calm: [0.90, 90, 600],
  explore: [0.78, 220, 600],
  booth: [0.72, 320, 350],
  battle: [0.60, 480, 160],
  hush: [0.68, 700, 900],
  rupture: [0.55, 900, 120],
};

test('look profile contract contains only the six fixed authored profiles', () => {
  assert.deepEqual(LOOK_PROFILE_IDS, ['calm', 'explore', 'booth', 'battle', 'hush', 'rupture']);
  assert.equal(getLookProfile('legacy-garbage'), LOOK_PROFILES.explore);
});

test('profile validation rejects incomplete and out-of-range contracts', () => {
  assert.equal(validateLookProfile(LOOK_PROFILES.explore), true);
  assert.equal(validateLookProfile({ ...LOOK_PROFILES.explore, bankId: 'wrong' }), false);
  assert.equal(validateLookProfile({ ...LOOK_PROFILES.explore, vfd: { ...LOOK_PROFILES.explore.vfd, coverage: 1 } }), false);
  assert.equal(validateLookProfile({ ...LOOK_PROFILES.explore, recording: null }), false);
  assert.equal(validateLookProfile(null), false);
});

test('profile retention, persistence, and transition targets are exact', () => {
  for (const [id, [retention, persistence, transition]] of Object.entries(TARGETS)) {
    const profile = LOOK_PROFILES[id];
    assert.equal(profile.vfd.baseRetention, retention, id);
    assert.equal(profile.vfd.persistenceMs, persistence, id);
    assert.equal(profile.transitionMs, transition, id);
    assert.ok(Object.isFrozen(profile));
  }
});

test('coverage ceilings preserve legibility in exploration and permit dramatic states', () => {
  assert.ok(LOOK_PROFILES.calm.vfd.coverage <= 0.20);
  assert.ok(LOOK_PROFILES.explore.vfd.coverage <= 0.40);
  assert.ok(LOOK_PROFILES.battle.vfd.coverage <= 0.75);
  assert.ok(LOOK_PROFILES.rupture.vfd.coverage <= 0.75);
});

test('fine recording acquisition replaces the dominant 8-bit block treatment', () => {
  assert.ok(LOOK_PROFILES.calm.vfd.cellPx <= 2);
  assert.ok(LOOK_PROFILES.explore.vfd.cellPx <= 2);
  assert.ok(LOOK_PROFILES.rupture.vfd.cellPx <= 3);
  assert.ok(LOOK_PROFILES.explore.vfd.paletteAmount <= 0.16);
  assert.ok(LOOK_PROFILES.rupture.vfd.paletteAmount <= 0.25);
  assert.ok(LOOK_PROFILES.explore.recording.postGrain > LOOK_PROFILES.calm.recording.postGrain);
  assert.ok(LOOK_PROFILES.rupture.recording.thresholdNoise > LOOK_PROFILES.battle.recording.thresholdNoise);
});

test('each profile owns generation, material, VFD, recording, glass, and bank identity', () => {
  for (const id of LOOK_PROFILE_IDS) {
    const profile = LOOK_PROFILES[id];
    assert.equal(profile.bankId, id);
    assert.equal(profile.generation.seedBase % 1000, 0);
    assert.ok(profile.material.detailGain > 0);
    assert.ok(profile.vfd.baseRetention >= 0.55);
    assert.equal(profile.recording.captureMix, 1);
    assert.ok(profile.recording.postGrain >= 0);
    assert.ok(profile.glass.strength >= 0);
    assert.ok(Object.isFrozen(profile.recording));
  }
});

test('recording profile validation rejects every unsafe boundary', () => {
  const mutate = (patch) => ({
    ...LOOK_PROFILES.explore,
    recording: { ...LOOK_PROFILES.explore.recording, ...patch },
  });
  for (const patch of [
    { captureMix: -0.001 }, { captureMix: 1.001 },
    { thresholdNoise: -0.001 }, { thresholdNoise: 0.201 },
    { thresholdIrregularity: -0.001 }, { thresholdIrregularity: 1.001 },
    { postGrain: -0.001 }, { postGrain: 0.081 },
    { lumaGrain: -0.001 }, { lumaGrain: 1.001 },
    { temporalHz: -0.001 }, { temporalHz: 24.001 },
    { temporalSmear: -0.001 }, { temporalSmear: 1.001 },
    { scenePinning: -0.001 }, { scenePinning: 1.001 },
    { fearGain: -0.001 }, { fearGain: 1.501 },
    { audioGain: -0.001 }, { audioGain: 1.501 },
  ]) {
    assert.equal(validateLookProfile(mutate(patch)), false, JSON.stringify(patch));
  }
});
