// The one physical threshold before Source II. All coordinates are local metres.
// These bounds describe visible earth and a real folio catch, not camera motion.
const freeze = Object.freeze;
export const SOURCE_EARTHFALL = freeze({
  version: 1,
  sequenceId: 'source-earthfall:source-II-v1',
  fixedStep: 1 / 120,
  maxFrameDelta: .25,
  walkSpeed: 3.2,
  airSpeed: 2,
  bodyRadius: .22,
  eyeHeight: 1.62,
  upperFloor: 100,
  lowerFloor: 0,
  earth: freeze({ minX: -80, maxX: 80, minZ: -100, maxZ: 30 }),
  // The real catch extends16m past each upper edge: enough for the complete
  // airborne drift at2m/s. It catches the body without clamping it to a path.
  catch: freeze({ minX: -96, maxX: 96, minZ: -116, maxZ: 46, interceptY: 12, settleSeconds: 1.2, thickness: .28 }),
  passage: freeze({ halfWidth: 7, entryZ: 0, exitZ: -42 }),
  spawn: freeze({ x: 0, z: -1.7, feet: 100, yaw: 0, pitch: 0 }),
  commitmentZ: -2.4,
  fractureAt: .6,
  footingLossAt: 3,
  gravity: 9.8,
  terminalSpeed: 26,
  door: freeze({ width: 3, height: 3.05, openSeconds: .8, focusDistance: 2.2 }),
});

export const SOURCE_EARTHFALL_CUES = freeze([
  freeze({ type: 'strain', at: 0, gain: .52 }),
  freeze({ type: 'fracture', at: SOURCE_EARTHFALL.fractureAt, gain: .7 }),
  freeze({ type: 'footing-loss', at: SOURCE_EARTHFALL.footingLossAt, gain: .64 }),
]);

const cellHash = (index, salt = 0) => {
  let n = Math.imul(index + 71, 0x45d9f3b) ^ Math.imul(salt + 13, 0x27d4eb2d);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const earthfallCells = (() => {
  const columns = 12, rows = 10, earth = SOURCE_EARTHFALL.earth;
  const dx = (earth.maxX - earth.minX) / columns, dz = (earth.maxZ - earth.minZ) / rows, grid = [];
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const index = row * (columns + 1) + column;
    grid.push(freeze([
      earth.minX + column * dx + (column && column < columns ? (cellHash(index, 1) - .5) * dx * .38 : 0),
      SOURCE_EARTHFALL.upperFloor,
      earth.minZ + row * dz + (row && row < rows ? (cellHash(index, 2) - .5) * dz * .38 : 0),
    ]));
  }
  const cells = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const index = row * columns + column, k = row * (columns + 1) + column;
    const points = freeze([grid[k], grid[k + 1], grid[k + columns + 2], grid[k + columns + 1]]);
    cells.push(freeze({ id: `earth-${index}`, index, points,
      center: freeze({ x: points.reduce((n, p) => n + p[0], 0) / 4, y: SOURCE_EARTHFALL.upperFloor, z: points.reduce((n, p) => n + p[2], 0) / 4 }),
      depth: 1.2 + cellHash(index, 3) * 2.8,
    }));
  }
  return freeze(cells);
})();

// Rendering, fracture motion and sound share these exact cells. No second
// lattice or guessed listener-relative material source is authored elsewhere.
export const sourceEarthfallCellLayout = () => earthfallCells;
export const SOURCE_EARTHFALL_MATERIAL_CELL = earthfallCells.reduce((nearest, cell) =>
  Math.hypot(cell.center.x - 2, cell.center.z + 14) < Math.hypot(nearest.center.x - 2, nearest.center.z + 14) ? cell : nearest);

export const earthfallContains = (bounds, x, z, margin = 0) => Number.isFinite(x) && Number.isFinite(z)
  && x >= bounds.minX + margin && x <= bounds.maxX - margin
  && z >= bounds.minZ + margin && z <= bounds.maxZ - margin;

export function earthfallCatchHeight(elapsed, startVelocity = -SOURCE_EARTHFALL.terminalSpeed) {
  const p = Math.max(0, Math.min(1, Number(elapsed) / SOURCE_EARTHFALL.catch.settleSeconds || 0));
  const height = SOURCE_EARTHFALL.catch.interceptY;
  const v = Math.max(-SOURCE_EARTHFALL.terminalSpeed, Math.min(0, Number(startVelocity) || 0));
  return height * (2 * p ** 3 - 3 * p ** 2 + 1)
    + v * SOURCE_EARTHFALL.catch.settleSeconds * (p ** 3 - 2 * p ** 2 + p);
}

export function earthfallCatchVelocity(elapsed, startVelocity = -SOURCE_EARTHFALL.terminalSpeed) {
  const p = Math.max(0, Math.min(1, Number(elapsed) / SOURCE_EARTHFALL.catch.settleSeconds || 0));
  const height = SOURCE_EARTHFALL.catch.interceptY;
  const v = Math.max(-SOURCE_EARTHFALL.terminalSpeed, Math.min(0, Number(startVelocity) || 0));
  return height / SOURCE_EARTHFALL.catch.settleSeconds * (6 * p ** 2 - 6 * p)
    + v * (3 * p ** 2 - 4 * p + 1);
}

// Supporting cuts travel from the clear central spine toward the outer bands.
// The cuts are visible while weight is held; no supported earth vertex moves.
// Their actual vertical release is a tight ordered cascade after footing loss.
export function sourceEarthfallReleasePlan(index, center = earthfallCells[index]?.center || { x: 0, y: 100, z: -21 }) {
  const x = Number(center.x) || 0;
  const bandWidth = (SOURCE_EARTHFALL.earth.maxX - SOURCE_EARTHFALL.earth.minX) / 12;
  const band = Math.min(5, Math.floor(Math.abs(x) / bandWidth));
  return {
    band,
    initiationAt: SOURCE_EARTHFALL.fractureAt + band * .28,
    releaseAt: SOURCE_EARTHFALL.footingLossAt + band * .02,
    // The two sides follow the same seam, with a small coherent leading side.
    // This opens three-dimensional joints rather than pushing slabs apart.
    departureSpeed: x < 0 ? 6.8 : 6,
    seamX: 0,
    seamZ: -21,
  };
}
export const sourceEarthfallReleaseAt = (index, center) => sourceEarthfallReleasePlan(index, center).releaseAt;

export function sourceEarthfallControlledDrop(elapsed, releaseAt = SOURCE_EARTHFALL.footingLossAt, maxDrop = 180, departureSpeed = 6) {
  const age = Math.max(0, (Number(elapsed) || 0) - releaseAt);
  // A downward support departure keeps material below the independently
  // falling body; gravity increasingly dominates the remainder of the fall.
  return Math.min(maxDrop, departureSpeed * age + SOURCE_EARTHFALL.gravity * .5 * age ** 2);
}
export const earthfallReleaseDistance = elapsed => sourceEarthfallControlledDrop(elapsed, SOURCE_EARTHFALL.footingLossAt, Infinity);

// The only forward door stands at the far end of the upper corridor first.
// It leaves with that earth, then stands on Source II before the body arrives.
export const earthfallExitDoorHeight = elapsed => Math.max(SOURCE_EARTHFALL.lowerFloor,
  SOURCE_EARTHFALL.upperFloor - earthfallReleaseDistance(elapsed));

const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
// A real outer support edge is the bearing for each paired slab. Rotation
// draws its inner edge down and back into its own footprint, opening the spine.
// It is not an outward translation impulse or a pivot floating at its centre.
function outerBearing(index, center) {
  const cell = earthfallCells[index], west = Number(center.x) < 0;
  if (cell && Math.hypot(cell.center.x - center.x, cell.center.z - center.z) < 1e-7) {
    const [a, b] = west ? [cell.points[0], cell.points[3]] : [cell.points[1], cell.points[2]];
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    return { x: (a[0] + b[0]) * .5, z: (a[2] + b[2]) * .5,
      axisX: (b[0] - a[0]) / length, axisZ: (b[2] - a[2]) / length };
  }
  return { x: Number(center.x) + (west ? -1 : 1) * 20 / 3, z: Number(center.z), axisX: 0, axisZ: 1 };
}

// Audio consumes the same transformed top-centre returned to the renderer.
// The exact outer-edge axis is decomposed into the renderer's Y * Z * X Euler
// order; both edge endpoints remain true bearings while the whole support falls.
export function sourceEarthfallFracturePose(index, elapsed, center = { x: 0, y: 100, z: -14 }) {
  const plan = sourceEarthfallReleasePlan(index, center), time = Number(elapsed) || 0;
  const age = Math.max(0, time - plan.releaseAt), bearing = outerBearing(index, center);
  const angle = (Number(center.x) < 0 ? -1 : 1) * (Math.PI * 83 / 180) * smooth(age / .85);
  const c = Math.cos(angle), s = Math.sin(angle), d = 1 - c;
  const { axisX: ux, axisZ: uz } = bearing;
  const x = Number(center.x) - bearing.x, z = Number(center.z) - bearing.z, projection = ux * x + uz * z;
  const drop = sourceEarthfallControlledDrop(time, plan.releaseAt, 180, plan.departureSpeed);
  return {
    x: bearing.x + c * x + ux * projection * d,
    y: Number(center.y) - drop + (uz * x - ux * z) * s,
    z: bearing.z + c * z + uz * projection * d,
    pitch: Math.atan2(ux * s, c),
    roll: Math.asin(Math.max(-1, Math.min(1, uz * s))),
    yaw: Math.atan2(-ux * uz * d, c + ux * ux * d),
    loss: smooth((time - plan.initiationAt) / (SOURCE_EARTHFALL.footingLossAt - plan.initiationAt)),
    support: time < SOURCE_EARTHFALL.footingLossAt,
  };
}
