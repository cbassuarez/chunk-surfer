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
    if (state.phase !== 'enemy') {
      // A REFUSED beat is still a beat the opponent offered. A perfect counter
      // skips the enemy turn, so the blow never lands — but against a broadcast
      // the counter IS the capture, and a record that only sees blows that
      // landed cannot tell a starved recordist from a well-fed one. Recorded
      // with `thrown` set to what it committed to, because that is what the
      // player answered.
      if (state.last?.perfect && committed) {
        beats.push({ movementIndex, intentIndex, cycle, shown, committed, thrown: committed, refused: true });
      }
      continue;
    }
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

test('the opponent throws the blow it showed, in every fight there is', () => {
  let beats = 0;
  const lies = [];
  everyFight(({ profile, definition, difficulty, style, recordist, seedTake }) => {
    for (const beat of play(definition, difficulty, recordist, { seedTake }).beats) {
      beats += 1;
      if (beat.shown !== beat.thrown) {
        lies.push(`${profile}/${difficulty.id}/${style} m${beat.movementIndex}: showed ${beat.shown}, threw ${beat.thrown}`);
      }
    }
  });
  assert.ok(beats > 5000, `expected a broad sweep, only played ${beats} beats`);
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

test('the player is never starved of something to record', () => {
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

test('a full bag always has an answer; a worn one is leaned on hardest by the meanest preset', () => {
  // Two different claims, because the economy changed what "answerable" means.
  //
  // With every tool in the bag nothing is ever unanswerable: PARRY meets any
  // struck blow, EXPOSE costs nothing now so a conceal always has a reply, and
  // the one intent in the game with no counter at all deals no damage.
  //
  // With the bag worn down to a recorder, a conceal genuinely has no perfect
  // answer — losing the torch is supposed to cost something. What must still
  // hold there is that the gentlest preset leans on you least. Whether such a
  // fight is winnable at all is a separate contract, and combat-state's floor
  // test is where that one lives.
  const WORN = { torch: false, recorder: true, rig: false, fork: false, radio: false, coffee: false };
  const count = (tools, battery) => {
    const uncounterable = { guided: 0, standard: 0, severe: 0, 'dead-air': 0 };
    everyFight(({ definition, difficulty, recordist }) => {
      let state = createCombatState(definition, { difficulty, tools, battery });
      let guard = 0;
      while (!state.result && guard++ < 200) {
        const facing = currentCombatIntent(state);
        const open = availableCombatActions(state).filter((move) => move.enabled);
        const answerable = (facing?.damage || 0) === 0
          || open.some((move) => move.countersKinds.includes(facing?.kind))
          || actionCounterKinds(COMBAT_ACTION.PARRY).includes(facing?.kind);
        state = reduceCombat(state, { type: recordist(state) });
        if (state.phase !== 'enemy') continue;
        if (!answerable) uncounterable[difficulty.id] += 1;
        state = advanceEnemy(state);
      }
    });
    return uncounterable;
  };

  assert.deepEqual(count(FULL_BAG, 1), { guided: 0, standard: 0, severe: 0, 'dead-air': 0 }, 'a full bag answers everything');
  const worn = count(WORN, 0);
  assert.ok(worn['dead-air'] > 0, `a worn bag does get cornered (${JSON.stringify(worn)})`);
  assert.ok(worn.guided < worn['dead-air'], `and guided leans on it least (${JSON.stringify(worn)})`);
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
