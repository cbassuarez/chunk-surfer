import assert from 'node:assert/strict';
import test from 'node:test';
import { coastalMeshTriangles, coastalGeometrySightline, createCoastalVisibilityQuery, coastalVertexVisibility, coastalSurfaceSampleVisibility } from '../tools/chunk_surfer/source-drive-study/coastal-sightlines.mjs';
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const quad = (name, x0 = -2, x1 = 2) => ({ name, primitives: [{ positions: [x0, -2, 0, x1, -2, 0, x1, 2, 0, x0, 2, 0], indices: [0, 1, 2, 0, 2, 3] }] });
const prop = (mesh, z, id = mesh) => ({ mesh, id, matrix: [...I.slice(0, 14), z, 1] });
test('all opaque is opt-in and explicit exclusions preserve the existing land-only contract', () => {
  const meshes = [quad('cm_grass_bank'), quad('drive_vehicle_body'), quad('cm_seabed')], props = [prop('cm_grass_bank', -8), prop('drive_vehicle_body', -2), prop('cm_seabed', -5)];
  const land = coastalMeshTriangles(meshes, props), full = coastalMeshTriangles(meshes, props, { allOpaque: true });
  assert.equal(land.length, 2); assert.equal(full.length, 6);
  assert.equal(createCoastalVisibilityQuery(land).ray([0, 0, 0], [0, 0, -10]).obstruction.mesh, 'cm_grass_bank');
  const q = createCoastalVisibilityQuery(full);
  assert.equal(q.ray([0, 0, 0], [0, 0, -10]).obstruction.mesh, 'drive_vehicle_body');
  assert.equal(q.ray([0, 0, 0], [0, 0, -10], { excludeMeshes: ['drive_vehicle_body'] }).obstruction.mesh, 'cm_seabed');
  assert.equal(coastalMeshTriangles(meshes, props, { allOpaque: true, excludeMeshes: ['drive_vehicle_body', 'cm_seabed'] }).length, 2);
});
test('BVH nearest hit agrees with exhaustive exact rays and handles empty/parallel paths', () => {
  const meshes = [quad('cm_grass_bank')], props = Array.from({ length: 50 }, (_, i) => prop('cm_grass_bank', -3 - i, 'wall-' + i));
  const triangles = coastalMeshTriangles(meshes, props), q = createCoastalVisibilityQuery(triangles);
  for (const x of [-3, -1.5, 0, .5, 1.5, 3]) for (const y of [-3, 0, 1, 3]) {
    const eye = [x, y, 0], target = [x * .8, y * .8, -60];
    assert.deepEqual(q.ray(eye, target).obstruction, coastalGeometrySightline(eye, target, triangles).obstruction);
  }
  assert.equal(createCoastalVisibilityQuery([]).ray([0, 0, 0], [0, 1, 0]).clear, true);
});
test('unique vertices and surface centroid samples expose a partially hidden target', () => {
  const target = quad('target', -1, 1), wall = quad('cm_grass_bank', 0, 2);
  const triangles = coastalMeshTriangles([wall, target], [prop(wall.name, -5), prop(target.name, -10)], { allOpaque: true });
  const q = createCoastalVisibilityQuery(triangles), matrix = prop(target.name, -10).matrix, eye = [0, 0, 0];
  const vertices = coastalVertexVisibility({ mesh: target, matrix, eye, query: q, minimumY: 0 });
  assert.equal(vertices.uniqueVertices, 4); assert.equal(vertices.considered, 2); assert.equal(vertices.clear, 1); assert.equal(vertices.occluded, 1);
  const surface = coastalSurfaceSampleVisibility({ mesh: target, matrix, eye, query: q });
  assert.equal(surface.considered, 2); assert.equal(surface.clear, 1); assert.equal(surface.occluded, 1);
});
