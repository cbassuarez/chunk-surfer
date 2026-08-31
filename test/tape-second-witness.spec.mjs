import assert from 'node:assert/strict';

import {
  PLAYBACK, beginTake, notePresence, sealTake, takeFor, abortTake, guestShape,
  buildPlaybackSnapshot,
} from '../src/game/playback.js';

// The needle and the tape were wired to the same input. They agree with each
// other and disagree with the man wearing the headphones — that is the device,
// and these are the properties it needs to keep having.

// ── the tape records the reading, peak-held ─────────────────────────────────
{
  abortTake('room');
  beginTake('room', { x: 1, y: 2 });

  notePresence('room', .20, 5);
  notePresence('room', .70, 18);
  notePresence('room', .35, 30);   // it went away again

  const take = takeFor('room');
  assert.equal(take.presence.peak, .70, 'a microphone keeps the loudest it ever saw');
  assert.equal(take.presence.atSec, 18, 'and when it saw it');

  sealTake('room');
  assert.equal(takeFor('room').presence.peak, .70, 'sealing keeps it');

  // A sealed take cannot be written to. Playing a tape twice plays the tape.
  notePresence('room', .99, 40);
  assert.equal(takeFor('room').presence.peak, .70, 'a sealed take does not re-roll');
  abortTake('room');
}

// ── a quiet take is exactly the tape it has always been ────────────────────
{
  const untouched = guestShape(null);
  assert.equal(untouched.enterSec, PLAYBACK.guestDelaySec);
  assert.equal(untouched.riseSec, PLAYBACK.guestRiseSec);
  assert.equal(untouched.peak, PLAYBACK.guestPeak);
  assert.equal(untouched.corroborated, false, 'nothing near it is not a claim');

  // Under the floor is still an ordinary take: a needle twitch is not a witness.
  assert.deepEqual(guestShape({ peak: PLAYBACK.presenceFloor, atSec: 20 }), untouched);
}

// ── a take the meter climbed through carries it ────────────────────────────
{
  const quiet = guestShape(null);
  const close = guestShape({ peak: .75, atSec: 22.5 });

  assert.equal(close.corroborated, true);
  assert.ok(close.peak > quiet.peak, 'it is louder on the tape than an ordinary guest');
  assert.ok(close.peak <= PLAYBACK.guestCeiling, 'and still a recording, not a jump scare');
  assert.ok(close.riseSec < quiet.riseSec, 'and stops being deniable sooner');

  // IT ARRIVES WHERE IT HAPPENED. Half way through the minute is half way
  // through the tape — that is what makes the two instruments corroborate
  // rather than merely both being spooky.
  const span = PLAYBACK.seconds - 1;
  assert.ok(Math.abs(close.enterSec - span * .5) < .01,
    `a pass at the halfway mark lands at the halfway mark (got ${close.enterSec})`);

  const early = guestShape({ peak: .75, atSec: 4.5 });
  assert.ok(early.enterSec < close.enterSec, 'an early pass is early on the tape');
}

// ── the rise must finish before the tape does ──────────────────────────────
// A guest that arrives after the fade-out is a guest nobody hears, which is the
// one outcome this may not produce.
{
  for (const atSec of [0, 1, 22, 44, 45, 90]) {
    for (const peak of [.13, .5, 1]) {
      const shape = guestShape({ peak, atSec });
      assert.ok(shape.enterSec >= PLAYBACK.guestEnterMinSec,
        `never on top of the fade-in (${peak}@${atSec})`);
      assert.ok(shape.enterSec + shape.riseSec * .55 <= PLAYBACK.seconds,
        `audible before the tape ends (${peak}@${atSec} -> ${shape.enterSec}+${shape.riseSec})`);
    }
  }
}

// ── the recorder never names it ────────────────────────────────────────────
// Transport telemetry describes the recording and the machine. Nothing visible
// on the DA-1000 is allowed to classify what the headphones reveal, and the
// presence peak is exactly the kind of thing that would.
{
  const snapshot = buildPlaybackSnapshot({
    take: { roomId: 'r', at: 1, audible: [[4, .1]], discrete: [], guest: { id: 'g' }, presence: { peak: .9, atSec: 10 } },
    playing: null,
    now: 0,
  });
  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes('presence'), 'the transport does not report the guest');
  assert.ok(!serialized.includes('0.9'), 'nor the level that put it there');
}

console.log('tape-second-witness.spec.mjs ok');
