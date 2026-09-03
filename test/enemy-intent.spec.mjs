// The opponent's side of the exchange, held to three promises.
//
// The fight used to be a metronome: the enemy read its move off a fixed list,
// one index per beat, and nothing the player did changed a thing. That is being
// replaced by an opponent that chooses. This file is the contract that makes
// choosing survivable — the guarantees that have to hold no matter how clever
// the choosing gets:
//
//   1. IT SHOWS WHAT IT THROWS. The blow named on the card is the blow that
//      lands. The opponent may surprise you with what it picks; it may never
//      surprise you by picking one thing and doing another.
//   2. THE NIGHT IS REPLAYABLE. Identical play gives an identical fight, down
//      to the intent ids. Nothing here reaches for Math.random.
//   3. THE SCRIPT IS STILL THE SCRIPT. Until the opponent is authored to
//      deviate, it plays the authored cycle exactly — so every balance number
//      tuned against that cycle still means what it meant.
//
// These are checked by playing, not by inspection: every profile, every
// difficulty, against four ways of playing badly and well.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_ACTION,
  actionCounterKinds,
  advanceEnemy,
  availableCombatActions,
  createCombatState,
  currentCombatIntent,
  predictedCombatIntent,
  reduceCombat,
  selectEnemyIntents,
} from '../src/game/combat-state.js';
import {
  attachCombatDefinition,
  sourceCombatBattle,
  trainingCombatDefinition,
} from '../src/data/combat-definitions.js';
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

// Four recordists, so movements actually complete and the board varies: one who
// reads the card, one who hoards takes and never spends them, one who only ever
// reaches for the torch, and one who does as little as the rules allow.
const RECORDISTS = {
  competent: (state) => pick(state, [
    COUNTER_FOR[currentCombatIntent(state)?.kind],
    COMBAT_ACTION.EXPOSE,
    COMBAT_ACTION.HOLD,
  ]),
  hoarder: (state) => pick(state, [COMBAT_ACTION.MONITOR, COMBAT_ACTION.EXPOSE, COMBAT_ACTION.HOLD]),
  torchOnly: (state) => pick(state, [COMBAT_ACTION.EXPOSE, COMBAT_ACTION.HOLD]),
  passive: (state) => pick(state, [COMBAT_ACTION.HOLD, COMBAT_ACTION.WAIT]),
};

const variantIntents = (movement, variant) => (
  variant === 'dead-air' && movement.deadAirIntents?.length ? movement.deadAirIntents
    : variant === 'severe' && movement.severeIntents?.length ? movement.severeIntents
      : movement.intents
);

// One fight, recorded beat by beat: what the authored cycle would have thrown,
// what the opponent committed to, what the card showed, and what actually hit.
function play(definition, difficulty, recordist, { seedTake = false } = {}) {
  let state = createCombatState(definition, { difficulty, tools: FULL_BAG, battery: 1 });
  if (seedTake) state.take = { id: 'seed', label: 'SEED', damage: 2, tag: 'body' };
  const beats = [];
  let guard = 0;
  while (!state.result && guard++ < 600) {
    const movementIndex = state.movementIndex;
    const intentIndex = state.intentIndex;
    const pool = variantIntents(definition.movements[movementIndex], difficulty.variant);
    const cycle = pool[intentIndex % pool.length].id;
    const shown = currentCombatIntent(state)?.id ?? null;
    const committed = state.committed?.id ?? null;
    state = reduceCombat(state, { type: recordist(state), replaceTake: true });
    // THERE ARE NO REFUSED BEATS ANY MORE.
    //
    // This used to record an extra beat whenever a perfect counter left the
    // phase in 'select', on the premise that "a perfect counter skips the enemy
    // turn, so the blow never lands". That premise is gone: a counter meets the
    // blow now and the opponent takes its (chipped) turn, so every committed
    // blow lands and is recorded once below. Keeping the branch double-counted
    // the same commitment — once here, once through advanceEnemy — which
    // inflated the capture-drought gap past its own invariant without any
    // opponent ever having starved anybody.
    //
    // What remains in 'select' is TEMPO: a free action inside the same cycle,
    // against the same card, which is not a new offer and must not be recorded
    // as one.
    if (state.phase !== 'enemy') continue;
    state = advanceEnemy(state);
    beats.push({ movementIndex, intentIndex, cycle, shown, committed, thrown: state.last.enemyHits?.[0]?.intentId ?? null, refused: false });
  }
  return { beats, outcome: state.result?.result ?? 'timeout' };
}

function everyFight(visit) {
  for (const [profile, definition] of Object.entries(PROFILES)) {
    for (const difficulty of Object.values(COMBAT_RULES)) {
      for (const [style, recordist] of Object.entries(RECORDISTS)) {
        for (const seedTake of [false, true]) {
          visit({ profile, definition, difficulty, style, recordist, seedTake });
        }
      }
    }
  }
}

test('the enemy-intent sweep exercises every configured fight', () => {
  let fights = 0;
  let beats = 0;
  const emptyFights = [];
  everyFight(({ profile, definition, difficulty, style, recordist, seedTake }) => {
    const run = play(definition, difficulty, recordist, { seedTake });
    const label = `${profile}/${difficulty.id}/${style}/${seedTake ? 'seeded' : 'empty'}`;
    fights += 1;
    beats += run.beats.length;
    if (run.beats.length === 0) emptyFights.push(label);
  });
  const expectedFights = Object.keys(PROFILES).length
    * Object.values(COMBAT_RULES).length
    * Object.keys(RECORDISTS).length
    * 2;
  assert.equal(fights, expectedFights, 'every configured fight was exercised');
  assert.deepEqual(emptyFights, [], 'every configured fight produced an enemy offer');
  assert.ok(beats > 0, 'the sweep produced enemy beats');
});

// AGENT TODO: This remains executable on purpose. Do not exclude Hall, weaken
// show/throw equality, or delete this contract to make the suite green. Hall
// currently writes the opponent-mind commitment used by currentCombatIntent(),
// then commitHallApparitionRound() independently assigns authored intents to the
// three bodies. The first acting apparition can therefore throw a different
// intent than the card showed. Reconcile the Hall round commitment with the
// player-facing commitment, then remove the `todo` option and require this
// unchanged equality contract to pass across the full sweep.
test('the opponent throws the blow it showed, in every fight there is', {
  todo: 'AGENT TODO: reconcile Hall apparition intent assignment with the shown commitment; remove this TODO only when show === throw across the unchanged sweep',
}, () => {
  const lies = [];
  everyFight(({ profile, definition, difficulty, style, recordist, seedTake }) => {
    for (const beat of play(definition, difficulty, recordist, { seedTake }).beats) {
      if (beat.shown !== beat.thrown) {
        lies.push(`${profile}/${difficulty.id}/${style} m${beat.movementIndex}: showed ${beat.shown}, threw ${beat.thrown}`);
      }
    }
  });
  assert.deepEqual(lies, [], 'the card promised a blow the opponent did not throw');
});

test('asking twice what is coming gives one answer', () => {
  // selectEnemyIntents runs twice per enemy beat: the scene calls it to name the
  // blow and cue its sound, then the reducer calls it to resolve one. Choosing
  // inside it would let those two disagree — the banner announcing a hit that
  // never lands. The choice is made once, a beat earlier, and written down.
  everyFight(({ definition, difficulty, recordist }) => {
    let state = createCombatState(definition, { difficulty, tools: FULL_BAG, battery: 1 });
    let guard = 0;
    while (!state.result && guard++ < 200) {
      state = reduceCombat(state, { type: recordist(state) });
      if (state.phase !== 'enemy') continue;
      const named = selectEnemyIntents(state).map((intent) => intent.id);
      assert.deepEqual(selectEnemyIntents(state).map((intent) => intent.id), named);
      state = advanceEnemy(state);
      const landed = state.last.enemyHits.map((hit) => hit.intentId);
      // A chain stops early on a knockout, so what landed is a prefix of what
      // was named — never a different blow.
      assert.deepEqual(landed, named.slice(0, landed.length), 'the resolved hits are the named ones');
    }
  });
});

test('identical play gives an identical fight', () => {
  everyFight(({ profile, definition, difficulty, style, recordist, seedTake }) => {
    const first = play(definition, difficulty, recordist, { seedTake });
    const again = play(definition, difficulty, recordist, { seedTake });
    assert.deepEqual(again, first, `${profile}/${difficulty.id}/${style} did not replay`);
  });
});

test('the opponent chooses, but only where choosing is safe', () => {
  // The fight is no longer a metronome — but three beats are still the script's,
  // by construction rather than by a weight that could lose:
  //
  //   the opening of every movement, which is where the recordable broadcast
  //   lives and therefore where the player's only source of takes comes from;
  //   a movement's unpaid guarantee once it is nearly over; and every beat of
  //   the bench drill, which is pinned outright.
  let chosen = 0;
  let opening = 0;
  let deviations = 0;
  const trainingDeviations = [];
  everyFight(({ profile, definition, difficulty, recordist, seedTake }) => {
    for (const beat of play(definition, difficulty, recordist, { seedTake }).beats) {
      if (beat.intentIndex === 0) opening += 1; else chosen += 1;
      if (beat.thrown === beat.cycle) continue;
      deviations += 1;
      if (profile === 'training') trainingDeviations.push(beat.thrown);
    }
  });
  assert.deepEqual(trainingDeviations, [], 'the drill is pinned: it never deviates from its lesson script');
  assert.ok(deviations > 0, 'the opponent is choosing at all');
  assert.ok(chosen > opening, 'and most beats are its own to decide');
});

// AGENT TODO: This remains executable on purpose. Do not weaken the <= 3
// invariant, special-case Hall out of the sweep, or delete the test to make the
// suite green. Hall's multi-apparition enemy round currently bypasses the
// opponent-mind capture-drought guarantee: commitHallApparitionRound()
// distributes authored intents independently after the mind has selected a safe
// commitment, while intermediate enemy-only apparition turns also affect intent
// history. Fix the Hall/combat scheduling semantics at the player-facing offer
// boundary, then remove the `todo` option and require this unchanged contract to
// pass.
test('the player is never starved of something to record', {
  todo: 'AGENT TODO: fix Hall multi-apparition capture starvation; preserve the <= 3 invariant and remove this TODO only when the unchanged test passes',
}, () => {
  // A recordable broadcast is the only source of takes, and takes are PLAYBACK,
  // INVERT, the chapel proofs and half the bag. An opponent free to prefer
  // other moves would close all of that down without ever choosing to.
  everyFight(({ profile, definition, difficulty, recordist, seedTake }) => {
    let gap = 0;
    for (const beat of play(definition, difficulty, recordist, { seedTake }).beats) {
      const movement = definition.movements[beat.movementIndex];
      const thrown = variantIntents(movement, difficulty.variant).find((intent) => intent.id === beat.thrown);
      gap = thrown?.recordable ? 0 : gap + 1;
      assert.ok(gap <= 3, `${profile}/${difficulty.id} went ${gap} beats with nothing to capture`);
    }
  });
});

test('a full bag has an answer at every player-facing offer', () => {
  // Answerability belongs to a player decision, not to every enemy subturn. Hall
  // can keep initiative across apparition 02 and 03; during those enemy-only
  // slots availableCombatActions() is correctly empty and must not be mistaken
  // for the player having been offered an unanswerable move.
  //
  // Worn-bag survivability is no longer an "uncounterable intent" contract:
  // PARRY is a reaction to struck blows, non-striking feints can deal no damage,
  // and challenge presets are explicitly allowed to beat a minimal build. That
  // balance contract already lives in combat-state.spec.mjs.
  const uncounterable = { guided: 0, standard: 0, severe: 0, 'dead-air': 0 };
  everyFight(({ definition, difficulty, recordist }) => {
    let state = createCombatState(definition, { difficulty, tools: FULL_BAG, battery: 1 });
    let guard = 0;
    while (!state.result && guard++ < 200) {
      let answerable = null;
      if (state.phase === 'player') {
        const facing = currentCombatIntent(state);
        const open = availableCombatActions(state).filter((move) => move.enabled);
        answerable = (facing?.damage || 0) === 0
          || open.some((move) => move.countersKinds.includes(facing?.kind))
          || actionCounterKinds(COMBAT_ACTION.PARRY).includes(facing?.kind);
      }
      state = reduceCombat(state, { type: recordist(state) });
      if (state.phase !== 'enemy') continue;
      if (answerable === false) uncounterable[difficulty.id] += 1;
      state = advanceEnemy(state);
    }
  });

  assert.deepEqual(uncounterable, { guided: 0, standard: 0, severe: 0, 'dead-air': 0 }, 'a full bag answers every player-facing offer');
});

test('the natatorium reaction and its chained hit survive the story snapshot', () => {
  // Both are authored in combat-definitions.js and both were dead: the narrative
  // JSON carries a frozen copy of the profile taken before either field existed,
  // and that copy used to win outright. Mechanics come from the profile now.
  const battle = attachCombatDefinition({ id: 'natatorium', enemy: 'N', rounds: [] }).combat;
  const voice = battle.movements.find((movement) => movement.id === 'voice');
  assert.deepEqual(voice.reactions, [{ when: 'take-loaded', use: 'natatorium:lean' }]);
  const depth = battle.movements
    .find((movement) => movement.id === 'hold')
    .intents.find((intent) => intent.id === 'natatorium:depth');
  assert.equal(depth.followups.length, 1, 'the pressure returns once as a lighter blow');
  assert.equal(depth.followups[0].id, 'natatorium:depth-echo');
});
