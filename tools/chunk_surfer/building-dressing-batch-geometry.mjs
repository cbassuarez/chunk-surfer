import {
  BUILDING_DRESSING_BATCH_VERSION, buildingDressingPoseDigest, isBatchableBuildingDressing,
} from '../../src/world/building-dressing-batches.js';

// The inputs are the same fully resolved render poses used in ordinary play.
// Positions, inverse-transpose normals and winding all retain their authored
// shape; only the number of mesh/material submissions changes.
export function buildBuildingDressingBatches({ meshes, mesh, groups }) {
  const manifest = { version: BUILDING_DRESSING_BATCH_VERSION, groups: {} };
  for (const [name, instances] of Object.entries(groups)) {
    const members = instances.filter(isBatchableBuildingDressing);
    if (!members.length) continue;
    const anchor = [members[0].x, members[0].y, members[0].z];
    const target = mesh(`building_dressing_batch_${name}`);
    let triangles = 0; const sources = {};
    for (const instance of members) {
      const source = meshes.get(instance.mesh);
      if (!source) throw new Error(`building dressing batch: missing ${instance.mesh}`);
      const sourceTriangles = [...source.groups.values()].reduce((sum, geometry) => sum + geometry.indices.length / 3, 0);
      if (!sources[instance.mesh]) sources[instance.mesh] = { count: 0, trianglesPerInstance: sourceTriangles };
      sources[instance.mesh].count += 1;
      const scale = instance.scale ?? 1;
      const sx = (instance.scaleX ?? 1) * scale, sy = (instance.scaleY ?? 1) * scale, sz = (instance.scaleZ ?? 1) * scale;
      if (![sx, sy, sz].every(value => Number.isFinite(value) && value !== 0))
        throw new Error(`building dressing batch: singular scale for ${instance.id}`);
      const c = Math.cos(instance.yaw || 0), s = Math.sin(instance.yaw || 0);
      for (const [material, geometry] of source.groups) {
        if (!Number.isInteger(material) || material < 0)
          throw new Error(`building dressing batch: invalid material for ${instance.mesh}`);
        if (!target.groups.has(material)) target.groups.set(material, { positions: [], normals: [], indices: [], uvs: [], dressingZones: [] });
        const out = target.groups.get(material), base = out.positions.length / 3;
        for (let index = 0; index < geometry.positions.length; index += 3) {
          const x = geometry.positions[index] * sx, y = geometry.positions[index + 1] * sy, z = geometry.positions[index + 2] * sz;
          out.positions.push(c * x - s * z + instance.x - anchor[0], y + instance.y - anchor[1], s * x + c * z + instance.z - anchor[2]);
          const nx = geometry.normals[index] / sx, ny = geometry.normals[index + 1] / sy, nz = geometry.normals[index + 2] / sz;
          const length = Math.hypot(nx, ny, nz) || 1;
          out.normals.push((c * nx - s * nz) / length, ny / length, (s * nx + c * nz) / length);
          // Zero means absent to the main shader. Every baked vertex carries
          // its original zone plus one, preserving outdoor sky illumination.
          out.dressingZones.push((instance.zone || 0) + 1);
        }
        const vertexCount = geometry.positions.length / 3;
        for (let index = 0; index < vertexCount * 2; index += 1) out.uvs.push(geometry.uvs?.[index] || 0);
        for (let index = 0; index < geometry.indices.length; index += 3) {
          const a = geometry.indices[index], b = geometry.indices[index + 1], d = geometry.indices[index + 2];
          if (sx * sy * sz < 0) out.indices.push(base + a, base + d, base + b);
          else out.indices.push(base + a, base + b, base + d);
        }
        triangles += geometry.indices.length / 3;
      }
    }
    const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const geometry of target.groups.values()) for (let index = 0; index < geometry.positions.length; index += 1) {
      const axis = index % 3; bounds.min[axis] = Math.min(bounds.min[axis], geometry.positions[index]); bounds.max[axis] = Math.max(bounds.max[axis], geometry.positions[index]);
    }
    const entry = { mesh: target.name, anchor, count: members.length,
      poseDigest: buildingDressingPoseDigest(members), materialCount: target.groups.size, triangles, bounds, sources };
    target.extras = { buildingDressingBatch: true, renderGroup: name, ...entry };
    manifest.groups[name] = entry;
  }
  return manifest;
}
