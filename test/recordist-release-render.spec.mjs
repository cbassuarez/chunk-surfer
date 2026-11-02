import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';
import { RECORDIST_RELEASE_RIG } from '../src/data/recordist-release-rig.js';
import {
  recordistReleaseActorPose, RECORDIST_RELEASE_CLIPS, recordistReleaseProps,
  recordistReleaseCarriedProps, recordistReleaseRestingProps,
} from '../src/render/recordist-release.js';
import { beginRecordistRelease } from '../src/game/recordist-release.js';

const bytes = fs.readFileSync(new URL('../public/assets/alan-recordist.glb', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(new URL('../public/assets/alan-recordist/manifest.json', import.meta.url)));
const asset = parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const body = asset.entries.find(e => e.name === 'recordist_release_alan');
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const transformed = (primitive, vertex, pose) => {
  const p = primitive.positions.subarray(vertex * 3, vertex * 3 + 3), result = [0, 0, 0];
  for (let slot = 0; slot < 4; slot++) {
    const weight = primitive.weights[vertex * 4 + slot], offset = primitive.joints[vertex * 4 + slot] * 16, m = pose.bones;
    for (let axis = 0; axis < 3; axis++) result[axis] += weight *
      (m[offset + axis] * p[0] + m[offset + 4 + axis] * p[1] + m[offset + 8 + axis] * p[2] + m[offset + 12 + axis]);
  }
  return result;
};

test('dedicated release pack retains adult anatomy, repaired fingers, real bare feet and embedded surface channels', () => {
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
  assert.ok(bytes.length < 5 * 1024 * 1024);
  assert.deepEqual(asset.entries.map(e => e.name), ['recordist_release_alan', 'recordist_release_rig_hand', 'recordist_release_rig_seated', 'recordist_release_fork_hand']);
  assert.equal(body.skin.joints.length, 54);
  assert.equal(RECORDIST_RELEASE_RIG.length, 54);
  assert.equal(body.primitives.length, 6);
  assert.equal(body.primitives.reduce((n, p) => n + p.vertexCount, 0), 18123);
  assert.ok(manifest.footVertices > 2000, 'bare toes are retained geometry, not recoloured footwear');
  assert.equal(body.extras.bareFeet, true);
  assert.equal(body.extras.pressureIdentity, false);
  for (const name of ['thumb', 'index', 'middle', 'ring', 'little']) for (const side of ['L', 'R'])
    assert.ok(RECORDIST_RELEASE_RIG.some(b => b.name === `${name}_tip_${side}`));
  for (const p of body.primitives) for (let vertex = 0; vertex < p.vertexCount; vertex++) {
    assert.ok(Math.abs([...p.weights.subarray(vertex * 4, vertex * 4 + 4)].reduce((n, w) => n + w, 0) - 1) < 2e-7);
  }
  for (const index of [0, 1, 2]) {
    const material = asset.json.materials[index];
    assert.ok(material.pbrMetallicRoughness.baseColorTexture);
    assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.ok(material.normalTexture);
    assert.equal(material.alphaMode || 'OPAQUE', 'OPAQUE');
    assert.ok(!material.emissiveFactor);
  }
  for (const grip of manifest.gripChecks) assert.ok(grip.maxErrorM < .002, `${grip.tool} grip misses its real contact`);
});

test('all seven baked clips are sampled by the production parser with complete translation and rotation tracks', () => {
  assert.deepEqual([...asset.clips.keys()], Object.keys(RECORDIST_RELEASE_CLIPS).map(n => `alan_${n}`));
  for (const [name, duration] of Object.entries(RECORDIST_RELEASE_CLIPS)) {
    const clip = asset.clips.get(`alan_${name}`);
    assert.ok(Math.abs(clip.duration - duration) < 1e-6);
    assert.equal(clip.channels.length, 108);
    for (const channel of clip.channels) {
      assert.equal(channel.interpolation, 'LINEAR');
      for (let frame = 1; frame < channel.times.length; frame++)
        assert.ok(channel.times[frame] - channel.times[frame - 1] <= 1 / 24 + 1e-6);
    }
    assert.ok(sampleCharacterPose(asset, body, { clip: `alan_${name}`, time: duration / 2, loop: false }).bones.every(Number.isFinite));
  }
});

test('hips remain joined to the pelvis and every arm and leg retains anatomical length through release and carry', () => {
  const rig = new Map(RECORDIST_RELEASE_RIG.map(b => [b.name, b]));
  const rotate = (point, q) => {
    const [x, y, z] = point, [a, b, c, w] = q;
    const t = [2 * (b * z - c * y), 2 * (c * x - a * z), 2 * (a * y - b * x)];
    return [x + w * t[0] + b * t[2] - c * t[1], y + w * t[1] + c * t[0] - a * t[2], z + w * t[2] + a * t[1] - b * t[0]];
  };
  for (const [mode, duration] of Object.entries(RECORDIST_RELEASE_CLIPS)) for (let frame = 0; frame <= Math.ceil(duration * 24); frame++) {
    const pose = recordistReleaseActorPose(mode, Math.min(duration, frame / 24));
    for (const contact of pose.contacts) {
      assert.ok(contact.error < 1e-6, `${mode} has an unreachable ${contact.kind} target`);
      const a = rig.get(`${contact.kind === 'leg' ? 'thigh' : 'upperarm'}_${contact.side}`);
      const b = rig.get(`${contact.kind === 'leg' ? 'shin' : 'forearm'}_${contact.side}`);
      assert.ok(Math.abs(contact.upperLength - distance(a.head, a.tail)) < 1e-6);
      assert.ok(Math.abs(contact.lowerLength - distance(b.head, b.tail)) < 1e-6);
      if (contact.kind === 'leg') {
        const pelvis = pose.joints.pelvis, offset = a.head.map((n, i) => n - rig.get('pelvis').head[i]);
        const expected = rotate(offset, pelvis.rotation).map((n, i) => n + pelvis.translation[i]);
        assert.ok(distance(contact.hip, expected) < 1e-7, 'hip socket separates when the body rolls');
      }
    }
  }
});

test('actual skinned vertices keep floor clearance, adult scale and conservative culling through every clip', () => {
  for (const [mode, duration] of Object.entries(RECORDIST_RELEASE_CLIPS)) for (let frame = 0; frame <= 24; frame++) {
    const pose = sampleCharacterPose(asset, body, { clip: `alan_${mode}`, time: duration * frame / 24, loop: false });
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of body.primitives) for (let vertex = 0; vertex < p.vertexCount; vertex++) {
      const point = transformed(p, vertex, pose);
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(Number.isFinite(point[axis]));
        assert.ok(point[axis] >= pose.bounds.min[axis] - 1e-5 && point[axis] <= pose.bounds.max[axis] + 1e-5, 'skin escapes production culling bounds');
        min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]);
      }
    }
    assert.ok(min[1] > -.003, `${mode} penetrates its floor by ${-min[1]}m`);
    if (['bound', 'interrupt', 'settling', 'slumped', 'resting'].includes(mode)) assert.ok(min[1] < .02, `${mode} floats above its support`);
    if (mode === 'bound') assert.ok(max[1] > 1.2 && max[1] < 1.3, 'kneeling adult has the wrong scale');
    if (mode === 'resting') assert.ok(max[2] - min[2] > 1.75 && max[1] < .4, 'resting adult is shrunk or standing');
    if (mode === 'carried') assert.ok(max[0] - min[0] > 1.3 && max[0] - min[0] < 1.6, 'carried adult has the wrong folded span');
  }
});

test('idle clips close their pose loops without a breathing or finger reset', () => {
  for (const name of ['bound', 'slumped', 'carried', 'resting']) {
    const a = sampleCharacterPose(asset, body, { clip: `alan_${name}`, time: 0, loop: false });
    const b = sampleCharacterPose(asset, body, { clip: `alan_${name}`, time: RECORDIST_RELEASE_CLIPS[name], loop: false });
    assert.ok(a.bones.every((n, i) => Math.abs(n - b.bones[i]) < 1e-5), `${name} jumps at its loop seam`);
  }
});

test('garment weights do not reopen the retained rigid underarm and crotch seams in deep poses', () => {
  for (const [mode, duration] of Object.entries(RECORDIST_RELEASE_CLIPS)) for (const time of [0, duration / 2, duration]) {
    const pose = sampleCharacterPose(asset, body, { clip: `alan_${mode}`, time, loop: false });
    for (const primitive of body.primitives.filter(p => [1, 2].includes(p.material))) {
      const points = Array.from({ length: primitive.vertexCount }, (_, v) => transformed(primitive, v, pose));
      for (let face = 0; face < primitive.indices.length; face += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        const i = primitive.indices[face + a], j = primitive.indices[face + b];
        const rest = distance([...primitive.positions.subarray(i * 3, i * 3 + 3)], [...primitive.positions.subarray(j * 3, j * 3 + 3)]);
        if (rest < .01) continue;
        // This is a seam-regression bound, not a claim of simulated cloth.
        // The retained source produced 7–38x edges in these same poses.
        assert.ok(distance(points[i], points[j]) / rest < 3.1, `${mode} reopens a stretched garment seam`);
      }
    }
  }
});

test('the seated rig remains after the hand withdraws and aimed tool travel is bounded by the real stance', () => {
  const origin = { x: 0, y: 0, z: 0, yaw: 0 }, base = beginRecordistRelease({ runId: 'physical-operation', origin });
  const addressed = { ...base, stage: 'interrupt', proof: { addressed: true }, requiresRelease: false, holdSeconds: .8 };
  const player = { eye: [0, 1.6, -.9], yaw: Math.PI };
  const props = recordistReleaseProps(addressed, { includeTools: true, player });
  const seated = props.find(p => p.mesh === 'recordist_release_rig_seated');
  const fork = props.find(p => p.mesh === 'recordist_release_fork_hand');
  assert.ok(seated && fork);
  assert.ok(!props.some(p => p.mesh === 'recordist_release_rig_hand'), 'a detached player hand remains with the seated rig');
  assert.ok(distance(fork.matrix.slice(12, 15), [player.eye[0], player.eye[1] - .35, player.eye[2]]) <= 1.05 + 1e-8);
  const carried = { ...base, stage: 'carried', proof: { addressed: true, interrupted: true, released: true, lifted: true } };
  assert.ok(!recordistReleaseProps(carried).some(p => p.mesh === 'recordist_release_rig_seated'));
  const held = asset.json.meshes.find(m => m.name === 'recordist_release_rig_hand');
  const bare = asset.json.meshes.find(m => m.name === 'recordist_release_rig_seated');
  assert.ok(bare.primitives.every(p => p.material !== 0));
  assert.ok(bare.primitives.every(p => held.primitives.some(h => h.attributes.POSITION === p.attributes.POSITION)), 'bare rig needlessly duplicates its tool geometry');
});

test('release, carry and final rest descriptors retain physical metres in the ordinary material path', () => {
  const origin = { x: 34, y: -2, z: 71, yaw: .7 }, state = beginRecordistRelease({ runId: 'render-check', origin });
  const props = [recordistReleaseProps(state)[0], recordistReleaseCarriedProps({ origin, time: 4 })[0], recordistReleaseRestingProps({ origin, time: 2 })[0]];
  for (const prop of props) {
    assert.equal(prop.mesh, 'recordist_release_alan');
    assert.deepEqual(prop.matrix.slice(12, 15), [34, -2, 71]);
    for (const column of [0, 4, 8]) assert.ok(Math.abs(Math.hypot(...prop.matrix.slice(column, column + 3)) - 1) < 1e-8);
    assert.ok(prop.character.clip.startsWith('alan_'));
    assert.ok(!prop.pressure && !prop.emissive && !prop.noShadow && !prop.fallbackMesh);
    assert.equal(prop.solid, false);
  }
});
