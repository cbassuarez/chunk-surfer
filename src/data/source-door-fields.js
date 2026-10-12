// THE DOORS AND THE PLANTING AT THE ROADS' ENDS, FROM THE BUILDING'S OWN KIT.
//
// The door fields used to stand frames beside leaves that did not belong to
// them, stretched to meet in the middle, among trees scaled up to three times
// their size and leant over, under rain painted onto the lens. None of that is
// how this game builds a door or plants a verge.
//
// A door out here is one of the building's door assemblies (conservatory-doors.js):
// its own frame, its own head, its own leaf, at its own size, hinged where
// main.js hinges it. The corridor is planted the way the yard and the pocket
// park are planted — hedge runs for walls, street trees behind them, grass
// seams and nettle beds against the boundaries — from the vegetation pack,
// which carries its own wind.
import { DOOR_ARCHETYPE, DOOR_ARCHETYPES } from './conservatory-doors.js';
import { VEGETATION_FALLBACKS } from './vegetation.js';

const freeze = Object.freeze;

// The clear opening between each frame's posts and under its head rail, as
// scripts/build-door-pack.mjs frame() builds it.
export const DOOR_FRAME_OPENINGS = freeze({
  door_frame_pair: freeze({ width: 2.06, height: 2.40 }),
  door_frame_hall: freeze({ width: 2.06, height: 2.40 }),
  door_frame_single_steel: freeze({ width: 1.02, height: 2.16 }),
  door_frame_single_oak: freeze({ width: 1.0, height: 2.20 }),
  door_frame_tower: freeze({ width: 0.94, height: 2.0 }),
  door_frame_goods: freeze({ width: 3.0, height: 3.05 }),
});

// Every assembly the building hangs, except the two that belong to the roads.
export const DOOR_FIELD_ARCHETYPES = freeze([
  DOOR_ARCHETYPE.PUBLIC_GLAZED_PAIR,
  DOOR_ARCHETYPE.BAY_GOODS_PAIR,
  DOOR_ARCHETYPE.HALL_ACOUSTIC_PAIR,
  DOOR_ARCHETYPE.PRACTICE_ACOUSTIC_SINGLE,
  DOOR_ARCHETYPE.SERVICE_FIRE_SINGLE,
  DOOR_ARCHETYPE.SERVICE_WIRED_PAIR,
  DOOR_ARCHETYPE.STAFF_HALF_GLAZED,
  DOOR_ARCHETYPE.POOL_FIRE_SINGLE,
  DOOR_ARCHETYPE.POOL_GLAZED_PAIR,
  DOOR_ARCHETYPE.ACADEMIC_WIRED_GLASS,
]);

// The chapel's own pair and the tower's own plank door. Both leaves of the
// chapel pair work here, as they do on St Brendan's west door.
export const ROUTE_DOOR_ASSEMBLIES = freeze({
  chapel: freeze({ archetype: DOOR_ARCHETYPE.CHAPEL_OAK_PAIR, hinge: 'left', activeLeaves: freeze([0, 1]) }),
  tower: freeze({ archetype: DOOR_ARCHETYPE.TOWER_SERVICE_SINGLE, hinge: 'left' }),
});

const MASONRY_HEADS = freeze(['masonry-infill', 'low-stone-lintel']);

export function doorAssembly(archetypeId, { hinge = 'left', activeLeaves = null } = {}) {
  const archetype = DOOR_ARCHETYPES[archetypeId];
  if (!archetype) throw new Error(`unknown door archetype ${archetypeId}`);
  const opening = DOOR_FRAME_OPENINGS[archetype.frameMesh];
  if (!opening) throw new Error(`no opening measured for ${archetype.frameMesh}`);
  return freeze({
    archetype: archetypeId,
    frameMesh: archetype.frameMesh,
    headMesh: archetype.headMesh,
    // Standing on its own, a door keeps its joinery overhead — transom, overpanel,
    // tympanum — and not the masonry that fills the wall above it in the building.
    freeStandingHeadMesh: MASONRY_HEADS.includes(archetype.head) ? null : archetype.headMesh,
    leafMesh: archetype.mesh,
    leafCount: archetype.leafCount,
    // 'all': a free-standing door has no wall to keep one leaf of a pair shut against.
    activeLeaves: freeze(activeLeaves === 'all'
      ? Array.from({ length: archetype.leafCount }, (_, k) => k)
      : [...(activeLeaves || archetype.activeLeaves)]),
    aperture: archetype.aperture,
    leaf: archetype.leaf,
    opening,
    openSeconds: archetype.openSeconds,
    closeSeconds: archetype.closeSeconds ?? archetype.openSeconds,
    hinge,
  });
}

// main.js doorLeafMatrix, in the door's own space (x across, y up, +z the front):
// hinged at the aperture's edge, a right-hand leaf mirrored, turned by .49 of a
// half turn when open. Out here every leaf swings away from the front.
export function doorLeafLocalMatrix(assembly, leafIndex, fraction = 0) {
  const pair = assembly.leafCount === 2;
  const left = pair ? leafIndex === 0 : assembly.hinge !== 'right';
  const active = assembly.activeLeaves.includes(leafIndex);
  const hingeX = (left ? -1 : 1) * assembly.aperture.width / 2;
  const angle = (left ? -1 : 1) * Math.PI * 0.49 * (active ? Math.max(0, Math.min(1, fraction)) : 0);
  const c = Math.cos(angle), s = Math.sin(angle), reflect = left ? 1 : -1;
  return new Float32Array([c * reflect, 0, s * reflect, 0, 0, 1, 0, 0, -s, 0, c, 0, hingeX, 0, 0, 1]);
}

// ── THE PLANTING ────────────────────────────────────────────────────────────
//
// In the corridor's own cells (half metres): x across, y along, the corridor
// running from `from` down to `to`, `half` cells either side of its middle.
// Hedges are the walls, the way the yard's hedge run is a wall; a hedge closes
// the far end behind the road's door. Street trees stand behind the hedges at
// their own height, never scaled past a tenth, never leaning. Grass seams and
// nettle beds grow against the hedge foot and nowhere in the open.
const HEDGE_LENGTH_CELLS = 11.6 * 2;
const HEDGE_DEPTH_CELLS = 2.0 * 2;
const STREET_TREES = freeze(['opening_street_tree_small', 'opening_street_tree_small_b', 'opening_street_tree_small_c']);

export const DOOR_FIELD_PLANTING_MESHES = freeze([
  'yard_hedge_run', 'yard_hedge_dense', ...STREET_TREES, 'opening_park_laurel', 'academic_dead_tree_b',
  'vegetation_grass_edge', 'vegetation_nettle_cluster', 'vegetation_weed_cluster', 'vegetation_leaf_scatter',
]);

export function doorFieldPlanting({ from, to, half, endY }, random) {
  const out = [];
  const put = (kind, mesh, x, y, yaw = 0, scale = 1) => {
    out.push(freeze({
      id: `${kind}-${out.length}`, kind, mesh, fallbackMesh: VEGETATION_FALLBACKS[mesh] || null,
      x, y, yaw, scale,
    }));
  };
  const length = from - endY;
  const runs = Math.ceil(length / HEDGE_LENGTH_CELLS);
  for (const side of [-1, 1]) {
    const hedgeX = side * (half + HEDGE_DEPTH_CELLS / 2);
    for (let k = 0; k < runs; k += 1) {
      const y = from - (k + 0.5) * HEDGE_LENGTH_CELLS;
      put('hedge', random(side, k, 1) < 0.35 ? 'yard_hedge_dense' : 'yard_hedge_run', hedgeX, y, random(side, k, 2) < 0.5 ? 0 : Math.PI);
      // The joint between two runs is where the nettles get in.
      if (k > 0 && random(side, k, 3) < 0.7) {
        put('bed', random(side, k, 4) < 0.5 ? 'vegetation_nettle_cluster' : 'vegetation_weed_cluster',
          side * (half - 1.3), from - k * HEDGE_LENGTH_CELLS, random(side, k, 5) * Math.PI * 2, 0.82 + random(side, k, 6) * 0.2);
      }
    }
    // A grass seam along the hedge foot, broken where it would not have taken.
    for (let y = from - 3; y > endY + 3; y -= 6.2) {
      const r = random(side, Math.round(y * 10), 7);
      if (r < 0.22) continue;
      put('grass', 'vegetation_grass_edge', side * (half - 0.8), y, Math.PI / 2 + (r - 0.5) * 0.12, 0.86 + r * 0.18);
    }
    // Street trees behind the hedge, at the spacing a street plants them.
    for (let y = from - 6 - random(side, 0, 8) * 8, n = 0; y > endY - 10; y -= 17 + random(side, n, 9) * 7, n += 1) {
      put('tree', STREET_TREES[Math.floor(random(side, n, 10) * STREET_TREES.length)],
        side * (half + HEDGE_DEPTH_CELLS + 4 + random(side, n, 11) * 4), y, random(side, n, 12) * Math.PI * 2, 0.92 + random(side, n, 13) * 0.18);
      if (random(side, n, 14) < 0.3) {
        put('leaves', 'vegetation_leaf_scatter', side * (half - 2.6), y + (random(side, n, 15) - 0.5) * 6, random(side, n, 16) * Math.PI * 2, 0.8 + random(side, n, 17) * 0.2);
      }
    }
    // And a second, looser line further back: laurels, and the odd dead one.
    for (let y = from - random(side, 1, 18) * 12, n = 0; y > endY - 16; y -= 26 + random(side, n, 19) * 14, n += 1) {
      const r = random(side, n, 20);
      put('back', r < 0.2 ? 'academic_dead_tree_b' : r < 0.55 ? 'opening_park_laurel' : STREET_TREES[Math.floor(r * 7) % STREET_TREES.length],
        side * (half + HEDGE_DEPTH_CELLS + 13 + random(side, n, 21) * 9), y, random(side, n, 22) * Math.PI * 2, 0.95 + random(side, n, 23) * 0.12);
    }
  }
  // The hedge across the end, behind the road's own door.
  const across = Math.ceil((2 * (half + HEDGE_DEPTH_CELLS)) / HEDGE_LENGTH_CELLS);
  for (let k = 0; k < across; k += 1) {
    const x = (k - (across - 1) / 2) * HEDGE_LENGTH_CELLS;
    put('hedge', random(0, k, 24) < 0.35 ? 'yard_hedge_dense' : 'yard_hedge_run', x, endY - HEDGE_DEPTH_CELLS / 2, Math.PI / 2);
    put('tree', STREET_TREES[k % STREET_TREES.length], x + (random(0, k, 25) - 0.5) * 8, endY - HEDGE_DEPTH_CELLS - 5 - random(0, k, 26) * 4,
      random(0, k, 27) * Math.PI * 2, 0.95 + random(0, k, 28) * 0.12);
  }
  for (const side of [-1, 1]) {
    put('grass', 'vegetation_grass_edge', side * (half * 0.55), endY + 0.8, (random(side, 0, 29) - 0.5) * 0.1, 0.9);
  }
  return out;
}
