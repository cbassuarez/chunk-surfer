import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CREDITS_INTRO_DURATION,
  CREDITS_INTRO_MIN_DWELL,
  creditPanelLayout,
  creditsIntroFrame,
  makeCreditsIntroScene,
  makeCreditsScene,
} from '../src/game/credits.js';

const creditsFixture = Array.from({ length: 8 }, (_, index) => ({
  heading: `Section ${index + 1}`,
  lines: [`Line ${index + 1} A`, `Line ${index + 1} B`, `Line ${index + 1} C`],
}));

test('credits intro blocks early input then continues into release record', () => {
  let done = 0;
  const scene = makeCreditsIntroScene({ onDone: () => { done += 1; } });

  assert.equal(scene.id, 'credits-intro');
  assert.equal(scene.blocksInput, true);
  assert.equal(scene.blocksWorld, true);
  assert.equal(scene.key({ key: 'Enter' }), true);
  assert.equal(done, 0);
  assert.equal(scene.view().canContinue, false);

  scene.update(CREDITS_INTRO_MIN_DWELL);
  assert.equal(scene.view().canContinue, true);
  assert.equal(scene.key({ key: 'Enter' }), true);
  assert.equal(done, 1);
  assert.equal(scene.key({ key: 'Enter' }), true);
  assert.equal(done, 1);
});

test('credits intro auto-advances after authored duration', () => {
  let done = 0;
  const scene = makeCreditsIntroScene({ onDone: () => { done += 1; } });
  scene.update(CREDITS_INTRO_DURATION - 0.01);
  assert.equal(done, 0);
  scene.update(0.01);
  assert.equal(done, 1);

  const frame = creditsIntroFrame(CREDITS_INTRO_DURATION);
  assert.equal(frame.canContinue, true);
  assert.equal(frame.progress, 1);
  assert.ok(frame.roll > 0.99);
});

test('credits panel controls, website, and close behavior remain intact', () => {
  let time = 0;
  let closed = 0;
  let website = 0;
  const scene = makeCreditsScene({
    credits: creditsFixture,
    now: () => time,
    onClose: () => { closed += 1; },
    onWebsite: () => { website += 1; },
  });

  scene.enter();
  scene.update(10);
  assert.equal(scene.view().scroll, 0);
  time = 1200;
  scene.update(1);
  assert.ok(scene.view().scroll > 0);

  scene.key({ key: 'End' });
  assert.equal(scene.view().scroll, scene.view().lines - 1);
  scene.key({ key: 'ArrowDown' });
  assert.equal(scene.view().scroll, scene.view().lines - 1);
  assert.equal(scene.view().paused, true);

  scene.key({ key: 'Home' });
  assert.equal(scene.view().scroll, 0);
  scene.key({ key: 'ArrowUp' });
  assert.equal(scene.view().scroll, 0);

  scene.key({ code: 'Space' });
  assert.equal(scene.view().paused, false);
  scene.key({ key: 'Enter' });
  assert.equal(website, 1);
  scene.key({ key: 'Escape' });
  assert.equal(closed, 1);
});

test('credits panel responsive sizing stays inside small and large viewports', () => {
  for (const size of [{ cols: 34, rows: 12 }, { cols: 144, rows: 64 }]) {
    const layout = creditPanelLayout(size);
    assert.ok(layout.w <= size.cols - 2);
    assert.ok(layout.h <= size.rows - 2);
    assert.ok(layout.x >= 0 && layout.y >= 0);
    assert.ok(layout.x + layout.w <= size.cols);
    assert.ok(layout.y + layout.h <= size.rows);
  }
});
