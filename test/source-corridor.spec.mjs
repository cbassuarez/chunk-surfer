import assert from 'node:assert/strict';

import { SOURCE_PAGES, sourcePageFor, sourcePageById } from '../src/data/source-pages.js';
import { SOURCE_THRESHOLD, makeSourcePageScene, makeSourceThresholdScene } from '../src/game/source-page-scene.js';
import { CHUNK_SURF_PHASE, pageStageForDistance } from '../src/game/chunk-surf-state.js';

// THE LONG HALL. Three things were wrong with it and these hold each one down.

// ── the pages ───────────────────────────────────────────────────────────────
{
  assert.ok(SOURCE_PAGES.length >= 12, 'a hundred and twelve metres needs more than a handful of sheets');
  for (const p of SOURCE_PAGES) {
    assert.ok(p.id && p.lines.length >= 3, `${p.id} is not a page`);
    assert.ok(p.stage >= 0 && p.stage <= 4, `${p.id} sits outside the hall's own stage range`);
  }
  assert.ok(SOURCE_PAGES.some((p) => p.stage === 0) && SOURCE_PAGES.some((p) => p.stage === 4),
    'the corridor must get worse as it goes, so both ends have to exist');

  // A page you read stays the page it was — the sheets are seed-addressed, not
  // shuffled per look.
  assert.equal(sourcePageFor(5, 3, 99).id, sourcePageFor(5, 3, 99).id);
  // And the mouth of the hall never hands out the far end's paper.
  for (let i = 0; i < 40; i += 1) {
    assert.equal(sourcePageFor(i, 0, i * 7).stage, 0, 'a stage-0 reader was given a deeper page');
    assert.ok(sourcePageFor(i, 2, i * 13).stage <= 2);
  }
  assert.ok(sourcePageById('one-more'));
  assert.equal(sourcePageById('nope'), null);
}

// THE DOCTRINE. These pages are paperwork that has failed, not a ghost talking,
// and the previous contractor is never named on one — his name is spent
// elsewhere (ending.surfaced) and a page that used it would spend it twice.
{
  const all = SOURCE_PAGES.flatMap((p) => p.lines).join(' ').toLowerCase();
  assert.ok(!all.includes('alan'), 'a page names the previous recordist');
  assert.ok(/order|schedule|take|form|acceptance|register|declaration|log/.test(all),
    'nothing here reads as the job it is supposed to be');
}

// ── the pressure ────────────────────────────────────────────────────────────
// The hall's own curve flattens at exactly the distance the haystack appears, so
// the haystack cannot rely on it. This is the fact the runtime fix is built on.
{
  assert.equal(pageStageForDistance(112), 4);
  assert.equal(pageStageForDistance(400), 4, 'pageStage still caps at the haystack');
  assert.ok(pageStageForDistance(56) < pageStageForDistance(112), 'the hall does ramp before that');

  const main = (await import('node:fs')).readFileSync('src/main.js', 'utf8');
  // The dread used to be gated on phase===HALL, which let go the instant
  // HAYSTACK_REACHED fired — during the tightest stretch in the chapter.
  assert.match(main, /\[CHUNK_SURF_PHASE\.HALL,CHUNK_SURF_PHASE\.HAYSTACK\]\.includes\(surfPhase\)/,
    'the haystack search is running with no pressure on it again');
  assert.match(main, /sourceHaystackSeconds/,
    'nothing is escalating the search over time');
  // And it must cost the legs, not only the fear number.
  assert.match(main, /THE LONG HALL GETS HARDER TO WALK/,
    'the corridor walks at ordinary speed again');
}

// ── the cut ─────────────────────────────────────────────────────────────────
{
  const fs = await import('node:fs');
  const runtime = fs.readFileSync('src/game/source-space-runtime.js', 'utf8');
  // Not the mere mention — the comment above the fix names the line it removed.
  // What must not come back is RETURNING it as spoken text.
  assert.doesNotMatch(runtime, /text: 'One sheet does not move/,
    'taking the still page answers with a caption again');
  assert.match(runtime, /event: 'page-found'/);
  assert.match(fs.readFileSync('src/main.js', 'utf8'), /event==='page-found'\)\{ enterSourceLandscape\(\)/,
    'the page no longer cuts to black');

  // The threshold holds black, then lifts. It is not skippable and it always
  // finishes: a hinge that can stall leaves the player in the dark for good.
  let done = 0;
  const scene = makeSourceThresholdScene({ onDone: () => { done += 1; }, cue: () => {} });
  scene.enter();
  assert.equal(scene.view().alpha, 1, 'it does not start black');
  scene.key({ key: 'Enter' });
  scene.update(0.1);
  assert.equal(done, 0, 'the cut was skippable');
  for (let i = 0; i < 600; i += 1) scene.update(1 / 60);
  assert.equal(done, 1, 'the threshold never lifted');
  assert.equal(scene.view().alpha, 0, 'it did not fade all the way up');
  assert.ok(SOURCE_THRESHOLD.hold + SOURCE_THRESHOLD.fade < 5,
    'the cut is longer than the beat it is covering');
  // blocksWorld false, so the field keeps forming under the black and the black
  // lifts on something already moving.
  assert.equal(scene.blocksWorld, false);
}

// ── reading is not a rest ───────────────────────────────────────────────────
{
  const page = sourcePageFor(3, 4, 11);
  let closed = 0;
  const scene = makeSourcePageScene({ page, onClose: () => { closed += 1; } });
  assert.deepEqual(scene.view().lines, [...page.lines]);
  assert.equal(scene.blocksInput, true, 'reading a document has to stop the walk');
  const runtime = (await import('node:fs')).readFileSync('src/game/source-space-runtime.js', 'utf8');
  const read = runtime.slice(runtime.indexOf("focus.kind === 'source-sheet'"), runtime.indexOf("focus.kind === 'haystack-page'"));
  assert.doesNotMatch(read, /protectMoment/,
    'stopping to read buys a pause from what is behind you');
  void closed;
}

// ── the weather gets in ─────────────────────────────────────────────────────
// The corridor has no sky over it, so the ordinary FLAG_SKY gate can never give
// it rain. That is the reason it needs a drive of its own, and the reason the
// drive must be released on the way out.
{
  const fs = await import('node:fs');
  const shader = fs.readFileSync('src/render/r3d.js', 'utf8');
  assert.match(shader, /uniform float uRainIndoor/);
  assert.match(shader, /if\(\(cameraInWeather\|\|uRainIndoor>\.0\)/,
    'a space with no sky can no longer be rained through');
  const main = fs.readFileSync('src/main.js', 'utf8');
  assert.match(main, /r3dSetIndoorRain\?\.\(soak\)/, 'the hall no longer drives its own weather');
  assert.match(main, /r3dSetIndoorRain\?\.\(0\)/,
    'leaving source space carries the corridor weather back into the building');
}

console.log('source corridor specs passed');
