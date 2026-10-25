import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestJournal } from '../src/game/quest-journal.js';
import { pubQuestState, reducePubQuest, PUB_BARTENDER_ID, PUB_FAVORS } from '../src/game/pub-quest.js';

const find = (input, id) => buildQuestJournal(input).find(e => e.id === `quest:${id}`);
const text = value => JSON.stringify(value);
const prose = value => typeof value === 'string' ? value : value && typeof value === 'object'
  ? Object.values(value).map(prose).join(' ') : '';
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value); for (const child of Object.values(value)) freeze(child);
  }
  return value;
};
const job = { rooms: [{ roomId: 'main_b3', label: 'Studio B3', recorded: false, marked: true },
  { roomId: 'the_tub', label: 'The natatorium', recorded: false }] };

test('a fresh save does not reveal dormant quests, default reducer leads, contact numbers or rewards', () => {
  assert.deepEqual(buildQuestJournal(), []);
  assert.deepEqual(buildQuestJournal({ save: { flags: {}, roofRen: {}, marbleHead: {},
    academicSociety: {}, academicBouncers: {}, chunkSurf: { lastReception: { phase: 'released',
      entered: true, seen: ['warning-service'], windowInvitation: { status: 'unoffered' } } } }, job }), []);
  assert.deepEqual(buildQuestJournal({ save: { props: { inspected: ['pub-bartender-iona'] },
    academicSociety: { visits: 3, met: { emile: 2, lucien: 3 } }, thoughts: { had: ['park-eyes'] } } }), []);
});

test('the assignment derives completed takes without changing the existing selected room', () => {
  const input = freeze({ save: { flags: { 'bag.taken': true, 'setup.levels': true },
    obj: { playerWaypoint: { spaceId: 'space:main_b3', roomId: 'main_b3' } } }, job });
  const before = text(input), assignment = find(input, 'work-order');
  assert.equal(assignment.category, 'assignment'); assert.equal(assignment.state, 'active');
  assert.equal(assignment.status.label, '0 / 2 RECORDED');
  assert.equal(assignment.location.roomId, 'main_b3');
  assert.match(assignment.next, /Studio B3/);
  assert.equal(text(input), before);
  const done = find({ save: input.save, job: { rooms: job.rooms.map(r => ({ ...r, recorded: true })) } }, 'work-order');
  assert.equal(done.state, 'resolved'); assert.equal(done.next, null); assert.equal(done.evidence.length, 2);
});

test('departed older saves are not told to repeat the Get In level setup', () => {
  const unfinished = { rooms: [{ roomId: 'main_b3', label: 'Studio B3', recorded: false }] };
  assert.match(find({ save: { flags: { 'bag.taken': true } }, job: unfinished }, 'work-order').next, /Set your recorder levels/);
  for (const gate of ['van.closed', 'van.run-started', 'setup.levels']) {
    const e = find({ save: { flags: { 'bag.taken': true, [gate]: true } }, job: unfinished }, 'work-order');
    assert.doesNotMatch(e.next, /Set your recorder levels/, gate);
    assert.match(e.next, /remaining rooms/);
  }
});

test('current mandatory guidance remains active after takes and never invents a map location from world coordinates', () => {
  const save = { flags: { 'bag.taken': true, 'van.closed': true } };
  const done = { rooms: job.rooms.map(r => ({ ...r, recorded: true })) };
  const guidance = { id: 'story:tenor-rope', label: 'TAKE THE TENOR ROPE', required: true,
    coordinateSpace: 'authored', authored: { x: 25, y: 158 }, kind: 'prop', propId: 'tower-rope-8' };
  const e = find({ save, job: done, guidance }, 'work-order');
  assert.equal(e.next, guidance.label); assert.equal(e.state, 'active'); assert.equal(e.outcome, null);
  assert.equal(e.stage.label, 'Required route remains');
  assert.ok(e.stage.label.length < 30);
  assert.equal(e.location, null, 'a world/prop target is not silently converted to a map room');
  assert.equal(find({ save, job: done, guidance: null }, 'work-order').state, 'resolved');
  const roomGuidance = find({ save, job, guidance: { label: 'STUDIO B3', required: true, roomId: 'main_b3' } }, 'work-order');
  assert.equal(roomGuidance.location.roomId, 'main_b3');
  const spaceGuidance = find({ save, job, guidance: { label: 'ACADEMIC LOGGIA', required: true, spaceId: 'space:academic-loggia' } }, 'work-order');
  assert.equal(spaceGuidance.location.spaceId, 'space:academic-loggia');
  for (const malformed of [{ roomId: 'not-a-work-order-room' }, { spaceId: 'authored:25,158' }])
    assert.equal(find({ save, job, guidance: { ...guidance, ...malformed } }, 'work-order').location, null);
  assert.equal(find({ save: {}, job, guidance }, 'work-order'), undefined, 'guidance alone does not reveal an unissued job');
});

test('the issued work order can show its first unfinished client room without making a player mark', () => {
  const input = freeze({ save: { flags: { 'bag.taken': true, 'van.closed': true },
    obj: { target: null, waypoint: null, playerWaypoint: null } },
    job: { rooms: job.rooms.map(r => ({ ...r, marked: false })) } });
  const before = text(input);
  assert.equal(find(input, 'work-order').location.roomId, 'main_b3');
  assert.equal(find(input, 'work-order').stage.label, '0 / 2 recorded');
  assert.equal(text(input), before, 'showing a known room does not create or change the personal target');
  const nextRoom = { ...input, job: { rooms: input.job.rooms.map((r, i) => ({ ...r, recorded: i === 0 })) } };
  assert.equal(find(nextRoom, 'work-order').location.roomId, 'the_tub');
  assert.equal(find({ ...input, job: { rooms: input.job.rooms.map(r => ({ ...r, recorded: true })) } }, 'work-order').location, null);
  const guidance = { id: 'story:tenor-rope', label: 'TAKE THE TENOR ROPE', required: true,
    coordinateSpace: 'authored', authored: { x: 25, y: 158 }, propId: 'tower-rope-8' };
  const guided = find({ ...input, guidance }, 'work-order');
  assert.equal(guided.next, guidance.label);
  assert.equal(guided.location, null, 'an unsupported current guidance target does not fall back to an unrelated room');
});

test('Iona service uses committed flags and reveals each favor only after acceptance', () => {
  const accepted = { 'pub.help.accepted': true };
  assert.match(find({ save: { flags: accepted } }, 'lyric').next, /two waters/);
  const carrying = { ...accepted, 'pub.help.trayTaken': true };
  assert.match(find({ save: { flags: carrying } }, 'lyric').next, /Mavis and Ed/);
  assert.match(find({ save: { flags: { ...carrying, 'pub.help.watersServed': true } } }, 'lyric').next, /Bert and Farah/);
  const complete = { ...carrying, 'pub.help.complete': true };
  const firstDone = find({ save: { flags: complete } }, 'lyric');
  assert.equal(firstDone.state, 'resolved'); assert.equal(firstDone.next, null);
  assert.doesNotMatch(text(firstDone), /bottle opener|order book|Source|unlock/i);
  const opener = { ...complete, 'pub.help.opener.accepted': true };
  const retrieving = find({ save: { flags: opener } }, 'lyric');
  assert.match(retrieving.next, /staff kitchen/); assert.equal(retrieving.location.spaceId, undefined);
  assert.doesNotMatch(text(retrieving), /order book|Source|unlock/i);
  const orderbook = { ...opener, 'pub.help.opener.returned': true, 'pub.help.orderbook.accepted': true };
  assert.equal(find({ save: { flags: orderbook } }, 'lyric').location.spaceId, 'space:box-office');
  assert.equal(find({ save: { flags: { 'pub.help.declined': true } } }, 'lyric').state, 'declined');
});

test('Lyric knowledge is a choice, not a promise, and later favors preserve the fulfilled service', () => {
  const atBar = { inPerson: true, actorId: PUB_BARTENDER_ID };
  let flags = { unrelated: 'kept' };
  const commit = (action, context = atBar) => { flags = reducePubQuest(flags, action, context).flags; };
  const current = () => find({ save: { flags } }, 'lyric');
  commit({ pubKnowledge: 'service' });
  assert.equal(current().nature, 'lead'); assert.equal(current().commitment, 'none');
  assert.equal(current().nextLabel, 'CHOICE'); assert.equal(current().hasOpenCommitment, false);
  assert.doesNotMatch(prose(current()), /Mavis|Farah|domino|opener|order book/i);
  const serviceKey = current().trackingKey;
  commit({ pubKnowledge: 'service-details', pubQuestAction: 'accept' });
  assert.equal(current().trackingKey, serviceKey);
  assert.equal(current().commitment, 'accepted'); assert.equal(current().hasOpenCommitment, true);
  assert.equal(current().milestones[0].state, 'current');
  commit('take-tray', { atTray: true });
  commit('serve-waters', { inPerson: true, actorId: 'pub-patron-ed' });
  commit('collect-empties', { inPerson: true, actorId: 'pub-patron-farah' });
  commit('return-tray');
  assert.equal(current().commitment, 'fulfilled'); assert.equal(current().state, 'resolved');
  assert.equal(current().followUp, null); assert.ok(current().closure);
  assert.ok(current().milestones.every(m => m.state === 'done'));
  assert.equal(current().hasOpenCommitment, false); assert.equal(current().trackable, false);
  assert.doesNotMatch(prose(current()), /opener|order book|Source|unlock/i);
  const fulfilledClosure = current().closure;
  commit({ pubKnowledge: 'opener' });
  const openerKey = current().trackingKey;
  assert.notEqual(openerKey, serviceKey, 'following the old service cannot silently follow a different errand');
  assert.equal(current().followUp.commitment, 'none'); assert.equal(current().nextLabel, 'CHOICE');
  assert.match(prose(current().records), /flat steel.*LYRIC.*leaving do/i);
  assert.doesNotMatch(prose(current()), /order book|Source|unlock/i);
  commit({ pubKnowledge: 'opener', pubQuestAction: 'decline-opener' });
  assert.equal(current().state, 'resolved'); assert.equal(current().commitment, 'fulfilled');
  assert.deepEqual(current().closure, fulfilledClosure);
  assert.equal(current().followUp.commitment, 'declined'); assert.equal(current().next, null);
  assert.ok(current().records.some(r => r.id === 'opener-declined'));
  commit('accept-opener');
  assert.equal(current().trackingKey, openerKey, 'reconsidering the same favor preserves purpose identity');
  assert.equal(current().state, 'resolved'); assert.equal(current().commitment, 'fulfilled');
  assert.equal(current().followUp.commitment, 'accepted'); assert.equal(current().hasOpenCommitment, true);
  assert.ok(current().records.some(r => r.id === 'opener-declined'), 'reconsideration does not erase the earlier answer');
  assert.deepEqual(current().closure, fulfilledClosure);
  commit('take-opener', { atItem: true, itemId: 'opener', propId: PUB_FAVORS.opener.propId });
  assert.match(current().next, /Return Iona/);
  assert.ok(current().followUp.milestones.some(m => m.id === 'opener:find' && m.state === 'done'));
  commit('return-opener');
  assert.equal(current().followUp.commitment, 'fulfilled'); assert.equal(current().next, null);
  assert.equal(current().hasOpenCommitment, false);
  assert.ok(current().records.some(r => r.id === 'opener-declined'));
  commit({ pubKnowledge: 'orderbook', pubQuestAction: 'accept-orderbook' });
  assert.notEqual(current().trackingKey, openerKey);
  assert.equal(current().state, 'resolved'); assert.equal(current().followUp.commitment, 'accepted');
  assert.match(prose(current().records), /brown cover.*red cloth spine.*father/i);
  commit('take-orderbook', { atItem: true, itemId: 'orderbook', propId: PUB_FAVORS.orderbook.propId });
  commit('return-orderbook');
  const final = current();
  assert.equal(final.followUp.commitment, 'fulfilled'); assert.equal(final.hasOpenCommitment, false);
  assert.equal(final.trackable, false); assert.equal(final.nextLabel, null);
  assert.equal(flags.unrelated, 'kept'); assert.equal(pubQuestState(flags).sourceUnlocked, true);
  assert.doesNotMatch(prose(final), /Source|unlock|reward|money/i);
  assert.deepEqual(find({ save: JSON.parse(JSON.stringify({ flags })) }, 'lyric'), final);
});

test('historical refusals remain alongside fulfilled help without being invented for older accepted saves', () => {
  const noKnownRefusal = find({ save: { flags: { 'pub.help.complete': true, 'pub.help.opener.returned': true } } }, 'lyric');
  assert.equal(noKnownRefusal.records.some(r => r.id === 'service-declined' || r.id === 'opener-declined'), false);
  const known = find({ save: { flags: { 'pub.help.complete': true, 'pub.help.declinedOnce': true,
    'pub.help.opener.returned': true, 'pub.help.opener.declinedOnce': true } } }, 'lyric');
  assert.equal(known.commitment, 'fulfilled'); assert.equal(known.state, 'resolved');
  assert.ok(known.records.some(r => r.id === 'service-declined'));
  assert.ok(known.records.some(r => r.id === 'opener-declined'));
  assert.ok(known.records.findIndex(r => r.id === 'service-declined') < known.records.findIndex(r => r.id === 'service-agreement'));
  assert.ok(known.records.findIndex(r => r.id === 'opener-declined') < known.records.findIndex(r => r.id === 'opener-returned'));
  assert.equal(new Set(known.records.map(r => r.id)).size, known.records.length);
});

test('live quest owners can be ahead of the save and neither input is mutated', () => {
  const save = freeze({ flags: { 'pub.help.accepted': true }, academicBouncers: { admitted: false } });
  const live = freeze(pubQuestState({ 'pub.help.complete': true }));
  const before = text({ save, live });
  assert.equal(find({ save, pub: live }, 'lyric').state, 'resolved');
  assert.equal(find({ save, bouncers: { admitted: true } }, 'academic-admission').state, 'resolved');
  assert.equal(text({ save, live }), before);
});

test('Ren records cassette choices without revealing the later bargain or a hidden reward', () => {
  const base = { schema: 3, met: true, stage: 'accepted' };
  const initial = find({ roofRen: base }, 'ren');
  assert.match(initial.next, /personal-effects index/);
  assert.equal(initial.location.spaceId, 'space:stripped-office');
  assert.doesNotMatch(text(initial), /service key|hundred|century|guarantor|sacrifice|demolition/i);
  assert.match(find({ roofRen: { ...base, indexRead: true, traceRead: true, cabinetOpened: true } }, 'ren').next, /release envelope/);
  assert.equal(find({ roofRen: { ...base, stage: 'carrying' } }, 'ren').location.spaceId, 'space:academic-roof');
  assert.equal(find({ roofRen: { ...base, stage: 'withheld' } }, 'ren').state, 'resolved');
  assert.equal(find({ roofRen: { ...base, stage: 'refused' } }, 'ren').state, 'declined');
  assert.equal(find({ roofRen: { ...base, stage: 'returned' } }, 'ren').state, 'resolved');
  const agreed = find({ roofRen: { ...base, stage: 'returned', sealOffered: true, sealConsented: true } }, 'ren');
  assert.equal(agreed.state, 'resolved'); assert.equal(agreed.commitment, 'fulfilled');
  assert.equal(agreed.followUp.commitment, 'consented'); assert.equal(agreed.hasOpenCommitment, true);
  assert.match(agreed.next, /agreement you made/);
});

test('Ren’s later consent or refusal does not rewrite the cassette closure or reuse its tracking purpose', () => {
  const returned = { schema: 3, met: true, stage: 'returned', rewardGranted: true, tapeHonesty: 'respected' };
  const memory = find({ roofRen: returned }, 'ren');
  assert.equal(memory.commitment, 'fulfilled'); assert.equal(memory.followUp, null);
  const offered = find({ roofRen: { ...returned, sealOffered: true } }, 'ren');
  assert.equal(offered.state, 'resolved'); assert.equal(offered.commitment, 'fulfilled');
  assert.deepEqual(offered.closure, memory.closure);
  assert.notEqual(offered.trackingKey, memory.trackingKey);
  assert.equal(offered.followUp.commitment, 'none'); assert.equal(offered.nextLabel, 'CHOICE');
  const refused = find({ roofRen: { ...returned, sealOffered: true, locks: { sealRefused: true } } }, 'ren');
  assert.equal(refused.state, 'resolved'); assert.equal(refused.commitment, 'fulfilled');
  assert.equal(refused.followUp.commitment, 'declined'); assert.equal(refused.trackable, false);
  assert.deepEqual(refused.closure, memory.closure);
  const accepted = find({ roofRen: { ...returned, sealOffered: true, sealConsented: true } }, 'ren');
  assert.equal(accepted.trackingKey, offered.trackingKey);
  assert.equal(accepted.followUp.commitment, 'consented'); assert.equal(accepted.hasOpenCommitment, true);
  assert.equal(accepted.state, 'resolved');
});

test('records do not invent identification or erase listening shared with Ren', () => {
  const left = find({ marble: { phase: 'declined' } }, 'marble-eyes');
  assert.match(left.summary, /left the shapes/);
  assert.doesNotMatch(text(left), /understood what/);
  const returned = find({ roofRen: { schema: 3, met: true, stage: 'returned', tapeHonesty: 'respected' } }, 'ren');
  assert.match(returned.records.find(r => r.id === 'memory-returned').text, /without listening on your own/);
  assert.doesNotMatch(text(returned), /without playing it/);
});

test('respecting Ren’s warning fulfils the conditional investigation while preserving an optional return or reconsideration', () => {
  const ren = { schema: 3, met: true, stage: 'accepted', indexRead: true, traceRead: true,
    cabinetOpened: true, envelopeRead: true, warningRespected: true };
  const entry = find({ roofRen: ren }, 'ren');
  assert.equal(entry.commitment, 'fulfilled'); assert.equal(entry.state, 'resolved');
  assert.equal(entry.hasOpenCommitment, false); assert.equal(entry.trackable, true);
  assert.equal(entry.nextLabel, 'OPTIONAL'); assert.match(entry.next, /Tell Ren.*reconsider/);
  assert.equal(entry.followUp, null); assert.match(entry.closure.text, /not to overrule/);
});

test('admission shows learned cue text only from current authoritative clue receipts', () => {
  const legacy = find({ bouncers: { clues: { boxOffice: true } } }, 'academic-admission');
  assert.equal(legacy.status.label, 'LEAD'); assert.doesNotMatch(text(legacy), /guests are already here/);
  const learned = find({ bouncers: { clues: { bathroom: true } } }, 'academic-admission');
  assert.match(learned.next, /When do the guests arrive/); assert.match(learned.next, /The guests are already here/);
  assert.match(learned.next, /pause before Vera/);
  const admitted = find({ bouncers: { admitted: true } }, 'academic-admission');
  assert.equal(admitted.state, 'resolved'); assert.equal(admitted.next, null);
  assert.equal(find({ bouncers: { attempt: { outcome: 'success' } } }, 'academic-admission'), undefined,
    'a pending acknowledgment is not completed admission or saved discovery');
});

test('voice lending preserves refusal, voluntary withdrawal, expiry and leaving as distinct outcomes', () => {
  assert.equal(find({ society: { met: { emile: 1 } } }, 'borrowed-voice'), undefined);
  const offered = find({ society: { topics: { emile: ['need'] } } }, 'borrowed-voice');
  assert.match(offered.next, /keep your voice/);
  assert.ok(find({ society: { topics: { lucien: ['emile'] } } }, 'borrowed-voice'));
  const lent = find({ society: { consent: 'lent', loanRemaining: 5 } }, 'borrowed-voice');
  assert.equal(lent.state, 'active'); assert.match(lent.next, /Emile or Lucien.*downstairs/);
  for (const consent of ['declined', 'withdrawn', 'left', 'expired']) {
    const e = find({ society: { consent } }, 'borrowed-voice');
    assert.equal(e.state, consent === 'declined' ? 'declined' : 'resolved');
    assert.equal(e.next, null); assert.ok(e.outcome);
  }
});

test('admission, voice permission, eyes and telephone records do not become unchosen obligations', () => {
  const admission = find({ bouncers: { clues: { bathroom: true } } }, 'academic-admission');
  assert.equal(admission.nature, 'lead'); assert.equal(admission.commitment, 'none');
  assert.equal(admission.nextLabel, 'OPTIONAL'); assert.equal(admission.hasOpenCommitment, false);
  const voice = find({ society: { consent: 'lent' } }, 'borrowed-voice');
  assert.equal(voice.nature, 'record'); assert.equal(voice.commitment, 'consented');
  assert.equal(voice.nextLabel, 'CHOICE'); assert.equal(voice.hasOpenCommitment, false); assert.equal(voice.trackable, false);
  const lucien = find({ society: { topics: { lucien: ['emile'] } } }, 'borrowed-voice');
  assert.doesNotMatch(prose(lucien.records), /withdraw|downstairs|let it end|through him or Lucien/i);
  const emile = find({ society: { topics: { emile: ['need'] } } }, 'borrowed-voice');
  assert.match(prose(emile.records), /withdraw through him or Lucien/);
  const eyes = find({ marble: { phase: 'carried' } }, 'marble-eyes');
  assert.equal(eyes.nature, 'lead'); assert.equal(eyes.commitment, 'none'); assert.equal(eyes.hasOpenCommitment, false);
  const call = find({ save: { flags: { 'phone.called.flat': true } } }, 'source-telephone');
  assert.equal(call.nature, 'record'); assert.equal(call.commitment, 'none'); assert.equal(call.trackable, false);
});

test('the jail invitation remains hidden before a committed answer and reports actual social consequences', () => {
  const saveFor = invitation => ({ save: { chunkSurf: { lastReception: { phase: 'escaped',
    entered: true, seen: ['warning-service'], windowInvitation: invitation } } } });
  assert.equal(find(saveFor({ status: 'unoffered' }), 'last-reception'), undefined);
  const carrying = find(saveFor({ status: 'carrying' }), 'last-reception');
  assert.match(carrying.next, /room by the others/); assert.equal(carrying.location.spaceId, undefined);
  const abandoned = find(saveFor({ status: 'declined', declinedReason: 'abandoned' }), 'last-reception');
  assert.equal(abandoned.state, 'declined'); assert.equal(abandoned.next, null);
  const delivered = find(saveFor({ status: 'delivered', settled: false }), 'last-reception');
  assert.equal(delivered.state, 'resolved'); assert.doesNotMatch(text(delivered), /joined the others/);
  assert.equal(delivered.commitment, 'fulfilled'); assert.equal(delivered.next, null);
  assert.equal(delivered.hasOpenCommitment, false); assert.equal(delivered.trackable, false);
  const settled = find(saveFor({ status: 'delivered', settled: true, acknowledged: true }), 'last-reception');
  assert.match(settled.outcome, /joined the others/); assert.equal(settled.evidence.length, 2);
  assert.doesNotMatch(prose(settled), /escape unlocked|key|reward|captur/i);
});

test('fountain eyes reflect the irreversible decision and never reveal the unspoken key location', () => {
  assert.equal(find({ marble: { phase: 'in-the-water', toldWhereTheKeyIs: true } }, 'marble-eyes'), undefined);
  assert.match(find({ marble: { phase: 'carried' } }, 'marble-eyes').next, /empty sockets/);
  const returned = find({ marble: { phase: 'returned', toldWhereTheKeyIs: true } }, 'marble-eyes');
  assert.equal(returned.state, 'resolved'); assert.doesNotMatch(prose(returned), /felt|key|four along|services/i);
  const declined = find({ marble: { phase: 'declined' } }, 'marble-eyes');
  assert.equal(declined.state, 'declined'); assert.equal(declined.next, null);
});

test('telephone receipts describe calls and actual delivered items without inventing a dialing assignment', () => {
  const attempted = find({ save: { flags: { 'phone.called.sarah': true } } }, 'source-telephone');
  assert.equal(attempted.state, 'resolved'); assert.equal(attempted.next, null);
  assert.doesNotMatch(prose(attempted), /Sarah|confess|forgiv|\d{3,}|dial|key/i);
  const key = find({ save: { flags: { 'phone.key.granted': true } } }, 'source-telephone');
  assert.match(key.summary, /chapel key/); assert.doesNotMatch(text(key), /music sheet|Mozart|dial/i);
  const sheet = find({ save: { flags: { 'phone.sheet.granted': true } } }, 'source-telephone');
  assert.match(sheet.summary, /music sheet/); assert.equal(sheet.location.spaceId, undefined);
});

test('entries satisfy the presentation contract and remain stable across save reload snapshots', () => {
  const input = freeze({ save: { flags: { 'bag.taken': true, 'pub.help.declined': true, 'phone.loop.broken': true },
    roofRen: { met: true, stage: 'offered' }, academicBouncers: { clues: { practice: true } },
    academicSociety: { consent: 'declined' }, marbleHead: { phase: 'declined' },
    chunkSurf: { lastReception: { windowInvitation: { status: 'carrying' } } } }, job });
  const entries = buildQuestJournal(input);
  assert.equal(entries.length, 8); assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
  assert.deepEqual(buildQuestJournal(structuredClone(input)), entries);
  for (const e of entries) {
    assert.match(e.id, /^quest:/); assert.ok(e.title && e.area && e.summary);
    assert.ok(['assignment', 'lead'].includes(e.category));
    assert.ok(['active', 'resolved', 'declined'].includes(e.state));
    assert.ok(e.status.label && e.status.tone);
    assert.ok(e.next === null || typeof e.next === 'string');
    assert.ok(e.outcome === null || typeof e.outcome === 'string');
    assert.ok(Array.isArray(e.evidence) && e.evidence.every(v => typeof v === 'string'));
    assert.ok(e.location === null || typeof e.location.label === 'string');
    assert.equal(e.mapEnabled, undefined, 'real map availability belongs to the bag adapter');
    assert.ok(['undertaking', 'lead', 'record'].includes(e.nature));
    assert.ok(['none', 'assigned', 'accepted', 'fulfilled', 'declined', 'withdrawn', 'consented'].includes(e.commitment));
    assert.ok(e.stage.id && e.stage.label);
    assert.ok([null, 'NEXT', 'CHOICE', 'OPTIONAL'].includes(e.nextLabel));
    assert.equal(typeof e.trackable, 'boolean'); assert.equal(typeof e.hasOpenCommitment, 'boolean');
    assert.equal(typeof e.trackingKey, 'string');
    for (const m of e.milestones) assert.ok(m.id && m.label && ['done', 'current'].includes(m.state));
    for (const r of e.records) assert.ok(r.id && r.label && r.text);
    if (e.closure) assert.ok(e.closure.label && e.closure.text);
    if (e.followUp) {
      assert.ok(e.followUp.id && e.followUp.label && e.followUp.stage.id && e.followUp.stage.label);
      assert.ok([null, 'NEXT', 'CHOICE', 'OPTIONAL'].includes(e.followUp.nextLabel));
    }
  }
});
