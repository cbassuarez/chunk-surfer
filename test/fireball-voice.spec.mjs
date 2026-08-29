import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createFireballVoice, fireballDegreeHz, FIREBALL_SCALE_HZ, FIREBALL_TONIC_HZ,
} from '../src/audio/fireball-voice.js';

// A CAST IS AN ARPEGGIO AND A VOLLEY IS THAT CHORD.
//
// The ranged exchange had no voice at all — four comets crossing the stage in
// silence, with a menu blip as the only acknowledgement that one had been hit.
// Pitching them is what makes the stagger mean something: the comets leave a
// beat apart because they are notes, in order.
test('the scale ascends and wraps by octave, so a volley opens upward', () => {
  for (let index = 1; index < FIREBALL_SCALE_HZ.length; index += 1) {
    assert.ok(FIREBALL_SCALE_HZ[index] > FIREBALL_SCALE_HZ[index - 1], 'degrees ascend');
  }
  assert.equal(fireballDegreeHz(0), FIREBALL_SCALE_HZ[0]);
  assert.ok(Math.abs(fireballDegreeHz(FIREBALL_SCALE_HZ.length) - FIREBALL_SCALE_HZ[0] * 2) < 1e-9,
    'a fifth comet is the first one an octave up, not a repeat');
  assert.equal(fireballDegreeHz(-3), FIREBALL_SCALE_HZ[0], 'nothing below the tonic degree');
});

test('the tonic is below the scale, so arming a RETURN lands under everything thrown', () => {
  assert.ok(FIREBALL_TONIC_HZ < FIREBALL_SCALE_HZ[0]);
  assert.ok(Math.abs(FIREBALL_TONIC_HZ * 2 - FIREBALL_SCALE_HZ[0]) < 1e-9,
    'and it is an octave under the first degree, not an arbitrary low note');
});

test('a deflection answers a fifth above the comet it was thrown at', () => {
  // The interval is in the voice rather than the caller, so the in-canvas click
  // and a click on an external surface cannot disagree about the reply.
  const source = new URL('../src/audio/fireball-voice.js', import.meta.url);
  const text = readFileSync(source, 'utf8');
  assert.match(text, /deflect\([\s\S]*?fireballDegreeHz\(degree\) \* 1\.5/);
});

test('it is silent, not broken, without an audio rig', () => {
  const voice = createFireballVoice({ getAudio: () => null });
  assert.equal(voice.cast(0), false);
  assert.equal(voice.deflect(1), false);
  assert.equal(voice.arm(), false);
  assert.equal(voice.land(2), false);
  assert.doesNotThrow(() => voice.dispose());
});
