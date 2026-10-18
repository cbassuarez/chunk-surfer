import { isBuildingDressingMesh } from '../../src/world/building-dressing-batches.js';

const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const bounds = value => vector(value?.min) && vector(value?.max) && value.min.every((v, index) => v <= value.max[index]);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Only an explicit, verified assembly class can leave the repeating-object
// triangle budget. Its expanded triangle count must equal the actual source
// mesh counts; a name alone never grants an exemption.
export function auditBuildingDressingBatches({ json, stats }) {
  const names = new Set(), errors = [];
  for (const mesh of json.meshes || []) {
    if (mesh.extras?.buildingDressingBatch !== true) continue;
    names.add(mesh.name);
    const fail = message => errors.push(`${mesh.name}: ${message}`);
    const extra = mesh.extras, entry = stats.buildingDressingBatches?.groups?.[extra.renderGroup];
    if (stats.buildingDressingBatches?.version !== 1 || !entry) { fail('missing versioned group manifest'); continue; }
    for (const key of ['mesh', 'anchor', 'count', 'poseDigest', 'materialCount', 'triangles', 'bounds', 'sources'])
      if (!equal(extra[key], entry[key])) fail(`GLB and stats disagree on ${key}`);
    if (entry.mesh !== mesh.name) fail('manifest names a different mesh');
    if (!vector(entry.anchor) || !bounds(entry.bounds)) fail('missing finite anchor or ordered bounds');
    if (!Number.isInteger(entry.count) || entry.count <= 0 || !/^[a-f0-9]{8}$/.test(entry.poseDigest || '')) fail('missing count or pose digest');
    if (mesh.primitives.length > 40 || entry.materialCount !== mesh.primitives.length || mesh.primitives.length < 1) fail('must use 1–40 material primitives');
    let actualTriangles = 0;
    for (const primitive of mesh.primitives) {
      const position = json.accessors?.[primitive.attributes?.POSITION], indices = json.accessors?.[primitive.indices];
      const zone = json.accessors?.[primitive.attributes?._DRESSING_ZONE];
      if (!position || !indices || indices.count % 3) fail('invalid indexed triangle geometry');
      else actualTriangles += indices.count / 3;
      if (zone?.type !== 'SCALAR' || zone?.componentType !== 5126 || zone?.count !== position?.count) fail('missing per-vertex source zone');
    }
    let expandedTriangles = 0, sourceCount = 0;
    if (!entry.sources || !Object.keys(entry.sources).length) fail('missing source equivalence manifest');
    for (const [sourceName, source] of Object.entries(entry.sources || {})) {
      const original = stats.meshes?.[sourceName];
      const originalMesh = json.meshes.find(item => item.name === sourceName);
      const originalTriangles = originalMesh?.primitives.reduce((sum, primitive) => sum + (json.accessors?.[primitive.indices]?.count ?? NaN) / 3, 0);
      if (!isBuildingDressingMesh(sourceName) || !original || !originalMesh || originalMesh.extras?.buildingDressingBatch
        || !Number.isInteger(source?.count) || source.count <= 0
        || !Number.isInteger(source.trianglesPerInstance) || source.trianglesPerInstance !== original.triangles
        || originalTriangles !== original.triangles) {
        fail(`invalid source population ${sourceName}`); continue;
      }
      expandedTriangles += original.triangles * source.count; sourceCount += source.count;
    }
    if (sourceCount !== entry.count) fail('source instance count is not conserved');
    if (expandedTriangles !== actualTriangles || entry.triangles !== actualTriangles || stats.meshes?.[mesh.name]?.triangles !== actualTriangles)
      fail('source, manifest and actual indexed triangle counts differ');
    const recordedBounds = stats.bounds?.[mesh.name];
    if (!bounds(entry.bounds) || !bounds(recordedBounds) || !['min', 'max'].every(key => recordedBounds[key].every((v, i) => Math.abs(v - entry.bounds[key][i]) <= .002)))
      fail('source-space bounds disagree with packed stats');
  }
  for (const entry of Object.values(stats.buildingDressingBatches?.groups || {}))
    if (!names.has(entry.mesh)) errors.push(`${entry.mesh}: group manifest has no explicitly classified GLB mesh`);
  return { names, errors };
}
