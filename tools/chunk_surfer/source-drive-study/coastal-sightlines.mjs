// CPU inspection of the exact opaque meshes acquired by the coastal renderer.
// A clear triangle ray establishes geometry clearance only, never readability,
// water transmission, atmosphere, fear or complete route acceptance.
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const point = (p, m) => [0, 1, 2].map(i => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);
const opaqueLand = name => ['cm_grass_bank', 'cm_soil_cap', 'cm_limestone_coast', 'cm_limestone_block'].includes(name) || name.startsWith('cm_limestone_outcrop_');

export function coastalMeshTriangles(meshes, props, { allOpaque = false, excludeMeshes = [] } = {}) {
  const byName = new Map(meshes.map(mesh => [mesh.name, mesh])), triangles = [];
  const excluded = new Set(excludeMeshes);
  for (const prop of props) {
    if (excluded.has(prop.mesh) || (!allOpaque && !opaqueLand(prop.mesh))) continue;
    const mesh = byName.get(prop.mesh);
    if (!mesh) throw Error('Missing acquired coastal occluder ' + prop.mesh);
    for (const primitive of mesh.primitives) {
      const indices = primitive.indices || Array.from({ length: primitive.positions.length / 3 }, (_, i) => i);
      for (let i = 0; i < indices.length; i += 3) triangles.push({ id: prop.id, mesh: prop.mesh,
        vertices: indices.slice(i, i + 3).map(index => point(primitive.positions.slice(index * 3, index * 3 + 3), prop.matrix)) });
    }
  }
  return triangles;
}

export function coastalGlbMeshes(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) throw Error('Expected acquired GLB2.');
  let document, binary;
  for (let cursor = 12; cursor < buffer.length;) {
    const length = buffer.readUInt32LE(cursor), kind = buffer.readUInt32LE(cursor + 4), data = buffer.subarray(cursor + 8, cursor + 8 + length);
    if (kind === 0x4e4f534a) document = JSON.parse(data.toString('utf8').trim());
    if (kind === 0x004e4942) binary = data;
    cursor += 8 + length;
  }
  if (!document || !binary) throw Error('Acquired GLB requires JSON and BIN.');
  const readers = { 5121: ['readUInt8', 1], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4], 5126: ['readFloatLE', 4] };
  function accessor(index) {
    const value = document.accessors[index], view = document.bufferViews[value.bufferView], width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[value.type], reader = readers[value.componentType];
    if (!width || !reader || value.sparse) throw Error('Unsupported coastal acquisition accessor.');
    const stride = view.byteStride || width * reader[1], start = (view.byteOffset || 0) + (value.byteOffset || 0), out = [];
    for (let i = 0; i < value.count; i++) for (let k = 0; k < width; k++) out.push(binary[reader[0]](start + i * stride + k * reader[1]));
    return out;
  }
  return document.meshes.map(mesh => ({ name: mesh.name, primitives: mesh.primitives.map(p => {
    if ((p.mode ?? 4) !== 4) throw Error('Coastal occlusion requires triangle primitives.');
    return { positions: accessor(p.attributes.POSITION), indices: p.indices == null ? null : accessor(p.indices) };
  }) }));
}

function triangleFraction(eye, delta, [a, b, c]) {
  const e1 = subtract(b, a), e2 = subtract(c, a), h = cross(delta, e2), determinant = dot(e1, h);
  if (Math.abs(determinant) < 1e-10) return null;
  const q = subtract(eye, a), u = dot(q, h) / determinant;
  if (u < 0 || u > 1) return null;
  const r = cross(q, e1), v = dot(delta, r) / determinant;
  if (v < 0 || u + v > 1) return null;
  const t = dot(e2, r) / determinant;
  return t > 1e-6 && t < .99999 ? t : null;
}

export function coastalGeometrySightline(eye, target, triangles) {
  if (![...eye, ...target].every(Number.isFinite)) throw Error('Finite actual eye and target required.');
  const delta = subtract(target, eye); let obstruction = null;
  for (const triangle of triangles) {
    const fraction = triangleFraction(eye, delta, triangle.vertices);
    if (fraction != null && (!obstruction || fraction < obstruction.fraction)) obstruction = {
      id: triangle.id, mesh: triangle.mesh, fraction, point: eye.map((v, i) => v + delta[i] * fraction),
    };
  }
  return { eye, target, clear: !obstruction, obstruction, triangleCount: triangles.length,
    qualification: 'Exact acquired opaque bank, cliff, soil and outcrop triangle ray; excludes sea transmission and visual recognition.' };
}

// A conservative median-split BVH keeps thousands of exact surface rays usable
// against the complete submitted opaque scene. It never changes draw/collision.
export function createCoastalVisibilityQuery(triangles, { leafSize = 12 } = {}) {
  leafSize = Number.isFinite(leafSize) ? Math.max(4, Math.min(64, Math.round(leafSize))) : 12;
  const rows = triangles.map(triangle => {
    const lo = [0, 1, 2].map(k => Math.min(...triangle.vertices.map(v => v[k]))), hi = [0, 1, 2].map(k => Math.max(...triangle.vertices.map(v => v[k])));
    return { triangle, lo, hi, center: lo.map((v, k) => (v + hi[k]) * .5) };
  });
  function build(values) {
    if (!values.length) return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const value of values) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], value.lo[k]); hi[k] = Math.max(hi[k], value.hi[k]); }
    if (values.length <= leafSize) return { lo, hi, rows: values };
    const extents = hi.map((v, k) => v - lo[k]), axis = extents.indexOf(Math.max(...extents));
    values.sort((a, b) => a.center[axis] - b.center[axis]); const middle = values.length >> 1;
    return { lo, hi, left: build(values.slice(0, middle)), right: build(values.slice(middle)) };
  }
  const root = build(rows);
  function boxNear(eye, delta, node, maximum) {
    let near = 0, far = maximum;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(delta[k]) < 1e-12) { if (eye[k] < node.lo[k] - 1e-8 || eye[k] > node.hi[k] + 1e-8) return null; continue; }
      const a = (node.lo[k] - eye[k]) / delta[k], b = (node.hi[k] - eye[k]) / delta[k];
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); if (far < near) return null;
    }
    return near;
  }
  return { triangleCount: triangles.length, ray(eye, target, { excludeMeshes = [] } = {}) {
    if (![...eye, ...target].every(Number.isFinite)) throw Error('Finite actual eye and target required.');
    const delta = subtract(target, eye), excluded = new Set(excludeMeshes); let closest = 1, obstruction = null;
    function visit(node) {
      if (!node || boxNear(eye, delta, node, closest) == null) return;
      if (node.rows) {
        for (const { triangle } of node.rows) {
          if (excluded.has(triangle.mesh)) continue;
          const fraction = triangleFraction(eye, delta, triangle.vertices);
          if (fraction != null && fraction < closest) { closest = fraction; obstruction = { id: triangle.id, mesh: triangle.mesh, fraction, point: eye.map((v, i) => v + delta[i] * fraction) }; }
        }
      } else {
        const a = boxNear(eye, delta, node.left, closest), b = boxNear(eye, delta, node.right, closest);
        if (a != null && (b == null || a <= b)) { visit(node.left); visit(node.right); } else { visit(node.right); visit(node.left); }
      }
    }
    visit(root);
    return { eye, target, clear: !obstruction, obstruction, triangleCount: triangles.length,
      qualification: 'BVH-accelerated exact submitted triangle ray; excludes specified target meshes. Not an assertion of lighting, transmission or recognition.' };
  } };
}

function countSurfacePoints(points, { eye, query, excludeMeshes, minimumY }) {
  const result = { considered: 0, clear: 0, occluded: 0, occluders: {}, occluderIds: {}, examples: [] };
  for (const target of points) {
    if (target[1] < minimumY) continue;
    result.considered++; const ray = query.ray(eye, target, { excludeMeshes });
    if (ray.clear) result.clear++;
    else { result.occluded++; const o = ray.obstruction; result.occluders[o.mesh] = (result.occluders[o.mesh] || 0) + 1; result.occluderIds[o.id] = (result.occluderIds[o.id] || 0) + 1;
      if (result.examples.length < 8) result.examples.push({ target, obstruction: o }); }
  }
  return result;
}
export function coastalVertexVisibility({ mesh, matrix, eye, query, minimumY = -Infinity, excludeMeshes = [mesh.name] }) {
  const unique = new Map();
  for (const primitive of mesh.primitives) for (let i = 0; i < primitive.positions.length; i += 3) {
    const p = point(primitive.positions.slice(i, i + 3), matrix); unique.set(p.map(v => v.toFixed(7)).join(','), p);
  }
  return { uniqueVertices: unique.size, ...countSurfacePoints(unique.values(), { eye, query, minimumY, excludeMeshes }),
    qualification: 'Exact visibility at unique authored vertices only; a clear anchor or vertex count does not prove the full projected surface is visible.' };
}
export function coastalSurfaceSampleVisibility({ mesh, matrix, eye, query, minimumY = -Infinity, excludeMeshes = [mesh.name] }) {
  const centres = [];
  for (const primitive of mesh.primitives) {
    const indices = primitive.indices || Array.from({ length: primitive.positions.length / 3 }, (_, i) => i);
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = indices.slice(i, i + 3).map(index => point(primitive.positions.slice(index * 3, index * 3 + 3), matrix));
      centres.push([0, 1, 2].map(k => vertices.reduce((n, p) => n + p[k], 0) / 3));
    }
  }
  return { triangleCentroids: centres.length, ...countSurfacePoints(centres, { eye, query, minimumY, excludeMeshes }),
    qualification: 'Exact rays at discrete triangle centroids, not a continuous projected-surface or human visibility proof.' };
}
