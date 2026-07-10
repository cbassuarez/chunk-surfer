// The floorplan legend.
//
// Levels are drawn as ASCII. One character per cell. This file is the contract
// between what you type and what the building becomes — the engine holds no
// geometry, and the maps hold no code.
//
// A cell has: a floor height, a ceiling height, some flags, and a zone.
// Heights are in metres. The eye sits 1.62m above the floor.
//
// UNFOLDING: a sector renderer cannot put one room above another at the same
// (x,z). The three levels therefore occupy three regions of one plane, and the
// stairwells rise as they run. In first person this is invisible.

export const CELL = 1.0;          // metres per cell
export const EYE = 1.62;
export const STEP_UP = 0.45;      // the tallest riser a person takes without thinking
export const HEADROOM = 1.80;     // below this you do not fit

// Flags (bitfield, one byte)
export const F = {
  SOLID:    1 << 0,   // rock. never enterable.
  DOOR:     1 << 1,   // passable if you hold the key (or it is unlocked)
  SKY:      1 << 2,   // no ceiling: open to a black nothing
  MUTABLE:  1 << 3,   // the building may rearrange this cell — corridors only
  STAIR:    1 << 4,   // never mutates, never bricked
  BRICKED:  1 << 5,   // a door that has been filled in since he came through
};

// Zones map to rooms (audio/manifest-map.js) → lens prompt, seed, room tone.
export const ZONE = {
  none: 0,
  dock: 1,
  foyer: 2,
  studio: 3,        // main_b3
  natatorium: 4,    // the_tub
  hall: 5,          // amplifications
  practice: 6,      // soundnoisemusic
  chapel: 7,        // lux_nova
  plant: 8,
  stair: 9,
};

// Which world (audio + prompt) a zone belongs to. Corridors borrow the room
// they lead to, so the lens never has a zone it has no prompt for.
export const ZONE_WORLD = {
  [ZONE.none]: 'main_b3',
  [ZONE.dock]: 'main_b3',
  [ZONE.foyer]: 'amplifications',
  [ZONE.studio]: 'main_b3',
  [ZONE.natatorium]: 'the_tub',
  [ZONE.hall]: 'amplifications',
  [ZONE.practice]: 'soundnoisemusic',
  [ZONE.chapel]: 'lux_nova',
  [ZONE.plant]: 'main_b3',
  [ZONE.stair]: 'main_b3',
};

// The characters you draw with.
//
//   floor / ceil are metres. Room heights carry most of the sense of scale:
//   the studio is a low dead box, the chapel is a nave.
export const GLYPHS = {
  ' ': null,                                                   // outside the building
  '#': { solid: true },                                        // wall / rock
  '.': { floor: 0.0, ceil: 3.0, mutable: true },               // corridor (may change)
  ',': { floor: 0.0, ceil: 3.0 },                              // corridor, fixed
  '+': { floor: 0.0, ceil: 2.4, door: true },                  // door
  'x': { floor: 0.0, ceil: 2.4, door: true, bricked: true },   // door, filled in
  '=': { floor: 0.0, ceil: 2.2 },                              // low duct / crawl
  '/': { floor: 0.0, ceil: 3.0, stair: true },                 // stair (height set per-run)
  'o': { floor: 0.0, ceil: 8.0, sky: true },                   // shaft, open above

  // Rooms. The letter is the zone; the height is the room.
  'D': { floor: 0.0, ceil: 4.2, zone: 'dock' },
  'F': { floor: 0.0, ceil: 4.0, zone: 'foyer' },
  'B': { floor: 0.0, ceil: 2.5, zone: 'studio' },       // B3: low, dead, absorbent
  'T': { floor: 0.0, ceil: 6.5, zone: 'natatorium' },    // tiled volume
  'W': { floor: -1.6, ceil: 6.5, zone: 'natatorium' },   // the drained pool: you climb down
  'H': { floor: 0.0, ceil: 9.0, zone: 'hall' },          // the concert hall
  'P': { floor: 0.0, ceil: 2.8, zone: 'practice' },
  'C': { floor: 0.0, ceil: 11.0, zone: 'chapel' },       // the nave
  'M': { floor: 0.0, ceil: 3.2, zone: 'plant' },         // plant room
};

// Resolve a glyph to a cell descriptor. `base` lifts a whole level (unfolding
// is horizontal, but the levels still sit at different heights, so the stairs
// have somewhere to go).
export function cellFor(ch, base = 0) {
  const g = GLYPHS[ch];
  if (g === undefined) throw new Error(`floorplan: unknown glyph ${JSON.stringify(ch)}`);
  if (g === null) return null;                       // void: outside the building
  if (g.solid) return { solid: true };

  let flags = 0;
  if (g.door) flags |= F.DOOR;
  if (g.bricked) flags |= F.BRICKED;
  if (g.sky) flags |= F.SKY;
  if (g.mutable) flags |= F.MUTABLE;
  if (g.stair) flags |= F.STAIR;

  return {
    floor: base + (g.floor ?? 0),
    ceil: base + (g.ceil ?? 3.0),
    flags,
    zone: ZONE[g.zone ?? 'none'],
  };
}
