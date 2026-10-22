import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BAG_ACTION_MODE, BAG_AUTOMATIC_USE, BAG_ITEM_REGISTRY, COLLECTED_ITEM_AUDIT,
  bagInspectionDialogue, resolveBagOwnership, resolveBagItemAction,
} from '../src/game/bag-items.js';
import { PUB_BARTENDER_ID, PUB_FAVORS, reducePubQuest, pubQuestState } from '../src/game/pub-quest.js';

const atBar = { actorId: PUB_BARTENDER_ID, inPerson: true };
const apply = (flags, action, context) => reducePubQuest(flags, action, context).flags;
const accepted = flags => apply(flags, 'accept', atBar);
const waters = flags => apply(accepted(flags), 'take-tray', { atTray: true });
const served = flags => apply(waters(flags), 'serve-waters', { actorId: 'pub-patron-ed', inPerson: true });
const empties = flags => apply(served(flags), 'collect-empties', { actorId: 'pub-patron-farah', inPerson: true });
const barDone = flags => apply(empties(flags), 'return-tray', atBar);
const carry = (flags, id) => apply(apply(flags, `accept-${id}`, atBar), `take-${id}`, { atItem: true, itemId: id, propId: PUB_FAVORS[id].propId });
const returned = (flags, id) => apply(carry(flags, id), `return-${id}`, atBar);
const pubIds = ['pub-service-tray', 'pub-opener', 'pub-orderbook'];
const visible = flags => resolveBagOwnership({ bagTaken: true, flags }).kit.filter(id => pubIds.includes(id));

test('the three carried pub objects are audited keepsakes with inspection-only action ids', () => {
  const commands = ['inspect-pub-tray', 'inspect-pub-opener', 'inspect-pub-orderbook'];
  for (let index = 0; index < pubIds.length; index++) {
    const id = pubIds[index];
    assert.equal(BAG_ITEM_REGISTRY[id].role, 'quest-keepsake');
    assert.equal(BAG_ITEM_REGISTRY[id].automaticUse, null);
    assert.equal(BAG_AUTOMATIC_USE[id], undefined);
    assert.equal(COLLECTED_ITEM_AUDIT.find(entry => entry.id === id).destination, 'kit');
    const action = resolveBagItemAction(id);
    assert.equal(action.id, commands[index]);
    assert.equal(action.mode, BAG_ACTION_MODE.DIALOG);
    assert.equal(action.label, 'INSPECT');
    assert.equal(action.confirm, null);
    assert.equal(action.closeBefore, false);
    assert.equal(resolveBagItemAction(id, { present: false }).enabled, false);
    assert.equal(resolveBagItemAction(id, { missing: true }).enabled, false);
  }
});

test('only a tray actually picked up remains carried through waters and empties until returned', () => {
  assert.deepEqual(visible({}), []);
  assert.deepEqual(visible(accepted({})), []);
  for (const flags of [waters({}), served({}), empties({})]) {
    assert.deepEqual(visible(flags), ['pub-service-tray']);
    assert.deepEqual(visible(JSON.parse(JSON.stringify(flags))), ['pub-service-tray']);
  }
  assert.deepEqual(visible(barDone({})), []);
  assert.deepEqual(visible({ 'pub.help.trayTaken': true }), []);
  assert.deepEqual(visible({ 'pub.help.trayTaken': true, 'pub.help.accepted': true, 'pub.help.complete': true }), []);
});

test('borrowed school objects appear only while truthfully carried and disappear on in-person return', () => {
  const bar = barDone({});
  assert.deepEqual(visible(apply(bar, 'accept-opener', atBar)), []);
  const opener = carry(bar, 'opener');
  assert.deepEqual(visible(opener), ['pub-opener']);
  assert.deepEqual(visible(JSON.parse(JSON.stringify(opener))), ['pub-opener']);
  assert.deepEqual(visible(returned(bar, 'opener')), []);
  const openerBack = returned(bar, 'opener');
  const book = carry(openerBack, 'orderbook');
  assert.deepEqual(visible(book), ['pub-orderbook']);
  assert.deepEqual(visible(JSON.parse(JSON.stringify(book))), ['pub-orderbook']);
  const done = returned(openerBack, 'orderbook');
  assert.equal(pubQuestState(done).sourceUnlocked, true);
  assert.deepEqual(visible(done), []);
  assert.deepEqual(visible({ 'pub.help.opener.carried': true, 'pub.help.orderbook.carried': true }), []);
  assert.deepEqual(visible({ 'pub.help.complete': true, 'pub.help.opener.carried': true }), []);
});

test('pub flags never grant a case, alter case gear, or add a hidden direct-use command', () => {
  const flags = carry(barDone({ 'map.taken': true }), 'opener');
  const noCase = resolveBagOwnership({ bagTaken: false, flags, pubTrayOwned: true, pubOpenerOwned: true });
  assert.deepEqual(noCase, { caseOwned: false, kit: [], filesAvailable: false, keyring: null });
  const equipment = { bagTaken: true, flags, interfaceOwned: true, spannerOwned: true, renCassetteOwned: true, renServiceKey: true, masterKey: true, sheetsCarried: 2 };
  const inventory = resolveBagOwnership(equipment);
  assert.deepEqual(inventory.kit, ['light', 'recorder', 'map', 'radio', 'interface', 'plant-spanner', 'sheet-music', 'ren-home-cassette', 'pub-opener']);
  assert.equal(inventory.keyring.master, true);
  assert.equal(inventory.keyring.ren, true);
  const afterReturn = resolveBagOwnership({ ...equipment, flags: returned(barDone({ 'map.taken': true }), 'opener') });
  assert.deepEqual(afterReturn.kit, inventory.kit.filter(id => id !== 'pub-opener'));
  assert.deepEqual(afterReturn.keyring, inventory.keyring);
  assert.deepEqual(visible({ pubTrayOwned: true, pubOpenerOwned: true, pubOrderbookOwned: true }), []);
});

test('tray inspection tracks its physical load and item inspection cannot complete a favor', () => {
  const examples = [[waters({}), /Two glasses of water/, /Mavis and Ed/], [served({}), /damp where the two glasses stood/, /Bert and Farah/], [empties({}), /empty glasses from the domino table/, /Back to Iona/]];
  for (const [flags, object, instruction] of examples) {
    const snapshot = structuredClone(flags);
    const tree = bagInspectionDialogue('pub-service-tray', { flags });
    assert.match(tree.start.lines[0].text, object);
    assert.match(tree.start.lines[1].text, instruction);
    assert.deepEqual(flags, snapshot);
    assert.equal(tree.start.effects, undefined);
    assert.equal(tree.start.choices, undefined);
  }
  assert.match(bagInspectionDialogue('pub-opener').start.lines[0].text, /LYRIC is stamped/);
  assert.match(bagInspectionDialogue('pub-orderbook').start.lines[0].text, /red cloth spine/);
  for (const id of pubIds) assert.ok(bagInspectionDialogue(id).start.lines.every(line => !line.pubQuestAction));
});
