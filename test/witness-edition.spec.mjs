import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ENDING_IDS, freshMeta, freshRunRecord, normalizeMeta } from '../src/progression/schema.js';
import { deriveUnlocks, diffUnlocks, witnessEditionStatus } from '../src/progression/unlocks.js';
import { returnUnlockDefinition } from '../src/progression/report.js';
import { exportProfile, mergeImportedProfile } from '../src/progression/profile.js';
import { uiWrap } from '../src/render/ui.js';
import {
  FIELD_KIT_OPTIONS, freshFieldKit, normalizeFieldKit, fieldKitEffects,
  fieldKitOptionAvailability, resolveFieldKit, fieldKitForNewRun, fieldKitCosmeticSelection,
} from '../src/game/field-kit.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.get(key) ?? null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}
globalThis.localStorage = new MemoryStorage();
const saveApi = await import('../src/game/save.js');
const { commitReturn } = await import('../src/progression/runtime.js');
const selectedKit = (faceplate = 'witness') => normalizeFieldKit({ headphones: 'closed', microphone: 'wide',
  recorder: 'headroom', cosmetics: { faceplate, buttons: 'sea-glass', vfd: 'ice' } });
const profile = (endingsSeen = []) => ({ ...freshMeta(), endingsSeen });

test('Witness is hidden before any ending and inspectable but locked after one distinct valid ending', () => {
  for (const meta of [null, {}, { endingsSeen: 'sacrifice' }, { endingsSeen: ['unknown', null, 42] }]) {
    const status = witnessEditionStatus(meta);
    assert.deepEqual({ ...status, reason: '' }, { visible: false, owned: false, count: 0, required: 2, endingIds: [], reason: '' });
  }
  const meta = { endingsSeen: ['sacrifice', 'sacrifice', 'unknown'], stats: { endingsSeen: 999 },
    returns: { history: ['a', 'b'], records: { b: { endingId: 'helped' } } } };
  const before = structuredClone(meta);
  const status = witnessEditionStatus(meta);
  assert.equal(status.visible, true);
  assert.equal(status.owned, false);
  assert.equal(status.count, 1);
  assert.deepEqual(status.endingIds, ['sacrifice']);
  assert.match(status.reason, /2 DIFFERENT ENDINGS/);
  assert.match(status.reason, /1 OF 2/);
  assert.deepEqual(meta, before, 'reading availability is pure and does not award anything');
});

test('every pair of distinct valid endings owns Witness, independent of order or difficulty', () => {
  for (const first of ENDING_IDS) for (const second of ENDING_IDS) {
    const meta = { endingsSeen: [second, first, 'unknown', first], difficulty: 'anything',
      challengeCompletions: { deadAir: false } };
    assert.equal(witnessEditionStatus(meta).owned, first !== second, `${first}/${second}`);
    assert.equal(deriveUnlocks(meta).cosmetics.includes('witness'), first !== second);
  }
  const owned = witnessEditionStatus({ cosmetics: { unlocked: ['witness', 'witness'] } });
  assert.equal(owned.visible, true);
  assert.equal(owned.owned, true, 'an earned permanent unlock survives independently of repaired history');
  assert.equal(owned.count, 0);
});

test('second distinct ending adds one cosmetic unlock; repeats and already-earned profiles add none', () => {
  const first = deriveUnlocks(profile(['sacrifice']));
  const second = deriveUnlocks(profile(['helped', 'sacrifice', 'helped']));
  assert.equal(diffUnlocks(first, second).filter((id) => id === 'cosmetic:witness').length, 1);
  assert.equal(second.cosmetics.filter((id) => id === 'witness').length, 1);
  assert.ok(!diffUnlocks(first, deriveUnlocks(profile(['sacrifice', 'sacrifice']))).includes('cosmetic:witness'));
  assert.ok(!diffUnlocks(second, deriveUnlocks(profile(['sacrifice', 'helped', 'surfaced']))).includes('cosmetic:witness'));
});

test('catalog normalization is pure while ownership resolution rejects a locked equipped finish', () => {
  const witness = FIELD_KIT_OPTIONS.cosmetics.faceplate.find((entry) => entry.id === 'witness');
  assert.equal(witness.label, 'WITNESS EDITION');
  assert.deepEqual(witness.effects, {});
  const kit = selectedKit();
  const before = structuredClone(kit);
  assert.equal(normalizeFieldKit(kit).cosmetics.faceplate, 'witness', 'normalization does not consult profile state');
  const locked = fieldKitOptionAvailability(kit, 'faceplate', 'witness', profile(['sacrifice']));
  assert.equal(locked.visible, true);
  assert.equal(locked.available, false, 'equipping or inspecting a locked id cannot authorize itself');
  assert.equal(fieldKitOptionAvailability(kit, 'cosmetics.faceplate', 'witness', profile(['sacrifice', 'helped'])).available, true);
  for (const [group, id] of [['faceplate', 'not-real'], ['buttons', 'witness'], ['__proto__', 'witness']]) {
    const status = fieldKitOptionAvailability(kit, group, id, profile(ENDING_IDS));
    assert.equal(status.visible, false); assert.equal(status.available, false);
  }
  for (const group of ['headphones', 'microphone', 'recorder']) {
    for (const entry of FIELD_KIT_OPTIONS[group]) assert.equal(fieldKitOptionAvailability(null, group, entry.id).available, true);
  }
  assert.equal(fieldKitOptionAvailability(null, 'faceplate', 'aluminum').available, true);
  assert.deepEqual(resolveFieldKit(kit, profile(['sacrifice'])), selectedKit('aluminum'));
  assert.deepEqual(resolveFieldKit(kit, profile(['sacrifice', 'helped'])), kit);
  assert.deepEqual(kit, before);
});

test('fitting Witness has no gameplay effects and never pairs over the chosen keys or phosphor', () => {
  const meta = profile(['sacrifice', 'helped']);
  const kit = selectedKit();
  assert.deepEqual(fieldKitEffects(kit), fieldKitEffects(selectedKit('aluminum')));
  const cosmetics = fieldKitCosmeticSelection(kit, meta);
  assert.equal(cosmetics.selected, 'witness');
  assert.ok(cosmetics.unlocked.includes('witness'));
  assert.deepEqual(Object.keys(cosmetics).sort(), ['selected', 'unlocked']);
  const next = fieldKitForNewRun({ ...meta, cosmetics }, selectedKit('black'));
  assert.deepEqual(next, kit);
  assert.equal(next.cosmetics.buttons, 'sea-glass'); assert.equal(next.cosmetics.vfd, 'ice');
  assert.deepEqual(fieldKitEffects(next), fieldKitEffects(kit));
  assert.deepEqual(meta.cosmetics, freshMeta().cosmetics, 'preference helpers do not mutate profile');
});

test('unknown or locked finish requests preserve prior preference and cannot smuggle a bundled theme', () => {
  const meta = { ...profile(['sacrifice']), cosmetics: { unlocked: ['source-clean'], selected: 'olive' } };
  for (const value of [selectedKit(), { cosmetics: { faceplate: 'forged', buttons: 'classic', vfd: 'amber' } }, null]) {
    assert.deepEqual(fieldKitCosmeticSelection(value, meta), meta.cosmetics);
  }
  const forged = { ...meta, cosmetics: { ...meta.cosmetics, selected: 'witness' } };
  assert.equal(fieldKitForNewRun(forged).cosmetics.faceplate, 'aluminum');
  assert.equal(fieldKitForNewRun({ ...meta, cosmetics: { selected: 'source-clean' } }).cosmetics.faceplate, 'aluminum',
    'legacy non-faceplate cosmetic ids are not interpreted as a recorder finish');
  assert.equal(fieldKitCosmeticSelection(selectedKit('black'), meta).selected, 'black');
});

test('actual return commits grant Witness once at the second distinct ending on every difficulty', async () => {
  for (const preset of ['story', 'contract', 'night', 'dead-air', 'custom', 'god']) {
    const meta = profile(['sacrifice']);
    const run = freshRunRecord({ preset, meta, id: `witness-${preset}`, now: 1000 });
    await saveApi.withTransientGameState({ save: saveApi.freshSave({ run }), meta }, () => {
      const summary = commitReturn('helped', {}, 2000);
      assert.equal(summary.newlyUnlockedFeatures.filter((id) => id === 'cosmetic:witness').length, 1, preset);
      assert.ok(saveApi.getMeta().cosmetics.unlocked.includes('witness'), preset);
      assert.equal(commitReturn('surfaced', {}, 3000).id, summary.id);
      assert.deepEqual(saveApi.getMeta().endingsSeen, ['sacrifice', 'helped']);
      assert.equal(saveApi.getMeta().cosmetics.unlocked.filter((id) => id === 'witness').length, 1);
    });
  }
  const meta = profile(['sacrifice']);
  await saveApi.withTransientGameState({ save: saveApi.freshSave({ run: freshRunRecord({ meta, id: 'duplicate-ending' }) }), meta }, () => {
    assert.ok(!commitReturn('sacrifice').newlyUnlockedFeatures.includes('cosmetic:witness'));
    assert.equal(witnessEditionStatus(saveApi.getMeta()).owned, false);
  });
});

test('legacy profiles unlock retroactively and save boundaries reject unauthorized Witness equipment', async () => {
  for (const endings of [['sacrifice'], ['sacrifice', 'sacrifice', 'unknown'], ['sacrifice', 'helped', 'unknown']]) {
    const owned = new Set(endings.filter((id) => ENDING_IDS.includes(id))).size >= 2;
    await saveApi.withTransientGameState({ save: { ...saveApi.freshSave(), fieldKit: selectedKit() }, meta: profile(endings) }, () => {
      assert.equal(saveApi.getMeta().cosmetics.unlocked.includes('witness'), owned);
      assert.equal(saveApi.getSave().fieldKit.cosmetics.faceplate, owned ? 'witness' : 'aluminum');
      assert.equal(saveApi.getSave().fieldKit.cosmetics.buttons, 'sea-glass');
      assert.equal(saveApi.getSave().fieldKit.cosmetics.vfd, 'ice');
      saveApi.saveCommit({ fieldKit: selectedKit() });
      assert.equal(saveApi.getSave().fieldKit.cosmetics.faceplate, owned ? 'witness' : 'aluminum');
    });
  }
});

test('finish preference and permanent ownership survive serialization, profile import, and actual new runs', () => {
  globalThis.localStorage = new MemoryStorage();
  saveApi.saveLoad();
  saveApi.metaCommit({ endingsSeen: ['sacrifice', 'helped'] });
  saveApi.metaCommit({ cosmetics: fieldKitCosmeticSelection(selectedKit(), saveApi.getMeta()) });
  const json = JSON.parse(globalThis.localStorage.getItem('chunk-surfer:meta:v2'));
  assert.equal(json.cosmetics.selected, 'witness');
  assert.ok(json.cosmetics.unlocked.includes('witness'));
  assert.deepEqual(normalizeMeta(json).cosmetics, json.cosmetics);
  const exported = JSON.parse(JSON.stringify(exportProfile(saveApi.getMeta(), saveApi.getSave().settings)));
  const imported = mergeImportedProfile(freshMeta(), {}, exported);
  assert.equal(imported.ok, true); assert.equal(imported.meta.cosmetics.selected, 'witness');
  assert.equal(witnessEditionStatus(imported.meta).owned, true);
  saveApi.saveLoad();
  let run = saveApi.newGame({ prepareInVan: true, now: 4000 });
  assert.equal(run.fieldKit.cosmetics.faceplate, 'witness');
  assert.deepEqual(fieldKitEffects(run.fieldKit), fieldKitEffects(), 'new runs still reset physical hardware');
  assert.equal(run.fieldKit.cosmetics.buttons, freshFieldKit().cosmetics.buttons);
  assert.equal(run.fieldKit.cosmetics.vfd, freshFieldKit().cosmetics.vfd);
  saveApi.metaCommit({ cosmetics: fieldKitCosmeticSelection(selectedKit('olive'), saveApi.getMeta()) });
  run = saveApi.newGame({ prepareInVan: true, now: 5000 });
  assert.equal(run.fieldKit.cosmetics.faceplate, 'olive', 'declining Witness is itself a lasting preference');
  assert.ok(saveApi.getMeta().cosmetics.unlocked.includes('witness'));
});

test('return report names the actual unlock and renders fit-at-van guidance without truncating it', () => {
  const definition = returnUnlockDefinition('cosmetic:witness');
  assert.equal(definition.label, 'WITNESS EDITION');
  assert.match(definition.description, /PERMANENT RECORDER FINISH/);
  assert.match(definition.description, /FIT AT THE VAN/);
  assert.equal(returnUnlockDefinition('cosmetic:other'), null);
  const source = readFileSync(new URL('../src/game/return-report.js', import.meta.url), 'utf8');
  const start = source.indexOf("if (current === 'unlocks') {");
  const end = source.indexOf("if (current === 'second-shift')", start);
  assert.ok(start > 0 && end > start);
  for (const w of [32, 52, 88]) {
    const lines = [], body = { x: 0, y: 0, w, h: 20 };
    vm.runInNewContext(`(function(){${source.slice(start, end)}})()`, {
      body, current: 'unlocks', currentStage: { ids: ['cosmetic:witness'] }, FEATURE_COPY: {}, UI_COLOR: {},
      returnUnlockDefinition, uiWrap, drawVfdText() {}, uiText(x, y, text) { lines.push({ x, y, text }); },
    });
    const rendered = lines.map((line) => line.text).join(' ');
    assert.match(rendered, /WITNESS EDITION/); assert.match(rendered, /FIT AT THE VAN\./);
    assert.doesNotMatch(rendered, /DISPLAY \/ WITNESS/);
    for (const line of lines) { assert.ok(line.x + line.text.length <= w); assert.ok(line.y < body.h); }
  }
});
