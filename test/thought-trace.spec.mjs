// The telegraph, held to the promise that makes it worth having.
//
// The card the player reads is no longer a readout of the opponent's move — it
// is the recordist guessing at it. That buys the fight a feint it can afford:
// when the guess is wrong, a person was wrong, not a machine. But it only works
// if the guessing sounds like guessing, so these are tests about prose.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CONFIDENCE, readConfidence, readFidelity, thoughtTrace } from '../src/game/thought-trace.js';
import {
  COMBAT_ACTION,
  availableCombatActions,
  counterMovesForIntent,
  createCombatState,
  currentCombatIntent,
  predictedCombatIntent,
  rivalCombatIntent,
} from '../src/game/combat-state.js';
import { attachCombatDefinition } from '../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import { GRID } from '../src/game/combat-damage.js';

const CHAPEL = attachCombatDefinition({ id: 'chapel', enemy: 'X', rounds: [] }).combat;
const FULL_BAG = { torch: true, recorder: true, rig: true, fork: true, radio: true };
const fight = (difficulty = COMBAT_RULES.standard, over = {}) => ({
  ...createCombatState(CHAPEL, { difficulty, tools: FULL_BAG, battery: 1 }),
  ...over,
});
const say = (state, options = {}) => thoughtTrace(state, {
  intent: currentCombatIntent(state),
  alternative: rivalCombatIntent(state),
  counters: counterMovesForIntent(state, currentCombatIntent(state)),
  fidelity: readFidelity(state),
  ...options,
}).lines.map((line) => line.text);

test('a mind types: the trace is lowercase, first person, and never shouts', () => {
  for (const difficulty of Object.values(COMBAT_RULES)) {
    for (const composure of [8 * GRID, 4 * GRID, GRID]) {
      for (const line of say(fight(difficulty, { composure }))) {
        assert.equal(line, line.toLowerCase(), `the recordist shouted: ${line}`);
        // The old card's vocabulary is the thing being replaced. None of it
        // should survive into the thinking.
        assert.doesNotMatch(line, /\b(intent|kind|counter|dmg|damage)\b/, `stat-block word in: ${line}`);
      }
    }
  }
});

test('confidence is the information the old card spelled out, said as doubt', () => {
  // Guided is a recordist who reads the room. Dead air is one who cannot.
  assert.equal(readConfidence(fight(COMBAT_RULES.guided), readFidelity(fight(COMBAT_RULES.guided))), CONFIDENCE.SURE);
  assert.equal(readConfidence(fight(COMBAT_RULES.standard), readFidelity(fight(COMBAT_RULES.standard))), CONFIDENCE.LIKELY);
  assert.equal(readConfidence(fight(COMBAT_RULES['dead-air']), readFidelity(fight(COMBAT_RULES['dead-air']))), CONFIDENCE.UNSURE);

  // Sure of it, that is one thought. Unsure, it is two that will not resolve.
  const sure = say(fight(COMBAT_RULES.guided));
  const unsure = say(fight(COMBAT_RULES['dead-air']));
  assert.equal(sure.length, 2, 'a read and a plan');
  assert.equal(unsure.length, 3, 'a read, its rival, and a plan');
  assert.match(unsure[0], /\?$/, 'the unsure read is a question');
  assert.match(unsure[1], /^or /, 'and it names what else it might be');
});

test('the fork buys a clean read, which is what a reference pitch is', () => {
  const rattled = fight(COMBAT_RULES.severe);
  const tuned = { ...rattled, tuneUsedMovement: rattled.movementIndex };
  assert.ok(readFidelity(tuned) > readFidelity(rattled), 'TUNE sharpens the read');
  assert.equal(say(tuned).length, 2, 'and collapses the two thoughts back into one');
});

test('composure frays the thinking without hiding any of it', () => {
  const steady = fight(COMBAT_RULES.standard, { composure: 8 * GRID });
  const gone = fight(COMBAT_RULES.standard, { composure: GRID });
  assert.ok(readFidelity(gone) < readFidelity(steady), 'coming apart costs you the read');
  const caught = say(gone).join(' ');
  assert.match(caught, /—/, 'the thought catches on a word and starts it again');
  // Frayed, not censored: the blow is still named.
  const named = currentCombatIntent(gone).label.toLowerCase();
  assert.ok(say(gone).some((line) => line.includes(named.split(' ').pop())), 'the read is still legible');
});

test('a wrong read is owned in the first person, once', () => {
  const missed = say(fight(), { wrong: true });
  assert.match(missed[0], /\b(wrong|wasn't it|not what i thought)\b/, `no recognition in: ${missed[0]}`);
  assert.equal(missed.length, say(fight()).length + 1, 'the correction is one extra line, not a new card');
});

test('the plan is an intention, never the name of a key', () => {
  // The counter still lives in the command band, where the tile lights green.
  // The thought says why it is lit, in the recordist's own words.
  const plan = say(fight()).at(-1);
  assert.match(plan, /^(i |get |tape|roll|brace|take |hold|put |light|torch|turn |run |invert|throw|give|meet|catch|burn|everything|let |play|nothing)/, `not a plan: ${plan}`);
  assert.doesNotMatch(plan, /\b(press|button|key|space|enter)\b/);
});

test('with an empty bag the recordist notices, rather than showing a dead button', () => {
  const stripped = createCombatState(CHAPEL, {
    difficulty: COMBAT_RULES.standard,
    tools: { torch: false, recorder: false, rig: false, fork: false, radio: false },
    battery: 0,
  });
  assert.match(say(stripped).at(-1), /nothing|wear it/, 'the empty bag is a thought, not a grey tile');
});

test('a thought holds still for as long as the beat it belongs to', () => {
  // The trace is re-derived every animation frame. If its wording moved, the
  // player would be reading a sentence that rewrites itself under them.
  const state = fight();
  assert.deepEqual(say(state), say(state));
  assert.notDeepEqual(say(state), say({ ...state, cycleIndex: state.cycleIndex + 1 }));
});

test('the scene hands the same thought out that it draws', () => {
  // battleView is how the trace is read back without a canvas; it must not be a
  // second, differently-worded copy of the card.
  const state = fight();
  const drawn = thoughtTrace(state, {
    intent: currentCombatIntent(state),
    alternative: rivalCombatIntent(state),
    counters: counterMovesForIntent(state, currentCombatIntent(state)),
    wrong: false,
    fidelity: readFidelity(state),
  });
  assert.ok(drawn.lines.length >= 2);
  assert.ok(drawn.lines.every((line) => line.text && ['read', 'plan', 'miss'].includes(line.tone)));
});

test('the recordist can be unsure and still right — doubt is not error', () => {
  // Nothing here decides what the opponent throws. Confidence is a way of
  // speaking; whether the read is CORRECT is a separate question, answered by
  // whoever hands `intent` in. Keeping those apart is what lets the fight ship
  // uncertainty long before it ships a lie.
  const state = fight(COMBAT_RULES['dead-air']);
  const truth = currentCombatIntent(state);
  const spoken = say(state).join(' ');
  assert.ok(spoken.includes(truth.label.toLowerCase()), 'an unsure read still names the true blow');
});

test('every authored blow in the game can be thought about', () => {
  // A label that comes out unreadable — empty, or still shouting — would show up
  // as a blank card in exactly one movement of one fight, which is the kind of
  // thing nobody finds until it is shipped.
  for (const profileId of ['chapel', 'natatorium', 'hall', 'practice']) {
    const definition = attachCombatDefinition({ id: profileId, enemy: 'X', rounds: [] }).combat;
    for (const movement of definition.movements) {
      for (const intent of movement.intents) {
        const state = createCombatState(definition, { difficulty: COMBAT_RULES.standard, tools: FULL_BAG });
        const lines = thoughtTrace(state, { intent, counters: [], fidelity: 1 }).lines;
        assert.ok(lines[0].text.length > 3, `${profileId}/${intent.id} thinks nothing`);
        assert.equal(lines[0].text, lines[0].text.toLowerCase());
        assert.match(lines[0].text, /[.?]$/, `${profileId}/${intent.id} is not a sentence`);
      }
    }
  }
});

// ── the guidance ladder ─────────────────────────────────────────────────────
//
// Difficulty is a question of how much the fight talks you through itself, not
// only of how hard it hits. One rung is removed per preset, and the bottom rung
// leaves you the opponent's posture and nothing else.

test('each preset is told one thing less than the one above it', () => {
  assert.equal(COMBAT_RULES.guided.guidance, 'full');
  assert.equal(COMBAT_RULES.standard.guidance, 'trace');
  assert.equal(COMBAT_RULES.severe.guidance, 'tile');
  assert.equal(COMBAT_RULES['dead-air'].guidance, 'none');
});

test('the green tile is the last help to go, and only dead air loses it', () => {
  // The tile is the actual information: with the prose gone it still hands over
  // the answer every beat. So `perfect` — which is what lights it — follows the
  // ladder, while `countersKinds` does not: the RULE still knows what counters
  // what, and only the telling of it is withheld.
  for (const [mode, lit] of [['guided', true], ['standard', true], ['severe', true], ['dead-air', false]]) {
    const state = createCombatState(CHAPEL, { difficulty: COMBAT_RULES[mode], tools: FULL_BAG, battery: 1 });
    const moves = availableCombatActions(state);
    assert.equal(moves.some((move) => move.perfect && move.enabled), lit, `${mode} tile hint`);
    assert.ok(moves.some((move) => move.countersKinds.length), `${mode} still knows the triangle`);
  }
});

test('the prose is drawn on the top two presets and nowhere else', () => {
  const source = readFileSync(new URL('../src/game/combat.js', import.meta.url), 'utf8');
  assert.match(source, /\['full','trace'\]\.includes\(state\.difficulty\.guidance\)/);
  // And the posture is drawn regardless, because it is the floor the ladder
  // stands on: a fight with no prose in it still has to be readable. Its
  // fallback is a NAMED posture rather than an empty string — a blank where the
  // stance goes reads as a missing readout, not as a neutral one.
  assert.match(source, /state\.stance\?\.id \|\| 'reading'\)\.toUpperCase\(\)/);
  assert.doesNotMatch(source, /guidance[^\n]*stanceId/, 'the posture is never gated on the prose presets');
});

test('guided is told the mood, the chain and the charge; standard is not', () => {
  const state = fight(COMBAT_RULES.guided);
  const extras = { stance: 'cornered', chained: true, chargeReady: true };
  const full = say(state, { guidance: 'full', ...extras });
  const trace = say(state, { guidance: 'trace', ...extras });

  assert.ok(full.length > trace.length, 'guided says more');
  assert.match(full[0], /cornered|hurt/, 'the mood comes first, before the read');
  assert.ok(full.some((line) => /comes twice|second one/.test(line)),
    'a chained blow is warned about — prevention only covers the first hit');
  assert.ok(full.some((line) => /loud|something big/.test(line)),
    'and the charge economy is taught rather than discovered');
  for (const line of trace) {
    assert.doesNotMatch(line, /comes twice|something big/, 'standard gets none of it');
  }
});

test('a misread still moves the tile, so severe gets a hint that can lie', () => {
  // The rung below the prose is not merely quieter. With no trace to correct it,
  // the green tile is lit off the recordist's READ — so on severe the one piece
  // of help left is itself capable of being wrong, which is the whole reason the
  // ground-truth split exists.
  const state = createCombatState(CHAPEL, { difficulty: COMBAT_RULES.severe, tools: FULL_BAG, battery: 1 });
  const pool = CHAPEL.movements[0].severeIntents || CHAPEL.movements[0].intents;
  const other = pool.find((intent) => intent.id !== state.committed.id);
  state.misread = { id: other.id, index: state.intentIndex };
  assert.notEqual(predictedCombatIntent(state).kind, currentCombatIntent(state).kind);
  const lit = availableCombatActions(state).filter((move) => move.perfect && move.enabled);
  assert.ok(lit.every((move) => !move.countersKinds.includes(currentCombatIntent(state).kind)),
    'the lit tile answers what the recordist believes, not what is coming');
});
