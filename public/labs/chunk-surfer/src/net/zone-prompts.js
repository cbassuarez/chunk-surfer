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

const WORLD_PROMPTS = {
  // the composer's own room — starts almost normal
  main_b3: {
    corridor: 'dark grimy concrete corridor, damp plaster, chalk dust, hairline cracks spreading across the walls',
    expanse: 'grey concrete chamber with no far wall, fog eating the floor, unfinished columns in the distance',
  },
  // wet, bounded, drowned
  the_tub: {
    corridor: 'dim green ceramic tile slick with black water, algae in the grout, porcelain going soft, drowned bathroom',
    expanse: 'flooded dark hall, black mirror water without horizon, steam, slow swells crossing the surface',
  },
  // resonance, performance, velvet and bone
  amplifications: {
    corridor: 'dark lacquered wood and tarnished brass, worn red velvet swelling out of the walls like tissue, dust',
    expanse: 'unlit empty auditorium, endless vacant seats receding past vanishing, dust suspended, the stage lost in black',
  },
  // exhaustion, rot, static
  soundnoisemusic: {
    corridor: 'peeling wallpaper and torn lath, dark water stains spreading, dim sodium light, rot, walls dissolving into television static',
    expanse: 'gutted interior stripped to bone, debris, architecture decaying into grey noise, nothing holding still',
  },
  // the divine, the radiant, the unbearable
  lux_nova: {
    corridor: 'pale limestone and ribbed vault, snow drifting indoors, cold light with no source, bone-white stone',
    expanse: 'ruined cathedral nave without end, shafts of hard light, snow on stone, radiant emptiness, the geometry of a god',
  },
};

export function promptFor(worldId, inExpanse) {
  const w = WORLD_PROMPTS[worldId] || WORLD_PROMPTS.main_b3;
  return `${inExpanse ? w.expanse : w.corridor}, ${LENS}, ${FILM}`;
}
