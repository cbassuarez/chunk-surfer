// The same six closed pieces feed rendering, bodily collision and construction.
// Their fixed hinges describe what the music has made; they never follow a body.
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = value => Math.max(0, Math.min(1, finite(value)));
export const STANDING_TEAR_PRESSURE = freeze({ centre: [0, 16], radius: 26, height: 12, thickness: .65,
  wakeRadius: 5, pressureRadius: 9, metresPerMemory: 2.4, foldSeconds: 1.2,
  minimumConfinementSeconds: 6, witnessSeconds: 2.4 });
export const STANDING_TEAR_MEMORIES = freeze([
  { id: 'solo', source: { x: -9, y: .35, z: 8 }, radius: 5, pressureRadius: 9, panels: [3, 4] },
  { id: 'ensemble', source: { x: 9, y: .35, z: 8 }, radius: 5, pressureRadius: 9, panels: [1, 2] },
  { id: 'couperin', source: { x: 0, y: .35, z: 27 }, radius: 5, pressureRadius: 9, panels: [0, 5] },
]);
const vertices = Array.from({ length: 6 }, (_, index) => {
  const a = index * Math.PI / 3;
  return [Math.sin(a) * STANDING_TEAR_PRESSURE.radius,
    STANDING_TEAR_PRESSURE.centre[1] + Math.cos(a) * STANDING_TEAR_PRESSURE.radius];
});
export const STANDING_TEAR_PANEL_DEFINITIONS = freeze(vertices.map((a, index) => {
  const b = vertices[(index + 1) % 6], dx = b[0] - a[0], dz = b[1] - a[1];
  return { id: `memory-course-${index}`, index, memoryId: STANDING_TEAR_MEMORIES.find(memory => memory.panels.includes(index)).id,
    hinge: { x: (a[0] + b[0]) / 2, y: -STANDING_TEAR_PRESSURE.thickness / 2, z: (a[1] + b[1]) / 2 },
    yaw: Math.atan2(dz, dx), width: Math.hypot(dx, dz) + .35,
    height: STANDING_TEAR_PRESSURE.height, thickness: STANDING_TEAR_PRESSURE.thickness };
}));
export const STANDING_TEAR_PANEL_TRIANGLES = freeze([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3,
  1, 2, 6, 1, 6, 5, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2,
]);
const localCorners = [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5],
  [-.5, .5, -.5], [.5, .5, -.5], [.5, .5, .5], [-.5, .5, .5]];

/** A unit cube maps to a closed physical course. At zero its upper face is
 * exactly ground level. Positive movement folds its stock up from the outside. */
export function standingTearPressurePanel(index, progress = 0, target = progress) {
  const definition = STANDING_TEAR_PANEL_DEFINITIONS[index];
  if (!definition) throw new RangeError(`Unknown Standing Tear course ${index}`);
  progress = clamp(progress); target = clamp(target);
  const eased = progress * progress * (3 - 2 * progress), angle = (1 - eased) * Math.PI / 2;
  const cy = Math.cos(definition.yaw), sy = Math.sin(definition.yaw), c = Math.cos(angle), s = Math.sin(angle);
  const x = [cy, 0, sy], y = [-sy * s, c, cy * s], z = [-sy * c, -s, cy * c];
  const centre = [definition.hinge.x + y[0] * definition.height / 2,
    definition.hinge.y + y[1] * definition.height / 2, definition.hinge.z + y[2] * definition.height / 2];
  const matrix = [...x.map(value => value * definition.width), 0, ...y.map(value => value * definition.height), 0,
    ...z.map(value => value * definition.thickness), 0, ...centre, 1];
  const closedVertices = localCorners.map(p => [matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12],
    matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13],
    matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14]]);
  return { ...definition, matrix, size: [definition.width, definition.height, definition.thickness],
    position: centre, axes: [x, y, z], closedVertices, triangles: STANDING_TEAR_PANEL_TRIANGLES,
    progress, target, angle, colliding: progress > 1e-8, root: { ...definition.hinge },
    source: { ...STANDING_TEAR_MEMORIES.find(memory => memory.id === definition.memoryId).source } };
}
export function standingTearPressurePanels(progress = [], memories = []) {
  return STANDING_TEAR_PANEL_DEFINITIONS.map((definition, index) => standingTearPressurePanel(index, progress[index],
    memories.find(memory => memory.id === definition.memoryId)?.pressure ?? progress[index]));
}

function segmentBoxDistanceSquared(a, b, half) {
  const delta = b.map((value, index) => value - a[index]), cuts = [0, 1];
  for (let axis = 0; axis < 3; axis++) if (Math.abs(delta[axis]) > 1e-10) for (const sign of [-1, 1]) {
    const t = (sign * half[axis] - a[axis]) / delta[axis];
    if (t > 0 && t < 1) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  const distance = t => a.reduce((sum, value, axis) => sum + Math.max(0, Math.abs(value + delta[axis] * t) - half[axis]) ** 2, 0);
  let best = Math.min(distance(0), distance(1));
  for (let index = 1; index < cuts.length; index++) {
    const lo = cuts[index - 1], hi = cuts[index], mid = (lo + hi) / 2;
    let aa = 0, bb = 0;
    for (let axis = 0; axis < 3; axis++) {
      const at = a[axis] + delta[axis] * mid;
      if (Math.abs(at) <= half[axis]) continue;
      aa += delta[axis] ** 2;
      bb += delta[axis] * (a[axis] - Math.sign(at) * half[axis]);
    }
    const t = aa ? Math.max(lo, Math.min(hi, -bb / aa)) : mid;
    best = Math.min(best, distance(lo), distance(hi), distance(t));
  }
  return best;
}

/** Exact segment-to-oriented-box distance for an upright capsule. */
export function standingTearPanelHitsCapsule(panel, x, z, { feet = 0, radius = .25, height = 1.8 } = {}) {
  const local = y => panel.axes.map(axis => axis[0] * (x - panel.position[0]) + axis[1] * (y - panel.position[1]) + axis[2] * (z - panel.position[2]));
  const a = local(feet + radius), b = local(feet + height - radius);
  return segmentBoxDistanceSquared(a, b, panel.size.map(size => size / 2)) < radius * radius - 1e-8;
}

/** Sampling bounds the largest rotating vertex's travel to under six cm;
 * the capsule is expanded by that bound so a swept hinge cannot pass through it. */
export function standingTearPanelSweepHits(index, from, to, x, z, body = {}) {
  const before = standingTearPressurePanel(index, from), after = standingTearPressurePanel(index, to);
  const count = Math.max(1, Math.ceil(Math.abs(after.angle - before.angle) * Math.hypot(STANDING_TEAR_PRESSURE.height, STANDING_TEAR_PRESSURE.thickness) / .035));
  for (let step = 1; step <= count; step++) {
    const panel = standingTearPressurePanel(index, from + (to - from) * step / count);
    if (standingTearPanelHitsCapsule(panel, x, z, { ...body, feet: finite(body.feet) - .04,
      height: finite(body.height, 1.8) + .08, radius: finite(body.radius, .25) + .04 })) return true;
  }
  return false;
}
