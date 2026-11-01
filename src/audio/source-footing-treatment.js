// Authored acoustic behavior of the support already resolved by foot-contact.
// This is deliberately independent of collision, movement speed and noise/REC
// receipts. A visual sourceVoid material alone never identifies a treatment.
const clamp01 = value => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.min(1, value)) : 0;
const key = value => typeof value === 'string'
  ? value.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/[ _]+/g, '-').trim() : '';
const lerp = (from, to, t) => t <= 0 ? from : t >= 1 ? to : from + (to - from) * t;

export const SOURCE_FOOTING_LIMITS = Object.freeze({
  fieldHumanizeAtEntry: 1, fieldHumanizeAtDepth: .45,
  divideTightenProgress: .65, divideLockProgress: 118 / 150,
  resistanceAtEntry: .7, resistanceAtDepth: 1,
  absenceLagAtEntry: .045, absenceLagAtDepth: .075,
  whiteWalkLagAtEntry: .070, whiteWalkLagAtDepth: .095,
  erasedLagAtEntry: .080, erasedLagAtDepth: .095,
  maxResponseLagSeconds: .095, maxResponseLagWanderSeconds: .012,
});

const physicalDomains = new Set([
  'outskirts', 'remembered-street', 'chapel-outskirts', 'bells', 'scene-dock',
  'coast', 'coastal-memory', 'source-ii', 'source-continuation',
  'ellery', 'ellery-aside', 'source-earthfall-ellery', 'source-earthfall:ellery',
]);
// These are actual construction/covering identities, not Source's printed or
// absent surface masquerading as a tile contact in the sample player.
const physicalSurfaces = new Set([
  'concrete', 'service-concrete', 'stone', 'cold-stone', 'chapel-stone',
  'wood', 'piano-wood', 'soundboard', 'carpet', 'case-lining', 'textile',
  'metal', 'lift', 'deck', 'tarmac', 'paving', 'setts', 'earth', 'coastal-earth',
  'grass', 'soil', 'sand', 'paper', 'source-page', 'snow', 'water', 'ash', 'glass',
]);
const bodyDomains = new Set(['body-corridor', 'bus-body', 'source-body', 'living-tissue']);
const whiteWalkDomains = new Set(['white-walk', 'white-absence', 'source-iv', 'source-iv-sheet']);

/**
 * Input is an acoustic descriptor from resolveFootContact, plus optional
 * sourceActive and domainCondition:{progress:0..1}. Missing progress means the
 * region's entry, rather than inventing distance from a broad Source phase.
 * Returned delay applies ONLY to the finite surface response. The dry sole,
 * controls and canonical gameplay contact keep their established timing.
 */
export function resolveSourceFootingTreatment(input = {}) {
  const surface = key(typeof input.surface === 'string' ? input.surface : input.surface?.material);
  const profile = key(input.profile), domain = key(input.sourceDomain || input.sourceBeat);
  const covering = key(input.covering);
  const progress = clamp01(input.domainCondition?.progress);
  const result = (footingTreatment, footingTreatmentReason, overrides = {}) => Object.freeze({
    gaitTreatment: 'natural', humanize: 1, resistanceStrength: 0,
    responseLagSeconds: 0, responseLagWanderSeconds: 0,
    footingTreatment, footingTreatmentReason, treatmentProgress: progress, ...overrides,
  });
  if (physicalDomains.has(domain) || physicalSurfaces.has(surface) || physicalSurfaces.has(covering)) {
    return result('natural-support', 'The accepted support is a remembered place, construction or physical covering.');
  }
  if (['body', 'flesh', 'tissue'].includes(surface)) {
    if (bodyDomains.has(domain) || input.sourceActive === true) {
      return result('living-resistance', 'Living Source footing briefly resists a plant; the release never repays it with a catch-up step.', {
        gaitTreatment: 'resistance',
        resistanceStrength: lerp(SOURCE_FOOTING_LIMITS.resistanceAtEntry, SOURCE_FOOTING_LIMITS.resistanceAtDepth, progress),
      });
    }
    return result('natural-support', 'A bodily material alone does not identify an authored Source resistance encounter.');
  }
  if (profile === 'compiled' || profile.startsWith('compiled-')) {
    const tone = profile.startsWith('compiled-') ? profile.slice('compiled-'.length) : key(input.tone);
    // The current Braided Divide uses sourceField on its supported route, not
    // legacy sourcePath/fault. Its actual final rise starts at depth118 of150m
    // (SOURCE_BRAIDED_DIVIDE.finalRise.from / length). This explicit domain
    // keeps the lock reachable without making every field material a machine.
    if (domain === 'compiled-divide' && tone === 'field') {
      if (progress >= SOURCE_FOOTING_LIMITS.divideLockProgress) {
        return result('compiled-divide-lock', 'The final supported rise and grey-door strip impose exact recurrence on accepted footfalls.', {
          gaitTreatment: 'locked', humanize: 0,
        });
      }
      return result('compiled-divide-tightening', 'The supported Divide gradually removes ordinary variation before its final rise becomes mechanically exact.', {
        humanize: lerp(SOURCE_FOOTING_LIMITS.fieldHumanizeAtEntry, SOURCE_FOOTING_LIMITS.fieldHumanizeAtDepth,
          clamp01(progress / SOURCE_FOOTING_LIMITS.divideTightenProgress)),
      });
    }
    if (tone === 'path' || tone === 'fault') {
      return result('compiled-lock', 'The printed route imposes exact recurrence on accepted footfalls without taking control of movement.', {
        gaitTreatment: 'locked', humanize: 0,
      });
    }
    return result('compiled-tightening', 'The field gradually removes some ordinary gait variation before the route becomes mechanically exact.', {
      humanize: lerp(SOURCE_FOOTING_LIMITS.fieldHumanizeAtEntry, SOURCE_FOOTING_LIMITS.fieldHumanizeAtDepth, progress),
    });
  }
  if (profile === 'erased' || profile === 'glazed') {
    const whiteWalk = profile === 'glazed' && whiteWalkDomains.has(domain);
    const [from, to] = profile === 'erased'
      ? [SOURCE_FOOTING_LIMITS.erasedLagAtEntry, SOURCE_FOOTING_LIMITS.erasedLagAtDepth]
      : whiteWalk
        ? [SOURCE_FOOTING_LIMITS.whiteWalkLagAtEntry, SOURCE_FOOTING_LIMITS.whiteWalkLagAtDepth]
        : [SOURCE_FOOTING_LIMITS.absenceLagAtEntry, SOURCE_FOOTING_LIMITS.absenceLagAtDepth];
    const delay = lerp(from, to, progress);
    return result(profile === 'erased' ? 'erased-lag' : whiteWalk ? 'white-walk-lag' : 'absence-lag',
      profile === 'erased'
        ? 'The last-contact residue answers after stopping; only that existing response arrives later.'
        : 'The sole stays immediate while the absent surface answers progressively later.', {
        responseLagSeconds: delay,
        // The engine supplies a slowly correlated signed wander. Keep its
        // entire range within the ceiling, including at a region boundary.
        responseLagWanderSeconds: Math.min(SOURCE_FOOTING_LIMITS.maxResponseLagWanderSeconds,
          Math.max(0, SOURCE_FOOTING_LIMITS.maxResponseLagSeconds - delay)),
      });
  }
  return result('natural-support', 'No authored Source acoustic exception identifies this support.');
}
