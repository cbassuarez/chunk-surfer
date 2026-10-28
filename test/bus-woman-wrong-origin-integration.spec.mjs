import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { outskirtsArrivalLayout } from '../src/data/source-outskirts-arrival.js';
import { OUTSKIRTS_BUS_PASSAGE } from '../src/data/outskirts-bus-passage.js';
import { BUS_WOMAN_WRONG_ORIGIN_RETURNS, BUS_WOMAN_WRONG_ORIGIN_MESHES } from '../src/data/bus-woman-wrong-origin.js';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';
import { busWomanWrongOriginDescriptor } from '../src/render/bus-woman-wrong-origin-performance.js';
import { BUS_WOMAN_CLIPS, busWomanPose } from '../src/render/bus-woman-performance.js';
import { BUS_WOMAN_RIG } from '../src/data/bus-woman-rig.js';
import { packShadowFrames, unpackShadowFrames } from '../src/causal/tape.js';
import * as P from '../src/render/props3d.js';

const canonical = readFileSync(new URL('../public/assets/bus-woman-character.glb', import.meta.url));
const altered = readFileSync(new URL('../public/assets/outskirts-bus-woman-wrong-origin.glb', import.meta.url));
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const runtime = () => {
  const built = buildPreTapeGodPreset(0, { seed: 4417, marbleEyes: 'returned' });
  const result = createSourceSpaceRuntime({ initialState: built.state });
  result.setPlayerPosition(built.position); return result;
};
const frameAt = (rt, piece, reducedMotion = false) => {
  rt.setPlayerPosition({ x: (piece.x - Math.sin(piece.yaw)) / CELL - .5,
    y: (piece.z - Math.cos(piece.yaw)) / CELL - .5 });
  return rt.propInstances(undefined, undefined, { reducedMotion });
};

test('the thirteen physical road appearances select their own authored origin independent of ticket and backtracking', () => {
  const rt = runtime();
  const expectedStages=[0,0,1,1,2,2,2,3,3,3,4,4,5];
  const pieces = outskirtsArrivalLayout().filter(piece => /^bus-woman/.test(piece.key));
  assert.equal(pieces.length, 13);
  for (const returned of [false, true]) {
    rt.setOutskirtsWorldState({ ticketReturned: returned });
    for (const data of [...pieces, ...pieces.toReversed()]) {
      const piece = rt.outskirtsPiece(data.id);
      const scene = frameAt(rt, piece);
      const body = scene.find(instance => instance.id === piece.id);
      assert.equal(body.mesh, BUS_WOMAN_WRONG_ORIGIN_RETURNS[data.stretch].mesh, piece.id);
      const stage=expectedStages[data.stretch];
      assert.equal(body.mesh,stage?`outskirts_bus_woman_wrong_origin_${stage}`:'outskirts_bus_woman',`${piece.id}: authored escalation order`);
      const parts = scene.filter(instance => instance.id === piece.id || instance.id.startsWith(`${piece.id}:`));
      assert.equal(parts.filter(instance => instance.mesh === 'bus_woman_ticket').length, Number(returned), `${piece.id}: single paper ownership`);
      assert.ok(parts.every(instance => instance.character === body.character), `${piece.id}: an attachment resampled the force route`);
      assert.ok(parts.every(instance => instance.matrix === body.matrix), `${piece.id}: an attachment left its body origin`);
      if (data.stretch >= 2) assert.equal(body.fallbackMesh, 'outskirts_bus_woman');
      const held = frameAt(rt, piece, true).find(instance => instance.id === piece.id);
      assert.equal(held.mesh, body.mesh, `${piece.id}: reduced motion restored healthy anatomy`);
    }
  }
});

test('late-stage physical receipt saves its useful hand, single paper and corrected anatomy without restarting', () => {
  const rt = runtime(), piece = rt.outskirtsPiece('r12-bus-woman');
  frameAt(rt, piece);
  rt.setOutskirtsWorldState({ ticketAsked: true, ticketFound: true, ticketReturned: false });
  assert.equal(rt.outskirtsPerformAction({ action: 'ticket', pass: 12 }).handled, true);
  rt.setOutskirtsWorldState({ ticketReturned: true });
  for (let n = 0; n < 24; n++) rt.tickOutskirtsCharacters(.05);
  const parts = frameAt(rt, piece).filter(instance => /^r12-bus-woman(?:$|:)/.test(instance.id));
  assert.equal(parts[0].mesh, 'outskirts_bus_woman_wrong_origin_5');
  assert.equal(parts.filter(instance => instance.mesh === 'bus_woman_ticket').length, 1);
  const restored = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(rt.state())) });
  restored.setOutskirtsWorldState({ ticketReturned: true });
  const loaded = frameAt(restored, piece).filter(instance => /^r12-bus-woman(?:$|:)/.test(instance.id));
  assert.deepEqual(loaded, parts, 'reload replayed the error or lost the paper contact');
  for (let n = 0; n < 240; n++) restored.tickOutskirtsCharacters(.05);
  const held = frameAt(restored, piece).filter(instance => /^r12-bus-woman(?:$|:)/.test(instance.id));
  assert.equal(held[0].mesh, 'outskirts_bus_woman_wrong_origin_5');
  assert.equal(held[0].character.clip, 'bus_woman_ticket_wait');
  assert.equal(held.filter(instance => instance.mesh === 'bus_woman_ticket').length, 1);
});

test('an altered final return survives actual tape packing and recorded presentation despite different live flags', () => {
  const rt = runtime(), piece = rt.outskirtsPiece('r12-bus-woman');
  frameAt(rt, piece); rt.setOutskirtsWorldState({ ticketReturned: true }); rt.tickOutskirtsCharacters(.1);
  const recorded = rt.outskirtsCharacterFrame();
  const packed = packShadowFrames([
    { t: 0, x: 0, y: 0, spaceId: 'source-space', outskirtsCharacters: recorded },
    { t: 1000, x: 0, y: 0, spaceId: 'source-space', outskirtsCharacters: { ...recorded, clock: recorded.clock + 1 } },
  ]);
  const frames = unpackShadowFrames(packed);
  assert.equal(frames.length, 2);
  rt.setOutskirtsWorldState({ ticketReturned: false });
  assert.equal(rt.applyOutskirtsCharacterFrame(frames[1].outskirtsCharacters), true);
  rt.setOutskirtsWorldState({ ticketReturned: false });
  const scene = frameAt(rt, piece), body = scene.find(instance => instance.id === piece.id);
  assert.equal(body.mesh, 'outskirts_bus_woman_wrong_origin_5');
  assert.equal(body.character.clip, 'bus_woman_ticket_wait');
  assert.equal(scene.filter(instance => instance.id === `${piece.id}:return-half`).length, 1);
  assert.deepEqual(rt.outskirtsCharacterFrame().woman, recorded.woman);
  // A suspended recorded frame does not become an observer-driven sound cue.
  rt.tickOutskirtsCharacters(.2, { suspended: true });
  assert.equal(rt.outskirtsStreetFrame().events.filter(event => event.cue === 'woman-traction').length, 0);
});

test('a close visible traction cue is saved once while distant, paused and unseen samples stay silent', () => {
  const listen = ({ distance = 1, away = false, suspended = false } = {}) => {
    const rt = runtime(), piece = rt.outskirtsPiece('r2-bus-woman');
    const position = { x: (piece.x + distance) / CELL - .5, y: piece.z / CELL - .5 };
    rt.setPlayerPosition(position);
    if (distance === 1) assert.equal(rt.geometry.canStep(position.x, position.y, position.x, position.y).ok, true,
      'the close listener stands on the visible east side of the shelter');
    const viewYaw = -Math.PI / 2 + (away ? Math.PI : 0);
    for (let n = 0; n < 16; n++) rt.tickOutskirtsCharacters(.05, { viewYaw, suspended });
    const events = rt.outskirtsStreetFrame({ viewYaw }).events.filter(event => event.cue === 'woman-traction');
    return { rt, piece, viewYaw, events };
  };
  const close = listen();
  assert.equal(close.events.length, 1, 'the felt contraction has no finite audible material event');
  assert.ok(close.rt.state().outskirtsExperience.actions.some(id => id.startsWith('woman-traction:r2-bus-woman:')));
  const restored = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(close.rt.state())) });
  frameAt(restored, close.piece);
  for (let n = 0; n < 8; n++) restored.tickOutskirtsCharacters(.05, { viewYaw: close.viewYaw });
  assert.equal(restored.outskirtsStreetFrame({ viewYaw: close.viewYaw }).events.filter(event => event.cue === 'woman-traction').length, 0, 'reload replayed the traction sound');
  assert.equal(listen({ distance: 4 }).events.length, 0);
  assert.equal(listen({ away: true }).events.length, 0);
  assert.equal(listen({ suspended: true }).events.length, 0);
});

test('P8 receipt stays supported in the rear bay after the player exits and completes real ticket retrieval', () => {
  const rt = runtime(), piece = rt.outskirtsPiece('r7-bus-woman'), bus = rt.outskirtsPiece('r7-bus');
  const stand = (x, z) => {
    const eye = { x: bus.x + x * Math.cos(bus.yaw) + z * Math.sin(bus.yaw),
      z: bus.z - x * Math.sin(bus.yaw) + z * Math.cos(bus.yaw) };
    rt.setPlayerPosition({ x: eye.x / CELL - .5, y: eye.z / CELL - .5 });
    return Math.atan2(piece.x - eye.x, -(piece.z - eye.z));
  };
  let viewYaw = stand(.5, 2.8);
  rt.outskirtsStreetFrame({ viewYaw });
  rt.setOutskirtsWorldState({ ticketAsked: true, ticketFound: true, ticketReturned: false });
  assert.equal(rt.outskirtsPerformAction({ action: 'ticket', pass: 7 }).handled, true);
  rt.setOutskirtsWorldState({ ticketReturned: true });
  for (let n = 0; n < 4; n++) rt.tickOutskirtsCharacters(.05, { viewYaw });
  viewYaw = stand(...OUTSKIRTS_BUS_PASSAGE.exit.outside); rt.outskirtsStreetFrame({ viewYaw });
  const started = rt.outskirtsCharacterFrame().woman.receivedAt;
  assert.equal(rt.outskirtsCharacterFrame().woman.stepAt, null, 'the rear exit starts the obsolete exterior root step');
  assert.equal(started, 0);
  const asset = parseCharacterAsset(buffer(altered)), entry = asset.entries.find(entry => entry.name === 'outskirts_bus_woman_wrong_origin_3');
  const scene = () => rt.propInstances(undefined, undefined, { viewYaw });
  for (const elapsed of [0, .2, .4, .6, .8]) {
    while (rt.outskirtsCharacterFrame().clock < started + elapsed - 1e-7) rt.tickOutskirtsCharacters(.05, { viewYaw });
    const body = scene().find(instance => instance.id === piece.id);
    assert.equal(body.character.clip, 'bus_woman_receive', 'leaving the rear door discarded her receive action');
    assert.ok(Math.abs(body.matrix[12] - piece.x) < .0001 && Math.abs(body.matrix[14] - piece.z) < .0001, 'receipt moves the planted rear-bay root');
    const sampled = sampleCharacterPose(asset, entry, body.character), supported = busWomanPose('wait', 0);
    for (const side of ['L', 'R']) {
      const name = 'foot_' + side, rest = BUS_WOMAN_RIG.find(bone => bone.name === name);
      const joint = entry.skin.joints.findIndex(index => asset.nodes[index].name === 'bus_woman_' + name), m = sampled.bones.subarray(joint * 16, joint * 16 + 16);
      const actual = rest.head.map((_value, axis) => m[axis] * rest.head[0] + m[4 + axis] * rest.head[1] + m[8 + axis] * rest.head[2] + m[12 + axis]);
      assert.ok(Math.hypot(...actual.map((value, axis) => value - supported.joints[name].translation[axis])) < .0015, `${name}: the simultaneous receipt slides a support foot`);
    }
  }
  while (rt.outskirtsCharacterFrame().clock < 9.65 - 1e-7) rt.tickOutskirtsCharacters(.05, { viewYaw });
  assert.equal(scene().find(instance => instance.id === piece.id).character.clip, 'bus_woman_ready', 'persistent acknowledgment suppressed the actual retrieval');
  assert.equal(scene().filter(instance => instance.id === `${piece.id}:return-half`).length, 0, 'stored paper appeared before clearing the actual pocket');
  while (rt.outskirtsCharacterFrame().clock < 9.95 - 1e-7) rt.tickOutskirtsCharacters(.05, { viewYaw });
  assert.equal(scene().filter(instance => instance.id === `${piece.id}:return-half`).length, 1);
  while (rt.outskirtsCharacterFrame().clock < 11.1 - 1e-7) rt.tickOutskirtsCharacters(.05, { viewYaw });
  assert.equal(scene().find(instance => instance.id === piece.id).character.clip, 'bus_woman_ticket_wait');
  assert.equal(scene().filter(instance => instance.id === `${piece.id}:return-half`).length, 1);
});

test('the posed stage-three body, cloth and attachments fit the shared rear-bay envelope', () => {
  const bodyAsset = parseCharacterAsset(buffer(altered)), accessoryAsset = parseCharacterAsset(buffer(canonical));
  const entries = [[bodyAsset, bodyAsset.entries.find(entry => entry.name === 'outskirts_bus_woman_wrong_origin_3')],
    ...['bus_woman_bag', 'bus_woman_ticket'].map(name => [accessoryAsset, accessoryAsset.entries.find(entry => entry.name === name)])];
  const woman = OUTSKIRTS_BUS_PASSAGE.woman, c = Math.cos(woman.yaw), s = Math.sin(woman.yaw);
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const [mode, duration] of Object.entries(BUS_WOMAN_CLIPS)) for (const fraction of [0, .25, .5, .75, 1]) {
    const descriptor = busWomanWrongOriginDescriptor(mode, duration * fraction, { stretch: 7 });
    for (const [asset, entry] of entries) {
      const pose = sampleCharacterPose(asset, entry, descriptor);
      for (const primitive of entry.primitives) for (let vertex = 0; vertex < primitive.vertexCount; vertex++) {
        const position = Array.from(primitive.positions.subarray(vertex * 3, vertex * 3 + 3));
        for (let morph = 0; morph < primitive.targets.length; morph++) for (let axis = 0; axis < 3; axis++) position[axis] += primitive.targets[morph].positions[vertex * 3 + axis] * pose.morphs[morph];
        let x = 0, z = 0;
        for (let influence = 0; influence < 4; influence++) {
          const at = vertex * 4 + influence, joint = primitive.joints[at] * 16, weight = primitive.weights[at];
          x += weight * (pose.bones[joint] * position[0] + pose.bones[joint + 4] * position[1] + pose.bones[joint + 8] * position[2] + pose.bones[joint + 12]);
          z += weight * (pose.bones[joint + 2] * position[0] + pose.bones[joint + 6] * position[1] + pose.bones[joint + 10] * position[2] + pose.bones[joint + 14]);
        }
        // The rear-bay actor has an authored yaw relative to the bus; envelope
        // offsets are already in bus-local axes and must include that turn.
        const localX = x * c + z * s, localZ = -x * s + z * c;
        bounds.minX = Math.min(bounds.minX, localX); bounds.maxX = Math.max(bounds.maxX, localX);
        bounds.minZ = Math.min(bounds.minZ, localZ); bounds.maxZ = Math.max(bounds.maxZ, localZ);
      }
    }
  }
  assert.ok(bounds.minX >= woman.envelope.minX && bounds.maxX <= woman.envelope.maxX,
    `posed body/attachments escape the rear-bay X envelope: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.minZ >= woman.envelope.minZ && bounds.maxZ <= woman.envelope.maxZ,
    `posed body/attachments escape the rear-bay Z envelope: ${JSON.stringify(bounds)}`);
});

function rendererStub() {
  let serial = 1, program;
  const constants = new Map(), uniforms = new Map(), draws = [];
  const limits = { MAX_VERTEX_UNIFORM_VECTORS: 256, MAX_TEXTURE_SIZE: 4096 };
  const gl = new Proxy({}, { get(_target, name) {
    if (name === 'getParameter') return token => limits[[...constants].find(([, value]) => value === token)?.[0]] || 0;
    if (name === 'getExtension') return () => null;
    if (['getShaderParameter', 'getProgramParameter', 'isProgram'].includes(name)) return () => true;
    if (name === 'checkFramebufferStatus') return () => gl.FRAMEBUFFER_COMPLETE;
    if (name === 'getUniformLocation') return (p, key) => `${p.id}:${key}`;
    if (name === 'useProgram') return p => { program = p; };
    if (name === 'drawElementsInstanced') return (_mode, count, _type, _offset, instances) => {
      const get = key => uniforms.get(`${program.id}:${key}`);
      draws.push({ count, instances, enabled: get('uCharacterEnabled'), bones: get('uCharacterBones[0]'), morphs: get('uCharacterMorphWeights') });
    };
    if (String(name).startsWith('uniform')) return (location, ...values) => {
      uniforms.set(location, ArrayBuffer.isView(values.at(-1)) ? Array.from(values.at(-1)) : values.at(-1));
    };
    if (String(name).startsWith('create')) return () => ({ id: serial++ });
    if (/^[A-Z0-9_]+$/.test(name)) { if (!constants.has(name)) constants.set(name, serial++); return constants.get(name); }
    return () => {};
  } });
  return { gl, draws };
}

test('independent altered pack cannot replace ordinary aliases and every physical pass uses its frozen force-route pose', async () => {
  const { gl, draws } = rendererStub();
  const oldFetch = globalThis.fetch, oldBitmap = globalThis.createImageBitmap, oldWarn = console.warn;
  try {
    globalThis.fetch = async url => ({ ok: true, arrayBuffer: async () => buffer(String(url).includes('altered') ? altered : canonical) });
    globalThis.createImageBitmap = async () => ({ width: 512, height: 512, close() {} });
    P.props3dInit(gl); P.props3dResize(160, 90, { shadowMapSize: 512 });
    await P.addCharacterPack('/canonical.glb');
    const before = P.characterStats().meshes;
    console.warn = () => {};
    await assert.rejects(P.addCharacterPack('/accidentally-canonical.glb', { allowedMeshes: BUS_WOMAN_WRONG_ORIGIN_MESHES }), /unexpected mesh/);
    assert.deepEqual(P.characterStats().meshes, before, 'a failed optional pack replaced the loaded ordinary actor');
    console.warn = oldWarn;
    const added = await P.addCharacterPack('/altered.glb', { allowedMeshes: BUS_WOMAN_WRONG_ORIGIN_MESHES });
    assert.deepEqual(added.meshes.toSorted(), BUS_WOMAN_WRONG_ORIGIN_MESHES.toSorted());
    assert.equal(P.characterStats().packs.length, 2);
    assert.ok(P.characterStats().meshes.includes('exterior_bus_woman'));
    const rt = runtime(); rt.setOutskirtsWorldState({ ticketReturned: true });
    const piece = rt.outskirtsPiece('r12-bus-woman');
    const source = frameAt(rt, piece).filter(instance => instance.id === piece.id || instance.id.startsWith(`${piece.id}:`));
    const submitted = source.map(instance => ({ ...instance, matrix: null, x: 0, y: 0, z: -3 }));
    P.setPropInstances([]); P.setDynamicPropInstances(submitted); P.prepareCharacterFrame(42);
    const frozen = P.characterStats().poses;
    assert.equal(frozen.length, 3);
    submitted[0].character.time = 0;
    const args = { camX: 0, camY: 1.1, camZ: 0, yaw: 0, light: 1, timeSec: 42, zoneTints: new Float32Array(21 * 3).fill(1), shadowPrepared: true };
    P.preparePropShadowPass(args); const shadow = draws.splice(0);
    P.renderPropPass({ ...args, reflection: true }); const reflection = draws.splice(0);
    P.renderPropPass(args); const material = draws.splice(0);
    const signatures = list => [...new Set(list.map(draw => JSON.stringify([draw.bones, draw.morphs])))].sort();
    assert.ok(material.length && shadow.length && reflection.length, 'the altered actor lost a physical pass');
    assert.deepEqual(signatures(shadow), signatures(material), 'torch shadows show different altered anatomy');
    assert.deepEqual(signatures(reflection), signatures(material), 'wet reflections show different altered anatomy');
    assert.ok([...shadow, ...reflection, ...material].every(draw => draw.enabled === 1 && draw.instances === 1));
    assert.deepEqual(P.characterStats().poses, frozen, 'rendering advanced the saved performance');
    assert.deepEqual(P.characterStats().poseErrors, []);
  } finally {
    P.props3dInit(gl); globalThis.fetch = oldFetch; console.warn = oldWarn;
    if (oldBitmap) globalThis.createImageBitmap = oldBitmap; else delete globalThis.createImageBitmap;
  }
});
