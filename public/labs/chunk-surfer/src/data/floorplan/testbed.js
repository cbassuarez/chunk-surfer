// A test building. Not content — a proof that the sector renderer draws what
// collision believes: a low room, a corridor, a stair that actually climbs, a
// tall room at the top, a bricked door, and a shaft open to the dark.
//
// Two lessons the compiler taught, both true of the real building:
//   · A four-metre climb needs eleven cells to keep every riser under 0.45m.
//     Six cells would be a ladder. Stairwells eat plan.
//   · Levels are rectangles drawn over one another in order, so a later level's
//     wall will happily seal an earlier level's corridor. Regions must mesh.
//
// Used by tools/chunk_surfer/tests/floorplan.mjs and by `?plan=testbed`.

export const testbed = {
  width: 48,
  height: 32,
  spawn: { x: 4, y: 5 },
  doors: [{ x: 9, y: 5, key: 'master' }],
  levels: [
    {
      // ── lower: studio B3, a corridor east, a dead branch south ────────────
      origin: { x: 0, y: 0 },
      base: 0,
      rows: [
        '################################################',
        '#BBBBBBBB#######################################',
        '#BBBBBBBB#######################################',
        '#BBBBBBBB#######################################',
        '#BBBBBBBB#######################################',
        '#BBBBBBBB+.......###############################',
        '#BBBBBBBB###.###################################',
        '#BBBBBBBB###.###################################',
        '###########x####################################',   // bricked: it was a door once
        '###########,####################################',
        '###########,####################################',
        '################################################',
      ],
    },
    {
      // ── the stair hall. Its west edge is open, so the corridor meets it. ──
      origin: { x: 16, y: 4 },
      base: 0,
      rows: [
        '#################',
        ',,,,,,,,,,,,,,,,#',   // y=5: open at x=16, meets the corridor
        '#,,,,,,,,,,,,,,,#',
        '#,,,,,,,,,,,,,,,#',
        '#,ooo,,,,,,,,,,,#',   // the shaft: open to a black nothing above
        '#################',
      ],
      stairs: [
        // (20,5) → (30,5), two cells wide, 0 → 4.0m. Eleven risers of 0.4m.
        { from: { x: 20, y: 5 }, to: { x: 30, y: 5 }, fromH: 0, toH: 4.0, width: 2 },
      ],
    },
    {
      // ── the landing at the top of the stair ───────────────────────────────
      origin: { x: 31, y: 5 },
      base: 4.0,
      rows: [',,'],
    },
    {
      // ── upper: the chapel. Four metres up, eleven metres of nave. ─────────
      origin: { x: 33, y: 2 },
      base: 4.0,
      rows: [
        '#############',
        '#CCCCCCCCCCC#',
        '#CCCCCCCCCCC#',
        'CCCCCCCCCCCC#',   // y=5: open at x=33, meets the landing
        '#CCCCCCCCCCC#',
        '#CCCCCCCCCCC#',
        '#CCCCCCCCCCC#',
        '#############',
      ],
    },
  ],
};
