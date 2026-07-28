import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  applyFieldPresentationPolicy,
  applyHushTorchInterference,
  computeHushField,
  effectiveTorchScale,
  hushAbsenceLook,
} from '../src/game/hush-field.js';
import { hushMixTargets } from '../src/audio/hush-mix.js';

const operator = { position: { x: 0, y: 0 }, roomId: 'room', floorId: 'g' };
const at = (x, options = {}) => applyFieldPresentationPolicy(computeHushField({
  hush: { active: true, position: { x, y: 0 }, roomId: 'room', floorId: 'g' },
  operator,
  now: options.now ?? 1000,
  occlusion: options.occlusion ?? 0,
}), options.settings || {});

test('the sensory trace precedes contact and strengthens monotonically', () => {
  const far = at(50);
  const near = at(34);
  const engulf = at(20);
  assert.equal(far.stage, 'trace');
  assert.equal(near.stage, 'near');
  assert.equal(engulf.stage, 'engulf');
  assert.ok(far.absorption.light < near.absorption.light);
  assert.ok(near.absorption.light < engulf.absorption.light);
  assert.ok(far.absorption.audio < near.absorption.audio);
  assert.ok(near.absorption.audio < engulf.absorption.audio);
});

test('geometry suppresses remote torch interference without deleting the local absence', () => {
  const open = at(20);
  const blocked = at(20, { occlusion: 1 });
  assert.ok(blocked.absorption.light < open.absorption.light * .2);
  assert.ok(blocked.absorption.audio < open.absorption.audio);
  assert.ok(hushAbsenceLook({ active: true, field: blocked }).strength >= .88);
  assert.deepEqual(hushAbsenceLook({ active: false, field: open }), { active: false, strength: 0, radiusM: 0 });
});

test('HUSH interference corrupts the whole torch contract without spending battery', () => {
  const torch = {
    band: 'clean', health: .8, power: 1, reach: 1,
    color: [1, .94, .82], coneInner: .88, coneOuter: .94, spill: .05,
  };
  const field = at(20);
  const corrupted = applyHushTorchInterference(torch, field);
  assert.equal(corrupted.health, torch.health);
  assert.equal(corrupted.band, torch.band);
  assert.ok(corrupted.power < torch.power);
  assert.ok(corrupted.reach < torch.reach);
  assert.ok(corrupted.coneInner > torch.coneInner);
  assert.ok(corrupted.spill < torch.spill);
  assert.equal(corrupted.power, effectiveTorchScale(field));
});

test('flicker-off keeps steady dimming and sound still collapses in the inner field', () => {
  const lowPulse = at(10, { now: 0, settings: { hushLightFlicker: 'off' } });
  const highPulse = { ...lowPulse, pulse: 1 };
  assert.equal(effectiveTorchScale(lowPulse), effectiveTorchScale(highPulse));
  assert.ok(effectiveTorchScale(lowPulse) < .65);
  const mix = hushMixTargets(lowPulse, {}, { monitorGain: 1, monitorOpen: true });
  assert.ok(mix.worldGain < .25);
  assert.ok(mix.worldLowpassHz < 1800);
  assert.ok(mix.monitorDryGain < .2);
});

test('the final absence pass consumes props, practicals, and beacons together', async () => {
  const renderer = await readFile(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  const propComposite = renderer.indexOf('if(propView < archView + 0.015){ col = prop.rgb; zView = propView; }');
  const absencePass = renderer.indexOf('// The HUSH is not a dark decal on the walls');
  assert.ok(propComposite >= 0 && absencePass > propComposite, 'HUSH absorption runs after the mesh-prop composite');
  assert.match(renderer, /uHush;\s*\/\/ x, z, absorption strength, radius in metres/);
  assert.match(renderer, /state\.hush\?\.radiusM \?\? 0/);
  assert.match(renderer, /float surfaceSpan=min\(span,[\s\S]*?float s = clamp\([\s\S]*?surfaceSpan\)/,
    'the absence clips to the nearest composed surface instead of projecting through props');
});
