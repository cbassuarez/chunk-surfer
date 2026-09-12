import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_KIT_OPTIONS, freshFieldKit, normalizeFieldKit, fieldKitEffects, fieldKitSummary, fieldKitInspection, normalizeFieldKitOwnership } from '../src/game/field-kit.js';
import { normalizeEquipment } from '../src/game/bag-model.js';
import { isBattleGear } from '../src/game/combat-loadout.js';

test('reference kit preserves every existing gameplay value', () => {
  assert.deepEqual(normalizeFieldKit(), freshFieldKit());
  assert.deepEqual(Object.values(fieldKitEffects()), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  for (const group of ['headphones', 'microphone', 'recorder', 'flashlight']) {
    assert.equal(FIELD_KIT_OPTIONS[group].length, 3);
    assert.equal(new Set(FIELD_KIT_OPTIONS[group].map((option) => option.id)).size, 3);
  }
});

test('every hardware sidegrade has an explicit bounded benefit and cost', () => {
  for (const group of ['headphones', 'microphone', 'recorder']) {
    for (const option of FIELD_KIT_OPTIONS[group].slice(1)) {
      const values = Object.values(fieldKitEffects({ [group]: option.id })).filter((value) => value !== 1);
      assert.equal(values.length, 2, `${group}/${option.id}`);
      const cheaperIsBetter = new Set(['recordingNoiseScale', 'takeDurationScale', 'torchDrainScale']);
      const advantages = Object.entries(option.effects).map(([key, value]) => (value - 1) * (cheaperIsBetter.has(key) ? -1 : 1));
      assert.ok(advantages.some((value) => value < 0), 'every option has a real cost');
      assert.ok(advantages.some((value) => value > 0), 'every option has a real benefit');
      assert.ok(values.every((value) => value >= .8 && value <= 1.2));
      assert.match(option.description, /10%|15%/);
    }
  }
});

test('cosmetics cannot change gameplay or accessibility and combine independently', () => {
  const hardware = { headphones: 'closed', microphone: 'wide', recorder: 'headroom' };
  const baseline = fieldKitEffects(hardware);
  for (const faceplate of FIELD_KIT_OPTIONS.cosmetics.faceplate) {
    for (const buttons of FIELD_KIT_OPTIONS.cosmetics.buttons) {
      for (const vfd of FIELD_KIT_OPTIONS.cosmetics.vfd) {
        const kit = normalizeFieldKit({ ...hardware, cosmetics: { faceplate: faceplate.id, buttons: buttons.id, vfd: vfd.id } });
        assert.deepEqual(fieldKitEffects(kit), baseline);
        assert.deepEqual(Object.keys(kit.cosmetics), ['faceplate', 'buttons', 'vfd', 'flashlightHousing']);
      }
    }
  }
});

test('all 27 hardware combinations remain bounded without compounding into a hidden difficulty', () => {
  for (const headphones of FIELD_KIT_OPTIONS.headphones) {
    for (const microphone of FIELD_KIT_OPTIONS.microphone) {
      for (const recorder of FIELD_KIT_OPTIONS.recorder) {
        const effects = fieldKitEffects({ headphones: headphones.id, microphone: microphone.id, recorder: recorder.id });
        assert.ok(Object.values(effects).every((scale) => Number.isFinite(scale) && scale >= .8 && scale <= 1.2));
        assert.deepEqual(Object.keys(effects), ['monitorGainScale', 'surroundingGainScale', 'recordingNoiseScale',
          'takeDurationScale', 'spoilToleranceScale', 'torchDrainScale',
          'flashlightReachScale', 'flashlightConeScale', 'flashlightDrainScale']);
      }
    }
  }
});

test('save normalization allowlists selectors and rejects supplied effects or device settings', () => {
  for (const value of [null, false, 'closed', [], 17]) assert.deepEqual(normalizeFieldKit(value), freshFieldKit());
  const forged = normalizeFieldKit({ schema: 900, headphones: 'https://example.org', microphone: '__proto__', recorder: 4,
    effects: { spoilToleranceScale: 99 }, micInput: { deviceId: 'secret' },
    cosmetics: { faceplate: 'file:///tmp/foo', buttons: '<button>', vfd: 'unlisted', brightness: 100 } });
  assert.deepEqual(forged, freshFieldKit());
  const current = normalizeFieldKit({ headphones: 'closed', cosmetics: { faceplate: 'olive' } });
  assert.deepEqual(normalizeFieldKit(current), current);
  const another = freshFieldKit(); another.cosmetics.faceplate = 'black';
  assert.equal(freshFieldKit().cosmetics.faceplate, 'aluminum');
});

test('only legacy bag ownership migrates to fitted equipment; new shells do not grant kit', () => {
  const old = { 'bag.taken': true, unrelated: true };
  const migrated = normalizeFieldKitOwnership(old);
  assert.deepEqual(migrated, { ...old, 'kit.taken': true, 'kit.fitted': true, 'van.difficulty.chosen': true });
  assert.equal(old['kit.taken'], undefined);
  assert.deepEqual(normalizeFieldKitOwnership(migrated), migrated);
  const modern = { 'van.preparation.v1': true, 'bag.taken': true };
  assert.deepEqual(normalizeFieldKitOwnership(modern), modern);
  assert.deepEqual(normalizeFieldKitOwnership({}), {});
});

test('inventory and inspection summaries identify the fitted models and their exact effects', () => {
  const kit={headphones:'closed',microphone:'directional',recorder:'headroom',cosmetics:{faceplate:'olive',buttons:'signal',vfd:'ice'}};
  const summary=fieldKitSummary(kit);
  assert.equal(summary.title,'FIELD RECORDER');
  assert.equal(summary.subtitle,'DIRECTIONAL MIC / CLOSED BACK HEADPHONES');
  assert.equal(summary.hardware.microphone.id,'directional');
  assert.equal(summary.cosmetics.faceplate.id,'olive');
  assert.deepEqual(summary.effects,fieldKitEffects(kit));
  for(const group of ['headphones','microphone','recorder']){
    const option=FIELD_KIT_OPTIONS[group].find((entry)=>entry.id===kit[group]);
    assert.ok(summary.facts.some(([,value])=>value===option.description));
    assert.ok(summary.description.includes(option.description));
  }
  assert.ok(summary.facts.some(([label,value])=>label==='FINISH'&&value.includes('OLIVE')&&value.includes('ICE BLUE')));
  assert.doesNotMatch(summary.description,/uninterrupted minute|stereo|permission/i);
  summary.hardware.recorder.label='MUTATED';summary.facts[0][1]='MUTATED';
  assert.equal(fieldKitSummary(kit).hardware.recorder.label,'HIGH HEADROOM');
  assert.deepEqual(fieldKitSummary({headphones:'unknown'}),fieldKitSummary());
});

test('fitted item inspection keeps exact model IDs and never gives headphones or microphones a battle slot', () => {
  for(const group of ['headphones','microphone','recorder'])for(const option of FIELD_KIT_OPTIONS[group]){
    const raw=fieldKitInspection({[group]:option.id},group);
    const entry=normalizeEquipment(raw);
    const expected=group==='recorder'?'recorder':`${group}-${option.id}`;
    assert.equal(raw.id,expected);assert.equal(entry.sourceId,expected);assert.equal(entry.id,`gear:${expected}`);
    assert.ok(group==='recorder'?entry.title==='FIELD RECORDER':entry.title.includes(option.label));
    if(group!=='recorder')assert.equal(entry.description,option.description);
    else assert.match(entry.description,/Capture, monitor, and replay/);
    assert.deepEqual(entry.facts[0],['POSITION','CARRIED']);
    assert.equal(isBattleGear(expected),group==='recorder');
    assert.equal(raw.battleCapable,group==='recorder');
    assert.equal(entry.actions.primary,null);
    assert.equal(entry.facts.some(([key])=>key==='BATTLE'),group==='recorder');
    assert.doesNotMatch(entry.description,/one uninterrupted minute/);
    const fallback=normalizeEquipment({id:expected});
    assert.equal(fallback.sourceId,expected);
    assert.notEqual(fallback.subtitle,'FIELD EQUIPMENT','variants receive their real equipment family');
  }
  assert.equal(fieldKitInspection({},'radio'),null);
  assert.equal(normalizeEquipment({id:'headphones-counterfeit'}).subtitle,'FIELD EQUIPMENT');
});
