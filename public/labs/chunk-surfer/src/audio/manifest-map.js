// Room → sound.
//
// The current audio is placeholder: five of Seb's existing pieces, standing in
// for five rooms of a conservatory. A boutique score replaces them later, plus
// authored stabs and cues.
//
// This file exists so that replacement is a DATA change and never a code change.
// Nothing downstream may hardcode `main_b3` or a path under /audio/. Ask here.

export const ROOMS = {
  main_b3: {
    label: 'studio B3',
    world: 'main_b3',                 // key into MANIFEST.worlds (audio source)
    roomTone: { character: 0.75 },    // absorbent: foam, carpet, dead air
    stabs: 'auto',                    // 'auto' = pick transients from the world
  },
  the_tub: {
    label: 'the natatorium',
    world: 'the_tub',
    roomTone: { character: 2.4 },     // tile and water: bright, long, cruel
    stabs: 'auto',
  },
  amplifications: {
    label: 'the concert hall',
    world: 'amplifications',
    roomTone: { character: 1.3 },
    stabs: 'auto',
  },
  soundnoisemusic: {
    label: 'the practice wing',
    world: 'soundnoisemusic',
    roomTone: { character: 1.0 },
    stabs: 'auto',
  },
  lux_nova: {
    label: 'the chapel',
    world: 'lux_nova',
    roomTone: { character: 1.9 },     // stone: a long tail on everything
    stabs: 'auto',
  },
};

export function roomFor(worldId) { return ROOMS[worldId] || ROOMS.main_b3; }
export function roomLabel(worldId) { return roomFor(worldId).label; }
export function roomToneCharacter(worldId) { return roomFor(worldId).roomTone.character; }
export const ROOM_IDS = Object.keys(ROOMS);
