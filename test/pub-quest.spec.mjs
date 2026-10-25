import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversation } from '../src/game/conversation.js';
import {
  PUB_BARTENDER_ID, PUB_FAVORS, PUB_QUEST_FLAGS, PUB_WATER_RECIPIENTS, PUB_EMPTIES_RECIPIENTS,
  pubFavorFlag, pubQuestState, reducePubQuest, pubQuestDialogue, pubTrayDialogue,
  pubServiceChoice, pubServiceDialogue, pubFavorDialogue, pubQuestStatus,
} from '../src/game/pub-quest.js';

const atBar = { inPerson: true, actorId: PUB_BARTENDER_ID };
const atTray = { atTray: true };
const atMavis = { inPerson: true, actorId: 'pub-patron-mavis' };
const atBert = { inPerson: true, actorId: 'pub-patron-bert' };
const atItem = itemId => ({ atItem: true, itemId, propId: PUB_FAVORS[itemId].propId });
const apply = (flags, action, context) => reducePubQuest(flags, action, context).flags;
const accepted = flags => apply(flags, 'accept', atBar);
const waters = flags => apply(accepted(flags), 'take-tray', atTray);
const served = flags => apply(waters(flags), 'serve-waters', atMavis);
const empties = flags => apply(served(flags), 'collect-empties', atBert);
const completeBar = flags => apply(empties(flags), 'return-tray', atBar);
const acceptFavor = (flags, id) => apply(flags, `accept-${id}`, atBar);
const carryFavor = (flags, id) => apply(acceptFavor(flags, id), `take-${id}`, atItem(id));
const returnFavor = (flags, id) => apply(carryFavor(flags, id), `return-${id}`, atBar);

function conversation(tree, flags, context) {
  let savedFlags = { ...flags };
  const effects = [];
  const nodes = Object.fromEntries(Object.entries(tree).map(([id, node]) => [id, {
    ...node, lines: node.lines.map(line => ({ ...line, voice: false })),
  }]));
  const machine = createConversation({ sceneId: 'pub-help-test', nodes, onChoice(choice) {
    if (!choice.pubQuestAction && !choice.pubKnowledge) return;
    const result = reducePubQuest(savedFlags, choice, context);
    savedFlags = result.flags; effects.push(...result.effects);
  } });
  machine.start();
  return { machine, flags: () => savedFlags, effects };
}
function toBranch(machine) {
  for (let guard = 0; guard < 100 && !machine.view().pending && !machine.view().finished; guard++) {
    machine.update(10); machine.key({ key: 'Enter' });
  }
  return machine.view();
}
function choose(machine, id) {
  const view = toBranch(machine);
  const index = view.pending?.options.findIndex(choice => choice.id === id) ?? -1;
  assert.ok(index >= 0, `${id} is offered at ${view.nodeId}`);
  machine.selectChoice(index, { sound: false }); machine.key({ key: 'Enter' });
}

test('a response to Iona remembers the request without committing work; cancellation before a response remembers nothing', () => {
  const flags = { unrelated: 4 }, visit = conversation(pubQuestDialogue(flags), flags, atBar);
  assert.match(pubQuestDialogue(flags).start.lines.map(l => l.text).join(' '), /give me a hand/);
  const cancelled = conversation(pubQuestDialogue(flags), flags, atBar);
  cancelled.machine.stop(); assert.deepEqual(cancelled.flags(), flags);
  choose(visit.machine, 'pub-iona.help');
  assert.equal(toBranch(visit.machine).nodeId, 'offer');
  visit.machine.stop();
  assert.deepEqual(visit.flags(), { ...flags, 'pub.help.offered': true });
  assert.equal(pubQuestState(visit.flags()).detailsKnown, false);
  assert.deepEqual(visit.effects, []);
  assert.equal(pubQuestStatus(flags).active, false);
});

test('noncommittal answers retain only knowledge, with Iona and sequential availability required', () => {
  const visit = conversation(pubQuestDialogue({}), {}, atBar);
  choose(visit.machine, 'pub-iona.help'); choose(visit.machine, 'pub-iona.no-promise');
  const known = pubQuestState(visit.flags());
  assert.equal(known.offered, true); assert.equal(known.detailsKnown, true);
  assert.equal(known.accepted, false); assert.equal(known.phase, 'new');
  assert.deepEqual(visit.effects, []);
  for (const pubKnowledge of ['service', 'service-details', 'opener', 'orderbook']) {
    for (const context of [{}, { actorId: PUB_BARTENDER_ID }, atMavis])
      assert.deepEqual(reducePubQuest({}, { pubKnowledge }, context), { flags: {}, effects: [] });
  }
  for (const id of ['opener', 'orderbook']) assert.deepEqual(reducePubQuest({}, { pubKnowledge: id }, atBar), { flags: {}, effects: [] });
  const bar = completeBar({}), later = conversation(pubQuestDialogue(bar), bar, atBar);
  choose(later.machine, 'pub-iona.opener-ask');
  assert.equal(pubQuestState(later.flags()).favors.opener.offered, false, 'entering the offer grants no receipt');
  choose(later.machine, 'pub-iona.opener-later');
  const favor = pubQuestState(later.flags()).favors.opener;
  assert.equal(favor.offered, true); assert.equal(favor.accepted, false); assert.equal(favor.declined, false);
  assert.equal(pubQuestState(later.flags()).favors.orderbook.offered, false);
  assert.deepEqual(reducePubQuest(bar, { pubKnowledge: 'orderbook' }, atBar), { flags: bar, effects: [] });
});

test('old accepted, declined and returned receipts imply knowledge without creating new progress', () => {
  for (const flags of [accepted({}), apply({}, 'decline', atBar), completeBar({})]) {
    const state = pubQuestState(flags); assert.equal(state.offered, true); assert.equal(state.detailsKnown, true);
  }
  for (const flags of [acceptFavor(completeBar({}), 'opener'), apply(completeBar({}), 'decline-opener', atBar), returnFavor(completeBar({}), 'opener')])
    assert.equal(pubQuestState(flags).favors.opener.offered, true);
});

test('a committed acceptance or handover is not undone by cancelling its following acknowledgement', () => {
  const visit = conversation(pubQuestDialogue({}), {}, atBar);
  choose(visit.machine, 'pub-iona.help'); choose(visit.machine, 'pub-iona.accept');
  visit.machine.stop(); assert.equal(pubQuestState(visit.flags()).accepted, true);
  const returning = conversation(pubQuestDialogue(empties({})), empties({}), atBar);
  choose(returning.machine, 'pub-iona.return-tray'); returning.machine.stop();
  assert.equal(pubQuestState(returning.flags()).complete, true);
  assert.deepEqual(returning.effects, [{ type: 'return-tray' }]);
});

test('the voluntary request may be declined and reconsidered without payment or penalties', () => {
  const visit = conversation(pubQuestDialogue({}), {}, atBar);
  choose(visit.machine, 'pub-iona.help'); choose(visit.machine, 'pub-iona.decline');
  assert.equal(pubQuestState(visit.flags()).phase, 'declined');
  assert.equal(pubQuestStatus(visit.flags()).active, false);
  assert.deepEqual(visit.effects, []);
  const again = conversation(pubQuestDialogue(visit.flags()), visit.flags(), atBar);
  choose(again.machine, 'pub-iona.help'); choose(again.machine, 'pub-iona.accept');
  assert.equal(pubQuestState(again.flags()).phase, 'accepted');
  assert.deepEqual(again.effects, []);
});

test('real conversations preserve refusals through reconsideration, service completion and a later favor return', () => {
  let flags = { unrelated: 'retained' };
  const visit = (tree, context, ...ids) => {
    const v = conversation(tree, flags, context);
    for (const id of ids) choose(v.machine, id);
    v.machine.stop(); flags = JSON.parse(JSON.stringify(v.flags()));
    return v;
  };
  visit(pubQuestDialogue(flags), atBar, 'pub-iona.help', 'pub-iona.decline');
  assert.equal(pubQuestState(flags).historicalDeclined, true);
  assert.equal(flags['pub.help.declinedOnce'], true);
  visit(pubQuestDialogue(flags), atBar, 'pub-iona.help', 'pub-iona.accept');
  assert.equal(pubQuestState(flags).declined, false);
  assert.equal(pubQuestState(flags).historicalDeclined, true);
  visit(pubTrayDialogue(flags), atTray, 'pub-iona.take-tray');
  visit(pubServiceDialogue('pub-patron-mavis', flags), atMavis, 'pub-service.serve-waters');
  visit(pubServiceDialogue('pub-patron-bert', flags), atBert, 'pub-service.collect-empties');
  visit(pubQuestDialogue(flags), atBar, 'pub-iona.return-tray');
  assert.equal(pubQuestState(flags).complete, true);
  assert.equal(pubQuestState(flags).historicalDeclined, true);
  visit(pubQuestDialogue(flags), atBar, 'pub-iona.opener-ask', 'pub-iona.decline-opener');
  assert.equal(pubQuestState(flags).favors.opener.historicalDeclined, true);
  visit(pubQuestDialogue(flags), atBar, 'pub-iona.opener-ask', 'pub-iona.accept-opener');
  assert.equal(pubQuestState(flags).favors.opener.declined, false);
  assert.equal(pubQuestState(flags).favors.opener.historicalDeclined, true);
  visit(pubFavorDialogue('opener', flags), atItem('opener'), 'pub-iona.take-opener');
  visit(pubQuestDialogue(flags), atBar, 'pub-iona.return-opener');
  const restored = pubQuestState(JSON.parse(JSON.stringify(flags)));
  assert.equal(restored.historicalDeclined, true); assert.equal(restored.favors.opener.historicalDeclined, true);
  assert.equal(restored.favors.opener.returned, true); assert.equal(flags.unrelated, 'retained');
  for (const [action, context] of [['accept', atBar], ['return-tray', atBar], ['accept-opener', atBar], ['return-opener', atBar], ['decline-opener', atBar]])
    assert.deepEqual(reducePubQuest(flags, action, context), { flags, effects: [] }, 'duplicate callbacks cannot rewrite the history');
});

test('old explicit refusals survive reconsideration; old accepted saves do not invent a refusal', () => {
  const oldDeclined = { 'pub.help.declined': true };
  assert.equal(pubQuestState(oldDeclined).historicalDeclined, true);
  assert.equal(pubQuestState(apply(oldDeclined, 'accept', atBar)).historicalDeclined, true);
  const bar = completeBar({});
  const oldFavor = { ...bar, 'pub.help.opener.declined': true };
  assert.equal(pubQuestState(acceptFavor(oldFavor, 'opener')).favors.opener.historicalDeclined, true);
  assert.equal(pubQuestState(accepted({})).historicalDeclined, false);
  assert.equal(pubQuestState(bar).historicalDeclined, false);
  assert.equal(pubQuestState(returnFavor(bar, 'opener')).favors.opener.historicalDeclined, false);
});

test('acceptance and return require Iona in person; taking a tray requires its actual prop', () => {
  for (const context of [{}, { actorId: PUB_BARTENDER_ID }, atMavis, { inPerson: true }]) {
    assert.equal(pubQuestState(apply({}, 'accept', context)).phase, 'new');
    assert.equal(pubQuestState(apply(empties({}), 'return-tray', context)).phase, 'carrying-empties');
  }
  assert.equal(pubTrayDialogue({}).start.choices, undefined);
  const flags = accepted({});
  for (const context of [{}, atBar, atMavis]) assert.deepEqual(reducePubQuest(flags, 'take-tray', context), { flags, effects: [] });
  const visit = conversation(pubTrayDialogue(flags), flags, atTray);
  toBranch(visit.machine); visit.machine.stop();
  assert.equal(pubQuestState(visit.flags()).phase, 'accepted');
  assert.deepEqual(visit.effects, []);
});

test('only the two intended tables can advance their service stage, in order', () => {
  for (const actorId of ['pub-patron-bert', 'pub-patron-farah', 'pub-patron-nell', PUB_BARTENDER_ID, 'unknown']) {
    assert.equal(pubServiceChoice(actorId, waters({})), null);
    assert.equal(pubQuestState(apply(waters({}), 'serve-waters', { inPerson: true, actorId })).phase, 'carrying-waters');
  }
  for (const actorId of ['pub-patron-mavis', 'pub-patron-ed', 'pub-patron-nell', PUB_BARTENDER_ID, 'unknown']) {
    assert.equal(pubServiceChoice(actorId, served({})), null);
    assert.equal(pubQuestState(apply(served({}), 'collect-empties', { inPerson: true, actorId })).phase, 'served-waters');
  }
  for (const actorId of PUB_WATER_RECIPIENTS) {
    assert.equal(pubQuestState(apply(waters({}), 'serve-waters', { inPerson: true, actorId })).phase, 'served-waters');
    assert.equal(pubQuestState(apply(waters({}), 'serve-waters', { actorId })).phase, 'carrying-waters');
  }
  for (const actorId of PUB_EMPTIES_RECIPIENTS) assert.equal(pubQuestState(apply(served({}), 'collect-empties', { inPerson: true, actorId })).phase, 'carrying-empties');
  assert.equal(pubQuestState(apply(waters({}), 'collect-empties', atBert)).phase, 'carrying-waters');
  assert.equal(pubQuestState(apply(accepted({}), 'serve-waters', atMavis)).phase, 'accepted');
});

test('visiting either table and cancelling cannot serve waters or clear glasses', () => {
  for (const [flags, context] of [[waters({}), atMavis], [served({}), atBert]]) {
    const visit = conversation(pubServiceDialogue(context.actorId, flags), flags, context);
    toBranch(visit.machine); visit.machine.stop();
    assert.deepEqual(visit.flags(), flags); assert.deepEqual(visit.effects, []);
  }
});

test('the real conversation loop serves waters, clears glasses, and returns a tray with no reward', () => {
  let flags = accepted({ 'story.access': 'unchanged', composure: 25 });
  const effects = [];
  const steps = [
    [() => pubTrayDialogue(flags), atTray, 'pub-iona.take-tray', 'carrying-waters'],
    [() => pubServiceDialogue('pub-patron-ed', flags), { inPerson: true, actorId: 'pub-patron-ed' }, 'pub-service.serve-waters', 'served-waters'],
    [() => pubServiceDialogue('pub-patron-farah', flags), { inPerson: true, actorId: 'pub-patron-farah' }, 'pub-service.collect-empties', 'carrying-empties'],
    [() => pubQuestDialogue(flags), atBar, 'pub-iona.return-tray', 'complete'],
  ];
  for (const [tree, context, id, phase] of steps) {
    const visit = conversation(tree(), flags, context); choose(visit.machine, id);
    flags = JSON.parse(JSON.stringify(visit.flags())); effects.push(...visit.effects);
    assert.equal(pubQuestState(flags).phase, phase, 'every committed stage survives reload');
  }
  assert.deepEqual(effects, ['take-tray', 'serve-waters', 'collect-empties', 'return-tray'].map(type => ({ type })));
  assert.equal(flags[PUB_QUEST_FLAGS.complete], true);
  assert.equal(flags['story.access'], 'unchanged'); assert.equal(flags.composure, 25);
  assert.equal(pubQuestStatus(flags).active, false);
  assert.equal(pubQuestState(flags).carryingTray, false);
  assert.equal(pubQuestState(flags).sourceUnlocked, false, 'one favor alone does not unlock the later bar');
  assert.equal(Object.keys(flags).some(key => /item|reward|money/i.test(key)), false);
});

test('duplicate service callbacks are harmless, including after reload', () => {
  const stages = [[waters({}), 'take-tray', atTray], [served({}), 'serve-waters', atMavis], [empties({}), 'collect-empties', atBert], [completeBar({}), 'return-tray', atBar]];
  for (const [saved, action, context] of stages) {
    const flags = JSON.parse(JSON.stringify(saved));
    assert.deepEqual(reducePubQuest(flags, action, context), { flags, effects: [] });
  }
});

test('malformed progress cannot skip the tray pickup or resurrect later stages on acceptance', () => {
  assert.equal(pubQuestState(null).phase, 'new');
  const malformed = { [PUB_QUEST_FLAGS.trayTaken]: true, [PUB_QUEST_FLAGS.watersServed]: true, [PUB_QUEST_FLAGS.emptiesCollected]: true };
  assert.equal(pubQuestState(malformed).phase, 'new');
  assert.equal(pubQuestState(accepted(malformed)).phase, 'accepted');
  assert.equal(pubQuestState(apply(accepted(malformed), 'take-tray', atTray)).phase, 'carrying-waters');
  assert.equal(pubQuestState({ [PUB_QUEST_FLAGS.accepted]: 'true' }).phase, 'new');
});

test('later favors are sequential, optional requests and cannot be collected before Iona asks', () => {
  assert.equal(pubQuestState({}).favors.opener.available, false);
  for (const id of Object.keys(PUB_FAVORS)) {
    assert.deepEqual(reducePubQuest({}, `accept-${id}`, atBar).flags, {});
    assert.equal(pubFavorDialogue(id, {}).start.choices, undefined);
  }
  const bar = completeBar({});
  assert.equal(pubQuestState(bar).favors.opener.available, true);
  assert.equal(pubQuestState(bar).favors.orderbook.available, false);
  assert.deepEqual(reducePubQuest(bar, 'take-opener', atItem('opener')), { flags: bar, effects: [] });
  assert.deepEqual(reducePubQuest(bar, 'accept-orderbook', atBar), { flags: bar, effects: [] });
  assert.equal(pubQuestStatus(bar).active, false);
  const declined = apply(bar, 'decline-opener', atBar);
  assert.equal(pubQuestState(declined).favors.opener.phase, 'declined');
  assert.equal(pubQuestState(acceptFavor(declined, 'opener')).favors.opener.phase, 'accepted');
});

test('favor pickup requires agreement and the exact physical item and prop; returns require Iona', () => {
  const openerAccepted = acceptFavor(completeBar({}), 'opener');
  const bookAccepted = acceptFavor(returnFavor(completeBar({}), 'opener'), 'orderbook');
  for (const [id, flags] of [['opener', openerAccepted], ['orderbook', bookAccepted]]) {
    for (const context of [{}, atBar, { atItem: true, itemId: id }, { atItem: true, itemId: id, propId: 'wrong-prop' }, { ...atItem(id), itemId: 'wrong-item' }]) {
      assert.deepEqual(reducePubQuest(flags, `take-${id}`, context), { flags, effects: [] });
    }
    const carried = apply(flags, `take-${id}`, atItem(id));
    assert.equal(pubQuestState(carried).favors[id].carried, true);
    for (const context of [{}, atMavis, { actorId: PUB_BARTENDER_ID }, { inPerson: true }]) assert.deepEqual(reducePubQuest(carried, `return-${id}`, context), { flags: carried, effects: [] });
    assert.deepEqual(reducePubQuest(carried, `take-${id}`, atItem(id)).effects, []);
    assert.equal(pubQuestState(apply(carried, `return-${id}`, atBar)).favors[id].returned, true);
  }
});

test('cancelling later offers, pickup inspection, or in-person return grants no credit', () => {
  const bar = completeBar({});
  const offer = conversation(pubQuestDialogue(bar), bar, atBar);
  choose(offer.machine, 'pub-iona.opener-ask'); toBranch(offer.machine); offer.machine.stop();
  assert.deepEqual(offer.flags(), bar);
  const accepted = acceptFavor(bar, 'opener');
  const pickup = conversation(pubFavorDialogue('opener', accepted), accepted, atItem('opener'));
  toBranch(pickup.machine); pickup.machine.stop(); assert.deepEqual(pickup.flags(), accepted);
  const carried = carryFavor(bar, 'opener');
  const returning = conversation(pubQuestDialogue(carried), carried, atBar);
  toBranch(returning.machine); returning.machine.stop(); assert.deepEqual(returning.flags(), carried);
});

test('the authored favors unlock Source only after both physical returns and persist without payouts', () => {
  let flags = completeBar({ composure: 25, 'other.quest': 'untouched' });
  const effects = [];
  for (const id of ['opener', 'orderbook']) {
    const offer = conversation(pubQuestDialogue(flags), flags, atBar);
    choose(offer.machine, `pub-iona.${id}-ask`); choose(offer.machine, `pub-iona.accept-${id}`);
    flags = offer.flags();
    const pickup = conversation(pubFavorDialogue(id, flags), flags, atItem(id));
    choose(pickup.machine, `pub-iona.take-${id}`); flags = JSON.parse(JSON.stringify(pickup.flags())); effects.push(...pickup.effects);
    assert.equal(pubQuestState(flags).sourceUnlocked, false);
    const returning = conversation(pubQuestDialogue(flags), flags, atBar);
    choose(returning.machine, `pub-iona.return-${id}`); flags = JSON.parse(JSON.stringify(returning.flags())); effects.push(...returning.effects);
    assert.equal(pubQuestState(flags).sourceUnlocked, id === 'orderbook');
  }
  assert.equal(flags['pub.help.sourceUnlocked'], true);
  assert.equal(flags.composure, 25); assert.equal(flags['other.quest'], 'untouched');
  assert.deepEqual(effects, ['take-opener', 'return-opener', 'take-orderbook', 'return-orderbook'].map(type => ({ type, itemId: type.includes('opener') ? 'opener' : 'orderbook' })));
  assert.equal(pubQuestStatus(flags).id, 'all-favors-complete');
  for (const id of ['opener', 'orderbook']) {
    for (const action of [`take-${id}`, `return-${id}`, `accept-${id}`, `decline-${id}`]) assert.deepEqual(reducePubQuest(flags, action, { ...atBar, ...atItem(id) }), { flags, effects: [] });
  }
  const forgedUnlock = { 'pub.help.sourceUnlocked': true };
  assert.equal(pubQuestState(forgedUnlock).sourceUnlocked, false, 'a bare legacy/unearned flag has no normalized authority');
});

test('all generated routes are complete and progress hooks occur only on explicit choices', () => {
  const bar = completeBar({}), openerBack = returnFavor(bar, 'opener');
  const examples = [{}, apply({}, 'decline', atBar), accepted({}), waters({}), served({}), empties({}), bar, acceptFavor(bar, 'opener'), carryFavor(bar, 'opener'), openerBack, carryFavor(openerBack, 'orderbook'), returnFavor(openerBack, 'orderbook')];
  for (const flags of examples) {
    const trees = [pubQuestDialogue(flags), pubTrayDialogue(flags), ...[...PUB_WATER_RECIPIENTS, ...PUB_EMPTIES_RECIPIENTS].map(id => pubServiceDialogue(id, flags)), ...Object.keys(PUB_FAVORS).map(id => pubFavorDialogue(id, flags))].filter(Boolean);
    for (const nodes of trees) {
      assert.ok(nodes.start);
      for (const [id, node] of Object.entries(nodes)) {
        assert.equal(node.pubQuestAction, undefined); assert.equal(node.effects, undefined);
        for (const line of node.lines) assert.equal(line.pubQuestAction, undefined);
        for (const choice of node.choices || []) { assert.ok(choice.id && choice.sourceId); assert.ok(nodes[choice.goto], `${id}: ${choice.id} -> ${choice.goto}`); }
      }
    }
  }
  const spoken = Object.values(pubQuestDialogue({})).flatMap(node => node.lines).filter(l => l.who !== 'direction');
  for (const line of spoken) { assert.equal(line.who, 'unknown'); assert.equal(line.voiceSpeaker, 'pub-iona'); assert.equal(line.sourceLabel, 'IONA REED'); }
  assert.equal(pubFavorDialogue('not-a-pub-item', {}), null);
  assert.equal(pubFavorFlag('opener', 'accepted'), 'pub.help.opener.accepted');
});
