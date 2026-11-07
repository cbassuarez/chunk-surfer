import test from 'node:test';
import assert from 'node:assert/strict';
import { COASTAL_MUSIC_BOX_NOTE_BANK, coastalMusicBoxNearestSample, coastalMusicBoxRepitchRate, coastalMusicBoxVoiceForEvent } from '../src/data/coastal-music-box-notes.js';
import { bitcrush, sampleAndHold, loFi } from '../src/audio/lo-fi.js';
import { COASTAL_MUSIC_BOX_PHRASE_BANK, coastalMusicBoxPhraseScale, coastalMusicBoxPhrasePosition, coastalMusicBoxPhraseRate } from '../src/data/coastal-music-box-phrases.js';

test('the note bank is frozen, sorted and carries real detuning', () => {
  const notes = COASTAL_MUSIC_BOX_NOTE_BANK.notes;
  assert.ok(notes.length >= 10);
  for (let i = 1; i < notes.length; i++) assert.ok(notes[i].midi > notes[i - 1].midi);
  for (const n of notes) {
    assert.ok(Number.isFinite(n.freq));
    assert.ok(Number.isFinite(n.cents));
    assert.match(n.file, /\.wav$/);
    // Detuning is preserved by design: it is the box's character, not a bug.
    assert.notEqual(n.cents, 0, 'detuning must not be pitch-corrected');
  }
});

test('nearest sample picks the closest recorded tine', () => {
  assert.equal(coastalMusicBoxNearestSample(84).midi, 84);
  assert.equal(coastalMusicBoxNearestSample(80).midi, 80);
  // 78 sits between 77 and 79: nearest wins.
  assert.ok([77, 79].includes(coastalMusicBoxNearestSample(78).midi));
  // Way below the bank clamps to the lowest recorded tine.
  assert.equal(coastalMusicBoxNearestSample(60).midi, 74);
});

test('a healthy note keeps its recording as-is (no repitch, detuning kept)', () => {
  const voice = coastalMusicBoxVoiceForEvent({ type: 'pluck', pitch: 84, direction: 1 });
  assert.equal(voice.kind, 'sample');
  assert.equal(voice.playbackRate, 1);
  assert.equal(voice.sample.midi, 84);
  assert.equal(voice.cents, -10);
});

test('a note missing from the recording is repitched to the correct pitch', () => {
  const voice = coastalMusicBoxVoiceForEvent({ type: 'pluck', pitch: 78, direction: 1 });
  assert.equal(voice.kind, 'repitched');
  assert.notEqual(voice.playbackRate, 1);
  const expected = 2 ** ((78 - voice.sample.midi) / 12);
  assert.ok(Math.abs(voice.playbackRate - expected) < 1e-12);
  assert.equal(voice.cents, 0);
});

test('a snapped/sheared note is filled by repitching, never left silent', () => {
  const voice = coastalMusicBoxVoiceForEvent({ type: 'tick', pitch: 81, direction: 1 });
  assert.equal(voice.kind, 'fill');
  assert.equal(voice.playbackRate, coastalMusicBoxRepitchRate(81, voice.sample));
  // A full octave down is exactly a rate of 0.5, up is 2.0.
  assert.equal(coastalMusicBoxRepitchRate(84, { midi: 72 }), 2);
  assert.equal(coastalMusicBoxRepitchRate(72, { midi: 84 }), 0.5);
});

test('bitcrush quantises amplitude without a DC step and keeps silence silent', () => {
  const input = new Float32Array([0, 0.5, -0.5, 0.999, -0.999]);
  const out = bitcrush(input, 8);
  assert.equal(out[0], 0);
  assert.ok(out[1] > 0 && out[2] < 0);
  // Quantised to 8 bits: values are multiples of 1/127, so distinct from input.
  assert.notEqual(out[1], input[1]);
  // Sign is preserved, ceiling is clamped to unity.
  assert.ok(Math.abs(out[3]) <= 1 && Math.abs(out[4]) <= 1);
  // Higher bits = finer steps (closer to the input).
  const fine = bitcrush(input, 12);
  assert.ok(Math.abs(fine[1] - input[1]) <= Math.abs(out[1] - input[1]));
});

test('sample-and-hold repeats each sample by the hold factor', () => {
  const input = new Float32Array([1, 2, 3, 4, 5, 6]);
  const out = sampleAndHold(input, 2);
  assert.deepEqual(Array.from(out), [1, 1, 3, 3, 5, 5]);
  assert.deepEqual(Array.from(sampleAndHold(input, 1)), Array.from(input));
  assert.equal(sampleAndHold(input, 2).length, input.length);
});

test('loFi chains crush then hold and preserves length', () => {
  const input = new Float32Array(64);
  for (let i = 0; i < input.length; i++) input[i] = Math.sin(i / 3);
  const out = loFi(input, { bits: 10, sampleRate: 48000, targetRate: 24000 });
  assert.equal(out.length, input.length);
  // At 48k -> 24k the hold factor is 2: adjacent pairs are equal.
  assert.equal(out[0], out[1]);
  assert.equal(out[2], out[3]);
  // Silence in = silence out.
  assert.equal(loFi(new Float32Array(8), { bits: 10 })[0], 0);
});

test('the phrase bank holds whole playthroughs, not one-shots', () => {
  const phrases = COASTAL_MUSIC_BOX_PHRASE_BANK.phrases;
  assert.ok(phrases.length >= 4);
  for (const p of phrases) {
    assert.match(p.file, /\.wav$/);
    assert.ok(p.seconds >= 13 && p.seconds <= 20, `phrase ${p.id} length ${p.seconds}s is not a full playthrough`);
  }
});

test('phrase mapping scales score seconds to the recorded tune length', () => {
  const phrase = 15.7, score = 33.6;
  const scale = coastalMusicBoxPhraseScale(phrase, score);
  assert.ok(scale > 0.3 && scale < 0.6);
  // The whole score maps onto the whole phrase.
  assert.equal(coastalMusicBoxPhrasePosition(score, phrase, score), phrase);
  assert.equal(coastalMusicBoxPhrasePosition(0, phrase, score), 0);
  // A full-speed crank (1 score-sec/sec) plays the phrase at its scale rate.
  assert.equal(coastalMusicBoxPhraseRate(1, phrase, score), scale);
  // A full crank through the score runs the phrase once at recorded speed.
  assert.ok(Math.abs(coastalMusicBoxPhraseRate(score / phrase, phrase, score) - 1) < 1e-12);
});
