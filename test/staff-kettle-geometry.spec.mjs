import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStaffCounterKettle } from '../tools/chunk_surfer/building-amenities-geometry.mjs';

const origin = [.13, .9425, -.01];
const enamel = 101, nickel = 102, inner = 103, black = 104;
const quads = [], solids = [];
buildStaffCounterKettle({
  m: {}, MAT: { black }, enamel, nickel, inner,
  addQuad: (_m, a, b, c, d, mat) => quads.push({ points: [a, b, c, d], mat }),
  addBox: (_m, p, size) => solids.push({ min: p.map((v, i) => v - size[i] / 2), max: p.map((v, i) => v + size[i] / 2) }),
  addBeam: (_m, a, b, width) => solids.push({ min: a.map((v, i) => Math.min(v, b[i]) - width / 2), max: a.map((v, i) => Math.max(v, b[i]) + width / 2) }),
  addEllipsoid: (_m, p, radius) => solids.push({ min: p.map((v, i) => v - radius[i]), max: p.map((v, i) => v + radius[i]) }),
});
const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const normal = points => cross(sub(points[1], points[0]), sub(points[2], points[0]));
const near = (a, b, tolerance = 1e-8) => Math.abs(a - b) < tolerance;

test('kettle has a 220mm shaped body, 280mm crown and a supported footprint clear of sink and mugs', () => {
  const points = [...quads.flatMap(q => q.points), ...solids.flatMap(s => [s.min, s.max])];
  assert.ok(points.every(p => p.every(Number.isFinite)));
  const min = [0, 1, 2].map(i => Math.min(...points.map(p => p[i])));
  const max = [0, 1, 2].map(i => Math.max(...points.map(p => p[i])));
  assert.ok(near(min[1], .9425), 'rolled foot meets the actual worktop, without sinking into it');
  assert.ok(near(max[1] - min[1], .280));
  assert.ok(min[0] > -.29 && max[0] < .445, 'clear of sink rim and nearest mug');
  assert.ok(min[2] > -.3 && max[2] < .16, 'inside worktop and clear of the folded cloth');
  const ring = y => quads.filter(q => q.mat === enamel).flatMap(q => q.points).filter(p => near(p[1], origin[1] + y));
  const diameter = y => { const p = ring(y); return Math.max(...p.map(v => v[0])) - Math.min(...p.map(v => v[0])); };
  assert.ok(near(diameter(.060), .220));
  assert.ok(near(diameter(.218), .152), 'the body narrows into a distinct neck below the lid');
});

test('curved pouring spout has a real open bore, inward walls and an outward rim', () => {
  const end = [origin[0] - .181, origin[1] + .228, origin[2]];
  const length = Math.hypot(-.023, .008), tangent = [-.023 / length, .008 / length, 0];
  const onMouthPlane = p => Math.abs(dot(sub(p, end), tangent)) < 1e-8;
  const mouth = quads.filter(q => q.points.every(onMouthPlane));
  assert.equal(mouth.length, 16, 'only an annular lip spans the mouth plane');
  assert.ok(mouth.every(q => q.mat === nickel));
  for (const q of mouth) {
    assert.ok(dot(normal(q.points), tangent) > 0, 'lip faces out of the pour');
    const distances = q.points.map(p => Math.hypot(...sub(p, end)));
    assert.ok(near(Math.min(...distances), .013), '26mm clear bore');
    assert.ok(near(Math.max(...distances), .0165), '3.5mm rolled lip wall');
  }
  const lining = quads.filter(q => q.mat === inner);
  assert.equal(lining.length, 64, 'inner wall continues down all four curved segments');
  const lastCentre = [origin[0] - (.158 + .181) / 2, origin[1] + (.220 + .228) / 2, origin[2]];
  for (const q of lining.slice(-16)) {
    const centre = [0, 1, 2].map(i => q.points.reduce((s, p) => s + p[i], 0) / 4);
    assert.ok(dot(normal(q.points), sub(centre, lastCentre)) < 0, 'lining faces into the bore');
  }
  const rootBand = quads.filter(q => q.mat === enamel && q.points.every(p => near(p[1], origin[1] + .164) || near(p[1], origin[1] + .199)));
  assert.equal(rootBand.length, 30, 'shoulder omits the two panels inside the spout root instead of sealing it');
  const outside = quads.filter(q => q.mat === enamel && q.points.some(p => p[0] < origin[0] - .12));
  assert.ok(outside.length >= 32, 'pour extends past the body as a tapered curved tube');
});

test('body and sweep quads are nondegenerate, face outward, and the grip leaves finger clearance', () => {
  for (const { points } of quads) {
    assert.ok(Math.hypot(...normal(points)) > 1e-10);
    assert.ok(Math.hypot(...cross(sub(points[2], points[0]), sub(points[3], points[0]))) > 1e-10);
  }
  const side = quads.filter(q => q.mat === enamel && q.points.every(p => near(p[1], origin[1] + .060) || near(p[1], origin[1] + .104)));
  assert.equal(side.length, 32);
  for (const q of side) {
    const centre = [0, 1, 2].map(i => q.points.reduce((s, p) => s + p[i], 0) / 4);
    assert.ok(dot(normal(q.points), [centre[0] - origin[0], 0, centre[2] - origin[2]]) > 0);
  }
  // Sweep faces span between control rings, so a real grip section must be
  // intersected with the height plane; no whole face need fit a narrow band.
  const gripY = origin[1] + .136, section = [];
  for (const q of quads.filter(q => q.mat === black)) for (let i = 0; i < 4; i += 1) {
    const a = q.points[i], b = q.points[(i + 1) % 4];
    if (near(a[1], gripY)) section.push(a);
    if ((a[1] - gripY) * (b[1] - gripY) < 0) {
      const t = (gripY - a[1]) / (b[1] - a[1]);
      section.push(a.map((v, j) => v + (b[j] - v) * t));
    }
  }
  const grip = section.filter(p => p[0] > origin[0] + .14);
  assert.ok(grip.length >= 16, 'height plane crosses the complete round grip');
  assert.ok(Math.max(...grip.map(p => p[2])) - Math.min(...grip.map(p => p[2])) >= .024,
    'both sides of the grip tube are included in the section');
  assert.ok(Math.min(...grip.map(p => p[0])) - (origin[0] + .110) > .04,
    'curved grip has more than40mm of real air behind the body');
});
