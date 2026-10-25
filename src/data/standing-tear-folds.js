// Only the upper Source course moves. The supported basin and the bottom
// 2.6 metres of its perimeter remain the ordinary collision contract.
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, finite(value, lo)));
const TAU = Math.PI * 2;

/** A single connected course doubles back at the wrong depth. The renderer
 * gives this centreline a closed, thick section; these are not five new rooms. */
const RETURN_PATH = freeze([
  [-.475, -.30, -.29], [.475, -.30, -.29], [.475, .30, -.29],
  [-.16, .30, .29], [-.16, -.12, .29], [.17, -.12, -.12],
  [.17, .12, -.12], [-.475, .12, -.29],
]);

export const STANDING_TEAR_FOLD_LAYOUT = freeze({
  minimumClearance: 2.6,
  fixedPerimeterHeight: 2.6,
  overheadCount: 5,
  upperPerimeterCount: 40,
  cycleSeconds: 74,
  overheads: Array.from({ length: 5 }, (_, index) => ({
    id: `overhead-${index}`, index, position: [index % 2 ? (index === 1 ? -4 : 4) : 0, 34 + index * 6, 28 + index * 36],
    size: [192, 55 + index % 2 * 6, 60],
    yaw: index % 2 ? Math.PI / 2 : 0,
    pitch: index % 2 ? .16 : -.22,
    roll: index % 2 ? Math.PI + .08 : -.08,
    gravity: index % 2 ? -1 : 1,
  })),
});

function multiply(a, b) {
  const m = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) {
    m[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
  }
  return m;
}
function transformMatrix(position, size, yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const y = [cy, 0, sy, 0, 0, 1, 0, 0, -sy, 0, cy, 0, 0, 0, 0, 1];
  const x = [1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1];
  const z = [cr, sr, 0, 0, -sr, cr, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const m = multiply(multiply(y, x), z);
  for (let column = 0; column < 3; column++) for (let row = 0; row < 3; row++) m[column * 4 + row] *= size[column];
  m[12] = position[0]; m[13] = position[1]; m[14] = position[2];
  return m;
}

/** Uses only serialized encounter time, so pause, hidden windows and replay
 * preserve the architectural phase. There is no motor-running dependency. */
export function standingTearFoldClock(frame = {}) {
  const elapsed = Math.max(0, finite(frame.elapsed));
  const stopped = Math.max(0, finite(frame.stoppedSeconds));
  const reference = Math.max(0, finite(frame.referenceSeconds, finite(frame.audio?.referenceSeconds)));
  return { elapsed, reference: frame.referenceStarted || frame.architectureRunning ? reference + stopped : 0,
    retained: frame.referenceStarted === true || frame.architectureRunning === true,
    stopped: frame.transportRunning === false && (frame.referenceStarted === true || frame.architectureRunning === true) };
}

function pose(definition, angles, position, extra = {}) {
  const size = [...definition.size], matrix = transformMatrix(position, size, angles.yaw, angles.pitch, angles.roll);
  const halfHeight = (Math.abs(matrix[1]) + Math.abs(matrix[5]) + Math.abs(matrix[9])) / 2;
  const correction = Math.max(0, STANDING_TEAR_FOLD_LAYOUT.minimumClearance - (matrix[13] - halfHeight));
  matrix[13] += correction;
  return { id: definition.id, index: definition.index, role: definition.role, position: [matrix[12], matrix[13], matrix[14]],
    size, scale: size, yaw: angles.yaw, pitch: angles.pitch, roll: angles.roll, matrix,
    minimumY: matrix[13] - halfHeight, maximumY: matrix[13] + halfHeight,
    gravity: definition.gravity, connection: 'retained-course', moving: true, collision: false, ...extra };
}

/** Forty existing perimeter cells above the fixed bodily course. */
function perimeterDefinitions() {
  const walls = [];
  for (const sign of [-1, 1]) for (let index = 0; index < 12; index++) {
    const height = 72 + index % 4 * 6;
    walls.push({ id: `side-${sign}-${index}`, index, role: 'perimeter-fold', position: [sign * 80.4, (height + 2.6) / 2, -20 + index * 20],
      size: [20, height - 2.6, .72], yaw: Math.PI / 2, gravity: index % 3 === 1 ? -1 : 1, side: sign, physicalBoundary: sign * 80 });
  }
  for (const end of ['back', 'far']) for (let index = 0; index < 8; index++) {
    const height = (end === 'far' ? 84 : 70) + index % 2 * 6;
    walls.push({ id: `${end}-${index}`, index, role: 'perimeter-fold', position: [-70 + index * 20, (height + 2.6) / 2, end === 'far' ? 210.4 : -30.4],
      size: [20, height - 2.6, .72], yaw: 0, gravity: index % 3 === 1 ? -1 : 1, side: end === 'far' ? 1 : -1, physicalBoundary: end === 'far' ? 210 : -30 });
  }
  return walls;
}
const PERIMETER = freeze(perimeterDefinitions());

/** Unit-envelope poses: closed renderer meshes inside local [-.5,.5]^3
 * inherit the stated clearance. There are exactly five major overhead forms. */
export function standingTearFolds(frame = {}, { reducedMotion = false } = {}) {
  const clock = standingTearFoldClock(frame), reduced = reducedMotion === true;
  const phase = reduced ? .83 : clock.elapsed / STANDING_TEAR_FOLD_LAYOUT.cycleSeconds * TAU;
  const retainedPhase = reduced ? 1.17 : phase + Math.min(clock.reference, 8) * .008;
  const poses = STANDING_TEAR_FOLD_LAYOUT.overheads.map(definition => {
    const index = definition.index, hand = index % 2 ? -1 : 1, local = retainedPhase + index * .67;
    const hinge = Math.sin(local) * .105, elbow = Math.sin(local + .94) * .085;
    const position = [...definition.position];
    position[0] += Math.sin(local + .3) * 2.3;
    position[1] += Math.sin(local * .71) * 1.2;
    position[2] += Math.sin(local + 1.1) * 1.8;
    const path = RETURN_PATH.map(([x, y, z], point) => [x * hand, y,
      z + (point >= 3 ? elbow * .35 : 0)]);
    return pose({ ...definition, role: 'overhead-fold' }, {
      yaw: definition.yaw + hand * hinge * .45, pitch: definition.pitch + hand * hinge,
      roll: definition.roll + hand * elbow,
    }, position, { moving: !reduced, retained: clock.retained, motorIndependent: true,
      foldShape: { path, widthFraction: .045, thicknessFraction: .007, widthMetres: 8, thicknessMetres: 1.2, handedness: hand,
        returnShear: elbow, closure: 'wrong-depth-return', printBand: 'retained-course',
        gravityAlternation: [1, 1, -1, -1, 1, -1, 1] } });
  });
  for (const definition of PERIMETER) {
    const index = definition.index, local = retainedPhase + index * .39 + definition.side * .4;
    const shear = Math.sin(local) * .032;
    const position = [...definition.position];
    position[0] += Math.sin(local + .7) * (definition.yaw ? .8 : .35);
    position[2] += Math.sin(local + .7) * (definition.yaw ? .35 : .8);
    poses.push(pose(definition, { yaw: definition.yaw + shear * .65,
      pitch: Math.sin(local + 1.2) * .018,
      roll: (definition.gravity < 0 ? Math.PI : 0) + shear }, position,
    { moving: !reduced, retained: clock.retained, motorIndependent: true, physicalBoundary: definition.physicalBoundary,
      fixedBaseHeight: STANDING_TEAR_FOLD_LAYOUT.fixedPerimeterHeight, printBand: 'retained-course' }));
  }
  return poses;
}

/** Exact bounds for renderer checks, including every animated box corner. */
export function standingTearFoldCorners(fold) {
  const m = fold.matrix, points = [];
  for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
    points.push([m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14]]);
  }
  return points;
}

/** Seven closed prism placements form one continuous ribbon. Re-evaluating
 * these inexpensive transforms moves the elbows without rebuilding a mesh. */
export function standingTearRibbonSegments(fold) {
  if (!fold?.foldShape?.path) return [];
  const m = fold.matrix, point = p => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = v => { const length = Math.hypot(...v) || 1; return v.map(value => value / length); };
  return fold.foldShape.path.slice(1).map((to, index) => {
    const from = point(fold.foldShape.path[index]), end = point(to), delta = end.map((value, k) => value - from[k]);
    const length = Math.hypot(...delta), along = unit(delta), gravity = fold.foldShape.gravityAlternation[index];
    const wanted = unit([m[4] * gravity, m[5] * gravity, m[6] * gravity]);
    let side = cross(along, wanted);
    if (Math.hypot(...side) < .01) side = cross(along, unit([m[8], m[9], m[10]]));
    side = unit(side);
    const normal = unit(cross(side, along)), width = fold.foldShape.widthMetres, thickness = fold.foldShape.thicknessMetres;
    const centre = from.map((value, k) => (value + end[k]) / 2);
    const matrix = [...side.map(value => value * width), 0, ...normal.map(value => value * thickness), 0,
      ...along.map(value => value * (length + .12)), 0, ...centre, 1];
    return { id: `${fold.id}-segment-${index}`, index, parent: fold.id, role: 'overhead-ribbon-segment',
      from, to: end, position: centre, matrix, length, size: [width, thickness, length + .12],
      gravity, normal, connection: fold.connection, collision: false };
  });
}
