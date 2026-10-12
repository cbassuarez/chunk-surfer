import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBellsGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { normalizeTowerPersonalJourney } from '../src/game/tower-personal-journey.js';
import { TOWER_PERSONAL_STAGE_IDS } from '../src/data/tower-personal-journey.js';
import * as P from '../src/render/props3d.js';

function fixture(stage, progress = 0, time = 23.25) {
  const built = buildBellsGodPreset(440, { seed: 4417 });
  const personal = normalizeTowerPersonalJourney({ version: 2, active: true, stage, time,
    returnPose: { ...built.position, yaw: 0, pitch: 0 },
    visited: Object.fromEntries(TOWER_PERSONAL_STAGE_IDS.map(id => [id, true])),
    recordingHeard: true, handoverSeconds: progress * 4, collapseSeconds: 0,
    pose: stage === 'ash-room' ? { x: 6.2, z: -48.5 } : { x: 0, z: 6.6 },
  });
  const state = { ...built.state, station: { ...built.state.station, personal } };
  const runtime = createSourceSpaceRuntime({ initialState: state });
  runtime.setPlayerPosition(runtime.towerLandFrame().pose);
  const instances = (time = 0, reducedMotion = false) => runtime.propInstances(undefined, undefined, { time, reducedMotion });
  return { runtime, instances };
}

const actors = instances => instances.filter(p => /^recordist_(boy|contractor)$/.test(p.mesh));
const characterState = instances => actors(instances).map(p => ({ id: p.id, mesh: p.mesh,
  matrix: Array.from(p.matrix), character: structuredClone(p.character) }));

test('school and workroom use distinct ordinary physical characters with persisted, pause-safe performances', () => {
  for (const [stage, mesh, clip] of [['school-hall', 'recordist_boy', 'boy_wait'], ['ash-room', 'recordist_contractor', 'contractor_work']]) {
    const h = fixture(stage), before = characterState(h.instances(5));
    assert.equal(before.length, 1, `${stage} has one physical actor`);
    assert.equal(before[0].mesh, mesh); assert.equal(before[0].character.clip, clip);
    assert.ok(actors(h.instances()).every(p => !p.pressure && !p.reflectionOnly && !p.noShadow), 'human characters left the ordinary material/shadow path');
    assert.deepEqual(characterState(h.instances(5e5)), before, 'wall-clock rendering advanced a saved performance');
    h.runtime.tickTowerLand(.25, { paused: true });
    assert.deepEqual(characterState(h.instances(8e5)), before, 'pause advanced the character');
    h.runtime.tickTowerLand(.25);
    assert.notEqual(characterState(h.instances())[0].character.time, before[0].character.time, 'the saved performance clock never advances');
    const restored = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(h.runtime.state())) });
    restored.setPlayerPosition(restored.towerLandFrame().pose);
    assert.deepEqual(characterState(restored.propInstances()), characterState(h.instances()), 'reload lost the actor pose');
  }
});

test('both transfer actors follow one four-second saved timeline and one recorder at every quarter', () => {
  const school = actors(fixture('school-hall').instances()).find(p => p.mesh === 'recordist_boy');
  for (const progress of [0, .25, .5, .75, 1]) {
    const h = fixture('return-hall', progress), pieces = h.instances(1000), bodies = actors(pieces);
    assert.equal(bodies.length, 2, `transfer ${progress}: body count`);
    assert.deepEqual(bodies.map(p => p.mesh).sort(), ['recordist_boy', 'recordist_contractor']);
    for (const p of bodies) {
      assert.equal(p.character.clip, p.mesh === 'recordist_boy' ? 'boy_transfer' : 'contractor_transfer');
      assert.ok(Math.abs(p.character.time - progress * 4) < 1e-6, `${p.id} drifts from the shared saved clock`);
      assert.equal(p.character.loop, false, 'a completed handover restarts');
    }
    const boy = bodies.find(p => p.mesh === 'recordist_boy');
    assert.deepEqual(Array.from(boy.matrix), Array.from(school.matrix), 'the returning boy/chair changes its established origin');
    assert.equal(pieces.filter(p => p.id === 'land-handover-machine').length, 1, 'recorder duplicated or omitted during transfer');
    assert.ok(!pieces.some(p => /^tower_personal_(upper_arm|forearm|hand_support|hand_open)$/.test(p.mesh)), 'primitive substitute limbs still overlap the real bodies');
    const before = characterState(pieces);
    h.runtime.tickTowerLand(.25, { paused: true });
    assert.deepEqual(characterState(h.instances(1e6)), before, 'paused handover changed either actor');
    const reduced = actors(h.instances(0, true));
    assert.equal(reduced.length, 2, 'reduced motion removes an essential transfer actor');
    assert.ok(reduced.every(p => Number.isFinite(p.character.time)), 'reduced-motion pose is invalid');
  }
});

test('the production GLB submits independent frozen body palettes to material, torch shadow and reflection passes', async () => {
  const bytes = readFileSync(new URL('../public/assets/recordist-characters.glb', import.meta.url));
  let serial = 1, activeProgram, integerJoints = 0;
  const constants = new Map(), uniforms = new Map(), draws = [];
  const limits = { MAX_VERTEX_UNIFORM_VECTORS: 256, MAX_TEXTURE_SIZE: 4096 };
  const gl = new Proxy({}, { get(_target, name) {
    if (name === 'getParameter') return token => limits[[...constants].find(([, v]) => v === token)?.[0]] || 0;
    if (name === 'getExtension') return () => null;
    if (name === 'getShaderParameter' || name === 'getProgramParameter' || name === 'isProgram') return () => true;
    if (name === 'checkFramebufferStatus') return () => gl.FRAMEBUFFER_COMPLETE;
    if (name === 'getUniformLocation') return (program, key) => `${program.id}:${key}`;
    if (name === 'useProgram') return program => { activeProgram = program; };
    if (name === 'vertexAttribIPointer') return location => { if (location === 13) integerJoints++; };
    if (name === 'drawElementsInstanced') return (_mode, count, _type, _offset, instances) => {
      const get = key => uniforms.get(`${activeProgram.id}:${key}`);
      draws.push({ program: activeProgram.id, count, instances, enabled: get('uCharacterEnabled'), bones: get('uCharacterBones[0]') });
    };
    if (String(name).startsWith('uniform')) return (location, ...values) => {
      uniforms.set(location, ArrayBuffer.isView(values.at(-1)) ? Array.from(values.at(-1)) : values.at(-1));
    };
    if (String(name).startsWith('create')) return () => ({ id: serial++ });
    if (/^[A-Z0-9_]+$/.test(name)) { if (!constants.has(name)) constants.set(name, serial++); return constants.get(name); }
    return () => {};
  } });
  const oldFetch = globalThis.fetch, oldBitmap = globalThis.createImageBitmap;
  try {
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    // Decoding/rasterization is covered by the browser harness. This test owns
    // the actual GLB parser, GPU upload contract and production palette passes.
    globalThis.createImageBitmap = async () => ({ width: 512, height: 512, close() {} });
    P.props3dInit(gl); P.props3dResize(160, 90, { shadowMapSize: 512 });
    const loaded = await P.addCharacterPack('/recordist-characters.glb');
    assert.deepEqual(loaded.meshes.sort(), ['recordist_boy', 'recordist_contractor']);
    assert.ok(integerJoints >= 2, 'joint indices were not bound as integers');
    const submitted = actors(fixture('return-hall', .5).instances()).map((p, i) => ({
      ...p, character: { ...p.character }, matrix: undefined, x: i * .8 - .4, y: 0, z: -3,
    }));
    P.setPropInstances([]); P.setDynamicPropInstances(submitted); P.prepareCharacterFrame(40);
    const prepared = P.characterStats().poses;
    assert.deepEqual(prepared.map(p => p.clip).sort(), ['boy_transfer', 'contractor_transfer']);
    submitted.forEach(p => { p.character.time = 0; });
    const args = { camX: 0, camY: 1.2, camZ: 0, yaw: 0, light: 1, timeSec: 40,
      zoneTints: new Float32Array(21 * 3).fill(1), shadowPrepared: true };
    P.preparePropShadowPass(args);
    const shadow = draws.splice(0);
    P.renderPropPass({ ...args, reflection: true }); const reflected = draws.splice(0);
    P.renderPropPass(args); const material = draws.splice(0);
    assert.ok(material.length >= 2 && shadow.length >= 2 && reflected.length >= 2, 'a physical pass lost a body');
    const palettes = list => [...new Set(list.map(d => JSON.stringify(d.bones)))].sort();
    assert.equal(palettes(material).length, 2, 'distinct actors shared one skin palette');
    assert.deepEqual(palettes(shadow), palettes(material), 'torch shadows use different body poses');
    assert.deepEqual(palettes(reflected), palettes(material), 'reflection resampled the handover');
    assert.ok([...shadow, ...reflected, ...material].every(d => d.enabled === 1 && d.instances === 1), 'character palettes were mesh-only batched');
    assert.deepEqual(P.characterStats().poses, prepared, 'drawing advanced the prepared character frame');
    assert.deepEqual(P.characterStats().poseErrors, []);
  } finally {
    P.props3dInit(gl); globalThis.fetch = oldFetch;
    if (oldBitmap) globalThis.createImageBitmap = oldBitmap; else delete globalThis.createImageBitmap;
  }
});
