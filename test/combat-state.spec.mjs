import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_ACTION,
  SOURCE_CHANNEL,
  TECHNIQUE,
  availableCombatActions,
  combatIntentLookahead,
  combatPrediction,
  combatResult,
  createCombatState,
  currentCombatIntent,
  reduceCombat,
  validateCombatDefinition,
} from '../src/game/combat-state.js';
import { authoredCombatProfile, sourceCombatDefinition } from '../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import {
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
  assert.equal(state.movementCoherence, 2);
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

test('the six locked techniques preserve their tier and equipment contracts', () => {
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
  assert.equal(punch.movementCoherence, 2);
  assert.deepEqual(punch.punchInMovements, [0]);

  let feedback = createCombatState(definition('hall'), {
    tools: { rig: true }, techniques: [TECHNIQUE.ROOM_TONE, TECHNIQUE.FEEDBACK_LOOP],
  });
  feedback.movementIndex = 1;
  feedback.movementCoherence = 3;
  feedback.movementMaxCoherence = 3;
  feedback.intentIndex = 1;
  feedback = reduceCombat(feedback, { type: COMBAT_ACTION.INVERT });
  assert.equal(feedback.feedbackLoopUsed, true);
  assert.equal(feedback.take.id, 'room-tone');
  assert.equal(feedback.last.transition.to, 2);
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
  state = reduceCombat(state, { type: COMBAT_ACTION.EXPOSE });
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
            ? reduceCombat(state, { type: COMBAT_ACTION.PLAYBACK })
            : reduceCombat(state, { type: COMBAT_ACTION.END_TEMPO });
        } else if (intent.kind === 'broadcast') {
          if (state.take) state = reduceCombat(state, { type: COMBAT_ACTION.PLAYBACK });
          else state = reduceCombat(state, { type: COMBAT_ACTION.MONITOR });
        } else if (state.take) state = reduceCombat(state, { type: COMBAT_ACTION.PLAYBACK });
        else state = reduceCombat(state, { type: COMBAT_ACTION.HOLD });
      }
      assert.equal(combatResult(state)?.result, 'win', `${mode}:${id} remains winnable without torch or rig`);
    }
  }
});
