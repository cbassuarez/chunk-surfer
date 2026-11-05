// LEAVES ON THE ONE NIGHT'S WIND, WHEREVER THE BODY IS.
//
// The yard has its own flurry (game/leaf-flurry.js), tied to its tree line
// and floor plan. Everywhere else the opening's leaves follow: down the coast
// road past the van, over the bluffs and cliffs, and into both Sources. This
// field is the shared one: it rides the same gust clock (world/wind.js),
// follows the body, and spawns upwind of the air the body is moving through,
// so a van at speed meets leaves coming at its glass rather than outrunning
// them. A Source may add a well that draws them in, spiralling.
//
// Render-only. One memory object carries the field between frames; the same
// memory and the same clock give the same leaves.

import { LEAF_SHAPES } from './leaf-species.js';

const TAU = Math.PI * 2;
export const WIND_LEAF_MESHES = Object.freeze(
  LEAF_SHAPES.flatMap((shape) => [`wind_leaf_${shape.id}_pale`, `wind_leaf_${shape.id}_dark`]),
);
export const WIND_LEAVES = Object.freeze({
  count: 36, radius: 15, below: 1.5, above: 6, life: Object.freeze([7, 15]), scale: Object.freeze([1.4, 2.3]),
  // Air speeds in metres per second. `draw` is a well's pull, growing near it.
  carry: 2.4, draw: 2.6, drawReach: 22, swirl: 0.38, sink: 0.35, flutter: 0.9,
});

function random(memory) {
  memory.rng = (memory.rng + 0x6d2b79f5) >>> 0;
  let t = memory.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (memory, a, b) => a + (b - a) * random(memory);

function spawn(memory, body, against, settings, anywhere) {
  const s = settings;
  const angle = anywhere ? between(memory, 0, TAU) : Math.atan2(against.z, against.x) + between(memory, -1.1, 1.1);
  const r = anywhere ? Math.sqrt(random(memory)) * s.radius : between(memory, 0.55, 1) * s.radius;
  return {
    x: body.x + Math.cos(angle) * r, y: body.y + between(memory, -s.below, s.above), z: body.z + Math.sin(angle) * r,
    vx: 0, vy: 0, vz: 0, age: 0, life: between(memory, ...s.life),
    spin: between(memory, 0, TAU), spinRate: between(memory, 2, 7) * (random(memory) < 0.5 ? -1 : 1),
    phase: between(memory, 0, TAU), scale: between(memory, ...s.scale),
    mesh: WIND_LEAF_MESHES[Math.floor(random(memory) * WIND_LEAF_MESHES.length)],
  };
}

/**
 * Advance the field to `time`. `body` is {x,y,z} in world metres (y is about
 * chest height), `wind` is a horizontal {x,z} gust in metres per second, and
 * `well` an optional {x,y,z,swallow} that draws leaves in. A new `key`, a
 * backwards clock or a long gap starts a fresh field around the body.
 */
export function stepWindLeaves(memory, { key = 'world', time = 0, body, wind = { x: 0, z: 0 }, well = null, settings = {} } = {}) {
  const s = { ...WIND_LEAVES, ...settings }, t = Number(time) || 0;
  let m = memory && memory.key === key && t >= memory.time && t - memory.time < 2 ? memory : null;
  const here = { x: Number(body?.x) || 0, y: Number(body?.y) || 0, z: Number(body?.z) || 0 };
  if (!m) {
    m = { key, time: t, rng: ((Math.floor(t * 1000) ^ 0x51ed27) >>> 0), body: here, leaves: [] };
    while (m.leaves.length < s.count) m.leaves.push(spawn(m, here, { x: -wind.x, z: -wind.z }, s, true));
  }
  const dt = Math.min(0.1, t - m.time);
  // The air the body moves through: wind less the body's own travel.
  const travel = dt > 1e-6 ? { x: (here.x - m.body.x) / dt, z: (here.z - m.body.z) / dt } : { x: 0, z: 0 };
  const against = { x: -(wind.x * s.carry - travel.x), z: -(wind.z * s.carry - travel.z) };
  m.time = t; m.body = here;
  const k = 1 - Math.exp(-dt / 0.45);
  for (let i = 0; i < m.leaves.length; i++) {
    const leaf = m.leaves[i];
    leaf.age += dt; leaf.phase += dt * 3.1; leaf.spin += leaf.spinRate * dt;
    const air = {
      x: wind.x * s.carry + Math.sin(leaf.phase) * s.flutter,
      y: -s.sink + Math.cos(leaf.phase * 1.3) * s.flutter * 0.5,
      z: wind.z * s.carry + Math.cos(leaf.phase * 0.8) * s.flutter,
    };
    let swallowed = false;
    if (well) {
      const dx = well.x - leaf.x, dy = well.y - leaf.y, dz = well.z - leaf.z, d = Math.hypot(dx, dy, dz) || 1;
      const draw = s.draw * (1 + s.drawReach / Math.max(4, d)), swirl = s.swirl * draw;
      // Frame dragging turns the stream about the well's vertical.
      air.x += dx / d * draw - dz / d * swirl; air.y += dy / d * draw * 0.6; air.z += dz / d * draw + dx / d * swirl;
      swallowed = d < (well.swallow || 1);
    }
    leaf.vx += (air.x - leaf.vx) * k; leaf.vy += (air.y - leaf.vy) * k; leaf.vz += (air.z - leaf.vz) * k;
    leaf.x += leaf.vx * dt; leaf.y += leaf.vy * dt; leaf.z += leaf.vz * dt;
    const strayed = Math.hypot(leaf.x - here.x, leaf.z - here.z) > s.radius * 2.4 || Math.abs(leaf.y - here.y) > s.radius * 1.6;
    if (swallowed || leaf.age > leaf.life || strayed) m.leaves[i] = spawn(m, here, against, s, false);
  }
  return m;
}

/** Instances for the dynamic prop path, offset by `origin` when the caller anchors its world. */
export function windLeafProps(memory, { origin = { x: 0, y: 0, z: 0 }, prefix = 'wind-leaf', extra = {} } = {}) {
  if (!memory?.leaves?.length) return [];
  const o = [Number(origin.x) || 0, Number(origin.y) || 0, Number(origin.z) || 0];
  return memory.leaves.map((leaf, index) => {
    const s = leaf.scale, heading = Math.atan2(leaf.vz, leaf.vx) + Math.sin(leaf.phase) * 0.6;
    const ca = Math.cos(heading), sa = Math.sin(heading), cp = Math.cos(leaf.spin), sp = Math.sin(leaf.spin);
    const x = o[0] + leaf.x, y = o[1] + leaf.y, z = o[2] + leaf.z;
    return {
      id: `${prefix}-${index}`, mesh: leaf.mesh, decorative: true, structural: false, noReflection: true, cullRadius: 0.5, x, y, z, ...extra,
      matrix: new Float32Array([ca * s, 0, -sa * s, 0, sa * sp * s, cp * s, ca * sp * s, 0, sa * cp * s, -sp * s, ca * cp * s, 0, x, y, z, 1]),
    };
  });
}
