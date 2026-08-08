import assert from 'node:assert/strict';

import {
  VIGIL,
  freshVigilState,
  normalizeVigilState,
  reduceVigil,
  vigilSeat,
  vigilSeatCandidates,
  vigilPan,
} from '../src/game/yard-vigil.js';
import { PIN_SOURCES } from '../src/game/combat-progression.js';

const hold = (state, seconds, opts = {}) => {
  let s = state, place = false, earn = false;
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) {
    const r = reduceVigil(s, { dt: step, eligible: true, moved: false, ...opts });
    s = r.state; place = place || r.place; earn = earn || r.earn;
  }
  return { state: s, place, earn };
};

// ── the hold ────────────────────────────────────────────────────────────────
{
  const short = hold(freshVigilState(), VIGIL.HOLD_SECONDS - 5);
  assert.equal(short.place, false, 'forty seconds of standing about is not the vigil');
  assert.equal(short.state.placed, false);

  const full = hold(freshVigilState(), VIGIL.HOLD_SECONDS + 1);
  assert.equal(full.place, true, 'the full hold places the chair, once');
  assert.equal(full.state.placed, true);
}

// LOOKING AROUND IS THE POINT. Only the feet reset it.
{
  let s = freshVigilState();
  for (let t = 0; t < VIGIL.HOLD_SECONDS + 1; t += 1 / 60) {
    s = reduceVigil(s, { dt: 1 / 60, eligible: true, moved: false }).state;
  }
  assert.equal(s.placed, true, 'a player who turns on the spot for the whole hold still earns it');
}
{
  let s = freshVigilState(), placed = false;
  for (let i = 0; i < 60 * 60; i++) {
    const r = reduceVigil(s, { dt: 1 / 60, eligible: true, moved: i % 90 === 0 });
    s = r.state; placed = placed || r.place;
  }
  assert.equal(placed, false, 'a step every second and a half never completes the hold');
}

// Going indoors, or a scene opening over the world, stops the clock dead.
{
  let s = hold(freshVigilState(), VIGIL.HOLD_SECONDS - 8).state;
  assert.ok(s.held > 30);
  s = reduceVigil(s, { dt: 1 / 60, eligible: false, moved: false }).state;
  assert.equal(s.held, 0, 'leaving the yard is not a pause, it is a reset');
}

// ── the noticing ────────────────────────────────────────────────────────────
{
  const placed = hold(freshVigilState(), VIGIL.HOLD_SECONDS + 1).state;

  const away = reduceVigil(placed, { dt: 1 / 60, see: { dist: 6, cos: -0.9 } });
  assert.equal(away.earn, false, 'standing with your back to it is not seeing it');

  const far = reduceVigil(placed, { dt: 1 / 60, see: { dist: VIGIL.SEE_RANGE_M + 4, cos: 1 } });
  assert.equal(far.earn, false, 'a chair at twenty metres in the rain is not a chair yet');

  const seen = reduceVigil(placed, { dt: 1 / 60, see: { dist: 5, cos: 0.95 } });
  assert.equal(seen.earn, true, 'turning round and looking at it is the reward');
  assert.equal(seen.state.seen, true);

  const again = reduceVigil(seen.state, { dt: 1 / 60, see: { dist: 5, cos: 0.95 } });
  assert.equal(again.earn, false, 'the pin is granted once, not every frame it is on screen');
}

// ── where it goes ───────────────────────────────────────────────────────────
{
  // Facing north (0,-1), in metres (cellsPerMetre 1): behind and to a side.
  const seat = vigilSeat({ x: 100, y: 100, forwardX: 0, forwardY: -1 });
  assert.ok(seat.y > 100 + VIGIL.PLACE_MIN_M - 1, 'the chair is behind him, not in the frame');
  assert.ok(Math.abs(seat.x - 100) > 1, 'and off his own axis, not in his footprints');
  const back = Math.hypot(seat.x - 100, seat.y - 100);
  assert.ok(back >= VIGIL.PLACE_MIN_M && back <= VIGIL.PLACE_MAX_M + 2,
    'close enough to find, far enough that it cannot pop in on screen');

  // THE UNITS. The runtime hands this runtime cells, and a cell is half a metre.
  const inCells = vigilSeat({ x: 100, y: 100, forwardX: 0, forwardY: -1, cellsPerMetre: 2 });
  const backCells = Math.hypot(inCells.x - 100, inCells.y - 100);
  assert.ok(Math.abs(backCells - back * 2) < 1e-6,
    'cellsPerMetre scales the placement, or the chair lands at half the distance it claims');
}

// ── it survives a reload, and it is the fourth pin ──────────────────────────
{
  const restored = normalizeVigilState({ held: 999, placed: true, seen: false, at: { x: 4, y: 5, yaw: 1 } });
  assert.equal(restored.held, VIGIL.HOLD_SECONDS, 'a nonsense hold is clamped, not trusted');
  assert.deepEqual(restored.at, { x: 4, y: 5, yaw: 1 }, 'the chair comes back where it was left');
  assert.deepEqual(normalizeVigilState(null), freshVigilState(), 'no save reads as no vigil');

  assert.ok(PIN_SOURCES.flags.includes(VIGIL.FLAG),
    'the flag the vigil sets is actually a pin source, or the reward is decorative');
}

// ── the seat has second choices, and the sound knows which shoulder ─────────
{
  const facing = { x: 100, y: 100, forwardX: 0, forwardY: -1, cellsPerMetre: 2 };
  const seats = vigilSeatCandidates(facing);
  assert.ok(seats.length > 1, 'one candidate is how the vigil silently never happened');
  assert.deepEqual(seats[0], vigilSeat(facing), 'the ideal seat is still first and still preferred');
  // Facing north (forwardY -1), every candidate is south of the player.
  for (const s of seats) assert.ok(s.y > facing.y, 'a candidate landed in front of the player');
  // The fallbacks straddle both shoulders, which is the point: a shelter behind
  // blocks one side, not both.
  assert.ok(seats.some((s) => s.x < facing.x) && seats.some((s) => s.x > facing.x),
    'every fallback is on the same side as the first choice');

  // The pan is the shoulder the chair is actually over. Facing north, a chair to
  // the WEST (smaller x) is over the left shoulder and must pan left.
  const west = vigilPan({ seatX: 90, seatY: 110, x: 100, y: 100, forwardX: 0, forwardY: -1 });
  const east = vigilPan({ seatX: 110, seatY: 110, x: 100, y: 100, forwardX: 0, forwardY: -1 });
  assert.ok(west < -0.1, `a chair to the west should pan left, got ${west}`);
  assert.ok(east > 0.1, `a chair to the east should pan right, got ${east}`);
  assert.equal(Math.sign(west), -Math.sign(east), 'the two shoulders are not opposites');
  assert.ok(Math.abs(vigilPan({ seatX: 100, seatY: 100, x: 100, y: 100, forwardX: 0, forwardY: -1 })) < 1e-6,
    'a chair on top of the player has no shoulder');
  for (const p of [west, east]) assert.ok(p >= -1 && p <= 1, 'pan escaped the stereo field');
}

console.log('yard vigil specs passed');
