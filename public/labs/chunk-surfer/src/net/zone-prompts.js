// Per-zone diffusion prompts.
//
// These do not describe rooms. The raymarcher already supplies the geometry,
// and the lens runs with a walking seed and frame-to-frame feedback, so a
// prompt behaves less like a texture map than a weather system: it decides
// what the hallucination grows into as it eats its own output.
//
// So the prompt carries the horror by corrupting architecture, not by adding a
// cast. Materials should stay readable: concrete, foam, tile, wood, stone,
// duct, glass, wetness. The model may make them unstable, but never generic.
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

// The grammar of the lens — architectural material under pressure.
// Note this describes surfaces, never inhabitants.
const LENS = 'architectural surfaces stay legible but unstable, grime and water damage resolving into repeating room-tone striations, clear dry air, crisp unobstructed visibility, no atmospheric haze, no fog, no mist, no smoke, no figures, no faces, no bodies';

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
    corridor: 'sub-basement service concrete, loading dock threshold, security booth glass reflected in the dark, peeling acoustic foam, coiled cable trench, damp concrete, plant room lift shaft',
    expanse: 'a dead live-room with black acoustic absorption, isolation booth glass, cable troughs in the floor, service concrete walls swallowed by darkness',
  },
  // the natatorium — drained, wet, bounded
  the_tub: {
    corridor: 'natatorium passage, cracked pool tile, chlorine stains, algae in the grout, coping stones, shallow puddles catching the flashlight',
    expanse: 'a drained swimming pool from the deep end, black water pooled below the steps, mineral bloom on wet tile, tiled walls rising past the light',
  },
  // the concert hall — velvet, brass, dust
  amplifications: {
    corridor: 'concert hall backstage passage, bricked foyer door nearby, dark lacquered wood, tarnished brass, worn red velvet, dust along aisle thresholds',
    expanse: 'an unlit auditorium seen from the stage, vacant seats and aisle breaks clearly receding, backstage wing doors, clear black air',
  },
  // the practice wing — exhaustion, rot, static
  soundnoisemusic: {
    corridor: 'practice wing corridor, repeated soundproof doors, bulletin glass, torn foam, water-stained drywall, low ductwork, dim sodium light',
    expanse: 'a rehearsal room stripped to drywall and foam, upended music stands, bulletin glass reflecting the door repeats, dry stained floor',
  },
  // the chapel — the divine, the radiant, the unbearable
  lux_nova: {
    corridor: 'chapel side aisle, locked threshold, pale limestone, ribbed stone, organ pipes rising in darkness, cold clerestory light',
    expanse: 'a ruined nave with a clearly visible organ loft and side aisles, cold clerestory openings, pale mineral stains on stone',
  },
};

export function promptFor(worldId, inExpanse) {
  const w = WORLD_PROMPTS[worldId] || WORLD_PROMPTS.main_b3;
  return `${inExpanse ? w.expanse : w.corridor}, ${LENS}, ${FILM}`;
}
