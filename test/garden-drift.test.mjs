import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GARDEN_LAYOUTS,
  GARDEN_NOTICE_RATE,
  GARDEN_UNOBSERVED_MS,
  createGardenWatchState,
  gardenLayoutForEpoch,
  gardenRecallForLayout,
  shouldNoticeGardenShift,
  tickGardenWatch,
} from '../src/game/garden-drift.js';

test('garden layouts are authored, recognizable changes rather than tiny jitter', () => {
  assert.ok(GARDEN_LAYOUTS.length >= 4);
  const original = gardenLayoutForEpoch(0);
  const changed = gardenLayoutForEpoch(1);
  assert.equal(original.id, 'original');
  assert.notEqual(changed.id, original.id);
  const distances = Object.values(changed.poses).map((p) => Math.hypot(p.dx, p.dz));
  assert.ok(distances.some((distance) => distance >= 2));
  assert.ok(Math.max(...Object.values(changed.poses).map((p) => Math.abs(p.dyaw))) >= 1);
  assert.match(gardenRecallForLayout(original.id), /last time I was in here/i);
  assert.match(gardenRecallForLayout(original.id), /could have sworn/i);
});

test('most garden changes go unremarked instead of opening a line on every return', () => {
  assert.ok(GARDEN_NOTICE_RATE < .5);
  assert.equal(shouldNoticeGardenShift(1, () => GARDEN_NOTICE_RATE - .01), true);
  assert.equal(shouldNoticeGardenShift(1, () => GARDEN_NOTICE_RATE), false);
  assert.equal(shouldNoticeGardenShift(1, () => .99), false);
  const firstNineteen = Array.from({ length:19 }, (_, index) => shouldNoticeGardenShift(index + 1));
  assert.equal(firstNineteen.filter(Boolean).length, 7, 'the authored cadence remarks on 7 of every 19 changes');
});

test('garden cannot move in darkness while occupied and waits after the room empties', () => {
  let watch = createGardenWatchState();
  ({ state: watch } = tickGardenWatch(watch, { inside: true, now: 100 }));

  let event = tickGardenWatch(watch, { inside: true, now: 100 + GARDEN_UNOBSERVED_MS * 2 });
  assert.equal(event.shouldShift, false, 'time and torch-independent occupancy keep the layout fixed');
  watch = event.state;

  ({ state: watch } = tickGardenWatch(watch, { inside: false, now: 1_000 }));
  event = tickGardenWatch(watch, { inside: false, now: 1_000 + GARDEN_UNOBSERVED_MS - 1 });
  assert.equal(event.shouldShift, false);
  watch = event.state;

  event = tickGardenWatch(watch, { inside: false, now: 1_000 + GARDEN_UNOBSERVED_MS });
  assert.equal(event.shouldShift, true);
  watch = event.state;

  event = tickGardenWatch(watch, { inside: true, now: 1_001 + GARDEN_UNOBSERVED_MS });
  assert.equal(event.shouldShift, false);
  assert.equal(event.shouldRecall, true);
});

test('garden does not rearrange before the player has seen a prior layout', () => {
  const watch = createGardenWatchState();
  const event = tickGardenWatch(watch, { inside: false, now: GARDEN_UNOBSERVED_MS * 10 });
  assert.equal(event.shouldShift, false);
  assert.equal(event.shouldRecall, false);
});

test('applying a new garden arrangement refreshes the renderer copy', () => {
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /function shiftGarden[\s\S]*PROPS\.setPropDrift[\s\S]*refreshWorldProps\(\)/);
  assert.match(main, /shouldNoticeGardenShift\(gardenEpoch\)\)SPEECH\.say/);
  assert.match(main, /physical\.spaceId==='hall'/);
  assert.doesNotMatch(main, /const visible = inTheGarden\(\) && REC\.lightOn\(\)/);
});
