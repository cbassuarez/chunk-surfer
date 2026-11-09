// Shared rigid inspection math. Geometry keeps its physical size; its SOURCE
// centre lands exactly on the owned camera's view ray. User rotation belongs
// to camera/view space and is stored as a quaternion, never clamped Euler sums.
import { MUSIC_BOX_CONSTRUCTION } from '../data/music-box-construction.js';

const IDENTITY = [0, 0, 0, 1];
const DEFAULT_CENTER = [0, MUSIC_BOX_CONSTRUCTION.dimensions[1] / 2, 0];
const vectorLike = value => Array.isArray(value) || ArrayBuffer.isView(value);
function number(value, name, fallback = 0) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) throw TypeError(`Music box inspection needs a finite ${name}.`);
  return value;
}
function vector(value, length, name) {
  if (!vectorLike(value) || value.length !== length || !Array.from(value).every(Number.isFinite))
    throw TypeError(`Music box inspection needs a finite ${length}-component ${name}.`);
  return Array.from(value);
}
function normalized(q) {
  const scale = Math.max(...q.map(Math.abs));
  if (!(scale > 0)) throw TypeError('Music box inspection rotation cannot be a zero quaternion.');
  const scaled = q.map(v => v / scale), length = Math.hypot(...scaled);
  return scaled.map(v => v / length);
}
// Hamilton product: a*b applies b first, then a.
function multiply(a, b) {
  const [x, y, z, w] = a, [X, Y, Z, W] = b;
  return normalized([w * X + x * W + y * Z - z * Y,
    w * Y - x * Z + y * W + z * X,
    w * Z + x * Y - y * X + z * W,
    w * W - x * X - y * Y - z * Z]);
}
function axisQuaternion(axis, radians) {
  const h = radians / 2, s = Math.sin(h);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}
function fromMatrix(value) {
  const m = vector(value, 9, 'column-major rotation matrix');
  const columns = [m.slice(0, 3), m.slice(3, 6), m.slice(6, 9)];
  const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  const determinant = m[0] * (m[4] * m[8] - m[7] * m[5]) - m[3] * (m[1] * m[8] - m[7] * m[2]) + m[6] * (m[1] * m[5] - m[4] * m[2]);
  if (columns.some(c => Math.abs(dot(c, c) - 1) > 1e-5)
    || Math.abs(dot(columns[0], columns[1])) > 1e-5
    || Math.abs(dot(columns[0], columns[2])) > 1e-5
    || Math.abs(dot(columns[1], columns[2])) > 1e-5 || Math.abs(determinant - 1) > 1e-5)
    throw TypeError('Music box inspection matrix must be a proper rigid rotation.');
  const m00 = m[0], m01 = m[3], m02 = m[6], m10 = m[1], m11 = m[4], m12 = m[7], m20 = m[2], m21 = m[5], m22 = m[8];
  const trace = m00 + m11 + m22;
  let q;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  return normalized(q);
}
function quaternion(rotation = IDENTITY) {
  if (vectorLike(rotation) && rotation.length === 9) return fromMatrix(rotation);
  return normalized(vector(rotation, 4, 'quaternion [x,y,z,w]'));
}
function matrix3(q) {
  const [x, y, z, w] = q, xx = x * x, yy = y * y, zz = z * z;
  return [1 - 2 * (yy + zz), 2 * (x * y + z * w), 2 * (x * z - y * w),
    2 * (x * y - z * w), 1 - 2 * (xx + zz), 2 * (y * z + x * w),
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (xx + yy)];
}

export function freshMusicBoxInspectionRotation() { return [...IDENTITY]; }

// Incremental angular displacement about FIXED view axes: pitch = camera +X,
// yaw = camera +Y, roll = camera +Z (toward the viewer). Combined simultaneous
// input is one rotation vector, avoiding an arbitrary Euler order. Premultiply
// the delta so axes do not drift with the object after a quarter-turn.
export function rotateMusicBoxInspection(rotation = IDENTITY, { yaw = 0, pitch = 0, roll = 0 } = {}) {
  const q = quaternion(rotation), delta = [number(pitch, 'pitch delta'), number(yaw, 'yaw delta'), number(roll, 'roll delta')];
  const angle = Math.hypot(...delta);
  if (angle === 0) return q;
  if (!Number.isFinite(angle)) throw TypeError('Music box inspection rotation delta is too large.');
  const half = angle / 2, scale = Math.sin(half) / angle;
  return multiply([delta[0] * scale, delta[1] * scale, delta[2] * scale, Math.cos(half)], q);
}

// Returns a rigid column-major WORLD matrix. Game yaw increases toward +X;
// therefore camera-to-world = Ry(-yaw)*Rx(pitch). Identity user rotation makes
// the canonical printed +Z face look toward the eye, at any camera yaw/pitch.
// `center` is in the vertices' SOURCE coordinates, including baked placement.
// `sourceYaw` is the right-handed Y turn already baked into those vertices;
// undo it exactly once. The host remains responsible for world-to-local space.
export function musicBoxInspectionMatrix({ eye, yaw = 0, pitch = 0, rotation = IDENTITY,
  distance = .14, center = DEFAULT_CENTER, sourceYaw = 0 } = {}) {
  const e = vector(eye, 3, 'eye'), c = vector(center, 3, 'source centre');
  const heading = number(yaw, 'camera yaw'), tilt = number(pitch, 'camera pitch'), range = number(distance, 'distance', .14);
  if (!(range > 0)) throw RangeError('Music box inspection distance must be positive.');
  const source = number(sourceYaw, 'baked source yaw');
  const camera = multiply(axisQuaternion([0, 1, 0], -heading), axisQuaternion([1, 0, 0], tilt));
  const q = multiply(multiply(camera, quaternion(rotation)), axisQuaternion([0, 1, 0], -source));
  const m = matrix3(q);
  const forward = [Math.sin(heading) * Math.cos(tilt), Math.sin(tilt), -Math.cos(heading) * Math.cos(tilt)];
  const target = e.map((n, i) => n + forward[i] * range);
  const position = target.map((n, row) => n - m[row] * c[0] - m[3 + row] * c[1] - m[6 + row] * c[2]);
  return [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, ...position, 1];
}
