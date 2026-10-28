import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { freshSourceEarthfall, stepSourceEarthfall } from '../src/game/source-earthfall.js';
import { sourceEarthfallRenderFrame, sourceEarthfallGeometry, createSourceEarthfallRenderer } from '../src/render/source-earthfall-renderer.js';
import { endingWrongDoorRenderFrame, createEndingWrongDoorRenderer } from '../src/render/ending-wrong-door-renderer.js';
import { endingWrongDoorOmenFrame, endingWrongDoorFlowHeight } from '../src/data/ending-wrong-door-omen.js';
import { SOURCE_DEMOLITION_GEOMETRY as DEMO } from '../src/data/generated/source-demolition-geometry.js';
import { ST_BRENDANS_PRESENCE_MESH } from '../src/data/st-brendans-presences.js';
import { doorAssembly } from '../src/data/source-door-fields.js';
import { propInstanceVisible } from '../src/render/props3d.js';

const fresh = () => freshSourceEarthfall({ runId: 'ending-physical' });
const stateAt = (elapsed, extra = {}) => ({ ...fresh(), committed: true, committedAt: 0, clock: elapsed, elapsed,
  phase: elapsed < 3 ? 'fracturing' : 'falling', feet: endingWrongDoorFlowHeight(elapsed), z: -3, ...extra });
const transform = (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
const traces = f => f.props.filter(p => p.sourceStructure === 'ending-wrong-door-spirit');

test('ending keeps the real controlled teardown, support and camera rather than decorative debris', () => {
  for (const time of [0, 1, 2.12, 3, 3.5, 4.3]) {
    const state = stateAt(time), original = JSON.stringify(state), base = sourceEarthfallRenderFrame(state), next = endingWrongDoorRenderFrame(state);
    assert.deepEqual(next.eye, base.eye); assert.deepEqual(next.authoredCamera, base.authoredCamera);
    assert.deepEqual(next.source, base.source); assert.equal(JSON.stringify(state), original);
    for (const role of ['earth', 'ellery', 'ellery-fragment', 'model', 'door', 'catch', 'path']) {
      assert.deepEqual(next.props.filter(p => p.earthfallRole === role), base.props.filter(p => p.earthfallRole === role), role);
    }
    assert.ok(!next.props.some(p => p.earthfallRole === 'residue'));
  }
});

test('first traces originate at the actual vacated Ellery aperture after its release', () => {
  assert.equal(traces(endingWrongDoorRenderFrame(stateAt(3.149))).length, 0);
  const frame = endingWrongDoorRenderFrame(stateAt(3.15)), first = traces(frame).find(p => p.id.endsWith('spirit-0'));
  assert.ok(first); assert.equal(first.sourceDemolitionBirth, 3.15);
  const facade = frame.props.find(p => p.earthfallRole === 'ellery'), emitter = DEMO.emitters[0];
  const expected = transform(facade.matrix, [emitter.center[0] - .2, emitter.center[1] - .9, emitter.center[2]]);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(first.matrix[12 + i] - expected[i]) < 2e-5);
  assert.deepEqual(first.endingEmitterOrigin, expected);
});

test('pressure loses corporeal depth, spans the descent and is fixed under observer movement and turns', () => {
  const a = endingWrongDoorRenderFrame(stateAt(4.3));
  const b = endingWrongDoorRenderFrame(stateAt(4.3, { x: 45, z: -60, yaw: 2.8, pitch: -.8 }));
  assert.ok(traces(a).length > 50 && traces(a).length <= 96);
  assert.deepEqual(traces(a), traces(b));
  const curtain = traces(a).filter(p => p.endingOmenRole === 'curtain');
  assert.ok(curtain.length >= 16);
  assert.ok(curtain.every(p => p.apparitionVariant === 14 && p.structural === false && p.emissive.slice(0, 3).every(n => n === 0)));
  assert.ok(curtain.some(p => p.matrix[13] > a.eye[1] - 7 && p.matrix[13] < a.eye[1] + 2));
  assert.ok(curtain.some(p => Math.abs(p.matrix[12]) < 5 && Math.abs(p.matrix[14] + 3) < 5), 'pressure reaches the ordinary body route');
  for (const p of curtain.filter(p => a.endingOmen.elapsed - p.sourceDemolitionBirth >= .43)) assert.ok(Math.hypot(p.matrix[8], p.matrix[9], p.matrix[10]) < .41, 'mature traces have no complete deep human body');
});

test('nothingness occupies a finite world region, removes all sight from inside and yields on landing', () => {
  const state = stateAt(5.3), inside = endingWrongDoorRenderFrame(state);
  assert.equal(inside.endingOmen.occupied, true); assert.equal(inside.props.length, 4); assert.deepEqual(inside.lights, []);
  assert.equal(inside.props[0].apparitionVariant, 13); assert.equal(inside.props[0].mesh, DEMO.darkMesh);
  const outside = endingWrongDoorRenderFrame({ ...state, x: 110 });
  assert.equal(outside.endingOmen.occupied, false); assert.ok(outside.props.length > 194);
  assert.deepEqual(outside.endingOmen.bounds, inside.endingOmen.bounds, 'the volume cannot follow the player');
  const before = sourceEarthfallRenderFrame(state);
  assert.deepEqual(inside.source.geometry, before.source.geometry); assert.deepEqual(inside.eye, before.eye);
  const landed = endingWrongDoorRenderFrame(stateAt(9, { phase: 'landed', feet: 0 }));
  assert.equal(landed.endingOmen.occupied, false); assert.equal(landed.endingOmen.bounds, null);
  assert.equal(traces(landed).length, 0); assert.ok(landed.props.some(p => p.earthfallRole === 'door'));
});

test('protection and effects off suppress the extra presence while reduced motion preserves the real collapse', () => {
  for (const presentation of [{ protected: true }, { effectsMode: 'off' }, { hidden: true }, { focused: false }]) {
    const frame = endingWrongDoorRenderFrame(stateAt(5.3), presentation);
    assert.equal(frame.endingOmen.occupied, false); assert.equal(traces(frame).length, 0);
    assert.equal(frame.props.filter(p => p.earthfallRole === 'earth').length, 120);
  }
  const reduced = endingWrongDoorRenderFrame(stateAt(4.3), { reducedMotion: true });
  assert.ok(traces(reduced).length > 0 && traces(reduced).length <= 40);
  assert.equal(reduced.props.filter(p => p.earthfallRole === 'earth').length, 120);
});

test('shared presentation is pure and its free-fall plane has the physical gravity and terminal speed', () => {
  assert.equal(endingWrongDoorFlowHeight(3), 92); assert.equal(endingWrongDoorFlowHeight(4), 87.1);
  assert.ok(Math.abs(endingWrongDoorFlowHeight(7) - endingWrongDoorFlowHeight(7.01) - .26) < 1e-8);
  let state = fresh(); for (let i = 0; i < 50; i++) state = stepSourceEarthfall(state, { dt: .1, forward: i < 3 ? 1 : 0 }).state;
  const original = JSON.stringify(state), result = endingWrongDoorOmenFrame(state);
  // The presentation plane is analytic; the existing body integrates gravity
  // semi-implicitly at120Hz. Their difference stays below one3D trace width.
  assert.ok(Math.abs(result.flowHeight - state.feet) < .3); assert.equal(JSON.stringify(state), original);
});

function fixture(ending = true, dark = true) {
  const catalog = new Set(['grand_piano', 'instrument_case']), calls = [];
  const renderer = new Proxy({}, { get: (_, key) => (...args) => { calls.push({ key, args }); return key === 'r3dBasePropsReady' ? Promise.resolve(true) : key === 'r3dFrame' ? true : undefined; } });
  const props = { propMeshCatalog: () => [...catalog], setPressureInstances() {},
    installAuthoredPropMeshes() { for (const p of sourceEarthfallGeometry()) catalog.add(p.name); return true; },
    async addPropPack(url) {
      const door = doorAssembly('bay-goods-pair', { activeLeaves: 'all' });
      const names = url.includes('source-demolition') ? [DEMO.staticMesh, ...DEMO.parts.map(p => p.mesh), ...(dark ? [DEMO.darkMesh] : [])]
        : url.includes('presences') ? Object.values(ST_BRENDANS_PRESENCE_MESH) : [door.frameMesh, door.leafMesh, door.freeStandingHeadMesh].filter(Boolean);
      for (const n of names) catalog.add(n);
    }, setAuthoredPropRange: () => () => {} };
  const owner = (ending ? createEndingWrongDoorRenderer : createSourceEarthfallRenderer)({ renderer, props, resolveAsset: p => p });
  return { owner, calls };
}

test('ending borrows the actual shared acquisition/dither draw and reports the finite occupation', async () => {
  const h = fixture(); assert.equal(await h.owner.initialize(), true); assert.equal(h.owner.render(stateAt(5.3)), true);
  const draw = h.calls.findLast(c => c.key === 'r3dFrame').args[0];
  assert.equal(draw.textSpace, true); assert.equal(draw.sourceVoidPhysical, false); assert.equal(draw.authoredPropRange, 240);
  assert.deepEqual(draw.authoredCamera.eye, [0, endingWrongDoorFlowHeight(5.3) + 1.62, -3]);
  assert.equal(h.owner.diagnostics().endingOmen.occupied, true); h.owner.dispose(); assert.equal(h.owner.ready(), false);
});

test('normal Earthfall default output stays exact; missing ending volume fails clearly', async () => {
  const h = fixture(false); await h.owner.initialize(); const state = stateAt(4.3); h.owner.render(state);
  assert.deepEqual(h.calls.findLast(c => c.key === 'r3dSetProps').args[0], sourceEarthfallRenderFrame(state).props); h.owner.dispose();
  const missing = fixture(true, false); await assert.rejects(missing.owner.initialize(), /finite Source nothingness mesh/);
  assert.equal(missing.owner.ready(), false);
});

test('shipped dark volume and pressure family use the existing dither-bound prop variants', () => {
  const bytes = fs.readFileSync('public/assets/source-demolition.glb'), gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  const dark = gltf.meshes.find(m => m.name === DEMO.darkMesh); assert.ok(dark);
  const accessor = gltf.accessors[dark.primitives[0].attributes.POSITION];
  assert.deepEqual(accessor.min, [-.5, -.5, -.5]); assert.deepEqual(accessor.max, [.5, .5, .5]);
  const shader = fs.readFileSync('src/render/props3d.js', 'utf8');
  assert.match(shader, /if\(vPortrait==13\)/); assert.match(shader, /if\(vPortrait==14\)/);
  assert.match(shader, /trace=smoothstep\(\.72,1\.10,vLocalHeight\)/);
});

test('actual uploaded black triangles enclose corner and central eyes in every sampled direction before the far plane', () => {
  const bytes = fs.readFileSync('public/assets/source-demolition.glb'), jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength)), binary = bytes.subarray(28 + jsonLength);
  const read = id => {
    const a = gltf.accessors[id], view = gltf.bufferViews[a.bufferView], components = a.type === 'VEC3' ? 3 : 1;
    const size = a.componentType === 5123 ? 2 : 4, stride = view.byteStride || size * components, offset = (view.byteOffset || 0) + (a.byteOffset || 0);
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: components }, (_, k) => {
      const at = offset + i * stride + k * size;
      return a.componentType === 5126 ? binary.readFloatLE(at) : a.componentType === 5123 ? binary.readUInt16LE(at) : binary.readUInt32LE(at);
    }));
  };
  const primitive = gltf.meshes.find(m => m.name === DEMO.darkMesh).primitives[0], positions = read(primitive.attributes.POSITION), indices = read(primitive.indices).flat();
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const minus = (a, b) => a.map((n, i) => n - b[i]), dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
  const hit = (eye, ray, a, b, c) => {
    const u = minus(b, a), v = minus(c, a), p = cross(ray, v), determinant = dot(u, p);
    if (Math.abs(determinant) < 1e-9) return Infinity;
    const t = minus(eye, a), x = dot(t, p) / determinant;
    if (x < -1e-7 || x > 1 + 1e-7) return Infinity;
    const q = cross(t, u), y = dot(ray, q) / determinant;
    if (y < -1e-7 || x + y > 1 + 1e-7) return Infinity;
    const distance = dot(v, q) / determinant; return distance > .002 ? distance : Infinity;
  };
  for (const pose of [{ x: 0, z: -3, feet: 74 }, { x: -95, z: -114, feet: 2 }, { x: 95, z: 44, feet: 99 }]) {
    const frame = endingWrongDoorRenderFrame(stateAt(5.3, pose)), eye = frame.eye;
    assert.equal(frame.endingOmen.occupied, true);
    const triangles = frame.props.flatMap(instance => {
      assert.equal(propInstanceVisible(instance, eye, 240), true);
      return Array.from({ length: indices.length / 3 }, (_, i) => indices.slice(i * 3, i * 3 + 3).map(k => transform(instance.matrix, positions[k])));
    });
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      const length = Math.hypot(x, y, z), ray = [x / length, y / length, z / length];
      const nearest = Math.min(...triangles.map(([a, b, c]) => hit(eye, ray, a, b, c)));
      assert.ok(nearest < 240, `actual geometry misses ${JSON.stringify({ pose, ray, nearest })}`);
    }
  }
});
