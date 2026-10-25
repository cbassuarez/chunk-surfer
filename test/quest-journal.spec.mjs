import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestJournal } from '../src/game/quest-journal.js';
import { pubQuestState } from '../src/game/pub-quest.js';

const find = (input, id) => buildQuestJournal(input).find(e => e.id === `quest:${id}`);
const text = value => JSON.stringify(value);
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
  assert.equal(agreed.state, 'active'); assert.match(agreed.next, /agreement you made/);
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
  const settled = find(saveFor({ status: 'delivered', settled: true, acknowledged: true }), 'last-reception');
  assert.match(settled.outcome, /joined the others/); assert.equal(settled.evidence.length, 2);
  assert.doesNotMatch(text(settled), /escape unlocked|key|reward|captur/i);
});

test('fountain eyes reflect the irreversible decision and never reveal the unspoken key location', () => {
  assert.equal(find({ marble: { phase: 'in-the-water', toldWhereTheKeyIs: true } }, 'marble-eyes'), undefined);
  assert.match(find({ marble: { phase: 'carried' } }, 'marble-eyes').next, /empty sockets/);
  const returned = find({ marble: { phase: 'returned', toldWhereTheKeyIs: true } }, 'marble-eyes');
  assert.equal(returned.state, 'resolved'); assert.doesNotMatch(text(returned), /felt|key|four along|services/i);
  const declined = find({ marble: { phase: 'declined' } }, 'marble-eyes');
  assert.equal(declined.state, 'declined'); assert.equal(declined.next, null);
});

test('telephone receipts describe calls and actual delivered items without inventing a dialing assignment', () => {
  const attempted = find({ save: { flags: { 'phone.called.sarah': true } } }, 'source-telephone');
  assert.equal(attempted.state, 'resolved'); assert.equal(attempted.next, null);
  assert.doesNotMatch(text(attempted), /Sarah|confess|forgiv|\d{3,}|dial|key/i);
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
  }
});
