import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTER_LIMITS, parseCharacterAsset } from '../src/render/character-asset.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import { outskirtsArrivalLayout } from '../src/data/source-outskirts-arrival.js';
import { TOWER_PERSONAL_STAGE_IDS } from '../src/data/tower-personal-journey.js';
import { towerPersonalWorldPieces, towerPersonalHandoverPieces } from '../src/render/tower-personal-worlds.js';
import { boothGuardRenderInstance } from '../src/game/booth-presentation.js';
import { pressureInstances } from '../src/render/pressure-volume.js';
import * as P from '../src/render/props3d.js';

const bytes = readFileSync(new URL('../public/assets/bus-woman-character.glb', import.meta.url));
const names = ['bus_woman_bag', 'bus_woman_ticket', 'exterior_bus_woman', 'outskirts_bus_woman'];

test('character upgrades retain their established scene boundaries', () => {
  const figures = pieces => pieces.filter(piece => /^recordist_(boy|contractor)$/.test(piece.mesh)).map(piece => [piece.id, piece.mesh]);
  const expected = {
    'school-hall': [['land-boy', 'recordist_boy']],
    'tape-field': [], 'dead-broadcast': [],
    'ash-room': [['land-ash-contractor', 'recordist_contractor']],
    'return-hall': [], // Its two existing actors belong to the saved handover.
  };
  for (const stage of TOWER_PERSONAL_STAGE_IDS) assert.deepEqual(figures(towerPersonalWorldPieces(stage)), expected[stage], `${stage}: a model upgrade introduced a new recordist appearance`);
  assert.deepEqual(figures(towerPersonalHandoverPieces(.5)), [['land-boy', 'recordist_boy'], ['land-handover-contractor', 'recordist_contractor']]);
  const boothIds = ['yard-booth-guard-idle', 'yard-booth-guard-ledger', 'yard-booth-guard-handoff'];
  const mapped = CONSERVATORY_PROPS.map(piece => boothGuardRenderInstance({ ...piece, z: piece.y, y: 0 }));
  assert.deepEqual(mapped.filter(piece => piece.mesh === 'overworld_booth_guard').map(piece => piece.id), boothIds, 'the upright guard was placed beyond the existing opening-booth states');
  const unrelated = { id: 'ordinary-prop', mesh: 'chair', x: 0, y: 0, z: 0 };
  assert.equal(boothGuardRenderInstance(unrelated), unrelated, 'the booth replacement is no longer restricted to its existing IDs');
  assert.deepEqual(outskirtsArrivalLayout().filter(piece => piece.mesh === 'outskirts_fold_guard').map(piece => piece.id),
    ['r2-booth-guard', 'r6-booth-guard'], 'the guard acquired an additional road appearance');
  assert.deepEqual(pressureInstances(null, null), [], 'the HUSH geometry adapter invented a manifestation without simulation-owned presence');
});

test('the canonical bus woman overrides both existing aliases with the same body and garment', () => {
  const asset = parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.deepEqual(asset.entries.map(entry => entry.name).sort(), names);
  const ordinary = asset.entries.find(entry => entry.name === 'exterior_bus_woman');
  const road = asset.entries.find(entry => entry.name === 'outskirts_bus_woman');
  assert.deepEqual(ordinary.primitives, road.primitives, 'the ordinary and repeated woman have different visible geometry or materials');
  assert.equal(ordinary.skin.joints.length, 54, 'the articulated production hands lost their complete rig');
  assert.deepEqual(ordinary.skin, road.skin, 'the aliases no longer share their anatomical rig');
  assert.ok(CHARACTER_LIMITS.joints * 4 + 24 <= 256, 'the character shader exceeds the minimum WebGL2 vertex uniform budget');
  for (const entry of asset.entries) assert.ok(entry.primitives.every(primitive => primitive.material >= 0), 'an accessory has an invalid material');
});

test('the production woman and accessories use independent, frozen palettes in material, depth and wet reflection', async () => {
  let serial = 1, activeProgram, integerJoints = 0;
  const constants = new Map(), uniforms = new Map(), draws = [];
  const limits = { MAX_VERTEX_UNIFORM_VECTORS: 256, MAX_TEXTURE_SIZE: 2048 };
  const gl = new Proxy({}, { get(_target, name) {
    if (name === 'getParameter') return token => limits[[...constants].find(([, value]) => value === token)?.[0]] || 0;
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
    globalThis.createImageBitmap = async () => ({ width: 512, height: 512, close() {} });
    P.props3dInit(gl); P.props3dResize(160, 90, { shadowMapSize: 512 });
    assert.deepEqual((await P.addCharacterPack('/bus-woman-character.glb')).meshes.sort(), names);
    assert.ok(integerJoints >= 4, 'the shared character loader did not bind every body/accessory');
    const asset = parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const waiting = [...asset.clips.keys()].find(name => /wait/.test(name));
    const searching = [...asset.clips.keys()].find(name => /search/.test(name));
    assert.ok(waiting && searching, 'the production waiting and pocket search clips are unavailable');
    const submitted = [
      { id: 'existing-yard-woman', mesh: 'exterior_bus_woman', x: -.35, y: 0, z: -3, character: { clip: waiting, time: 0 } },
      { id: 'existing-road-woman', mesh: 'outskirts_bus_woman', x: .35, y: 0, z: -3, character: { clip: searching, time: asset.clips.get(searching).duration * .4 } },
      { id: 'existing-woman-bag', mesh: 'bus_woman_bag', x: .08, y: .75, z: -3.1, character: {} },
      { id: 'existing-returned-ticket', mesh: 'bus_woman_ticket', x: .6, y: 1.05, z: -3.1, character: {} },
    ];
    P.setPropInstances([]); P.setDynamicPropInstances(submitted); P.prepareCharacterFrame(40);
    const prepared = P.characterStats().poses;
    assert.equal(prepared.length, 4);
    submitted[1].character.time = 0;
    const args = { camX: 0, camY: 1.2, camZ: 0, yaw: 0, light: 1, timeSec: 40,
      zoneTints: new Float32Array(21 * 3).fill(1), shadowPrepared: true };
    P.preparePropShadowPass(args); const shadow = draws.splice(0);
    P.renderPropPass({ ...args, reflection: true }); const reflected = draws.splice(0);
    P.renderPropPass(args); const material = draws.splice(0);
    assert.ok(material.length >= 4 && shadow.length >= 4 && reflected.length >= 4, 'a physical pass lost the woman or an accessory');
    const palettes = list => [...new Set(list.map(draw => JSON.stringify(draw.bones)))].sort();
    assert.ok(palettes(material).length >= 2, 'the two body performances collapsed to one palette');
    assert.deepEqual(palettes(shadow), palettes(material), 'torch shadows do not use the frozen visible pose');
    assert.deepEqual(palettes(reflected), palettes(material), 'the wet-road reflection resampled the woman');
    assert.ok([...shadow, ...reflected, ...material].every(draw => draw.enabled === 1 && draw.instances === 1), 'different poses were grouped into one mesh-only batch');
    assert.deepEqual(P.characterStats().poses, prepared, 'drawing advanced or changed the captured character frame');
    assert.deepEqual(P.characterStats().poseErrors, []);
  } finally {
    P.props3dInit(gl); globalThis.fetch = oldFetch;
    if (oldBitmap) globalThis.createImageBitmap = oldBitmap; else delete globalThis.createImageBitmap;
  }
});
