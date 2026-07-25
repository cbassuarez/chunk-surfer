import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CLOSING_QUOTE,
  END_CREDITS_CLOSING_HOLD,
  END_CREDITS_OPENING_DURATION,
  closingQuoteAlpha,
  closingQuoteBlock,
  creditRollLayout,
  makeCreditsScene,
  positionedCreditEntries,
} from '../src/game/credits.js';

const creditsFixture = Array.from({ length: 8 }, (_, index) => ({
  heading: `Section ${index + 1}`,
  lines: [`Line ${index + 1} A`, `Line ${index + 1} B`, `Line ${index + 1} C`],
}));

test('credits use one cinematic scene with a fixed opening card and fractional roll', () => {
  const scene = makeCreditsScene({ credits: creditsFixture, initialCols: 80, initialRows: 30 });
  assert.equal(scene.id, 'credits');
  assert.equal(scene.blocksInput, true);
  assert.equal(scene.blocksWorld, true);
  assert.equal(scene.view().phase, 'opening');

  scene.update(END_CREDITS_OPENING_DURATION - 0.01);
  assert.equal(scene.view().phase, 'opening');
  scene.update(0.37);
  assert.equal(scene.view().phase, 'roll');
  assert.ok(scene.view().scroll > 0);
  assert.notEqual(scene.view().scroll, Math.floor(scene.view().scroll));
});

test('credit roll positions change continuously rather than snapping by rows', () => {
  const layout = creditRollLayout({ cols: 80, rows: 30, credits: creditsFixture });
  const atOne = positionedCreditEntries(layout, 1.10);
  const atTwo = positionedCreditEntries(layout, 1.35);
  assert.equal(atOne.length, atTwo.length);
  assert.ok(Math.abs((atTwo[0].y - atOne[0].y) + 0.25) < 1e-9);
  assert.notEqual(atTwo[0].y, Math.round(atTwo[0].y));
});

test('menu credits preserve pause, manual navigation, website, and back controls', () => {
  let done = 0;
  let website = 0;
  const scene = makeCreditsScene({
    credits: creditsFixture,
    context: 'menu',
    initialCols: 80,
    initialRows: 30,
    onDone: () => { done += 1; },
    onWebsite: () => { website += 1; },
  });

  scene.key({ key: 'End' });
  assert.equal(scene.view().phase, 'closing');
  assert.equal(scene.view().paused, true);
  scene.key({ code: 'Space' });
  assert.equal(scene.view().paused, false);
  scene.update(END_CREDITS_CLOSING_HOLD + 1);
  assert.equal(done, 0, 'menu credits remain on the closing card');

  scene.key({ key: 'Home' });
  assert.equal(scene.view().scroll, 0);
  scene.key({ key: 'ArrowUp' });
  assert.equal(scene.view().scroll, 0);
  scene.key({ key: 'ArrowDown' });
  assert.equal(scene.view().scroll, 3);
  scene.key({ key: 'PageDown' });
  assert.equal(scene.view().scroll, 13);

  scene.key({ key: 'Enter' });
  assert.equal(website, 1);
  scene.key({ key: 'Escape' });
  assert.equal(done, 1);
  scene.key({ key: 'Escape' });
  assert.equal(done, 1);
});

// The ending does not cut from the roll to a stats panel. After the closing hold
// it answers its own opening Butler quote, goes out to a full black taking the
// audio with it, and only then hands over to the run summary.
test('ending credits close on the Butler quote, then black, then the summary', () => {
  let completed = 0;
  let quoted = 0;
  let blacked = 0;
  const scene = makeCreditsScene({
    credits: creditsFixture,
    context: 'ending',
    initialCols: 80,
    initialRows: 30,
    onDone: () => { completed += 1; },
    onQuote: () => { quoted += 1; },
    onBlack: () => { blacked += 1; },
  });
  scene.key({ key: 'End' });
  scene.key({ code: 'Space' });          // paused: the quote must still arrive
  scene.update(END_CREDITS_CLOSING_HOLD - 0.01);
  assert.equal(quoted, 0);
  scene.update(0.01);
  assert.equal(quoted, 1, 'the closing hold hands to the quote, not to the summary');
  assert.equal(scene.view().phase, 'quote');
  assert.equal(completed, 0, 'the summary does not arrive under the quote');

  // Reading it is not scrubbing it: the roll keys are dead here.
  scene.key({ key: 'ArrowDown' });
  scene.key({ key: 'End' });
  assert.equal(scene.view().phase, 'quote');

  const quoteSeconds = CLOSING_QUOTE.fadeIn + CLOSING_QUOTE.hold + CLOSING_QUOTE.fadeOut;
  scene.update(quoteSeconds - 0.01);
  assert.equal(blacked, 0);
  scene.update(0.02);
  assert.equal(blacked, 1, 'the fade out ends on black, where the hiss is waiting');
  assert.equal(completed, 0, 'and the black is held for a beat');
  scene.update(2);
  assert.equal(completed, 1);
  assert.equal(quoted, 1);
  assert.equal(blacked, 1);

  // Skipping still leaves a silent room behind it.
  let skipped = 0;
  let skipBlack = 0;
  const skippable = makeCreditsScene({
    context: 'ending',
    onDone: () => { skipped += 1; },
    onBlack: () => { skipBlack += 1; },
  });
  skippable.key({ key: 'Escape' });
  assert.equal(skipped, 1);
  assert.equal(skipBlack, 1, 'a skipped ending must not leave the credits piece playing');
});

// The quote itself: up from nothing, held long enough to read twice, out to black.
test('the closing quote fades up, holds, and goes out to nothing', () => {
  assert.equal(closingQuoteAlpha(0), 0);
  assert.ok(closingQuoteAlpha(CLOSING_QUOTE.fadeIn * 0.5) > 0);
  assert.equal(closingQuoteAlpha(CLOSING_QUOTE.fadeIn), 1);
  assert.equal(closingQuoteAlpha(CLOSING_QUOTE.fadeIn + CLOSING_QUOTE.hold * 0.5), 1);
  const end = CLOSING_QUOTE.fadeIn + CLOSING_QUOTE.hold + CLOSING_QUOTE.fadeOut;
  assert.ok(closingQuoteAlpha(end) < 0.001, 'it ends on true black');
  assert.ok(CLOSING_QUOTE.hold >= 4, 'long enough to read twice');

  // It is the twin of the opening card, so it carries the same attribution.
  const block = closingQuoteBlock(46);
  assert.ok(block.quote.length >= 3);
  assert.ok(block.attribution.some((line) => /EREWHON/.test(line)));
  assert.ok(block.attribution.some((line) => /BOOK OF THE MACHINES/.test(line)));
  for (const line of block.lines) assert.ok(line.length <= 46, `"${line}" fits the column`);
  // Narrow viewports must not clip it.
  for (const line of closingQuoteBlock(24).lines) assert.ok(line.length <= 24);
});

test('credit roll layout stays inside compact and wide viewports', () => {
  for (const size of [{ cols: 34, rows: 12 }, { cols: 144, rows: 64 }]) {
    const layout = creditRollLayout({ ...size, credits: creditsFixture });
    assert.ok(layout.maxWidth <= size.cols - 2);
    assert.ok(layout.maxScroll > 0);
    assert.ok(layout.entries.length > 0);
    for (const entry of layout.entries) {
      assert.ok(entry.x >= 0);
      assert.ok(entry.x + entry.text.length <= size.cols);
    }
  }
});

test('ending routing places cinematic credits between the epilogue and return report', () => {
  const source = readFileSync('src/main.js', 'utf8');
  assert.match(source, /onDone:\(\)=>openEndingCredits\(summary\)/);
  assert.match(source, /presentCredits\(\{context:'ending',onDone:\(\)=>showReturnReport\(summary\)\}\)/);
  assert.doesNotMatch(source, /makeCreditsIntroScene|credits-intro/);
});
