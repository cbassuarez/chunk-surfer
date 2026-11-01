import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';
import { hushDensityCharacter } from '../src/game/hush-density-performance.js';
import {
  createSourceDesktopPressureSampler, finishSourceDesktopPressure,
  sourceDesktopDensityPerformance, sourceDesktopRenderFrame,
  SOURCE_DESKTOP_PRESSURE_ASSET,
} from '../src/render/source-desktop-view.js';

const state = overrides => ({ token: 'density-battle', phase: 'desktop', clock: 4,
  cover: { count: 3, capacity: 3 }, intent: { kind: 'broadcast', progress: .4 }, ...overrides });

test('desktop battle motion derives only from its owner clock and preserves the entry reference', () => {
  const captured = { density: { version: 1, phase: 2.3, retained: .7, attention: .2, seed: 73 } };
  const before = structuredClone(captured);
  const a = sourceDesktopDensityPerformance(state({}), captured);
  const b = sourceDesktopDensityPerformance(state({ clock: 5 }), captured);
  assert.ok(Math.abs(a.phase - 3.5) < 1e-10);
  assert.ok(Math.abs(b.phase - a.phase - .3) < 1e-10);
  assert.deepEqual(captured, before, 'the combat presentation must not mutate the saved Source performer');
  const held = sourceDesktopDensityPerformance(state({ reducedMotion: true }), captured);
  assert.equal(held.phase, 2.3); assert.equal(held.traction, 0);
  assert.equal(held.eventTime, 0);
});

test('every combat intent has a bounded material response and keeps the pressure core visible', () => {
  const poses = [];
  for (const kind of ['broadcast', 'conceal', 'overload', 'loop', 'silence']) {
    const frame = sourceDesktopRenderFrame(state({ intent: { kind, progress: .72 } }));
    assert.equal(frame.body.mesh, 'hush_density_core');
    assert.equal(frame.surface?.mesh, 'hush_density_return');
    assert.equal(frame.body.densitySurface, true);
    assert.equal(frame.body.character.support, undefined, 'density cannot acquire a human leg solver');
    assert.ok(Object.keys(frame.body.character.joints).every(name => name.startsWith('fold_')));
    poses.push(JSON.stringify(frame.body.character));
  }
  assert.equal(new Set(poses).size, 5, 'incoming kinds cannot all look like the same idle pose');
});

test('an offered-hand entry trace and narrow world clearance do not leak into the framed battle performer', () => {
  const frame = sourceDesktopRenderFrame(state({ pressurePresentation: { primary: {
    id: 'source-court', x: 15, y: 7, heightM: 1.83, clearanceM: .24, referenceTrace: true,
    performance: { role: 'court-trace', heading: .4, clip: 'pressure_arrest', time: 1, manifestation: 1 },
  } } }));
  assert.equal(frame.body.mesh, 'hush_density_core');
  assert.equal(frame.body.scaleX, 1, 'the combat stage has its own physical clearance');
  assert.equal(frame.echo, null, 'the remembered human belongs to the offered-hand scene');
});

test('the density desktop finish uses fitted return geometry rather than white expanded hulls', () => {
  const root = new THREE.Group(), original = new THREE.MeshStandardMaterial({ color: '#292929', roughness: .87 });
  for (const name of ['hush_density_core', 'hush_density_return', 'hush_density_volume']) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.2, .3, .2), original);
    mesh.name = name; root.add(mesh);
  }
  const finish = finishSourceDesktopPressure(THREE, root);
  assert.equal(finish.glows.length, 0);
  assert.equal(root.children.length, 3, 'production cannot silently add six outline meshes per physical layer');
  assert.deepEqual(root.getObjectByName('hush_density_core').material.color.toArray(), [0, 0, 0]);
  assert.equal(finish.returns[0].material, original, 'the production surface material remains inspectable');
  assert.equal(finish.volumes[0].visible, false, 'the complete glow volume is diagnostic-only');
});

test('repeated exact samples do not accumulate unanimated fold translations or rotations', () => {
  const root = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'fold_A_3'; root.add(bone);
  bone.position.set(.1, .7, -.2);
  const clip = new THREE.AnimationClip('held', 1, []);
  const sampler = createSourceDesktopPressureSampler(THREE, root, [clip]);
  const pose = { clip: 'held', time: .5, loop: false,
    joints: { fold_A_3: { translation: [.03, -.02, .04], rotation: [0, Math.sin(.12), 0, Math.cos(.12)] } } };
  sampler.sample(pose);
  const first = bone.matrixWorld.toArray();
  for (let i = 0; i < 20; i++) sampler.sample(pose);
  assert.deepEqual(bone.matrixWorld.toArray(), first);
  sampler.sample({ clip: 'held', time: .5 });
  assert.deepEqual(bone.position.toArray(), [.1, .7, -.2]);
  assert.deepEqual(bone.quaternion.toArray(), [0, 0, 0, 1]);
  sampler.dispose();
});

test('production Three skins sample the same blended density descriptor as the world pass', async () => {
  assert.equal(SOURCE_DESKTOP_PRESSURE_ASSET, 'assets/hush-density.glb');
  const bytes = await readFile(new URL(`../public/${SOURCE_DESKTOP_PRESSURE_ASSET}`, import.meta.url));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const asset = parseCharacterAsset(buffer);
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  const sampler = createSourceDesktopPressureSampler(THREE, gltf.scene, gltf.animations);
  const core = gltf.scene.getObjectByName('hush_density_core');
  assert.ok(core?.isSkinnedMesh);
  assert.equal(core.skeleton.bones.length, 19);
  for (const density of [
    { version: 1, phase: .27, traction: .83, compression: .91, attention: -.3, event: 'notice', eventTime: 2.3, seed: 11 },
    { version: 1, phase: 2.13, traction: .26, compression: .62, attention: .4, event: 'settle', eventTime: 4.1, seed: 11 },
  ]) {
    const descriptor = hushDensityCharacter({ density });
    const entry = asset.entries.find(entry => entry.name === 'hush_density_core');
    assert.ok(entry);
    const expected = sampleCharacterPose(asset, entry, descriptor);
    sampler.sample(descriptor); core.skeleton.update();
    const actual = core.skeleton.boneMatrices;
    assert.equal(actual.length, 19 * 16);
    const errors = actual.map((v, index) => Math.abs(v - expected.bones[index]));
    assert.ok(Math.max(...errors) < 3e-5, `world/desktop bone matrix error ${Math.max(...errors)}`);
    const first = [...actual];
    sampler.sample(descriptor); core.skeleton.update();
    assert.deepEqual([...core.skeleton.boneMatrices], first, 're-rendering a paused frame must be exact');
  }
  sampler.dispose();
});
