import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  END_CREDITS_CLOSING_HOLD,
  END_CREDITS_OPENING_DURATION,
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

test('ending credits automatically continue after the closing hold and may be skipped', () => {
  let completed = 0;
  const scene = makeCreditsScene({
    credits: creditsFixture,
    context: 'ending',
    initialCols: 80,
    initialRows: 30,
    onDone: () => { completed += 1; },
  });
  scene.key({ key: 'End' });
  scene.key({ code: 'Space' });
  scene.update(END_CREDITS_CLOSING_HOLD - 0.01);
  assert.equal(completed, 0);
  scene.update(0.01);
  assert.equal(completed, 1);

  let skipped = 0;
  const skippable = makeCreditsScene({ context: 'ending', onDone: () => { skipped += 1; } });
  skippable.key({ key: 'Escape' });
  assert.equal(skipped, 1);
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
