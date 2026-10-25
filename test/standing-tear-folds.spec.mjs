import test from 'node:test';
import assert from 'node:assert/strict';
import { STANDING_TEAR_FOLD_LAYOUT as L, standingTearFolds, standingTearFoldClock,
  standingTearFoldCorners, standingTearRibbonSegments } from '../src/data/standing-tear-folds.js';
import { freshStandingTear, stepStandingTear } from '../src/game/standing-tear.js';

test('five connected return ribbons and forty upper perimeter cells retain the existing architectural footprint', () => {
  const all = standingTearFolds(), overhead = all.filter(fold => fold.role === 'overhead-fold');
  assert.equal(all.length, 45); assert.equal(overhead.length, 5);
  assert.equal(all.filter(fold => fold.role === 'perimeter-fold').length, 40);
  assert.equal(new Set(all.map(fold => fold.id)).size, 45);
  for (const fold of overhead) {
    assert.equal(fold.foldShape.path.length, 8);
    assert.equal(fold.foldShape.closure, 'wrong-depth-return');
    assert.equal(fold.foldShape.printBand, 'retained-course');
    for (const point of fold.foldShape.path) assert.ok(point.every(value => Number.isFinite(value) && Math.abs(value) <= .48));
    const p = fold.foldShape.path;
    assert.equal(p[0][1], p[1][1], 'the course starts as a floor');
    assert.equal(p[1][0], p[2][0], 'its next elbow becomes a wall');
    assert.equal(p[2][1], p[3][1], 'the same course returns overhead');
    assert.notEqual(p[0][2], p[3][2], 'the return remains at a conflicting depth');
    assert.ok(fold.foldShape.gravityAlternation.includes(1) && fold.foldShape.gravityAlternation.includes(-1));
  }
  assert.ok(overhead.some(fold => fold.gravity === 1));
  assert.ok(overhead.some(fold => fold.gravity === -1));
  assert.ok(Math.abs(overhead[1].yaw - overhead[0].yaw) > 1.3, 'interleaved courses oppose orientation rather than forming a regular ceiling');
  const first = overhead[0], left = first.foldShape.path[0], right = first.foldShape.path[1], m = first.matrix;
  const worldX = point => m[0] * point[0] + m[4] * point[1] + m[8] * point[2] + m[12];
  assert.ok(worldX(left) <= -80 && worldX(right) >= 80, 'the first continuous course actually meets both upper perimeter faces');
});

test('all animated vertices remain above bodily clearance through arrival, retained work and stopped machinery', () => {
  for (let elapsed = 0; elapsed <= L.cycleSeconds * 3; elapsed += .37) for (const retained of [false, true]) {
    const folds = standingTearFolds({ elapsed, referenceStarted: retained, architectureRunning: retained,
      transportRunning: !retained, referenceSeconds: elapsed / 2, stoppedSeconds: retained ? elapsed / 3 : 0 });
    for (const fold of folds) {
      assert.ok(fold.matrix.every(Number.isFinite));
      const corners = standingTearFoldCorners(fold), minimum = Math.min(...corners.map(point => point[1]));
      assert.ok(minimum >= 2.6 - 1e-9, `${fold.id} enters the supported bodily space at ${elapsed}: ${minimum}`);
      assert.ok(Math.abs(minimum - fold.minimumY) < 1e-8);
      assert.equal(fold.collision, false);
      if (fold.role === 'perimeter-fold') assert.equal(fold.fixedBaseHeight, 2.6);
    }
    const first = folds[0], m = first.matrix, x = point => m[0] * point[0] + m[4] * point[1] + m[8] * point[2] + m[12];
    assert.ok(x(first.foldShape.path[0]) <= -80 && x(first.foldShape.path[1]) >= 80,
      `The first course loses its upper perimeter connection at ${elapsed}`);
  }
});

test('Source movement begins on arrival and continues after the local motor has stopped', () => {
  const arrival = standingTearFolds({ elapsed: 0 }), later = standingTearFolds({ elapsed: 9 });
  assert.notDeepEqual(arrival[0].matrix, later[0].matrix);
  const stopped = { elapsed: 40, referenceSeconds: 12, stoppedSeconds: .1, referenceStarted: true, architectureRunning: true, transportRunning: false };
  const a = standingTearFolds(stopped), b = standingTearFolds({ ...stopped, elapsed: 40.3, stoppedSeconds: .4 });
  assert.notDeepEqual(a[0].matrix, b[0].matrix);
  assert.ok(a.every(fold => fold.motorIndependent && fold.retained));
  assert.deepEqual(standingTearFolds({ ...stopped, transportRunning: true }), a,
    'stopping a machine cannot switch off the already retained course');
});

test('retained architecture crosses a transport stop without restarting or holding its phase', () => {
  const before = { elapsed: 15, referenceSeconds: 2.7, stoppedSeconds: 0, referenceStarted: true, architectureRunning: true, transportRunning: true };
  const stopped = { ...before, transportRunning: false };
  assert.deepEqual(standingTearFolds(before), standingTearFolds(stopped), 'the deliberate stop has no phase jump');
  const after = { ...stopped, stoppedSeconds: .01 };
  assert.ok(Math.abs(standingTearFoldClock(after).reference - 2.71) < 1e-9);
  assert.notDeepEqual(standingTearFolds(stopped)[0].matrix, standingTearFolds(after)[0].matrix,
    'architectural reference advances immediately instead of waiting for stopped time to catch up');
  const stillRunning = { ...before, referenceSeconds: 2.71 };
  assert.deepEqual(standingTearFolds(after), standingTearFolds(stillRunning), 'the same retained phase has the same geometry with or without its machine');
});

test('joined prism transforms preserve elbow continuity, opposing normals and body clearance while the return moves', () => {
  for (let elapsed = 0; elapsed < L.cycleSeconds; elapsed += .5) {
    for (const fold of standingTearFolds({ elapsed }).filter(item => item.role === 'overhead-fold')) {
      const segments = standingTearRibbonSegments(fold);
      assert.equal(segments.length, 7);
      for (const segment of segments) {
        if (segment.index) assert.deepEqual(segment.from, segments[segment.index - 1].to);
        assert.ok(standingTearFoldCorners(segment).every(point => point[1] > 2.4));
        assert.ok(segment.length > 1 && segment.matrix.every(Number.isFinite));
      }
      assert.ok(segments.some(segment => segment.gravity === -1) && segments.some(segment => segment.gravity === 1));
    }
  }
  const first = standingTearFolds({ elapsed: 0 })[0], second = standingTearFolds({ elapsed: 5 })[0];
  assert.notDeepEqual(first.foldShape.path[3], second.foldShape.path[3], 'the elbow itself shears, not merely the entire form');
  assert.notDeepEqual(standingTearRibbonSegments(first)[2].matrix, standingTearRibbonSegments(second)[2].matrix);
});

test('paused, hidden and not-ready encounter clocks freeze architecture instead of reading wall-clock time', () => {
  let state = freshStandingTear();
  for (let i = 0; i < 40; i++) state = stepStandingTear(state, { dt: .1 }).state;
  const expected = standingTearFolds(state);
  for (const input of [{ paused: true }, { hidden: true }, { renderReady: false }]) {
    const held = stepStandingTear(state, { ...input, dt: 100 }).state;
    assert.deepEqual(standingTearFolds(held), expected);
  }
  assert.equal(standingTearFoldClock(state).elapsed, state.elapsed);
});

test('reduced motion retains one clear interleaved impossible form without freezing to a featureless starting pose', () => {
  const before = standingTearFolds({ elapsed: 0 }, { reducedMotion: true });
  const after = standingTearFolds({ elapsed: 300 }, { reducedMotion: true });
  assert.deepEqual(before, after);
  assert.ok(before.every(fold => fold.moving === false));
  assert.notDeepEqual(before[0].matrix, standingTearFolds({ elapsed: 0 })[0].matrix);
  const overhead = before.filter(fold => fold.role === 'overhead-fold');
  assert.equal(overhead.length, 5);
  assert.ok(overhead.some(fold => fold.gravity === -1));
  assert.ok(overhead.every(fold => fold.foldShape.path.length === 8));
});
