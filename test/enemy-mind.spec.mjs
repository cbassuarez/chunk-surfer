// The opponent's mind, and the promises that make an opponent with opinions
// safe to ship.
//
// Choosing is easy. What is hard is choosing without quietly destroying things
// the fight is built on: the take economy, an ending route, the balance every
// profile was tuned against, and the player's ability to answer at all. Each of
// those is a way for a clever opponent to ruin a game while looking like it is
// working, and each has a test here.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_ACTION,
  advanceEnemy,
  availableCombatActions,
  combatResult,
  createCombatState,
  currentCombatIntent,
  predictedCombatIntent,
  reduceCombat,
} from '../src/game/combat-state.js';
import {
  ENEMY_STANCE,
  carriedRead,
  emptyEnemyRead,
  favouredAnswers,
  guaranteedIds,
  mergeCarriedRead,
  nextStance,
  observePlayerBeat,
  readFromCarried,
} from '../src/game/enemy-mind.js';
import { attachCombatDefinition, sourceCombatBattle, trainingCombatDefinition } from '../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';

const PROFILES = {
  training: trainingCombatDefinition(),
  natatorium: attachCombatDefinition({ id: 'natatorium', enemy: 'N', rounds: [] }).combat,
  hall: attachCombatDefinition({ id: 'hall', enemy: 'H', rounds: [] }).combat,
  practice: attachCombatDefinition({ id: 'practice', enemy: 'P', rounds: [] }).combat,
  chapel: attachCombatDefinition({ id: 'chapel', enemy: 'C', rounds: [] }).combat,
  source: sourceCombatBattle({ bodyReturn: true }).combat,
};
const FULL_BAG = { torch: true, recorder: true, rig: true, fork: true, radio: true, coffee: true };
const COUNTER_FOR = {
  broadcast: COMBAT_ACTION.MONITOR,
  overload: COMBAT_ACTION.HOLD,
  conceal: COMBAT_ACTION.EXPOSE,
  loop: COMBAT_ACTION.INVERT,
  silence: COMBAT_ACTION.EXPOSE,
};

const pick = (state, preferences) => {
  const open = availableCombatActions(state).filter((move) => move.enabled);
  for (const wanted of preferences) {
    const found = open.find((move) => move.id === wanted);
    if (found) return wanted;
  }
  return open[0]?.id || COMBAT_ACTION.WAIT;
};

// One who trusts the card completely, and one who mostly answers but not
// perfectly, so the opponent actually gets beats to act on.
const trusting = (state) => pick(state, [COUNTER_FOR[predictedCombatIntent(state)?.kind], COMBAT_ACTION.EXPOSE, COMBAT_ACTION.HOLD]);
const ordinary = (state) => ((state.cycleIndex % 3 === 0) ? pick(state, [COMBAT_ACTION.HOLD, COMBAT_ACTION.WAIT]) : trusting(state));

function play(definition, difficulty, recordist = ordinary, options = {}) {
  let state = createCombatState(definition, { difficulty, tools: FULL_BAG, battery: 1, ...options });
  const beats = [];
  let guard = 0;
  while (!state.result && guard++ < 240) {
    const misread = state.misread ? { ...state.misread } : null;
    const believed = predictedCombatIntent(state)?.id ?? null;
    const truth = currentCombatIntent(state)?.id ?? null;
    const composure = state.composure;
    const tuned = state.tuneUsedMovement === state.movementIndex;
    const opening = (state.read?.beats || 0) === 0;
    const swung = (() => {
      // `replaceTake` because MONITOR against a full take slot returns a
      // confirmation request WITHOUT spending the beat, and a harness that never
      // confirms spins on it forever. The other combat specs already pass it.
      const next = reduceCombat(state, { type: recordist(state), replaceTake: true });
      state = next;
      if (state.phase !== 'enemy') return false;
      state = advanceEnemy(state);
      return true;
    })();
    // Every beat the opponent COMMITTED, whether or not it got to swing. A
    // perfect counter skips its turn but the player still read a card, so a
    // refused beat is a clean beat between two misreads, not a gap in the
    // record.
    beats.push({ misread, believed, truth, composure, tuned, opening, swung, stance: state.stance?.id });
  }
  return { beats, state };
}

function everyFight(visit) {
  for (const [profile, definition] of Object.entries(PROFILES)) {
    for (const difficulty of Object.values(COMBAT_RULES)) visit({ profile, definition, difficulty });
  }
}

// ── the mood ────────────────────────────────────────────────────────────────

test('being hurt overrides whatever mood it was in, without waiting', () => {
  const context = {
    stance: { id: ENEMY_STANCE.TESTING, dwell: 0 },
    read: emptyEnemyRead(),
    difficulty: COMBAT_RULES.standard,
    seed: 'x',
    board: { coherence: 1, maxCoherence: 6, composure: 8, maxComposure: 8 },
  };
  assert.equal(nextStance(context), ENEMY_STANCE.CORNERED, 'dwell does not hold a cornered opponent in place');
});

test('a mood is held long enough to be read', () => {
  // A score recomputed every beat gives an opponent that twitches. The player
  // has to be able to notice a posture before it changes.
  const context = {
    stance: { id: ENEMY_STANCE.SETTING, dwell: 1 },
    read: { ...emptyEnemyRead(), perfectStreak: 5, takeDwell: 5 },
    difficulty: COMBAT_RULES.standard,
    seed: 'x',
    board: { coherence: 6, maxCoherence: 6, composure: 8, maxComposure: 8 },
  };
  assert.equal(nextStance(context), ENEMY_STANCE.SETTING, 'it finishes its sentence');
  assert.equal(nextStance({ ...context, stance: { id: ENEMY_STANCE.SETTING, dwell: 2 } }), ENEMY_STANCE.MIRRORING);
});

test('answering everything the same way is what makes it start mirroring you', () => {
  const read = [1, 2, 3, 4].reduce((acc) => observePlayerBeat(acc, {
    actionId: COMBAT_ACTION.MONITOR, perfect: true, kind: 'broadcast', takeHeld: false,
  }), emptyEnemyRead());
  assert.deepEqual(favouredAnswers(read), [COMBAT_ACTION.MONITOR]);
  assert.equal(read.perfectStreak, 4);
  assert.equal(nextStance({
    stance: { id: ENEMY_STANCE.TESTING, dwell: 3 },
    read,
    difficulty: COMBAT_RULES.standard,
    seed: 'x',
    board: { coherence: 4, maxCoherence: 6, composure: 8, maxComposure: 8 },
  }), ENEMY_STANCE.MIRRORING);
});

// ── the things choosing must not break ──────────────────────────────────────

test('a guarantee names the take source and the loop the proofs are earned on', () => {
  // These two are what an opponent free to prefer other moves would silently
  // destroy: no broadcast means no takes and therefore no recorder branch at
  // all, and no loop means route.inversion is locked by nothing but a mood.
  const contract = PROFILES.chapel.movements.find((movement) => movement.id === 'contract');
  const ids = guaranteedIds(contract, contract.intents);
  assert.ok(ids.includes('chapel:terms'), 'the recordable broadcast is guaranteed');
  assert.ok(ids.includes('chapel:contract-loop'), 'and so is the loop INVERT proves against');
});

test('every chapel movement can still pay for the ending it gates', () => {
  for (const movement of PROFILES.chapel.movements) {
    for (const variant of ['intents', 'severeIntents', 'deadAirIntents']) {
      const pool = movement[variant];
      if (!pool?.length) continue;
      const ids = guaranteedIds(movement, pool);
      assert.ok(ids.length, `${movement.id}/${variant} guarantees nothing`);
      for (const id of ids) {
        assert.ok(pool.some((intent) => intent.id === id), `${movement.id}/${variant} guarantees a blow it cannot throw`);
      }
    }
  }
});

test('the bench drill is pinned: an opponent with opinions has no place in a lesson', () => {
  assert.equal(PROFILES.training.pinnedCycle, true);
  const { beats } = play(PROFILES.training, COMBAT_RULES['dead-air'], trusting);
  for (const beat of beats) assert.equal(beat.misread, null, 'and it never misleads a student');
});

test('choosing does not outrun the balance the profiles were tuned at', () => {
  // Every number in combat-definitions.js was set against the authored cycle's
  // average damage per beat. A mood is a preference about WHICH kind of blow,
  // and kinds are not damage-neutral — so without a governor, "testing likes
  // broadcasts" silently also means "the fight is easier than it was written".
  // Measured per profile across every difficulty: one short movement holding a
  // single zero-damage blow swings a four-beat sample wildly, and the claim
  // worth making is about the fight, not about one run of one preset.
  for (const [profile, definition] of Object.entries(PROFILES)) {
    if (definition.pinnedCycle) continue;
    // The practice wing has no opponent choosing anything — its intents are the
    // recordist's own repetitions, and there is no mood to govern. It is also
    // the one fight where bracing does not apply (you cannot guard against your
    // own hands), so it ends fast under this harness and the sample goes noisy
    // for exactly the reason the note above describes. The property this guards
    // does not exist in that room.
    if (definition.practice) continue;
    const damageOf = (id) => {
      for (const movement of definition.movements) {
        const intent = movement.intents.find((entry) => entry.id === id);
        if (intent) return intent.damage || 0;
      }
      return 0;
    };
    const raw = (pinned) => {
      let damage = 0;
      let beats = 0;
      for (const difficulty of Object.values(COMBAT_RULES)) {
        for (const beat of play(pinned ? { ...definition, pinnedCycle: true } : definition, difficulty).beats) {
          damage += damageOf(beat.truth);
          beats += 1;
        }
      }
      return beats ? damage / beats : 0;
    };
    const cycle = raw(true);
    if (!cycle) continue;
    const drift = Math.abs(raw(false) - cycle) / cycle;
    assert.ok(drift < 0.20, `${profile} drifted ${(drift * 100).toFixed(0)}% off the authored pace`);
  }
});

// ── the misread ─────────────────────────────────────────────────────────────

test('a wrong read is never where it would be cruel, and never twice running', () => {
  // Driven by a recordist who believes the card completely — the worst case for
  // every one of these guarantees.
  let wrong = 0;
  everyFight(({ profile, definition, difficulty }) => {
    let previous = false;
    for (const beat of play(definition, difficulty, trusting).beats) {
      const missed = !!beat.misread && beat.misread.id !== beat.truth;
      if (!missed) { previous = false; continue; }
      wrong += 1;
      assert.ok(!previous, `${profile}/${difficulty.id} misread twice running`);
      assert.ok(!beat.opening, `${profile}/${difficulty.id} misread a movement's opening beat`);
      assert.ok(!beat.tuned, `${profile}/${difficulty.id} misread after the fork was spent`);
      assert.ok(beat.composure > 2, `${profile}/${difficulty.id} misread at critical composure`);
      previous = true;
    }
  });
  assert.ok(wrong > 0, 'the read can be wrong at all');
});

test('a wrong read is a moment, not the weather', () => {
  // Rate has to be measured over beats the opponent COMMITTED, not over beats
  // it got to swing on. A player who trusts the card only ever reaches an enemy
  // beat when their counter failed — which is very often the beat they were
  // misled on — so counting there reports the selection, not the rate.
  const seen = {};
  const missed = {};
  everyFight(({ definition, difficulty }) => {
    if (definition.pinnedCycle) return;
    let state = createCombatState(definition, { difficulty, tools: FULL_BAG, battery: 1 });
    let guard = 0;
    let last = null;
    while (!state.result && guard++ < 240) {
      const key = state.committed ? `${state.movementIndex}:${state.committed.index}:${state.committed.id}` : null;
      if (key && key !== last) {
        seen[difficulty.id] = (seen[difficulty.id] || 0) + 1;
        if (state.misread) missed[difficulty.id] = (missed[difficulty.id] || 0) + 1;
        last = key;
      }
      state = reduceCombat(state, { type: ordinary(state) });
      if (state.phase === 'enemy') state = advanceEnemy(state);
    }
  });
  const rate = (id) => (missed[id] || 0) / Math.max(1, seen[id] || 0);
  assert.equal(rate('guided'), 0, 'guided is never misled');
  assert.ok(rate('standard') < 0.2, `standard misreads ${(rate('standard') * 100).toFixed(0)}% of committed beats`);
  assert.ok(rate('dead-air') < 0.35, `dead air misreads ${(rate('dead-air') * 100).toFixed(0)}% of committed beats`);
  const shown = Object.fromEntries(['guided', 'standard', 'severe', 'dead-air'].map((id) => [id, `${(rate(id) * 100).toFixed(0)}%`]));
  assert.ok(rate('severe') > 0 || rate('dead-air') > 0, `the meaner presets do mislead you (${JSON.stringify(shown)})`);
});

test('guided never misreads, because that is the hazard guided opts out of', () => {
  for (const definition of Object.values(PROFILES)) {
    for (const beat of play(definition, COMBAT_RULES.guided, trusting).beats) {
      assert.equal(beat.misread, null);
    }
  }
});

test('the opponent still throws exactly what it committed to, misread or not', () => {
  // The misread moves the READ. It must never move the fight: a feint the
  // engine also believes is not a feint, it is a bug.
  everyFight(({ profile, definition, difficulty }) => {
    let state = createCombatState(definition, { difficulty, tools: FULL_BAG, battery: 1 });
    let guard = 0;
    while (!state.result && guard++ < 240) {
      const committed = state.committed?.id ?? null;
      state = reduceCombat(state, { type: trusting(state) });
      if (state.phase !== 'enemy') continue;
      state = advanceEnemy(state);
      const landed = state.last.enemyHits?.[0]?.intentId ?? null;
      assert.equal(landed, committed, `${profile}/${difficulty.id} threw something other than its commitment`);
    }
  });
});

test('the fork buys a true read for the rest of the movement', () => {
  const chapel = PROFILES.chapel;
  let state = createCombatState(chapel, { difficulty: COMBAT_RULES['dead-air'], tools: FULL_BAG, battery: 1 });
  state.misread = { id: chapel.movements[0].intents[1].id, index: state.intentIndex };
  state = reduceCombat(state, { type: COMBAT_ACTION.TUNE });
  assert.equal(state.misread, null, 'TUNE clears a read already gone wrong');
  assert.match(state.last.notice, /READ HOLDS/);
});

// ── what it remembers of the night ──────────────────────────────────────────

test('the read is a handful of counts, not a recording of the player', () => {
  const read = [COMBAT_ACTION.MONITOR, COMBAT_ACTION.MONITOR, COMBAT_ACTION.EXPOSE]
    .reduce((acc, actionId) => observePlayerBeat(acc, { actionId, perfect: actionId === COMBAT_ACTION.MONITOR, kind: 'broadcast', takeHeld: false }), emptyEnemyRead());
  const carried = carriedRead(read);
  assert.deepEqual(Object.keys(carried).sort(), ['answers', 'landed'], 'nothing else leaves the fight');
  assert.deepEqual(carried.answers, { [COMBAT_ACTION.MONITOR]: 2, [COMBAT_ACTION.EXPOSE]: 1 });
  assert.deepEqual(carried.landed, { [COMBAT_ACTION.MONITOR]: 2 });
});

test('the night accumulates, and a junk save does not poison it', () => {
  const merged = mergeCarriedRead({ answers: { monitor: 3 } }, { answers: { monitor: 2, expose: 1 } });
  assert.deepEqual(merged.answers, { monitor: 5, expose: 1 });
  assert.deepEqual(readFromCarried(null), emptyEnemyRead(), 'an older save simply starts it knowing nothing');
  assert.deepEqual(readFromCarried({ answers: { monitor: 'lots', bad: -4 } }).answers, {});
  assert.equal(readFromCarried({ answers: { monitor: 1e9 } }).answers.monitor, 99, 'counts are bounded');
});

test('the chapel can open already knowing you', () => {
  const listener = (state) => pick(state, [COMBAT_ACTION.MONITOR, COMBAT_ACTION.PLAYBACK, COMBAT_ACTION.HOLD]);
  let carried = null;
  for (const room of ['natatorium', 'hall', 'practice']) {
    const { state } = play(PROFILES[room], COMBAT_RULES.standard, listener, { carriedRead: carried });
    carried = mergeCarriedRead(carried, combatResult(state)?.enemyRead ?? carriedRead(state.read));
  }
  assert.ok(carried.answers[COMBAT_ACTION.MONITOR] > 0, 'three rooms of listening is a fact about this recordist');

  const cold = createCombatState(PROFILES.chapel, { difficulty: COMBAT_RULES.standard, tools: FULL_BAG });
  const warm = createCombatState(PROFILES.chapel, { difficulty: COMBAT_RULES.standard, tools: FULL_BAG, carriedRead: carried });
  assert.deepEqual(cold.read.answers, {}, 'a cold chapel knows nothing');
  assert.deepEqual(warm.read.answers, carried.answers, 'a warm one has been listening all night');
  assert.deepEqual(favouredAnswers(warm.read)[0], COMBAT_ACTION.MONITOR, 'and it knows you only ever listen');
});

test('a finished fight reports what it learned', () => {
  const { state } = play(PROFILES.natatorium, COMBAT_RULES.standard, trusting);
  const result = combatResult(state);
  if (!result) return;                       // a stalemate reports nothing, which is fine
  assert.ok(result.enemyRead, 'the result carries the read out to the run');
  assert.deepEqual(Object.keys(result.enemyRead).sort(), ['answers', 'landed']);
});

test('the night is replayable: the same play gives the same fight', () => {
  everyFight(({ profile, definition, difficulty }) => {
    const first = play(definition, difficulty, trusting).beats;
    const again = play(definition, difficulty, trusting).beats;
    assert.deepEqual(again, first, `${profile}/${difficulty.id} did not replay`);
  });
});
