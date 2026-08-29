// LEAVES IN THE YARD.
//
// The boot credits draw leaves on a flat canvas, where a leaf is a shape with
// an alpha. Out here they are objects: they pass behind the van, the torch
// finds an edge on them, they throw a shadow across the tarmac, and the fence
// occludes them. That is the whole reason to do it again in the world rather
// than tint the credits' layer over the top — a 2D overlay on a 3D yard reads
// as a smudge on the lens, and the moment one of them goes BEHIND something the
// illusion is finished.
//
// They ride the same gust as the credits and as Source (world/wind.js), so the
// night agrees with itself across three renderers.
//
// Cheap by construction: forty instances submitted through the dynamic prop
// path that already carries the apparitions, the bells and the ending debris.
// No new renderer, no new pass, and the leaves inherit the prop pack's shadows
// and materials for nothing.

import { leafShape, LEAF_SHAPES } from '../world/leaf-species.js';
import { windAt } from '../world/wind.js';

const TAU = Math.PI * 2;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));

// How far out they exist. Beyond this they are recycled rather than drawn: a
// leaf twenty-five metres away is two pixels and costs the same as one at arm's
// length.
export const FLURRY_RADIUS = 22;
const FULL_COUNT = 40;

// Both tones of each silhouette. Which mesh a leaf is is fixed at spawn.
export const FLURRY_MESHES = Object.freeze(
  LEAF_SHAPES.flatMap((shape) => [`wind_leaf_${shape.id}_pale`, `wind_leaf_${shape.id}_dark`]),
);

function nextRandom(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (state, lo, hi) => lo + nextRandom(state) * (hi - lo);

export function freshLeafFlurry({ seed = 1, bearing = 0.7, reducedMotion = false } = {}) {
  return {
    rng: (Math.floor(Number(seed) || 1) >>> 0) || 1,
    // The night's prevailing direction. Fixed for the run: wind that changes
    // its mind every gust reads as a bug, not as weather.
    bearing: Number(bearing) || 0,
    density: reducedMotion ? 0.4 : 1,
    pace: reducedMotion ? 0.55 : 1,
    time: 0,
    wind: 1,
    leaves: [],
  };
}

function spawn(state, origin, { scattered = false } = {}) {
  const shape = leafShape(nextRandom(state));
  const tone = nextRandom(state) < 0.55 ? 'pale' : 'dark';
  // Upwind, so they arrive rather than appear. A scattered first fill is placed
  // anywhere in the disc, because a yard that starts empty and fills from one
  // edge announces the moment it switched on.
  const angle = scattered
    ? nextRandom(state) * TAU
    : state.bearing + Math.PI + between(state, -0.7, 0.7);
  const distance = scattered ? nextRandom(state) * FLURRY_RADIUS : between(state, FLURRY_RADIUS * 0.75, FLURRY_RADIUS);
  return {
    x: origin.x + Math.cos(angle) * distance,
    z: origin.z + Math.sin(angle) * distance,
    // Most of them are low — leaves are a ground effect. A few get lifted.
    y: origin.y + (nextRandom(state) < 0.75 ? between(state, 0.04, 1.1) : between(state, 1.1, 4.2)),
    speed: between(state, 1.6, 4.4),
    fall: between(state, 0.02, 0.26),
    spin: between(state, 0, TAU),
    spinRate: between(state, -5.5, 5.5) * shape.flutter,
    phase: between(state, 0, TAU),
    flutter: shape.flutter,
    scale: between(state, 0.75, 1.35),
    mesh: `wind_leaf_${shape.id}_${tone}`,
  };
}

// WHERE LEAVES COME FROM, AND WHEN.
//
// A field at full strength everywhere outdoors is not weather, it is a filter:
// the middle of the arrival road has nothing to shed and no reason to be full
// of leaves, and something that is always happening stops being noticed inside
// a minute.
//
// Two localisations, and they are both physical rather than decorative:
//
//   SPACE. Leaves come off trees. `leafFlurrySources` takes the placed tree
//   props and the field falls off with distance from the nearest one, so the
//   park is thick with them, the yard downwind of it has a few, and the road
//   has none. Deriving the sources from the props means moving a tree moves its
//   leaves, and nobody has to remember a second list.
//
//   TIME. A gust arrives, passes, and goes. Only the top of the wind range
//   lifts anything at all, so most of the time the yard is still and then a
//   flurry comes through — which is the thing that actually makes you look up.
export const LEAF_SOURCE_MESHES = Object.freeze([
  'opening_street_tree_small', 'opening_street_tree_small_b', 'opening_street_tree_small_c',
  'academic_dead_tree', 'academic_dead_tree_b',
]);

// Full inside this, gone by the far radius — in RUNTIME CELLS, which is what
// props carry and what the caller measures in. A cell is half a metre, so this
// is roughly seven metres under the tree and nothing past thirty.
const SOURCE_NEAR = 14;
const SOURCE_FAR = 60;

export function leafFlurrySources(props = []) {
  return props
    .filter((prop) => LEAF_SOURCE_MESHES.includes(prop.mesh))
    .map((prop) => ({ x: prop.rx, y: prop.ry }));
}

// 0..1 from position alone. Runtime cells, matching what props carry.
export function leafSourcePresence(sources, x, y) {
  if (!sources?.length) return 0;
  let nearest = Infinity;
  for (const source of sources) {
    const distance = Math.hypot(source.x - x, source.y - y);
    if (distance < nearest) nearest = distance;
  }
  if (nearest >= SOURCE_FAR) return 0;
  if (nearest <= SOURCE_NEAR) return 1;
  const t = (nearest - SOURCE_NEAR) / (SOURCE_FAR - SOURCE_NEAR);
  return 1 - t * t * (3 - 2 * t);
}

// Only the top of the wind range moves anything. Below that the yard is still,
// which is what makes the gust an event rather than a setting.
export function leafGust(force) {
  const t = Math.max(0, Math.min(1, (Number(force) || 0) - 0.42)) / 0.58;
  return t * t * (3 - 2 * Math.min(1, t));
}

// `presence` is 0..1 and is the caller's business — outdoors under weather it
// is 1, indoors it is 0, and the opening can ramp it.
export function stepLeafFlurry(state, dt, { origin, presence = 0, floorAt = null } = {}) {
  if (!state || !origin) return state;
  const step = clamp(dt, 0, 0.1);
  state.time += step;
  state.wind = windAt(state.time, { depth: 1 });

  const wanted = Math.round(FULL_COUNT * state.density * clamp(presence, 0, 1));
  const scattered = state.leaves.length === 0 && wanted > 0;
  while (state.leaves.length < wanted) state.leaves.push(spawn(state, origin, { scattered }));
  if (state.leaves.length > wanted) state.leaves.length = wanted;

  const dx = Math.cos(state.bearing);
  const dz = Math.sin(state.bearing);
  const gust = state.wind * state.pace;
  const next = [];
  for (const leaf of state.leaves) {
    leaf.phase += step * 4.2 * leaf.flutter;
    // Across the wind as well as along it, or forty leaves travel as one sheet.
    const sway = Math.sin(leaf.phase) * 0.9 * leaf.flutter;
    leaf.x += (dx * leaf.speed + -dz * sway) * gust * step;
    leaf.z += (dz * leaf.speed + dx * sway) * gust * step;
    // Falling, but lifted again on the gust — which is what a leaf in wind
    // actually does, and why they never simply land.
    // The gust LIFTS. Weighted so an average gust roughly cancels the fall and
    // a strong one carries a leaf to head height — without this they all sink
    // to the tarmac inside a second and skitter there, which is one true thing
    // about leaves and a dull one to look at.
    leaf.y += (-leaf.fall + Math.cos(leaf.phase * 0.7) * 1.35 * leaf.flutter * (state.wind - 0.62)) * state.pace * step;
    leaf.spin += leaf.spinRate * state.pace * step;

    const ground = (typeof floorAt === 'function' ? floorAt(leaf.x, leaf.z) : 0) + 0.03;
    if (leaf.y < ground) {
      // It skitters along the ground rather than sticking. Nothing settles in
      // this wind.
      leaf.y = ground;
      leaf.fall = -Math.abs(leaf.fall) * 0.35;
    } else if (leaf.fall < 0 && leaf.y > ground + 0.5) {
      leaf.fall = Math.abs(leaf.fall);
    }

    const away = Math.hypot(leaf.x - origin.x, leaf.z - origin.z);
    if (away <= FLURRY_RADIUS * 1.3) next.push(leaf);
  }
  state.leaves = next;
  // Anything that left is replaced upwind on the next step, so the field holds
  // its count without the player ever seeing one appear in front of them.
  while (state.leaves.length < wanted) state.leaves.push(spawn(state, origin));
  return state;
}

// A FULL MATRIX, BECAUSE THE PROP PATH HAS NO PITCH.
//
// props3d's modelMatrix builds yaw-only from {yaw, scale}: right for a chair,
// useless for a leaf, whose entire character is that it turns about an axis
// across its travel. Instances may supply `matrix` instead, so the tumble is
// composed here — Ry(heading) then Rx(tumble), scaled — and the renderer takes
// it as given.
function leafMatrix(leaf, heading, cell) {
  const s = leaf.scale;
  const ca = Math.cos(heading), sa = Math.sin(heading);
  const cp = Math.cos(leaf.spin), sp = Math.sin(leaf.spin);
  return [
    ca * s, 0, -sa * s, 0,
    sa * sp * s, cp * s, ca * sp * s, 0,
    sa * cp * s, -sp * s, ca * cp * s, 0,
    leaf.x * cell, leaf.y, leaf.z * cell, 1,
  ];
}

export function leafFlurryInstances(state, { cell = 1 } = {}) {
  if (!state?.leaves?.length) return [];
  return state.leaves.map((leaf, index) => ({
    id: `wind-leaf-${index}`,
    mesh: leaf.mesh,
    // Along its own travel, wandering off it by the flutter.
    matrix: leafMatrix(leaf, state.bearing + Math.sin(leaf.phase) * 0.6, cell),
    structural: false,
    noShadow: false,
  }));
}
