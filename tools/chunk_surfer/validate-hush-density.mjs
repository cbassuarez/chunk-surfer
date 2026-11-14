// Actual production GLB data + the shared captured-state descriptor. CPU only.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseCharacterAsset, sampleCharacterPose } from '../../src/render/character-asset.js';
import { hushDensityCharacter } from '../../src/game/hush-density-performance.js';
import { HUSH_POSTURE_REVISION, HUSH_POSTURE_ASSET_SHA256 } from '../../src/data/generated/hush-last-posture-support.js';

const root = new URL('../../', import.meta.url), sha = b => createHash('sha256').update(b).digest('hex');
const bytes = await readFile(new URL('public/assets/hush-density.glb', root));
const asset = parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const entries = Object.fromEntries(asset.entries.map(e => [e.name, e]));
assert.deepEqual(Object.keys(entries).sort(), ['hush_density_core', 'hush_density_return', 'hush_density_volume']);
assert.equal(asset.clips.size, 16);
assert(asset.clips.has('density_chase'), 'the authored chase phrase must ship in the actual asset');
assert.equal(sha(bytes),HUSH_POSTURE_ASSET_SHA256,'body and generated runtime support must be installed as one revision');
assert.equal(asset.json.extras.modelRevision,HUSH_POSTURE_REVISION);
const stats = JSON.parse(await readFile(new URL('public/assets/hush-density/stats.json', root), 'utf8'));
assert.equal(stats.modelRevision,HUSH_POSTURE_REVISION);assert.equal(stats.sha256,HUSH_POSTURE_ASSET_SHA256);
for (const e of asset.entries) { assert.equal(e.skin.joints.length, 43); assert.equal(e.morphCount, 0); }
const e = entries.hush_density_volume, p = e.primitives[0];
assert(asset.entries.reduce((n, e) => n + e.primitives.reduce((n, p) => n + p.vertexCount, 0), 0) <= 50000);
const names=new Set(asset.nodes.map(n=>n.name));
for(const name of ['posture_root','pelvis','spine_low','chest','neck','head','thigh_L','shin_R','foot_L','hand_R','thumb_L_02','little_R_02']) assert(names.has(name),name);
assert(![...names].some(name=>/^fold_/.test(name)), 'no previous density bones survive');
assert.equal(stats.triangles,p.indices.length/3);assert(stats.triangles<=44000);
const key = (q, i) => Array.from(q.positions.subarray(i * 3, i * 3 + 3)).join(',');
const lookup = new Map(Array.from({ length: p.vertexCount }, (_, i) => [key(p, i), i]));
assert.equal(lookup.size, p.vertexCount, 'unique sculpt coordinates required by partition test');
const triangles = new Map();
for (let i = 0; i < p.indices.length; i += 3) triangles.set(Array.from(p.indices.subarray(i, i + 3)).join(','), 1);
let sharedVertices = 0;
for (const name of ['hush_density_core', 'hush_density_return']) {
  const q = entries[name].primitives[0], remap = [];
  for (let i = 0; i < q.vertexCount; i++) {
    const j = lookup.get(key(q, i)); assert(j != null); remap.push(j); sharedVertices++;
    for (const [channel, width] of [['positions', 3], ['normals', 3], ['uv', 2], ['joints', 4], ['weights', 4]]) {
      assert.deepEqual(q[channel].slice(i * width, i * width + width), p[channel].slice(j * width, j * width + width));
    }
  }
  for (let i = 0; i < q.indices.length; i += 3) {
    const t = Array.from(q.indices.subarray(i, i + 3), n => remap[n]).join(',');
    assert(triangles.has(t)); triangles.set(t, triangles.get(t) - 1);
  }
}
assert([...triangles.values()].every(n => n === 0), 'core+return exactly partition full volume');
const edgeMap = new Map();
for (let i = 0; i < p.indices.length; i += 3) for (let k = 0; k < 3; k++) {
  const a = p.indices[i + k], b = p.indices[i + (k + 1) % 3], key = Math.min(a, b) + ',' + Math.max(a, b);
  if (edgeMap.has(key)) edgeMap.get(key).count++;
  else edgeMap.set(key, { a, b, count: 1, length: Math.hypot(...p.positions.slice(a * 3, a * 3 + 3).map((v, k) => v - p.positions[b * 3 + k])) });
}
assert([...edgeMap.values()].every(x => x.count === 2), 'closed manifold sculpt');
const parent = Array.from({ length: p.vertexCount }, (_, i) => i);
function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
for (const { a, b } of edgeMap.values()) parent[find(a)] = find(b);
assert.equal(new Set(parent.map((_, i) => find(i))).size, 1);
const edges = [...edgeMap.values()].filter(x => x.length > .005);
let normalUnitError = 0, weightsError = 0;
for (let i = 0; i < p.vertexCount; i++) {
  normalUnitError = Math.max(normalUnitError, Math.abs(Math.hypot(...p.normals.slice(i * 3, i * 3 + 3)) - 1));
  weightsError = Math.max(weightsError, Math.abs(p.weights.slice(i * 4, i * 4 + 4).reduce((a, b) => a + b, 0) - 1));
}
assert(normalUnitError < 1e-6); assert(weightsError < 1e-6);
function skin(descriptor, entry = e) {
  const m = sampleCharacterPose(asset, entry, descriptor).bones, r = new Float64Array(p.positions.length);
  for (let i = 0; i < p.vertexCount; i++) for (let k = 0; k < 4; k++) {
    const j = p.joints[i * 4 + k] * 16, w = p.weights[i * 4 + k], x = p.positions[i * 3], y = p.positions[i * 3 + 1], z = p.positions[i * 3 + 2];
    r[i * 3] += w * (m[j] * x + m[j + 4] * y + m[j + 8] * z + m[j + 12]);
    r[i * 3 + 1] += w * (m[j + 1] * x + m[j + 5] * y + m[j + 9] * z + m[j + 13]);
    r[i * 3 + 2] += w * (m[j + 2] * x + m[j + 6] * y + m[j + 10] * z + m[j + 14]);
  }
  assert(r.every(Number.isFinite)); return r;
}
function difference(a, b) { let n = 0; for (let i = 0; i < a.length; i += 3) n = Math.max(n, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2])); return n; }
const neutral = skin({ clip: 'pressure_hold', time: 0 }), floor = [];
assert(difference(neutral,p.positions)<3e-6,'neutral clip reproduces the closed sculpt');
for (let i = 0; i < p.vertexCount; i++) if (p.positions[i * 3 + 1] <= .085) floor.push(i);
let radial = 0, baseDrift = 0, scaleChannelCount = 0;
const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
function measure(r) {
  for (let i = 0; i < p.vertexCount; i++) {
    radial = Math.max(radial, Math.hypot(r[i * 3], r[i * 3 + 2]));
    for (let k = 0; k < 3; k++) { bounds.min[k] = Math.min(bounds.min[k], r[i * 3 + k]); bounds.max[k] = Math.max(bounds.max[k], r[i * 3 + k]); }
  }
  for (const i of floor) baseDrift = Math.max(baseDrift, Math.hypot(...r.slice(i * 3, i * 3 + 3).map((v, k) => v - neutral[i * 3 + k])));
}
const clipMetrics = [];
for (const [name, clip] of asset.clips) {
  const ratios = new Float64Array(edges.length), samples = 25;
  let motion = 0;
  assert(!clip.channels.some(c=>asset.nodes[c.node].name==='posture_root'),'clips cannot take the authoritative root');
  scaleChannelCount += clip.channels.filter(c => c.path === 'scale').length;
  const first = skin({ clip: name, time: 0 });
  for (let n = 0; n < samples; n++) {
    const r = skin({ clip: name, time: n * clip.duration / (samples - 1), loop: false }); measure(r); motion = Math.max(motion, difference(r, first));
    for (let k = 0; k < edges.length; k++) {
      const { a, b, length } = edges[k], ratio = Math.hypot(r[a * 3] - r[b * 3], r[a * 3 + 1] - r[b * 3 + 1], r[a * 3 + 2] - r[b * 3 + 2]) / length;
      ratios[k] = Math.max(ratios[k], ratio);
    }
  }
  ratios.sort(); clipMetrics.push({ clip: name, duration: clip.duration, samples, maximumMotionFromFirstM: motion,
    edgeExtension: { measure: 'Per edge maximum over 25 clip samples; edges>5mm', p95: ratios[Math.floor(ratios.length * .95)], p99: ratios[Math.floor(ratios.length * .99)], maximum: ratios.at(-1) } });
}
assert.equal(scaleChannelCount,0,'motion uses articulated transforms rather than local scaling');
const seams = [];
for (const [id, a, at, b, bt] of [
  ['hold-load', 'pressure_hold', 1, 'pressure_load', 0], ['load-advance', 'pressure_load', .5, 'pressure_advance', 0],
  ['advance-retained', 'pressure_advance', .72, 'density_retained', 0], ['retained-reload', 'density_retained', 1, 'density_reload', 0],
  ['reload-advance', 'density_reload', .5, 'pressure_advance', 0], ['retained-listen', 'density_retained', 1, 'density_listen', 0],
  ['retained-idle', 'density_retained', 1, 'density_idle', 0], ['idle-end-retained', 'density_idle', 6.4, 'density_retained', 0],
  ['approach-loop', 'pressure_approach', 0, 'pressure_approach', 2.4], ['chase-loop','density_chase',0,'density_chase',2.4],
]) { const maximumVertexDifferenceM = difference(skin({ clip: a, time: at }), skin({ clip: b, time: bt })); assert(maximumVertexDifferenceM < 2e-6, id); seams.push({ id, maximumVertexDifferenceM }); }
assert.equal(clipMetrics.find(x => x.clip === 'pressure_idle').maximumMotionFromFirstM, 0);
assert(clipMetrics.find(x => x.clip === 'density_idle').maximumMotionFromFirstM > .01);
// Real captured-state descriptors include authored scales, finite clip blending,
// attention and compression. Test current bounded extrema without new clocks.
const combined = [];
for (const event of ['still', 'travel', 'notice', 'blocked', 'settle']) for (const attention of [-.65, .65]) for (const drive of [0,1]) for (let n = 0; n <= 24; n++) {
  const time = n / 24, density = { version: 1, postureVersion: 2, phase: time, rate: 2, traction: 1, drive, compression: .98, retained: .86,
    attention, event, eventTime: time * (event === 'notice' ? 4.8 : 6.4), listening: event === 'notice', blocked: event === 'blocked', seed: 71 };
  const descriptor = hushDensityCharacter({ density }), r = skin(descriptor); measure(r);
  const palette = sampleCharacterPose(asset, e, descriptor).bones;
  for (const entry of asset.entries) assert.deepEqual(sampleCharacterPose(asset, entry, descriptor).bones, palette);
  combined.push({ event, attention, drive, phase: time });
}
assert(radial <= .72, 'authored + in-place runtime wave must fit declared mechanical radial envelope');
assert(Math.abs(stats.restBounds.min[1])<2e-6&&Math.abs(stats.restBounds.max[1]-stats.restBounds.min[1]-asset.json.extras.heightM)<2e-6);
const maximumEdgeExtension = Math.max(...clipMetrics.map(x => x.edgeExtension.maximum));
assert(maximumEdgeExtension < 1.4, 'no sampled anatomical edge over 5mm stretches more than 40% in the authored clips');
const originalHumanSha256 = sha(await readFile(new URL('public/assets/pressure-character.glb', root)));
assert.equal(originalHumanSha256, '29f4321a45f48cff08f243591153adbc0de5b25e31a3adb2f26ce2c6d78368b9');
const result = { kind: 'production-hush-density-cpu-validation', assetSha256: sha(bytes), originalHumanSha256,
  authorityModuleSha256: sha(await readFile(new URL('src/game/hush-density-performance.js', root))),
  materialPartitionExact: true, sharedVertexChannelsExact: true, sharedDescriptorBonePalettesExact: true, sharedVertices,
  uniqueSculptVertices: p.vertexCount, uniqueSculptTriangles: p.indices.length / 3, exportedVertices: asset.entries.reduce((n, e) => n + e.primitives[0].vertexCount, 0),
  joints: 43, clips: 16, morphs: 0, scaleChannelCount, normalUnitError, weightsError,
  topology: { connectedComponents: 1, boundaryEdges: 0, nonManifoldEdges: 0, euler: p.vertexCount - edgeMap.size + p.indices.length / 3 },
  sampledBounds: bounds, maximumSampledRadialEnvelopeM: radial, maximumRootRelativeGatherMotionM: baseDrift, maximumSampledEdgeExtensionRatio: maximumEdgeExtension,
  clipMetrics, seams, combinedDescriptorSamples: combined.length,
  limits: ['CPU actual exported skin and shared descriptor checks; no native rendering or human fear validation.',
    'The in-place gather displaces feet relative to the root; separate accepted-world contact tests establish planted support.', 'No all-time self-collision or global route-clearance proof.'] };
await writeFile(new URL('public/assets/hush-density/validation.json', root), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ hash: result.assetSha256, exportedVertices: result.exportedVertices, clips: 16, combinedDescriptorSamples: combined.length,
  radialM: radial, baseDriftM: baseDrift, maximumEdgeExtension, largestSeamM: Math.max(...seams.map(x => x.maximumVertexDifferenceM)), originalHumanPreserved: true }, null, 2));
