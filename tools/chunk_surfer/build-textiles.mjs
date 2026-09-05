// The building's floor textiles, as a pack of their own.
//
//   npm run assets:textiles
//
// WHY A SEPARATE PACK. The two existing prop packs are each wrong for this in
// one specific way. build-props.mjs is 319 flat-shaded meshes and carries no
// images at all, so a rug there can only ever be coloured bands. The
// acquisitions pack is textured but its pipeline ingests .blend MODELS from
// Poly Haven, and Poly Haven has no rug models — only carpet TEXTURES. A rug is
// a quad plus a surface, so the geometry is ours and the surface is theirs, and
// that is a third shape neither builder has.
//
// It loads through the same addPropPack chain as the others and overrides any
// procedural mesh of the same name, which is how vegetation.glb already
// replaces the conservative tree and hedge.
//
// WHAT THE HALFTONE LETS THROUGH. Everything in this building reaches the
// screen through the VFD (see r3d.js: "halftone, palette, persistence, the whole
// instrument"), which flattens base colour hard. What it does NOT flatten is
// shading, so the normal and roughness maps are doing most of the work here and
// the diffuse is close to a tint. That is why 512 is the texture size: at the
// dot pitch the halftone runs at, finer maps are pixels nobody can resolve.
//
// Nothing is downloaded that is not recorded in textile-sources.json with a
// sha256, and the cache is not committed.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MANIFEST_PATH = path.join(import.meta.dirname, 'textile-sources.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const CACHE = path.join(ROOT, manifest.cacheDirectory);
const OUT = path.join(ROOT, manifest.output);
const CREDITS = OUT.replace(/\.glb$/i, '.credits.json');
const SIZE = manifest.textureSize;

const fail = (message) => { console.error(`textiles: ${message}`); process.exit(1); };

// ── the cache ────────────────────────────────────────────────────────────────
async function fetchMap(surfaceId, mapId, entry) {
  const file = path.join(CACHE, entry.file);
  if (fs.existsSync(file)) {
    const have = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (have === entry.sha256) return file;
    console.warn(`  · ${surfaceId}/${mapId}: cached copy does not match its recorded hash, refetching`);
  }
  const response = await fetch(entry.url);
  if (!response.ok) fail(`${surfaceId}/${mapId}: ${entry.url} returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha !== entry.sha256) fail(`${surfaceId}/${mapId}: sha256 mismatch — expected ${entry.sha256}, got ${sha}`);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

// ── geometry ─────────────────────────────────────────────────────────────────
//
// A rug is a quad, but a quad reads as a decal: no thickness at the edge and no
// reason for the light to do anything at the boundary. So every textile here is
// a slab with a chamfered edge, and the ones that have been walked on for a
// century get a ruck across them, because a perfectly flat rectangle on a floor
// is the one thing a real rug never is.
const meshes = new Map();
const mesh = (name, surface) => {
  const m = { name, surface, positions: [], normals: [], uvs: [], indices: [] };
  meshes.set(name, m);
  return m;
};

// UV scale: how many metres of floor one repeat of the source texture covers.
// Poly Haven's fabric scans are photographed at roughly a third of a metre, and
// a carpet whose weave is a metre across reads as a tarpaulin.
const UV_METRES = 0.34;

function quad(m, a, b, c, d, n) {
  const base = m.positions.length / 3;
  for (const v of [a, b, c, d]) {
    m.positions.push(v[0], v[1], v[2]);
    m.normals.push(n[0], n[1], n[2]);
    m.uvs.push(v[0] / UV_METRES, v[2] / UV_METRES);
  }
  m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/**
 * A laid textile: `w` by `d` metres, `h` thick, chamfered by `bevel`.
 * `ruck` lifts a fold across the short axis at `ruckAt` (0..1 along the length).
 */
function slab(m, { w, d, h = 0.016, bevel = 0.03, ruck = 0, ruckAt = 0.5 }) {
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const ix0 = x0 + bevel, ix1 = x1 - bevel, iz0 = z0 + bevel, iz1 = z1 - bevel;
  // The lifted fold. Height is added to the top face only, so the underside
  // stays on the floor and the fold reads as cloth rather than as a ramp.
  const lift = (z) => {
    if (ruck <= 0) return 0;
    const at = z0 + (z1 - z0) * ruckAt;
    const reach = Math.min(d * 0.18, 0.42);
    const t = Math.max(0, 1 - Math.abs(z - at) / reach);
    return ruck * t * t * (3 - 2 * t);
  };
  // Top, split along the length so the ruck has vertices to move.
  const steps = ruck > 0 ? 24 : 1;
  for (let i = 0; i < steps; i += 1) {
    const za = iz0 + (iz1 - iz0) * (i / steps);
    const zb = iz0 + (iz1 - iz0) * ((i + 1) / steps);
    const ha = h + lift(za), hb = h + lift(zb);
    quad(m, [ix0, ha, za], [ix1, ha, za], [ix1, hb, zb], [ix0, hb, zb], [0, 1, 0]);
  }
  // The chamfer, four skirts from the top edge down to the floor line.
  quad(m, [x0, 0, z0], [x1, 0, z0], [ix1, h + lift(iz0), iz0], [ix0, h + lift(iz0), iz0], [0, 0.4, -0.9]);
  quad(m, [x1, 0, z1], [x0, 0, z1], [ix0, h + lift(iz1), iz1], [ix1, h + lift(iz1), iz1], [0, 0.4, 0.9]);
  quad(m, [x0, 0, z1], [x0, 0, z0], [ix0, h + lift(iz0), iz0], [ix0, h + lift(iz1), iz1], [-0.9, 0.4, 0]);
  quad(m, [x1, 0, z0], [x1, 0, z1], [ix1, h + lift(iz1), iz1], [ix1, h + lift(iz0), iz0], [0.9, 0.4, 0]);
}

/** A short comb of threads at each end. Rugs have them; drugget does not. */
function fringe(m, { w, d, h = 0.016, length = 0.09, count = 42 }) {
  const z0 = -d / 2, z1 = d / 2;
  for (let i = 0; i < count; i += 1) {
    const x = -w / 2 + (w * (i + 0.5)) / count;
    const t = w / count * 0.34;
    for (const [z, dir] of [[z0, -1], [z1, 1]]) {
      const a = z, b = z + dir * length * (0.7 + ((i * 37) % 11) / 22);
      quad(m, [x - t, h * 0.5, a], [x + t, h * 0.5, a], [x + t, h * 0.4, b], [x - t, h * 0.4, b], [0, 1, 0]);
    }
  }
}

/** Rolled and stood on end against a wall: stock, not furnishing. */
function rolled(m, { length = 2.4, radius = 0.19, lean = 0.10, segments = 18 }) {
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
    const p = (a, y) => [Math.cos(a) * radius + y * lean, y, Math.sin(a) * radius];
    const n = [Math.cos((a0 + a1) / 2), 0.12, Math.sin((a0 + a1) / 2)];
    quad(m, p(a0, 0), p(a1, 0), p(a1, length), p(a0, length), n);
  }
  // The cut end, so it reads as a roll and not as a column.
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
    const y = length;
    quad(m, [length * lean, y, 0], [Math.cos(a0) * radius + y * lean, y, Math.sin(a0) * radius],
      [Math.cos(a1) * radius + y * lean, y, Math.sin(a1) * radius], [length * lean, y, 0], [0, 1, 0]);
  }
}

// ── the textiles ─────────────────────────────────────────────────────────────
//
// Sizes are in metres and are the authored footprint: PROP_BOUNDS in
// conservatory-props.js must agree, or the soft-floor footprint test and the
// drawn rug describe different rectangles.
{
  // WHAT THE STRIP-OUT LAID DOWN. Drugget over the floors worth lifting: coarse,
  // cheap, and nailed at the ends rather than laid to be looked at.
  const m = mesh('textile_drugget_run', 'drugget');
  slab(m, { w: 1.30, d: 6.40, h: 0.012, bevel: 0.02 });
}
{
  const m = mesh('textile_drugget_stage', 'drugget');
  slab(m, { w: 3.60, d: 2.40, h: 0.012, bevel: 0.02, ruck: 0.05, ruckAt: 0.62 });
}
{
  // WHAT WAS NOT WORTH TAKING. Rodded to the treads and worthless off them.
  const m = mesh('textile_stair_runner', 'stair_wool');
  slab(m, { w: 0.95, d: 4.20, h: 0.014, bevel: 0.02 });
}
{
  const m = mesh('textile_corridor_runner', 'worn_carpet');
  slab(m, { w: 1.15, d: 5.60, h: 0.016, bevel: 0.025, ruck: 0.06, ruckAt: 0.38 });
  fringe(m, { w: 1.15, d: 5.60, h: 0.016, count: 34 });
}
{
  // The foyer rug, which replaces the flat-shaded atrium_waiting_rug by name.
  const m = mesh('atrium_waiting_rug', 'worn_carpet');
  slab(m, { w: 3.80, d: 4.50, h: 0.020, bevel: 0.035, ruck: 0.05, ruckAt: 0.71 });
  fringe(m, { w: 3.80, d: 4.50, h: 0.020, count: 54 });
}
{
  const m = mesh('textile_chapel_runner', 'chapel_weave');
  slab(m, { w: 1.40, d: 7.20, h: 0.016, bevel: 0.025 });
  fringe(m, { w: 1.40, d: 7.20, h: 0.016, count: 38 });
}
{
  const m = mesh('textile_rolled', 'worn_carpet');
  rolled(m, {});
}

// ── the pack ─────────────────────────────────────────────────────────────────
const images = [];
const textures = [];
const samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
const materials = [];
const materialBySurface = new Map();

const chunks = [];
let byteOffset = 0;
const bufferViews = [];
const accessors = [];
const pad4 = (n) => (n + 3) & ~3;
function append(bytes, target) {
  const b = Buffer.from(bytes.buffer ? bytes.buffer : bytes, bytes.byteOffset || 0, bytes.byteLength ?? bytes.length);
  const start = byteOffset;
  chunks.push(b); byteOffset += b.length;
  const pad = pad4(byteOffset) - byteOffset;
  if (pad) { chunks.push(Buffer.alloc(pad)); byteOffset += pad; }
  const view = { buffer: 0, byteOffset: start, byteLength: b.length };
  if (target) view.target = target;
  bufferViews.push(view);
  return bufferViews.length - 1;
}
function accessor(view, componentType, count, type, min, max) {
  const a = { bufferView: view, componentType, count, type };
  if (min) a.min = min; if (max) a.max = max;
  accessors.push(a);
  return accessors.length - 1;
}

async function surfaceMaterial(id) {
  if (materialBySurface.has(id)) return materialBySurface.get(id);
  const surface = manifest.surfaces[id];
  if (!surface) fail(`no surface "${id}" in the manifest`);
  const image = async (mapId, { srgb }) => {
    const file = await fetchMap(id, mapId, surface.maps[mapId]);
    const jpeg = await sharp(file).resize(SIZE, SIZE, { fit: 'fill' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const view = append(jpeg);
    images.push({ bufferView: view, mimeType: 'image/jpeg', name: `${id}:${mapId}` });
    textures.push({ sampler: 0, source: images.length - 1 });
    return { index: textures.length - 1, srgb };
  };
  const diff = await image('diff', { srgb: true });
  const nor = await image('nor', { srgb: false });
  // Poly Haven's `arm` is AO / roughness / metal in R / G / B, which is exactly
  // glTF's ORM packing — so one image is both the metallicRoughness texture and
  // the occlusion texture, and the renderer reads both (uOrmTex, uAoStrength).
  const arm = await image('arm', { srgb: false });
  materials.push({
    name: `${id} (${surface.asset}, CC0-1.0)`,
    pbrMetallicRoughness: {
      baseColorTexture: { index: diff.index },
      metallicRoughnessTexture: { index: arm.index },
      metallicFactor: 0,
      roughnessFactor: 1,
    },
    normalTexture: { index: nor.index, scale: 1.35 },
    occlusionTexture: { index: arm.index, strength: 0.85 },
    emissiveFactor: [0, 0, 0],
  });
  const at = materials.length - 1;
  materialBySurface.set(id, at);
  return at;
}

const gltfMeshes = [];
for (const m of meshes.values()) {
  const material = await surfaceMaterial(m.surface);
  const p = new Float32Array(m.positions);
  const n = new Float32Array(m.normals);
  const uv = new Float32Array(m.uvs);
  const ix = new Uint32Array(m.indices);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); }
  const pa = accessor(append(p, 34962), 5126, p.length / 3, 'VEC3', lo, hi);
  const na = accessor(append(n, 34962), 5126, n.length / 3, 'VEC3');
  const ua = accessor(append(uv, 34962), 5126, uv.length / 2, 'VEC2');
  const ia = accessor(append(ix, 34963), 5125, ix.length, 'SCALAR', [0], [p.length / 3 - 1]);
  gltfMeshes.push({
    name: m.name,
    primitives: [{ attributes: { POSITION: pa, NORMAL: na, TEXCOORD_0: ua }, indices: ia, material, mode: 4 }],
  });
}

const nodes = gltfMeshes.map((entry, i) => ({ name: entry.name, mesh: i }));
const bin = Buffer.concat(chunks, byteOffset);
const gltf = {
  asset: { version: '2.0', generator: 'chunk-surfer build-textiles.mjs' },
  scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes, meshes: gltfMeshes, materials, textures, images, samplers,
  accessors, bufferViews, buffers: [{ byteLength: bin.length }],
};
const jsonRaw = Buffer.from(JSON.stringify(gltf));
const json = Buffer.concat([jsonRaw, Buffer.alloc(pad4(jsonRaw.length) - jsonRaw.length, 0x20)]);
const total = 12 + 8 + json.length + 8 + bin.length;
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([head, jh, json, bh, bin]);

const triangles = gltfMeshes.reduce((sum, entry) => sum + accessors[entry.primitives[0].indices].count / 3, 0);
if (glb.length > manifest.limits.bytes) fail(`pack is ${(glb.length / 1048576).toFixed(2)}MB, over the ${(manifest.limits.bytes / 1048576).toFixed(0)}MB limit`);
if (triangles > manifest.limits.triangles) fail(`pack is ${triangles} triangles, over the ${manifest.limits.triangles} limit`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, glb);
fs.writeFileSync(CREDITS, `${JSON.stringify({
  pack: {
    filename: path.basename(OUT),
    author: 'Chunk Surfer project (geometry) + Poly Haven (surfaces)',
    source: 'tools/chunk_surfer/build-textiles.mjs',
    license: 'project source (geometry); CC0-1.0 (surfaces)',
    sha256: crypto.createHash('sha256').update(glb).digest('hex'),
    modifications: `Handrolled slab, chamfer, fringe and roll geometry in metres, Y-up, floor-anchored. Poly Haven surfaces resized to ${SIZE}px and re-encoded as JPEG; arm maps used as both metallicRoughness and occlusion.`,
    triangles, bytes: glb.length,
  },
  surfaces: Object.entries(manifest.surfaces).map(([id, s]) => ({
    id, asset: s.asset, title: s.title, url: s.url, license: s.license, note: s.note,
    maps: Object.fromEntries(Object.entries(s.maps).map(([k, v]) => [k, v.sha256])),
  })),
  meshes: gltfMeshes.map((entry, i) => ({
    name: entry.name, surface: [...meshes.values()][i].surface,
    triangles: accessors[entry.primitives[0].indices].count / 3,
  })),
}, null, 2)}\n`);

console.log(`textiles: ${path.relative(ROOT, OUT)}  ${(glb.length / 1048576).toFixed(2)}MB  ${triangles} tris  ${meshes.size} meshes  ${materials.length} surfaces`);
for (const [name, m] of meshes) console.log(`  · ${name.padEnd(26)} ${m.surface}`);
