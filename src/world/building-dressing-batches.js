// Render-only assemblies for the newly added fixed building dressing. Gameplay
// continues to own the individual props, contacts, IDs and collision bodies.
export const BUILDING_DRESSING_BATCH_VERSION = 1;
const PREFIXES = Object.freeze(['arch_', 'occupation_', 'amenity_', 'building_window_']);

export function isBuildingDressingMesh(name) {
  return typeof name === 'string' && PREFIXES.some(prefix => name.startsWith(prefix));
}

export function isBatchableBuildingDressing(instance) {
  return isBuildingDressingMesh(instance?.mesh) && !instance.matrix && !instance.character
    && !instance.waterlineBody && !instance.portraitIndex && !instance.apparitionVariant
    && !(Number(instance.paperIndex) >= 0)
    && !(Array.isArray(instance.emissive) && instance.emissive.some(Number));
}

const number = value => Number(Number(value || 0).toFixed(8));
export function buildingDressingPoseDigest(instances) {
  const poses = instances.map(instance => [instance.id, instance.mesh,
    number(instance.x), number(instance.y), number(instance.z), number(instance.yaw),
    number(instance.scale ?? 1), number(instance.scaleX ?? 1),
    number(instance.scaleY ?? 1), number(instance.scaleZ ?? 1),
    number(instance.zone), !!instance.structural,
  ]).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0);
  // This is a reproducible freshness check, not a security hash. A changed
  // contact, pose, floor, family or population restores ordinary rendering.
  const text = JSON.stringify(poses); let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function batchBuildingDressingInstances(instances, group, manifest) {
  const batch = manifest?.version === BUILDING_DRESSING_BATCH_VERSION && manifest.groups?.[group];
  if (!batch || !Array.isArray(batch.anchor)) return instances;
  const members = instances.filter(isBatchableBuildingDressing);
  if (members.length !== batch.count || buildingDressingPoseDigest(members) !== batch.poseDigest) return instances;
  return [...instances.filter(instance => !isBatchableBuildingDressing(instance)), {
    id: `building-dressing-batch-${group}`, mesh: batch.mesh,
    x: batch.anchor[0], y: batch.anchor[1], z: batch.anchor[2],
    yaw: 0, scale: 1, zone: 0, structural: true, buildingDressingBatch: true,
  }];
}
