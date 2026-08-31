// Reading a meter.
//
// Everything in here is pure: given numbers, it returns numbers. The drawing
// lives in presentation.js, and the reason for the split is that the meter had
// ZERO test coverage while being on roughly twenty surfaces — the bar, the
// scale under it and the marks on it have to agree about where a decibel is,
// and three copies of that arithmetic inside a canvas callback is how they stop
// agreeing without anyone noticing.
//
// WHY THE METER GREW A SCALE
//
// Two authored lines describe an instrument that was never drawn:
//
//   "the meter dead flat at the bottom of the scale"          data/battles.js
//   "The meter, which has never lied to you, sits flat
//    at the bottom of the scale."
//
// and the sound-effects list files "a flat meter" alongside wet footsteps and
// the held A as evidence the protagonist REASONS FROM — a plot fact, not
// decoration. playback.js puts it plainly: "The needle and the tape were wired
// to the same input, so they agree with each other and disagree with your
// ears." A witness you are asked to trust against your own ears has to be
// legible. A smear of amber blocks is not.
//
// THE SCALE ALREADY FITS THE GAME
//
// The span is the existing MONITOR_THRESHOLDS range, -48..0 dBFS, and the
// numbers the game already runs on land inside it without retuning:
//
//   -40.0   an empty room's bed            ROOM_TONE.bedGain 0.010
//   -30.0   the meter's mid-hot band       MONITOR_DANGER_THRESHOLDS.midHotDb
//   -20.9   one injury's noise floor       NOISE.perInjury 0.09
//   -18.0   the meter's hot band           MONITOR_DANGER_THRESHOLDS.hotDb
//   -14.9   THE TAKE IS SPOILED            ROOM_TONE.spoilNoise 0.18
//    -8.0   not just spoiled — found       ROOM_TONE.catchNoise 0.40
//
// So "flat at the bottom of the scale" is literally -40 on a -48 scale, and the
// colour bands already bracket the thresholds that end a take. None of this is
// new information; it has simply never been on screen.

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
export const clamp01 = (value) => clamp(value, 0, 1);

// ── SEGMENT GEOMETRY ─────────────────────────────────────────────────────────
//
// Moved here from combat-view.js, unchanged, because the audio meter needs the
// same banked layout and the generic widget cannot import the combat screen.
// combat-view.js re-exports these, so its own callers and both existing test
// files carry on importing from where they always did.
//
// Health is logical data, not a promise of one piece of display hardware per
// point. The battle can carry 40+ points now, so the faceplate always exposes a
// calibrated sixteen-element readout, banked four at a time, with the exact
// number beside it. That is how the rest of this interface treats meters too:
// a stable physical scale with a separate authoritative counter.
export const COMBAT_GAUGE_SEGMENTS = 16;
export const COMBAT_GAUGE_BANK_SIZE = 4;

export function combatGaugeSegments(value, max, segments = COMBAT_GAUGE_SEGMENTS) {
  const count = Math.max(1, Math.round(Number(segments) || COMBAT_GAUGE_SEGMENTS));
  const maximum = Math.max(1, Number(max) || 1);
  const current = clamp(value, 0, maximum);
  if (current <= 0) return 0;
  return Math.min(count, Math.max(1, Math.ceil((current / maximum) * count)));
}

export function combatGaugeState({
  value = 0,
  max = 1,
  ghostFrom = null,
  segments = COMBAT_GAUGE_SEGMENTS,
} = {}) {
  const maximum = Math.max(1, Number(max) || 1);
  const currentValue = clamp(value, 0, maximum);
  const previousValue = ghostFrom == null ? currentValue : clamp(ghostFrom, 0, maximum);
  const filled = combatGaugeSegments(currentValue, maximum, segments);
  const previousFilled = combatGaugeSegments(previousValue, maximum, segments);
  const delta = currentValue - previousValue;
  return Object.freeze({
    segments: Math.max(1, Math.round(Number(segments) || COMBAT_GAUGE_SEGMENTS)),
    currentValue,
    previousValue,
    maximum,
    filled,
    previousFilled,
    lost: Math.max(0, previousFilled - filled),
    gained: Math.max(0, filled - previousFilled),
    sameBucketChange: delta !== 0 && previousFilled === filled,
    delta,
    leadingIndex: filled > 0 ? filled - 1 : 0,
  });
}

export function combatGaugeGeometry({
  x = 0,
  w = 0,
  segments = COMBAT_GAUGE_SEGMENTS,
  bankSize = COMBAT_GAUGE_BANK_SIZE,
  minorGap = .26,
  majorGap = .72,
} = {}) {
  const count = Math.max(1, Math.round(Number(segments) || COMBAT_GAUGE_SEGMENTS));
  const bank = Math.max(1, Math.round(Number(bankSize) || COMBAT_GAUGE_BANK_SIZE));
  const width = Math.max(0, Number(w) || 0);
  const gaps = Array.from({ length: Math.max(0, count - 1) }, (_, index) =>
    (index + 1) % bank === 0 ? Math.max(0, majorGap) : Math.max(0, minorGap));
  const gapWidth = gaps.reduce((sum, gap) => sum + gap, 0);
  const segmentWidth = Math.max(0, (width - gapWidth) / count);
  let cursor = Number(x) || 0;
  const cells = [];
  for (let index = 0; index < count; index += 1) {
    cells.push(Object.freeze({ index, x: cursor, w: segmentWidth, bank: Math.floor(index / bank) }));
    cursor += segmentWidth + (gaps[index] || 0);
  }
  return Object.freeze({
    x: Number(x) || 0,
    w: width,
    segments: count,
    bankSize: bank,
    segmentWidth,
    gapWidth,
    end: cells.length ? cells.at(-1).x + cells.at(-1).w : Number(x) || 0,
    cells: Object.freeze(cells),
  });
}

// Geometry is shape, not position: computed at x=0 and offset at draw time, so
// the cache key is just (w, segments, bankSize). Worth it because roughly
// sixteen metered panel headers ask for this every frame, and each uncached
// call freezes one object per segment plus the wrapper.
const GEOMETRY_CACHE = new Map();

export function meterGeometry({ x = 0, w = 0, segments, bankSize = 4, minorGap = .06, majorGap = .22 } = {}) {
  const key = `${w}|${segments}|${bankSize}|${minorGap}|${majorGap}`;
  let shape = GEOMETRY_CACHE.get(key);
  if (!shape) {
    shape = combatGaugeGeometry({ x: 0, w, segments, bankSize, minorGap, majorGap });
    if (GEOMETRY_CACHE.size > 64) GEOMETRY_CACHE.clear();
    GEOMETRY_CACHE.set(key, shape);
  }
  return { shape, offset: Number(x) || 0 };
}

// ── THE SCALE ────────────────────────────────────────────────────────────────

// The span the bar draws. Matches MONITOR_THRESHOLDS' own range so the printed
// numbers and the lit segments cannot describe different scales.
export const METER_MIN_DB = -48;
export const METER_MAX_DB = 0;

export const dbToUnit = (db) =>
  clamp01((clamp(db, METER_MIN_DB, METER_MAX_DB) - METER_MIN_DB) / (METER_MAX_DB - METER_MIN_DB));

export const unitToDb = (unit) => METER_MIN_DB + clamp01(unit) * (METER_MAX_DB - METER_MIN_DB);

export const dbForLinear = (rms) => (rms > 0 ? Math.max(-96, 20 * Math.log10(rms)) : -96);

// How many segments a bar of this many cells should carry. The old meter was
// hard-capped at twelve — `n = min(MONITOR_THRESHOLDS.length, width)` — so a
// caller asking for thirty cells got twelve segments in twelve cells and the
// rest of its budget silently vanished. Segment count is a function of the room
// available, not of how many entries a threshold table happens to have.
export function meterSegmentCount(w, { perCell = 1.15, min = 8, max = 48 } = {}) {
  const width = Math.max(0, Number(w) || 0);
  return Math.round(clamp(width * perCell, min, max));
}

// Which segment index a decibel falls in, so the lit run and a mark placed at
// the same dB cannot land in different cells.
export function meterSegmentAt(db, segments) {
  const count = Math.max(1, Math.round(Number(segments) || 1));
  return clamp(Math.ceil(dbToUnit(db) * count), 0, count);
}

// ── TICKS ────────────────────────────────────────────────────────────────────
//
// Priority order, not a fixed list. A label is dropped when it would crowd its
// neighbour, and the ones that survive longest are the ends of the scale and 0 —
// the two readings that make the rest of the bar interpretable. Crowded numbers
// are worse than fewer numbers: they read as texture, which is the failure this
// whole change exists to fix.
const TICK_DB = Object.freeze([0, -48, -24, -12, -36, -6, -18, -30, -42]);

// `avoid` is a list of {left,right} cell ranges already spoken for — in
// practice the mark legends, which outrank the numbers: a player needs to know
// where SPOIL is more than they need to read -12, and printing both in the same
// cells produced "SPOIL12CATCH".
export function meterTicks(w, { minGap = 3, ticks = TICK_DB, avoid = [] } = {}) {
  const width = Math.max(0, Number(w) || 0);
  const placed = [...avoid.map((box) => ({
    db: null, label: '', left: box.left, right: box.right, x: box.left, reserved: true,
  }))];
  for (const db of ticks) {
    const x = dbToUnit(db) * width;
    const label = String(Math.round(db));
    // Left-align the first, right-align the last, centre the rest — otherwise
    // the end labels hang off the bar they are describing.
    const unit = dbToUnit(db);
    const left = unit <= 0 ? x : unit >= 1 ? x - label.length : x - label.length / 2;
    const cell = { db, x, label, left, right: left + label.length };
    const clear = placed.every((other) =>
      cell.left >= other.right + minGap || cell.right + minGap <= other.left);
    if (clear && cell.left >= 0 && cell.right <= width) placed.push(cell);
  }
  return placed.filter((tick) => !tick.reserved).sort((a, b) => a.db - b.db);
}

// Where a mark's legend will sit, so the ticks can get out of its way.
export function meterMarkBoxes(marks, w) {
  const width = Math.max(0, Number(w) || 0);
  return meterMarks(marks, w).filter((mark) => mark.label).map((mark) => {
    const left = Math.max(0, Math.min(width - mark.label.length, mark.x - mark.label.length / 2));
    return { left, right: left + mark.label.length, mark };
  });
}

// Below this there is no room for a scale worth printing, so the caller falls
// back to the one-row strip rather than drawing two crowded numbers.
export function meterScaleFits(w) { return meterTicks(w).length >= 3; }

// ── MARKS ────────────────────────────────────────────────────────────────────
//
// A mark is a reference the player is being asked to stay under, drawn on the
// bar and named under it. They are passed in by the caller and never baked in:
// FLOOR and SPOIL mean something where the meter is showing take noise and
// would be a lie on the mic check, where nothing is being recorded and nothing
// can be spoiled.
export function meterMarks(marks, w) {
  const width = Math.max(0, Number(w) || 0);
  const out = [];
  for (const mark of marks || []) {
    // `Number(null)` is 0, which is finite — so a mark with no reading would
    // otherwise be drawn at full scale, the worst place to put a phantom line.
    if (!mark || mark.db == null || !Number.isFinite(Number(mark.db))) continue;
    const db = Number(mark.db);
    if (db < METER_MIN_DB || db > METER_MAX_DB) continue;
    out.push(Object.freeze({
      db,
      kind: mark.kind || 'mark',
      label: String(mark.label || '').toUpperCase(),
      x: dbToUnit(db) * width,
      unit: dbToUnit(db),
    }));
  }
  return out.sort((a, b) => a.db - b.db);
}

// ── BALLISTICS ───────────────────────────────────────────────────────────────
//
// These live in the WIDGET, not in the data model, and that is deliberate:
// test/monitor-noise-perception.test.mjs pins
// `monitorSnapshot(9000).db === monitorSnapshot(9100).db` — "same distance,
// same reading" — so a decaying needle on snapshot.db would break a contract
// that is protecting something real. monitor.js is not touched.
//
// It is also not a new idea. The orphaned tools/chunk_surfer/tests/monitor.mjs
// still asserts "meter attacks toward the signal" and "meter releases instead
// of dropping to zero" against a code path that stopped doing either.
//
// Fast up, slow down, and a peak that holds and then falls — which is what a
// microphone does, and the same rule the tape already keeps: playback.js calls
// peak-hold the reason "a single close pass is on the recording forever".
export const METER_BALLISTICS = Object.freeze({
  attackMs: 40,        // near-instant: a meter that lags a bang is lying
  releaseDbPerSec: 26, // ~1.8s to fall the full scale, close to a PPM's fallback
  peakHoldMs: 900,
  peakFallDbPerSec: 14,
  overHoldMs: 2200,    // long enough to be seen and believed
});

// Advance one meter's needle. Pure: state in, state out, no clock of its own.
export function meterBallistics(previous, db, nowMs, options = {}) {
  const cfg = { ...METER_BALLISTICS, ...options };
  const target = clamp(db, METER_MIN_DB, METER_MAX_DB);
  const over = !!options.clipped;

  if (!previous) {
    return Object.freeze({
      needleDb: target, peakDb: target, peakAtMs: nowMs,
      overUntilMs: over ? nowMs + cfg.overHoldMs : 0, atMs: nowMs,
    });
  }

  const dt = Math.max(0, Math.min(0.25, (nowMs - previous.atMs) / 1000));

  // Attack is a time constant, not a jump, so a spike still reads as a
  // movement. Release is a constant dB/sec fall, which is what makes the bar
  // legible: the eye can judge how loud a thing was from how far it falls.
  const needleDb = target >= previous.needleDb
    ? target - (target - previous.needleDb) * Math.exp(-(dt * 1000) / Math.max(1, cfg.attackMs))
    : Math.max(target, previous.needleDb - cfg.releaseDbPerSec * dt);

  let peakDb = previous.peakDb;
  let peakAtMs = previous.peakAtMs;
  if (target >= peakDb) { peakDb = target; peakAtMs = nowMs; }
  else if (nowMs - peakAtMs > cfg.peakHoldMs) {
    peakDb = Math.max(needleDb, peakDb - cfg.peakFallDbPerSec * dt);
  }

  return Object.freeze({
    needleDb,
    peakDb: Math.max(peakDb, needleDb),
    peakAtMs,
    overUntilMs: over ? nowMs + cfg.overHoldMs : (previous.overUntilMs || 0),
    atMs: nowMs,
  });
}

// One store, so a caller does not have to thread state through a draw call.
// Keyed by an explicit id, or by position when the caller has not named it.
const BALLISTIC_STATE = new Map();

export function meterState(id, db, nowMs, options = {}) {
  const key = String(id);
  const next = meterBallistics(BALLISTIC_STATE.get(key) || null, db, nowMs, options);
  BALLISTIC_STATE.set(key, next);
  return next;
}

export function meterStateReset() { BALLISTIC_STATE.clear(); }
