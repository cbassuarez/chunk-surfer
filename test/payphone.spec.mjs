// THE PHONE BOX ON THE ARRIVAL ROAD, 1988.
//
// A grey pay-on-answer coinbox with a rotary dial (docs/plans/phone-box-1988.md).
// Numbers are found in the booth and on the road, never handed over. The dial is
// pulled round by hand and nothing dials on a key. Dialling is free; an answered
// call is rapid pips until the slot is fed, and the slot is fed with the tape,
// which the call records over. Calling himself escalates with the passes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DTMF, PAYPHONE_CARD, PAYPHONE_DIRECTORY, PAYPHONE_ERA, PAYPHONE_FREE, PAYPHONE_INSTRUCTIONS, PAYPHONE_KIOSK_NUMBER,
  PAYPHONE_NUMBERS, PAYPHONE_PASS, PAYPHONE_SCRATCHES, ROTARY_HOLES, SARAH_PAGE, UK_TONES,
  formatDialled, normaliseDialled, numberComplete, payphoneCallFlags, payphoneIncoming, payphoneKeyCall,
  payphoneLoopHolds, payphoneOutcome, rotaryPulses, rotaryReturnSeconds,
} from '../src/game/payphone.js';
import {
  PAYPHONE_PIPS_SECONDS, PAYPHONE_TAPE_MIN_SECONDS, payphoneTapeCredit, payphoneTapeExpired, payphoneTapeOverwrites, payphoneTapeWindow,
} from '../src/game/payphone-tape.js';
import { makePayphoneScene } from '../src/game/payphone-scene.js';
import { OUTSKIRT_PASSES, outskirtsArrivalLayout } from '../src/data/source-outskirts-arrival.js';

const story = JSON.parse(readFileSync(new URL('../content/narrative/source-space.payphone.story.json', import.meta.url), 'utf8'));
const outskirts = JSON.parse(readFileSync(new URL('../content/narrative/source-space.outskirts.story.json', import.meta.url), 'utf8'));
const allText = JSON.stringify(story) + readFileSync(new URL('../src/game/payphone-scene.js', import.meta.url), 'utf8');

// ── the era ────────────────────────────────────────────────────────────────
{
  assert.equal(PAYPHONE_ERA, 1988);
  assert.ok(!/press enter|enter to (call|dial)|mobile|text message|voicemail box/i.test(allText), 'something on the phone is from after 1988');
  assert.deepEqual([...PAYPHONE_FREE].sort(), ['clock', 'emergency', 'enquiries', 'operator']);
  assert.deepEqual(UK_TONES.dial.hz, [350, 440]);
  assert.ok(DTMF[5]);
  assert.ok(PAYPHONE_INSTRUCTIONS.join(' ').match(/RAPID PIPS/), 'the plate does not teach pay on answer');
  assert.ok(PAYPHONE_CARD.some((line) => line.includes('192')) && PAYPHONE_CARD.some((line) => /999/.test(line)));
  assert.ok(PAYPHONE_CARD.join(' ').replace(/\s/g, '').includes(PAYPHONE_KIOSK_NUMBER), 'the card does not give the box its own number');
}

// ── the numbers: 1988 lengths, and every answered call has words ────────────
{
  for (const [id, entry] of Object.entries(PAYPHONE_NUMBERS)) {
    assert.ok(numberComplete(entry.digits), `${id}: the exchange never sees ${entry.digits} as complete`);
    assert.ok(!numberComplete(entry.digits.slice(0, -1)) || entry.digits.length <= 3, `${id}: connects a digit early`);
    const outcome = payphoneOutcome({ digits: entry.digits });
    if (outcome.node) assert.ok(story.nodes[outcome.node], `${id} plays a node the story does not have (${outcome.node})`);
  }
  assert.ok(!/^07|^01632|^0113/.test(PAYPHONE_NUMBERS.flat.digits), 'a modern number on a 1988 network');
  assert.equal(payphoneOutcome({ digits: '01484221906' }).id, 'london', 'the letterhead has its London digit on a 1988 line');
  assert.equal(payphoneOutcome({ digits: '0632960999' }).id, 'unobtainable');
  assert.equal(normaliseDialled('0632 960 188'), '0632960188');
  assert.equal(formatDialled('0632960188'), '0632 960188');
  assert.equal(payphoneKeyCall({}), 'office');
  assert.equal(payphoneKeyCall({ 'cold.trunk.night': true }), 'lodge');
}

// ── who answers ─────────────────────────────────────────────────────────────
{
  const dial = (id, flags = {}, extra = {}) => payphoneOutcome({ digits: PAYPHONE_NUMBERS[id].digits, flags, ...extra });
  assert.equal(dial('sarah').node, 'sarah');
  assert.equal(dial('sarah').cost, 'grid');
  assert.ok(dial('sarah').pays);
  assert.equal(dial('sarah', { 'confession.kind': 'name', 'confession.value': 'Sarah' }).node, 'sarah-confessed');
  assert.equal(dial('sarah', { 'phone.called.sarah': true }).tone, 'engaged');
  assert.ok(story.nodes.sarah.lines.some((line) => /Sarah, it's no one/.test(line.text)));
  assert.ok(story.nodes['sarah-confessed'].lines.some((line) => /She's gone up/.test(line.text)));
  assert.equal(dial('lyle').node, 'lyle');
  assert.equal(dial('lyle', { 'phone.called.lyle': true }).node, 'lyle-again');
  assert.equal(dial('van').ringsAt, 'van');
  assert.equal(dial('van').answers, false);
  assert.equal(dial('van', { 'phone.van.offhook': true }).tone, 'engaged');
  assert.equal(dial('sister').answers, false);
  assert.equal(dial('enquiries').pays, false);
  assert.ok(story.nodes['enquiries-sarah'].lines.some((line) => /ex-directory/.test(line.text)));
  assert.deepEqual(dial('office', { 'cold.trunk.night': true }).grants, [], 'the office pays out when the lodge is the key call');
  assert.equal(dial('office', { 'cold.trunk.night': true }).answers, false);
  const key = payphoneOutcome({ digits: PAYPHONE_NUMBERS.office.digits, flags: {}, hasChapelKey: false });
  assert.equal(PAYPHONE_NUMBERS.office.digits.startsWith('0484'), true);
  assert.deepEqual(key.grants, ['chapel-key']);
  assert.deepEqual(payphoneOutcome({ digits: PAYPHONE_NUMBERS.office.digits, hasChapelKey: true }).grants, ['sheet']);
  assert.deepEqual(payphoneCallFlags(dial('sarah')), ['phone.called.sarah', 'phone.cost.sarah']);
}

// ── calling himself, by pass ─────────────────────────────────────────────────
{
  assert.ok(PAYPHONE_PASS.earlyLast < PAYPHONE_PASS.loop && PAYPHONE_PASS.loop < PAYPHONE_PASS.late);
  const received = { 'phone.key.granted': true, 'phone.sheet.granted': true };
  assert.equal(payphoneIncoming({ pass: 3, flags: received, lifting: true }), null, 'an early box without a pending story call is already on the line');
  const loop = payphoneIncoming({ pass: PAYPHONE_PASS.loop });
  assert.equal(loop.node, 'loop-answer');
  assert.ok(story.nodes[loop.node]?.lines?.some(line=>line.text==='There you are.'));
  assert.equal(story.nodes[loop.node]?.choices, undefined, 'an incoming story call still demands a choice');
  assert.ok(payphoneLoopHolds({ pass: PAYPHONE_PASS.loop }));
  assert.ok(!payphoneLoopHolds({ pass: PAYPHONE_PASS.loop, flags: { 'phone.loop.broken': true } }));
  // A conversation applies a CHOICE's flags, not a node's: the loop must break on the choice.
  const toSpoken = story.nodes.loop.choices.filter((c) => c.goto === 'loop-spoken');
  assert.ok(toSpoken.length && toSpoken.every((c) => c.mutations?.set?.includes('phone.loop.broken')), 'speaking does not break the loop');
  assert.ok(story.nodes.loop.choices.filter((c) => c.goto === 'loop-silent').every((c) => !c.mutations), 'silence breaks the loop');
  assert.ok(story.nodes['loop-spoken'].lines.some((line) => /There you are/.test(line.text)));
  assert.equal(payphoneIncoming({ pass: PAYPHONE_PASS.late, flags: received, lifting: true }).node, 'self-line');
  assert.equal(payphoneIncoming({ pass: PAYPHONE_PASS.late, flags: received, lifting: true, micLive: true }).node, 'self-line-mic');
  assert.equal(payphoneIncoming({ pass: PAYPHONE_PASS.late, flags: received, lifting: true }).cost, 'grid');
  assert.equal(payphoneIncoming({ pass: PAYPHONE_PASS.late, lifting: true, flags: { ...received, 'phone.cost.self': true } }).cost, null);
  assert.equal(OUTSKIRT_PASSES[PAYPHONE_PASS.loop].break, null, 'the loop pass is broken, and may have no box to ring');
}

// ── the booth has the answers ───────────────────────────────────────────────
{
  const scratched = PAYPHONE_SCRATCHES.map((entry) => entry.text).join(' ');
  assert.ok(/CAR 0836 9_0 4_7/.test(scratched), 'the van half-number is not scratched');
  assert.ok(PAYPHONE_SCRATCHES.some((entry) => entry.whose === 'van' && /van/i.test(entry.points)), 'the van half-number does not point at the van');
  assert.equal(PAYPHONE_DIRECTORY.surname, 'ASHWORTH');
  assert.ok(PAYPHONE_DIRECTORY.torn);
  assert.ok(PAYPHONE_DIRECTORY.listed.some((entry) => entry.who === 'sister' && entry.text.replace(/\s/g, '').includes(PAYPHONE_NUMBERS.sister.digits)), 'her sister is not in the phone book');
  assert.ok(outskirts.nodes.van.lines.some((line) => line.text.includes('0836 900417')), 'the car phone number is not on the van');
  for (const id of ['page-ledger', 'page-fence', 'page-dash', 'page-flurry']) {
    assert.ok(outskirts.nodes[id], `no words for ${id}`);
    // Her number is on her page while it is hers; after the loop pass the pages are his (losing himself).
    if (id === 'page-ledger') assert.ok(JSON.stringify(outskirts.nodes[id]).includes('960331'), `${id} does not carry her number`);
    if (id === 'page-fence' || id === 'page-dash') assert.ok(!JSON.stringify(outskirts.nodes[id]).includes('960331'), `${id} is still hers after the loop pass`);
  }
  for (const id of ['look-card', 'look-instructions', 'look-scratches', 'look-directory', 'look-window', 'flurry', 'lyle-recall', 'pips-first']) assert.ok(story.nodes[id], `no ${id} node`);
  // The pages drift from her to him.
  for (const id of ['flurry.lyle', 'flurry.them', 'flurry.him']) assert.ok(story.nodes[id]?.lines?.length >= 5, `the pages never become ${id}`);
  assert.ok(!JSON.stringify(story.nodes['flurry.him']).includes('960331'), 'his pages still carry her number');
}

// ── the box repeats, and her page finds him ─────────────────────────────────
{
  const layout = outskirtsArrivalLayout();
  const boxes = layout.filter((piece) => piece.payphone);
  const emptied = OUTSKIRT_PASSES.filter((pass) => pass.break === 'emptied').length;
  assert.ok(boxes.length <= OUTSKIRT_PASSES.length - emptied && boxes.length >= 20, 'the phone box does not repeat with the scene');
  assert.ok(boxes.some((piece) => piece.stretch === PAYPHONE_PASS.loop));
  const pages = layout.filter((piece) => /^page-/.test(piece.key));
  assert.ok(pages.every((piece) => piece.key !== 'page-ledger' || (piece.stretch >= SARAH_PAGE.ledgerFrom && piece.stretch <= SARAH_PAGE.ledgerTo)));
  assert.ok(pages.every((piece) => piece.key !== 'page-fence' || piece.stretch >= SARAH_PAGE.fenceFrom));
  assert.ok(pages.every((piece) => piece.key !== 'page-dash' || piece.stretch >= SARAH_PAGE.dashboardFrom));
  for (const key of ['page-ledger', 'page-fence', 'page-dash']) assert.ok(pages.some((piece) => piece.key === key), `her page is never ${key}`);
}

// ── the rotary dial ──────────────────────────────────────────────────────────
{
  assert.equal(ROTARY_HOLES.length, 10);
  assert.equal(rotaryPulses('0'), 10);
  assert.equal(rotaryPulses('3'), 3);
  assert.ok(rotaryReturnSeconds('0') > rotaryReturnSeconds('1'), 'a 0 comes back as fast as a 1');
}

// A line that records what was asked of it, on a clock the test turns.
function rig({ pass = 0, flags = {}, incoming = null, feed = { ok: true, credit: 40, label: 'LIBRARY' } } = {}) {
  let t = 0;
  const log = [];
  const line = new Proxy({}, { get: (_, key) => (key === 'ringSeconds' ? (n) => n * 3 : key === 'exchange' ? (s) => s : (...args) => { log.push([key, args[0]]); return undefined; }) });
  const events = [];
  const scene = makePayphoneScene({
    line, pass, incoming, clock: () => t, exchangeSeconds: () => 1,
    flags: (flag) => flags[flag],
    onCall: (outcome, extra) => events.push(['call', outcome.id, !!extra.paid, !!extra.unanswered, !!extra.incoming]),
    onRing: (outcome) => events.push(['ring', outcome.id]),
    onFirstPips: (outcome) => events.push(['pips', outcome.id]),
    onUnpaid: (outcome) => events.push(['unpaid', outcome.id]),
    onFeed: () => feed,
    onInspect: (region) => events.push(['inspect', region]),
    onClose: (info) => events.push(['close', info.hanging]),
  });
  scene.enter();
  const step = (seconds) => { for (let s = 0; s < seconds * 4; s += 1) { t += 0.25; scene.update(); } };
  const dial = (digits) => { for (const d of digits) { assert.ok(scene.pull(d), `could not dial ${d} in ${scene.view().phase}`); step(1.5); } };
  const until = (phase, seconds = 90) => { for (let s = 0; s < seconds * 4 && scene.view().phase !== phase; s += 1) { t += 0.25; scene.update(); } };
  return { scene, events, log, step, dial, until };
}

// ── dialling: by hand, no key dials, auto-connect ───────────────────────────
{
  const { scene, events, dial, until } = rig();
  for (const key of ['1', '0', 'Enter', 't', 'Backspace']) scene.key({ key, preventDefault() {} });
  assert.equal(scene.view().digits, '', 'a key dialled');
  dial(PAYPHONE_NUMBERS.lyle.digits);
  assert.notEqual(scene.view().phase, 'dialtone', 'a complete number did not connect by itself');
  until('pips');
  assert.equal(scene.view().phase, 'pips', 'an answered paid call did not pip');
  assert.deepEqual(events.filter((e) => e[0] === 'pips'), [['pips', 'lyle']]);
  assert.ok(!events.some((e) => e[0] === 'call'), 'a call connected before it was paid');
  assert.ok(scene.feed());
  assert.deepEqual(events.find((e) => e[0] === 'call'), ['call', 'lyle', true, false, false]);
  assert.ok(scene.view().window?.label === 'LIBRARY' && scene.view().slot);
}
{
  // A partial pull dials fewer; a digit then a pause connects whatever was dialled.
  const { scene, step } = rig();
  scene.grabHole('9', 0);
  scene.turnTo((Math.PI / 6.4) * 4.2);
  scene.release();
  step(2);
  assert.equal(scene.view().digits, '3', 'a short pull of 9 did not dial a smaller number');
  step(6);
  assert.notEqual(scene.view().phase, 'dialtone', 'the exchange did not give up waiting');
}
{
  // Unpaid: the far end gives up after the pips.
  const { scene, events, step, dial } = rig();
  dial(PAYPHONE_NUMBERS.sarah.digits);
  step(30 + PAYPHONE_PIPS_SECONDS + 2);
  assert.deepEqual(events.filter((e) => e[0] === 'unpaid'), [['unpaid', 'sarah']]);
  step(3);
  assert.equal(scene.view().phase, 'dialtone');
}
{
  // The slot is shut until somebody answers; free calls never pip.
  const { scene, events, step, dial } = rig();
  assert.equal(scene.feed(), false, 'the slot took the tape on dial tone');
  dial(PAYPHONE_NUMBERS.operator.digits);
  step(15);
  assert.ok(events.some((e) => e[0] === 'call' && e[1] === 'operator' && !e[2]), 'a free call pipped');
}
{
  // The van: ringing up the road, and Escape leaves the handset hanging.
  const { scene, events, step, dial } = rig();
  dial(PAYPHONE_NUMBERS.van.digits);
  step(4);
  assert.equal(scene.view().phase, 'ringing');
  assert.ok(events.some((e) => e[0] === 'ring' && e[1] === 'van'));
  scene.key({ key: 'Escape', preventDefault() {} });
  assert.deepEqual(events.at(-1), ['close', true]);
}
{
  // The loop pass: already a call on the line when he lifts it.
  const incoming = payphoneIncoming({ pass: PAYPHONE_PASS.loop });
  const { events } = rig({ pass: PAYPHONE_PASS.loop, incoming });
  assert.deepEqual(events[0], ['call', 'loop', false, false, true]);
}

// ── the tape ────────────────────────────────────────────────────────────────
{
  assert.equal(payphoneTapeCredit({ headSeconds: 0, endSeconds: 0 }).reason, 'blank');
  assert.equal(payphoneTapeCredit({ headSeconds: 100, endSeconds: 100 + PAYPHONE_TAPE_MIN_SECONDS - 1 }).reason, 'at-end');
  assert.ok(payphoneTapeCredit({ headSeconds: 0, endSeconds: 90 }).fits);
  const takes = [
    { id: 'a', roomId: 'library', startSeconds: 0, endSeconds: 30 },
    { id: 'b', roomId: 'chapel', startSeconds: 30, endSeconds: 60 },
    { id: 'c', roomId: 'hall', startSeconds: 60, endSeconds: 90, voided: true },
  ];
  assert.deepEqual(payphoneTapeOverwrites({ takes, from: 20, to: 31 }).map((t) => t.roomId), ['library', 'chapel']);
  assert.deepEqual(payphoneTapeOverwrites({ takes, from: 61, to: 80 }), [], 'a lost take is lost twice');
  assert.equal(payphoneTapeWindow({ takes, at: 45 }).label, 'CHAPEL');
  assert.equal(payphoneTapeWindow({ takes, at: 75 }).label, 'BLANK TAPE');
  assert.ok(payphoneTapeExpired({ head: 80, end: 90, elapsed: 10 }));
}

console.log('payphone: ok');
