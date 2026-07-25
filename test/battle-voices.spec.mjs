// The surfer's voice, as a contract.
//
// The stems it fights with are whole performances — the marimba take is 78
// seconds, the piano 7, the authored scream 30 — and the fight throws one every
// enemy beat, about one a second. Played whole they stack into each other and
// outlive the fight, which is the bug this file exists to prevent:
//
//   · every weapon voice is a CHOP: one bar off the take, never the take, and
//     bounded by the turn that swung it rather than by its own length;
//   · successive beats chop successive bars, so it reads as playing rather than
//     as one sample retriggering;
//   · the scream is chopped AND screwed, and never carries its own scene's
//     screen shake into an ordinary beat;
//   · the breakbeat is a BLOW — a LOOP beat's voice — not a backing that starts
//     for reasons the player cannot see and that nothing ever stops;
//   · and every enemy blow says itself: who, what, on which instrument, and
//     whether it worked.

import assert from 'node:assert/strict';

import {
  BREAKBEAT_CUE,
  SCREAM_CUE,
  WEAPON_CHOP,
  enemyAttackCue,
  enemyAttackShape,
  enemyAttackVoice,
  surferAggression,
} from '../src/audio/piano-weapon.js';
import { strikeVerdict } from '../src/game/combat.js';

// ── every blow is a chop ────────────────────────────────────────────────────
// A bar is the unit. Half a bar was a fragment: you heard that something had
// happened without hearing what it was.
for (const cueId of ['marimba.weapon.01', 'piano.weapon.03', 'violin.weapon.02']) {
  const shape = enemyAttackShape(cueId, 0);
  assert.equal(shape.sliceSeconds, WEAPON_CHOP.step, `${cueId} is chopped to exactly one bar`);
  assert.ok(shape.sliceSeconds <= WEAPON_CHOP.step,
    `${cueId} chop (${shape.sliceSeconds}s) is never longer than a bar of the take`);
  assert.equal(shape.wrapStart, true, 'a chop wraps rather than running off the end');
  assert.ok(shape.fadeIn > 0 && shape.fadeOut > 0, 'a chop has no clicks on either end');
  // The turn is what ends it, and the fade has to cover the cut or it clicks.
  assert.ok(shape.fadeOut >= 0.1, 'the fade covers the group cut at settleTurn');
}
// It is a phrase, not a stab: comfortably more than a single beat of the grid.
assert.ok(WEAPON_CHOP.slice > (60 / 168) * 2, 'a chop is longer than two beats');

// Successive beats are successive bars: playing, not retriggering.
const walk = [0, 1, 2, 3].map((beat) => enemyAttackShape('marimba.weapon.01', beat).trimStart);
assert.deepEqual(walk, [0, WEAPON_CHOP.step, WEAPON_CHOP.step * 2, WEAPON_CHOP.step * 3]);
assert.equal(new Set(walk).size, walk.length, 'no two consecutive beats chop the same bar');
// 168bpm: a bar is 4/168 minutes. The chop has to land on that grid or the take
// stops being in time with itself.
assert.ok(Math.abs(WEAPON_CHOP.step - (60 / 168) * 4) < 1e-9, 'the step is one 168bpm bar');

// ── the scream is chopped and screwed ───────────────────────────────────────
const scream = enemyAttackShape(SCREAM_CUE, 0, () => 0.5);
assert.ok(scream.rate < 0.8, `screwed: ${scream.rate} is well under pitch`);
assert.ok(scream.sliceSeconds <= 0.5, `chopped: ${scream.sliceSeconds}s, not thirty`);
assert.ok(scream.trimStart > 0, 'bitten out of the middle, not the top of the file');
assert.ok(scream.gainScale < 0.5, `quiet: ${scream.gainScale} of the authored level`);
assert.equal(scream.skipEffects, true,
  'the authored scream owns a screen shake; a weapon beat does not get it every time');

// The scream only comes out when the recordist is nearly broken.
const healthy = enemyAttackCue({ intentKind: 'broadcast', beat: 0, composure: 8, maxComposure: 8 });
const broken = enemyAttackCue({ intentKind: 'broadcast', beat: 0, composure: 2, maxComposure: 8 });
assert.notEqual(healthy, SCREAM_CUE);
assert.equal(broken, SCREAM_CUE);

// ── the breakbeat is a BLOW, not a backing ──────────────────────────────────
// It used to be a sustained loop the surfer "decided to press" with, started off
// a composure threshold and running under the whole fight. Two bugs in one: it
// arrived for no reason the player could see, and once running, nothing in the
// fight ever took it away. It is now what a LOOP beat sounds like — the intent
// that repeats itself at you — so you hear it because you were hit with it.
const loopBeat = enemyAttackCue({ intentKind: 'loop', beat: 0, composure: 8, maxComposure: 8 });
assert.equal(loopBeat, BREAKBEAT_CUE, 'a LOOP beat hits you with the breakbeat');
const loopShape = enemyAttackShape(loopBeat, 2);
assert.equal(loopShape.sliceSeconds, WEAPON_CHOP.slice, 'a whole bar of the break, and no more');
assert.ok(loopShape.sliceSeconds < 169, 'a chop, not the 169-second take');
assert.equal(loopShape.wrapStart, true, 'walking a 169-second take one bar at a time');
// Nothing else in the fight is the breakbeat, or it would stop being a tell.
for (const kind of ['broadcast', 'overload', 'conceal', 'silence']) {
  assert.notEqual(enemyAttackCue({ intentKind: kind, beat: 0, composure: 8, maxComposure: 8 }), BREAKBEAT_CUE,
    `${kind} does not borrow the LOOP's voice`);
}

// ── every enemy blow says itself ────────────────────────────────────────────
// The fight used to print numbers after the fact and leave the player to infer,
// from -1 COMPOSURE, which move they had just been hit by — a move they had
// never seen named.
for (const kind of ['broadcast', 'overload', 'loop', 'conceal', 'silence']) {
  const voice = enemyAttackVoice(kind, enemyAttackCue({ intentKind: kind, beat: 0 }));
  assert.ok(voice.verb && voice.verb === voice.verb.toUpperCase(), `${kind} has a spoken verb`);
  assert.ok(voice.instrument, `${kind} names the instrument it is played on`);
}
assert.equal(enemyAttackVoice('loop', BREAKBEAT_CUE).instrument, 'BREAKBEAT');
assert.equal(enemyAttackVoice('broadcast', SCREAM_CUE).verb, 'SCREAMS', 'the scream is its own verb');

// And then whether it worked, in words, not just in numbers.
assert.match(strikeVerdict({ perfect: true }).text, /COUNTERED/);
assert.match(strikeVerdict({ received: 1 }, { parried: true }).text, /TURNED BACK/);
assert.match(strikeVerdict({ received: 2, snrTo: 'noise' }).text, /NOISE/);
assert.match(strikeVerdict({ received: 2 }).text, /HARD/);
assert.match(strikeVerdict({ received: 1 }).text, /CONNECTS/);
assert.match(strikeVerdict({}).text, /GLANCES OFF/);
for (const last of [{ perfect: true }, { received: 1 }, {}]) {
  assert.ok(strikeVerdict(last).role, 'every verdict carries a colour role');
}

// A meaner difficulty smells blood sooner.
assert.ok(surferAggression(-2) > surferAggression(2));

console.log('battle voice contracts passed');
