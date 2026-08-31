import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERFECT_COUNTER_SHARE,
  BASE_MAX_CHARGE,
  CHARGE_COST,
  COMBAT_ACTION,
  COMBAT_TOOL,
  SNR_STATE,
  SNR_TRIANGLE,
  SOURCE_CHANNEL,
  TECHNIQUE,
  actionCounterKinds,
  availableCombatActions,
  availableCombatTools,
  combatMoveSubtext,
  combatMovesForTool,
  combatIntentLookahead,
  combatPrediction,
  combatRecoveryStatus,
  combatResult,
  counterMovesForIntent,
  createCombatState,
  currentCombatIntent,
  reduceCombat,
  runCombatTurn,
  advanceEnemy,
  selectEnemyIntents,
  validateCombatDefinition,
  ACTION_BAND,
} from '../src/game/combat-state.js';
import { authoredCombatProfile, sourceCombatDefinition } from '../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import {
  MAX_PINS,
  MAX_TECHNIQUES,
  PIN_SOURCES,
  TECHNIQUE_DEFS,
  learnCombatTechnique,
  pullCombatTechnique,
  techniquePullPreview,
  normalizeCombatBuild,
  techniqueAvailability,
} from '../src/game/combat-progression.js';
import { GRID, HIT_QUALITY } from '../src/game/combat-damage.js';

const definition = (id = 'natatorium') => ({
  id,
  enemy: id.toUpperCase(),
  baseComposure: 8 * GRID,
  ...authoredCombatProfile(id),
});

// Outgoing damage is a BAND now (see combat-damage.js), so asserting an exact
// number would be asserting the draw rather than the rule. These say the two
// things that are actually promised: the hit landed inside the range the tile
// advertised, and it was graded.
const dealtInBand = (state, message) => {
  const band = state.last?.band;
  const dealt = state.last?.dealt ?? 0;
  assert.ok(band, `${message}: the hit recorded no band`);
  assert.ok(
    dealt >= band.min && dealt <= band.max,
    `${message}: ${dealt} is outside the advertised ${band.min}–${band.max}`,
  );
  assert.ok(Object.values(HIT_QUALITY).includes(state.last.quality), `${message}: the hit was not graded`);
  return dealt;
};

test('signal combat is deterministic and a perfect response opens one non-chaining Tempo action', () => {
  const initial = createCombatState(definition(), { battery: 1 });
  assert.equal(currentCombatIntent(initial).kind, 'broadcast');
  // The counter is met, not refused: the opponent takes its (chipped) beat and
  // TEMPO arrives on the far side of it.
  const left = advanceEnemy(reduceCombat(initial, { type: COMBAT_ACTION.MONITOR }));
  const right = advanceEnemy(reduceCombat(initial, { type: COMBAT_ACTION.MONITOR }));
  assert.deepEqual(left, right);
  assert.equal(left.tempo, true);
  assert.equal(left.perfectCounters, 1);
  assert.equal(left.take.damage, 2 * GRID);

  // MONITOR is a regular attack now, not only a capture: listening closely
  // takes something off the thing whether or not there was a take in it.
  dealtInBand(left, 'the capture also chipped it');
  assert.ok(left.movementCoherence < initial.movementCoherence, 'the capture also chipped it');
  assert.equal(left.charge, 2, 'and reading the blow right paid a charge');

  const playback = reduceCombat(left, { type: COMBAT_ACTION.PLAYBACK });
  assert.equal(playback.tempo, false);
  assert.equal(playback.turns, 1);
  dealtInBand(playback, 'playback spends the take for a banded swing');
  assert.ok(playback.movementCoherence < left.movementCoherence);
});

test('Tune is a free once-per-movement calibration and strengthens the next perfect response', () => {
  let state = createCombatState(definition(), { tools: { fork: true } });
  assert.equal(combatIntentLookahead(state).length, 1);
  state = reduceCombat(state, { type: COMBAT_ACTION.TUNE });
  assert.equal(state.turns, 0);
  assert.equal(combatIntentLookahead(state).length, 2);
  assert.equal(availableCombatActions(state).find((action) => action.id === COMBAT_ACTION.TUNE).enabled, false);
  const beforeChip = state.movementCoherence;
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  // The chip is banded; the resonant bonus is a flat add on top of it, so the
  // total is the band plus the bonus and the bonus is what this asserts.
  const chip = state.last.dealt;
  assert.ok(chip > state.last.band.max, 'the resonant bonus lands on top of the banded chip');
  assert.equal(beforeChip - state.movementCoherence, chip);
  assert.equal(state.tuneBonus, 0);
});

test('EXPOSE is free and a flat battery cannot disarm the recordist', () => {
  // The battery is a RUN resource that exploration drains by the second, so
  // billing the primary attack to it meant a player could walk the building and
  // arrive at the chapel unable to fight — which forced every encounter to be
  // balanced for an empty bag, which let a full one walk through it. Pointing
  // the torch is free now. Burning it out is not.
  const flat = createCombatState(definition(), { battery: 0, torchDrainScale: 1.35 });
  const expose = availableCombatActions(flat).find((action) => action.id === COMBAT_ACTION.EXPOSE);
  assert.equal(expose.enabled, true, 'a dead battery does not take the torch away');
  const next = reduceCombat(flat, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(next.torchSpent, 0);
  assert.equal(next.battery, 0);
  assert.ok(next.movementCoherence < flat.movementCoherence, 'and it still does its work');
});

test('WHITEOUT is what the battery is for, on top of its charge', () => {
  const build = { techniques: [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT], battery: .2, torchDrainScale: 1.35 };
  const ready = createCombatState(definition(), build);
  ready.charge = 3;
  const whiteout = availableCombatActions(ready).find((action) => action.id === COMBAT_ACTION.WHITEOUT);
  assert.equal(whiteout.enabled, true);
  const fired = reduceCombat(ready, { type: COMBAT_ACTION.WHITEOUT });
  assert.equal(+fired.torchSpent.toFixed(5), .0675, 'the special bills the battery');
  assert.equal(fired.charge, 3 - CHARGE_COST[COMBAT_ACTION.WHITEOUT]);

  const dim = createCombatState(definition(), { ...build, battery: .01 });
  dim.charge = 3;
  assert.equal(availableCombatActions(dim).find((action) => action.id === COMBAT_ACTION.WHITEOUT).reason, 'BATTERY FLAT');
});

test('occupied Take requires explicit replacement', () => {
  let state = createCombatState(definition(), { techniques: [TECHNIQUE.ROOM_TONE] });
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.equal(state.last.needsTakeConfirmation, true);
  assert.equal(state.take.id, 'room-tone');
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR, replaceTake: true });
  assert.equal(state.take.id, 'natatorium:meter');
});

test('Hold prevents damage, clears ringing, and does not heal', () => {
  let state = createCombatState(definition(), {});
  state.intentIndex = 1;
  state.ringing = true;
  const before = state.composure;
  // HOLD counters an overload, so the blow is met rather than refused — but a
  // full brace still covers it completely, and a blow you read carries none of
  // its riders. The move whose job is clearing the ring gets to keep it clear.
  state = advanceEnemy(reduceCombat(state, { type: COMBAT_ACTION.HOLD }));
  assert.equal(state.composure, before, 'a brace that covers the blow still covers it');
  assert.equal(state.ringing, false, 'and a read blow does not put the ring back');
  assert.equal(state.tempo, true);
});

test('the locked techniques preserve their tier and equipment contracts', () => {
  const migrated = normalizeCombatBuild(null, ['recording-2', 'pre-recording-4']);
  assert.equal(migrated.unspent, 2);
  assert.deepEqual(normalizeCombatBuild({ techniques: [TECHNIQUE.WHITEOUT] }, ['recording-2']).techniques, []);
  assert.equal(techniqueAvailability(migrated, TECHNIQUE.RUNAWAY_FEEDBACK, { hasRig: true }).reason, 'NO CONTINUITY');
  assert.equal(techniqueAvailability(migrated, TECHNIQUE.OVERDUB, { hasRig: false }).reason, 'BENT RIG REQUIRED');
  // A player holding NOTHING is still told the real problem. This used to
  // answer NO SPARE LEAD for the rig, which is true and useless: the lead count
  // is the one thing on this screen they can fix, and the rig is not.
  const broke = normalizeCombatBuild(null, []);
  assert.equal(broke.unspent, 0);
  assert.equal(techniqueAvailability(broke, TECHNIQUE.OVERDUB, { hasRig: false }).reason, 'BENT RIG REQUIRED');
  assert.equal(techniqueAvailability(broke, TECHNIQUE.AFTERIMAGE, { hasRig: true }).reason, 'NO SPARE LEAD');
  const first = learnCombatTechnique(migrated, TECHNIQUE.OVERDUB, { hasRig: true });
  const second = learnCombatTechnique(first.build, TECHNIQUE.RUNAWAY_FEEDBACK, { hasRig: true });
  assert.equal(second.changed, true);
  assert.deepEqual(second.build.techniques, [TECHNIQUE.OVERDUB, TECHNIQUE.RUNAWAY_FEEDBACK]);
  assert.equal(second.build.unspent, 0);
});

// ── A LEAD COMES BACK OUT ────────────────────────────────────────────────────
//
// The point of a cable rather than a pin: it can be pulled and patched
// somewhere else. Pulling one takes the run below it with it, because the
// sockets past a break stop carrying — and every lead in that run comes back.
test('pulling a lead returns it, and takes the run below it', () => {
  const funded = normalizeCombatBuild(null, PIN_SOURCES.encounters,
    { 'pin.academic': true, 'pin.tower': true, 'pin.gallery': true });
  let build = funded;
  for (const id of [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT, TECHNIQUE.OVEREXPOSE]) {
    build = learnCombatTechnique(build, id, { hasRig: true }).build;
  }
  assert.equal(build.unspent, funded.unspent - 3);

  // A leaf comes out on its own.
  const leaf = pullCombatTechnique(build, TECHNIQUE.OVEREXPOSE);
  assert.deepEqual(leaf.pulled, [TECHNIQUE.OVEREXPOSE]);
  assert.equal(leaf.returned, 1);
  assert.deepEqual(leaf.build.techniques, [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT]);

  // The head takes the whole run, and hands back every lead in it.
  const head = pullCombatTechnique(build, TECHNIQUE.AFTERIMAGE);
  assert.deepEqual(head.pulled, [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT, TECHNIQUE.OVEREXPOSE],
    'the pulled run is named head-first, which is the order the warning reads in');
  assert.equal(head.returned, 3);
  assert.deepEqual(head.build.techniques, []);
  assert.equal(head.build.unspent, funded.unspent, 'every lead is back in the hand');

  // Pulling nothing is nothing.
  assert.equal(pullCombatTechnique(build, TECHNIQUE.BRACE).changed, false);
  assert.equal(pullCombatTechnique(build, TECHNIQUE.BRACE).reason, 'NOT PATCHED');

  // The warning cannot disagree with the pull: same code path.
  assert.deepEqual(techniquePullPreview(build, TECHNIQUE.AFTERIMAGE).pulls, head.pulled);
  assert.equal(techniquePullPreview(build, TECHNIQUE.AFTERIMAGE).returns, 3);

  // A PATCHED socket never accepts a second lead, and is always pullable.
  const patched = techniqueAvailability(build, TECHNIQUE.AFTERIMAGE, { hasRig: true });
  assert.equal(patched.enabled, false, 'a socket that carries cannot be patched again');
  assert.equal(patched.pullable, true);

  // YOU CAN ALWAYS PULL YOUR OWN END. One end of every lead is captive in the
  // recorder, so losing the bent rig must not strand the leads that ran through
  // it — otherwise up to four are gone with no way to get them back.
  let rigged = funded;
  for (const id of [TECHNIQUE.OVERDUB, TECHNIQUE.RUNAWAY_FEEDBACK]) {
    rigged = learnCombatTechnique(rigged, id, { hasRig: true }).build;
  }
  assert.equal(techniqueAvailability(rigged, TECHNIQUE.OVERDUB, { hasRig: false }).pullable, true,
    'the rig is gone and the leads are still yours');
  assert.equal(pullCombatTechnique(rigged, TECHNIQUE.OVERDUB).returned, 2);
});

test('the tree buys regulars flat and specials two pins deep', () => {
  // Two tracks, because there are two kinds of thing worth buying. FLAT
  // upgrades make the moves you always have better and can be taken in any
  // order, so an early pin is useful before any branch pays off. TOOL branches
  // hold the SPECIALS — and no special may cost more than two of a run's six
  // pins, which RUNAWAY FEEDBACK used to, at four.
  const depth = (id, seen = 0) => {
    const def = TECHNIQUE_DEFS.find((entry) => entry.id === id);
    return def?.requires ? depth(def.requires, seen + 1) : seen + 1;
  };
  const specials = TECHNIQUE_DEFS.filter((t) => /SPECIAL/.test(t.detail));
  assert.ok(specials.length >= 4, 'every tool that can be loud has something loud to buy');
  for (const special of specials) {
    assert.equal(special.track, 'tool', `${special.label} is bought through its tool`);
    assert.ok(depth(special.id) <= 2, `${special.label} costs ${depth(special.id)} pins to reach`);
  }
  const flat = TECHNIQUE_DEFS.filter((t) => t.track === 'flat');
  assert.ok(flat.length >= 8, 'there is a real flat track, not a token one');
  assert.ok(flat.some((t) => !t.requires), 'and some of it is reachable with a single pin');
  assert.ok(!flat.some((t) => /SPECIAL/.test(t.detail)), 'nothing loud hides in the flat track');
  assert.ok(new Set(TECHNIQUE_DEFS.map((t) => t.branch)).size >= 6, 'the tree spans torch/recorder/rig plus nerve/fork/radio');
  assert.ok(MAX_PINS >= 4 && MAX_TECHNIQUES >= 4);
  // Pins accrue from regular battle clears and from set pickup flags, capped.
  const fromBattles = normalizeCombatBuild(null, ['recording-2', 'pre-recording-4', 'chapel']);
  assert.equal(fromBattles.pinsEarned, 3, 'each real encounter clear grants a pin');
  const withFlags = normalizeCombatBuild(null, ['recording-2'], { 'pin.academic': true, 'pin.tower': true });
  assert.equal(withFlags.pinsEarned, 3, 'pickup flags grant pins too');
  // Flag pins survive a re-normalization with no flags context (learning path).
  const relearned = normalizeCombatBuild(withFlags);
  assert.equal(relearned.pinsEarned, 3, 'flag-earned pins persist via rewardedFlags');
  // The cap holds even with every source firing.
  // Three collectible pins now: the atrium planter, the gallery head, the tower.
  // `pin.foyer` was retired — it was the gallery head's discovery twice over.
  const capped = normalizeCombatBuild(null, PIN_SOURCES.encounters, { 'pin.academic': true, 'pin.gallery': true, 'pin.tower': true });
  assert.equal(capped.pinsEarned, MAX_PINS);
});

test('a tier-III chain can be learned and its effect resolves in combat', () => {
  // OVEREXPOSE requires AFTERIMAGE→WHITEOUT; learn the whole chain, then verify
  // it pushes the exposed residue onto the next Playback.
  let build = normalizeCombatBuild(null, PIN_SOURCES.encounters);
  for (const id of [TECHNIQUE.AFTERIMAGE, TECHNIQUE.WHITEOUT, TECHNIQUE.OVEREXPOSE]) {
    const step = learnCombatTechnique(build, id, {});
    assert.equal(step.changed, true, `learned ${id}`);
    build = step.build;
  }
  assert.ok(build.techniques.includes(TECHNIQUE.OVEREXPOSE));
  // AFTERIMAGE→2, OVEREXPOSE→+1: an EXPOSE leaves exposedBonus 3.
  let state = createCombatState(definition(), { battery: 1, techniques: build.techniques });
  state.intentIndex = 2; // conceal, so EXPOSE is not a perfect counter
  state = reduceCombat(state, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(state.exposedBonus, 3 * GRID, 'AFTERIMAGE 2 + OVEREXPOSE 1, in grid units');
});

test('WHITEOUT is described as an active technique so the UI can surface it as a move', () => {
  const whiteout = TECHNIQUE_DEFS.find((t) => t.id === TECHNIQUE.WHITEOUT);
  assert.ok(whiteout.active, 'has an active descriptor');
  assert.equal(whiteout.active.actionId, 'whiteout');
  // Passive techniques carry no active descriptor.
  assert.equal(TECHNIQUE_DEFS.find((t) => t.id === TECHNIQUE.AFTERIMAGE).active, undefined);
});

test('specials are paced by charge, not by one shared use per encounter', () => {
  // Three pins into three specials used to buy exactly one firing, because all
  // three shared a single lock. Charge replaces that: they cost what they are
  // worth, they can be fired again, and what refills them is reading the
  // opponent correctly.
  let state = createCombatState(definition('hall'), {
    battery: 1,
    tools: { torch: true, recorder: true, rig: true },
    techniques: [TECHNIQUE.WHITEOUT, TECHNIQUE.MASTER_TAKE, TECHNIQUE.RUNAWAY_FEEDBACK],
  });
  state.charge = state.maxCharge;
  state.intentIndex = 2;
  state.apparitions.members[0].intentId = state.definition.movements[0].intents[2].id;
  // It counters the conceal it was aimed at, so the beat pays a charge back on
  // the way out — spending well is partly self-funding.
  const spent = reduceCombat(state, { type: COMBAT_ACTION.WHITEOUT });
  assert.equal(spent.last.perfect, true);
  assert.equal(spent.charge, state.maxCharge - CHARGE_COST[COMBAT_ACTION.WHITEOUT] + 1);

  // What is still open is a question of what you can afford, not of what you
  // have already used.
  const actions = availableCombatActions(spent);
  const master = actions.find((action) => action.id === COMBAT_ACTION.MASTER_TAKE);
  assert.equal(master.enabled, spent.charge >= CHARGE_COST[COMBAT_ACTION.MASTER_TAKE]);
  const runaway = actions.find((action) => action.id === COMBAT_ACTION.RUNAWAY_FEEDBACK);
  assert.equal(runaway.enabled, false, 'the loudest one is out of reach on the change left');
  assert.match(runaway.reason, /CHARGE/);

  // Refill and the same special comes round again.
  const refilled = { ...spent, charge: spent.maxCharge };
  assert.equal(availableCombatActions(refilled).find((a) => a.id === COMBAT_ACTION.WHITEOUT).enabled, true);
});

test('charge is earned by reading the opponent, and it has a ceiling', () => {
  const state = createCombatState(definition(), {});
  assert.equal(state.charge, 1, 'the cheap utility special is in reach from the first beat');
  assert.equal(state.maxCharge, BASE_MAX_CHARGE);
  const perfect = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.equal(perfect.charge, 2);
  assert.match(perfect.last.notice, /\+1 CHARGE/);

  // HEADROOM is a flat pin: it raises the ceiling rather than unlocking anything.
  const deep = createCombatState(definition(), { techniques: [TECHNIQUE.HEADROOM] });
  assert.equal(deep.maxCharge, BASE_MAX_CHARGE + 2);

  const capped = createCombatState(definition(), {});
  capped.charge = capped.maxCharge;
  assert.equal(reduceCombat(capped, { type: COMBAT_ACTION.MONITOR }).charge, capped.maxCharge, 'charge does not overflow');
});

test('Afterimage, Whiteout, Overdub, Punch In, and Feedback Loop resolve exactly once at their authored scopes', () => {
  let afterimage = createCombatState(definition(), { techniques: [TECHNIQUE.ROOM_TONE, TECHNIQUE.AFTERIMAGE] });
  afterimage.intentIndex = 2;
  // EXPOSE counters the conceal, so the opponent takes its chipped beat before
  // the residue is spent. runCombatTurn is the whole beat, player then enemy.
  afterimage = runCombatTurn(afterimage, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(afterimage.exposedBonus, 2 * GRID);
  afterimage = runCombatTurn(afterimage, { type: COMBAT_ACTION.PLAYBACK });
  assert.equal(afterimage.last.transition.to, 1);

  let whiteout = createCombatState(definition(), { techniques: [TECHNIQUE.WHITEOUT], battery: 1 });
  whiteout.charge = whiteout.maxCharge;
  whiteout.intentIndex = 2;
  whiteout = reduceCombat(whiteout, { type: COMBAT_ACTION.WHITEOUT });
  assert.equal(whiteout.exposedBonus, 0);
  assert.equal(+whiteout.torchSpent.toFixed(3), .05);

  let overdub = createCombatState(definition(), { tools: { rig: true }, techniques: [TECHNIQUE.ROOM_TONE, TECHNIQUE.OVERDUB] });
  overdub = reduceCombat(overdub, { type: COMBAT_ACTION.PLAYBACK });
  assert.equal(overdub.take.damage, GRID);
  assert.deepEqual(overdub.overdubMovements, [0]);

  // PUNCH IN is a flat upgrade to a regular now: it doubles MONITOR's chip
  // every beat, rather than adding one hit once per movement.
  const plain = reduceCombat(createCombatState(definition(), {}), { type: COMBAT_ACTION.MONITOR });
  let punch = createCombatState(definition(), { techniques: [TECHNIQUE.PUNCH_IN] });
  punch = reduceCombat(punch, { type: COMBAT_ACTION.MONITOR });
  // Both chips are banded, so this compares the ranges rather than two draws:
  // PUNCH IN doubles the centre, and the bands do not overlap.
  assert.ok(punch.last.band.min > plain.last.band.max, 'PUNCH IN is worth a whole band, every capture');
  assert.ok(plain.movementCoherence > punch.movementCoherence, 'and it lands harder in practice');
  // Not spent after one: the second capture chips from the same widened band.
  // (Compared on the chip rather than on the bar, because a chip that big can
  // finish a phase and roll the bar back up to the next movement's coherence.)
  const again = reduceCombat({ ...punch, tempo: false, take: null }, { type: COMBAT_ACTION.MONITOR });
  assert.deepEqual(again.last.band, punch.last.band, 'and it is not spent after one');
  assert.ok(again.last.dealt >= again.last.band.min, 'the second capture chips just as hard');

  let feedback = createCombatState(definition('hall'), {
    tools: { rig: true }, techniques: [TECHNIQUE.ROOM_TONE, TECHNIQUE.FEEDBACK_LOOP],
  });
  feedback.movementIndex = 1;
  feedback.movementCoherence = 2;
  feedback.movementMaxCoherence = 4;
  feedback.intentIndex = 1;
  feedback = reduceCombat(feedback, { type: COMBAT_ACTION.INVERT });
  assert.equal(feedback.feedbackLoopUsed, true);
  assert.equal(feedback.take.id, 'room-tone');
  assert.equal(feedback.last.transition.to, 2);
});

test('the locked kit exposes tools first and only then the moves owned by that tool', () => {
  const state = createCombatState(definition(), {
    tools: { torch: true, recorder: true, radio: true, coffee: true, order: ['radio', 'torch', 'coffee', 'recorder'] },
  });
  assert.deepEqual(availableCombatTools(state).map((tool) => tool.id), [
    COMBAT_TOOL.SELF, COMBAT_TOOL.RADIO, COMBAT_TOOL.TORCH, COMBAT_TOOL.COFFEE, COMBAT_TOOL.RECORDER,
  ]);
  assert.deepEqual(combatMovesForTool(state, COMBAT_TOOL.TORCH).map((move) => move.id), [COMBAT_ACTION.EXPOSE]);
  assert.deepEqual(combatMovesForTool(state, COMBAT_TOOL.RECORDER).map((move) => move.id), [COMBAT_ACTION.MONITOR, COMBAT_ACTION.PLAYBACK]);
});

test('tool use drives player SNR and each state changes the visible combat math', () => {
  let noisy = createCombatState(definition(), {});
  noisy = reduceCombat(noisy, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(noisy.snr, SNR_STATE.NOISE);
  // NOISE lifts the whole band rather than adding to a finished number, so what
  // this checks is that the swing landed inside the raised range.
  dealtInBand(noisy, 'a torch swing thrown from Noise');
  assert.ok(noisy.last.band.min > ACTION_BAND[COMBAT_ACTION.EXPOSE].min, 'Noise lifted the band');

  let silent = createCombatState(definition(), {});
  silent.intentIndex = 2;
  silent = runCombatTurn(silent, { type: COMBAT_ACTION.HOLD });
  assert.equal(silent.snr, SNR_STATE.SILENCE);
  assert.equal(silent.last.received, 0);

  let signal = createCombatState(definition(), { tools: { coffee: true } });
  signal.composure = 5;
  signal.intentIndex = 2;
  signal = runCombatTurn(signal, { type: COMBAT_ACTION.STEADY_HANDS });
  assert.equal(signal.snr, SNR_STATE.SIGNAL);
  assert.equal(signal.last.consumed, COMBAT_TOOL.COFFEE);
  assert.equal(signal.last.received, 3 * GRID, 'Signal is strong but brittle on a missed read');
});

test('the radio is the cheap special: one charge, and it comes back', () => {
  let state = createCombatState(definition(), { tools: { radio: true } });
  assert.equal(state.charge, 1, 'affordable from the first beat');
  state = reduceCombat(state, { type: COMBAT_ACTION.RADIO_DECOY });
  assert.equal(state.snr, SNR_STATE.NOISE);
  assert.equal(state.perfectCounters, 1);
  dealtInBand(state, 'the decoy has teeth, banded like everything else');
  assert.equal(state.recommitted, true, 'and it makes the room decide again');
  // Spent, not burned: the frequency is not gone forever, it is just unaffordable
  // until reading the opponent pays for it again.
  assert.equal(state.charge, 1 - CHARGE_COST[COMBAT_ACTION.RADIO_DECOY] + 1, 'the perfect counter it landed paid a charge back');
  // The decoy is a perfect counter, so the opponent takes its chipped beat
  // before the deck is the player's again. Availability is a select-phase
  // question.
  const broke = { ...advanceEnemy(state), charge: 0 };
  assert.equal(combatMovesForTool(broke, COMBAT_TOOL.RADIO)[0].enabled, false);
  assert.match(combatMovesForTool(broke, COMBAT_TOOL.RADIO)[0].reason, /CHARGE/);
});

test('encounter signatures materially alter pressure while remaining authored data', () => {
  let echo = createCombatState(definition('natatorium'), {});
  echo.signaturePressure = GRID;
  echo = runCombatTurn(echo, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(echo.last.received, 3 * GRID);

  let feedback = createCombatState(definition('hall'), { techniques: [TECHNIQUE.ROOM_TONE] });
  feedback = reduceCombat(feedback, { type: COMBAT_ACTION.PLAYBACK });
  assert.match(feedback.last.notice, /APPARITION RETURN/);

  let fatalFeedback = createCombatState(definition('hall'), { techniques: [TECHNIQUE.ROOM_TONE] });
  fatalFeedback.composure = 1;
  fatalFeedback = reduceCombat(fatalFeedback, { type: COMBAT_ACTION.PLAYBACK });
  assert.equal(combatResult(fatalFeedback)?.result, 'lose');

  // ENSEMBLE STACK moved off `practice` when the wing stopped having hostile
  // beats to stack on — nothing in that room strikes him. `chapel` still carries
  // a signature that fires on a real blow, which is what this is checking.
  assert.equal(definition('practice').signature, undefined,
    'the wing claims no signature it cannot fire');
});

test('a clean regular fight lands inside the authored 8–12 decision arc', () => {
  // `natatorium` rather than `practice`: the wing is no longer a fight you can
  // win by playing well, because there is nothing in it to reduce. Its arc is
  // held by test/practice-room.spec.mjs, which counts laps to the wall instead
  // of decisions to a kill.
  let state = createCombatState(definition('natatorium'), { tools: { torch: true, recorder: true } });
  let decisions = 0;
  while (!state.result && decisions < 30) {
    const intent = currentCombatIntent(state);
    const action = state.tempo
      // A free bonus action is never spent on nothing now: with no take to
      // play back, clean play reaches for the regular that costs nothing.
      ? state.take ? COMBAT_ACTION.PLAYBACK : COMBAT_ACTION.EXPOSE
      : intent.kind === 'broadcast' ? COMBAT_ACTION.MONITOR
        : intent.kind === 'conceal' ? COMBAT_ACTION.EXPOSE
          : intent.kind === 'overload' ? COMBAT_ACTION.HOLD
            : COMBAT_ACTION.HOLD;
    state = runCombatTurn(state, { type: action, replaceTake: true });
    decisions += 1;
  }
  assert.equal(combatResult(state)?.result, 'win');
  assert.ok(decisions >= 8 && decisions <= 12, `clean fight used ${decisions} decisions`);
});

test('injuries and all four combat assistance modes set transparent authored difficulty without health inflation', () => {
  const story = createCombatState(definition(), { difficulty: COMBAT_RULES.guided });
  const contract = createCombatState(definition(), { difficulty: COMBAT_RULES.standard });
  const night = createCombatState(definition(), { difficulty: COMBAT_RULES.severe });
  const deadAir = createCombatState(definition(), { difficulty: COMBAT_RULES['dead-air'] });
  assert.deepEqual([story.maxComposure, contract.maxComposure, night.maxComposure, deadAir.maxComposure], [50, 40, 35, 30]);
  assert.equal(createCombatState(definition(), { injuries: 3 }).maxComposure, 5 * GRID);
  assert.equal(createCombatState(definition(), { injuries: 999 }).maxComposure, 4 * GRID, 'the floor holds');
  assert.equal(combatIntentLookahead(story).length, 2);
  assert.equal(currentCombatIntent(night).kind, 'overload');
  assert.equal(currentCombatIntent(deadAir).kind, 'conceal');
  assert.equal(story.movementCoherence, deadAir.movementCoherence);
  assert.deepEqual(
    [story.difficulty.recoveryHolds, contract.difficulty.recoveryHolds, night.difficulty.recoveryHolds, deadAir.difficulty.recoveryHolds],
    [0, 1, 2, 3],
  );
});

test('spent kits get one authored dead beat on Standard, none on Story, and never enter a passive loop', () => {
  const spent = (difficulty) => {
    const state = createCombatState(definition(), {
      difficulty,
      battery: 0,
      tools: { torch: false, recorder: false, rig: false, fork: false, radio: false, coffee: false },
    });
    state.composeMovements = [state.movementIndex];
    return state;
  };

  let story = spent(COMBAT_RULES.guided);
  assert.equal(combatRecoveryStatus(story).ready, true, 'Story never opens on a passive-only choice');
  const storyBreath = availableCombatActions(story).find((move) => move.id === COMBAT_ACTION.COMPOSE);
  assert.deepEqual(
    { enabled: storyBreath.enabled, label: storyBreath.label, damage: storyBreath.damage },
    { enabled: true, label: 'SECOND BREATH', damage: GRID },
  );

  let standard = spent(COMBAT_RULES.standard);
  assert.deepEqual(
    { ready: combatRecoveryStatus(standard).ready, remaining: combatRecoveryStatus(standard).remaining },
    { ready: false, remaining: 1 },
    'Contract exposes exactly one deliberate recovery beat',
  );
  standard = runCombatTurn(standard, { type: COMBAT_ACTION.HOLD });
  assert.equal(combatRecoveryStatus(standard).ready, true);
  assert.match(standard.last.notice, /SECOND BREATH READY/);
  const before = standard.movementCoherence;
  standard = runCombatTurn(standard, { type: COMBAT_ACTION.COMPOSE });
  assert.equal(standard.movementCoherence, before - GRID, 'Second Breath is a real progress action');
  assert.equal(combatRecoveryStatus(standard).ready, true, 'the encounter never falls back into another dead beat');
  assert.equal(availableCombatActions(standard).find((move) => move.id === COMBAT_ACTION.COMPOSE).enabled, true);
});

test('Story and Standard can finish every authored fight with a completely spent bag', () => {
  for (const [mode, difficulty] of [['story', COMBAT_RULES.guided], ['standard', COMBAT_RULES.standard]]) {
    for (const id of ['natatorium', 'hall', 'practice', 'chapel', 'source']) {
      let state = createCombatState(definition(id), {
        difficulty,
        battery: 0,
        tools: { torch: false, recorder: false, rig: false, fork: false, radio: false, coffee: false },
      });
      state.composeMovements = [0];
      for (let guard = 0; !state.result && guard < 200; guard += 1) {
        // The ladder is every action that needs no tool. LISTEN and PUT IT DOWN
        // joined it with the practice wing: that room cannot be finished by
        // bracing, but it does not ask for a device either — it asks him to play
        // the bar back and then stop, both of which a man with an empty bag can
        // still do. The property under test is that no fight REQUIRES equipment,
        // not that every fight can be waited out.
        const offered = availableCombatActions(state).filter((move) => move.enabled).map((move) => move.id);
        const type = offered.includes(COMBAT_ACTION.PUT_IT_DOWN) ? COMBAT_ACTION.PUT_IT_DOWN
          : offered.includes(COMBAT_ACTION.LISTEN) ? COMBAT_ACTION.LISTEN
            : combatRecoveryStatus(state).ready ? COMBAT_ACTION.COMPOSE : COMBAT_ACTION.HOLD;
        state = runCombatTurn(state, { type });
      }
      assert.equal(combatResult(state)?.result, 'win', `${mode}:${id}`);
    }
  }
});

test('challenge modes delay Second Breath transparently but still recover a completely spent kit', () => {
  for (const [id, required] of [['severe', 2], ['dead-air', 3]]) {
    let state = createCombatState(definition(), {
      difficulty: COMBAT_RULES[id],
      battery: 0,
      tools: { torch: false, recorder: false, rig: false, fork: false, radio: false, coffee: false },
    });
    state.composeMovements = [0];
    for (let held = 0; held < required; held += 1) {
      assert.equal(combatRecoveryStatus(state).ready, false, `${id} hold ${held} is still pressure`);
      state = runCombatTurn(state, { type: COMBAT_ACTION.HOLD });
    }
    assert.equal(combatRecoveryStatus(state).ready, true, `${id} eventually exposes a progress action`);
  }
});

test('ordinary encounters resist one-button phase deletion without changing difficulty health', () => {
  const natatorium = authoredCombatProfile('natatorium').movements.map((movement) => movement.coherence);
  const hall = authoredCombatProfile('hall').movements.map((movement) => movement.coherence);
  const practice = authoredCombatProfile('practice').movements.map((movement) => movement.coherence);
  assert.deepEqual(natatorium, [25, 25, 30]);
  assert.deepEqual(hall, [30, 30, 30]);
  assert.deepEqual(practice, [25, 30, 30]);
  assert.ok([...natatorium, ...hall, ...practice].every((coherence) => coherence > 3 * GRID), 'an ordinary Noise-state EXPOSE cannot erase a movement');
});

test('competent Standard play keeps every ordinary encounter in a deliberate decision arc', () => {
  for (const id of ['natatorium', 'hall', 'practice']) {
    let state = createCombatState(definition(id), {
      difficulty: COMBAT_RULES.standard,
      tools: { torch: true, recorder: true, rig: false, fork: false, radio: false, coffee: false },
    });
    let decisions = 0;
    while (!state.result && decisions < 40) {
      const intent = currentCombatIntent(state);
      // Competent play in the practice wing is not "counter the blow" — nothing
      // in that room throws one. It is reaching the bar the file ends at and
      // playing it back instead of winding it on, which is the whole decision
      // the encounter offers.
      const offered = availableCombatActions(state).filter((move) => move.enabled).map((move) => move.id);
      const action = offered.includes(COMBAT_ACTION.PUT_IT_DOWN) ? COMBAT_ACTION.PUT_IT_DOWN
        : offered.includes(COMBAT_ACTION.LISTEN) ? COMBAT_ACTION.LISTEN
          : state.tempo
        // Competent play does not hand a free action back. The regulars cost
        // nothing, so there is always something better to do with a bonus beat
        // than close the channel.
            ? state.take ? COMBAT_ACTION.PLAYBACK : COMBAT_ACTION.EXPOSE
            : state.composure <= GRID && offered.includes(COMBAT_ACTION.COMPOSE) ? COMBAT_ACTION.COMPOSE
            : intent.kind === 'broadcast' ? COMBAT_ACTION.MONITOR
              : intent.kind === 'conceal' ? COMBAT_ACTION.EXPOSE
                : COMBAT_ACTION.HOLD;
      state = runCombatTurn(state, { type: action, replaceTake: true });
      decisions += 1;
    }
    assert.equal(combatResult(state)?.result, 'win', id);
    // The wing runs longer, and it is meant to. Its arc is three laps of a
    // four-bar fragment rather than a health bar coming down: walk to the bar
    // the file ends at, play it back, and do that until there is nothing left on
    // it to hear. Holding it to a range written for fights you win by reducing
    // something would be shortening the one encounter whose length is the point.
    const [low, high] = id === 'practice' ? [9, 22] : [9, 15];
    assert.ok(decisions >= low && decisions <= high, `${id} used ${decisions} decisions`);
  }
});

test('every non-perfect main action produces understandable pressure accounting', () => {
  let state = createCombatState(definition(), {});
  state = runCombatTurn(state, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(state.missedCounters, 1);
  assert.equal(state.damageTaken, 2 * GRID);
});

test('Source channels are visible, tie to the armed channel, and Rescue stability is explicit', () => {
  let state = createCombatState(sourceCombatDefinition(), { source: { rescueEligible: true } });
  state = reduceCombat(state, { type: COMBAT_ACTION.CHANNEL, channel: SOURCE_CHANNEL.SUBMIT });
  assert.equal(combatPrediction(state).outcome, SOURCE_CHANNEL.SUBMIT);
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.equal(state.source.channels.submit, 1);
});

test('Body Return is an optional Source battle advantage', () => {
  const ordinary = sourceCombatDefinition();
  const assisted = sourceCombatDefinition({ bodyReturn: true });
  assert.equal(ordinary.baseComposure, 8 * GRID);
  assert.equal(assisted.baseComposure, 10 * GRID);
  assert.equal(ordinary.movements.find((entry) => entry.id === 'borrowed-body').coherence, 5 * GRID);
  assert.equal(assisted.movements.find((entry) => entry.id === 'borrowed-body').coherence, 4 * GRID);
  assert.equal(assisted.bodyReturnAssist, true);
});

test('all authored profiles validate and expose a recorder-only path in every movement', () => {
  for (const id of ['natatorium', 'hall', 'practice', 'chapel', 'source']) {
    const combat = definition(id);
    assert.deepEqual(validateCombatDefinition(combat), [], id);
    for (const movement of combat.movements) {
      assert.ok(movement.intents.some((intent) => intent.kind === 'broadcast' && intent.recordable), `${id}:${movement.id}`);
    }
  }
});

test('soundtrack metadata is validated but never changes deterministic combat resolution', () => {
  const scored = definition('natatorium');
  const silent = structuredClone(scored);
  delete silent.music;
  const scoredResult = reduceCombat(createCombatState(scored), { type: COMBAT_ACTION.MONITOR });
  const silentResult = reduceCombat(createCombatState(silent), { type: COMBAT_ACTION.MONITOR });
  for (const key of ['composure', 'movementCoherence', 'intentIndex', 'turns', 'tempo', 'perfectCounters', 'damageTaken', 'actionLog']) {
    assert.deepEqual(scoredResult[key], silentResult[key], key);
  }
  const invalid = structuredClone(scored);
  invalid.music = { mode: 'movement', movementLeads: ['lead-1'] };
  assert.ok(validateCombatDefinition(invalid).some((error) => error.includes('one lead per movement')));
});

test('definition validation rejects a deterministic recovery softlock', () => {
  const locked = {
    id: 'locked', enemy: 'LOCKED', movements: [{
      id: 'loop', coherence: 4, intents: [
        { id: 'b', label: 'B', kind: 'broadcast', damage: 2, playbackDamage: 2, recordable: true },
        { id: 's', label: 'S', kind: 'silence', damage: 0, effect: 'recover', recover: 2 },
      ],
    }],
  };
  assert.ok(validateCombatDefinition(locked).some((error) => error.includes('recovery can lock')));
});

test('a worn bag is never stranded, but challenge presets can still beat it', () => {
  // The floor contract, and the reason the whole economy was rebuilt. Every
  // damage source used to be gated on something that ran out — the torch on a
  // battery that exploration drains, playback on a take the opponent had to
  // offer, the specials on one shared use — so a player could arrive at an
  // encounter genuinely unable to fight, and every encounter had to be balanced
  // for that.
  //
  // Two claims, because they are different promises. The realistic worst kit is
  // a torch and a recorder with the battery flat: that must clear every
  // encounter on every preset, and it does. A bag stripped to ONE tool — which
  // only happens while the HUSH is holding the other, and only until you walk
  // over it again — must still clear the presets the game recommends. On severe
  // it may not, and that is what opting into severe buys.
  const COUNTER_FOR = { broadcast: COMBAT_ACTION.MONITOR, overload: COMBAT_ACTION.HOLD, conceal: COMBAT_ACTION.EXPOSE, loop: COMBAT_ACTION.INVERT, silence: COMBAT_ACTION.EXPOSE };
  const clears = (id, difficulty, tools) => {
    let state = createCombatState(definition(id), { battery: 0, tools, difficulty });
    for (let guard = 0; !state.result && guard < 300; guard += 1) {
      const open = availableCombatActions(state).filter((move) => move.enabled).map((move) => move.id);
      const intent = currentCombatIntent(state);
      const wanted = COUNTER_FOR[intent.kind];
      // The proxy player counters what it can read and cashes its takes in —
      // and, since the meaner presets are allowed to demand it, does not walk
      // into a blow that would kill it. That one defensive rule is the whole of
      // what 'competent' means here: it never spends a resource, never needs a
      // technique, and is visible on the card before the beat is committed.
      // The wing's two verbs come first and cost no resource, which is exactly
      // what this harness is testing for: it clears that room on a flat torch
      // because the way out of it was never in the bag.
      const action = open.includes(COMBAT_ACTION.PUT_IT_DOWN) ? COMBAT_ACTION.PUT_IT_DOWN
        : open.includes(COMBAT_ACTION.LISTEN) ? COMBAT_ACTION.LISTEN
        : state.tempo
        ? (state.take && open.includes(COMBAT_ACTION.PLAYBACK) ? COMBAT_ACTION.PLAYBACK
          : open.includes(COMBAT_ACTION.EXPOSE) ? COMBAT_ACTION.EXPOSE : COMBAT_ACTION.END_TEMPO)
        : intent.damage >= state.composure && open.includes(COMBAT_ACTION.HOLD) ? COMBAT_ACTION.HOLD
          : state.take && open.includes(COMBAT_ACTION.PLAYBACK) && wanted !== COMBAT_ACTION.MONITOR ? COMBAT_ACTION.PLAYBACK
            : open.includes(wanted) ? wanted
              : open.includes(COMBAT_ACTION.EXPOSE) ? COMBAT_ACTION.EXPOSE
                : open.includes(COMBAT_ACTION.MONITOR) ? COMBAT_ACTION.MONITOR : COMBAT_ACTION.HOLD;
      state = runCombatTurn(state, { type: action, replaceTake: true });
    }
    return combatResult(state)?.result === 'win';
  };
  const ROOMS = ['natatorium', 'hall', 'practice'];
  const LATE = ['chapel', 'source'];

  // NEVER STRANDED IS NOT THE SAME PROMISE AS ALWAYS WINS.
  //
  // This used to assert that the worst realistic kit clears EVERY encounter on
  // EVERY preset — and it did, which is another way of saying the tuning floor
  // of the whole game was a bag nobody has to work for. A run that picks up no
  // pin and spends no rung of the tree walked the last two fights.
  //
  // The promise that actually matters is the one the old economy broke: you can
  // always fight. There is always an attack, it always chips, and no beat can
  // leave you with nothing to press — that is guarded separately and absolutely
  // (see 'an empty bag is slow, never stranded' in combat-economy.spec.mjs).
  // Whether the worst kit WINS is a balance question. The recommended presets
  // remain survivable through the room fights. The challenge presets are
  // allowed to demand a build, especially in the Hall where three bodies now
  // take three real turns instead of folding into one aggregate enemy.
  for (const mode of ['guided', 'standard']) {
    const difficulty = COMBAT_RULES[mode];
    for (const id of ROOMS) {
      assert.ok(clears(id, difficulty, { rig: false, fork: false }),
        `${mode}:${id} is winnable on a flat torch and a recorder`);
    }
  }
  assert.equal(clears('hall', COMBAT_RULES['dead-air'], { rig: false, fork: false }), false,
    'dead-air Hall requires more than a bare bag against three full initiative slots');

  // The last two are allowed to beat a worn bag on the meaner presets, and on
  // the gentlest one they are still allowed to be survivable — a player there
  // for the story does not get walled out of their own ending.
  for (const id of LATE) {
    assert.ok(clears(id, COMBAT_RULES.guided, { rig: false, fork: false }),
      `guided:${id} stays survivable on a worn bag — the gentle preset is forgiving, not a wall`);
  }
  const walled = LATE.filter((id) => !clears(id, COMBAT_RULES['dead-air'], { rig: false, fork: false }));
  assert.ok(walled.length > 0,
    'and on dead air a bag that skipped every pin does not simply walk the end of the night');

  // One tool is still enough on the story preset, and through the two solo room
  // encounters on Standard. The three-opponent Hall is the deliberate line:
  // on Standard, arriving with only a recorder is no longer a full build.
  for (const mode of ['guided', 'standard']) {
    const rooms = mode === 'guided' ? ROOMS : ['natatorium', 'practice'];
    for (const id of rooms) {
      assert.ok(clears(id, COMBAT_RULES[mode], { torch: false, rig: false, fork: false }),
        `${mode}:${id} is winnable on a recorder alone`);
    }
  }
  assert.equal(clears('hall', COMBAT_RULES.standard, { torch: false, rig: false, fork: false }), false,
    'Standard Hall asks for more than one tool against three actors');
});

test('move metadata and subtext derive from the live rules tables for every action', () => {
  let state = createCombatState(definition(), {
    battery: 1,
    tools: { fork: true, radio: true, coffee: true },
  });
  state.composure -= 1; // so STEADY HANDS is offerable
  const actions = availableCombatActions(state);
  for (const action of actions) {
    assert.deepEqual(action.countersKinds, actionCounterKinds(action.id), `${action.id} counter kinds`);
    const { short, long } = combatMoveSubtext(state, action);
    if (action.stanceShift) {
      assert.ok(short.includes(`→${action.stanceShift.toUpperCase()}`), `${action.id} short subtext names its stance shift`);
      assert.ok(long.toUpperCase().includes(action.stanceShift.toUpperCase()), `${action.id} long subtext names its stance shift`);
    }
    for (const kind of action.countersKinds) {
      assert.ok(short.includes(kind.toUpperCase()), `${action.id} short subtext names ${kind}`);
    }
  }
  // The intent hint is a pure reverse lookup over the same table.
  const broadcast = currentCombatIntent(state);
  assert.equal(broadcast.kind, 'broadcast');
  const counters = counterMovesForIntent(state, broadcast).map((move) => move.id);
  assert.ok(counters.includes(COMBAT_ACTION.MONITOR));
  assert.ok(counters.includes(COMBAT_ACTION.RADIO_DECOY));
  assert.ok(!counters.includes(COMBAT_ACTION.HOLD));
  // The triangle widget data matches the resolution math.
  assert.equal(SNR_TRIANGLE[SNR_STATE.NOISE].dmgMod, GRID);
  assert.equal(SNR_TRIANGLE[SNR_STATE.SILENCE].dmgMod, -GRID);
  assert.equal(SNR_TRIANGLE[SNR_STATE.SIGNAL].fragile, true);
  // Noise lifts the BAND rather than the finished number, so the promise the
  // widget makes is that the range moved up — and that the roll stayed in it.
  const inNoise = reduceCombat(state, { type: COMBAT_ACTION.EXPOSE });
  dealtInBand(inNoise, 'a Noise-state torch swing');
  assert.ok(inNoise.last.band.min > ACTION_BAND[COMBAT_ACTION.EXPOSE].min, 'Noise lifted the band');
});

test('the training profile validates on every difficulty variant and its drill script holds', () => {
  const training = definition('training');
  assert.deepEqual(validateCombatDefinition(training), []);
  for (const difficulty of Object.values(COMBAT_RULES)) {
    assert.doesNotThrow(() => createCombatState(training, { difficulty }));
  }
  // The tutorial director's lesson order depends on this exact standard script.
  const kinds = training.movements[0].intents.map((intent) => intent.kind);
  assert.deepEqual(kinds, ['broadcast', 'broadcast', 'conceal', 'overload']);
  // Walk the scripted drill: hold → monitor (perfect) → playback in tempo →
  // expose (perfect) → hold in tempo.
  // Every beat is a whole beat now — player then opponent — because a perfect
  // counter meets the blow instead of deleting it. TEMPO arrives on the far
  // side of the one it read, and is spent inside the same cycle.
  let state = createCombatState(training, { tools: { torch: true, recorder: true } });
  state = runCombatTurn(state, { type: COMBAT_ACTION.HOLD });
  assert.equal(state.composure, state.maxComposure, 'hold fully guards the 1-damage tone');
  state = runCombatTurn(state, { type: COMBAT_ACTION.MONITOR });
  assert.equal(state.last.perfect, true);
  assert.equal(state.tempo, true);
  assert.ok(state.take);
  state = runCombatTurn(state, { type: COMBAT_ACTION.PLAYBACK });
  assert.equal(state.take, null);
  state = runCombatTurn(state, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(state.last.perfect, true);
  assert.equal(state.snr, SNR_STATE.NOISE);
  assert.equal(state.tempo, true);
  state = runCombatTurn(state, { type: COMBAT_ACTION.HOLD });
  assert.equal(state.snr, SNR_STATE.SILENCE);
  assert.equal(state.result, null);
});

// ── Enemy phase (the opponent's own turn) ────────────────────────────────────

// A hand-built definition so the enemy-phase mechanics are tested against
// authored data rather than the shipped fights. One movement, a broadcast the
// recorder can answer (keeps the recorder-only path valid), plus optional
// reactions/followups the individual tests opt into.
const enemyDef = ({ reactions, followups } = {}) => ({
  id: 'enemy-fixture',
  enemy: 'FIXTURE',
  baseComposure: 12 * GRID,
  movements: [{
    id: 'only',
    title: 'ONLY MOVEMENT',
    coherence: 40 * GRID,
    reactions,
    intents: [
      { id: 'fx:broadcast', label: 'BROADCAST', kind: 'broadcast', damage: 2 * GRID, recordable: true, playbackDamage: 2 * GRID },
      { id: 'fx:overload', label: 'OVERLOAD', kind: 'overload', damage: 3 * GRID, ...(followups ? { followups } : {}) },
      { id: 'fx:react', label: 'REACTION', kind: 'overload', damage: 4 * GRID },
    ],
    severeIntents: [{ id: 'fx:broadcast', label: 'BROADCAST', kind: 'broadcast', damage: 2 * GRID, recordable: true, playbackDamage: 2 * GRID }],
    deadAirIntents: [{ id: 'fx:broadcast', label: 'BROADCAST', kind: 'broadcast', damage: 2 * GRID, recordable: true, playbackDamage: 2 * GRID }],
  }],
});

test('the player step yields to a pending enemy phase; advanceEnemy resolves it', () => {
  const initial = createCombatState(enemyDef(), {});
  // EXPOSE does not counter a broadcast, so the enemy turn is pending.
  const afterPlayer = reduceCombat(initial, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(afterPlayer.phase, 'enemy');
  assert.equal(afterPlayer.last.received, 0, 'the enemy has not acted in the player step');
  dealtInBand(afterPlayer, 'the player damage is already recorded');
  assert.match(afterPlayer.last.notice, /ENEMY INCOMING/);

  const afterEnemy = advanceEnemy(afterPlayer);
  assert.equal(afterEnemy.phase, 'select');
  assert.equal(afterEnemy.last.received, 2 * GRID, 'the broadcast lands its blow on the enemy turn');
  assert.equal(afterEnemy.composure, initial.composure - 2 * GRID);
  assert.equal(afterEnemy.turns, 1, 'the intent cursor advances on the enemy turn, not before');

  // advanceEnemy is inert unless a turn is pending.
  assert.deepEqual(advanceEnemy(initial), initial);
  assert.deepEqual(advanceEnemy(afterEnemy), afterEnemy);
});

test('a full turn is deterministic and reads back as one result', () => {
  const initial = createCombatState(enemyDef(), {});
  const left = runCombatTurn(initial, { type: COMBAT_ACTION.EXPOSE });
  const right = runCombatTurn(initial, { type: COMBAT_ACTION.EXPOSE });
  assert.deepEqual(left, right);
  dealtInBand(left, 'a full turn reads back as one result');
  assert.equal(left.last.received, 2 * GRID);
});

test('WAIT yields the beat and the enemy still takes its turn', () => {
  const initial = createCombatState(enemyDef(), {});
  initial.snr = SNR_STATE.NOISE; // avoid the SIGNAL 'brittle' +1 so numbers are clean
  const afterPlayer = reduceCombat(initial, { type: COMBAT_ACTION.WAIT });
  assert.equal(afterPlayer.phase, 'enemy');
  assert.equal(afterPlayer.last.dealt, 0, 'WAIT spends nothing and deals nothing');
  const full = advanceEnemy(afterPlayer);
  assert.equal(full.composure, initial.composure - 2 * GRID, 'the enemy hits an undefended player');
  assert.ok(availableCombatActions(initial).some((move) => move.id === COMBAT_ACTION.WAIT && move.enabled));
});

test('a movement reaction overrides the cycle intent, and the card says so a beat early', () => {
  const def = enemyDef({ reactions: [{ when: 'take-loaded', use: 'fx:react' }] });
  // With no take, selection follows the authored cycle (broadcast at index 0).
  const plain = createCombatState(def, {});
  assert.deepEqual(selectEnemyIntents(plain).map((i) => i.id), ['fx:broadcast']);

  // The opponent reads the board when it DECIDES, which is the beat before it
  // throws. Hoard a take through a beat and the next commitment is the harsher
  // intent.
  const loaded = createCombatState(def, {});
  loaded.snr = SNR_STATE.NOISE;
  loaded.take = { id: 't', label: 'T', damage: 2, tag: null };
  const decided = advanceEnemy(reduceCombat(loaded, { type: COMBAT_ACTION.WAIT }));

  // The point of writing the choice down: the telegraph names the blow while
  // the player can still answer it, and the blow that lands is that one.
  assert.equal(decided.committed.id, 'fx:react', 'the opponent has committed to the reaction');
  assert.deepEqual(selectEnemyIntents(decided).map((i) => i.id), ['fx:react']);

  const resolved = advanceEnemy(reduceCombat(decided, { type: COMBAT_ACTION.WAIT }));
  assert.equal(resolved.last.enemyHits[0].intentId, 'fx:react', 'it threw what it showed');
  assert.equal(resolved.last.received, 4 * GRID, 'the reaction intent lands its heavier hit');
});

test('the committed blow is the blow that lands, however often it is asked for', () => {
  // selectEnemyIntents runs twice per enemy beat — the scene names the blow,
  // then the reducer resolves it. A chooser that decided on each call would let
  // those disagree, so the choosing happens once and both calls read the note.
  const state = createCombatState(enemyDef({ reactions: [{ when: 'noise', use: 'fx:react' }] }), {});
  state.snr = SNR_STATE.NOISE;
  const pending = reduceCombat(state, { type: COMBAT_ACTION.WAIT });
  const named = selectEnemyIntents(pending).map((i) => i.id);
  assert.deepEqual(selectEnemyIntents(pending).map((i) => i.id), named, 'asking twice gives one answer');
  const resolved = advanceEnemy(pending);
  assert.deepEqual(resolved.last.enemyHits.map((hit) => hit.intentId), named, 'and it is what landed');
});

test('a perfect counter meets the blow rather than deleting it', () => {
  // READING THE BEAT IS NOT THE SAME AS THE BEAT NOT HAPPENING.
  //
  // This used to assert that the enemy's turn was skipped outright. It was, and
  // then the bonus beat skipped it again — two player actions for zero enemy
  // actions, with the committed blow consumed without ever being thrown. Against
  // the real reducer a competent recordist finished four of the five battles
  // having taken literally nothing. The fight was not easy because its numbers
  // were small; it was easy because a correct read could not be hit.
  //
  // The blow lands now, chipped to PERFECT_COUNTER_SHARE of itself, and TEMPO
  // arrives on the far side of it.
  const state = createCombatState(enemyDef(), { tools: { recorder: true } });
  assert.equal(state.committed.id, 'fx:broadcast');
  const countered = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.equal(countered.last.perfect, true, 'MONITOR counters a broadcast');
  assert.equal(countered.phase, 'enemy', 'the opponent still gets its beat');

  const resolved = advanceEnemy(countered);
  assert.ok(resolved.last.received < 3 * GRID * PERFECT_COUNTER_SHARE + GRID,
    'and it lands as a chip rather than in full');
  assert.equal(resolved.tempo, true, 'the read is paid in TEMPO, on the far side of the blow');
});

test('TEMPO is a free action inside the cycle, not a second cycle', () => {
  // The bonus beat used to advance the intent, because back then the counter
  // that opened it did not. The enemy commits its own next blow now, so a bonus
  // action that advanced again would burn an intent the player never saw.
  const state = createCombatState(enemyDef(), { tools: { recorder: true } });
  const resolved = advanceEnemy(reduceCombat(state, { type: COMBAT_ACTION.MONITOR }));
  assert.equal(resolved.tempo, true);
  const committed = resolved.committed.id;
  const bonus = reduceCombat(resolved, { type: COMBAT_ACTION.WAIT });
  assert.equal(bonus.tempo, false, 'the free action is spent');
  assert.equal(bonus.phase, 'select', 'and it does not hand the opponent a second beat');
  assert.equal(bonus.committed.id, committed, 'nor burn the blow it had already committed to');
});

test('an intent with followups chains multiple hits and prevention blunts only the first', () => {
  const def = enemyDef({ followups: [{ id: 'fx:echo', kind: 'overload', damage: GRID }] });
  const state = createCombatState(def, {});
  state.snr = SNR_STATE.NOISE;
  state.intentIndex = 1; // point at the overload intent that carries the followup
  const chained = advanceEnemy(reduceCombat(state, { type: COMBAT_ACTION.WAIT }));
  assert.equal(chained.last.enemyHits.length, 2, 'the enemy turn is two hits');
  assert.equal(chained.last.enemyHits[0].received, 3 * GRID, 'undefended, the primary lands full');
  assert.equal(chained.last.received, 4 * GRID, '3 + 1 across the chain');

  // THROW VOICE guards (and does not counter overload, so the turn still
  // happens). The prevention blunts the primary but not the chained hit.
  const guarded = createCombatState(def, { tools: { radio: true } });
  guarded.snr = SNR_STATE.NOISE;
  guarded.intentIndex = 1;
  const held = runCombatTurn(guarded, { type: COMBAT_ACTION.RADIO_DECOY });
  assert.equal(held.last.enemyHits.length, 2);
  assert.ok(held.last.enemyHits[0].received < 3 * GRID, 'prevention blunts the primary');
  assert.equal(held.last.enemyHits[1].received, GRID, 'prevention does not carry to the second hit');
});

test('followups and reactions validate as authored data', () => {
  assert.deepEqual(validateCombatDefinition(enemyDef({ followups: [{ id: 'fx:echo', kind: 'overload', damage: GRID }] })), []);
  assert.deepEqual(validateCombatDefinition(enemyDef({ reactions: [{ when: 'take-loaded', use: 'fx:react' }] })), []);
  const badReaction = validateCombatDefinition(enemyDef({ reactions: [{ when: 'take-loaded', use: 'fx:nowhere' }] }));
  assert.ok(badReaction.some((error) => error.includes('reaction points at unknown intent')));
  const badFollowup = validateCombatDefinition(enemyDef({ followups: [{ id: 'fx:echo', kind: 'not-a-kind', damage: 1 }] }));
  assert.ok(badFollowup.some((error) => error.includes('followup has invalid kind')));
});

test('PARRY is a reaction, never a selectable move', () => {
  const state = createCombatState(definition(), { battery: 1 });
  const moves = availableCombatActions(state).map((m) => m.id);
  assert.ok(!moves.includes(COMBAT_ACTION.PARRY), 'parry never sits in the tool/move menu');
});

test('PARRY turns the blow that just landed: composure restored, force reflected as coherence', () => {
  let state = createCombatState(definition(), { battery: 1 });
  assert.equal(currentCombatIntent(state).kind, 'broadcast');   // a struck blow
  const startComposure = state.composure;
  // Yield the beat so the adversary strikes.
  state = advanceEnemy(reduceCombat(state, { type: COMBAT_ACTION.WAIT }));
  assert.ok(state.last.received > 0 && state.composure < startComposure, 'the blow costs composure');
  const struckComposure = state.composure;
  const struckCoherence = state.movementCoherence;
  const parried = reduceCombat(state, { type: COMBAT_ACTION.PARRY });
  assert.equal(parried.last.parried, true);
  assert.ok(parried.composure > struckComposure, 'composure comes back on a read parry');
  assert.ok(parried.movementCoherence < struckCoherence, 'the blow is reflected as coherence');
  // Reactive and deterministic.
  assert.deepEqual(reduceCombat(state, { type: COMBAT_ACTION.PARRY }), parried);
});

test('enemy guard: on severe it arms when hurt and slips your committed swing; standard never sees it', () => {
  // Arming — severe difficulty, the surfer on the back foot, you just hit it.
  let s = createCombatState(definition(), { difficulty: COMBAT_RULES.severe, battery: 1 });
  s.movementMaxCoherence = 4 * GRID;
  s.movementCoherence = 2 * GRID;          // at the 50% threshold
  s.phase = 'enemy';
  s.pendingEnemy = { prevention: 0, playerDealt: 2 * GRID, playerNotice: '' };
  s = advanceEnemy(s);
  assert.ok(s.enemyGuard, 'a hurt surfer on severe sets to guard');

  // A PERFECT COUNTER READS THROUGH IT. The guard is the surfer reading your
  // swing; countering is you reading its blow, and the better read wins — which
  // is also what makes the guard baitable rather than a tax.
  const read = reduceCombat(s, { ...{ type: COMBAT_ACTION.EXPOSE } });
  assert.equal(read.last.perfect, true, 'EXPOSE counters the committed conceal');
  assert.equal(read.last.enemyDodge, undefined, 'the counter is not slipped');
  assert.ok(read.last.dealt > 0, 'and it lands');
  assert.equal(read.enemyGuard, null, 'but it spends the guard all the same');

  // Spending — an uncountered swing is turned: no coherence lost, dealt zeroed.
  // (Severe runs its own rotated intent script, so the beat EXPOSE cannot answer
  // is found rather than assumed.)
  s.intentIndex = 0;
  assert.notEqual(currentCombatIntent(s).kind, 'conceal', 'this beat is not one EXPOSE answers');
  const coh = s.movementCoherence;
  s.battery = 1;
  const swing = reduceCombat(s, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(swing.last.enemyDodge?.mode, 'dodge');
  assert.equal(swing.movementCoherence, coh, 'the hit is turned — no coherence lost');
  assert.equal(swing.last.dealt, 0);
  assert.equal(swing.enemyGuard, null, 'the guard is spent, not permanent');

  // The guard is a DIFFICULTY LEVER now, not a side effect of a health number.
  // Contract sees it — on a long cooldown, so it is an event rather than a wall —
  // and only the assisted preset is exempt.
  const arm = (difficulty) => {
    let n = createCombatState(definition(), { difficulty, battery: 1 });
    n.movementMaxCoherence = 4 * GRID;
    n.movementCoherence = 2 * GRID;
    n.phase = 'enemy';
    n.pendingEnemy = { prevention: 0, playerDealt: 2 * GRID, playerNotice: '' };
    return advanceEnemy(n).enemyGuard;
  };
  assert.equal(arm(COMBAT_RULES.guided), null, 'the assisted preset never sees the guard');
  assert.equal(arm(COMBAT_RULES.standard)?.mode, 'dodge', 'Contract sees it slip a swing');
  assert.equal(arm(COMBAT_RULES['dead-air'])?.mode, 'parry', 'and the meanest preset turns it back');

  // It is a cooldown, so it cannot fire on consecutive beats.
  let cooled = createCombatState(definition(), { difficulty: COMBAT_RULES.standard, battery: 1 });
  cooled.movementMaxCoherence = 4 * GRID;
  cooled.movementCoherence = 2 * GRID;
  cooled.lastGuardBeat = cooled.cycleIndex;
  cooled.phase = 'enemy';
  cooled.pendingEnemy = { prevention: 0, playerDealt: 2 * GRID, playerNotice: '' };
  assert.equal(advanceEnemy(cooled).enemyGuard, null, 'a guard just spent cannot be set again');
});
