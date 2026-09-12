import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_KIT_OPTIONS, freshFieldKit, normalizeFieldKit, fieldKitEffects, fieldKitInspection } from '../src/game/field-kit.js';
import { makeVanWorkbenchScene } from '../src/game/van-workbench.js';
import { VAN_PACKING_GROUPS, VAN_WORKBENCH_GROUPS, vanWorkbenchLayout, vanWorkbenchReady,
  vanWorkbenchRemaining } from '../src/render/van-workbench-view.js';
import { controlMechanicsSnapshot } from '../src/game/control-mechanics.js';

const size = { cols: 100, rows: 28 };
function fixture(overrides = {}, hooks = {}) {
  let state = { bagTaken: true, mapTaken: true, difficultyConfirmed: true, requirePacking: true,
    packedGroups: [], fieldKit: freshFieldKit(), ...overrides };
  const calls = [];
  const scene = makeVanWorkbenchScene({ getState: () => state,
    onTakeCase: () => { state.bagTaken = true; calls.push('case'); },
    onKitChange: (kit, detail) => {
      calls.push({ kit, ...detail });
      if (hooks.onKitChange?.(kit, detail) === false) return false;
      state.fieldKit = kit;
      if (VAN_PACKING_GROUPS.includes(detail.group)) state.packedGroups = [...new Set([...state.packedGroups, detail.group])];
    },
    onSpannerChoice: take => {
      calls.push({ spanner: take });
      if (hooks.onSpannerChoice?.(take) === false) return false;
      state.spannerDecided = true; state.spannerTaken = take;
    },
    onContinue: () => calls.push('continue'), onClose: () => calls.push('close'),
    onInspect: item => calls.push({ inspect: item }),
  });
  scene.enter(); scene.render(size);
  function click(id) {
    const hit = scene.debugState().hitRegions.find(item => item.id === id);
    assert.ok(hit, `missing hit ${id}`);
    const event = { pointerId: 3, button: 0, cellX: hit.x + hit.w / 2, cellY: hit.y + hit.h / 2 };
    scene.pointer({ type: 'pointerdown', ...event }); scene.pointer({ type: 'pointerup', ...event }); scene.render(size);
  }
  return { scene, calls, state: () => state, click };
}

test('four deliberate hardware selections pack the default models and gate departure', () => {
  const f = fixture();
  assert.equal(vanWorkbenchReady(f.state()), false);
  assert.deepEqual(vanWorkbenchRemaining(f.state()), ['pack headphones', 'pack a microphone', 'pack an amp', 'pack a flashlight']);
  f.click('van:continue'); assert.ok(!f.calls.includes('continue'));
  for (const group of VAN_PACKING_GROUPS) {
    f.click(`van:group:${group}`); f.click(`van:kit:${group}:reference`);
    assert.equal(f.calls.at(-1).group, group); assert.equal(f.calls.at(-1).optionId, 'reference');
    assert.ok(f.state().packedGroups.includes(group));
  }
  assert.equal(vanWorkbenchReady(f.state()), true);
  assert.equal(f.state().spannerDecided, undefined, 'optional spanner never blocks departure');
  const before = f.calls.length; f.click('van:kit:flashlight:reference');
  assert.equal(f.calls.length, before, 'an already packed default cannot be added twice');
  f.click('van:continue'); assert.equal(f.calls.at(-1), 'continue'); f.scene.exit();
});

test('replacing a packed item sends its exact family and saves only one selected model', () => {
  const f = fixture();
  f.click('van:kit:headphones:reference'); f.click('van:kit:headphones:closed'); f.click('van:kit:headphones:open');
  assert.equal(f.state().fieldKit.headphones, 'open');
  assert.deepEqual(f.state().packedGroups, ['headphones']);
  assert.deepEqual(f.calls.map(call => call.optionId), ['reference', 'closed', 'open']);
  f.click('van:group:flashlight'); f.click('van:kit:flashlight:throw');
  f.click('van:group:flashlightHousing'); f.click('van:kit:flashlightHousing:ivory');
  assert.equal(f.calls.at(-1).group, 'flashlightHousing');
  assert.equal(f.state().fieldKit.flashlight, 'throw');
  assert.equal(f.state().fieldKit.cosmetics.flashlightHousing, 'ivory');
  assert.deepEqual(f.state().packedGroups, ['headphones', 'flashlight']); f.scene.exit();
});

test('a rejected packing write cannot make a default selection count as packed', () => {
  const f = fixture({}, { onKitChange: () => false });
  f.click('van:kit:headphones:reference'); assert.deepEqual(f.state().packedGroups, []);
  assert.match(f.scene.debugState().notice, /NOT SAVED/);
  assert.equal(vanWorkbenchReady(f.state()), false); f.scene.exit();
});

test('physical target metadata produces exact variant fittings without phantom choices', () => {
  const targets = {};
  for (const group of [...VAN_PACKING_GROUPS, 'faceplate']) {
    const options = FIELD_KIT_OPTIONS[group] || FIELD_KIT_OPTIONS.cosmetics[group];
    for (const [index, option] of options.entries()) targets[`variant:${group}:${option.id}`] = {
      x: 2 + index * 4, y: 4, w: 3, h: 2, kind: 'variant', group, optionId: option.id,
      modelId: `${group}-${option.id}`, packed: option.id === 'reference',
    };
  }
  targets.forged = { x: 2, y: 2, w: 3, h: 2, kind: 'variant', group: 'headphones', optionId: 'counterfeit' };
  const before = vanWorkbenchLayout(size, { bagTaken: false }, 'headphones', targets);
  assert.equal(before.regions.filter(region => region.object && region.kind === 'kit').length, 15);
  assert.ok(before.regions.filter(region => region.object && region.kind === 'kit').every(region => !region.enabled));
  const after = vanWorkbenchLayout(size, { bagTaken: true, cosmeticMeta: { endingsSeen: ['helped'] } }, 'headphones', targets);
  const witness = after.regions.find(region => region.id === 'van:object:variant:faceplate:witness');
  assert.ok(witness.enabled); assert.ok(witness.locked); assert.equal(witness.fittable, false);
  const amp = after.regions.find(region => region.id === 'van:object:variant:recorder:headroom');
  assert.equal(amp.kind, 'kit'); assert.equal(amp.group, 'recorder'); assert.equal(amp.optionId, 'headroom');
  assert.equal(amp.item, 'recorder-headroom'); assert.ok(!after.regions.some(region => region.id.includes('forged')));
});

test('the optional spanner asks explicitly, defaults to NO, and traps input until answered or canceled', () => {
  const f = fixture();
  f.click('van:spanner');
  assert.equal(f.scene.debugState().focusId, 'van:spanner:no');
  assert.deepEqual(f.scene.debugState().hitRegions.map(hit => hit.id), ['van:spanner:yes', 'van:spanner:no']);
  const group = f.scene.debugState().selectedGroup;
  f.scene.key({ key: '7', code: 'Digit7' }); assert.equal(f.scene.debugState().selectedGroup, group);
  f.scene.pointer({ type: 'pointerdown', pointerId: 2, button: 0, cellX: 0, cellY: 0 });
  assert.equal(f.calls.length, 0, 'outside prompt clicks do not pass through');
  f.scene.key({ key: 'Escape', code: 'Escape' });
  assert.equal(f.state().spannerDecided, undefined); assert.ok(!f.calls.includes('close'));
  f.click('van:spanner'); f.scene.key({ key: 'Enter', code: 'Enter' });
  assert.deepEqual(f.calls.at(-1), { spanner: false }); assert.equal(f.state().spannerTaken, false);
  assert.equal(f.scene.debugState().state.spannerPrompt, false);
  f.scene.key({ key: 'Enter', code: 'Enter', repeat: true }); assert.equal(f.calls.length, 1);
  assert.ok(!controlMechanicsSnapshot().ids.some(id => id.startsWith('van:'))); f.scene.exit();
});

test('spanner YES requires the case, saves once, remains retryable on failure, and exposes later inspection', () => {
  let accept = false;
  const f = fixture({ bagTaken: false }, { onSpannerChoice: () => accept });
  f.click('van:spanner'); f.click('van:spanner:yes');
  assert.equal(f.calls.length, 0); assert.match(f.scene.debugState().notice, /Take the field case/);
  f.scene.key({ key: 'Escape' }); f.scene.render(size); f.click('van:case');
  f.click('van:spanner'); f.click('van:spanner:yes');
  assert.equal(f.state().spannerTaken, undefined); assert.equal(f.scene.debugState().state.spannerPrompt, true);
  accept = true; f.scene.key({ key: 'y', code: 'KeyY' });
  assert.equal(f.state().spannerTaken, true); assert.equal(f.scene.debugState().state.spannerPrompt, false);
  f.scene.render(size); f.click('van:spanner'); assert.deepEqual(f.calls.at(-1), { inspect: 'plant-spanner' }); f.scene.exit();
});

test('held controller Back only dismisses the prompt and held Inspect cannot stack inspectors', () => {
  const f = fixture(); f.click('van:spanner');
  f.scene.key({ controllerAction: 'back' });
  assert.equal(f.scene.debugState().state.spannerPrompt, false);
  f.scene.key({ controllerAction: 'back', repeat: true });
  assert.ok(!f.calls.includes('close'), 'the held Back cannot dismiss the parent scene');
  f.scene.key({ key: 'i', code: 'KeyI' });
  const inspections = f.calls.filter(call => call.inspect).length;
  assert.equal(inspections, 1);
  f.scene.key({ key: 'i', code: 'KeyI', repeat: true });
  assert.equal(f.calls.filter(call => call.inspect).length, inspections);
  f.scene.exit();
});

test('all eight groups and prompt controls remain in bounds, and shortcut cycling reaches the flashlight', () => {
  assert.equal(VAN_WORKBENCH_GROUPS.find(group => group.id === 'recorder').label, 'AMP');
  for (const dimensions of [{ cols: 40, rows: 16 }, { cols: 75, rows: 20 }, size, { cols: 150, rows: 38 }]) {
    const layout = vanWorkbenchLayout(dimensions, { spannerPrompt: true }, 'flashlightHousing');
    for (const region of [...layout.groups, layout.spannerPrompt, ...layout.regions]) {
      assert.ok(region.x >= 0 && region.y >= 0 && region.w > 0 && region.h > 0);
      assert.ok(region.x + region.w <= dimensions.cols); assert.ok(region.y + region.h <= dimensions.rows);
    }
  }
  const f = fixture(); f.scene.key({ key: '7' }); assert.equal(f.scene.debugState().selectedGroup, 'flashlight');
  f.scene.key({ controllerAction: 'tabNext' }); assert.equal(f.scene.debugState().selectedGroup, 'flashlightHousing');
  f.scene.key({ controllerAction: 'tabNext' }); assert.equal(f.scene.debugState().selectedGroup, 'headphones'); f.scene.exit();
});

test('flashlight beam tradeoffs are independent of amp draw and shell color has no effects', () => {
  for (const flashlight of FIELD_KIT_OPTIONS.flashlight) for (const recorder of FIELD_KIT_OPTIONS.recorder) {
    const kit = normalizeFieldKit({ flashlight: flashlight.id, recorder: recorder.id });
    const effects = fieldKitEffects(kit);
    assert.equal(effects.torchDrainScale, fieldKitEffects({ recorder: recorder.id }).torchDrainScale);
    assert.equal(effects.flashlightDrainScale, fieldKitEffects({ flashlight: flashlight.id }).flashlightDrainScale);
    for (const housing of FIELD_KIT_OPTIONS.cosmetics.flashlightHousing) {
      assert.deepEqual(fieldKitEffects({ ...kit, cosmetics: { ...kit.cosmetics, flashlightHousing: housing.id } }), effects);
    }
  }
  const reference = fieldKitEffects(), narrow = fieldKitEffects({ flashlight: 'throw' }), wide = fieldKitEffects({ flashlight: 'flood' });
  assert.ok(narrow.flashlightReachScale > reference.flashlightReachScale && narrow.flashlightConeScale < 1 && narrow.flashlightDrainScale > 1);
  assert.ok(wide.flashlightReachScale < reference.flashlightReachScale && wide.flashlightConeScale > 1 && wide.flashlightDrainScale < 1);
  assert.deepEqual(normalizeFieldKit({ flashlight: 'forged', cosmetics: { flashlightHousing: '__proto__' } }), freshFieldKit());
  for (const flashlight of FIELD_KIT_OPTIONS.flashlight) {
    const inspection = fieldKitInspection({ flashlight: flashlight.id }, 'flashlight');
    assert.equal(inspection.id, 'light'); assert.equal(inspection.modelId, `flashlight-${flashlight.id}`);
    assert.equal(inspection.description, flashlight.description);
  }
  const amp = fieldKitInspection({ recorder: 'headroom' }, 'amp');
  assert.equal(amp.id, 'amp-headroom'); assert.equal(amp.battleCapable, false);
  assert.equal(fieldKitInspection({ recorder: 'headroom' }).id, 'recorder', 'recorder identity remains battle-compatible');
  assert.equal(fieldKitInspection({ recorder: 'headroom' }).title, 'FIELD RECORDER');
  assert.ok(!fieldKitInspection({ recorder: 'headroom' }).facts.some(([key])=>key==='TRADEOFF'));
  assert.deepEqual(fieldKitInspection({ cosmetics: { flashlightHousing: 'ivory' } }, 'flashlight').materialColors,
    { 'flashlight-housing': '#c5c5ad' });
});
