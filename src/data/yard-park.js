// The park in the south-west yard.
//
// That quarter of the yard was fifty metres of wet tarmac with nothing on it —
// the player crossed it, or skirted it, and there was nothing there. It is a
// municipal park now: lawn, two crossing paths, a fountain at the crossing, and
// two mineral eyes lying face up among the fountain's coins.
//
// The ground is not here. Grass, paths and basin are authored as glyphs in
// floorplan/conservatory.js so that they are real underfoot — the footsteps
// change, and the rain reads foliage rather than tarmac. This file is what
// stands on it.
//
// Coordinates are authored logical metres, the same as the rest of the yard:
// the yard island is parked at logical (50, 200) with a physical origin of
// (0, 0), so a prop at physical (10, 36) is written here as (60, 236).

import { VEGETATION_FALLBACKS } from './vegetation.js';
import { EXTERIOR_FOREGROUND, foregroundYardLogicalPoint } from './exterior-foreground.js';

const freeze = (value) => Object.freeze(value);

// Stable logical addresses derive from the shared physical garden contract.
// The floorplan and new geometry consume that same contract.
export const YARD_PARK = freeze({
  id: 'ellery-yard-park',
  bounds: freeze({
    x0: EXTERIOR_FOREGROUND.garden.cellBounds.x0 + EXTERIOR_FOREGROUND.yardOrigin.x,
    x1: EXTERIOR_FOREGROUND.garden.cellBounds.x1 + EXTERIOR_FOREGROUND.yardOrigin.x,
    y0: EXTERIOR_FOREGROUND.garden.cellBounds.z0 + EXTERIOR_FOREGROUND.yardOrigin.y,
    y1: EXTERIOR_FOREGROUND.garden.cellBounds.z1 + EXTERIOR_FOREGROUND.yardOrigin.y,
  }),
  // The way in: the head of the north-south path, off the yard's tarmac.
  entrance: freeze(foregroundYardLogicalPoint(EXTERIOR_FOREGROUND.garden.entrance)),
  fountainId: 'yard-park-fountain',
  headId: 'yard-park-eyes',
});

export const YARD_PARK_MESHES = freeze({
  // Seven metres of tiered municipal fountain, and still running. The basin
  // FLOOR is a glyph — 0.30m down, in wetTile, which is the address the water
  // pass looks a body up by — so a basin modelled here as well would put a
  // stone lid over the water. Everything above that surface is the mesh's:
  // kerb, two bowls, and the water in the air between them.
  park_fountain: freeze({ w: 7.71, d: 7.71, h: 5.05, blocks: false }),
  // Two marble eyes. Coins are their own mesh, and stay when the eyes leave.
  park_marble_eyes: freeze({ w: .19, d: .15, h: .06, blocks: false }),
  park_fountain_coins: freeze({ w: .80, d: .80, h: .01, blocks: false }),
});

export const YARD_PARK_PROPS = freeze([
  // The fountain sits on the crossing. Non-blocking: you step down into it,
  // because the thing in the water has to be reachable without inventing a way
  // to lean over a rim.
  freeze({ id: 'yard-park-fountain', mesh: 'park_fountain', x: 60.5, y: 236.5, yaw: 0, scale: 1, interactive: false, structural: true, blocks: false }),

  // The back slats occupy local +Z, so the seats face local -Z. Recess both
  // benches beyond the fountain apron, with their open faces toward the water.
  ...EXTERIOR_FOREGROUND.garden.benches.map(({id,x,z,yaw})=>freeze({
    id, mesh:'district_bench', ...foregroundYardLogicalPoint({x,z}), yaw,
    scale:1, interactive:false, structural:true, blocks:false,
  })),

  // One tree in each lawn quarter, off the paths by more than their own spread.
  freeze({ id: 'yard-park-tree-nw', mesh: 'opening_street_tree_small', x: 54.5, y: 227, yaw: .31, scale: .94, interactive: false, structural: true, blocks: false }),
  freeze({ id: 'yard-park-tree-ne', mesh: 'opening_street_tree_small_b', fallbackMesh:VEGETATION_FALLBACKS.opening_street_tree_small_b, x: 65.5, y: 226.5, yaw: -.62, scale: 1.04, interactive: false, structural: true, blocks: false }),
  freeze({ id: 'yard-park-tree-sw', mesh: 'opening_street_tree_small_c', fallbackMesh:VEGETATION_FALLBACKS.opening_street_tree_small_c, x: 54, y: 244.5, yaw: 1.04, scale: .98, interactive: false, structural: true, blocks: false }),
  freeze({ id: 'yard-park-tree-se', mesh: 'opening_street_tree_small_b', fallbackMesh:VEGETATION_FALLBACKS.opening_street_tree_small_b, x: 65, y: 245, yaw: -.18, scale: 1.08, interactive: false, structural: true, blocks: false }),

  // Hedge along the west and south edges. These block, and that is the point:
  // the park has one way in, at the head of its path, so it reads as a place you
  // enter rather than a texture you walk over. The east side is left open to the
  // yard, where yard-fence-west already runs out.
  freeze({ id: 'yard-park-hedge-west-north', mesh: 'yard_hedge_dense', fallbackMesh:VEGETATION_FALLBACKS.yard_hedge_dense, blocks: true, x: 51, y: 227.8, yaw: 0, scale: 1, interactive: false, structural: true }),
  freeze({ id: 'yard-park-hedge-west-south', mesh: 'yard_hedge_run', blocks: true, x: 51, y: 239.4, yaw: 0, scale: 1, interactive: false, structural: true }),
  freeze({ id: 'yard-park-hedge-south-west', mesh: 'yard_hedge_corner', fallbackMesh:VEGETATION_FALLBACKS.yard_hedge_corner, blocks: true, x: 56, y: 250.6, yaw: Math.PI / 2, scale: 1, interactive: false, structural: true }),
  freeze({ id: 'yard-park-hedge-south-east', mesh: 'yard_hedge_dense', fallbackMesh:VEGETATION_FALLBACKS.yard_hedge_dense, blocks: true, x: 64, y: 250.6, yaw: Math.PI / 2, scale: 1, interactive: false, structural: true }),

  // Plant only the seams. The paths, fountain, benches and the single entrance
  // stay visibly and physically clear.
  freeze({ id:'yard-park-nettles-west', mesh:'vegetation_nettle_cluster', x:52.1, y:232.2, yaw:.21, scale:.94, interactive:false, structural:true, blocks:false }),
  freeze({ id:'yard-park-weeds-east', mesh:'vegetation_weed_cluster', x:67.7, y:243.1, yaw:-.43, scale:1.06, interactive:false, structural:true, blocks:false }),
  freeze({ id:'yard-park-grass-north-east', mesh:'vegetation_grass_edge', x:66.8, y:224.0, yaw:.08, scale:.92, interactive:false, structural:true, blocks:false }),
  freeze({ id:'yard-park-grass-south', mesh:'vegetation_grass_edge', x:59.0, y:249.4, yaw:Math.PI/2, scale:1, interactive:false, structural:true, blocks:false }),
  freeze({ id:'yard-park-leaves-west', mesh:'vegetation_leaf_scatter', x:52.6, y:242.2, yaw:.17, scale:.88, interactive:false, structural:true, blocks:false }),
  freeze({ id:'yard-park-leaves-south', mesh:'vegetation_leaf_scatter', x:64.8, y:249.2, yaw:-.24, scale:.82, interactive:false,structural:true, blocks:false }),

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
  freeze({ id:'yard-park-coins', mesh:'park_fountain_coins',
    x:61.4, y:237.4, yaw:-.42, scale:1, interactive:false, blocks:false }),

  // The one lamp that still works out here, at the corner of the crossing.
  freeze({ id: 'yard-park-lamp', mesh: 'yard_lamp_column', x: 64.8, y: 231.4, yaw: Math.PI, scale: 1, interactive: false, structural: true, blocks: true }),
]);
