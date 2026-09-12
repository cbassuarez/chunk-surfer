import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyWitnessModelAppearance } from '../src/render/witness-model.js';
import { makeWitnessInspectionScene, witnessInspectionLayout } from '../src/game/witness-inspection.js';

async function model() {
  const bytes = readFileSync(new URL('../public/assets/items/field-recorder-witness.glb', import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const find = (root, name) => root.getObjectByName(name) || root.getObjectByName(name.replaceAll(':', ''));

test('actual Witness GLB preserves polymer refraction and dark optical well while personalizing the formed caps', async () => {
  const root = await model(), originals = [], maps = [];
  root.traverse(node => { if (node.isMesh) originals.push([node, node.material]); });
  const polymer = originals.map(([, material]) => material).find(material => material.name === 'witness-polymer');
  const originalTransmission = polymer.transmission;
  const helper = applyWitnessModelAppearance(THREE, root, { cosmetics: { buttons: 'sea-glass', vfd: 'ice' }, endingIds: ['sacrifice'],
    textureFactory(width, height, draw) { assert.deepEqual([width, height], [1332, 478]); assert.equal(typeof draw, 'function'); const map = new THREE.Texture(); maps.push(map); return map; } });
  assert.equal(polymer.transmission, originalTransmission); assert.ok(polymer.transmission > .8);
  assert.equal(polymer.ior, 1.49); assert.ok(polymer.thickness > 0);
  const substrate = find(root, 'recorder-display-substrate');
  assert.equal(substrate.material.transparent, false); assert.equal(substrate.material.opacity, 1); assert.equal(substrate.material.depthWrite, true);
  assert.equal(substrate.material.map, maps[0]); assert.equal(substrate.material.map.flipY, true);
  assert.equal(find(root, 'recorder-idle-electrodes').visible, false);
  const caps = ['REC', 'STOP', 'TAKES'].map(name => find(root, `transport-${name}-cap`));
  assert.deepEqual(caps.map(node => node.material.color.getHexString()), ['d09179', 'a7bda0', 'bcbda9']);
  assert.equal(find(root, 'witness-ending:sacrifice').visible, true);
  assert.equal(find(root, 'witness-ending:helped').visible, false);
  helper.update({ endingIds: ['helped', 'helped', 'fake'] });
  assert.equal(maps.length, 1, 'changing service marks does not reallocate display textures');
  assert.equal(find(root, 'witness-ending:sacrifice').visible, false);
  assert.equal(find(root, 'witness-ending:helped').visible, true);
  const disposed = [];
  maps[0].addEventListener('dispose', () => disposed.push(0));
  helper.update({ cosmetics: { vfd: 'amber' } });
  assert.deepEqual(disposed, [0]); assert.equal(maps.length, 2);
  assert.deepEqual(caps.map(node => node.material.color.getHexString()), ['d09179', 'a7bda0', 'bcbda9'], 'partial update preserves selected key set');
  helper.dispose(); helper.dispose();
  for (const [node, original] of originals) assert.equal(node.material, original, 'cached GLB materials restored, not disposed clones');
  assert.equal(find(root, 'recorder-idle-electrodes').visible, true);
});

test('the real cap, printed legend, lamp and visible plunger move together without moving the bezel', async () => {
  const root = await model(), helper = applyWitnessModelAppearance(THREE, root);
  const actuator = find(root, 'transport-REC-actuator'), stem = find(root, 'witness-stem:rec'), bezel = find(root, 'transport-REC-bezel');
  assert.ok(actuator); assert.ok(actuator.children.length >= 3);
  const original = [actuator.position.z, stem.position.z, bezel.position.z];
  helper.updateControls({ rec: .5 });
  assert.ok(Math.abs(actuator.position.z - original[0] + .006) < 1e-10);
  assert.ok(Math.abs(stem.position.z - original[1] + .006) < 1e-10);
  assert.equal(bezel.position.z, original[2]);
  helper.updateControls({ rec: Infinity });
  assert.ok(Number.isFinite(actuator.position.z));
  helper.dispose(); assert.deepEqual([actuator.position.z, stem.position.z, bezel.position.z], original);
});

test('inspection never awards or fits implicitly; close and no-GPU access remain available', async () => {
  const calls = [], cosmetics = { buttons: 'signal', vfd: 'ice' }, endingIds = ['sacrifice'];
  const scene = makeWitnessInspectionScene({ cosmetics, endingIds, owned: false, onFit: () => calls.push('fit'), onClose: () => calls.push('close') });
  await scene.ready;
  assert.equal(scene.id, 'witness-inspection'); assert.equal(scene.blocksWorld, true); assert.equal(scene.freezesBelow, true);
  assert.equal(scene.view().failed, true, 'Node has no GPU, but this is not a fitting gate');
  assert.equal(scene.view().canFit, false); assert.deepEqual(calls, []);
  const initial = scene.view(); scene.key({ key: 'ArrowRight' }); assert.ok(scene.view().yaw > initial.yaw);
  scene.key({ key: 't' }); assert.ok(scene.view().yaw > Math.PI - .2);
  scene.key({ key: 'v' }); assert.equal(scene.view().mode, 'plate');
  scene.key({ key: 'r' }); assert.equal(scene.view().yaw, initial.yaw);
  scene.key({ key: 'Escape' }); scene.key({ key: 'Enter' }); scene.exit();
  assert.deepEqual(calls, ['close']); assert.equal(scene.view().disposed, true);
  assert.deepEqual(cosmetics, { buttons: 'signal', vfd: 'ice' }); assert.deepEqual(endingIds, ['sacrifice']);
});

test('explicit fit callback runs before close, rejects stale gates and cannot be triggered twice', async () => {
  const calls = []; let allowed = false;
  const scene = makeWitnessInspectionScene({ owned: true, onFit: () => { calls.push('fit'); return allowed; }, onClose: () => calls.push('close') });
  await scene.ready; scene.key({ key: 'Enter' });
  assert.deepEqual(calls, ['fit']); assert.equal(scene.view().closed, false);
  allowed = true; scene.key({ key: 'Enter' }); scene.key({ key: 'Enter' });
  assert.deepEqual(calls, ['fit', 'fit', 'close']); assert.equal(scene.view().closed, true);
  const readonly = makeWitnessInspectionScene({ owned: true }); await readonly.ready;
  assert.equal(readonly.view().canFit, false); readonly.exit();
});

test('held confirm cannot auto-fit a newly opened sleeve inspection; only orbit accepts repeats', async () => {
  const calls = [];
  const scene = makeWitnessInspectionScene({ owned: true, initialMode: 'plate', onFit: () => calls.push('fit'), onClose: () => calls.push('close') });
  await scene.ready; assert.equal(scene.view().mode, 'plate');
  for (const key of ['Enter', ' ', 'Escape', 'b', 'r', 't', 'v', 'k', 'Tab']) scene.key({ key, repeat: true });
  for (const controllerAction of ['confirm', 'back', 'tabNext', 'tabPrev']) scene.key({ controllerAction, repeat: true });
  assert.deepEqual(calls, []); assert.equal(scene.view().closed, false); assert.equal(scene.view().mode, 'plate');
  const yaw = scene.view().yaw; scene.key({ key: 'ArrowRight', repeat: true }); assert.ok(scene.view().yaw > yaw);
  scene.key({ key: 'Enter', repeat: false }); assert.deepEqual(calls, ['fit', 'close']);
});

test('an owned sleeve without a field case displays the fitting prerequisite without exposing a fit control', async () => {
  const reason = 'TAKE THE FIELD CASE BEFORE FITTING.';
  const scene = makeWitnessInspectionScene({ owned: true, initialMode: 'plate', onFit: null, fitUnavailableReason: reason });
  await scene.ready; assert.equal(scene.view().canFit, false); assert.equal(scene.view().fittingNotice, reason);
  scene.render(); assert.ok(!scene.view().layout.buttons.some(button => button.id === 'fit'));
  scene.exit();
  const ready = makeWitnessInspectionScene({ owned: true, onFit: () => {}, fitUnavailableReason: reason });
  await ready.ready; assert.equal(ready.view().fittingNotice, ''); ready.exit();
});

test('all physical inspection controls remain nonoverlapping at supported game cell sizes', () => {
  for (const [cols, rows] of [[189, 52], [120, 36], [80, 28], [70, 28], [60, 24]]) for (const canFit of [true, false]) {
    const { rect, buttons, portrait, detail } = witnessInspectionLayout(cols, rows, canFit);
    assert.ok(portrait.w > 0 && portrait.h > 0); assert.ok(detail.w > 0 && detail.h > 0);
    assert.equal(buttons.some(button => button.id === 'fit'), canFit);
    for (const button of buttons) {
      assert.ok(button.x >= rect.x && button.x + button.w <= rect.x + rect.w + 1e-8);
      assert.ok(button.y + button.h <= rect.y + rect.h);
      assert.ok(button.y >= portrait.y + portrait.h);
    }
    for (let i = 1; i < buttons.length; i++) assert.ok(buttons[i].x > buttons[i - 1].x + buttons[i - 1].w);
  }
});
