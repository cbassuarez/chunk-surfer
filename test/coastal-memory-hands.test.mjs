import test from 'node:test';
import assert from 'node:assert/strict';
import { freshHands, stepHands, handsSummary, HANDS_TUNING } from '../src/game/coastal-memory/hands.js';
import { WINDING_PHASE } from '../src/game/coastal-memory/winding.js';

test('holding the pin without cranking stays put; cranking advances the tune', () => {
  let h = freshHands();
  // Hold, no crank: no score advance.
  const held = stepHands(h, { pinHeld: true, crankDelta: 0 }, 0.25);
  assert.equal(held.winding.score, 0);
  assert.equal(held.events.length, 0);
  // Crank forward a full turn over a quarter second (4 turns/sec).
  const cranked = stepHands(h, { pinHeld: true, crankDelta: 1 }, 0.25);
  assert.ok(cranked.winding.score > 0);
  assert.ok(cranked.hands.crankRate > 0);
  assert.ok(cranked.events.some((e) => e.type === 'pluck'));
});

test('crank rate smooths toward the input rather than jumping', () => {
  let h = freshHands();
  h = stepHands(h, { pinHeld: true, crankDelta: 0.25 }, 0.25).hands; // 1 turn/sec
  const first = h.crankRate;
  h = stepHands(h, { pinHeld: true, crankDelta: 1 }, 0.25).hands;    // 4 turn/sec
  assert.ok(h.crankRate > first, 'rate should rise toward the faster crank');
  assert.ok(h.crankRate < 4, 'rate should be smoothed, not instant');
});

test('releasing the pin slams the winding down', () => {
  let h = freshHands();
  for (let i = 0; i < 20; i++) h = stepHands(h, { pinHeld: true, crankDelta: 0.25 }, 0.25).hands;
  assert.ok(h.winding.score > 0);
  const released = stepHands(h, { pinHeld: false, crankDelta: 0 }, 0.016);
  assert.equal(released.winding.phase, WINDING_PHASE.SLAMMING);
  assert.ok(released.events.some((e) => e.type === 'slam-start'));
});

test('shaking jostles the train: a rattle event and extra wear', () => {
  let h = freshHands();
  const r = stepHands(h, { pinHeld: false, crankDelta: 0, shake: 1 }, 0.25);
  assert.ok(r.events.some((e) => e.type === 'shake'));
  assert.ok(r.winding.wear > 0);
  // A tiny shake below threshold is ignored.
  const quiet = stepHands(freshHands(), { pinHeld: false, crankDelta: 0, shake: HANDS_TUNING.shakeThreshold / 2 }, 0.25);
  assert.equal(quiet.events.some((e) => e.type === 'shake'), false);
});

test('summary stays finite and truthful', () => {
  const h = freshHands();
  const s = handsSummary(h);
  assert.equal(s.pinHeld, false);
  assert.equal(s.phase, WINDING_PHASE.REST);
  assert.ok(Object.values(s).every((v) => typeof v === 'boolean' || typeof v === 'string' || Number.isFinite(v)));
});
