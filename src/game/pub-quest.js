// A voluntary turn round a busy bar, followed by two things Iona has lent to
// the school. The saved receipts record help; no favor pays money, composure,
// equipment or school access. The later Source branch reads sourceUnlocked.
import {
  buildPubBartenderDialogue, buildPubTrayDialogue, buildPubServiceChoice,
  buildPubServiceDialogue, buildPubFavorDialogue,
} from '../data/pub-dialogue.js';

export const PUB_BARTENDER_ID = 'pub-bartender-iona';
export const PUB_TRAY_PROP = 'pub-service-tray';
export const PUB_WATER_RECIPIENTS = Object.freeze(['pub-patron-mavis', 'pub-patron-ed']);
export const PUB_EMPTIES_RECIPIENTS = Object.freeze(['pub-patron-bert', 'pub-patron-farah']);
export const PUB_FAVORS = Object.freeze({
  opener: Object.freeze({ id: 'opener', propId: 'pub-favor-opener', label: 'Iona’s bottle opener', location: 'the conservatory staff kitchen' }),
  orderbook: Object.freeze({ id: 'orderbook', propId: 'pub-favor-orderbook', label: 'The Lyric’s order book', location: 'the front-of-house box office' }),
});
export const PUB_QUEST_FLAGS = Object.freeze({
  accepted: 'pub.help.accepted', declined: 'pub.help.declined',
  trayTaken: 'pub.help.trayTaken', watersServed: 'pub.help.watersServed',
  emptiesCollected: 'pub.help.emptiesCollected', complete: 'pub.help.complete',
  sourceUnlocked: 'pub.help.sourceUnlocked',
});
export const pubFavorFlag = (id, part) => `pub.help.${id}.${part}`;
const sourceFlags = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function favorState(flags, id, available) {
  const returned = available && flags[pubFavorFlag(id, 'returned')] === true;
  const accepted = available && (returned || flags[pubFavorFlag(id, 'accepted')] === true);
  const carried = accepted && !returned && flags[pubFavorFlag(id, 'carried')] === true;
  const declined = available && !accepted && flags[pubFavorFlag(id, 'declined')] === true;
  return { id, available, accepted, declined, carried, returned,
    phase: !available ? 'locked' : returned ? 'returned' : carried ? 'carried' : accepted ? 'accepted' : declined ? 'declined' : 'new' };
}

export function pubQuestState(value = {}) {
  const flags = sourceFlags(value);
  const complete = flags[PUB_QUEST_FLAGS.complete] === true;
  const accepted = complete || flags[PUB_QUEST_FLAGS.accepted] === true;
  const trayTaken = complete || accepted && flags[PUB_QUEST_FLAGS.trayTaken] === true;
  const watersServed = complete || trayTaken && flags[PUB_QUEST_FLAGS.watersServed] === true;
  const emptiesCollected = complete || watersServed && flags[PUB_QUEST_FLAGS.emptiesCollected] === true;
  const declined = !accepted && flags[PUB_QUEST_FLAGS.declined] === true;
  const carryingTray = trayTaken && !complete;
  const opener = favorState(flags, 'opener', complete);
  const orderbook = favorState(flags, 'orderbook', opener.returned);
  return {
    phase: complete ? 'complete' : emptiesCollected ? 'carrying-empties' : watersServed ? 'served-waters'
      : trayTaken ? 'carrying-waters' : accepted ? 'accepted' : declined ? 'declined' : 'new',
    accepted, declined, trayTaken, watersServed, emptiesCollected, complete, carryingTray,
    trayLoad: !carryingTray ? null : emptiesCollected ? 'empties' : watersServed ? 'empty' : 'waters',
    favors: { opener, orderbook },
    sourceUnlocked: complete && opener.returned && orderbook.returned && flags[PUB_QUEST_FLAGS.sourceUnlocked] === true,
  };
}

// Context is derived from the live actor/prop and proximity at the choice
// commit. Starting, finishing or cancelling a conversation commits nothing.
// Duplicate callbacks and reloaded scenes cannot repeat a service action.
export function reducePubQuest(value = {}, rawAction, context = {}) {
  const flags = { ...sourceFlags(value) }, s = pubQuestState(flags), effects = [];
  const action = typeof rawAction === 'string' ? rawAction : rawAction?.pubQuestAction || rawAction?.type;
  const withIona = context.inPerson === true && context.actorId === PUB_BARTENDER_ID;
  switch (action) {
    case 'accept':
      if (withIona && !s.accepted) {
        flags[PUB_QUEST_FLAGS.accepted] = true;
        flags[PUB_QUEST_FLAGS.declined] = false;
        for (const key of ['trayTaken', 'watersServed', 'emptiesCollected']) flags[PUB_QUEST_FLAGS[key]] = false;
      }
      break;
    case 'decline':
      if (withIona && !s.accepted) flags[PUB_QUEST_FLAGS.declined] = true;
      break;
    case 'take-tray':
      if (context.atTray === true && s.phase === 'accepted') {
        flags[PUB_QUEST_FLAGS.trayTaken] = true;
        flags[PUB_QUEST_FLAGS.watersServed] = false;
        flags[PUB_QUEST_FLAGS.emptiesCollected] = false;
        effects.push({ type: 'take-tray' });
      }
      break;
    case 'serve-waters':
      if (s.phase === 'carrying-waters' && context.inPerson === true && PUB_WATER_RECIPIENTS.includes(context.actorId)) {
        flags[PUB_QUEST_FLAGS.watersServed] = true;
        flags[PUB_QUEST_FLAGS.emptiesCollected] = false;
        effects.push({ type: 'serve-waters' });
      }
      break;
    case 'collect-empties':
      if (s.phase === 'served-waters' && context.inPerson === true && PUB_EMPTIES_RECIPIENTS.includes(context.actorId)) {
        flags[PUB_QUEST_FLAGS.emptiesCollected] = true;
        effects.push({ type: 'collect-empties' });
      }
      break;
    case 'return-tray':
      if (s.phase === 'carrying-empties' && withIona) {
        flags[PUB_QUEST_FLAGS.complete] = true;
        effects.push({ type: 'return-tray' });
      }
      break;
    default: {
      const match = /^(accept|decline|take|return)-(opener|orderbook)$/.exec(action || '');
      if (!match) break;
      const [, verb, id] = match, favor = s.favors[id], spec = PUB_FAVORS[id];
      if (!favor.available || favor.returned) break;
      if (verb === 'accept' && withIona && !favor.accepted) {
        flags[pubFavorFlag(id, 'accepted')] = true;
        flags[pubFavorFlag(id, 'declined')] = false;
        flags[pubFavorFlag(id, 'carried')] = false;
      } else if (verb === 'decline' && withIona && !favor.accepted) {
        flags[pubFavorFlag(id, 'declined')] = true;
      } else if (verb === 'take' && favor.phase === 'accepted' && context.atItem === true
        && context.itemId === id && context.propId === spec.propId) {
        flags[pubFavorFlag(id, 'carried')] = true;
        effects.push({ type: `take-${id}`, itemId: id });
      } else if (verb === 'return' && favor.carried && withIona) {
        flags[pubFavorFlag(id, 'carried')] = false;
        flags[pubFavorFlag(id, 'returned')] = true;
        effects.push({ type: `return-${id}`, itemId: id });
        const next = pubQuestState(flags);
        if (next.complete && next.favors.opener.returned && next.favors.orderbook.returned) flags[PUB_QUEST_FLAGS.sourceUnlocked] = true;
      }
      break;
    }
  }
  return { flags, effects };
}

export const pubQuestDialogue = flags => buildPubBartenderDialogue(pubQuestState(flags), PUB_FAVORS);
export const pubTrayDialogue = flags => buildPubTrayDialogue(pubQuestState(flags));
export const pubServiceChoice = (actorId, flags) => buildPubServiceChoice(actorId, pubQuestState(flags));
export const pubServiceDialogue = (actorId, flags) => buildPubServiceDialogue(actorId, pubQuestState(flags));
export const pubFavorDialogue = (itemId, flags) => PUB_FAVORS[itemId] ? buildPubFavorDialogue(PUB_FAVORS[itemId], pubQuestState(flags).favors[itemId]) : null;

export function pubQuestStatus(flags = {}) {
  const s = pubQuestState(flags);
  let id = s.phase, active = s.accepted && !s.complete;
  let text = {
    new: 'Iona could use a hand running The Lyric’s bar.',
    declined: 'Iona can still use a hand at The Lyric, if you have a moment.',
    accepted: 'Pick up Iona’s tray with two waters from the public counter.',
    'carrying-waters': 'Take the two waters to Mavis and Ed at the table nearest the pub entrance.',
    'served-waters': 'Collect the empty glasses from Bert and Farah at the next table, with the dominoes.',
    'carrying-empties': 'Return the tray and empty glasses to Iona behind the bar.',
    complete: 'You helped Iona serve the waters and clear the glasses. She is behind The Lyric’s bar.',
  }[s.phase];
  if (s.complete) {
    const next = !s.favors.opener.returned ? s.favors.opener : !s.favors.orderbook.returned ? s.favors.orderbook : null;
    if (next) {
      const spec = PUB_FAVORS[next.id];
      id = `${next.id}-${next.phase}`; active = next.accepted;
      text = next.carried ? `Bring ${spec.label} back to Iona at The Lyric.`
        : next.accepted ? `Iona asked you to bring back ${spec.label} from ${spec.location}.`
          : 'Iona has another favor to ask, if you return to The Lyric.';
    } else { id = 'all-favors-complete'; text = 'You helped Iona at The Lyric and brought back the things she had lent to Ellery.'; }
  }
  return { id, active, text, carryingTray: s.carryingTray, trayLoad: s.trayLoad, sourceUnlocked: s.sourceUnlocked };
}
