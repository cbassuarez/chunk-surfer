// Separate original pigment geometry; never rewrites either existing vehicle.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Document, NodeIO } from '@gltf-transform/core';
import { ShapeUtils, Vector2 } from 'three';
import { VAN_BRAND_COPY, VAN_BRAND_FITS, VAN_BRAND_PAINT, VAN_BRAND_VIEWBOX } from '../../src/data/van-brand.js';
import { VAN_BRAND_ART, VAN_BRAND_PIGMENTS } from '../../src/data/van-brand-art.js';

const root = new URL('../../', import.meta.url), sha = b => createHash('sha256').update(b).digest('hex');
const doc = new Document(), buffer = doc.createBuffer(), scene = doc.createScene(`${VAN_BRAND_COPY} / owner-applied paint`);
doc.getRoot().setDefaultScene(scene);
if (!Array.isArray(VAN_BRAND_ART) || !VAN_BRAND_ART.length) throw Error('Original filled polygon artwork is required');
const pigmentIds = [...new Set(VAN_BRAND_ART.map(a => a.pigment))];
if (pigmentIds.length > 4) throw Error('Use at most four opaque paint stocks');
const linear = x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
function colour(value) {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return [1, 3, 5].map(i => linear(parseInt(value.slice(i, i + 2), 16) / 255));
  const rgb = Array.isArray(value) ? value : value?.linearRGB;
  if (!rgb || rgb.length !== 3 || !rgb.every(x => Number.isFinite(x) && x >= 0 && x <= 1)) throw Error('Pigment requires linear RGB or #RRGGBB');
  return [...rgb];
}
const materials = new Map(pigmentIds.map(id => [id, doc.createMaterial(`owner paint / ${id}`).setBaseColorFactor([...colour(VAN_BRAND_PIGMENTS[id]), 1])
  .setAlphaMode('OPAQUE').setMetallicFactor(VAN_BRAND_PAINT.metallic).setRoughnessFactor(VAN_BRAND_PAINT.roughness)
  .setEmissiveFactor([0, 0, 0]).setExtras({ materialFactors: 'gltf', printedSurface: VAN_BRAND_PAINT.printedSurface,
    letteringFinish: VAN_BRAND_PAINT.letteringFinish, originalArtwork: 'src/data/van-brand-art.js', ownerAppliedPaint: true })]));
function area(ring) { return ring.reduce((s, a, i) => { const b = ring[(i + 1) % ring.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2; }
function ring(values, hole = false) {
  if (!Array.isArray(values)) throw Error('Artwork contour missing');
  const out = values.map(v => { if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)) throw Error('Non-finite artwork coordinate'); return [...v]; })
    .filter((v, i, all) => !i || Math.hypot(v[0] - all[i - 1][0], v[1] - all[i - 1][1]) > 1e-7);
  if (out.length > 1 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < 1e-7) out.pop();
  if (out.length < 3 || Math.abs(area(out)) < 1e-8) throw Error('Degenerate original artwork contour');
  if (out.some(([x, y]) => x < 0 || x > 1800 || y < 0 || y > 540)) throw Error('Artwork extends beyond its agreed physical fit');
  // Art Y is down. Outer is world-CCW; holes world-CW after that conversion.
  if ((area(out) > 0) !== hole) out.reverse();
  return out;
}
const artwork = VAN_BRAND_ART.map(a => ({ id: a.id, pigment: a.pigment, layer: a.layer || 0, rings: [ring(a.outer), ...(a.holes || []).map(h => ring(h, true))] }));
if (new Set(artwork.map(a => a.id)).size !== artwork.length) throw Error('Artwork pieces need unique ids');
const accessor = (name, values, type, integer = false) => doc.createAccessor(name).setBuffer(buffer).setType(type)
  .setArray(integer ? new Uint32Array(values) : new Float32Array(values));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((v, k) => v - b[k]);
const unit = a => { const d = Math.hypot(...a); if (d < 1e-10) throw Error('Degenerate painted edge'); return a.map(v => v / d); };
const result = [];
for (const [fitId, fit] of Object.entries(VAN_BRAND_FITS)) {
  const mesh = doc.createMesh(fit.mesh), buckets = new Map(pigmentIds.map(id => [id, { positions: [], normals: [], indices: [] }]));
  for (const surface of fit.surfaces) for (const side of surface.kind === 'side' ? [-1, 1] : [surface.normal]) for (const art of artwork) {
    const project = ([x, y], depth) => surface.kind === 'side'
      ? [side * (surface.surfaceX + depth), surface.centerY + (.5 - y / 540) * surface.heightM,
        surface.centerZ - side * (x / 1800 - .5) * surface.widthM]
      : [surface.centerX + side * (x / 1800 - .5) * surface.widthM,
        surface.centerY + (.5 - y / 540) * surface.heightM, surface.surfaceZ + side * depth];
    const bucket = buckets.get(art.pigment), normal = surface.kind === 'side' ? [side, 0, 0] : [0, 0, side],
      depth = VAN_BRAND_PAINT.frontOffsetM + art.layer * VAN_BRAND_PAINT.pigmentLayerStepM;
    const points = art.rings.flat(), triangles = ShapeUtils.triangulateShape(art.rings[0].map(p => new Vector2(...p)), art.rings.slice(1).map(r => r.map(p => new Vector2(...p))));
    if (!triangles.length) throw Error(`Artwork failed triangulation: ${art.id}`);
    const front = points.map(p => project(p, depth)), back = points.map(p => project(p, depth - VAN_BRAND_PAINT.thicknessM));
    const start = bucket.positions.length / 3;
    for (const p of front) { bucket.positions.push(...p); bucket.normals.push(...normal); }
    for (const p of back) { bucket.positions.push(...p); bucket.normals.push(...normal.map(n => -n)); }
    for (const triangle of triangles) {
      const t = [...triangle], n = cross(sub(front[t[1]], front[t[0]]), sub(front[t[2]], front[t[0]]));
      if (n.reduce((sum, v, k) => sum + v * normal[k], 0) < 0) [t[1], t[2]] = [t[2], t[1]];
      bucket.indices.push(...t.map(i => start + i), start + points.length + t[0], start + points.length + t[2], start + points.length + t[1]);
    }
    let at = 0;
    for (const contour of art.rings) {
      for (let i = 0; i < contour.length; i++) {
        const a = at + i, b = at + (i + 1) % contour.length, n = unit(cross(sub(front[b], front[a]), normal)), base = bucket.positions.length / 3;
        for (const point of [front[a], back[a], front[b], back[b]]) { bucket.positions.push(...point); bucket.normals.push(...n); }
        bucket.indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      }
      at += contour.length;
    }
  }
  let vertices = 0, triangles = 0, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const [id, b] of buckets) {
    for (let i = 0; i < b.positions.length; i++) { min[i % 3] = Math.min(min[i % 3], b.positions[i]); max[i % 3] = Math.max(max[i % 3], b.positions[i]); }
    mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION', accessor(`${fitId}/${id}/position`, b.positions, 'VEC3'))
      .setAttribute('NORMAL', accessor(`${fitId}/${id}/normal`, b.normals, 'VEC3')).setIndices(accessor(`${fitId}/${id}/indices`, b.indices, 'SCALAR', true)).setMaterial(materials.get(id)));
    vertices += b.positions.length / 3; triangles += b.indices.length / 3;
  }
  mesh.setExtras({ bounds: { min, max }, purpose: `Opaque owner-applied ${VAN_BRAND_COPY} pigment; no sign carrier`,
    fit, pigmentThicknessM: VAN_BRAND_PAINT.thicknessM, paintOnly: true, hostGeometryUnchanged: true });
  scene.addChild(doc.createNode(fit.mesh).setMesh(mesh));
  result.push({ fit: fitId, mesh: fit.mesh, vertices, triangles, bounds: { min, max }, sourcePolygons: artwork.length, surfaces: fit.surfaces, pigments: pigmentIds });
}
const bytes = await new NodeIO().writeBinary(doc), digest = sha(bytes);
await fs.writeFile(new URL('public/assets/van-brand.glb', root), bytes);
const inputs = {};
for (const path of ['src/data/van-brand-art.js', 'src/data/van-brand.js', 'tools/chunk_surfer/build-van-brand.mjs']) inputs[path] = sha(await fs.readFile(new URL(path, root)));
const stats = { version: 2, copy: VAN_BRAND_COPY, asset: 'assets/van-brand.glb', sha256: digest, bytes: bytes.length,
  sourceViewBox: VAN_BRAND_VIEWBOX, inputs, meshes: result, materials: pigmentIds.map(id => ({ id, linearRGB: colour(VAN_BRAND_PIGMENTS[id]), ...VAN_BRAND_PAINT })),
  rendering: { textures: 0, alpha: 'OPAQUE', printedCoverage: 'solid polygon geometry', emissive: false, shader: 'Existing P3 material, world depth and solid-lettering marks → acquisition → final dither/VFD' },
  unchangedHosts: ['public/assets/conservatory-props.glb', 'public/assets/source-vehicle-interior.glb', 'public/assets/source-drive/drive.glb'],
  validation: { method: 'Host side and rear skin coordinates read from production source geometry; focused tests cover normals, pigment area, attachment and flag construction', pending: ['Final-shader ordinary-distance and moving native inspection'] } };
await fs.writeFile(new URL('public/assets/van-brand.stats.json', root), JSON.stringify(stats, null, 2) + '\n');
await fs.writeFile(new URL('public/assets/van-brand.credits.json', root), JSON.stringify({ asset: stats.asset, copy: VAN_BRAND_COPY,
  artwork: 'Original ALBION LOCATION SOUND lettering and constructed Union Flag; src/data/van-brand-art.js', flagConstructionReference: 'https://www.flaginstitute.org/wp/uk-flags/union-flag-specification/', geometry: 'Original thin pigment extrusion; no font or third-party company logo copied',
  license: 'Project-authored original assets; project licensing applies.', sourceSha256: inputs['src/data/van-brand-art.js'], sha256: digest }, null, 2) + '\n');
console.log(JSON.stringify({ bytes: bytes.length, sha256: digest, meshes: result.map(({ mesh, vertices, triangles }) => ({ mesh, vertices, triangles })) }, null, 2));
