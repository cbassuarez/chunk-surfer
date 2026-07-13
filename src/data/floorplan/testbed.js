// A test building. Not content — a proof that the sector renderer draws what
// collision believes: a room, a corridor, a stair that actually climbs, a tall
// room at the top, a bricked door, and a shaft open to the dark.
//
// Three lessons, all of which apply to the real building:
//   · A four-metre climb needs eleven cells to keep every riser under 0.45m.
//     Six cells would be a ladder. Stairwells eat plan.
//   · Levels are rectangles drawn in order, so a later level's wall will
//     happily seal an earlier level's corridor. The regions have to mesh.
//   · A one-cell corridor is a coffin and a 8x7 room is a cupboard. At one
//     metre per cell, a corridor wants three cells and a room wants twelve.
//
// Used by tools/chunk_surfer/tests/floorplan.mjs and by `?plan=testbed`.

export const testbed = {
  width: 56,
  height: 30,
  spawn: { x: 6, y: 6 },
  doors: [{ x: 12, y: 6, key: 'master' }],
  levels: [
    {
      // ── lower: studio B3, a wide corridor east, a dead branch south ───────
      origin: { x: 0, y: 0 },
      base: 0,
      rows: [
        '########################################################',
        '#############...........................################',
        '#BBBBBBBBBBB#...........................################',
        '#BBBBBBBBBBB#...........................################',
        '#BBBBBBBBBBB#############...############################',
        '#BBBBBBBBBBB#############...############################',
        '#BBBBBBBBBBB+...........................################',
        '#BBBBBBBBBBB#...........................################',
        '#BBBBBBBBBBB#...........................################',
        '#BBBBBBBBBBB#############...############################',
        '#BBBBBBBBBBB#############...############################',
        '#BBBBBBBBBBB##############x#############################',
        '#########################...############################',
        '#############################...########################',
        '########################################################',
      ],
    },
    {
      // ── the stair hall. Its whole west edge is open, so both corridors
      //    meet it. (An earlier version opened only two rows and the building
      //    was quietly impassable — the reachability print in floorplan.mjs is
      //    what found it.)
      origin: { x: 24, y: 1 },
      base: 0,
      rows: [
        '###########################',
        '#,,,,,,,,,,,,,,,,,,,,,,,,,#',
        ',,,,,,,,,,,,,,,,,,,,,,,,,,#',
        ',,,,,,,,,,,,,,,,,,,,,,,,,,#',
        ',,,,,,,,,,,,,,,,,,,,,,,,,,#',
        ',,,,,ooo,,,,,,,,,,,,,,,,,,#',   // the shaft: open to a black nothing
        '#,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '#,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '###########################',
      ],
      stairs: [
        // (30,4) → (40,4), three cells wide, 0 → 4.0m. Eleven risers of 0.4m.
        { from: { x: 30, y: 4 }, to: { x: 40, y: 4 }, fromH: 0, toH: 4.0, width: 3 },
      ],
    },
    {
      // ── the landing at the top of the stair ───────────────────────────────
      origin: { x: 41, y: 1 },
      base: 4.0,
      rows: [',,,', ',,,', ',,,', ',,,'],
    },
    {
      // ── upper: the chapel. Four metres up, eleven metres of nave. ─────────
      origin: { x: 43, y: 1 },
      base: 4.0,
      rows: [
        '#############',
        'CCCCCCCCCCCC#',   // open at x=43, meets the landing
        'CCCCCCCCCCCC#',
        'CCCCCCCCCCCC#',
        '#CCCCCCCCCCC#',
        '#CCCCCCCCCCC#',
        '#CCCCCCCCCCC#',
        '#CCCCCCCCCCC#',
        '#CCCCCCCCCCC#',
        '#############',
      ],
    },
  ],
};
