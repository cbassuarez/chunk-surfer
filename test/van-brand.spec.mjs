import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { vanBrandInstances } from '../src/render/van-brand.js';
import { VAN_BRAND_COPY, VAN_BRAND_FITS, VAN_BRAND_PAINT } from '../src/data/van-brand.js';
import { VAN_BRAND_ART } from '../src/data/van-brand-art.js';
import { printedSurfaceDescriptor } from '../src/render/printed-surface.js';
import { letteringFinishDescriptor, propMaterialFactors } from '../src/render/prop-material-contract.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { buildPreTapeGodPreset } from '../src/game/chunk-surf-god.js';
import { SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { makeDriveScene } from '../src/game/source-drive/scene.js';
import { freshSourceDriveCheckpoint } from '../src/game/source-drive-session.js';

const sha = b => createHash('sha256').update(b).digest('hex');
test('only submitted, real vehicle hosts receive owner paint, with no interaction or light authority', () => {
  const matrix = new Float32Array([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, -1.4, 0, 8, 4, 20, 1]);
  const parent = Object.freeze({ id: 'folded:van', mesh: 'yard_van', matrix, zone: 9, sourceStructure: 'outskirts',
    outskirtsFoldVisibility: .37, reflectionOnly: true, portalClipPlanes: [[1, 2, 3, 4]], action: 'not-inherited',
    blocks: true, character: { clip: 'not-inherited' }, emissive: [1, .8, .4, 5], cabinVolume: { min: [0, 0, 0] } });
  const before = Array.from(matrix), [mark] = vanBrandInstances([parent]);
  assert.equal(mark.mesh, 'van_brand_yard'); assert.equal(mark.paintOf, parent.id);
  assert.deepEqual(Array.from(mark.matrix), before); assert.notEqual(mark.matrix, matrix);
  for (const key of ['zone', 'sourceStructure', 'outskirtsFoldVisibility', 'reflectionOnly']) assert.equal(mark[key], parent[key]);
  assert.deepEqual(mark.portalClipPlanes, parent.portalClipPlanes); assert.notEqual(mark.portalClipPlanes, parent.portalClipPlanes);
  for (const key of ['action', 'blocks', 'character', 'emissive', 'cabinVolume']) assert.equal(mark[key], undefined);
  assert.equal(mark.structural, false); assert.equal(mark.noShadow, true);
  mark.matrix[12] = 999; assert.deepEqual(Array.from(matrix), before);
  assert.deepEqual(vanBrandInstances([{ ...parent, hidden: true }, { ...parent, visible: false },
    { ...parent, mesh: 'outskirts_car' }, { ...parent, mesh: 'wrecked-car' }]), []);
});

test('both driving names use one physical fit and preserve ordinary pose/nonuniform scale', () => {
  const parents = ['opening_drive_vehicle_body', 'drive_vehicle_body'].map((mesh, i) => ({ id: `body:${i}`, mesh,
    x: 20, y: .2, z: 42, yaw: 1.6, scale: .8, scaleX: -1, scaleY: 1.1, scaleZ: .9, skyExposed: true }));
  const marks = vanBrandInstances(parents); assert.equal(marks.length, 2);
  for (let i = 0; i < 2; i++) { assert.equal(marks[i].mesh, 'van_brand_drive'); for (const key of ['x', 'y', 'z', 'yaw', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'skyExposed']) assert.equal(marks[i][key], parents[i][key]); }
  assert.equal(vanBrandInstances([...parents, ...marks]).length, 0, 'already branded lists do not gain duplicates');
  assert.equal(vanBrandInstances([parents[0], parents[0]]).length, 1);
  assert.deepEqual(vanBrandInstances([{ mesh: 'yard_van', matrix: [1] }, { mesh: 'yard_van', x: NaN, z: 0 }]), []);
});

test('actual Source street and drive lists submit paint from their own visible body matrices', async () => {
  const built = buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength + Math.round(200 / CELL), { seed: 4417, marbleEyes: 'returned' });
  const runtime = createSourceSpaceRuntime({ initialState: built.state }); runtime.setPlayerPosition(built.position);
  const list = runtime.propInstances(built.position.x, built.position.y, { time: 0 });
  const vans = list.filter(p => p.mesh === 'yard_van'); assert(vans.length > 0);
  for (const van of vans) {
    const mark = list.find(p => p.paintOf === van.id && p.mesh === 'van_brand_yard'); assert(mark, van.id);
    assert.deepEqual(mark.matrix, van.matrix); assert.equal(mark.outskirtsFoldVisibility, van.outskirtsFoldVisibility);
    assert.equal(mark.sourceStructure, van.sourceStructure);
  }
  assert(vans.some(p => p.outskirtsFoldVisibility != null), 'the actual folded return is included');
  const metrics = JSON.parse(await readFile(new URL('../public/assets/source-drive/geometry/metrics.json', import.meta.url), 'utf8'));
  const state = freshSourceDriveCheckpoint({ returnPose: { x: 0, y: 0, facing: 0, yaw: 0, pitch: 0, floorH: 0 }, runId: 'van-brand-test' }).drive;
  const scene = makeDriveScene(state, metrics, { showHands: false }), host = scene.props.find(p => p.mesh === 'drive_vehicle_body');
  const mark = scene.props.find(p => p.mesh === 'van_brand_drive'); assert(host && mark); assert.deepEqual(mark.matrix, host.matrix);
  assert.equal(mark.cabinVolume, undefined); assert.equal(mark.emissive, undefined);
});

const area = ring => Math.abs(ring.reduce((s, a, i) => { const b = ring[(i + 1) % ring.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((v, k) => v - b[k]);
test('actual add-on contains only opaque solid original pigment, with preserved contour holes and physical normals', async () => {
  const bytes = await readFile(new URL('../public/assets/van-brand.glb', import.meta.url)), doc = await new NodeIO().readBinary(bytes);
  const stats = JSON.parse(await readFile(new URL('../public/assets/van-brand.stats.json', import.meta.url), 'utf8'));
  assert.equal(stats.sha256, sha(bytes)); assert.equal(stats.copy, VAN_BRAND_COPY);
  assert.deepEqual(doc.getRoot().listMeshes().map(m => m.getName()).sort(), ['van_brand_drive', 'van_brand_yard']);
  assert.equal(doc.getRoot().listTextures().length, 0); assert.equal(doc.getRoot().listAnimations().length, 0); assert.equal(doc.getRoot().listSkins().length, 0);
  for (const material of doc.getRoot().listMaterials()) {
    assert.equal(material.getAlphaMode(), 'OPAQUE'); assert.deepEqual(material.getEmissiveFactor(), [0, 0, 0]);
    assert.equal(material.getBaseColorTexture(), null); assert.equal(material.getMetallicFactor(), 0);
    const extra = material.getExtras(); assert.equal(extra.materialFactors, 'gltf');
    assert.equal(printedSurfaceDescriptor(extra.printedSurface, { hasTexture: false }).coverage, 'solid');
    assert.equal(letteringFinishDescriptor(extra.letteringFinish).localSpecular, true);
    assert.equal(propMaterialFactors({ roughness: material.getRoughnessFactor(), metallic: 0, semantics: extra.materialFactors }).legacyUnmapped, false);
  }
  for (const fit of Object.values(VAN_BRAND_FITS)) {
    const mesh = doc.getRoot().listMeshes().find(m => m.getName() === fit.mesh), areas = new Map();
    for (const primitive of mesh.listPrimitives()) {
      const pos = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL'), indices = primitive.getIndices().getArray();
      const pigment = primitive.getMaterial().getName().replace('owner paint / ', ''); let frontArea = 0;
      for (let i = 0; i < pos.getCount(); i++) {
        const p = pos.getElement(i, []), n = normals.getElement(i, []);
        assert(p.every(Number.isFinite)); assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5);
        assert.ok(Math.abs(p[0]) > fit.surfaceX + .0022 && Math.abs(p[0]) < fit.surfaceX + .0032);
        assert.ok(p[1] >= fit.centerY - fit.heightM / 2 - 1e-5 && p[1] <= fit.centerY + fit.heightM / 2 + 1e-5);
        assert.ok(p[2] >= fit.centerZ - fit.widthM / 2 - 1e-5 && p[2] <= fit.centerZ + fit.widthM / 2 + 1e-5);
      }
      for (let i = 0; i < indices.length; i += 3) {
        const a = pos.getElement(indices[i], []), b = pos.getElement(indices[i + 1], []), c = pos.getElement(indices[i + 2], []);
        const normal = normals.getElement(indices[i], []), n = cross(sub(b, a), sub(c, a));
        assert(n.every(Number.isFinite)); assert.ok(n.reduce((s, v, k) => s + v * normal[k], 0) >= -1e-12, 'all cap/edge winding agrees with geometric normals');
        if (normal[0] * Math.sign(a[0]) > .999) frontArea += Math.hypot(...n) / 2;
      }
      areas.set(pigment, frontArea);
    }
    for (const [pigment, actual] of areas) {
      const original = VAN_BRAND_ART.filter(a => a.pigment === pigment).reduce((s, a) => s + area(a.outer) - (a.holes || []).reduce((s, h) => s + area(h), 0), 0);
      const expected = original * fit.widthM / 1800 * fit.heightM / 540 * 2;
      assert.ok(Math.abs(actual - expected) < Math.max(1e-6, expected * .0001), `${fit.mesh}/${pigment}: contour hole or polygon fill changed`);
    }
    assert.equal(mesh.getExtras().pigmentThicknessM, VAN_BRAND_PAINT.thicknessM);
  }
});
