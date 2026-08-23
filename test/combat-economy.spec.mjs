// Regulars and specials, and the promise that separates them.
//
// The fight used to gate every damage source on something that ran out. The
// torch billed a battery that exploration drains by the second; playback needed
// a take the opponent had to offer first; the three loud moves shared a single
// use per encounter, so three pins into three specials bought one firing. A
// player could arrive at the chapel genuinely unable to fight.
//
// That produced a false baseline. Encounters had to be balanced for a bag that
// might be empty, so a full bag walked through them, and a tester with two
// moves left reported a difficulty nobody would ever actually meet. The split
// below is the fix, and these are its terms:
//
//   REGULARS  cost nothing, ever, and are the floor the enemy is tuned against.
//   SPECIALS  cost charge, and charge is paid out for reading the opponent.
//   PINS      buy the regulars and the body flat, and the specials through the
//             tool they belong to.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTION_BAND,
  BASE_MAX_CHARGE,
  CHARGE_COST,
  COMBAT_ACTION,
  TECHNIQUE,
  advanceEnemy,
  availableCombatActions,
  combatMoveSubtext,
  combatResult,
  createCombatState,
  currentCombatIntent,
  predictedCombatIntent,
  reduceCombat,
} from '../src/game/combat-state.js';
import { TECHNIQUE_DEFS } from '../src/game/combat-progression.js';
import { attachCombatDefinition, authoredCombatProfile, sourceCombatBattle } from '../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import {
  EARNED,
  GRID,
  HIT_QUALITY,
  bandFrom,
  makeBand,
  resolveHit,
} from '../src/game/combat-damage.js';

const PROFILES = {
  natatorium: attachCombatDefinition({ id: 'natatorium', enemy: 'N', rounds: [] }).combat,
  hall: attachCombatDefinition({ id: 'hall', enemy: 'H', rounds: [] }).combat,
  practice: attachCombatDefinition({ id: 'practice', enemy: 'P', rounds: [] }).combat,
  chapel: attachCombatDefinition({ id: 'chapel', enemy: 'C', rounds: [] }).combat,
  source: sourceCombatBattle({ bodyReturn: true }).combat,
};
const FULL_BAG = { torch: true, recorder: true, rig: true, fork: true, radio: true, coffee: true };
const REGULARS = [COMBAT_ACTION.EXPOSE, COMBAT_ACTION.MONITOR, COMBAT_ACTION.HOLD, COMBAT_ACTION.WAIT];
const SPECIALS = Object.keys(CHARGE_COST);

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
// Reads the card, not the engine — a player only ever sees the prediction.
const competent = (state) => pick(state, [
  COUNTER_FOR[predictedCombatIntent(state)?.kind],
  COMBAT_ACTION.PLAYBACK, COMBAT_ACTION.EXPOSE, COMBAT_ACTION.MONITOR, COMBAT_ACTION.HOLD,
]);

function playOut(definition, options, policy = competent) {
  let state = createCombatState(definition, { tools: FULL_BAG, ...options });
  let guard = 0;
  while (!state.result && guard++ < 300) {
    state = reduceCombat(state, { type: policy(state), replaceTake: true });
    if (state.phase === 'enemy') state = advanceEnemy(state);
  }
  return state;
}

// ── the regulars never run out ──────────────────────────────────────────────

test('no regular is ever unavailable for want of a resource', () => {
  // The whole point. Whatever the bag has been through, the moves it always had
  // are still there.
  for (const [name, definition] of Object.entries(PROFILES)) {
    for (const difficulty of Object.values(COMBAT_RULES)) {
      const state = playOut(definition, { difficulty, battery: 0 });
      const open = availableCombatActions(state.result ? createCombatState(definition, { tools: FULL_BAG, difficulty, battery: 0 }) : state);
      for (const id of REGULARS) {
        const move = open.find((entry) => entry.id === id);
        if (!move) continue;
        assert.notEqual(move.reason, 'BATTERY FLAT', `${name}: ${id} was billed to the battery`);
        assert.ok(!/CHARGE/.test(move.reason || ''), `${name}: ${id} was billed to charge`);
      }
    }
  }
});

test('a flat battery costs light and loudness, never the ability to fight', () => {
  const flat = createCombatState(PROFILES.chapel, { tools: FULL_BAG, battery: 0, techniques: [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT] });
  flat.charge = flat.maxCharge;
  const open = availableCombatActions(flat);
  assert.equal(open.find((m) => m.id === COMBAT_ACTION.EXPOSE).enabled, true, 'the torch still points');
  assert.equal(open.find((m) => m.id === COMBAT_ACTION.WHITEOUT).reason, 'BATTERY FLAT', 'it just cannot be burnt out');
});

test('every regular that deals damage keeps dealing it all fight', () => {
  // A beat where nothing in the bag can touch the opponent is the state that
  // forced the old soft tuning. It should now be unreachable with any tool.
  for (const [name, definition] of Object.entries(PROFILES)) {
    let state = createCombatState(definition, { tools: FULL_BAG, battery: 0 });
    for (let guard = 0; !state.result && guard < 120; guard += 1) {
      const open = availableCombatActions(state).filter((move) => move.enabled);
      assert.ok(open.some((move) => (move.damage || 0) > 0), `${name} reached a beat with no way to deal damage`);
      state = reduceCombat(state, { type: competent(state), replaceTake: true });
      if (state.phase === 'enemy') state = advanceEnemy(state);
    }
  }
});

// ── the specials cost, and are earned ───────────────────────────────────────

test('every special is priced in charge and nothing else limits it', () => {
  for (const id of SPECIALS) {
    assert.ok(CHARGE_COST[id] > 0, `${id} has a price`);
  }
  // The old shared lock is gone: there is no per-encounter counter left to trip.
  const state = createCombatState(PROFILES.hall, {
    tools: FULL_BAG,
    battery: 1,
    techniques: [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT],
  });
  assert.equal(state.finisherUsed, undefined);
  assert.equal(state.whiteoutUsed, undefined);
  assert.equal(state.radioUsed, undefined);
});

test('charge is paid out for reading the opponent, and for meeting the blow', () => {
  const state = createCombatState(PROFILES.natatorium, { tools: FULL_BAG });
  assert.equal(state.charge, 1, 'the cheapest special is affordable from the first beat');

  const read = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.equal(read.last.perfect, true);
  assert.equal(read.charge, 2, 'a perfect counter pays');

  // And the parry — the one timed input in the fight, and the one skill in it
  // that used to buy the player nothing at all.
  let swung = createCombatState(PROFILES.natatorium, { tools: FULL_BAG });
  swung.charge = 0;
  swung = advanceEnemy(reduceCombat(swung, { type: COMBAT_ACTION.WAIT }));
  const parried = reduceCombat(swung, { type: COMBAT_ACTION.PARRY });
  assert.equal(parried.charge, 1, 'a landed parry pays too');
  assert.match(parried.last.notice, /\+1 CHARGE/);
});

test('a special can be fired more than once in an encounter, if it is earned', () => {
  let state = createCombatState(PROFILES.hall, {
    tools: FULL_BAG, battery: 1,
    techniques: [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT, TECHNIQUE.HEADROOM],
  });
  assert.equal(state.maxCharge, BASE_MAX_CHARGE + 2, 'HEADROOM is the ceiling, bought flat');
  let fired = 0;
  for (let guard = 0; guard < 12 && !state.result; guard += 1) {
    const open = availableCombatActions(state).filter((move) => move.enabled).map((move) => move.id);
    if (open.includes(COMBAT_ACTION.WHITEOUT)) { fired += 1; state = reduceCombat(state, { type: COMBAT_ACTION.WHITEOUT }); }
    else state = reduceCombat(state, { type: competent(state), replaceTake: true });
    if (state.phase === 'enemy') state = advanceEnemy(state);
    state.charge = state.maxCharge;   // stand in for a fight's worth of good reads
  }
  assert.ok(fired >= 2, `a special fired ${fired} times — it is a rhythm, not a one-shot`);
});

// ── what the pins buy ───────────────────────────────────────────────────────

test('pins reach the regulars, the specials, and the body', () => {
  const regulars = [TECHNIQUE.AFTERIMAGE, TECHNIQUE.PUNCH_IN, TECHNIQUE.BRACE];
  const body = [TECHNIQUE.DEEP_RESERVE, TECHNIQUE.STEADY_NERVE, TECHNIQUE.HEADROOM];
  for (const id of [...regulars, ...body]) {
    const def = TECHNIQUE_DEFS.find((entry) => entry.id === id);
    assert.ok(def, `${id} is in the tree`);
    assert.equal(def.track, 'flat', `${id} is bought flat, in any order`);
  }

  const base = createCombatState(PROFILES.natatorium, { tools: FULL_BAG });
  // A regular, sharpened.
  const sharper = createCombatState(PROFILES.natatorium, { tools: FULL_BAG, techniques: [TECHNIQUE.PUNCH_IN] });
  const plainChip = base.movementCoherence - reduceCombat(base, { type: COMBAT_ACTION.MONITOR }).movementCoherence;
  const pinnedChip = sharper.movementCoherence - reduceCombat(sharper, { type: COMBAT_ACTION.MONITOR }).movementCoherence;
  assert.ok(pinnedChip > plainChip, 'PUNCH IN makes a regular better');

  // The body.
  const tougher = createCombatState(PROFILES.natatorium, { tools: FULL_BAG, techniques: [TECHNIQUE.DEEP_RESERVE] });
  assert.equal(tougher.maxComposure, base.maxComposure + 2 * GRID, 'DEEP RESERVE is health, bought with a pin');

  // A guard that grinds.
  const braced = createCombatState(PROFILES.natatorium, { tools: FULL_BAG, techniques: [TECHNIQUE.BRACE] });
  const guard = (state) => availableCombatActions(state).find((move) => move.id === COMBAT_ACTION.HOLD).prevents;
  assert.equal(guard(braced), guard(base) + GRID, 'BRACE is worth a point of guard, every time');
});

// ── the balance the split was for ───────────────────────────────────────────

test('the heavy blows sit above a guard, so a bad read costs something', () => {
  // A braced recordist prevents 2–3. When every authored blow also dealt 2–3,
  // a competent player finished every encounter untouched and the difficulty
  // presets were decorative. The heavy kinds are above the guard now.
  for (const [name, id] of [['natatorium', 'natatorium'], ['hall', 'hall'], ['practice', 'practice'], ['chapel', 'chapel']]) {
    const profile = authoredCombatProfile(id);
    const heavy = profile.movements.flatMap((movement) => movement.intents)
      .filter((intent) => intent.kind === 'overload' || intent.kind === 'loop');
    assert.ok(heavy.length, `${name} has heavy blows`);
    assert.ok(heavy.some((intent) => intent.damage >= 4), `${name}'s heavy blows can outweigh a guard`);
  }
});

test('difficulty costs a competent recordist something, and more of it as it climbs', () => {
  const cost = (difficulty) => {
    let taken = 0;
    let max = 0;
    for (const definition of Object.values(PROFILES)) {
      const state = playOut(definition, { difficulty, battery: 1 });
      taken += combatResult(state)?.damageTaken ?? state.damageTaken;
      max += state.maxComposure;
    }
    return taken / max;
  };
  const guided = cost(COMBAT_RULES.guided);
  const standard = cost(COMBAT_RULES.standard);
  const deadAir = cost(COMBAT_RULES['dead-air']);
  assert.equal(guided, 0, 'guided is the safe read, and stays safe');
  assert.ok(standard > 0, `standard costs a competent player something (${(standard * 100).toFixed(0)}%)`);
  assert.ok(deadAir > standard, `and dead air costs more (${(deadAir * 100).toFixed(0)}% vs ${(standard * 100).toFixed(0)}%)`);
});


// ── damage is a band, and the band is earned ────────────────────────────────
//
// The point of the overhaul: an attack used to be one integer, so landing a hit
// told the player nothing about how well they had played the beat. It is a RANGE
// now, and where inside the range it lands is bought with the fight's own
// skills. These are the promises that makes.

test('a hit is a range, and reading the beat right buys the top of it', () => {
  const band = makeBand(10, 20);
  // Nothing earned: the whole band is reachable, graze included.
  const cold = [0, .25, .5, .75, 1].map((draw) => resolveHit(band, { earned: 0, draw }));
  assert.equal(cold[0].value, band.min, 'an unearned hit can land on the floor');
  assert.equal(cold.at(-1).value, band.max, 'and can still land on the ceiling');
  assert.ok(cold.some((hit) => hit.quality === HIT_QUALITY.GRAZE), 'a cold beat can graze');

  // Earned: the floor rises, and the bad end of the band stops being reachable.
  const read = EARNED.PERFECT_COUNTER + EARNED.STANCE_ALIGNED;
  const warm = [0, .25, .5, .75, 1].map((draw) => resolveHit(band, { earned: read, draw }));
  assert.ok(warm.every((hit) => hit.quality !== HIT_QUALITY.GRAZE), 'a read beat can no longer graze');
  assert.ok(warm[0].value > cold[0].value, 'the floor moved up');
  assert.ok(
    warm.every((hit, i) => hit.value >= cold[i].value),
    'and every draw is at least as good as the cold one',
  );

  // Everything right: the top of the band, whatever the draw does.
  const perfect = resolveHit(band, {
    earned: EARNED.PERFECT_COUNTER + EARNED.STANCE_ALIGNED + EARNED.TUNE_HELD + EARNED.SETUP,
    draw: 0,
  });
  assert.equal(perfect.quality, HIT_QUALITY.CRITICAL, 'doing everything right is a critical on the worst draw');
});

test('the draw is deterministic: the same night replays the same damage', () => {
  const run = () => {
    let state = createCombatState(PROFILES.natatorium, { tools: FULL_BAG, battery: 1, seed: 7 });
    const log = [];
    for (const action of [COMBAT_ACTION.MONITOR, COMBAT_ACTION.PLAYBACK, COMBAT_ACTION.EXPOSE, COMBAT_ACTION.MONITOR]) {
      state = reduceCombat(state, { type: action, replaceTake: true });
      log.push([state.last.dealt ?? 0, state.last.quality ?? null, state.movementCoherence]);
      if (state.phase === 'enemy') state = advanceEnemy(state);
    }
    return log;
  };
  assert.deepEqual(run(), run(), 'same seed, same inputs, same numbers');
  assert.ok(run().some(([dealt]) => dealt > 0), 'and the run actually dealt damage');
});

test('every hit that lands is graded, and only a turned swing is a MISS', () => {
  let state = createCombatState(PROFILES.natatorium, { tools: FULL_BAG, battery: 1 });
  state = reduceCombat(state, { type: COMBAT_ACTION.EXPOSE });
  assert.ok(state.last.dealt > 0);
  assert.ok(
    [HIT_QUALITY.GRAZE, HIT_QUALITY.CLEAN, HIT_QUALITY.GOOD, HIT_QUALITY.CRITICAL].includes(state.last.quality),
    'a landed hit carries a grade',
  );
  assert.notEqual(state.last.quality, HIT_QUALITY.MISS, 'a bad draw is never a miss');

  // The one MISS in the game has a visible cause: it set to slip you.
  const guarded = createCombatState(PROFILES.natatorium, { tools: FULL_BAG, battery: 1 });
  guarded.enemyGuard = { mode: 'dodge' };
  guarded.intentIndex = 1; // not a beat EXPOSE answers, so the guard applies
  const slipped = reduceCombat(guarded, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(slipped.last.quality, HIT_QUALITY.MISS);
  assert.equal(slipped.last.dealt, 0);
});

// ── the specials are four different answers ─────────────────────────────────
//
// They used to be 4 / 6 / 7 coherence for 2 / 2 / 3 charge — three sizes of one
// hammer, and the only question a player could ask was which number was biggest.
// Their damage is comparable now and each owns a verb no regular has.

test('each special does something no regular can, and it is not just a bigger number', () => {
  const ready = (techniques, tools = FULL_BAG) => {
    const state = createCombatState(PROFILES.natatorium, { tools, techniques, battery: 1 });
    state.charge = state.maxCharge;
    return state;
  };

  // WHITEOUT: it lands whatever they do.
  const blinding = ready([TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT]);
  blinding.enemyGuard = { mode: 'parry' };
  blinding.intentIndex = 1;
  const flashed = reduceCombat(blinding, { type: COMBAT_ACTION.WHITEOUT });
  assert.equal(flashed.enemyGuard, null, 'WHITEOUT clears a set guard');
  assert.ok(flashed.last.dealt > 0, 'and connects through it');

  // MASTER TAKE: it always leaves you a take.
  const capture = ready([TECHNIQUE.PUNCH_IN, TECHNIQUE.MASTER_TAKE]);
  capture.take = null;
  capture.intentIndex = 2; // a conceal: nothing here is recordable
  const mastered = reduceCombat(capture, { type: COMBAT_ACTION.MASTER_TAKE });
  assert.ok(mastered.take, 'MASTER TAKE loads a take with no capture window');
  assert.ok(mastered.take.damage >= 2 * GRID, 'and it is a strong one');
  assert.notEqual(mastered.last.quality, HIT_QUALITY.GRAZE, 'the definitive capture is never a graze');

  // RUNAWAY FEEDBACK: it buys you a turn.
  const loop = ready([TECHNIQUE.OVERDUB, TECHNIQUE.RUNAWAY_FEEDBACK]);
  const deafened = reduceCombat(loop, { type: COMBAT_ACTION.RUNAWAY_FEEDBACK });
  assert.equal(deafened.skipEnemyBeat, true, 'the room loses its next beat');
  const after = advanceEnemy({ ...deafened, phase: 'enemy', pendingEnemy: { prevention: 0, playerDealt: deafened.last.dealt, playerNotice: '' } });
  assert.equal(after.last.received, 0, 'and the blow it committed to does not land this beat');
  assert.equal(after.skipEnemyBeat, false, 'spent, not permanent');

  // THROW VOICE: it changes what is coming.
  const decoy = ready([]);
  const thrown = reduceCombat(decoy, { type: COMBAT_ACTION.RADIO_DECOY });
  assert.equal(thrown.recommitted, true, 'the opponent has to decide again');
  assert.ok(
    availableCombatActions(decoy).find((move) => move.id === COMBAT_ACTION.RADIO_DECOY).charge
      < CHARGE_COST[COMBAT_ACTION.RUNAWAY_FEEDBACK],
    'and it is the cheap one',
  );
});

// ── the floor: you can always do something ──────────────────────────────────

test('an empty bag is slow, never stranded — there is always an attack', () => {
  // The exact state the old economy could produce: no torch, no recorder, no
  // rig, no take, no charge, the breath already spent. Every named attack is
  // gone. The answer used to be HOLD, forever, until a rescue valve opened.
  const stripped = createCombatState(PROFILES.chapel, {
    battery: 0,
    tools: { torch: false, recorder: false, rig: false, fork: false, radio: false, coffee: false },
  });
  stripped.charge = 0;
  stripped.take = null;
  stripped.composeMovements = [stripped.movementIndex];

  const open = availableCombatActions(stripped).filter((move) => move.enabled);
  const offensive = open.filter((move) => move.damage > 0 && move.id !== COMBAT_ACTION.HOLD);
  assert.ok(offensive.length > 0, 'something in the bag still deals damage');
  assert.ok(offensive.some((move) => move.id === COMBAT_ACTION.SHOUT), 'and it is your own voice');

  const shouted = reduceCombat(stripped, { type: COMBAT_ACTION.SHOUT });
  assert.ok(shouted.last.dealt > 0, 'SHOUT actually chips the thing');
  assert.ok(shouted.movementCoherence < stripped.movementCoherence);

  // Weakest thing in the bag, deliberately: it is a floor, not a strategy.
  assert.ok(
    ACTION_BAND[COMBAT_ACTION.SHOUT].max < ACTION_BAND[COMBAT_ACTION.EXPOSE].min,
    'and it never competes with a tool that fits the beat',
  );
  // Never gated on anything, in any phase where the player is choosing.
  assert.equal(bandFrom(GRID).min, GRID, 'the floor band is built from the same rule as every other');
});

// ── the tiles cannot lie ────────────────────────────────────────────────────

test('every attack tile advertises the range it will actually roll', () => {
  const state = createCombatState(PROFILES.natatorium, { tools: FULL_BAG, battery: 1 });
  for (const move of availableCombatActions(state)) {
    if (!move.damage) continue;
    assert.ok(move.damageBand, `${move.id} shows a band`);
    assert.ok(move.damageBand.min <= move.damage && move.damage <= move.damageBand.max,
      `${move.id}'s headline number sits inside its band`);
    assert.match(combatMoveSubtext(state, move).long, /\d/, `${move.id} says a number out loud`);
  }

  // And the promise holds through resolution: what was advertised is what rolled.
  const swung = reduceCombat(state, { type: COMBAT_ACTION.EXPOSE });
  const advertised = availableCombatActions(state).find((move) => move.id === COMBAT_ACTION.EXPOSE);
  assert.deepEqual(swung.last.band, advertised.damageBand, 'the tile showed the band that was rolled');
});

// ── difficulty is a mechanics ladder, not only a guidance one ───────────────

test('the presets differ in play, not only in how much they narrate', () => {
  const floors = Object.values(COMBAT_RULES).map((rules) => rules.bandFloorBonus);
  assert.ok(floors[0] > floors.at(-1), 'the assist hands you more of the band than dead air does');
  const windows = Object.values(COMBAT_RULES).map((rules) => rules.parryWindowScale);
  assert.ok(windows[0] > windows.at(-1), 'and a wider parry window');
  assert.equal(COMBAT_RULES.guided.enemyGuardCooldown, null, 'the assisted preset never meets the guard');
  for (const id of ['standard', 'severe', 'dead-air']) {
    assert.ok(COMBAT_RULES[id].enemyGuardCooldown > 0, `${id} does`);
  }
  assert.ok(
    COMBAT_RULES['dead-air'].enemyGuardCooldown < COMBAT_RULES.standard.enemyGuardCooldown,
    'and it comes round faster as the night gets meaner',
  );

  // The floor bonus is real: the same beat lands higher on the assisted preset.
  const hit = (difficulty) => {
    const state = createCombatState(PROFILES.natatorium, { tools: FULL_BAG, battery: 1, difficulty });
    return reduceCombat(state, { type: COMBAT_ACTION.EXPOSE }).last.dealt;
  };
  assert.ok(hit(COMBAT_RULES.guided) >= hit(COMBAT_RULES['dead-air']), 'the assist lands at least as well');
});
