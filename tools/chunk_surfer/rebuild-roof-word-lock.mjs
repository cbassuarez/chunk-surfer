// Rebuild the six wheel recesses of the existing roof leaf only. Everything
// outside its one black slot primitive retains its exact accessor data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildAcademicRoof } from './academic-roof-geometry.mjs';
import { parseGlb, encodeGlb, meshFingerprint } from './rebuild-tree-crowns.mjs';

const name = 'academic_roof_gate', sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const align = n => (n + 3) & ~3;
function slotBoxesFromSource() {
  const boxes = [], materials = Array.from({ length: 34 }, (_, i) => ({ name: `base-${i}` }));
  const MAT = { dark:0, wood:1, black:2, steel:3, ivory:4, brass:5, cloth:6, cone:7, paper:8,
    portrait:9, stone:10, plaster:11, bronze:12, soil:13, deadLeaf:14, poolBlue:15, poolMint:16,
    agedWhite:17, safetyRed:18, roofGlass:19, vfd:20, warmWindow:21, brickRed:22, brickDark:23 };
  buildAcademicRoof({ materials, MAT, mesh: name => ({ name }),
    addBox(mesh, centre, size, material) {
      if (mesh.name === name && material === MAT.black) boxes.push({ centre, size });
    }, addBeam() {}, addEllipsoid() {}, addCylinder() {}, addQuad() {} });
  if (boxes.length !== 6 || boxes.some(box => box.centre[0] !== -.092 || box.centre[1] !== 1.65
    || JSON.stringify(box.size) !== JSON.stringify([.01, .085, .085]))) throw Error('Unexpected editable gate-slot construction');
  return boxes;
}
function values(pack, index) {
  const a = pack.json.accessors[index], view = pack.json.bufferViews[a.bufferView];
  const width = { SCALAR:1, VEC2:2, VEC3:3 }[a.type], size = { 5126:4, 5125:4, 5123:2 }[a.componentType];
  const method = { 5126:'readFloatLE', 5125:'readUInt32LE', 5123:'readUInt16LE' }[a.componentType];
  return Array.from({ length:a.count }, (_, i) => Array.from({ length:width }, (_, k) =>
    pack.bin[method]((view.byteOffset || 0) + (a.byteOffset || 0) + i * (view.byteStride || width * size) + k * size)));
}
export function patchRoofWordLock(input) {
  const json = structuredClone(input.json), mesh = json.meshes.find(mesh => mesh.name === name);
  if (!mesh) throw Error('Roof leaf absent');
  const slot = mesh.primitives.find(primitive => json.materials[primitive.material].name === 'black lacquer');
  if (!slot) throw Error('Roof wheel-slot primitive absent');
  const boxes = slotBoxesFromSource(), positions = values(input, slot.attributes.POSITION);
  if (positions.length === boxes.length * 24) {
    boxes.forEach((box, i) => {
      const z = positions.slice(i * 24, (i + 1) * 24).map(p => p[2]);
      if (Math.abs((Math.min(...z) + Math.max(...z)) / 2 - box.centre[2]) > .00001) throw Error('Existing six-slot revision differs from its source');
    });
    return { json, bin:Buffer.from(input.bin) };
  }
  if (positions.length !== 72 || json.accessors[slot.indices].count !== 108) throw Error('Unknown roof wheel-slot revision');
  const template = positions.slice(0, 24), templateZ = template.map(p => p[2]);
  const oldZ = (Math.min(...templateZ) + Math.max(...templateZ)) / 2;
  const chunks = [Buffer.from(input.bin)]; let length = input.bin.length;
  const append = (rows, oldIndex) => {
    const a = json.accessors[oldIndex], width = rows[0].length;
    const constructor = { 5126:Float32Array, 5125:Uint32Array, 5123:Uint16Array }[a.componentType];
    const data = Buffer.from(new constructor(rows.flat()).buffer), offset = align(length);
    if (offset > length) chunks.push(Buffer.alloc(offset - length));
    chunks.push(data); length = offset + data.length;
    const bufferView = json.bufferViews.length;
    json.bufferViews.push({ buffer:0, byteOffset:offset, byteLength:data.length });
    const accessor = { ...a, bufferView, byteOffset:0, count:rows.length };
    if (a.min) accessor.min = Array.from({ length:width }, (_, k) => Math.min(...rows.map(row => row[k])));
    if (a.max) accessor.max = Array.from({ length:width }, (_, k) => Math.max(...rows.map(row => row[k])));
    json.accessors.push(accessor); return json.accessors.length - 1;
  };
  for (const [attribute, oldIndex] of Object.entries(slot.attributes)) {
    const templateValues = values(input, oldIndex).slice(0, 24);
    const rows = boxes.flatMap(box => templateValues.map(row => attribute === 'POSITION'
      ? [row[0], row[1], row[2] + box.centre[2] - oldZ] : [...row]));
    slot.attributes[attribute] = append(rows, oldIndex);
  }
  const templateIndices = values(input, slot.indices).slice(0, 36);
  slot.indices = append(boxes.flatMap((_box, i) => templateIndices.map(([value]) => [value + i * 24])), slot.indices);
  mesh.extras = { ...mesh.extras, roofWordLockRevision:1, wheelCount:boxes.length };
  json.buffers = [{ byteLength:length }];
  return { json, bin:Buffer.concat(chunks) };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const file = path.join(root, 'public/assets/conservatory-props.glb'), before = fs.readFileSync(file), original = parseGlb(before);
  const creditsFile = file.replace('.glb', '.credits.json'), credits = JSON.parse(fs.readFileSync(creditsFile));
  if (credits.pack.sha256 !== sha(before)) throw Error('Pack differs from credits; refusing overwrite');
  const result = patchRoofWordLock(original), bytes = encodeGlb(result.json, result.bin), unchanged = {};
  for (const mesh of original.json.meshes.filter(mesh => mesh.name !== name)) {
    const hash = meshFingerprint(original, mesh);
    if (hash !== meshFingerprint(result, result.json.meshes.find(m => m.name === mesh.name))) throw Error(`Unrelated mesh changed: ${mesh.name}`);
    unchanged[mesh.name] = hash;
  }
  const images = pack => (pack.json.images || []).map(image => {
    const view = pack.json.bufferViews[image.bufferView];
    return sha(pack.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
  });
  if (JSON.stringify(original.json.materials) !== JSON.stringify(result.json.materials)
    || JSON.stringify(original.json.nodes) !== JSON.stringify(result.json.nodes)
    || JSON.stringify(images(original)) !== JSON.stringify(images(result))) throw Error('Material, node or image changed');
  const statsFile = file.replace('.glb', '.stats.json'), stats = JSON.parse(fs.readFileSync(statsFile));
  const target = result.json.meshes.find(mesh => mesh.name === name), priorTriangles = stats.meshes[name].triangles;
  const triangles = target.primitives.reduce((sum, primitive) => sum + result.json.accessors[primitive.indices].count / 3, 0);
  const vertices = target.primitives.reduce((sum, primitive) => sum + result.json.accessors[primitive.attributes.POSITION].count, 0);
  stats.meshes[name] = { ...stats.meshes[name], triangles, vertices };
  stats.totalTriangles += triangles - priorTriangles; stats.bytes = bytes.length;
  stats.roofWordLock = { revision:1, wheelCount:6, generator:'tools/chunk_surfer/academic-roof-geometry.mjs',
    repair:'tools/chunk_surfer/rebuild-roof-word-lock.mjs' };
  credits.pack.sha256 = sha(bytes); credits.pack.bytes = bytes.length; credits.pack.triangles = stats.totalTriangles;
  credits.meshes.find(mesh => mesh.name === name).triangles = triangles;
  const report = { beforeSha256:sha(before), afterSha256:sha(bytes), wheelCount:6, triangles, vertices,
    triangleIncrease:triangles - priorTriangles, unchangedMeshes:unchanged, materialsUnchanged:true,
    nodesUnchanged:true, embeddedImageHashes:images(result), source:'tools/chunk_surfer/academic-roof-geometry.mjs' };
  if (sha(fs.readFileSync(file)) !== sha(before)) throw Error('Pack changed during repair');
  fs.writeFileSync(file, bytes); fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2) + '\n');
  fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + '\n');
  fs.mkdirSync(path.join(root, 'artifacts/roof-word-lock'), { recursive:true });
  fs.writeFileSync(path.join(root, 'artifacts/roof-word-lock/rebuild.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ beforeSha256:report.beforeSha256, afterSha256:report.afterSha256,
    wheelCount:6, triangles, vertices, preservedMeshes:Object.keys(unchanged).length }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
