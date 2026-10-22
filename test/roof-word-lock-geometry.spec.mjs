import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOF_PASSWORD } from '../src/data/roof-password.js';
import { buildAcademicRoof } from '../tools/chunk_surfer/academic-roof-geometry.mjs';
import { parseGlb } from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';

const pack = parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb', import.meta.url)));
const mesh = pack.json.meshes.find(mesh => mesh.name === 'academic_roof_gate');
const slot = mesh.primitives.find(p => pack.json.materials[p.material].name === 'black lacquer');
const accessor = pack.json.accessors[slot.attributes.POSITION], view = pack.json.bufferViews[accessor.bufferView];
const start = (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || 12;
const positions = Array.from({ length: accessor.count }, (_, i) =>
  [0, 1, 2].map(axis => pack.bin.readFloatLE(start + i * stride + axis * 4)));
const expected = [-.30, -.18, -.06, .06, .18, .30];
function centres(vertices) {
  const edges = [...new Set(vertices.map(p => p[2].toFixed(5)))].map(Number).sort((a, b) => a - b);
  assert.equal(edges.length % 2, 0, 'each separate slot has a near and far edge');
  return Array.from({ length: edges.length / 2 }, (_, i) => Math.round((edges[i * 2] + edges[i * 2 + 1]) * 50000) / 100000);
}

test('the shipped roof word lock has one physical slot per password letter', () => {
  assert.equal(ROOF_PASSWORD.length, 6);
  assert.equal(accessor.count, ROOF_PASSWORD.length * 24, 'six separate solid slot boxes');
  assert.deepEqual(centres(positions), expected);
  for (const [x, y, z] of positions) {
    assert.ok(x >= -.098 && x <= -.086, 'slots remain just in front of the existing plate');
    assert.ok(y >= 1.60 && y <= 1.70 && Math.abs(z) < .36, 'all six slots fit the unchanged notice plate');
  }
});

test('the editable roof builder reproduces all six shipped slot centres', () => {
  const slots = [], materials = Array.from({ length: 34 }, (_, i) => ({ name: `base-${i}` }));
  const MAT = { dark:0, wood:1, black:2, steel:3, ivory:4, brass:5, cloth:6, cone:7, paper:8,
    portrait:9, stone:10, plaster:11, bronze:12, soil:13, deadLeaf:14, poolBlue:15, poolMint:16,
    agedWhite:17, safetyRed:18, roofGlass:19, vfd:20, warmWindow:21, brickRed:22, brickDark:23 };
  const api = { materials, MAT, mesh: name => ({ name }),
    addBox(m, centre, size, material) {
      if (m.name === 'academic_roof_gate' && material === MAT.black) slots.push({ centre, size });
    }, addBeam() {}, addEllipsoid() {}, addCylinder() {}, addQuad() {} };
  buildAcademicRoof(api);
  assert.deepEqual(slots.map(slot => slot.centre[2]), expected);
  assert.equal(slots.length, ROOF_PASSWORD.length);
  assert.deepEqual(slots.map(slot => slot.size), Array.from({ length: 6 }, () => [.01, .085, .085]));
});
