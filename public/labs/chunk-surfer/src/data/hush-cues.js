// Fair, non-recursive HUSH mischief. These definitions never impersonate save,
// objective, achievement, or menu feedback.

export const HUSH_MISCHIEF_CUES = Object.freeze([
  Object.freeze({
    id: 'mischief.monitor-return', family: 'monitor-injection', delivery: 'monitor', sourcePolicy: 'monitor-nonspatial',
    requirements: { minInterest: .28, maxAgitation: .84, minCertainty: .10 },
    selection: { baseWeight: 1.15, repeatPenalty: .62, familyCooldownMs: 17000, cueCooldownMs: 42000, maxPerRun: 4 },
    audio: { sound: 'hush-fragment', gain: .22, pitchRange: [.70, .94] },
    caption: { text: 'A VOICE BREAKS INSIDE THE MONITOR', spatial: false },
    gameplay: { emittedAsWorldNoise: false, maySpoilTake: false, mayCreateMapContact: true },
  }),
  Object.freeze({
    id: 'mischief.instrument-single', family: 'instrument', delivery: 'world', sourcePolicy: 'adjacent-bearing',
    requirements: { minInterest: .34, maxAgitation: .72, minCertainty: .18 },
    selection: { baseWeight: 1, repeatPenalty: .70, familyCooldownMs: 22000, cueCooldownMs: 52000, maxPerRun: 3 },
    audio: { sound: 'instrument', gain: .20, pitchRange: [.82, 1.04] },
    caption: { text: 'A SINGLE NOTE SOUNDS', spatial: true },
    gameplay: { emittedAsWorldNoise: false, maySpoilTake: false, mayCreateMapContact: true },
  }),
  Object.freeze({
    id: 'mischief.transport-echo', family: 'equipment-imitation', delivery: 'world', sourcePolicy: 'behind-player',
    requirements: { minInterest: .30, maxAgitation: .76, minCertainty: .16 },
    selection: { baseWeight: .92, repeatPenalty: .66, familyCooldownMs: 19000, cueCooldownMs: 48000, maxPerRun: 3 },
    audio: { sound: 'equipment', gain: .18, pitchRange: [.78, .96] },
    caption: { text: 'A RECORDER CLICKS', spatial: true },
    gameplay: { emittedAsWorldNoise: false, maySpoilTake: false, mayCreateMapContact: false },
  }),
  Object.freeze({
    id: 'mischief.negative-drop', family: 'negative', delivery: 'monitor', sourcePolicy: 'monitor-nonspatial',
    requirements: { minInterest: .42, maxAgitation: .88, minCertainty: .28 },
    selection: { baseWeight: .62, repeatPenalty: .50, familyCooldownMs: 30000, cueCooldownMs: 70000, maxPerRun: 2 },
    audio: { sound: 'negative', gain: .16, pitchRange: [1, 1] },
    caption: { text: 'THE ROOM LOSES ITS RETURN', spatial: false },
    gameplay: { emittedAsWorldNoise: false, maySpoilTake: false, mayCreateMapContact: true },
  }),
]);
