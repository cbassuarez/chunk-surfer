import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../public/assets/tuning-fork.glb');

const positions = [];
const normals = [];
const uvs = [];
const indices = [];
const primitives = [];

function pushVertex(position, normal, uv = [0, 0]) {
  positions.push(...position);
  normals.push(...normal);
  uvs.push(...uv);
  return (positions.length / 3) - 1;
}

function addQuad(a, b, c, d, normal, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
  const base = indices.length;
  const ia = pushVertex(a, normal, uv[0]);
  const ib = pushVertex(b, normal, uv[1]);
  const ic = pushVertex(c, normal, uv[2]);
  const id = pushVertex(d, normal, uv[3]);
  indices.push(ia, ib, ic, ia, ic, id);
  return [base, 6];
}

function addBox({ cx, cy, cz, sx, sy, sz }) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
  addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  addQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
  addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
  addQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
  addQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
}

function addCylinder({ cx, cy, cz, radius, height, axis = 'z', segments = 24 }) {
  const start = indices.length;
  const dir = axis === 'z' ? [0, 0, 1] : [0, 1, 0];
  const half = height / 2;
  const circlePoint = (i, at) => {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (axis === 'z') return [cx + x, cy + y, cz + at];
    return [cx + x, cy + at, cz + y];
  };
  for (let i = 0; i < segments; i++) {
    const n0 = [Math.cos((i / segments) * Math.PI * 2), Math.sin((i / segments) * Math.PI * 2), 0];
    const n1 = [Math.cos(((i + 1) / segments) * Math.PI * 2), Math.sin(((i + 1) / segments) * Math.PI * 2), 0];
    const a = pushVertex(circlePoint(i, -half), axis === 'z' ? n0 : [n0[0], 0, n0[1]], [i / segments, 0]);
    const b = pushVertex(circlePoint(i + 1, -half), axis === 'z' ? n1 : [n1[0], 0, n1[1]], [(i + 1) / segments, 0]);
    const c = pushVertex(circlePoint(i + 1, half), axis === 'z' ? n1 : [n1[0], 0, n1[1]], [(i + 1) / segments, 1]);
    const d = pushVertex(circlePoint(i, half), axis === 'z' ? n0 : [n0[0], 0, n0[1]], [i / segments, 1]);
    indices.push(a, b, c, a, c, d);

    const cb = pushVertex(axis === 'z' ? [cx, cy, cz - half] : [cx, cy - half, cz], dir.map((v) => -v));
    const ca = pushVertex(circlePoint(i + 1, -half), dir.map((v) => -v));
    const cc = pushVertex(circlePoint(i, -half), dir.map((v) => -v));
    indices.push(cb, ca, cc);

    const ct = pushVertex(axis === 'z' ? [cx, cy, cz + half] : [cx, cy + half, cz], dir);
    const cd = pushVertex(circlePoint(i, half), dir);
    const ce = pushVertex(circlePoint(i + 1, half), dir);
    indices.push(ct, cd, ce);
  }
  return [start, indices.length - start];
}

function addSphere({ cx, cy, cz, radius, rings = 10, segments = 24 }) {
  const start = indices.length;
  const rows = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const phi = v * Math.PI;
    const y = Math.cos(phi);
    const rr = Math.sin(phi);
    const row = [];
    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const theta = u * Math.PI * 2;
      const nx = Math.cos(theta) * rr;
      const nz = Math.sin(theta) * rr;
      row.push(pushVertex([cx + nx * radius, cy + y * radius, cz + nz * radius], [nx, y, nz], [u, v]));
    }
    rows.push(row);
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = rows[r][s], b = rows[r][s + 1], c = rows[r + 1][s + 1], d = rows[r + 1][s];
      indices.push(a, d, c, a, c, b);
    }
  }
  return [start, indices.length - start];
}

function addMaterialPrimitive(name, material, build) {
  const start = indices.length;
  build();
  primitives.push({
    attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
    indices: 0,
    material,
    mode: 4,
    extras: { name, indexStart: start, indexCount: indices.length - start },
  });
}

addMaterialPrimitive('brushed steel body', 0, () => {
  // Diapason shape: square-section tines, a heavy bridge, stem, and rounded ball end.
  addBox({ cx: -0.055, cy: 0, cz: 0.18, sx: 0.038, sy: 0.052, sz: 0.62 });
  addBox({ cx: 0.055, cy: 0, cz: 0.18, sx: 0.038, sy: 0.052, sz: 0.62 });
  addBox({ cx: 0, cy: 0, cz: -0.14, sx: 0.155, sy: 0.056, sz: 0.06 });
  addCylinder({ cx: 0, cy: 0, cz: -0.36, radius: 0.034, height: 0.42, axis: 'z', segments: 24 });
  addSphere({ cx: 0, cy: 0, cz: -0.61, radius: 0.075, rings: 10, segments: 24 });

  // Tiny bevel-like glints at the tine tips so the fork reads in the prop pass.
  addBox({ cx: -0.055, cy: 0.031, cz: 0.495, sx: 0.039, sy: 0.01, sz: 0.026 });
  addBox({ cx: 0.055, cy: 0.031, cz: 0.495, sx: 0.039, sy: 0.01, sz: 0.026 });
});

addMaterialPrimitive('dark engraving', 1, () => {
  addBox({ cx: 0, cy: 0.035, cz: -0.44, sx: 0.048, sy: 0.004, sz: 0.01 });
  addBox({ cx: 0, cy: 0.035, cz: -0.405, sx: 0.03, sy: 0.004, sz: 0.01 });
  addBox({ cx: 0, cy: 0.035, cz: -0.37, sx: 0.04, sy: 0.004, sz: 0.01 });
});

const f32 = (values) => Buffer.from(new Float32Array(values).buffer);
const u16 = (values) => Buffer.from(new Uint16Array(values).buffer);
const align4 = (buffer, pad = 0) => {
  const extra = (4 - (buffer.length % 4)) % 4;
  return extra ? Buffer.concat([buffer, Buffer.alloc(extra, pad)]) : buffer;
};

const buffers = [
  align4(f32(positions)),
  align4(f32(normals)),
  align4(f32(uvs)),
  align4(u16(indices)),
];
let byteOffset = 0;
const bufferViews = buffers.map((buffer, index) => {
  const view = { buffer: 0, byteOffset, byteLength: buffer.length };
  if (index === 3) view.target = 34963;
  else view.target = 34962;
  byteOffset += buffer.length;
  return view;
});
const bin = Buffer.concat(buffers);

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < positions.length; i += 3) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], positions[i + k]);
    max[k] = Math.max(max[k], positions[i + k]);
  }
}

const json = {
  asset: { version: '2.0', generator: 'chunk-surfer generate-tuning-fork-glb' },
  scenes: [{ nodes: [0] }],
  scene: 0,
  nodes: [{ name: 'tuning_fork', mesh: 0 }],
  meshes: [{
    name: 'tuning_fork',
    primitives,
  }],
  materials: [
    {
      name: 'cold brushed steel',
      pbrMetallicRoughness: { baseColorFactor: [0.78, 0.84, 0.88, 1], metallicFactor: 1, roughnessFactor: 0.34 },
    },
    {
      name: 'old dark stamp',
      pbrMetallicRoughness: { baseColorFactor: [0.03, 0.035, 0.04, 1], metallicFactor: 0, roughnessFactor: 0.9 },
    },
  ],
  buffers: [{ byteLength: bin.length }],
  bufferViews,
  accessors: [
    { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
    ...primitives.map((primitive) => ({
      bufferView: 3,
      byteOffset: primitive.extras.indexStart * 2,
      componentType: 5123,
      count: primitive.extras.indexCount,
      type: 'SCALAR',
    })),
  ],
};

primitives.forEach((primitive, index) => {
  primitive.indices = 3 + index;
});

const jsonBytes = align4(Buffer.from(JSON.stringify(json)), 0x20);
const binBytes = align4(bin);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binBytes.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonBytes.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binBytes.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);

writeFileSync(outPath, Buffer.concat([header, jsonHeader, jsonBytes, binHeader, binBytes]));
console.log(`wrote ${outPath}`);
