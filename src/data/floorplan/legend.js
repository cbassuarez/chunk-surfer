// The floorplan legend.
//
// Levels are drawn as ASCII. One character per cell. This file is the contract
// between what you type and what the building becomes — the engine holds no
// geometry, and the maps hold no code.
//
// A cell has: a floor height, a ceiling height, some flags, and a zone.
// Heights are in metres. The eye sits 1.62m above the floor.
//
// Logical drawings may occupy separate regions, but each cell also compiles to
// a Euclidean physical X/Z and vertical span. That keeps saves and pathfinding
// stable without making the rendered building non-Euclidean.

export const AUTHOR_CELL = 1.0;   // metres per authored floorplan glyph
export const CELL = 0.5;          // metres per runtime cell
export const PLAN_SCALE = AUTHOR_CELL / CELL;
export const EYE = 1.62;
// The baked per-cell ambient (world/floorplan.js bakeAmbientField) is a
// multiplier on the zone ambient, carried in one byte of the material texture's
// G channel. This is the encode both ends share: byte 255 means this multiplier,
// so 255/scale is neutral 1.0 and an unbaked plan slice renders unchanged.
export const AMBIENT_PLACE_SCALE = 4.0;
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
  CLOSED:   1 << 6,   // a real leaf is present; [E] must open the whole portal
  // Open to the sky, but STANDING IN A BUILDING that has a real height.
  //
  // r3d draws the wall beside a sky cell up to that cell's ceiling, and then
  // clobbers the ceiling of every sky cell to 90m so the ray can leave. For the
  // yard and the lift shaft that is right — nothing solid stands close enough to
  // either for the height to read. For a bay with walls on three sides it is a
  // canyon: three black slabs ninety metres tall against a lit sky, which is
  // exactly why the apron was roofed instead of opened.
  //
  // WALLED says: let the ray out, but draw the walls to the ceiling I authored.
  // Sky above, building around you. See cellAt in render/r3d.js.
  WALLED:   1 << 7,
};

// Zones map to rooms (audio/manifest-map.js) → lens prompt, seed, room tone.
export const ZONE = {
  none: 0,
  // The real loading bay: apron and yard, open to the west and to the weather.
  // Everything the lorry ever touched. See getIn for the room behind it.
  dock: 1,
  foyer: 2,
  studio: 3,        // main_b3
  natatorium: 4,    // the_tub
  hall: 5,          // amplifications
  practice: 6,      // soundnoisemusic
  chapel: 7,        // lux_nova
  plant: 8,
  stair: 9,
  sourceSpace: 10,
  chapelOuter: 11,
  bellTower: 12,
  academic: 13,
  danceStudio: 14,  // the sub-basement dance wing. B3 is one of these rooms — it
                    // is simply the one with a take on it, which is why it alone
                    // keeps ZONE.studio and its place in ZONE_RECORDING_ROOM.
                    // The rest are rooms you walk, not takes you roll.
  store: 15,        // the costume and prop store at the corridor's dead end
  // THE GET-IN. What used to be called the loading dock, which it never was: a
  // sealed room with no way for a lorry into it. It is the room a loading bay
  // leads to — where a show is checked in, staged, and taken apart again. The
  // last load-out is still standing in it.
  getIn: 16,
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
  [ZONE.danceStudio]: 'main_b3',
  [ZONE.store]: 'main_b3',
  [ZONE.stair]: 'main_b3',
  [ZONE.sourceSpace]: 'source_space',
  [ZONE.chapelOuter]: 'chapel_outer',
  [ZONE.bellTower]: 'bell_tower',
  // The academic floor is intentionally not a recording room. It borrows the
  // public atrium's acoustic world without acquiring a take target of its own.
  [ZONE.academic]: 'amplifications',
  // The get-in borrows B3's dead box, as the old dock room always did. That
  // shared world id is why LEVEL_CHECK_ROOM exists: a level check taken here
  // must not be filed as a B3 take.
  [ZONE.getIn]: 'main_b3',
};

// Surface identity is deliberately not packed into F. Flags are collision and
// traversal. Materials are a parallel texture channel for the renderer.
export const MATERIAL = {
  none: 0,
  serviceConcrete: 1,
  // NOT AUTHORED ANYWHERE. Studio B3 was its only user until B3 was resolved as
  // one of the dance studios and took their sprung maple. The id stays reserved
  // and r3d.js keeps its branches — a treated room may want them again — but no
  // glyph and no zone currently reaches them.
  acousticFoam: 2,
  poolTile: 3,
  wetTile: 4,
  woodVelvet: 5,
  practiceFoam: 6,
  chapelStone: 7,
  metalPlant: 8,
  doorGlassDuct: 9,
  sourceField: 10,
  sourcePath: 11,
  sourcePage: 12,
  sourceFault: 13,
  academicPlaster: 14,
  // Wet tarmac. The only ground in this game that is outdoors, and the reason
  // it needed its own id: the general floor slot in r3d's surfaceSlot() is ash
  // wood, so every serviceConcrete floor was being drawn as floorboards. Nobody
  // noticed indoors. Fifty metres of it under an open sky is a parquet yard.
  wetTarmac: 15,
};

export function materialForZone(zone) {
  switch (zone) {
    case ZONE.dock: return MATERIAL.wetTarmac;
    // B3 is a dance studio that happens to carry the take, so it is the same
    // sprung maple as the rest of the wing. It used to be acousticFoam, which
    // drew dark concrete cladding over a terrazzo floor and contradicted both
    // the room tone and the wing it stands in.
    case ZONE.studio: return MATERIAL.woodVelvet;
    case ZONE.natatorium: return MATERIAL.poolTile;
    case ZONE.hall: return MATERIAL.woodVelvet;
    case ZONE.practice: return MATERIAL.practiceFoam;
    case ZONE.chapel: return MATERIAL.chapelStone;
    case ZONE.chapelOuter: return MATERIAL.chapelStone;
    case ZONE.bellTower: return MATERIAL.chapelStone;
    case ZONE.academic: return MATERIAL.academicPlaster;
    case ZONE.plant: return MATERIAL.metalPlant;
    // Sprung maple and a mirrored wall — the same surface B3 has, because B3 is
    // one of these rooms.
    case ZONE.danceStudio: return MATERIAL.woodVelvet;
    case ZONE.sourceSpace: return MATERIAL.sourceField;
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
  '.': { floor: 0.0, ceil: 4.5, mutable: true, material: 'serviceConcrete' }, // corridor (may change)
  ',': { floor: 0.0, ceil: 4.5, material: 'serviceConcrete' },                // corridor, fixed
  '+': { floor: 0.0, ceil: 3.4, door: true, material: 'doorGlassDuct' },       // door centre; compiler widens aperture
  'x': { floor: 0.0, ceil: 3.4, door: true, bricked: true, material: 'doorGlassDuct' },
  '=': { floor: 0.0, ceil: 2.2, material: 'doorGlassDuct' },                  // low duct
  '/': { floor: 0.0, ceil: 3.0, stair: true, material: 'serviceConcrete' },    // stair
  'o': { floor: 0.0, ceil: 8.0, sky: true, material: 'metalPlant' },           // shaft, open above

  // Rooms. The letter is the zone; the height is the room.
  // THE LOADING BAY APRON, WHICH IS OUTSIDE.
  //
  // This was roofed at 5.5m and not sky, for two stated reasons. One was that
  // opening it would draw the bay's three walls as ninety-metre slabs — true,
  // and F.WALLED is what fixes it. The other was that the academic crown stands
  // over the apron, which is also true and is NOT fixed here: the academic floor
  // is a real physical span at 10.0m covering 168 of these 224 cells.
  //
  // So the ceiling sits flush under it at 10.0 rather than being removed. The
  // walls of the bay stand to the underside of the crown, the ray leaves above
  // them, and the sky the player gets is the sky over the yard and over the open
  // half of the apron. From the ground slice the crown is not drawn at all, so
  // nothing on screen contradicts this; in the building model it means a bay
  // that is open to the weather with a third floor above part of it. Cutting the
  // crown back over the bay is the honest fix and is a bigger change than this
  // one — it moves a floor of the academic wing. Flagged, not smuggled.
  'D': { floor: 0.0, ceil: 10.0, sky: true, walled: true, zone: 'dock', material: 'wetTarmac' },
  'I': { floor: 0.0, ceil: 5.5, zone: 'getIn', material: 'serviceConcrete' },
  // The yard beyond the bay mouth. Open to the weather, and walked: the gate,
  // the lodge and the dock steps are all out here. It also exists so the ray has
  // somewhere to go before it leaves the plan and becomes sky.
  //
  // WALLED, for the same reason the apron is. Without it every wall of the
  // conservatory facing this yard is drawn to the 90m ceiling r3d gives a sky
  // cell — a building with no top edge, standing in front of the moon. The
  // ceiling authored here is therefore not headroom; it is the height of the
  // building next to it, and `yardProfile` in floorplan/conservatory.js bands it
  // along the yard's depth so the west elevation has a roofline that varies.
  // 24.0 is the fallback for any cell the profile does not reach.
  'Y': { floor: 0.0, ceil: 24.0, sky: true, walled: true, zone: 'dock', material: 'wetTarmac' },
  // The dock edge: a kerb at the lip of the apron. Authored as a raised FLOOR
  // rather than as rock, because rock is drawn full height and this has to be a
  // thing you see over. canStep refuses the rise (0.80m against a 0.45m limit),
  // so it bounds the bay without being an invisible wall.
  //
  // 0.80 IS A CEILING, NOT A TASTE. physicalRenderPlanFor keeps only spans
  // within SPAN_WINDOW (1.0m) of the height the slice is built for, so a floor
  // more than a metre above the apron is dropped from the slice entirely and the
  // cell comes back solid — which draws the full-height black cliff this glyph
  // exists to avoid. Anything you want to see OVER has to stay inside that
  // window.
  'w': { floor: 0.8, ceil: 24.0, sky: true, walled: true, zone: 'dock', material: 'wetTarmac' },
  'F': { floor: 0.0, ceil: 6.5, zone: 'foyer', material: 'serviceConcrete' },
  'A': { floor: 0.0, ceil: 11.5, zone: 'foyer', material: 'serviceConcrete' },
  'B': { floor: 0.0, ceil: 3.2, zone: 'studio', material: 'woodVelvet' },
  'T': { floor: 0.0, ceil: 9.5, zone: 'natatorium', material: 'poolTile' },
  'W': { floor: -1.6, ceil: 9.5, zone: 'natatorium', material: 'wetTile' },
  'H': { floor: 0.0, ceil: 15.5, zone: 'hall', material: 'woodVelvet' },
  'S': { floor: -2.5, ceil: 15.5, zone: 'hall', material: 'woodVelvet' },
  'R': { floor: 2.5, ceil: 15.5, zone: 'hall', material: 'woodVelvet' },
  'h': { floor: 0.0, ceil: 3.8, zone: 'hall', material: 'woodVelvet' },
  'r': { floor: 2.5, ceil: 3.8, zone: 'hall', material: 'woodVelvet' },
  'L': { floor: 4.0, ceil: 7.3, zone: 'hall', material: 'woodVelvet' },
  'U': { floor: 7.5, ceil: 15.5, zone: 'hall', material: 'woodVelvet' },
  'P': { floor: 0.0, ceil: 4.2, zone: 'practice', material: 'practiceFoam' },
  'C': { floor: 0.0, ceil: 13.0, zone: 'chapel', material: 'chapelStone' },
  'N': { floor: 0.0, ceil: 3.4, zone: 'chapelOuter', material: 'chapelStone' },
  'G': { floor: 0.0, ceil: 4.2, zone: 'bellTower', material: 'chapelStone' },
  'M': { floor: 0.0, ceil: 3.8, zone: 'plant', material: 'metalPlant' },
  'Q': { floor: 0.0, ceil: 4.5, zone: 'academic', material: 'academicPlaster' },
  // ── the sub-basement dance wing ────────────────────────────────────────────
  // Taller than B3 and hard where B3 is soft: sprung maple, a mirrored wall, and
  // nothing on the work order. A room you cross, not a room you record.
  'K': { floor: 0.0, ceil: 3.6, zone: 'danceStudio', material: 'woodVelvet' },
  // The prop store: a step down, and a ceiling you can touch.
  'V': { floor: -0.35, ceil: 2.25, zone: 'store', material: 'serviceConcrete' },
  // Service corridor, fixed and LOW. The basement's two corridors are the worst
  // air in the building on purpose; nobody should want to linger in either.
  ';': { floor: 0.0, ceil: 2.45, material: 'serviceConcrete' },
  // The tank room, sunk half a step below the passage that serves it.
  'J': { floor: -0.40, ceil: 3.0, zone: 'plant', material: 'metalPlant' },
};

// Resolve a glyph to a cell descriptor. `base` lifts a whole physical level.
export function cellFor(ch, base = 0) {
  const g = GLYPHS[ch];
  if (g === undefined) throw new Error(`floorplan: unknown glyph ${JSON.stringify(ch)}`);
  if (g === null) return null;                       // void: outside the building
  if (g.solid) return { solid: true };

  let flags = 0;
  if (g.door) flags |= F.DOOR;
  if (g.bricked) flags |= F.BRICKED;
  if (g.sky) flags |= F.SKY;
  if (g.walled) flags |= F.WALLED;
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
