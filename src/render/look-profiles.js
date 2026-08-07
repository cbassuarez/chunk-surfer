// One authored contract for every layer that makes up the instrument image.
// Geometry and PBR remain renderer truth. Generated material, reaction-
// diffusion, VFD excitation, recording acquisition and glass are coordinated
// here so no layer can silently become a second full-frame renderer.

// Negatives are a token budget too, and every word here competes with the
// prompt for CLIP's attention. Keep it to the failures that actually happen:
// people appearing in an empty building, and the model drifting to clip art.
import { isScreen } from './pixel-mesh/screens.js';

const NO_CHARACTERS = 'person, face, figure, hands, creature, animal, text, watermark, cartoon, bright, fog, smoke';
const NO_TIDY = 'clean, tidy, bright, cartoon, poster, text, watermark';

// generation.frames — how many temporal variants (K) of each surface tile this
//   bank generates. The shader crossfades between them: that is the boil.
// generation.strengthRamp — how much further each successive frame is pushed,
//   so the churn escalates instead of cycling through equals.
// generation.feedback — how much a runtime mutation re-diffuses its own last
//   output instead of the authored albedo. This is the slow crawl.
// generation.burst — the full-frame possession pass: the room itself, run back
//   through the model, for a few seconds. Absent = this profile never bursts.
// material.boilHz — crossfade rate between dream frames, before agitation.
// material.structureMix — how much of the generated RGB (not just its detail
//   ratio) reaches the wall. This is what makes it a repaint rather than grain.
// material.lumaClampLo/Hi — safety bounds on the exposure correction, so the
//   lens can never produce a black or blown frame.
// material.lumaHold — how much of that correction is actually applied. 1 pins
//   generated luminance to the authored albedo (and hides the lens); low lets
//   the surface set its own brightness. This is the single knob that decides
//   whether the boil is visible at all, because the VFD encoder downstream
//   buckets cells by luminance.
// vfd.paletteChroma — how much generated colour survives the restrained tonal
//                     plate. The recording layer, rather than coarse blocks,
//                     now owns the visible medium texture.
// vfd.shadowLift    — how far the darkest block opens up. The bottom bucket is
//                     where every authored practical in a building with no mains
//                     lands; at 0 it crushes them to nothing. True black is
//                     unaffected at any value, so this reveals light that is
//                     there rather than lifting the whole image off the floor.
const PROFILE_DATA = {
  calm: {
    bankId: 'calm', transitionMs: 600,
    generation: {
      strength: 0.30, guidance: 1.1, passes: 2, mix: 0.54, seedBase: 11000,
      frames: 1, strengthRamp: 0, feedback: 0, mutationRateScale: 1,
      prompt: 'quiet condemned conservatory surfaces, faint settling, residue gathering in seams, slow mineral creep',
      negative: NO_CHARACTERS,
    },
    material: { localDiffusion: 0.20, detailGain: 0.84, chromaDrift: 0.06, roughnessResponse: 0.1, normalResponse: 0.1, boilHz: 0, structureMix: 0.0, lumaClampLo: 0.62, lumaClampHi: 1.48, lumaHold: 1.0 },
    vfd: { baseRetention: 0.90, shadowLift: 0.3, paletteAmount: 0.06, paletteChroma: 0.08, persistenceMs: 90, cellPx: 2, signalGain: 0.42, edgeGain: 0.72, coverage: 0.20, blackPoint: 0.006, whitePoint: 0.34, toneGamma: 0.95, lineAmount: 0.44, toneAmount: 0.9, glow: 0.12, aperture: 0.76, amber: 0.02 , screen: 'hatch' },
    recording: { captureMix: 1.0, patternScale: 42, blackFloor: 0.005, densityGamma: 0.78, thresholdNoise: 0.025, thresholdIrregularity: 0.52, postGrain: 0.018, lumaGrain: 0.50, temporalHz: 6, temporalSmear: 0.70, scenePinning: 0.72, fearGain: 0.20, audioGain: 0.10 },
    glass: { strength: 0.18, fringe: 0.16, bloom: 0.10, grain: 0.18 },
  },
  explore: {
    bankId: 'explore', transitionMs: 600,
    generation: {
      strength: 0.42, guidance: 1.55, passes: 2, mix: 0.78, seedBase: 21000,
      frames: 3, strengthRamp: 0.05, feedback: 0.30, mutationRateScale: 1,
      prompt: 'condemned conservatory decay, boiling damp stains, crawling mineral blooms, patch repairs migrating, wet plaster breathing',
      negative: NO_CHARACTERS,
    },
    material: { localDiffusion: 0.58, detailGain: 1.24, chromaDrift: 0.22, roughnessResponse: 0.32, normalResponse: 0.3, boilHz: 0.25, structureMix: 0.26, lumaClampLo: 0.55, lumaClampHi: 1.65, lumaHold: 0.72 },
    vfd: { baseRetention: 0.78, shadowLift: 0.42, paletteAmount: 0.12, paletteChroma: 0.28, persistenceMs: 220, cellPx: 2, signalGain: 0.76, edgeGain: 1.12, coverage: 0.40, blackPoint: 0.005, whitePoint: 0.46, toneGamma: 0.92, lineAmount: 0.53, toneAmount: 0.9, glow: 0.28, aperture: 0.82, amber: 0.06 , screen: 'hatch' },
    recording: { captureMix: 1.0, patternScale: 46, blackFloor: 0.004, densityGamma: 0.72, thresholdNoise: 0.060, thresholdIrregularity: 0.68, postGrain: 0.045, lumaGrain: 0.68, temporalHz: 10, temporalSmear: 0.62, scenePinning: 0.60, fearGain: 0.45, audioGain: 0.18 },
    glass: { strength: 0.36, fringe: 0.32, bloom: 0.28, grain: 0.30 },
  },
  booth: {
    bankId: 'booth', transitionMs: 350,
    generation: {
      strength: 0.44, guidance: 1.5, passes: 2, mix: 0.78, seedBase: 31000,
      frames: 3, strengthRamp: 0.05, feedback: 0.32, mutationRateScale: 1,
      prompt: 'institutional booth residue, peeling stamped paper, crawling adhesive scars, tarnished bureaucratic patterning, ink bleeding',
      negative: `${NO_CHARACTERS}, clean office`,
    },
    material: { localDiffusion: 0.70, detailGain: 1.38, chromaDrift: 0.28, roughnessResponse: 0.38, normalResponse: 0.36, boilHz: 0.35, structureMix: 0.32, lumaClampLo: 0.52, lumaClampHi: 1.70, lumaHold: 0.66 },
    vfd: { baseRetention: 0.72, shadowLift: 0.26, paletteAmount: 0.16, paletteChroma: 0.34, persistenceMs: 320, cellPx: 2, signalGain: 0.92, edgeGain: 1.28, coverage: 0.52, blackPoint: 0.004, whitePoint: 0.56, toneGamma: 0.88, lineAmount: 0.584, toneAmount: 0.9, glow: 0.40, aperture: 0.86, amber: 0.12 , screen: 'stochastic' },
    recording: { captureMix: 1.0, patternScale: 44, blackFloor: 0.004, densityGamma: 0.70, thresholdNoise: 0.072, thresholdIrregularity: 0.72, postGrain: 0.055, lumaGrain: 0.72, temporalHz: 9, temporalSmear: 0.70, scenePinning: 0.52, fearGain: 0.38, audioGain: 0.18 },
    glass: { strength: 0.48, fringe: 0.42, bloom: 0.42, grain: 0.36 },
  },
  battle: {
    bankId: 'battle', transitionMs: 160,
    generation: {
      strength: 0.58, guidance: 2.6, passes: 2, mix: 0.88, seedBase: 41000,
      frames: 4, strengthRamp: 0.06, feedback: 0.45, mutationRateScale: 1.8,
      prompt: 'flesh boiling through masonry, writhing veins, peristaltic tissue, wet membranes blooming, bone pressing under plaster',
      negative: NO_TIDY,
      burst: {
        strength: 0.42, guidance: 2.4, depthScale: 0.62,
        prompt: 'the room rendered as (living tissue:1.2), walls of wet muscle under plaster, architecture breathing',
        negative: NO_TIDY,
      },
    },
    material: { localDiffusion: 0.90, detailGain: 1.56, chromaDrift: 0.40, roughnessResponse: 0.55, normalResponse: 0.52, boilHz: 0.80, structureMix: 0.46, lumaClampLo: 0.40, lumaClampHi: 1.95, lumaHold: 0.4 },
    vfd: { baseRetention: 0.60, shadowLift: 0.18, paletteAmount: 0.18, paletteChroma: 0.46, persistenceMs: 480, cellPx: 3, signalGain: 1.12, edgeGain: 1.42, coverage: 0.72, blackPoint: 0.003, whitePoint: 0.72, toneGamma: 0.85, lineAmount: 0.674, toneAmount: 0.9, glow: 0.56, aperture: 0.90, amber: 0.34 , screen: 'crosshatchTight' },
    recording: { captureMix: 1.0, patternScale: 40, blackFloor: 0.003, densityGamma: 0.66, thresholdNoise: 0.120, thresholdIrregularity: 0.82, postGrain: 0.070, lumaGrain: 0.78, temporalHz: 14, temporalSmear: 0.45, scenePinning: 0.42, fearGain: 0.70, audioGain: 0.35 },
    glass: { strength: 0.66, fringe: 0.62, bloom: 0.62, grain: 0.52 },
  },
  hush: {
    bankId: 'hush', transitionMs: 900,
    generation: {
      strength: 0.46, guidance: 0.9, passes: 2, mix: 0.76, seedBase: 51000,
      frames: 3, strengthRamp: 0.04, feedback: 0.34, mutationRateScale: 1,
      prompt: 'surfaces draining grey, detail dissolving, rubbed plaster erasure, cold hollow blankness spreading',
      negative: NO_CHARACTERS,
    },
    material: { localDiffusion: 0.94, detailGain: 0.78, chromaDrift: 0.08, roughnessResponse: 0.4, normalResponse: 0.26, boilHz: 0.15, structureMix: 0.24, lumaClampLo: 0.55, lumaClampHi: 1.60, lumaHold: 0.7 },
    vfd: { baseRetention: 0.68, shadowLift: 0.5, paletteAmount: 0.08, paletteChroma: 0.18, persistenceMs: 700, cellPx: 3, signalGain: 0.66, edgeGain: 0.92, coverage: 0.48, blackPoint: 0.005, whitePoint: 0.52, toneGamma: 0.9, lineAmount: 0.566, toneAmount: 0.9, glow: 0.38, aperture: 0.78, amber: 0.01 , screen: 'crosshatch' },
    recording: { captureMix: 1.0, patternScale: 38, blackFloor: 0.008, densityGamma: 0.82, thresholdNoise: 0.080, thresholdIrregularity: 0.78, postGrain: 0.050, lumaGrain: 0.76, temporalHz: 5, temporalSmear: 0.82, scenePinning: 0.70, fearGain: 0.30, audioGain: 0.10 },
    glass: { strength: 0.56, fringe: 0.24, bloom: 0.34, grain: 0.46 },
  },
  rupture: {
    bankId: 'rupture', transitionMs: 120,
    generation: {
      strength: 0.64, guidance: 2.8, passes: 2, mix: 0.90, seedBase: 61000,
      frames: 5, strengthRamp: 0.07, feedback: 0.55, mutationRateScale: 2.2,
      prompt: 'organic architecture collapsing, bone and tissue blooming through masonry, melting mineral flesh, latent space tearing',
      negative: NO_TIDY,
      burst: {
        strength: 0.50, guidance: 2.8, depthScale: 0.58,
        prompt: '(bone cathedral:1.3) tearing through the room, masonry dissolving into marrow, impossible organic depth',
        negative: NO_TIDY,
      },
    },
    material: { localDiffusion: 1.0, detailGain: 1.68, chromaDrift: 0.50, roughnessResponse: 0.66, normalResponse: 0.62, boilHz: 1.20, structureMix: 0.6, lumaClampLo: 0.30, lumaClampHi: 2.20, lumaHold: 0.2 },
    vfd: { baseRetention: 0.55, shadowLift: 0.12, paletteAmount: 0.22, paletteChroma: 0.58, persistenceMs: 900, cellPx: 3, signalGain: 1.24, edgeGain: 1.58, coverage: 0.75, blackPoint: 0.003, whitePoint: 0.78, toneGamma: 0.84, lineAmount: 0.688, toneAmount: 0.9, glow: 0.70, aperture: 0.92, amber: 0.42 , screen: 'crosshatchTight' },
    recording: { captureMix: 1.0, patternScale: 36, blackFloor: 0.002, densityGamma: 0.60, thresholdNoise: 0.160, thresholdIrregularity: 0.90, postGrain: 0.080, lumaGrain: 0.82, temporalHz: 16, temporalSmear: 0.35, scenePinning: 0.32, fearGain: 0.85, audioGain: 0.45 },
    glass: { strength: 0.78, fringe: 0.78, bloom: 0.76, grain: 0.62 },
  },
};

function freezeProfile(id, value) {
  return Object.freeze({
    id,
    ...value,
    generation: Object.freeze({
      ...value.generation,
      ...(value.generation.burst ? { burst: Object.freeze({ ...value.generation.burst }) } : {}),
    }),
    material: Object.freeze({ ...value.material }),
    vfd: Object.freeze({ ...value.vfd }),
    recording: Object.freeze({ ...value.recording }),
    glass: Object.freeze({ ...value.glass }),
  });
}

export const LOOK_PROFILES = Object.freeze(Object.fromEntries(
  Object.entries(PROFILE_DATA).map(([id, profile]) => [id, freezeProfile(id, profile)]),
));

export const LOOK_PROFILE_IDS = Object.freeze(Object.keys(LOOK_PROFILES));

export function getLookProfile(id = 'explore') {
  return LOOK_PROFILES[id] || LOOK_PROFILES.explore;
}

export function isLookProfile(id) {
  return Object.prototype.hasOwnProperty.call(LOOK_PROFILES, id);
}

export function validateLookProfile(profile) {
  if (!profile || !isLookProfile(profile.id) || profile.bankId !== profile.id) return false;
  // The screen is a string id, so it cannot ride in the numeric `required` list
  // below — same reason bankId and burst.prompt are checked separately.
  if (!isScreen(profile.vfd?.screen)) return false;
  if (!Number.isFinite(profile.transitionMs) || profile.transitionMs < 0) return false;
  for (const layer of ['generation', 'material', 'vfd', 'recording', 'glass']) {
    if (!profile[layer] || typeof profile[layer] !== 'object') return false;
  }
  const required = [
    profile.generation.strength, profile.generation.guidance, profile.generation.passes,
    profile.generation.mix, profile.generation.seedBase, profile.material.detailGain,
    profile.material.roughnessResponse, profile.material.normalResponse,
    profile.generation.frames, profile.generation.feedback, profile.generation.mutationRateScale,
    profile.material.boilHz, profile.material.structureMix,
    profile.material.lumaClampLo, profile.material.lumaClampHi, profile.material.lumaHold,
    profile.vfd.baseRetention, profile.vfd.paletteAmount, profile.vfd.paletteChroma,
    profile.vfd.persistenceMs,
    profile.vfd.shadowLift, profile.vfd.coverage,
    profile.recording.captureMix,
    profile.recording.patternScale,
    profile.recording.blackFloor,
    profile.recording.densityGamma,
    profile.recording.thresholdNoise, profile.recording.thresholdIrregularity,
    profile.recording.postGrain, profile.recording.lumaGrain,
    profile.recording.temporalHz, profile.recording.temporalSmear,
    profile.recording.scenePinning, profile.recording.fearGain,
    profile.recording.audioGain,
    profile.glass.strength, profile.glass.bloom,
  ];
  const burst = profile.generation.burst;
  if (burst && !(Number.isFinite(burst.strength) && Number.isFinite(burst.guidance)
    && burst.strength > 0 && burst.strength <= 0.95 && typeof burst.prompt === 'string' && burst.prompt)) return false;
  return required.every(Number.isFinite)
    && profile.vfd.baseRetention >= 0.55 && profile.vfd.baseRetention <= 1
    && profile.vfd.paletteAmount >= 0 && profile.vfd.paletteAmount <= 1
    && profile.vfd.paletteChroma >= 0 && profile.vfd.paletteChroma <= 0.6
    // Past ~0.6 the darkest block stops being dark and the building stops being
    // frightening; the lift is for revealing authored light, not for turning the
    // lights on.
    && profile.vfd.shadowLift >= 0 && profile.vfd.shadowLift <= 0.6
    && profile.vfd.coverage >= 0 && profile.vfd.coverage <= 0.75
    && Number.isInteger(profile.vfd.cellPx)
    && profile.vfd.cellPx >= 1 && profile.vfd.cellPx <= 12
    && profile.vfd.persistenceMs >= 16
    && profile.recording.captureMix >= 0 && profile.recording.captureMix <= 1
    && profile.recording.patternScale >= 12 && profile.recording.patternScale <= 96
    && profile.recording.blackFloor >= 0 && profile.recording.blackFloor <= 0.08
    && profile.recording.densityGamma >= 0.45 && profile.recording.densityGamma <= 1.5
    && profile.recording.thresholdNoise >= 0 && profile.recording.thresholdNoise <= 0.20
    && profile.recording.thresholdIrregularity >= 0 && profile.recording.thresholdIrregularity <= 1
    && profile.recording.postGrain >= 0 && profile.recording.postGrain <= 0.08
    && profile.recording.lumaGrain >= 0 && profile.recording.lumaGrain <= 1
    && profile.recording.temporalHz >= 0 && profile.recording.temporalHz <= 24
    && profile.recording.temporalSmear >= 0 && profile.recording.temporalSmear <= 1
    && profile.recording.scenePinning >= 0 && profile.recording.scenePinning <= 1
    && profile.recording.fearGain >= 0 && profile.recording.fearGain <= 1.5
    && profile.recording.audioGain >= 0 && profile.recording.audioGain <= 1.5
    // The boil: K temporal frames per surface, crossfaded. More than five is
    // texture memory nobody can see moving.
    && Number.isInteger(profile.generation.frames)
    && profile.generation.frames >= 1 && profile.generation.frames <= 5
    && profile.generation.feedback >= 0 && profile.generation.feedback <= 0.55
    && profile.generation.mutationRateScale > 0 && profile.generation.mutationRateScale <= 3
    && profile.material.boilHz >= 0 && profile.material.boilHz <= 1.5
    && profile.material.structureMix >= 0 && profile.material.structureMix <= 0.75
    && profile.material.lumaClampLo >= 0.25 && profile.material.lumaClampLo <= 0.62
    && profile.material.lumaClampHi >= 1.48 && profile.material.lumaClampHi <= 2.4
    // Fully unheld exposure is a black-or-blown frame away; calm must stay pinned.
    && profile.material.lumaHold >= 0.15 && profile.material.lumaHold <= 1;
}

export function profileBankRecipes() {
  return LOOK_PROFILE_IDS.map((id) => {
    const profile = LOOK_PROFILES[id];
    if (!validateLookProfile(profile)) throw new Error(`invalid look profile: ${id}`);
    return Object.freeze({ id, bankId: profile.bankId, generation: profile.generation });
  });
}
