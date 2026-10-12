// Validate the delivered asset and its regeneratable provenance, not a fixture.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseCharacterAsset, sampleCharacterPose } from '../../../src/render/character-asset.js';

const file = process.argv[2] ? resolve(process.argv[2]) : new URL('../../../public/assets/pressure-character.glb', import.meta.url);
const stats = JSON.parse(readFileSync(process.argv[3] ? resolve(process.argv[3]) : new URL('../../../public/assets/pressure-character/stats.json', import.meta.url)));
const bytes = readFileSync(file);
const asset = parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
assert.equal(createHash('sha256').update(bytes).digest('hex'), stats.sha256, 'metadata does not identify the delivered GLB');
assert.equal(bytes.length, stats.bytes);
assert.deepEqual(asset.entries.map(e => e.name), ['pressure_body']);
const entry = asset.entries[0];
assert.deepEqual(entry.morphNames, ['sternum_sink', 'collar_draw', 'scapula_lock', 'longitudinal_tension']);
assert.equal(entry.skin.joints.length, 34);
const vertices = entry.primitives.reduce((n, p) => n + p.vertexCount, 0);
const triangles = entry.primitives.reduce((n, p) => n + p.indices.length / 3, 0);
assert(vertices <= 35000 && triangles <= 60000, 'delivered Pressure geometry exceeds the authored target');
for (const [clip, duration] of Object.entries(stats.clips)) {
  assert(Math.abs(asset.clips.get(clip)?.duration - duration) < .001, `missing or stale ${clip}`);
  const pose = sampleCharacterPose(asset, entry, { clip, time: duration * .39 });
  assert([...pose.bones, ...pose.morphs].every(Number.isFinite), `${clip} has nonfinite deformation`);
}
assert.equal(Object.keys(stats.clips).length, asset.clips.size);
assert.equal(stats.meshes.pressure_body.vertices, vertices);
assert.equal(stats.meshes.pressure_body.triangles, triangles);
if (process.argv[4]) {
  const oldBytes=readFileSync(resolve(process.argv[4]));
  const old=parseCharacterAsset(oldBytes.buffer.slice(oldBytes.byteOffset,oldBytes.byteOffset+oldBytes.byteLength));
  for (const key of ['nodes','skins','meshes','materials','textures','images']) assert.deepEqual(asset.json[key],old.json[key],`accepted ${key} changed during animation-only export`);
  // All old buffer views keep their original offsets and exact bytes, including
  // actual geometry, dense correctives, inverse binds, embedded maps and clips.
  for (const [i,view] of old.json.bufferViews.entries()) {
    assert.deepEqual(asset.json.bufferViews[i],view,`retained buffer view ${i} changed`);
    const at=view.byteOffset||0;
    assert.deepEqual(asset.bin.subarray(at,at+view.byteLength),old.bin.subarray(at,at+view.byteLength),`retained buffer view ${i} bytes changed`);
  }
  for (const [name,clip]of old.clips) assert.deepEqual(asset.clips.get(name),clip,`legacy ${name} changed`);
  assert.equal(stats.motion.arrested.retainedAppearanceBaselineSha256,createHash('sha256').update(oldBytes).digest('hex'));
  console.log('Accepted geometry, skin, UVs, correctives, materials, embedded textures and all five legacy clips are byte-identical.');
}
console.log(JSON.stringify({ file: typeof file==='string'?file:file.pathname, bytes: bytes.length, sha256: stats.sha256, vertices, triangles,
  joints: entry.skin.joints.length, morphs: entry.morphNames, clips: stats.clips }, null, 2));
