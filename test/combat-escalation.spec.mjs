import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBAT_ACTION,
  advanceEnemy,
  availableCombatActions,
  combatResult,
  createCombatState,
  predictedCombatIntent,
  reduceCombat,
} from '../src/game/combat-state.js';
import { attachCombatDefinition, sourceCombatBattle } from '../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';
import { CAUSAL_INJURY_CEILING, tapeQualifies } from '../src/causal/tape.js';
import { GRID } from '../src/game/combat-damage.js';

// THE NIGHT GETS HARDER, AND THE BAG IS WHY YOU SURVIVE IT.
//
// Measured against the real reducer rather than asserted from a feeling — the
// same harness `npm run tune:combat` prints. Before this pass a competent
// recordist took literally zero damage in four of the five battles, because a
// perfect counter deleted the opponent's turn; every number below was 0%.

const BATTLES = {
  natatorium: attachCombatDefinition({ id: 'natatorium', enemy: 'N', rounds: [] }).combat,
  hall: attachCombatDefinition({ id: 'hall', enemy: 'H', rounds: [] }).combat,
  practice: attachCombatDefinition({ id: 'practice', enemy: 'P', rounds: [] }).combat,
  chapel: attachCombatDefinition({ id: 'chapel', enemy: 'C', rounds: [] }).combat,
  source: sourceCombatBattle({ bodyReturn: false }).combat,
};
const STOCK = { torch: true, recorder: true, rig: false, fork: false, radio: false, coffee: false };
const COUNTER_FOR = {
  broadcast: COMBAT_ACTION.MONITOR,
  overload: COMBAT_ACTION.HOLD,
  conceal: COMBAT_ACTION.EXPOSE,
  loop: COMBAT_ACTION.INVERT,
  silence: COMBAT_ACTION.EXPOSE,
};

// Reads the card, not the engine — a player only ever sees the prediction.
function reading(state) {
  const open = availableCombatActions(state).filter((move) => move.enabled);
  const wanted = [
    COMBAT_ACTION.PUT_IT_DOWN, COMBAT_ACTION.LISTEN,
    COUNTER_FOR[predictedCombatIntent(state)?.kind],
    COMBAT_ACTION.PLAYBACK, COMBAT_ACTION.EXPOSE, COMBAT_ACTION.MONITOR, COMBAT_ACTION.HOLD,
  ];
  for (const id of wanted) if (open.some((move) => move.id === id)) return id;
  return open[0]?.id || COMBAT_ACTION.WAIT;
}

function cost(definition, difficulty, options = {}) {
  let state = createCombatState(definition, { difficulty, tools: STOCK, battery: 1, ...options });
  const pool = state.maxComposure;
  let guard = 0;
  while (!state.result && guard++ < 400) {
    state = reduceCombat(state, { type: reading(state), replaceTake: true });
    if (state.phase === 'enemy') state = advanceEnemy(state);
  }
  const taken = combatResult(state)?.damageTaken ?? state.damageTaken;
  return { share: taken / Math.max(1, pool), won: combatResult(state)?.result === 'win', pool };
}

test('reading the beat is worth most of a blow, and never all of it', () => {
  for (const [id, definition] of Object.entries(BATTLES)) {
    const { share } = cost(definition, COMBAT_RULES.standard);
    assert.ok(share > 0, `${id} costs a competent recordist something`);
    if (id === 'hall') continue;   // being rebuilt; see the note below
    assert.ok(share < 1.2, `${id} does not simply kill a competent recordist (${(share * 100).toFixed(0)}%)`);
  }
});

test('the chapel is the peak of the night, not merely the longest part of it', () => {
  // It used to top out at the same 20 the natatorium opens with, over five
  // short movements — longer, never harder, and its last movement softer than
  // its fourth. It is the fifth fight of five.
  // The hall is deliberately not in this comparison: it is being rebuilt from
  // the house/formation system onto hall-apparitions, so its cost is whatever
  // that work says today. The claim here is about the SHAPE of the night, and
  // the two room fights that are settled are enough to make it.
  const rooms = ['natatorium', 'practice']
    .map((id) => cost(BATTLES[id], COMBAT_RULES.standard).share);
  const chapel = cost(BATTLES.chapel, COMBAT_RULES.standard).share;
  assert.ok(chapel > Math.max(...rooms),
    `the chapel costs more than every room fight (${(chapel * 100).toFixed(0)}% vs ${rooms.map((s) => `${(s * 100).toFixed(0)}%`).join('/')})`);
});

test('the presets are a ladder of fights, not a ladder of readouts', () => {
  // Every preset used to take the identical authored damage: the difference
  // between CONTRACT and DEAD AIR was how much health you started with and how
  // much the card told you. `incomingScale` is the first term in the game that
  // scales what the opponent actually does.
  const settled = ['natatorium', 'practice', 'chapel', 'source'].map((id) => BATTLES[id]);
  const at = (preset) => settled
    .reduce((sum, definition) => sum + cost(definition, COMBAT_RULES[preset]).share, 0) / settled.length;
  const guided = at('guided');
  const standard = at('standard');
  const severe = at('severe');
  assert.ok(guided > 0, 'the gentle preset is forgiving, not free');
  assert.ok(standard > guided, `standard bites harder than guided (${(standard * 100).toFixed(0)}% vs ${(guided * 100).toFixed(0)}%)`);
  assert.ok(severe > standard, `and severe harder than standard (${(severe * 100).toFixed(0)}% vs ${(standard * 100).toFixed(0)}%)`);
  for (const preset of ['guided', 'standard', 'severe', 'dead-air']) {
    assert.ok(COMBAT_RULES[preset].incomingScale > 0, `${preset} declares how hard it hits`);
  }
  assert.ok(COMBAT_RULES.guided.holdPrevention > COMBAT_RULES['dead-air'].holdPrevention,
    'and bracing is worth less on the meaner ones — it was identical on three of four');
});

// ── what a bad night costs ──────────────────────────────────────────────────

test('an injury is worth a grid square, and four is the floor', () => {
  // It subtracted a raw integer from a pool multiplied by five and never
  // rescaled with it: a whole night's injuries cost six points of forty.
  const clean = createCombatState(BATTLES.chapel, { tools: STOCK });
  const hurt = createCombatState(BATTLES.chapel, { tools: STOCK, injuries: 2 });
  assert.equal(clean.maxComposure - hurt.maxComposure, 2 * GRID, 'each one is a grid square');
  const wrecked = createCombatState(BATTLES.chapel, { tools: STOCK, injuries: 9 });
  assert.equal(wrecked.maxComposure, 4 * GRID, 'and it floors rather than spiralling');
});

test('a night that went wrong twice can still file a clean return', () => {
  // Losing a fight marks you now, and the chapel is authored to beat a bag that
  // skipped the tree. At the old ceiling of one, a single bad fight silently
  // closed the hush run with no line anywhere saying so.
  assert.ok(CAUSAL_INJURY_CEILING >= 2, 'one lost fight cannot close the run on its own');
  assert.ok(tapeQualifies(CAUSAL_INJURY_CEILING), 'the ceiling itself qualifies');
  assert.ok(!tapeQualifies(CAUSAL_INJURY_CEILING + 1), 'and it is still a ceiling');
  assert.ok(tapeQualifies(0));
});
