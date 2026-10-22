// Promote the existing Source driving cabin into the ordinary game's asset
// catalog. Geometry and embedded materials come from the same authored GLB.
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('../../artifacts/source-drive-study/drive.glb', import.meta.url);
const target = new URL('../../public/assets/source-vehicle-interior.glb', import.meta.url);
const bytes = await readFile(source), io = new NodeIO(), doc = await io.readBinary(bytes);
const names = ['drive_cabin', 'drive_wheel', 'drive_radio', 'drive_radio_needle',
  'drive_speed_needle', 'drive_wiper', 'drive_vehicle_body', 'drive_tyre'];
for (const node of doc.getRoot().listNodes()) if (!names.includes(node.getName())) node.dispose();

// The Source cabin was one joined static mesh. Separate only the existing
// lower driver's door and its hardware so the opening can physically open it.
// Connected components keep whole bevels, handles and winder parts together.
const cabin = doc.getRoot().listMeshes().find(mesh => mesh.getName() === 'drive_cabin');
const door = doc.createMesh('drive_cabin_door_r'), buffer = doc.getRoot().listBuffers()[0];
let doorTriangles = 0;
for (const primitive of cabin.listPrimitives()) {
  const position = primitive.getAttribute('POSITION'), indices = primitive.getIndices().getArray();
  const parents = new Map(), points = new Map();
  const root = key => { let p = parents.get(key); if (p !== key) { p = root(p); parents.set(key, p); } return p; };
  const key = index => {
    const p = position.getElement(index, []), value = p.map(n => Math.round(n * 1e6)).join(',');
    if (!parents.has(value)) { parents.set(value, value); points.set(value, p); }
    return value;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = root(key(indices[i]));
    for (let j = 1; j < 3; j++) parents.set(root(key(indices[i + j])), a);
  }
  const bounds = new Map();
  for (const [k, p] of points) {
    const r = root(k), box = bounds.get(r) || { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let c = 0; c < 3; c++) { box.min[c] = Math.min(box.min[c], p[c]); box.max[c] = Math.max(box.max[c], p[c]); }
    bounds.set(r, box);
  }
  const selected = box => box.max[1] < 1.32 && box.min[1] > .62
    && box.min[2] > -.97 && box.max[2] < .96
    && (box.min[0] > .80 || (box.min[0] > .72 && box.min[1] > .83));
  const fixed = [], moving = [];
  for (let i = 0; i < indices.length; i += 3) {
    const output = selected(bounds.get(root(key(indices[i])))) ? moving : fixed;
    output.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  if (!moving.length) continue;
  const detached = primitive.clone();
  detached.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(moving)).setBuffer(buffer));
  door.addPrimitive(detached); doorTriangles += moving.length / 3;
  if (fixed.length) primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(fixed)).setBuffer(buffer));
  else { cabin.removePrimitive(primitive); primitive.dispose(); }
}
if (doorTriangles < 500) throw new Error(`Driver door separation is incomplete (${doorTriangles} triangles)`);
doc.getRoot().listScenes()[0].addChild(doc.createNode('drive_cabin_door_r').setMesh(door));
await doc.transform(prune());
for (const mesh of doc.getRoot().listMeshes()) mesh.setName(`opening_${mesh.getName()}`);
for (const node of doc.getRoot().listNodes()) node.setName(`opening_${node.getName()}`);
const result = await io.writeBinary(doc);
await writeFile(target, result);
const receipt = {
  schema: 1, source: 'artifacts/source-drive-study/drive.glb',
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  asset: 'assets/source-vehicle-interior.glb',
  sha256: createHash('sha256').update(result).digest('hex'), bytes: result.length,
  meshes: [...names, 'drive_cabin_door_r'].map(name=>`opening_${name}`), doorTriangles,
  provenance: 'Existing project-authored Source driving vehicle. Positions, normals, UVs and materials preserved; lower right door detached without remodeling.',
};
await writeFile(new URL('../../public/assets/source-vehicle-interior.credits.json', import.meta.url), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
