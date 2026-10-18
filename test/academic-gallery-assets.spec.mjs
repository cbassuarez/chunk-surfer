import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { ACADEMIC_ROOF_PROPS } from '../src/data/academic-roof.js';
import {
  ACADEMIC_GALLERY, ACADEMIC_GALLERY_MESHES, ACADEMIC_GALLERY_PROPS,
  academicGalleryMesh,
} from '../src/data/academic-gallery-treatment.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import * as HEAD from '../src/game/marble-head.js';

const bytes = readFileSync(new URL('../public/assets/academic-gallery.glb', import.meta.url));
const stats = JSON.parse(readFileSync(new URL('../public/assets/academic-gallery.stats.json', import.meta.url), 'utf8'));
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
let json, bin;
for (let p = 12; p < bytes.length;) {
  const length = bytes.readUInt32LE(p), kind = bytes.readUInt32LE(p + 4);
  assert.ok(p + 8 + length <= bytes.length, 'GLB chunk fits its actual file');
  const data = bytes.subarray(p + 8, p + 8 + length);
  if (kind === 0x4e4f534a) json = JSON.parse(data.toString().trim());
  if (kind === 0x004e4942) bin = data;
  p += length + 8;
}
assert.ok(json && bin);
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const componentBytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };
function accessor(index) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView];
  assert.ok(a && view && !a.sparse, 'ordinary complete buffer accessor');
  const n = components[a.type], size = componentBytes[a.componentType];
  assert.ok(n && size, `supported ${a.type}/${a.componentType}`);
  const stride = view.byteStride || n * size, start = (view.byteOffset || 0) + (a.byteOffset || 0);
  assert.ok((a.byteOffset || 0) + Math.max(0, a.count - 1) * stride + n * size <= view.byteLength);
  const read = (p) => a.componentType === 5126 ? bin.readFloatLE(p)
    : a.componentType === 5125 ? bin.readUInt32LE(p)
      : a.componentType === 5123 ? bin.readUInt16LE(p) : bin[p];
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (_, k) => read(start + i * stride + k * size)));
}
const geometries = new Map(json.meshes.map(mesh => [mesh.name, mesh.primitives.map(p => ({
  primitive: p, positions: accessor(p.attributes.POSITION), normals: accessor(p.attributes.NORMAL),
  uv: accessor(p.attributes.TEXCOORD_0), indices: accessor(p.indices).flat(),
}))]));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((v, k) => v - b[k]);
const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);
function* triangles(name) {
  for (const g of geometries.get(name) || []) for (let i = 0; i < g.indices.length; i += 3) {
    yield g.indices.slice(i, i + 3).map(index => g.positions[index]);
  }
}
function bounds(name) {
  const result = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const g of geometries.get(name) || []) for (const p of g.positions) for (let k = 0; k < 3; k++) {
    result.min[k] = Math.min(result.min[k], p[k]); result.max[k] = Math.max(result.max[k], p[k]);
  }
  return result;
}
// Clip actual triangles, including one that crosses the opening while its
// centroid is outside. A centre-only floor test misses precisely that case.
function clip(poly, axis, bound, greater) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = greater ? a[axis] >= bound : a[axis] <= bound;
    const ib = greater ? b[axis] >= bound : b[axis] <= bound;
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (bound - a[axis]) / (b[axis] - a[axis]);
      out.push(a.map((v, k) => v + (b[k] - v) * t));
    }
  }
  return out;
}
function clipped(poly, planes) {
  for (const p of planes) { poly = clip(poly, ...p); if (poly.length < 3) break; }
  return poly;
}
function polygonArea(poly) {
  let area = 0;
  for (let i = 1; i + 1 < poly.length; i++) area += Math.hypot(...cross(sub(poly[i], poly[0]), sub(poly[i + 1], poly[0]))) / 2;
  return area;
}

test('actual gallery pack has indexed identity roots matching the runtime catalog with coherent normals', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), stats.export.sha256, 'stats describe the actual final GLB');
  assert.deepEqual([...geometries.keys()].sort(), Object.keys(ACADEMIC_GALLERY_MESHES).sort());
  assert.equal(json.nodes.length, Object.keys(ACADEMIC_GALLERY_MESHES).length);
  assert.deepEqual([...json.scenes[json.scene || 0].nodes].sort((a, b) => a - b), json.nodes.map((_, i) => i));
  for (const node of json.nodes) {
    assert.equal(node.children?.length || 0, 0);
    for (const key of ['matrix', 'translation', 'rotation', 'scale', 'skin']) assert.equal(node[key], undefined, `${node.name}: flat identity ${key}`);
    assert.ok(Number.isInteger(node.mesh));
  }
  assert.equal(json.skins?.length || 0, 0); assert.equal(json.animations?.length || 0, 0);
  assert.equal(json.extensionsRequired?.length || 0, 0);
  let count = 0;
  for (const [name, parts] of geometries) for (const g of parts) {
    assert.equal(g.primitive.mode ?? 4, 4); assert.equal(g.indices.length % 3, 0);
    assert.equal(g.normals.length, g.positions.length); assert.equal(g.uv.length, g.positions.length);
    for (const v of [...g.positions, ...g.normals, ...g.uv]) assert.ok(v.every(Number.isFinite), `${name}: finite vector`);
    for (const n of g.normals) assert.ok(Math.abs(Math.hypot(...n) - 1) <= .02, `${name}: unit normal`);
    for (const i of g.indices) assert.ok(Number.isInteger(i) && i >= 0 && i < g.positions.length, `${name}: valid index`);
    for (let i = 0; i < g.indices.length; i += 3) {
      const ids = g.indices.slice(i, i + 3), [a, b, c] = ids.map(index => g.positions[index]);
      const normal = cross(sub(b, a), sub(c, a));
      assert.ok(Math.hypot(...normal) > 1e-11, `${name}: nondegenerate triangle`);
      const average = [0, 1, 2].map(k => ids.reduce((s, index) => s + g.normals[index][k], 0));
      assert.ok(dot(normal, average) >= -1e-9, `${name}: winding agrees with shading normals`);
      count++;
    }
  }
  assert.equal(count, stats.catalogueTriangles);
});

test('actual pack allocation stays inside the expanded gallery authoring budget', () => {
  assert.ok(bytes.length <= 6 * 1024 * 1024, 'actual GLB is at most6MiB');
  assert.ok(json.materials.length >= 1 && json.materials.length <= 2, 'at most two shared material families');
  const actualTriangles = [...geometries.values()].flat().reduce((sum, g) => sum + g.indices.length / 3, 0);
  // Conservative catalog delta credits only the old structure and fragment.
  // This is not a submitted-frame count: instancing and shadow draws are
  // measured independently in the matched actual-game controls.
  assert.ok(actualTriangles - 1920 - 136 <= 30000, 'net added catalog geometry is at most30k triangles');
  let allocatedMipBytes = 0;
  for (const texture of json.textures || []) {
    const image = json.images[texture.source], view = json.bufferViews[image.bufferView];
    assert.equal(image.mimeType, 'image/png');
    const png = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    let w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    while (true) {
      allocatedMipBytes += w * h * 4;
      if (w === 1 && h === 1) break;
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
    }
  }
  assert.ok(allocatedMipBytes <= 8 * 1024 * 1024, 'actual per-descriptor RGBA mip allocation is at most8MiB');
});

test('actual walking faces cannot cover any positive area inside the compiled atrium opening', () => {
  const inset = 1e-5, v = ACADEMIC_GALLERY.void;
  const planes = [[0, v.x0 - 85 + inset, true], [0, v.x1 - 85 - inset, false],
    [2, v.z0 - 15 + inset, true], [2, v.z1 - 15 - inset, false]];
  let checked = 0;
  for (const name of ['gallery_floor', 'gallery_atrium_structure']) for (const triangle of triangles(name)) {
    const normal = cross(sub(triangle[1], triangle[0]), sub(triangle[2], triangle[0]));
    if (Math.abs(normal[1]) < .99 * Math.hypot(...normal) || !triangle.every(p => p[1] >= -.05 && p[1] <= .03)) continue;
    checked++;
    assert.ok(polygonArea(clipped(triangle, planes)) < 1e-9, `${name}: walking face intrudes into navigation void`);
  }
  assert.ok(checked > 100, 'checks actual floor surfaces, not only reported metadata');
  assert.ok(polygonArea(clipped([[-7, 0, -1], [-5, 0, -1], [-7, 0, 1]], planes)) > .1,
    'the clipping check detects crossing triangles whose centroid falls outside the void');
});

function verticalIntersections(name, x, z) {
  const hits = [];
  for (const [a, b, c] of triangles(name)) {
    const determinant = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(determinant) < 1e-10) continue;
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / determinant;
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / determinant;
    if (u < -1e-7 || v < -1e-7 || u + v > 1 + 1e-7) continue;
    const normal = cross(sub(b, a), sub(c, a));
    hits.push({ y: u * a[1] + v * b[1] + (1 - u - v) * c[1], ny: normal[1] / Math.hypot(...normal) });
  }
  return hits;
}

test('guard posts bear on the actual full-depth slab rather than only the parquet overlay', () => {
  // The retained old west/south slab edges stopped0.34m short of the newly
  // registered guard. A floor overlay hid that load-path gap from above.
  const worldPoints = [[78.84, 9], [78.84, 14], [78.84, 19], [80, 21.16], [84, 21.16], [88, 21.16]];
  for (const [x, z] of worldPoints) {
    const hits = verticalIntersections('gallery_atrium_structure', x - 85, z - 15);
    assert.ok(hits.some(hit => Math.abs(hit.y) < .003 && hit.ny > .99),
      `guard bearing at world${x},${z} needs an upward structural slab top at floor level`);
    assert.ok(hits.some(hit => Math.abs(hit.y + .32) < .003 && hit.ny < -.99),
      `guard bearing at world${x},${z} needs the full0.32m structural depth, not a finish face`);
  }
});

test('all eight retained lower columns are closed outward volumes rather than coherent inward shells', () => {
  for (const x of [-11.4, 11.4]) for (const z of [-12.4, -6.5, 6.5, 12.4]) {
    const column = [...triangles('gallery_atrium_structure')].filter(triangle => triangle.every(p =>
      Math.abs(p[0] - x) <= .16001 && Math.abs(p[2] - z) <= .16001 && p[1] >= -9.70001 && p[1] <= .00001));
    assert.equal(column.length, 48, `actual retained column${x},${z} has all side and cap triangles`);
    const edges = new Map(), center = [x, -4.85, z];
    let signedVolume = 0;
    const key = p => p.map(v => Math.round(v * 1e5)).join(',');
    for (const triangle of column) {
      const [a, b, c] = triangle.map(p => sub(p, center));
      signedVolume += dot(a, cross(b, c)) / 6;
      for (let i = 0; i < 3; i++) {
        const from = key(triangle[i]), to = key(triangle[(i + 1) % 3]);
        const edge = from < to ? `${from}|${to}` : `${to}|${from}`;
        const previous = edges.get(edge) || { count: 0, direction: 0 };
        previous.count++; previous.direction += from < to ? 1 : -1; edges.set(edge, previous);
      }
    }
    for (const edge of edges.values()) assert.deepEqual(edge, { count: 2, direction: 0 }, 'each geometric column edge has two opposed incident faces');
    assert.ok(signedVolume > .70 && signedVolume < .80,
      `column${x},${z} must have positive outward volume; actual${signedVolume}m³`);
  }
});

test('plinth, displaced fragment and threshold have actual contact and passage dimensions', () => {
  const plinth = bounds('gallery_bust_plinth');
  assert.ok(Math.abs(plinth.min[1]) < 1e-6);
  assert.ok(Math.abs(plinth.max[1] - ACADEMIC_GALLERY.plinthSeat) < 1e-5, 'seat remains1.11m');
  assert.ok(plinth.max[1] - 1.10 >= .009 && plinth.max[1] - 1.10 <= .011, 'existing portrait seat retains its10mm overlap');
  assert.ok(Math.abs(bounds('gallery_fragment').min[1] + 1.08 - 1.105) < 1e-5,
    'displaced fragment still bears on the cap rather than floating');
  assert.ok(bounds('gallery_bench').min[1] >= 0 && bounds('gallery_bench').min[1] <= .012);
  const open = [[0, -1 + 1e-5, true], [0, 1 - 1e-5, false], [1, .001, true], [1, 2.75 - 1e-5, false], [2, -.4, true], [2, .4, false]];
  for (const triangle of triangles('gallery_roof_threshold')) assert.ok(polygonArea(clipped(triangle, open)) < 1e-9,
    'trim, jambs and transom leave the real2m×2.75m passage clear');
});

function geometricComponents(name) {
  const points = [], parents = [], lookup = new Map();
  const find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  const index = p => {
    const key = p.map(v => Math.round(v * 1e5)).join(',');
    if (!lookup.has(key)) { lookup.set(key, points.length); parents.push(points.length); points.push(p); }
    return lookup.get(key);
  };
  for (const triangle of triangles(name)) {
    const ids = triangle.map(index), root = find(ids[0]);
    for (const i of ids.slice(1)) parents[find(i)] = root;
  }
  const groups = new Map();
  points.forEach((p, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    const box = groups.get(root);
    for (let k = 0; k < 3; k++) { box.min[k] = Math.min(box.min[k], p[k]); box.max[k] = Math.max(box.max[k], p[k]); }
  });
  return [...groups.values()];
}

test('console assemblies have floor contact, contained solid bodies and supported accoutrement envelopes', () => {
  // These are assembly/contact envelopes, not counts or shapes of scrolls,
  // handles, books or leaves. AABB contact is a floating-part screen, not a
  // claim that every detailed joint has been physically certified.
  for (const name of ['gallery_console_north', 'gallery_console_south']) {
    assert.ok(geometries.has(name), `${name}: the additional furnishing is exported`);
    const box = bounds(name), proxy = ACADEMIC_GALLERY_MESHES[name];
    assert.ok(box.min[1] >= 0 && box.min[1] <= .012, `${name}: feet meet the existing floor finish`);
    assert.ok(box.max[1] > proxy.h + .15, `${name}: actual urn/accoutrement survives above the bearing console`);
    for (const g of geometries.get(name)) for (const p of g.positions) if (p[1] <= proxy.h + 1e-5) {
      assert.ok(Math.abs(p[0]) <= proxy.w / 2 + .015 && Math.abs(p[2]) <= proxy.d / 2 + .015,
        `${name}: dense console body fits its collision envelope`);
    }
    const components = geometricComponents(name), supported = new Set();
    components.forEach((b, i) => { if (b.min[1] <= .012) supported.add(i); });
    const touches = (a, b) => [0, 1, 2].every(k => a.min[k] <= b.max[k] + .015 && b.min[k] <= a.max[k] + .015);
    for (let step = 0; step < components.length; step++) {
      let added = false;
      components.forEach((b, i) => {
        if (!supported.has(i) && [...supported].some(j => touches(b, components[j]))) { supported.add(i); added = true; }
      });
      if (!added) break;
    }
    const detached = components.filter((_, i) => !supported.has(i));
    assert.equal(supported.size, components.length,
      `${name}: every disconnected part envelope has a contact chain to the floor; detached${JSON.stringify(detached)}`);
  }
  assert.ok(bounds('gallery_wall_bay').max[1] <= ACADEMIC_GALLERY.ceiling - ACADEMIC_GALLERY.base + 1e-4,
    'enriched mouldings stay beneath the existing roof soffit');
});

function imageBytes(textureIndex) {
  const image = json.images[json.textures[textureIndex].source], view = json.bufferViews[image.bufferView];
  assert.equal(image.mimeType, 'image/png');
  return bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
}
test('shared atlas materials use distinct albedo, linear ORM and normal maps without factor squaring', () => {
  assert.ok(json.materials.length >= 1 && json.materials.length <= 2);
  assert.equal(json.images.length, 3); assert.equal(json.textures.length, 3);
  const usedMaps = new Set();
  for (const m of json.materials) {
    const p = m.pbrMetallicRoughness;
    assert.equal(p.metallicFactor, 1); assert.equal(p.roughnessFactor, 1);
    assert.deepEqual(p.baseColorFactor || [1, 1, 1, 1], [1, 1, 1, 1]);
    const maps = [p.baseColorTexture.index, p.metallicRoughnessTexture.index, m.normalTexture.index];
    assert.equal(new Set(maps).size, 3);
    if (m.occlusionTexture) assert.equal(m.occlusionTexture.index, p.metallicRoughnessTexture.index);
    maps.forEach(i => usedMaps.add(i));
  }
  for (const index of usedMaps) {
    const png = imageBytes(index);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), 512); assert.equal(png.readUInt32BE(20), 512);
  }
  for (const parts of geometries.values()) for (const g of parts) assert.ok(g.primitive.material >= 0 && g.primitive.material < json.materials.length);
});

// A small native PNG reader permits a real byte-level regression against the
// previous linear-byte/double-darkening failure. This is not image-quality QA.
function pngPixels(png) {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), depth = png[24], type = png[25], channels = { 2: 3, 6: 4 }[type];
  if (depth !== 8 || !channels || png[28] !== 0) return null;
  const chunks = [];
  for (let p = 8; p < png.length;) { const n = png.readUInt32BE(p), kind = png.toString('ascii', p + 4, p + 8); if (kind === 'IDAT') chunks.push(png.subarray(p + 8, p + 8 + n)); p += n + 12; }
  const raw = inflateSync(Buffer.concat(chunks)), stride = w * channels, pixels = Buffer.alloc(stride * h);
  assert.equal(raw.length, h * (stride + 1));
  const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]; assert.ok(filter >= 0 && filter <= 4);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0, b = y ? pixels[(y - 1) * stride + x] : 0, c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const correction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + correction) & 255;
    }
  }
  return { w, h, channels, pixels };
}
function patchMean(image, y0) {
  const sum = [0, 0, 0]; let count = 0;
  for (let y = y0 + 24; y < y0 + 104; y++) for (let x = 24; x < 104; x++) {
    for (let k = 0; k < 3; k++) sum[k] += image.pixels[(y * image.w + x) * image.channels + k]; count++;
  }
  return sum.map(v => v / count);
}
test('available PNG pixels support encoded albedo and linear normal/ORM data', t => {
  const m = json.materials[0], p = m.pbrMetallicRoughness;
  const images = [p.baseColorTexture.index, p.metallicRoughnessTexture.index, m.normalTexture.index].map(i => pngPixels(imageBytes(i)));
  if (images.some(image => !image)) { t.skip('byte check supports noninterlaced8bit RGB/RGBA; structural map contract still tested'); return; }
  const encoded = v => (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055) * 255;
  const expected = [.53, .51, .45].map(encoded);
  // Blender export orientation may put the first UV tile at either image edge.
  assert.ok([0, 384].some(row => patchMean(images[0], row).every((v, k) => Math.abs(v - expected[k]) < 12)),
    'mineral albedo bytes must be near sRGB-encoded reflectance, not direct linear bytes or a second encoding');
  assert.ok([0, 384].some(row => { const v = patchMean(images[1], row); return v[0] > 250 && Math.abs(v[1] - .83 * 255) < 5 && v[2] < 3; }),
    'mineral ORM roughness remains linear data');
  assert.ok(patchMean(images[2], 0).every((v, k) => Math.abs(v - [128, 128, 255][k]) < 2), 'normal channels remain linear data');
});

const six = ['academic-bust-1', 'academic-bust-2', 'academic-bust-fragment-3', 'academic-bust-4', 'academic-bust-5', 'academic-bust-fragment-6'];
test('presentation resolver preserves intact scans, canonical eye states, Horizon and missing-pack fallback', () => {
  const available = name => geometries.has(name);
  for (const id of six) for (const mesh of ['marble_bust_01', 'academic_bust_socketed', 'academic_bust_socketed_returned', 'horizon_bust_portrait']) {
    const frame = Object.freeze({ id, mesh, x: 77, y: 11.1, z: 14, yaw: .9, scale: .88 });
    assert.equal(academicGalleryMesh(frame, available), mesh);
  }
  for (const [id, mesh, replacement] of [['academic-atrium-structure', 'academic_atrium_structure', 'gallery_atrium_structure'], ['academic-bust-plinth-1', 'academic_bust_plinth', 'gallery_bust_plinth'], ['academic-bust-fragment-6', 'academic_bust_fragment', 'gallery_fragment']]) {
    assert.equal(academicGalleryMesh({ id, mesh }, () => false), mesh, 'missing optional pack retains original geometry');
    assert.equal(academicGalleryMesh({ id, mesh }, available), replacement);
    assert.equal(academicGalleryMesh({ id: 'unrelated-prop', mesh }, available), mesh);
  }
  for (const phase of Object.values(HEAD.MARBLE_HEAD_PHASE)) {
    HEAD.loadMarbleHead({ phase, gallery: { spoken: six, turned: true } });
    const appearance = HEAD.marbleGalleryAppearance();
    assert.equal(academicGalleryMesh({ id: HEAD.MARBLE_HEAD_BUST, ...appearance }, available), appearance.mesh);
    const saved = HEAD.saveMarbleHead(); HEAD.resetMarbleHead(); HEAD.loadMarbleHead(saved);
    assert.deepEqual(HEAD.marbleGalleryAppearance(), appearance, 'state-owner appearance survives rebuild/reload');
    assert.deepEqual(HEAD.marbleHeadState().gallery.spoken, six); assert.equal(HEAD.marbleHeadState().gallery.turned, true);
  }
  HEAD.resetMarbleHead();
});

let integratedPlanReady = false;
function prepareIntegratedPlan() {
  if (integratedPlanReady) return;
  FP.compile(conservatory.levels, { width: conservatory.width, height: conservatory.height, widenCorridors: conservatory.widenCorridors,
    connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [], doors: conservatory.doors || [] });
  PROPS.propsInit(FP); // The same integrated array and derived dressing as gameplay.
  integratedPlanReady = true;
}

test('actual integrated data keeps six stations, solid plinths, west circulation and shared real roof glazing', () => {
  prepareIntegratedPlan();
  for (const authored of ACADEMIC_GALLERY_PROPS) {
    const matches = CONSERVATORY_PROPS.filter(p => p.id === authored.id);
    assert.equal(matches.length, 1, `${authored.id}: production data contains exactly one new placement`);
    assert.deepEqual(matches[0], authored, 'the test must not repair missing/changed production placements itself');
    assert.equal(PROPS.propById(authored.id)?.mesh, authored.mesh, `${authored.id}: production instantiation retains the new asset`);
  }
  assert.deepEqual(CONSERVATORY_PROPS.filter(p => six.includes(p.id)).map(p => p.id).sort(), [...six].sort());
  for (let i = 1; i <= 6; i++) {
    const p = PROPS.propById(`academic-bust-plinth-${i}`); assert.ok(p?.blocks);
    assert.equal(PROPS.propCanOccupy(p.rx, p.ry), false, 'a visible stone base is a real obstacle');
  }
  for (const id of ['gallery-treatment-bench', 'gallery-treatment-planter-north', 'gallery-treatment-planter-south', 'gallery-treatment-console-north', 'gallery-treatment-console-south']) {
    const p = PROPS.propById(id); assert.ok(p?.blocks); assert.ok(p.w > 0 && p.d > 0);
    assert.equal(PROPS.propCanOccupy(p.rx, p.ry), false, `${id}: physical proxy is active`);
    assert.equal(p.interactive, false, `${id}: furnishing adds no new interaction`);
  }
  for (const x of [25, 26]) for (let y = 246; y <= 263; y += .5) {
    const p = FP.toRuntimePoint({ x, y }, { center: false });
    assert.equal(FP.isSolid(p.x, p.y), false, `west walk ${x},${y} remains floor`);
    assert.equal(FP.floorAt(p.x, p.y), 10);
    assert.equal(PROPS.propCanOccupy(p.x, p.y), true, `west walk ${x},${y} remains clear of all new proxies`);
  }
  for (const [x, y] of [[29, 248], [33, 254], [38.5, 260.5]]) {
    const p = FP.toRuntimePoint({ x, y }, { center: false }); assert.equal(FP.isSolid(p.x, p.y), true);
  }
  const original = ACADEMIC_ROOF_PROPS.find(p => p.id === 'academic-roof-glazing');
  const shared = CONSERVATORY_PROPS.find(p => p.id === 'academic-roof-glazing');
  assert.deepEqual(shared.renderGroups, ['academicRoof', 'academic']);
  for (const key of ['mesh', 'x', 'y', 'yaw', 'scale', 'elevation']) assert.equal(shared[key], original[key], `roof ${key} stays canonical`);
  assert.deepEqual(CONSERVATORY_PROPS.find(p => p.id === 'academic-skylight').renderGroups, ['ground']);
  const academic = PROPS.renderInstances({ group: 'academic', inscriptions: false });
  const ground = PROPS.renderInstances({ group: 'ground', inscriptions: false });
  assert.ok(academic.some(p => p.id === 'academic-roof-glazing'));
  assert.ok(!academic.some(p => p.id === 'academic-skylight'), 'the old oversized grid is not a second gallery roof');
  assert.ok(ground.some(p => p.id === 'academic-skylight'), 'legacy ground-floor presentation remains');
  assert.ok(!academic.some(p => p.id === 'roof-ren'), 'sharing static glazing does not add roof actors to the gallery');
  const threshold = academic.find(p => p.id === 'gallery-treatment-roof-threshold');
  const gate = academic.find(p => p.id === 'roof-gate');
  assert.ok(threshold && gate);
  for (const key of ['x', 'y', 'z']) assert.ok(Math.abs(threshold[key] - gate[key]) < 1e-5,
    `new threshold ${key} registers with the actual fixed gate transform`);
});

test('all three actual north gate portal lanes traverse and immediately reverse inside the physical frame', () => {
  prepareIntegratedPlan();
  const portal = FP.edgePortalState().find(p => p.id === 'academic-loggia-to-roof-service');
  assert.ok(portal); assert.equal(portal.lanes, 3); assert.equal(portal.pairs.length, 3);
  assert.equal(portal.bidirectional, true);
  for (const pair of portal.pairs) {
    for (const [from, to, exit, label] of [[pair.from, pair.to, portal.from.exit, 'outward'], [pair.to, pair.from, portal.to.exit, 'return']]) {
      assert.equal(FP.isSolid(from.x, from.y), false, `${label}: occupied source lane`);
      assert.equal(FP.isSolid(to.x, to.y), false, `${label}: occupied destination lane`);
      assert.equal(FP.floorAt(from.x, from.y), 10); assert.equal(FP.floorAt(to.x, to.y), 10);
      assert.equal(PROPS.propCanOccupy(from.x, from.y), true, `${label}: source lane clear of production proxies`);
      assert.equal(PROPS.propCanOccupy(to.x, to.y), true, `${label}: destination lane clear of production proxies`);
      const move = FP.canStep(from.x, from.y, from.x + exit.x, from.y + exit.y, { keys: new Set(['master']) });
      assert.equal(move.ok, true, `${label}: ordinary step crosses the existing service portal`);
      assert.equal(move.edgePortal, portal.id); assert.deepEqual(move.redirect, to);
    }
    const physical = FP.logicalToPhysical(pair.from.x, pair.from.y);
    const worldX = physical.x * .5;
    assert.ok(worldX > 93 && worldX < 95, `lane at worldx${worldX} stays inside the actual2m threshold`);
  }
});
