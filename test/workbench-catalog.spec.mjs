import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKBENCH_VARIANTS, WORKBENCH_TRAYS, workbenchCatalog, workbenchFocusKey, workbenchTargetMetadata } from '../src/data/workbench-catalog.js';
import { vanKitModel } from '../src/data/van-kit-models.js';
import { itemPortrait } from '../src/data/item-portraits.js';
import { vanWorkbenchModelIds, vanWorkbenchSelectedObject } from '../src/render/van-workbench-stage.js';

const kit = { headphones: 'reference', microphone: 'reference', recorder: 'reference', flashlight: 'reference', cosmetics: { faceplate: 'aluminum' } };
const find = (state, key) => workbenchCatalog({ fieldKit: kit, ...state }).find(item => item.key === key);

test('every hardware choice and standard faceplate has its own simultaneous physical model', () => {
  const objects = workbenchCatalog({ fieldKit: kit });
  assert.equal(objects.length, 20);
  assert.equal(new Set(objects.map(item => item.key)).size, objects.length);
  assert.equal(new Set(objects.map(item => item.modelId)).size, objects.length);
  for (const [group, options] of Object.entries(WORKBENCH_VARIANTS)) {
    assert.deepEqual(objects.filter(item => item.group === group).map(item => item.optionId), options);
  }
  for (const object of objects) {
    assert.ok(vanKitModel(object.modelId) || itemPortrait(object.modelId), `registered model: ${object.modelId}`);
    assert.ok(object.position.every(Number.isFinite));
    assert.ok(object.width > 0);
  }
  assert.equal(objects.filter(item => item.destination === 'device').length, 1, 'current plate lives on the recorder');
  assert.equal(objects.filter(item => item.destination === 'case').length, 0, 'closed case does not contain visible loose gear');
});

test('taking the case opens fixed packing only; each selected hardware group needs its own deliberate pack', () => {
  const state = { bagTaken: true, mapTaken: false };
  assert.equal(find(state, 'recorder').destination, 'case');
  assert.equal(find(state, 'radio').destination, 'case');
  assert.equal(find(state, 'map').destination, 'bench');
  for (const group of ['headphones', 'microphone', 'recorder', 'flashlight']) {
    assert.equal(find(state, `variant:${group}:reference`).destination, 'bench');
    assert.equal(find({ ...state, packedGroups: [group] }, `variant:${group}:reference`).destination, 'case');
    assert.equal(find({ ...state, bagTaken: false, packedGroups: [group] }, `variant:${group}:reference`).destination, 'bench');
  }
  assert.equal(find({ ...state, mapTaken: true }, 'map').destination, 'case');
});

test('changing a packed choice returns the previous model to its original tray', () => {
  const state = { bagTaken: true, packedGroups: ['recorder', 'flashlight'], fieldKit: { ...kit, recorder: 'headroom', flashlight: 'flood' } };
  assert.equal(find(state, 'variant:recorder:reference').destination, 'bench');
  assert.equal(find(state, 'variant:recorder:headroom').destination, 'case');
  assert.equal(find(state, 'variant:flashlight:reference').destination, 'bench');
  assert.equal(find(state, 'variant:flashlight:flood').destination, 'case');
  assert.deepEqual(find(state, 'variant:recorder:reference').position, find({}, 'variant:recorder:reference').position);
});

test('only unclaimed essentials glow, and the spanner remains optional', () => {
  assert.deepEqual(workbenchCatalog({ fieldKit: kit }).filter(item => item.glow).map(item => item.key), ['case', 'map']);
  assert.ok(!find({ bagTaken: true }, 'case').glow);
  assert.ok(!find({ mapTaken: true }, 'map').glow);
  assert.equal(find({}, 'spanner').kind, 'spanner');
  assert.equal(find({}, 'spanner').destination, 'bench');
  assert.equal(find({ spannerTaken: true }, 'spanner').destination, 'case');
});

test('WITNESS does not leak at zero endings and replaces its physical loose plate only when fitted', () => {
  assert.equal(find({ witness: { visible: false, owned: false } }, 'witness'), undefined);
  const preview = find({ witness: { visible: true, owned: false } }, 'witness');
  assert.equal(preview.locked, true); assert.equal(preview.destination, 'bench');
  assert.equal(workbenchTargetMetadata(preview).group, 'faceplate');
  const state = { witness: { visible: true, owned: true }, fieldKit: { ...kit, cosmetics: { faceplate: 'witness' } } };
  assert.equal(find(state, 'witness').destination, 'device');
  assert.equal(find(state, 'variant:faceplate:aluminum').destination, 'bench');
  assert.equal(find(state, 'recorder').modelId, 'field-recorder-witness');
});

test('amp and flashlight selection, metadata, and detail retain their physical identities', () => {
  assert.equal(vanWorkbenchSelectedObject('recorder'), 'amp');
  assert.equal(vanWorkbenchSelectedObject('faceplate'), 'recorder');
  assert.equal(vanWorkbenchSelectedObject('flashlightHousing'), 'flashlight');
  assert.equal(vanWorkbenchModelIds({ ...kit, recorder: 'headroom' }).amp, 'amp-headroom');
  assert.equal(vanWorkbenchModelIds(kit).flashlight, 'flashlight-reference');
  assert.equal(workbenchFocusKey('amp', { fieldKit: { ...kit, recorder: 'low-draw' } }), 'variant:recorder:low-draw');
  assert.equal(workbenchFocusKey('flashlightHousing', { fieldKit: { ...kit, flashlight: 'throw' } }), 'variant:flashlight:throw');
  const target = workbenchTargetMetadata(find({ bagTaken: true, packedGroups: ['microphone'] }, 'variant:microphone:reference'));
  assert.equal(target.kind, 'variant'); assert.equal(target.group, 'microphone'); assert.equal(target.optionId, 'reference');
  assert.equal(target.packed, true); assert.equal(target.modelId, 'microphone-reference');
});

test('the four hardware trays are separate from the central case footprint', () => {
  for (const tray of WORKBENCH_TRAYS.filter(tray => tray.group !== 'faceplate')) {
    assert.ok(Math.abs(tray.x) - tray.w / 2 > 3.3, `${tray.group} clears the case`);
  }
  assert.equal(WORKBENCH_TRAYS.length, 5);
});
