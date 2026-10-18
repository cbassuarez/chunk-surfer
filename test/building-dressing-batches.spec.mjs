import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBuildingDressingBatches } from '../tools/chunk_surfer/building-dressing-batch-geometry.mjs';
import {
  batchBuildingDressingInstances, buildingDressingPoseDigest, isBuildingDressingMesh,
} from '../src/world/building-dressing-batches.js';

const source = (name, material = 3) => ({ name, groups: new Map([[material, {
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 1],
  normals: Array.from({ length: 3 }, () => [0, -Math.SQRT1_2, Math.SQRT1_2]).flat(),
  uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2],
}]]) });
const fixture = () => {
  const meshes = new Map([['arch_socket_public', source('arch_socket_public')],
    ['occupation_desk_phone', source('occupation_desk_phone')]]);
  const mesh = name => { const out = { name, groups: new Map() }; meshes.set(name, out); return out; };
  const hosts = [{ id: 'socket', mesh: 'arch_socket_public', x: 12, y: 10, z: 20,
    yaw: Math.PI / 2, scale: 1, scaleX: 2, scaleY: 3, scaleZ: 4, zone: 7, structural: true },
  { id: 'phone', mesh: 'occupation_desk_phone', x: 11, y: 11, z: 23, yaw: 0, scale: 1, zone: 2 }];
  const manifest = buildBuildingDressingBatches({ meshes, mesh, groups: { academic: hosts } });
  return { meshes, hosts, manifest, batch: meshes.get(manifest.groups.academic.mesh) };
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('fixed kit merges by material without losing transformed vertices, normals, UVs or source zones', () => {
  const { meshes, manifest, batch } = fixture(), entry = manifest.groups.academic;
  assert.equal(batch.groups.size, 1); assert.equal(entry.materialCount, 1); assert.equal(entry.triangles, 2);
  assert.equal(meshes.get('arch_socket_public').groups.get(3).positions[3], 1, 'source geometry is immutable');
  const g = batch.groups.get(3);
  g.positions.forEach((value, index) => close(value, [0, 0, 0, 0, 0, 2, -4, 3, 0, -1, 1, 3, 0, 1, 3, -1, 2, 4][index]));
  assert.deepEqual(g.indices, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(g.uvs, [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  assert.deepEqual(g.dressingZones, [8, 8, 8, 3, 3, 3]);
  // Inverse transpose of nonuniform scale, then the original yaw rotation.
  const n = [-1 / 4, -1 / 3, 0], length = Math.hypot(...n);
  g.normals.slice(0, 3).forEach((value, index) => close(value, n[index] / length));
});

test('batch substitution retains non-kit hosts and falls back immediately when an individual pose changes', () => {
  const { hosts, manifest } = fixture(), existing = { id: 'quest-desk', mesh: 'school_desk', x: 0, y: 0, z: 0 };
  const original = [...hosts, existing], rendered = batchBuildingDressingInstances(original, 'academic', manifest);
  assert.equal(rendered.length, 2); assert.equal(rendered[0], existing);
  assert.equal(rendered[1].mesh, manifest.groups.academic.mesh);
  assert.equal(hosts[0].id, 'socket'); assert.equal(hosts[1].id, 'phone', 'individual data is retained');
  assert.equal(batchBuildingDressingInstances(original, 'basement', manifest), original);
  const moved = [{ ...hosts[0], x: hosts[0].x + .001 }, hosts[1], existing];
  assert.equal(batchBuildingDressingInstances(moved, 'academic', manifest), moved);
  const removed = [hosts[0], existing];
  assert.equal(batchBuildingDressingInstances(removed, 'academic', manifest), removed);
  assert.equal(buildingDressingPoseDigest(hosts), buildingDressingPoseDigest([...hosts].reverse()));
});

test('animated, original and portal-scene geometry never enter the new fixed kit', () => {
  assert.equal(isBuildingDressingMesh('door_leaf_staff'), false);
  assert.equal(isBuildingDressingMesh('conservatory_west_elevation'), false);
  assert.equal(isBuildingDressingMesh('building_dressing_batch_ground'), false);
  const { meshes, hosts } = fixture(), mesh = name => { const m = { name, groups: new Map() }; meshes.set(name, m); return m; };
  const manifest = buildBuildingDressingBatches({ meshes, mesh, groups: { ground: [
    { ...hosts[0], character: {} }, { ...hosts[1], waterlineBody: 'pool' },
    { ...hosts[0], mesh: 'door_leaf_staff' }, { ...hosts[1], mesh: 'conservatory_west_elevation' },
  ] } });
  assert.deepEqual(manifest.groups, {});
});

test('reflected scale preserves triangle winding and a singular scale fails explicitly', () => {
  const { meshes, hosts } = fixture(), mesh = name => { const m = { name, groups: new Map() }; meshes.set(name, m); return m; };
  const reflected = buildBuildingDressingBatches({ meshes, mesh, groups: { ground: [{ ...hosts[0], scaleX: -1 }] } });
  assert.deepEqual(meshes.get(reflected.groups.ground.mesh).groups.get(3).indices, [0, 2, 1]);
  assert.throws(() => buildBuildingDressingBatches({ meshes, mesh, groups: { ground: [{ ...hosts[0], scaleX: 0 }] } }), /singular scale/);
  meshes.set('arch_socket_public', source('arch_socket_public', undefined));
  const invalid = meshes.get('arch_socket_public'); invalid.groups = new Map([[undefined, invalid.groups.get(3)]]);
  assert.throws(() => buildBuildingDressingBatches({ meshes, mesh, groups: { ground: [hosts[0]] } }), /invalid material/);
});
