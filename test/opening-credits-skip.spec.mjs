import assert from 'node:assert/strict';

import {
  OPENING_CREDITS_SKIP_CONFIRM_SECONDS,
  OPENING_CREDITS_SKIP_GUARD_SECONDS,
  makeOpeningCreditsScene,
  openingCreditSkipLayout,
} from '../src/game/opening-credits.js';
import { exportProfile, mergeImportedProfile } from '../src/progression/profile.js';
import { DEFAULT_SETTINGS, freshMeta, normalizeMeta } from '../src/progression/schema.js';
import { vfdGlyphMissing } from '../src/render/vfd-font.js';

const completePoint = (scene) => {
  // render() rebuilds the scene's live hit regions. uiSize() is deliberately
  // uninitialised in this Node harness, so the scene falls back to its authored
  // 20x8 minimum just as openingCreditLayout() does.
  scene.render();
  const layout = openingCreditSkipLayout({ cols: 20, rows: 8 });
  return {
    cellX: layout.hit.x + layout.hit.w - 1,
    cellY: layout.hit.y + layout.hit.h - 1,
  };
};

{
  const meta = freshMeta();
  assert.equal(meta.openingCreditsCompleted, false, 'fresh profiles must require the authored opening');
  assert.equal(normalizeMeta({ version: 2 }).openingCreditsCompleted, false);
  assert.equal(normalizeMeta({ version: 2, runs: 1 }).openingCreditsCompleted, true);
  assert.equal(normalizeMeta({ version: 2, stats: { runsStarted: 1 } }).openingCreditsCompleted, true);
  assert.equal(
    normalizeMeta({ version: 2, runs: 1, openingCreditsCompleted: false }).openingCreditsCompleted,
    false,
    'an explicit local lock must outrank legacy inference',
  );
  assert.equal(normalizeMeta({ version: 2, openingCreditsCompleted: true }).openingCreditsCompleted, true);

  const portable = exportProfile(
    { ...meta, openingCreditsCompleted: true },
    DEFAULT_SETTINGS,
    { build: 'TEST', now: 1 },
  );
  assert.equal(
    Object.hasOwn(portable.meta, 'openingCreditsCompleted'),
    false,
    'opening-credit completion is local presentation state, not portable progression',
  );

  const merged = mergeImportedProfile(meta, DEFAULT_SETTINGS, {
    ...portable,
    meta: {
      ...portable.meta,
      stats: { ...portable.meta.stats, runsStarted: 12 },
    },
  });
  assert.equal(merged.ok, true);
  assert.equal(
    merged.meta.openingCreditsCompleted,
    false,
    'portable run history must not unlock a local opening-credit entitlement',
  );
}

assert.equal(vfdGlyphMissing('▶'), false, 'the skip transport symbol must stay inside the authored VFD ROM');

for (const [cols, rows] of [[20, 8], [80, 30], [120, 50]]) {
  const idle = openingCreditSkipLayout({ cols, rows, label: 'SKIP  ▶▶' });
  const armed = openingCreditSkipLayout({ cols, rows, label: 'CLICK AGAIN  ▶▶' });

  assert.equal(idle.right, armed.right, 'all transport labels must keep the same right anchor');
  assert.deepEqual(idle.hit, armed.hit, 'arming must not move or resize the click target');

  for (const layout of [idle, armed]) {
    assert.ok(layout.x >= 0 && layout.y >= 0);
    assert.ok(layout.x + layout.text.length <= layout.cols);
    assert.ok(layout.hit.x >= 0 && layout.hit.y >= 0);
    assert.ok(layout.hit.x + layout.hit.w <= layout.cols);
    assert.ok(layout.hit.y + layout.hit.h <= layout.rows);
  }
}

{
  let now = 0;
  const completions = [];
  const scene = makeOpeningCreditsScene({
    skipUnlocked: false,
    duration: 1,
    now: () => now,
    onDone: (result) => completions.push(result),
  });
  const point = completePoint(scene);

  scene.pointer({ type: 'pointerdown', ...point });
  assert.equal(scene.view().skippable, false);
  assert.equal(scene.view().skip.armed, false);

  now = 1.1;
  scene.update(0);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].reason, 'completed');
}

{
  let now = 0;
  const completions = [];
  const scene = makeOpeningCreditsScene({
    skipUnlocked: true,
    duration: 10,
    now: () => now,
    onDone: (result) => completions.push(result),
  });
  const point = completePoint(scene);

  scene.pointer({ type: 'pointerdown', ...point });
  assert.equal(scene.view().skip.armed, true);

  now = OPENING_CREDITS_SKIP_CONFIRM_SECONDS / 2;
  scene.pointer({ type: 'pointerdown', ...point });
  assert.equal(scene.view().skip.committed, true);
  assert.equal(completions.length, 0, 'the second click must not remove the modal scene immediately');

  // A trailing click lands while the opening is still modal and cannot leak to
  // the title scene that will replace it.
  scene.pointer({ type: 'pointerdown', ...point });
  assert.equal(completions.length, 0);

  now += OPENING_CREDITS_SKIP_GUARD_SECONDS / 2;
  scene.update(0);
  assert.equal(completions.length, 0);

  now += OPENING_CREDITS_SKIP_GUARD_SECONDS;
  scene.update(0);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].reason, 'skipped');

  scene.update(1);
  assert.equal(completions.length, 1, 'completion must remain single-fire');
}

{
  let now = 0;
  const scene = makeOpeningCreditsScene({
    skipUnlocked: true,
    duration: 10,
    now: () => now,
  });
  const point = completePoint(scene);

  scene.pointer({ type: 'pointerdown', ...point });
  now = OPENING_CREDITS_SKIP_CONFIRM_SECONDS + 0.001;
  assert.equal(scene.view().skip.armed, false, 'the first click must expire');

  scene.pointer({ type: 'pointerdown', ...point });
  assert.equal(scene.view().skip.armed, true, 'an expired second click becomes a new first click');
  assert.equal(scene.view().skip.committed, false);

  scene.pointer({ type: 'pointermove', cellX: 0, cellY: 0 });
  assert.equal(scene.view().skip.armed, true, 'ordinary pointer drift must not cancel a double-click');

  scene.pointer({ type: 'pointerdown', cellX: 0, cellY: 0 });
  assert.equal(scene.view().skip.armed, false, 'a click elsewhere changes intent and disarms');
}

{
  let now = 0;
  const completions = [];
  const scene = makeOpeningCreditsScene({
    skipUnlocked: true,
    duration: 0.5,
    now: () => now,
    onDone: (result) => completions.push(result),
  });
  const point = completePoint(scene);

  scene.pointer({ type: 'pointerdown', ...point });
  now = 0.2;
  scene.pointer({ type: 'pointerdown', ...point });

  // Once the skip gesture commits, it owns the exit even if the authored clock
  // crosses its natural end before the input guard elapses.
  now = 1;
  scene.update(0);
  scene.update(1);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].reason, 'skipped');
}

console.log('opening-credit skip specs passed');
