// Bounded alignment repair. The established steelwork retains its topology,
// materials and normals; only the two flights' misplaced vertex positions move.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LOADING_BAY_ACCESS } from '../../src/data/loading-bay-access.js';
import { parseGlb, encodeGlb, meshFingerprint } from './rebuild-tree-crowns.mjs';

const name = 'yard_dock_access', sha = value => crypto.createHash('sha256').update(value).digest('hex');
const align = value => (value + 3) & ~3;
function positions(pack, index) {
  const a = pack.json.accessors[index], view = pack.json.bufferViews[a.bufferView];
  if (a.componentType !== 5126 || a.type !== 'VEC3') throw Error('Dock positions must be float VEC3');
  const start = (view.byteOffset || 0) + (a.byteOffset || 0), stride = view.byteStride || 12;
  return Array.from({ length: a.count }, (_, i) => [0, 1, 2].map(axis => pack.bin.readFloatLE(start + i * stride + axis * 4)));
}
function boundsOf(pack, mesh) {
  const p = mesh.primitives.flatMap(primitive => positions(pack, primitive.attributes.POSITION));
  const rounded = value => Math.round(value * 1000) / 1000;
  return { min: [0, 1, 2].map(axis => rounded(Math.min(...p.map(p => p[axis])))),
    max: [0, 1, 2].map(axis => rounded(Math.max(...p.map(p => p[axis])))) };
}
export function patchLoadingBayAccess(input) {
  const json = structuredClone(input.json), mesh = json.meshes.find(mesh => mesh.name === name);
  if (!mesh) throw Error('Dock access mesh absent');
  const top = mesh.primitives.find(p => json.materials[p.material].name === 'dark wood');
  if (!top) throw Error('Established dock tread material absent');
  const p = positions(input, top.attributes.POSITION), { bays, meshOrigin } = LOADING_BAY_ACCESS;
  const split = (bays[0].z1 + bays[1].z0) / 2 - meshOrigin.z;
  const shifts = bays.map((bay, index) => {
    const zs = p.map(p => p[2]).filter(z => index === 0 ? z < split : z >= split);
    if (!zs.length) throw Error(`No tread vertices in ${bay.id} flight`);
    return (bay.z0 + bay.z1) / 2 - meshOrigin.z - (Math.min(...zs) + Math.max(...zs)) / 2;
  });
  if (Math.abs(shifts[0] - shifts[1]) > .00001) throw Error('Flights require different repairs; inspect geometry');
  const dz = shifts[0];
  if (Math.abs(dz) < .00001) return { json, bin: Buffer.from(input.bin) };
  if (Math.abs(dz - .5) > .00001) throw Error(`Unexpected dock revision: offset ${dz}m`);
  const flightMaterials = new Set(['dark wood', 'painted steel', 'speaker cone']);
  const fixedMaterials = new Set(['safety red', 'aged white paint']);
  const chunks = [Buffer.from(input.bin)]; let length = input.bin.length;
  for (const primitive of mesh.primitives) {
    const material = json.materials[primitive.material].name;
    if (fixedMaterials.has(material)) continue;
    if (!flightMaterials.has(material)) throw Error(`Unknown dock construction material: ${material}`);
    const old = json.accessors[primitive.attributes.POSITION];
    const values = positions(input, primitive.attributes.POSITION).map(([x, y, z]) => [x, y, z + dz]);
    const data = Buffer.from(new Float32Array(values.flat()).buffer), offset = align(length);
    if (offset > length) chunks.push(Buffer.alloc(offset - length));
    chunks.push(data); length = offset + data.length;
    const view = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
    primitive.attributes.POSITION = json.accessors.length;
    json.accessors.push({ ...old, bufferView: view, byteOffset: 0,
      min: [0, 1, 2].map(axis => Math.min(...values.map(p => p[axis]))),
      max: [0, 1, 2].map(axis => Math.max(...values.map(p => p[axis]))) });
  }
  mesh.extras = { ...mesh.extras, loadingBayAccessRevision: 1,
    loadingBayAccessProfile: 'src/data/loading-bay-access.js' };
  json.buffers = [{ byteLength: length }];
  return { json, bin: Buffer.concat(chunks) };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const file = path.join(root, 'public/assets/conservatory-props.glb');
  const before = fs.readFileSync(file), original = parseGlb(before);
  const creditsFile = file.replace('.glb', '.credits.json'), credits = JSON.parse(fs.readFileSync(creditsFile));
  if (credits.pack.sha256 !== sha(before)) throw Error('Prop pack differs from credits; refusing to overwrite');
  const result = patchLoadingBayAccess(original), bytes = encodeGlb(result.json, result.bin), unchanged = {};
  for (const mesh of original.json.meshes.filter(mesh => mesh.name !== name)) {
    const prior = meshFingerprint(original, mesh), next = result.json.meshes.find(candidate => candidate.name === mesh.name);
    if (prior !== meshFingerprint(result, next)) throw Error(`Unrelated mesh changed: ${mesh.name}`);
    unchanged[mesh.name] = prior;
  }
  const imageHashes = pack => (pack.json.images || []).map(image => {
    const view = pack.json.bufferViews[image.bufferView];
    return sha(pack.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
  });
  if (JSON.stringify(original.json.materials) !== JSON.stringify(result.json.materials)
    || JSON.stringify(original.json.nodes) !== JSON.stringify(result.json.nodes)
    || JSON.stringify(imageHashes(original)) !== JSON.stringify(imageHashes(result))) throw Error('Unrelated material, image or node changed');
  const bounds = boundsOf(result, result.json.meshes.find(mesh => mesh.name === name));
  const statsFile = file.replace('.glb', '.stats.json'), stats = JSON.parse(fs.readFileSync(statsFile));
  stats.bytes = bytes.length; stats.bounds[name] = bounds;
  stats.loadingBayAccess = { revision: 1, profile: 'src/data/loading-bay-access.js',
    generator: 'tools/chunk_surfer/loading-bay-access-geometry.mjs', repair: 'tools/chunk_surfer/rebuild-loading-bay-access.mjs' };
  credits.pack.sha256 = sha(bytes); credits.pack.bytes = bytes.length;
  const credit = credits.meshes.find(mesh => mesh.name === name); credit.bounds = bounds;
  credit.provenance = { source: stats.loadingBayAccess.generator, origin: 'project-native procedural geometry', license: 'project source' };
  const generatedFile = path.join(root, 'src/data/generated/prop-geometry.js'), generated = fs.readFileSync(generatedFile, 'utf8');
  const line = /^export const PROP_BOUNDS = Object\.freeze\(([^\n]+)\);$/m.exec(generated);
  if (!line) throw Error('Generated prop bounds declaration not recognized');
  const allBounds = JSON.parse(line[1]); allBounds[name] = bounds;
  const report = { beforeSha256: sha(before), afterSha256: sha(bytes), bounds,
    otherMeshesPreserved: unchanged, materialsUnchanged: true, nodesUnchanged: true,
    embeddedImageHashes: imageHashes(result), trianglesUnchanged: stats.meshes[name].triangles,
    bytes: bytes.length, profile: LOADING_BAY_ACCESS };
  // Read-check-write keeps a concurrently changed pack from being overwritten.
  if (sha(fs.readFileSync(file)) !== sha(before)) throw Error('Prop pack changed during repair; retry against its new revision');
  fs.writeFileSync(file, bytes); fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2) + '\n');
  fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + '\n');
  fs.writeFileSync(generatedFile, generated.replace(line[0], `export const PROP_BOUNDS = Object.freeze(${JSON.stringify(allBounds)});`));
  fs.mkdirSync(path.join(root, 'artifacts/getin-entry-repair'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifacts/getin-entry-repair/rebuild.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ beforeSha256: report.beforeSha256, afterSha256: report.afterSha256,
    bounds, preservedMeshes: Object.keys(unchanged).length, triangles: report.trianglesUnchanged, bytes: report.bytes }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
