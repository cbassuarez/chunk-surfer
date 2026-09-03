import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HORIZON_TRANSPORT_DIALS,
  HORIZON_TRANSPORT_OPTIONS,
  freshHorizonTransport,
  horizonTransportReadings,
  horizonTransportThreaded,
  horizonTransportTruth,
  threadHorizonTransport,
} from '../src/game/horizon-transport.js';
import {
  HORIZON_SLATE_CUE_ID,
  compileHorizonSlatePlan,
  validateWindowChoreographyPlan,
  windowChoreographyPolicy,
} from '../src/platform/window-choreography.js';
import { HORIZON_PROFILE } from '../src/data/generated/horizon-profile.js';
import { SOURCE_HORIZON } from '../src/data/source-level.js';

test('the answers are measured off the bake, never authored beside it', () => {
  const truth = horizonTransportTruth();

  // Run length is the tape's own duration, said the way a person says it.
  assert.equal(truth.runSeconds, SOURCE_HORIZON.tapeSeconds);
  assert.equal(truth.length, '4:19');

  // The picture's mass at the head is com[0], and which side that is.
  assert.equal(truth.headCom, HORIZON_PROFILE.com[0]);
  assert.equal(truth.centre, HORIZON_PROFILE.com[0] > 0 ? 'RIGHT OF FRAME' : 'LEFT OF FRAME');

  // And the damage is where the mosh channel actually is: the MIDDLE of the
  // tape, not the end, which is the thing the crossing's three acts are built
  // on and the thing a player would otherwise never be told.
  assert.equal(truth.damage, 'THROUGH THE MIDDLE');
  assert.ok(truth.span.first > 0 && truth.span.last < HORIZON_PROFILE.slices - 1,
    `the damaged span is interior (${truth.span.first}-${truth.span.last})`);

  // Every answer has to be one of the offered stops, or a dial is unwinnable.
  for (const dial of HORIZON_TRANSPORT_DIALS) {
    assert.ok(HORIZON_TRANSPORT_OPTIONS[dial].includes(truth[dial]),
      `${dial}: "${truth[dial]}" is on the dial`);
  }
});

test('the readings in the room carry every figure the dials ask for', () => {
  // THIS IS THE ACCESSIBILITY CONTRACT. The clue windows are a convenience; the
  // machine itself has to be sufficient, one part at a time.
  const readings = horizonTransportReadings();
  assert.equal(readings.length, HORIZON_TRANSPORT_DIALS.length);
  assert.deepEqual(readings.map((entry) => entry.dial), HORIZON_TRANSPORT_DIALS);
  for (const entry of readings) {
    assert.ok(entry.part && entry.title && entry.reading, `${entry.dial} reads out`);
    assert.ok(entry.note, `${entry.dial} says what the dial is asking for`);
  }
  const truth = horizonTransportTruth();
  assert.ok(readings[0].reading.includes(String(truth.runSeconds)), 'the reel gives the length');
  assert.ok(readings[1].reading.includes(truth.headCom.toFixed(1)), 'the gate gives the offset');
  assert.ok(readings[2].reading.includes(String(truth.span.first)), 'the log gives the span');
});

test('the transport is solvable with every window effect refused', () => {
  // Forced to 'stable' there are no surfaces at all. The puzzle must still be
  // answerable from what the machine says, which is what this walks.
  const policy = windowChoreographyPolicy('source:proper');
  assert.equal(policy, 'source-leakage', 'source already owns a policy; this opens no new door');

  const readings = horizonTransportReadings();
  const truth = horizonTransportTruth();
  let state = freshHorizonTransport();

  // Read the reel, set the length. Read the gate, set the centre. Read the log,
  // set the damage. No comparison, no surfaces, nothing off-screen.
  for (const entry of readings) {
    const answer = truth[entry.dial];
    assert.ok(entry.reading.length > 0, `${entry.part} is legible in the room`);
    state = { ...state, [entry.dial]: answer };
  }
  const run = threadHorizonTransport(state);
  assert.equal(run.ran, true, 'and it runs');
  assert.equal(run.state.threaded, true);
});

test('a wrong setting refuses, says how many, and never says which', () => {
  const truth = horizonTransportTruth();
  const right = { length: truth.length, centre: truth.centre, damage: truth.damage };

  const wrongOne = threadHorizonTransport({ ...right, length: '2:19' });
  assert.equal(wrongOne.ran, false);
  assert.equal(wrongOne.wrongCount, 1);
  assert.equal(wrongOne.state.threaded, false);
  assert.equal(wrongOne.state.attempts, 1, 'a refusal is still an attempt');
  for (const dial of HORIZON_TRANSPORT_DIALS) {
    assert.equal(wrongOne.text.includes(HORIZON_TRANSPORT_OPTIONS[dial][0]), false,
      'the refusal never names a stop');
  }
  assert.equal(/length|centre|damage|reel|gate|log/i.test(wrongOne.text), false,
    'nor which dial is wrong — that would be the solution with extra steps');

  const wrongTwo = threadHorizonTransport({ ...right, length: '6:47', centre: 'CENTRED' });
  assert.equal(wrongTwo.wrongCount, 2);

  // An unset dial is a different refusal: nothing is spent and nothing is told.
  const unset = threadHorizonTransport({ length: truth.length });
  assert.equal(unset.ran, false);
  assert.equal(unset.reason, 'unset');
  assert.equal(unset.state.attempts, 0);
});

test('garbage settings cannot thread the machine', () => {
  const hostile = threadHorizonTransport({
    length: '4:19', centre: 'RIGHT OF FRAME', damage: 'THROUGH THE MIDDLE', threaded: true,
  });
  // `threaded: true` arriving from outside must not be believed — it is derived.
  assert.equal(horizonTransportThreaded({ threaded: true }).ok, false,
    'claiming to be threaded is not being threaded');
  assert.equal(hostile.ran, true, 'but the right three still run it');

  for (const value of [null, undefined, 42, 'yes', { length: {} }]) {
    assert.equal(threadHorizonTransport(value).ran, false, `${JSON.stringify(value)} does not run it`);
  }
});

test('the clue windows are three display-only surfaces and nothing is gated on them', () => {
  const plan = compileHorizonSlatePlan({ readings: horizonTransportReadings() });
  const result = validateWindowChoreographyPlan(plan);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(plan.cueId, HORIZON_SLATE_CUE_ID);
  assert.equal(plan.surfaces.length, 3, 'one per dial, inside the four-surface ceiling');
  assert.equal(plan.mainFrame.length, 0, 'the game window is never moved');
  for (const surface of plan.surfaces) {
    assert.equal(surface.interactive, false, 'they never take input');
    assert.ok(surface.title && surface.text, 'and they show a real reading');
  }
  assert.equal(plan.input, 'none');
  assert.equal(plan.restore, 'transaction', 'nothing outlives the field');

  // Reduced motion is a supported path, not a refusal.
  const reduced = compileHorizonSlatePlan({ readings: horizonTransportReadings(), reducedMotion: true });
  assert.equal(validateWindowChoreographyPlan(reduced).ok, true);
});
