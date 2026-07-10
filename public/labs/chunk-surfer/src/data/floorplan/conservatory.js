// THE CONSERVATORY. Condemned, powered down, days from demolition.
//
// Three levels, UNFOLDED across one plane. A sector renderer cannot put a room
// directly above another room, so each level owns a region and the stairwells
// climb as they run. In first person the seam does not exist.
//
//   sub-basement  (left, -4m)    studio B3 · the plant room · the dead lift shaft
//   ground        (top right)    loading dock · foyer · concert hall · the natatorium
//   upper         (lower right, +4m)   the practice wing · the chapel
//
// You carry the standard keyring. It does not open everything. The building has
// changed since it was working, and again since the last recordist walked it:
// the foyer door onto the concert hall is bricked up, and the chapel is locked
// with a key nobody gave you. Both have another way in. They always do.
//
// The engine holds no geometry — edit these maps freely. To find a building
// that has quietly sealed itself:
//
//   node tools/chunk_surfer/tests/floorplan.mjs --plan=conservatory --map

export const conservatory = {
  width: 116,
  height: 80,
  // The service entrance. A bag, a work order, and a radio that will fail.
  spawn: { x: 65, y: 20 },
  doors: [
    { x: 25, y: 12, key: 'master' },   // studio B3 → the plant room
    { x: 65, y: 16, key: 'master' },   // the dock's inner door
    { x: 74, y: 11, key: 'master' },   // dock → foyer
    { x: 87, y: 55, key: 'chapel' },   // the chapel. You were not given this one.
  ],
  levels: [
    {
      // ── sub-basement, four metres down ─────────────────────────────────────
      origin: { x: 0, y: 0 }, base: -4.0,
      rows: [
        ' ',
        ' ',
        ' ',
        ' ',
        ' ',
        '     #####################   #############',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMMM#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#####',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#ooo#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#ooo#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMM#ooo#',
        '     #BBBBBBBBBBBBBBBBBBB#####MMMMMMMMMM##.##',
        '     #BBBBBBBBBBBBBBBBBBB+....MMMMMMMMMMM#.#',
        '     #BBBBBBBBBBBBBBBBBBB#####MMMMMMMMMMM#.#',
        '     #BBBBBBBBBBBBBBBBBBB#   #MMMMMMMMMMM#.#',
        '     #BBBBBBBBBBBBBBBBBBB#   ######.######.#',
        '     #BBBBBBBBBBBBBBBBBBB#        #.#    #.#',
        '     #BBBBBBBBBBBBBBBBBBB#        #.#    #.#',
        '     #BBBBBBBBBBBBBBBBBBB#        #.#    #.#',
        '     ##########.##########        #.#    #.#',
        '              #.#                 #.#    #.#',
        '     ##########.###################.######.#####',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     ###########################################',
        ' ',
        ' ',
        ' ',
        ' ',
        ' ',
        ' ',
      ],
    },
    {
      // ── ground ─────────────────────────────────────────────────────────────
      origin: { x: 50, y: 0 }, base: 0,
      rows: [
        ' ',
        ' ',
        ' ',
        '       ################# ################# ###################',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD###FFFFFFFFFFFFFFF###HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD.+.FFFFFFFFFFFFFFF.x.HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD###FFFFFFFFFFFFFFF###HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       #DDDDDDDDDDDDDDD# #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '       ########.######## #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '              #+#        #FFFFFFFFFFFFFFF# #HHHHHHHHHHHHHHHHH#',
        '              #.#        ########.######## #HHHHHHHHHHHHHHHHH#',
        '              #.#               #.#        #HHHHHHHHHHHHHHHHH#',
        '              #.#               #.#        #HHHHHHHHHHHHHHHHH#',
        '              #.#               #.#        #HHHHHHHHHHHHHHHHH#',
        ' ##############.###########     #.#        #HHHHHHHHHHHHHHHHH#',
        ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#.#        #HHHHHHHHHHHHHHHHH#',
        ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#.#        #HHHHHHHHHHHHHHHHH#',
        ' #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#.#        #HHHHHHHHHHHHHHHHH#',
        ' ##########,###############     #.#        #HHHHHHHHHHHHHHHHH#',
        '          #,#                   #.#        #HHHHHHHHHHHHHHHHH#',
        '          #,#            ########.##########.#################',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTWWWWWWWWWWWTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #TTTTTTTTTTTTTTTTTTT#',
        '          #,#            #####################',
      ],
      stairs: [
        // Into the drained pool: 0 → -1.6m over five cells. Not a step. Steps.
        { from: { x: 84, y: 31 }, to: { x: 84, y: 35 }, fromH: 0, toH: -1.6, width: 3, ceil: 6.5 },
      ],
    },
    {
      // ── upper, four metres up ──────────────────────────────────────────────
      origin: { x: 50, y: 44 }, base: 4.0,
      rows: [
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '          #,#',
        '     ######,####################################',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     #,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#',
        '     ########.#######################+#######=##',
        '            #.#                     #.#     #=#',
        '     ########.############ ##########.#######=##########',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     #PPPPPPPPPPPPPPPPPPP# #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '     ##################### #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #CCCCCCCCCCCCCCCCCCCCCCCCCCC#',
        '                           #############################',
        ' ',
        ' ',
      ],
      stairs: [
        // Stair A: the ground spine down to the basement. 0 → -4.0m, 11 cells.
        { from: { x: 57, y: 22 }, to: { x: 47, y: 22 }, fromH: 0, toH: -4.0, width: 3 },
        // Stair B: the shaft up to the practice wing. 0 → 4.0m, 11 cells.
        { from: { x: 60, y: 41 }, to: { x: 60, y: 51 }, fromH: 0, toH: 4.0, width: 3 },
      ],
    },
  ],
};
