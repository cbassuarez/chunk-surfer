import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIREBALL_BATTLE_ORDER, fireballBattleOrdinal, fireballChoreography,
  fireballCyclePhase, fireballPressure,
} from '../src/game/fireball-choreography.js';

// A STAIRCASE OF S-CURVES.
//
// Sampled once per turn, so within a turn the choreography never changes under
// the player's hand — that is the step. Across turns it follows a logistic
// rather than a line: the first fight is nearly still, the middle of the night
// is where it actually turns, and the last approaches its ceiling without ever
// reaching it, so there is no turn at which it stops getting worse.
test('pressure runs from nothing to everything across the night and never goes back', () => {
  const walk = [];
  for (const battleId of FIREBALL_BATTLE_ORDER) {
    for (let turn = 0; turn <= 12; turn += 1) walk.push(fireballPressure({ battleId, turn }));
  }
  assert.equal(walk[0], 0, 'the first turn of the first fight is a window that has never heard of you');
  assert.equal(walk.at(-1), 1, 'the last turn of the last fight is the ceiling');
  for (let index = 1; index < walk.length; index += 1) {
    assert.ok(walk[index] >= walk[index - 1] - 1e-9, `it never eases off (${index})`);
  }
  // The fights join up: the end of one is the start of the next, so crossing a
  // fight boundary is not a cliff.
  for (let index = 1; index < FIREBALL_BATTLE_ORDER.length; index += 1) {
    const end = fireballPressure({ battleId: FIREBALL_BATTLE_ORDER[index - 1], turn: 12 });
    const start = fireballPressure({ battleId: FIREBALL_BATTLE_ORDER[index], turn: 0 });
    assert.ok(Math.abs(end - start) < 1e-9, `${FIREBALL_BATTLE_ORDER[index]} picks up where the last one left off`);
  }
});

test('it is an S, not a ramp: the middle of the night is where it turns', () => {
  const at = (index) => fireballPressure({ battleId: FIREBALL_BATTLE_ORDER[index], turn: 6 });
  const early = at(1) - at(0);
  const middle = at(2) - at(1);
  const late = at(4) - at(3);
  assert.ok(middle > early, 'the second fight is a bigger jump than the first');
  assert.ok(middle > late, 'and a bigger jump than the last, which is already near the ceiling');
});

// The settle is not a mercy that shrinks. The harder the break is to read, the
// longer the player is owed to act on having read it.
test('difficulty grows in an authored feint while every committed catch keeps at least 1.57 seconds', () => {
  const first = fireballChoreography({ battleId: 'natatorium', turn: 0 });
  const last = fireballChoreography({ battleId: 'source-final', turn: 12 });
  for (const key of ['evasion', 'reach', 'breakMs', 'cohesion']) {
    assert.ok(last[key] > first[key], `${key} climbs`);
  }
  assert.equal('senseMs' in first,false,'cursor prediction is not part of the choreography contract');
  assert.ok(first.settleMs>=1570&&last.settleMs>=1570,'the stationary catch floor never shrinks');
  assert.ok(first.breakMs+first.settleMs<=2050&&last.breakMs+last.settleMs<=2050,'one feint fits the outside flight');
  assert.equal(first.gesture,'rise-drift');
  assert.equal(last.gesture,'swarm-recombine');
});

test('reduced motion opts out of the whole dance', () => {
  const still = fireballChoreography({ battleId: 'source-final', turn: 12, reducedMotion: true });
  assert.equal(still.pressure, 0);
  assert.equal(still.evasion, 0, 'nothing darts');
  assert.equal(still.breakMs,0);
  assert.ok(still.settleMs>=2050);
});

// One count for the whole cast: they break together and settle together, which
// is the difference between a formation and four windows being annoying in
// parallel.
test('there is one feint and then a permanent settle the player can act in', () => {
  const dance = fireballChoreography({ battleId: 'source-final', turn: 12 });
  const period = (dance.breakMs + dance.settleMs) / 1000;
  let breaking = 0, settled = 0, peak = 0;
  for (let step = 0; step < 400; step += 1) {
    const phase = fireballCyclePhase(step * period / 200, dance);
    if (phase.breaking) breaking += 1; else settled += 1;
    peak = Math.max(peak, phase.travel);
    assert.ok(!(phase.breaking && phase.settled), 'it is one or the other');
    if (phase.settled) assert.equal(phase.travel, 0, 'a settled shoal is perfectly still');
  }
  assert.ok(settled > breaking, 'even at the ceiling there is more settle than break');
  assert.ok(peak > .98, 'and the break reaches full travel in the middle of itself');
  const longAfter=fireballCyclePhase(period*20,dance);
  assert.equal(longAfter.settled,true);
  assert.equal(longAfter.travel,0,'it never loops back into another dodge');
  assert.equal(longAfter.settleLeftMs,0);
});

test('the break eases in and out rather than snapping between two places', () => {
  const dance = fireballChoreography({ battleId: 'practice', turn: 6 });
  const start = fireballCyclePhase(0, dance).travel;
  const middle = fireballCyclePhase(dance.breakMs / 2000, dance).travel;
  assert.ok(start < .05, 'it leaves from where it was');
  assert.ok(middle > .95, 'and is furthest out halfway through');
});

test('an unknown battle is the gentlest one rather than a crash', () => {
  assert.equal(fireballBattleOrdinal('training'), 0);
  assert.equal(fireballPressure({ battleId: 'training', turn: 0 }), 0);
});
