import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { LOADING_BAY_ACCESS } from '../src/data/loading-bay-access.js';
import { parseGlb, encodeGlb } from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import { patchLoadingBayAccess } from '../tools/chunk_surfer/rebuild-loading-bay-access.mjs';

FP.compile(conservatory.levels, conservatory);
PROPS.propsInit(FP);
const instance = PROPS.renderInstances({ group: 'ground' }).find(p => p.id === 'yard-dock-access');
const bytes = fs.readFileSync(new URL('../public/assets/conservatory-props.glb', import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const bin = 28 + jsonLength;
function read(index) {
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
  const width = { VEC3: 3, SCALAR: 1 }[a.type];
  const size = { 5126: 4, 5125: 4, 5123: 2 }[a.componentType];
  const method = { 5126: 'readFloatLE', 5125: 'readUInt32LE', 5123: 'readUInt16LE' }[a.componentType];
  const offset = bin + (view.byteOffset || 0) + (a.byteOffset || 0);
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: width }, (_, axis) =>
    bytes[method](offset + i * (view.byteStride || width * size) + axis * size)));
}
// Read the final shipped geometry, then apply the actual production placement.
// A source-level coordinate test missed both errors in the former mesh.
const treads = [];
for (const primitive of gltf.meshes.find(m => m.name === instance.mesh).primitives) {
  if (gltf.materials[primitive.material].name !== 'dark wood') continue;
  const p = read(primitive.attributes.POSITION), n = read(primitive.attributes.NORMAL), ids = read(primitive.indices).flat();
  for (let i = 0; i < ids.length; i += 3) {
    const triangleIds = ids.slice(i, i + 3);
    if (!triangleIds.every(id => n[id][1] > .99)) continue;
    treads.push(triangleIds.map(id => [p[id][0] + instance.x, p[id][1] + instance.y, p[id][2] + instance.z]));
  }
}
assert.equal(treads.length, 16, 'eight actual tread tops, two triangles each');
const groups = [...new Set(treads.map(t => t[0][1].toFixed(5)))].sort().map(height =>
  treads.filter(t => t[0][1].toFixed(5) === height));
const yardPoint = (x, z) => ({ x: (50 + x) * 2, y: (200 + z) * 2 });

test('every visible dock tread stands on the collision step it depicts', () => {
  const errors = [];
  for (const triangle of treads) {
    const [x, height, z] = [0, 1, 2].map(axis => triangle.reduce((sum, p) => sum + p[axis], 0) / 3);
    const at = yardPoint(x, z), floor = FP.floorAt(at.x, at.y);
    if (Math.abs(height - floor) > .08) errors.push({ x, z, height, floor });
  }
  assert.deepEqual(errors, [], 'painted steel must sit within 8cm of its actual collision riser');
});

test('ordinary forward and reverse steps cross the full visible stair widths', () => {
  const lowest = groups[0];
  const north = lowest.filter(t => t.reduce((sum, p) => sum + p[2], 0) / 3 < 7);
  const south = lowest.filter(t => t.reduce((sum, p) => sum + p[2], 0) / 3 >= 7);
  const failures = [];
  for (const [name, tops] of [['north', north], ['goods', south]]) {
    assert.equal(tops.length, 2, `${name}: actual lowest tread`);
    const zs = tops.flat().map(p => p[2]), z0 = Math.min(...zs), z1 = Math.max(...zs);
    for (let z = z0 + .06; z < z1; z += .125) {
      let at = yardPoint(45.5, z);
      for (let i = 0; i < 12; i++) {
        const result = FP.canStep(at.x, at.y, at.x + 1, at.y);
        if (!result.ok) { failures.push({ name, z, x: FP.logicalToPhysical(at.x, at.y).x / 2, why: result.why }); break; }
        at = result.redirect || { x: at.x + 1, y: at.y };
        assert.equal(PROPS.propCanOccupy(at.x, at.y), true, `${name} visible ascending lane is clear of prop collision`);
      }
      for (let i = 0; i < 12; i++) {
        const result = FP.canStep(at.x, at.y, at.x - 1, at.y);
        if (!result.ok) { failures.push({ name, z, direction: 'down', why: result.why }); break; }
        at = result.redirect || { x: at.x - 1, y: at.y };
        assert.equal(PROPS.propCanOccupy(at.x, at.y), true, `${name} visible descending lane is clear of prop collision`);
      }
    }
  }
  assert.deepEqual(failures, [], 'the drawn flight must never advertise the adjacent unwalkable loading face');
});

test('normal diagonal movement crosses each half-metre stair lane in both directions', () => {
  const step = (at, dx, dy) => {
    // The same corner/slide rule as the live step adapter in main.js.
    const alongX = FP.canStep(at.x, at.y, at.x + dx, at.y).ok;
    const alongY = FP.canStep(at.x, at.y, at.x, at.y + dy).ok;
    if (!(alongX && alongY)) { if (alongX) dy = 0; else if (alongY) dx = 0; else return null; }
    const result = FP.canStep(at.x, at.y, at.x + dx, at.y + dy);
    return result.ok ? result.redirect || { x: at.x + dx, y: at.y + dy } : null;
  };
  for (const bay of LOADING_BAY_ACCESS.bays) for (let z = bay.z0 + .25; z < bay.z1; z += .5) {
    const side = z < (bay.z0 + bay.z1) / 2 ? 1 : -1;
    let at = yardPoint(45.5, z);
    for (let i = 0; i < 12; i++) {
      const next = step(at, 1, i % 2 ? -side : side);
      assert.ok(next, `${bay.id} ascending diagonally from lane ${z}, step ${i}`); at = next;
      assert.equal(PROPS.propCanOccupy(at.x, at.y), true, `${bay.id} diagonal ascent is clear of prop collision`);
    }
    assert.ok(FP.logicalToPhysical(at.x, at.y).x / 2 >= 51, 'diagonal ascent reaches the apron');
    for (let i = 0; i < 12; i++) {
      const next = step(at, -1, i % 2 ? -side : side);
      assert.ok(next, `${bay.id} descending diagonally from lane ${z}, step ${i}`); at = next;
      assert.equal(PROPS.propCanOccupy(at.x, at.y), true, `${bay.id} diagonal descent is clear of prop collision`);
    }
    assert.ok(FP.logicalToPhysical(at.x, at.y).x / 2 <= 46, 'diagonal descent returns to the yard');
  }
});

test('reapplying the bounded asset repair leaves the final pack byte-identical', () => {
  const pack = parseGlb(bytes), result = patchLoadingBayAccess(pack);
  assert.deepEqual(encodeGlb(result.json, result.bin), bytes);
});
