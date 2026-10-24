import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVanRearGeometry, addVanRearDoorDetails } from '../tools/chunk_surfer/van-rear-geometry.mjs';
import { VAN_REAR_STRUCTURE, VAN_REAR_STAGE, VAN_REAR_CASE } from '../src/data/van-rear-design.js';
import { WORKBENCH_PRINT_METRES_PER_UNIT } from '../src/render/van-workbench-stage.js';

function recorder() {
  const shapes = [], materials = [{ name: 'existing safety red' }, { name: 'existing ivory' }];
  const target = { name: 'yard_van' };
  const api = { target, materials, MAT: { safetyRed: 0, ivory: 1 } };
  for (const kind of ['Box', 'Beam', 'Cylinder', 'CylinderX', 'Quad']) {
    api[`add${kind}`] = (owner, ...args) => shapes.push({ owner: owner.name, kind, args });
  }
  return { api, shapes, materials };
}
function pointsOf({ kind, args }) {
  if (kind === 'Quad') return args.slice(0, 4);
  if (kind === 'Box') {
    const [c, size] = args, points = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      points.push([x, y, z].map((sign, i) => c[i] + sign * size[i] / 2));
    }
    return points;
  }
  if (kind === 'Beam') {
    const [a, b, width] = args, d = b.map((n, i) => n - a[i]), length = Math.hypot(...d);
    const u = d.map(n => n / length), ref = Math.abs(u[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const s0 = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]];
    const sl = Math.hypot(...s0), s = s0.map(n => n / sl);
    const t = [s[1] * u[2] - s[2] * u[1], s[2] * u[0] - s[0] * u[2], s[0] * u[1] - s[1] * u[0]];
    const points = [];
    for (const p of [a, b]) for (const ss of [-1, 1]) for (const st of [-1, 1]) {
      points.push(p.map((n, i) => n + s[i] * ss * width / 2 + t[i] * st * width / 2));
    }
    return points;
  }
  const [c, r, length, , sides = 12] = args, points = [];
  for (let i = 0; i < sides; i++) for (const sign of [-1, 1]) {
    const a = i / sides * Math.PI * 2;
    points.push(kind === 'CylinderX' ? [c[0] + sign * length / 2, c[1] + Math.cos(a) * r, c[2] + Math.sin(a) * r]
      : [c[0] + Math.cos(a) * r, c[1] + sign * length / 2, c[2] + Math.sin(a) * r]);
  }
  return points;
}
const contains = (shape, point) => shape.kind === 'Box' && point.every((n, i) => Math.abs(n - shape.args[0][i]) < shape.args[1][i] / 2 - 1e-8);

test('fitted cargo geometry stays inside the existing shell and leaves the rear aperture open', () => {
  const out = recorder(), report = buildVanRearGeometry(out.api);
  assert.equal(report.owner, 'yard_van');
  assert.equal(report.statefulCaseIncluded, false, 'case belongs to saved runtime acquisition, not a permanently baked duplicate');
  assert.ok(report.triangles <= report.maximumTriangles);
  for (const shape of out.shapes) for (const [x, y, z] of pointsOf(shape)) {
    assert.ok([x, y, z].every(Number.isFinite));
    assert.ok(Math.abs(x) <= 1 + 1e-8, `existing width: ${x}`);
    assert.ok(y >= .5 - 1e-8 && y <= 2.52 + 1e-8, `existing floor and roof: ${y}`);
    assert.ok(z >= -2.1 - 1e-8 && z <= 2.6 + 1e-8, `existing load space and step: ${z}`);
  }
  for (const x of [-.65, 0, .65]) for (const y of [1.20, 1.62, 2.1]) {
    assert.equal(out.shapes.some(shape => contains(shape, [x, y, VAN_REAR_STRUCTURE.rearPlane])), false,
      'no new solid plane covers the load aperture');
  }
});

test('overhead preparation and world worktop share dimensions and leave a flat case seat', () => {
  const out = recorder(), report = buildVanRearGeometry(out.api);
  const top = report.parts.find(part => part.id === 'fitted-worktop');
  assert.equal(top.size[0], VAN_REAR_STAGE.width * WORKBENCH_PRINT_METRES_PER_UNIT);
  assert.equal(top.size[2], VAN_REAR_STAGE.depth * WORKBENCH_PRINT_METRES_PER_UNIT);
  assert.equal(top.center[2], VAN_REAR_STRUCTURE.worktopCenterZ);
  assert.equal(top.size[1], .024, 'plywood skin is not an eighty-millimetre solid slab');
  assert.ok(Math.abs(top.center[1] + top.size[1] / 2 - 1.10) < 1e-8);
  assert.equal(report.caseSeat.z, VAN_REAR_CASE.centerZ);
  assert.ok(Math.abs(report.worktopTopY - 1.10) < 1e-8);
  assert.ok(Math.abs(report.caseSeatTopY - 1.109) < 1e-8);
  for (const x of [-.31, 0, .31]) for (const z of [1.05, 1.32, 1.59]) {
    assert.equal(out.shapes.some(shape => contains(shape, [x, report.caseSeatTopY + .002, z])), false,
      'separate field case rests above a clear mat rather than through baked clutter');
  }
});

test('worktop skin, steel frame, floor supports and body brackets meet in a continuous construction path', () => {
  const out = recorder(), report = buildVanRearGeometry(out.api), byId = id => report.parts.find(part => part.id === id);
  const top = byId('fitted-worktop'), underside = top.center[1] - top.size[1] / 2;
  const rails = report.parts.filter(part => part.id.startsWith('worktop-subframe-'));
  assert.equal(rails.length, 5);
  for (const rail of rails) assert.ok(Math.abs(rail.center[1] + rail.size[1] / 2 - underside) < 1e-8,
    `${rail.id} meets the actual plywood underside`);
  const frameBottom = rails[0].center[1] - rails[0].size[1] / 2;
  for (const support of report.parts.filter(part => part.id.startsWith('worktop-side-support-') || part.id === 'worktop-back-bearer'
    || part.id.startsWith('shelf-body-angle-seat-'))) assert.ok(Math.abs(support.center[1] + support.size[1] / 2 - frameBottom) < 1e-8,
    `${support.id} contacts the subframe without a floating gap`);
  for (const stop of report.parts.filter(part => part.id.startsWith('case-') && part.id.includes('-stop-'))) {
    assert.ok(stop.center[0] - stop.size[0] / 2 >= -VAN_REAR_CASE.seatWidth / 2);
    assert.ok(stop.center[0] + stop.size[0] / 2 <= VAN_REAR_CASE.seatWidth / 2);
    assert.ok(Math.abs(stop.center[2] - VAN_REAR_CASE.centerZ) + stop.size[2] / 2 < VAN_REAR_CASE.seatDepth / 2);
    assert.ok(Math.abs(stop.center[1] - stop.size[1] / 2 - VAN_REAR_CASE.seatTopY) < 1e-8);
  }
  assert.ok(byId('service-upstand').center[2] > .70, 'service rack attaches to the existing worktop');
  assert.ok(byId('interior-bulkhead').center[2] < -2, 'actual vehicle bulkhead is still in its original position');
});

test('two drawers and service reel leave an open bay instead of a solid box under the worktop', () => {
  const out = recorder(), report = buildVanRearGeometry(out.api);
  assert.equal(report.parts.filter(part => /^drawer-front-\d$/.test(part.id)).length, 2);
  const rims = report.parts.filter(part => part.id.startsWith('reel-open-flange-'));
  assert.equal(rims.length, 2);
  assert.ok(rims.every(part => part.inner > .12 && part.outer > part.inner), 'reel flanges have actual annular voids and separate spokes');
  const reelParts = report.parts.filter(part => part.id.startsWith('reel-'));
  assert.ok(reelParts.some(part => part.id === 'reel-cable-core'));
  assert.ok(reelParts.some(part => part.id === 'reel-crank-grip'));
  assert.ok(reelParts.some(part => part.id === 'reel-lead-plug'));
  for (const x of [-.10, .15, .40, .65]) for (const y of [.76, .90]) {
    assert.equal(out.shapes.some(shape => contains(shape, [x, y, 1.94])), false, 'bay entrance remains open beneath the rear worktop edge');
  }
  assert.equal(report.parts.filter(part => part.id.startsWith('tie-down-ring-')).length, 4);
});

test('rear door details retain hinge-local bounds, real pocket voids and mirrored diagonal reflectors', () => {
  const out = recorder();
  for (const [side, outer] of [['l', 1], ['r', -1]]) {
    const first = out.shapes.length;
    const report = addVanRearDoorDetails(out.api, { name: `yard_van_door_${side}` }, { side, outer });
    assert.ok(report.triangles <= report.maximumTriangles);
    assert.equal(report.staticLeafIncluded, false, 'existing moving leaf remains its sole solid door');
    const shapes = out.shapes.slice(first);
    for (const shape of shapes) for (const [x, y, z] of pointsOf(shape)) {
      assert.ok(x >= -1e-8 && x <= .90 + 1e-8, 'detail follows the original 900mm leaf');
      assert.ok(y >= -1e-8 && y <= 1.86 + 1e-8, 'detail follows the original leaf height');
      assert.ok(Math.abs(z) <= .16 + 1e-8, 'only restrained hinge and pocket projections');
    }
    const reflectors = report.parts.filter(part => part.id.includes('diagonal-reflector'));
    assert.equal(reflectors.length, 3);
    for (const part of reflectors) {
      const top = part.points.filter(p => p[1] > .6), bottom = part.points.filter(p => p[1] < .5);
      const topX = top.reduce((n, p) => n + p[0], 0) / top.length;
      const bottomX = bottom.reduce((n, p) => n + p[0], 0) / bottom.length;
      assert.ok((topX - bottomX) * (side === 'l' ? 1 : -1) > .1, 'reflectors slope toward the intended chevron direction');
      assert.ok(part.points.every(p => p[2] * outer > .04), 'reflectors stay on the outer skin');
    }
    assert.equal(shapes.some(shape => contains(shape, [.43, .535, -outer * .10])), false, 'internal pocket is open at its mouth');
    assert.equal(report.parts.filter(part => part.id.includes('hinge-barrel')).length, 3);
  }
});

test('cargo and both doors reuse ordinary opaque PBR finishes without emissive fake edges', () => {
  const out = recorder();
  const first = buildVanRearGeometry(out.api), materialCount = out.materials.length;
  for (const [side, outer] of [['l', 1], ['r', -1]]) {
    const report = addVanRearDoorDetails(out.api, { name: `yard_van_door_${side}` }, { side, outer });
    assert.equal(report.newMaterials, 0);
  }
  assert.equal(out.materials.length, materialCount);
  assert.ok(first.newMaterials <= 8);
  for (const material of out.materials.slice(2)) {
    assert.equal(material.pbrMetallicRoughness.baseColorFactor[3], 1);
    assert.equal(material.extras.materialFactors, 'gltf');
    assert.equal(material.emissiveFactor, undefined);
    assert.equal(material.alphaMode, undefined);
  }
});

test('reel rims and horizontal tie-down rings face their light rather than carrying inverted normals', () => {
  const out = recorder(), report = buildVanRearGeometry(out.api);
  for (const ring of report.parts.filter(part => part.kind === 'ring')) {
    const axis = ring.axis === 'x' ? 0 : 1, radialAxes = axis === 0 ? [1, 2] : [0, 2];
    const radius = p => Math.hypot(...radialAxes.map(i => p[i] - ring.center[i]));
    const outerFaces = out.shapes.filter(shape => shape.kind === 'Quad' && shape.args.slice(0, 4).every(p =>
      Math.abs(radius(p) - ring.outer) < 1e-8 && Math.abs(p[axis] - ring.center[axis]) <= ring.depth / 2 + 1e-8));
    assert.ok(outerFaces.length >= 12, `${ring.id} exposes its outer cylindrical surface`);
    for (const shape of outerFaces) {
      const [a, b, c] = shape.args, u = b.map((n, i) => n - a[i]), v = c.map((n, i) => n - a[i]);
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const center = a.map((n, i) => (n + b[i] + c[i]) / 3 - ring.center[i]);
      assert.ok(radialAxes.reduce((n, i) => n + normal[i] * center[i], 0) > 0,
        `${ring.id} outer normal must face away from its axle`);
    }
  }
});
