import test from 'node:test';
import assert from 'node:assert/strict';
import { padGlyphText } from '../src/render/pad-glyphs.js';

test('face buttons print what is on the plastic, keyed by physical position', () => {
  // The bottom button is always confirm. Xbox prints A there; Nintendo prints B.
  // Following the letter instead of the position is what makes on-screen
  // prompts lie about the button under the player's thumb.
  assert.equal(padGlyphText('south', 'xbox'), 'A');
  assert.equal(padGlyphText('south', 'nintendo'), 'B');
  assert.equal(padGlyphText('east', 'xbox'), 'B');
  assert.equal(padGlyphText('east', 'nintendo'), 'A');
  // X/Y are mirrored on Nintendo too.
  assert.equal(padGlyphText('west', 'xbox'), 'X');
  assert.equal(padGlyphText('west', 'nintendo'), 'Y');
  assert.equal(padGlyphText('north', 'xbox'), 'Y');
  assert.equal(padGlyphText('north', 'nintendo'), 'X');
});

test('shoulder and trigger names follow the vendor', () => {
  assert.equal(padGlyphText('leftShoulder', 'xbox'), 'LB');
  assert.equal(padGlyphText('leftShoulder', 'nintendo'), 'L');
  assert.equal(padGlyphText('leftShoulder', 'playstation'), 'L1');
  assert.equal(padGlyphText('leftTrigger', 'xbox'), 'LT');
  assert.equal(padGlyphText('leftTrigger', 'nintendo'), 'ZL');
  assert.equal(padGlyphText('leftTrigger', 'playstation'), 'L2');
});

test('the glyph module exposes no colour of its own', async () => {
  // Vendor face-button colours were built and then removed: the player chooses
  // the phosphor in settings, so a fixed Xbox green is wrong under any other
  // theme. Every glyph takes the active phosphor. This asserts the colour table
  // has not crept back in.
  const module = await import('../src/render/pad-glyphs.js');
  assert.equal(module.padFaceColor, undefined);
});

test('unknown pads and unknown buttons degrade instead of throwing', () => {
  assert.equal(padGlyphText('south', 'wat'), 'S');
  assert.equal(padGlyphText('nonsense', 'xbox'), '');
});
