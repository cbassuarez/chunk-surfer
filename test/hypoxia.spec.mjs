import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HYPOXIA_TELL,
  freshHypoxia,
  hypoxiaConfidence,
  hypoxiaFrame,
  hypoxiaSignature,
  hypoxiaUnwarned,
  stepHypoxia,
} from '../src/game/hypoxia.js';
import { CONFIDENCE, readConfidence } from '../src/game/thought-trace.js';

const soak = (state, minutes, options) => {
  let next = state;
  for (let second = 0; second < minutes * 60; second += 1) next = stepHypoxia(next, 1, options);
  return next;
};
const BAD_ROOM = { source: .9, stress: .05 };
const BAD_ROOM_AFRAID = { source: .9, stress: .6 };

// ── THE ALARM IS ON A DIFFERENT CIRCUIT FROM THE DANGER ─────────────────────
//
// The urge to breathe reads carbon dioxide. Oxygen has no alarm. Everything in
// this module exists to keep those two things separable, because the moment
// they move together the subject becomes a stamina bar.
test('breathing hard removes the warning without removing the danger', () => {
  const calm = soak(freshHypoxia(1), 8, BAD_ROOM);
  const afraid = soak(freshHypoxia(1), 8, BAD_ROOM_AFRAID);

  assert.ok(Math.abs(calm.exposure - afraid.exposure) < 1e-9,
    'fear changes nothing about how much oxygen he is getting');
  assert.ok(calm.drive > .5, 'a man breathing normally gets the alarm');
  assert.ok(afraid.drive < .05, 'a frightened man scrubs the CO₂ and gets nothing');
  assert.equal(hypoxiaUnwarned(afraid), true, 'which is the quadrant with no warning in it');
  assert.equal(hypoxiaUnwarned(calm), false);
});

test('the onset is insidious — minutes, not seconds', () => {
  // Long enough that the first stretch of it gets blamed on the building, the
  // lamp, the hour. A fast onset is a jump scare; this is not one.
  const early = soak(freshHypoxia(1), 2, BAD_ROOM);
  assert.equal(hypoxiaFrame(early).stage, 'onset', 'two minutes in, almost nothing');
  assert.ok(hypoxiaFrame(early).calibration < 1.15);

  const late = soak(freshHypoxia(1), 12, BAD_ROOM);
  assert.ok(['unreliable', 'failing'].includes(hypoxiaFrame(late).stage),
    'and a quarter of an hour to finish the job');
});

test('air is the only thing that helps, and it is not instant', () => {
  const hurt = soak(freshHypoxia(1), 10, BAD_ROOM);
  const out = soak(hurt, 1, { source: 0, fresh: true });
  assert.ok(out.exposure < hurt.exposure, 'getting out works');
  assert.ok(out.exposure > 0, 'but one minute of it does not undo ten');
});

// ── EVERY BODY FAILS IN ITS OWN ORDER ───────────────────────────────────────
//
// Aircrew learn their PERSONAL symptom sequence in a chamber, because it is
// idiosyncratic and the general description will not reach them once it starts.
// A fixed threshold would be the wrong physiology and a learnable exploit.
test('the recordist has a signature, and it is his alone', () => {
  const seen = new Set();
  const tolerances = new Set();
  for (let seed = 0; seed < 60; seed += 1) {
    const signature = hypoxiaSignature(seed);
    assert.ok(HYPOXIA_TELL.includes(signature.tell));
    assert.ok(signature.tolerance >= .75 && signature.tolerance <= 1.35);
    seen.add(signature.tell);
    tolerances.add(signature.tolerance.toFixed(3));
  }
  assert.ok(seen.size >= 3, 'the tell varies between runs');
  assert.ok(tolerances.size > 40, 'and so does how long he lasts');

  const twice = hypoxiaSignature(7);
  assert.deepEqual(hypoxiaSignature(7), twice, 'but never within one');
});

// ── WHAT FAILS, IN WHAT ORDER ───────────────────────────────────────────────
test('certainty goes before sight, and hearing is not deafness', () => {
  const frames = [2, 5, 9, 13].map((minutes) => hypoxiaFrame(soak(freshHypoxia(3), minutes, BAD_ROOM)));

  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(frames[index].calibration >= frames[index - 1].calibration, 'certainty only inflates');
    assert.ok(frames[index].colour <= frames[index - 1].colour, 'colour only fades');
  }
  // Loss of self-criticism is the first thing aviation medicine reports.
  const early = hypoxiaFrame(soak(freshHypoxia(3), 3, BAD_ROOM));
  assert.ok(early.calibration > 1.05, 'he is already surer than he should be');
  assert.ok(early.error < .12, 'before he is measurably wrong about much');

  // Auditory ATTENTION degrades. Hearing does not stop.
  const worst = frames.at(-1);
  assert.ok(worst.gating > .2, 'gating never reaches deafness');
  assert.ok(worst.narrowing < .7, 'and it never becomes a black tunnel either');
});

test('tunnel vision is a late sign, not a difficulty dial', () => {
  // The memo this came from claimed peripheral loss came first. The literature
  // says contrast and colour go in moderate hypoxia and true tunnelling only at
  // the extreme, so narrowing is held back almost to the end.
  const middling = hypoxiaFrame(soak(freshHypoxia(5), 7, BAD_ROOM));
  assert.ok(middling.colour < .8, 'colour is well gone by the middle');
  assert.equal(middling.narrowing, 0, 'and the field has not closed at all');
});

// ── THE DECOUPLING, WHICH IS THE WHOLE DEVICE ───────────────────────────────
test('the trace stops hedging before it starts lying, and only then insists', () => {
  const state = { composure: 30, maxComposure: 40 };
  assert.equal(readConfidence(state, .62, 1), CONFIDENCE.UNSURE,
    'honest: a middling read is hedged');
  assert.equal(readConfidence(state, .62, 1.3), CONFIDENCE.LIKELY,
    'the floor: the hedging simply stops arriving');
  assert.equal(readConfidence(state, .45, 1.6), CONFIDENCE.SURE,
    'the conviction: certainty in an error, last stage only');

  // And the honest read is untouched — only the stating of it moved.
  const { stated, pathological } = hypoxiaConfidence(.45, 1.6);
  assert.ok(stated > .45, 'he says more than he has');
  assert.equal(pathological, true);
  assert.equal(hypoxiaConfidence(.45, 1).stated, .45, 'at himself, he says exactly what he has');
});

// ── ANTI-PATTERNS, HELD OPEN ────────────────────────────────────────────────
test('there is no oxygen meter, and no single hypoxia level', () => {
  const source = readFileSync('src/game/hypoxia.js', 'utf8');
  const frame = hypoxiaFrame(soak(freshHypoxia(9), 6, BAD_ROOM));

  // A visible number converts the whole subject into resource management. The
  // frame carries no percentage, no remaining time, and no one scalar that
  // could be drawn as a bar.
  assert.equal(frame.saturation, undefined);
  assert.equal(frame.remaining, undefined);
  assert.equal(frame.level, undefined);
  assert.equal(typeof frame.stage, 'string', 'the only summary is a word, for the writing');

  // The latent variables move at different rates and do not agree. If any two
  // of them were the same number, the state would be one slider wearing a hat.
  const values = [frame.calibration - 1, 1 - frame.colour, 1 - frame.gating, frame.error];
  assert.equal(new Set(values.map((value) => value.toFixed(4))).size, values.length,
    'no two outputs are the same quantity');

  assert.doesNotMatch(source, /\bmuffl|lowpass|duck\b/i,
    'nothing here touches the audio bus — hypoxia is not an ear problem');
});

test('the state is never handed to the player as a quantity', () => {
  const main = readFileSync('src/main.js', 'utf8');
  const hud = /drawVfd(Meter|Counter)\([^)]*(hypoxia|oxygen|saturation|spo2)/i;
  assert.doesNotMatch(main, hud, 'no gauge, no counter, no bar');
});

test('the lamp is fine and the meter says so', async () => {
  const { resolveTorchLook } = await import('../src/render/lighting-model.js');
  const full = resolveTorchLook({ on: true, battery: 1, perception: 1 });
  const dimmed = resolveTorchLook({ on: true, battery: 1, perception: .25 });

  assert.ok(dimmed.reach < full.reach, 'less of the room arrives');
  assert.ok(dimmed.power < full.power);
  // The two things the HUD is drawn from. If either of these moved, the player
  // could diagnose the problem by looking at the battery — and the whole effect
  // depends on the battery telling them everything is fine.
  assert.equal(dimmed.health, full.health, 'the battery is untouched');
  assert.equal(dimmed.band, full.band, 'and so is the band the readout names');

  // A flat battery is still a flat battery, whatever he can see.
  assert.equal(resolveTorchLook({ on: true, battery: 0, perception: 1 }).band,
    resolveTorchLook({ on: true, battery: 0, perception: .1 }).band);
});

test('the reduced-dread setting opts out of the perceptual layer entirely', async () => {
  const { hypoxiaPerception } = await import('../src/game/hypoxia.js');
  const bad = hypoxiaFrame(soak(freshHypoxia(4), 12, BAD_ROOM));
  const on = hypoxiaPerception(bad);
  const off = hypoxiaPerception(bad, { reducedDread: true });

  assert.ok(on.torch < .8 && on.chroma < .5, 'it does something when it is on');
  assert.deepEqual(off, { torch: 1, coverage: 1, chroma: 1, narrowing: 0 },
    'and nothing at all when it is not — the beat still arrives through the tape');
});

test('the tape is the objective witness and nothing here reaches it', () => {
  // The design depends on the recording staying honest while the man does not.
  // If any of this ever reached playback, the player would lose the one channel
  // they can check him against.
  for (const path of ['src/game/playback.js', 'src/game/recordist.js']) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /hypoxia|perception|calibration/i,
      `${path} must not know the recordist is impaired`);
  }
});
