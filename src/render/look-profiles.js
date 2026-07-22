// One authored contract for every layer that makes up the instrument image.
// Geometry and PBR remain renderer truth. Generated material, reaction-
// diffusion, VFD excitation and glass are coordinated here so no layer can
// silently become a second full-frame renderer.

const NO_CHARACTERS = 'person, people, human, man, woman, child, figure, silhouette, face, portrait, eyes, creature, animal, monster, statue, mannequin, doll, crowd, poster art, cartoon, bright, fog, mist, haze, smoke, steam, volumetric fog';

const PROFILE_DATA = {
  calm: {
    bankId: 'calm', transitionMs: 600,
    generation: {
      strength: 0.26, guidance: 1.1, passes: 1, mix: 0.54, seedBase: 11000,
      prompt: 'quiet condemned conservatory materials, restrained age, isolated repairs and fine residue collected in seams, neutral flat material study',
      negative: NO_CHARACTERS,
    },
    material: { localDiffusion: 0.20, detailGain: 0.84, chromaDrift: 0.06, roughnessResponse: 0.06, normalResponse: 0.05 },
    vfd: { baseRetention: 0.90, paletteAmount: 0.28, persistenceMs: 90, cellPx: 8, signalGain: 0.42, edgeGain: 0.72, coverage: 0.20, glow: 0.12, aperture: 0.76, amber: 0.02 },
    glass: { strength: 0.18, fringe: 0.16, bloom: 0.10, grain: 0.18 },
  },
  explore: {
    bankId: 'explore', transitionMs: 600,
    generation: {
      strength: 0.42, guidance: 1.55, passes: 2, mix: 0.78, seedBase: 21000,
      prompt: 'condemned conservatory materials, broad water damage, oxidized mineral blooms, repeating room-tone striations and conspicuous historic patch repairs, neutral flat physical texture',
      negative: NO_CHARACTERS,
    },
    material: { localDiffusion: 0.58, detailGain: 1.24, chromaDrift: 0.22, roughnessResponse: 0.16, normalResponse: 0.13 },
    vfd: { baseRetention: 0.78, paletteAmount: 0.78, persistenceMs: 220, cellPx: 8, signalGain: 0.76, edgeGain: 1.12, coverage: 0.40, glow: 0.28, aperture: 0.82, amber: 0.06 },
    glass: { strength: 0.36, fringe: 0.32, bloom: 0.28, grain: 0.30 },
  },
  booth: {
    bankId: 'booth', transitionMs: 350,
    generation: {
      strength: 0.42, guidance: 1.5, passes: 1, mix: 0.78, seedBase: 31000,
      prompt: 'institutional security booth material study, stamped paper residue, tarnished metal ghosts, rectangular adhesive scars and bureaucratic occult patterning, neutral flat exposure',
      negative: `${NO_CHARACTERS}, gore, injury, friendly, clean bright office, neon poster`,
    },
    material: { localDiffusion: 0.70, detailGain: 1.38, chromaDrift: 0.28, roughnessResponse: 0.20, normalResponse: 0.17 },
    vfd: { baseRetention: 0.72, paletteAmount: 0.86, persistenceMs: 320, cellPx: 8, signalGain: 0.92, edgeGain: 1.28, coverage: 0.52, glow: 0.40, aperture: 0.86, amber: 0.12 },
    glass: { strength: 0.48, fringe: 0.42, bloom: 0.42, grain: 0.36 },
  },
  battle: {
    bankId: 'battle', transitionMs: 160,
    generation: {
      strength: 0.58, guidance: 2.6, passes: 2, mix: 0.88, seedBase: 41000,
      prompt: 'writhing flesh and bone architecture embedded in masonry, viscous mineral veins, latent over-recognition, material texture of infinity, no clean surfaces',
      negative: 'clean, tidy, bright, empty room, photograph, cartoon, poster',
    },
    material: { localDiffusion: 0.90, detailGain: 1.56, chromaDrift: 0.40, roughnessResponse: 0.28, normalResponse: 0.24 },
    vfd: { baseRetention: 0.60, paletteAmount: 0.96, persistenceMs: 480, cellPx: 9, signalGain: 1.12, edgeGain: 1.42, coverage: 0.72, glow: 0.56, aperture: 0.90, amber: 0.34 },
    glass: { strength: 0.66, fringe: 0.62, bloom: 0.62, grain: 0.52 },
  },
  hush: {
    bankId: 'hush', transitionMs: 900,
    generation: {
      strength: 0.46, guidance: 0.9, passes: 1, mix: 0.76, seedBase: 51000,
      prompt: 'empty architectural material draining of detail, surfaces erased to cold grey, rubbed plaster islands, silence swallowing texture, neutral flat exposure',
      negative: NO_CHARACTERS,
    },
    material: { localDiffusion: 0.94, detailGain: 0.78, chromaDrift: 0.08, roughnessResponse: 0.22, normalResponse: 0.12 },
    vfd: { baseRetention: 0.68, paletteAmount: 0.66, persistenceMs: 700, cellPx: 10, signalGain: 0.66, edgeGain: 0.92, coverage: 0.48, glow: 0.38, aperture: 0.78, amber: 0.01 },
    glass: { strength: 0.56, fringe: 0.24, bloom: 0.34, grain: 0.46 },
  },
  rupture: {
    bankId: 'rupture', transitionMs: 120,
    generation: {
      strength: 0.64, guidance: 2.8, passes: 2, mix: 0.90, seedBase: 61000,
      prompt: 'impossible organic architecture collapsing into mineral tissue, bone cathedral material, latent space tearing through masonry, texture of god',
      negative: 'clean, tidy, bright, cartoon, poster, flat graphic design',
    },
    material: { localDiffusion: 1.0, detailGain: 1.68, chromaDrift: 0.50, roughnessResponse: 0.34, normalResponse: 0.30 },
    vfd: { baseRetention: 0.55, paletteAmount: 1.0, persistenceMs: 900, cellPx: 10, signalGain: 1.24, edgeGain: 1.58, coverage: 0.75, glow: 0.70, aperture: 0.92, amber: 0.42 },
    glass: { strength: 0.78, fringe: 0.78, bloom: 0.76, grain: 0.62 },
  },
};

function freezeProfile(id, value) {
  return Object.freeze({
    id,
    ...value,
    generation: Object.freeze({ ...value.generation }),
    material: Object.freeze({ ...value.material }),
    vfd: Object.freeze({ ...value.vfd }),
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
  if (!Number.isFinite(profile.transitionMs) || profile.transitionMs < 0) return false;
  for (const layer of ['generation', 'material', 'vfd', 'glass']) {
    if (!profile[layer] || typeof profile[layer] !== 'object') return false;
  }
  const required = [
    profile.generation.strength, profile.generation.guidance, profile.generation.passes,
    profile.generation.mix, profile.generation.seedBase, profile.material.detailGain,
    profile.material.roughnessResponse, profile.material.normalResponse,
    profile.vfd.baseRetention, profile.vfd.paletteAmount, profile.vfd.persistenceMs, profile.vfd.coverage,
    profile.glass.strength, profile.glass.bloom,
  ];
  return required.every(Number.isFinite)
    && profile.vfd.baseRetention >= 0.55 && profile.vfd.baseRetention <= 1
    && profile.vfd.paletteAmount >= 0 && profile.vfd.paletteAmount <= 1
    && profile.vfd.coverage >= 0 && profile.vfd.coverage <= 0.75
    && profile.vfd.persistenceMs >= 16;
}

export function profileBankRecipes() {
  return LOOK_PROFILE_IDS.map((id) => {
    const profile = LOOK_PROFILES[id];
    if (!validateLookProfile(profile)) throw new Error(`invalid look profile: ${id}`);
    return Object.freeze({ id, bankId: profile.bankId, generation: profile.generation });
  });
}
