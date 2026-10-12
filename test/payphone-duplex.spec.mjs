// THE PHONE BOX: WHAT THE TAPE BUYS, AND WHAT THE FAR END HEARS.
//
// Pay on answer (1988): everything but 999, 100, 123 and 192 pips when it is
// answered. The slot takes the DA-1000's tape; a paid call runs it one second per
// second connected and records over whatever rooms are under the head, for good,
// and running out ends the call. The far end hears whether he spoke and nothing
// else; sidetone cuts itself off on a speaker loop; what he leaves on his own
// answerphone is kept only with the mic on and consent given.
import assert from 'node:assert/strict';

import {
  PAYPHONE_BEATS, PAYPHONE_KEY_RETURN_BUDGET, PAYPHONE_TAPE_MIN_SECONDS,
  payphoneTapeCredit, payphoneTapeExpired, payphoneTapeOverwrites, payphoneTapeTakeAt, payphoneTapeWindow,
} from '../src/game/payphone-tape.js';
import {
  DUPLEX, createSidetoneGuard, createVoiceActivity, createVoicemailTake, listenDecision, voicemailAllowed,
} from '../src/game/payphone-duplex.js';
import { PAYPHONE_FREE, PAYPHONE_NUMBERS, payphoneOutcome } from '../src/game/payphone.js';

// ── free and paid ──────────────────────────────────────────────────────────
{
  assert.deepEqual([...PAYPHONE_FREE].sort(), ['clock', 'emergency', 'enquiries', 'operator']);
  for (const [id, entry] of Object.entries(PAYPHONE_NUMBERS)) {
    const outcome = payphoneOutcome({ digits: entry.digits, flags: { 'cold.trunk.night': true } });
    if (!outcome.answers) { assert.equal(outcome.pays, false, `${id}: nobody answers, and it asks for money`); continue; }
    assert.equal(outcome.pays, !PAYPHONE_FREE.includes(id), `${id} payment is wrong`);
  }
  assert.equal(payphoneOutcome({ digits: '0632960999' }).pays, false, 'an unobtainable number asks for money');
}

// ── the tape as credit ─────────────────────────────────────────────────────
{
  assert.deepEqual({ ...payphoneTapeCredit({ headSeconds: 10, endSeconds: 70 }) }, { head: 10, end: 70, credit: 60, fits: true, reason: null });
  assert.equal(payphoneTapeCredit({ headSeconds: 66, endSeconds: 70 }).fits, false);
  assert.equal(payphoneTapeCredit({ headSeconds: 66, endSeconds: 70 }).reason, 'at-end');
  assert.equal(payphoneTapeCredit({ headSeconds: 0, endSeconds: 0 }).reason, 'blank');
  assert.equal(payphoneTapeCredit({ headSeconds: 0, endSeconds: PAYPHONE_TAPE_MIN_SECONDS }).fits, true);
  assert.equal(payphoneTapeCredit({ headSeconds: 999, endSeconds: 40 }).head, 40, 'the head runs past the end');
  assert.ok(PAYPHONE_KEY_RETURN_BUDGET <= 20);
  assert.ok(PAYPHONE_BEATS.return && PAYPHONE_BEATS.beep, 'the return and the answerphone beep are not beats');
}

// ── recorded over, and expiry ───────────────────────────────────────────────
{
  const takes = [
    { id: 'take:1', roomId: 'room-a', startSeconds: 0, endSeconds: 40 },
    { id: 'take:2', roomId: 'room-b', startSeconds: 40, endSeconds: 80 },
  ];
  assert.equal(payphoneTapeTakeAt(takes, 39.9).id, 'take:1');
  assert.equal(payphoneTapeTakeAt(takes, 40).id, 'take:2');
  assert.equal(payphoneTapeTakeAt(takes, 80), null);
  assert.deepEqual(payphoneTapeOverwrites({ takes, from: 10, to: 10 }), [], 'a call that never ran recorded over something');
  assert.deepEqual(payphoneTapeOverwrites({ takes, from: 10, to: 15 }).map((t) => t.roomId), ['room-a']);
  assert.deepEqual(payphoneTapeOverwrites({ takes, from: 35, to: 45 }).map((t) => t.roomId), ['room-a', 'room-b'], 'a call across two rooms kept one');
  assert.equal(payphoneTapeWindow({ takes, at: 50, label: (id) => `the ${id}` }).label, 'THE ROOM-B');
  assert.equal(payphoneTapeExpired({ head: 70, end: 80, elapsed: 9.9 }), false);
  assert.equal(payphoneTapeExpired({ head: 70, end: 80, elapsed: 10 }), true);
}

// ── what the far end hears ─────────────────────────────────────────────────
{
  const activity = createVoiceActivity();
  for (let t = 0; t < 250; t += 50) activity.update(0.05, 50);
  assert.equal(activity.state().spoke, false, 'a breath counts as speaking');
  activity.update(0.05, 60);
  assert.equal(activity.state().speaking, true);
  assert.equal(listenDecision({ speech: 'a', silence: 'b', seconds: 5 }, activity.state(), 1000), 'speech');
  const quiet = createVoiceActivity();
  quiet.update(0.001, 4000);
  assert.equal(listenDecision({ speech: 'a', silence: 'b', seconds: 5 }, quiet.state(), 4000), null, 'silence decided early');
  quiet.update(0.001, 1000);
  assert.equal(listenDecision({ speech: 'a', silence: 'b', seconds: 5 }, quiet.state(), 5000), 'silence');
  assert.equal(listenDecision({ speech: 'a', seconds: 5 }, quiet.state(), 60000), null, 'a node with no silence branch forces one');
  assert.equal(listenDecision(null, activity.state(), 1e6), null);
}

// ── sidetone, and the speaker loop ─────────────────────────────────────────
{
  const guard = createSidetoneGuard();
  // Headphones: the mic hears him, not the earpiece.
  for (let i = 0; i < 60; i += 1) assert.equal(guard.update({ mic: 0.03 + (i % 2) * 0.01, out: 0.0, dtMs: 16 }), DUPLEX.sidetoneGain);
  // Speakers: mic climbing with the earpiece.
  let gain = DUPLEX.sidetoneGain;
  for (let i = 0; i < 40; i += 1) gain = guard.update({ mic: 0.02 + i * 0.002, out: 0.02 + i * 0.002, dtMs: 16 });
  assert.equal(gain, 0, 'a speaker loop keeps its sidetone');
  assert.ok(guard.tripped());
  for (let i = 0; i < 200; i += 1) gain = guard.update({ mic: 0, out: 0, dtMs: 16 });
  assert.equal(gain, DUPLEX.sidetoneGain, 'sidetone never comes back');
}

// ── the voicemail ──────────────────────────────────────────────────────────
{
  assert.equal(voicemailAllowed({ micOn: true, profileStatus: 'FULL', consented: true }), true);
  assert.equal(voicemailAllowed({ micOn: false, profileStatus: 'FULL', consented: true }), false, 'kept without a microphone');
  assert.equal(voicemailAllowed({ micOn: true, profileStatus: 'OFF', consented: true }), false, 'kept with the profile off');
  assert.equal(voicemailAllowed({ micOn: true, profileStatus: 'CUSTOM', consented: false }), false, 'kept without consent');

  const spoke = createVoicemailTake();
  for (let i = 0; i < 20; i += 1) spoke.update({ level: 0.05, dt: 0.05 });
  assert.equal(spoke.stopped(), null);
  let stop = null;
  for (let i = 0; i < 80 && !stop; i += 1) stop = spoke.update({ level: 0.001, dt: 0.05 });
  assert.equal(stop, 'silence');
  assert.ok(spoke.seconds() >= DUPLEX.voicemailSilenceSeconds);

  const full = createVoicemailTake();
  for (let i = 0; i < 700 && !full.stopped(); i += 1) full.update({ level: 0.05, dt: 0.05 });
  assert.equal(full.stopped(), 'full');
  assert.ok(full.seconds() <= DUPLEX.voicemailMaxSeconds + 0.06);

  const tape = createVoicemailTake();
  tape.update({ level: 0.05, dt: 0.5 });
  assert.equal(tape.update({ level: 0.05, dt: 0.05, tapeLeft: 0 }), 'tape-end');
  const hung = createVoicemailTake();
  assert.equal(hung.update({ hungUp: true }), 'hung-up');
}

console.log('payphone duplex specs passed');
