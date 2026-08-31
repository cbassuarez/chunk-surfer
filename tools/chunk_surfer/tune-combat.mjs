// THE BALANCE TABLE, ON DEMAND.
//
// Tuning a fight by playing it is slow and lies to you: a designer who wrote
// the enemy knows what it is about to throw. This plays every battle headlessly
// with three named bags and three lines of play, and prints what each of them
// actually costs. Every number in the balance conversation should come from
// here rather than from a feeling.
//
//   node tools/chunk_surfer/tune-combat.mjs
//   node tools/chunk_surfer/tune-combat.mjs --preset standard --verbose
//
// The policies are deliberately not optimal play. `reading` is a competent
// player who counters what the card says; `stock` is the same player with only
// the two tools the bag starts with; `swinging` is somebody who never reads.
import {
  COMBAT_ACTION,
  advanceEnemy,
  availableCombatActions,
  combatResult,
  createCombatState,
  predictedCombatIntent,
  reduceCombat,
} from '../../src/game/combat-state.js';
import { attachCombatDefinition, sourceCombatBattle } from '../../src/data/combat-definitions.js';
import { COMBAT_RULES } from '../../src/progression/difficulty-defs.js';
import { TECHNIQUE_DEFS } from '../../src/game/combat-progression.js';

const BATTLES = {
  natatorium: attachCombatDefinition({ id: 'natatorium', enemy: 'N', rounds: [] }).combat,
  hall: attachCombatDefinition({ id: 'hall', enemy: 'H', rounds: [] }).combat,
  practice: attachCombatDefinition({ id: 'practice', enemy: 'P', rounds: [] }).combat,
  chapel: attachCombatDefinition({ id: 'chapel', enemy: 'C', rounds: [] }).combat,
  'source-final': sourceCombatBattle({ bodyReturn: false }).combat,
};

// What the player brought. STOCK is the bag the game hands you and never asks
// you to improve; INVESTED is a plausible six-pin run.
const STOCK_TOOLS = { torch: true, recorder: true, rig: false, fork: false, radio: false, coffee: false };
const FULL_TOOLS = { torch: true, recorder: true, rig: true, fork: true, radio: true, coffee: true };
const INVESTED = ['deep-reserve', 'brace', 'punch-in', 'master-take', 'perfect-pitch', 'headroom']
  .filter((id) => TECHNIQUE_DEFS.some((def) => def.id === id));

const BAGS = {
  stock: { tools: STOCK_TOOLS, techniques: [] },
  full: { tools: FULL_TOOLS, techniques: [] },
  invested: { tools: FULL_TOOLS, techniques: INVESTED },
};

const COUNTER_FOR = {
  broadcast: COMBAT_ACTION.MONITOR,
  overload: COMBAT_ACTION.HOLD,
  conceal: COMBAT_ACTION.EXPOSE,
  loop: COMBAT_ACTION.INVERT,
  silence: COMBAT_ACTION.EXPOSE,
};

const open = (state) => availableCombatActions(state).filter((move) => move.enabled);
const pick = (state, wanted) => {
  const moves = open(state);
  for (const id of wanted) {
    const found = moves.find((move) => move.id === id);
    if (found) return id;
  }
  return moves[0]?.id || COMBAT_ACTION.WAIT;
};

// Reads the card, not the engine — a player only ever sees the prediction.
const reading = (state) => pick(state, [
  COMBAT_ACTION.PUT_IT_DOWN, COMBAT_ACTION.LISTEN,
  COUNTER_FOR[predictedCombatIntent(state)?.kind],
  COMBAT_ACTION.PLAYBACK, COMBAT_ACTION.EXPOSE, COMBAT_ACTION.MONITOR, COMBAT_ACTION.HOLD,
]);
// Reads, and spends what reading earned. This is the line the tree is for: the
// specials are priced in charge and charge is paid out for correct reads, so a
// player who reads AND has somewhere to spend it should be measurably ahead of
// one who only reads. If these two columns match, the tree is decoration.
const investing = (state) => {
  const moves = open(state);
  const special = moves.find((move) => ['whiteout', 'master-take', 'runaway-feedback'].includes(move.id));
  if (special) return special.id;
  const tune = moves.find((move) => move.id === COMBAT_ACTION.TUNE);
  if (tune) return tune.id;
  return reading(state);
};

// Never reads. Hits the biggest thing available.
const swinging = (state) => {
  const moves = open(state).filter((move) => (move.damage || 0) > 0);
  return moves.sort((a, b) => (b.damage || 0) - (a.damage || 0))[0]?.id || COMBAT_ACTION.WAIT;
};

const POLICIES = { reading, investing, swinging };

function play(definition, { difficulty, tools, techniques, policy }) {
  let state = createCombatState(definition, { difficulty, tools, techniques, battery: 1 });
  const opened = state.maxComposure;
  let guard = 0;
  while (!state.result && guard++ < 400) {
    state = reduceCombat(state, { type: policy(state), replaceTake: true });
    if (state.phase === 'enemy') state = advanceEnemy(state);
  }
  const result = combatResult(state);
  return {
    result: result?.result || (state.result || 'unresolved'),
    turns: state.turns,
    taken: result?.damageTaken ?? state.damageTaken,
    max: opened,
    left: state.composure,
    perfect: state.perfectCounters ?? 0,
    missed: state.missedCounters ?? 0,
  };
}

const args = process.argv.slice(2);
const only = args.includes('--preset') ? args[args.indexOf('--preset') + 1] : null;
const presets = Object.keys(COMBAT_RULES).filter((id) => !only || id === only);
const pct = (taken, max) => `${Math.round((taken / Math.max(1, max)) * 100)}%`;

for (const presetId of presets) {
  const difficulty = COMBAT_RULES[presetId];
  console.log(`\n══ ${presetId.toUpperCase()} ${'═'.repeat(Math.max(0, 58 - presetId.length))}`);
  console.log('  battle          bag        line       result  turns  composure lost');
  for (const [battleId, definition] of Object.entries(BATTLES)) {
    for (const [bagId, bag] of Object.entries(BAGS)) {
      for (const [lineId, policy] of Object.entries(POLICIES)) {
        // A stock bag that never reads is the floor; a full bag that reads is
        // the ceiling. Both are worth seeing, but the pair that decides whether
        // the night is tuned is stock+reading and invested+reading.
        // Only the pairings that mean something: a stock bag cannot invest, and
        // an invested one that never reads has wasted its pins.
        if (bagId === 'stock' && lineId === 'investing') continue;
        if (bagId === 'full' && lineId !== 'reading') continue;
        if (bagId === 'invested' && lineId === 'swinging') continue;
        const out = play(definition, { difficulty, ...bag, policy });
        const flag = out.result === 'lose' ? '  ← LOSS' : out.result === 'unresolved' ? '  ← STALL' : '';
        console.log(
          `  ${battleId.padEnd(15)} ${bagId.padEnd(10)} ${lineId.padEnd(10)} `
          + `${String(out.result).padEnd(7)} ${String(out.turns).padStart(5)}  `
          + `${String(out.taken).padStart(3)}/${String(out.max).padEnd(3)} ${pct(out.taken, out.max).padStart(5)}${flag}`,
        );
      }
    }
  }
}
console.log('');
