import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { poseClosedVanFieldCase, buildVanRearKitGeometry, buildVanRearStockGeometry } from '../tools/chunk_surfer/van-rear-kit-geometry.mjs';
import { WORKBENCH_VARIANTS, workbenchCatalog } from '../src/data/workbench-catalog.js';
import { VAN_REAR_CASE, VAN_REAR_STRUCTURE, vanRearStageToWorld, vanRearStockMeshName } from '../src/data/van-rear-design.js';

const root = new URL('../', import.meta.url).pathname;
const sourcePath = new URL('../public/assets/items/field-case.glb', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function unpack(bytes) {
  const chunks = []; let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    chunks.push({ type, bytes: bytes.subarray(offset + 8, offset + 8 + length) }); offset += 8 + length;
  }
  return { json: JSON.parse(chunks.find(chunk => chunk.type === 0x4e4f534a).bytes), chunks };
}
function fixture() {
  const meshes = [], materials = [];
  return { meshes, materials, api: { root, materials,
    mesh(name) { const value = { name, groups: new Map() }; meshes.push(value); return value; },
    group(owner, material) {
      if (!owner.groups.has(material)) owner.groups.set(material, { positions: [], normals: [], indices: [] });
      return owner.groups.get(material);
    },
  } };
}

test('closed world case changes only the existing lid pose and retaining-strap visibility', () => {
  const original = readFileSync(sourcePath), originalHash = digest(original);
  const { bytes, receipt } = poseClosedVanFieldCase(original), before = unpack(original), after = unpack(bytes);
  assert.equal(digest(original), originalHash, 'posing cannot mutate the source buffer');
  assert.deepEqual(after.json.materials, before.json.materials);
  assert.deepEqual(after.json.meshes, before.json.meshes);
  assert.deepEqual(after.json.accessors, before.json.accessors);
  assert.deepEqual(after.json.bufferViews, before.json.bufferViews);
  assert.deepEqual(after.chunks.filter(chunk => chunk.type !== 0x4e4f534a), before.chunks.filter(chunk => chunk.type !== 0x4e4f534a),
    'binary geometry and any other chunks are retained byte for byte');
  assert.equal(receipt.state, 'closed');
  assert.equal(receipt.angleX, Math.PI / 2);
  const hinge = after.json.nodes[receipt.hingeNode];
  assert.deepEqual(hinge.rotation, [Math.sin(Math.PI / 4), 0, 0, Math.cos(Math.PI / 4)]);
  assert.deepEqual(hinge.translation, before.json.nodes[receipt.hingeNode].translation);
  assert.equal(receipt.hiddenNodes.length, 2);
  for (const hidden of receipt.hiddenNodes) assert.equal(after.json.nodes[hidden.index].mesh, undefined);
  const expected = structuredClone(before.json);
  expected.nodes[receipt.hingeNode].rotation = hinge.rotation;
  for (const hidden of receipt.hiddenNodes) delete expected.nodes[hidden.index].mesh;
  assert.deepEqual(after.json, expected, 'no unrelated hierarchy, material or asset changes');
  assert.equal(receipt.originalSha256, originalHash);
  assert.equal(receipt.posedSha256, digest(bytes));
});

test('temporary closed-case import retains the agreed width and base, and never imports loose lid equipment', async () => {
  const out = fixture(); let temporary;
  const sources = await buildVanRearKitGeometry({ ...out.api, importMesh: async (file, options) => {
    temporary = dirname(file);
    assert.equal(existsSync(file), true);
    const posed = unpack(readFileSync(file)).json;
    const hingeX = posed.nodes.find(node => node.name === 'open-lid-hinge').rotation[0];
    assert.ok(file.endsWith('closed.glb') ? hingeX > .7 : hingeX < 0);
    assert.ok(options.maxW > 1, 'import remains in authored units before common closed-housing registration');
    assert.equal(options.up, 'y');
    return { triangles: 1, groups: [{ positions: [0, 0, 0, .1, 0, 0, 0, .1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2],
      material: { name: 'case', baseColorFactor: [.1, .2, .3, 1], metallicFactor: 0, roughnessFactor: .8 } }] };
  } });
  assert.equal(existsSync(temporary), false, 'temporary posed asset is removed after success');
  assert.deepEqual(sources.map(source => source.id), ['field-case', 'field-case']);
  assert.deepEqual(sources.map(source => source.pose.state), ['closed', 'open']);
  assert.ok(sources.every(source => source.registration.housingWidth === .624));
  assert.equal(out.meshes.length, 2);
  assert.equal(out.meshes[0].extras.vanRear.state, 'closed');
  assert.ok(Math.abs(out.meshes[0].extras.vanRear.caseBaseY - 1.109) < 1e-8);
  const placed = [...out.meshes[0].groups.values()][0].positions;
  assert.ok(Math.abs(placed[1] - 1.109) < 1e-8);
  assert.equal(placed[2], VAN_REAR_CASE.centerZ);
  assert.ok(out.materials.every(material => material.name.startsWith('van kit / field-case /')));
});

test('temporary posed case is cleaned up when the ordinary importer fails', async () => {
  const out = fixture(); let temporary;
  await assert.rejects(buildVanRearKitGeometry({ ...out.api, importMesh: async file => {
    temporary = dirname(file); throw new Error('deliberate importer rejection');
  } }), /deliberate importer rejection/);
  assert.equal(existsSync(temporary), false);
});

test('production case importer produces a shallow closed case on the seat and leaves the original item asset intact', async () => {
  const before = digest(readFileSync(sourcePath)), out = fixture();
  const sources = await buildVanRearKitGeometry(out.api);
  const vertices = [...out.meshes[0].groups.values()].flatMap(group => group.positions), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < vertices.length; i += 3) for (let k = 0; k < 3; k++) {
    assert.ok(Number.isFinite(vertices[i + k])); lo[k] = Math.min(lo[k], vertices[i + k]); hi[k] = Math.max(hi[k], vertices[i + k]);
  }
  assert.ok(Math.abs((hi[0] - lo[0]) - .624) < .002, 'the actual case retains its 624mm width');
  assert.ok(hi[1] - lo[1] < .20, 'the lid lies closed rather than rising over the worktop');
  assert.ok(Math.abs(lo[1] - 1.109) < .002);
  assert.equal(sources.length, 2);
  assert.ok(sources[0].triangles > 1000 && sources[0].triangles < 5500);
  assert.equal(digest(readFileSync(sourcePath)), before);
});

test('open and closed world cases retain one rigid housing registration and declare preparation-content limits', async () => {
  const out = fixture(), sources = await buildVanRearKitGeometry(out.api);
  const [closed, open] = sources;
  assert.equal(open.mesh, 'yard_van_field_case_open');
  assert.equal(open.registration.scale, closed.registration.scale);
  assert.deepEqual(open.registration.closedBounds, closed.registration.closedBounds);
  assert.equal(open.pose.angleX, -.31); assert.equal(open.pose.hiddenNodes.length, 0);
  assert.ok(open.triangles <= 5100 && closed.triangles <= 5100);
  for (const mesh of out.meshes) {
    assert.equal(mesh.extras.vanRear.contentsMirroredFromPreparation, false);
    assert.equal(mesh.extras.vanRear.caseCenterZ, VAN_REAR_CASE.centerZ);
    const positions = [...mesh.groups.values()].flatMap(group => group.positions), ys = positions.filter((_, i) => i % 3 === 1);
    assert.ok(Math.abs(Math.min(...ys) - VAN_REAR_CASE.seatTopY) < .0001);
    const height = Math.max(...ys) - Math.min(...ys);
    assert.ok(mesh.extras.vanRear.state === 'open' ? height > .40 : height < .20);
  }
});

test('ordinary world stock uses all15 original catalog choices, independent poses and bounded source geometry', async () => {
  const out = fixture(), report = await buildVanRearStockGeometry(out.api);
  const expected = Object.entries(WORKBENCH_VARIANTS).flatMap(([group, options]) => options.map(optionId => ({ group, optionId })));
  assert.equal(report.parts.length, 15);
  assert.deepEqual(report.parts.map(({ group, optionId }) => ({ group, optionId })), expected);
  assert.equal(report.meshCount, 15); assert.equal(report.witnessIncluded, false);
  assert.ok(report.triangles <= report.maximumTriangles, `stock budget ${report.triangles}`);
  for (const part of report.parts) {
    assert.equal(part.mesh, vanRearStockMeshName(part.group, part.optionId));
    assert.equal(part.propId, `yard-van-stock-${part.group}-${part.optionId}`);
    assert.equal(part.sha256, digest(readFileSync(new URL(`../${part.source}`, import.meta.url))));
    assert.deepEqual(part.position, vanRearStageToWorld(part.stagePosition));
    assert.equal(part.up, part.group === 'faceplate' ? 'y' : 'z');
    const model = out.meshes.find(mesh => mesh.name === part.mesh), positions = [...model.groups.values()].flatMap(group => group.positions);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) {
      assert.ok(Number.isFinite(positions[i + k])); lo[k] = Math.min(lo[k], positions[i + k]); hi[k] = Math.max(hi[k], positions[i + k]);
    }
    assert.ok(Math.abs(lo[1] - part.position[1]) < 1e-6, `${part.mesh} rests on its actual tray or rack seat`);
    assert.ok(lo[0] >= -VAN_REAR_STRUCTURE.worktopWidth / 2 && hi[0] <= VAN_REAR_STRUCTURE.worktopWidth / 2);
    assert.ok(lo[2] >= VAN_REAR_STRUCTURE.worktopCenterZ - VAN_REAR_STRUCTURE.worktopDepth / 2
      && hi[2] <= VAN_REAR_STRUCTURE.worktopCenterZ + VAN_REAR_STRUCTURE.worktopDepth / 2, `${part.mesh} remains on the same worktop`);
    if (part.group !== 'faceplate') assert.ok(Math.min(Math.abs(lo[0]), Math.abs(hi[0])) > VAN_REAR_CASE.seatWidth / 2,
      'hardware stock stays beside the case mat rather than on its lid');
    assert.equal(model.extras.vanRearStock.witness, false);
  }
  const fresh = workbenchCatalog({ fieldKit: {}, bagTaken: false, packedGroups: [] });
  for (const part of report.parts) assert.ok(fresh.some(object => object.group === part.group && object.optionId === part.optionId),
    'runtime destination decisions use the same semantic stock identity');
});
