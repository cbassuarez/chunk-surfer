// HUSH hearing and sensory-output policy. This follows the run's gameplay
// pressure axis, not audio/accessibility settings.

export const HUSH_AUDIO_POLICIES = Object.freeze({
  reduced: Object.freeze({
    id: 'reduced', hearingThresholdDb: -31, interestGain: .65, certaintyGain: .70,
    agitationGain: .52, interestHalfLife: 11, certaintyHalfLife: 7,
    agitationHalfLife: 9, baselinePlayfulness: .42, playfulnessRecovery: .10,
    investigationDelayMs: 1200, mischiefFrequency: .72, fieldScale: .82,
    fullAbsorptionMaxMs: 850,
  }),
  standard: Object.freeze({
    id: 'standard', hearingThresholdDb: -38, interestGain: 1, certaintyGain: 1,
    agitationGain: 1, interestHalfLife: 18, certaintyHalfLife: 12,
    agitationHalfLife: 16, baselinePlayfulness: .48, playfulnessRecovery: .08,
    investigationDelayMs: 650, mischiefFrequency: 1, fieldScale: 1,
    fullAbsorptionMaxMs: 1300,
  }),
  severe: Object.freeze({
    id: 'severe', hearingThresholdDb: -43, interestGain: 1.12, certaintyGain: 1.08,
    agitationGain: 1.10, interestHalfLife: 24, certaintyHalfLife: 17,
    agitationHalfLife: 21, baselinePlayfulness: .52, playfulnessRecovery: .07,
    investigationDelayMs: 380, mischiefFrequency: 1.08, fieldScale: 1.08,
    fullAbsorptionMaxMs: 1500,
  }),
  'dead-air': Object.freeze({
    id: 'dead-air', hearingThresholdDb: -47, interestGain: 1.18, certaintyGain: 1.14,
    agitationGain: 1.18, interestHalfLife: 30, certaintyHalfLife: 21,
    agitationHalfLife: 25, baselinePlayfulness: .55, playfulnessRecovery: .06,
    investigationDelayMs: 240, mischiefFrequency: 1.15, fieldScale: 1.14,
    fullAbsorptionMaxMs: 1700,
  }),
});

export function hushAudioPolicyForDifficulty(difficulty) {
  const key = difficulty?.values?.presencePressure || difficulty?.id || 'standard';
  if (key === 'story') return HUSH_AUDIO_POLICIES.reduced;
  if (key === 'night') return HUSH_AUDIO_POLICIES.severe;
  if (key === 'contract') return HUSH_AUDIO_POLICIES.standard;
  return HUSH_AUDIO_POLICIES[key] || HUSH_AUDIO_POLICIES.standard;
}
