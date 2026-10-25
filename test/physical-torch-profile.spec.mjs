import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { applyPhysicalTorchProfile, resolveTorchLook } from '../src/render/lighting-model.js';
import { applyFieldKitTorchLook } from '../src/render/field-kit-torch.js';
import { fieldKitEffects } from '../src/game/field-kit.js';
import { applyHushTorchInterference } from '../src/game/hush-field.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import {torchReceiveSample} from '../src/render/torch-optics.js';

test('physical interior beam preserves the real battery, fitted reach and HUSH absorption', () => {
  for (const battery of [0, .08, .3, .8]) for (const on of [false, true])
    for (const flashlight of ['reference', 'throw', 'flood']) {
      const base = resolveTorchLook({ on, battery, perception: .4, reducedEffects: true });
      const fitted = applyFieldKitTorchLook(base, fieldKitEffects({ flashlight }));
      const interfered = applyHushTorchInterference(fitted,
        { active: true, absorption: { light: .68 }, pulse: .4 });
      const physical = applyPhysicalTorchProfile(interfered);
      for (const key of ['band', 'health', 'perception', 'reach', 'hushInterference'])
        assert.equal(physical[key], interfered[key], `${key} must survive the interior beam`);
      assert.ok(physical.power <= interfered.power, 'the physical beam cannot restore lost power');
      if (!on || !battery) assert.equal(physical.power, 0, 'an empty/off lamp stays off');
      assert.ok(physical.coneInner < interfered.coneInner && physical.coneOuter > interfered.coneOuter,
        'the gradual penumbra replaces the hard hotspot');
      assert.ok(physical.shoulder > 0 && physical.spill <= .12);
    }
});

test('the actual architecture and prop shaders bound received lamp highlights', () => {
  for (const profile of ['hall', 'church']) {
  const shoulder = applyPhysicalTorchProfile(resolveTorchLook(), { profile }).shoulder;
  for (const file of ['../src/render/r3d.js', '../src/render/props3d.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(/float lamp\s*=\s*torchReceive\([^;]+,uTorchShoulder\)/.test(source),`${file} must consume the shared physical highlight shoulder`);
    const receive = torchReceiveSample;
    assert.equal(receive(0, shoulder), 0, 'the shoulder adds no light to absence');
    let previous = 0;
    for (const incoming of [.2, 1, 4, 20]) {
      const output = receive(incoming, shoulder);
      assert.ok(output > previous && output < incoming && output < 1 / shoulder,
        'highlights retain ordered surface response below the hard clipping range');
      previous = output;
    }
  }
  }
});

test('church beam leaves received highlight headroom at its authored recording gain', () => {
  for (const battery of [0, .1, .3, 1]) {
    const input = resolveTorchLook({ battery, perception: .4, reducedEffects: true });
    const church = applyPhysicalTorchProfile(input, { profile: 'church' });
    const hall = applyPhysicalTorchProfile(input);
    assert.equal(church.shoulder, 2, 'use the actual renderer shoulder limit');
    assert.ok(church.power <= hall.power / 4, 'close church stone must avoid the former clipped lamp disc');
    if (battery) assert.ok(church.power > 0, 'the player still receives a real handlamp');
    for (const key of ['band', 'health', 'perception', 'reach']) assert.equal(church[key], input[key]);
    assert.equal(hall.shoulder, .75, 'existing physical hall response stays unchanged');
  }
});

test('main applies the physical beam only to the ordinary church', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const sensory = source.match(/const sourceRepriseSensory=[^;]+;/)?.[0];
  const physical = source.match(/const physicalTorchLook=[^;]+;/)?.[0];
  assert.ok(sensory && physical, 'evaluate the real main render wiring');
  const input = { ...resolveTorchLook({ battery: .12, perception: .4, reducedEffects: true }),
    power: .08, reach: .41, hushInterference: .7 };
  const evaluate = ({ sourceActive = false, plan = true, zone = ZONE.church, sensoryProfile = null } = {}) =>
    runInNewContext(`${sensory}\n${physical}\nphysicalTorchLook`, {
      worldView: sensoryProfile ? { sensoryProfile } : null,
      usingSourceSpace: () => sourceActive, usingPlan: () => plan,
      FP: { zoneAt: () => { assert.ok(plan, 'unloaded plan must not be read'); return zone; } },
      ZONE, px: 0, py: 0, hushTorchLook: input, applyPhysicalTorchProfile,
    });
  const ordinary = evaluate();
  assert.notEqual(ordinary, input);
  assert.ok(ordinary.shoulder > 0 && ordinary.power < input.power);
  for (const key of ['band', 'health', 'reach', 'perception', 'hushInterference'])
    assert.equal(ordinary[key], input[key]);
  for (const context of [{ sourceActive: true }, { sensoryProfile: 'source-reprise' },
    { sensoryProfile: 'source-sent-back' }, { zone: ZONE.none }, { plan: false }])
    assert.equal(evaluate(context), input, 'other geography/presentation retains the exact input object');
});
