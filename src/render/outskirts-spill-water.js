import { installProceduralMeshes } from './procedural-mesh-install.js';
import { OUTSKIRTS_SPILL_WATER } from '../game/outskirts-van-spill.js';

const MATERIAL = 'fountain running water';

// Select an intact fall and its basin splash from the resident park fountain.
// The shared mesh installer gives each selection an independent instance buffer.
function selectWater(primitive, name, contains, rebase) {
  const { positions, normals, uvs, indices } = primitive.nativeReceiverGeometry;
  const p = [], n = [], uv = [], i = [];
  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = Array.from(indices.subarray(offset, offset + 3));
    if (!triangle.every(index => contains(...positions.subarray(index * 3, index * 3 + 3)))) continue;
    for (const index of triangle) {
      const [x, y, z] = positions.subarray(index * 3, index * 3 + 3);
      const [nx, ny, nz] = normals.subarray(index * 3, index * 3 + 3);
      p.push(...rebase(x, y, z));
      n.push(-nz, ny, nx);
      uv.push(...uvs.subarray(index * 2, index * 2 + 2));
      i.push(i.length);
    }
  }
  return {name, p, n, uv, i, base: primitive.base, metallic: primitive.metallic, roughness: primitive.roughness};
}

export function installOutskirtsSpillWater(gl, pack) {
  if (Object.values(OUTSKIRTS_SPILL_WATER).every(name => pack.catalog.has(name))) return true;
  const water = pack.catalog.get('park_fountain')?.primitives.find(part => part.materialName === MATERIAL);
  if (!water?.nativeReceiverGeometry) return false;
  const fall = selectWater(water, OUTSKIRTS_SPILL_WATER.fall,
    (x, y, z) => x >= 1.485 && x <= 1.76 && y > -.24 && y < 1.37 && Math.abs(z) < .22,
    (x, y, z) => [-z, y - 1.36, x - 1.55]);
  const splash = selectWater(water, OUTSKIRTS_SPILL_WATER.splash,
    (x, y, z) => x > 1.60 && x < 2.1 && y > -.21 && y < .25 && Math.abs(z) < .38,
    (x, y, z) => [-z, y + .2044, x - 1.70]);
  if (!fall.i.length || !splash.i.length || !installProceduralMeshes(gl, pack, [fall, splash])) return false;
  for (const piece of [fall, splash]) pack.catalog.get(piece.name).primitives[0].materialName = MATERIAL;
  return true;
}
