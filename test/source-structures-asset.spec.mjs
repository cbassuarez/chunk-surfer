import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const bytes = fs.readFileSync(new URL('../public/assets/source-structures.glb', import.meta.url));
const stats = JSON.parse(fs.readFileSync(new URL('../public/assets/source-structures.stats.json', import.meta.url), 'utf8'));
const credits = JSON.parse(fs.readFileSync(new URL('../public/assets/source-structures.credits.json', import.meta.url), 'utf8'));
const builder = fs.readFileSync(new URL('../tools/chunk_surfer/build-source-structures.mjs', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');

assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());

const expected = [
  'source_bust_broken_torso',
  'source_bust_broken_head',
  'source_bust_face_shard',
  'source_bust_marble_chips',
];
assert.deepEqual(json.meshes.map((mesh) => mesh.name), expected);
assert.ok(json.meshes.every((mesh) => mesh.primitives.every((primitive) => Number.isInteger(primitive.indices))));
assert.ok(json.meshes.every((mesh) => mesh.primitives.every((primitive) => Number.isInteger(primitive.attributes.POSITION)
  && Number.isInteger(primitive.attributes.NORMAL) && Number.isInteger(primitive.attributes.TEXCOORD_0))));
assert.equal(json.materials[1].name, 'rough exposed marble fracture');
assert.ok(json.meshes.slice(0, 3).every((mesh) => mesh.primitives.some((primitive) => primitive.material === 1)), 'every major fracture exposes capped interior marble');
assert.equal(json.textures.length, 3, 'the derived exterior retains the acquisition surface, normal, and roughness textures');
assert.ok(json.images.every((image) => Number.isInteger(image.bufferView) && /^image\/(png|jpeg)$/.test(image.mimeType)));
assert.ok(!json.animations && !json.skins && !json.extensionsUsed && !json.extensionsRequired);

assert.equal(stats.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
assert.equal(credits.pack.sha256, stats.sha256);
assert.equal(credits.source.mesh, 'marble_bust_01');
assert.equal(credits.source.license, 'CC0-1.0');
assert.equal(credits.derivation.externalDownloadsRequired, false);
assert.equal(stats.totalTriangles, Object.values(stats.meshes).reduce((sum, mesh) => sum + mesh.triangles, 0));
assert.ok(stats.totalTriangles < 20000, `${stats.totalTriangles} triangles remains inside the hero budget`);
assert.ok(bytes.length < 6 * 1024 * 1024, `${bytes.length} bytes remains inside the transfer budget`);
for (const name of expected) {
  assert.equal(stats.meshes[name].watertight, true, `${name} is watertight`);
  assert.equal(stats.meshes[name].openEdges, 0, `${name} has no uncapped cut edges`);
  assert.ok(stats.meshes[name].bounds.min.length === 3 && stats.meshes[name].bounds.max.length === 3);
}
assert.match(builder, /warpFracturePoint/);
assert.match(builder, /capLoop/);
assert.match(builder, /acquisitionPackSha256/);
assert.match(renderer, /addPropPack\(assetUrl\('assets\/source-structures\.glb'\)\)/,'the derived pack loads additively after the shared acquisition pack');

console.log('source structure derived asset specs passed');
