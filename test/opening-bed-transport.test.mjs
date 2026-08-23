import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENING_BED_BAR_SECONDS,
  OPENING_BED_LOOP_SECONDS,
  nextOpeningBedDownbeatAt,
  openingBedProximityForDistance,
} from '../src/audio/opening-bed-transport.js';

test('opening bed constants describe an eight-bar 120 BPM loop', () => {
  assert.equal(OPENING_BED_BAR_SECONDS, 2);
  assert.equal(OPENING_BED_LOOP_SECONDS, 16);
});

test('nextOpeningBedDownbeatAt returns the origin when safely before it', () => {
  assert.equal(nextOpeningBedDownbeatAt(9.0, 10.0), 10.0);
});

test('nextOpeningBedDownbeatAt skips a downbeat when too close', () => {
  assert.equal(nextOpeningBedDownbeatAt(9.95, 10.0), 12.0);
});

test('nextOpeningBedDownbeatAt advances by bar-sized increments', () => {
  assert.equal(nextOpeningBedDownbeatAt(10.13, 10.0), 12.0);
  assert.equal(nextOpeningBedDownbeatAt(12.13, 10.0), 14.0);
  assert.equal(nextOpeningBedDownbeatAt(19.99, 10.0), 22.0);
});

test('nextOpeningBedDownbeatAt never returns a past time', () => {
  for (const now of [0, 0.1, 1.99, 2.01, 99.3]) {
    const at = nextOpeningBedDownbeatAt(now, 0);
    assert.ok(at >= now, `${at} >= ${now}`);
  }
});

test('opening bed proximity is open at distance and narrowed near the booth', () => {
  const far = openingBedProximityForDistance(40);
  const mid = openingBedProximityForDistance(14);
  const near = openingBedProximityForDistance(2);

  assert.equal(far.gain, 1);
  assert.equal(far.hpHz, 45);
  assert.equal(far.lpHz, 16000);

  assert.ok(mid.hpHz > far.hpHz);
  assert.ok(mid.lpHz < far.lpHz);

  assert.ok(near.gain < mid.gain);
  assert.ok(near.hpHz > mid.hpHz);
  assert.ok(near.lpHz < mid.lpHz);
});

test('opening bed proximity values stay bounded for invalid distances', () => {
  for (const input of [-100, NaN, Infinity, undefined]) {
    const p = openingBedProximityForDistance(input);
    assert.ok(p.gain >= 0 && p.gain <= 1);
    assert.ok(p.hpHz >= 45 && p.hpHz <= 820);
    assert.ok(p.lpHz >= 1850 && p.lpHz <= 16000);
    assert.ok(p.q >= 0.55 && p.q <= 1.15);
  }
});
