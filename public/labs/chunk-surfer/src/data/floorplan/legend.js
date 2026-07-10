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

export const AUTHOR_CELL = 1.0;   // metres per authored floorplan glyph
export const CELL = 0.5;          // metres per runtime cell
export const PLAN_SCALE = AUTHOR_CELL / CELL;
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

// Surface identity is deliberately not packed into F. Flags are collision and
// traversal. Materials are a parallel texture channel for the renderer.
export const MATERIAL = {
  none: 0,
  serviceConcrete: 1,
  acousticFoam: 2,
  poolTile: 3,
  wetTile: 4,
  woodVelvet: 5,
  practiceFoam: 6,
  chapelStone: 7,
  metalPlant: 8,
  doorGlassDuct: 9,
};

export function materialForZone(zone) {
  switch (zone) {
    case ZONE.studio: return MATERIAL.acousticFoam;
    case ZONE.natatorium: return MATERIAL.poolTile;
    case ZONE.hall: return MATERIAL.woodVelvet;
    case ZONE.practice: return MATERIAL.practiceFoam;
    case ZONE.chapel: return MATERIAL.chapelStone;
    case ZONE.plant: return MATERIAL.metalPlant;
    default: return MATERIAL.serviceConcrete;
  }
}

// The characters you draw with.
//
//   floor / ceil are metres. Room heights carry most of the sense of scale:
//   the studio is a low dead box, the chapel is a nave.
export const GLYPHS = {
  ' ': null,                                                   // outside the building
  '#': { solid: true },                                        // wall / rock
  '.': { floor: 0.0, ceil: 3.6, mutable: true, material: 'serviceConcrete' }, // corridor (may change)
  ',': { floor: 0.0, ceil: 3.6, material: 'serviceConcrete' },                // corridor, fixed
  '+': { floor: 0.0, ceil: 2.9, door: true, material: 'doorGlassDuct' },       // door
  'x': { floor: 0.0, ceil: 2.9, door: true, bricked: true, material: 'doorGlassDuct' },
  '=': { floor: 0.0, ceil: 2.2, material: 'doorGlassDuct' },                  // low duct
  '/': { floor: 0.0, ceil: 3.0, stair: true, material: 'serviceConcrete' },    // stair
  'o': { floor: 0.0, ceil: 8.0, sky: true, material: 'metalPlant' },           // shaft, open above

  // Rooms. The letter is the zone; the height is the room.
  'D': { floor: 0.0, ceil: 4.6, zone: 'dock', material: 'serviceConcrete' },
  'F': { floor: 0.0, ceil: 4.5, zone: 'foyer', material: 'serviceConcrete' },
  'B': { floor: 0.0, ceil: 3.2, zone: 'studio', material: 'acousticFoam' },
  'T': { floor: 0.0, ceil: 6.5, zone: 'natatorium', material: 'poolTile' },
  'W': { floor: -1.6, ceil: 6.5, zone: 'natatorium', material: 'wetTile' },
  'H': { floor: 0.0, ceil: 9.0, zone: 'hall', material: 'woodVelvet' },
  'P': { floor: 0.0, ceil: 3.4, zone: 'practice', material: 'practiceFoam' },
  'C': { floor: 0.0, ceil: 11.0, zone: 'chapel', material: 'chapelStone' },
  'M': { floor: 0.0, ceil: 3.8, zone: 'plant', material: 'metalPlant' },
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
    material: MATERIAL[g.material] || materialForZone(ZONE[g.zone ?? 'none']),
  };
}
