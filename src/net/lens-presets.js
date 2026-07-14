// Compatibility surface for older scene code. The active renderer now consumes
// the complete look profile instead of handing camera-oriented diffusion knobs
// to a material-tile client that clamps most of them.
export { LOOK_PROFILES, LOOK_PROFILE_IDS, getLookProfile, profileBankRecipes } from '../render/look-profiles.js';
import { LOOK_PROFILES } from '../render/look-profiles.js';

export const PRESETS = Object.freeze(Object.fromEntries(
  Object.entries(LOOK_PROFILES).map(([id, profile]) => [id, Object.freeze({
    ...profile.generation,
    seedMode: 'fixed',
    profileId: id,
  })]),
));

export const PRESET_NAMES = Object.freeze(Object.keys(PRESETS));
