// Per-zone diffusion prompts.
//
// These do not describe rooms. The raymarcher already supplies the geometry,
// and the lens runs with a walking seed and frame-to-frame feedback, so a
// prompt behaves less like a texture map than a weather system: it decides
// what the hallucination grows into as it eats its own output.
//
// So the prompt carries the horror. It names materials that should not be
// architecture (flesh, hair, bone, faces), and the visual grammar of a model
// failing to resolve — over-recognition, surfaces that keep almost deciding
// what they are. What frightens is not a monster in the corridor; it is that
// the corridor cannot settle on what it is made of. In testing, the model put
// a standing figure at the end of the hall unasked. Leave room for that.
//
// HARD-WON, DO NOT UNDO (see the sweep in diffusion_server/README.md):
//   · No "psychedelic", "iridescent", "fractal", "neon" — sd-turbo hears those
//     as *acid poster* and returns saturated skull art, which is kitsch, not
//     dread. Horror lives in the dark, grimy, underexposed register.
//   · Always state darkness explicitly. Diffusion brightens; the piece must not.
//   · NO CHARACTERS. Never name faces, figures, people or creatures here. The
//     model will otherwise stage a silhouette at the end of the hallway on its
//     own initiative, and a cast introduced by a sampler is not a cast. Every
//     appearance in this game is authored. Presence belongs to battle and
//     rupture presets, which we place deliberately (see lens-presets.js).
//   · Each world gets a fixed seed (ZONE_SEEDS) so a place is the same place
//     every time you enter it. Texture crawls; geography does not.
//
// Reference register: P.T. / Silent Hills — a domestic hallway lit badly,
// filmed on a bad camera, wrong in a way you cannot name.
//
// In M4 these become the narrative registers (straight / ironic / decay /
// refusal): each area will literally look like the mode of its dialogue.

// The grammar of the lens — the model's failure to resolve, as material.
// Note this describes *substance*, never inhabitants.
const LENS = 'the surface cannot decide what it is made of, matter half-become something else, stone turning to meat and back';

// Photographic register — the P.T. lie: bad camera, real room, no color.
const FILM = 'underexposed, black shadows, heavy film grain, found footage, handheld, desaturated, empty, deserted, dread';

// A place must be the same place each time. Arbitrary but fixed.
export const ZONE_SEEDS = {
  main_b3: 10_411,
  the_tub: 27_183,
  amplifications: 31_415,
  soundnoisemusic: 57_721,
  lux_nova: 66_260,
};
export function seedFor(worldId, inExpanse) {
  return (ZONE_SEEDS[worldId] || 1) + (inExpanse ? 7 : 0);
}

// The five zones are five rooms of one condemned conservatory. The building is
// why the audio exists: a basement studio, a natatorium, a concert hall, a
// practice wing, a chapel. Nothing here is invented — these are the rooms the
// composer's material was made in, and the recordist has been hired to capture
// each one's room tone before demolition.
//
// Every entry names materials and decay. None names an inhabitant.
const WORLD_PROMPTS = {
  // studio B3 — sub-basement. where it starts almost normal.
  main_b3: {
    corridor: 'sub-basement recording studio corridor, peeling acoustic foam, coiled cable snakes on the floor, damp concrete, chalk bloom on the walls',
    expanse: 'a dead live-room with no far wall, black acoustic absorption swallowing the light, fog on the floor, isolation booth glass',
  },
  // the natatorium — drained, wet, bounded
  the_tub: {
    corridor: 'natatorium passage, cracked pool tile, chlorine stains, algae in the grout, porcelain going soft, standing water underfoot',
    expanse: 'a drained swimming pool from the deep end, black water still pooled at the bottom, tiled walls rising past the light, steam',
  },
  // the concert hall — velvet, brass, dust
  amplifications: {
    corridor: 'concert hall backstage passage, dark lacquered wood and tarnished brass, worn red velvet swelling out of the walls, dust',
    expanse: 'an unlit auditorium seen from the stage, endless vacant seats receding past vanishing, dust suspended in the air, the hall lost in black',
  },
  // the practice wing — exhaustion, rot, static
  soundnoisemusic: {
    corridor: 'practice wing corridor, soundproofed doors standing ajar, torn foam, water-stained lath, dim sodium light, rot',
    expanse: 'a gutted rehearsal room stripped to bone, upended music stands, debris, the architecture decaying into grey noise',
  },
  // the chapel — the divine, the radiant, the unbearable
  lux_nova: {
    corridor: 'chapel cloister passage, pale limestone and ribbed vault, organ pipes rising in the dark, cold light with no source, snow drifting indoors',
    expanse: 'a ruined nave without end, hard shafts of light through a broken clerestory, snow on stone, radiant emptiness',
  },
};

export function promptFor(worldId, inExpanse) {
  const w = WORLD_PROMPTS[worldId] || WORLD_PROMPTS.main_b3;
  return `${inExpanse ? w.expanse : w.corridor}, ${LENS}, ${FILM}`;
}
