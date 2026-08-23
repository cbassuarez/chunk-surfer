import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSelfAudioMask,
  dbForRms,
  effectiveMicMeasurement,
  rmsForDb,
  spectrumSimilarity,
} from '../src/audio/self-audio-mask.js';

test('self-audio mask converts between dB and bounded RMS', () => {
  assert.equal(rmsForDb(-Infinity), 0);
  assert.ok(rmsForDb(-24) > 0);
  assert.equal(rmsForDb(12), 1);
  assert.equal(dbForRms(0), -96);
});

test('known game output suppresses matching raw mic bleed', () => {
  const mask = createSelfAudioMask({ latencyMs: 0, maskGain: 1.35 });
  mask.observe({
    emittedAt: 1000,
    kind: 'take_hiss',
    source: { kind: 'system', id: 'take-hiss' },
    acoustic: { levelDb: -24, durationMs: 1000 },
    semantics: { audibleInWorld: true, canSpoilTake: false },
    provenance: { system: 'test' },
  }, 1000);

  const sample = mask.sample(1100);
  const effective = effectiveMicMeasurement({ rms: sample.rms * 0.8, peak: sample.rms }, sample);

  assert.ok(sample.active);
  assert.ok(effective.effective.rms < 0.01);
  assert.equal(effective.gameEchoLikely, true);
});

test('player voice above the mask survives suppression', () => {
  const mask = createSelfAudioMask({ latencyMs: 0, maskGain: 1.35 });
  mask.observe({
    emittedAt: 1000,
    kind: 'room-tone',
    source: { kind: 'environment', id: 'room' },
    acoustic: { levelDb: -28, durationMs: 1000 },
    semantics: { audibleInWorld: true, canSpoilTake: false },
  }, 1000);

  const sample = mask.sample(1100);
  const effective = effectiveMicMeasurement({ rms: Math.max(0.18, sample.rms * 3), peak: 0.22 }, sample);

  assert.ok(effective.effective.rms > 0.06);
  assert.equal(effective.playerNoiseLikely, true);
});

test('room mic does not mask itself', () => {
  const mask = createSelfAudioMask({ latencyMs: 0 });
  const ok = mask.observe({
    emittedAt: 1000,
    kind: 'operator_voice_activity',
    source: { kind: 'player', id: 'room-mic' },
    acoustic: { levelDb: -18, durationMs: 500 },
    semantics: { audibleInWorld: true },
    provenance: { system: 'room-mic' },
  }, 1000);

  assert.equal(ok, false);
  assert.equal(mask.sample(1100).active, false);
});

test('actual final-output spectrum suppresses continuous laptop-speaker echo', () => {
  const mask = createSelfAudioMask({ latencyMs: 0, programLeakGain: .5 });
  const programSpectrum = [.9, .72, .46, .24, .12, .06, .03, .01];
  const sample = mask.sample(1000, { program: {
    active: true,
    rms: .12,
    peak: .20,
    spectrum: programSpectrum,
  } });
  const effective = effectiveMicMeasurement({
    rms: .085,
    peak: .13,
    spectrum: programSpectrum.map((value) => value * .24),
  }, sample);

  assert.ok(spectrumSimilarity(programSpectrum, effective.raw.spectrum) > .95);
  assert.equal(effective.mask.programCorrelated, true);
  assert.equal(effective.gameEchoLikely, true);
  assert.ok(effective.effective.rms < .01, 'speaker return cannot reach the take-spoil threshold');
});

test('a spectrally distinct player voice survives simultaneous program audio', () => {
  const mask = createSelfAudioMask({ latencyMs: 0, programLeakGain: .5 });
  const sample = mask.sample(1000, { program: {
    active: true,
    rms: .12,
    peak: .20,
    spectrum: [.9, .72, .46, .24, .12, .06, .03, .01],
  } });
  const effective = effectiveMicMeasurement({
    rms: .09,
    peak: .16,
    spectrum: [.01, .03, .08, .28, .75, .92, .42, .12],
  }, sample);

  assert.equal(effective.mask.programCorrelated, false);
  assert.equal(effective.playerNoiseLikely, true);
  assert.ok(effective.effective.rms >= .085, 'unmatched live speech must not be cancelled with the speakers');
});
