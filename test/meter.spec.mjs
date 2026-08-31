import assert from 'node:assert/strict';

import {
  METER_MIN_DB, METER_MAX_DB, METER_BALLISTICS, meterGeometry,
  dbToUnit, unitToDb, dbForLinear,
  meterSegmentCount, meterSegmentAt,
  meterTicks, meterScaleFits, meterMarks, meterMarkBoxes,
  meterBallistics, meterState, meterStateReset,
  combatGaugeGeometry, combatGaugeSegments,
} from '../src/render/meter.js';

// ── THE SCALE EXISTS ─────────────────────────────────────────────────────────
//
// Two authored lines describe an instrument that was never drawn — "the meter
// dead flat at the bottom of the scale" — and the sound design files a flat
// meter as evidence the protagonist reasons from, not decoration. These tests
// are the scale those lines assume.
{
  assert.equal(METER_MIN_DB, -48, 'the span matches MONITOR_THRESHOLDS');
  assert.equal(METER_MAX_DB, 0);
  assert.equal(dbToUnit(-48), 0, 'the bottom of the scale is the left edge');
  assert.equal(dbToUnit(0), 1, 'and full scale is the right');
  assert.equal(dbToUnit(-24), 0.5);
  assert.equal(dbToUnit(-96), 0, 'below the scale still reads as the bottom, not off it');
  assert.equal(dbToUnit(12), 1, 'and above it pins to full scale');
  assert.equal(unitToDb(dbToUnit(-14.9)).toFixed(3), '-14.900', 'the mapping round-trips');

  // Monotonic, or the bar and the printed numbers describe different scales.
  let last = -1;
  for (let db = -60; db <= 6; db += 0.5) {
    const unit = dbToUnit(db);
    assert.ok(unit >= last, `dbToUnit is monotonic at ${db}`);
    last = unit;
  }
}

// The game's own thresholds land on that scale without retuning. If one of
// these constants moves, the marks move with it and this test says so.
{
  assert.equal(dbForLinear(0.010).toFixed(1), '-40.0', 'an empty room bed, ROOM_TONE.bedGain');
  assert.equal(dbForLinear(0.18).toFixed(1), '-14.9', 'the take is spoiled, ROOM_TONE.spoilNoise');
  assert.equal(dbForLinear(0.40).toFixed(1), '-8.0', 'found, not just spoiled, ROOM_TONE.catchNoise');
  assert.equal(dbForLinear(0), -96, 'silence has a floor rather than an infinity');
  assert.ok(dbToUnit(dbForLinear(0.010)) < 0.2,
    'so "flat at the bottom of the scale" is literally near the left edge');
}

// ── THE TWELVE-SEGMENT CAP IS GONE ───────────────────────────────────────────
//
// The old meter did `n = min(MONITOR_THRESHOLDS.length, width)` and then drew
// `n` cells wide, so a caller asking for thirty cells got twelve segments in
// twelve cells and the rest of its budget silently disappeared. Segment count
// is a function of the room available.
{
  assert.ok(meterSegmentCount(30) > 12, 'a wide meter is no longer capped at twelve');
  assert.ok(meterSegmentCount(40) > meterSegmentCount(20), 'and count tracks width');
  assert.ok(meterSegmentCount(2) >= 8, 'a tiny meter still has enough segments to read');
  assert.ok(meterSegmentCount(9999) <= 48, 'and a huge one does not become a gradient');

  // The bar honours the width it was given, which the old one did not.
  for (const w of [8, 14, 26, 38]) {
    const geometry = combatGaugeGeometry({ x: 3, w, segments: meterSegmentCount(w) });
    assert.ok(Math.abs(geometry.end - (3 + w)) < 1e-9, `a ${w}-cell meter ends at ${3 + w}`);
  }
}

// A mark and the lit run must land in the same cell for the same decibel,
// otherwise the bar appears to cross a threshold it has not crossed.
{
  const segments = 24;
  assert.equal(meterSegmentAt(-48, segments), 0, 'nothing lit at the bottom');
  assert.equal(meterSegmentAt(0, segments), segments, 'everything lit at full scale');
  assert.equal(meterSegmentAt(-24, segments), 12, 'and the midpoint is the midpoint');
  assert.ok(meterSegmentAt(-14.9, segments) > meterSegmentAt(-18, segments),
    'spoil sits above the hot band, which is what makes hot a warning');
}

// ── TICKS THIN OUT RATHER THAN CROWD ─────────────────────────────────────────
{
  const wide = meterTicks(40);
  assert.ok(wide.length >= 5, 'a wide scale prints most of its numbers');
  assert.deepEqual([...wide].sort((a, b) => a.db - b.db).map((t) => t.db), wide.map((t) => t.db),
    'ticks come back in scale order, left to right');
  for (const tick of wide) {
    assert.ok(tick.left >= 0 && tick.right <= 40, `${tick.db} is inside the bar`);
  }
  // No two labels touch, at any width.
  for (const w of [10, 14, 18, 24, 30, 40, 60]) {
    const ticks = meterTicks(w);
    const order = [...ticks].sort((a, b) => a.left - b.left);
    for (let i = 1; i < order.length; i++) {
      assert.ok(order[i].left >= order[i - 1].right,
        `at width ${w}, "${order[i - 1].label}" and "${order[i].label}" do not overlap`);
    }
  }
  assert.ok(meterTicks(60).length >= meterTicks(14).length,
    'a narrower bar never prints MORE numbers');

  // The ends and 0 are what make the rest interpretable, so they go last.
  const narrow = meterTicks(14);
  assert.ok(narrow.some((t) => t.db === 0), '0 survives to the narrow end');

  assert.equal(meterScaleFits(60), true);
  assert.equal(meterScaleFits(3), false, 'below three numbers there is no scale worth printing');
}

// ── MARKS ────────────────────────────────────────────────────────────────────
{
  const marks = meterMarks([
    { db: dbForLinear(0.18), label: 'spoil', kind: 'spoil' },
    { db: dbForLinear(0.09), label: 'floor', kind: 'floor' },
    { db: 40, label: 'off the top' },
    { db: null, label: 'not a number' },
    null,
  ], 40);
  assert.equal(marks.length, 2, 'a mark off the scale, or with no reading, is not drawn');
  assert.deepEqual(marks.map((m) => m.kind), ['floor', 'spoil'], 'and they come back in scale order');
  assert.equal(marks[1].label, 'SPOIL', 'legends are printed, so they are upper case');
  assert.ok(marks[1].x > marks[0].x, 'spoil sits above the floor it has to clear');
  assert.ok(marks[1].x <= 40);
}

// A mark's legend outranks a tick number. Both drawn into the same cells gave
// "SPOIL12CATCH" on screen — and of the two, where the take dies is the one the
// player needs.
{
  const marks = [{ db: -14.9, label: 'SPOIL', kind: 'spoil' }, { db: -8, label: 'CATCH', kind: 'catch' }];
  const boxes = meterMarkBoxes(marks, 44);
  assert.deepEqual(boxes.map((b) => b.mark.label), ['SPOIL', 'CATCH']);
  assert.ok(boxes[0].right <= boxes[1].left + 1e-9 || boxes[0].left >= boxes[1].right,
    'the legends themselves do not overlap');

  const plain = meterTicks(44).map((t) => t.label);
  const avoiding = meterTicks(44, { avoid: boxes }).map((t) => t.label);
  assert.ok(avoiding.length < plain.length, 'numbers give way to the marks');
  for (const tick of meterTicks(44, { avoid: boxes })) {
    for (const box of boxes) {
      assert.ok(tick.right <= box.left || tick.left >= box.right,
        `"${tick.label}" does not sit under "${box.mark.label}"`);
    }
  }
  assert.ok(avoiding.includes('0'), 'and 0 still survives');
  assert.deepEqual(meterMarkBoxes([{ db: -14.9, kind: 'spoil' }], 44), [],
    'a mark with no legend reserves nothing');
}

// ── BALLISTICS ───────────────────────────────────────────────────────────────
//
// These live here rather than in monitor.js because
// test/monitor-noise-perception.test.mjs pins "same distance, same reading" on
// snapshot.db. Fast up, slow down, and a peak that holds and then falls — the
// same rule the tape keeps, where a single close pass is on the recording
// forever.
{
  const first = meterBallistics(null, -20, 1000);
  assert.equal(first.needleDb, -20, 'the first frame is not an animation from silence');
  assert.equal(first.peakDb, -20);

  // Attack: a bang is on the meter essentially at once.
  const hit = meterBallistics(first, -3, 1050);
  assert.ok(hit.needleDb > -8, `attack is fast (got ${hit.needleDb.toFixed(1)})`);

  // Release: it falls, and it does NOT fall straight to the new value.
  const falling = meterBallistics(hit, -40, 1100);
  assert.ok(falling.needleDb < hit.needleDb, 'it releases');
  assert.ok(falling.needleDb > -40, 'but does not drop to the signal in one frame');

  // The peak holds, then gives way.
  assert.ok(hit.peakDb >= -3.01, 'the peak caught the transient');
  const held = meterBallistics(falling, -40, 1500);
  assert.ok(held.peakDb > -10, 'and still holds it most of a second later');
  let later = held;
  for (let t = 1600; t <= 4000; t += 100) later = meterBallistics(later, -40, t);
  assert.ok(later.peakDb < -20, 'then falls');
  assert.ok(later.peakDb >= later.needleDb, 'a peak is never below the needle it caps');

  // A long gap between frames must not teleport the needle by a huge amount.
  const stalled = meterBallistics(hit, -48, 60000);
  assert.ok(stalled.needleDb >= -48, 'a paused tab does not produce a nonsense reading');

  // OVER latches long enough to be believed, rather than blinking out.
  const over = meterBallistics(first, -1, 2000, { clipped: true });
  assert.ok(over.overUntilMs >= 2000 + METER_BALLISTICS.overHoldMs - 1, 'clip latches');
  const after = meterBallistics(over, -30, 2400);
  assert.equal(after.overUntilMs, over.overUntilMs, 'and the latch survives the level dropping');
}

// The keyed store, so a draw call does not have to thread state.
{
  meterStateReset();
  const a = meterState('level', -6, 1000);
  const b = meterState('level', -40, 1050);
  assert.ok(b.needleDb < a.needleDb, 'the same id keeps falling from where it was');
  const other = meterState('room-mic', -40, 1050);
  assert.equal(other.needleDb, -40, 'a different id is its own needle, not a shared one');
  meterStateReset();
  assert.equal(meterState('level', -40, 1100).needleDb, -40, 'and reset forgets');
}

// Geometry is cached by shape and offset at draw time, because ~16 metered
// panel headers ask for it every frame and each uncached call freezes an object
// per segment.
{
  const a = meterGeometry({ x: 0, w: 20, segments: 16 });
  const b = meterGeometry({ x: 37, w: 20, segments: 16 });
  assert.equal(a.shape, b.shape, 'the same shape at a different x is the same object');
  assert.equal(b.offset, 37, 'and position is carried separately');
  assert.equal(a.shape.cells[0].x, 0, 'the cached shape starts at zero');
  assert.notEqual(meterGeometry({ x: 0, w: 21, segments: 16 }).shape, a.shape,
    'a different width is a different shape');
}

// The gauge helpers still work from their new home.
{
  assert.equal(combatGaugeSegments(20, 40), 8, 'moving the module did not move the maths');
}

console.log('meter contracts passed');
