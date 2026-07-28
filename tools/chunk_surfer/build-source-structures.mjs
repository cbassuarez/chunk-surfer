// Derive high-detail, complementary Source Space bust fractures from the
// checked-in CC0 marble acquisition. No raw download or Blender installation is
// required: this builder reads the runtime GLB, clips the real 9.8k-triangle
// sculpture, constructs rough capped fracture faces, and writes the runtime's
// strict indexed GLB subset plus reproducibility metadata.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE = path.join(ROOT, 'public/assets/conservatory-acquisitions.glb');
const SOURCE_CREDITS = path.join(ROOT, 'public/assets/conservatory-acquisitions.credits.json');
const OUT = path.join(ROOT, 'public/assets/source-structures.glb');
const STATS = path.join(ROOT, 'public/assets/source-structures.stats.json');
const CREDITS = path.join(ROOT, 'public/assets/source-structures.credits.json');
const MESH_NAMES = Object.freeze([
  'source_bust_broken_torso',
  'source_bust_broken_head',
  'source_bust_face_shard',
  'source_bust_marble_chips',
]);

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const ELEMENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const EPSILON = 1e-7;
const q = (value, scale = 1e7) => Math.round(value * scale) / scale;
const vec = (values) => values.map((value) => Number(value) || 0);
const add = (a, b) => a.map((value, index) => value + b[index]);
const sub = (a, b) => a.map((value, index) => value - b[index]);
const scale = (a, amount) => a.map((value) => value * amount);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(...a);
const normalize = (a) => { const size = length(a) || 1; return scale(a, 1 / size); };
const lerp = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function parseGlb(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) throw new Error('source structures: acquisition is not GLB 2');
  let cursor = 12;
  let json = null;
  let bin = null;
  while (cursor + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(cursor);
    const type = bytes.readUInt32LE(cursor + 4);
    const chunk = bytes.subarray(cursor + 8, cursor + 8 + size);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').trim());
    else if (type === 0x004e4942) bin = chunk;
    cursor += 8 + size;
  }
  if (!json || !bin) throw new Error('source structures: acquisition is missing JSON or BIN');
  return { json, bin };
}

function readAccessor(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  const Ctor = COMPONENT[accessor.componentType];
  const count = ELEMENTS[accessor.type];
  if (!Ctor || !count || accessor.sparse) throw new Error(`source structures: unsupported accessor ${accessorIndex}`);
  const stride = view.byteStride || Ctor.BYTES_PER_ELEMENT * count;
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const data = new Ctor(accessor.count * count);
  const source = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const getter = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[accessor.componentType];
  for (let row = 0; row < accessor.count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      data[row * count + column] = source[getter](start + row * stride + column * Ctor.BYTES_PER_ELEMENT, true);
    }
  }
  return data;
}

function vertexAt(positions, normals, uvs, index) {
  return {
    p: [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]],
    n: normalize([normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]]),
    uv: uvs ? [uvs[index * 2], uvs[index * 2 + 1]] : [0, 0],
  };
}

function extractBust(json, bin) {
  const mesh = (json.meshes || []).find((candidate) => candidate.name === 'marble_bust_01');
  if (!mesh || mesh.primitives.length !== 1) throw new Error('source structures: marble_bust_01 must have one primitive');
  const primitive = mesh.primitives[0];
  const positions = readAccessor(json, bin, primitive.attributes.POSITION);
  const normals = readAccessor(json, bin, primitive.attributes.NORMAL);
  const uvs = primitive.attributes.TEXCOORD_0 == null ? null : readAccessor(json, bin, primitive.attributes.TEXCOORD_0);
  const indices = readAccessor(json, bin, primitive.indices);
  const triangles = [];
  for (let index = 0; index < indices.length; index += 3) {
    triangles.push({
      material: 'exterior',
      vertices: [0, 1, 2].map((offset) => vertexAt(positions, normals, uvs, indices[index + offset])),
    });
  }
  return { triangles, materialIndex: primitive.material };
}

function cloneVertex(vertex, overrides = {}) {
  return { p: [...vertex.p], n: [...vertex.n], uv: [...vertex.uv], ...overrides };
}

function fractureBasis(normal) {
  const axis = Math.abs(normal[1]) < 0.86 ? [0, 1, 0] : [1, 0, 0];
  const tangent = normalize(cross(normal, axis));
  return { tangent, bitangent: normalize(cross(normal, tangent)) };
}

function warpFracturePoint(point, plane) {
  const { tangent, bitangent } = fractureBasis(plane.normal);
  const u = dot(point, tangent), v = dot(point, bitangent);
  const chip = Math.sin(u * 137 + v * 91 + plane.seed) * 0.0048
    + Math.sin(u * 311 - v * 173 + plane.seed * 1.7) * 0.0023;
  const lateral = Math.sin(u * 223 + v * 149 + plane.seed * 0.7) * 0.0018;
  return add(add(point, scale(plane.normal, chip)), scale(tangent, lateral));
}

function signedDistance(point, plane) {
  return dot(sub(point, plane.point), plane.normal);
}

function intersection(a, b, da, db, plane) {
  const t = da / (da - db);
  const p = warpFracturePoint(lerp(a.p, b.p, t), plane);
  return {
    p: p.map((value) => q(value)),
    n: normalize(lerp(a.n, b.n, t)),
    uv: lerp(a.uv, b.uv, t),
  };
}

function pointKey(point) {
  return point.map((value) => Math.round(value * 1e6)).join(',');
}

function clipPolygon(vertices, plane, keepPositive) {
  const output = [];
  const intersections = [];
  const inside = (distance) => keepPositive ? distance >= -EPSILON : distance <= EPSILON;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const currentDistance = signedDistance(current.p, plane);
    const nextDistance = signedDistance(next.p, plane);
    const currentInside = inside(currentDistance);
    const nextInside = inside(nextDistance);
    if (currentInside) output.push(cloneVertex(current));
    if (currentInside !== nextInside) {
      const cut = intersection(current, next, currentDistance, nextDistance, plane);
      output.push(cut);
      intersections.push(cut.p);
    }
  }
  return { vertices: output, intersections };
}

function segmentLoops(segments) {
  const points = new Map();
  const adjacency = new Map();
  const edges = new Set();
  for (const [a, b] of segments) {
    const ka = pointKey(a), kb = pointKey(b);
    if (ka === kb) continue;
    const edge = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    if (edges.has(edge)) continue;
    edges.add(edge); points.set(ka, a); points.set(kb, b);
    if (!adjacency.has(ka)) adjacency.set(ka, new Set());
    if (!adjacency.has(kb)) adjacency.set(kb, new Set());
    adjacency.get(ka).add(kb); adjacency.get(kb).add(ka);
  }
  const unused = new Set(edges);
  const loops = [];
  const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  while (unused.size) {
    const firstEdge = unused.values().next().value;
    const [start, first] = firstEdge.split('|');
    const keys = [start];
    let previous = start;
    let current = first;
    unused.delete(firstEdge);
    for (let guard = 0; guard < edges.size + 4; guard += 1) {
      keys.push(current);
      if (current === start) break;
      const candidates = [...(adjacency.get(current) || [])]
        .filter((candidate) => candidate !== previous && unused.has(edgeKey(current, candidate)));
      const fallback = [...(adjacency.get(current) || [])]
        .find((candidate) => unused.has(edgeKey(current, candidate)));
      const next = candidates[0] || fallback;
      if (!next) break;
      unused.delete(edgeKey(current, next));
      previous = current;
      current = next;
    }
    if (keys.length >= 4 && keys[keys.length - 1] === start) loops.push(keys.slice(0, -1).map((key) => points.get(key)));
  }
  return loops;
}

function loopNormal(loop) {
  let normal = [0, 0, 0];
  for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index], b = loop[(index + 1) % loop.length];
    normal = add(normal, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  return normalize(normal);
}

function capLoop(loop, desiredNormal) {
  const ordered = dot(loopNormal(loop), desiredNormal) >= 0 ? loop : [...loop].reverse();
  const center = scale(ordered.reduce((sum, point) => add(sum, point), [0, 0, 0]), 1 / ordered.length);
  const { tangent, bitangent } = fractureBasis(desiredNormal);
  const toVertex = (point, normal = desiredNormal) => ({
    p: point.map((value) => q(value)), n: [...normal], uv: [dot(point, tangent) * 8, dot(point, bitangent) * 8],
  });
  const inner = ordered.map((point) => add(lerp(point, center, 0.075), scale(desiredNormal, 0.0025)));
  const triangles = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const next = (index + 1) % ordered.length;
    triangles.push({ material: 'interior', vertices: [toVertex(ordered[index]), toVertex(ordered[next]), toVertex(inner[next])] });
    triangles.push({ material: 'interior', vertices: [toVertex(ordered[index]), toVertex(inner[next]), toVertex(inner[index])] });
    triangles.push({ material: 'interior', vertices: [toVertex(inner[index]), toVertex(inner[next]), toVertex(center)] });
  }
  return triangles;
}

function clipMesh(mesh, plane, keepPositive) {
  const triangles = [];
  const segments = [];
  for (const triangle of mesh.triangles) {
    const clipped = clipPolygon(triangle.vertices, plane, keepPositive);
    if (clipped.vertices.length >= 3) {
      for (let index = 1; index < clipped.vertices.length - 1; index += 1) {
        triangles.push({ material: triangle.material, vertices: [clipped.vertices[0], clipped.vertices[index], clipped.vertices[index + 1]] });
      }
    }
    if (clipped.intersections.length === 2) segments.push(clipped.intersections);
  }
  const loops = segmentLoops(segments);
  if (!loops.length) throw new Error(`source structures: ${plane.id} did not produce a closed fracture loop`);
  const desiredNormal = keepPositive ? scale(plane.normal, -1) : plane.normal;
  for (const loop of loops) triangles.push(...capLoop(loop, desiredNormal));
  return { triangles, cutLoops: loops };
}

function boundsFor(mesh) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const triangle of mesh.triangles) for (const vertex of triangle.vertices) for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], vertex.p[axis]); max[axis] = Math.max(max[axis], vertex.p[axis]);
  }
  return { min, max };
}

function floorCenterMesh(mesh) {
  const bounds = boundsFor(mesh);
  const center = [(bounds.min[0] + bounds.max[0]) / 2, bounds.min[1], (bounds.min[2] + bounds.max[2]) / 2];
  return {
    triangles: mesh.triangles.map((triangle) => ({
      material: triangle.material,
      vertices: triangle.vertices.map((vertex) => cloneVertex(vertex, { p: sub(vertex.p, center).map((value) => q(value)) })),
    })),
  };
}

function makeChips(points) {
  const triangles = [];
  const selected = points.filter((_, index) => index % Math.max(1, Math.floor(points.length / 7)) === 0).slice(0, 7);
  selected.forEach((point, index) => {
    const radius = 0.0055 + (index % 3) * 0.0023;
    const center = add(point, [(index - 3) * 0.008, -point[1] + radius * 1.4, ((index * 7) % 5 - 2) * 0.009]);
    const vertices = [
      add(center, [0, radius * 1.7, 0]),
      add(center, [-radius, 0, -radius * 0.7]),
      add(center, [radius * 1.1, 0, -radius * 0.5]),
      add(center, [radius * 0.2, 0, radius * 1.2]),
    ];
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]]) {
      const normal = normalize(cross(sub(vertices[b], vertices[a]), sub(vertices[c], vertices[a])));
      triangles.push({ material: 'interior', vertices: [a, b, c].map((slot) => ({ p: vertices[slot], n: normal, uv: [0, 0] })) });
    }
  });
  return floorCenterMesh({ triangles });
}

function meshTopology(mesh) {
  const edges = new Map();
  for (const triangle of mesh.triangles) {
    const keys = triangle.vertices.map((vertex) => pointKey(vertex.p));
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const key = keys[a] < keys[b] ? `${keys[a]}|${keys[b]}` : `${keys[b]}|${keys[a]}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  const openEdges = [...edges.values()].filter((count) => count !== 2).length;
  return { watertight: openEdges === 0, openEdges };
}

function packMesh(mesh) {
  const groups = new Map([['exterior', { positions: [], normals: [], uvs: [], indices: [] }], ['interior', { positions: [], normals: [], uvs: [], indices: [] }]]);
  for (const triangle of mesh.triangles) {
    const group = groups.get(triangle.material) || groups.get('interior');
    for (const vertex of triangle.vertices) {
      group.indices.push(group.positions.length / 3);
      group.positions.push(...vertex.p); group.normals.push(...normalize(vertex.n)); group.uvs.push(...vertex.uv);
    }
  }
  return [...groups.entries()].filter(([, group]) => group.indices.length).map(([material, group]) => ({ material, ...group }));
}

function align4(buffer, pad = 0) {
  const extra = (4 - buffer.length % 4) % 4;
  return extra ? Buffer.concat([buffer, Buffer.alloc(extra, pad)]) : buffer;
}

function writePack(meshes, sourceJson, sourceBin, sourceMaterialIndex) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteOffset = 0;
  const addBuffer = (raw, target = null) => {
    const buffer = align4(Buffer.from(raw));
    const index = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: raw.length, ...(target ? { target } : {}) });
    chunks.push(buffer); byteOffset += buffer.length;
    return index;
  };
  const accessor = (array, type, componentType, { target, min = null, max = null } = {}) => {
    const view = addBuffer(Buffer.from(array.buffer, array.byteOffset, array.byteLength), target);
    const index = accessors.length;
    accessors.push({ bufferView: view, componentType, count: array.length / ELEMENTS[type], type, ...(min ? { min } : {}), ...(max ? { max } : {}) });
    return index;
  };

  const gltfMeshes = [];
  const nodes = [];
  const reports = {};
  for (const [name, mesh] of Object.entries(meshes)) {
    const packed = packMesh(mesh);
    const primitives = packed.map((group) => {
      const positions = Float32Array.from(group.positions);
      const normals = Float32Array.from(group.normals);
      const uvs = Float32Array.from(group.uvs);
      const indices = Uint32Array.from(group.indices);
      const bounds = boundsFor({ triangles: mesh.triangles });
      return {
        attributes: {
          POSITION: accessor(positions, 'VEC3', 5126, { target: 34962, min: bounds.min, max: bounds.max }),
          NORMAL: accessor(normals, 'VEC3', 5126, { target: 34962 }),
          TEXCOORD_0: accessor(uvs, 'VEC2', 5126, { target: 34962 }),
        },
        indices: accessor(indices, 'SCALAR', 5125, { target: 34963 }),
        material: group.material === 'exterior' ? 0 : 1,
        mode: 4,
      };
    });
    const topology = meshTopology(mesh);
    const bounds = boundsFor(mesh);
    reports[name] = {
      triangles: mesh.triangles.length,
      vertices: mesh.triangles.length * 3,
      bounds: { min: bounds.min.map((value) => +value.toFixed(6)), max: bounds.max.map((value) => +value.toFixed(6)) },
      ...topology,
    };
    gltfMeshes.push({ name, primitives });
    nodes.push({ name, mesh: gltfMeshes.length - 1 });
  }

  const sourceMaterial = sourceJson.materials[sourceMaterialIndex];
  const referencedTextureIndices = [
    sourceMaterial.normalTexture?.index,
    sourceMaterial.pbrMetallicRoughness?.baseColorTexture?.index,
    sourceMaterial.pbrMetallicRoughness?.metallicRoughnessTexture?.index,
  ].filter(Number.isInteger);
  const imageMap = new Map();
  const samplerMap = new Map();
  const images = [];
  const samplers = [];
  const textures = referencedTextureIndices.map((textureIndex) => {
    const texture = sourceJson.textures[textureIndex];
    let image = imageMap.get(texture.source);
    if (image == null) {
      const sourceImage = sourceJson.images[texture.source];
      const sourceView = sourceJson.bufferViews[sourceImage.bufferView];
      const start = sourceView.byteOffset || 0;
      image = images.length;
      imageMap.set(texture.source, image);
      images.push({
        name: sourceImage.name,
        mimeType: sourceImage.mimeType,
        bufferView: addBuffer(sourceBin.subarray(start, start + sourceView.byteLength)),
      });
    }
    let sampler = samplerMap.get(texture.sampler);
    if (sampler == null) {
      sampler = samplers.length;
      samplerMap.set(texture.sampler, sampler);
      samplers.push({ ...(sourceJson.samplers?.[texture.sampler] || {}) });
    }
    return { source: image, sampler };
  });
  const [normalTextureIndex, baseTextureIndex, roughTextureIndex] = referencedTextureIndices.map((_, index) => index);
  const materials = [
    {
      name: 'source marble exterior', doubleSided: true,
      normalTexture: { index: normalTextureIndex },
      pbrMetallicRoughness: {
        baseColorTexture: { index: baseTextureIndex }, metallicFactor: 0,
        metallicRoughnessTexture: { index: roughTextureIndex }, roughnessFactor: 0.82,
      },
    },
    {
      name: 'rough exposed marble fracture', doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: [0.43, 0.43, 0.39, 1], metallicFactor: 0, roughnessFactor: 0.98 },
    },
  ];
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'chunk-surfer build-source-structures.mjs' },
    scene: 0, scenes: [{ nodes: nodes.map((_, index) => index) }], nodes,
    meshes: gltfMeshes, materials, textures, images, samplers,
    buffers: [{ byteLength: bin.length }], bufferViews, accessors,
  };
  const jsonBytes = align4(Buffer.from(JSON.stringify(json)), 0x20);
  const binBytes = align4(bin);
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
  header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binBytes.length, 8);
  jsonHeader.writeUInt32LE(jsonBytes.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(binBytes.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return { bytes: Buffer.concat([header, jsonHeader, jsonBytes, binHeader, binBytes]), reports };
}

const sourceBytes = fs.readFileSync(SOURCE);
const sourceCredits = JSON.parse(fs.readFileSync(SOURCE_CREDITS, 'utf8'));
const source = parseGlb(sourceBytes);
const bust = extractBust(source.json, source.bin);
const neckPlane = { id: 'neck fracture', point: [0, 0.305, 0], normal: normalize([0.12, 1, 0.08]), seed: 17.4 };
const facePlane = { id: 'face fracture', point: [0.035, 0.405, -0.025], normal: normalize([0.82, -0.12, -0.56]), seed: 43.7 };
const torso = clipMesh(bust, neckPlane, false);
const headBase = clipMesh(bust, neckPlane, true);
const head = clipMesh(headBase, facePlane, false);
const face = clipMesh(headBase, facePlane, true);
const chipPoints = [...torso.cutLoops.flat(), ...face.cutLoops.flat()];
const meshes = {
  source_bust_broken_torso: floorCenterMesh(torso),
  source_bust_broken_head: floorCenterMesh(head),
  source_bust_face_shard: floorCenterMesh(face),
  source_bust_marble_chips: makeChips(chipPoints),
};
const { bytes, reports } = writePack(meshes, source.json, source.bin, bust.materialIndex);
for (const name of MESH_NAMES) {
  if (!reports[name]) throw new Error(`source structures: missing ${name}`);
  if (!reports[name].watertight) throw new Error(`source structures: ${name} has ${reports[name].openEdges} open topology edges`);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, bytes);
const sourceInfo = sourceCredits.sources.find((entry) => entry.mesh === 'marble_bust_01');
const packHash = sha256(bytes);
const stats = {
  file: path.basename(OUT), generator: 'tools/chunk_surfer/build-source-structures.mjs',
  bytes: bytes.length, sha256: packHash,
  totalTriangles: Object.values(reports).reduce((sum, report) => sum + report.triangles, 0),
  totalVertices: Object.values(reports).reduce((sum, report) => sum + report.vertices, 0),
  meshes: reports,
};
const credits = {
  file: path.basename(OUT),
  pack: { sha256: packHash, bytes: bytes.length, triangles: stats.totalTriangles },
  source: {
    mesh: 'marble_bust_01', source: sourceInfo.source, license: sourceInfo.license,
    archive: sourceInfo.archive, archiveSha256: sourceInfo.archiveSha256,
    acquisitionPack: path.basename(SOURCE), acquisitionPackSha256: sha256(sourceBytes),
  },
  derivation: {
    builder: 'tools/chunk_surfer/build-source-structures.mjs', deterministic: true,
    operations: ['complementary triangle-plane clipping', 'deterministic irregular edge displacement', 'rough inset fracture caps', 'derived marble chips'],
    externalDownloadsRequired: false,
  },
  meshes: Object.entries(reports).map(([name, report]) => ({ name, ...report })),
};
fs.writeFileSync(STATS, `${JSON.stringify(stats, null, 2)}\n`);
fs.writeFileSync(CREDITS, `${JSON.stringify(credits, null, 2)}\n`);
console.log(`SOURCE STRUCTURES: ${path.relative(ROOT, OUT)} · ${stats.totalTriangles} triangles · ${(bytes.length / 1024 / 1024).toFixed(2)} MiB`);
