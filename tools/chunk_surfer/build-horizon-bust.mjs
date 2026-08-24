// Build the one solid object on the Horizon: a high-detail marble portrait on
// a separate monumental pedestal. The portrait geometry is copied, vertex for
// vertex, from the checked-in CC0 Poly Haven acquisition; the pedestal and its
// funerary society seal are deterministic project-authored meshes.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SOURCE = path.join(ROOT, 'public/assets/conservatory-acquisitions.glb');
const SOURCE_CREDITS = path.join(ROOT, 'public/assets/conservatory-acquisitions.credits.json');
const OUT = path.join(ROOT, 'public/assets/horizon-bust.glb');
const STATS = path.join(ROOT, 'public/assets/horizon-bust.stats.json');
const CREDITS = path.join(ROOT, 'public/assets/horizon-bust.credits.json');
const PORTRAIT_SCALE = 11.2;
const PORTRAIT_BASE_Y = 6.3;

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const normal = (a, b, c) => {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

function geometry() {
  const positions = [], normals = [], indices = [];
  const triangle = (a, b, c, supplied = null) => {
    const n = supplied || normal(a, b, c);
    const first = positions.length / 3;
    positions.push(...a, ...b, ...c);
    normals.push(...n, ...n, ...n);
    indices.push(first, first + 1, first + 2);
  };
  const quad = (a, b, c, d, supplied = null) => {
    const n = supplied || normal(a, b, c);
    triangle(a, b, c, n); triangle(a, c, d, n);
  };
  const box = (cx, cy, cz, sx, sy, sz, rotation = 0) => {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const transform = ([x, y, z]) => {
      const cosine = Math.cos(rotation), sine = Math.sin(rotation);
      return [cx + x * cosine - y * sine, cy + x * sine + y * cosine, cz + z];
    };
    const p = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    ].map(transform);
    for (const face of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]]) {
      quad(p[face[0]], p[face[1]], p[face[2]], p[face[3]]);
    }
  };
  const frustum = (cx, y0, y1, cz, bottomX, bottomZ, topX, topZ) => {
    const ring = (y, sx, sz) => [[-sx, -sz], [sx, -sz], [sx, sz], [-sx, sz]].map(([x, z]) => [cx + x, y, cz + z]);
    const bottom = ring(y0, bottomX / 2, bottomZ / 2), top = ring(y1, topX / 2, topZ / 2);
    quad(bottom[3], bottom[2], bottom[1], bottom[0], [0, -1, 0]);
    quad(top[0], top[1], top[2], top[3], [0, 1, 0]);
    for (let side = 0; side < 4; side += 1) {
      const next = (side + 1) % 4;
      quad(bottom[side], bottom[next], top[next], top[side]);
    }
  };
  const cylinderZ = (cx, cy, cz, radius, depth, segments = 24) => {
    const front = cz + depth / 2, back = cz - depth / 2;
    for (let index = 0; index < segments; index += 1) {
      const a = index / segments * Math.PI * 2, b = (index + 1) / segments * Math.PI * 2;
      const af = [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, front];
      const bf = [cx + Math.cos(b) * radius, cy + Math.sin(b) * radius, front];
      const ab = [af[0], af[1], back], bb = [bf[0], bf[1], back];
      triangle([cx, cy, front], af, bf, [0, 0, 1]);
      triangle([cx, cy, back], bb, ab, [0, 0, -1]);
      quad(ab, bb, bf, af);
    }
  };
  const ellipsoid = (cx, cy, cz, rx, ry, rz, columns = 16, rows = 10) => {
    const point = (u, v) => {
      const longitude = u * Math.PI * 2, latitude = (v - 0.5) * Math.PI;
      return [cx + Math.cos(latitude) * Math.cos(longitude) * rx, cy + Math.sin(latitude) * ry,
        cz + Math.cos(latitude) * Math.sin(longitude) * rz];
    };
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const u0 = column / columns, u1 = (column + 1) / columns, v0 = row / rows, v1 = (row + 1) / rows;
      const a = point(u0, v0), b = point(u1, v0), c = point(u1, v1), d = point(u0, v1);
      if (row > 0) triangle(a, b, c);
      if (row < rows - 1) triangle(a, c, d);
    }
  };
  return { positions, normals, indices, triangle, quad, box, frustum, cylinderZ, ellipsoid };
}

function addMesh(document, buffer, name, data, material, extras = {}) {
  const position = document.createAccessor(`${name}:position`, buffer).setType('VEC3').setArray(Float32Array.from(data.positions));
  const normalAccessor = document.createAccessor(`${name}:normal`, buffer).setType('VEC3').setArray(Float32Array.from(data.normals));
  const index = document.createAccessor(`${name}:index`, buffer).setType('SCALAR').setArray(Uint32Array.from(data.indices));
  const primitive = document.createPrimitive().setAttribute('POSITION', position).setAttribute('NORMAL', normalAccessor)
    .setIndices(index).setMaterial(material);
  const mesh = document.createMesh(name).addPrimitive(primitive).setExtras(extras);
  document.createNode(name).setMesh(mesh);
  return { mesh, triangles: data.indices.length / 3, vertices: data.positions.length / 3 };
}

const io = new NodeIO();
const sourceBytes = fs.readFileSync(SOURCE);
const sourceDocument = await io.readBinary(sourceBytes);
const sourceMesh = sourceDocument.getRoot().listMeshes().find((mesh) => mesh.getName() === 'marble_bust_01');
if (!sourceMesh || sourceMesh.listPrimitives().length !== 1) throw new Error('horizon bust: marble_bust_01 missing from acquisition pack');
const sourcePrimitive = sourceMesh.listPrimitives()[0];
const sourcePositions = sourcePrimitive.getAttribute('POSITION')?.getArray();
const sourceNormals = sourcePrimitive.getAttribute('NORMAL')?.getArray();
const sourceIndices = sourcePrimitive.getIndices()?.getArray();
if (!sourcePositions || !sourceNormals || !sourceIndices) throw new Error('horizon bust: acquisition is missing indexed position/normal geometry');

const document = new Document();
const buffer = document.createBuffer('horizon-bust-buffer');
const scene = document.createScene('HORIZON BUST');
const marble = document.createMaterial('pale funerary marble').setBaseColorFactor([0.82, 0.84, 0.79, 1])
  .setMetallicFactor(0).setRoughnessFactor(0.78).setDoubleSided(true);
const stone = document.createMaterial('black green society stone').setBaseColorFactor([0.035, 0.052, 0.047, 1])
  .setMetallicFactor(0.04).setRoughnessFactor(0.9);
const bronze = document.createMaterial('aged bronze seal').setBaseColorFactor([0.26, 0.19, 0.095, 1])
  .setMetallicFactor(0.72).setRoughnessFactor(0.58);

const portraitPositions = new Float32Array(sourcePositions.length);
for (let index = 0; index < sourcePositions.length; index += 3) {
  portraitPositions[index] = sourcePositions[index] * PORTRAIT_SCALE;
  portraitPositions[index + 1] = sourcePositions[index + 1] * PORTRAIT_SCALE + PORTRAIT_BASE_Y;
  portraitPositions[index + 2] = sourcePositions[index + 2] * PORTRAIT_SCALE;
}
const portrait = addMesh(document, buffer, 'horizon_bust_portrait', {
  positions: portraitPositions, normals: sourceNormals, indices: sourceIndices,
}, marble, { horizonRole: 'portrait', sourceMesh: 'marble_bust_01' });

const pedestalGeometry = geometry();
pedestalGeometry.box(0, 0.28, 0, 5.2, 0.56, 4.1);
pedestalGeometry.box(0, 0.76, 0, 4.65, 0.4, 3.55);
pedestalGeometry.frustum(0, 0.96, 5.35, 0, 3.75, 2.9, 3.02, 2.24);
pedestalGeometry.box(0, 5.55, 0, 3.35, 0.4, 2.52);
pedestalGeometry.box(0, 5.95, 0, 3.72, 0.4, 2.86);
pedestalGeometry.box(0, 6.22, 0, 3.24, 0.16, 2.38);
const pedestal = addMesh(document, buffer, 'horizon_bust_pedestal', pedestalGeometry, stone,
  { horizonRole: 'pedestal', collisionEnvelope: [2.6, 2.05] });

// A restrained memento mori: a recessed bronze roundel, crossed bones, and a
// flattened skull relief. At walking distance it reads as an old society seal,
// not a novelty skull pasted onto the statue.
const sealGeometry = geometry();
sealGeometry.cylinderZ(0, 3.35, 1.36, 0.9, 0.12, 32);
sealGeometry.box(0, 3.28, 1.47, 1.48, 0.13, 0.13, Math.PI / 4);
sealGeometry.box(0, 3.28, 1.47, 1.48, 0.13, 0.13, -Math.PI / 4);
sealGeometry.ellipsoid(0, 3.55, 1.51, 0.34, 0.42, 0.12, 16, 10);
sealGeometry.box(0, 3.2, 1.51, 0.43, 0.3, 0.15);
const seal = addMesh(document, buffer, 'horizon_bust_seal', sealGeometry, bronze,
  { horizonRole: 'seal', inscription: 'SOCIETAS OSSIUM / AUDI ALTERAM PARTEM / 1908' });

for (const node of document.getRoot().listNodes()) scene.addChild(node);
const bytes = await io.writeBinary(document);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, bytes);

const sourceCredits = JSON.parse(fs.readFileSync(SOURCE_CREDITS, 'utf8'));
const sourceInfo = sourceCredits.sources.find((entry) => entry.mesh === 'marble_bust_01');
const bounds = { min: [-2.6, 0, -2.05], max: [2.6, PORTRAIT_BASE_Y + 0.515 * PORTRAIT_SCALE, 2.05] };
const stats = {
  file: path.basename(OUT), generator: 'tools/chunk_surfer/build-horizon-bust.mjs', bytes: bytes.length,
  sha256: sha256(bytes), totalTriangles: portrait.triangles + pedestal.triangles + seal.triangles,
  totalVertices: portrait.vertices + pedestal.vertices + seal.vertices, bounds,
  meshes: {
    horizon_bust_portrait: { triangles: portrait.triangles, vertices: portrait.vertices, sourceMesh: 'marble_bust_01' },
    horizon_bust_pedestal: { triangles: pedestal.triangles, vertices: pedestal.vertices },
    horizon_bust_seal: { triangles: seal.triangles, vertices: seal.vertices },
  },
};
const credits = {
  file: path.basename(OUT), pack: { sha256: stats.sha256, bytes: stats.bytes, triangles: stats.totalTriangles },
  source: { mesh: 'marble_bust_01', source: sourceInfo.source, license: sourceInfo.license,
    archive: sourceInfo.archive, archiveSha256: sourceInfo.archiveSha256,
    acquisitionPack: path.basename(SOURCE), acquisitionPackSha256: sha256(sourceBytes) },
  derivation: { builder: stats.generator, deterministic: true, externalDownloadsRequired: false,
    operations: ['verbatim indexed portrait geometry copy', 'uniform monumental scale', 'authored multi-stage pedestal', 'authored funerary bronze relief'] },
};
fs.writeFileSync(STATS, `${JSON.stringify(stats, null, 2)}\n`);
fs.writeFileSync(CREDITS, `${JSON.stringify(credits, null, 2)}\n`);
console.log(`HORIZON BUST: ${path.relative(ROOT, OUT)} · ${stats.totalTriangles} triangles · ${(bytes.length / 1024).toFixed(1)} KiB`);
