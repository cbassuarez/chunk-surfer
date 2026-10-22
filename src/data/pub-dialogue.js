// The Lyric speaks in wet coats, glasses and local inconveniences. Helping
// earns no immediate prize. Every agreement and handover is a chosen action.
const iona = text => ({ who: 'unknown', voiceSpeaker: 'pub-iona', sourceLabel: 'IONA REED', text });
const d = text => ({ who: 'direction', text });
const n = (lines, choices) => ({ speaker: 'IONA REED', lines, ...(choices ? { choices } : {}) });
const c = (id, text, goto = 'done', pubQuestAction = null) => ({ id: `pub-iona.${id}`, sourceId: `pub-iona.${id}`, text, goto, ...(pubQuestAction ? { pubQuestAction } : {}) });
const leave = () => c('leave', 'Leave Iona to the bar.');
const back = () => c('back', 'Ask about something else.', 'start');

export function buildPubBartenderDialogue(s, favors) {
  const next = s.complete ? !s.favors.opener.returned ? s.favors.opener : !s.favors.orderbook.returned ? s.favors.orderbook : null : null;
  const greeting = s.complete ? [
    d('Iona has found time to put the clean glasses away. She looks up when you come to the bar.'),
    iona(s.sourceUnlocked ? 'There you are. I have both my things back and the glasses are washed. Thank you for all that.'
      : next?.carried ? 'That looks familiar. Bring it over; there is room on the bar.'
        : next?.accepted ? 'No hurry about that thing of mine. I just thought I ought to ask while there is still someone going in.'
          : 'You saved me two trips at exactly the right moment. Could I ask you about something else?'),
  ] : s.phase === 'carrying-empties' ? [iona('There you are. Bring those over. Mind the dominoes if Bert has tried to clear them onto the tray.')]
    : s.phase === 'served-waters' ? [iona('Thank you for taking those over. Bert and Farah have the empty glasses, at the next table. Then bring the tray back here.')]
      : s.phase === 'carrying-waters' ? [iona('Mavis and Ed, nearest the entrance. Bus badge and work jacket. Those two waters are theirs.')]
        : s.accepted ? [iona('The tray is on the public side of the counter. Two waters to Mavis and Ed, then the empties from the domino table.')]
          : [
            d('The bartender sets down a glass, hears her name from the snug, and picks it up again.'),
            iona('Evening. Iona Reed. I would come out and say hello properly, but I have been about to do that for twenty minutes.'),
            iona('Could you give me a hand for a minute? Two waters to take over, a few glasses to bring back. Only if you have the time.'),
          ];
  let helpChoice;
  if (s.phase === 'carrying-empties') helpChoice = c('return-tray', 'Set the tray and empty glasses on the bar for Iona.', 'thanks', 'return-tray');
  else if (!s.complete) helpChoice = s.accepted ? c('reminder', 'Ask what still needs doing.', 'reminder') : c('help', s.declined ? 'I have a minute to help after all.' : 'What do you need a hand with?', 'offer');
  else if (next) helpChoice = next.carried ? c(`return-${next.id}`, `Give Iona ${next.id === 'opener' ? 'her bottle opener' : 'the order book'}.`, `${next.id}-thanks`, `return-${next.id}`)
    : next.accepted ? c(`${next.id}-reminder`, 'Ask where her borrowed thing was left.', `${next.id}-reminder`)
      : c(`${next.id}-ask`, next.declined ? 'I could look for your borrowed thing after all.' : 'What else did you need?', `${next.id}-offer`);
  const tree = {
    start: n(greeting, [...(helpChoice ? [helpChoice] : []), c('regulars', 'Ask who is in tonight.', 'regulars'), c('ellery', 'Ask about Ellery across the road.', 'ellery'), c('name', 'Ask why the pub is called The Lyric.', 'name'), leave()]),
    offer: n([
      iona('There are two waters on the tray, this side of the counter. Mavis and Ed are at the table nearest the entrance: she has the bus badge, he has the work jacket.'),
      iona('Then could you clear the empty glasses from the next table along? Bert and Farah, with the dominoes. Bring the tray back to me when you have done.'),
      iona('I am all right here. I just cannot get out from behind the bar.'),
    ], [c('accept', 'Of course. I can do a turn round the tables.', 'accepted', 'accept'), c('decline', 'I cannot stop to help tonight.', 'declined', 'decline'), c('no-promise', 'Leave it for now.')]),
    accepted: n([iona('Thank you. The tray is ready. Do not let Bert talk you into judging the game; you will be there all night.')], [leave()]),
    declined: n([iona('All right. Thank you for saying. I will get round in a minute.')], [leave()]),
    reminder: n(s.phase === 'carrying-empties' ? [iona('Just the tray back to me, with those empties. Thank you.')]
      : s.phase === 'served-waters' ? [iona('The empty glasses at the next table: Bert and Farah, playing dominoes. Then bring the tray back here.')]
        : s.phase === 'carrying-waters' ? [iona('Two waters to Mavis and Ed at the table nearest the entrance. Then clear the glasses from the domino table.')]
          : [iona('The tray is this side of the counter. Waters to Mavis and Ed by the entrance, empties from Bert and Farah at the next table. Then back here.')], [back(), leave()]),
    thanks: n([
      d('You set the tray down. Iona takes the glasses by their bases and makes room for them under the counter.'),
      iona('Thank you. It was getting away from me a bit there.'),
      d('From the snug comes the small clack of a domino finally being played.'),
      iona('There. You have even moved Bert along.'),
    ], [c('thanks-leave', 'Let her get on with the bar.')]),
    regulars: n([
      iona('People who meant to stay for one. The delivery driver has finished his break twice, by my reckoning.'),
      iona('Some came over from the vigil when the cups ran out. I said they could carry on sitting quietly somewhere dry.'),
      iona('We have spent twenty minutes deciding whose turn it is to wash up. The quiet has suffered.'),
    ], [c('vigil', 'Ask what they are keeping vigil for.', 'vigil'), back(), leave()]),
    vigil: n([
      iona('The school, mostly. People who studied there, people who cleaned it, people who used the baths before it was all one address.'),
      iona('They do not agree on what ought to happen. They agreed to be there when it did.'),
      iona('I sent tea. I can commit to tea without signing anybody’s petition.'),
    ], [back(), leave()]),
    ellery: n([
      iona('When the baths were open, we could set the kitchen clock by the last swimming session. Wet hair, chips, an argument about whose towel was whose.'),
      iona('Then it was students counting coins out for one drink between them. Then staff asking if I had seen somebody who had already gone home.'),
      iona('Now everyone asks what I hear at night. I hear a building nobody is paying to mend. That is frightening enough to begin with.'),
    ], [c('noise', 'Ask whether she has heard anything else.', 'noise'), back(), leave()]),
    noise: n([
      iona('Sometimes the cellar pipes carry a piano note. Always the same one. The plumber says pipes do that.'),
      iona('He came in on Thursday and asked if it had changed. I said no. He looked relieved, which was a new answer.'),
      iona('If you find an ordinary explanation, bring it over. I would like one I can repeat.'),
    ], [back(), leave()]),
    name: n([
      iona('It was The Lyric before the school bought half the street. People assume they named us; they assume a lot of things were theirs.'),
      iona('My father had a piano in the snug. He could play three songs and would take requests for any of them.'),
      iona('The name outlasted the piano. Pubs are very good at keeping the part you cannot sit on.'),
    ], [back(), leave()]),
    done: n([]),
  };
  for (const [id, spec] of Object.entries(favors)) {
    const opener = id === 'opener';
    tree[`${id}-offer`] = n(opener ? [
      iona('I lent my bottle opener to the conservatory staff kitchen. They had a leaving do. I got the tray back and a very sincere thank-you, but not the opener.'),
      iona('It is the flat steel one with LYRIC stamped by the hole. If you are in the staff kitchen, could you bring it back to me? No need to make a special trip.'),
    ] : [
      iona('The box office borrowed our order book for the last reception. They were counting the drinks out of it. Brown cover, red cloth on the spine.'),
      iona('It should still be in the front-of-house box office. My father’s old supplier numbers are in the back. Would you bring it over if you come across it?'),
    ], [c(`accept-${id}`, `I will bring back ${opener ? 'your bottle opener' : 'the order book'}.`, `${id}-accepted`, `accept-${id}`), c(`decline-${id}`, 'I cannot take that on now.', `${id}-declined`, `decline-${id}`), c(`${id}-later`, 'Leave it for now.')]);
    tree[`${id}-accepted`] = n([iona(opener ? 'Thank you. The staff kitchen. You will know it by the name stamped into it.' : 'Thank you. Front of house, in the box office. The numbers in the back are probably all wrong now, but I would like them back anyway.')], [leave()]);
    tree[`${id}-declined`] = n([iona('All right. If you happen to have time later, ask me again.')], [leave()]);
    tree[`${id}-reminder`] = n([iona(`${opener ? 'The flat steel bottle opener, LYRIC by the hole' : 'The brown order book with the red cloth spine'}. ${spec.location.charAt(0).toUpperCase() + spec.location.slice(1)}. Bring it back here when you have it.`)], [back(), leave()]);
    tree[`${id}-thanks`] = n(opener ? [
      d('Iona tests the opener in her palm and hangs it from a hook under the bar.'),
      iona('That is the one. I had got used to reaching for it and finding the nail. Thank you.'),
    ] : [
      d('Iona opens the book from the back. Her thumb stops beside a pencilled telephone number.'),
      iona('There. I knew I had not imagined that handwriting.'),
      iona('Thank you. For doing all that. Nobody made it your job.'),
    ], [leave()]);
  }
  return tree;
}

export function buildPubTrayDialogue(s) {
  if (s.phase !== 'accepted') return { start: n([d(s.complete ? 'The tray is back with Iona. She has the next glasses under way.' : s.carryingTray ? 'You already have Iona’s tray.' : 'A tray with two waters waits on the public side of the bar. Iona is trying to find a moment to carry it over.')]) };
  return {
    start: n([d('Two waters on a wooden tray. A folded cloth keeps the glasses from sliding.'), d('Mavis and Ed are at the table nearest the entrance. The empty glasses are at the domino table beside them.')], [c('take-tray', 'Take the tray over to the tables.', 'taken', 'take-tray'), c('leave-tray', 'Leave the tray for the moment.')]),
    taken: n([d('You lift the tray level. The water shifts once and settles.')]), done: n([]),
  };
}

export function buildPubServiceChoice(actorId, s) {
  let action, text;
  if (s.phase === 'carrying-waters' && ['pub-patron-mavis', 'pub-patron-ed'].includes(actorId)) { action = 'serve-waters'; text = 'Set the two waters down for Mavis and Ed.'; }
  else if (s.phase === 'served-waters' && ['pub-patron-bert', 'pub-patron-farah'].includes(actorId)) { action = 'collect-empties'; text = 'Collect the empty glasses for Iona.'; }
  else return null;
  return { id: `pub-service.${action}`, sourceId: `pub-service.${action}`, text, goto: 'pub-service-thanks', pubQuestAction: action };
}

// Merge the choice and `pub-service-thanks` node into a patron's ordinary tree,
// or run this small tree directly while addressing the person at that table.
export function buildPubServiceDialogue(actorId, s) {
  const choice = buildPubServiceChoice(actorId, s);
  if (!choice) return null;
  const serving = choice.pubQuestAction === 'serve-waters', speaker = serving ? 'MAVIS AND ED' : 'BERT AND FARAH';
  return {
    start: { speaker, lines: [d(serving ? 'Mavis draws her coat in from the table edge. Ed shifts his chair so you can reach.' : 'Farah moves the empty glasses clear of the dominoes. Bert checks one for a last mouthful before letting it go.')], choices: [choice, c('service-leave', 'Leave them to their evening.')] },
    'pub-service-thanks': { speaker, lines: serving ? [d('You put the waters down. Mavis lifts hers in thanks; Ed gives you a quiet nod. The tray is empty.')]
      : [d('You gather the glasses onto the tray. Farah catches a rolling domino before it can join them.'), d('Iona is waiting behind the bar. There is a clear space on the counter for the tray.')] },
    done: n([]),
  };
}

export function buildPubFavorDialogue(spec, s) {
  const opener = spec.id === 'opener';
  const description = opener ? 'A flat steel bottle opener. LYRIC is stamped beside the hanging hole.' : 'A brown order book with a red cloth spine. THE LYRIC is written inside the cover.';
  if (!s.accepted || s.returned || s.carried) return { start: n([d(s.returned ? 'Iona has this back at The Lyric.' : s.carried ? 'You are already carrying this back to Iona.' : `${description} It belongs to the pub; ask Iona before taking it away.`)]) };
  return {
    start: n([d(description), d('This is the thing Iona asked you to bring back.')], [c(`take-${spec.id}`, `Take ${opener ? 'the bottle opener' : 'the order book'} back to Iona.`, 'taken', `take-${spec.id}`), c(`${spec.id}-leave-item`, 'Leave it here for the moment.')]),
    taken: n([d(opener ? 'You put the opener in the bag, where its edge will not catch the cloth.' : 'You close the book and put it in the bag, away from the wet case lining.')]), done: n([]),
  };
}
