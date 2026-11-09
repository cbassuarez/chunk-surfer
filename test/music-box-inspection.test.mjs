import test from 'node:test';
import assert from 'node:assert/strict';
import { freshMusicBoxInspectionRotation, rotateMusicBoxInspection, musicBoxInspectionMatrix } from '../src/game/music-box-inspection.js';
import { MUSIC_BOX_CONSTRUCTION } from '../src/data/music-box-construction.js';

const near = (a, b, epsilon = 1e-11) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const nearVector = (a, b, epsilon) => a.forEach((v, i) => near(v, b[i], epsilon));
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const point = (m, p) => [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);
const direction = (m, p) => [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2]);
const H = MUSIC_BOX_CONSTRUCTION.dimensions[1], CENTER = [0, H / 2, 0];
function basis(yaw, pitch) {
  return [[Math.cos(yaw), 0, Math.sin(yaw)],
    [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)],
    [-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]];
}
function viewPoint(world, { eye, yaw = 0, pitch = 0 }) {
  const offset = world.map((v, i) => v - eye[i]);
  return basis(yaw, pitch).map(axis => dot(axis, offset));
}
function rigid(m) {
  assert.ok(m.every(Number.isFinite));
  const columns = [[m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]];
  columns.forEach(c => near(Math.hypot(...c), 1));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) near(dot(columns[i], columns[j]), 0);
  const [a, b, c] = columns;
  near(a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]), 1);
  assert.deepEqual([m[3], m[7], m[11], m[15]], [0, 0, 0, 1]);
}
const sourceY = (p, angle) => [Math.cos(angle) * p[0] + Math.sin(angle) * p[2], p[1], -Math.sin(angle) * p[0] + Math.cos(angle) * p[2]];


test('the real body centre stays exactly at screen centre for all three rotations and camera poses', () => {
  let rotation = freshMusicBoxInspectionRotation();
  for (let i = 0; i < 120; i++) {
    rotation = rotateMusicBoxInspection(rotation, { yaw: .173, pitch: -.131, roll: .097 });
    const camera = { eye: [10 + i / 4, 1.65, -8], yaw: i * .091, pitch: .8 * Math.sin(i * .07) };
    const m = musicBoxInspectionMatrix({ ...camera, rotation });
    nearVector(viewPoint(point(m, CENTER), camera), [0, 0, -.14]);
    rigid(m);
  }
});

test('the printed +Z face initially faces the eye even when the camera is tilted or turned', () => {
  for (const [yaw, pitch] of [[0, 0], [.7, -.35], [-2.4, 1.2], [Math.PI, -Math.PI / 2]]) {
    const camera = { eye: [4, 2, -6], yaw, pitch };
    const m = musicBoxInspectionMatrix(camera);
    nearVector(direction(m, [0, 0, 1]), basis(yaw, pitch)[2]);
    nearVector(viewPoint(point(m, CENTER), camera), [0, 0, -.14]);
    rigid(m);
  }
});

test('yaw, pitch and roll remain fixed view axes after quarter-turns rather than becoming object axes', () => {
  let q = rotateMusicBoxInspection(freshMusicBoxInspectionRotation(), { yaw: Math.PI / 2 });
  let m = musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: q });
  nearVector(direction(m, [0, 0, 1]), [1, 0, 0]);
  q = rotateMusicBoxInspection(q, { pitch: Math.PI / 2 });
  m = musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: q });
  nearVector(direction(m, [0, 0, 1]), [1, 0, 0], 1e-10);
  q = rotateMusicBoxInspection(q, { roll: Math.PI / 2 });
  m = musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: q });
  nearVector(direction(m, [0, 0, 1]), [0, 1, 0]);
  nearVector(point(m, CENTER), [0, 0, -.14]);
});

test('pitch can pass through ninety degrees and inspect the underside without a clamp or gimbal jump', () => {
  let q = freshMusicBoxInspectionRotation();
  for (let i = 0; i < 100; i++) q = rotateMusicBoxInspection(q, { pitch: Math.PI / 100 });
  const upsideDown = musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: q });
  nearVector(direction(upsideDown, [0, 0, 1]), [0, 0, -1]);
  nearVector(direction(upsideDown, [0, 1, 0]), [0, -1, 0]);
  for (let i = 0; i < 100; i++) q = rotateMusicBoxInspection(q, { pitch: Math.PI / 100 });
  const completeTurn = musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: q });
  nearVector(direction(completeTurn, [0, 0, 1]), [0, 0, 1]);
  rigid(completeTurn);
});

test('a cab-baked placement is removed exactly once and matches the unbaked coastal model at every corner', () => {
  const sourceYaw = Math.PI + .1, translation = [-.40, .918, .42];
  const bake = p => sourceY(p, sourceYaw).map((v, i) => v + translation[i]);
  const rotation = rotateMusicBoxInspection(freshMusicBoxInspectionRotation(), { yaw: .58, pitch: -.87, roll: .36 });
  const camera = { eye: [14, 1.7, -6], yaw: -.7, pitch: -.42, rotation, distance: .18 };
  const coastal = musicBoxInspectionMatrix(camera);
  const cab = musicBoxInspectionMatrix({ ...camera, sourceYaw, center: bake(CENTER) });
  const [w, h, d] = MUSIC_BOX_CONSTRUCTION.dimensions;
  for (const x of [-w / 2, w / 2]) for (const y of [0, h]) for (const z of [-d / 2, d / 2])
    nearVector(point(cab, bake([x, y, z])), point(coastal, [x, y, z]));
  nearVector(viewPoint(point(cab, bake(CENTER)), camera), [0, 0, -.18]);
  rigid(cab);
});

test('camera changes preserve the owned view-relative object pose without mutating user rotation or camera', () => {
  const rotation = rotateMusicBoxInspection(freshMusicBoxInspectionRotation(), { yaw: -.71, pitch: .23, roll: 1.32 });
  const cameras = [{ eye: [1, 1.8, 4], yaw: .2, pitch: -.8 }, { eye: [100, -3, -8], yaw: -1.9, pitch: 1.1 }];
  const before = structuredClone({ rotation, cameras });
  const matrices = cameras.map(camera => musicBoxInspectionMatrix({ ...camera, rotation }));
  for (const p of [CENTER, [-.027, 0, -.016], [.027, H, .016]])
    nearVector(viewPoint(point(matrices[0], p), cameras[0]), viewPoint(point(matrices[1], p), cameras[1]));
  assert.deepEqual({ rotation, cameras }, before);
});

test('ten thousand mixed-axis steps remain normalized, rigid and exactly undoable', () => {
  let q = freshMusicBoxInspectionRotation();
  const deltas = [];
  for (let i = 0; i < 10000; i++) {
    const delta = { yaw: .013 * Math.cos(i * .19), pitch: .017 * Math.sin(i * .11), roll: .009 * Math.cos(i * .07) };
    deltas.push(delta);
    q = rotateMusicBoxInspection(q, delta);
    near(Math.hypot(...q), 1, 1e-14);
    if (i % 111 === 0) rigid(musicBoxInspectionMatrix({ eye: [3, 2, -1], rotation: q, yaw: .7, pitch: -.2 }));
  }
  for (const delta of deltas.reverse()) q = rotateMusicBoxInspection(q, { yaw: -delta.yaw, pitch: -delta.pitch, roll: -delta.roll });
  const m = musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: q });
  nearVector(direction(m, [1, 0, 0]), [1, 0, 0]);
  nearVector(direction(m, [0, 1, 0]), [0, 1, 0]);
  nearVector(point(m, CENTER), [0, 0, -.14]);
});

test('proper column-major three-by-three inputs and quaternion inputs produce the same rigid pose', () => {
  for (const delta of [{ yaw: .83, pitch: -.74, roll: 1.2 }, { yaw: Math.PI }, { pitch: Math.PI }, { roll: Math.PI }]) {
    const q = rotateMusicBoxInspection(freshMusicBoxInspectionRotation(), delta);
    const a = musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: q });
    const m3 = new Float32Array([a[0], a[1], a[2], a[4], a[5], a[6], a[8], a[9], a[10]]);
    const b = musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: m3 });
    nearVector(a, b, 1e-7);
    rigid(b);
  }
});

test('rotation is independent of distance and keeps physical lengths at the requested framing range', () => {
  const q = rotateMusicBoxInspection(freshMusicBoxInspectionRotation(), { roll: -.93, yaw: 1.2 });
  const close = musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: q, distance: .14 });
  const far = musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: q, distance: .42 });
  nearVector(close.slice(0, 12), far.slice(0, 12));
  for (const m of [close, far]) {
    const a = point(m, [-.027, 0, 0]), b = point(m, [.027, 0, 0]);
    near(Math.hypot(...a.map((v, i) => v - b[i])), .054);
  }
});

test('invalid source frames fail clearly rather than making the object disappear or shear', () => {
  for (const eye of [undefined, [0, 0], [0, NaN, 0]]) assert.throws(() => musicBoxInspectionMatrix({ eye }), TypeError);
  for (const rotation of [[0, 0, 0, 0], [NaN, 0, 0, 1], [2, 0, 0, 0, 1, 0, 0, 0, 1], [-1, 0, 0, 0, 1, 0, 0, 0, 1]])
    assert.throws(() => musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation }), TypeError);
  for (const distance of [0, -1]) assert.throws(() => musicBoxInspectionMatrix({ eye: [0, 0, 0], distance }), RangeError);
  assert.throws(() => rotateMusicBoxInspection(undefined, { yaw: NaN }), TypeError);
  // A quaternion's arbitrary nonzero scale is harmless, including extreme data.
  rigid(musicBoxInspectionMatrix({ eye: [0, 0, 0], rotation: [1e308, -1e308, 1e308, -1e308] }));
  const a = freshMusicBoxInspectionRotation(), b = freshMusicBoxInspectionRotation();
  a[0] = 1;
  assert.deepEqual(b, [0, 0, 0, 1]);
});
