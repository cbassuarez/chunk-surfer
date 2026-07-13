// Named lens presets. Select with ?preset=<name>, switch live from the tuner
// panel (press `t`), or from the console:
//   window.__diffusion.tune(window.__lensPresets.battle)
//
// These were found by sweeping the parameter space against a fixed corridor
// (see diffusion_server/README.md). The two axes that matter:
//   strength — how far the model may depart from the raymarched geometry
//   guidance — how hard it pushes off sd-turbo's native CFG=0 distribution
// Past strength 0.6 the corridor stops existing. Past guidance ~2 the dread
// turns into neon poster art. Both of those are useful *on purpose* in the
// right scene, which is what the presets below encode.

const FILM = 'underexposed, black shadows, heavy film grain, found footage, handheld, desaturated, dread';

// The exact battle prompt from the approved sweep frames. The words that are
// forbidden in a corridor ("iridescent", "fractal") are load-bearing here —
// they are what pull the model off photographic realism into over-recognition.
// Verbatim. Do not tidy.
const BATTLE_PROMPT = 'writhing flesh and bone architecture, faces surfacing in the plaster and dissolving, iridescent viscera, fractal eyes, deepdream over-recognition, StyleGAN latent smear, texture of infinity, no clean surfaces';

// Presets that must never stage an inhabitant inherit this. Battle and rupture
// deliberately do NOT — those are the scenes where we choose to show something.
import { NO_CHARACTERS } from './diffusion.js';

export const PRESETS = {
  // The default explore register: a corridor you can navigate, made of a
  // material that will not hold still. P.T. lineage.
  // Navigable by construction: low strength keeps the model repainting the
  // walls that are actually there, low feedback stops it wandering into its
  // own dream between frames. Every visit to a world looks like that world
  // (seedMode fixed + per-zone seed). Nobody lives here (NO_CHARACTERS).
  explore: {
    strength: 0.33, guidance: 1.05, passes: 1, feedback: 0.10, drift: 0.28,
    seedMode: 'fixed', negative: NO_CHARACTERS,
    // prompt intentionally omitted: zone-prompts.js owns it per world
  },

  // Faithful: the raymarcher, restyled. For dialogue, where the player must
  // read a face and a box of text without the walls crawling.
  calm: {
    strength: 0.24, guidance: 0.8, passes: 1, feedback: 0.06, drift: 0.2,
    seedMode: 'fixed', negative: NO_CHARACTERS,
  },

  // Booth apparition: a large threshold image, using battle-scale permission
  // to let the model dominate the frame without importing combat semantics.
  booth: {
    strength: 0.70, guidance: 2.4, passes: 3, feedback: 0.32, drift: 0.65,
    seedMode: 'fixed',
    negative: 'gore, injury, anatomical horror, monster, clean bright office, friendly face, clear face, smile, cartoon, neon poster',
    prompt: `shadowed institutional security booth at night, fluorescent glass box, guard face withheld behind black reflections and sunglasses, coffee cup, key hooks, stamped forms, service gate threshold, bureaucratic occult, reflected paperwork, underexposed procedural dread, ${FILM}`,
  },

  // ── BATTLE ──────────────────────────────────────────────────────────────
  // Geometry is ALLOWED TO LOSE. The room stops being a place and becomes an
  // over-recognised thing: split faces, eyes, iridescent viscera, electric
  // line-work. Enemies are sound-chunks; this is what the room does while you
  // fight one. The high-guidance saturation that reads as kitsch in a corridor
  // reads as *seizure* here — the discipline is that it never appears while
  // walking. Both variants below were selected off the sweep and approved;
  // they are exact. Do not "improve" the numbers or the prompt.
  //
  // The photographic modifiers (FILM) are deliberately ABSENT: they anchor the
  // model to "real room" and it dutifully renders a corridor. Battle speaks
  // the model's own dialect instead.
  battle: {
    // sw-g4.0-fb0: the split face — half portrait, half neural line-drawing
    strength: 0.80, guidance: 4.0, passes: 3, feedback: 0.0, drift: 0, seedMode: 'walk',
    negative: 'clean, tidy, bright, empty room, photograph',
    prompt: BATTLE_PROMPT,
  },
  // sw-g3.0-fb45: the skull bloom — feedback lets it grow into itself
  battleBloom: {
    strength: 0.80, guidance: 3.0, passes: 3, feedback: 0.45, drift: 1.6, seedMode: 'walk',
    negative: 'clean, tidy, bright, empty room, photograph',
    prompt: BATTLE_PROMPT,
  },

  // The hush arriving: the world subtracted. Feedback high, prompt starved,
  // so the dream eats itself and leaves smears.
  hush: {
    strength: 0.62, guidance: 1.0, passes: 2, feedback: 0.80, drift: 3.0, seedMode: 'walk', negative: NO_CHARACTERS,
    prompt: `an empty dark corridor draining of detail, surfaces going blank and grey, features erased, silence, void swallowing the walls, ${FILM}`,
  },

  // Full psychedelia — geometry abandoned. For the descent / rupture beats
  // and the finale, not for walking around in.
  rupture: {
    strength: 0.88, guidance: 3.4, passes: 3, feedback: 0.70, drift: 2.8, seedMode: 'walk',
    negative: 'clean, tidy, bright, cartoon',
    prompt: `impossible non-euclidean space collapsing, writhing organic mass, countless eyes, bone cathedral, latent space tearing open, the texture of god, ${FILM}`,
  },
};

export const PRESET_NAMES = Object.keys(PRESETS);
