import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planStoryArtInPanel,
  planStoryArtSideBySide,
  storyArtArtifactLayout,
  storyArtCols,
  storyArtSideBySideCols,
  storyArtSideBySideSplit,
  storyArtSideBySidePanelRows,
  storyArtSideBySideRows,
  storyArtFits,
  storyArtRows,
} from '../src/game/story-art-card.js';

test('story art forensic artifacts are stable per authored still', () => {
  const a = storyArtArtifactLayout({ id: 'dock-frame' }, { width: 640, height: 360 });
  const b = storyArtArtifactLayout({ id: 'dock-frame' }, { width: 640, height: 360 });
  const other = storyArtArtifactLayout({ id: 'chapel-frame' }, { width: 640, height: 360 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, other);
  assert.ok(a.deadPixels.length >= 1 && a.deadPixels.length <= 3);
  assert.ok(a.deadPixels.every((pixel) => pixel.x >= 0 && pixel.x <= 640 && pixel.y >= 0 && pixel.y <= 360));
});

test('story art row planning keeps minimum readable heights', () => {
  assert.ok(storyArtRows('compact', 20) >= 8);
  assert.ok(storyArtRows('hero', 20) >= 13);
  assert.ok(storyArtRows('boss', 20) >= 14);
});

test('story art hides when panel cannot preserve text and choices', () => {
  const plan = planStoryArtInPanel({
    art: { id: 'guard', mode: 'hero' },
    mode: 'hero',
    panelRows: 12,
    textRowsMin: 6,
    choicesRows: 3,
  });
  assert.equal(plan.show, false);
});

test('story art downgrades large modes before hiding', () => {
  const plan = planStoryArtInPanel({
    art: { id: 'door', mode: 'boss' },
    mode: 'boss',
    panelRows: 15,
    textRowsMin: 4,
    choicesRows: 2,
  });
  assert.equal(plan.show, true);
  assert.equal(plan.mode, 'compact');
});

test('story art shows when enough panel space exists', () => {
  const plan = planStoryArtInPanel({
    art: { id: 'door', mode: 'hero' },
    mode: 'hero',
    panelRows: 24,
    textRowsMin: 5,
    choicesRows: 3,
  });
  assert.equal(plan.show, true);
  assert.ok(plan.rows >= 13);
});

test('storyArtFits checks exact minima', () => {
  assert.equal(storyArtFits({ availableRows: 8, mode: 'compact' }), true);
  assert.equal(storyArtFits({ availableRows: 7, mode: 'compact' }), false);
});


test('story art side-by-side uses one fixed authored card size', () => {
  const plan = planStoryArtSideBySide({
    art: { id: 'guard', mode: 'hero' },
    mode: 'hero',
    panelRows: 24,
    panelCols: 82,
    textRowsMin: 5,
    choicesRows: 3,
    minTextCols: 32,
  });
  assert.equal(plan.show, true);
  assert.equal(plan.rows, storyArtSideBySideRows());
  assert.equal(plan.artCols, 40);
  assert.equal(plan.textCols, 40);
  assert.equal(plan.fixed, true);
  assert.ok(plan.textCols >= 32);
});

test('story art side-by-side splits the body into stable 50/50 lanes', () => {
  assert.deepEqual(storyArtSideBySideSplit(82), { artCols: 40, textCols: 40, gap: 2 });
  assert.deepEqual(storyArtSideBySideSplit(83), { artCols: 40, textCols: 41, gap: 2 });
  assert.ok(storyArtSideBySideCols() <= 40);
});

test('story art side-by-side hides instead of shrinking the card when narrow', () => {
  const plan = planStoryArtSideBySide({
    art: { id: 'guard', mode: 'hero' },
    mode: 'hero',
    panelRows: 24,
    panelCols: storyArtSideBySideCols() + 2 + 33,
    minTextCols: 34,
  });
  assert.equal(plan.show, false);
  assert.equal(plan.reason, 'not-enough-fixed-art-width');
});

test('story art side-by-side hides instead of shrinking the card when short', () => {
  const plan = planStoryArtSideBySide({
    art: { id: 'guard', mode: 'hero' },
    mode: 'hero',
    panelRows: storyArtSideBySideRows() + 1,
    panelCols: 82,
    minTextCols: 32,
    bottomPadRows: 2,
  });
  assert.equal(plan.show, false);
  assert.equal(plan.reason, 'not-enough-fixed-art-height');
});

test('story art columns clamp to the available side bay for vertical fallback only', () => {
  assert.ok(storyArtCols('compact', 80) <= 30);
  assert.ok(storyArtCols('hero', 80) <= 38);
  assert.ok(storyArtCols('boss', 80) <= 40);
});

test('outer panel reserve includes fixed story art size and footer clearance', () => {
  const base = storyArtSideBySidePanelRows({ choicesRows: 0, headerRows: 4, bottomPadRows: 2 });
  const withChoices = storyArtSideBySidePanelRows({ choicesRows: 5, headerRows: 4, bottomPadRows: 2 });
  assert.equal(base, 28);
  assert.equal(withChoices, base + 5);
});

test('side-by-side art size is invariant under long text and choices', () => {
  const shortText = planStoryArtSideBySide({
    art: { id: 'door', mode: 'hero' },
    mode: 'hero',
    panelRows: 28,
    panelCols: 82,
    textRowsMin: 4,
    choicesRows: 0,
    minTextCols: 32,
    bottomPadRows: 2,
  });
  const longText = planStoryArtSideBySide({
    art: { id: 'door', mode: 'hero' },
    mode: 'hero',
    panelRows: 28,
    panelCols: 82,
    textRowsMin: 99,
    choicesRows: 12,
    minTextCols: 32,
    bottomPadRows: 2,
  });
  assert.equal(shortText.show, true);
  assert.equal(longText.show, true);
  assert.equal(longText.rows, shortText.rows);
  assert.equal(longText.artCols, shortText.artCols);
  assert.equal(longText.textCols, shortText.textCols);
});
