// The park in the south-west yard.
//
// That quarter of the yard was fifty metres of wet tarmac with nothing on it —
// the player crossed it, or skirted it, and there was nothing there. It is a
// municipal park now: lawn, two crossing paths, a fountain at the crossing, and
// the upper half of a marble head lying face up in the water.
//
// The ground is not here. Grass, paths and basin are authored as glyphs in
// floorplan/conservatory.js so that they are real underfoot — the footsteps
// change, and the rain reads foliage rather than tarmac. This file is what
// stands on it.
//
// Coordinates are authored logical metres, the same as the rest of the yard:
// the yard island is parked at logical (50, 200) with a physical origin of
// (0, 0), so a prop at physical (10, 36) is written here as (60, 236).

const freeze = (value) => Object.freeze(value);

// Physical metres, matching YARD_PARK in floorplan/conservatory.js. Kept here
// as well because the runtime asks the park where it is and should not have to
// import the floorplan to find out.
export const YARD_PARK = freeze({
  id: 'ellery-yard-park',
  bounds: freeze({ x0: 51, x1: 69, y0: 222, y1: 250 }),
  // The way in: the head of the north-south path, off the yard's tarmac.
  entrance: freeze({ x: 60, y: 222 }),
  fountainId: 'yard-park-fountain',
  headId: 'yard-park-eyes',
});

export const YARD_PARK_MESHES = freeze({
  // Seven metres of tiered municipal fountain, and still running. The basin
  // FLOOR is a glyph — 0.30m down, in wetTile, which is the address the water
  // pass looks a body up by — so a basin modelled here as well would put a
  // stone lid over the water. Everything above that surface is the mesh's:
  // kerb, two bowls, and the water in the air between them.
  park_fountain: freeze({ w: 7.0, d: 7.0, h: 4.4, blocks: false }),
  // Two marble eyes among the pennies. Coin-scale on purpose — see the builder.
  park_marble_eyes: freeze({ w: .80, d: .80, h: .06, blocks: false }),
});

export const YARD_PARK_PROPS = freeze([
  // The fountain sits on the crossing. Non-blocking: you step down into it,
  // because the thing in the water has to be reachable without inventing a way
  // to lean over a rim.
  freeze({ id: 'yard-park-fountain', mesh: 'park_fountain', x: 60.5, y: 236.5, yaw: 0, scale: 1, interactive: false, structural: true, blocks: false }),

  // Benches, flanking the fountain on the east-west path and turned to face it.
  // Pushed back when the basin went from three metres to seven — they used to
  // sit where the kerb now is.
  freeze({ id: 'yard-park-bench-west', mesh: 'district_bench', x: 55.0, y: 234.4, yaw: 0, scale: 1, interactive: false, structural: true, blocks: false }),
  freeze({ id: 'yard-park-bench-east', mesh: 'district_bench', x: 65.6, y: 238.0, yaw: Math.PI, scale: 1, interactive: false, structural: true, blocks: false }),

  // One tree in each lawn quarter, off the paths by more than their own spread.
  freeze({ id: 'yard-park-tree-nw', mesh: 'opening_street_tree_small', x: 54.5, y: 227, yaw: .31, scale: 1, interactive: false, structural: true, blocks: false }),
  freeze({ id: 'yard-park-tree-ne', mesh: 'opening_street_tree_small', x: 65.5, y: 226.5, yaw: -.62, scale: 1, interactive: false, structural: true, blocks: false }),
  freeze({ id: 'yard-park-tree-sw', mesh: 'opening_street_tree_small', x: 54, y: 244.5, yaw: 1.04, scale: 1, interactive: false, structural: true, blocks: false }),
  freeze({ id: 'yard-park-tree-se', mesh: 'opening_street_tree_small', x: 65, y: 245, yaw: -.18, scale: 1, interactive: false, structural: true, blocks: false }),

  // Hedge along the west and south edges. These block, and that is the point:
  // the park has one way in, at the head of its path, so it reads as a place you
  // enter rather than a texture you walk over. The east side is left open to the
  // yard, where yard-fence-west already runs out.
  freeze({ id: 'yard-park-hedge-west-north', mesh: 'yard_hedge_run', blocks: true, x: 51, y: 227.8, yaw: 0, scale: 1, interactive: false, structural: true }),
  freeze({ id: 'yard-park-hedge-west-south', mesh: 'yard_hedge_run', blocks: true, x: 51, y: 239.4, yaw: 0, scale: 1, interactive: false, structural: true }),
  freeze({ id: 'yard-park-hedge-south-west', mesh: 'yard_hedge_run', blocks: true, x: 56, y: 250.6, yaw: Math.PI / 2, scale: 1, interactive: false, structural: true }),
  freeze({ id: 'yard-park-hedge-south-east', mesh: 'yard_hedge_run', blocks: true, x: 64, y: 250.6, yaw: Math.PI / 2, scale: 1, interactive: false, structural: true }),

  // THE EYES. In the water, off the pedestal so the falls do not sit on top of
  // them and the silt does not take them. There is no `action` on this any more:
  // picking them up is a decision, not a keypress, and the decision lives in
  // main.js's interactParkEyes — see game/marble-head.js.
  //
  // The label says pennies because that is what they are until the torch is on
  // them, which is the whole beat.
  freeze({
    id: 'yard-park-eyes', mesh: 'park_marble_eyes',
    x: 61.4, y: 237.4, yaw: -.42, scale: 1,
    interactionPriority: 5,
    label: 'the coins in the basin',
    inspect: freeze({
      first: 'Pennies, mostly. Somebody has been wishing on a fountain outside a building that closed.',
      again: 'Coins, and the silt they are going into.',
    }),
  }),

  // The one lamp that still works out here, at the corner of the crossing.
  freeze({ id: 'yard-park-lamp', mesh: 'yard_lamp_column', x: 64.8, y: 231.4, yaw: Math.PI, scale: 1, interactive: false, structural: true, blocks: true }),
]);
