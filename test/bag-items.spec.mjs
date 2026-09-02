import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BAG_ACTION_MODE,
  BAG_AUTOMATIC_USE,
  BAG_ITEM_REGISTRY,
  COLLECTED_ITEM_AUDIT,
  bagInspectionDialogue,
  bagKeyFacts,
  resolveBagItemAction,
  resolveBagOwnership,
} from '../src/game/bag-items.js';
import { bagEntry, buildBagModel } from '../src/game/bag-model.js';
import { repairBagSelection } from '../src/game/bag-navigation.js';
import { makeBagScene } from '../src/game/bag.js';
import { isBattleGear } from '../src/game/combat-loadout.js';
import { bagKitDetailAction } from '../src/render/bag-view.js';
import { PAGES } from '../src/data/conservatory-script.js';
import { SOURCE_PAGES } from '../src/data/source-pages.js';

const ALLOWED_DESTINATIONS = new Set([
  'kit', 'keyring', 'file', 'battery-resource', 'skill-resource',
  'external-load', 'transient-source-document',
]);

test('every collected-object family has exactly one audited destination', () => {
  assert.equal(new Set(COLLECTED_ITEM_AUDIT.map((entry) => entry.id)).size, COLLECTED_ITEM_AUDIT.length);
  assert.ok(COLLECTED_ITEM_AUDIT.length >= 18, 'starter gear, conditional pickups, keys, documents, resources, and external loads are covered');
  for (const entry of COLLECTED_ITEM_AUDIT) {
    assert.ok(entry.acquired, `${entry.id} has an acquisition condition`);
    assert.ok(ALLOWED_DESTINATIONS.has(entry.destination), `${entry.id} has one supported destination`);
  }
  assert.equal(COLLECTED_ITEM_AUDIT.find((entry) => entry.id === 'plant-stillson').destination, 'external-load');
  assert.equal(COLLECTED_ITEM_AUDIT.find((entry) => entry.id === 'source-sheets').destination, 'transient-source-document');
  assert.equal(COLLECTED_ITEM_AUDIT.find((entry) => entry.id === 'building-pages:1-15').destination, 'file');
  assert.equal(PAGES.length, 15, 'the complete bounded building-page family is represented');
  assert.ok(SOURCE_PAGES.length > 0, 'Source has read-in-place documents covered by the transient family');
});

test('the action resolver exposes the full semantic descriptor contract', () => {
  assert.deepEqual(Object.keys(BAG_ITEM_REGISTRY).sort(), [
    'coffee', 'interface', 'keyring', 'light', 'map', 'marble-eyes',
    'plant-spanner', 'radio', 'recorder', 'sheet-music', 'tuning-fork',
  ]);
  const cases = [
    ['light', {}, 'light-toggle', 'TURN ON', BAG_ACTION_MODE.COMMAND],
    ['light', { lightOn: true }, 'light-toggle', 'TURN OFF', BAG_ACTION_MODE.COMMAND],
    ['recorder', {}, 'recorder-command', 'MONITOR', BAG_ACTION_MODE.COMMAND],
    ['recorder', { listening: true }, 'recorder-command', 'ROLL', BAG_ACTION_MODE.COMMAND],
    ['map', {}, 'map-open', 'OPEN MAP', BAG_ACTION_MODE.OPEN],
    ['radio', {}, 'radio-call', 'CALL FRONT DESK', BAG_ACTION_MODE.DIALOG],
    ['radio', { present: false, dropped: true }, 'radio-show-map', 'SHOW ON MAP', BAG_ACTION_MODE.OPEN],
    ['interface', {}, 'inspect-interface', 'INSPECT', BAG_ACTION_MODE.DIALOG],
    ['tuning-fork', {}, 'inspect-tuning-fork', 'INSPECT', BAG_ACTION_MODE.DIALOG],
    ['coffee', {}, 'coffee-drink', 'DRINK', BAG_ACTION_MODE.CONSUME],
    ['plant-spanner', {}, 'inspect-plant-spanner', 'INSPECT', BAG_ACTION_MODE.DIALOG],
    ['marble-eyes', {}, 'inspect-marble-eyes', 'INSPECT', BAG_ACTION_MODE.DIALOG],
    ['keyring', {}, 'inspect-keyring', 'CHECK KEYS', BAG_ACTION_MODE.DIALOG],
    ['sheet-music', {}, 'sheet-read', 'READ IT', BAG_ACTION_MODE.CONSUME],
  ];

  for (const [id, context, actionId, label, mode] of cases) {
    const action = resolveBagItemAction(id, context);
    assert.deepEqual(
      Object.keys(action).sort(),
      ['closeBefore', 'confirm', 'enabled', 'id', 'label', 'mode', 'reason'].sort(),
      `${id} uses the stable descriptor shape`,
    );
    assert.equal(action.enabled, true, `${id} action is enabled`);
    assert.equal(action.id, actionId);
    assert.equal(action.label, label);
    assert.equal(action.mode, mode);
  }

  const coffee = resolveBagItemAction('coffee');
  assert.deepEqual(coffee.confirm, { title: 'DRINK THE COFFEE?', body: 'THIS CANNOT BE UNDONE.' });
  assert.equal(coffee.closeBefore, true);
  const missing = resolveBagItemAction('radio', { present: false, missing: true });
  assert.equal(missing.enabled, false);
  assert.equal(missing.reason, 'ITEM NOT CARRIED');
  for (const [context, reason] of [
    [{radioDead:true}, 'NO CARRIER'],
    [{radioUnavailableReason:'NO FRONT DESK SIGNAL HERE'}, 'NO FRONT DESK SIGNAL HERE'],
    [{recording:true}, 'NOT WHILE RECORDING'],
    [{listening:true}, 'RECORDER CHANNEL OPEN'],
    [{inCombat:true}, 'NOT WHILE IT IS LOOKING AT YOU'],
    [{radioChannelOccupied:true}, 'CHANNEL OCCUPIED'],
  ]) {
    const disabled = resolveBagItemAction('radio', context);
    assert.equal(disabled.id, 'radio-call');
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.reason, reason);
  }
  assert.equal(resolveBagItemAction('tuning-fork',{sourceTargetFocused:true}).id,'inspect-tuning-fork',
    'Source focus cannot turn the combat fork into an exploration command');
});

test('ownership transitions keep each acquisition in one truthful case home', () => {
  assert.deepEqual(resolveBagOwnership({}), { caseOwned: false, kit: [], filesAvailable: false, keyring: null });

  const starter = resolveBagOwnership({ bagTaken: true });
  assert.deepEqual(starter.kit, ['light', 'recorder', 'map', 'radio']);
  assert.equal(starter.filesAvailable, true);
  assert.equal(starter.keyring, null, 'the keyring is absent before the guard handoff');

  const completeState = {
    bagTaken: true,
    masterKey: true,
    chapelKey: true,
    chapelIdentified: false,
    servicesKey: true,
    interfaceOwned: true,
    forkOwned: true,
    spannerOwned: true,
    marbleCarried: true,
    coffeeOwned: true,
    coffeeConsumed: false,
  };
  const acquired = resolveBagOwnership(completeState);
  assert.deepEqual(acquired.kit, [
    'light', 'recorder', 'map', 'radio', 'interface', 'tuning-fork',
    'plant-spanner', 'marble-eyes', 'coffee',
  ]);
  assert.deepEqual(acquired.keyring, {
    master: true, chapel: true, chapelIdentified: false, services: true, visible: true,
  });
  assert.ok(!acquired.kit.includes('plant-stillson'));

  const afterUse = resolveBagOwnership({ ...completeState, coffeeConsumed: true, marbleCarried: false });
  assert.ok(!afterUse.kit.includes('coffee'), 'consumption removes the cup');
  assert.ok(!afterUse.kit.includes('marble-eyes'), 'returning the eyes removes them from the case');
  assert.ok(afterUse.kit.includes('plant-spanner'), 'automatic puzzle use does not destroy the spanner');
  assert.deepEqual(resolveBagOwnership(completeState), acquired, 'the same persisted facts reconstruct the same inventory after reload');

  assert.equal(resolveBagItemAction('light', { present: false, missing: true }).enabled, false);
  assert.equal(resolveBagItemAction('light', { present: true, missing: false }).enabled, true, 'recovery re-enables the canonical command');
});

test('automatic exploration use is limited to keys and the two puzzle objects', () => {
  assert.deepEqual(Object.keys(BAG_AUTOMATIC_USE).sort(), ['keyring', 'marble-eyes', 'plant-spanner']);
  assert.equal(BAG_AUTOMATIC_USE.keyring.targets[0], 'locked-door');
  assert.equal(BAG_AUTOMATIC_USE['plant-spanner'].targets[0], 'plant-header-valve');
  assert.equal(BAG_AUTOMATIC_USE['marble-eyes'].targets[0], 'academic-bust');
  for (const id of ['keyring', 'marble-eyes', 'plant-spanner']) assert.equal(isBattleGear(id), false);
});

test('the keyring facts and inspection list all acquired keys in one entry', () => {
  const facts = bagKeyFacts({ master: true, chapel: true, chapelIdentified: false, services: true });
  assert.deepEqual(facts.slice(2), [
    ['MASTER', 'BUILDING MASTER'],
    ['C-17', 'UNIDENTIFIED TAG'],
    ['PLANT', 'PLANT SERVICES'],
  ]);
  assert.equal(bagKeyFacts({ chapel: true, chapelIdentified: true })[2][1], 'CHAPEL');
  const dialogue = bagInspectionDialogue('keyring', { master: true, chapel: true, chapelIdentified: true, services: true });
  assert.match(dialogue.start.lines.map((line) => line.text).join(' '), /Building master/);
  assert.match(dialogue.start.lines.map((line) => line.text).join(' '), /C-seventeen\. Chapel/);
  assert.match(dialogue.start.lines.map((line) => line.text).join(' '), /PLANT SERVICES/);
});

test('deployed radio stays actionable and detail copy never invents a verb', () => {
  const deployedAction = resolveBagItemAction('radio', { present: false, dropped: true });
  const model = buildBagModel({
    equipment: [
      { id: 'radio', present: false, deployed: true, location: 'DEPLOYED · PLANT', primaryAction: deployedAction, battleCapable: true },
      { id: 'plant-spanner', present: true, primaryAction: resolveBagItemAction('plant-spanner') },
      { id: 'unknown-keepsake', present: true },
      { id: 'map', present: false, primaryAction: resolveBagItemAction('map', { present: false, missing: true }) },
    ],
    loadout: { top: ['radio'] },
  });
  const radio = bagEntry(model, 'kit', 'gear:radio');
  assert.equal(radio.present, false);
  assert.equal(radio.compartment, 'storage', 'deployed gear is not depicted in the quick slots');
  assert.equal(radio.actions.primary.label, 'SHOW ON MAP');
  assert.equal(radio.actions.secondary, null, 'a deployed radio cannot remain in a quick slot');
  assert.match(bagKitDetailAction(radio), /SHOW ON MAP/);

  const keepsake = bagEntry(model, 'kit', 'gear:unknown-keepsake');
  assert.equal(bagKitDetailAction(keepsake), 'NO ACTION AVAILABLE FROM THE BAG');
  assert.doesNotMatch(bagKitDetailAction(keepsake), /\[/, 'no dead button glyph is printed');
  const map = bagEntry(model, 'kit', 'gear:map');
  assert.equal(bagKitDetailAction(map), 'ITEM NOT CARRIED');
  assert.doesNotMatch(bagKitDetailAction(map), /\[/);
});

test('legacy per-key selections migrate to the aggregated keyring', () => {
  const model = buildBagModel({ equipment: [{ id: 'keyring', primaryAction: resolveBagItemAction('keyring') }] });
  for (const legacy of ['gear:chapel-key', 'gear:key-c17', 'gear:services-core-key']) {
    const repaired = repairBagSelection({ sectionId: 'kit', selected: { kit: legacy } }, model);
    assert.equal(repaired.selected.kit, 'gear:keyring');
  }
});

test('the bag emits one semantic item intent instead of invoking entry callbacks', () => {
  const intents = [];
  const scene = makeBagScene({
    equipment: [{ id: 'light', present: true, battleCapable: true, primaryAction: resolveBagItemAction('light') }],
    onItemAction: (intent) => { intents.push(intent); return { handled: true }; },
  });
  scene.enter();
  scene.key({ key: 'Enter', code: 'Enter' });
  scene.key({ key: 'ArrowDown', code: 'ArrowDown' });
  scene.key({ key: 'Enter', code: 'Enter' });
  assert.deepEqual(intents, [{
    itemId: 'light',
    entryId: 'gear:light',
    actionId: 'light-toggle',
    mode: 'use',
  }]);
});

test('main integrates ownership, one dispatcher, automatic world use, and external Stillson handling', () => {
  const source = readFileSync('src/main.js', 'utf8');
  const equipmentBody = source.slice(source.indexOf('function bagEquipment()'), source.indexOf('function moveBagCombatEquipment'));
  assert.match(equipmentBody, /bagTaken:flagTest\('bag\.taken'\)/);
  assert.match(equipmentBody, /if\(!ownership\.caseOwned\)return \[\]/);
  assert.match(equipmentBody, /resolveBagItemAction/);
  assert.match(equipmentBody, /servicesKey:playerKeys\.has\('services-core'\)/);
  assert.doesNotMatch(equipmentBody, /plant-stillson/);
  assert.doesNotMatch(equipmentBody, /\baction\s*:/, 'live entries carry descriptors, not callbacks');

  const openBody = source.slice(source.indexOf('function openBag('), source.indexOf('function openMapFromBag'));
  assert.match(openBody, /bag\.taken/);
  assert.match(openBody, /onItemAction:dispatchBagItemAction/);
  assert.match(source, /function consumeCoffee\(/, 'bag and battle coffee share one irreversible handler');
  assert.match(source, /DROP STILLSON/);
  assert.match(source, /PLANT\.hasPlantSpanner\(\)\?PLANT\.PLANT_TOOL\.SPANNER/, 'carried spanner remains the automatic first choice');
  assert.match(source, /playerKeys\.has\(doorHud\.portal\.keyId\)/, 'doors continue to use held keys automatically');
  const bustBody = source.slice(source.indexOf('function talkToBust('), source.indexOf('function inspectAcademicBust'));
  assert.match(bustBody, /HEAD\.carryingMarbleHead\(\)/, 'bust interaction tests the carried eyes automatically');
  assert.match(bustBody, /HEAD\.marbleHeadFits\(propId\)/, 'wrong and matching busts stay target-specific');
});
