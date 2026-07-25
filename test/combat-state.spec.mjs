import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
  combatResult,
  counterMovesForIntent,
  createCombatState,
  currentCombatIntent,
  reduceCombat,
  runCombatTurn,
  advanceEnemy,
  selectEnemyIntents,
  validateCombatDefinition,
} from '../src/game/combat-state.js';
import { authoredCombatProfile, sourceCombatDefinition } from '../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import {
  MAX_PINS,
  MAX_TECHNIQUES,
  PIN_SOURCES,
  TECHNIQUE_DEFS,
  learnCombatTechnique,
  normalizeCombatBuild,
  techniqueAvailability,
} from '../src/game/combat-progression.js';

const definition = (id = 'natatorium') => ({
  id,
  enemy: id.toUpperCase(),
  baseComposure: 8,
  ...authoredCombatProfile(id),
});

test('signal combat is deterministic and a perfect response opens one non-chaining Tempo action', () => {
  const initial = createCombatState(definition(), { battery: 1 });
  assert.equal(currentCombatIntent(initial).kind, 'broadcast');
  const left = reduceCombat(initial, { type: COMBAT_ACTION.MONITOR });
  const right = reduceCombat(initial, { type: COMBAT_ACTION.MONITOR });
  assert.deepEqual(left, right);
  assert.equal(left.tempo, true);
  assert.equal(left.perfectCounters, 1);
  assert.equal(left.take.damage, 2);

  const playback = reduceCombat(left, { type: COMBAT_ACTION.PLAYBACK });
  assert.equal(playback.tempo, false);
  assert.equal(playback.turns, 1);
  assert.equal(playback.movementCoherence, 1);
});

test('Tune is a free once-per-movement calibration and strengthens the next perfect response', () => {
  let state = createCombatState(definition(), { tools: { fork: true } });
  assert.equal(combatIntentLookahead(state).length, 1);
  state = reduceCombat(state, { type: COMBAT_ACTION.TUNE });
  assert.equal(state.turns, 0);
  assert.equal(combatIntentLookahead(state).length, 2);
  assert.equal(availableCombatActions(state).find((action) => action.id === COMBAT_ACTION.TUNE).enabled, false);
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.equal(state.movementCoherence, 3);
  assert.equal(state.tuneBonus, 0);
});

test('torch spends the shared scaled battery and flat battery disables it', () => {
  const state = createCombatState(definition(), { battery: .05, torchDrainScale: 1.35 });
  const next = reduceCombat(state, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(+next.torchSpent.toFixed(5), .03375);
  assert.equal(+next.battery.toFixed(5), .01625);
  assert.equal(availableCombatActions(next).find((action) => action.id === COMBAT_ACTION.EXPOSE).enabled, false);
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
  state = reduceCombat(state, { type: COMBAT_ACTION.HOLD });
  assert.equal(state.composure, before);
  assert.equal(state.ringing, false);
  assert.equal(state.tempo, true);
});

test('the locked techniques preserve their tier and equipment contracts', () => {
  const migrated = normalizeCombatBuild(null, ['recording-2', 'pre-recording-4']);
  assert.equal(migrated.unspent, 2);
  assert.deepEqual(normalizeCombatBuild({ techniques: [TECHNIQUE.WHITEOUT] }, ['recording-2']).techniques, []);
  assert.equal(techniqueAvailability(migrated, TECHNIQUE.FEEDBACK_LOOP, { hasRig: true }).reason, 'TIER I REQUIRED');
  assert.equal(techniqueAvailability(migrated, TECHNIQUE.OVERDUB, { hasRig: false }).reason, 'BENT RIG REQUIRED');
  const first = learnCombatTechnique(migrated, TECHNIQUE.OVERDUB, { hasRig: true });
  const second = learnCombatTechnique(first.build, TECHNIQUE.FEEDBACK_LOOP, { hasRig: true });
  assert.equal(second.changed, true);
  assert.deepEqual(second.build.techniques, [TECHNIQUE.OVERDUB, TECHNIQUE.FEEDBACK_LOOP]);
  assert.equal(second.build.unspent, 0);
});

test('the tree is deeper and pins come from more than two fixed fights', () => {
  // The deepened tree: torch/recorder/rig/nerve each cap at a tier III, and the
  // tree now spans six branches (adding nerve/fork/radio) with raised caps.
  assert.equal(TECHNIQUE_DEFS.filter((t) => t.tier === 3).length, 4, 'the deep branches each gain a tier III');
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
  const capped = normalizeCombatBuild(null, PIN_SOURCES.encounters, { 'pin.academic': true, 'pin.foyer': true, 'pin.tower': true });
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
  assert.equal(state.exposedBonus, 3, 'AFTERIMAGE 2 + OVEREXPOSE 1');
});

test('WHITEOUT is described as an active technique so the UI can surface it as a move', () => {
  const whiteout = TECHNIQUE_DEFS.find((t) => t.id === TECHNIQUE.WHITEOUT);
  assert.ok(whiteout.active, 'has an active descriptor');
  assert.equal(whiteout.active.actionId, 'whiteout');
  // Passive techniques carry no active descriptor.
  assert.equal(TECHNIQUE_DEFS.find((t) => t.id === TECHNIQUE.AFTERIMAGE).active, undefined);
});

test('Afterimage, Whiteout, Overdub, Punch In, and Feedback Loop resolve exactly once at their authored scopes', () => {
  let afterimage = createCombatState(definition(), { techniques: [TECHNIQUE.ROOM_TONE, TECHNIQUE.AFTERIMAGE] });
  afterimage.intentIndex = 2;
  afterimage = reduceCombat(afterimage, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(afterimage.exposedBonus, 2);
  afterimage = reduceCombat(afterimage, { type: COMBAT_ACTION.PLAYBACK });
  assert.equal(afterimage.last.transition.to, 1);

  let whiteout = createCombatState(definition(), { techniques: [TECHNIQUE.WHITEOUT], battery: 1 });
  whiteout.intentIndex = 2;
  whiteout = reduceCombat(whiteout, { type: COMBAT_ACTION.WHITEOUT });
  assert.equal(whiteout.whiteoutUsed, true);
  assert.equal(whiteout.exposedBonus, 0);
  assert.equal(+whiteout.torchSpent.toFixed(3), .05);

  let overdub = createCombatState(definition(), { tools: { rig: true }, techniques: [TECHNIQUE.ROOM_TONE, TECHNIQUE.OVERDUB] });
  overdub = reduceCombat(overdub, { type: COMBAT_ACTION.PLAYBACK });
  assert.equal(overdub.take.damage, 1);
  assert.deepEqual(overdub.overdubMovements, [0]);

  let punch = createCombatState(definition(), { techniques: [TECHNIQUE.PUNCH_IN] });
  punch = reduceCombat(punch, { type: COMBAT_ACTION.MONITOR });
  assert.equal(punch.movementCoherence, 3);
  assert.deepEqual(punch.punchInMovements, [0]);

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
  assert.equal(noisy.last.dealt, 3);

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
  assert.equal(signal.last.received, 3, 'Signal is strong but brittle on a missed read');
});

test('radio is a one-use battle move that burns its frequency and can counter a broadcast', () => {
  let state = createCombatState(definition(), { tools: { radio: true } });
  state = reduceCombat(state, { type: COMBAT_ACTION.RADIO_DECOY });
  assert.equal(state.radioUsed, true);
  assert.equal(state.snr, SNR_STATE.NOISE);
  assert.equal(state.perfectCounters, 1);
  assert.equal(state.last.dealt, 2);
  assert.equal(combatMovesForTool(state, COMBAT_TOOL.RADIO)[0].enabled, false);
});

test('encounter signatures materially alter pressure while remaining authored data', () => {
  let echo = createCombatState(definition('natatorium'), {});
  echo.signaturePressure = 1;
  echo = runCombatTurn(echo, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(echo.last.received, 3);

  let feedback = createCombatState(definition('hall'), { techniques: [TECHNIQUE.ROOM_TONE] });
  feedback = reduceCombat(feedback, { type: COMBAT_ACTION.PLAYBACK });
  assert.match(feedback.last.notice, /HOUSE RETURN/);

  let fatalFeedback = createCombatState(definition('hall'), { techniques: [TECHNIQUE.ROOM_TONE] });
  fatalFeedback.composure = 1;
  fatalFeedback = reduceCombat(fatalFeedback, { type: COMBAT_ACTION.PLAYBACK });
  assert.equal(combatResult(fatalFeedback)?.result, 'lose');

  let ensemble = createCombatState(definition('practice'), {});
  ensemble.turnsInMovement = 2;
  ensemble = runCombatTurn(ensemble, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(ensemble.last.received, 3);
});

test('a clean regular fight lands inside the authored 8–12 decision arc', () => {
  let state = createCombatState(definition('practice'), { tools: { torch: true, recorder: true } });
  let decisions = 0;
  while (!state.result && decisions < 30) {
    const intent = currentCombatIntent(state);
    const action = state.tempo
      ? state.take ? COMBAT_ACTION.PLAYBACK : COMBAT_ACTION.END_TEMPO
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
  assert.deepEqual([story.maxComposure, contract.maxComposure, night.maxComposure, deadAir.maxComposure], [10, 8, 7, 6]);
  assert.equal(createCombatState(definition(), { injuries: 3 }).maxComposure, 5);
  assert.equal(createCombatState(definition(), { injuries: 99 }).maxComposure, 4);
  assert.equal(combatIntentLookahead(story).length, 2);
  assert.equal(currentCombatIntent(night).kind, 'overload');
  assert.equal(currentCombatIntent(deadAir).kind, 'conceal');
  assert.equal(story.movementCoherence, deadAir.movementCoherence);
});

test('every non-perfect main action produces understandable pressure accounting', () => {
  let state = createCombatState(definition(), {});
  state = runCombatTurn(state, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(state.missedCounters, 1);
  assert.equal(state.damageTaken, 2);
});

test('Source channels are visible, tie to the armed channel, and Rescue stability is explicit', () => {
  let state = createCombatState(sourceCombatDefinition(), { source: { rescueEligible: true } });
  state = reduceCombat(state, { type: COMBAT_ACTION.CHANNEL, channel: SOURCE_CHANNEL.SUBMIT });
  assert.equal(combatPrediction(state).outcome, SOURCE_CHANNEL.SUBMIT);
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.equal(state.source.channels.submit, 1);
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

test('a zero-battery no-rig player can clear every authored script variant through Monitor, Hold, and Playback', () => {
  for (const [mode, difficulty] of Object.entries(COMBAT_RULES)) {
    for (const id of ['natatorium', 'hall', 'practice', 'chapel', 'source']) {
      let state = createCombatState(definition(id), { battery: 0, tools: { rig: false, fork: false }, difficulty });
      for (let guard = 0; !state.result && guard < 300; guard++) {
        const intent = currentCombatIntent(state);
        if (state.tempo) {
          state = state.take
            ? runCombatTurn(state, { type: COMBAT_ACTION.PLAYBACK })
            : runCombatTurn(state, { type: COMBAT_ACTION.END_TEMPO });
        } else if (intent.kind === 'broadcast') {
          if (state.take) state = runCombatTurn(state, { type: COMBAT_ACTION.PLAYBACK });
          else state = runCombatTurn(state, { type: COMBAT_ACTION.MONITOR });
        } else if (state.take) state = runCombatTurn(state, { type: COMBAT_ACTION.PLAYBACK });
        else state = runCombatTurn(state, { type: COMBAT_ACTION.HOLD });
      }
      assert.equal(combatResult(state)?.result, 'win', `${mode}:${id} remains winnable without torch or rig`);
    }
  }
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
  assert.equal(SNR_TRIANGLE[SNR_STATE.NOISE].dmgMod, 1);
  assert.equal(SNR_TRIANGLE[SNR_STATE.SILENCE].dmgMod, -1);
  assert.equal(SNR_TRIANGLE[SNR_STATE.SIGNAL].fragile, true);
  const inNoise = reduceCombat(state, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(inNoise.last.dealt, 2 + SNR_TRIANGLE[SNR_STATE.NOISE].dmgMod);
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
  let state = createCombatState(training, { tools: { torch: true, recorder: true } });
  state = runCombatTurn(state, { type: COMBAT_ACTION.HOLD });
  assert.equal(state.composure, state.maxComposure, 'hold fully guards the 1-damage tone');
  state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
  assert.equal(state.last.perfect, true);
  assert.equal(state.tempo, true);
  assert.ok(state.take);
  state = reduceCombat(state, { type: COMBAT_ACTION.PLAYBACK });
  assert.equal(state.take, null);
  state = reduceCombat(state, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(state.last.perfect, true);
  assert.equal(state.snr, SNR_STATE.NOISE);
  assert.equal(state.tempo, true);
  state = reduceCombat(state, { type: COMBAT_ACTION.HOLD });
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
  baseComposure: 12,
  movements: [{
    id: 'only',
    title: 'ONLY MOVEMENT',
    coherence: 40,
    reactions,
    intents: [
      { id: 'fx:broadcast', label: 'BROADCAST', kind: 'broadcast', damage: 2, recordable: true, playbackDamage: 2 },
      { id: 'fx:overload', label: 'OVERLOAD', kind: 'overload', damage: 3, ...(followups ? { followups } : {}) },
      { id: 'fx:react', label: 'REACTION', kind: 'overload', damage: 4 },
    ],
    severeIntents: [{ id: 'fx:broadcast', label: 'BROADCAST', kind: 'broadcast', damage: 2, recordable: true, playbackDamage: 2 }],
    deadAirIntents: [{ id: 'fx:broadcast', label: 'BROADCAST', kind: 'broadcast', damage: 2, recordable: true, playbackDamage: 2 }],
  }],
});

test('the player step yields to a pending enemy phase; advanceEnemy resolves it', () => {
  const initial = createCombatState(enemyDef(), {});
  // EXPOSE does not counter a broadcast, so the enemy turn is pending.
  const afterPlayer = reduceCombat(initial, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(afterPlayer.phase, 'enemy');
  assert.equal(afterPlayer.last.received, 0, 'the enemy has not acted in the player step');
  assert.equal(afterPlayer.last.dealt, 3, 'the player damage is already recorded');
  assert.match(afterPlayer.last.notice, /ENEMY INCOMING/);

  const afterEnemy = advanceEnemy(afterPlayer);
  assert.equal(afterEnemy.phase, 'select');
  assert.equal(afterEnemy.last.received, 2, 'the broadcast lands its 2 on the enemy turn');
  assert.equal(afterEnemy.composure, initial.composure - 2);
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
  assert.equal(left.last.dealt, 3);
  assert.equal(left.last.received, 2);
});

test('WAIT yields the beat and the enemy still takes its turn', () => {
  const initial = createCombatState(enemyDef(), {});
  initial.snr = SNR_STATE.NOISE; // avoid the SIGNAL 'brittle' +1 so numbers are clean
  const afterPlayer = reduceCombat(initial, { type: COMBAT_ACTION.WAIT });
  assert.equal(afterPlayer.phase, 'enemy');
  assert.equal(afterPlayer.last.dealt, 0, 'WAIT spends nothing and deals nothing');
  const full = advanceEnemy(afterPlayer);
  assert.equal(full.composure, initial.composure - 2, 'the enemy hits an undefended player');
  assert.ok(availableCombatActions(initial).some((move) => move.id === COMBAT_ACTION.WAIT && move.enabled));
});

test('a movement reaction overrides the cycle intent by board state', () => {
  const def = enemyDef({ reactions: [{ when: 'take-loaded', use: 'fx:react' }] });
  // With no take, selection follows the authored cycle (broadcast at index 0).
  const plain = createCombatState(def, {});
  assert.deepEqual(selectEnemyIntents(plain).map((i) => i.id), ['fx:broadcast']);
  // With a take loaded, the reaction swaps in the harsher intent.
  const loaded = createCombatState(def, {});
  loaded.snr = SNR_STATE.NOISE;
  loaded.take = { id: 't', label: 'T', damage: 2, tag: null };
  assert.deepEqual(selectEnemyIntents(loaded).map((i) => i.id), ['fx:react']);
  const resolved = advanceEnemy(reduceCombat(loaded, { type: COMBAT_ACTION.WAIT }));
  assert.equal(resolved.last.received, 4, 'the reaction intent lands its heavier hit');
});

test('an intent with followups chains multiple hits and prevention blunts only the first', () => {
  const def = enemyDef({ followups: [{ id: 'fx:echo', kind: 'overload', damage: 1 }] });
  const state = createCombatState(def, {});
  state.snr = SNR_STATE.NOISE;
  state.intentIndex = 1; // point at the overload intent that carries the followup
  const chained = advanceEnemy(reduceCombat(state, { type: COMBAT_ACTION.WAIT }));
  assert.equal(chained.last.enemyHits.length, 2, 'the enemy turn is two hits');
  assert.equal(chained.last.enemyHits[0].received, 3, 'undefended, the primary lands full');
  assert.equal(chained.last.received, 4, '3 + 1 across the chain');

  // THROW VOICE guards 2 (and does not counter overload, so the turn still
  // happens). The prevention blunts the primary but not the chained hit.
  const guarded = createCombatState(def, { tools: { radio: true } });
  guarded.snr = SNR_STATE.NOISE;
  guarded.intentIndex = 1;
  const held = runCombatTurn(guarded, { type: COMBAT_ACTION.RADIO_DECOY });
  assert.equal(held.last.enemyHits.length, 2);
  assert.equal(held.last.enemyHits[0].received, 2, 'prevention blunts the primary 3 → 2');
  assert.equal(held.last.enemyHits[1].received, 1, 'prevention does not carry to the second hit');
});

test('followups and reactions validate as authored data', () => {
  assert.deepEqual(validateCombatDefinition(enemyDef({ followups: [{ id: 'fx:echo', kind: 'overload', damage: 1 }] })), []);
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
  s.movementMaxCoherence = 4;
  s.movementCoherence = 2;                 // at the 50% threshold
  s.phase = 'enemy';
  s.pendingEnemy = { prevention: 0, playerDealt: 2, playerNotice: '' };
  s = advanceEnemy(s);
  assert.ok(s.enemyGuard, 'a hurt surfer on severe sets to guard');

  // Spending — a committed swing is turned: no coherence lost, dealt zeroed, spent.
  const coh = s.movementCoherence;
  s.battery = 1;
  const swing = reduceCombat(s, { type: COMBAT_ACTION.EXPOSE });
  assert.equal(swing.last.enemyDodge?.mode, 'dodge');
  assert.equal(swing.movementCoherence, coh, 'the hit is turned — no coherence lost');
  assert.equal(swing.last.dealt, 0);
  assert.equal(swing.enemyGuard, null, 'the guard is spent, not permanent');

  // Standard difficulty never arms it (keeps ordinary fights deterministic).
  let n = createCombatState(definition(), { difficulty: COMBAT_RULES.standard, battery: 1 });
  n.movementMaxCoherence = 4;
  n.movementCoherence = 2;
  n.phase = 'enemy';
  n.pendingEnemy = { prevention: 0, playerDealt: 2, playerNotice: '' };
  n = advanceEnemy(n);
  assert.equal(n.enemyGuard, null, 'standard fights never see the guard');
});
