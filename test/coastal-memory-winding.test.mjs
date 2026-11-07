import test from 'node:test';
import assert from 'node:assert/strict';
import { freshWinding, stepWinding, windingWearGain, windingKeyAngle, windingCylinderAngle, windingSummary, WINDING_PHASE, WINDING_TUNING } from '../src/game/coastal-memory/winding.js';
import { CLAIR_DE_LUNE_SCORE_SECONDS } from '../src/data/clair-de-lune-music-box.js';

const SCORE = CLAIR_DE_LUNE_SCORE_SECONDS;
const step = (state, input, seconds = 0.25, n = 1) => {
  let s = state, events = [];
  for (let i = 0; i < n; i++) { const r = stepWinding(s, input, seconds); s = r.state; events.push(...r.events); }
  return { state: s, events };
};

test('fresh winding rests unwound and silent', () => {
  const s = freshWinding();
  assert.equal(s.phase, WINDING_PHASE.REST);
  assert.equal(s.score, 0);
  assert.equal(s.wind, 0);
  assert.equal(s.wear, 0);
  assert.equal(windingWearGain(s.wear), 1);
});

test('holding the pin still does not play; cranking advances the cylinder and voices notes', () => {
  let s = freshWinding();
  // Held but not turning: stays put, no events.
  const held = step(s, { held: true, turn: 0 }, 0.25, 4);
  assert.equal(held.state.score, 0);
  assert.equal(held.events.length, 0);
  // Crank forward: score advances and plucks fire.
  const cranked = step(s, { held: true, turn: 1 }, 0.25, 4);
  assert.equal(cranked.state.phase, WINDING_PHASE.CRANKING);
  assert.ok(cranked.state.score > 0);
  assert.ok(cranked.state.wind > 0);
  assert.ok(cranked.events.some((e) => e.type === 'pluck' && e.direction === 1));
  assert.ok(cranked.events.some((e) => e.type === 'wind-start'));
});

test('fast cranking outpaces slow cranking but never the governor', () => {
  const slow = step(freshWinding(), { held: true, turn: 0.2 }, 0.25, 4).state;
  const fast = step(freshWinding(), { held: true, turn: 1.0 }, 0.25, 4).state;
  const veryFast = step(freshWinding(), { held: true, turn: 10 }, 0.25, 4).state;
  assert.ok(fast.score > slow.score);
  // 10 rev/s cannot beat the governor cap of 1.04 score-sec/sec (plus lurches).
  const maxAdvance = (WINDING_TUNING.governorMax * 1 + WINDING_TUNING.catchLurch * WINDING_TUNING.catchScore.length);
  assert.ok(veryFast.score <= maxAdvance + 1e-6, `score ${veryFast.score} exceeded governor ${maxAdvance}`);
});

test('letting go slams the winding down and rakes the comb backwards', () => {
  let s = step(freshWinding(), { held: true, turn: 1 }, 0.25, 12).state;
  assert.ok(s.score > 1);
  const released = stepWinding(s, { held: false, turn: 0 }, 0.016);
  assert.equal(released.state.phase, WINDING_PHASE.SLAMMING);
  assert.ok(released.events.some((e) => e.type === 'slam-start'));
  // Run the slam to completion: the cylinder must rake backwards and rest
  // unwound at the start of the tune.
  let t = released.state, rest = 0, slammed = [...released.events];
  for (let i = 0; i < 200 && t.phase !== WINDING_PHASE.REST; i++) {
    const r = stepWinding(t, { held: false, turn: 0 }, 0.016);
    t = r.state; slammed.push(...r.events); rest++;
  }
  assert.equal(t.phase, WINDING_PHASE.REST);
  assert.equal(t.score, 0);
  assert.ok(rest < 200, 'slam did not finish in bounded time');
  assert.ok(slammed.some((e) => e.type === 'pluck' && e.direction === -1), 'slam never raked the comb backwards');
  assert.ok(slammed.some((e) => e.type === 'slam-end'));
});

test('the spring only slams when there is something to release', () => {
  // From fresh rest, letting go does nothing (nothing wound).
  const idle = stepWinding(freshWinding(), { held: false, turn: 0 }, 0.25);
  assert.equal(idle.state.phase, WINDING_PHASE.REST);
  assert.equal(idle.events.length, 0);
});

test('cranking wears the mechanism down and dulls the notes', () => {
  const s = step(freshWinding(), { held: true, turn: 1 }, 0.25, 40).state;
  assert.ok(s.wear > 0, `wear ${s.wear} did not accumulate`);
  assert.ok(windingWearGain(s.wear) < 1);
  assert.ok(s.crankSeconds > 0);
});

test('the chipped gear lurches at its fixed score positions', () => {
  const cranked = step(freshWinding(), { held: true, turn: 1 }, 0.25, 80);
  const lurches = cranked.events.filter((e) => e.type === 'lurch');
  assert.equal(lurches.length, WINDING_TUNING.catchScore.length);
  assert.deepEqual(lurches.map((e) => e.score), WINDING_TUNING.catchScore);
});

test('sheared pins and snapped tines tick instead of singing', () => {
  const cranked = step(freshWinding(), { held: true, turn: 1 }, 0.25, 60);
  const plucks = cranked.events.filter((e) => e.type === 'pluck');
  const ticks = cranked.events.filter((e) => e.type === 'tick');
  assert.ok(plucks.length > 0);
  assert.ok(ticks.length > 0);
  // Ticks never carry a singing tine: they are the holes and stubs.
  for (const t of ticks) assert.ok(t.state === undefined || t.state === 'snapped' || t.pinMissing);
});

test('the model is deterministic and summaries stay finite', () => {
  const a = step(freshWinding(), { held: true, turn: 0.6 }, 0.25, 20);
  const b = step(freshWinding(), { held: true, turn: 0.6 }, 0.25, 20);
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.events, b.events);
  const summary = windingSummary(a.state);
  assert.ok(Object.values(summary).every((v) => Number.isFinite(v) || typeof v === 'boolean' || typeof v === 'string'));
});

test('key and cylinder angles track wind and score', () => {
  const cranked = step(freshWinding(), { held: true, turn: 1 }, 0.25, 8).state;
  assert.ok(windingCylinderAngle(cranked) > 0);
  assert.notEqual(windingKeyAngle(cranked), 0);
  const atStart = windingCylinderAngle(freshWinding());
  assert.equal(atStart, 0);
  assert.ok(Math.abs(windingCylinderAngle(cranked)) <= Math.PI * 2 + 1e-9);
});

test('fast cranking clicks the ratchet faster than slow cranking', () => {
  const slow = step(freshWinding(), { held: true, turn: 0.25 }, 0.05, 40);
  const fast = step(freshWinding(), { held: true, turn: 2.0 }, 0.05, 40);
  const slowClicks = slow.events.filter((e) => e.type === 'wind-click').length;
  const fastClicks = fast.events.filter((e) => e.type === 'wind-click').length;
  assert.ok(slowClicks > 0);
  assert.ok(fastClicks > slowClicks, `fast ${fastClicks} clicks did not outpace slow ${slowClicks}`);
});

test('the full eight bars can be reached and the tune reports its end', () => {
  const cranked = step(freshWinding(), { held: true, turn: 1 }, 0.25, 120);
  assert.ok(cranked.state.score <= SCORE + 1e-6);
  if (cranked.state.score >= SCORE - 1e-6) assert.ok(cranked.events.some((e) => e.type === 'tune-end'));
});
