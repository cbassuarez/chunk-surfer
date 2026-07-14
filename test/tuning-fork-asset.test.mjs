import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PROP_MESH } from '../src/data/conservatory-props.js';

function readGlb(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.slice(0, 4).toString(), 'glTF');
  assert.equal(buffer.readUInt32LE(4), 2);
  const length = buffer.readUInt32LE(8);
  assert.equal(length, buffer.length);
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(buffer.slice(20, 20 + jsonLength).toString());
  const binHeader = 20 + jsonLength;
  assert.equal(buffer.readUInt32LE(binHeader + 4), 0x004e4942);
  return json;
}

const json = readGlb('public/assets/tuning-fork.glb');
assert.equal(json.meshes?.[0]?.name, 'tuning_fork');
assert.equal(json.nodes?.[0]?.name, 'tuning_fork');
assert.equal(json.animations, undefined);
assert.equal(json.skins, undefined);
assert.equal(json.extensionsUsed, undefined);
assert.equal(json.extensionsRequired, undefined);
assert.equal(json.accessors.some((a) => a.sparse), false);
assert.equal(json.meshes[0].primitives.length, 2);
for (const primitive of json.meshes[0].primitives) {
  assert.equal(primitive.mode, 4);
  assert.ok(primitive.indices >= 3);
  assert.ok(primitive.attributes.POSITION != null);
  assert.ok(primitive.attributes.NORMAL != null);
}
assert.ok((json.accessors[0].count || 0) > 600, 'fork should include rounded ball geometry, not a flat marker');
assert.deepEqual(json.materials.map((m) => m.name), ['cold brushed steel', 'old dark stamp']);
assert.deepEqual(PROP_MESH.tuning_fork, { w: .22, d: .82, blocks: false });

const main = readFileSync('src/main.js', 'utf8');
assert.match(main, /setLooseProp\('story-tuning-fork'[\s\S]*mesh:'tuning_fork'/);

console.log('tuning fork asset contract ok');
