import test from 'node:test';
import assert from 'node:assert/strict';
import { auditBuildingDressingBatches } from '../tools/chunk_surfer/building-dressing-batch-audit.mjs';

const fixture = () => {
  const entry = { mesh: 'building_dressing_batch_ground', anchor: [12, 0, 20], count: 3,
    poseDigest: '1234abcd', materialCount: 1, triangles: 9000,
    bounds: { min: [0, 0, 0], max: [8, 2, 5] },
    sources: { arch_socket_public: { count: 3, trianglesPerInstance: 3000 } } };
  const json = { meshes: [{ name: entry.mesh, extras: { buildingDressingBatch: true, renderGroup: 'ground', ...structuredClone(entry) },
    primitives: [{ attributes: { POSITION: 0, _DRESSING_ZONE: 2 }, indices: 1 }] },
  { name: 'arch_socket_public', primitives: [{ attributes: { POSITION: 0 }, indices: 3 }] }],
  accessors: [{ type: 'VEC3', componentType: 5126, count: 27000 }, { type: 'SCALAR', componentType: 5125, count: 27000 },
    { type: 'SCALAR', componentType: 5126, count: 27000 }, { type: 'SCALAR', componentType: 5125, count: 9000 }] };
  const stats = { buildingDressingBatches: { version: 1, groups: { ground: structuredClone(entry) } },
    meshes: { arch_socket_public: { triangles: 3000 }, [entry.mesh]: { triangles: 9000 } },
    bounds: { [entry.mesh]: structuredClone(entry.bounds) } };
  return { json, stats };
};

test('only an explicit assembly with conserved source triangles gets the object-budget exemption', () => {
  const input = fixture(), audit = auditBuildingDressingBatches(input);
  assert.deepEqual(audit.errors, []); assert.ok(audit.names.has('building_dressing_batch_ground'));
  delete input.json.meshes[0].extras.buildingDressingBatch;
  const unnamed = auditBuildingDressingBatches(input);
  assert.equal(unnamed.names.size, 0); assert.match(unnamed.errors.join(' '), /no explicitly classified/);
});

test('source omissions, changed triangle populations and divergent manifests fail', () => {
  const input = fixture(); input.stats.meshes.arch_socket_public.triangles = 3001;
  assert.match(auditBuildingDressingBatches(input).errors.join(' '), /source population|counts differ/);
  const missing = fixture(); delete missing.stats.buildingDressingBatches.groups.ground.sources;
  assert.match(auditBuildingDressingBatches(missing).errors.join(' '), /sources|source equivalence/);
  const changed = fixture(); changed.json.accessors[1].count -= 3;
  assert.match(auditBuildingDressingBatches(changed).errors.join(' '), /triangle counts differ/);
});

test('the call ceiling, source-zone attribute, bounds and digest remain mandatory', () => {
  for (const change of [
    input => { input.json.meshes[0].primitives = Array(41).fill(input.json.meshes[0].primitives[0]); },
    input => { delete input.json.meshes[0].primitives[0].attributes._DRESSING_ZONE; },
    input => { input.stats.bounds.building_dressing_batch_ground.min[0] = 1; },
    input => { input.stats.buildingDressingBatches.groups.ground.poseDigest = ''; },
  ]) {
    const input = fixture(); change(input); assert.ok(auditBuildingDressingBatches(input).errors.length > 0);
  }
});
