// ST BRENDAN'S — THE CHURCH ON THE TARMAC PAST THE PARK.
//
// One manifest, two consumers. floorplan/conservatory.js reads it to lay the
// rooms and derive the walls as glyphs; tools/chunk_surfer/build-props.mjs reads
// it to build the elevation mesh. That is the whole reason this file exists
// separately from either: an exterior modelled against a remembered plan drifts
// off it the first time a transept moves, and a church whose mesh and whose
// walls disagree is a church you can see through.
//
// ELLERY_MASSING does the same job for the conservatoire's own west elevation.
// This follows it.
//
// Coordinates are YARD-LOCAL metres, the same space as YARD_PARK: x across the
// yard, y increasing SOUTH, matching the yard slice's own rows.

const freeze = (value) => Object.freeze(value);

// It is cruciform, and it is authored as ROOMS rather than as a drawn map — the
// walls are DERIVED as the border of the interior, so a transept can move a
// metre without anyone having to re-draw a wall around it and get it wrong.
//
// North front onto the yard, so the walk down from the park arrives at the
// doors. Chancel at the south, against the perimeter.
export const CHURCH = freeze({
  tower:    freeze({ x0: 14, y0: 55, x1: 18, y1: 59 }),   // the west-work, centred on the front
  nave:     freeze({ x0:  9, y0: 61, x1: 23, y1: 79 }),
  transept: freeze({ x0:  6, y0: 71, x1: 26, y1: 77 }),   // the arms, crossing the nave
  chancel:  freeze({ x0: 12, y0: 81, x1: 20, y1: 86 }),
  // In order of arrival: the yard into the tower, the tower into the nave, the
  // nave into the chancel.
  doors: freeze([
    freeze({ x: 16, y: 54 }),
    freeze({ x: 16, y: 60 }),
    freeze({ x: 16, y: 80 }),
  ]),
});

export const CHURCH_BOUNDS = freeze({ x0: 4, y0: 53, x1: 28, y1: 88 });

// Room heights, and the glyphs that carry them. These are the AUTHORED ceilings
// in legend.js; the mesh reads them so a roof cannot end up under a vault or
// float above one.
export const CHURCH_HEIGHTS = freeze({
  tower: 18.0,     // 'X'
  nave: 13.0,      // 'Z' — nave, crossing and both transept arms
  chancel: 9.0,    // 'z'
});

// THE SKIN IS THE OUTER HALF OF THE WALL, AND ONLY THE OUTER HALF.
//
// A wall cell is a full authored metre of solid rock. Inside the church that
// rock is raymarched and you see its inner face; outside, the exterior slice
// carries no solid geometry at all and you see this mesh instead. Modelling the
// full metre would put mesh and rock in the same place — coincident surfaces,
// which z-fight — so the mesh occupies the outer part only and is buried inside
// the rock from within, where nothing can ever see it.
export const CHURCH_SKIN = 0.55;

const inRect = (x, y, r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

// Which room a cell belongs to, or null. Transepts share the nave's height
// because they are the same volume crossing it.
export function churchRoomAt(x, y) {
  if (inRect(x, y, CHURCH.tower)) return 'tower';
  if (inRect(x, y, CHURCH.nave) || inRect(x, y, CHURCH.transept)) return 'nave';
  if (inRect(x, y, CHURCH.chancel)) return 'chancel';
  return null;
}

export function churchDoorAt(x, y) {
  return CHURCH.doors.some((d) => d.x === x && d.y === y);
}

// Wall wherever a cell touches a room without being one. Eight-neighbour, so the
// inside corners of the crossing are closed.
export function churchWallAt(x, y) {
  if (!inRect(x, y, CHURCH_BOUNDS)) return false;
  if (churchRoomAt(x, y) || churchDoorAt(x, y)) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) if (churchRoomAt(x + dx, y + dy)) return true;
  }
  return false;
}

// The height the wall at this cell rises to: the tallest room it touches, so a
// transept gable does not get the chancel's eaves.
export function churchWallHeight(x, y) {
  let best = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const room = churchRoomAt(x + dx, y + dy);
      if (room) best = Math.max(best, CHURCH_HEIGHTS[room]);
    }
  }
  return best;
}

// Whether a wall cell faces the open air on a given side. The mesh only needs to
// dress the faces somebody can stand in front of.
export function churchWallExposed(x, y, dx, dy) {
  return churchWallAt(x, y) && !churchRoomAt(x + dx, y + dy) && !churchWallAt(x + dx, y + dy);
}
