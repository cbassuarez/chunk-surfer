import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  OBSCURED_GLYPHS,
  OBSCURED_NAME_CAPTION,
  OBSCURED_RAMP,
  obscuredGlyphAt,
  obscuredNameShape,
  obscuredNameUtterance,
  UTTERANCE_SYLLABLES,
} from '../src/narrative/obscured-name.js';
import { profileFor } from '../src/audio/sam-voice.js';
import { vfdGlyph } from '../src/render/vfd-font.js';

// THE DOCTRINE, AS A REGEX.
//
// docs/story-doctrine.md forbids any literal operator name reaching a written
// presentation. The shape module is the only source of glyphs for the masked
// line, so proving its alphabet proves the screen.
const ALPHABET = /^[░▏▯▓▮█ ]+$/u;
const seeds = Array.from({ length: 400 }, (_, i) => i);

for (const runSeed of seeds) {
  const shape = obscuredNameShape({ runSeed });
  assert.match(shape.cells, ALPHABET, `run ${runSeed} emitted something outside the block alphabet`);
  assert.ok(shape.words >= 2 && shape.words <= 3, 'a name is two groups, sometimes three');
  assert.ok(shape.length >= 8, 'a name is not two characters long');
  assert.equal(shape.weights.length, shape.length);
  // Every frame of the erase, not only the settled one.
  for (let erase = 0; erase <= 1.0001; erase += 0.05) {
    let frame = '';
    for (let i = 0; i < shape.length; i++) frame += obscuredGlyphAt(shape, i, erase);
    assert.match(frame, ALPHABET, `run ${runSeed} leaked a glyph at erase ${erase.toFixed(2)}`);
  }
}

// Every glyph it can emit must actually exist in the VFD ROM. A glyph the ROM
// does not have used to draw nothing at all and fail silently, which is exactly
// how a masked name could become an invisible one.
for (const glyph of [...OBSCURED_GLYPHS, ...OBSCURED_RAMP]) {
  assert.ok(vfdGlyph(glyph), `${glyph} is not in the VFD ROM and would draw nothing`);
}
// `▒`, `▌` and `▐` were the three this module wanted and could not have, and
// the assertion here used to be that they were ABSENT — a tripwire to say when
// the ROM had gained them. It has: they went in with the other fifty-odd
// characters the interface was drawing into holes
// (see test/vfd-glyph-coverage.spec.mjs). The tripwire flips rather than goes,
// so a future edit cannot quietly take them out again.
//
// Whether the shading ramp should now USE them is a separate question and a
// doctrinal one — docs/story-doctrine.md governs how the unresolved name may
// appear — so this only records that they are available.
for (const available of ['▒', '▌', '▐']) {
  assert.ok(vfdGlyph(available), `${available} has left the ROM; the masked name's ramp options are shrinking again`);
}

// Stable within a run, different between runs. The booth and the pre-roll
// fragment in B3 must be the same shape or the recognition does not land.
assert.equal(obscuredNameShape({ runSeed: 7 }).cells, obscuredNameShape({ runSeed: 7 }).cells);
const distinct = new Set(seeds.slice(0, 64).map((runSeed) => obscuredNameShape({ runSeed }).cells));
assert.ok(distinct.size > 48, 'consecutive runs should not look like consecutive anything');

// The identity path takes a one-way digest fragment, never a persona. Feeding it
// the same fixture the personalized-interference spec uses must not produce
// anything that contains it.
const PERSONA = 'Sebastian Secret';
const token = 'OPERATOR 4F2A';
const personal = obscuredNameShape({ runSeed: 3, token });
assert.match(personal.cells, ALPHABET);
assert.notEqual(personal.cells, obscuredNameShape({ runSeed: 3 }).cells, 'the token has to change the shape');
assert.equal(obscuredNameShape({ runSeed: 3, token }).cells, personal.cells, 'and it has to be stable');
for (const needle of [PERSONA, 'Sebastian', 'Secret', '4F2A', 'OPERATOR']) {
  assert.ok(!personal.cells.includes(needle), `${needle} survived into the shape`);
}

// ── the voice under the rain ────────────────────────────────────────────────
//
// The non-personal fallback and B3 echo. Literal opted-in booth speech is kept
// outside this module; this utterance must remain as non-identifying as the
// glyphs that drive it.
{
  const SYLLABLES = new RegExp(`^(?:(?:${UTTERANCE_SYLLABLES.join('|')})+)(?: (?:(?:${UTTERANCE_SYLLABLES.join('|')})+))*$`);

  // It takes the SHAPE. There is no argument a name can be passed as, which is
  // the whole proof — everything below is a consequence of it.
  assert.equal(obscuredNameUtterance.length, 1);
  assert.equal(obscuredNameUtterance(null), '');
  assert.equal(obscuredNameUtterance({ cells: '   ' }), '');

  const spoken = obscuredNameUtterance(personal);
  assert.match(spoken, SYLLABLES, 'the utterance is drawn only from the frozen syllable table');
  assert.equal(obscuredNameUtterance(personal), spoken, 'and it is stable for a run');
  assert.notEqual(obscuredNameUtterance(obscuredNameShape({ runSeed: 3 })), spoken,
    'a different shape has to sound different');
  for (const needle of [PERSONA, 'Sebastian', 'Secret', '4F2A', 'OPERATOR']) {
    assert.ok(!spoken.toLowerCase().includes(needle.toLowerCase()), `${needle} survived into the utterance`);
  }

  // THE SOUND AND THE PICTURE ARE THE SAME OBJECT. One spoken group per blot,
  // so a player who half-hears it and half-reads it finds they agree.
  for (const runSeed of [0, 1, 7, 44, 512]) {
    const shape = obscuredNameShape({ runSeed });
    const groups = shape.cells.split(' ').filter(Boolean);
    const words = obscuredNameUtterance(shape).split(' ');
    assert.equal(words.length, groups.length, 'one spoken group per drawn group');
    groups.forEach((group, i) => {
      assert.equal(words[i].length / 2, Math.max(1, Math.round(group.length / 2)),
        'a long blot has to sound long');
    });
  }
}

const firstBoothVoice=profileFor('booth-name');
const repeatedBoothVoice=profileFor('booth-name-repeat');
assert.ok(repeatedBoothVoice.gain>firstBoothVoice.gain,'the requested repeat is louder');
assert.ok(repeatedBoothVoice.lp>firstBoothVoice.lp,'the requested repeat opens more of the name band');
assert.ok(repeatedBoothVoice.smear.mix<firstBoothVoice.smear.mix,'the requested repeat is less smeared');

// The module must have no parameter a name can enter through, and must never
// build a glyph out of one. This is a source contract because it is the property
// that makes every assertion above hold for inputs nobody has thought of yet.
const source = readFileSync(new URL('../src/narrative/obscured-name.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /String\.fromCharCode|fromCodePoint/, 'the alphabet is a frozen list, never synthesized');
assert.match(source, /UTTERANCE_SYLLABLES = Object\.freeze/, 'the spoken alphabet is frozen here too');
assert.match(source, /OBSCURED_NAME_CAPTION\s*=\s*'\[NAME OBSCURED\]'/, 'the accessible caption stays authored here');
assert.equal(OBSCURED_NAME_CAPTION, '[NAME OBSCURED]');

console.log('obscured name contracts passed');
